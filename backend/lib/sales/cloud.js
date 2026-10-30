// /admin → Cloud Centre (Oct 2026, Phase 1): every Google Cloud and Firebase
// project of the organisation in one view: what each is for and billed to,
// what runs in it, how much it is used, the Firebase Hosting deploys, and the
// website's own API and background-job counters (api-usage.js).
//
// Read-only. The server account (api-backend@) holds viewer roles only, at the
// organisation (Browser, Monitoring, Cloud Asset, Error Reporting, Firebase
// Hosting, Service Usage) and on both billing accounts. No logs are read or kept.
// Google's answers are cached 10 minutes per server instance.
import { applicationDefault } from 'firebase-admin/app'
import { query as defaultQuery } from '../db.js'
import { UPTIME_TARGETS, SPEED_PAGES } from './cloud-checks.js'

const ORG = process.env.GCP_ORG_ID || '731915549550'
const CACHE_MS = 10 * 60_000
const DAY = 86_400

// What each project is for, in the team's words (the resources themselves are listed live).
export const PROJECT_PURPOSE = {
  'chennai-rice-website': 'chennairiceindustries.com: the website, the shop API, the 10-minute job and the AI features',
  'chennairice-website': 'The website database (Cloud SQL) and its secrets',
  couponchennairice: 'Super Slogan Contest site (coupon.chennairiceindustries.com)',
  'chennai-rice-coupon': 'Earlier coupon project',
  'cholan-rice-site': 'Cholan Rice website',
  'cff-website-page': 'CFF website',
  'cff-landing-page': 'CFF landing page',
  'gen-lang-client-0572012195': 'Gemini API key project',
  'gyb-migration-new': 'Got Your Back (email backup)',
  'gyb-project-t14-1f1-dpo': 'Got Your Back (email backup)',
  'alpine-flare-507409-n9': 'My First Project (default, unused)',
}

// ---- Google REST, with the server's own credentials --------------------------
let token = null
async function accessToken() {
  if (token && token.until > Date.now() + 60_000) return token.value
  const t = await applicationDefault().getAccessToken()
  token = { value: t.access_token, until: Date.now() + (t.expires_in || 3000) * 1000 }
  return token.value
}

async function googleGet(url) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + await accessToken() }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) {
    const err = new Error(`Google ${res.status} for ${url.split('?')[0]}`)
    err.status = res.status
    throw err
  }
  return res.json()
}
let google = googleGet
/** Tests answer Google's calls from fixtures. */
export function setGoogleForTests(fn) { google = fn || googleGet; cache.clear() }

// 403 / 404 / 409: no such service in that project (e.g. not a Firebase project), so nothing to show.
const soft = (p, fallback) => p.catch((err) => { if (![403, 404, 409].includes(err.status)) console.warn('[cloud]', err.message); return fallback })

async function pages(url, key, max = 5) {
  const out = []
  let next = ''
  for (let i = 0; i < max; i++) {
    const r = await google(url + (next ? `${url.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(next)}` : ''))
    out.push(...(r[key] || []))
    if (!(next = r.nextPageToken)) break
  }
  return out
}

// ---- What exists ---------------------------------------------------------------
async function listProjects() {
  const rows = await pages(`https://cloudresourcemanager.googleapis.com/v3/projects:search?pageSize=100`, 'projects')
  return rows.map((p) => ({ id: p.projectId, name: p.displayName || p.projectId, number: p.name.split('/')[1], state: p.state }))
}

async function billingByProject() {
  const accounts = await pages('https://cloudbilling.googleapis.com/v1/billingAccounts?pageSize=50', 'billingAccounts')
  const map = {}
  await Promise.all(accounts.map(async (a) => {
    const projects = await soft(pages(`https://cloudbilling.googleapis.com/v1/${a.name}/projects?pageSize=100`, 'projectBillingInfo'), [])
    for (const p of projects) map[p.projectId] = { account: a.displayName || a.name.split('/')[1], accountId: a.name.split('/')[1], enabled: Boolean(p.billingEnabled) }
  }))
  return map
}

const ASSET_TYPES = {
  'run.googleapis.com/Service': 'Cloud Run service',
  'cloudfunctions.googleapis.com/Function': 'Cloud Function',
  'sqladmin.googleapis.com/Instance': 'Cloud SQL database',
  'firestore.googleapis.com/Database': 'Firestore database',
  'storage.googleapis.com/Bucket': 'Storage bucket',
}
async function inventory() {
  const types = Object.keys(ASSET_TYPES).map((t) => 'assetTypes=' + encodeURIComponent(t)).join('&')
  const rows = await pages(`https://cloudasset.googleapis.com/v1/organizations/${ORG}:searchAllResources?${types}&pageSize=200`, 'results')
  return rows.map((r) => ({
    projectNumber: String(r.project || '').split('/')[1], type: ASSET_TYPES[r.assetType] || r.assetType,
    name: r.displayName, location: r.location || '', state: r.state || '', created: r.createTime || null, updated: r.updateTime || null,
  }))
}

async function hostingSites(projectId) {
  const r = await soft(google(`https://firebasehosting.googleapis.com/v1beta1/projects/${projectId}/sites`), {})
  return Promise.all((r.sites || []).map(async (s) => {
    const site = s.name.split('/').pop()
    const rel = await soft(google(`https://firebasehosting.googleapis.com/v1beta1/sites/${site}/releases?pageSize=15`), {})
    return {
      site, url: s.defaultUrl,
      releases: (rel.releases || []).map((x) => ({
        at: x.releaseTime, by: x.releaseUser?.email || '', type: x.type, message: x.message || '', files: Number(x.version?.fileCount) || null,
      })),
    }
  }))
}

/** A project's resources; a 2nd-gen Cloud Function's own Cloud Run service is not listed twice. */
export function ownResources(assets, projectNumber) {
  const mine = assets.filter((a) => a.projectNumber === projectNumber)
  const functions = new Set(mine.filter((a) => a.type === 'Cloud Function').map((a) => a.name.toLowerCase()))
  return mine.filter((a) => !(a.type === 'Cloud Run service' && functions.has(a.name.toLowerCase()))).map(({ projectNumber: _, ...r }) => r)
}

// ---- How much it is used (Cloud Monitoring) ------------------------------------
async function series(projectId, metric, { days, period = DAY, aligner = 'ALIGN_SUM', reducer = 'REDUCE_SUM', groupBy = [] }) {
  const end = new Date()
  const start = new Date(end.getTime() - days * DAY * 1000)
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    'interval.startTime': start.toISOString(), 'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${period}s`, 'aggregation.perSeriesAligner': aligner, 'aggregation.crossSeriesReducer': reducer,
  })
  for (const g of groupBy) params.append('aggregation.groupByFields', g)
  const r = await soft(google(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`), {})
  return (r.timeSeries || []).map((t) => ({
    labels: { ...t.resource?.labels, ...t.metric?.labels },
    points: (t.points || []).map((p) => ({
      at: p.interval.endTime,
      // A distribution (e.g. container start-ups) counts its events.
      value: Number(p.value.int64Value ?? p.value.doubleValue ?? p.value.distributionValue?.count ?? 0),
    })),
  }))
}
const total = (rows) => rows.reduce((s, r) => s + r.points.reduce((a, p) => a + p.value, 0), 0)
/** Points summed by India day: [{ day: '2026-10-29', value }], oldest first. */
function byDay(rows) {
  const m = new Map()
  for (const r of rows) for (const p of r.points) {
    const day = new Date(new Date(p.at).getTime() + 330 * 60_000 - 1000).toISOString().slice(0, 10)
    m.set(day, (m.get(day) || 0) + p.value)
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value }))
}
const latest = (row) => row?.points?.[0]?.value ?? null // Monitoring returns the newest point first

const ERROR_PERIOD = { 1: 'PERIOD_1_DAY', 7: 'PERIOD_1_WEEK', 30: 'PERIOD_30_DAYS' }

/** Error Reporting: the project's errors grouped by kind, most frequent first. */
async function errorGroups(projectId, days) {
  const r = await soft(google(`https://clouderrorreporting.googleapis.com/v1beta1/projects/${projectId}/groupStats?${new URLSearchParams({
    'timeRange.period': ERROR_PERIOD[days], order: 'COUNT_DESC', pageSize: '10',
  })}`), {})
  return (r.errorGroupStats || []).map((g) => ({
    id: g.group?.groupId || '', count: Number(g.count) || 0,
    // The first line only, so stack traces (and anything personal in them) stay out of the page.
    message: String(g.representative?.message || '').split('\n')[0].slice(0, 240),
    service: g.affectedServices?.[0]?.service || '', firstSeen: g.firstSeenTime || null, lastSeen: g.lastSeenTime || null,
    resolution: g.group?.resolutionStatus || 'OPEN',
  }))
}

async function projectUsage(projectId, days) {
  const whole = { days, period: days * DAY }
  const [hosting, requests, reads, writes, deletes, cpu, disk, tokens, p50, p95, starts, errors] = await Promise.all([
    series(projectId, 'firebasehosting.googleapis.com/network/sent_bytes_count', { days, groupBy: ['resource.label.site_name'] }),
    series(projectId, 'run.googleapis.com/request_count', { days, groupBy: ['resource.label.service_name', 'metric.label.response_code_class'] }),
    series(projectId, 'firestore.googleapis.com/document/read_count', { days, period: days * DAY }),
    series(projectId, 'firestore.googleapis.com/document/write_count', { days, period: days * DAY }),
    series(projectId, 'firestore.googleapis.com/document/delete_count', { days, period: days * DAY }),
    series(projectId, 'cloudsql.googleapis.com/database/cpu/utilization', { days: 1, period: 3600, aligner: 'ALIGN_MEAN', reducer: 'REDUCE_NONE' }),
    series(projectId, 'cloudsql.googleapis.com/database/disk/utilization', { days: 1, period: 3600, aligner: 'ALIGN_MEAN', reducer: 'REDUCE_NONE' }),
    series(projectId, 'aiplatform.googleapis.com/publisher/online_serving/token_count', { days, period: days * DAY, groupBy: ['resource.label.model_user_id'] }),
    // How fast each Cloud Run service answers (median and slowest 5%), and how often it had to start up cold.
    series(projectId, 'run.googleapis.com/request_latencies', { ...whole, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_50', groupBy: ['resource.label.service_name'] }),
    series(projectId, 'run.googleapis.com/request_latencies', { ...whole, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', groupBy: ['resource.label.service_name'] }),
    series(projectId, 'run.googleapis.com/container/startup_latencies', { ...whole, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_SUM', groupBy: ['resource.label.service_name'] }),
    errorGroups(projectId, days),
  ])
  const services = {}
  const svc = (name) => (services[name] ||= { name, requests: 0, errors: 0, p50Ms: null, p95Ms: null, coldStarts: 0 })
  for (const r of requests) {
    const s = svc(r.labels.service_name)
    const n = r.points.reduce((a, p) => a + p.value, 0)
    s.requests += n
    if (r.labels.response_code_class === '5xx') s.errors += n
  }
  for (const r of p50) svc(r.labels.service_name).p50Ms = latest(r)
  for (const r of p95) svc(r.labels.service_name).p95Ms = latest(r)
  for (const r of starts) svc(r.labels.service_name).coldStarts = total([r])
  return {
    hostingBytes: total(hosting), hostingDaily: byDay(hosting),
    requests: total(requests), errors: Object.values(services).reduce((a, s) => a + s.errors, 0), requestsDaily: byDay(requests),
    services: Object.values(services).sort((a, b) => b.requests - a.requests),
    firestore: reads.length || writes.length ? { reads: total(reads), writes: total(writes), deletes: total(deletes) } : null,
    databases: cpu.map((c) => ({
      id: c.labels.database_id, cpu: latest(c),
      disk: latest(disk.find((d) => d.labels.database_id === c.labels.database_id)),
    })),
    aiTokens: total(tokens), aiModels: tokens.map((t) => ({ model: t.labels.model_user_id, tokens: total([t]) })),
    errorGroups: errors,
  }
}

// ---- The website's own counters (migration 032) --------------------------------
async function apiUsageReport(q, days) {
  const since = `(now() at time zone 'Asia/Kolkata')::date - $1::int + 1`
  const [routes, daily, today] = await Promise.all([
    q(`select route, method, sum(calls)::int as calls, sum(errors)::int as errors, sum(rejected)::int as rejected,
              round(sum(total_ms)::numeric / nullif(sum(calls), 0))::int as avg_ms, max(max_ms)::int as max_ms
         from api_usage where day >= ${since} group by route, method order by calls desc limit 150`, [days]),
    q(`select day::text, sum(calls)::int as calls, sum(errors)::int as errors from api_usage where day >= ${since} group by day order by day`, [days]),
    q(`select hour, sum(calls)::int as calls, sum(errors)::int as errors from api_usage
        where day = (now() at time zone 'Asia/Kolkata')::date group by hour order by hour`),
  ])
  return { routes: routes.rows, daily: daily.rows, today: today.rows }
}

async function jobsReport(q, days) {
  const [runs, stats] = await Promise.all([
    q(`select id, job, started_at, ms, ok, result, error from job_runs order by started_at desc limit 60`),
    q(`select job, count(*)::int as runs, count(*) filter (where not ok)::int as failed, round(avg(ms))::int as avg_ms,
              max(ms)::int as max_ms, max(started_at) as last_run
         from job_runs where started_at > now() - make_interval(days => $1) group by job`, [days]),
  ])
  return { runs: runs.rows, stats: stats.rows }
}

// ---- Phase 2: uptime, website speed, the database, deliveries (migration 033) ----
async function uptimeReport(q, days) {
  const [stats, recent] = await Promise.all([
    q(`select target, count(*)::int as checks, count(*) filter (where ok)::int as up, round(avg(ms))::int as avg_ms,
              (array_agg(ok order by checked_at desc))[1] as last_ok, max(checked_at) as last_at,
              (array_agg(coalesce(error, 'HTTP ' || status) order by checked_at desc))[1] as last_result
         from uptime_checks where checked_at > now() - make_interval(days => $1) group by target`, [days]),
    q(`select target, checked_at, status, error from uptime_checks
        where not ok and checked_at > now() - make_interval(days => $1) order by checked_at desc limit 30`, [days]),
  ])
  return {
    targets: UPTIME_TARGETS.map((t) => {
      const s = stats.rows.find((r) => r.target === t.id)
      return { ...t, checks: s?.checks || 0, uptime: s?.checks ? s.up / s.checks : null, avgMs: s?.avg_ms ?? null, lastOk: s?.last_ok ?? null, lastAt: s?.last_at ?? null, lastResult: s?.last_result ?? null }
    }),
    failures: recent.rows,
  }
}

async function speedReport(q) {
  const { rows } = await q(
    `select distinct on (url, strategy) url, strategy, checked_at, score, lab_lcp_ms, lab_tbt_ms, lab_cls, field_category, field_lcp_ms, field_inp_ms, field_cls, error
       from site_speed order by url, strategy, checked_at desc`)
  return SPEED_PAGES.map((url) => ({ url, mobile: rows.find((r) => r.url === url && r.strategy === 'mobile') || null, desktop: rows.find((r) => r.url === url && r.strategy === 'desktop') || null }))
}

/** The website database itself: size, biggest tables, connections and (when switched on) the slowest queries. */
async function databaseReport(q) {
  const safe = (p) => p.then((r) => r.rows).catch(() => null)
  const [size, tables, conns, ext] = await Promise.all([
    safe(q(`select pg_database_size(current_database())::bigint as bytes`)),
    safe(q(`select relname as name, n_live_tup::bigint as rows, pg_total_relation_size(relid)::bigint as bytes
              from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 12`)),
    safe(q(`select coalesce(state, 'other') as state, count(*)::int as n from pg_stat_activity where datname = current_database() group by 1`)),
    safe(q(`select 1 from pg_extension where extname = 'pg_stat_statements'`)),
  ])
  let slow = null
  if (ext?.length) {
    slow = await safe(q(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 220) as query, calls::bigint as calls,
                                round(mean_exec_time::numeric, 1) as mean_ms, round(total_exec_time::numeric) as total_ms
                           from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())
                          order by total_exec_time desc limit 10`))
  }
  return { bytes: Number(size?.[0]?.bytes) || null, tables: tables || [], connections: conns || [], slowQueries: slow, queryStats: Boolean(ext?.length) }
}

/** What the website sends out (emails, Sales Daddy, WhatsApp, NeoDove): failed and still waiting. */
async function deliveriesReport(q, days) {
  const one = async (name, table) => {
    const { rows: [r] } = await q(
      `select count(*) filter (where status = 'sent' and created_at > now() - make_interval(days => $1))::int as sent,
              count(*) filter (where status = 'failed' and created_at > now() - make_interval(days => $1))::int as failed,
              count(*) filter (where status = 'queued')::int as waiting,
              min(created_at) filter (where status = 'queued') as oldest_waiting
         from ${table}`, [days]).catch(() => ({ rows: [null] }))
    return r ? { name, ...r } : { name, sent: null, failed: null, waiting: null, oldest_waiting: null }
  }
  return Promise.all([one('Emails', 'email_outbox'), one('Sales Daddy', 'crm_outbox'), one('WhatsApp', 'whatsapp_outbox'), one('NeoDove', 'neodove_outbox')])
}

// ---- Alerts ------------------------------------------------------------------------
export function cloudAlerts({ projects, jobs, api, uptime = { targets: [] }, speed = [], deliveries = [], now = Date.now() }) {
  const out = []
  for (const t of uptime.targets) {
    if (t.lastOk === false) out.push({ level: 'bad', text: `${t.label} is not answering (${t.lastResult}) at the last check, ${new Date(t.lastAt).toISOString()}.` })
    else if (t.uptime != null && t.uptime < 0.99) out.push({ level: 'warn', text: `${t.label}: up ${(t.uptime * 100).toFixed(1)}% of checks in this period.` })
  }
  for (const p of speed) if (p.mobile?.score != null && p.mobile.score < 50) {
    out.push({ level: 'warn', text: `Slow on phones: ${p.url.replace('https://', '')} scores ${p.mobile.score}/100 on PageSpeed (mobile).` })
  }
  for (const d of deliveries) {
    if (d.failed) out.push({ level: 'warn', text: `${d.name}: ${d.failed} failed to send in this period.` })
    if (d.oldest_waiting && now - new Date(d.oldest_waiting).getTime() > 6 * 3600_000) out.push({ level: 'warn', text: `${d.name}: ${d.waiting} waiting to send, the oldest since ${new Date(d.oldest_waiting).toISOString()}.` })
  }
  const job = jobs.stats.find((s) => s.job === 'salesJobs')
  const last = jobs.runs.find((r) => r.job === 'salesJobs')
  if (!last) out.push({ level: 'warn', text: 'No background job run recorded yet (salesJobs runs every 10 minutes).' })
  else if (now - new Date(last.started_at).getTime() > 25 * 60_000) out.push({ level: 'bad', text: `The 10-minute background job has not run since ${new Date(last.started_at).toISOString()}.` })
  else if (!last.ok) out.push({ level: 'bad', text: `The last background job run failed: ${last.error || 'error'}` })
  if (job?.failed) out.push({ level: 'warn', text: `${job.failed} of ${job.runs} background job runs failed in this period.` })
  const calls = api.daily.reduce((a, d) => a + d.calls, 0)
  const errs = api.daily.reduce((a, d) => a + d.errors, 0)
  if (calls >= 100 && errs / calls > 0.02) out.push({ level: 'warn', text: `Website API: ${(errs / calls * 100).toFixed(1)}% of calls failed (server errors).` })
  for (const p of projects) {
    const u = p.usage
    if (!u) continue
    for (const s of u.services) if (s.requests >= 100 && s.errors / s.requests > 0.02) {
      out.push({ level: 'warn', project: p.id, text: `${p.id} / ${s.name}: ${(s.errors / s.requests * 100).toFixed(1)}% server errors.` })
    }
    for (const d of u.databases) {
      if (d.cpu != null && d.cpu > 0.8) out.push({ level: 'warn', project: p.id, text: `Database ${d.id}: CPU at ${Math.round(d.cpu * 100)}%.` })
      if (d.disk != null && d.disk > 0.85) out.push({ level: 'bad', project: p.id, text: `Database ${d.id}: disk ${Math.round(d.disk * 100)}% full.` })
    }
    for (const r of p.resources) if (r.type === 'Cloud SQL database' && r.state === 'SUSPENDED') {
      out.push({ level: 'info', project: p.id, text: `Database ${r.name} is suspended (usually unpaid billing or stopped on purpose).` })
    }
  }
  return out
}

// ---- The page ------------------------------------------------------------------
const cache = new Map()

export async function cloudOverview({ query = defaultQuery, days: d } = {}) {
  const days = [1, 7, 30].includes(Number(d)) ? Number(d) : 7
  const hit = cache.get(days)
  const googleData = hit && hit.until > Date.now() ? hit.data : await (async () => {
    const [projects, billing, assets] = await Promise.all([listProjects(), soft(billingByProject(), {}), soft(inventory(), [])])
    const rows = await Promise.all(projects.map(async (p) => {
      const b = billing[p.id] || null
      const active = Boolean(b?.enabled)
      // Projects marked for deletion (kept 30 days by Google) are listed, not queried.
      const live = p.state === 'ACTIVE'
      const [sites, usage] = await Promise.all([live ? hostingSites(p.id) : [], live && active ? projectUsage(p.id, days) : null])
      return {
        ...p, purpose: PROJECT_PURPOSE[p.id] || '', billing: b, active, firebase: sites.length > 0, sites, usage,
        resources: ownResources(assets, p.number),
      }
    }))
    rows.sort((a, b) => Number(b.active) - Number(a.active) || (b.usage?.requests || 0) - (a.usage?.requests || 0) || a.id.localeCompare(b.id))
    const data = { projects: rows, fetchedAt: new Date().toISOString() }
    cache.set(days, { data, until: Date.now() + CACHE_MS })
    return data
  })().catch((err) => {
    // Google unreachable or a role missing: the website's own counters still show.
    console.error('[cloud]', err.message)
    return { projects: [], fetchedAt: null, error: `Could not read Google Cloud just now (${err.message}). The website's own counters are still current.` }
  })

  const q = (text, params) => query(text, params)
  const [api, jobs, uptime, speed, database, deliveries] = await Promise.all([
    apiUsageReport(q, days), jobsReport(q, days), uptimeReport(q, days), speedReport(q), databaseReport(q), deliveriesReport(q, days),
  ])
  const deploys = googleData.projects
    .flatMap((p) => p.sites.flatMap((s) => s.releases.map((r) => ({ project: p.id, site: s.site, url: s.url, ...r }))))
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60)
  const active = googleData.projects.filter((p) => p.usage)
  return {
    days, fetchedAt: googleData.fetchedAt, googleError: googleData.error || null,
    totals: {
      projects: googleData.projects.length, billed: active.length,
      firebase: googleData.projects.filter((p) => p.firebase).length,
      requests: active.reduce((a, p) => a + p.usage.requests, 0),
      errors: active.reduce((a, p) => a + p.usage.errors, 0),
      hostingBytes: active.reduce((a, p) => a + p.usage.hostingBytes, 0),
      aiTokens: active.reduce((a, p) => a + p.usage.aiTokens, 0),
      firestoreReads: active.reduce((a, p) => a + (p.usage.firestore?.reads || 0), 0),
    },
    alerts: cloudAlerts({ projects: googleData.projects, jobs, api, uptime, speed, deliveries }),
    projects: googleData.projects, deploys, api, jobs, uptime, speed, database, deliveries,
  }
}
