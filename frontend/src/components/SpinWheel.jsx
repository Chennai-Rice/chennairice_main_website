import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { currentAttribution } from '../services/attribution.js'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import './spinwheel.css'
import { sliceOf, landingAngle } from './wheelSlices.js'

/**
 * Spin & Win (backend/lib/sales/spin.js). Opens by itself 5 seconds after the visitor accepts cookies
 * (once per visit; never on the cart or checkout), and from the small "Spin & Win" button. Name + mobile
 * number, one spin. The server picks the prize; the wheel only lands on it. The prize code is kept in this
 * browser and filled in at checkout, where it works only with the same mobile number. Nothing shows while
 * Spin & Win is switched off in Warehouse → Settings.
 */
const QUIET = ['/cart', '/checkout', '/order-confirmed', '/track-order', '/expo', '/contest']
const WON_KEY = 'cr.spin.won' // { code, gives, label, key, expiresAt, minOrder, region }
const DEVICE_KEY = 'cr.spin.device'
const SEEN_KEY = 'cr.spin.autoshown'
const CODE_KEY = 'cr.checkout.code' // CheckoutPage DISCOUNT_CODE_KEY
const AFTER_CONSENT_MS = 5000

const store = {
  get(area, k) { try { return window[area].getItem(k) } catch { return null } },
  set(area, k, v) { try { window[area].setItem(k, v) } catch { /* private mode */ } },
}
function savedWin() {
  try {
    const w = JSON.parse(store.get('localStorage', WON_KEY) || 'null')
    return w && w.code && (!w.expiresAt || new Date(w.expiresAt) > new Date()) ? w : null
  } catch { return null }
}
function deviceId() {
  let id = store.get('localStorage', DEVICE_KEY)
  if (!id) {
    id = (window.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 64)
    store.set('localStorage', DEVICE_KEY, id)
  }
  return id
}
const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/** The prizes repeated round the wheel (8 to 12 slices), so it looks full like a real prize wheel. */
function slicesFor(prizes) {
  return prizes
}

// The eight slices of the wheel picture, clockwise from the top (/assets/spin-wheel.webp).
/** Which slice of the picture shows this prize (wheelSlices.js; a gift lands on the bag slice). */
function pictureSlice(prize) {
  const i = sliceOf(prize)
  return i >= 0 ? i : 0
}

// The wheel is the designed picture (Nov 2026, "Seven-Segment Chennai Rice Prize Wheel"): the stage (red, the
// light ring, the pointer on the right, the stand and gifts) stays put and only the seven slices turn, laid exactly
// over the wheel in the stage picture (centre 379,359 and radius 279 in its 740 × 900 px).
function Wheel({ slices, angle, spinning }) {
  return (
    <div className="spin-stage">
      <img className="spin-stage-bg" src="/assets/spin7-stage.jpg" alt="" width="740" height="900" />
      <div className={'spin-rotor7' + (spinning ? ' is-spinning' : '')} style={{ transform: `rotate(${angle}deg)` }}>
        <img src="/assets/spin7-rotor.webp" alt={'Prize wheel: ' + [...new Set(slices.map((p) => p.label))].join(', ')} width="558" height="558" />
      </div>
    </div>
  )
}

function Wheat() {
  return (
    <svg className="spin-wheat" viewBox="0 0 120 200" aria-hidden="true">
      {[[60, 200, 40, 30], [60, 200, 78, 60], [60, 200, 22, 70]].map(([x0, y0, x1, y1], s) => (
        <g key={s}>
          <path d={`M${x0} ${y0} Q${(x0 + x1) / 2 + 6} ${(y0 + y1) / 2} ${x1} ${y1}`} stroke="#e0b25a" strokeWidth="2.5" fill="none" />
          {Array.from({ length: 6 }, (_, k) => {
            const t = 0.35 + k * 0.11
            const x = x0 + (x1 - x0) * t
            const y = y0 + (y1 - y0) * t
            return (
              <g key={k}>
                <ellipse cx={x - 6} cy={y} rx="4" ry="9" fill="#efc46d" transform={`rotate(-30 ${x - 6} ${y})`} />
                <ellipse cx={x + 6} cy={y} rx="4" ry="9" fill="#e7b456" transform={`rotate(30 ${x + 6} ${y})`} />
              </g>
            )
          })}
        </g>
      ))}
    </svg>
  )
}

export default function SpinWheel() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { consent, allowAnalytics, allowMarketing } = useCookieConsent()
  const accepted = Boolean(consent) && (allowAnalytics || allowMarketing)
  const [config, setConfig] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [state, setState] = useState('form') // form | spinning | won
  const [error, setError] = useState('')
  const [angle, setAngle] = useState(0)
  const [win, setWin] = useState(savedWin)
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef(null)
  const quiet = QUIET.some((p) => pathname.startsWith(p))

  useEffect(() => {
    let live = true
    fetch('/api/spin').then((r) => (r.ok ? r.json() : null)).then((c) => { if (live) setConfig(c) }).catch(() => {})
    return () => { live = false }
  }, [])

  // A prize already won: ready at checkout.
  useEffect(() => {
    if (win?.code && !store.get('sessionStorage', CODE_KEY)) store.set('sessionStorage', CODE_KEY, win.code)
  }, [win])

  const show = useCallback(() => { setOpen(true); setState(savedWin() ? 'won' : 'form') }, [])

  // Opens by itself 5 seconds after the visitor accepts cookies (or 5 seconds into a visit when they
  // accepted earlier), once per visit, not over another pop-up and not on the cart or checkout.
  useEffect(() => {
    if (!config?.enabled || !accepted || quiet || win || store.get('sessionStorage', SEEN_KEY)) return undefined
    let t
    const tryOpen = () => {
      if (store.get('sessionStorage', SEEN_KEY)) return
      // Another pop-up (the contest) is open: wait until it is closed.
      if (document.querySelector('[role="dialog"]:not(.spin-dialog)')) { t = window.setTimeout(tryOpen, 2000); return }
      store.set('sessionStorage', SEEN_KEY, '1')
      show()
    }
    t = window.setTimeout(tryOpen, AFTER_CONSENT_MS)
    return () => window.clearTimeout(t)
  }, [config, accepted, quiet, win, show])

  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape' && state !== 'spinning') setOpen(false) }
    document.addEventListener('keydown', key)
    dialogRef.current?.querySelector('input, .spin-go')?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [open, state])

  if (!config?.enabled || pathname.startsWith('/checkout')) return null
  const slices = slicesFor(config.prizes)

  async function submit(e) {
    e.preventDefault()
    setError('')
    const name = form.name.trim().replace(/\s+/g, ' ')
    const digits = form.phone.replace(/\D/g, '').slice(-10)
    if (name.length < 2) return setError('Please enter your name.')
    if (!/^[6-9]\d{9}$/.test(digits)) return setError('Please enter a valid 10-digit mobile number.')
    setState('spinning')
    setAngle((a) => a + 720) // spins while the server answers, then lands on the prize
    try {
      const res = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone: digits, deviceId: deviceId(), attribution: currentAttribution() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.code) throw new Error(data?.error || 'Spin & Win is not available right now. Please try again later.')
      // The slice of the picture with this prize (by what it is, so the order of the saved list never matters).
      const i = pictureSlice(data.prize)
      const target = landingAngle(i)
      setAngle((a) => a - (a % 360) + 360 * 5 + target)
      const result = {
        code: data.code, gives: data.gives, label: data.prize.label, key: data.prize.key,
        expiresAt: data.expiresAt, minOrder: data.minOrder, region: data.region, already: data.already,
      }
      window.setTimeout(() => {
        store.set('localStorage', WON_KEY, JSON.stringify(result))
        store.set('sessionStorage', CODE_KEY, result.code)
        setWin(result)
        setState('won')
      }, data.already ? 300 : 4300)
    } catch (err) {
      setState('form')
      setError(err.message)
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(win.code); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* on screen anyway */ }
  }

  const close = () => { if (state !== 'spinning') setOpen(false) }

  return (
    <>
      {!quiet && !open && (
        <button type="button" className={'spin-fab' + (win ? ' has-prize' : '')} onClick={show} aria-label={win ? 'Your Spin & Win prize' : 'Spin & Win'}>
          {/* The Spin & Win wheel picture (bottom left, like Soru Kutty on the right). */}
          <picture>
            <source srcSet="/assets/spin-contest.webp" type="image/webp" />
            <img src="/assets/spin-contest.png" alt="" width="104" height="71" className="spin-fab-img" />
          </picture>
          {win && <span className="spin-fab-badge">Your prize</span>}
        </button>
      )}
      {open && (
        <div className="spin-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <div className="spin-dialog spin-dialog--v7" role="dialog" aria-modal="true" aria-labelledby="spin-title" ref={dialogRef}>
            <button type="button" className="spin-close" onClick={close} disabled={state === 'spinning'} aria-label="Close">×</button>
            <Wheat />
            <div className="spin-wave" aria-hidden="true" />
            <div className="spin-left">
              <Wheel slices={slices} angle={angle} spinning={state === 'spinning'} />
            </div>
            <div className="spin-right">
              <h2 id="spin-title" className="spin-heading spin-heading--img">
                <img src="/assets/spin7-title.webp" alt="Spin to win — how much will you save?" width="660" height="290" />
              </h2>

              {state !== 'won' && (
                <form className="spin-form" onSubmit={submit} noValidate>
                  <p className="spin-tagline">Love a sneaky surprise? Spin the wheel to reveal your exclusive discount!</p>
                  <input className="spin-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="YOUR NAME" autoComplete="name" maxLength={80} disabled={state === 'spinning'} aria-label="Your name" />
                  <input className="spin-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="YOUR PHONE NUMBER" inputMode="tel" autoComplete="tel" maxLength={16} disabled={state === 'spinning'} aria-label="Your phone number" />
                  {error && <p className="spin-error" role="alert">{error}</p>}
                  <button type="submit" className="spin-go" disabled={state === 'spinning'}>{state === 'spinning' ? 'SPINNING…' : 'SPIN TO WIN'}</button>
                  <button type="button" className="spin-nothanks" onClick={close} disabled={state === 'spinning'}>NO THANKS</button>
                  <p className="spin-fine">One spin per mobile number. Use the same number at checkout.</p>
                </form>
              )}

              {state === 'won' && win && (
                <div className="spin-won">
                  <p className="spin-tagline">{win.already ? 'You have already spun. Here is your prize:' : 'Congratulations! You won'}</p>
                  <p className="spin-prize">{win.gives}</p>
                  <div className="spin-code">
                    <span className="spin-code-text">{win.code}</span>
                    <button type="button" className="spin-copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                  <ul className="spin-terms">
                    {win.expiresAt && <li>Valid till {day(win.expiresAt)}</li>}
                    {Number(win.minOrder) > 0 && <li>On orders above {rupees(win.minOrder)}</li>}
                    {win.region === 'TN' && <li>Tamil Nadu delivery addresses</li>}
                    <li>Use the same mobile number at checkout</li>
                  </ul>
                  <button type="button" className="spin-go" onClick={() => { setOpen(false); navigate('/rice-products') }}>SHOP NOW</button>
                  <p className="spin-fine">Your code is saved and filled in for you at checkout.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
