// WhatsApp automations (/whatsappbot → Automations): template messages that go out by themselves.
//
//   Spin & Win     spin_code (right after the spin; the free-bag prize gets spin_gift_won), spin_reminder
//                  (N days later, code unused), spin_last_chance (N days before the code expires)
//   Refer a friend ref_share_code (after the first delivery), ref_friend_ordered, ref_reward_ready,
//                  ref_reward_expiring, ref_nudge (optional)
//   Retention      restock_reminder (by pack size), winback_offer (with a fresh code), cart_reminder (after the
//                  cart email), review_request (after delivery)
//
// Every 10 minutes (jobs.js): find who is due (each message has a ref, so it happens once), put them in
// wa_queue, then send what is due. Rules: marketing only to people who said yes (and not STOP), at most
// 1 marketing message a day and 3 a week per person, between 9 am and 8 pm India time, nothing that
// would interrupt an order on its way. Templates must be approved by Meta first.
import { query as defaultQuery } from '../db.js'
import { str, formatInr, getSettings, randomCode } from '../sales/util.js'
import { referralSettings } from '../sales/referrals.js'
import { reviewToken } from '../sales/reviews.js'
import { sendMessage } from './cloud.js'
import { sendComponents, filledText } from './admin.js'
import { fromComponents } from './templates.js'

export const AUTOMATIONS = {
  spin_code: { group: 'Spin & Win', title: 'Prize code right after the spin', template: 'spin_code', category: 'marketing', fields: {} },
  spin_reminder: { group: 'Spin & Win', title: 'Reminder when the code is unused', template: 'spin_reminder', category: 'marketing', fields: { days: 3 } },
  spin_last_chance: { group: 'Spin & Win', title: 'Last chance before the code expires', template: 'spin_last_chance', category: 'marketing', fields: { daysBefore: 2 } },
  ref_share_code: { group: 'Refer a friend', title: 'Share your code, after the first delivery', template: 'ref_share_code', category: 'marketing', fields: { daysAfter: 1 } },
  ref_friend_ordered: { group: 'Refer a friend', title: 'A friend ordered with your code', template: 'ref_friend_ordered', category: 'utility', fields: {} },
  ref_reward_ready: { group: 'Refer a friend', title: 'Your reward is ready', template: 'ref_reward_ready', category: 'marketing', fields: {} },
  ref_reward_expiring: { group: 'Refer a friend', title: 'Reward expiring soon', template: 'ref_reward_expiring', category: 'marketing', fields: { daysBefore: 7 } },
  ref_nudge: { group: 'Refer a friend', title: 'Reminder to share (if no friend yet)', template: 'ref_nudge', category: 'marketing', fields: { days: 14 } },
  restock: { group: 'Bring customers back', title: 'Time to restock', template: 'restock_reminder', category: 'marketing', fields: { days5: 22, days10: 40, days26: 80 } },
  winback: { group: 'Bring customers back', title: 'We miss you (with a code)', template: 'winback_offer', category: 'marketing', fields: { days: 60, amount: 50, validDays: 7 } },
  cart: { group: 'Bring customers back', title: 'Items left in the cart', template: 'cart_reminder', category: 'marketing', fields: { hours: 2 } },
  review: { group: 'Orders', title: 'Ask for a review after delivery', template: 'review_request', category: 'utility', fields: { days: 2 } },
}
const LAUNCH_WINDOW_DAYS = 10 // look back at most this far, so switching one on does not message old customers

const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'there'
const rs = (paise) => formatInr(paise).replace('.00', '')
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '')
const last10sql = (col) => `right(regexp_replace(${col}, '\\D', '', 'g'), 10)`

export function cleanAutomations(input = {}) {
  const out = {}
  for (const [key, def] of Object.entries(AUTOMATIONS)) {
    const v = input[key] || {}
    const fields = {}
    for (const [f, d] of Object.entries(def.fields)) {
      const n = Number(v[f])
      fields[f] = Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n) : d
    }
    out[key] = { on: v.on === true, template: str(v.template) || def.template, ...fields }
  }
  return out
}

export async function getAutomations(query = defaultQuery) {
  const { rows: [r] } = await query(`select value from company_settings where key = 'wa_automations'`).catch(() => ({ rows: [] }))
  let saved = {}
  try { saved = r ? JSON.parse(r.value) : {} } catch { saved = {} }
  return cleanAutomations(saved)
}

export async function automationsAdmin({ query = defaultQuery } = {}) {
  const cfg = await getAutomations(query)
  const { rows: tpl } = await query(`select name, status, category from wa_templates where language = 'en'`)
  const status = Object.fromEntries(tpl.map((t) => [t.name, t.status]))
  const { rows: stats } = await query(
    `select q.source, count(*) filter (where q.status = 'sent')::int as sent, count(*) filter (where q.status = 'queued')::int as queued,
            count(*) filter (where q.status = 'failed')::int as failed, count(*) filter (where q.status = 'skipped')::int as skipped,
            count(*) filter (where m.status = 'read')::int as read
       from wa_queue q left join wa_messages m on m.wamid = q.wamid
      where q.created_at > now() - interval '30 days' and q.broadcast_id is null group by q.source`)
  const by = Object.fromEntries(stats.map((s) => [s.source, s]))
  return {
    automations: Object.entries(AUTOMATIONS).map(([key, def]) => ({
      key, group: def.group, title: def.title, category: def.category, defaults: def.fields, ...cfg[key],
      templateStatus: status[cfg[key].template] || 'MISSING', last30: by[key] || { sent: 0, queued: 0, failed: 0, skipped: 0, read: 0 },
    })),
    approved: tpl.filter((t) => t.status === 'APPROVED').map((t) => t.name).sort(),
  }
}

export async function saveAutomations(input, { query = defaultQuery } = {}) {
  const current = await getAutomations(query)
  const next = cleanAutomations({ ...current, ...input })
  await query(`insert into company_settings (key, value) values ('wa_automations', $1)
               on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)])
  return automationsAdmin({ query })
}

// ---- who is due ------------------------------------------------------------------------------------------------
/** Each finder returns rows of { phone, ref, vals: { body, buttons } }. */
function finders(cfg, settings) {
  const ref = referralSettings(settings)
  return {
    async spin_code(q) {
      const { rows } = await q(
        `select sp.id, sp.phone, sp.name, sp.prize_label, sp.prize_key, d.code, d.min_order_paise, d.expires_at
           from spins sp join discount_codes d on d.id = sp.code_id
          where sp.created_at > now() - interval '1 day'`)
      return rows.map((r) => {
        const gift = /bag|gift/i.test(r.prize_label) || r.prize_key === 'bag'
        return gift
          ? { phone: r.phone, ref: `spin_code:${r.id}`, template: 'spin_gift_won', vals: { body: [first(r.name), rs(r.min_order_paise), day(r.expires_at)], buttons: { 0: `spin-${r.code}` } } }
          : { phone: r.phone, ref: `spin_code:${r.id}`, vals: { body: [first(r.name), r.prize_label, rs(r.min_order_paise), day(r.expires_at)], buttons: { 0: r.code, 1: `spin-${r.code}` } } }
      })
    },
    async spin_reminder(q) {
      const { rows } = await q(
        `select sp.id, sp.phone, sp.name, sp.prize_label, d.code, d.expires_at from spins sp join discount_codes d on d.id = sp.code_id
          where sp.created_at <= now() - make_interval(days => $1::int) and sp.created_at > now() - make_interval(days => $1::int + $2::int)
            and d.is_active and (d.expires_at is null or d.expires_at > now() + interval '1 day')
            and not exists (select 1 from orders o where o.discount_code_id = d.id and o.status not in ('pending_payment', 'cancelled'))
            and sp.prize_label !~* 'bag|gift'`, [cfg.spin_reminder.days, LAUNCH_WINDOW_DAYS])
      return rows.map((r) => ({ phone: r.phone, ref: `spin_reminder:${r.id}`, vals: { body: [first(r.name), r.prize_label, day(r.expires_at)], buttons: { 0: r.code, 1: `spin-${r.code}` } } }))
    },
    async spin_last_chance(q) {
      const { rows } = await q(
        `select sp.id, sp.phone, sp.name, sp.prize_label, d.code, d.expires_at from spins sp join discount_codes d on d.id = sp.code_id
          where d.is_active and d.expires_at > now() and d.expires_at <= now() + make_interval(days => $1::int)
            and not exists (select 1 from orders o where o.discount_code_id = d.id and o.status not in ('pending_payment', 'cancelled'))
            and sp.prize_label !~* 'bag|gift'`, [cfg.spin_last_chance.daysBefore])
      return rows.map((r) => ({ phone: r.phone, ref: `spin_last_chance:${r.id}`, vals: { body: [first(r.name), r.prize_label, day(r.expires_at)], buttons: { 0: r.code, 1: `spin-${r.code}` } } }))
    },
    async ref_share_code(q) {
      const { rows } = await q(
        `select r.id, r.phone, r.name, d.code from referrers r join discount_codes d on d.id = r.code_id
          where exists (select 1 from orders o where ${last10sql('o.contact_phone')} = r.phone and o.status = 'delivered'
                          and o.delivered_at <= now() - make_interval(days => $1::int) and o.delivered_at > now() - make_interval(days => $1::int + $2::int))`,
        [cfg.ref_share_code.daysAfter, LAUNCH_WINDOW_DAYS])
      return rows.map((r) => ({ phone: r.phone, ref: `ref_share_code:${r.id}`, vals: { body: [first(r.name), rs(ref.friend * 100), r.code, rs(ref.reward * 100)], buttons: { 0: `ref-${r.code}` } } }))
    },
    async ref_friend_ordered(q) {
      const { rows } = await q(
        `select o.id, o.contact_name as friend, r.phone, r.name, d.code from orders o join referrers r on r.id = o.referrer_id join discount_codes d on d.id = r.code_id
          where o.status not in ('pending_payment', 'cancelled') and o.placed_at > now() - interval '2 days'`)
      return rows.map((r) => ({ phone: r.phone, ref: `ref_friend_ordered:${r.id}`, vals: { body: [first(r.name), first(r.friend), r.code, rs(ref.reward * 100)] } }))
    },
    async ref_reward_ready(q) {
      const { rows } = await q(
        `select w.id, r.phone, r.name, o.contact_name as friend, d.code, d.amount_paise, d.expires_at
           from referral_rewards w join referrers r on r.id = w.referrer_id join orders o on o.id = w.friend_order_id join discount_codes d on d.id = w.code_id
          where w.status = 'issued' and w.created_at > now() - interval '2 days'`)
      return rows.map((r) => ({ phone: r.phone, ref: `ref_reward_ready:${r.id}`, vals: { body: [first(r.name), first(r.friend), rs(r.amount_paise), day(r.expires_at)], buttons: { 0: r.code, 1: `reward-${r.code}` } } }))
    },
    async ref_reward_expiring(q) {
      const { rows } = await q(
        `select w.id, r.phone, r.name, d.code, d.amount_paise, d.expires_at
           from referral_rewards w join referrers r on r.id = w.referrer_id join discount_codes d on d.id = w.code_id
          where w.status = 'issued' and d.is_active and d.expires_at > now() and d.expires_at <= now() + make_interval(days => $1::int)
            and not exists (select 1 from orders o where o.discount_code_id = d.id and o.status not in ('pending_payment', 'cancelled'))`, [cfg.ref_reward_expiring.daysBefore])
      return rows.map((r) => ({ phone: r.phone, ref: `ref_reward_expiring:${r.id}`, vals: { body: [first(r.name), rs(r.amount_paise), day(r.expires_at)], buttons: { 0: r.code, 1: `reward-${r.code}` } } }))
    },
    async ref_nudge(q) {
      const { rows } = await q(
        `select r.id, r.phone, r.name, d.code from referrers r join discount_codes d on d.id = r.code_id
          where exists (select 1 from wa_queue x where x.ref = 'ref_share_code:' || r.id and x.status = 'sent'
                          and x.sent_at <= now() - make_interval(days => $1::int) and x.sent_at > now() - make_interval(days => $1::int + $2::int))
            and not exists (select 1 from orders o where o.referrer_id = r.id)`, [cfg.ref_nudge.days, LAUNCH_WINDOW_DAYS])
      return rows.map((r) => ({ phone: r.phone, ref: `ref_nudge:${r.id}`, vals: { body: [first(r.name), rs(ref.friend * 100), r.code, rs(ref.reward * 100)], buttons: { 0: `ref-${r.code}` } } }))
    },
    async restock(q) {
      // The customer's latest delivered order, its biggest pack decides when rice runs out; nothing ordered since.
      const { rows } = await q(
        `with latest as (
           select distinct on (${last10sql('o.contact_phone')}) o.id, o.order_number, o.contact_name, o.delivered_at, ${last10sql('o.contact_phone')} as phone,
                  (select max(i.pack_kg) from order_items i where i.order_id = o.id) as kg,
                  (select i.product_name from order_items i where i.order_id = o.id order by i.pack_kg desc limit 1) as product
             from orders o where o.status not in ('pending_payment', 'cancelled')
            order by ${last10sql('o.contact_phone')}, o.placed_at desc nulls last
         )
         select *, extract(day from now() - delivered_at)::int as days_since,
                case when kg >= 20 then $3::int when kg >= 10 then $2::int else $1::int end as due_days
           from latest where delivered_at is not null`, [cfg.restock.days5, cfg.restock.days10, cfg.restock.days26])
      return rows.filter((r) => r.days_since >= r.due_days && r.days_since < r.due_days + LAUNCH_WINDOW_DAYS)
        .map((r) => ({ phone: r.phone, ref: `restock:${r.id}`, vals: { body: [first(r.contact_name), String(r.days_since), `${r.product || 'rice'} ${Number(r.kg) || ''} kg`.trim()], buttons: { 0: `reorder-${r.order_number}` } } }))
    },
    async winback(q) {
      const { rows } = await q(
        `with latest as (
           select distinct on (${last10sql('o.contact_phone')}) o.id, o.contact_name, ${last10sql('o.contact_phone')} as phone, coalesce(o.delivered_at, o.placed_at) as at
             from orders o where o.status not in ('pending_payment', 'cancelled') order by ${last10sql('o.contact_phone')}, o.placed_at desc nulls last
         ) select * from latest where at <= now() - make_interval(days => $1::int) and at > now() - make_interval(days => $1::int + $2::int)`,
        [cfg.winback.days, LAUNCH_WINDOW_DAYS])
      // The code is made when the message is queued (one per customer, locked to their number).
      return rows.map((r) => ({ phone: r.phone, ref: `winback:${r.id}`, needsCode: true, name: r.contact_name }))
    },
    async cart(q) {
      const { rows } = await q(
        `select c.id, c.phone, c.token, j.contact_name, j.items as cart
           from cart_reminders c join checkout_journeys j on j.id = c.journey_id
          where c.step = 1 and c.phone is not null and c.sent_at <= now() - make_interval(hours => $1::int) and c.sent_at > now() - interval '1 day'
            and not exists (select 1 from orders o where ${last10sql('o.contact_phone')} = c.phone and o.status not in ('pending_payment', 'cancelled') and o.placed_at > c.sent_at - interval '1 hour')`,
        [cfg.cart.hours])
      return rows.map((r) => {
        const lines = Array.isArray(r.cart) ? r.cart : (Array.isArray(r.cart?.lines) ? r.cart.lines : [])
        const names = lines.map((l) => l.name || l.productName).filter(Boolean)
        const what = names.length ? names[0] + (names.length > 1 ? ` and ${names.length - 1} more` : '') : 'your rice'
        return { phone: r.phone, ref: `cart:${r.id}`, vals: { body: [first(r.contact_name), what], buttons: { 0: `cart-${r.token}` } } }
      })
    },
    async review(q) {
      const { rows } = await q(
        `select o.id, o.order_number, o.contact_name, ${last10sql('o.contact_phone')} as phone from orders o
          where o.status = 'delivered' and o.delivered_at <= now() - make_interval(days => $1::int) and o.delivered_at > now() - make_interval(days => $1::int + 5)
            and not exists (select 1 from reviews r where r.order_id = o.id)`, [cfg.review.days])
      return rows.map((r) => ({ phone: r.phone, ref: `review:${r.id}`, vals: { body: [first(r.contact_name), r.order_number], buttons: { 0: `review-${r.order_number}.${reviewToken(r.order_number)}` } } }))
    },
  }
}

/** Puts everyone who is due into wa_queue (once each). */
export async function enqueueDue({ query = defaultQuery, only = null } = {}) {
  const cfg = await getAutomations(query)
  const { rows: approved } = await query(`select name, category from wa_templates where status = 'APPROVED' and language = 'en'`)
  const ok = new Map(approved.map((t) => [t.name, t.category]))
  const find = finders(cfg, await getSettings({ query }))
  const queued = {}
  for (const [key, def] of Object.entries(AUTOMATIONS)) {
    if (only && !only.includes(key)) continue
    if (!cfg[key].on) continue
    let rows
    try { rows = await find[key](query) } catch (err) { console.error('[wa-auto]', key, err.message); continue }
    let n = 0
    for (const r of rows) {
      const template = r.template || cfg[key].template
      if (!ok.has(template)) continue
      if (!/^[6-9]\d{9}$/.test(String(r.phone))) continue
      let vals = r.vals
      if (r.needsCode) vals = await winbackVals(r, cfg.winback, query)
      const { rowCount } = await query(
        `insert into wa_queue (phone, template_name, category, vals, source, ref) values ($1, $2, $3, $4, $5, $6) on conflict (ref) where ref is not null do nothing`,
        [r.phone, template, String(ok.get(template) || def.category).toLowerCase(), JSON.stringify(vals), key, r.ref])
      n += rowCount
    }
    if (n) queued[key] = n
  }
  return queued
}

async function winbackVals(r, c, query) {
  const code = 'BACK' + randomCode(3)
  const until = new Date(Date.now() + c.validDays * 864e5)
  await query(
    `insert into discount_codes (code, kind, amount_paise, locked_phone, max_uses, uses_per_phone, expires_at, source, note)
     values ($1, 'amount', $2, $3, 1, 1, $4, 'manual', 'WhatsApp win-back') on conflict (code) do nothing`,
    [code, c.amount * 100, r.phone, until])
  return { body: [first(r.name), rs(c.amount * 100), day(until)], buttons: { 0: code, 1: `back-${code}` } }
}

// ---- sending ---------------------------------------------------------------------------------------------------
const istHour = () => new Date(Date.now() + 5.5 * 3600e3).getUTCHours()

/**
 * Sends queued messages that are due (automations and broadcasts). Marketing: only to people who said yes
 * and did not say STOP, 1 a day / 3 a week each, 9 am – 8 pm India time, not while an order is on its way.
 */
export async function sendQueue({ query = defaultQuery, fetchImpl, limit = 150, broadcastId = null } = {}) {
  const hour = istHour()
  const quiet = hour < 9 || hour >= 20
  const { rows } = await query(
    `update wa_queue set attempts = attempts + 1
      where id in (select id from wa_queue where status = 'queued' and send_after <= now() and ($1::uuid is null or broadcast_id = $1)
                    order by send_after limit $2 for update skip locked)
      returning *`, [broadcastId, limit])
  const { rows: tpl } = await query(`select * from wa_templates where status = 'APPROVED'`)
  const byName = new Map(tpl.map((t) => [t.name + ':' + t.language, t]))
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const r of rows) {
    const marketing = r.category === 'marketing'
    const skip = async (reason, final = true) => {
      skipped++
      if (final) await query(`update wa_queue set status = 'skipped', reason = $2 where id = $1`, [r.id, reason])
      else await query(`update wa_queue set attempts = attempts - 1, send_after = $2 where id = $1`, [r.id, reason])
    }
    if (marketing && quiet) {
      // Wait for 9 am India time.
      const next = new Date(Date.now() + 5.5 * 3600e3)
      next.setUTCHours(hour >= 20 ? 24 + 9 : 9, 5, 0, 0)
      await skip(new Date(next.getTime() - 5.5 * 3600e3), false)
      continue
    }
    const t = byName.get(r.template_name + ':' + r.language)
    if (!t) { await skip('template not approved'); continue }
    const { rows: [c] } = await query(`select opted_in_at, opted_out_at from wa_contacts where phone = $1`, [r.phone])
    if (marketing && !(c?.opted_in_at && !c.opted_out_at)) { await skip(c?.opted_out_at ? 'said STOP' : 'no WhatsApp permission'); continue }
    if (marketing) {
      const { rows: [f] } = await query(
        `select count(*) filter (where sent_at > now() - interval '20 hours')::int as day, count(*) filter (where sent_at > now() - interval '7 days')::int as week
           from wa_queue where phone = $1 and status = 'sent' and category = 'marketing'`, [r.phone])
      if (f.day >= 1 || f.week >= 3) { await skip('frequency limit (1 a day, 3 a week)'); continue }
      if (r.source !== 'broadcast') {
        const { rows: [busy] } = await query(
          `select 1 from orders where right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1 and status in ('placed', 'confirmed', 'packed', 'shipped') limit 1`, [r.phone])
        if (busy && !['ref_friend_ordered', 'ref_reward_ready'].includes(r.source)) { await skip('an order is on its way'); continue }
      }
    }
    const model = fromComponents(t.components)
    const components = sendComponents(model, r.vals || {})
    const message = { messaging_product: 'whatsapp', recipient_type: 'individual', to: '91' + r.phone, type: 'template',
      template: { name: t.name, language: { code: t.language }, ...(components.length ? { components } : {}) } }
    try {
      const wamid = await sendMessage(message, { fetchImpl })
      await query(`update wa_queue set status = 'sent', sent_at = now(), wamid = $2, reason = null where id = $1`, [r.id, wamid])
      await query(
        `insert into wa_messages (wamid, direction, phone, kind, template_name, category, body, payload, status, source)
         values ($1, 'out', $2, 'template', $3, $4, $5, $6, 'sent', $7) on conflict (wamid) do nothing`,
        [wamid, r.phone, t.name, r.category, filledText(model, r.vals || {}), JSON.stringify(message), r.source])
      await query(`insert into wa_contacts (phone, last_out_at) values ($1, now()) on conflict (phone) do update set last_out_at = now()`, [r.phone])
      sent++
    } catch (err) {
      failed++
      const retry = !err.meta?.status || err.meta.status >= 500 || err.meta.status === 429
      await query(`update wa_queue set status = $2, reason = $3, send_after = now() + interval '15 minutes' where id = $1`,
        [r.id, retry && r.attempts < 4 ? 'queued' : 'failed', String(err.publicMessage || err.message).slice(0, 300)])
    }
  }
  return { sent, skipped, failed }
}

/** The 10-minute job: queue who is due, then send. Never throws. */
export async function runWhatsAppAutomations({ query = defaultQuery, only = null } = {}) {
  if (!process.env.WHATSAPP_TOKEN) return { skipped: 'no WHATSAPP_TOKEN' }
  try {
    const queued = await enqueueDue({ query, only })
    if (!only) await (await import('./broadcasts.js')).startScheduled({ query })
    const sent = await sendQueue({ query, limit: only ? 20 : 400 })
    return { queued, ...sent }
  } catch (err) {
    console.error('[wa-auto]', err.message)
    return { error: err.message }
  }
}

/** Automations page: send one automation's template to your own number with sample values. */
export async function testAutomation(key, phone, staff, { query = defaultQuery } = {}) {
  const cfg = await getAutomations(query)
  if (!cfg[key]) return { error: 'unknown' }
  const { rows: [t] } = await query(`select * from wa_templates where name = $1 and status = 'APPROVED'`, [cfg[key].template])
  if (!t) return { error: `The template ${cfg[key].template} is not approved yet.` }
  const { sendTemplate } = await import('./admin.js')
  const wamid = await sendTemplate(phone, t, {}, { source: 'test', staff, query })
  return { ok: true, wamid }
}
