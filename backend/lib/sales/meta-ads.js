// Analyst → Campaigns → "Meta ads — live": each Meta campaign and its ads for a period, read from the
// Marketing API (name, goal, status, budget, spend, impressions, reach, link clicks, landing page views,
// purchases), next to what the website itself recorded for the same campaign: visits (traffic_visits),
// sign-ups (contest_leads) and paid orders (orders), with cost per order and ROAS.
//
// The website's records carry the campaign and ad from the ad's link (utm_campaign / utm_content), which
// is either Meta's ID ({{campaign.id}}, {{ad.id}}) or its name ({{campaign.name}}, {{ad.name}}); both match.
//
// Settings: META_ADS_TOKEN (secret: a system user token with ads_read on the ad account, Business
// Settings → System users); META_AD_ACCOUNT_ID (default the Chennai Rice Industries ad account).
// With no token the panel says how to connect. Meta's answers are kept 5 minutes per period.
import { query as defaultQuery } from '../db.js'
import { httpError } from './util.js'

const ACCOUNT = () => String(process.env.META_AD_ACCOUNT_ID || '1204684567608575').replace(/^act_/, '')
const GRAPH = () => process.env.META_GRAPH_BASE || `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`
const CACHE_MS = 5 * 60000
const cache = new Map()

export const metaAdsEnabled = () => Boolean(process.env.META_ADS_TOKEN)

const GOAL = {
  OUTCOME_TRAFFIC: 'Traffic', OUTCOME_SALES: 'Sales', OUTCOME_LEADS: 'Leads', OUTCOME_ENGAGEMENT: 'Engagement',
  OUTCOME_AWARENESS: 'Awareness', OUTCOME_APP_PROMOTION: 'App promotion', LINK_CLICKS: 'Traffic', CONVERSIONS: 'Sales',
}
const STATUS = {
  ACTIVE: 'Active', PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Campaign paused', ADSET_PAUSED: 'Ad set paused',
  PENDING_REVIEW: 'In review', DISAPPROVED: 'Rejected', WITH_ISSUES: 'Has issues', IN_PROCESS: 'Processing',
  ARCHIVED: 'Archived', DELETED: 'Deleted',
}
const num = (v) => Number(v || 0)
const round2 = (n) => Math.round(n * 100) / 100
const norm = (s) => String(s || '').trim().toLowerCase()
/** An action count / value from Meta's actions list (the omni_ form when present, as Ads Manager shows). */
function action(list, ...types) {
  for (const t of types) {
    const hit = (list || []).find((a) => a.action_type === t)
    if (hit) return num(hit.value)
  }
  return 0
}

/** Every page of a Graph API list. */
async function graphList(path, params) {
  const out = []
  let url = `${GRAPH()}/${path}?${new URLSearchParams({ ...params, limit: '500', access_token: process.env.META_ADS_TOKEN })}`
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`
      throw httpError('Meta Ads: ' + msg, { status: 502, publicMessage: 'Meta did not answer: ' + msg.slice(0, 200) })
    }
    out.push(...(body.data || []))
    url = body.paging?.next || null
  }
  return out
}

/** Meta's side for a period: campaigns (with settings) and per-ad insights. */
async function fetchMeta(from, to) {
  const account = `act_${ACCOUNT()}`
  const insightFields = 'campaign_id,campaign_name,ad_id,ad_name,adset_name,spend,impressions,reach,inline_link_clicks,ctr,cpc,cpm,actions,action_values'
  const [campaigns, campaignInsights, adInsights, ads] = await Promise.all([
    graphList(`${account}/campaigns`, { fields: 'id,name,objective,effective_status,daily_budget,lifetime_budget,start_time' }),
    graphList(`${account}/insights`, { level: 'campaign', fields: insightFields.replace('ad_id,ad_name,adset_name,', ''), time_range: JSON.stringify({ since: from, until: to }) }),
    graphList(`${account}/insights`, { level: 'ad', fields: insightFields, time_range: JSON.stringify({ since: from, until: to }) }),
    graphList(`${account}/ads`, { fields: 'id,campaign_id,effective_status' }),
  ])
  return { campaigns, campaignInsights, adInsights, ads }
}

/** The figures Ads Manager shows for one insights row. */
function metrics(row = {}) {
  const spend = num(row.spend)
  const impressions = num(row.impressions)
  const clicks = num(row.inline_link_clicks)
  const lpv = action(row.actions, 'omni_landing_page_view', 'landing_page_view')
  const purchases = action(row.actions, 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase')
  const purchaseValue = action(row.action_values, 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase')
  return {
    spend: round2(spend), impressions, reach: num(row.reach), linkClicks: clicks, landingPageViews: lpv,
    purchases, purchaseValue: round2(purchaseValue),
    // CTR, CPC and CPM as Ads Manager shows them (all clicks); worked out from link clicks only if Meta sent none.
    ctr: row.ctr != null ? round2(num(row.ctr)) : impressions ? round2((clicks / impressions) * 100) : null,
    cpc: row.cpc != null ? round2(num(row.cpc)) : clicks ? round2(spend / clicks) : null,
    cpm: row.cpm != null ? round2(num(row.cpm)) : impressions ? round2((spend / impressions) * 1000) : null,
    costPerLandingPageView: lpv ? round2(spend / lpv) : null,
  }
}

/** The website's own records for a period, by campaign and ad as they came in the ad link. */
async function siteRecords(from, to, query) {
  const [visits, leads, orders] = await Promise.all([
    query(`select campaign, ad, sum(visits)::int as n from traffic_visits
            where day between $1::date and $2::date and campaign <> ''
              and (source like 'meta_ads%' or source in ('facebook', 'instagram')) -- untagged ad links land as facebook / instagram
            group by 1, 2`, [from, to]),
    query(`select coalesce(campaign, '') as campaign, coalesce(ad, '') as ad, count(*)::int as n from contest_leads
            where (created_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date and coalesce(campaign, '') <> ''
            group by 1, 2`, [from, to]),
    query(`select coalesce(o.traffic_campaign, '') as campaign, coalesce(o.traffic_ad, '') as ad,
                  count(*)::int as n, coalesce(sum(o.total_paise), 0)::bigint as paise
             from orders o
            where o.placed_at is not null and o.payment_status in ('paid', 'partially_refunded') and o.status not in ('cancelled', 'returned')
              and (o.placed_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date and coalesce(o.traffic_campaign, '') <> ''
            group by 1, 2`, [from, to]),
  ])
  return { visits: visits.rows, leads: leads.rows, orders: orders.rows }
}

/**
 * Meta's campaigns and ads joined to the website's records. Pure: `meta` as from fetchMeta,
 * `site` as from siteRecords. Campaigns with no spend in the period are shown only while active.
 */
export function buildMetaReport(meta, site) {
  const insightBy = new Map(meta.campaignInsights.map((r) => [String(r.campaign_id), r]))
  const adStatus = new Map(meta.ads.map((a) => [String(a.id), a.effective_status]))
  const campaigns = meta.campaigns
    .filter((c) => insightBy.has(String(c.id)) || c.effective_status === 'ACTIVE')
    .map((c) => {
      const budget = num(c.daily_budget) || num(c.lifetime_budget)
      return {
        id: String(c.id), name: c.name, goal: GOAL[c.objective] || c.objective || '—',
        status: STATUS[c.effective_status] || c.effective_status, active: c.effective_status === 'ACTIVE',
        budget: budget ? { amount: budget / 100, per: num(c.daily_budget) ? 'day' : 'total' } : null,
        startTime: c.start_time || null,
        ...metrics(insightBy.get(String(c.id))),
        site: { visits: 0, leads: 0, orders: 0, revenue: 0 },
        ads: [],
      }
    })
  const byCampaign = new Map()
  for (const c of campaigns) { byCampaign.set(norm(c.id), c); byCampaign.set(norm(c.name), c) }
  for (const r of meta.adInsights) {
    const c = byCampaign.get(norm(r.campaign_id))
    if (!c) continue
    c.ads.push({
      id: String(r.ad_id), name: r.ad_name, adSet: r.adset_name || '', status: STATUS[adStatus.get(String(r.ad_id))] || adStatus.get(String(r.ad_id)) || '—',
      ...metrics(r), site: { visits: 0, leads: 0, orders: 0, revenue: 0 },
    })
  }
  // The website's records, matched to a campaign (and ad) by ID or by name.
  const add = (rows, key, value = (r) => r.n) => {
    for (const r of rows) {
      const c = byCampaign.get(norm(r.campaign))
      if (!c) continue
      c.site[key] += value(r)
      const ad = r.ad && c.ads.find((a) => norm(a.id) === norm(r.ad) || norm(a.name) === norm(r.ad))
      if (ad) ad.site[key] += value(r)
    }
  }
  add(site.visits, 'visits')
  add(site.leads, 'leads')
  add(site.orders, 'orders')
  add(site.orders, 'revenue', (r) => num(r.paise) / 100)
  const finish = (x) => {
    x.site.revenue = round2(x.site.revenue)
    x.costPerOrder = x.site.orders ? round2(x.spend / x.site.orders) : null
    x.costPerLead = x.site.leads ? round2(x.spend / x.site.leads) : null
    x.roas = x.spend ? round2(x.site.revenue / x.spend) : null
    return x
  }
  for (const c of campaigns) {
    c.ads.sort((a, b) => b.spend - a.spend)
    c.ads.forEach(finish)
    finish(c)
  }
  campaigns.sort((a, b) => b.spend - a.spend || Number(b.active) - Number(a.active))
  const sum = (k) => round2(campaigns.reduce((t, c) => t + c[k], 0))
  const siteSum = (k) => round2(campaigns.reduce((t, c) => t + c.site[k], 0))
  const totals = {
    spend: sum('spend'), impressions: sum('impressions'), linkClicks: sum('linkClicks'), landingPageViews: sum('landingPageViews'),
    purchases: sum('purchases'), visits: siteSum('visits'), leads: siteSum('leads'), orders: siteSum('orders'), revenue: siteSum('revenue'),
  }
  totals.costPerLandingPageView = totals.landingPageViews ? round2(totals.spend / totals.landingPageViews) : null
  totals.costPerOrder = totals.orders ? round2(totals.spend / totals.orders) : null
  totals.roas = totals.spend ? round2(totals.revenue / totals.spend) : null
  return { campaigns, totals }
}

/** The panel's data for { from, to } (India dates). `refresh` skips the 5-minute cache. */
export async function metaAdsReport({ from, to, refresh = false } = {}, { query = defaultQuery } = {}) {
  if (!metaAdsEnabled()) return { connected: false, account: ACCOUNT() }
  const key = `${from}|${to}`
  const hit = cache.get(key)
  let meta = hit && !refresh && Date.now() - hit.at < CACHE_MS ? hit.meta : null
  let fetchedAt = hit?.at
  if (!meta) {
    meta = await fetchMeta(from, to)
    fetchedAt = Date.now()
    cache.set(key, { at: fetchedAt, meta })
    if (cache.size > 50) cache.delete(cache.keys().next().value)
  }
  const site = await siteRecords(from, to, query)
  return { connected: true, account: ACCOUNT(), from, to, fetchedAt: new Date(fetchedAt).toISOString(), ...buildMetaReport(meta, site) }
}

/** For tests: forget cached Meta answers. */
export function clearMetaAdsCache() { cache.clear() }
