import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import { ASSETS } from '../data/content.js'
import Img from './Img.jsx'
import './cookiebanner.css'

/**
 * The cookie notice. Shown until the visitor answers it, then never again
 * unless they reopen it from the footer or the policy version changes.
 *
 * Reject is given the same visual weight as Accept — a consent notice where
 * declining is harder than agreeing is not a real choice. The corner close
 * button only hides the card for this page view: it is not a "reject" and
 * is never sent to the server, so the notice returns on the next visit.
 */
export default function CookieBanner() {
  const { decided, acceptAll, rejectAll } = useCookieConsent()
  const [dismissed, setDismissed] = useState(false)
  const acceptRef = useRef(null)

  // Move focus to the notice when it appears so keyboard and screen-reader
  // users meet it directly instead of having to hunt for it.
  useEffect(() => {
    if (!decided && !dismissed) acceptRef.current?.focus()
  }, [decided, dismissed])

  if (decided || dismissed) return null

  return (
    <div className="cookie-card-wrap">
      <div
        className="cookie-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="cookie-card-title"
      >
        <button
          type="button"
          className="cookie-card-close"
          aria-label="Close"
          onClick={() => setDismissed(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="cookie-card-brand">
          <Img src={ASSETS.logo} alt="Chennai Rice Industries" className="cookie-card-logo" />
        </div>

        <div className="cookie-card-divider" aria-hidden="true" />

        <div className="cookie-card-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="17" cy="19" r="14" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="17" cy="14" r="1.6" fill="currentColor" />
            <circle cx="12" cy="20" r="1.6" fill="currentColor" />
            <circle cx="19" cy="24" r="1.6" fill="currentColor" />
            <circle cx="22" cy="17" r="1.6" fill="currentColor" />
            <path d="M27 9a6 6 0 006 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>

        <div className="cookie-card-copy">
          <p id="cookie-card-title" className="cookie-card-title">We value your privacy</p>
          <p className="cookie-card-text">
            We use cookies to enhance your browsing experience, keep your cart working, and
            understand site traffic. You can choose to accept or reject non-essential cookies.
          </p>
          <Link to="/privacy" className="cookie-card-link">
            Learn more
            <svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden="true">
              <path d="M1 5h10.5M7.5 1l4.5 4-4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <div className="cookie-card-actions">
          <button type="button" className="cookie-btn cookie-btn-reject" onClick={rejectAll}>
            Reject
          </button>
          <button
            type="button"
            ref={acceptRef}
            className="cookie-btn cookie-btn-accept"
            onClick={acceptAll}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
