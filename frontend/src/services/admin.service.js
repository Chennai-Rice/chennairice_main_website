// Analyst dashboard: authentication and the queries behind /admin.
//
// Every read here goes through the ordinary browser Supabase client using
// the public anon key — there is no service-role key in this file, and there
// must never be one. What makes the data readable is the caller's logged-in
// session plus a row in admin_users; the RLS policies added in
// database/migrations/add_admin_dashboard.sql are the actual security
// boundary. A logged-out visitor running these exact queries gets zero rows.
//
// This module owns all analytics logic. The React views under
// src/pages/admin/ are presentation only and must not query Supabase
// directly, so the data contract stays in one reviewable place.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'
import { getAuthor } from './blog.service.js'

/** Rows pulled per table. Aggregation happens in the browser (see below). */
const ROW_LIMIT = 5000

/** A session counts as live if its heartbeat landed within this window. */
export const REALTIME_WINDOW_MINUTES = 5

export class AdminError extends Error {}

function requireClient() {
  if (!hasSupabase) {
    throw new AdminError(
      'Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    )
  }
}

// ---------------------------------------------------------------- auth

/**
 * What this account may do here.
 *
 * /admin is the one staff portal, and the two jobs behind it are separate:
 * a row in admin_users grants the analytics sections, a row in
 * blog_authors grants the journal. Most accounts have one; an account may
 * have both, and then it sees both. Neither is inferred from the other —
 * reading individual visitors' browsing history and writing a blog post
 * are different responsibilities.
 *
 * Both checks read back through RLS, so neither can be faked from the
 * browser: a non-member simply reads nothing.
 */
export async function resolveAccess() {
  const [analyst, author] = await Promise.all([isAdmin(), getAuthor()])
  return { analyst, author, any: analyst || Boolean(author) }
}

export async function signIn(email, password) {
  requireClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // Supabase returns the same message for "no such user" and "wrong
    // password" on purpose — repeating it verbatim avoids turning the login
    // form into a way to discover which email addresses exist.
    throw new AdminError('Incorrect email or password.')
  }

  // Signing in is not the same as being allowed in. Anyone with a Supabase
  // account authenticates successfully; only a listed analyst or author may
  // go further, so that is checked separately and the session is dropped
  // again if they are on neither list.
  const access = await resolveAccess()
  if (!access.any) {
    await signOut()
    throw new AdminError('This account does not have access.')
  }
  return access
}

export async function signOut() {
  if (!hasSupabase) return
  await supabase.auth.signOut()
}

export async function getSession() {
  if (!hasSupabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session ?? null
}

/**
 * True when the signed-in user is in admin_users. Relies on the
 * admin_users_read_self policy — a non-admin simply reads back nothing,
 * so this cannot be spoofed from the browser.
 */
export async function isAdmin() {
  if (!hasSupabase) return false
  const { data, error } = await supabase.from('admin_users').select('user_id').maybeSingle()
  if (error) return false
  return Boolean(data)
}

export function onAuthChange(callback) {
  if (!hasSupabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

/**
 * Best-effort record that this account opened the dashboard. Never blocks
 * rendering — an audit write failing must not deny the analyst their view.
 */
export async function logAccess(action, target = null) {
  if (!hasSupabase) return
  try {
    const session = await getSession()
    if (!session) return
    await supabase.from('admin_audit_log').insert({
      user_id: session.user.id,
      email: session.user.email,
      action,
      target,
    })
  } catch {
    /* audit logging is best-effort */
  }
}

// ------------------------------------------------------------ formatting

/** "0001" — the human-facing id for a browser. */
export function formatVisitorNo(no) {
  return no == null ? '—' : String(no).padStart(4, '0')
}

/** Seconds as "1m 20s" / "45s", which reads better than raw seconds. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/** '/products/vada-kolam' -> 'vada-kolam'; null for any non-product path. */
export function productSlugFromPath(path) {
  const match = /^\/products\/([^/?#]+)/.exec(path || '')
  return match ? match[1] : null
}

/** Turns a slug back into something readable: 'vada-kolam' -> 'Vada Kolam'. */
export function humaniseSlug(slug) {
  if (!slug) return '—'
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((a, c) => a + c, 0) / values.length
}

/**
 * Percentage change between two periods.
 *
 * Returns null rather than a number when the previous period was zero:
 * there is no meaningful percentage increase from nothing, and rendering
 * "+100%" for "first data we have ever seen" overstates it. The UI shows a
 * dash instead.
 */
function changePercent(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

// ------------------------------------------------------------ date ranges

export const DATE_RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
]

export function resolveRange(rangeId) {
  const range = DATE_RANGES.find((r) => r.id === rangeId) ?? DATE_RANGES[0]
  if (range.days === null) return { ...range, from: null, to: null, prevFrom: null, prevTo: null }

  const to = new Date()
  const from = new Date(to.getTime() - range.days * 86400000)
  // The comparison window is the same length, immediately before this one.
  const prevTo = from
  const prevFrom = new Date(from.getTime() - range.days * 86400000)
  return { ...range, from, to, prevFrom, prevTo }
}

function withinRange(iso, from, to) {
  if (!from) return true
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

// ---------------------------------------------------------------- fetch

/**
 * Pulls the raw analytics tables once. Filtering by date and all derived
 * metrics happen in the browser, which keeps a range change instant and
 * avoids a round trip per control.
 *
 * That is the right trade at this size — the site has only just started
 * collecting data. If these tables ever exceed ROW_LIMIT the totals would
 * silently describe only the newest slice, so `truncated` is reported and
 * the UI says so rather than quietly under-reporting.
 */
export async function fetchAnalytics() {
  requireClient()

  const [visitors, sessions, pageviews, events] = await Promise.all([
    supabase.from('visitors').select('*').order('visitor_no', { ascending: true }).limit(ROW_LIMIT),
    supabase.from('visitor_sessions').select('*').order('started_at', { ascending: false }).limit(ROW_LIMIT),
    supabase.from('visitor_pageviews').select('*').order('entered_at', { ascending: false }).limit(ROW_LIMIT),
    supabase.from('visitor_events').select('*').order('occurred_at', { ascending: false }).limit(ROW_LIMIT),
  ])

  const failed = [visitors, sessions, pageviews, events].find((r) => r.error)
  if (failed) throw new AdminError(failed.error.message)

  return {
    visitors: visitors.data ?? [],
    sessions: sessions.data ?? [],
    pageviews: pageviews.data ?? [],
    events: events.data ?? [],
    truncated:
      (sessions.data ?? []).length >= ROW_LIMIT ||
      (pageviews.data ?? []).length >= ROW_LIMIT ||
      (visitors.data ?? []).length >= ROW_LIMIT,
  }
}

// ------------------------------------------------------------- reporting

/**
 * Everything the dashboard renders, derived from one raw dataset for a
 * given date range. Pure — no network, no clock beyond the range it is
 * handed — so the views can recompute freely as filters change.
 */
export function buildReport(raw, rangeId = '7d') {
  const range = resolveRange(rangeId)
  const { visitors, sessions, pageviews, events } = raw

  const inRange = (rows, field) => rows.filter((r) => withinRange(r[field], range.from, range.to))
  const inPrev = (rows, field) => rows.filter((r) => withinRange(r[field], range.prevFrom, range.prevTo))

  const curSessions = inRange(sessions, 'started_at')
  const prevSessions = inPrev(sessions, 'started_at')
  const curViews = inRange(pageviews, 'entered_at')
  const prevViews = inPrev(pageviews, 'entered_at')
  const curEvents = inRange(events, 'occurred_at')

  const sessionById = new Map(sessions.map((s) => [s.session_id, s]))
  const curSessionIds = new Set(curSessions.map((s) => s.session_id))

  const uniqueVisitors = (list) => new Set(list.map((s) => s.visitor_id)).size

  // ---- visitor rows ----
  const sessionsByVisitor = new Map()
  for (const s of curSessions) {
    if (!sessionsByVisitor.has(s.visitor_id)) sessionsByVisitor.set(s.visitor_id, [])
    sessionsByVisitor.get(s.visitor_id).push(s)
  }

  // Pageviews carry only a session_id, so the owning visitor is resolved
  // through the session. A view whose session is missing (trimmed by
  // ROW_LIMIT) still counts in page totals but cannot be attributed.
  const viewsByVisitor = new Map()
  for (const view of curViews) {
    const visitorId = sessionById.get(view.session_id)?.visitor_id
    if (!visitorId) continue
    if (!viewsByVisitor.has(visitorId)) viewsByVisitor.set(visitorId, [])
    viewsByVisitor.get(visitorId).push(view)
  }

  const eventsByVisitor = new Map()
  for (const e of curEvents) {
    if (!eventsByVisitor.has(e.visitor_id)) eventsByVisitor.set(e.visitor_id, [])
    eventsByVisitor.get(e.visitor_id).push(e)
  }

  // A session can exist without a visitors row if ensure_visitor failed for
  // that visit (it is deliberately non-fatal). Fold those in so they show
  // with "—" rather than vanishing from the dashboard.
  const numbered = new Map(visitors.map((v) => [v.visitor_id, v]))
  const activeIds = [...new Set(curSessions.map((s) => s.visitor_id))]

  const rows = activeIds.map((visitorId) => {
    const v = numbered.get(visitorId)
    const vSessions = sessionsByVisitor.get(visitorId) ?? []
    const vViews = viewsByVisitor.get(visitorId) ?? []
    const vEvents = eventsByVisitor.get(visitorId) ?? []
    const latest = vSessions[0] ?? null
    const allSessions = sessions.filter((s) => s.visitor_id === visitorId)

    return {
      visitorId,
      visitorNo: v?.visitor_no ?? null,
      device: latest?.device_type ?? null,
      browser: latest?.browser ?? null,
      os: latest?.os ?? null,
      city: latest?.city ?? null,
      country: latest?.country ?? null,
      referrer: latest?.referrer ?? null,
      sessionCount: vSessions.length,
      totalSeconds: vSessions.reduce((a, s) => a + (s.total_seconds || 0), 0),
      pageCount: vViews.length,
      productViewCount: vViews.filter((view) => productSlugFromPath(view.path)).length,
      addToCartCount: vEvents.filter((e) => e.event_type === 'add_to_cart').length,
      purchaseCount: vEvents.filter((e) => e.event_type === 'purchase').length,
      firstSeen: v?.first_seen_at ?? null,
      lastSeen: latest?.last_seen_at ?? null,
      // "Returning" means seen across more than one session in all of
      // history, not just inside the selected range.
      returning: allSessions.length > 1,
      pages: vViews,
      sessions: vSessions,
    }
  })

  rows.sort((a, b) => {
    if (a.visitorNo == null) return 1
    if (b.visitorNo == null) return -1
    return a.visitorNo - b.visitorNo
  })

  // ---- KPI tiles ----
  const kpis = {
    visitors: {
      value: uniqueVisitors(curSessions),
      change: changePercent(uniqueVisitors(curSessions), uniqueVisitors(prevSessions)),
    },
    sessions: {
      value: curSessions.length,
      change: changePercent(curSessions.length, prevSessions.length),
    },
    pageviews: {
      value: curViews.length,
      change: changePercent(curViews.length, prevViews.length),
    },
    avgSession: {
      value: average(curSessions.map((s) => s.total_seconds || 0)),
      change: changePercent(
        average(curSessions.map((s) => s.total_seconds || 0)),
        average(prevSessions.map((s) => s.total_seconds || 0))
      ),
    },
  }

  // ---- time on page ----
  const landing = curViews.filter((v) => v.path === '/')
  const productViews = curViews.filter((v) => productSlugFromPath(v.path))

  const pageTime = {
    landingViews: landing.length,
    landingAvgSeconds: average(landing.map((v) => v.seconds_on_page || 0)),
    productViews: productViews.length,
    productAvgSeconds: average(productViews.map((v) => v.seconds_on_page || 0)),
  }

  // ---- funnel ----
  const visitedCount = rows.length
  const viewedProduct = rows.filter((r) => r.productViewCount > 0).length
  const addedToCart = rows.filter((r) => r.addToCartCount > 0).length
  const paid = rows.filter((r) => r.purchaseCount > 0).length

  const stage = (label, count, previous) => ({
    label,
    count,
    // Share of the stage before it — the number people actually mean by
    // "conversion" when reading a funnel.
    conversion: previous ? (count / previous) * 100 : null,
    dropOff: previous ? previous - count : 0,
  })

  const funnel = {
    stages: [
      stage('Visited', visitedCount, null),
      stage('Viewed product', viewedProduct, visitedCount),
      stage('Added to cart', addedToCart, viewedProduct),
      stage('Paid', paid, addedToCart),
    ],
    // Payment is not wired to a gateway yet, so this stage is structurally
    // present but can only ever be zero. The UI greys it rather than
    // implying nobody bought.
    paidTracked: false,
  }

  // ---- time series ----
  const series = buildSeries(curSessions, curViews, range)

  // ---- devices ----
  const deviceCounts = new Map()
  for (const s of curSessions) {
    const key = s.device_type || 'unknown'
    deviceCounts.set(key, (deviceCounts.get(key) ?? 0) + 1)
  }
  const devices = [...deviceCounts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percent: curSessions.length ? (count / curSessions.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ---- locations ----
  const locationCounts = new Map()
  for (const s of curSessions) {
    if (!s.country && !s.city) continue
    const key = [s.city, s.country].filter(Boolean).join(', ')
    const entry = locationCounts.get(key) ?? { label: key, country: s.country, count: 0 }
    entry.count += 1
    locationCounts.set(key, entry)
  }
  const located = [...locationCounts.values()].reduce((a, c) => a + c.count, 0)
  const locations = [...locationCounts.values()]
    .map((l) => ({ ...l, percent: located ? (l.count / located) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)

  // ---- products ----
  const byProduct = new Map()
  for (const view of productViews) {
    const slug = productSlugFromPath(view.path)
    const entry = byProduct.get(slug) ?? { slug, seconds: [], visitors: new Set() }
    entry.seconds.push(view.seconds_on_page || 0)
    const visitorId = sessionById.get(view.session_id)?.visitor_id
    if (visitorId) entry.visitors.add(visitorId)
    byProduct.set(slug, entry)
  }

  const products = [...byProduct.values()]
    .map((p) => {
      const carts = curEvents.filter((e) => e.event_type === 'add_to_cart' && e.product_slug === p.slug).length
      return {
        slug: p.slug,
        name: humaniseSlug(p.slug),
        views: p.seconds.length,
        uniqueVisitors: p.visitors.size,
        avgSeconds: average(p.seconds),
        totalSeconds: p.seconds.reduce((a, c) => a + c, 0),
        addToCarts: carts,
        // Share of unique viewers who added it — not of raw views, which
        // would flatter the number whenever someone reloads the page.
        conversion: p.visitors.size ? (carts / p.visitors.size) * 100 : null,
      }
    })
    .sort((a, b) => b.views - a.views)

  // ---- new vs returning ----
  const returning = rows.filter((r) => r.returning).length

  return {
    range,
    kpis,
    pageTime,
    funnel,
    series,
    devices,
    locations,
    products,
    rows,
    audience: { total: rows.length, returning, fresh: rows.length - returning },
    events: curEvents,
    sessionById,
    truncated: raw.truncated,
    hasAnyData: sessions.length > 0,
  }
}

/**
 * Daily buckets across the selected range. Every day in the window is
 * emitted, including empty ones — a line chart that skips quiet days
 * misrepresents the shape of the trend.
 */
function buildSeries(sessions, pageviews, range) {
  const from = range.from ?? earliest(sessions, pageviews)
  if (!from) return []

  const to = range.to ?? new Date()
  const startOfDay = (d) => {
    const c = new Date(d)
    c.setHours(0, 0, 0, 0)
    return c
  }

  const buckets = new Map()
  for (let day = startOfDay(from); day <= to; day = new Date(day.getTime() + 86400000)) {
    buckets.set(day.toISOString().slice(0, 10), { date: day.toISOString().slice(0, 10), visitors: new Set(), sessions: 0, pageviews: 0 })
  }

  for (const s of sessions) {
    const key = new Date(s.started_at).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.sessions += 1
    bucket.visitors.add(s.visitor_id)
  }

  for (const v of pageviews) {
    const key = new Date(v.entered_at).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (bucket) bucket.pageviews += 1
  }

  return [...buckets.values()].map((b) => ({
    date: b.date,
    visitors: b.visitors.size,
    sessions: b.sessions,
    pageviews: b.pageviews,
  }))
}

function earliest(sessions, pageviews) {
  const times = [
    ...sessions.map((s) => new Date(s.started_at).getTime()),
    ...pageviews.map((p) => new Date(p.entered_at).getTime()),
  ].filter(Number.isFinite)
  return times.length ? new Date(Math.min(...times)) : null
}

/**
 * Live view, derived from heartbeats rather than a websocket: a session
 * whose last_seen_at is inside REALTIME_WINDOW_MINUTES is treated as
 * active. The tracking hook beats every 20 seconds while the tab is
 * visible, so this is accurate to within one beat.
 */
export function buildRealtime(raw) {
  const cutoff = Date.now() - REALTIME_WINDOW_MINUTES * 60000
  const active = raw.sessions.filter((s) => new Date(s.last_seen_at).getTime() >= cutoff)
  const activeIds = new Set(active.map((s) => s.session_id))

  const recentViews = raw.pageviews
    .filter((v) => activeIds.has(v.session_id))
    .slice(0, 40)

  const numbered = new Map(raw.visitors.map((v) => [v.visitor_id, v.visitor_no]))
  const sessionById = new Map(raw.sessions.map((s) => [s.session_id, s]))

  const pageCounts = new Map()
  for (const v of recentViews) {
    pageCounts.set(v.path, (pageCounts.get(v.path) ?? 0) + 1)
  }

  // One chronological stream of everything the active sessions did, newest
  // first, so it reads like a live feed.
  const feed = [
    ...recentViews.map((v) => ({
      kind: 'pageview',
      at: v.entered_at,
      path: v.path,
      seconds: v.seconds_on_page,
      visitorNo: numbered.get(sessionById.get(v.session_id)?.visitor_id) ?? null,
    })),
    ...raw.events
      .filter((e) => activeIds.has(e.session_id))
      .map((e) => ({
        kind: e.event_type,
        at: e.occurred_at,
        path: e.product_slug ? `/products/${e.product_slug}` : null,
        visitorNo: numbered.get(e.visitor_id) ?? null,
      })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 30)

  const deviceCounts = new Map()
  for (const s of active) {
    const key = s.device_type || 'unknown'
    deviceCounts.set(key, (deviceCounts.get(key) ?? 0) + 1)
  }

  return {
    activeVisitors: new Set(active.map((s) => s.visitor_id)).size,
    activeSessions: active.length,
    sessions: active.map((s) => ({
      sessionId: s.session_id,
      visitorNo: numbered.get(s.visitor_id) ?? null,
      device: s.device_type,
      location: [s.city, s.country].filter(Boolean).join(', ') || null,
      lastSeen: s.last_seen_at,
      seconds: s.total_seconds,
    })),
    topPages: [...pageCounts.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    devices: [...deviceCounts.entries()].map(([name, count]) => ({ name, count })),
    feed,
  }
}

/**
 * The ordered path one visitor walked, newest last. Sessions are separated
 * so a return visit reads as a distinct visit rather than being spliced
 * into the previous one.
 */
export function buildJourney(row) {
  if (!row) return []

  // Sorted explicitly rather than trusting the order rows arrived in: the
  // query happens to return newest-first, but a journey read in reverse is
  // actively misleading, so the ordering is enforced here instead of being
  // an assumption about the caller.
  const chronological = [...row.pages].sort(
    (a, b) => new Date(a.entered_at) - new Date(b.entered_at)
  )

  const bySession = new Map()
  for (const view of chronological) {
    if (!bySession.has(view.session_id)) bySession.set(view.session_id, [])
    bySession.get(view.session_id).push(view)
  }

  return [...bySession.entries()]
    .map(([sessionId, views]) => ({
      sessionId,
      startedAt: views[0]?.entered_at ?? null,
      views,
      totalSeconds: views.reduce((a, v) => a + (v.seconds_on_page || 0), 0),
    }))
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
}

/* ================================================================
   Interaction analytics — click heatmaps, rage clicks, dead clicks
   and scroll depth.

   These do NOT go through fetchAnalytics(). Clicks are the highest-volume
   thing the site records, and pulling them into the browser to count them
   would not survive contact with real traffic, so the grouping happens in
   Postgres (see the functions in
   database/migrations/add_interaction_analytics.sql) and only summary rows
   cross the network. Those functions run as the caller, so the same RLS
   policies still apply: a signed-in account that is not in admin_users
   gets zero rows from them.
   ================================================================ */

/**
 * Viewport bands for the heatmap.
 *
 * The band is not cosmetic. The site is responsive, so a click recorded at
 * 390px wide happened on a layout that does not exist at 1280px; drawing
 * both on one screenshot would place points where nothing ever was.
 *
 * frameWidth and frameHeight are the viewport the page is rendered at to
 * draw a band's points. frameHeight is a real viewport height rather than
 * the whole page on purpose: the preview runs the live site, and sizing the
 * frame to the full page would make every `100vh` section as tall as the
 * page — which then makes the page taller still. The preview scrolls
 * instead.
 *
 * Within a band the overlay is still an approximation, because a page is
 * taller at 1024px than at 1920px. The panel says so rather than presenting
 * it as exact.
 */
export const HEATMAP_DEVICES = [
  { id: 'desktop', label: 'Desktop', minWidth: 1024, maxWidth: null, frameWidth: 1280, frameHeight: 900 },
  { id: 'tablet', label: 'Tablet', minWidth: 641, maxWidth: 1023, frameWidth: 834, frameHeight: 1000 },
  { id: 'mobile', label: 'Mobile', minWidth: null, maxWidth: 640, frameWidth: 390, frameHeight: 780 },
]

/** Ceiling on points drawn in one heatmap. Reported in the UI, never silent. */
export const HEATMAP_POINT_LIMIT = 5000

/**
 * Turns a Supabase RPC failure into something an analyst can act on.
 * The dashboard tends to be deployed before the migration is run, and
 * "Could not find the function" is not a message anyone can do anything
 * with — naming the file to run is.
 */
function rpcError(error) {
  const missing =
    error.code === 'PGRST202' ||
    /could not find the function|does not exist/i.test(error.message || '')

  if (missing) {
    return new AdminError(
      'Interaction analytics is not set up yet. Run database/migrations/add_interaction_analytics.sql in the Supabase SQL editor, then refresh.'
    )
  }
  return new AdminError(error.message)
}

const count = (value) => Number(value) || 0
const maybeNumber = (value) => (value == null ? null : Number(value))

/** Everything the Behaviour and Heatmap sections need, for one date range. */
export async function fetchBehaviour(rangeId = '7d') {
  requireClient()
  const range = resolveRange(rangeId)
  const from = range.from ? range.from.toISOString() : null

  const [pages, rage, dead, elements, scroll] = await Promise.all([
    supabase.rpc('interaction_page_summary', { p_from: from }),
    supabase.rpc('interaction_element_summary', { p_kind: 'rage_click', p_from: from, p_path: null, p_limit: 100 }),
    supabase.rpc('interaction_element_summary', { p_kind: 'dead_click', p_from: from, p_path: null, p_limit: 100 }),
    supabase.rpc('interaction_element_summary', { p_kind: 'click', p_from: from, p_path: null, p_limit: 200 }),
    supabase.rpc('scroll_depth_summary', { p_from: from }),
  ])

  const failed = [pages, rage, dead, elements, scroll].find((r) => r.error)
  if (failed) throw rpcError(failed.error)

  return {
    range,
    pages: pages.data ?? [],
    rage: rage.data ?? [],
    dead: dead.data ?? [],
    elements: elements.data ?? [],
    scroll: scroll.data ?? [],
  }
}

/** Shapes the raw rows above into what the views render. Pure. */
export function buildBehaviour(raw) {
  if (!raw) return null

  const pages = raw.pages.map((p) => ({
    path: p.path,
    clicks: count(p.clicks),
    rageClicks: count(p.rage_clicks),
    deadClicks: count(p.dead_clicks),
    visitors: count(p.visitors),
    lastAt: p.last_at,
  }))

  const elements = (rows) =>
    rows.map((r) => ({
      path: r.path,
      selector: r.selector,
      label: r.label,
      tag: r.tag,
      hits: count(r.hits),
      visitors: count(r.visitors),
      // Only meaningful on rage clicks: the total number of clicks across
      // every burst on that element, as opposed to the number of bursts.
      totalBurst: count(r.total_burst),
      lastAt: r.last_at,
    }))

  const scroll = raw.scroll.map((s) => ({
    path: s.path,
    views: count(s.views),
    // Page views written before scroll tracking existed carry no
    // measurement. Kept separate so the averages can be reported against
    // the number they were actually computed from.
    measured: count(s.measured),
    avgDepth: maybeNumber(s.avg_depth),
    medianDepth: maybeNumber(s.median_depth),
    reached50: count(s.reached_50),
    reached90: count(s.reached_90),
  }))

  const totals = pages.reduce(
    (acc, p) => ({
      clicks: acc.clicks + p.clicks,
      rageClicks: acc.rageClicks + p.rageClicks,
      deadClicks: acc.deadClicks + p.deadClicks,
    }),
    { clicks: 0, rageClicks: 0, deadClicks: 0 }
  )

  const rage = elements(raw.rage)

  return {
    pages,
    rage,
    dead: elements(raw.dead),
    elements: elements(raw.elements),
    scroll,
    totals,
    // Clicks in bursts, not bursts — the number people mean by "how much
    // rage clicking is there".
    rageClickTotal: rage.reduce((a, r) => a + r.totalBurst, 0),
    // Both sides are per-click, so this ratio is sound. A combined
    // "frustration rate" is not: a rage row counts one burst, not one
    // click, and adding the two would compare different units.
    deadRate: totals.clicks ? (totals.deadClicks / totals.clicks) * 100 : null,
    pagesWithClicks: pages.filter((p) => p.clicks > 0).map((p) => p.path),
    hasData: pages.length > 0,
  }
}

/** Click positions for one page, narrowed to one viewport band. */
export async function fetchHeatmap({ path, rangeId = '7d', device = 'desktop' }) {
  requireClient()
  const band = HEATMAP_DEVICES.find((d) => d.id === device) ?? HEATMAP_DEVICES[0]
  const range = resolveRange(rangeId)

  const { data, error } = await supabase.rpc('heatmap_points', {
    p_path: path,
    p_from: range.from ? range.from.toISOString() : null,
    p_min_width: band.minWidth,
    p_max_width: band.maxWidth,
    p_limit: HEATMAP_POINT_LIMIT,
  })
  if (error) throw rpcError(error)

  const points = (data ?? [])
    .map((row) => ({ relX: Number(row.rel_x), absY: Number(row.abs_y), kind: row.kind }))
    .filter((p) => Number.isFinite(p.relX) && Number.isFinite(p.absY))

  return {
    band,
    points,
    // Said out loud in the UI rather than left implicit: at the limit this
    // is the most recent slice, not every click on the page.
    capped: points.length >= HEATMAP_POINT_LIMIT,
  }
}
