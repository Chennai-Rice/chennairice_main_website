import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from './ui.jsx'

/**
 * The click heatmap.
 *
 * The page is loaded in an iframe rather than reconstructed from a stored
 * screenshot, which is only possible because the dashboard and the
 * storefront are the same origin. Two consequences are worth knowing:
 *
 *  1. The overlay is drawn on the page as it is *today*, not as it was when
 *     the clicks happened. Points above a layout change still land
 *     correctly; points below one drift. Anything past the end of the
 *     current page is counted and reported rather than quietly dropped.
 *
 *  2. The frame is a real viewport that scrolls, not the whole page laid
 *     out at once. Sizing the frame to the full page height would make
 *     every `100vh` section as tall as the page — which makes the page
 *     taller, which grows the frame again, without end. A fixed viewport
 *     also happens to be the layout the clicks were made against.
 *
 * src/App.jsx suppresses visitor tracking and the decorative chrome
 * whenever the app is framed, so opening this panel does not record the
 * analyst as a visitor.
 */

/* -------------------------------------------------------------- palette */

let paletteCache = null

/**
 * 256-entry colour ramp, built once. Cold blue through green and amber to
 * red — the convention every heatmap tool uses, so it reads correctly at a
 * glance; a key is drawn alongside it anyway.
 */
function palette() {
  if (paletteCache) return paletteCache

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 1
  const ctx = canvas.getContext('2d')

  const ramp = ctx.createLinearGradient(0, 0, 256, 0)
  ramp.addColorStop(0.0, 'rgba(30, 64, 140, 0)')
  ramp.addColorStop(0.2, 'rgba(38, 110, 186, 0.55)')
  ramp.addColorStop(0.45, 'rgba(46, 168, 152, 0.72)')
  ramp.addColorStop(0.68, 'rgba(222, 186, 62, 0.86)')
  ramp.addColorStop(1.0, 'rgba(176, 30, 32, 0.95)')

  ctx.fillStyle = ramp
  ctx.fillRect(0, 0, 256, 1)
  paletteCache = ctx.getImageData(0, 0, 256, 1).data
  return paletteCache
}

/* --------------------------------------------------------------- canvas */

/**
 * Ceiling on the canvas backing store.
 *
 * A tall page at desktop width can ask for more pixels than the browser
 * will allocate, and getImageData then throws "Out of memory" outright
 * rather than degrading. Past this budget the overlay is drawn at a lower
 * internal resolution and stretched back by CSS, which costs a little
 * softness and nothing else.
 */
const PIXEL_BUDGET = 12_000_000

/**
 * Paints points as overlapping alpha blobs, then recolours by accumulated
 * alpha. Two clicks in the same place therefore read hotter than two clicks
 * apart, which is the whole point of a heatmap over a scatter plot.
 */
export function HeatmapCanvas({ points, width, height, radius }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || width < 1 || height < 1) return

    const resolution = Math.min(1, Math.sqrt(PIXEL_BUDGET / (width * height)))
    const w = Math.max(1, Math.round(width * resolution))
    const h = Math.max(1, Math.round(height * resolution))

    canvas.width = w
    canvas.height = h
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, w, h)
    if (!points.length) return

    const r = Math.max(3, radius * resolution)

    // A single click should still be visible, so the per-point alpha is
    // generous; density comes from overlap rather than from opacity.
    for (const point of points) {
      const x = point.x * resolution
      const y = point.y * resolution
      const blob = ctx.createRadialGradient(x, y, 0, x, y, r)
      blob.addColorStop(0, 'rgba(0,0,0,0.30)')
      blob.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = blob
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const image = ctx.getImageData(0, 0, w, h)
    const data = image.data
    const ramp = palette()

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (!alpha) continue
      const offset = alpha * 4
      data[i] = ramp[offset]
      data[i + 1] = ramp[offset + 1]
      data[i + 2] = ramp[offset + 2]
      data[i + 3] = ramp[offset + 3]
    }

    ctx.putImageData(image, 0, 0)
  }, [points, width, height, radius])

  return <canvas ref={ref} className="ad-hm-canvas" aria-hidden="true" />
}

/* ---------------------------------------------------------------- stage */

export function HeatmapStage({ path, band, points, onMeasured }) {
  const stageRef = useRef(null)
  const frameRef = useRef(null)
  const innerObserver = useRef(null)
  const settleTimer = useRef(null)

  const [available, setAvailable] = useState(0)
  const [pageHeight, setPageHeight] = useState(0)
  const [offset, setOffset] = useState(0)
  const [blocked, setBlocked] = useState(false)

  /* Width the panel can give the preview. */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(stage)
    setAvailable(stage.clientWidth)
    return () => observer.disconnect()
  }, [])

  /* How tall the page inside the frame is. Safe to re-measure now that the
     frame's own height is fixed: a growing page can no longer grow the
     frame that is measuring it. */
  const measure = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    try {
      const doc = frame.contentDocument
      if (!doc) {
        setBlocked(true)
        return
      }
      const height = Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0
      )
      if (height) {
        setBlocked(false)
        setPageHeight(height)
      }
    } catch {
      // Only reachable if the frame ever stops being same-origin.
      setBlocked(true)
    }
  }, [])

  const releaseWatchers = useCallback(() => {
    innerObserver.current?.disconnect()
    innerObserver.current = null
    clearTimeout(settleTimer.current)
    settleTimer.current = null
  }, [])

  const onLoad = useCallback(() => {
    releaseWatchers()
    measure()
    try {
      const doc = frameRef.current?.contentDocument
      if (doc?.documentElement) {
        innerObserver.current = new ResizeObserver(measure)
        innerObserver.current.observe(doc.documentElement)
      }
    } catch {
      /* nothing to observe */
    }
    // Belt and braces for browsers that do not fire a resize when a late
    // image finally lands and makes the page taller.
    settleTimer.current = setTimeout(measure, 1200)
  }, [measure, releaseWatchers])

  useEffect(() => releaseWatchers, [releaseWatchers])

  // Reset between pages, so the previous page's height is never used to
  // place the next page's points.
  useEffect(() => {
    releaseWatchers()
    setPageHeight(0)
    setOffset(0)
    setBlocked(false)
  }, [path, band.id, releaseWatchers])

  const scale = available && band.frameWidth ? Math.min(1, available / band.frameWidth) : 1
  const stageWidth = Math.round(band.frameWidth * scale)
  const windowHeight = Math.round(band.frameHeight * scale)
  const fullHeight = Math.max(windowHeight, Math.round(pageHeight * scale))

  /* Memoised: repainting the canvas is the expensive part of this panel,
     and a fresh array each render would redraw it on every scroll tick. */
  const { drawn, beyond } = useMemo(() => {
    const kept = []
    let past = 0
    for (const point of points) {
      // The page can be shorter now than when the click happened. Such a
      // point has nowhere honest to go, so it is counted and reported
      // rather than clamped to the bottom edge, which would invent a
      // hotspot that never existed.
      if (pageHeight && point.absY > pageHeight) {
        past += 1
        continue
      }
      kept.push({ x: point.relX * stageWidth, y: point.absY * scale })
    }
    return { drawn: kept, beyond: past }
  }, [points, pageHeight, stageWidth, scale])

  useEffect(() => {
    onMeasured?.({ drawn: drawn.length, beyond, pageHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn.length, beyond, pageHeight])

  /* Scrolling the wrapper scrolls the page inside the frame and slides the
     overlay by the same amount, so the two stay registered. */
  const onScroll = useCallback(
    (event) => {
      const top = event.currentTarget.scrollTop
      setOffset(top)
      try {
        frameRef.current?.contentWindow?.scrollTo(0, top / (scale || 1))
      } catch {
        /* same-origin only; already reported through `blocked` */
      }
    },
    [scale]
  )

  if (blocked) {
    return (
      <EmptyState
        title="Could not read the page"
        note="The preview frame could not be measured, so there is nothing to draw the clicks onto."
      />
    )
  }

  return (
    <div className="ad-hm-stage" ref={stageRef}>
      <div
        className="ad-hm-viewport"
        style={{ width: stageWidth || undefined, height: windowHeight || 420 }}
        onScroll={onScroll}
      >
        {/* Gives the wrapper a scroll range the length of the whole page. */}
        <div className="ad-hm-scroller" style={{ height: fullHeight }}>
          <div className="ad-hm-sticky" style={{ height: windowHeight || 420 }}>
            <iframe
              ref={frameRef}
              src={path}
              title={`Preview of ${path}`}
              className="ad-hm-iframe"
              style={{
                width: band.frameWidth,
                height: band.frameHeight,
                transform: `scale(${scale})`,
              }}
              onLoad={onLoad}
              scrolling="no"
              tabIndex={-1}
              /* allow-scripts is required for the app to render at all;
                 allow-same-origin is what makes the page measurable and
                 scrollable. Forms and top-level navigation stay blocked. */
              sandbox="allow-same-origin allow-scripts"
            />

            {stageWidth > 0 && fullHeight > 0 && (
              <div className="ad-hm-layer" style={{ transform: `translateY(${-offset}px)` }}>
                <HeatmapCanvas
                  points={drawn}
                  width={stageWidth}
                  height={fullHeight}
                  radius={Math.max(10, Math.round(26 * scale))}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="ad-hm-hint ad-muted ad-small">
        Scroll inside the preview to move down the page — the overlay moves with it.
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- legend */

export function HeatmapLegend() {
  return (
    <div className="ad-hm-legend">
      <span className="ad-muted ad-small">Fewer clicks</span>
      <span className="ad-hm-ramp" aria-hidden="true" />
      <span className="ad-muted ad-small">More</span>
    </div>
  )
}

/* --------------------------------------------------------- scroll depth */

/**
 * How far down a page was read. A single vertical bar rather than a chart,
 * because the only question it answers is "does anyone get this far", and
 * a bar reading top-to-bottom answers it the way a page is read.
 */
export function ScrollDepthBar({ row }) {
  const median = row.medianDepth
  const average = row.avgDepth

  if (!row.measured) {
    return (
      <p className="ad-muted ad-small">
        No scroll measurements yet for this page — page views recorded before
        scroll tracking was added carry none.
      </p>
    )
  }

  const pct = (value) => (value == null ? '—' : `${Math.round(value)}%`)

  return (
    <div className="ad-scroll">
      <div className="ad-scroll-track">
        {average != null && <div className="ad-scroll-fill" style={{ height: `${average}%` }} />}
        {median != null && <div className="ad-scroll-median" style={{ top: `${median}%` }} />}
        <span className="ad-scroll-edge ad-scroll-edge-top">Top</span>
        <span className="ad-scroll-edge ad-scroll-edge-bottom">Bottom</span>
      </div>

      <ul className="ad-scroll-facts">
        <li>
          <span className="ad-muted">Median depth</span>
          <strong>{pct(median)}</strong>
        </li>
        <li>
          <span className="ad-muted">Average depth</span>
          <strong>{pct(average)}</strong>
        </li>
        <li>
          <span className="ad-muted">Reached halfway</span>
          <strong>
            {row.reached50} of {row.measured}
          </strong>
        </li>
        <li>
          <span className="ad-muted">Reached the bottom</span>
          <strong>
            {row.reached90} of {row.measured}
          </strong>
        </li>
        {row.measured < row.views && (
          <li>
            {/* Views recorded before scroll tracking existed. Named rather
                than folded into the totals above, which would report a
                measurement for a view that never carried one. */}
            <span className="ad-muted">Not measured</span>
            <strong>
              {row.views - row.measured} of {row.views}
            </strong>
          </li>
        )}
      </ul>
    </div>
  )
}
