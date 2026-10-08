// Small helpers shared by every sales module.
import crypto from 'node:crypto'

/** An error that carries an HTTP status and a message safe to show a customer. */
export function httpError(message, { status = 400, publicMessage, code } = {}) {
  const err = new Error(message)
  err.status = status
  err.publicMessage = publicMessage || message
  if (code) err.code = code
  return err
}

export function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export const toRupees = (paise) => Math.round(Number(paise)) / 100
export const toPaise = (rupees) => Math.round(Number(rupees) * 100)

export function formatInr(paise) {
  return '₹' + (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Today's date in India as YYYYMMDD — order numbers follow the shop's calendar, not UTC. */
export function istDateStamp(date = new Date()) {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10).replace(/-/g, '')
}

/** Indian financial year (April–March) for a date, e.g. "2026-27". */
export function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60000)
  const y = ist.getUTCFullYear()
  const start = ist.getUTCMonth() >= 3 ? y : y - 1
  return start + '-' + String((start + 1) % 100).padStart(2, '0')
}

// No 0/O, 1/I/L: IDs are read out over the phone and copied by hand.
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function idCode(length) {
  let code = ''
  for (let i = 0; i < length; i++) code += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)]
  return code
}

/**
 * A candidate Order ID: CR-<India date>-<5 characters>, e.g. CR-20261008-K7M4Q.
 * 31^5 ≈ 28.6 million codes per day. Only a candidate: reserveId() is what
 * makes it the order's, by claiming it in the ID register.
 */
export function newOrderNumber() {
  return 'CR-' + istDateStamp() + '-' + idCode(5)
}

/**
 * A shipment ID of its own, unrelated to the order number: SHP-K7M4-Q9X2.
 * Given to the order when it is paid (so the receipt can show it), and used
 * as the number of its first shipment. 31^8 ≈ 850 billion possibilities, so
 * it cannot be guessed from, or worked out of, an order number.
 */
export function newShipmentId() {
  const code = idCode(8)
  return 'SHP-' + code.slice(0, 4) + '-' + code.slice(4)
}

/**
 * Claim a new, never-before-issued ID in the register (table issued_ids).
 *
 * The INSERT is the claim: the primary key admits each value once, ever. If
 * another checkout claimed the same value a moment earlier, ON CONFLICT DO
 * NOTHING returns no row and we draw again. A concurrent claim of the same
 * value waits on the key and then loses, so no two orders can ever hold one
 * ID, and an ID from an abandoned order is never handed out again.
 *
 * @param db       client inside the caller's transaction
 * @param kind     'order' | 'shipment'
 * @param generate function returning a candidate value
 */
export async function reserveId(db, kind, generate, orderId = null) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = generate()
    const { rows } = await db.query(
      `insert into issued_ids (value, kind, order_id) values ($1, $2, $3)
       on conflict (value) do nothing returning value`,
      [candidate, kind, orderId]
    )
    if (rows.length) return rows[0].value
  }
  throw httpError('Could not issue a unique ID after 25 attempts.', {
    status: 503, publicMessage: 'We could not start your order. Please try again.',
  })
}

/** Point a claimed ID at the order it belongs to. */
export async function linkId(db, value, orderId) {
  await db.query('update issued_ids set order_id = $2 where value = $1', [value, orderId])
}

/** Number of the nth shipment of an order: the ID itself, then ID-2, ID-3. */
export function shipmentNumberFor(shipmentId, n = 1) {
  return n === 1 ? shipmentId : shipmentId + '-' + n
}

/**
 * What the customer pasted on Track Order: an order number (CR-20261008-K7M4Q,
 * or the older CR-20261006-592A) or a shipment ID (SHP-K7M4-Q9X2, or
 * SHP-K7M4-Q9X2-2), on its own or inside other text.
 * Returns { orderNumber } or { shipmentId }, or null.
 */
export function parseTrackingRef(text) {
  const upper = String(text || '').toUpperCase()
  const order = upper.match(/\bCR-\d{8}-[0-9A-Z]{4,5}\b/)
  if (order) return { orderNumber: order[0] }
  const ship = upper.match(/\bSHP-([A-Z0-9]{4})-([A-Z0-9]{4})(?:-\d+)?\b/)
  if (ship) return { shipmentId: `SHP-${ship[1]}-${ship[2]}` }
  return null
}

export function randomCode(bytes = 2) {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase()
}

/** Last ten digits — "+91 98765 43210", "098765 43210" and "9876543210" are one number. */
export function phoneKey(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10)
}

export function normaliseState(state) {
  return str(state).toLowerCase().replace(/\s+/g, ' ')
}

export function isSameState(a, b) {
  const tn = (s) => (s === 'tn' ? 'tamil nadu' : s)
  return tn(normaliseState(a)) === tn(normaliseState(b))
}

/** Constant-time comparison for secrets and signatures. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8')
  const y = Buffer.from(String(b || ''), 'utf8')
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y)
}

export async function getSettings(db) {
  const { rows } = await db.query('select key, value from company_settings')
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function recordOrderStatus(db, { orderId, from, to, actor, staffId = null, reason = null }) {
  await db.query(
    `insert into order_status_history (order_id, from_status, to_status, actor, staff_id, reason)
     values ($1, $2, $3, $4, $5, $6)`,
    [orderId, from, to, actor, staffId, reason]
  )
}
