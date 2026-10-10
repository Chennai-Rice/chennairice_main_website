// Meta (Facebook) Pixel, for ads measurement.
//
// It is a marketing tracker, so it is only ever loaded after the visitor has
// accepted the "marketing" cookie category (see src/hooks/useMetaPixel.js),
// and Meta is told to stop the moment that consent is withdrawn. The usual
// <noscript> image is left out on purpose: without JavaScript there is no
// cookie banner, so there is no consent to track on.

export const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '2085003885614657'

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
  if (typeof window === 'undefined' || !META_PIXEL_ID) return
  if (!loaded) {
    injectBaseCode()
    window.fbq('init', META_PIXEL_ID)
    loaded = true
  }
  window.fbq('consent', 'grant')
}

/** Consent withdrawn: Meta stops receiving events from this page. */
export function disableMetaPixel() {
  if (loaded && window.fbq) window.fbq('consent', 'revoke')
}

/** One page view. The site is a single-page app, so this runs on every route change. */
export function trackMetaPageView() {
  if (loaded && window.fbq) window.fbq('track', 'PageView')
}
