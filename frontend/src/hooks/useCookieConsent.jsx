import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CONSENT_KEY, POLICY_VERSION, readConsent } from '../lib/consentPolicy.js'

/**
 * Cookie consent, stored the same way as the cart and saved items: React
 * state shared through context and mirrored to localStorage, so the banner
 * only ever appears until the visitor has answered it once.
 *
 * The stored choice is the source of truth for the browser — the POST to
 * /api/consent is the audit trail, and a failed post never blocks or undoes
 * the visitor's decision.
 */

/* The key, the policy version and the "is this consent still current" test
   live in src/lib/consentPolicy.js, because the tracking services need the
   same answer and run outside React. */
const KEY = CONSENT_KEY
const readStorage = readConsent

const CookieConsentContext = createContext(null)

/** Opaque per-visitor id so a stored consent can be tied to its server record. */
function newId() {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    // Older browsers / non-secure contexts have no randomUUID.
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
}

export function CookieConsentProvider({ children }) {
  const [consent, setConsent] = useState(readStorage)

  useEffect(() => {
    const onStorage = (event) => {
      // Answering the banner in one tab should dismiss it in the others.
      if (event.key === KEY) setConsent(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const decide = useCallback((categories) => {
    const record = {
      id: consent?.id || newId(),
      analytics: categories?.analytics === true,
      marketing: categories?.marketing === true,
      policyVersion: POLICY_VERSION,
      decidedAt: new Date().toISOString(),
    }

    // Applied and persisted in the browser first: the visitor's choice must
    // hold even if they go offline the moment after clicking.
    setConsent(record)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(record))
    } catch {
      /* storage unavailable — the choice just won't persist across reloads */
    }

    fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: record.id,
        categories: { analytics: record.analytics, marketing: record.marketing },
      }),
      keepalive: true,
    }).catch(() => {
      /* The audit copy is best-effort; the browser has already honoured it. */
    })
  }, [consent])

  const acceptAll = useCallback(() => decide({ analytics: true, marketing: true }), [decide])
  const rejectAll = useCallback(() => decide({ analytics: false, marketing: false }), [decide])

  /** Re-opens the banner, for the "Cookie Preferences" link in the footer. */
  const reopen = useCallback(() => {
    setConsent(null)
    try {
      window.localStorage.removeItem(KEY)
    } catch {
      /* nothing to clear */
    }
  }, [])

  const value = useMemo(
    () => ({
      consent,
      decided: consent !== null,
      // What the rest of the site should gate optional scripts on.
      allowAnalytics: consent?.analytics === true,
      allowMarketing: consent?.marketing === true,
      acceptAll,
      rejectAll,
      reopen,
    }),
    [consent, acceptAll, rejectAll, reopen]
  )

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context) throw new Error('useCookieConsent must be used inside <CookieConsentProvider>')
  return context
}
