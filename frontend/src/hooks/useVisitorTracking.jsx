import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useCookieConsent } from './useCookieConsent.jsx'
import {
  beginPage,
  flushInteractions,
  readScrollDepth,
  startInteractionTracking,
} from '../services/interactions.js'

/**
 * Visitor analytics: a unique visitor id, a per-tab session, pages visited,
 * and time spent, stored in Supabase (see api/track/*.js). Runs only once
 * the visitor has accepted the "analytics" cookie category — nothing here
 * ever fires before that, and everything stops the moment consent is
 * withdrawn (rejecting after having accepted does not retroactively delete
 * what was already recorded, the same as any other analytics tool).
 */

const VISITOR_KEY = 'chennai-rice-visitor-id'
const HEARTBEAT_MS = 20_000

function newId() {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
}

/** Stable per-browser id, reused across visits. */
function getVisitorId() {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = newId()
      window.localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return newId()
  }
}

/** Per-tab id: a page reload should still count as the same session. */
function getSessionId() {
  try {
    let id = window.sessionStorage.getItem('chennai-rice-session-id')
    if (!id) {
      id = newId()
      window.sessionStorage.setItem('chennai-rice-session-id', id)
    }
    return id
  } catch {
    return newId()
  }
}

function utmFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    return {
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
    }
  } catch {
    return {}
  }
}

function post(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    /* Analytics is best-effort — a dropped beat must never affect the page. */
  })
}

export function useVisitorTracking() {
  const { allowAnalytics } = useCookieConsent()
  const { pathname } = useLocation()

  const sessionRef = useRef({ started: false, sessionId: null, totalSeconds: 0, pageCount: 0 })
  const pageRef = useRef({ path: null, enteredAt: null, sent: false })

  // Sends the page currently open, exactly once. A page can be flushed by
  // whichever of the three triggers below fires first — the route changing,
  // the tab being backgrounded, or the tab actually closing — and `sent`
  // makes every trigger after the first a no-op, so switching away and then
  // later closing the tab never records the same view twice.
  const flushCurrentPage = () => {
    const page = pageRef.current
    if (!page.path || page.sent || !sessionRef.current.sessionId) return
    page.sent = true
    const seconds = Math.round((Date.now() - page.enteredAt) / 1000)
    post('/api/track/pageview', {
      sessionId: sessionRef.current.sessionId,
      path: page.path,
      secondsOnPage: seconds,
      maxScrollPercent: readScrollDepth(),
    })
    flushInteractions()
  }

  // Start the session exactly once, the first time analytics is allowed.
  useEffect(() => {
    if (!allowAnalytics || sessionRef.current.started) return
    sessionRef.current.started = true
    sessionRef.current.sessionId = getSessionId()

    post('/api/track/session', {
      visitorId: getVisitorId(),
      sessionId: sessionRef.current.sessionId,
      referrer: document.referrer || undefined,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
      ...utmFromUrl(),
    })
  }, [allowAnalytics])

  // Heartbeat while the tab is visible, so total_seconds stays accurate even
  // if the visitor never triggers a clean "unload".
  useEffect(() => {
    if (!allowAnalytics) return

    const tick = () => {
      if (document.visibilityState !== 'visible' || !sessionRef.current.sessionId) return
      sessionRef.current.totalSeconds += HEARTBEAT_MS / 1000
      post('/api/track/heartbeat', {
        sessionId: sessionRef.current.sessionId,
        totalSeconds: Math.round(sessionRef.current.totalSeconds),
        pageCount: sessionRef.current.pageCount,
      })
    }

    const interval = setInterval(tick, HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [allowAnalytics])

  // Clicks, rage clicks, dead clicks and scroll depth. Kept in its own
  // module because it listens to the whole document rather than to React
  // state — see src/services/interactions.js.
  useEffect(() => {
    if (!allowAnalytics) return undefined
    return startInteractionTracking()
  }, [allowAnalytics])

  // One pageview per route change, carrying the time spent on whichever
  // page was open before it and how far down it was read.
  useEffect(() => {
    if (!allowAnalytics || !sessionRef.current.sessionId) return

    flushCurrentPage()

    pageRef.current = { path: pathname, enteredAt: Date.now(), sent: false }
    sessionRef.current.pageCount += 1
    beginPage(pathname)
  }, [allowAnalytics, pathname])

  // Send the open page as soon as its tab is backgrounded — switched away
  // from, minimized, or (on a phone) the screen locked — rather than only
  // on pagehide. A tab left open in the background can sit for minutes
  // before it's actually closed, or on mobile Safari may be killed by the
  // OS without ever firing pagehide at all; visibilitychange is the signal
  // that actually fires when the visitor is done looking at the page.
  useEffect(() => {
    if (!allowAnalytics) return undefined

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushCurrentPage()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [allowAnalytics])

  // Flush the final page's time when the tab actually closes. A no-op if
  // visibilitychange already sent this page (the common case — most closes
  // are backgrounded first), so this only fires for a page that goes
  // straight from open to closed without ever losing focus.
  useEffect(() => {
    if (!allowAnalytics) return

    const onUnload = () => {
      const page = pageRef.current
      if (!page.path || page.sent || !sessionRef.current.sessionId) return
      page.sent = true
      const seconds = Math.round((Date.now() - page.enteredAt) / 1000)
      const body = JSON.stringify({
        sessionId: sessionRef.current.sessionId,
        path: page.path,
        secondsOnPage: seconds,
        maxScrollPercent: readScrollDepth(),
      })
      navigator.sendBeacon?.('/api/track/pageview', new Blob([body], { type: 'application/json' }))
    }

    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  }, [allowAnalytics])
}
