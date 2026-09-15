// Client-side product/cart event tracking.
//
// Deliberately not a React hook: events fire from inside the cart store,
// which is itself a provider, and threading a hook through there would tie
// the cart's behaviour to consent state. Instead this reads the same
// localStorage records the consent and tracking hooks already own, so there
// is exactly one source of truth for "may we record this".
//
// Every function here is best-effort and silent. Analytics must never
// surface an error to a shopper or block an add-to-cart.
import { readConsent } from '../lib/consentPolicy.js'

const VISITOR_KEY = 'chennai-rice-visitor-id'
const SESSION_KEY = 'chennai-rice-session-id'

/**
 * Analytics is opt-in and defaults to false.
 *
 * readConsent() is the same test the banner uses, which matters more than
 * it looks: a consent recorded against a retired policy is not a consent.
 * Reading the flag directly would have kept tracking a visitor through the
 * window where the banner had gone back to asking them.
 *
 * Exported so src/services/interactions.js gates on the same read rather
 * than keeping a third copy of the rule.
 */
export function analyticsAllowed() {
  return readConsent()?.analytics === true
}

/** The two ids every tracking call needs. Null when tracking hasn't started. */
export function visitorIds() {
  try {
    return {
      visitorId: window.localStorage.getItem(VISITOR_KEY),
      sessionId: window.sessionStorage.getItem(SESSION_KEY),
    }
  } catch {
    return { visitorId: null, sessionId: null }
  }
}

/**
 * Cart line ids are built as `${slug}-${kg}kg` (see ProductDetailPage), which
 * is the only place the pack size survives into the cart. Splitting it back
 * out here keeps the cart's own shape untouched.
 */
export function parseCartLineId(id) {
  const match = /^(.*)-(\d+(?:\.\d+)?)kg$/.exec(id || '')
  if (!match) return { productSlug: id || null, variantKg: null }
  return { productSlug: match[1], variantKg: Number(match[2]) }
}

/**
 * Records one event. Resolves to false when it was not sent — no consent,
 * no session yet, or the request failed.
 */
export function trackEvent(eventType, payload = {}) {
  if (!analyticsAllowed()) return Promise.resolve(false)

  const { visitorId, sessionId } = visitorIds()
  // No session id means the visitor hasn't started one this tab yet, and
  // visitor_events has a foreign key onto it — sending would be rejected.
  if (!visitorId || !sessionId) return Promise.resolve(false)

  return fetch('/api/track/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId, sessionId, eventType, ...payload }),
    keepalive: true,
  })
    .then((res) => res.ok)
    .catch(() => false)
}

/** Convenience wrapper for the cart store. */
export function trackAddToCart(line) {
  const { productSlug, variantKg } = parseCartLineId(line.id)
  return trackEvent('add_to_cart', {
    productSlug,
    variantKg,
    quantity: 1,
    valueInr: typeof line.price === 'number' ? line.price : null,
  })
}
