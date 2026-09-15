// The one definition of "what counts as a current cookie consent" in the
// browser.
//
// Two separate places need it: the React hook that owns the banner
// (src/hooks/useCookieConsent.jsx) and the plain tracking services that run
// outside React (src/services/events.js, src/services/interactions.js). They
// used to each carry their own reading, and they disagreed — the services
// accepted a consent recorded against a retired policy, so a visitor who was
// being re-asked could still be tracked while they decided. Keeping the rule
// here means there is one answer.

export const CONSENT_KEY = 'chennai-rice-cookie-consent'

/* Must match POLICY_VERSION in api/_lib/consent.js. When the notice's
   wording or categories change, bump both: a choice recorded against an
   older policy no longer covers the current one, so the banner re-asks and
   nothing may be recorded until it is answered again. */
export const POLICY_VERSION = '2026-08-27'

/**
 * The stored consent, or null when there is none that applies. Anything
 * outdated, malformed, or unreadable is treated as "not answered yet"
 * rather than trusted.
 */
export function readConsent() {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    if (!raw) return null

    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return null
    if (saved.policyVersion !== POLICY_VERSION) return null
    if (typeof saved.id !== 'string') return null

    return {
      id: saved.id,
      analytics: saved.analytics === true,
      marketing: saved.marketing === true,
      policyVersion: saved.policyVersion,
      decidedAt: typeof saved.decidedAt === 'string' ? saved.decidedAt : null,
    }
  } catch {
    // Private mode, disabled storage, or corrupt JSON — ask again rather
    // than break the page.
    return null
  }
}
