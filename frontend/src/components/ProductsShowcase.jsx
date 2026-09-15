import { useCallback, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useGsapContext from '../hooks/useGsapContext.js'
import Img from './Img.jsx'
import Ornament from './Ornament.jsx'
import SectionHead from './SectionHead.jsx'
import { ASSETS, PRODUCTS, SHOWCASE } from '../data/content.js'
import './productsshowcase.css'

gsap.registerPlugin(ScrollTrigger)

// The pinned timeline runs one unit per product plus the last product's hold,
// so its total duration is PRODUCTS.length - 1 + 0.62.
const TIMELINE_DURATION = PRODUCTS.length - 1 + 0.62
// A product is centred ~0.31 into its unit, and hands over ~0.8 into it.
const centreProgress = i => (i + 0.31) / TIMELINE_DURATION
const handoverProgress = i => (i + 0.8) / TIMELINE_DURATION

// The intro and closing CTA slides are kept out of the carousel. Flip this to
// true and give them their own timeline slots to bring them back.
const SHOW_INTRO_AND_CTA_SLIDES = false

// Resting state of each layer once it reaches the centre of the frame. The
// background word sits at 0.05 opacity by design (see .huge-bg-text).
const BAG_REST = { xPercent: 0, yPercent: 0, opacity: 1, rotation: 0, scale: 1 }
const TEXT_REST = { xPercent: 0, yPercent: 0, opacity: 0.05, scale: 1 }
const COPY_REST = { x: 0, y: 0, opacity: 1, scale: 1 }

/**
 * One choreography per product, applied by slide order. Each entry owns three
 * moments — how the bag arrives, how it drifts while centred, and how it
 * leaves — plus matching motion for the background word and the copy columns.
 *
 * hold deliberately animates a property that entry/exit leave alone, so the
 * two never fight over the same part of the transform.
 */
const MOTIONS = [
  {
    // 01 — Vada Kolam: sweeps across the frame, left to right.
    bagEnter: { xPercent: -130, opacity: 0, rotation: -12, scale: 0.8 },
    bagExit: { xPercent: 130, opacity: 0, rotation: 12, scale: 0.85 },
    hold: { yPercent: -5 },
    enterEase: 'power2.out',
    exitEase: 'power2.in',
    textEnter: { xPercent: -8, opacity: 0 },
    textExit: { xPercent: 8, opacity: 0 },
    copyEnter: { y: 30, opacity: 0 },
    copyExit: { y: -20, opacity: 0 },
  },
  {
    // 02 — Ponni: rises from below and lifts away upward.
    bagEnter: { yPercent: 120, opacity: 0, rotation: 6, scale: 0.85 },
    bagExit: { yPercent: -120, opacity: 0, rotation: -6, scale: 0.7 },
    hold: { xPercent: 4 },
    enterEase: 'power3.out',
    exitEase: 'power3.in',
    textEnter: { yPercent: 14, opacity: 0 },
    textExit: { yPercent: -14, opacity: 0 },
    copyEnter: { y: 55, opacity: 0 },
    copyExit: { y: -45, opacity: 0 },
  },
  {
    // 03 — Basmati: mirrors slide 01, entering from the right.
    bagEnter: { xPercent: 130, opacity: 0, rotation: 14, scale: 0.8 },
    bagExit: { xPercent: -130, opacity: 0, rotation: -14, scale: 0.85 },
    hold: { yPercent: -5 },
    enterEase: 'power2.out',
    exitEase: 'power2.in',
    textEnter: { xPercent: 8, opacity: 0 },
    textExit: { xPercent: -8, opacity: 0 },
    copyEnter: { x: 45, opacity: 0 },
    copyExit: { x: -45, opacity: 0 },
  },
  {
    // 04 — Raw Rice: zooms in from the distance and pushes past the viewer.
    bagEnter: { scale: 0.35, opacity: 0, rotation: -18 },
    bagExit: { scale: 1.7, opacity: 0, rotation: 10 },
    hold: { yPercent: -4 },
    enterEase: 'back.out(1.4)',
    exitEase: 'power2.in',
    textEnter: { scale: 1.3, opacity: 0 },
    textExit: { scale: 0.8, opacity: 0 },
    copyEnter: { y: 30, opacity: 0, scale: 0.92 },
    copyExit: { y: -20, opacity: 0, scale: 0.96 },
  },
]

/** Builds the "animate back to rest" vars for whichever keys a motion uses. */
function restFor(vars, rest) {
  return Object.keys(vars).reduce((acc, key) => {
    acc[key] = rest[key]
    return acc
  }, {})
}

function ProductSlide({ product, isFirst }) {
  return (
    <div
      className={`showcase-slide product-slide${isFirst ? ' active-slide' : ''}`}
      id={`slide-${product.num}`}
    >
      <div className="huge-bg-text" aria-hidden="true">
        {product.ghost.map(word => (
          <span key={word}>{word}</span>
        ))}
      </div>

      <div className="slide-grid">
        <div className="slide-col slide-left">
          <div className="slide-num">{product.num}</div>
          <div className="slide-cat">
            <span className="slide-cat-rule" />
            {product.shortName}
          </div>
          <p className="slide-desc">{product.desc}</p>
          <div className="slide-buttons">
            <a className="btn-maroon" href="/products">
              View More Products
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 12h15m0 0l-6-6m6 6l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a className="btn-outline" href="/contact">
              Enquire
            </a>
          </div>
        </div>

        <div className="slide-center">
          <div className="product-bag-wrap">
            <Img className="product-bag-img" src={product.image} alt={product.name} />
          </div>
        </div>

        <div className="slide-col slide-right">
          <h3 className="slide-name">{product.name}</h3>
          <div className="spec-item">
            <div className="spec-value">{product.packSize}</div>
            <div className="spec-label">Pack Size</div>
          </div>
          <div className="spec-item">
            <div className="spec-value">{product.riceType}</div>
            <div className="spec-label">Rice Type</div>
          </div>
          <div className="spec-item">
            <div className="spec-value">{product.idealFor}</div>
            <div className="spec-label">Ideal For</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductsShowcase() {
  const sectionRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Jump the scroll so a given product is centred in the pinned frame.
  const goToProduct = useCallback(index => {
    const clamped = Math.max(0, Math.min(PRODUCTS.length - 1, index))
    const trigger = ScrollTrigger.getById('productShowcase')
    if (!trigger) {
      const slide = sectionRef.current?.querySelector(`#slide-${PRODUCTS[clamped].num}`)
      if (slide) slide.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const top = trigger.start + centreProgress(clamped) * (trigger.end - trigger.start)
    window.scrollTo({ top, behavior: 'smooth' })
  }, [])

  useGsapContext(
    () => {
      const section = sectionRef.current
      const slides = PRODUCTS.map(p => section.querySelector(`#slide-${p.num}`))

      // --- Pin the section and scrub one product at a time (mobile and desktop alike) ---
      // Each product owns 1 unit of timeline: it arrives in its own way, holds
      // in the centre, then leaves as the next one arrives. The last product
      // holds until the pin releases.
      const bags = slides.map(s => s && s.querySelector('.product-bag-img'))
      const bgTexts = slides.map(s => s && s.querySelector('.huge-bg-text'))
      const copies = slides.map(s => s && s.querySelectorAll('.slide-left > *, .slide-right > *'))

      // Park every product off-stage in its own starting pose, then place the
      // first one at rest so the section is correct before the first scroll.
      gsap.set(slides, { autoAlpha: 0 })
      PRODUCTS.forEach((product, index) => {
        const motion = MOTIONS[index % MOTIONS.length]
        gsap.set(bags[index], motion.bagEnter)
        gsap.set(bgTexts[index], motion.textEnter)
        gsap.set(copies[index], motion.copyEnter)
      })

      const firstMotion = MOTIONS[0]
      gsap.set(slides[0], { autoAlpha: 1 })
      gsap.set(bags[0], restFor(firstMotion.bagEnter, BAG_REST))
      gsap.set(bgTexts[0], restFor(firstMotion.textEnter, TEXT_REST))
      gsap.set(copies[0], restFor(firstMotion.copyEnter, COPY_REST))
      gsap.set(section, { backgroundColor: PRODUCTS[0].tint })

      const timeline = gsap.timeline({
        scrollTrigger: {
          id: 'productShowcase',
          trigger: section,
          start: 'top top',
          end: () => `+=${PRODUCTS.length * 100}%`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          // Read-only: drives the pager, never touches the tweens below.
          onUpdate: self => {
            let index = PRODUCTS.length - 1
            for (let i = 0; i < PRODUCTS.length - 1; i += 1) {
              if (self.progress < handoverProgress(i)) {
                index = i
                break
              }
            }
            setActiveIndex(index)
          },
        },
      })

      PRODUCTS.forEach((product, index) => {
        const slide = slides[index]
        if (!slide) return

        const motion = MOTIONS[index % MOTIONS.length]
        const start = index
        const exit = start + 0.62
        const isLast = index === PRODUCTS.length - 1

        // --- Enter: this product's own arrival ---
        if (index > 0) {
          timeline.set(slide, { autoAlpha: 1 }, start)
          timeline.to(
            section,
            { backgroundColor: product.tint, duration: 0.35, ease: 'none' },
            start - 0.2
          )
          timeline.fromTo(
            bags[index],
            motion.bagEnter,
            { ...restFor(motion.bagEnter, BAG_REST), duration: 0.38, ease: motion.enterEase },
            start
          )
          timeline.fromTo(
            bgTexts[index],
            motion.textEnter,
            { ...restFor(motion.textEnter, TEXT_REST), duration: 0.38, ease: motion.enterEase },
            start
          )
          timeline.fromTo(
            copies[index],
            motion.copyEnter,
            {
              ...restFor(motion.copyEnter, COPY_REST),
              duration: 0.32,
              stagger: 0.05,
              ease: 'power3.out',
            },
            start + 0.08
          )
        }

        // --- Hold: a slow drift so the centre never feels static ---
        timeline.to(bags[index], { ...motion.hold, duration: 0.62, ease: 'none' }, start)

        if (isLast) return

        // --- Exit: this product's own departure ---
        timeline.to(bags[index], { ...motion.bagExit, duration: 0.38, ease: motion.exitEase }, exit)
        timeline.to(
          bgTexts[index],
          { ...motion.textExit, duration: 0.38, ease: motion.exitEase },
          exit
        )
        timeline.to(
          copies[index],
          { ...motion.copyExit, duration: 0.3, stagger: 0.04, ease: 'power2.in' },
          exit
        )
        timeline.set(slide, { autoAlpha: 0 }, exit + 0.38)
      })
    },
    sectionRef,
    []
  )

  return (
    <section id="products" className="products-showcase-section" ref={sectionRef}>
      <div className="showcase-pin-container">
        <Img
          className="showcase-paddy showcase-paddy-a"
          src={ASSETS.wheatRight}
          alt=""
          aria-hidden="true"
        />
        <Img
          className="showcase-paddy showcase-paddy-b"
          src={ASSETS.wheatLeft}
          alt=""
          aria-hidden="true"
        />

        {/* Heading rides inside the pinned frame, so it stays above the
            products the whole way through the carousel. */}
        <div className="showcase-header">
          <SectionHead label="Our Best Sellers" title="Finest Rice, Finest Life" />
        </div>

        {SHOW_INTRO_AND_CTA_SLIDES && (
          <div className="showcase-slide showcase-intro" aria-hidden="true">
            <div className="slide-col slide-center-col">
              <div className="section-label">
                <Ornament />
                <span>Since 1950</span>
                <Ornament flip />
              </div>
              <h3 className="showcase-cta-title">{SHOWCASE.introTitle}</h3>
              <p className="showcase-cta-text">{SHOWCASE.introText}</p>
            </div>
          </div>
        )}

        {PRODUCTS.map((product, index) => (
          <ProductSlide key={product.num} product={product} isFirst={index === 0} />
        ))}

        {SHOW_INTRO_AND_CTA_SLIDES && (
          <div className="showcase-slide showcase-cta">
            <div className="slide-col slide-center-col">
              <h3 className="showcase-cta-title">{SHOWCASE.ctaTitle}</h3>
              <p className="showcase-cta-text">{SHOWCASE.ctaText}</p>
              <a className="btn-maroon" href="/products">
                {SHOWCASE.ctaButton}
              </a>
            </div>
          </div>
        )}

        <div className="showcase-pagination" role="tablist" aria-label="Products">
          {PRODUCTS.map((product, index) => (
            <button
              key={product.num}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`showcase-page${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => goToProduct(index)}
            >
              {product.num}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
