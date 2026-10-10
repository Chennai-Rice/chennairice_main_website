import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
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

// Shown 8 seconds into the visit, whether or not the cookie banner has been
// answered (an unanswered banner simply stays underneath).
const SHOW_DELAY_MS = 8000

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
 * Centred contest poster, 8 seconds into the visit. Closes on ✕, the
 * backdrop, "Maybe later" or Escape.
 */
export default function ContestPopup() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const closeRef = useRef(null)
  const lastFocus = useRef(null)
  const quiet = QUIET_PATHS.some((p) => pathname.startsWith(p))

  // The clock starts when the visitor arrives and keeps running as they move
  // between pages; it only waits while they are on a quiet page.
  useEffect(() => {
    if (quiet || open || hiddenUntil() > Date.now()) return undefined
    const t = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [quiet, open])

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

        {/* Artwork: the prizes bursting from a Kitchidi Ponni pack. */}
        <a
          className="contest-pop-art"
          href={CONTEST_URL}
          target="_blank"
          rel="noopener"
          tabIndex={-1}
          onClick={() => close(HIDE_AFTER_JOIN_MS)}
        >
          <picture>
            <source srcSet="/assets/contest-art-v1.webp" type="image/webp" />
            <img
              src="/assets/contest-art-v1.jpg"
              width="745"
              height="725"
              alt="A Chennai Rice Kitchidi Ponni pack with prizes around it: a car, a scooter, a phone, a TV, a fridge, a camera, silk sarees and a gas stove."
            />
          </picture>
        </a>

        <div className="contest-pop-body">
          <p className="contest-pop-eyebrow">Chennai Rice presents</p>
          {/* Drawn as small capitals: a tall first letter, the rest smaller
              (Bodoni Moda has no small-caps cut of its own). */}
          <h2 id="contest-pop-title" className="contest-pop-title" aria-label="Slogan Competition">
            <span className="contest-pop-word" aria-hidden="true"><span>S</span>logan</span>
            <span className="contest-pop-word" aria-hidden="true"><span>C</span>ompetition</span>
          </h2>
          <p className="contest-pop-tagline">Give Rice a Voice. Create a Slogan.</p>
          <p className="contest-pop-text">
            Your creativity can bring home amazing prizes! Stand a chance to win exciting rewards and get
            featured in our next campaign.
          </p>

          <ul className="contest-pop-perks">
            <li>
              <span className="contest-pop-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1zm0 0c1.5-3 5-3.5 5-1s-3 1-5 1z"
                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </span>
              Exciting prizes
            </li>
            <li>
              <span className="contest-pop-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z" />
                </svg>
              </span>
              Get featured in our campaign
            </li>
            <li>
              <span className="contest-pop-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="5.5" width="16" height="14.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 13.5h2M11 13.5h2M14 13.5h2M8 16.5h2M11 16.5h2"
                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              Submission deadline coming soon
            </li>
          </ul>

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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
