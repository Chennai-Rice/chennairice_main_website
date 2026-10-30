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
      value: Number(p.value.int64Value ?? p.value.doubleValue ?? 0),
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

async function projectUsage(projectId, days) {
  const [hosting, requests, reads, writes, deletes, cpu, disk, tokens] = await Promise.all([
    series(projectId, 'firebasehosting.googleapis.com/network/sent_bytes_count', { days, groupBy: ['resource.label.site_name'] }),
    series(projectId, 'run.googleapis.com/request_count', { days, groupBy: ['resource.label.service_name', 'metric.label.response_code_class'] }),
    series(projectId, 'firestore.googleapis.com/document/read_count', { days, period: days * DAY }),
    series(projectId, 'firestore.googleapis.com/document/write_count', { days, period: days * DAY }),
    series(projectId, 'firestore.googleapis.com/document/delete_count', { days, period: days * DAY }),
    series(projectId, 'cloudsql.googleapis.com/database/cpu/utilization', { days: 1, period: 3600, aligner: 'ALIGN_MEAN', reducer: 'REDUCE_NONE' }),
    series(projectId, 'cloudsql.googleapis.com/database/disk/utilization', { days: 1, period: 3600, aligner: 'ALIGN_MEAN', reducer: 'REDUCE_NONE' }),
    series(projectId, 'aiplatform.googleapis.com/publisher/online_serving/token_count', { days, period: days * DAY, groupBy: ['resource.label.model_user_id'] }),
  ])
  const services = {}
  for (const r of requests) {
    const s = (services[r.labels.service_name] ||= { name: r.labels.service_name, requests: 0, errors: 0 })
    const n = r.points.reduce((a, p) => a + p.value, 0)
    s.requests += n
    if (r.labels.response_code_class === '5xx') s.errors += n
  }
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

// ---- Alerts ------------------------------------------------------------------------
export function cloudAlerts({ projects, jobs, api, now = Date.now() }) {
  const out = []
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
  const [api, jobs] = await Promise.all([apiUsageReport(q, days), jobsReport(q, days)])
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
    alerts: cloudAlerts({ projects: googleData.projects, jobs, api }),
    projects: googleData.projects, deploys, api, jobs,
  }
}
