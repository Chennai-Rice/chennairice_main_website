// Website visitor analytics for /admin (Nov 2026: moved off Supabase to Cloud SQL, migration 053).
// The dashboard pulls the raw tables once and builds its reports in the browser (services/admin.service.js),
// so these return the same rows the Supabase queries did. Staff only (web.analytics).
import { query as defaultQuery } from '../db.js'

const ROW_LIMIT = 5000
const ts = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null)

/** visitors, visitor_sessions, visitor_pageviews and visitor_events (newest first, up to 5,000 each). */
export async function rawAnalytics({ query = defaultQuery } = {}) {
  const [visitors, sessions, pageviews, events] = await Promise.all([
    query(`select * from visitors order by visitor_no asc limit ${ROW_LIMIT}`),
    query(`select * from visitor_sessions order by started_at desc limit ${ROW_LIMIT}`),
    query(`select * from visitor_pageviews order by entered_at desc limit ${ROW_LIMIT}`),
    query(`select * from visitor_events order by occurred_at desc limit ${ROW_LIMIT}`),
  ])
  return {
    visitors: visitors.rows, sessions: sessions.rows, pageviews: pageviews.rows, events: events.rows,
    truncated: sessions.rows.length >= ROW_LIMIT || pageviews.rows.length >= ROW_LIMIT || visitors.rows.length >= ROW_LIMIT,
  }
}

async function elements(kind, from, limit, query) {
  const { rows } = await query(
    `select i.path, i.selector, mode() within group (order by i.label) as label, mode() within group (order by i.tag) as tag,
            count(*)::int as hits, count(distinct i.visitor_id)::int as visitors, coalesce(sum(i.click_count), 0)::int as total_burst,
            max(i.occurred_at) as last_at
       from visitor_interactions i
      where i.kind = $1 and ($2::timestamptz is null or i.occurred_at >= $2)
      group by i.path, i.selector order by hits desc limit $3`, [kind, from, limit])
  return rows
}

/** Clicks, rage clicks, dead clicks per page and element, and scroll depth (the former Supabase functions). */
export async function behaviour({ from } = {}, { query = defaultQuery } = {}) {
  const f = ts(from)
  const [pages, rage, dead, clicks, scroll] = await Promise.all([
    query(
      `select i.path, count(*) filter (where i.kind = 'click')::int as clicks, count(*) filter (where i.kind = 'rage_click')::int as rage_clicks,
              count(*) filter (where i.kind = 'dead_click')::int as dead_clicks, count(distinct i.visitor_id)::int as visitors, max(i.occurred_at) as last_at
         from visitor_interactions i where $1::timestamptz is null or i.occurred_at >= $1 group by i.path order by clicks desc`, [f]).then((r) => r.rows),
    elements('rage_click', f, 100, query),
    elements('dead_click', f, 100, query),
    elements('click', f, 200, query),
    query(
      `select v.path, count(*)::int as views, count(v.max_scroll_percent)::int as measured, round(avg(v.max_scroll_percent), 1) as avg_depth,
              percentile_cont(0.5) within group (order by v.max_scroll_percent) as median_depth,
              count(*) filter (where v.max_scroll_percent >= 50)::int as reached_50, count(*) filter (where v.max_scroll_percent >= 90)::int as reached_90
         from visitor_pageviews v where $1::timestamptz is null or v.entered_at >= $1 group by v.path order by views desc`, [f]).then((r) => r.rows),
  ])
  return { pages, rage, dead, elements: clicks, scroll }
}

/** Click positions on one page, for one screen-width band. */
export async function heatmap({ path, from, minWidth, maxWidth, limit } = {}, { query = defaultQuery } = {}) {
  const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  const { rows } = await query(
    `select i.rel_x, i.abs_y, i.kind from visitor_interactions i
      where i.path = $1 and i.rel_x is not null and i.abs_y is not null
        and ($2::timestamptz is null or i.occurred_at >= $2) and ($3::int is null or i.viewport_width >= $3) and ($4::int is null or i.viewport_width <= $4)
      order by i.occurred_at desc limit $5`,
    [String(path || '').slice(0, 512), ts(from), n(minWidth), n(maxWidth), Math.min(n(limit) || 5000, 20000)])
  return { points: rows }
}
