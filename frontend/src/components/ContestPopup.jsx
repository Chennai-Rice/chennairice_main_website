import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { currentAttribution, isAdVisit } from '../services/attribution.js'
import { trackMetaEvent } from '../services/metaPixel.js'
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
const QUIET_PATHS = ['/cart', '/checkout', '/track-order', '/privacy', '/terms', '/contest', '/expo', BUY_PATH]

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
  const [fromAd] = useState(isAdVisit)
  // The sign-up form for ad and WhatsApp visitors comes first, even on the pack page they land on;
  // the plain contest popup stays away from it (its button goes there).
  const quiet = QUIET_PATHS.some((p) => pathname.startsWith(p) && !(fromAd && p === BUY_PATH))

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
      if (e.key === 'Escape' && !fromAd) close() // the ad sign-up is required
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
 * The popup for visitors from a Meta or Google ad: a short sign-up form (name,
 * mobile, email) that cannot be dismissed until it is filled in. The mobile is
 * confirmed with an OTP (MSG91) before the sign-up is saved with the ad the
 * visitor came from. With no SMS account configured the OTP step is skipped.
 */
const RESEND_AFTER_S = 30

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

function AdSignup({ closeRef, close }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('form') // form | otp | done
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0) // seconds until "Resend OTP"
  const otpRef = useRef(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const details = () => ({ ...form, attribution: currentAttribution(), page: window.location.pathname })

  useEffect(() => {
    if (wait <= 0) return undefined
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(t)
  }, [wait])
  useEffect(() => { if (step === 'otp') otpRef.current?.focus() }, [step])

  async function run(fn) {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function register(extra = {}) {
    await post('/api/contest/lead', { ...details(), ...extra })
    hideFor(HIDE_AFTER_JOIN_MS) // registered: no popup for a week
    trackMetaEvent('Lead', { content_name: 'Super Slogan Contest sign-up' })
    setStep('done')
  }

  // Step 1: details in, OTP out (or straight to registered if OTP is off).
  const sendOtp = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await post('/api/contest/otp', details())
      if (r.otpRequired === false) return register()
      setOtp('')
      setWait(RESEND_AFTER_S)
      setStep('otp')
    })
  }
  const resend = () => run(async () => {
    await post('/api/contest/otp', { ...details(), resend: true })
    setWait(RESEND_AFTER_S)
  })
  // Step 2: the OTP confirms the mobile and saves the sign-up.
  const verify = (e) => {
    e.preventDefault()
    run(() => register({ otp }))
  }

  const masked = form.phone.replace(/\D/g, '').slice(-10).replace(/^(\d{2})\d{4}(\d{4})$/, '$1xxxx$2')

  return (
    <div className="contest-pop-backdrop">
      <div
        className="contest-pop contest-pop--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="contest-pop-body">
          <p className="contest-pop-eyebrow">Super Slogan Contest</p>
          {step === 'done' ? (
            <>
              <h2 id="contest-form-title" className="contest-form-title">Thank you, {form.name.split(' ')[0]}!</h2>
              <p className="contest-pop-text">
                You are registered. We will send the contest details to your mobile and email. Buy a Kitchidi Ponni
                5&nbsp;kg or 26&nbsp;kg bag to find your coupon inside.
              </p>
              <button data-focus type="button" className="contest-pop-cta contest-form-submit" onClick={() => close(HIDE_AFTER_JOIN_MS)}>
                Continue browsing
              </button>
            </>
          ) : step === 'otp' ? (
            <>
              <h2 id="contest-form-title" className="contest-form-title">Enter the OTP</h2>
              <p className="contest-pop-text">
                We have sent a 6-digit code by SMS to <strong>+91 {masked}</strong>.
              </p>
              <form className="contest-form" onSubmit={verify} noValidate>
                <label className="contest-form-field">
                  <span>OTP</span>
                  <input
                    ref={otpRef}
                    data-focus
                    required
                    className="contest-form-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
                {error && <p className="contest-form-error" role="alert">{error}</p>}
                <button data-focus type="submit" className="contest-pop-cta contest-form-submit" disabled={busy || otp.length < 4}>
                  {busy ? 'Checking…' : 'Verify & register'}
                </button>
                <div className="contest-form-otp-actions">
                  <button data-focus type="button" className="contest-form-link" disabled={busy || wait > 0} onClick={resend}>
                    {wait > 0 ? `Resend OTP in ${wait}s` : 'Resend OTP'}
                  </button>
                  <button data-focus type="button" className="contest-form-link" disabled={busy} onClick={() => { setError(''); setStep('form') }}>
                    Change number
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h2 id="contest-form-title" className="contest-form-title">Register &amp; win big prizes</h2>
              <p className="contest-pop-text">
                Car, scooter, gold and more. Leave your details and we will send you everything you need to take part.
              </p>
              <form className="contest-form" onSubmit={sendOtp} noValidate>
                <label className="contest-form-field">
                  <span>Name</span>
                  <input ref={closeRef} data-focus required autoComplete="name" maxLength={80} value={form.name} onChange={set('name')} />
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
                <button data-focus type="submit" className="contest-pop-cta contest-form-submit" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit'}
                </button>
                <p className="contest-form-note">
                  We use these details only for the contest.{' '}
                  <Link to="/privacy" target="_blank" rel="noopener">Privacy policy</Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
