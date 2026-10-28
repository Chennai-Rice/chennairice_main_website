// Customer checkout journeys (migration 029): Add to cart → Proceed to
// checkout → Details filled → Continue to payment → Cancelled / Failed or
// Purchased. The shop sends one step at a time (POST /api/journey); /admin →
// Checkout journeys shows the funnel and the people at each step.
//
// A journey only moves forward (a cancelled or failed payment may be tried
// again), the order's own details are used once there is an order, and a
// journey whose order is paid counts as purchased even if the browser closed
// before it could say so.
import { query } from '../db.js'
import { httpError, str } from './util.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const STAGES = ['cart', 'checkout', 'details', 'payment', 'cancelled', 'failed', 'purchased']
const RANK = { cart: 0, checkout: 1, details: 2, payment: 3, cancelled: 4, failed: 4, purchased: 5 }
const IST = `at time zone 'Asia/Kolkata'`

const clip = (v, n) => str(v).slice(0, n) || null

/** The stage after `next` arrives, given the stage the journey is at. */
export function nextStage(current, next) {
  if (!current) return next
  if (current === 'purchased') return 'purchased'
  // A new payment attempt after a cancel or failure.
  if (next === 'payment' && (current === 'cancelled' || current === 'failed')) return 'payment'
  return RANK[next] >= RANK[current] ? next : current
}

function cleanItems(items) {
  if (!Array.isArray(items)) return null
  return items.slice(0, 20).map((i) => ({
    id: clip(i?.id, 80),
    name: clip(i?.name, 120),
    qty: Math.max(0, Math.min(999, Math.floor(Number(i?.qty) || 0))),
    price: Number.isFinite(Number(i?.price)) ? Math.round(Number(i.price) * 100) / 100 : null,
  })).filter((i) => i.id)
}

function cleanContact(c = {}) {
  const phone = str(c.phone).replace(/[^\d+]/g, '').slice(0, 16)
  const pin = str(c.pincode).replace(/\s/g, '')
  return {
    name: clip(c.name, 100),
    phone: phone.replace(/\D/g, '').length >= 10 ? phone : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(c.email)) ? str(c.email).slice(0, 160) : null,
    city: clip(c.city, 80),
    state: clip(c.state, 60),
    pincode: /^\d{6}$/.test(pin) ? pin : null,
  }
}

/** One step from the shop. */
export async function recordJourney(body = {}, { userAgent = '' } = {}) {
  const id = str(body.journeyId)
  if (!UUID.test(id)) throw httpError('Bad journey id')
  const stage = str(body.stage)
  if (!STAGES.includes(stage)) throw httpError('Bad stage')

  const items = cleanItems(body.items)
  const value = Number(body.value)
  const valuePaise = Number.isFinite(value) && value >= 0 && value < 10000000 ? Math.round(value * 100) : null
  // Personal details only from the checkout form (details) — or from the order below.
  const contact = stage === 'details' ? cleanContact(body.contact) : {}

  // Once there is an order, its own number and details are the ones kept.
  let order = null
  if (body.orderId && UUID.test(str(body.orderId))) {
    const { rows: [o] } = await query(
      `select id, order_number, contact_name, contact_phone, contact_email, shipping_address, payment_status from orders where id = $1`,
      [str(body.orderId)])
    order = o || null
  }
  // "Purchased" is believed only when the order really is paid.
  const claimed = stage === 'purchased' && !(order && ['paid', 'partially_refunded'].includes(order.payment_status)) ? 'payment' : stage

  const { rows: [existing] } = await query('select stage from checkout_journeys where id = $1', [id])
  const stageNow = nextStage(existing?.stage, claimed)
  const a = order?.shipping_address || {}
  await query(
    `insert into checkout_journeys (id, stage, steps, items, value_paise, contact_name, contact_phone, contact_email, city, state, pincode,
                                    order_id, order_number, last_error, payment_attempts, traffic_source, user_agent)
     values ($1, $2, jsonb_build_object($3::text, now()), coalesce($4::jsonb, '[]'::jsonb), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             case when $17 then 1 else 0 end, $15, $16)
     on conflict (id) do update set
       stage = $2,
       steps = case when checkout_journeys.steps ? $3 then checkout_journeys.steps else checkout_journeys.steps || jsonb_build_object($3::text, now()) end,
       items = coalesce($4::jsonb, checkout_journeys.items),
       value_paise = coalesce($5, checkout_journeys.value_paise),
       contact_name = coalesce($6, checkout_journeys.contact_name),
       contact_phone = coalesce($7, checkout_journeys.contact_phone),
       contact_email = coalesce($8, checkout_journeys.contact_email),
       city = coalesce($9, checkout_journeys.city),
       state = coalesce($10, checkout_journeys.state),
       pincode = coalesce($11, checkout_journeys.pincode),
       order_id = coalesce($12, checkout_journeys.order_id),
       order_number = coalesce($13, checkout_journeys.order_number),
       last_error = case when $3 in ('cancelled', 'failed') then $14 when $3 = 'purchased' then null else checkout_journeys.last_error end,
       payment_attempts = checkout_journeys.payment_attempts + case when $17 then 1 else 0 end,
       traffic_source = coalesce(checkout_journeys.traffic_source, $15),
       updated_at = now()`,
    [
      id, stageNow, claimed, items ? JSON.stringify(items) : null, valuePaise,
      order?.contact_name || contact.name || null, order?.contact_phone || contact.phone || null, order?.contact_email || contact.email || null,
      a.city || contact.city || null, a.state || contact.state || null, a.pincode || contact.pincode || null,
      order?.id || null, order?.order_number || null,
      stage === 'cancelled' ? (clip(body.error, 300) || 'Cancelled by the customer') : stage === 'failed' ? clip(body.error, 300) : null,
      clip(body.source, 60), clip(userAgent, 200),
      // Only a real payment step is an attempt (not a 'purchased' claim that is not paid yet).
      stage === 'payment',
    ])
  return { ok: true, stage: stageNow }
}

// ---------------------------------------------------------------- the admin view

function period(q) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const back = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const days = [7, 30, 90].includes(Number(q.days)) ? Number(q.days) : 7
  const from = DAY.test(str(q.from)) ? str(q.from) : back(days - 1)
  const to = DAY.test(str(q.to)) ? str(q.to) : today
  return { from, to }
}

// The stage as the owner sees it: purchased when the order is paid, whatever the browser said.
const EFFECTIVE = `case when o.payment_status in ('paid', 'partially_refunded') then 'purchased' else j.stage end`

/** Funnel and the journeys for a period (IST dates), with filters and search. */
export async function listJourneys(q = {}) {
  const { from, to } = period(q)
  const params = [from, to]
  const where = [`(j.started_at ${IST})::date between $1::date and $2::date`]
  const outcome = str(q.outcome)
  if (STAGES.includes(outcome)) {
    params.push(outcome)
    where.push(`${EFFECTIVE} = $${params.length}`)
  }
  const search = str(q.q).slice(0, 80)
  if (search) {
    params.push('%' + search + '%')
    where.push(`(j.contact_name ilike $${params.length} or j.contact_phone ilike $${params.length} or j.order_number ilike $${params.length} or j.city ilike $${params.length})`)
  }
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500)
  const offset = Math.max(Number(q.offset) || 0, 0)

  const [{ rows }, { rows: [f] }, { rows: [{ n }] }] = await Promise.all([
    query(
      `select j.*, ${EFFECTIVE} as outcome, o.status as order_status
         from checkout_journeys j left join orders o on o.id = j.order_id
        where ${where.join(' and ')}
        order by j.updated_at desc limit ${limit} offset ${offset}`, params),
    // The funnel ignores the outcome filter and search: every journey started in the period.
    query(
      `select count(*)::int as journeys,
              count(*) filter (where j.steps ? 'cart')::int as cart,
              count(*) filter (where j.steps ? 'checkout')::int as checkout,
              count(*) filter (where j.steps ? 'details')::int as details,
              count(*) filter (where j.steps ? 'payment')::int as payment,
              count(*) filter (where ${EFFECTIVE} = 'purchased')::int as purchased,
              count(*) filter (where ${EFFECTIVE} = 'cancelled')::int as cancelled,
              count(*) filter (where ${EFFECTIVE} = 'failed')::int as failed,
              coalesce(sum(j.value_paise) filter (where ${EFFECTIVE} in ('details', 'payment', 'cancelled', 'failed')), 0)::bigint as open_value_paise
         from checkout_journeys j left join orders o on o.id = j.order_id
        where (j.started_at ${IST})::date between $1::date and $2::date`, [from, to]),
    query(`select count(*)::int as n from checkout_journeys j left join orders o on o.id = j.order_id where ${where.join(' and ')}`, params),
  ])
  return {
    period: { from, to },
    funnel: { ...f, openValue: Number(f.open_value_paise) / 100 },
    total: n,
    journeys: rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      stage: r.stage,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      steps: r.steps,
      items: r.items,
      value: r.value_paise == null ? null : Number(r.value_paise) / 100,
      customer: r.contact_name || r.contact_phone ? { name: r.contact_name, phone: r.contact_phone, email: r.contact_email } : null,
      place: [r.city, r.state, r.pincode].filter(Boolean).join(', ') || null,
      orderNumber: r.order_number,
      orderStatus: r.order_status,
      paymentAttempts: r.payment_attempts,
      lastError: r.last_error,
      source: r.traffic_source,
    })),
  }
}
