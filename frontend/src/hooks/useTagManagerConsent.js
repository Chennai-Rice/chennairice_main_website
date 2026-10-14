import { useEffect } from 'react'
import { useCookieConsent } from './useCookieConsent.jsx'

// Google Tag Manager (GTM-K2RL4JBL, loaded in index.html) starts with every
// Google consent type denied. This passes the visitor's cookie-banner choice
// on to it, on every page load and whenever the choice changes:
// analytics cookies → analytics_storage; marketing cookies → the ad types.
function gtag() {
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

export function useTagManagerConsent() {
  const { allowAnalytics, allowMarketing } = useCookieConsent()

  useEffect(() => {
    const ads = allowMarketing ? 'granted' : 'denied'
    gtag('consent', 'update', {
      analytics_storage: allowAnalytics ? 'granted' : 'denied',
      ad_storage: ads,
      ad_user_data: ads,
      ad_personalization: ads,
    })
    // For GTM triggers that should only fire after a choice is made.
    window.dataLayer.push({ event: 'cookie_consent_update', analytics_consent: allowAnalytics, marketing_consent: allowMarketing })
  }, [allowAnalytics, allowMarketing])
}
