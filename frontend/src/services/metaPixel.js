// Meta (Facebook) Pixel, for ads measurement.
//
// The base code sits in index.html's <head> with consent revoked, so Meta
// receives nothing until the visitor accepts the "marketing" cookie category
// (see src/hooks/useMetaPixel.js), and is told to stop the moment that consent
// is withdrawn. The usual
// <noscript> image is left out on purpose: without JavaScript there is no
// cookie banner, so there is no consent to track on.

export const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '1648623053646936'
// "Chennai Rice – Purchase Tracking" (Oct 2026): a second dataset that gets the same events,
// set up for purchases on /order-confirmed. fbq sends each event to every pixel initialised.
export const META_PURCHASE_PIXEL_ID = import.meta.env.VITE_META_PURCHASE_PIXEL_ID || '1172960135165184'
const PIXEL_IDS = [...new Set([META_PIXEL_ID, META_PURCHASE_PIXEL_ID].filter(Boolean))]

let loaded = false

/** Meta's base code, unchanged apart from running on demand. */
function injectBaseCode() {
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    }
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'
    n.queue = []; t = b.createElement(e); t.async = !0
    t.src = v; s = b.getElementsByTagName(e)[0]
    s.parentNode.insertBefore(t, s)
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */
}

/** Load (once) and switch the pixel on. Safe to call repeatedly. */
export function enableMetaPixel() {
  if (typeof window === 'undefined' || !PIXEL_IDS.length) return
  if (!loaded) {
    // index.html's <head> normally has the base code and both pixels already set up (consent revoked).
    const ready = window.__crMetaPixels || []
    injectBaseCode()
    for (const id of PIXEL_IDS) if (!ready.includes(id)) window.fbq('init', id)
    loaded = true
  }
  window.fbq('consent', 'grant')
}

/** Consent withdrawn: Meta stops receiving events from this page. */
export function disableMetaPixel() {
  if (loaded && window.fbq) window.fbq('consent', 'revoke')
}

/**
 * A standard Meta event (ViewContent, AddToCart, InitiateCheckout, Purchase,
 * Lead). Sent only while the visitor has accepted marketing cookies. An
 * eventId lets Meta match the same event arriving from the server later, so a
 * sale is counted once.
 */
export function trackMetaEvent(name, data = {}, eventId) {
  if (!loaded || !window.fbq) return
  if (eventId) window.fbq("track", name, data, { eventID: eventId })
  else window.fbq("track", name, data)
}

/**
 * The sale, sent from /order-confirmed (shown only for a payment the server confirmed).
 * Once per order in this browser tab, so a refresh of the page is not a second sale;
 * the order number is the event ID, so Meta also merges a server-side copy of it.
 */
export function trackMetaPurchase({ orderNumber, value, items = [] }) {
  if (!loaded || !window.fbq || !orderNumber) return false
  const key = `cr.mpurchase.${orderNumber}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch { /* private mode: the event ID still de-duplicates at Meta */ }
  trackMetaEvent('Purchase', {
    content_ids: items.map((i) => i.id), content_type: 'product',
    num_items: items.reduce((n, i) => n + (Number(i.qty) || 0), 0),
    value: Number(value) || 0, currency: 'INR',
  }, 'purchase-' + orderNumber)
  return true
}

/** One page view. The site is a single-page app, so this runs on every route change. */
export function trackMetaPageView() {
  if (loaded && window.fbq) window.fbq('track', 'PageView')
}
