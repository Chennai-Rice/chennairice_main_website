import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ASSETS, HERO, PRODUCTS } from '../data/content.js'
import './hero.css'

/* The hero film does not end on footage. It cuts to a white card carrying
   the company logo and holds it there until the loop restarts — so the
   cream headline, left alone, sits illegibly on white and across the mark
   itself. It is faded out to meet that cut and brought back on the loop.

   Measured against public/assets/hero.mp4 (44.9s long): the cut is hard,
   no dissolve, 2.7s before the end. OUTRO_SECONDS is counted back from the
   end rather than written as an absolute timestamp, so re-encoding the file
   — which moves its duration by a fraction of a second — cannot drift the
   fade away from the cut it exists to serve.

   FADE_SECONDS mirrors the transition on .hero-content in hero.css. It is
   subtracted as well as OUTRO_SECONDS so the headline finishes fading as
   the card arrives, instead of only starting to fade once it is already
   on screen. */
const OUTRO_SECONDS = 2.7
const FADE_SECONDS = 0.7

export default function Hero() {
  const [videoFailed, setVideoFailed] = useState(false)
  const [outro, setOutro] = useState(false)
  // The film is about 7 MB. It starts only after the page has loaded (so the text, images and scripts
  // arrive first and the page is usable sooner), and never on a data-saver or very slow connection,
  // where the warm gradient behind the headline stays.
  const [videoSrc, setVideoSrc] = useState(null)
  const videoRef = useRef(null)

  useEffect(() => {
    const net = navigator.connection
    if (net?.saveData || /(^|-)2g$/.test(net?.effectiveType || '')) return undefined
    let timer
    const start = () => { timer = window.setTimeout(() => setVideoSrc(ASSETS.heroVideo), 500) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => { window.clearTimeout(timer); window.removeEventListener('load', start) }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      // No film, so no logo card to make room for.
      setOutro(false)
      return undefined
    }

    /* Read per frame rather than on 'timeupdate', which fires roughly four
       times a second: a quarter-second of slack is enough to leave the
       headline still half-lit when the card cuts in. React drops a
       setState that does not change the value, so this does not re-render
       sixty times a second — it re-renders twice per loop. */
    let frame = requestAnimationFrame(function tick() {
      const { duration, currentTime } = video
      // duration is NaN until metadata arrives, and NaN fails this test.
      if (duration > OUTRO_SECONDS + FADE_SECONDS) {
        setOutro(currentTime >= duration - OUTRO_SECONDS - FADE_SECONDS)
      }
      frame = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(frame)
  }, [videoFailed])

  return (
    <section className="home-hero" id="home">
      {!videoFailed && (
        <video
          ref={videoRef}
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src={videoSrc || undefined}
          onError={() => { if (videoSrc) setVideoFailed(true) }}
        />
      )}
      {videoFailed && <div className="hero-fallback" />}

      <div className="hero-overlay" />

      <div className={`hero-content${outro ? ' is-outro' : ''}`}>
        {/* A small styled line, then the page heading (H1), the brand intro and the two ways in. */}
        <p className="hero-tagline">{HERO.tagline}</p>
        <h1 className="home-hero-h1">{HERO.h1}</h1>
        <p className="home-hero-sub">{HERO.intro}</p>
        <div className="hero-ctas">
          {HERO.ctas.map((c) => (
            <Link key={c.to} to={c.to} className={`hero-cta${c.primary ? ' is-primary' : ''}`}>{c.label}</Link>
          ))}
        </div>
      </div>

      <div className="hero-estd">
        <div className="hero-estd-ring">
          <span className="hero-estd-label">Estd</span>
          <span className="hero-estd-year">{HERO.estd}</span>
        </div>
      </div>

      <svg className="hero-curve" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true">
        {/* Filled with the first showcase product's tint, which is the colour
            the section directly below opens on. A fixed cream here drew a
            hard line across the page the moment slot 01 became a pack with a
            cool tint; tying the two together keeps them continuous whichever
            product leads. */}
        <path
          d="M0,88 C240,34 520,18 810,34 C1080,49 1290,84 1440,64 L1440,150 L0,150 Z"
          fill={PRODUCTS[0]?.tint || '#f8f3e9'}
        />
        <path
          d="M0,88 C240,34 520,18 810,34 C1080,49 1290,84 1440,64"
          fill="none"
          stroke="url(#heroGoldRim)"
          strokeWidth="8"
          vectorEffect="non-scaling-stroke"
        />
        <defs>
          <linearGradient id="heroGoldRim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a6a25" />
            <stop offset="0.35" stopColor="#e3c878" />
            <stop offset="0.65" stopColor="#c69a3f" />
            <stop offset="1" stopColor="#8a6a25" />
          </linearGradient>
        </defs>
      </svg>
    </section>
  )
}
