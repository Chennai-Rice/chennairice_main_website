// Refer a friend (Nov 2026), all on the website.
//
//   1. Every paying customer gets a referral code (e.g. LAKSHMI47): on the order-confirmed page, in the
//      order email, and at /refer (mobile number + the email used on an order).
//   2. A friend types that code, or the customer's mobile number, at checkout: ₹ off their FIRST order
//      (discounts.js checks: first order, not the customer themselves by mobile, email or address).
//   3. When the friend's order is delivered, the customer gets a reward code locked to their mobile
//      number and email, used automatically at their next checkout; they are told by email. At most
//      `referral_monthly_cap` rewards a month each (the friend still gets their discount).
//
// Settings (company_settings, Warehouse → Settings → Refer a friend):
//   referral_enabled       'true' / 'false'   (off until switched on)
//   referral_friend_inr    ₹ off the friend's first order      (default 50)
//   referral_reward_inr    ₹ reward for the customer           (default 50)
//   referral_monthly_cap   rewards per customer per month      (default 10)
//   referral_reward_days   days a reward can be used           (default 60)
import crypto from 'node:crypto'
import { httpError, str, phoneKey, toRupees, formatInr, getSettings } from './util.js'
import { requirePermission, audit } from './staff.js'
import { referralsOn } from './discounts.js'
import { queueEmail } from './email.js'

const SITE = (process.env.PUBLIC_SITE_URL || 'https://chennairiceindustries.com').replace(/\/$/, '')
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d }

export function referralSettings(settings = {}) {
  return {
    enabled: referralsOn(settings),
    friend: num(settings.referral_friend_inr, 50, 1, 2000),
    reward: num(settings.referral_reward_inr, 50, 1, 2000),
    cap: num(settings.referral_monthly_cap, 10, 1, 100),
    days: num(settings.referral_reward_days, 60, 1, 365),
  }
}

/** The message a customer shares (WhatsApp, SMS, anywhere). */
export const shareText = (code, friend) =>
  `Use my code ${code} at chennairiceindustries.com checkout for ${formatInr(friend * 100).replace('.00', '')} off your first order of Chennai Rice.`

function baseFor(name) {
  const first = str(name).split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
  return first.length >= 2 ? first : 'CR'
}

/**
 * The customer's referral code, made the first time (from a paid order's name, mobile number and email).
 * null while Refer a friend is off or the mobile number is not a mobile.
 */
export async function ensureReferrer(db, order, settings = null) {
  const s = referralSettings(settings || (await getSettings(db)))
  if (!s.enabled) return null
  const phone = phoneKey(order.contact_phone)
  if (!/^[6-9]\d{9}$/.test(phone)) return null
  const { rows: [had] } = await db.query(
    'select r.*, c.code from referrers r join discount_codes c on c.id = r.code_id where r.phone = $1', [phone])
  if (had) return had
  const base = baseFor(order.contact_name)
  for (let i = 0; i < 8; i++) {
    const code = base + crypto.randomInt(i < 4 ? 10 : 100, i < 4 ? 100 : 1000)
    const { rows: [c] } = await db.query(
      `insert into discount_codes (code, kind, amount_paise, first_order_only, uses_per_phone, owner_phone, source, note)
       values ($1, 'amount', $2, true, 1, $3, 'referral', $4) on conflict (code) do nothing returning *`,
      [code, s.friend * 100, phone, 'Referral: ' + str(order.contact_name).slice(0, 60)])
    if (!c) continue
    const { rows: [r] } = await db.query(
      `insert into referrers (phone, email, name, code_id) values ($1, $2, $3, $4)
       on conflict (phone) do nothing returning *`,
      [phone, str(order.contact_email).toLowerCase(), str(order.contact_name).slice(0, 120) || 'Customer', c.id])
    if (r) return { ...r, code: c.code }
    // Made a moment ago by another request: keep that one.
    await db.query('delete from discount_codes where id = $1', [c.id])
    const { rows: [again] } = await db.query(
      'select r.*, c.code from referrers r join discount_codes c on c.id = r.code_id where r.phone = $1', [phone])
    return again || null
  }
  return null
}

/**
 * /refer: the customer's code and rewards, by the mobile number on a paid order. The mobile number is
 * enough: the code is meant to be shared (friends may even type the mobile number at checkout), rewards
 * are used only at the customer's own checkout (their mobile number and email), and reward codes are
 * never shown here. The route is rate limited.
 */
export async function myReferral(db, body = {}) {
  const settings = await getSettings(db)
  const s = referralSettings(settings)
  if (!s.enabled) throw httpError('Referrals off', { status: 404, publicMessage: 'Refer a friend is not running right now.' })
  const phone = phoneKey(body.phone)
  if (!/^[6-9]\d{9}$/.test(phone)) throw httpError('Bad phone', { publicMessage: 'Please enter your 10-digit mobile number.' })

  const { rows: [order] } = await db.query(
    `select * from orders where right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1
        and payment_status in ('paid', 'partially_refunded') order by placed_at desc limit 1`, [phone])
  const { rows: [known] } = await db.query('select * from referrers where phone = $1', [phone])
  if (!order && !known) {
    throw httpError('No order', {
      status: 404, publicMessage: 'We could not find a paid order with that mobile number. Your code comes with your first order.',
    })
  }
  const ref = await ensureReferrer(db, order || { contact_phone: phone, contact_email: known.email, contact_name: known.name }, settings)
  const { rows: [{ friends }] } = await db.query(
    `select count(*)::int as friends from orders where referrer_id = $1 and payment_status in ('paid', 'partially_refunded')`, [ref.id])
  const { rows: rewards } = await db.query(
    `select rr.status, rr.created_at, c.code, c.amount_paise, c.expires_at, c.is_active,
            exists (select 1 from orders o where o.discount_code_id = c.id and o.payment_status in ('paid', 'partially_refunded')) as used
       from referral_rewards rr left join discount_codes c on c.id = rr.code_id
      where rr.referrer_id = $1 and rr.status = 'issued' order by rr.created_at desc limit 50`, [ref.id])
  const list = rewards.map((r) => ({
    amount: toRupees(r.amount_paise), earnedAt: r.created_at, expiresAt: r.expires_at,
    state: r.used ? 'used' : !r.is_active ? 'cancelled' : r.expires_at && new Date(r.expires_at) < new Date() ? 'expired' : 'available',
  }))
  const sum = (state) => list.filter((r) => !state || r.state === state).reduce((t, r) => t + r.amount, 0)
  return {
    name: ref.name.split(/\s+/)[0].replace(/^\p{Ll}/u, (ch) => ch.toUpperCase()), code: ref.code, friendGets: s.friend, youGet: s.reward,
    share: shareText(ref.code, s.friend), friends,
    rewards: list, earned: sum(), used: sum('used'), available: sum('available'),
  }
}

/**
 * A friend's order was delivered: the referrer's reward (inside the delivery's transaction). Once per
 * order; past the monthly limit it is recorded as over_limit and nothing is given.
 */
export async function releaseReferralReward(db, order) {
  if (!order?.referrer_id) return null
  const settings = await getSettings(db)
  const s = referralSettings(settings)
  if (!s.enabled) return null
  const { rows: [done] } = await db.query('select 1 from referral_rewards where friend_order_id = $1', [order.id])
  if (done) return null
  const { rows: [ref] } = await db.query('select * from referrers where id = $1', [order.referrer_id])
  if (!ref) return null
  const { rows: [{ n }] } = await db.query(
    `select count(*)::int as n from referral_rewards where referrer_id = $1 and status = 'issued'
        and date_trunc('month', created_at at time zone 'Asia/Kolkata') = date_trunc('month', now() at time zone 'Asia/Kolkata')`, [ref.id])
  if (n >= s.cap) {
    await db.query(`insert into referral_rewards (referrer_id, friend_order_id, status) values ($1, $2, 'over_limit')`, [ref.id, order.id])
    return null
  }
  let code
  for (let i = 0; i < 5 && !code; i++) {
    const candidate = 'REF' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
    const { rows: [c] } = await db.query(
      `insert into discount_codes (code, kind, amount_paise, locked_phone, locked_email, max_uses, uses_per_phone, expires_at, source, note)
       values ($1, 'amount', $2, $3, $4, 1, 1, now() + make_interval(days => $5), 'reward', $6)
       on conflict (code) do nothing returning *`,
      [candidate, s.reward * 100, ref.phone, ref.email, s.days, `Reward: ${ref.name} referred order ${order.order_number}`])
    code = c
  }
  if (!code) return null
  await db.query(`insert into referral_rewards (referrer_id, friend_order_id, code_id, status) values ($1, $2, $3, 'issued')`,
    [ref.id, order.id, code.id])
  const amount = formatInr(code.amount_paise).replace('.00', '')
  const till = new Date(code.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  await queueEmail(db, {
    to: ref.email,
    template: 'referral_reward',
    subject: `Your friend's order has arrived. ${amount} off is waiting for you`,
    text:
      `Dear ${ref.name},\n\nYour friend ${str(order.contact_name).split(/\s+/)[0] || ''} ordered Chennai Rice with your referral code, and their order has been delivered. ` +
      `Thank you for sharing!\n\nYou get ${amount} off your next order. It is applied automatically at checkout when you use ` +
      `this mobile number and email (code ${code.code}, valid till ${till}).\n\nShop: ${SITE}/rice-products\n` +
      `Your rewards: ${SITE}/refer\n\nChennai Rice Industries\n+91 70666 46667`,
    dedupeKey: 'referral-reward:' + order.id,
  })
  return code
}

// ---- Warehouse → Settings → Refer a friend (owners and IT) ----

export async function referralAdmin(db, staff) {
  requirePermission(staff, 'settings.manage')
  const s = referralSettings(await getSettings(db))
  const { rows: top } = await db.query(
    `select r.id, r.name, r.phone, c.code, r.created_at,
            (select count(*) from orders o where o.referrer_id = r.id and o.payment_status in ('paid', 'partially_refunded'))::int as friends,
            (select coalesce(sum(o.total_paise), 0) from orders o where o.referrer_id = r.id and o.payment_status in ('paid', 'partially_refunded'))::bigint as sales,
            (select count(*) from referral_rewards rr where rr.referrer_id = r.id and rr.status = 'issued')::int as rewards
       from referrers r join discount_codes c on c.id = r.code_id
      order by friends desc, r.created_at desc limit 100`)
  const { rows: [t] } = await db.query(
    `select (select count(*) from referrers)::int as referrers,
            (select count(*) from orders where referrer_id is not null and payment_status in ('paid', 'partially_refunded'))::int as friend_orders,
            (select coalesce(sum(discount_paise), 0) from orders where referrer_id is not null and payment_status in ('paid', 'partially_refunded'))::bigint as friend_off,
            (select coalesce(sum(total_paise), 0) from orders where referrer_id is not null and payment_status in ('paid', 'partially_refunded'))::bigint as sales,
            (select count(*) from referral_rewards where status = 'issued')::int as rewards,
            (select coalesce(sum(o.discount_paise), 0) from orders o join discount_codes c on c.id = o.discount_code_id
              where c.source = 'reward' and o.payment_status in ('paid', 'partially_refunded'))::bigint as rewards_used`)
  const { rows: recent } = await db.query(
    `select rr.id, rr.status, rr.created_at, r.name as referrer, o.order_number, o.contact_name as friend, c.code, c.is_active, c.amount_paise
       from referral_rewards rr join referrers r on r.id = rr.referrer_id join orders o on o.id = rr.friend_order_id
       left join discount_codes c on c.id = rr.code_id order by rr.created_at desc limit 50`)
  return {
    settings: s,
    totals: {
      referrers: t.referrers, friendOrders: t.friend_orders, friendOff: toRupees(t.friend_off), sales: toRupees(t.sales),
      rewards: t.rewards, rewardsUsed: toRupees(t.rewards_used),
    },
    top: top.map((r) => ({ id: r.id, name: r.name, phone: r.phone, code: r.code, friends: r.friends, sales: toRupees(r.sales), rewards: r.rewards })),
    recent: recent.map((r) => ({
      id: r.id, status: r.status === 'issued' && !r.is_active ? 'cancelled' : r.status, at: r.created_at, referrer: r.referrer,
      friend: r.friend, orderNumber: r.order_number, code: r.code, amount: r.amount_paise == null ? null : toRupees(r.amount_paise),
    })),
  }
}

export async function saveReferralSettings(db, staff, body = {}) {
  requirePermission(staff, 'settings.manage')
  const changes = {}
  if (body.enabled != null) changes.referral_enabled = body.enabled ? 'true' : 'false'
  const whole = (v, label, min, max) => {
    const n = Number(v)
    if (!(Number.isInteger(n) && n >= min && n <= max)) throw httpError(`${label} must be a whole number from ${min} to ${max}.`)
    return String(n)
  }
  if (body.friend != null) changes.referral_friend_inr = whole(body.friend, "The friend's discount (₹)", 1, 2000)
  if (body.reward != null) changes.referral_reward_inr = whole(body.reward, 'The reward (₹)', 1, 2000)
  if (body.cap != null) changes.referral_monthly_cap = whole(body.cap, 'Rewards a month', 1, 100)
  if (body.days != null) changes.referral_reward_days = whole(body.days, 'Days a reward lasts', 1, 365)
  for (const [key, value] of Object.entries(changes)) {
    await db.query(
      `insert into company_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value])
  }
  // Every customer's code gives the new friend's discount from now on.
  if (changes.referral_friend_inr) {
    await db.query(`update discount_codes set amount_paise = $1 where source = 'referral'`, [Number(changes.referral_friend_inr) * 100])
  }
  await audit(db, staff, 'referral.settings', 'company_settings', null, changes).catch(() => {})
  return referralAdmin(db, staff)
}

/** Take back a reward (a suspicious referral): its code stops working. */
export async function cancelReferralReward(db, staff, id) {
  requirePermission(staff, 'settings.manage')
  if (!/^[0-9a-f-]{36}$/i.test(str(id))) throw httpError('No such reward.', { status: 404 })
  const { rows: [r] } = await db.query(`update referral_rewards set status = 'cancelled' where id = $1 and status = 'issued' returning *`, [id])
  if (!r) throw httpError('That reward is not active.', { status: 409 })
  if (r.code_id) await db.query('update discount_codes set is_active = false where id = $1', [r.code_id])
  await audit(db, staff, 'referral.reward.cancel', 'referral_reward', id, null).catch(() => {})
  return referralAdmin(db, staff)
}
