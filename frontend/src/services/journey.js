// The shopper's checkout journey (POST /api/journey; /admin → Checkout
// journeys): Add to cart → Proceed to checkout → Details filled → Continue to
// payment → Payment cancelled / failed, or Purchased.
//
// One random id per journey, kept in this browser until the order is paid.
// Cart and checkout steps carry no personal data; the checkout form's details
// (name, mobile, email, city, PIN) are sent when the shopper submits the form
// to pay — the same details the pending order keeps. Best effort: a failed
// send never gets in the way of shopping.
import { currentAttribution } from './attribution.js'

const KEY = 'cr.journey'

function journeyId() {
  try {
    let id = window.localStorage.getItem(KEY)
    if (!id) {
      id = window.crypto?.randomUUID?.() || null
      if (id) window.localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return null
  }
}

/** Cart lines as the journey keeps them. */
export const journeyItems = (items) => (items || []).map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }))
export const journeyValue = (items) => (items || []).reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)

/** Record one step: 'cart' | 'checkout' | 'details' | 'payment' | 'cancelled' | 'failed' | 'purchased'. */
export function recordJourney(stage, extra = {}) {
  const id = journeyId()
  if (!id) return
  const a = currentAttribution() || {}
  try {
    fetch('/api/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journeyId: id, stage, source: a.utm_source || null, ...extra }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* never in the way of shopping */
  }
}

/** After a purchase, the next cart starts a new journey. */
export function endJourney() {
  try { window.localStorage.removeItem(KEY) } catch { /* fine */ }
}
