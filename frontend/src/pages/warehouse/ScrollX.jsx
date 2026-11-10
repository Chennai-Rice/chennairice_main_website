import { useCallback, useEffect, useRef, useState } from 'react'

// A wide table that scrolls left and right (Nov 2026): ‹ › buttons above it, shown only when it is wider than the
// page, and a hint. The table itself also scrolls with a swipe, the trackpad or Shift + mouse wheel.
export default function ScrollX({ className = '', children, label = 'Scroll for more columns' }) {
  const ref = useRef(null)
  const [edge, setEdge] = useState({ wide: false, start: true, end: false })
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdge({ wide: el.scrollWidth > el.clientWidth + 4, start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
  }, [])
  useEffect(() => {
    measure()
    const el = ref.current
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && el) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild) }
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure, children])
  const go = (dir) => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.7), behavior: 'smooth' })
  return (
    <div className="sx">
      {edge.wide && (
        <div className="sx-bar">
          <span className="sx-hint">{label}</span>
          <button type="button" className="sx-btn" aria-label="Scroll left" disabled={edge.start} onClick={() => go(-1)}>‹</button>
          <button type="button" className="sx-btn" aria-label="Scroll right" disabled={edge.end} onClick={() => go(1)}>›</button>
        </div>
      )}
      <div ref={ref} className={className + ' sx-scroll'} onScroll={measure}>{children}</div>
    </div>
  )
}
