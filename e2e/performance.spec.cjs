// Kitchidi Ponni (the main ad landing page) on a slow phone: layout shift must stay under Google's 0.1
// (it was 0.82 for real users and 1.25 in this test before 25 Nov 2026: the footer showed at the top while the
// page loaded and jumped away). Also guards the first-load size (2.6 MB of below-the-fold photos and logos before).
const { test, expect, CATALOG } = require('./fixtures.cjs')

test('Kitchidi page on a slow phone: layout shift under 0.1 and first load under 900 KB', async ({ page, tracking }, info) => {
  void tracking
  test.skip(info.project.name !== 'phone', 'phone only')
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.continue())
  await page.route('**/api/catalog', (r) => r.fulfill({ json: CATALOG }))
  let bytes = 0
  page.on('requestfinished', async (req) => { try { bytes += (await req.sizes()).responseBodySize } catch { /* aborted */ } })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  await page.addInitScript(() => {
    window.__cls = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto('/products/kitchidi-ponni-rice', { timeout: 60000 })
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kitchidi Ponni', { timeout: 30000 })
  await page.waitForTimeout(6000)
  const cls = await page.evaluate(() => window.__cls)
  expect(cls, `layout shift ${cls.toFixed(3)}`).toBeLessThan(0.1)
  expect(bytes / 1024, 'first-load KB').toBeLessThan(900)
})
