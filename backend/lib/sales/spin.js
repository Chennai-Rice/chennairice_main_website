// Spin & Win (Nov 2026).
//
// A visitor types their name and mobile number and spins once. The server picks the prize (the chances
// set in Warehouse → Settings → Spin & Win; the browser only shows where the wheel stops), makes a
// discount code locked to that mobile number (discount_codes.source = 'spin', valid for 7 days, one
// use) and returns it. At checkout the code works only with the same mobile number (discounts.js),
// so a made-up number wins nothing. One spin per mobile number and per browser; a second try shows
// the prize already won. The lead goes to Sales Daddy and the NeoDove telecallers.
//
// Settings (company_settings):
//   spin_enabled            'true' / 'false'                 (off until switched on)
//   spin_prizes             JSON list, see DEFAULT_PRIZES     (chances add up to 100)
//   spin_budget_inr         ₹ given in spin codes per month   (0 = no limit); past it the wheel closes
//   spin_valid_days         days a prize code works           (default 7)
import crypto from 'node:crypto'
import { tx } from '../db.js'
import { httpError, str, toRupees, getSettings } from './util.js'
import { cleanMobile, cleanAttribution } from './attribution.js'
import { requirePermission, audit } from './staff.js'
import { describe } from './discounts.js'
import { pushCrmLead } from '../crm.js'
import { recordWebsiteLead, sendNeodoveLeads } from '../neodove.js'

// kind / amount (₹) / minOrder (₹) / region as in discount_codes; chance in %.
export const DEFAULT_PRIZES = [
  { key: 'p25', label: '₹25 OFF', kind: 'amount', amount: 25, minOrder: 0, region: null, chance: 40 },
  { key: 'p50', label: '₹50 OFF', kind: 'amount', amount: 50, minOrder: 1000, region: null, chance: 30 },
  { key: 'free', label: 'FREE DELIVERY', kind: 'free_delivery', amount: 0, minOrder: 0, region: 'TN', chance: 20 },
  { key: 'p100', label: '₹100 OFF', kind: 'amount', amount: 100, minOrder: 2000, region: null, chance: 9 },
  { key: 'p250', label: '₹250 OFF', kind: 'amount', amount: 250, minOrder: 2500, region: null, chance: 1 },
]
const NAME = /^[\p{L}][\p{L} .'-]{0,79}$/u

/** The prizes in the settings, checked; the defaults when none are set or they do not add up. */
export function spinPrizes(settings = {}) {
  try {
    const list = JSON.parse(settings.spin_prizes || 'null')
    return validPrizes(list) ? list : DEFAULT_PRIZES
  } catch {
    return DEFAULT_PRIZES
  }
}

function validPrizes(list) {
  if (!Array.isArray(list) || list.length < 2 || list.length > 8) return false
  const keys = new Set()
  for (const p of list) {
    if (!p || !/^[a-z0-9_]{1,20}$/.test(p.key) || keys.has(p.key)) return false
    keys.add(p.key)
    if (!str(p.label) || p.label.length > 20) return false
    if (!['amount', 'free_delivery'].includes(p.kind)) return false
    if (p.kind === 'amount' && !(Number(p.amount) > 0 && Number(p.amount) <= 2000)) return false
    if (!(Number(p.minOrder) >= 0 && Number(p.minOrder) <= 100000)) return false
    if (p.region && !['TN', 'SOUTH', 'NORTH', 'NE'].includes(p.region)) return false
    if (!(Number(p.chance) >= 0 && Number(p.chance) <= 100)) return false
  }
  return Math.abs(list.reduce((t, p) => t + Number(p.chance), 0) - 100) < 0.001
}

const enabled = (settings) => str(settings.spin_enabled).toLowerCase() === 'true'
const validDays = (settings) => Math.min(60, Math.max(1, Number(settings.spin_valid_days) || 7))

/** One prize by its chances, with a cryptographic random number (never Math.random). */
export function pickPrize(prizes, roll = crypto.randomInt(0, 1000000) / 10000) {
  let at = 0
  for (const p of prizes) {
    at += Number(p.chance)
    if (roll < at) return p
  }
  return prizes[prizes.length - 1]
}

/** What the wheel shows (labels only, never the chances) and whether it is running. */
export async function spinConfig(db) {
  const settings = await getSettings(db)
  const open = enabled(settings) && !(await overBudget(db, settings))
  return { enabled: open, prizes: spinPrizes(settings).map((p) => ({ key: p.key, label: p.label })), validDays: validDays(settings) }
}

/** ₹ given in spin codes on paid orders this month (India time) is at or past the budget. */
async function overBudget(db, settings) {
  const budget = Number(settings.spin_budget_inr) || 0
  if (!budget) return false
  const { rows: [{ given }] } = await db.query(
    `select coalesce(sum(o.discount_paise), 0)::bigint as given
       from orders o join discount_codes c on c.id = o.discount_code_id
      where c.source = 'spin' and o.payment_status in ('paid', 'partially_refunded')
        and date_trunc('month', o.placed_at at time zone 'Asia/Kolkata') = date_trunc('month', now() at time zone 'Asia/Kolkata')`)
  return Number(given) >= budget * 100
}

function prizeView(spin, code) {
  return {
    prize: { key: spin.prize_key, label: spin.prize_label },
    code: code?.code || null,
    gives: code ? describe(code) : null,
    minOrder: code ? toRupees(code.min_order_paise) : 0,
    region: code?.region || null,
    expiresAt: code?.expires_at || null,
    used: Boolean(code?.used),
  }
}

async function codeFor(db, codeId) {
  if (!codeId) return null
  const { rows: [c] } = await db.query(
    `select c.*, exists (select 1 from orders o where o.discount_code_id = c.id and o.payment_status in ('paid', 'partially_refunded')) as used
       from discount_codes c where c.id = $1`, [codeId])
  return c || null
}

/**
 * The spin. body: { name, phone, deviceId, attribution }. A mobile number that has spun gets its first
 * prize back (already: true); a browser that spun with another number is refused.
 */
export async function spin(db, body = {}, { ip = '' } = {}) {
  const settings = await getSettings(db)
  if (!enabled(settings)) throw httpError('Spin is off', { status: 404, publicMessage: 'Spin & Win is not running right now.' })
  const name = str(body.name).replace(/\s+/g, ' ')
  const phone = cleanMobile(body.phone)
  const deviceId = str(body.deviceId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || null
  if (!NAME.test(name)) throw httpError('Bad name', { publicMessage: 'Please enter your name.' })
  if (!phone) throw httpError('Bad phone', { publicMessage: 'Please enter a valid 10-digit mobile number.' })

  const { rows: [had] } = await db.query('select * from spins where phone = $1', [phone])
  if (had) return { already: true, ...prizeView(had, await codeFor(db, had.code_id)) }
  if (deviceId) {
    const { rows: [other] } = await db.query('select 1 from spins where device_id = $1 limit 1', [deviceId])
    if (other) throw httpError('Device already spun', { status: 409, publicMessage: 'This phone has already had its spin. One spin per person.' })
  }
  if (await overBudget(db, settings)) {
    throw httpError('Spin budget reached', { status: 404, publicMessage: 'Spin & Win is closed for this month. Please come back next month.' })
  }

  const prize = pickPrize(spinPrizes(settings))
  const days = validDays(settings)
  // The code and the spin together, all or nothing.
  const result = await tx(async (t) => {
    let code
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = 'SPIN-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
      const { rows: [c] } = await t.query(
        `insert into discount_codes (code, kind, amount_paise, min_order_paise, region, locked_phone, max_uses, uses_per_phone,
                                     expires_at, source, note)
         values ($1, $2, $3, $4, $5, $6, 1, 1, now() + make_interval(days => $7), 'spin', $8)
         on conflict (code) do nothing returning *`,
        [candidate, prize.kind, Math.round(Number(prize.amount || 0) * 100), Math.round(Number(prize.minOrder || 0) * 100),
          prize.region || null, phone, days, 'Spin & Win: ' + name])
      code = c
    }
    if (!code) throw new Error('Could not make a spin code')
    const { rows: [row] } = await t.query(
      `insert into spins (phone, name, prize_key, prize_label, code_id, device_id, ip, attribution)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (phone) do nothing returning *`,
      [phone, name, prize.key, prize.label, code.id, deviceId, str(ip).slice(0, 60) || null, cleanAttribution(body.attribution)])
    // The same number spun a moment ago: undo this code, the first spin stands.
    if (!row) { await t.query('delete from discount_codes where id = $1', [code.id]); return null }
    return { row, code }
  })
  if (!result) {
    const { rows: [again] } = await db.query('select * from spins where phone = $1', [phone])
    return { already: true, ...prizeView(again, await codeFor(db, again.code_id)) }
  }

  // The lead: Sales Daddy and the telecallers (best effort, never holds up the prize).
  const gives = describe(result.code)
  const fields = { Prize: gives, Code: result.code.code, 'Valid till': new Date(result.code.expires_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) }
  pushCrmLead('spin_wheel', {
    name, phone, source: 'website',
    note: `Spin & Win: won ${gives} (code ${result.code.code}, valid ${days} days).`,
    custom: { came_from: 'Spin & Win', prize: gives, code: result.code.code },
  }).catch(() => {})
  recordWebsiteLead(db, 'spin_wheel', { name, phone, fields })
    .then((id) => (id ? sendNeodoveLeads({ id }) : null)).catch(() => {})

  return { already: false, ...prizeView(result.row, result.code) }
}

// ---- Warehouse → Settings → Spin & Win (owners and IT) ----

export async function spinAdmin(db, staff) {
  requirePermission(staff, 'settings.manage')
  const settings = await getSettings(db)
  const { rows: [r] } = await db.query(
    `select (select count(*) from spins)::int as spins,
            (select count(*) from spins where created_at >= now() - interval '7 days')::int as week,
            count(o.id)::int as orders, coalesce(sum(o.discount_paise), 0)::bigint as given, coalesce(sum(o.total_paise), 0)::bigint as sales
       from orders o join discount_codes c on c.id = o.discount_code_id
      where c.source = 'spin' and o.payment_status in ('paid', 'partially_refunded')`)
  const { rows: byPrize } = await db.query(
    `select s.prize_label as label, count(*)::int as spins, count(o.id)::int as orders
       from spins s left join orders o on o.discount_code_id = s.code_id and o.payment_status in ('paid', 'partially_refunded')
      group by s.prize_label order by spins desc`)
  return {
    enabled: enabled(settings),
    budget: Number(settings.spin_budget_inr) || 0,
    validDays: validDays(settings),
    prizes: spinPrizes(settings),
    report: { spins: r.spins, lastWeek: r.week, orders: r.orders, given: toRupees(r.given), sales: toRupees(r.sales), byPrize },
  }
}

export async function saveSpinSettings(db, staff, body = {}) {
  requirePermission(staff, 'settings.manage')
  const changes = {}
  if (body.enabled != null) changes.spin_enabled = body.enabled ? 'true' : 'false'
  if (body.budget != null) {
    const b = Number(body.budget)
    if (!(Number.isInteger(b) && b >= 0 && b <= 1000000)) throw httpError('The monthly budget must be a whole number of rupees.')
    changes.spin_budget_inr = String(b)
  }
  if (body.validDays != null) {
    const d = Number(body.validDays)
    if (!(Number.isInteger(d) && d >= 1 && d <= 60)) throw httpError('Days valid must be between 1 and 60.')
    changes.spin_valid_days = String(d)
  }
  if (body.prizes != null) {
    const prizes = (Array.isArray(body.prizes) ? body.prizes : []).map((p, i) => ({
      key: str(p.key) || 'p' + (i + 1), label: str(p.label).toUpperCase(), kind: p.kind === 'free_delivery' ? 'free_delivery' : 'amount',
      amount: p.kind === 'free_delivery' ? 0 : Number(p.amount), minOrder: Number(p.minOrder) || 0, region: str(p.region) || null,
      chance: Number(p.chance),
    }))
    if (!validPrizes(prizes)) {
      throw httpError('Prizes: 2 to 8, each with a short label, an amount (₹1–₹2,000) or free delivery, and chances that add up to 100%.')
    }
    changes.spin_prizes = JSON.stringify(prizes)
  }
  for (const [key, value] of Object.entries(changes)) {
    await db.query(
      `insert into company_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value])
  }
  await audit(db, staff, 'spin.settings', 'company_settings', null, changes).catch(() => {})
  return spinAdmin(db, staff)
}
