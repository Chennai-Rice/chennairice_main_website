// Zoho Payments gateway client — OAuth, payment sessions, signature checks.
//
// Server-side only. Everything here needs the org OAuth client secret and the
// signing key, neither of which may ever reach the browser. The browser only
// learns the publishable widget API key and the account id (both designed to
// be public — see VITE_ZOHO_* in .env.local.example), plus a short-lived
// payments_session_id minted by createPaymentSession() below.
//
// Used by both deployment targets, the same arrangement as lib/supabase.js:
// the Vercel functions in api/checkout/* and the local dev proxy in
// backend/server/index.js.
//
// Flow this supports (embedded widget, the mode this storefront uses):
//   1. server: createPaymentSession()      -> payments_session_id
//   2. browser: ZPayments.requestPaymentMethod({ payments_session_id, ... })
//   3. browser posts the widget's payment_id + signature back to us
//   4. server: verifyWidgetSignature() then retrievePaymentSession()
//
// Step 4 is deliberately belt-and-braces. The signature proves the browser did
// not invent the payment_id; re-fetching the session from Zoho proves the
// payment actually succeeded and for how much. We trust the fetched amount,
// never an amount posted from the browser.
import crypto from 'node:crypto'

// Zoho runs separate data centres per region; an IN account's tokens and
// payments do not exist on the .com host, so both hosts move together.
//
// Sandbox is a wholly separate environment, not a flag on the live one: it
// answers on its own host, and objects created there cannot be used live. The
// OAuth accounts host is shared between the two — only the scopes differ
// (ZohoPaySandbox.* rather than ZohoPay.*), which is a property of the refresh
// token you generate, not of anything sent from here.
const HOSTS = {
  IN: {
    api: 'https://payments.zoho.in',
    sandboxApi: 'https://paymentssandbox.zoho.in',
    accounts: 'https://accounts.zoho.in',
  },
  US: {
    api: 'https://payments.zoho.com',
    sandboxApi: 'https://paymentssandbox.zoho.com',
    accounts: 'https://accounts.zoho.com',
  },
  EU: {
    api: 'https://payments.zoho.eu',
    sandboxApi: 'https://paymentssandbox.zoho.eu',
    accounts: 'https://accounts.zoho.eu',
  },
  AU: {
    api: 'https://payments.zoho.com.au',
    sandboxApi: 'https://paymentssandbox.zoho.com.au',
    accounts: 'https://accounts.zoho.com.au',
  },
}

export const ZOHO_DOMAIN = (process.env.ZOHO_PAYMENTS_DOMAIN || 'IN').toUpperCase()
// Sandbox unless explicitly turned off, matching VITE_ZOHO_PAYMENTS_TEST_MODE
// on the browser side: a missing or misspelt value must never take real money.
export const ZOHO_TEST_MODE = process.env.ZOHO_PAYMENTS_TEST_MODE !== 'false'

const region = HOSTS[ZOHO_DOMAIN] || HOSTS.IN
const host = { api: ZOHO_TEST_MODE ? region.sandboxApi : region.api, accounts: region.accounts }

const ACCOUNT_ID = process.env.ZOHO_PAYMENTS_ACCOUNT_ID
const CLIENT_ID = process.env.ZOHO_PAYMENTS_CLIENT_ID
const CLIENT_SECRET = process.env.ZOHO_PAYMENTS_CLIENT_SECRET
const REFRESH_TOKEN = process.env.ZOHO_PAYMENTS_REFRESH_TOKEN
const SIGNING_KEY = process.env.ZOHO_PAYMENTS_SIGNING_KEY

export const hasZohoPayments = Boolean(ACCOUNT_ID && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN)

/** Client-safe error carrying an HTTP status, matching the lib/enquiries.js style. */
function gatewayError(message, { status = 502, publicMessage, retriable = true } = {}) {
  const err = new Error(message)
  err.status = status
  err.publicMessage = publicMessage || 'We could not reach our payment provider. Please try again.'
  // Read by lib/gateways.js: a retriable failure is one where this gateway let
  // us down, so the next gateway deserves a turn. A rejected payment is not
  // retriable — that is the customer's payment failing, not the gateway.
  err.retriable = retriable
  return err
}

function assertConfigured() {
  if (!hasZohoPayments) {
    throw gatewayError(
      'Zoho Payments is not configured (ZOHO_PAYMENTS_ACCOUNT_ID / CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN missing) — see backend/server/.env.example.',
      { status: 503, publicMessage: 'Online payment is not available right now.' }
    )
  }
}

// Access tokens last about an hour. Caching one in module scope means a warm
// serverless instance (or the long-lived dev proxy) spends one token request
// per hour instead of one per checkout. A cold start just fetches again.
let cachedToken = null

async function getAccessToken() {
  assertConfigured()
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token

  const params = new URLSearchParams({
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  // Only sent when the OAuth client was registered with one — Zoho rejects a
  // redirect_uri that does not match, so an unset value must stay absent.
  if (process.env.ZOHO_PAYMENTS_REDIRECT_URI) {
    params.set('redirect_uri', process.env.ZOHO_PAYMENTS_REDIRECT_URI)
  }

  let res
  try {
    res = await fetch(host.accounts + '/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      // Without a deadline a hung gateway holds the checkout open until the
      // platform's own timeout, far too long to wait before trying the other.
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw gatewayError('Zoho OAuth token endpoint did not respond: ' + err.message)
  }
  const data = await res.json().catch(() => ({}))

  // Zoho answers 200 with an `error` field for a revoked or invalid refresh
  // token, so the status code alone cannot be read as success.
  if (!res.ok || data.error || !data.access_token) {
    throw gatewayError(
      'Zoho OAuth token refresh failed (' + res.status + '): ' +
        (data.error || JSON.stringify(data).slice(0, 200)),
      { publicMessage: 'Online payment is temporarily unavailable. Please try again shortly.' }
    )
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  }
  return cachedToken.token
}

async function zohoFetch(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken()
  const url = new URL(host.api + '/api/v1/' + path)
  url.searchParams.set('account_id', ACCOUNT_ID)

  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Zoho-oauthtoken ' + token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw gatewayError('Zoho Payments ' + method + ' ' + path + ' did not respond: ' + err.message)
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw gatewayError('Zoho Payments returned non-JSON from ' + path + ': ' + text.slice(0, 200))
  }

  // Zoho's envelope carries its own status: code 0 means success, anything
  // else is an error even on an HTTP 200.
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    throw gatewayError(
      'Zoho Payments ' + method + ' ' + path + ' failed (HTTP ' + res.status +
        ', code ' + data.code + '): ' + (data.message || text.slice(0, 200)),
      // Any rejection counts as "this gateway is not usable right now",
      // including an auth failure from an expired refresh token — precisely
      // the case a fallback exists for. Failing over costs nothing at session
      // time: nothing has been paid yet, so no money can move twice.
      { retriable: true }
    )
  }
  return data
}

/**
 * Mint a payment session for the widget to open. The amount is what the
 * customer will actually be charged, so it must already have been computed
 * server-side from the catalog — never taken from the browser.
 *
 * @param {{ amount: number, currency?: string, description: string, invoiceNumber?: string, referenceNumber?: string, metaData?: Record<string, string> }} input
 * @returns {Promise<{ payments_session_id: string, amount: string, currency: string, expiry_time: number }>}
 */
export async function createPaymentSession({
  amount,
  currency = 'INR',
  description,
  invoiceNumber,
  referenceNumber,
  metaData,
}) {
  if (!(Number(amount) > 0)) {
    throw gatewayError('createPaymentSession requires a positive amount.', { status: 400 })
  }

  const body = {
    amount: Number(Number(amount).toFixed(2)),
    currency,
    description: String(description || 'Chennai Rice order').slice(0, 500),
  }
  if (invoiceNumber) body.invoice_number = String(invoiceNumber).slice(0, 50)
  if (referenceNumber) body.reference_number = String(referenceNumber).slice(0, 50)
  // Zoho caps meta_data at 5 entries, keys 20 chars and values 500.
  if (metaData) {
    body.meta_data = Object.entries(metaData)
      .slice(0, 5)
      .map(([key, value]) => ({ key: String(key).slice(0, 20), value: String(value).slice(0, 500) }))
  }

  const data = await zohoFetch('paymentsessions', { method: 'POST', body })
  if (!data.payments_session || !data.payments_session.payments_session_id) {
    throw gatewayError('Zoho Payments did not return a payments_session_id.')
  }
  return data.payments_session
}

/**
 * Read a session back from Zoho. This is the authoritative record of whether
 * the customer actually paid, and of how much — the browser's word for either
 * is never trusted.
 *
 * @param {string} sessionId
 * @returns {Promise<{ payments_session_id: string, status: string, amount: string, currency: string, payments?: Array<{ payment_id: string, status: string }> }>}
 */
export async function retrievePaymentSession(sessionId) {
  if (!sessionId) throw gatewayError('retrievePaymentSession requires a session id.', { status: 400 })
  const data = await zohoFetch('paymentsessions/' + encodeURIComponent(sessionId))
  if (!data.payments_session) throw gatewayError('Zoho Payments returned no session.')
  return data.payments_session
}

/**
 * Verify the signature the widget hands back alongside a payment_id, proving
 * the pair came from Zoho and not from a tampered browser.
 *
 * Zoho signs `payment_id|payment_session_id` with HMAC-SHA256 under the
 * signing key from Settings -> Developer Space.
 *
 * Returns false (rather than throwing) for a bad signature so callers decide
 * how loudly to fail. Returns null when no signing key is configured, meaning
 * "not checked" — the caller then falls back on retrievePaymentSession()
 * alone, which is still authoritative about whether money moved.
 *
 * @returns {boolean | null}
 */
export function verifyWidgetSignature({ paymentId, paymentsSessionId, signature }) {
  if (!SIGNING_KEY) return null
  if (!paymentId || !paymentsSessionId || !signature) return false

  const expected = crypto
    .createHmac('sha256', SIGNING_KEY)
    .update(paymentId + '|' + paymentsSessionId)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(String(signature), 'utf8')
  // timingSafeEqual throws on a length mismatch, which is itself a mismatch.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
