import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from './useCookieConsent.jsx'
import { disableMetaPixel, enableMetaPixel, pixelFromHead, trackMetaPageView } from '../services/metaPixel.js'

/**
 * Meta Pixel on the storefront: on from the first page (the base code in
 * index.html's <head> sends that page's PageView), a PageView for every page
 * opened after that, and switched off if the visitor rejects marketing cookies
 * (cookie banner, or footer → Cookie Preferences).
 */
export function useMetaPixel() {
  const { decided, allowMarketing } = useCookieConsent()
  const { pathname } = useLocation()
  // The <head> code already counted the page the visitor landed on.
  const lastTracked = useRef(pixelFromHead ? pathname : null)

  useEffect(() => {
    if (decided && !allowMarketing) {
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
