// Cloud Centre (/admin, Oct 2026): the website API's own usage counters, so the
// IT team can see calls, errors and speed per route without keeping any logs
// (migration 032). Also the record of every background job run.
//
// Each request adds to a small in-memory tally; the tally is written to
// api_usage (one row per route, method and hour, India time) at most every
// 30 seconds, piggy-backing on a request, so a busy hour costs a handful of
// writes. A tally lost when an instance shuts down is a few seconds of counts.
import { query as defaultQuery, hasDatabase } from '../db.js'

const FLUSH_MS = 30_000
const MAX_KEYS = 300

/** India day and hour of a moment: ['2026-10-30', 14]. */
export function istHour(at = new Date()) {
  const ist = new Date(at.getTime() + 330 * 60_000)
  return [ist.toISOString().slice(0, 10), ist.getUTCHours()]
}

/** The route pattern ("/api/orders/:id"), never the raw URL, so no ids or personal data are stored. */
export function routeOf(req) {
  if (req.route?.path) return String(req.baseUrl || '') + String(req.route.path)
  return req.originalUrl?.startsWith('/api/') ? '(no matching route)' : null
}

export function createApiUsage({ query = defaultQuery, enabled = hasDatabase, now = () => Date.now() } = {}) {
  let tally = new Map()
  let lastFlush = now()
  let flushing = null

  async function flush() {
    if (!tally.size || flushing) return flushing
    const rows = [...tally.values()]
    tally = new Map()
    lastFlush = now()
    flushing = query(
      `insert into api_usage (day, hour, route, method, calls, errors, rejected, total_ms, max_ms)
       select * from unnest($1::date[], $2::smallint[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[], $8::bigint[], $9::int[])
       on conflict (day, hour, route, method) do update set
         calls = api_usage.calls + excluded.calls, errors = api_usage.errors + excluded.errors,
         rejected = api_usage.rejected + excluded.rejected, total_ms = api_usage.total_ms + excluded.total_ms,
         max_ms = greatest(api_usage.max_ms, excluded.max_ms)`,
      ['day', 'hour', 'route', 'method', 'calls', 'errors', 'rejected', 'totalMs', 'maxMs'].map((k) => rows.map((r) => r[k])))
      .catch((err) => console.error('[api usage]', err.message))
      .finally(() => { flushing = null })
    return flushing
  }

  function record(route, method, status, ms, at = new Date(now())) {
    const [day, hour] = istHour(at)
    const key = `${day}|${hour}|${method}|${route}`
    const r = tally.get(key) || { day, hour, route: route.slice(0, 200), method, calls: 0, errors: 0, rejected: 0, totalMs: 0, maxMs: 0 }
    r.calls++
    if (status >= 500) r.errors++
    else if (status >= 400) r.rejected++
    r.totalMs += ms
    r.maxMs = Math.max(r.maxMs, ms)
    tally.set(key, r)
    if (tally.size >= MAX_KEYS || now() - lastFlush >= FLUSH_MS) flush()
  }

  function middleware(req, res, next) {
    if (!enabled() || req.method === 'OPTIONS') return next()
    const start = now()
    res.on('finish', () => {
      const route = routeOf(req)
      if (route) record(route, req.method, res.statusCode, Math.max(0, now() - start))
    })
    next()
  }

  return { middleware, record, flush }
}

/** One run of a background job, as it ended: the job's own summary, or the error it stopped on. */
export async function recordJobRun({ query = defaultQuery } = {}, job, startedAt, result, error) {
  const finished = new Date()
  await query(
    `insert into job_runs (job, started_at, finished_at, ms, ok, result, error) values ($1, $2, $3, $4, $5, $6, $7)`,
    [job, startedAt, finished, finished - startedAt, !error, result ?? null, error ? String(error.message || error).slice(0, 1000) : null])
    .catch((err) => console.error('[job runs]', err.message))
}
