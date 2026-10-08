import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import './contestpopup.css'

// The Slogan Contest runs on its own site (Firebase project couponchennairice).
const CONTEST_URL = 'https://couponchennairice.web.app'

// How long the popup stays away once seen. Closing it is a "not now";
// opening the contest means they have it, so it stays away longer.
const HIDE_AFTER_CLOSE_MS = 24 * 60 * 60 * 1000
const HIDE_AFTER_JOIN_MS = 7 * 24 * 60 * 60 * 1000
const KEY = 'cr.contestPopup.hiddenUntil'

// Never over a purchase in progress or a page the customer came to for a reason.
const QUIET_PATHS = ['/cart', '/checkout', '/track-order', '/privacy', '/terms']

// A beat after the cookie banner closes, so the two never stack.
const SHOW_DELAY_MS = 1200

function hiddenUntil() {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

function hideFor(ms) {
  try {
    window.localStorage.setItem(KEY, String(Date.now() + ms))
  } catch {
    /* storage blocked: it will simply show again next visit */
  }
}

/**
 * Centred contest poster, shown once the visitor has answered the cookie
 * banner. Closes on ✕, the backdrop, "Maybe later" or Escape.
 */
export default function ContestPopup() {
  const { decided } = useCookieConsent()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const closeRef = useRef(null)
  const lastFocus = useRef(null)
  const quiet = QUIET_PATHS.some((p) => pathname.startsWith(p))

  useEffect(() => {
    if (!decided || quiet || open || hiddenUntil() > Date.now()) return undefined
    const t = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [decided, quiet, open])

  function close(ms = HIDE_AFTER_CLOSE_MS) {
    hideFor(ms)
    setOpen(false)
  }

  // While open: Escape closes, the page behind does not scroll, focus moves
  // into the dialog and returns where it was afterwards.
  useEffect(() => {
    if (!open) return undefined
    lastFocus.current = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      // Keep Tab inside the dialog.
      if (e.key === 'Tab') {
        const items = [...document.querySelectorAll('.contest-pop [data-focus]')]
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      lastFocus.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="contest-pop-backdrop" onClick={() => close()}>
      <div
        className="contest-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-pop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          data-focus
          type="button"
          className="contest-pop-close"
          aria-label="Close"
          onClick={() => close()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <a
          data-focus
          className="contest-pop-poster"
          href={CONTEST_URL}
          target="_blank"
          rel="noopener"
          onClick={() => close(HIDE_AFTER_JOIN_MS)}
        >
          <picture>
            <source srcSet="/assets/contest-popup-v1.webp" type="image/webp" />
            <img
              src="/assets/contest-popup-v1.jpg"
              width="1080"
              height="1350"
              alt="Chennai Rice contest: buy Kitchidi Ponni Rice and stand a chance to win a car, a scooter, gold jewellery, a phone, a TV, a fridge, silk sarees and kitchen appliances."
            />
          </picture>
        </a>

        <div className="contest-pop-foot">
          <h2 id="contest-pop-title" className="contest-pop-title">Chennai Rice Slogan Contest</h2>
          <div className="contest-pop-actions">
            <a
              data-focus
              className="contest-pop-cta"
              href={CONTEST_URL}
              target="_blank"
              rel="noopener"
              onClick={() => close(HIDE_AFTER_JOIN_MS)}
            >
              Participate now
            </a>
            <button data-focus type="button" className="contest-pop-later" onClick={() => close()}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
