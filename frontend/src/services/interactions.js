// Interaction analytics: click positions (for heatmaps), rage clicks, dead
// clicks and scroll depth.
//
// Runs in the visitor's browser alongside src/hooks/useVisitorTracking.jsx,
// and is gated on exactly the same cookie consent — the consent test and
// the visitor/session ids are imported from events.js rather than copied,
// so there is one rule for "may we record this", not three.
//
// Everything here is best-effort and silent. A shopper must never see an
// error, and a click must never be delayed by analytics: the listener is
// capture-phase and passive, and does nothing synchronous beyond reading
// coordinates off the event.
import { analyticsAllowed, visitorIds } from './events.js'

/* ---------------------------------------------------------------- tuning */

/** Clicks in one place within this window and radius count as raging. */
const RAGE_CLICKS = 3
const RAGE_WINDOW_MS = 1000
const RAGE_RADIUS_PX = 40

/** How long a click is given to produce a visible response. */
const DEAD_WAIT_MS = 700

/**
 * Ceiling on clicks recorded per page view. Without it one visitor leaning
 * on a mouse could write thousands of rows. The dashboard states that this
 * cap exists, because a silent truncation would read as "this is every
 * click" when it is not.
 */
export const MAX_CLICKS_PER_PAGE = 120

const BATCH_SIZE = 20
const FLUSH_MS = 5000
const ENDPOINT = '/api/track/interactions'

/* ------------------------------------------------------------- selectors */

/** Elements that genuinely respond to a click on their own. */
const INTERACTIVE = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'details',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="menuitem"]',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Decorative components that redraw themselves constantly — the rice
 * cursor rewrites a transform on every mouse move. Their churn is not the
 * page responding to a click, and clicks that land on them are not
 * interesting either, so both are excluded by an explicit marker rather
 * than by guessing at class names.
 */
const IGNORED = '[data-analytics-ignore]'

/** Classes that describe state rather than identity. */
const STATE_CLASS = /^(is-|has-|js-)|^(active|open|selected|hover|show|shown|hidden|visible|current|loading|error)$/i

/** Things a visitor could reasonably read as "this is a button". */
const AFFORDANCE = /card|btn|button|tile|chip|link|tab|nav|menu|thumb|badge|icon|cta|swatch|arrow|close|toggle|pill/i

/** Attribute changes that mean something happened, as opposed to animating. */
const MEANINGFUL_ATTRS = [
  'class', 'hidden', 'open', 'disabled', 'value', 'checked', 'src', 'href',
  'aria-expanded', 'aria-selected', 'aria-checked', 'aria-hidden', 'data-state',
]

function classesOf(el) {
  // classList rather than className: on SVG elements className is an
  // SVGAnimatedString, and splitting it would throw.
  const list = el.classList ? Array.from(el.classList) : []
  return list.filter((c) => !STATE_CLASS.test(c)).slice(0, 2)
}

/**
 * A short, deliberately stable CSS path.
 *
 * State classes are stripped and the walk stops at four levels, so the
 * same button keeps the same selector after it moves or gains a wrapper —
 * which is the entire reason for counting clicks by element as well as by
 * pixel. It is not guaranteed unique and does not need to be: it is a
 * grouping key for counts, never something to query the DOM with.
 */
function cssPath(el) {
  const parts = []
  let node = el
  let depth = 0

  while (node && node.nodeType === 1 && node !== document.body && depth < 4) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift('#' + node.id)
      break
    }
    const tag = node.tagName.toLowerCase()
    const cls = classesOf(node)
    parts.unshift(cls.length ? tag + '.' + cls.join('.') : tag)
    node = node.parentElement
    depth += 1
  }

  return parts.join(' > ').slice(0, 240) || null
}

/** What a person would call the thing that was clicked. */
function labelFor(el) {
  const attr = (name) => el.getAttribute && el.getAttribute(name) && el.getAttribute(name).trim()
  const direct = attr('aria-label') || attr('alt') || attr('title') || attr('placeholder')
  if (direct) return direct.slice(0, 80)

  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 80) : null
}

function interactiveAncestor(el) {
  return el.closest ? el.closest(INTERACTIVE) : null
}

/**
 * Whether an element *looks* clickable. Dead clicks are recorded only for
 * these, and that narrowing is deliberate: every click on a paragraph
 * technically produces no response, but reporting those would bury the
 * finding that matters — someone tried to click a thing that reads as a
 * control and nothing happened.
 */
function looksClickable(el) {
  const tag = el.tagName && el.tagName.toLowerCase()
  if (tag === 'img' || tag === 'picture' || tag === 'svg' || tag === 'path' || tag === 'use') return true

  let node = el
  for (let depth = 0; node && node.nodeType === 1 && depth < 3; depth += 1) {
    if (classesOf(node).some((c) => AFFORDANCE.test(c))) return true
    try {
      if (window.getComputedStyle(node).cursor === 'pointer') return true
    } catch {
      /* getComputedStyle throws on a detached node */
    }
    node = node.parentElement
  }
  return false
}

/* ----------------------------------------------------------------- state */

let queue = []
let flushTimer = null
let currentPath = null
let recordedThisPage = 0
let maxSeenPx = 0
let cluster = null
let listening = false
let scrollFrame = 0

/* ------------------------------------------------------------- transport */

function flush(useBeacon = false) {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!queue.length) return

  const { visitorId, sessionId } = visitorIds()
  // visitor_interactions.session_id is a foreign key onto visitor_sessions,
  // so anything captured before the session row lands would be rejected.
  // Dropping it here is quieter than sending it to be refused.
  if (!visitorId || !sessionId) {
    queue = []
    return
  }

  const items = queue
  queue = []
  const body = JSON.stringify({ visitorId, sessionId, items })

  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
    return
  }

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    /* best-effort */
  })
}

function enqueue(item) {
  queue.push(item)
  if (queue.length >= BATCH_SIZE) flush()
  else if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_MS)
}

/* --------------------------------------------------------------- capture */

function position(event) {
  const doc = document.documentElement
  const width = Math.max(doc.scrollWidth, doc.clientWidth, 1)
  const height = Math.max(doc.scrollHeight, doc.clientHeight, 1)

  return {
    // A fraction of document width, because the layout is fluid and an
    // absolute x means nothing on another screen size.
    relX: Math.min(1, Math.max(0, event.pageX / width)),
    // Document pixels from the top, NOT a fraction: adding content to a
    // page changes its height, and a fraction would silently drag every
    // previously recorded point downwards. Pixels stay correct for
    // everything above the change.
    absY: Math.round(event.pageY),
    viewportWidth: Math.round(window.innerWidth),
    docHeight: Math.round(height),
  }
}

/**
 * Rage clicks are emitted once per burst, when the burst ends, so
 * clickCount is the real total rather than the threshold that triggered
 * it. The individual clicks are still recorded separately, so the heatmap
 * keeps them.
 */
function endCluster() {
  if (!cluster) return
  const done = cluster
  cluster = null
  clearTimeout(done.timer)

  if (done.count >= RAGE_CLICKS) {
    enqueue({ kind: 'rage_click', ...done.meta, ...done.pos, clickCount: done.count })
  }
}

function trackCluster(event, pos, meta) {
  const now = Date.now()
  const near =
    cluster &&
    now - cluster.lastAt <= RAGE_WINDOW_MS &&
    Math.hypot(event.clientX - cluster.x, event.clientY - cluster.y) <= RAGE_RADIUS_PX

  if (near) {
    cluster.count += 1
    cluster.lastAt = now
    clearTimeout(cluster.timer)
  } else {
    endCluster()
    cluster = { x: event.clientX, y: event.clientY, count: 1, meta, pos, lastAt: now, timer: null }
  }

  cluster.timer = setTimeout(endCluster, RAGE_WINDOW_MS)
}

/**
 * Watches for any sign that the page answered a click: nodes added or
 * removed, a meaningful attribute change, a scroll, or a navigation.
 * Style-only changes are ignored, because they are almost always a hover
 * transition or an animation frame rather than a response.
 */
function watchForResponse(done) {
  const startUrl = window.location.href
  const startScroll = window.scrollY
  let settled = false

  const relevant = (record) => {
    const node = record.target
    const el = node.nodeType === 1 ? node : node.parentElement
    if (el && el.closest && el.closest(IGNORED)) return false
    if (record.type === 'childList') {
      return [...record.addedNodes, ...record.removedNodes].some((n) => n.nodeType === 1)
    }
    return true
  }

  function finish(responded) {
    if (settled) return
    settled = true
    observer.disconnect()
    window.removeEventListener('scroll', onResponseScroll)
    clearTimeout(timer)
    done(responded)
  }

  const observer = new MutationObserver((records) => {
    if (records.some(relevant)) finish(true)
  })

  const onResponseScroll = () => {
    if (Math.abs(window.scrollY - startScroll) > 8) finish(true)
  }

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: MEANINGFUL_ATTRS,
  })
  window.addEventListener('scroll', onResponseScroll, { passive: true })

  const timer = setTimeout(() => finish(window.location.href !== startUrl), DEAD_WAIT_MS)
}

function onClick(event) {
  // Consent is read per click rather than cached: withdrawing it has to
  // stop recording immediately, not at the next page load.
  if (!analyticsAllowed()) return
  if (!event.isTrusted) return
  // detail === 0 means the click came from the keyboard, which carries no
  // meaningful coordinates and would land at (0, 0) on the heatmap.
  if (event.detail === 0) return

  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest(IGNORED)) return
  if (recordedThisPage >= MAX_CLICKS_PER_PAGE) return

  const control = interactiveAncestor(target)
  const subject = control || target
  const pos = position(event)
  const meta = {
    path: currentPath || window.location.pathname,
    selector: cssPath(subject),
    label: labelFor(subject),
    tag: subject.tagName.toLowerCase(),
  }

  recordedThisPage += 1
  enqueue({ kind: 'click', ...meta, ...pos })
  trackCluster(event, pos, meta)

  if (!control && looksClickable(target)) {
    watchForResponse((responded) => {
      if (!responded) enqueue({ kind: 'dead_click', ...meta, ...pos })
    })
  }
}

/* ---------------------------------------------------------- scroll depth */

/**
 * Records the furthest point reached, in document pixels.
 *
 * Pixels rather than a percentage, and that is not a detail: a page is
 * short before its images load and grows as they arrive. Keeping the
 * running maximum as a percentage would lock in an early reading taken
 * against the short version — a visitor who never scrolled a 4000px page
 * would be recorded as having read 70% of it, because at first render the
 * page was only 1200px tall. Pixels seen stay true as the page grows, and
 * the percentage is worked out at the end against the final height.
 */
function measureScroll() {
  const seen = window.scrollY + window.innerHeight
  if (seen > maxSeenPx) maxSeenPx = seen
}

/** The running maximum as a share of the page, or null if unmeasurable. */
function scrollPercent() {
  const doc = document.documentElement
  const height = Math.max(doc.scrollHeight, doc.clientHeight)
  const viewport = window.innerHeight
  if (!height) return null

  // A page shorter than the viewport was seen in full without scrolling,
  // so it is 100% — not the fraction the ratio would give.
  if (height <= viewport) return 100

  measureScroll()
  return Math.min(100, Math.max(0, Math.round((Math.min(maxSeenPx, height) / height) * 100)))
}

function onScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    measureScroll()
  })
}

/* ------------------------------------------------------------------- api */

/**
 * Attaches the listeners. Safe to call more than once; returns a function
 * that detaches them and flushes whatever is still queued.
 */
export function startInteractionTracking() {
  if (listening || typeof window === 'undefined') return () => {}
  listening = true

  const onHide = () => {
    endCluster()
    flush(true)
  }

  // Capture phase, so a handler calling stopPropagation cannot hide the
  // click from analytics. Passive, so it can never delay one.
  document.addEventListener('click', onClick, { capture: true, passive: true })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pagehide', onHide)

  return () => {
    listening = false
    document.removeEventListener('click', onClick, { capture: true })
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pagehide', onHide)
    onHide()
  }
}

/** Called on every route change, once the previous page has been reported. */
export function beginPage(path) {
  endCluster()
  currentPath = path
  recordedThisPage = 0
  maxSeenPx = 0
  measureScroll()
}

/**
 * Furthest point reached on the page being left, 0-100, or null when the
 * page could not be measured. Computed at read time against the page's
 * final height, so late-loading images cannot inflate it.
 */
export function readScrollDepth() {
  return scrollPercent()
}

/** Sends anything still queued. Used when a page view is reported. */
export function flushInteractions() {
  endCluster()
  flush()
}
