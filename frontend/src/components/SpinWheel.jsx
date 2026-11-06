import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { currentAttribution } from '../services/attribution.js'
import './spinwheel.css'

/**
 * Spin & Win (backend/lib/sales/spin.js). A small "Spin & Win" button on the storefront; the wheel also
 * opens by itself once per visit (25 seconds in, or when the visitor moves to leave), never on the cart
 * or checkout and never over another pop-up. Name + mobile number, one spin. The server picks the prize;
 * the wheel only lands on it. The prize code is kept in this browser and filled in at checkout, where it
 * works only with the same mobile number. Nothing shows while Spin & Win is switched off.
 */
const QUIET = ['/cart', '/checkout', '/order-confirmed', '/track-order', '/expo', '/contest']
const COLORS = ['#6e1b22', '#c08a2d', '#8a2a32', '#e8c766', '#4e1218', '#d9a441', '#7a2329', '#f1d58a']
const TEXT = ['#fff', '#2b1b16', '#fff', '#2b1b16', '#fff', '#2b1b16', '#fff', '#2b1b16']
const WON_KEY = 'cr.spin.won' // { code, gives, label, expiresAt, minOrder, region }
const DEVICE_KEY = 'cr.spin.device'
const SEEN_KEY = 'cr.spin.autoshown'
const CODE_KEY = 'cr.checkout.code' // CheckoutPage DISCOUNT_CODE_KEY

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

function Wheel({ prizes, angle, spinning }) {
  const n = prizes.length
  const seg = 360 / n
  const r = 140
  const slice = (i) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180
    return `M150,150 L${150 + r * Math.cos(a0)},${150 + r * Math.sin(a0)} A${r},${r} 0 ${seg > 180 ? 1 : 0} 1 ${150 + r * Math.cos(a1)},${150 + r * Math.sin(a1)} Z`
  }
  return (
    <div className="spin-wheel-wrap">
      <svg className="spin-pointer" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38 6 8a16 16 0 0 1 28 0z" fill="#c08a2d" stroke="#fff" strokeWidth="2" /></svg>
      <svg
        className={'spin-wheel' + (spinning ? ' is-spinning' : '')}
        viewBox="0 0 300 300"
        style={{ transform: `rotate(${angle}deg)` }}
        role="img"
        aria-label={'Prize wheel: ' + prizes.map((p) => p.label).join(', ')}
      >
        <circle cx="150" cy="150" r="148" fill="#c08a2d" />
        {prizes.map((p, i) => {
          // Along the middle of the slice; on the left half turned round, so no label is upside down.
          const mid = i * seg + seg / 2
          const left = mid > 180
          return (
            <g key={p.key}>
              <path d={slice(i)} fill={COLORS[i % COLORS.length]} stroke="#fdf3dc" strokeWidth="2" />
              <text
                x="150" y="150" fill={TEXT[i % TEXT.length]} fontSize={p.label.length > 10 ? 12 : 15} fontWeight="700"
                fontFamily="inherit" textAnchor={left ? 'start' : 'end'} dominantBaseline="middle"
                transform={left ? `rotate(${mid + 90} 150 150) translate(-128 0)` : `rotate(${mid - 90} 150 150) translate(128 0)`}
              >
                {p.label}
              </text>
            </g>
          )
        })}
        <circle cx="150" cy="150" r="26" fill="#fdf3dc" stroke="#c08a2d" strokeWidth="4" />
        <text x="150" y="151" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#6e1b22">SPIN</text>
      </svg>
    </div>
  )
}

export default function SpinWheel() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [state, setState] = useState('form') // form | spinning | won | error
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

  // Opens by itself once per visit: 25 seconds in, or when the pointer leaves the top of the page.
  useEffect(() => {
    if (!config?.enabled || quiet || win || store.get('sessionStorage', SEEN_KEY)) return undefined
    const auto = () => {
      if (store.get('sessionStorage', SEEN_KEY) || document.querySelector('[role="dialog"]:not(.spin-dialog)')) return
      store.set('sessionStorage', SEEN_KEY, '1')
      show()
    }
    const t = window.setTimeout(auto, 25000)
    const leave = (e) => { if (e.clientY <= 0) auto() }
    document.addEventListener('mouseout', leave)
    return () => { window.clearTimeout(t); document.removeEventListener('mouseout', leave) }
  }, [config, quiet, win, show])

  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape' && state !== 'spinning') setOpen(false) }
    document.addEventListener('keydown', key)
    dialogRef.current?.querySelector('input, button')?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [open, state])

  if (!config?.enabled || pathname.startsWith('/checkout')) return null
  const prizes = config.prizes

  async function submit(e) {
    e.preventDefault()
    setError('')
    const digits = form.phone.replace(/\D/g, '').slice(-10)
    if (!form.name.trim()) return setError('Please enter your name.')
    if (!/^[6-9]\d{9}$/.test(digits)) return setError('Please enter a valid 10-digit mobile number.')
    setState('spinning')
    // Spins while the server answers, then lands on the prize.
    setAngle((a) => a + 720)
    try {
      const res = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), phone: digits, deviceId: deviceId(), attribution: currentAttribution() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.code) throw new Error(data?.error || 'Spin & Win is not available right now. Please try again later.')
      const i = Math.max(0, prizes.findIndex((p) => p.key === data.prize.key))
      const seg = 360 / prizes.length
      const target = 360 - (i * seg + seg / 2)
      setAngle((a) => a - (a % 360) + 360 * 5 + target)
      const result = { code: data.code, gives: data.gives, label: data.prize.label, expiresAt: data.expiresAt, minOrder: data.minOrder, region: data.region, already: data.already }
      window.setTimeout(() => {
        store.set('localStorage', WON_KEY, JSON.stringify(result))
        store.set('sessionStorage', CODE_KEY, result.code)
        setWin(result)
        setState('won')
      }, data.already ? 300 : 4200)
    } catch (err) {
      setState('form')
      setError(err.message)
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(win.code); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* shown on screen anyway */ }
  }

  return (
    <>
      {!quiet && !open && (
        <button type="button" className="spin-fab" onClick={show} aria-label={win ? 'Your Spin & Win prize' : 'Spin & Win'}>
          <span className="spin-fab-icon" aria-hidden="true">🎁</span>
          {win ? 'Your prize' : 'Spin & Win'}
        </button>
      )}
      {open && (
        <div className="spin-backdrop" onClick={(e) => { if (e.target === e.currentTarget && state !== 'spinning') setOpen(false) }}>
          <div className="spin-dialog" role="dialog" aria-modal="true" aria-labelledby="spin-title" ref={dialogRef}>
            <button type="button" className="spin-close" onClick={() => setOpen(false)} disabled={state === 'spinning'} aria-label="Close">×</button>
            {state !== 'won' && (
              <>
                <p className="spin-eyebrow">Chennai Rice</p>
                <h2 id="spin-title" className="spin-title">Spin &amp; Win</h2>
                <p className="spin-sub">Everyone wins! One spin per mobile number.</p>
                <Wheel prizes={prizes} angle={angle} spinning={state === 'spinning'} />
                <form className="spin-form" onSubmit={submit} noValidate>
                  <input className="spin-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name" autoComplete="name" maxLength={80} disabled={state === 'spinning'} aria-label="Your name" />
                  <input className="spin-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Mobile number" inputMode="tel" autoComplete="tel" maxLength={16} disabled={state === 'spinning'} aria-label="Mobile number" />
                  {error && <p className="spin-error" role="alert">{error}</p>}
                  <button type="submit" className="spin-go" disabled={state === 'spinning'}>{state === 'spinning' ? 'Spinning…' : 'SPIN'}</button>
                  <p className="spin-fine">Use the same mobile number at checkout to get your prize.</p>
                </form>
              </>
            )}
            {state === 'won' && win && (
              <div className="spin-won">
                <p className="spin-eyebrow">{win.already ? 'You have already spun' : 'Congratulations!'}</p>
                <h2 id="spin-title" className="spin-title">You won {win.gives}!</h2>
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
                <p className="spin-sub">Your code is saved. It is filled in for you at checkout.</p>
                <button type="button" className="spin-go" onClick={() => { setOpen(false); navigate('/rice-products') }}>Shop now</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
