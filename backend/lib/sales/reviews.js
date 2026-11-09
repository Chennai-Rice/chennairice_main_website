// Customer reviews (Nov 2026, migration 049).
//
// The "Order Delivered" email links to /review?o=<order number>&t=<signed token>: only that order's customer can
// review it (one review per order; they can change it until it is published). Reviews wait as "pending" until
// staff publish them in /offers → Reviews; /review shows the published ones with the average rating.
import crypto from 'node:crypto'
import { httpError, str } from './util.js'
import { requirePermission } from './staff.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://chennairiceindustries.com'
const PAID = ['paid', 'partially_refunded', 'refunded']

function key() {
  return process.env.REVIEW_SECRET || process.env.DB_PASSWORD || process.env.BLOG_JWT_SECRET || 'chennairice-local-review-key'
}
/** The signed part of an order's review link. */
export function reviewToken(orderNumber) {
  return crypto.createHmac('sha256', key()).update('review:' + str(orderNumber)).digest('base64url').slice(0, 22)
}
/** The review page link for an order (the "Order Delivered" email). */
export const reviewUrl = (order) => `${SITE}/review?o=${encodeURIComponent(order.order_number)}&t=${reviewToken(order.order_number)}`

async function orderFor(db, o, t) {
  const number = str(o)
  const token = str(t)
  const good = number && token.length === 22 &&
    crypto.timingSafeEqual(Buffer.from(token.padEnd(22)), Buffer.from(reviewToken(number)))
  if (!good) throw httpError('Bad review link', { status: 404, publicMessage: 'This review link is not valid. Please use the link in your delivery email.' })
  const { rows: [order] } = await db.query(
    `select o.id, o.order_number, o.contact_name, o.shipping_address, o.payment_status,
            (select string_agg(distinct i.product_name, ', ') from order_items i where i.order_id = o.id) as products
       from orders o where o.order_number = $1`, [number])
  if (!order || !PAID.includes(order.payment_status)) throw httpError('No order', { status: 404, publicMessage: 'We could not find that order.' })
  return order
}
const shortName = (n) => {
  const parts = str(n).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Customer'
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

/** What the review form shows for a link: the order, and the review already written (if any). */
export async function reviewForm(db, { o, t } = {}) {
  const order = await orderFor(db, o, t)
  const { rows: [r] } = await db.query('select rating, body, name, status from reviews where order_id = $1', [order.id])
  return {
    orderNumber: order.order_number,
    name: r?.name || str(order.contact_name).split(/\s+/)[0] || '',
    city: order.shipping_address?.city || '',
    products: order.products || '',
    review: r ? { rating: r.rating, text: r.body, status: r.status } : null,
  }
}

/** Save (or change, until published) the review for an order. */
export async function submitReview(db, body = {}) {
  const order = await orderFor(db, body.o, body.t)
  const rating = Number(body.rating)
  if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw httpError('Please choose 1 to 5 stars.')
  const text = str(body.text).replace(/\s+/g, ' ').slice(0, 1000)
  const name = str(body.name).replace(/[^\p{L} .'-]/gu, '').trim().slice(0, 40) || str(order.contact_name).split(/\s+/)[0] || 'Customer'
  const { rows: [r] } = await db.query(
    `insert into reviews (order_id, name, city, rating, body, products) values ($1, $2, $3, $4, $5, $6)
     on conflict (order_id) do update set rating = excluded.rating, body = excluded.body, name = excluded.name, updated_at = now()
       where reviews.status <> 'published'
     returning status`,
    [order.id, name, order.shipping_address?.city || null, rating, text, order.products || null])
  if (!r) throw httpError('Already published', { status: 409, publicMessage: 'Your review is already published. Thank you!' })
  return { ok: true, status: r.status }
}

/** The published reviews for /review, newest first, with the average. */
export async function publicReviews(db) {
  const { rows } = await db.query(
    `select name, city, rating, body, products, published_at from reviews where status = 'published'
      order by published_at desc nulls last limit 200`)
  const avg = rows.length ? Math.round((rows.reduce((t, r) => t + r.rating, 0) / rows.length) * 10) / 10 : null
  return {
    average: avg,
    count: rows.length,
    reviews: rows.map((r) => ({ name: shortName(r.name), city: r.city, rating: r.rating, text: r.body, products: r.products, date: r.published_at })),
  }
}

/** /offers → Reviews: every review, to publish or hide. */
export async function adminReviews(db, staff, { status } = {}) {
  requirePermission(staff, 'settings.manage')
  const want = ['pending', 'published', 'hidden'].includes(status) ? status : null
  const { rows } = await db.query(
    `select r.id, r.name, r.city, r.rating, r.body, r.products, r.status, r.created_at, r.published_at, o.order_number, o.contact_phone
       from reviews r join orders o on o.id = r.order_id
      ${want ? 'where r.status = $1' : ''} order by r.created_at desc limit 500`, want ? [want] : [])
  const { rows: counts } = await db.query('select status, count(*)::int as n from reviews group by status')
  return {
    counts: Object.fromEntries(['pending', 'published', 'hidden'].map((k) => [k, counts.find((c) => c.status === k)?.n || 0])),
    reviews: rows.map((r) => ({
      id: r.id, name: r.name, city: r.city, rating: r.rating, text: r.body, products: r.products, status: r.status,
      createdAt: r.created_at, publishedAt: r.published_at, orderNumber: r.order_number, phone: r.contact_phone,
    })),
  }
}

export async function setReviewStatus(db, staff, id, status) {
  requirePermission(staff, 'settings.manage')
  if (!/^[0-9a-f-]{36}$/i.test(str(id))) throw httpError('Bad review id', { status: 404 })
  if (!['pending', 'published', 'hidden'].includes(status)) throw httpError('Status must be published, hidden or pending.')
  const { rows: [r] } = await db.query(
    `update reviews set status = $2, published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end,
            updated_at = now() where id = $1 returning id`, [id, status])
  if (!r) throw httpError('No such review.', { status: 404 })
  return { ok: true }
}
