// Shared test setup: a fake /api (test data only, no customer data), outside sites blocked, and a log of the
// requests the page tried to make to Meta and Google so tests can check tracking.
const { test: base, expect } = require('@playwright/test')

// Test catalog: one product with two packs, prices made up for the test.
const CATALOG = {
  products: [
    {
      slug: 'kitchidi-ponni-rice',
      name: 'Kitchidi Ponni Rice',
      tag: '1 Year Aged',
      variants: [
        { packKg: 5, price: 555, mrp: 650, inStock: true },
        { packKg: 26, price: 2499, mrp: 2900, inStock: true },
      ],
    },
    { slug: 'special-rajabhogam', name: 'Special Rajabhogam', tag: 'Classic Red', variants: [{ packKg: 10, price: 900, mrp: 1000, inStock: true }] },
    { slug: 'rudra', name: 'Rudra', tag: '', variants: [{ packKg: 25, price: null, mrp: null, inStock: false }] },
  ],
}

const test = base.extend({
  tracking: async ({ page }, use) => {
    const seen = { meta: [], google: [] }
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      const { hostname, pathname } = new URL(url)
      if (hostname === '127.0.0.1' || hostname === 'localhost') {
        if (pathname === '/api/catalog') return route.fulfill({ json: CATALOG })
        if (pathname === '/api/checkout/quote') {
          return route.fulfill({ json: { subtotal: 555, shipping: 80, region: { name: 'Tamil Nadu' }, deliveryOptions: [{ method: 'courier', charge: 80, promise: '3â€“5 days' }] } })
        }
        // Any other API call (events, consent, chat â€¦): accepted and dropped.
        if (pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true } })
        return route.continue()
      }
      if (/facebook\.(net|com)$/.test(hostname)) seen.meta.push(url)
      if (/google|doubleclick|clarity/.test(hostname)) seen.google.push(url)
      return route.abort()
    })
    await use(seen)
  },
})

/** Answer the cookie banner (Accept or Reject). */
async function answerCookies(page, choice) {
  const banner = page.getByRole('button', { name: choice, exact: true })
  await banner.click()
}

module.exports = { test, expect, answerCookies, CATALOG }
