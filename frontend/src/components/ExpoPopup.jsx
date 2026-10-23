import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { currentAttribution, isExpoVisit } from '../services/attribution.js'
import { trackMetaEvent } from '../services/metaPixel.js'
import './contestpopup.css'

// The lead form for people who scan the QR code at the expo. It opens 2 seconds after the
// site loads and, like the ad sign-up form, has no close button: it stays until the form is
// submitted. Only visitors who came from the expo QR (see isExpoVisit) ever see it.

const SHOW_DELAY_MS = 2000
const DONE_KEY = 'cr.expo.done'
// Never over a purchase in progress.
const QUIET_PATHS = ['/cart', '/checkout', '/track-order']

const WHO = [
  { key: 'distributor', label: 'Distributor' },
  { key: 'horeca', label: 'HORECA' },
  { key: 'retailer', label: 'Retailer' },
  { key: 'consumer', label: 'Consumer' },
]
const NEEDS = [
  { key: 'raw_rice', label: 'Raw rice' },
  { key: 'idly_rice', label: 'Idly rice' },
  { key: 'boiled_rice', label: 'Boiled rice' },
]

const doneThisSession = () => {
  try { return window.sessionStorage.getItem(DONE_KEY) === '1' } catch { return false }
}
const markDone = () => {
  try { window.sessionStorage.setItem(DONE_KEY, '1') } catch { /* it simply shows again on a reload */ }
}

export default function ExpoPopup() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(doneThisSession)
  const firstRef = useRef(null)
  const fromExpo = isExpoVisit()
  const quiet = QUIET_PATHS.some((p) => pathname.startsWith(p))

  // Two seconds after arriving (the clock waits while the visitor is on a quiet page).
  useEffect(() => {
    if (!fromExpo || quiet || open || done) return undefined
    const t = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [fromExpo, quiet, open, done])

  // While open the page behind does not scroll and focus goes into the form.
  useEffect(() => {
    if (!open) return undefined
    firstRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [open])

  if (!open) return null
  return <ExpoForm firstRef={firstRef} onClose={() => { setOpen(false); setDone(true) }} />
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

function ExpoForm({ firstRef, onClose }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', location: '', buyerType: '', requirements: [] })
  const [step, setStep] = useState('form') // form | thanks
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleNeed = (key) => setForm((f) => ({
    ...f,
    requirements: f.requirements.includes(key) ? f.requirements.filter((k) => k !== key) : [...f.requirements, key],
  }))

  function check() {
    if (form.name.trim().length < 2) return 'Please enter your name.'
    const digits = form.phone.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(digits.length > 10 ? digits.slice(-10) : digits)) return 'Please enter a valid 10-digit mobile number.'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'That email address does not look right.'
    if (form.location.trim().length < 2) return 'Please enter your city or area.'
    if (!form.buyerType) return 'Please choose Distributor, HORECA, Retailer or Consumer.'
    if (!form.requirements.length) return 'Please choose the rice you need.'
    return ''
  }

  async function submit(e) {
    e.preventDefault()
    const problem = check()
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      // Which expo: the campaign name the QR link carried (/expo?c=name), else "expo".
      const campaign = currentAttribution()?.utm_campaign || 'expo'
      await post('/api/expo/lead', { ...form, campaign })
      markDone()
      trackMetaEvent('Lead', { content_name: 'Expo QR lead' })
      setStep('thanks')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="contest-pop-backdrop">
      <div className="contest-pop contest-pop--form contest-pop--expo" role="dialog" aria-modal="true" aria-labelledby="expo-title" onClick={(e) => e.stopPropagation()}>
        <div className="contest-pop-body">
          <p className="contest-pop-eyebrow">Chennai Rice · Expo</p>
          {step === 'thanks' ? (
            <>
              <h2 id="expo-title" className="contest-form-title">Thank you, {form.name.trim().split(' ')[0]}!</h2>
              <p className="contest-pop-text">We have your details. Our team will get in touch with you soon.</p>
              <button type="button" className="contest-pop-cta contest-form-submit" onClick={onClose}>Continue browsing</button>
            </>
          ) : (
            <>
              <h2 id="expo-title" className="contest-form-title">Tell us what you need</h2>
              <p className="contest-pop-text">Share a few details and our team will contact you with prices and samples.</p>
              <form className="contest-form" onSubmit={submit} noValidate>
                <label className="contest-form-field">
                  <span>Name</span>
                  <input ref={firstRef} required autoComplete="name" maxLength={80} value={form.name} onChange={set('name')} />
                </label>
                <label className="contest-form-field">
                  <span>Phone number</span>
                  <input required type="tel" inputMode="numeric" autoComplete="tel" maxLength={16} placeholder="10-digit mobile" value={form.phone} onChange={set('phone')} />
                </label>
                <label className="contest-form-field">
                  <span>Email (optional)</span>
                  <input type="email" autoComplete="email" maxLength={120} value={form.email} onChange={set('email')} />
                </label>
                <label className="contest-form-field">
                  <span>Location</span>
                  <input required autoComplete="address-level2" maxLength={100} placeholder="City / area" value={form.location} onChange={set('location')} />
                </label>

                <div className="contest-form-field">
                  <span>I am a</span>
                  <div className="expo-chips" role="group" aria-label="I am a">
                    {WHO.map((t) => (
                      <button key={t.key} type="button" className={`expo-chip${form.buyerType === t.key ? ' is-on' : ''}`} aria-pressed={form.buyerType === t.key} onClick={() => setForm((f) => ({ ...f, buyerType: t.key }))}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="contest-form-field">
                  <span>Requirement</span>
                  <div className="expo-chips" role="group" aria-label="Requirement">
                    {NEEDS.map((n) => (
                      <button key={n.key} type="button" className={`expo-chip${form.requirements.includes(n.key) ? ' is-on' : ''}`} aria-pressed={form.requirements.includes(n.key)} onClick={() => toggleNeed(n.key)}>
                        {n.label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="contest-form-error" role="alert">{error}</p>}
                <button type="submit" className="contest-pop-cta contest-form-submit" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit'}
                </button>
                <p className="contest-form-note">
                  We use these details only to contact you.{' '}
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
