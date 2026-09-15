import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Img from '../../components/Img.jsx'
import { INFRA_ASSETS, SHOWCASE_SLIDES, SHOWCASE_STATS, SHOWCASE_CARDS } from '../../data/infrastructure.js'

const ArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* Thin-line icons for the stat strip — drawn, never emoji, so they recolour. */
const STAT_ICONS = {
  capacity: (
    <>
      <path d="M3 21h18M5 21V9l5-3 5 3v12M9 21v-4h2v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 21V11l4-2v12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  storage: (
    <>
      <path d="M5 21V8.5L12 4l7 4.5V21" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21h14M9 21v-6h6v6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  silos: (
    <>
      <path d="M7 21V10a5 5 0 0 1 10 0v11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16M7 14h10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  stages: (
    <>
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.4 12.4l2.5 2.5 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.4 19.2c0-3.1 2.5-5.2 5.6-5.2s5.6 2.1 5.6 5.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.4 14.4c2.1.6 3.4 2.4 3.4 4.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
}

/* Icons for the six capability cards, in the round burgundy badge. */
const CARD_ICONS = {
  processing: <path d="M4 21h16M6 21V11l4-2.5V21M14 21V8l4-2.5V21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  storage: <path d="M7 21V10a5 5 0 0 1 10 0v11M4 21h16M7 14h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  quality: (
    <>
      <circle cx="10.5" cy="10.5" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.6 14.6L20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  sourcing: (
    <>
      <path d="M12 21V10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 10c0-3.5 2.6-6 6-6 0 3.5-2.6 6-6 6zm0 3c0-3-2.4-5.4-5.4-5.4C6.6 10.6 9 13 12 13z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  logistics: (
    <>
      <path d="M2.6 16.4V7h10v9.4M12.6 10.4h4l3 3.2v2.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="17.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.6" cy="17.6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  packaging: (
    <>
      <path d="M3.6 7.6L12 3.6l8.4 4v8.8L12 20.4l-8.4-4V7.6z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3.6 7.6L12 11.6l8.4-4M12 11.6v8.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
}

/* Decorative wheat stalk — drawn so it scales and recolours with the palette. */
const WheatStalk = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 120 300" fill="none" aria-hidden="true">
    <path d="M60 300V60" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <g stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none">
      <path d="M60 78c-15-6-24-19-24-34 15 2 24 13 24 28zM60 78c15-6 24-19 24-34-15 2-24 13-24 28z" />
      <path d="M60 118c-15-6-24-19-24-34 15 2 24 13 24 28zM60 118c15-6 24-19 24-34-15 2-24 13-24 28z" />
      <path d="M60 158c-15-6-24-19-24-34 15 2 24 13 24 28zM60 158c15-6 24-19 24-34-15 2-24 13-24 28z" />
      <path d="M60 198c-15-6-24-19-24-34 15 2 24 13 24 28zM60 198c15-6 24-19 24-34-15 2-24 13-24 28z" />
    </g>
  </svg>
)

const Divider = () => (
  <svg className="ish-divider" width="60" height="10" viewBox="0 0 60 10" fill="none" aria-hidden="true">
    <path d="M0 5h22" stroke="currentColor" strokeWidth="1" />
    <circle cx="30" cy="5" r="3" stroke="currentColor" strokeWidth="1" fill="none" />
    <path d="M38 5h22" stroke="currentColor" strokeWidth="1" />
  </svg>
)

const SLIDE_MS = 6000

/**
 * Editorial showcase that opens the Infrastructure page: a rotating hero,
 * a floating stat strip that overlaps it, and a six-card capability grid.
 *
 * Every figure comes from data/infrastructure.js and every photograph from
 * /public/assets — nothing here is invented.
 */
export default function InfraShowcase() {
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = SHOWCASE_SLIDES.length

  const go = useCallback(next => setSlide(prev => (prev + next + count) % count), [count])

  // Auto-advance, paused on hover/focus and when the tab is hidden.
  useEffect(() => {
    if (paused || count < 2) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return
    const id = window.setInterval(() => setSlide(prev => (prev + 1) % count), SLIDE_MS)
    return () => window.clearInterval(id)
  }, [paused, count])

  const active = SHOWCASE_SLIDES[slide]

  return (
    <section className="ish" aria-label="Infrastructure overview">
      <WheatStalk className="ish-wheat ish-wheat--hero" />

      {/* ---------------- hero ---------------- */}
      <div className="infra-wrap">
        <div
          className="ish-hero"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <div className="ish-hero-media">
            {SHOWCASE_SLIDES.map((item, index) => (
              <Img
                key={item.id}
                className={index === slide ? 'is-active' : ''}
                src={INFRA_ASSETS[item.image]}
                fallback={INFRA_ASSETS.fallback}
                alt={item.alt}
              />
            ))}
          </div>

          <div className="ish-hero-body">
            <span className="infra-eyebrow">Our Infrastructure</span>

            <h2 className="infra-title ish-hero-title" key={active.id}>
              {active.titleLines.map(line => (
                <span key={line}>{line}</span>
              ))}
            </h2>

            <Divider />

            <p className="ish-hero-text">{active.text}</p>

            <a className="infra-btn ish-hero-cta" href="#infra-overview">
              Explore Our Infrastructure
              <ArrowRight />
            </a>
          </div>
        </div>

        {/* carousel controls */}
        <div className="ish-controls">
          <button className="ish-arrow" type="button" onClick={() => go(-1)} aria-label="Previous slide">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="ish-dots" role="tablist" aria-label="Choose slide">
            {SHOWCASE_SLIDES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === slide}
                aria-label={item.alt}
                className={`ish-dot${index === slide ? ' is-active' : ''}`}
                onClick={() => setSlide(index)}
              />
            ))}
          </div>

          <button className="ish-arrow" type="button" onClick={() => go(1)} aria-label="Next slide">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* ---------------- stat strip, overlapping the hero ---------------- */}
        <div className="ish-stats infra-reveal">
          {SHOWCASE_STATS.map(stat => (
            <div className="ish-stat" key={stat.label}>
              <svg className="ish-stat-icon" width="27" height="27" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {STAT_ICONS[stat.icon]}
              </svg>
              <div>
                <div className="ish-stat-value">{stat.value}</div>
                <div className="ish-stat-label">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- capability grid ---------------- */}
      <div className="ish-grid-band">
        <WheatStalk className="ish-wheat ish-wheat--left" />
        <WheatStalk className="ish-wheat ish-wheat--right" />

        <div className="infra-wrap">
          <div className="ish-head infra-reveal">
            <span className="infra-eyebrow">World Class Infrastructure</span>
            <h2 className="infra-title ish-head-title">Technology. Quality. Capacity.</h2>
            <Divider />
            <p className="ish-head-text">
              From paddy intake to packaging, our integrated infrastructure protects grain
              condition and consistency at every step.
            </p>
          </div>

          <div className="ish-grid">
            {SHOWCASE_CARDS.map(card => (
              <article className="ish-card infra-reveal" key={card.title}>
                <div className="ish-card-media">
                  <Img src={INFRA_ASSETS[card.image]} fallback={INFRA_ASSETS.fallback} alt={card.alt} />
                  <span className="ish-card-badge">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      {CARD_ICONS[card.icon]}
                    </svg>
                  </span>
                </div>
                <div className="ish-card-body">
                  <h3 className="ish-card-title">{card.title}</h3>
                  <p className="ish-card-text">{card.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- closing band ---------------- */}
      <div className="ish-band">
        <div className="infra-wrap ish-band-inner">
          <svg className="ish-emblem" width="74" height="74" viewBox="0 0 80 80" fill="none" aria-hidden="true">
            <circle cx="40" cy="40" r="37" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="40" cy="40" r="31" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
            <path d="M40 56V32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
              <path d="M40 36c-7-3-11-9-11-16 7 1 11 6 11 13zM40 36c7-3 11-9 11-16-7 1-11 6-11 13z" />
              <path d="M40 46c-7-3-11-9-11-16 7 1 11 6 11 13zM40 46c7-3 11-9 11-16-7 1-11 6-11 13z" />
            </g>
          </svg>

          <div className="ish-band-copy">
            <h2 className="infra-title on-dark ish-band-title">
              Strong Infrastructure.
              <br />
              Stronger Promise.
            </h2>
            <p className="ish-band-text">
              Our infrastructure is the backbone of our promise to deliver the finest rice, always.
            </p>
          </div>

          <Link className="ish-band-cta" to="/products">
            Explore Our Products
            <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  )
}
