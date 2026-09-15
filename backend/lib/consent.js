// Shared cookie-consent logic — used by both the Vercel serverless
// functions (api/consent.js, production) and the local dev proxy
// (backend/server/index.js). Keeping one copy avoids the two drifting apart,
// the same arrangement as lib/soruKutty.js.

/* Bump when the cookie notice's wording or the categories change: consents
   recorded against an older version are no longer proof of agreement to the
   current policy, so the banner re-asks anyone whose stored version is
   behind this one. */
export const POLICY_VERSION = '2026-08-27'

/* Necessary cookies are not a choice — the cart and consent record itself
   depend on them — so only the optional buckets are stored per visitor. */
export const OPTIONAL_CATEGORIES = ['analytics', 'marketing']

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

/** True when a datastore is wired up. Without it consents are still accepted
 *  and returned to the browser, they are just not retained. */
export const hasStore = Boolean(KV_URL && KV_TOKEN)

/* Consent records are an audit trail, not live app state — two years matches
   the usual re-consent interval and keeps the store from growing forever. */
const TTL_SECONDS = 60 * 60 * 24 * 730

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/**
 * Normalises whatever the browser posted into exactly the record we store.
 * Returns { record } on success or { error } with a client-safe message —
 * callers turn that into a 400 for their platform.
 */
export function buildRecord({ body, ip, userAgent, now }) {
  const { id, categories } = body || {}

  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return { error: 'A consent id of 8-64 url-safe characters is required.' }
  }

  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    return { error: 'categories object is required.' }
  }

  // Only the categories we know about are read, and each is coerced to a
  // strict boolean, so a caller cannot widen the record or store junk.
  const stored = {}
  for (const name of OPTIONAL_CATEGORIES) {
    stored[name] = categories[name] === true
  }

  return {
    record: {
      id,
      categories: { necessary: true, ...stored },
      policyVersion: POLICY_VERSION,
      recordedAt: new Date(now).toISOString(),
      // Truncated so the record proves consent without being a precise
      // identifier of the visitor: IPv4 loses its last octet, IPv6 keeps
      // only its routing prefix.
      ipPrefix: anonymiseIp(ip),
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 256) : null,
    },
  }
}

/** Drops the host-identifying part of an IP, keeping enough for jurisdiction. */
export function anonymiseIp(ip) {
  if (typeof ip !== 'string' || !ip) return null
  // Proxies chain addresses; the client is the first entry.
  const first = ip.split(',')[0].trim()
  if (!first) return null
  if (first.includes(':')) {
    // Already-abbreviated forms (loopback "::1", "fe80::…") have no full
    // prefix to trim, so they are kept as-is rather than gaining a second "::".
    if (first.includes('::')) return first
    return first.split(':').slice(0, 3).join(':') + '::'
  }
  const parts = first.split('.')
  return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.0` : null
}

/** Reads the caller's IP from the proxy headers Vercel and Express both set. */
export function clientIp(req) {
  const headers = req.headers || {}
  return (
    headers['x-forwarded-for'] ||
    headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    ''
  )
}

async function kv(command) {
  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const err = new Error(`Consent store responded ${response.status}: ${detail}`)
    err.status = 502
    err.publicMessage = 'Could not reach the consent store.'
    throw err
  }

  return (await response.json()).result
}

/**
 * Persists one consent record. Resolves to true when it was stored and false
 * when no store is configured — a missing store must not fail the request,
 * because the visitor's choice is honoured in the browser either way.
 */
export async function saveRecord(record) {
  if (!hasStore) return false
  await kv(['SET', `consent:${record.id}`, JSON.stringify(record), 'EX', String(TTL_SECONDS)])
  return true
}

/** Looks up a previously stored consent, or null if absent/unconfigured. */
export async function readRecord(id) {
  if (!hasStore) return null
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null
  const raw = await kv(['GET', `consent:${id}`])
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    // A record we cannot parse is treated as absent; the banner re-asks.
    return null
  }
}
