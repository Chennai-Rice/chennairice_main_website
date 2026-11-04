// Analyst → Campaigns → Google Ads: campaigns read from a stand-in Sales Daddy MCP server (initialize, then
// tools/call google_ads_campaigns), joined to the website's Google Ads visits, sign-ups and orders.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { googleAdsReport, buildGoogleReport, daysUpToToday, clearGoogleAdsCache } from '../lib/sales/google-ads.js'

// As google_ads_campaigns answered for the Chennai Rice workspace (Nov 2026).
const GOOGLE = {
  status: { connected: true, customerId: '1406639142' }, customerId: '1406639142', days: 7,
  campaigns: [
    { id: '24419754411', name: 'Performance Max-3-11-26', status: 'ENABLED', channelType: 'PERFORMANCE_MAX', dailyBudgetInr: 1000, spendInr: 238.73, impressions: 3418, clicks: 311, conversions: 0, costPerConversionInr: null },
    { id: '111', name: 'Old search', status: 'PAUSED', channelType: 'SEARCH', dailyBudgetInr: 200, spendInr: 0, impressions: 0, clicks: 0, conversions: 0 },
  ],
}
// The website's records: one campaign named in the link (with _ for spaces), the rest untagged.
const SITE = {
  visits: [{ campaign: 'Performance_Max-3-11-26', n: 180 }, { campaign: '', n: 64 }],
  leads: [{ campaign: '', n: 2 }],
  orders: [{ campaign: 'performance max-3-11-26', n: 1, paise: '68000' }],
}
const fakeQuery = async (sql) => ({
  rows: /traffic_visits/.test(sql) ? SITE.visits : /contest_leads/.test(sql) ? SITE.leads : /from orders/.test(sql) ? SITE.orders : [],
})

test('Google Ads: campaigns joined to the website by campaign name or ID; untagged visits listed apart', () => {
  const r = buildGoogleReport(GOOGLE, SITE)
  assert.deepEqual(r.campaigns.map((c) => c.name), ['Performance Max-3-11-26'], 'paused with no spend is left out')
  const c = r.campaigns[0]
  assert.equal(c.type, 'Performance Max')
  assert.equal(c.status, 'Active')
  assert.equal(c.dailyBudget, 1000)
  assert.deepEqual([c.spend, c.impressions, c.clicks, c.ctr, c.cpc], [238.73, 3418, 311, 9.1, 0.77])
  assert.deepEqual(c.site, { visits: 180, leads: 0, orders: 1, revenue: 680 })
  assert.equal(c.costPerOrder, 238.73)
  assert.equal(c.roas, 2.85)
  assert.deepEqual(r.untagged.site, { visits: 64, leads: 2, orders: 0, revenue: 0 })
  assert.deepEqual([r.totals.visits, r.totals.leads, r.totals.orders], [244, 2, 1])
})

test('Google Ads: the period becomes "last N days up to today" (India time)', () => {
  const now = Date.parse('2026-11-04T06:00:00Z') // 11:30 IST
  assert.equal(daysUpToToday('2026-11-01', now), 4)
  assert.equal(daysUpToToday('2026-11-04', now), 1)
  assert.equal(daysUpToToday('2025-01-01', now), 365)
})

test('Google Ads: read through the Sales Daddy MCP server (session, SSE answers), cached, refreshed; no token = not connected', async () => {
  const calls = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const msg = JSON.parse(body)
      assert.equal(req.headers.authorization, 'Bearer sdp_test')
      calls.push(msg.method + (msg.params?.name ? ':' + msg.params.name : ''))
      if (msg.method === 'initialize') {
        res.setHeader('mcp-session-id', 'sess-1')
        res.setHeader('Content-Type', 'text/event-stream')
        return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} } } })}\n\n`)
      }
      if (msg.method === 'notifications/initialized') { res.statusCode = 202; return res.end() }
      assert.equal(req.headers['mcp-session-id'], 'sess-1')
      assert.equal(msg.params.name, 'google_ads_campaigns')
      assert.equal(msg.params.arguments.workspaceId, '55e68042-1618-486e-bf58-e948aa0d6ff0')
      assert.equal(msg.params.arguments.days, 4)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(GOOGLE) }] } }))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const saved = { token: process.env.SALESDADDY_MCP_TOKEN, url: process.env.SALESDADDY_MCP_URL }
  const now = Date.parse('2026-11-04T06:00:00Z')
  try {
    delete process.env.SALESDADDY_MCP_TOKEN
    assert.deepEqual(await googleAdsReport({ from: '2026-11-01', to: '2026-11-04' }, { query: fakeQuery, now }), { connected: false })

    process.env.SALESDADDY_MCP_TOKEN = 'sdp_test'
    process.env.SALESDADDY_MCP_URL = `http://127.0.0.1:${server.address().port}/mcp`
    clearGoogleAdsCache()
    const r = await googleAdsReport({ from: '2026-11-01', to: '2026-11-04' }, { query: fakeQuery, now })
    assert.equal(r.connected, true)
    assert.equal(r.account, '1406639142')
    assert.equal(r.days, 4)
    assert.equal(r.campaigns[0].spend, 238.73)
    assert.deepEqual(calls, ['initialize', 'notifications/initialized', 'tools/call:google_ads_campaigns'])
    await googleAdsReport({ from: '2026-11-01', to: '2026-11-04' }, { query: fakeQuery, now })
    assert.equal(calls.length, 3, 'cached for 5 minutes')
    await googleAdsReport({ from: '2026-11-01', to: '2026-11-04', refresh: true }, { query: fakeQuery, now })
    assert.equal(calls.length, 6, 'refresh asks again')
  } finally {
    if (saved.token === undefined) delete process.env.SALESDADDY_MCP_TOKEN; else process.env.SALESDADDY_MCP_TOKEN = saved.token
    if (saved.url === undefined) delete process.env.SALESDADDY_MCP_URL; else process.env.SALESDADDY_MCP_URL = saved.url
    clearGoogleAdsCache()
    server.close()
  }
})

test('Google Ads: a refused token is reported, not a crash', async () => {
  const server = http.createServer((_req, res) => { res.statusCode = 401; res.end('{"error":"unauthorized"}') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const saved = { token: process.env.SALESDADDY_MCP_TOKEN, url: process.env.SALESDADDY_MCP_URL }
  try {
    process.env.SALESDADDY_MCP_TOKEN = 'sdp_bad'
    process.env.SALESDADDY_MCP_URL = `http://127.0.0.1:${server.address().port}/mcp`
    clearGoogleAdsCache()
    await assert.rejects(googleAdsReport({ from: '2026-11-01', to: '2026-11-04' }, { query: fakeQuery }), (err) => {
      assert.equal(err.status, 502)
      assert.match(err.publicMessage, /token was refused/)
      return true
    })
  } finally {
    if (saved.token === undefined) delete process.env.SALESDADDY_MCP_TOKEN; else process.env.SALESDADDY_MCP_TOKEN = saved.token
    if (saved.url === undefined) delete process.env.SALESDADDY_MCP_URL; else process.env.SALESDADDY_MCP_URL = saved.url
    clearGoogleAdsCache()
    server.close()
  }
})
