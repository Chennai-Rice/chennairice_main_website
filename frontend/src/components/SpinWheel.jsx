import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { currentAttribution } from '../services/attribution.js'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import './spinwheel.css'

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
  const out = []
  while (out.length < 8) out.push(...prizes)
  return out.slice(0, Math.min(12, Math.max(8, out.length)))
}

// Split a prize label into lines for its slice: "₹150 OFF" → ["₹150", "OFF"]; long ones wrap by words.
function labelLines(label) {
  const t = String(label).trim()
  const off = t.match(/^(.+?)\s+(OFF)$/i)
  if (off) return [off[1], off[2].toUpperCase()]
  const words = t.split(/\s+/)
  const lines = []
  for (const w of words) {
    const last = lines[lines.length - 1]
    if (last && (last + ' ' + w).length <= 11) lines[lines.length - 1] = last + ' ' + w
    else lines.push(w)
  }
  return lines.slice(0, 4)
}

const GIFT = <path d="M-9 -2h18v11h-18z M-11 -7h22v5h-22z M0 -7v16 M0 -7c-3-6-9-5-7-1 2 2 7 1 7 1z M0 -7c3-6 9-5 7-1-2 2-7 1-7 1z" fill="#f2b632" stroke="#c0392b" strokeWidth="1.2" />
const TRUCK = <path d="M-12 -6h13v10h-13z M1 -2h6l4 4v2h-10z M-6 6a2 2 0 1 0 0.1 0 M6 6a2 2 0 1 0 0.1 0" fill="#fff" stroke="#fff" strokeWidth="1" />

function Wheel({ slices, angle, spinning }) {
  const n = slices.length
  const seg = 360 / n
  const R = 128
  const pt = (deg, r) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [150 + r * Math.cos(a), 150 + r * Math.sin(a)]
  }
  // Slices are centred on their angle, the first at the top (as on the design).
  const slice = (i) => {
    const [x0, y0] = pt(i * seg - seg / 2, R)
    const [x1, y1] = pt(i * seg + seg / 2, R)
    return `M150,150 L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`
  }
  const bulbs = Array.from({ length: 28 }, (_, i) => pt(i * (360 / 28), 139))
  return (
    <div className="spin-wheel-wrap">
      <svg className="spin-wheel-svg" viewBox="0 0 300 300" role="img" aria-label={'Prize wheel: ' + [...new Set(slices.map((p) => p.label))].join(', ')}>
        <defs>
          <radialGradient id="spinRimRed" cx="50%" cy="50%" r="50%">
            <stop offset="0.85" stopColor="#b3121f" />
            <stop offset="0.93" stopColor="#e1262d" />
            <stop offset="1" stopColor="#8e0d16" />
          </radialGradient>
          <linearGradient id="spinGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe08a" /><stop offset="0.5" stopColor="#e0a730" /><stop offset="1" stopColor="#ffd25e" />
          </linearGradient>
          <clipPath id="spinLogoClip"><circle cx="150" cy="150" r="30" /></clipPath>
        </defs>
        <circle cx="150" cy="150" r="149" fill="url(#spinRimRed)" />
        <circle cx="150" cy="150" r="131" fill="none" stroke="url(#spinGold)" strokeWidth="4" />
        {bulbs.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" className={'spin-bulb' + (i % 2 ? ' spin-bulb--alt' : '')} />)}
        <g className={'spin-rotor' + (spinning ? ' is-spinning' : '')} style={{ transform: `rotate(${angle}deg)` }}>
          {slices.map((p, i) => {
            const dark = i % 2 === 1
            const lines = labelLines(p.label)
            const big = /^(₹\d|\d+%)/.test(lines[0]) && lines.length === 2
            const icon = p.kind === 'gift' ? GIFT : p.kind === 'free_delivery' ? TRUCK : null
            // Upright text in the middle of the slice, as on the design (picture above, lines below it).
            const mid = i * seg
            const [cx, cy] = pt(mid, lines.length > 2 ? 90 : 86)
            const small = lines.some((l) => l.length > 8)
            const fs = big ? 22 : small ? 9.5 : 11.5
            const gap = big ? 15 : fs + 2
            const top = (icon ? 9 : 0) - ((lines.length - 1) * gap) / 2 - (big ? 3 : 0)
            return (
              <g key={i}>
                <path d={slice(i)} fill={dark ? '#7d1420' : '#fbf1dc'} stroke="url(#spinGold)" strokeWidth="2" />
                <g transform={`translate(${cx} ${cy})`}>
                  {icon && <g transform={`translate(0 ${top - gap / 2 - 12}) scale(1.05)`}>{icon}</g>}
                  {lines.map((l, k) => {
                    const isBig = big && k === 0
                    return (
                      <text key={k} x="0" y={top + k * gap} textAnchor="middle" dominantBaseline="middle"
                        fontSize={isBig ? fs : big ? 12 : fs} fontWeight="900" fontFamily="inherit"
                        fill={dark ? (k === 0 ? '#ffd34d' : '#fff') : '#7d1420'}>
                        {l}
                      </text>
                    )
                  })}
                </g>
              </g>
            )
          })}
        </g>
        <circle cx="150" cy="150" r="38" fill="#fff" stroke="url(#spinGold)" strokeWidth="5" />
        <image href="/assets/shop/logo.png" x="120" y="120" width="60" height="60" clipPath="url(#spinLogoClip)" preserveAspectRatio="xMidYMid slice" />
      </svg>
      {/* The pointer, on the right as on the design. */}
      <svg className="spin-pointer spin-pointer--right" viewBox="0 0 48 44" aria-hidden="true">
        <path d="M2 22 L44 3 L44 41 Z" fill="#e1262d" stroke="#ffd25e" strokeWidth="3" strokeLinejoin="round" />
        <path d="M10 22 L40 9 L40 22 Z" fill="#ff6b5f" opacity="0.6" />
      </svg>
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
      const matches = slices.map((p, i) => (p.key === data.prize.key ? i : -1)).filter((i) => i >= 0)
      const i = matches.length ? matches[Math.floor(Math.random() * matches.length)] : 0
      const seg = 360 / slices.length
      const target = ((90 - i * seg) % 360 + 360) % 360
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
            <source srcSet="/assets/spin-win.webp" type="image/webp" />
            <img src="/assets/spin-win.png" alt="" width="80" height="80" className="spin-fab-img" />
          </picture>
          {win && <span className="spin-fab-badge">Your prize</span>}
        </button>
      )}
      {open && (
        <div className="spin-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <div className="spin-dialog" role="dialog" aria-modal="true" aria-labelledby="spin-title" ref={dialogRef}>
            <button type="button" className="spin-close" onClick={close} disabled={state === 'spinning'} aria-label="Close">×</button>
            <Wheat />
            <div className="spin-wave" aria-hidden="true" />
            <div className="spin-left">
              <Wheel slices={slices} angle={angle} spinning={state === 'spinning'} />
            </div>
            <div className="spin-right">
              <h2 id="spin-title" className="spin-heading">
                <span className="spin-heading-top">SPIN TO</span>
                <span className="spin-heading-win">win</span>
                <span className="spin-sticker">How much will you save?</span>
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
