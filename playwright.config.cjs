// Browser tests for the storefront (Playwright). Run: npx playwright test (CommonJS files: Playwright 1.49 hangs loading .mjs tests on Node 24)
//
// - Uses the Chrome already installed on this computer (channel: 'chrome'), so Playwright downloads no browser
//   (Windows App Control blocks unknown executables).
// - Tests the production build (dist/) through `vite preview`; build first with `npx vite build`.
// - Every /api call is answered by the test itself (e2e/fixtures.mjs) and every outside site is blocked, so a test
//   never places an order, sends a lead to Sales Daddy / NeoDove, or reaches Meta or Google.
const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
