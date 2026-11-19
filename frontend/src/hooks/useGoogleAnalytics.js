import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { enableGoogleAnalytics, trackGooglePageView } from '../services/googleAnalytics.js'

/**
 * Google Analytics / Google Ads with Consent Mode "advanced" (approved by the Google Ads manager, 19 Nov 2026):
 * the Google tag runs for every visitor, a page view for every page they open, but it starts with every
 * consent type denied (index.html), so until the visitor taps Accept it sends only cookieless pings and sets
 * no cookies. The cookie banner's choice is passed on by useTagManagerConsent.js (consent update), including
 * a later withdrawal (footer → Cookie Preferences). Described in the Privacy Policy.
 */
export function useGoogleAnalytics() {
  const { pathname, search } = useLocation()
  const lastTracked = useRef(null)

  useEffect(() => {
    enableGoogleAnalytics()
    const page = pathname + search
    if (lastTracked.current !== page) {
      lastTracked.current = page
      // After the page has set its own <title> (usePageMeta).
      window.setTimeout(trackGooglePageView, 0)
    }
  }, [pathname, search])
}
