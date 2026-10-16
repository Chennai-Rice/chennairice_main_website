// Visitor analytics: the /api/track/* endpoints, stored in Cloud SQL
// (migration 018). Read back by the /admin dashboard (lib/sales/sitedata.js).
//
// Populated only for visitors who accepted the "analytics" cookie-consent
// category — the frontend hook (src/hooks/useVisitorTracking.js) never
// calls these endpoints otherwise.
import { anonymiseIp, clientIp } from './consent.js'
import { hasDatabase, query } from './db.js'

const hasStore = () => hasDatabase()

/** Insert one row (object keys are column names) into a table. */
async function insertRow(table, row) {
  const cols = Object.keys(row)
  await query(
    `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`,
    cols.map((c) => row[c])
  )
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

function str(value, max) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return max ? trimmed.slice(0, max) : trimmed
}

function int(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** A 0-100 percentage, or null when nothing usable was sent. */
function percent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** Very small user-agent sniff — enough to bucket sessions, not a full parser. */
function parseUserAgent(ua) {
  const s = typeof ua === 'string' ? ua : ''
  const device = /Mobi|Android(?!.*Tablet)|iPhone/i.test(s)
    ? 'mobile'
    : /Tablet|iPad/i.test(s)
      ? 'tablet'
      : 'desktop'

  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\//.test(s)
      ? 'Opera'
      : /Chrome\//.test(s)
        ? 'Chrome'
        : /Firefox\//.test(s)
          ? 'Firefox'
          : /Safari\//.test(s) && /Version\//.test(s)
            ? 'Safari'
            : null

  const os = /Windows/.test(s)
    ? 'Windows'
    : /Mac OS X/.test(s)
      ? 'macOS'
      : /Android/.test(s)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(s)
          ? 'iOS'
          : /Linux/.test(s)
            ? 'Linux'
            : null

  return { device, browser, os }
}

/**
 * Best-effort IP→location lookup via ip-api.com's free, keyless endpoint.
 * Never throws — a failed or rate-limited lookup just means no location on
 * that row, which must not block the session from being recorded.
 */
async function geolocate(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return {}
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`
    )
    if (!res.ok) return {}
    const data = await res.json()
    if (data.status !== 'success') return {}
    return { country: data.country || null, region: data.regionName || null, city: data.city || null }
  } catch {
    return {}
  }
}

/**
 * Validates a session-start payload and shapes it into a visitor_sessions
 * row, including a best-effort IP geolocation. Returns { row } or { error }.
 */
export async function buildSessionRow({ body, req }) {
  const visitorId = str(body?.visitorId, 64)
  const sessionId = str(body?.sessionId, 64)
  if (!visitorId || !ID_PATTERN.test(visitorId)) return { error: 'A valid visitorId is required.' }
  if (!sessionId || !ID_PATTERN.test(sessionId)) return { error: 'A valid sessionId is required.' }

  const ip = clientIp(req)
  const { device, browser, os } = parseUserAgent(req.headers?.['user-agent'])
  const location = await geolocate(ip.split(',')[0]?.trim())

  return {
    row: {
      visitor_id: visitorId,
      session_id: sessionId,
      referrer: str(body?.referrer, 512),
      utm_source: str(body?.utmSource, 128),
      utm_medium: str(body?.utmMedium, 128),
      utm_campaign: str(body?.utmCampaign, 128),
      user_agent: str(req.headers?.['user-agent'], 256),
      device_type: device,
      browser,
      os,
      screen_width: int(body?.screenWidth),
      screen_height: int(body?.screenHeight),
      ip_prefix: anonymiseIp(ip),
      ...location,
    },
  }
}

/**
 * Gives the browser its permanent display number ("0001", "0002") the first
 * time it is seen, and refreshes last_seen_at on every later visit.
 *
 * Deliberately non-fatal: a visitor without a number is a cosmetic problem
 * on one dashboard row, whereas throwing here would lose the session itself.
 * The dashboard left-joins this table so an unnumbered visitor still shows.
 */
async function ensureVisitor(visitorId) {
  try {
    await query(
      `insert into visitors (visitor_id) values ($1)
       on conflict (visitor_id) do update set last_seen_at = now()`,
      [visitorId]
    )
  } catch (err) {
    console.error('ensure_visitor failed (session still recorded):', err.message)
  }
}

/** Inserts a new session row. Resolves to false when no database is configured. */
export async function insertSession(row) {
  if (!hasStore()) return false
  await ensureVisitor(row.visitor_id)
  try {
    await query(
      `insert into visitor_sessions (${Object.keys(row).join(', ')}) values (${Object.keys(row).map((_, i) => '$' + (i + 1)).join(', ')})
       on conflict (session_id) do nothing`,
      Object.values(row)
    )
  } catch (err) {
    throw storeError('visitor_sessions', err)
  }
  return true
}

/**
 * Heartbeat: bumps last_seen_at/total_seconds/page_count on an existing
 * session. Silently a no-op if the session id is unknown — a heartbeat for a
 * session the server never saw (e.g. insert failed, or the database was briefly
 * unreachable) must not surface as an error to the visitor's tab.
 */
export async function touchSession({ sessionId, totalSeconds, pageCount }) {
  if (!hasStore()) return false
  const sid = str(sessionId, 64)
  if (!sid || !ID_PATTERN.test(sid)) return false

  try {
    await query(
      `update visitor_sessions set last_seen_at = now(),
              total_seconds = coalesce($2, total_seconds), page_count = coalesce($3, page_count)
        where session_id = $1`,
      [sid, int(totalSeconds), int(pageCount)]
    )
  } catch (err) {
    throw storeError('visitor_sessions', err)
  }
  return true
}

/** Validates and inserts one pageview row. */
export async function insertPageview(body) {
  const sessionId = str(body?.sessionId, 64)
  const path = str(body?.path, 512)
  if (!sessionId || !ID_PATTERN.test(sessionId)) return { error: 'A valid sessionId is required.' }
  if (!path) return { error: 'A path is required.' }

  if (!hasStore()) return { stored: false }

  try {
    await insertRow('visitor_pageviews', {
      session_id: sessionId,
      path,
      seconds_on_page: int(body?.secondsOnPage) || 0,
      // Null, not 0, when the client sent nothing: "not measured" and "never
      // scrolled" are different findings and must not be merged.
      max_scroll_percent: percent(body?.maxScrollPercent),
    })
  } catch (err) {
    if (err.code === '23503') return { stored: false } // session not recorded (yet)
    throw storeError('visitor_pageviews', err)
  }
  return { stored: true }
}

/**
 * Records a product/cart event (see the visitor_event_type enum in
 * database/migrations/add_admin_dashboard.sql). The session must already
 * exist — visitor_events.session_id is a foreign key — so an event fired
 * before the session insert lands is dropped rather than erroring at the
 * visitor's tab.
 */
const EVENT_TYPES = new Set([
  'product_view',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'purchase',
])

export async function insertEvent(body) {
  const sessionId = str(body?.sessionId, 64)
  const visitorId = str(body?.visitorId, 64)
  const eventType = str(body?.eventType, 32)

  if (!sessionId || !ID_PATTERN.test(sessionId)) return { error: 'A valid sessionId is required.' }
  if (!visitorId || !ID_PATTERN.test(visitorId)) return { error: 'A valid visitorId is required.' }
  if (!eventType || !EVENT_TYPES.has(eventType)) return { error: 'Unknown eventType.' }

  if (!hasStore()) return { stored: false }

  const quantity = int(body?.quantity)
  const variantKg = Number(body?.variantKg)
  const value = Number(body?.valueInr)

  try {
    await insertRow('visitor_events', {
      session_id: sessionId,
      visitor_id: visitorId,
      event_type: eventType,
      product_slug: str(body?.productSlug, 128),
      variant_kg: Number.isFinite(variantKg) ? variantKg : null,
      quantity: quantity === null ? null : quantity,
      value_inr: Number.isFinite(value) ? value : null,
      order_ref: str(body?.orderRef, 128),
    })
  } catch (err) {
    // A foreign-key violation means the session row isn't there (yet). That
    // is a dropped event, not a server fault the visitor could act on.
    if (err.code === '23503') return { stored: false }
    throw storeError('visitor_events', err)
  }
  return { stored: true }
}

/**
 * Click-level analytics: heatmap points, rage clicks and dead clicks.
 * See database/migrations/add_interaction_analytics.sql for the table and
 * src/services/interactions.js for how each kind is detected.
 *
 * Arrives batched, because clicks are an order of magnitude more frequent
 * than anything else recorded here and one request per click would be
 * wasteful on a phone connection.
 */
const INTERACTION_KINDS = new Set(['click', 'rage_click', 'dead_click'])

/** Hard ceiling per request. Anything above it is reported, not dropped quietly. */
const MAX_INTERACTIONS_PER_BATCH = 100

function shapeInteraction(item) {
  const kind = str(item?.kind, 20)
  const path = str(item?.path, 512)
  if (!kind || !INTERACTION_KINDS.has(kind) || !path) return null

  const relX = Number(item?.relX)

  return {
    kind,
    path,
    selector: str(item?.selector, 240),
    label: str(item?.label, 80),
    tag: str(item?.tag, 32),
    rel_x: Number.isFinite(relX) ? Math.min(1, Math.max(0, relX)) : null,
    abs_y: int(item?.absY),
    viewport_width: int(item?.viewportWidth),
    doc_height: int(item?.docHeight),
    // Only a rage click has a burst length. Sending one on any other kind
    // would be a number with no meaning behind it.
    click_count: kind === 'rage_click' ? int(item?.clickCount) : null,
    // occurred_at is left to the column default rather than taken from the
    // browser. Client clocks are not trustworthy, and batching means the
    // server time is late by at most one flush interval — a far smaller
    // error than a misconfigured device clock.
  }
}

export async function insertInteractions(body) {
  const sessionId = str(body?.sessionId, 64)
  const visitorId = str(body?.visitorId, 64)

  if (!sessionId || !ID_PATTERN.test(sessionId)) return { error: 'A valid sessionId is required.' }
  if (!visitorId || !ID_PATTERN.test(visitorId)) return { error: 'A valid visitorId is required.' }

  const items = Array.isArray(body?.items) ? body.items : null
  if (!items || !items.length) return { error: 'items must be a non-empty array.' }

  const accepted = items.slice(0, MAX_INTERACTIONS_PER_BATCH)
  const rows = accepted
    .map(shapeInteraction)
    .filter(Boolean)
    .map((row) => ({ ...row, session_id: sessionId, visitor_id: visitorId }))

  const skipped = items.length - rows.length
  if (!rows.length) return { stored: 0, skipped }

  if (!hasStore()) return { stored: 0, skipped }

  const cols = ['session_id', 'visitor_id', 'kind', 'path', 'selector', 'label', 'tag', 'rel_x', 'abs_y', 'viewport_width', 'doc_height', 'click_count']
  const values = []
  const tuples = rows.map((row, r) => `(${cols.map((c, i) => { values.push(row[c] ?? null); return '$' + (r * cols.length + i + 1) }).join(', ')})`)
  try {
    await query(`insert into visitor_interactions (${cols.join(', ')}) values ${tuples.join(', ')}`, values)
  } catch (err) {
    // Same reasoning as insertEvent: the session row is not there.
    if (err.code === '23503') return { stored: 0, skipped }
    throw storeError('visitor_interactions', err)
  }
  return { stored: rows.length, skipped }
}

function storeError(table, cause) {
  const err = new Error(`Write to ${table} failed: ${cause.message}`)
  err.status = 502
  err.publicMessage = 'Could not save analytics data.'
  return err
}
