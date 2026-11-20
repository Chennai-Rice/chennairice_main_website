// Meta Conversions API: the Purchase sent from the server once a payment is
// confirmed (browser verification or the Razorpay webhook), so a sale still
// reaches Meta when the browser Pixel is blocked or the buyer closes the tab.
//
// The browser Pixel sends the same Purchase from /order-confirmed with the
// event ID "purchase-<order number>"; this one carries the same ID, so Meta
// keeps one of the two (deduplication).
//
// What the browser passed at checkout (Meta's _fbp/_fbc cookies, the page, the
// cookie choice) and the buyer's IP and browser are kept with the order in
// orders.attribution.meta. Nothing is sent when the buyer rejected marketing
// cookies, as with the Pixel.
//
// Settings: META_CAPI_TOKEN (secret, Events Manager → Settings → Conversions
// API → Generate access token); META_PIXEL_ID (default the "Chennai Rice –
// Purchase Tracking" dataset); META_TEST_EVENT_CODE while testing in Events
// Manager → Test events. With no token nothing is sent.
import { createHash } from 'node:crypto'
import { query } from '../db.js'
import { str } from './util.js'

const PIXEL_ID = () => process.env.META_PIXEL_ID || '1172960135165184'
const GRAPH_VERSION = () => process.env.META_GRAPH_VERSION || 'v23.0'
const SITE = 'https://chennairiceindustries.com'

const clip = (v, n) => str(v).slice(0, n)
const sha256 = (v) => (v ? createHash('sha256').update(v).digest('hex') : undefined)
// Meta's normalising: lower case, and for names and places no spaces or punctuation.
const norm = (v) => str(v).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')

/** The browser's Meta details for the order, checked and trimmed. */
export function cleanMetaSignal(raw, { ip, userAgent } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const fbp = clip(r.fbp, 120)
  const fbc = clip(r.fbc, 500)
  const url = clip(r.url, 300)
  const m = {
    fbp: /^fb\.\d\.\d+\.\d+$/.test(fbp) ? fbp : undefined,
    fbc: /^fb\.\d\.\d+\.\S+$/.test(fbc) ? fbc : undefined,
    url: url.startsWith(SITE + '/') ? url : undefined,
    consent: ['granted', 'denied'].includes(r.consent) ? r.consent : 'unset',
    ip: clip(ip, 60) || undefined,
    ua: clip(userAgent, 400) || undefined,
  }
  for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k]
  return m
}

/** Indian mobile numbers with the country code, digits only. */
function phoneDigits(phone) {
  const d = str(phone).replace(/\D/g, '').replace(/^0+/, '')
  return d.length === 10 ? '91' + d : d
}

/** The Conversions API event for a paid order. */
export function purchaseEvent(order, items) {
  const meta = order.attribution?.meta || {}
  const addr = order.shipping_address || {}
  const [first, ...rest] = str(order.contact_name).split(/\s+/)
  const paidAt = new Date(order.placed_at || Date.now())
  const contents = items.map((i) => ({
    id: `${i.slug}-${Number(i.pack_kg)}kg`, // the cart's item ID, as the Pixel sends it
    quantity: Number(i.quantity),
    item_price: Number(i.unit_price_paise) / 100,
  }))
  const userData = {
    em: str(order.contact_email) ? [sha256(str(order.contact_email).toLowerCase())] : undefined,
    ph: [sha256(phoneDigits(order.contact_phone))],
    fn: [sha256(norm(first))],
    ln: rest.length ? [sha256(norm(rest.join(' ')))] : undefined,
    ct: [sha256(norm(addr.city))],
    st: [sha256(norm(addr.state))],
    zp: [sha256(str(addr.pincode))],
    country: [sha256('in')],
    external_id: [sha256(String(order.customer_id))],
    client_ip_address: meta.ip,
    client_user_agent: meta.ua,
    fbp: meta.fbp,
    fbc: meta.fbc,
  }
  for (const k of Object.keys(userData)) {
    if (userData[k] === undefined || (Array.isArray(userData[k]) && !userData[k][0])) delete userData[k]
  }
  return {
    event_name: 'Purchase',
    event_time: Math.floor(paidAt.getTime() / 1000),
    event_id: 'purchase-' + order.order_number,
    action_source: 'website',
    event_source_url: meta.url || SITE + '/order-confirmed',
    user_data: userData,
    custom_data: {
      currency: 'INR',
      value: Number(order.total_paise) / 100,
      order_id: order.order_number,
      content_type: 'product',
      content_ids: contents.map((c) => c.id),
      contents,
      num_items: contents.reduce((n, c) => n + c.quantity, 0),
    },
  }
}

/**
 * Send the Purchase for one paid order, once. Returns what happened; never
 * throws, so a Meta outage cannot touch a payment.
 */
export async function sendPurchaseToMeta(orderId) {
  const token = process.env.META_CAPI_TOKEN
  if (!token) return { skipped: 'no token' }
  try {
    const { rows: [paid] } = await query(
      `select * from orders where id = $1 and payment_status in ('paid', 'partially_refunded')`, [orderId])
    if (!paid) return { skipped: 'not paid' }
    // An order without the browser's details (the Pixel was blocked, or the buyer never answered the cookie
    // notice) is still sent, matched on phone and email: it used to be skipped and never reached Meta (17 Nov 2026).
    if (paid.attribution?.meta?.sentAt) return { skipped: 'already sent' }
    if (paid.attribution?.meta?.consent === 'denied') return { skipped: 'marketing cookies rejected' }
    // ₹1 test orders are not sales.
    if (Number(paid.total_paise) <= 100) return { skipped: 'test order' }
    // Meta takes events up to 7 days old.
    if (Date.now() - new Date(paid.placed_at).getTime() > 7 * 864e5) return { skipped: 'too old' }
    // Claim it first, so the send at payment and the 10-minute job never both send it (they did: 2 to 4
    // server Purchases per order, Nov 2026). A claim older than 30 minutes (a send that died half way) is free again.
    const { rows: [order] } = await query(
      `update orders set attribution = jsonb_set(coalesce(attribution, '{}'::jsonb), '{meta}',
                                                 coalesce(attribution->'meta', '{}'::jsonb) || jsonb_build_object('sendingAt', now()))
        where id = $1 and not coalesce(attribution->'meta' ? 'sentAt', false)
          and coalesce((attribution->'meta'->>'sendingAt')::timestamptz < now() - interval '30 minutes', true)
        returning *`, [orderId])
    if (!order) return { skipped: 'being sent' }

    const { rows: items } = await query(
      `select i.quantity, i.unit_price_paise, i.pack_kg, p.slug from order_items i
         join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
        where i.order_id = $1`, [orderId])
    const body = { data: [purchaseEvent(order, items)] }
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE

    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION()}/${PIXEL_ID()}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = clip(out?.error?.message || 'HTTP ' + res.status, 300)
      // Not sent: the claim goes, so the 10-minute job tries again.
      await query(
        `update orders set attribution = jsonb_set(attribution #- '{meta,sendingAt}', '{meta,lastError}', to_jsonb($2::text)) where id = $1`,
        [orderId, error])
      return { error }
    }
    await query(
      `update orders set attribution = jsonb_set(attribution #- '{meta,lastError}' #- '{meta,sendingAt}', '{meta,sentAt}', to_jsonb(now())) where id = $1`,
      [orderId])
    return { sent: true, received: out.events_received }
  } catch (err) {
    console.error('[meta-capi]', err.message)
    await query(`update orders set attribution = attribution #- '{meta,sendingAt}' where id = $1`, [orderId]).catch(() => {})
    return { error: err.message }
  }
}

/**
 * A lead from a Meta Instant Form, as the CRM integration's first stage (Meta "Conversions API for CRM": the raw "Lead").
 * It is matched on the hashed phone and email (and name, city, state): the form gives no click ID, and the lead ID Meta
 * generates is not in Sales Daddy's lead list, so it is not sent. Marked system_generated / crm, as Meta asks.
 */
export function leadFormEvent(row) {
  const [first, ...rest] = str(row.name).split(/\s+/)
  const userData = {
    em: [sha256(str(row.email).toLowerCase())],
    ph: [sha256(phoneDigits(row.mobile))],
    fn: [sha256(norm(first))],
    ln: rest.length ? [sha256(norm(rest.join(' ')))] : undefined,
    ct: [sha256(norm(row.city))],
    st: [sha256(norm(row.state))],
    country: [sha256('in')],
  }
  for (const k of Object.keys(userData)) {
    if (userData[k] === undefined || (Array.isArray(userData[k]) && !userData[k][0])) delete userData[k]
  }
  // Meta takes events up to 7 days old; a lead copied late still goes with its own time, never a future one.
  const at = Math.min(new Date(row.created_at_sd || row.saved_at || Date.now()).getTime(), Date.now())
  return {
    event_name: 'Lead',
    event_time: Math.floor(at / 1000),
    event_id: 'leadform-' + row.sd_lead_id,
    action_source: 'system_generated',
    custom_data: { event_source: 'crm', lead_event_source: 'Sales Daddy' },
    user_data: userData,
  }
}

/** Posts one event to the dataset. Returns { sent: true } or { error } / { skipped }; never throws. */
export async function sendMetaEvent(event) {
  const token = process.env.META_CAPI_TOKEN
  if (!token) return { skipped: 'no token' }
  try {
    const body = { data: [event] }
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION()}/${PIXEL_ID()}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) return { error: clip(out?.error?.message || 'HTTP ' + res.status, 300) }
    return { sent: true, received: out.events_received }
  } catch (err) {
    return { error: clip(err.message, 300) }
  }
}

/** The 10-minute job: paid orders from the last 2 days whose Purchase has not reached Meta yet. */
export async function sendPendingPurchases() {
  if (!process.env.META_CAPI_TOKEN) return { skipped: 'no token' }
  const { rows } = await query(
    `select id from orders
      where payment_status in ('paid', 'partially_refunded') and placed_at > now() - interval '2 days'
        and total_paise > 100
        and not coalesce(attribution->'meta' ? 'sentAt', false)
        and coalesce(attribution->'meta'->>'consent', '') <> 'denied'
        and coalesce((attribution->'meta'->>'sendingAt')::timestamptz < now() - interval '30 minutes', true)
      order by placed_at limit 50`)
  let sent = 0
  for (const { id } of rows) if ((await sendPurchaseToMeta(id)).sent) sent++
  return { due: rows.length, sent }
}
