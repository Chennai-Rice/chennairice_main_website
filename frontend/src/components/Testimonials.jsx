import { useEffect, useState } from 'react'
import Img from './Img.jsx'
import Ornament from './Ornament.jsx'
import { ASSETS, TESTIMONIALS } from '../data/content.js'
import './testimonials.css'

const AUTOPLAY_MS = 4000

const Star = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#d9a833" aria-hidden="true">
    <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
  </svg>
)

const Arrow = ({ dir = 'left' }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d={dir === 'left' ? 'M15 5L8 12l7 7' : 'M9 5l7 7-7 7'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const visibleFor = w => (w <= 900 ? 1 : w <= 1250 ? 2 : 4)

export default function Testimonials() {
  const [visible, setVisible] = useState(4)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // how many cards fit at this width
  useEffect(() => {
    const measure = () => setVisible(visibleFor(window.innerWidth))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const maxIndex = Math.max(0, TESTIMONIALS.length - visible)

  // keep the index in range when the card count changes
  useEffect(() => {
    setIndex(i => Math.min(i, maxIndex))
  }, [maxIndex])

  // auto-advance, looping back to the start; paused on hover/focus
  useEffect(() => {
    if (paused || maxIndex === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setIndex(i => (i >= maxIndex ? 0 : i + 1)), AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [paused, maxIndex])

  const prev = () => setIndex(i => (i <= 0 ? maxIndex : i - 1))
  const next = () => setIndex(i => (i >= maxIndex ? 0 : i + 1))

  return (
    <section
      className="testi"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Img className="testi-decor testi-decor-left" src={ASSETS.wheatLeft} alt="" aria-hidden="true" />
      <Img className="testi-decor testi-decor-right" src={ASSETS.riceBowl} alt="" aria-hidden="true" />

      <div className="section-label testi-label">
        <Ornament />
        <span>What Our Customers Say</span>
        <Ornament flip />
      </div>

      <div className="container testi-shell">
        <div className="testi-viewport">
          <div
            className="testi-track"
            style={{ '--i': index, '--visible': visible }}
            aria-live="polite"
          >
            {TESTIMONIALS.map((t, i) => {
              const shown = i >= index && i < index + visible
              return (
                <div className="testi-slot" key={t.name} aria-hidden={!shown}>
                  <article className="testi-card">
                    <div className="testi-head">
                      <Img className="testi-avatar" src={t.avatar} alt={t.name} />
                      <div className="testi-who">
                        <div className="testi-name">{t.name}</div>
                        <div className="testi-city">{t.city}</div>
                        <div className="testi-stars">
                          {Array.from({ length: 5 }, (_, s) => (
                            <Star key={s} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="testi-quote">
                      <span className="testi-mark">&ldquo;</span>
                      {t.quote}
                      <span className="testi-mark">&rdquo;</span>
                    </p>
                  </article>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button className="circle-arrow testi-arrow testi-arrow-prev" onClick={prev} aria-label="Previous testimonials">
        <Arrow dir="left" />
      </button>
      <button className="circle-arrow testi-arrow testi-arrow-next" onClick={next} aria-label="Next testimonials">
        <Arrow dir="right" />
      </button>

      <div className="testi-dots">
        {Array.from({ length: maxIndex + 1 }, (_, i) => (
          <button
            key={i}
            className={`testi-dot${i === index ? ' is-active' : ''}`}
            onClick={() => setIndex(i)}
            aria-label={`Go to testimonial group ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
