// Abandoned cart reminder emails (Nov 2026, migration 048).
//
// A checkout journey that reached the details step (so we have the shopper's email) and was not paid:
//   email 1  an hour after their last step:   "Your Chennai Rice order is waiting" + Complete my order
//   email 2  a day after email 1, still unpaid: the last reminder, with a free-delivery code for their mobile
// The button opens /checkout?resume=<token>: the cart and the form come back filled in (and email 2's code).
// Rules: on only when switched on (/offers → Cart reminders); between 9 am and 9 pm India time; at most two per
// cart and one new cart a week per email; never after they paid (by mobile or email); never to the company's own
// numbers; never to anyone who unsubscribed (link in every email). Run by the 10-minute job. Never throws.
import crypto from 'node:crypto'
import { query as defaultQuery } from '../db.js'
import { isBlockedMobile } from '../crm.js'
import { queueEmail, templates, orderItemsForEmail } from './email.js'
import { renderTemplate } from './email-template.js'
import { formatInr, getSettings, httpError, str } from './util.js'
import { requirePermission } from './staff.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://chennairiceindustries.com'
const SUPPORT_PHONE = '+91 70666 46667'
const WHATSAPP_URL = 'https://wa.me/917066646667'
const PAID = ['paid', 'partially_refunded']
const STAGES = ['details', 'payment', 'cancelled']
const FIRST_AFTER_MIN = 60
const SECOND_AFTER_HOURS = 24
const CODE_HOURS = 48
const LINK_DAYS = 7
const EMAIL_RE = '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'

export const OFFERS = { free_delivery: 'Free delivery', amount50: '₹50 off', none: 'No offer' }
export const remindersOn = (s) => str(s.cart_reminders_enabled).toLowerCase() === 'true'
export const reminderOffer = (s) => (OFFERS[s.cart_reminder_offer] ? s.cart_reminder_offer : 'free_delivery')

const last10 = (p) => str(p).replace(/\D/g, '').slice(-10)
const firstName = (n) => str(n).split(/\s+/)[0] || 'there'
const istHour = (now) => new Date(now + 330 * 60000).getUTCHours()
/** 9 am – 9 pm India time: reminders wait outside these hours. */
export const sendingHours = (now = Date.now()) => istHour(now) >= 9 && istHour(now) < 21
const newToken = () => crypto.randomBytes(18).toString('base64url')
const rupeesToPaise = (r) => Math.round(Number(r) * 100) || 0

/** Cart lines from a journey, with each pack's photo: [{ id, name, qty, price (₹), packKg, image }]. */
async function cartLines(db, items) {
  const list = (Array.isArray(items) ? items : []).filter((i) => i && i.id && Number(i.qty) > 0)
  const slugs = [...new Set(list.map((i) => str(i.id).replace(/-\d+(\.\d+)?kg$/, '')))]
  const { rows } = slugs.length ? await db.query('select slug, image_url from products where slug = any($1)', [slugs]) : { rows: [] }
  const img = Object.fromEntries(rows.map((r) => [r.slug, r.image_url]))
  return list.map((i) => {
    const kg = /-(\d+(?:\.\d+)?)kg$/.exec(str(i.id))?.[1]
    const slug = str(i.id).replace(/-\d+(\.\d+)?kg$/, '')
    return { id: str(i.id), name: str(i.name) || slug, qty: Number(i.qty), price: Number(i.price) || 0, packKg: kg ? Number(kg) : null, image: img[slug] || null }
  })
}
const absolute = (u) => (!u ? `${SITE}/assets/shop/logo.png` : /^https?:/.test(u) ? u : SITE + (u.startsWith('/') ? '' : '/') + u)

/** The email for one reminder (step 1 or 2). code: { code, label, until } for step 2's offer. */
export function reminderEmail({ step, name, lines, token, code = null }) {
  const subtotal = lines.reduce((t, l) => t + rupeesToPaise(l.price) * l.qty, 0)
  const resumeUrl = `${SITE}/checkout?resume=${encodeURIComponent(token)}`
  const unsubscribeUrl = `${SITE}/api/cart/unsubscribe?t=${encodeURIComponent(token)}`
  const hi = firstName(name)
  const subject = step === 1
    ? `${hi}, your Chennai Rice order is waiting`
    : code ? `Still thinking, ${hi}? Here's ${code.label.toLowerCase()} on your order` : `${hi}, your cart is still saved`
  const preview = step === 1
    ? 'Your rice is still in your cart. Finish your order in one tap.'
    : code ? `Your cart is saved. Use code ${code.code} before ${code.until}.` : 'Your cart is saved. Finish your order in one tap.'
  const itemsText = lines.map((l) => `  ${l.name} x ${l.qty}  ${formatInr(rupeesToPaise(l.price) * l.qty)}`).join('\n')
  const text =
    `${step === 1 ? 'Vanakkam' : 'Hi'} ${hi},\n\n` +
    (step === 1
      ? 'You were almost there! Your order is saved and ready. Just complete the payment and we will start packing.\n\n'
      : 'Your Chennai Rice cart is still saved for you.' + (code ? ` To make it easier: ${code.label.toUpperCase()} on this order with code ${code.code}, valid until ${code.until} (already added at checkout).` : '') + '\n\n') +
    `Your cart:\n${itemsText}\n  Subtotal  ${formatInr(subtotal)}\n\n` +
    `Complete your order: ${resumeUrl}\n\n` +
    (step === 2 ? 'This is the last reminder we will send about this cart.\n\n' : '') +
    `Had trouble paying? Reply to this email, or WhatsApp us at ${SUPPORT_PHONE} (${WHATSAPP_URL}).\n\nTeam Chennai Rice\n\n` +
    `You are receiving this because you started an order at chennairiceindustries.com. Unsubscribe from reminders: ${unsubscribeUrl}`
  const html = renderTemplate('cart-reminder.html', {
    'Subject': subject,
    'Preview': preview,
    'Badge': step === 1 ? 'Saved for you' : 'A final reminder',
    'Heading': step === 1 ? 'You were almost there.' : 'Your rice is still waiting.',
    'Greeting': `Vanakkam ${hi},`,
    'Intro': step === 1
      ? 'You left some deliciousness behind! Complete your order now and enjoy the goodness of Chennai Rice.'
      : 'Your Chennai Rice is still waiting for you.' + (code ? ' As a small thank you, delivery on this order is on us.' : ' Complete your order whenever you’re ready.'),
    'Offer Label': code ? `${code.label} on this order` : '',
    'Offer Code': code ? code.code : '',
    'Offer Until': code ? code.until : '',
    'Subtotal': formatInr(subtotal),
    'Button': 'Complete my order',
    'Resume URL': resumeUrl,
    'Last Note': step === 2 ? 'This is the last reminder we’ll send about this cart.' : '',
    'Support Number': SUPPORT_PHONE,
    'WhatsApp URL': WHATSAPP_URL,
    'Unsubscribe URL': unsubscribeUrl,
  }, lines.map((l) => ({
    'Product Name': l.name,
    'Quantity': l.qty,
    'Price': formatInr(rupeesToPaise(l.price) * l.qty),
    'Product Image': absolute(l.image),
  })))
  return { subject, text, html }
}

/** Email 2's code: single use, for this mobile, CODE_HOURS long. */
async function offerCode(db, offer, phone, now) {
  if (offer === 'none' || !/^\d{10}$/.test(phone)) return null
  const code = 'CART' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
  const expires = new Date(now + CODE_HOURS * 3600 * 1000)
  const { rows: [c] } = await db.query(
    `insert into discount_codes (code, kind, amount_paise, locked_phone, max_uses, uses_per_phone, expires_at, source, note)
     values ($1, $2, $3, $4, 1, 1, $5, 'cart', 'Cart reminder email 2') returning id, code`,
    [code, offer === 'amount50' ? 'amount' : 'free_delivery', offer === 'amount50' ? 5000 : 0, phone, expires])
  const until = expires.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
  return { id: c.id, code: c.code, label: OFFERS[offer], until }
}

// A journey still unpaid: no paid order on its mobile or email since it started.
const UNPAID = `not exists (
  select 1 from orders o where o.payment_status = any($1) and o.created_at >= j.started_at - interval '10 minutes'
     and (right(regexp_replace(o.contact_phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(coalesce(j.contact_phone, ''), '[^0-9]', '', 'g'), 10)
          or lower(o.contact_email) = lower(j.contact_email)))`

/** Queue the reminders that are due. Returns { sent1, sent2 } (or { off } / { waiting }). Never throws. */
export async function sendCartReminders(db = { query: defaultQuery }, { now = Date.now(), force = false } = {}) {
  try {
    const settings = await getSettings(db)
    if (!remindersOn(settings) && !force) return { off: true }
    if (!sendingHours(now) && !force) return { waiting: true }
    const at = new Date(now)
    let sent1 = 0
    let sent2 = 0

    // Email 1: stopped at least an hour ago (and within two days), never reminded.
    const { rows: first } = await db.query(
      `select j.* from checkout_journeys j
        where j.stage = any($2) and j.contact_email ~* '${EMAIL_RE}' and jsonb_array_length(j.items) > 0
          and j.updated_at <= $3::timestamptz - make_interval(mins => ${FIRST_AFTER_MIN})
          and j.updated_at >= $3::timestamptz - interval '48 hours'
          and not exists (select 1 from cart_reminders r where r.journey_id = j.id)
          and not exists (select 1 from cart_reminders r where lower(r.email) = lower(j.contact_email) and r.sent_at > $3::timestamptz - interval '7 days')
          and not exists (select 1 from email_optouts x where x.email = lower(j.contact_email))
          and ${UNPAID}
        order by j.updated_at limit 25`, [PAID, STAGES, at])
    const emailed = new Set()
    for (const j of first) {
      const email = str(j.contact_email).toLowerCase()
      if (emailed.has(email) || isBlockedMobile(j.contact_phone)) continue
      emailed.add(email)
      const lines = await cartLines(db, j.items)
      if (!lines.length) continue
      const token = newToken()
      const { rows: [r] } = await db.query(
        `insert into cart_reminders (journey_id, step, email, phone, token, value_paise, sent_at) values ($1, 1, $2, $3, $4, $5, $6)
         on conflict (journey_id, step) do nothing returning id`,
        [j.id, email, last10(j.contact_phone) || null, token, j.value_paise, at])
      if (!r) continue
      const mail = reminderEmail({ step: 1, name: j.contact_name, lines, token })
      await queueEmail(db, { to: email, ...mail, template: 'cart_reminder_1', dedupeKey: `cart-reminder:${j.id}:1` })
      sent1 += 1
    }

    // Email 2: a day after email 1 (and within three), still unpaid, not unsubscribed.
    const { rows: second } = await db.query(
      `select j.*, r.email as r_email from cart_reminders r join checkout_journeys j on j.id = r.journey_id
        where r.step = 1 and r.sent_at <= $2::timestamptz - make_interval(hours => ${SECOND_AFTER_HOURS})
          and r.sent_at >= $2::timestamptz - interval '72 hours'
          and not exists (select 1 from cart_reminders r2 where r2.journey_id = r.journey_id and r2.step = 2)
          and not exists (select 1 from email_optouts x where x.email = lower(r.email))
          and ${UNPAID}
        order by r.sent_at limit 25`, [PAID, at])
    const offer = reminderOffer(settings)
    for (const j of second) {
      const lines = await cartLines(db, j.items)
      if (!lines.length) continue
      const token = newToken()
      const { rows: [r] } = await db.query(
        `insert into cart_reminders (journey_id, step, email, phone, token, value_paise, sent_at) values ($1, 2, $2, $3, $4, $5, $6)
         on conflict (journey_id, step) do nothing returning id`,
        [j.id, j.r_email, last10(j.contact_phone) || null, token, j.value_paise, at])
      if (!r) continue
      const code = await offerCode(db, offer, last10(j.contact_phone), now)
      if (code) await db.query('update cart_reminders set discount_code_id = $2 where id = $1', [r.id, code.id])
      const mail = reminderEmail({ step: 2, name: j.contact_name, lines, token, code })
      await queueEmail(db, { to: j.r_email, ...mail, template: 'cart_reminder_2', dedupeKey: `cart-reminder:${j.id}:2` })
      sent2 += 1
    }
    return { sent1, sent2 }
  } catch (err) {
    console.error('[cart-reminders]', err.message)
    return { error: err.message }
  }
}

/** The "Complete my order" link: the cart, the form and email 2's code. Counts the click. */
// ---------------------------------------------------------------- payment failed

const retryKey = () => process.env.REVIEW_SECRET || process.env.DB_PASSWORD || process.env.BLOG_JWT_SECRET || 'chennairice-local-review-key'
const retrySig = (orderNumber) => crypto.createHmac('sha256', retryKey()).update('retry:' + str(orderNumber)).digest('base64url').slice(0, 20)
/** "Retry Payment": checkout opens with this order's packs and details filled in. */
export const retryUrl = (order) => `${SITE}/checkout?resume=${encodeURIComponent('r.' + order.order_number + '.' + retrySig(order.order_number))}`

/** The "Payment didn't go through" email: 15 minutes after a failed payment (so a quick retry that works is not
 *  followed by it), once per order, never if they have paid since (by mobile or email). Never throws. */
export async function sendPaymentFailedEmails(db = { query: defaultQuery }, { now = Date.now() } = {}) {
  try {
    const at = new Date(now)
    const { rows } = await db.query(
      `select o.* from orders o
        where o.payment_status = 'failed' and o.contact_email ~* '${EMAIL_RE}'
          and o.created_at >= $2::timestamptz - interval '48 hours' and o.updated_at <= $2::timestamptz - interval '15 minutes'
          and not exists (select 1 from email_outbox e where e.dedupe_key = 'payfail:' || o.id)
          and not exists (select 1 from email_optouts x where x.email = lower(o.contact_email))
          and not exists (select 1 from orders p where p.payment_status = any($1) and p.created_at >= o.created_at
                and (right(regexp_replace(p.contact_phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(o.contact_phone, '[^0-9]', '', 'g'), 10)
                     or lower(p.contact_email) = lower(o.contact_email)))
        order by o.created_at limit 25`, [PAID, at])
    let sent = 0
    for (const o of rows) {
      if (isBlockedMobile(o.contact_phone)) continue
      const items = await orderItemsForEmail(db, o.id)
      if (!items.length) continue
      await queueEmail(db, { to: o.contact_email, ...templates.paymentFailed(o, items, { retryUrl: retryUrl(o) }), orderId: o.id, dedupeKey: 'payfail:' + o.id })
      sent += 1
    }
    return { sent }
  } catch (err) {
    console.error('[payment-failed]', err.message)
    return { error: err.message }
  }
}

/** The Retry Payment link (r.<order number>.<signature>): that order's packs and details. */
async function resumeRetry(db, t) {
  const [, number, sig] = /^r.([A-Z0-9-]{6,40}).([A-Za-z0-9_-]{20})$/.exec(t) || []
  if (!number || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(retrySig(number)))) {
    throw httpError('Bad link', { status: 404, publicMessage: 'This link is not valid.' })
  }
  const { rows: [o] } = await db.query('select * from orders where order_number = $1', [number])
  if (!o || new Date(o.created_at).getTime() < Date.now() - LINK_DAYS * 86400000) {
    throw httpError('Expired link', { status: 404, publicMessage: 'This link has expired. Your cart may still be on this device.' })
  }
  const { rows: lines } = await db.query(
    `select p.slug, i.product_name, i.pack_kg, i.quantity, i.unit_price_paise, p.image_url from order_items i
       left join product_variants v on v.id = i.variant_id left join products p on p.id = v.product_id where i.order_id = $1`, [o.id])
  const a = o.shipping_address || {}
  return {
    items: lines.filter((l) => l.slug).map((l) => ({
      id: `${l.slug}-${Number(l.pack_kg)}kg`, name: `${l.product_name} (${Number(l.pack_kg)} kg)`, qty: l.quantity,
      price: Number(l.unit_price_paise) / 100, packKg: Number(l.pack_kg), image: l.image_url,
    })),
    contact: {
      name: o.contact_name || '', phone: o.contact_phone || '', email: o.contact_email || '',
      addressLine1: a.line1 || '', addressLine2: a.line2 || '', city: a.city || '', state: a.state || '', pincode: a.pincode || '',
    },
    code: null,
  }
}

export async function resumeCart(db, token) {
  const t = str(token)
  if (t.startsWith('r.')) return resumeRetry(db, t)
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(t)) throw httpError('Bad link', { status: 404, publicMessage: 'This link is not valid.' })
  const { rows: [r] } = await db.query(
    `select r.id, r.sent_at, r.clicked_at, j.items, j.contact_name, j.contact_phone, j.contact_email, j.city, j.state, j.pincode,
            j.id as journey_id, c.code, c.expires_at, c.is_active
       from cart_reminders r join checkout_journeys j on j.id = r.journey_id
       left join discount_codes c on c.id = r.discount_code_id
      where r.token = $1`, [t])
  if (!r || new Date(r.sent_at).getTime() < Date.now() - LINK_DAYS * 86400000) {
    throw httpError('Expired link', { status: 404, publicMessage: 'This link has expired. Your cart may still be on this device.' })
  }
  if (!r.clicked_at) await db.query('update cart_reminders set clicked_at = now() where id = $1', [r.id])
  // The shipping address typed at checkout, if the order got that far.
  const { rows: [o] } = await db.query(
    `select shipping_address from orders where contact_phone is not null
        and right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10) = $1 order by created_at desc limit 1`, [last10(r.contact_phone)])
  const addr = o?.shipping_address || {}
  const lines = await cartLines(db, r.items)
  return {
    journeyId: r.journey_id,
    items: lines,
    contact: {
      name: r.contact_name || '', phone: r.contact_phone || '', email: r.contact_email || '',
      addressLine1: addr.line1 || addr.addressLine1 || '', addressLine2: addr.line2 || addr.addressLine2 || '',
      city: r.city || addr.city || '', state: r.state || addr.state || '', pincode: r.pincode || addr.pincode || '',
    },
    code: r.code && r.is_active && (!r.expires_at || new Date(r.expires_at) > new Date()) ? r.code : null,
  }
}

/** The unsubscribe link: no more reminders to this email, for good. */
export async function unsubscribeCart(db, token) {
  const { rows: [r] } = await db.query('select email from cart_reminders where token = $1', [str(token)])
  if (r) await db.query('insert into email_optouts (email) values (lower($1)) on conflict do nothing', [r.email])
  return Boolean(r)
}

/** /offers → Cart reminders: the switch, the offer, and how it is doing. */
export async function cartRemindersAdmin(db, staff, { days = 30 } = {}) {
  requirePermission(staff, 'settings.manage')
  const span = Math.min(Math.max(Number(days) || 30, 1), 365)
  const settings = await getSettings(db)
  const { rows: [s] } = await db.query(
    `with r as (select * from cart_reminders where sent_at > now() - make_interval(days => $2)),
     rec as (
       select distinct on (o.id) o.id, o.total_paise, r.step, o.discount_code_id
         from r join checkout_journeys j on j.id = r.journey_id
         join orders o on o.payment_status = any($1) and o.created_at > r.sent_at and o.created_at < r.sent_at + interval '7 days'
          and (right(regexp_replace(o.contact_phone, '[^0-9]', '', 'g'), 10) = coalesce(r.phone, '-') or lower(o.contact_email) = lower(r.email))
        order by o.id, r.sent_at)
     select (select count(*) from r where step = 1)::int as sent1, (select count(*) from r where step = 2)::int as sent2,
            (select count(*) from r where clicked_at is not null)::int as clicked,
            (select count(distinct journey_id) from r)::int as carts,
            (select count(*) from rec)::int as recovered, (select coalesce(sum(total_paise), 0) from rec)::bigint as revenue,
            (select count(*) from rec where discount_code_id in (select discount_code_id from r where discount_code_id is not null))::int as with_code,
            (select count(*) from email_optouts)::int as unsubscribed`, [PAID, span])
  const { rows: recent } = await db.query(
    `select r.step, r.sent_at, r.clicked_at, r.email, j.contact_name, r.value_paise, c.code,
            (select o.order_number from orders o where o.payment_status = any($1) and o.created_at > r.sent_at and o.created_at < r.sent_at + interval '7 days'
                and (right(regexp_replace(o.contact_phone, '[^0-9]', '', 'g'), 10) = coalesce(r.phone, '-') or lower(o.contact_email) = lower(r.email))
              order by o.created_at limit 1) as order_number
       from cart_reminders r join checkout_journeys j on j.id = r.journey_id left join discount_codes c on c.id = r.discount_code_id
      order by r.sent_at desc limit 100`, [PAID])
  return {
    enabled: remindersOn(settings),
    offer: reminderOffer(settings),
    offers: OFFERS,
    days: span,
    stats: { ...s, revenue: Number(s.revenue), rate: s.carts ? Math.round((s.recovered / s.carts) * 1000) / 10 : 0 },
    recent: recent.map((x) => ({
      step: x.step, sentAt: x.sent_at, clickedAt: x.clicked_at, email: x.email, name: x.contact_name,
      value: x.value_paise == null ? null : Number(x.value_paise), code: x.code, orderNumber: x.order_number,
    })),
  }
}

export async function saveCartReminderSettings(db, staff, body = {}) {
  requirePermission(staff, 'settings.manage')
  const changes = {}
  if (body.enabled != null) changes.cart_reminders_enabled = body.enabled ? 'true' : 'false'
  if (body.offer != null) {
    if (!OFFERS[body.offer]) throw httpError('Offer must be free delivery, ₹50 off or none.')
    changes.cart_reminder_offer = body.offer
  }
  for (const [key, value] of Object.entries(changes)) {
    await db.query(
      `insert into company_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, value])
  }
  return cartRemindersAdmin(db, staff)
}
