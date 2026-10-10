import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from './useCookieConsent.jsx'
import { disableMetaPixel, enableMetaPixel, trackMetaPageView } from '../services/metaPixel.js'

/**
 * Meta Pixel on the storefront: loaded only once the visitor accepts
 * marketing cookies, a PageView for every page they open after that, and
 * switched off again if they withdraw consent (footer → Cookie Preferences).
 */
export function useMetaPixel() {
  const { allowMarketing } = useCookieConsent()
  const { pathname } = useLocation()
  const lastTracked = useRef(null)

  useEffect(() => {
    if (!allowMarketing) {
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
  }, [allowMarketing, pathname])
}
