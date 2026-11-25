const { test, expect, answerCookies } = require('./fixtures.cjs')

test('home page loads and the footer WhatsApp button opens our number', async ({ page, tracking }) => {
  void tracking
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  const wa = page.locator('a.foot-wa')
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/917066646667\?text=/)
  await expect(wa).toHaveAttribute('target', '_blank')
})

test('product page: pick a pack size, add to cart, cart shows that pack and price', async ({ page, tracking }) => {
  void tracking
  await page.goto('/products/kitchidi-ponni-rice')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kitchidi Ponni')
  await page.locator('.pdp-pack-pill', { hasText: '26 KG' }).click()
  await expect(page.locator('.pdp-pack-pill', { hasText: '26 KG' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.pdp-price').first()).toContainText('2,499')
  await page.locator('.pdp-add-btn').click()
  await page.goto('/cart')
  await expect(page.getByText(/Kitchidi Ponni Rice \(26 kg\)/).first()).toBeVisible()
  await expect(page.getByText(/2,499/).first()).toBeVisible()
})

test('"Bulk Order Enquiry" opens the bulk form with the product and size filled in', async ({ page, tracking }) => {
  void tracking
  await page.goto('/products/kitchidi-ponni-rice')
  await page.locator('.pdp-pack-pill', { hasText: '26 KG' }).click()
  await page.locator('.pdp-bulk-link').click()
  await expect(page).toHaveURL(/\/bulk-order\?product=Kitchidi(%20|\+)Ponni(%20|\+)Rice&size=26$/)
  const message = page.locator('textarea')
  await expect(message).toHaveValue(/^Bulk enquiry: Kitchidi Ponni Rice \(26 kg packs\)\. Quantity needed: $/)
})

test('bulk form ignores odd characters in the link', async ({ page, tracking }) => {
  void tracking
  await page.goto('/bulk-order?product=%3Cscript%3Ealert(1)%3C%2Fscript%3E&size=5x')
  await expect(page.locator('textarea')).toHaveValue('Bulk enquiry: scriptalert(1)script (5 kg packs). Quantity needed: ')
})

test('Meta Pixel sends nothing before the cookie banner is answered, and loads after Accept', async ({ page, tracking }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.goto('/products/kitchidi-ponni-rice')
  await page.waitForLoadState('networkidle')
  expect(tracking.meta, 'no Meta request before consent').toEqual([])
  await answerCookies(page, 'Accept')
  await expect.poll(() => tracking.meta.some((u) => u.includes('fbevents.js')), { message: 'Pixel script requested after Accept' }).toBe(true)
})

test('Meta Pixel never loads when cookies are rejected', async ({ page, tracking }) => {
  await page.goto('/')
  await answerCookies(page, 'Reject')
  await page.goto('/products/kitchidi-ponni-rice')
  await page.waitForLoadState('networkidle')
  expect(tracking.meta).toEqual([])
})

test('a wrong product address shows "Product not found"', async ({ page, tracking }) => {
  void tracking
  await page.goto('/products/zzz-not-a-rice')
  await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible()
})

// Home "What Our Customers Say": real published reviews only (test data below, not real customers).
const REVIEWS = {
  average: 5, count: 4, reviews: [
    { name: 'Test Buyer', city: 'Chennai', rating: 5, text: 'Soft rice, cooks well every time.', products: 'Kitchidi Ponni Rice' },
    { name: 'Stars Only', city: 'Madurai', rating: 5, text: '', products: 'Kitchidi Ponni Rice' },
    { name: 'LONG WRITER', city: 'TIRUVALLUR', rating: 4, text: 'Very good rice. '.repeat(30).trim(), products: 'Kitchidi Ponni Rice' },
    { name: 'Third Person', city: 'Erode', rating: 5, text: 'Good taste and fast delivery.', products: 'Special Rajabhogam' },
  ],
}

test('home reviews: real reviews only, star-only skipped, long one has Read more', async ({ page, tracking }) => {
  void tracking
  await page.route('**/api/reviews', (route) => route.fulfill({ json: REVIEWS }))
  await page.goto('/')
  const section = page.locator('section.testi')
  await section.scrollIntoViewIfNeeded()
  await expect(section.locator('.testi-card')).toHaveCount(3)
  // Highest rating first, fuller review first within it; the 4-star one last.
  await expect(section.locator('.testi-name')).toHaveText(['Test Buyer', 'Third Person', 'Long Writer'])
  await expect(section.getByText('Stars Only')).toHaveCount(0)
  await expect(section.getByText('Gopal Reddy')).toHaveCount(0)
  await expect(section.getByText('Long Writer')).toHaveCount(1)
  await expect(section.getByText('Tiruvallur')).toHaveCount(1)
  const long = section.locator('.testi-card', { hasText: 'Long Writer' })
  await expect(long.locator('.testi-quote')).toHaveClass(/is-folded/)
  await long.getByRole('button', { name: 'Read more' }).click()
  await expect(long.locator('.testi-quote')).not.toHaveClass(/is-folded/)
  await expect(long.getByRole('button', { name: 'Show less' })).toBeVisible()
  await expect(section.locator('.testi-card', { hasText: 'Test Buyer' }).getByRole('button', { name: 'Read more' })).toHaveCount(0)
})

test('home reviews: section hidden when no written review is published', async ({ page, tracking }) => {
  void tracking
  await page.route('**/api/reviews', (route) => route.fulfill({ json: { average: 5, count: 1, reviews: [{ name: 'A', city: 'B', rating: 5, text: '' }] } }))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('section.testi')).toHaveCount(0)
  await expect(page.getByText('What Our Customers Say')).toHaveCount(0)
})
