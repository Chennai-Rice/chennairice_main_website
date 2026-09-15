import { useState } from 'react'
import Ornament from './../components/Ornament.jsx'
import { FOOTER } from '../data/content.js'
import './page.css'

const EMPTY = { name: '', email: '', phone: '', enquiry: '' }

const Icon = ({ kind }) => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {kind === 'phone' && (
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 006 6l1.5-2 4 1.5v3c0 1-.8 1.8-1.8 1.7A16.5 16.5 0 014.8 5.3c-.1-1 .7-1.8 1.7-1.8z" />
    )}
    {kind === 'mail' && (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
        <path d="M3.6 7l8.4 6 8.4-6" />
      </>
    )}
    {kind === 'pin' && (
      <>
        <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </>
    )}
  </svg>
)

export default function ContactPage() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const set = key => e => {
    setForm(f => ({ ...f, [key]: e.target.value }))
    setErrors(x => ({ ...x, [key]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Please tell us your name.'
    if (!form.email.trim()) next.email = 'Please add an email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = 'That email address does not look right.'
    if (!form.phone.trim()) next.phone = 'Please add a phone number.'
    else if (!/^[+()\-\s\d]{8,16}$/.test(form.phone.trim()))
      next.phone = 'That phone number does not look right.'
    if (!form.enquiry.trim()) next.enquiry = 'Please tell us what you need.'
    return next
  }

  const onSubmit = async e => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send your enquiry.')
      setSent(true)
      setForm(EMPTY)
    } catch (err) {
      setSubmitError(err.message || 'Could not send your enquiry. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        <div className="section-label">
          <Ornament />
          <span>Reach Us</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">Get in Touch</h1>
        <p className="page-text">
          Tell us what you need and our team will get back to you.
        </p>

        <div className="contact-grid">
          <form className="contact-form" onSubmit={onSubmit} noValidate>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="Your full name"
                aria-invalid={!!errors.name}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>

            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </label>

            <label className="field">
              <span className="field-label">Phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+91 12345 67890"
                aria-invalid={!!errors.phone}
              />
              {errors.phone && <span className="field-error">{errors.phone}</span>}
            </label>

            <label className="field">
              <span className="field-label">Enquiry</span>
              <textarea
                rows="5"
                value={form.enquiry}
                onChange={set('enquiry')}
                placeholder="Quantities, varieties, delivery location…"
                aria-invalid={!!errors.enquiry}
              />
              {errors.enquiry && <span className="field-error">{errors.enquiry}</span>}
            </label>

            <button className="btn-maroon" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Enquiry'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 12h15m0 0l-6-6m6 6l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {submitError && (
              <p className="field-error" role="alert">
                {submitError}
              </p>
            )}

            {sent && (
              <p className="field-sent" role="status">
                Thank you — your enquiry has been sent. Our team will get back to you shortly.
              </p>
            )}
          </form>

          <aside className="contact-aside">
            <h2 className="contact-aside-title">Chennai Rice Industries</h2>
            <div className="contact-row">
              <Icon kind="phone" />
              <span>{FOOTER.phone}</span>
            </div>
            <div className="contact-row">
              <Icon kind="mail" />
              <span>{FOOTER.email}</span>
            </div>
            <div className="contact-row">
              <Icon kind="pin" />
              <span>
                {FOOTER.address.map(line => (
                  <span className="contact-addr" key={line}>
                    {line}
                  </span>
                ))}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
