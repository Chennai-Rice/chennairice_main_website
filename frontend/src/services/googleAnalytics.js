// Google Analytics 4 (gtag.js).
//
// Like the Meta Pixel it is a third-party tracker, so it is only loaded after
// the visitor accepts the "analytics" cookie category (see
// src/hooks/useGoogleAnalytics.js), and told to stop collecting the moment
// that consent is withdrawn. With no Measurement ID set it does nothing.

export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-SWQD75DWP6'

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
