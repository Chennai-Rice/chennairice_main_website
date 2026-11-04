// Analyst → Campaigns → "Google Ads — live": each Google Ads campaign (type, status, daily budget, spend,
// impressions, clicks, Google-counted conversions) next to what the website itself recorded from Google
// Ads: visits (traffic_visits), sign-ups (contest_leads) and paid orders, with cost per order and ROAS.
//
// Google's figures come through the Sales Daddy CRM, which is linked to the Google Ads account: its MCP
// server (https://api.salesdaddy.in/mcp, JSON-RPC over HTTP) answers the google_ads_campaigns tool for
// the last N days up to today. The website's records carry the campaign from the ad link's utm_campaign
// (Final URL suffix), matched to a campaign by ID or name; Google Ads visits without one are listed
// separately, as "campaign not in the link".
//
// Settings: SALESDADDY_MCP_TOKEN (secret: Sales Daddy → Settings → Integrations → AI Assistants → Create
// token, read-only, Marketing & ads); SALESDADDY_WORKSPACE_ID (default the Chennai Rice workspace).
// With no token the panel says how to connect. Answers are kept 5 minutes per period.
import { query as defaultQuery } from '../db.js'
import { httpError } from './util.js'

const MCP_URL = () => process.env.SALESDADDY_MCP_URL || 'https://api.salesdaddy.in/mcp'
const WORKSPACE = () => process.env.SALESDADDY_WORKSPACE_ID || '55e68042-1618-486e-bf58-e948aa0d6ff0'
const CACHE_MS = 5 * 60000
const cache = new Map()
const IST = 330 * 60000

export const googleAdsEnabled = () => Boolean(process.env.SALESDADDY_MCP_TOKEN)

const TYPE = { PERFORMANCE_MAX: 'Performance Max', SEARCH: 'Search', DISPLAY: 'Display', VIDEO: 'Video', SHOPPING: 'Shopping', DEMAND_GEN: 'Demand Gen', MULTI_CHANNEL: 'App' }
const STATUS = { ENABLED: 'Active', PAUSED: 'Paused', REMOVED: 'Removed' }
const num = (v) => Number(v || 0)
const round2 = (n) => Math.round(n * 100) / 100
/** Names compared loosely: "Performance Max-3-11-26" = "performance_max-3-11-26" = "Performance Max 3 11 26". */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** One MCP response body, JSON or a server-sent event stream, as its JSON-RPC message. */
async function rpcBody(res) {
  const text = await res.text()
  if (/^\s*\{/.test(text)) return JSON.parse(text)
  const data = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean)
  for (const d of data.reverse()) { try { const m = JSON.parse(d); if (m.result || m.error) return m } catch { /* next line */ } }
  throw new Error('No answer from Sales Daddy')
}

/** Calls one Sales Daddy MCP tool: initialize, then tools/call (with the session ID when the server gives one). */
async function callTool(name, args) {
  const headers = {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${process.env.SALESDADDY_MCP_TOKEN}`,
  }
  const post = (body, extra = {}) => fetch(MCP_URL(), { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  const fail = (msg, status = 502) => httpError('Sales Daddy: ' + msg, { status, publicMessage: 'Google Ads (through Sales Daddy) did not answer: ' + String(msg).slice(0, 200) })

  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'chennairice-website', version: '1' } } })
  if (!init.ok) throw fail(init.status === 401 ? 'the token was refused (401)' : `HTTP ${init.status}`)
  const initMsg = await rpcBody(init)
  if (initMsg.error) throw fail(initMsg.error.message || 'could not start')
  const session = init.headers.get('mcp-session-id')
  const extra = session ? { 'mcp-session-id': session } : {}
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, extra).catch(() => {})

  const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, extra)
  if (!res.ok) throw fail(`HTTP ${res.status}`)
  const msg = await rpcBody(res)
  if (msg.error) throw fail(msg.error.message || 'tool error')
  const content = msg.result?.content || []
  const text = content.find((c) => c.type === 'text')?.text
  let out
  try { out = msg.result?.structuredContent || JSON.parse(text || '{}') } catch { throw fail(text || 'unreadable answer') }
  if (msg.result?.isError || out?.error) throw fail(out?.error?.message || out?.error || text || 'tool error')
  return out
}

/** Days from `from` to today (India time), inclusive: the tool reports the last N days up to today. */
export function daysUpToToday(from, now = Date.now()) {
  const today = new Date(now + IST).toISOString().slice(0, 10)
  return Math.min(365, Math.max(1, Math.round((Date.parse(today) - Date.parse(from)) / 86400000) + 1))
}

/** The website's own records from Google Ads for a period. */
async function siteRecords(from, to, query) {
  const [visits, leads, orders] = await Promise.all([
    query(`select campaign, sum(visits)::int as n from traffic_visits
            where day between $1::date and $2::date and source = 'google_ads' group by 1`, [from, to]),
    query(`select coalesce(campaign, '') as campaign, count(*)::int as n from contest_leads
            where source = 'google_ads' and (created_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date group by 1`, [from, to]),
    query(`select coalesce(o.traffic_campaign, '') as campaign, count(*)::int as n, coalesce(sum(o.total_paise), 0)::bigint as paise
             from orders o
            where o.traffic_source = 'google_ads' and o.placed_at is not null and o.payment_status in ('paid', 'partially_refunded')
              and o.status not in ('cancelled', 'returned') and (o.placed_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date
            group by 1`, [from, to]),
  ])
  return { visits: visits.rows, leads: leads.rows, orders: orders.rows }
}

/** Google's campaigns joined to the website's records (pure). */
export function buildGoogleReport(google, site) {
  const campaigns = (google.campaigns || [])
    .filter((c) => c.status === 'ENABLED' || num(c.spendInr) > 0)
    .map((c) => {
      const spend = round2(num(c.spendInr))
      const impressions = num(c.impressions)
      const clicks = num(c.clicks)
      const conversions = round2(num(c.conversions))
      return {
        id: String(c.id), name: c.name, type: TYPE[c.channelType] || c.channelType || '—', status: STATUS[c.status] || c.status,
        active: c.status === 'ENABLED', dailyBudget: c.dailyBudgetInr == null ? null : num(c.dailyBudgetInr),
        spend, impressions, clicks, conversions,
        ctr: impressions ? round2((clicks / impressions) * 100) : null,
        cpc: clicks ? round2(spend / clicks) : null,
        costPerConversion: conversions ? round2(spend / conversions) : null,
        site: { visits: 0, leads: 0, orders: 0, revenue: 0 },
      }
    })
  const byKey = new Map()
  for (const c of campaigns) { byKey.set(norm(c.id), c); byKey.set(norm(c.name), c) }
  // Google Ads traffic whose link did not name a campaign (or named one not in the account).
  const untagged = { id: '', name: 'Google Ads — campaign not in the link', untagged: true, site: { visits: 0, leads: 0, orders: 0, revenue: 0 } }
  const add = (rows, key, value = (r) => r.n) => {
    for (const r of rows) (byKey.get(norm(r.campaign)) || untagged).site[key] += value(r)
  }
  add(site.visits, 'visits')
  add(site.leads, 'leads')
  add(site.orders, 'orders')
  add(site.orders, 'revenue', (r) => num(r.paise) / 100)
  for (const c of campaigns) {
    c.site.revenue = round2(c.site.revenue)
    c.costPerOrder = c.site.orders ? round2(c.spend / c.site.orders) : null
    c.roas = c.spend ? round2(c.site.revenue / c.spend) : null
  }
  untagged.site.revenue = round2(untagged.site.revenue)
  campaigns.sort((a, b) => b.spend - a.spend || Number(b.active) - Number(a.active))
  const sum = (k) => round2(campaigns.reduce((t, c) => t + c[k], 0))
  const siteSum = (k) => round2([...campaigns, untagged].reduce((t, c) => t + c.site[k], 0))
  const totals = {
    spend: sum('spend'), impressions: sum('impressions'), clicks: sum('clicks'), conversions: sum('conversions'),
    visits: siteSum('visits'), leads: siteSum('leads'), orders: siteSum('orders'), revenue: siteSum('revenue'),
  }
  totals.cpc = totals.clicks ? round2(totals.spend / totals.clicks) : null
  totals.costPerOrder = totals.orders ? round2(totals.spend / totals.orders) : null
  totals.roas = totals.spend ? round2(totals.revenue / totals.spend) : null
  const hasUntagged = untagged.site.visits || untagged.site.leads || untagged.site.orders
  return { campaigns, untagged: hasUntagged ? untagged : null, totals }
}

/** The panel's data for { from, to } (India dates). `refresh` skips the 5-minute cache. */
export async function googleAdsReport({ from, to, refresh = false } = {}, { query = defaultQuery, now = Date.now() } = {}) {
  if (!googleAdsEnabled()) return { connected: false }
  const days = daysUpToToday(from, now)
  const key = String(days)
  const hit = cache.get(key)
  let google = hit && !refresh && now - hit.at < CACHE_MS ? hit.google : null
  let fetchedAt = hit?.at
  if (!google) {
    google = await callTool('google_ads_campaigns', { days, workspaceId: WORKSPACE() })
    if (google?.status && google.status.connected === false) {
      throw httpError('Google Ads not linked in Sales Daddy', { status: 502, publicMessage: 'Google Ads is not linked in Sales Daddy.' })
    }
    fetchedAt = now
    cache.set(key, { at: fetchedAt, google })
    if (cache.size > 30) cache.delete(cache.keys().next().value)
  }
  const site = await siteRecords(from, to, query)
  return {
    connected: true, account: google.customerId || null, days, from, to,
    fetchedAt: new Date(fetchedAt).toISOString(), ...buildGoogleReport(google, site),
  }
}

/** For tests: forget cached answers. */
export function clearGoogleAdsCache() { cache.clear() }
