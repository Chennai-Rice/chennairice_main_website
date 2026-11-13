import { useState } from 'react'
import { trackMetaEvent } from '../services/metaPixel.js'
import Ornament from './../components/Ornament.jsx'
import { FOOTER } from '../data/content.js'
import './page.css'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import { PAGE_META } from '../seo.js'

/*
  Contact (Nov 2026): one form for every kind of visitor. They choose their segment in the dropdown
  (the same keys and labels the server knows, backend/lib/enquiries.js — every segment of the owner's
  lead list) and the message hint follows. Segment, name, mobile and a message are needed; email and
  city are optional.
*/
const TRADE = 'Varieties, quantities and your delivery location.'
const TOPICS = [
  { key: 'customer', label: 'Customer', hint: 'Buying rice, a question about an order, or feedback — tell us here.' },
  { key: 'wholesaler', label: 'Wholesaler', hint: TRADE },
  { key: 'retailer', label: 'Retailer', hint: 'Your shop, its area, and the rice and pack sizes you need.' },
  { key: 'distributor', label: 'Distributor', hint: 'Your area, your business and how you sell today.' },
  { key: 'wholesale_distributors', label: 'Wholesale Distributors', hint: TRADE },
  { key: 'sudehy', label: 'SuDeHy (Supermarket / Hypermarket / Departmental Stores)', hint: 'Your stores, their locations, and the rice and pack sizes you need.' },
  { key: 'horeca', label: 'HoReCa (Hotels, Restaurants, Caterers)', hint: 'Your business, the rice you use and how much each month.' },
  { key: 'batter_making', label: 'Batter Making', hint: 'The rice you use for batter, and how much each month.' },
  { key: 'exporters', label: 'Exporters', hint: 'Varieties, quantities, destination country and packing.' },
  { key: 'rice_millers', label: 'Rice Millers', hint: 'What you are looking for, and quantities.' },
  { key: 'retail_consumers', label: 'Retail Consumers', hint: 'Buying rice, a question about an order, or feedback — tell us here.' },
  { key: 'b2c', label: 'B2C', hint: 'How can we help?' },
  { key: 'na', label: 'NA', hint: 'How can we help?' },
]

const EMPTY = { name: '', phone: '', email: '', city: '', enquiry: '' }
const WHATSAPP = 'https://wa.me/' + FOOTER.phone.replace(/\D/g, '')

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
    {kind === 'whatsapp' && (
      <>
        <path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-3.9-1z" />
        <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.6-2-1-.8.8a4 4 0 01-1.9-1.9l.8-.8-1-2L9 9.5z" />
      </>
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
  usePageMeta(PAGE_META.contact.title, PAGE_META.contact.description)
  const [topic, setTopic] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const current = TOPICS.find((t) => t.key === topic)

  const set = key => e => {
    setForm(f => ({ ...f, [key]: e.target.value }))
    setErrors(x => ({ ...x, [key]: undefined }))
    setSent(false)
  }

  const validate = () => {
    const next = {}
    if (!current) next.topic = 'Please select a segment.'
    if (!form.name.trim()) next.name = 'Please tell us your name.'
    if (!form.phone.trim()) next.phone = 'Please add a mobile number so we can call you back.'
    else if (!/^[+()\-\s\d]{8,16}$/.test(form.phone.trim()))
      next.phone = 'That phone number does not look right.'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = 'That email address does not look right.'
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
        body: JSON.stringify({ ...form, topic }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send your message.')
      trackMetaEvent('Lead', { content_name: 'Contact enquiry: ' + current.label })
      setSent(true)
      setForm(EMPTY)
      setTopic('')
    } catch (err) {
      setSubmitError(err.message || 'Could not send your message. Please try again.')
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
        <h1 className="page-title">{PAGE_META.contact.h1}</h1>
        <p className="page-text">
          Whether you buy for your family, run a shop, a hotel or a distribution business — tell us who
          you are and what you need, and the right person will get back to you.
        </p>

        <div className="contact-grid">
          <form className="contact-form" onSubmit={onSubmit} noValidate>
            <label className="field">
              <span className="field-label">Segment</span>
              <select
                value={topic}
                onChange={(e) => { setTopic(e.target.value); setErrors((x) => ({ ...x, topic: undefined })); setSent(false) }}
                aria-invalid={!!errors.topic}
              >
                <option value="" disabled>Select a segment</option>
                {TOPICS.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              {errors.topic && <span className="field-error">{errors.topic}</span>}
            </label>

            <div className="contact-two">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Your full name"
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </label>

              <label className="field">
                <span className="field-label">Mobile</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </label>
            </div>

            <div className="contact-two">
              <label className="field">
                <span className="field-label">Email <em className="field-optional">(optional)</em></span>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </label>

              <label className="field">
                <span className="field-label">City / PIN <em className="field-optional">(optional)</em></span>
                <input
                  type="text"
                  value={form.city}
                  onChange={set('city')}
                  placeholder="e.g. Erode 638001"
                  autoComplete="address-level2"
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Message</span>
              <textarea
                rows="5"
                value={form.enquiry}
                onChange={set('enquiry')}
                placeholder={current ? current.hint : 'How can we help?'}
                aria-invalid={!!errors.enquiry}
              />
              {errors.enquiry && <span className="field-error">{errors.enquiry}</span>}
            </label>

            <button className="btn-maroon" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Message'}
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
                Thank you — your message has been sent. Our team will get back to you shortly.
              </p>
            )}
          </form>

          <aside className="contact-aside">
            <h2 className="contact-aside-title">Chennai Rice Industries</h2>
            <p className="contact-aside-note">Prefer to talk? Call or WhatsApp us.</p>
            {/* Actionable rather than plain text: on a phone these are the things a visitor wants to
                tap. tel: and wa.me take the number without spaces. */}
            <div className="contact-row">
              <Icon kind="phone" />
              <a href={`tel:${FOOTER.phone.replace(/\s/g, '')}`}>{FOOTER.phone}</a>
            </div>
            <div className="contact-row">
              <Icon kind="whatsapp" />
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
            </div>
            <div className="contact-row">
              <Icon kind="mail" />
              <a href={`mailto:${FOOTER.email}`}>{FOOTER.email}</a>
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
