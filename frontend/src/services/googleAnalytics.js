// Google Analytics 4 (gtag.js).
//
// Like the Meta Pixel it is a third-party tracker, so it is only loaded after
// the visitor accepts the "analytics" cookie category (see
// src/hooks/useGoogleAnalytics.js), and told to stop collecting the moment
// that consent is withdrawn. With no Measurement ID set it does nothing.

export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-SWQD75DWP6'

// Google Ads: the account id (AW-…) and the label of its "Purchase" conversion, from Google Ads → Goals →
// Conversions → the purchase conversion → Tag setup. With either missing, nothing is sent to Google Ads.
export const GOOGLE_ADS_ID = import.meta.env.VITE_GOOGLE_ADS_ID || ''
const GOOGLE_ADS_PURCHASE_LABEL = import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL || ''

let loaded = false

function gtag() {
  // gtag.js reads the arguments object itself, so it must be pushed as-is.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

/** Load (once) and switch Google Analytics on. Safe to call repeatedly. */
export function enableGoogleAnalytics() {
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) return
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = false
  if (loaded) return
  window.dataLayer = window.dataLayer || []
  window.gtag = gtag
  gtag('js', new Date())
  // Page views are sent by hand on every route change (single-page app).
  gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })
  // The same gtag.js serves Google Ads too: one more destination, not a second script.
  if (GOOGLE_ADS_ID) gtag('config', GOOGLE_ADS_ID)
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
  document.head.appendChild(s)
  loaded = true
}

/** Consent withdrawn: Google Analytics stops sending anything from this page. */
export function disableGoogleAnalytics() {
  if (GA_MEASUREMENT_ID && typeof window !== 'undefined') window[`ga-disable-${GA_MEASUREMENT_ID}`] = true
}

/** One page view, for the page now showing. */
export function trackGooglePageView() {
  if (!loaded || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_location: window.location.href,
    page_path: window.location.pathname + window.location.search,
    page_title: document.title,
  })
}

/**
 * The id a pack has in Google's product feed (Merchant Center) and in the purchase event: the same SKU the
 * shop's database uses, e.g. CR-ALIBABA-26KG. They must match exactly, or Google cannot tie a sale to a product.
 */
export function merchantItemId(item) {
  const kg = Number(item?.packKg)
  return kg > 0 ? `CR-${String(item.id).toUpperCase()}-${kg}KG` : String(item?.id ?? '')
}

/**
 * A paid order, once: the GA4 `purchase` (with the packs bought) and, when Google Ads is set up, its
 * conversion. Called only after the server has confirmed the payment; the order number is the
 * transaction id, so a repeat (a reload, a second call) is dropped here and de-duplicated by Google too.
 * Sent only when analytics cookies were accepted (gtag.js is not loaded otherwise).
 */
export function trackGooglePurchase({ transactionId, value, items = [] }) {
  if (!loaded || !window.gtag || !transactionId) return false
  const key = `cr.gpurchase.${transactionId}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch { /* private mode: the order number still de-duplicates at Google */ }
  const total = Number(value) || 0
  window.gtag('event', 'purchase', {
    transaction_id: transactionId,
    value: total,
    currency: 'INR',
    items: items.map((i) => ({
      item_id: merchantItemId(i),
      item_name: i.name,
      price: Number(i.price) || 0,
      quantity: Number(i.qty) || 1,
    })),
  })
  if (GOOGLE_ADS_ID && GOOGLE_ADS_PURCHASE_LABEL) {
    window.gtag('event', 'conversion', {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
      transaction_id: transactionId,
      value: total,
      currency: 'INR',
    })
  }
  return true
}
