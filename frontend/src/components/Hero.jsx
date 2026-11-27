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

/* Which film (owner, 27 Nov 2026: original quality, without buffering). Each screen has an original-quality film
   (streamed, shown once it can play through, swapped for the light one if it stalls) and a light film (downloaded
   whole, played from memory):
   - phones held upright: the 608x918 centre cut. Original quality (3 Mbit/s) on 4G at 4+ Mbit/s, and where the
     browser does not report the speed (iPhones); light on slower connections.
   - larger screens: 1920x918 original quality (7.6 Mbit/s) when Chrome reports 10 Mbit/s (its top reading), or,
     where the speed is not reported, on a large screen; the 1280 light film otherwise. */
const FALLBACK = { [ASSETS.heroVideoHD]: ASSETS.heroVideo, [ASSETS.heroVideoPhoneHD]: ASSETS.heroVideoPhone }
function pickFilm() {
  const net = navigator.connection
  const known = typeof net?.downlink === 'number'
  const phone = window.matchMedia?.('(max-width: 600px) and (orientation: portrait)').matches
  if (phone && ASSETS.heroVideoPhone) {
    const fast = known ? net.downlink >= 4 && net.effectiveType === '4g' : true
    return fast && ASSETS.heroVideoPhoneHD ? ASSETS.heroVideoPhoneHD : ASSETS.heroVideoPhone
  }
  const fast = known ? net.downlink >= 10 && net.effectiveType === '4g' : window.innerWidth >= 1440
  return fast && ASSETS.heroVideoHD ? ASSETS.heroVideoHD : ASSETS.heroVideo
}

export default function Hero() {
  const [videoFailed, setVideoFailed] = useState(false)
  const [outro, setOutro] = useState(false)
  // The film starts only after the page has loaded (so the text, images and scripts
  // arrive first and the page is usable sooner), and never on a data-saver or very slow connection,
  // where the warm gradient behind the headline stays.
  const [videoSrc, setVideoSrc] = useState(null)
  // Which film was chosen (videoSrc can be a blob: address, see below).
  const [film, setFilm] = useState(null)
  const videoRef = useRef(null)
  // Shown only once the browser says it can play to the end without stopping ('canplaythrough'); until then the
  // warm gradient stays, so nobody sees a frozen frame.
  const [ready, setReady] = useState(false)
  // It stalls anyway (the connection slowed): twice within 20 s on an original-quality film → its light film,
  // same moment.
  const stalls = useRef([])
  const onWaiting = () => {
    const v = videoRef.current
    const light = FALLBACK[film]
    if (!v || !ready || !light) return
    const now = Date.now()
    stalls.current = [...stalls.current.filter((t) => now - t < 20000), now]
    if (stalls.current.length >= 2) {
      const at = v.currentTime
      stalls.current = []
      setFilm(light)
      setVideoSrc(light)
      v.addEventListener('loadedmetadata', () => { try { v.currentTime = at } catch { /* starts from the top */ } }, { once: true })
    }
  }

  useEffect(() => {
    const net = navigator.connection
    if (net?.saveData || /(^|-)2g$/.test(net?.effectiveType || '')) return undefined
    let timer
    let blobUrl
    const ctl = new AbortController()
    /* Buffering on slow phones (owner, 27 Nov 2026): a light film (6.8 / 13.5 MB) is downloaded whole first and
       played from memory, so it never stops mid-way and every loop is instant; the warm gradient shows meanwhile.
       Given up after 30 s (the gradient stays). The original-quality films (fast connections) stream, shown once
       they can play through, with the switch to the light film if they stall. */
    const load = (f) => {
      setFilm(f)
      if (FALLBACK[f] || typeof URL.createObjectURL !== 'function') return setVideoSrc(f)
      const giveUp = window.setTimeout(() => ctl.abort(), 30000)
      fetch(f, { signal: ctl.signal })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('film ' + r.status))))
        .then((blob) => { blobUrl = URL.createObjectURL(blob); setVideoSrc(blobUrl) })
        .catch(() => { /* no film: the gradient stays */ })
        .finally(() => window.clearTimeout(giveUp))
    }
    const start = () => { timer = window.setTimeout(() => load(pickFilm()), 500) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => {
      window.clearTimeout(timer); window.removeEventListener('load', start); ctl.abort()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [])

  // While most of the hero is on screen, the floating Soru Kutty and Spin & Win buttons step aside, so nothing
  // covers the headline, the buttons or the "Since 1950s" seal (SEO audit error 9, 26 Nov 2026).
  const sectionRef = useRef(null)
  useEffect(() => {
    const el = sectionRef.current
    const root = document.documentElement
    if (!el || !('IntersectionObserver' in window)) return undefined
    const io = new IntersectionObserver(([e]) => root.classList.toggle('hero-in-view', e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] })
    io.observe(el)
    return () => { io.disconnect(); root.classList.remove('hero-in-view') }
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
    <section className="home-hero" id="home" ref={sectionRef}>
      {!videoFailed && (
        <video
          ref={videoRef}
          className={`hero-video${ready ? ' is-ready' : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src={videoSrc || undefined}
          data-film={film || undefined}
          onError={() => { if (videoSrc) setVideoFailed(true) }}
          onCanPlayThrough={() => setReady(true)}
          onWaiting={onWaiting}
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
          <span className="hero-estd-label">Since</span>
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
