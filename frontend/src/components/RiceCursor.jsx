import { useEffect, useRef } from 'react'
import './ricecursor.css'

/* ------------------------------------------------------------------
   Cursor options — both live here so the look is one edit away.

   TRAIL_GRAINS  0 = a single static grain (current setting).
                 Raise it to add chasing grains behind the pointer.
   FOLLOW        1 = locked to the pointer, no lag or drift.
                 Lower it (e.g. 0.3) to make the grain glide after it.
   TIP_TO_TRAVEL false = the grain keeps a fixed angle.
                 true = it tips to face the direction of movement.
   ------------------------------------------------------------------ */
const TRAIL_GRAINS = 0
const FOLLOW = 1
const TIP_TO_TRAVEL = false
const REST_ANGLE = -18 // fixed tilt so the grain never sits dead flat

/**
 * Replaces the pointer with a rice grain. Desktop pointers only, and skipped
 * entirely when reduced motion is requested.
 */
export default function RiceCursor() {
  const layerRef = useRef(null)
  const grainsRef = useRef([])

  useEffect(() => {
    const fine = window.matchMedia?.('(pointer: fine)').matches
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced) return

    const layer = layerRef.current
    const grains = grainsRef.current.filter(Boolean)
    if (!layer || !grains.length) return

    document.documentElement.classList.add('has-rice-cursor')

    const isStatic = FOLLOW >= 1 && grains.length === 1
    const pts = grains.map(() => ({ x: -100, y: -100, a: REST_ANGLE }))
    const mouse = { x: -100, y: -100 }
    let raf = 0
    let seen = false

    const place = (el, p) => {
      el.style.transform =
        `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) rotate(${p.a}deg)`
    }

    const onMove = e => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      if (!seen) {
        seen = true
        layer.classList.add('is-visible')
      }
      layer.classList.toggle('is-hot', !!e.target?.closest?.('a, button, [role="button"]'))

      // A single locked grain needs no animation frame — place it now.
      if (isStatic) {
        pts[0].x = mouse.x
        pts[0].y = mouse.y
        place(grains[0], pts[0])
      }
    }
    const onOut = e => {
      if (!e.relatedTarget && !e.toElement) layer.classList.remove('is-visible')
    }
    const onOver = () => seen && layer.classList.add('is-visible')

    const tick = () => {
      let px = mouse.x
      let py = mouse.y
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const dx = px - p.x
        const dy = py - p.y
        const ease = i === 0 ? FOLLOW : 0.22
        p.x += dx * ease
        p.y += dy * ease
        if (TIP_TO_TRAVEL && Math.abs(dx) + Math.abs(dy) > 0.5) {
          p.a = (Math.atan2(dy, dx) * 180) / Math.PI
        }
        grains[i].style.transform =
          `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) rotate(${p.a}deg) scale(${1 - i * 0.13})`
        px = p.x
        py = p.y
      }
      raf = requestAnimationFrame(tick)
    }
    if (!isStatic) raf = requestAnimationFrame(tick)

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseout', onOut)
    window.addEventListener('mouseover', onOver)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseout', onOut)
      window.removeEventListener('mouseover', onOver)
      document.documentElement.classList.remove('has-rice-cursor')
    }
  }, [])

  return (
    /* data-analytics-ignore: this layer rewrites a transform on every mouse
       move, which would otherwise read as the page responding to a click.
       See src/services/interactions.js. */
    <div className="rice-cursor" ref={layerRef} aria-hidden="true" data-analytics-ignore="">
      {/* One shared gradient definition, referenced by every grain below —
          not one per grain, which would repeat the same id and be invalid
          HTML the moment TRAIL_GRAINS is raised above 0. */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="rice-grain-fill" x1="35%" y1="0%" x2="65%" y2="100%">
            <stop offset="0%" stopColor="#ecdfb6" />
            <stop offset="48%" stopColor="#c69a3f" />
            <stop offset="100%" stopColor="#8a6a25" />
          </linearGradient>
        </defs>
      </svg>

      {Array.from({ length: TRAIL_GRAINS + 1 }, (_, i) => (
        <svg
          // rice-grain-lead (not :first-child) picks up the hot-hover halo
          // in ricecursor.css — the shared-gradient <svg> above is also a
          // sibling, so :first-child would no longer point at grain 0.
          className={`rice-grain${i === 0 ? ' rice-grain-lead' : ''}`}
          key={i}
          ref={el => (grainsRef.current[i] = el)}
          style={{ opacity: 1 - i * 0.14 }}
          viewBox="0 0 32 18"
        >
          {/* A soft, tapered grain — narrower at each end than an ellipse
              would be, but rounded rather than pointed: the curve into and
              out of each tip (30,4)-(30,9)-(30,14) shares the same vertical
              tangent, so it closes smoothly instead of meeting as a
              corner. */}
          <path
            d="M2,9 C2,4 8,2 16,2 C24,2 30,4 30,9 C30,14 24,16 16,16 C8,16 2,14 2,9 Z"
            fill="url(#rice-grain-fill)"
          />
        </svg>
      ))}
    </div>
  )
}
