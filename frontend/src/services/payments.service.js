// Checkout and payment — the browser half of the two-gateway integration.
//
// Deliberately thin. The browser's only jobs are to hand the server a cart and
// a delivery address, open whichever gateway's widget the server chose, and
// report what that widget said. It is never told a price it can change, and it
// never decides which gateway verifies the payment: the amount is computed in
// api/_lib/checkout.js from the catalog, and the gateway is recorded there in a
// pending `payments` row before the customer ever sees a card field.
//
// Failover has two halves. The server handles a gateway whose API is down (see
// _lib/gateways.js). This file handles the half only the browser can see — a
// checkout script that will not load, or a widget that refuses to open — by
// asking the server for a session on the *other* gateway for the same order.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

export const RAZORPAY = 'razorpay'
export const ZOHO = 'zoho_payments'

// Publishable by design. Zoho's widget needs its account id and API key in
// browser code; Razorpay's key id arrives per-session from the server, so it
// needs nothing here. Neither gateway's secret ever appears in this bundle.
const ZOHO_ACCOUNT_ID = import.meta.env.VITE_ZOHO_PAYMENTS_ACCOUNT_ID
const ZOHO_API_KEY = import.meta.env.VITE_ZOHO_PAYMENTS_API_KEY
const ZOHO_DOMAIN = import.meta.env.VITE_ZOHO_PAYMENTS_DOMAIN || 'IN'
// Sandbox until explicitly turned off, so a missing env var can never
// accidentally take real money.
const ZOHO_TEST_MODE = import.meta.env.VITE_ZOHO_PAYMENTS_TEST_MODE !== 'false'

const SCRIPTS = {
  [RAZORPAY]: 'https://checkout.razorpay.com/v1/checkout.js',
  [ZOHO]: 'https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js',
}

const BUSINESS_NAME = 'Chennai Rice Industries India (P) Ltd.'

/** Thrown when a gateway itself is unusable, as opposed to a payment failing. */
export class GatewayUnavailableError extends Error {
  constructor(gateway, message) {
    super(message)
    this.name = 'GatewayUnavailableError'
    this.gateway = gateway
  }
}

/** Thrown when the customer closed the widget without paying. */
export class PaymentCancelledError extends Error {
  constructor(message = 'Payment was cancelled.') {
    super(message)
    this.name = 'PaymentCancelledError'
  }
}

async function postJson(url, body) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch only rejects when the request never completed — offline, DNS, or
    // a dev server that is not running.
    throw new Error('Could not reach our server. Check your connection and try again.')
  }

  const data = await res.json().catch(() => null)
  if (res.ok) return data ?? {}

  // Our own handlers always answer with { error }. Anything else means the
  // request never reached them — a dead API server behind the dev proxy, a
  // platform error page — so say which, rather than a bare "request failed"
  // that sends you looking in the wrong place.
  if (data && data.error) throw new Error(data.error)
  throw new Error(
    'Our server did not respond properly (HTTP ' + res.status + '). ' +
      'If you are running locally, check that the API server on port 8787 is up.'
  )
}

// One shared load per gateway. Several attempts in one visit should reuse the
// same <script>, and a failed load must not leave a dead tag behind that would
// make every retry resolve against nothing.
const scriptPromises = {}

function loadScript(gateway) {
  const globalReady = gateway === RAZORPAY ? () => window.Razorpay : () => window.ZPayments
  if (globalReady()) return Promise.resolve()
  if (scriptPromises[gateway]) return scriptPromises[gateway]

  scriptPromises[gateway] = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPTS[gateway]
    script.async = true
    script.onload = () => {
      // Loaded but no global means a blocked or mangled response — an ad
      // blocker or a captive portal serving something else entirely.
      if (globalReady()) resolve()
      else {
        script.remove()
        scriptPromises[gateway] = null
        reject(new GatewayUnavailableError(gateway, 'The payment widget did not initialise.'))
      }
    }
    script.onerror = () => {
      script.remove()
      scriptPromises[gateway] = null
      reject(new GatewayUnavailableError(gateway, 'The payment widget could not be loaded.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromises[gateway]
}

/**
 * Start a checkout: price the cart server-side, create (or resume) the order,
 * and get back the gateway the server picked plus that gateway's client payload.
 *
 * @param {object} input cart items and delivery details; optionally `orderId`
 *   to resume an existing order and `excludeGateway` to skip one that failed.
 */
export async function initiatePayment(input) {
  return postJson('/api/checkout/session', input)
}

/**
 * Confirm a payment the widget reported. The server checks the signature and
 * re-fetches the payment from the gateway before marking anything paid, so a
 * forged call here cannot mark an order paid.
 */
export async function confirmPayment(input) {
  return postJson('/api/checkout/verify', input)
}

/** Razorpay Standard Checkout. Resolves with the ids its handler reports. */
function openRazorpay({ client, orderNumber, amount, customer }) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }

    const instance = new window.Razorpay({
      key: client.keyId,
      // Paise, as the server computed them — not recomputed here, so the
      // browser cannot round the amount in its own favour.
      amount: client.amountPaise,
      currency: client.currency,
      order_id: client.razorpayOrderId,
      name: BUSINESS_NAME,
      description: 'Order ' + orderNumber,
      prefill: {
        name: customer?.name,
        email: customer?.email,
        contact: customer?.phone,
      },
      notes: { order_number: orderNumber },
      theme: { color: '#6E1B22' },
      handler: (response) =>
        finish(resolve, {
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }),
      modal: {
        // Closing the modal is a decision, not a fault — it must not be
        // mistaken for a gateway failure and trigger a failover.
        ondismiss: () => finish(reject, new PaymentCancelledError()),
      },
    })

    // Razorpay reports a failed attempt through an event rather than the
    // handler, so without this the promise would hang on a declined card.
    if (typeof instance.on === 'function') {
      instance.on('payment.failed', (event) =>
        finish(reject, new Error(event?.error?.description || 'The payment was declined.'))
      )
    }

    try {
      instance.open()
    } catch (error) {
      finish(reject, new GatewayUnavailableError(RAZORPAY, error.message || 'The payment widget could not open.'))
    }
  })
}

/** Zoho Payments widget. Resolves with the ids requestPaymentMethod reports. */
async function openZoho({ client, orderNumber, customer }) {
  if (!ZOHO_ACCOUNT_ID || !ZOHO_API_KEY) {
    throw new GatewayUnavailableError(
      ZOHO,
      'Zoho Payments is not configured in the browser (VITE_ZOHO_PAYMENTS_ACCOUNT_ID / VITE_ZOHO_PAYMENTS_API_KEY).'
    )
  }

  let instance
  try {
    instance = new window.ZPayments({
      account_id: ZOHO_ACCOUNT_ID,
      domain: ZOHO_DOMAIN,
      otherOptions: { api_key: ZOHO_API_KEY, is_test_mode: ZOHO_TEST_MODE },
    })
  } catch (error) {
    throw new GatewayUnavailableError(ZOHO, error.message || 'The payment widget could not start.')
  }

  try {
    const result = await instance.requestPaymentMethod({
      amount: String(client.amount),
      currency_code: client.currency,
      currency_symbol: '₹',
      payments_session_id: client.paymentsSessionId,
      business: BUSINESS_NAME,
      description: 'Order ' + orderNumber,
      reference_number: orderNumber,
      address: { name: customer?.name, email: customer?.email, phone: customer?.phone },
    })
    return { paymentId: result?.payment_id, signature: result?.signature }
  } finally {
    // Zoho's widget mounts an iframe; closing it releases that and lets a
    // retry open a fresh one rather than stacking overlays.
    try {
      await instance.close()
    } catch {
      /* already closed — nothing to release */
    }
  }
}

/**
 * Open the widget for whichever gateway the server chose, and resolve with what
 * it reports.
 *
 * Rejects with GatewayUnavailableError when the gateway itself is unusable
 * (the caller should fail over), PaymentCancelledError when the customer closed
 * it, and a plain Error when the payment was attempted and declined — which is
 * NOT a reason to try the other gateway.
 *
 * @param {{ gateway: string, client: object, orderNumber: string, amount: number, customer: object }} session
 */
export async function openPaymentWidget(session) {
  const { gateway } = session
  if (!SCRIPTS[gateway]) {
    throw new GatewayUnavailableError(gateway, 'Unknown payment gateway "' + gateway + '".')
  }

  await loadScript(gateway)

  return gateway === RAZORPAY ? openRazorpay(session) : openZoho(session)
}

/**
 * Fetch payment records for an order. RLS (`payments_select`,
 * authenticated-only) permits a signed-in user to read payments tied to their
 * own orders; guest orders are not readable from the browser by design.
 * @param {string} orderId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getPaymentsForOrder(orderId) {
  if (!hasSupabase) {
    throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).')
  }
  if (!orderId) throw new Error('getPaymentsForOrder requires an orderId.')

  const { data, error } = await supabase.from('payments').select('*').eq('order_id', orderId)
  if (error) throw new Error(`getPaymentsForOrder failed: ${error.message}`)
  return data ?? []
}
