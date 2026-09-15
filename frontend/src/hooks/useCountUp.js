import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Animates a numeric string (commas allowed, e.g. "210,240") up from 0 once
 * its element scrolls into view. Non-numeric values (e.g. "1950s") pass
 * through unchanged.
 */
export default function useCountUp(value) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(value)
  const numeric = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  const isNumeric = Number.isFinite(numeric)

  useEffect(() => {
    if (!isNumeric || !ref.current) {
      setDisplay(value)
      return
    }
    const target = { n: 0 }
    const trigger = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(target, {
          n: numeric,
          duration: 1.6,
          ease: 'power2.out',
          onUpdate: () => setDisplay(Math.round(target.n).toLocaleString('en-IN')),
        })
      },
    })
    return () => trigger.kill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return [ref, display]
}
