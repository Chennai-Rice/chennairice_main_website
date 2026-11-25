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
