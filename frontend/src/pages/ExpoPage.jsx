import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trackMetaEvent } from '../services/metaPixel.js'
import Ornament from '../components/Ornament.jsx'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import './page.css'
import './bulkorder.css'

// The lead form behind the QR code on the expo stand. The address /expo is not linked from
// anywhere on the site, stays out of Google, and a visit is counted as "Expo QR" (see
// services/attribution.js), so only people who scan the code ever see this form.

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

const EMPTY = { name: '', phone: '', email: '', location: '', buyerType: '', requirements: [] }

export default function ExpoPage() {
  usePageMeta('Chennai Rice at the Expo', 'Tell us what rice you need and our team will get in touch.', { noindex: true })
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key]: undefined }))
  }
  const chooseWho = (key) => {
    setForm((f) => ({ ...f, buyerType: key }))
    setErrors((x) => ({ ...x, buyerType: undefined }))
  }
  const toggleNeed = (key) => {
    setForm((f) => ({
      ...f,
      requirements: f.requirements.includes(key) ? f.requirements.filter((k) => k !== key) : [...f.requirements, key],
    }))
    setErrors((x) => ({ ...x, requirements: undefined }))
  }

  const validate = () => {
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Please enter your name.'
    const digits = form.phone.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(digits.length > 10 ? digits.slice(-10) : digits)) next.phone = 'Please enter a valid 10-digit mobile number.'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'That email address does not look right.'
    if (form.location.trim().length < 2) next.location = 'Please enter your city or area.'
    if (!form.buyerType) next.buyerType = 'Please choose one.'
    if (!form.requirements.length) next.requirements = 'Please choose the rice you need.'
    return next
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) return
    setSubmitError('')
    setSubmitting(true)
    try {
      // Which expo (a different QR per event can add ?c=name to the address).
      const campaign = new URLSearchParams(window.location.search).get('c') || 'expo'
      const res = await fetch('/api/expo/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, campaign }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send your details.')
      trackMetaEvent('Lead', { content_name: 'Expo QR lead' })
      setSent(true)
      setForm(EMPTY)
    } catch (err) {
      setSubmitError(err.message || 'Could not send your details. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <main className="page">
        <div className="container page-inner">
          <div className="section-label">
            <Ornament />
            <span>Thank you</span>
            <Ornament flip />
          </div>
          <h1 className="page-title">We have your details</h1>
          <p className="page-text">
            Thank you for visiting Chennai Rice at the expo. Our team will get in touch with you soon.
          </p>
          <Link className="btn-maroon" to="/rice-products">See our rice range</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        <div className="section-label">
          <Ornament />
          <span>Chennai Rice · Expo</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">Tell us what you need</h1>
        <p className="page-text">Share a few details and our team will contact you with prices and samples.</p>

        <form className="contact-form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span className="field-label">Name</span>
            <input type="text" autoComplete="name" value={form.name} onChange={set('name')} placeholder="Your full name" aria-invalid={!!errors.name} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>

          <label className="field">
            <span className="field-label">Phone number</span>
            <input type="tel" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="10-digit mobile number" aria-invalid={!!errors.phone} />
            {errors.phone && <span className="field-error">{errors.phone}</span>}
          </label>

          <label className="field">
            <span className="field-label">Email (optional)</span>
            <input type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@example.com" aria-invalid={!!errors.email} />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </label>

          <label className="field">
            <span className="field-label">Location</span>
            <input type="text" autoComplete="address-level2" value={form.location} onChange={set('location')} placeholder="City / area" aria-invalid={!!errors.location} />
            {errors.location && <span className="field-error">{errors.location}</span>}
          </label>

          <div className="field">
            <span className="field-label">I am a</span>
            <div className="buyer-type-group" role="group" aria-label="I am a">
              {WHO.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`buyer-type-btn${form.buyerType === t.key ? ' is-selected' : ''}`}
                  aria-pressed={form.buyerType === t.key}
                  onClick={() => chooseWho(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {errors.buyerType && <span className="field-error">{errors.buyerType}</span>}
          </div>

          <div className="field">
            <span className="field-label">Requirement (choose one or more)</span>
            <div className="buyer-type-group" role="group" aria-label="Requirement">
              {NEEDS.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  className={`buyer-type-btn${form.requirements.includes(n.key) ? ' is-selected' : ''}`}
                  aria-pressed={form.requirements.includes(n.key)}
                  onClick={() => toggleNeed(n.key)}
                >
                  {n.label}
                </button>
              ))}
            </div>
            {errors.requirements && <span className="field-error">{errors.requirements}</span>}
          </div>

          <button className="btn-maroon" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>

          {submitError && <p className="field-error" role="alert">{submitError}</p>}
        </form>
      </div>
    </main>
  )
}
