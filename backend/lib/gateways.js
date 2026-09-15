// Payment gateway registry and failover.
//
// Two gateways, one uniform shape, so lib/checkout.js never branches on which
// provider it is talking to. Razorpay is primary and Zoho Payments is the
// fallback by default; PAYMENT_GATEWAY_PRIORITY reorders them without a code
// change (e.g. "zoho_payments,razorpay" to flip, or a single name to pin one).
//
// WHAT FAILOVER MEANS HERE, precisely: we move to the next gateway when a
// gateway fails to *give us a payment session* — it is unconfigured, down,
// timing out, rate-limiting, or returning 5xx. That happens before the customer
// has entered any card details, so nothing can be double-charged.
//
// We deliberately do NOT fail over once the customer is paying. A declined
// card, a closed widget or a failed authentication is the payment failing, not
// the gateway failing; quietly re-running that against the other provider risks
// taking the money twice. Those surface to the customer as-is, and they choose
// to retry. Errors carry `retriable` (set in razorpay.js / zohoPayments.js) to
// keep that line sharp.
import {
  hasRazorpay,
  RAZORPAY_KEY_ID,
  RAZORPAY_TEST_MODE,
  createOrder as razorpayCreateOrder,
  fetchPayment as razorpayFetchPayment,
  verifyCheckoutSignature as razorpayVerifySignature,
  paiseToRupees,
} from './razorpay.js'
import {
  hasZohoPayments,
  ZOHO_TEST_MODE,
  createPaymentSession as zohoCreateSession,
  retrievePaymentSession as zohoRetrieveSession,
  verifyWidgetSignature as zohoVerifySignature,
} from './zohoPayments.js'

export const RAZORPAY = 'razorpay'
export const ZOHO = 'zoho_payments'

const DEFAULT_PRIORITY = [RAZORPAY, ZOHO]

/**
 * Each adapter exposes the same three things:
 *   isConfigured  — whether this gateway has credentials at all
 *   createSession — mint whatever the browser widget needs to open
 *   confirm       — turn what the widget reported into a verified outcome
 *
 * confirm() returns { paid, transactionId, amount, currency, method, raw } and
 * throws only when it cannot determine an outcome. `paid: false` is a decided
 * "this did not go through", not an error.
 */
const ADAPTERS = {
  [RAZORPAY]: {
    id: RAZORPAY,
    label: 'Razorpay',
    isConfigured: () => hasRazorpay,
    testMode: () => RAZORPAY_TEST_MODE,

    async createSession({ amount, currency, orderNumber, orderId }) {
      // Razorpay wants a fresh order per attempt, so a retry mints a new one
      // rather than reusing the previous id.
      const order = await razorpayCreateOrder({
        amount,
        currency,
        receipt: orderNumber,
        notes: { order_id: orderId, order_number: orderNumber },
      })
      return {
        // Stored server-side and used to verify later — the browser cannot
        // change which order its payment is checked against.
        reference: order.id,
        // Everything the browser legitimately needs. The key id is publishable.
        client: {
          keyId: RAZORPAY_KEY_ID,
          razorpayOrderId: order.id,
          amountPaise: order.amount,
          currency: order.currency,
        },
      }
    },

    async confirm({ reference, body }) {
      const paymentId = String(body?.paymentId || body?.razorpay_payment_id || '').trim()
      const signature = String(body?.signature || body?.razorpay_signature || '').trim()

      if (!paymentId) return { paid: false, reason: 'No payment id was reported.', raw: null }

      // The signature proves Razorpay issued this payment for OUR order id —
      // `reference` comes from our own database, never from the request.
      const signatureValid = razorpayVerifySignature({
        orderId: reference,
        paymentId,
        signature,
      })
      if (!signatureValid) {
        const err = new Error('Razorpay signature mismatch for order ' + reference)
        err.status = 400
        err.publicMessage = 'We could not verify that payment. Please contact us with your order number.'
        throw err
      }

      // Authoritative: ask Razorpay what actually happened.
      const payment = await razorpayFetchPayment(paymentId)

      // `captured` is money taken. `authorized` is money merely held — with
      // auto-capture on (the default) it should not linger, but if it does it
      // must be captured within 3 days or Razorpay refunds it automatically.
      const paid = payment.status === 'captured'
      return {
        paid,
        pendingCapture: payment.status === 'authorized',
        reason: paid ? null : 'Razorpay reports the payment as ' + payment.status + '.',
        transactionId: payment.id,
        amount: paiseToRupees(payment.amount),
        currency: payment.currency || 'INR',
        method: payment.method || null,
        // Only present for card payments, and only ever the last four digits —
        // the full number never reaches us. Shown on the receipt so a customer
        // can tell which card they used.
        last4: payment.card?.last4 || null,
        raw: payment,
      }
    },
  },

  [ZOHO]: {
    id: ZOHO,
    label: 'Zoho Payments',
    isConfigured: () => hasZohoPayments,
    testMode: () => ZOHO_TEST_MODE,

    async createSession({ amount, currency, orderNumber, orderId }) {
      const session = await zohoCreateSession({
        amount,
        currency,
        description: 'Chennai Rice order ' + orderNumber,
        referenceNumber: orderNumber,
        metaData: { order_id: orderId, order_number: orderNumber },
      })
      return {
        reference: session.payments_session_id,
        client: {
          paymentsSessionId: session.payments_session_id,
          amount,
          currency,
          expiresAt: session.expiry_time || null,
        },
      }
    },

    async confirm({ reference, body }) {
      const paymentId = String(body?.paymentId || '').trim()
      const signature = String(body?.signature || '').trim()

      // null means no signing key configured, so the check is skipped and we
      // rest on the session re-fetch below, which is still authoritative.
      const signatureValid = zohoVerifySignature({
        paymentId,
        paymentsSessionId: reference,
        signature,
      })
      if (signatureValid === false) {
        const err = new Error('Zoho widget signature mismatch for session ' + reference)
        err.status = 400
        err.publicMessage = 'We could not verify that payment. Please contact us with your order number.'
        throw err
      }
      if (signatureValid === null) {
        console.warn('ZOHO_PAYMENTS_SIGNING_KEY is not set — widget signatures are not being verified.')
      }

      const session = await zohoRetrieveSession(reference)
      const succeeded = (session.payments || []).find((p) => p.status === 'succeeded')
      const paid = session.status === 'succeeded' && Boolean(succeeded)

      return {
        paid,
        pendingCapture: false,
        reason: paid ? null : 'Zoho reports the payment session as ' + session.status + '.',
        transactionId: succeeded ? succeeded.payment_id : reference,
        amount: Number(session.amount),
        currency: session.currency || 'INR',
        method: succeeded?.payment_method || null,
        last4: null,
        raw: session,
      }
    },
  },
}

/** Configured priority order, falling back to the default when unset. */
function priorityOrder() {
  const configured = String(process.env.PAYMENT_GATEWAY_PRIORITY || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => ADAPTERS[name])

  if (!configured.length) return DEFAULT_PRIORITY
  // Anything the env var leaves out still belongs at the back — naming one
  // gateway should set the primary, not silently disable the other.
  return [...new Set([...configured, ...DEFAULT_PRIORITY])]
}

/** One adapter by id, or undefined. */
export function getGateway(id) {
  return ADAPTERS[id]
}

/** Every configured gateway, in the order we should try them. */
export function availableGateways({ exclude = [] } = {}) {
  const skip = new Set(exclude.filter(Boolean))
  return priorityOrder()
    .filter((id) => !skip.has(id))
    .map((id) => ADAPTERS[id])
    .filter((adapter) => adapter.isConfigured())
}

export const hasAnyGateway = () => availableGateways().length > 0

/**
 * Mint a payment session, walking the priority list until one works.
 *
 * Every attempt that fails for a retriable reason is recorded and we move on;
 * a non-retriable failure (bad credentials, a malformed request) stops the walk
 * because the next gateway would only fail the same way for the same reason.
 *
 * @returns {Promise<{ gateway: string, label: string, reference: string, client: object, attempts: Array }>}
 */
export async function createSessionWithFailover({ exclude = [], ...input }) {
  const gateways = availableGateways({ exclude })

  if (!gateways.length) {
    const err = new Error(
      'No payment gateway is configured' +
        (exclude.length ? ' (excluding ' + exclude.join(', ') + ')' : '') +
        ' — see backend/server/.env.example.'
    )
    err.status = 503
    err.publicMessage = 'Online payment is not available right now.'
    throw err
  }

  const attempts = []
  let lastError

  for (const gateway of gateways) {
    try {
      const session = await gateway.createSession(input)
      return {
        gateway: gateway.id,
        label: gateway.label,
        testMode: gateway.testMode(),
        reference: session.reference,
        client: session.client,
        attempts,
      }
    } catch (err) {
      attempts.push({ gateway: gateway.id, error: err.message })
      lastError = err
      // Loud on purpose: a silent fallback that nobody notices is how you
      // discover months later that your primary gateway has been down.
      console.error('[gateways] ' + gateway.label + ' could not create a session:', err.message)

      if (err.retriable === false) break
    }
  }

  lastError = lastError || new Error('No gateway produced a session.')
  lastError.attempts = attempts
  throw lastError
}
