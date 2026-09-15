// Thin wrapper functions around the EXISTING /api/track/* endpoints
// (api/track/session.js, heartbeat.js, pageview.js). Those endpoints and the
// hook that already calls them (src/hooks/useVisitorTracking.jsx) are
// untouched — this file does not change behavior, it just gives service-call
// sites a reusable, documented shape instead of ad-hoc fetch() calls, for any
// future code that wants to fire these outside that hook.
//
// Every call here is best-effort: analytics must never break the page, so
// each function swallows network/HTTP errors and resolves { ok: false }
// rather than throwing. Matches the existing hook's `post()` helper, which
// does the same (`.catch(() => {})`).

function post(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  })
    .then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` }
      return data ?? { ok: true }
    })
    .catch((err) => ({ ok: false, error: err?.message || 'Network error' }))
}

/**
 * Start a visitor session. Mirrors the exact payload shape
 * api/track/session.js expects (see api/_lib/analytics.js buildSessionRow).
 * @param {{ visitorId: string, sessionId: string, referrer?: string, utmSource?: string, utmMedium?: string, utmCampaign?: string, screenWidth?: number, screenHeight?: number }} params
 * @returns {Promise<{ ok: boolean, stored?: boolean, error?: string }>}
 */
export function startSession(params) {
  return post('/api/track/session', params)
}

/**
 * Periodic heartbeat for an active session.
 * @param {{ sessionId: string, totalSeconds: number, pageCount: number }} params
 * @returns {Promise<{ ok: boolean, stored?: boolean, error?: string }>}
 */
export function sendHeartbeat(params) {
  return post('/api/track/heartbeat', params)
}

/**
 * Record one page view (with time spent on the previous page).
 * @param {{ sessionId: string, path: string, secondsOnPage?: number }} params
 * @returns {Promise<{ ok: boolean, stored?: boolean, error?: string }>}
 */
export function recordPageview(params) {
  return post('/api/track/pageview', params)
}
