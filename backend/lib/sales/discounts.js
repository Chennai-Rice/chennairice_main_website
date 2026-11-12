// Discount codes at checkout (Nov 2026).
//
// One code per order. The checkout sends what the customer typed; the server finds the code, checks
// every rule and works out the amount, when the cart is quoted (to show it) and again inside the
// order's transaction (to charge it), so a code can never be stretched by the browser. The discount
// comes off the order total (orders.discount_paise); the invoice prints it as "Less : Discount".
//
// Kinds: 'amount' (₹ off), 'percent' (% of the rice subtotal, optionally capped), 'free_delivery'
// (the delivery charge chosen). Rules: active, start / expiry, minimum rice subtotal, region (from the
// PIN code), locked to one mobile number, first order only, uses in all and per mobile number, and
// not by the customer who shares it (owner_phone, for referral codes).
//
// A use counts once the order is paid, or while its payment is still open (the stock hold); an order
// that expires unpaid frees it again.
import { httpError, str, phoneKey, toRupees, formatInr, getSettings } from './util.js'
import { regionForPincode } from './regions.js'
import { requirePermission } from './staff.js'

export const KINDS = ['amount', 'percent', 'free_delivery', 'gift']
const REGION_NAMES = { TN: 'Tamil Nadu', SOUTH: 'South India', NORTH: 'North India', NE: 'North East India' }
const USED = `(o.payment_status in ('paid', 'partially_refunded', 'refunded') or o.status = 'pending_payment')`

/** What the customer typed, as a code: capitals, no spaces. */
export function cleanCode(raw) {
  return str(raw).toUpperCase().replace(/\s+/g, '')
}

const fail = (message) => ({ error: message })
const istDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

/** How the code reads in the order summary: "₹50 off", "10% off", "Free delivery". */
export function describe(c) {
  if (c.kind === 'free_delivery') return 'Free delivery'
  if (c.kind === 'gift') return c.gift_label || 'Free gift'
  if (c.kind === 'percent') return `${Number(c.percent_bp) / 100}% off`
  return `${formatInr(c.amount_paise).replace('.00', '')} off`
}

/** A mobile number typed instead of a code: "98765 43210", "+91 98765 43210". */
const asMobile = (typed) => {
  let d = str(typed).replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) && !/[A-Za-z]/.test(str(typed)) ? d : ''
}

/**
 * The code row for what was typed, or null. A friend's mobile number finds that customer's referral code.
 * `lock` takes the row lock inside an order's transaction.
 */
async function findCode(db, typed, { lock = false } = {}) {
  const mobile = asMobile(typed)
  if (mobile) {
    const { rows: [c] } = await db.query(
      `select c.* from referrers r join discount_codes c on c.id = r.code_id where r.phone = $1${lock ? ' for update of c' : ''}`, [mobile])
    return c || null
  }
  const code = cleanCode(typed)
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) return null
  const { rows: [c] } = await db.query(`select * from discount_codes where code = $1${lock ? ' for update' : ''}`, [code])
  if (c) return c
  // The same code typed or copied without its hyphen (WhatsApp's Copy code button sends SPINA745B4
  // for SPIN-A745B4, as Meta allows letters and numbers only there).
  const bare = code.replace(/-/g, '')
  if (bare.length < 3) return null
  const { rows: [d] } = await db.query(
    `select * from discount_codes where replace(code, '-', '') = $1 order by id limit 1${lock ? ' for update' : ''}`, [bare])
  return d || null
}

/** Refer a friend is switched on (Warehouse → Settings → Refer a friend). */
export const referralsOn = (settings = {}) => str(settings.referral_enabled).toLowerCase() === 'true'
const sameAddress = (a = {}, b = {}) =>
  str(a.pincode) === str(b.pincode) && str(a.line1).toLowerCase().replace(/[^a-z0-9]/g, '') === str(b.line1).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Check a code for this cart and customer.
 * @returns {{ code, discountPaise, label } | { error }} never throws for a code that does not apply
 */
export async function evaluateDiscount(db, typed, { phone, email, address, pincode, subtotalPaise, shippingPaise, excludeOrderId = null, lock = false }) {
  if (!cleanCode(typed)) return null
  const c = await findCode(db, typed, { lock })
  if (!c && asMobile(typed)) return fail('We could not find a referral for that mobile number. Please check it, or type their code.')
  if (!c || !c.is_active) return fail('We could not find that code. Please check it and try again.')
  if (['referral', 'reward'].includes(c.source) && !referralsOn(await getSettings(db))) {
    return fail('Refer a friend is not running right now.')
  }
  const now = Date.now()
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return fail(`This code can be used from ${istDate(c.starts_at)}.`)
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return fail(`This code expired on ${istDate(c.expires_at)}.`)

  const mobile = phoneKey(phone)
  const needsPhone = c.locked_phone || c.owner_phone || c.first_order_only || c.uses_per_phone
  if (needsPhone && mobile.length !== 10) return fail('Enter your mobile number above to use this code.')
  if (c.locked_phone && c.locked_phone !== mobile) return fail('This code belongs to another mobile number.')
  if (c.owner_phone && c.owner_phone === mobile) return fail('You cannot use your own code. Share it with a friend.')
  if (c.locked_email) {
    if (!str(email)) return fail('Enter your email above to use this reward.')
    if (str(email).toLowerCase() !== c.locked_email) return fail('This reward belongs to another customer.')
  }
  if (c.source === 'referral') {
    // Not the referrer under another number: the same email, or (at order time) the same address.
    const { rows: [ref] } = await db.query('select * from referrers where code_id = $1', [c.id])
    if (ref && str(email) && str(email).toLowerCase() === ref.email) return fail('You cannot use your own code. Share it with a friend.')
    if (ref && address) {
      const { rows: theirs } = await db.query(
        `select shipping_address from orders where right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1
            and payment_status in ('paid', 'partially_refunded') order by placed_at desc limit 20`, [ref.phone])
      if (theirs.some((o) => sameAddress(o.shipping_address, address))) return fail('You cannot use your own code. Share it with a friend.')
    }
  }

  if (c.region) {
    if (!/^[1-9]\d{5}$/.test(str(pincode))) return fail('Enter your PIN code to use this code.')
    if (regionForPincode(pincode) !== c.region) return fail(`This code is for ${REGION_NAMES[c.region]} only.`)
  }
  if (subtotalPaise < Number(c.min_order_paise)) {
    return fail(`Add ${formatInr(Number(c.min_order_paise) - subtotalPaise).replace('.00', '')} more to use this code (orders above ${formatInr(c.min_order_paise).replace('.00', '')}).`)
  }

  const params = [c.id, excludeOrderId]
  const others = `o.discount_code_id = $1 and ($2::uuid is null or o.id <> $2) and ${USED}`
  if (c.max_uses) {
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from orders o where ${others}`, params)
    if (n >= c.max_uses) return fail('This code has been used up.')
  }
  if (c.first_order_only) {
    const { rows: [{ n }] } = await db.query(
      `select count(*)::int as n from orders o
        where o.payment_status in ('paid', 'partially_refunded', 'refunded') and ($2::uuid is null or o.id <> $2)
          and right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10) = $1`, [mobile, excludeOrderId])
    if (n) return fail('This offer is for first orders only.')
  }

  {
    const { rows: [{ n }] } = await db.query(
      `select count(*)::int as n from orders o where ${others} and right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10) = $3`,
      [...params, mobile])
    if (n >= c.uses_per_phone) return fail('You have already used this code.')
  }
  let off
  if (c.kind === 'gift') {
    // Something in the parcel, nothing off the price: the order keeps the gift for the warehouse.
    return { code: c, discountPaise: 0, label: describe(c), gift: c.gift_label || 'Free gift' }
  } else if (c.kind === 'free_delivery') {
    if (shippingPaise == null) return fail('Enter your PIN code to use this code.')
    off = Number(shippingPaise)
  } else if (c.kind === 'percent') {
    off = Math.round((subtotalPaise * Number(c.percent_bp)) / 10000)
    if (c.max_off_paise != null) off = Math.min(off, Number(c.max_off_paise))
  } else {
    off = Number(c.amount_paise)
  }
  // Never the whole order: at least ₹1 is left to pay (the payment gateways need an amount).
  off = Math.max(0, Math.min(off, subtotalPaise + Number(shippingPaise || 0) - 100))
  return { code: c, discountPaise: off, label: describe(c) }
}

/**
 * The customer's referral reward that applies to this cart, when they typed no code: earliest to expire
 * first. Rewards are locked to their mobile number and email. null when there is none.
 */
export async function autoReward(db, cart) {
  const mobile = phoneKey(cart.phone)
  const email = str(cart.email).toLowerCase()
  if (mobile.length !== 10 || !email) return null
  const { rows } = await db.query(
    `select code from discount_codes where source = 'reward' and is_active and locked_phone = $1 and locked_email = $2
        and (expires_at is null or expires_at > now()) order by expires_at nulls last, created_at limit 5`, [mobile, email])
  for (const { code } of rows) {
    const r = await evaluateDiscount(db, code, cart)
    if (r && !r.error) return { ...r, auto: true }
  }
  return null
}

/** For the quote: the typed code checked, or else a reward of the customer's. */
export async function quoteDiscount(db, typed, cart) {
  if (cleanCode(typed)) return evaluateDiscount(db, typed, cart)
  return autoReward(db, cart)
}

/**
 * For the order: the code's row and amount, or a 422 with what is wrong. No code: the customer's reward
 * when one applies (the same one the quote showed), else no discount.
 */
export async function applyDiscount(db, typed, cart) {
  if (!cleanCode(typed)) {
    const reward = await autoReward(db, { ...cart, lock: true })
    return reward || { code: null, discountPaise: 0 }
  }
  const r = await evaluateDiscount(db, typed, { ...cart, lock: true })
  if (r.error) throw httpError('Discount code refused: ' + r.error, { status: 422, publicMessage: r.error })
  return r
}

// ---- Warehouse → Settings → Discount codes (owners and IT) ----

function shape(c) {
  return {
    id: c.id, code: c.code, kind: c.kind, label: describe(c),
    amount: toRupees(c.amount_paise), percent: Number(c.percent_bp) / 100,
    maxOff: c.max_off_paise == null ? null : toRupees(c.max_off_paise),
    minOrder: toRupees(c.min_order_paise), region: c.region,
    lockedPhone: c.locked_phone, ownerPhone: c.owner_phone, firstOrderOnly: c.first_order_only,
    maxUses: c.max_uses, usesPerPhone: c.uses_per_phone,
    startsAt: c.starts_at, expiresAt: c.expires_at, source: c.source, note: c.note, active: c.is_active,
    createdAt: c.created_at,
    uses: Number(c.uses || 0), given: toRupees(c.given_paise || 0), sales: toRupees(c.sales_paise || 0),
  }
}

/** Codes with their paid uses, the money given and the sales they brought. */
export async function listDiscountCodes(db, staff, { source = '' } = {}) {
  requirePermission(staff, 'settings.manage')
  const params = []
  let filter = ''
  if (['manual', 'spin', 'referral', 'reward'].includes(source)) { params.push(source); filter = 'where c.source = $1' }
  const { rows } = await db.query(
    `select c.*, coalesce(u.uses, 0) as uses, coalesce(u.given, 0) as given_paise, coalesce(u.sales, 0) as sales_paise
       from discount_codes c
       left join (select discount_code_id, count(*) as uses, sum(discount_paise) as given, sum(total_paise) as sales
                    from orders where payment_status in ('paid', 'partially_refunded') group by discount_code_id) u
         on u.discount_code_id = c.id
       ${filter}
      order by c.created_at desc limit 500`, params)
  const totals = rows.reduce((t, r) => ({ uses: t.uses + Number(r.uses), given: t.given + Number(r.given_paise), sales: t.sales + Number(r.sales_paise) }), { uses: 0, given: 0, sales: 0 })
  return { codes: rows.map(shape), totals: { uses: totals.uses, given: toRupees(totals.given), sales: toRupees(totals.sales) } }
}

const rupeesToPaise = (v, field, { max = 1000000 } = {}) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > max) throw httpError(`${field} must be between ₹0 and ₹${max.toLocaleString('en-IN')}.`)
  return Math.round(n * 100)
}

/** A new code from the panel. */
export async function createDiscountCode(db, staff, body = {}) {
  requirePermission(staff, 'settings.manage')
  // Form values arrive as text or numbers.
  const txt = (v) => (v == null ? '' : String(v).trim())
  const code = cleanCode(body.code)
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw httpError('The code must be 3–24 letters, numbers or dashes, e.g. DIWALI50.')
  const kind = txt(body.kind)
  if (!KINDS.includes(kind)) throw httpError('Choose ₹ off, % off or free delivery.')
  const amount = kind === 'amount' ? rupeesToPaise(body.amount, 'The amount off', { max: 5000 }) : 0
  if (kind === 'amount' && !amount) throw httpError('Enter the amount off.')
  const percent = kind === 'percent' ? Number(body.percent) : 0
  if (kind === 'percent' && !(percent > 0 && percent <= 50)) throw httpError('The % off must be between 1 and 50.')
  const maxOff = kind === 'percent' && txt(body.maxOff) !== '' ? rupeesToPaise(body.maxOff, 'The most off', { max: 5000 }) : null
  const minOrder = txt(body.minOrder) === '' ? 0 : rupeesToPaise(body.minOrder, 'The minimum order', { max: 100000 })
  const region = txt(body.region) || null
  if (region && !REGION_NAMES[region]) throw httpError('Unknown region.')
  const lockedPhone = txt(body.lockedPhone) ? phoneKey(body.lockedPhone) : null
  if (lockedPhone && lockedPhone.length !== 10) throw httpError('The mobile number must have 10 digits.')
  const maxUses = txt(body.maxUses) === '' ? null : Number(body.maxUses)
  if (maxUses != null && !(Number.isInteger(maxUses) && maxUses > 0 && maxUses <= 100000)) throw httpError('Uses in all must be a whole number.')
  const perPhone = txt(body.usesPerPhone) === '' ? 1 : Number(body.usesPerPhone)
  if (!(Number.isInteger(perPhone) && perPhone > 0 && perPhone <= 100)) throw httpError('Uses per mobile number must be a whole number.')
  const date = (v, end) => {
    if (!txt(v)) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(v))) throw httpError('Dates must be like 2026-11-30.')
    return `${txt(v)}T${end ? '23:59:59' : '00:00:00'}+05:30` // India time, the whole day
  }
  const startsAt = date(body.startsAt, false)
  const expiresAt = date(body.expiresAt, true)
  if (startsAt && expiresAt && expiresAt < startsAt) throw httpError('The end date is before the start date.')
  try {
    const { rows: [c] } = await db.query(
      `insert into discount_codes (code, kind, amount_paise, percent_bp, max_off_paise, min_order_paise, region, locked_phone,
                                   first_order_only, max_uses, uses_per_phone, starts_at, expires_at, note, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning *`,
      [code, kind, amount, Math.round(percent * 100), maxOff, minOrder, region, lockedPhone, Boolean(body.firstOrderOnly),
        maxUses, perPhone, startsAt, expiresAt, txt(body.note).slice(0, 200) || null, staff.id || null])
    return shape(c)
  } catch (err) {
    if (err.code === '23505') throw httpError(`There is already a code ${code}.`, { status: 409 })
    throw err
  }
}

/** Switch a code on or off. */
export async function setDiscountCodeActive(db, staff, id, active) {
  requirePermission(staff, 'settings.manage')
  if (!/^[0-9a-f-]{36}$/i.test(str(id))) throw httpError('That code does not exist.', { status: 404 })
  const { rows: [c] } = await db.query('update discount_codes set is_active = $2 where id = $1 returning *', [id, Boolean(active)])
  if (!c) throw httpError('That code does not exist.', { status: 404 })
  return shape(c)
}
