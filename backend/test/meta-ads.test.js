// Analyst → Campaigns → Meta ads: Meta's figures read from a stand-in Graph API, joined to the
// website's visits, sign-ups and orders by campaign / ad ID or name.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { metaAdsReport, buildMetaReport, clearMetaAdsCache } from '../lib/sales/meta-ads.js'

const CAMPAIGNS = [
  { id: '120252076739410156', name: 'CR_Kitchidi_Ponni_Traffic', objective: 'OUTCOME_TRAFFIC', effective_status: 'ACTIVE', daily_budget: '50000', start_time: '2026-11-03T11:01:31+0000' },
  { id: '120252047257960156', name: 'CR_KitchidiPonni_Website_Sales', objective: 'OUTCOME_SALES', effective_status: 'ACTIVE', lifetime_budget: '300000' },
  { id: '999', name: 'Old paused campaign', objective: 'OUTCOME_TRAFFIC', effective_status: 'PAUSED' },
]
const lpv = (n) => [{ action_type: 'landing_page_view', value: String(n) }, { action_type: 'omni_landing_page_view', value: String(n) }]
const CAMPAIGN_INSIGHTS = [
  { campaign_id: '120252076739410156', campaign_name: 'CR_Kitchidi_Ponni_Traffic', spend: '507.37', impressions: '14023', reach: '12338', inline_link_clicks: '534', ctr: '4.390644', cpc: '0.818339', cpm: '36.181273', actions: lpv(432) },
  { campaign_id: '120252047257960156', campaign_name: 'CR_KitchidiPonni_Website_Sales', spend: '407.29', impressions: '4204', reach: '3305', inline_link_clicks: '195',
    actions: [...lpv(173), { action_type: 'omni_purchase', value: '1' }], action_values: [{ action_type: 'omni_purchase', value: '626' }] },
]
const AD_INSIGHTS = [
  { campaign_id: '120252076739410156', ad_id: '120252076739420156', ad_name: 'dialogue - 10 sec', adset_name: 'Prabhu Dialogue', spend: '133.81', impressions: '5064', reach: '5000', inline_link_clicks: '156', actions: lpv(134) },
  { campaign_id: '120252076739410156', ad_id: '120252079355870156', ad_name: 'dialogue - 20 sec', adset_name: 'Prabhu Dialogue', spend: '373.56', impressions: '8959', reach: '8000', inline_link_clicks: '378', actions: lpv(298) },
  { campaign_id: '120252047257960156', ad_id: '120252047257950156', ad_name: 'parisu vettai - poster', adset_name: 'prabhu image - chennai', spend: '407.29', impressions: '4204', reach: '3305', inline_link_clicks: '195', actions: lpv(173) },
]
const ADS = [
  { id: '120252076739420156', effective_status: 'ACTIVE' }, { id: '120252079355870156', effective_status: 'PENDING_REVIEW' },
  { id: '120252047257950156', effective_status: 'ACTIVE' },
]
// The website's records: the Traffic campaign's links carry IDs, the Sales campaign's carry names.
const SITE = {
  visits: [
    { campaign: '120252076739410156', ad: '120252076739420156', n: 120 },
    { campaign: '120252076739410156', ad: '120252079355870156', n: 250 },
    { campaign: 'cr_kitchidiponni_website_sales', ad: 'Parisu Vettai - Poster', n: 150 },
    { campaign: 'someone else', ad: '', n: 9 },
  ],
  leads: [{ campaign: '120252076739410156', ad: '120252076739420156', n: 4 }],
  orders: [{ campaign: 'CR_KitchidiPonni_Website_Sales', ad: 'parisu vettai - poster', n: 2, paise: '125200' }],
}
const fakeQuery = async (sql) => ({
  rows: /traffic_visits/.test(sql) ? SITE.visits : /contest_leads/.test(sql) ? SITE.leads : /from orders/.test(sql) ? SITE.orders : [],
})

test('Meta ads: Meta figures joined to the website by campaign / ad ID or name', () => {
  const r = buildMetaReport({ campaigns: CAMPAIGNS, campaignInsights: CAMPAIGN_INSIGHTS, adInsights: AD_INSIGHTS, ads: ADS }, SITE)
  // Paused campaigns with no spend in the period are left out; biggest spend first.
  assert.deepEqual(r.campaigns.map((c) => c.name), ['CR_Kitchidi_Ponni_Traffic', 'CR_KitchidiPonni_Website_Sales'])
  const traffic = r.campaigns[0]
  assert.equal(traffic.goal, 'Traffic')
  assert.deepEqual(traffic.budget, { amount: 500, per: 'day' })
  assert.equal(traffic.spend, 507.37)
  assert.equal(traffic.landingPageViews, 432)
  assert.equal(traffic.costPerLandingPageView, 1.17)
  // CTR, CPC and CPM as Ads Manager shows them; worked out from link clicks when Meta sends none.
  assert.deepEqual([traffic.ctr, traffic.cpc, traffic.cpm], [4.39, 0.82, 36.18])
  assert.deepEqual([r.campaigns[1].ctr, r.campaigns[1].cpc], [4.64, 2.09])
  assert.deepEqual(traffic.site, { visits: 370, leads: 4, orders: 0, revenue: 0 })
  assert.equal(traffic.costPerLead, 126.84)
  assert.deepEqual(traffic.ads.map((a) => [a.name, a.status, a.site.visits]), [['dialogue - 20 sec', 'In review', 250], ['dialogue - 10 sec', 'Active', 120]])
  // Matched by name, ignoring case and spacing.
  const sales = r.campaigns[1]
  assert.deepEqual(sales.budget, { amount: 3000, per: 'total' })
  assert.equal(sales.purchases, 1)
  assert.deepEqual(sales.site, { visits: 150, leads: 0, orders: 2, revenue: 1252 })
  assert.equal(sales.costPerOrder, 203.65)
  assert.equal(sales.roas, 3.07)
  assert.equal(sales.ads[0].site.orders, 2)
  assert.equal(r.totals.spend, 914.66)
  assert.equal(r.totals.visits, 520)
  assert.equal(r.totals.orders, 2)
})

test('Meta ads: read from the Graph API (all pages), cached for 5 minutes, refresh on request; no token = not connected', async () => {
  const seen = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    seen.push(url.pathname + (url.searchParams.get('level') ? ':' + url.searchParams.get('level') : ''))
    assert.equal(url.searchParams.get('access_token'), 'test-token')
    let data = []
    if (url.pathname.endsWith('/campaigns')) data = CAMPAIGNS
    else if (url.pathname.endsWith('/ads')) data = ADS
    else if (url.searchParams.get('level') === 'campaign') data = CAMPAIGN_INSIGHTS
    else if (url.searchParams.get('level') === 'ad') {
      // Two pages: the second through paging.next.
      const second = url.searchParams.get('after') === 'p2'
      data = second ? AD_INSIGHTS.slice(2) : AD_INSIGHTS.slice(0, 2)
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ data, paging: second ? {} : { next: `http://127.0.0.1:${server.address().port}${url.pathname}?${url.searchParams}&after=p2` } }))
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data }))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const saved = { token: process.env.META_ADS_TOKEN, base: process.env.META_GRAPH_BASE }
  try {
    delete process.env.META_ADS_TOKEN
    assert.deepEqual(await metaAdsReport({ from: '2026-11-03', to: '2026-11-04' }, { query: fakeQuery }), { connected: false, account: '1204684567608575' })

    process.env.META_ADS_TOKEN = 'test-token'
    process.env.META_GRAPH_BASE = `http://127.0.0.1:${server.address().port}`
    clearMetaAdsCache()
    const r = await metaAdsReport({ from: '2026-11-03', to: '2026-11-04' }, { query: fakeQuery })
    assert.equal(r.connected, true)
    assert.equal(r.campaigns.length, 2)
    assert.equal(r.campaigns[1].ads.length, 1, 'the second page of ads was read')
    assert.ok(seen.includes('/act_1204684567608575/insights:ad'))
    const calls = seen.length
    await metaAdsReport({ from: '2026-11-03', to: '2026-11-04' }, { query: fakeQuery })
    assert.equal(seen.length, calls, 'second call within 5 minutes uses the cache')
    await metaAdsReport({ from: '2026-11-03', to: '2026-11-04', refresh: true }, { query: fakeQuery })
    assert.ok(seen.length > calls, 'refresh asks Meta again')
  } finally {
    if (saved.token === undefined) delete process.env.META_ADS_TOKEN; else process.env.META_ADS_TOKEN = saved.token
    if (saved.base === undefined) delete process.env.META_GRAPH_BASE; else process.env.META_GRAPH_BASE = saved.base
    clearMetaAdsCache()
    server.close()
  }
})

test('Meta ads: a Meta error is reported, not a crash', async () => {
  const server = http.createServer((_req, res) => {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Invalid OAuth access token.' } }))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const saved = { token: process.env.META_ADS_TOKEN, base: process.env.META_GRAPH_BASE }
  try {
    process.env.META_ADS_TOKEN = 'bad'
    process.env.META_GRAPH_BASE = `http://127.0.0.1:${server.address().port}`
    clearMetaAdsCache()
    await assert.rejects(metaAdsReport({ from: '2026-11-03', to: '2026-11-04' }, { query: fakeQuery }), (err) => {
      assert.equal(err.status, 502)
      assert.match(err.publicMessage, /Invalid OAuth access token/)
      return true
    })
  } finally {
    if (saved.token === undefined) delete process.env.META_ADS_TOKEN; else process.env.META_ADS_TOKEN = saved.token
    if (saved.base === undefined) delete process.env.META_GRAPH_BASE; else process.env.META_GRAPH_BASE = saved.base
    clearMetaAdsCache()
    server.close()
  }
})
