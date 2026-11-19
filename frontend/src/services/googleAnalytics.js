// Google Analytics 4 (gtag.js).
//
// Consent Mode "advanced" (Nov 2026): the tag runs for every visitor but starts with every consent type
// denied (index.html), so before the visitor taps Accept it sends only cookieless pings and sets no cookies;
// the cookie banner's choice is passed on as a consent update (useTagManagerConsent.js).
// The split with Google Tag Manager (agreed with the Google Ads manager): GA4, page views, the ecommerce
// events and the purchase live here; the Google Ads conversion tags for WhatsApp, call, contest and
// distributor leads live in GTM and listen for the dataLayer events in services/adEvents.js.

import { keptGoogleClick, GOOGLE_CLICK_PARAMS } from './attribution.js'

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
  loaded = true
  // Everything above (and every event after it) waits in dataLayer; the script itself is fetched once the
  // page has loaded and the browser is idle, or at the first touch, so it never slows the first paint
  // (the same way index.html starts Google Tag Manager).
  let started = false
  const start = () => {
    if (started) return
    started = true
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
    const putBack = showGoogleClick()
    if (putBack) s.addEventListener('load', () => setTimeout(putBack, 3000), { once: true })
    document.head.appendChild(s)
  }
  const later = () => setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 3000 }) : start()), 1500)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
  for (const e of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(e, start, { once: true, passive: true })
}

/**
 * The Google tag reads the ad click ID (gclid…) from the page address when it starts. When the visitor
 * accepted cookies on a later page than the one the ad opened, the ID is put back into the address
 * (without reloading or a new history entry) while the tag starts, then taken out again.
 * Returns the function that takes it out, or null when there is nothing to do.
 */
function showGoogleClick() {
  const click = keptGoogleClick()
  if (!click) return null
  const url = new URL(window.location.href)
  if (GOOGLE_CLICK_PARAMS.some((p) => url.searchParams.has(p))) return null // still in the address
  const original = url.href
  for (const [p, v] of Object.entries(click)) url.searchParams.set(p, v)
  try {
    window.history.replaceState(window.history.state, '', url.href)
  } catch {
    return null
  }
  const shown = url.href
  return () => {
    // Only if the visitor is still on that address (a new page has its own clean address).
    if (window.location.href === shown) window.history.replaceState(window.history.state, '', original)
  }
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
 * conversion. Called when the order-confirmed page opens, which is only shown after the server has confirmed the payment; the order number is the
 * transaction id, so a repeat (a reload, a second call) is dropped here and de-duplicated by Google too.
 * Sent only when analytics cookies were accepted (gtag.js is not loaded otherwise).
 */
export function trackGooglePurchase({ transactionId, value, shipping, coupon, items = [], email, phone }) {
  if (!loaded || !window.gtag || !transactionId) return false
  const key = `cr.gpurchase.${transactionId}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch { /* private mode: the order number still de-duplicates at Google */ }
  // Enhanced conversions: the buyer's email and mobile, hashed here (SHA-256), go with the purchase so Google
  // can match the sale to the ad click without a cookie. The plain values never leave this page.
  hashedUserData({ email, phone })
    .then((userData) => { if (userData) window.gtag('set', 'user_data', userData) })
    .catch(() => {})
    .finally(() => sendPurchase({ transactionId, value, shipping, coupon, items }))
  return true
}

const sha256 = async (text) => {
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Google's normalised, hashed user data (email lower-case; mobile as +91XXXXXXXXXX), or null. */
export async function hashedUserData({ email, phone } = {}) {
  if (!window.crypto?.subtle) return null
  const out = {}
  const e = String(email || '').trim().toLowerCase()
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.sha256_email_address = await sha256(e)
  const digits = String(phone || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
  if (/^[6-9]\d{9}$/.test(digits)) out.sha256_phone_number = await sha256('+91' + digits)
  return Object.keys(out).length ? out : null
}

function sendPurchase({ transactionId, value, shipping, coupon, items }) {
  const total = Number(value) || 0
  window.gtag('event', 'purchase', {
    transaction_id: transactionId,
    value: total,
    currency: 'INR',
    // The delivery charge, when the order had one (the amount paid already includes it).
    ...(Number(shipping) > 0 ? { shipping: Number(shipping) } : {}),
    // The discount code used, if any (the amount paid is already after the discount).
    ...(coupon ? { coupon } : {}),
    items: items.map((i, index) => ({
      item_id: merchantItemId(i),
      item_name: i.name,
      item_brand: 'Chennai Rice',
      item_category: 'Rice',
      ...(Number(i.packKg) > 0 ? { item_variant: `${Number(i.packKg)} kg` } : {}),
      index,
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

/**
 * GA4 ecommerce item for a pack (Nov 2026): the same item_id as the purchase and the Merchant Center feed
 * (CR-<SLUG>-<KG>KG), so GA4 can follow one pack from view to purchase.
 */
export function gaItem({ slug, kg, name, price, qty = 1, index }) {
  const k = Number(kg)
  return {
    item_id: k > 0 ? `CR-${String(slug).toUpperCase()}-${k}KG` : String(slug ?? ''),
    item_name: name,
    item_brand: 'Chennai Rice',
    item_category: 'Rice',
    ...(k > 0 ? { item_variant: `${k} kg` } : {}),
    ...(index != null ? { index } : {}),
    price: Number(price) || 0,
    quantity: Number(qty) || 1,
  }
}

/** A cart line id ("kitchidi-ponni-rice-5kg") → { slug, kg }. */
export function splitLineId(id) {
  const m = /^(.*)-(\d+(?:\.\d+)?)kg$/.exec(String(id || ''))
  return m ? { slug: m[1], kg: Number(m[2]) } : { slug: String(id || ''), kg: null }
}

/**
 * A GA4 ecommerce event (view_item, select_item, add_to_cart, view_cart, begin_checkout) or the shop's own
 * select_pack_size, with INR value and items. Sent only once analytics cookies were accepted, like every GA4 event.
 */
export function trackGoogleEcommerce(event, { items = [], value, ...extra } = {}) {
  if (!loaded || !window.gtag) return false
  const total = value != null ? Number(value) || 0 : items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
  window.gtag('event', event, { currency: 'INR', value: Math.round(total * 100) / 100, items, ...extra })
  return true
}
