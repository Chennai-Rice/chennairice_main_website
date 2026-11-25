import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from './useCookieConsent.jsx'
import { disableMetaPixel, enableMetaPixel, pixelFromHead, trackMetaPageView } from '../services/metaPixel.js'

/**
 * Meta Pixel on the storefront: loaded only once the visitor accepts marketing
 * cookies (cookie banner, or footer → Cookie Preferences), then a PageView for
 * the current page and every page opened after it; switched off again if they
 * withdraw. Nothing goes to Meta before the banner is answered (25 Nov 2026).
 */
export function useMetaPixel() {
  const { decided, allowMarketing } = useCookieConsent()
  const { pathname } = useLocation()
  const lastTracked = useRef(pixelFromHead ? pathname : null)

  useEffect(() => {
    if (!decided || !allowMarketing) {
      disableMetaPixel()
      lastTracked.current = null
      return
    }
    enableMetaPixel()
    // Once per page: guards against React re-running the effect for the same URL.
    if (lastTracked.current !== pathname) {
      lastTracked.current = pathname
      trackMetaPageView()
    }
  }, [decided, allowMarketing, pathname])
}
