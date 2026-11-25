import { useEffect, useState } from 'react'
import Ornament from './Ornament.jsx'
import './testimonials.css'

// "What Our Customers Say" on the home page: real reviews from customers, sent from the Order Delivered email and
// published by staff in /offers → Reviews (GET /api/reviews). Star-only reviews (no words) are left out here, long
// ones are cut to a few lines with "Read more". With no published written review the section is not shown at all
// (the made-up cards it used to have were removed, 25 Nov 2026).

const AUTOPLAY_MS = 5000
const LONG = 180 // characters: longer reviews start folded

const Star = ({ filled = true }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? '#d9a833' : 'none'} stroke="#d9a833"
    strokeWidth={filled ? 0 : 1.6} strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
  </svg>
)

const Arrow = ({ dir = 'left' }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 5L8 12l7 7' : 'M9 5l7 7-7 7'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const visibleFor = (w) => (w <= 900 ? 1 : w <= 1250 ? 2 : 4)

// "PRADEEP" / "TIRUVALLUR" (typed in capitals) → "Pradeep" / "Tiruvallur"; mixed case is left as typed.
const tidy = (s) => {
  const v = String(s || '').trim().replace(/\s+/g, ' ')
  return v && v === v.toUpperCase() && /[A-Z]/.test(v) ? v.toLowerCase().replace(/(^|[\s.(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : v
}
const initials = (name) => tidy(name).split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'C'

/** Published reviews that have words, newest first. */
export function writtenReviews(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => ({ ...r, text: String(r.text || '').trim(), rating: Math.min(5, Math.max(1, Number(r.rating) || 5)) }))
    .filter((r) => r.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3)
}

function Card({ review, onToggle }) {
  const [open, setOpen] = useState(false)
  const long = review.text.length > LONG
  const toggle = () => { setOpen((o) => !o); onToggle?.(!open) }
  const product = String(review.products || '').split(',')[0].trim()
  return (
    <article className="testi-card">
      <div className="testi-head">
        <div className="testi-avatar testi-initials" aria-hidden="true">{initials(review.name)}</div>
        <div className="testi-who">
          <div className="testi-name">{tidy(review.name)}</div>
          {review.city && <div className="testi-city">{tidy(review.city)}</div>}
          <div className="testi-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, s) => <Star key={s} filled={s < review.rating} />)}
          </div>
        </div>
      </div>
      <p className={`testi-quote${long && !open ? ' is-folded' : ''}`}>
        <span className="testi-mark">&ldquo;</span>
        {review.text}
        <span className="testi-mark">&rdquo;</span>
      </p>
      {long && (
        <button type="button" className="testi-more" onClick={toggle} aria-expanded={open}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
      {product && <div className="testi-product">Verified buyer · {product}</div>}
    </article>
  )
}

export default function Testimonials() {
  const [reviews, setReviews] = useState(null)
  const [visible, setVisible] = useState(4)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reading, setReading] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/reviews', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((body) => { if (live) setReviews(writtenReviews(body.reviews)) })
      .catch(() => { if (live) setReviews([]) })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const measure = () => setVisible(visibleFor(window.innerWidth))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const count = reviews?.length || 0
  const shown = Math.min(visible, Math.max(count, 1))
  const maxIndex = Math.max(0, count - shown)

  useEffect(() => { setIndex((i) => Math.min(i, maxIndex)) }, [maxIndex])

  // Auto-advance; stops on hover/focus and while a review is opened with "Read more".
  useEffect(() => {
    if (paused || reading || maxIndex === 0) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const id = setInterval(() => setIndex((i) => (i >= maxIndex ? 0 : i + 1)), AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [paused, reading, maxIndex])

  if (!count) return null

  const prev = () => setIndex((i) => (i <= 0 ? maxIndex : i - 1))
  const next = () => setIndex((i) => (i >= maxIndex ? 0 : i + 1))

  return (
    <section
      className="testi"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="section-label testi-label">
        <Ornament />
        <h2 className="testi-heading">What Our Customers Say</h2>
        <Ornament flip />
      </div>

      <div className="container testi-shell">
        <div className="testi-viewport">
          <div className="testi-track" style={{ '--i': index, '--visible': shown }} aria-live="polite">
            {reviews.map((r, i) => (
              <div className="testi-slot" key={`${r.name}-${r.date}-${i}`} aria-hidden={!(i >= index && i < index + shown)}>
                <Card review={r} onToggle={setReading} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {maxIndex > 0 && (
        <>
          <button className="circle-arrow testi-arrow testi-arrow-prev" onClick={prev} aria-label="Previous reviews"><Arrow dir="left" /></button>
          <button className="circle-arrow testi-arrow testi-arrow-next" onClick={next} aria-label="Next reviews"><Arrow dir="right" /></button>
          <div className="testi-dots">
            {Array.from({ length: maxIndex + 1 }, (_, i) => (
              <button key={i} className={`testi-dot${i === index ? ' is-active' : ''}`} onClick={() => setIndex(i)} aria-label={`Go to review group ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
