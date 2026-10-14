import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { currentAttribution, isAdVisit } from '../services/attribution.js'
import './contestpopup.css'

// The Super Slogan Contest poster. Taking part starts with buying a Kitchidi
// Ponni pack (the coupon is inside), so the button goes straight to that pack.
const BUY_PATH = '/products/kitchidi-ponni-rice'

// How long the popup stays away once seen. Closing it is a "not now";
// opening the contest means they have it, so it stays away longer.
const HIDE_AFTER_CLOSE_MS = 24 * 60 * 60 * 1000
const HIDE_AFTER_JOIN_MS = 7 * 24 * 60 * 60 * 1000
const KEY = 'cr.contestPopup.v3.hiddenUntil'

// Never over a purchase in progress or a page the customer came to for a reason.
const QUIET_PATHS = ['/cart', '/checkout', '/track-order', '/privacy', '/terms', '/contest', BUY_PATH]

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
 * Centred contest poster, 8 seconds into the visit, with one button to the
 * Kitchidi Ponni pack. Closes on ✕, the backdrop or Escape.
 *
 * Visitors who arrived from a Meta (Facebook / Instagram) or Google ad in this
 * browsing session get the sign-up form instead (name, mobile, email), saved
 * with the ad they came from (see AdSignup below).
 */
export default function ContestPopup() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const closeRef = useRef(null)
  const lastFocus = useRef(null)
  const quiet = QUIET_PATHS.some((p) => pathname.startsWith(p))
  const [fromAd] = useState(isAdVisit)

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

  if (fromAd) return <AdSignup closeRef={closeRef} close={close} />

  return (
    <div className="contest-pop-backdrop" onClick={() => close()}>
      <div
        className="contest-pop contest-pop--poster"
        role="dialog"
        aria-modal="true"
        aria-label="Chennai Rice Super Slogan Contest"
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

        <Link className="contest-poster-art" to={BUY_PATH} tabIndex={-1} onClick={() => close(HIDE_AFTER_JOIN_MS)}>
          <picture>
            <source srcSet="/assets/contest-poster-v3.webp" type="image/webp" />
            <img
              src="/assets/contest-poster-v3.jpg"
              width="800"
              height="1200"
              alt="Chennai Rice Super Slogan Contest: craft the best slogan and bring home the grand prize. Buy a Kitchidi Ponni Rice 5 kg or 26 kg bag, find the coupon, scan and register, and collect your gift. Prizes include a car, a scooter, gold jewellery, a TV, a fridge, a phone, silk sarees and kitchenware. T&C apply."
            />
          </picture>
        </Link>

        <Link data-focus className="contest-poster-cta contest-poster-cta--on-art" to={BUY_PATH} onClick={() => close(HIDE_AFTER_JOIN_MS)}>
          Buy Kitchidi Ponni Rice
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

/**
 * The popup for visitors from a Meta or Google ad: the contest artwork and a
 * short sign-up form (name, mobile, email). Saved with the ad they came from.
 */
function AdSignup({ closeRef, close }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [state, setState] = useState('form') // form | sending | done
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setState('sending')
    try {
      const res = await fetch('/api/contest/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, attribution: currentAttribution(), page: window.location.pathname }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not register you just now. Please try again.')
      hideFor(HIDE_AFTER_JOIN_MS) // registered: no popup for a week
      setState('done')
    } catch (err) {
      setError(err.message || 'Could not register you just now. Please try again.')
      setState('form')
    }
  }

  return (
    <div className="contest-pop-backdrop" onClick={() => close()}>
      <div
        className="contest-pop contest-pop--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} data-focus type="button" className="contest-pop-close" aria-label="Close" onClick={() => close()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="contest-pop-art" aria-hidden="true">
          <picture>
            <source srcSet="/assets/contest-poster-v3.webp" type="image/webp" />
            <img src="/assets/contest-poster-v3.jpg" width="800" height="1200" alt="" />
          </picture>
        </div>

        <div className="contest-pop-body">
          <p className="contest-pop-eyebrow">Super Slogan Contest</p>
          {state === 'done' ? (
            <>
              <h2 id="contest-form-title" className="contest-form-title">Thank you, {form.name.split(' ')[0]}!</h2>
              <p className="contest-pop-text">
                You are registered. We will send the contest details to your mobile and email. Buy a Kitchidi Ponni
                5&nbsp;kg or 26&nbsp;kg bag to find your coupon inside.
              </p>
              <Link data-focus className="contest-pop-cta contest-form-submit" to={BUY_PATH} onClick={() => close(HIDE_AFTER_JOIN_MS)}>
                Buy Kitchidi Ponni Rice
              </Link>
            </>
          ) : (
            <>
              <h2 id="contest-form-title" className="contest-form-title">Register &amp; win big prizes</h2>
              <p className="contest-pop-text">
                Car, scooter, gold and more. Leave your details and we will send you everything you need to take part.
              </p>
              <form className="contest-form" onSubmit={submit} noValidate>
                <label className="contest-form-field">
                  <span>Name</span>
                  <input data-focus required autoComplete="name" maxLength={80} value={form.name} onChange={set('name')} />
                </label>
                <label className="contest-form-field">
                  <span>Mobile number</span>
                  <input data-focus required type="tel" inputMode="numeric" autoComplete="tel" maxLength={16} placeholder="10-digit mobile" value={form.phone} onChange={set('phone')} />
                </label>
                <label className="contest-form-field">
                  <span>Email</span>
                  <input data-focus required type="email" autoComplete="email" maxLength={120} value={form.email} onChange={set('email')} />
                </label>
                {error && <p className="contest-form-error" role="alert">{error}</p>}
                <button data-focus type="submit" className="contest-pop-cta contest-form-submit" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Registering…' : 'Register now'}
                </button>
                <p className="contest-form-note">
                  We use these details only for the contest. <Link to="/privacy" onClick={() => close()}>Privacy policy</Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
