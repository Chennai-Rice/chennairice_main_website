import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from './useCookieConsent.jsx'
import { disableGoogleAnalytics, enableGoogleAnalytics, trackGooglePageView } from '../services/googleAnalytics.js'

/**
 * Google Analytics on the storefront: loaded only once the visitor accepts
 * analytics cookies, a page view for every page they open after that, and
 * switched off again if they withdraw consent (footer → Cookie Preferences).
 */
export function useGoogleAnalytics() {
  const { allowAnalytics } = useCookieConsent()
  const { pathname, search } = useLocation()
  const lastTracked = useRef(null)

  useEffect(() => {
    if (!allowAnalytics) {
      disableGoogleAnalytics()
      lastTracked.current = null
      return
    }
    enableGoogleAnalytics()
    const page = pathname + search
    if (lastTracked.current !== page) {
      lastTracked.current = page
      // After the page has set its own <title> (usePageMeta).
      window.setTimeout(trackGooglePageView, 0)
    }
  }, [allowAnalytics, pathname, search])
}
