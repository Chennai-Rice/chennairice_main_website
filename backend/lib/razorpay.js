// Razorpay gateway client — orders, payment lookup, signature checks.
//
// Server-side only: the key secret signs and authenticates everything here and
// must never reach the browser. The browser only learns the key id (publishable
// by design — it goes straight into the checkout options) and a per-attempt
// order id.
//
// Deliberately shaped like lib/zohoPayments.js so lib/gateways.js can treat
// the two interchangeably. Two differences are not cosmetic and are handled
// here rather than leaked to callers:
//
//   - Razorpay counts money in paise (integer subunits); Zoho takes rupees with
//     decimals. Everything above this file works in rupees.
//   - Razorpay wants a fresh order per payment attempt, so createOrder() is
//     called again on every retry rather than reused.
import crypto from 'node:crypto'

const API = 'https://api.razorpay.com/v1'

const KEY_ID = process.env.RAZORPAY_KEY_ID
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

export const hasRazorpay = Boolean(KEY_ID && KEY_SECRET)

// Razorpay separates test from live by key prefix rather than by host, so the
// mode is a property of the key itself and cannot be set wrongly here.
export const RAZORPAY_TEST_MODE = String(KEY_ID || '').startsWith('rzp_test')

/** The key id is safe to hand the browser; the secret never is. */
export const RAZORPAY_KEY_ID = KEY_ID

function gatewayError(message, { status = 502, publicMessage, retriable = true } = {}) {
  const err = new Error(message)
  err.status = status
  err.publicMessage = publicMessage || 'We could not reach our payment provider. Please try again.'
  // Read by lib/gateways.js: a retriable failure is one where this gateway
  // let us down, so the next gateway deserves a turn. A declined card is not
  // retriable — that is the customer's payment failing, not the gateway.
  err.retriable = retriable
  return err
}

function assertConfigured() {
  if (!hasRazorpay) {
    throw gatewayError(
      'Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing) — see backend/server/.env.example.',
      { status: 503, publicMessage: 'Online payment is not available right now.' }
    )
  }
}

function authHeader() {
  return 'Basic ' + Buffer.from(KEY_ID + ':' + KEY_SECRET).toString('base64')
}

async function razorpayFetch(path, { method = 'GET', body } = {}) {
  assertConfigured()

  let res
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // Without a deadline a hung gateway would hold the checkout open until
      // the platform's own timeout, which is far too long to wait before
      // trying the other one.
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw gatewayError('Razorpay ' + method + ' ' + path + ' did not respond: ' + err.message)
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw gatewayError('Razorpay returned non-JSON from ' + path + ': ' + text.slice(0, 200))
  }

  if (!res.ok) {
    const description = data?.error?.description || text.slice(0, 200)
    throw gatewayError(
      'Razorpay ' + method + ' ' + path + ' failed (HTTP ' + res.status + '): ' + description,
      // Any rejection from Razorpay counts as "this gateway is not usable
      // right now", including a 401 from a revoked or mistyped key — which is
      // precisely the case a fallback exists for. Failing over costs nothing
      // here: no session exists yet, so no money can move twice. Only our own
      // input validation (see createOrder) stays non-retriable, because a bad
      // amount would fail identically on the other gateway.
      { retriable: true }
    )
  }
  return data
}

/**
 * Create an order — the object the checkout widget pays against.
 *
 * @param {{ amount: number, currency?: string, receipt?: string, notes?: Record<string, string> }} input
 *   amount is in RUPEES; it is converted to paise here.
 * @returns {Promise<{ id: string, amount: number, currency: string, status: string }>}
 */
export async function createOrder({ amount, currency = 'INR', receipt, notes }) {
  if (!(Number(amount) > 0)) {
    throw gatewayError('createOrder requires a positive amount.', { status: 400, retriable: false })
  }

  const body = {
    // Paise, as an integer — Razorpay rejects a decimal, and a float here
    // would silently under- or over-charge.
    amount: Math.round(Number(amount) * 100),
    currency,
  }
  // Razorpay caps receipt at 40 characters and requires it to be unique.
  if (receipt) body.receipt = String(receipt).slice(0, 40)
  if (notes) {
    body.notes = Object.fromEntries(
      Object.entries(notes)
        .slice(0, 15)
        .map(([key, value]) => [key, String(value).slice(0, 256)])
    )
  }

  const order = await razorpayFetch('/orders', { method: 'POST', body })
  if (!order.id) throw gatewayError('Razorpay did not return an order id.')
  return order
}

/**
 * Read a payment back from Razorpay. This is the authoritative record of
 * whether money moved and how much — never the browser's word for it.
 *
 * `status` is what matters:
 *   captured   — money taken. This is the success state.
 *   authorized — held but NOT taken. Auto-capture is the default, so this is
 *                unusual; it must be captured within 3 days or Razorpay
 *                refunds it automatically.
 *   failed     — the payment did not succeed.
 *
 * @param {string} paymentId
 * @returns {Promise<{ id: string, status: string, amount: number, currency: string, order_id: string, method: string }>}
 */
export async function fetchPayment(paymentId) {
  if (!paymentId) throw gatewayError('fetchPayment requires a payment id.', { status: 400, retriable: false })
  return razorpayFetch('/payments/' + encodeURIComponent(paymentId))
}

/**
 * Verify the signature checkout hands back, proving the order/payment pair
 * came from Razorpay and not from a tampered browser.
 *
 * Razorpay signs `order_id|payment_id` with HMAC-SHA256 under the key secret.
 *
 * Returns false for a bad signature rather than throwing, so callers decide
 * how loudly to fail.
 *
 * @returns {boolean}
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!KEY_SECRET || !orderId || !paymentId || !signature) return false

  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(orderId + '|' + paymentId)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(String(signature), 'utf8')
  // timingSafeEqual throws on a length mismatch, which is itself a mismatch.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Rupees, from Razorpay's paise. */
export function paiseToRupees(paise) {
  return Number(paise) / 100
}
