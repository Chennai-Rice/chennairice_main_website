// Cloud Centre (/admin, Oct 2026), Phase 2: checks run by the 10-minute job (jobs.js).
//
//   Uptime     every run: each site and the shop API is fetched once (10 s limit);
//              up = an answer below 400. Saved in uptime_checks (migration 033).
//   Speed      at night (1-6 am India time), one page per run through Google
//              PageSpeed Insights (mobile and desktop), so each is checked once a
//              day. Needs a PageSpeed API key, set on the Cloud Centre page.
//   Alerts     an email to the Cloud Centre alert list when a site is down twice
//              in a row, the background job failed its last runs, or the website
//              API's server errors pass 5% in the last hour. One email per problem
//              per 6 hours (queueEmail's dedupe key).
// Never throws.
import { query as defaultQuery } from '../db.js'
import { queueEmail, parseEmailList } from './email.js'

export const UPTIME_TARGETS = [
  { id: 'website', label: 'chennairiceindustries.com', url: 'https://chennairiceindustries.com/' },
  { id: 'shop-api', label: 'Shop API (catalogue)', url: 'https://chennairiceindustries.com/api/catalog' },
  { id: 'contest', label: 'Contest site', url: 'https://coupon.chennairiceindustries.com/' },
  { id: 'cholan', label: 'Cholan Rice site', url: 'https://cholan-rice-site.web.app/' },
  { id: 'cff-website', label: 'CFF website', url: 'https://cff-website-page.web.app/' },
  { id: 'cff-landing', label: 'CFF landing page', url: 'https://cff-landing-page.web.app/' },
]

export const SPEED_PAGES = [
  'https://chennairiceindustries.com/',
  'https://chennairiceindustries.com/rice-products',
  'https://chennairiceindustries.com/products/kitchidi-ponni-rice',
  'https://chennairiceindustries.com/ponni-rice',
  'https://coupon.chennairiceindustries.com/',
]

// Tests: the sites to check and how to fetch them, instead of the real internet.
let testHooks = null
export function setCloudChecksForTests(hooks) { testHooks = hooks }

const SETTING = { alertEmails: 'cloud_alert_emails', pagespeedKey: 'cloud_pagespeed_key' }

async function getSetting(query, key) {
  const { rows: [r] } = await query(`select value from company_settings where key = $1`, [key]).catch(() => ({ rows: [] }))
  return r?.value ?? ''
}

/** Who gets Cloud Centre alerts: the list on the page, or else the active IT team accounts. */
export async function alertRecipients({ query = defaultQuery } = {}) {
  const list = parseEmailList(await getSetting(query, SETTING.alertEmails))
  if (list.length) return list.join(', ')
  const { rows } = await query(`select email from staff_users where is_active and role = 'it'`).catch(() => ({ rows: [] }))
  return rows.map((r) => r.email).join(', ')
}

/** The page's settings, with the API key never sent back (only whether one is set). */
export async function cloudSettings({ query = defaultQuery } = {}) {
  const [emails, key] = await Promise.all([getSetting(query, SETTING.alertEmails), getSetting(query, SETTING.pagespeedKey)])
  return { alertEmails: parseEmailList(emails), pagespeedKeySet: Boolean(key), recipients: await alertRecipients({ query }) }
}

export async function saveCloudSettings({ query = defaultQuery } = {}, body = {}) {
  const save = (key, value) => query(
    `insert into company_settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, value])
  if (body.alertEmails !== undefined) {
    const list = parseEmailList(Array.isArray(body.alertEmails) ? body.alertEmails.join(',') : body.alertEmails)
    await save(SETTING.alertEmails, list.join(', '))
  }
  if (body.pagespeedKey !== undefined) {
    const key = String(body.pagespeedKey || '').trim()
    if (key && !/^[\w-]{20,60}$/.test(key)) throw Object.assign(new Error('That does not look like a Google API key.'), { status: 400 })
    await save(SETTING.pagespeedKey, key)
  }
  return cloudSettings({ query })
}

// ---- Uptime --------------------------------------------------------------------
export async function checkUptime({ query = defaultQuery, targets = testHooks?.targets ?? UPTIME_TARGETS, fetchFn = testHooks?.fetch ?? fetch } = {}) {
  if (!targets.length) return { checked: 0, down: [] }
  const results = await Promise.all(targets.map(async (t) => {
    const start = Date.now()
    try {
      const res = await fetchFn(t.url, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'ChennaiRice-CloudCentre-Uptime/1.0' } })
      return { target: t.id, ok: res.status < 400, status: res.status, ms: Date.now() - start, error: null }
    } catch (err) {
      return { target: t.id, ok: false, status: null, ms: Date.now() - start, error: String(err.name === 'TimeoutError' ? 'No answer within 10 s' : err.message).slice(0, 300) }
    }
  }))
  await query(
    `insert into uptime_checks (target, ok, status, ms, error)
     select * from unnest($1::text[], $2::boolean[], $3::int[], $4::int[], $5::text[])`,
    [results.map((r) => r.target), results.map((r) => r.ok), results.map((r) => r.status), results.map((r) => r.ms), results.map((r) => r.error)])
  return { checked: results.length, down: results.filter((r) => !r.ok).map((r) => r.target) }
}

// ---- Website speed (PageSpeed Insights) -----------------------------------------
const istHourNow = (now) => new Date(now.getTime() + 330 * 60_000).getUTCHours()

/** One PageSpeed result in our columns. */
export function speedRow(url, strategy, r) {
  const audits = r?.lighthouseResult?.audits || {}
  const field = r?.loadingExperience?.metrics ? r.loadingExperience : null
  const score = r?.lighthouseResult?.categories?.performance?.score
  return {
    url, strategy,
    score: score == null ? null : Math.round(score * 100),
    lab_lcp_ms: audits['largest-contentful-paint']?.numericValue != null ? Math.round(audits['largest-contentful-paint'].numericValue) : null,
    lab_tbt_ms: audits['total-blocking-time']?.numericValue != null ? Math.round(audits['total-blocking-time'].numericValue) : null,
    lab_cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    field_category: field?.overall_category || null,
    field_lcp_ms: field?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    field_inp_ms: field?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    field_cls: field?.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
  }
}

export async function checkSpeed({ query = defaultQuery, now = new Date(), fetchFn = testHooks?.fetch ?? fetch, force = false } = {}) {
  if (!force && (istHourNow(now) < 1 || istHourNow(now) >= 6)) return { skipped: 'outside 1-6 am' }
  const key = await getSetting(query, SETTING.pagespeedKey)
  if (!key) return { skipped: 'no PageSpeed API key' }
  // The page and device checked longest ago (or never), unless all were checked in the last 20 hours.
  const { rows: done } = await query(
    `select url, strategy, max(checked_at) as at from site_speed where checked_at > now() - interval '20 hours' group by url, strategy`)
  const next = SPEED_PAGES.flatMap((url) => ['mobile', 'desktop'].map((strategy) => ({ url, strategy })))
    .find((p) => !done.some((d) => d.url === p.url && d.strategy === p.strategy))
  if (!next) return { skipped: 'all pages checked today' }
  let row
  try {
    const qs = new URLSearchParams({ url: next.url, strategy: next.strategy, category: 'performance', key })
    const res = await fetchFn(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(70_000) })
    if (!res.ok) throw new Error(`PageSpeed ${res.status}`)
    row = speedRow(next.url, next.strategy, await res.json())
  } catch (err) {
    row = { ...speedRow(next.url, next.strategy, null), error: String(err.message).slice(0, 300) }
  }
  const cols = ['url', 'strategy', 'score', 'lab_lcp_ms', 'lab_tbt_ms', 'lab_cls', 'field_category', 'field_lcp_ms', 'field_inp_ms', 'field_cls', 'error']
  await query(`insert into site_speed (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, cols.map((c) => row[c] ?? null))
  return { checked: `${next.strategy} ${next.url}`, score: row.score, error: row.error || undefined }
}

// ---- Alert emails -------------------------------------------------------------------
export async function cloudAlertEmails({ query = defaultQuery, now = new Date() } = {}) {
  const problems = []
  // A site down in its last two checks.
  const { rows: down } = await query(
    `select target, (array_agg(status order by checked_at desc))[1] as status, (array_agg(error order by checked_at desc))[1] as error
       from (select target, ok, status, error, checked_at, row_number() over (partition by target order by checked_at desc) as n
               from uptime_checks where checked_at > now() - interval '1 hour') c
      where n <= 2 group by target having count(*) = 2 and bool_and(not ok)`)
  for (const d of down) {
    const t = UPTIME_TARGETS.find((x) => x.id === d.target)
    problems.push({ key: `down:${d.target}`, text: `${t?.label || d.target} is DOWN (${t?.url || ''}): ${d.error || 'HTTP ' + d.status}, in the last two checks.` })
  }
  // The background job failed its last three runs.
  const { rows: runs } = await query(`select ok, error from job_runs where job = 'salesJobs' order by started_at desc limit 3`)
  if (runs.length === 3 && runs.every((r) => !r.ok)) problems.push({ key: 'job', text: `The 10-minute background job failed its last 3 runs: ${runs[0].error || 'error'}` })
  // The website API's server errors in the last hour.
  const { rows: [api] } = await query(
    `select coalesce(sum(calls), 0)::int as calls, coalesce(sum(errors), 0)::int as errors from api_usage
      where (day + make_interval(hours => hour)) >= (now() at time zone 'Asia/Kolkata') - interval '1 hour'`)
  if (api && api.calls >= 50 && api.errors / api.calls > 0.05) {
    problems.push({ key: 'api', text: `Website API: ${api.errors} of ${api.calls} calls failed with server errors in the last hour (${Math.round(api.errors / api.calls * 100)}%).` })
  }
  if (!problems.length) return { sent: 0 }
  const to = await alertRecipients({ query })
  if (!to) return { sent: 0, problems: problems.length, note: 'no alert recipients' }
  const window = Math.floor(now.getTime() / (6 * 3600_000))
  for (const p of problems) {
    await queueEmail({ query }, {
      to, template: 'cloud_alert', dedupeKey: `cloud-alert:${p.key}:${window}`,
      subject: `⚠ Cloud Centre alert: ${p.text.slice(0, 90)}`,
      text: `${p.text}\n\nSee /admin → Cloud Centre: https://chennairiceindustries.com/admin\n\nYou get this because you are on the Cloud Centre alert list. The same problem is emailed at most once every 6 hours.`,
    })
  }
  return { sent: problems.length }
}

/** Everything the 10-minute job does for the Cloud Centre. */
export async function runCloudChecks({ query = defaultQuery, now = new Date() } = {}) {
  const out = {}
  try { out.uptime = await checkUptime({ query }) } catch (err) { out.uptime = { error: err.message } }
  try { out.alerts = await cloudAlertEmails({ query, now }) } catch (err) { out.alerts = { error: err.message } }
  try { out.speed = await checkSpeed({ query, now }) } catch (err) { out.speed = { error: err.message } }
  return out
}
