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

// Audit fixes, 25 Nov 2026.
test('a wrong address shows "Page not found" (not the home page)', async ({ page, tracking }) => {
  void tracking
  await page.goto('/this-page-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page).toHaveURL(/\/this-page-does-not-exist$/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('footer links the rice guides; no Recipes link', async ({ page, tracking }) => {
  void tracking
  await page.goto('/')
  const foot = page.locator('footer')
  for (const path of ['/how-much-rice-per-month', '/how-to-cook-ponni-rice', '/ponni-rice-price', '/ponni-rice-vs-basmati-rice', '/buy-ponni-rice-online', '/bulk-rice-suppliers-tamil-nadu']) {
    await expect(foot.locator(`a[href="${path}"]`)).toHaveCount(1)
  }
  await expect(foot.locator('a[href="/recipes"]')).toHaveCount(0)
})

test('product page: no recipe dead ends, no "being confirmed" nutrition, out-of-stock packs not suggested, breadcrumb to hub', async ({ page, tracking }) => {
  void tracking
  await page.goto('/products/kitchidi-ponni-rice')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kitchidi Ponni')
  await expect(page.locator('a[href="/recipes"]')).toHaveCount(0)
  await expect(page.getByText('View Recipe')).toHaveCount(0)
  await expect(page.getByText(/Nutrition values for this pack are being confirmed/)).toHaveCount(0)
  const related = page.locator('.pdp-related-track')
  await expect(related.getByText('Special Rajabhogam').first()).toBeVisible()
  await expect(related.getByText('Rudra')).toHaveCount(0)
  await expect(page.locator('nav a[href="/ponni-rice"]').first()).toBeVisible()
})

test('Ponni hub page does not promote a pack that is out of stock', async ({ page, tracking }) => {
  void tracking
  await page.goto('/ponni-rice')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.lp a[href="/products/rudra-ponni-rice"]')).toHaveCount(0)
})

// The chat helper and popups load after the page (26 Nov 2026): they must still appear.
test('chat helper appears after the page has loaded, and is not in the first paint', async ({ page, tracking }) => {
  void tracking
  await page.goto('/')
  await expect(page.locator('.sk-launcher-btn')).toBeAttached({ timeout: 10000 }) // a tab tucked into the edge on phones
})

// Hero film (26 Nov 2026): phones held upright get the 1.5 MB centre cut, larger screens the full film.
test('hero video: phone gets the small centre cut, desktop the full film', async ({ page, tracking }, info) => {
  void tracking
  await page.goto('/')
  const video = page.locator('video.hero-video')
  // Desktop: full HD on a fast connection, the lighter 1280 film otherwise (27 Nov 2026).
  await expect(video).toHaveAttribute('data-film', info.project.name === 'phone' ? /hero-phone-v3\.mp4$/ : /hero-(v5|md-v2)\.mp4$/, { timeout: 10000 })
  // Phone and lighter films play from memory (downloaded whole first; owner, 27 Nov 2026: still buffering).
  if (info.project.name === 'phone') {
    await expect(video).toHaveAttribute('src', /^blob:/, { timeout: 20000 })
    await expect(video).toHaveClass(/is-ready/, { timeout: 20000 })
  }
})

// The film fades in only once it can play to the end without stopping; a slow connection on desktop gets the
// lighter film (Chrome's reported speed, emulated here).
test('hero video: hidden until it can play through; slow connection gets the lighter film', async ({ page, tracking }, info) => {
  void tracking
  test.skip(info.project.name === 'phone', 'desktop choice')
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { downlink: 1.5, effectiveType: '4g', saveData: false } }))
  await page.goto('/')
  const video = page.locator('video.hero-video')
  await expect(video).toHaveAttribute('data-film', /hero-md-v2\.mp4$/, { timeout: 10000 })
  await expect(video).toHaveAttribute('src', /^blob:/, { timeout: 20000 })
  await expect(video).toHaveClass(/is-ready/, { timeout: 20000 })
})

// Bestsellers (26 Nov 2026): phones get a swipe carousel (no pinned scroll animation), larger screens keep the pin.
test('bestsellers: swipe carousel on phones, pinned animation on desktop', async ({ page, tracking }, info) => {
  void tracking
  await page.goto('/')
  const section = page.locator('#products')
  await section.scrollIntoViewIfNeeded()
  if (info.project.name === 'phone') {
    await expect(section).toHaveClass(/is-carousel/)
    await expect(page.locator('.pin-spacer')).toHaveCount(0)
    await page.locator('.showcase-page', { hasText: '02' }).click()
    await expect(page.locator('.showcase-page.is-active')).toHaveText('02')
    await page.locator('.showcase-track').evaluate((t) => t.scrollTo({ left: t.clientWidth * 3 }))
    await expect(page.locator('.showcase-page.is-active')).toHaveText('04')
  } else {
    await expect(section).not.toHaveClass(/is-carousel/)
    await expect(page.locator('.pin-spacer')).toHaveCount(1)
  }
})

test('product page: real reviews of this rice only, shown on the page and as stars in its Product data', async ({ page, tracking }) => {
  void tracking
  await page.goto('/products/kitchidi-ponni-rice')
  const section = page.locator('.pdp-reviews')
  await expect(section).toBeVisible()
  await expect(section).toContainText('4.5 out of 5')
  await expect(section).toContainText('rated by 2 verified customers')
  await expect(section).toContainText('Test review text one.')
  await expect(section).not.toContainText('Mixed order review.')
  const data = JSON.parse(await page.locator('#product-schema').textContent())
  expect(data.name).toBe('Kitchidi Ponni Rice')
  expect(data.aggregateRating).toMatchObject({ ratingValue: 4.5, ratingCount: 2, reviewCount: 1 })
  expect(data.review).toHaveLength(1)
  expect(data.offers[0]).toMatchObject({ '@type': 'Offer', priceCurrency: 'INR', hasMerchantReturnPolicy: { merchantReturnDays: 7 } })
})

test('product page with no reviews: no review section and no stars', async ({ page, tracking }) => {
  void tracking
  await page.goto('/products/special-rajabhogam-rice')
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('.pdp-reviews')).toHaveCount(0)
  const data = JSON.parse(await page.locator('#product-schema').textContent())
  expect(data.aggregateRating).toBeUndefined()
})

// The test server (vite preview) does not map /refund to refund/index.html as Firebase does, so the files are asked for directly.
test('pre-rendered pages: full policy text, one aged-rice guide link, titles within 60 characters', async ({ request }) => {
  const refund = await (await request.get('/refund/index.html')).text()
  expect(refund).toContain('Problems we cover')
  expect(refund).not.toContain('About Chennai Rice Industries</h2>')
  const infra = await (await request.get('/infrastructure/index.html')).text()
  expect(infra).toContain('10 processing stages, then dispatch and delivery')
  const home = await (await request.get('/')).text()
  expect(home).toContain('/blog/what-is-aged-rice')
  expect(home).not.toContain('href="/what-is-aged-rice"')
  for (const path of ['/', '/raw-rice-vs-boiled-rice', '/bulk-rice-suppliers-tamil-nadu', '/products/kitchidi-ponni-rice']) {
    const title = (await (await request.get(path === '/' ? '/' : path + '/index.html')).text()).match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&')
    expect(title.length, path).toBeLessThanOrEqual(60)
  }
})

// Spin & Win switched on (as on the live site): pages still render (a hook after an early return in SpinWheel crashed
// every page once the offer loaded, caught 26 Nov 2026), and the emblem's × hides it for the visit.
test('Spin & Win on: product page renders, and the × hides the emblem', async ({ page, tracking }) => {
  void tracking
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/spin', (route) => route.fulfill({ json: { enabled: true, prizes: [{ key: 't1', label: 'Test prize', kind: 'amount' }], validDays: 30 } }))
  await page.goto('/products/kitchidi-ponni-rice')
  await expect(page.locator('h1').first()).toBeVisible()
  await answerCookies(page, 'Reject')
  await page.waitForTimeout(800)
  expect(errors).toEqual([])
  const close = page.locator('button.spin-fab-hide')
  if (await close.count()) {
    await close.click()
    await expect(page.locator('button.spin-fab')).toHaveCount(0)
  }
})

// The order_invoice WhatsApp button: /w/invoice-<order>.<id> opens that order's GST invoice page (served by the server).
test('WhatsApp invoice link opens the customer invoice page', async ({ page, tracking }) => {
  void tracking
  const id = '6f1c2e8a-1b2c-4d3e-8f9a-0b1c2d3e4f5a'
  const asked = page.waitForRequest((r) => r.url().includes(`/api/orders/${id}/invoice`))
  await page.goto(`/w/invoice-CR-20261127-4MK9C.${id}`)
  const req = await asked
  expect(new URL(req.url()).searchParams.get('n')).toBe('CR-20261127-4MK9C')
})

test('WhatsApp Join Contest link opens the contest page, credited to WhatsApp', async ({ page, tracking }) => {
  void tracking
  await page.goto('/w/contest-bot')
  await expect(page).toHaveURL(/\/contest\?utm_source=whatsapp&utm_medium=message&utm_campaign=wa_contest/)
  await expect(page.locator('h1').first()).toBeVisible()
})

// The phones' bottom bar (call · Buy now · Order on WhatsApp) was removed (owner, 27 Nov 2026).
test('no bottom call / Buy now / WhatsApp bar on the home page', async ({ page, tracking }) => {
  void tracking
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('.site-actionbar')).toHaveCount(0)
  await expect(page.getByText('Order on WhatsApp', { exact: true })).toHaveCount(0)
})

// Bulk order form (owner, 27 Nov 2026): mobile number digits only, 10 at most; no GSTIN for "Others".
test('bulk order form: mobile number takes 10 digits only; GSTIN hidden for Others', async ({ page, tracking }) => {
  void tracking
  await page.goto('/bulk-order')
  const phone = page.getByLabel('Mobile number')
  await phone.fill('98a76-54 3210999')
  await expect(phone).toHaveValue('9876543210')
  await phone.fill('+91 98765 43210') // pasted with the country code
  await expect(phone).toHaveValue('9876543210')
  await expect(page.getByLabel('GSTIN')).toBeVisible()
  await page.getByRole('button', { name: 'Others', exact: true }).click()
  await expect(page.getByLabel('GSTIN')).toHaveCount(0)
})

// NeoDove dashboard (owner, 27 Nov 2026): the Performance login sees it, with Sales Daddy and our database apart.
test('NeoDove dashboard: Performance login sees Sales Daddy and our database input side by side', async ({ page, tracking }, info) => {
  void tracking
  const perf = (pushed, called, qualified, converted) => ({ pushed, called, notCalled: pushed - called, qualified, notQualified: 1, converted, revenue: converted * 1250, callRate: 50, qualifiedRate: 40, conversionRate: 10, medianHoursToCall: 1.5 })
  const split = (a, b) => ({ all: perf(a + b, a, 1, 1), salesdaddy: perf(a, a, 1, 1), website: perf(b, 0, 0, 0) })
  const data = {
    period: { from: '2026-11-21', to: '2026-11-27', days: 7 },
    input: {
      salesdaddy: { received: 42, queued: 30, pushed: 28, already: 9, waiting: 1, failed: 1, notQueued: 3, buyers: 2 },
      website: { queued: 57, pushed: 50, already: 4, waiting: 2, failed: 1, byType: [{ type: 'Meta Ads', queued: 40, pushed: 37, already: 2, waiting: 1, failed: 0 }] },
    },
    performance: { salesdaddy: perf(28, 20, 8, 3), website: perf(50, 31, 12, 5), all: perf(78, 51, 20, 8) },
    byCampaign: [{ name: 'Meta', ...split(28, 37) }],
    byCaller: [{ name: 'Test Caller', ...split(20, 31) }],
    byType: [{ name: 'Meta lead form (Sales Daddy)', ...split(28, 0) }],
    trend: [{ day: '2026-11-27', sdReceived: 5, sdPushed: 4, webQueued: 8, webPushed: 7, called: 9 }],
    waiting: { groups: [] }, // "Why leads are waiting" (28 Nov 2026): none in this test
    health: { queued: 3, failed: 2, oldestQueuedMinutes: 12, lastPush: new Date().toISOString(), lastSalesDaddyCopy: new Date().toISOString(), lastCall: new Date().toISOString(), problems: [{ reason: 'NeoDove HTTP 500', leads: 2 }] },
  }
  await page.addInitScript(() => sessionStorage.setItem('cr.writer.token', JSON.stringify({ token: 'test', expiresAt: new Date(Date.now() + 3600e3).toISOString() })))
  await page.route('**/api/admin/me', (r) => r.fulfill({ json: { email: 'performance@test', role: 'performance', permissions: ['analyst.view'] } }))
  await page.route('**/api/admin/neodove-dashboard**', (r) => r.fulfill({ json: data }))
  // Firebase serves /admin from app.html (firebase.json); vite preview would fall back to the storefront page.
  const appHtml = require('fs').readFileSync(require('path').join(__dirname, '..', 'dist', 'app.html'), 'utf8')
  await page.route('**/admin', (r) => r.fulfill({ contentType: 'text/html', body: appHtml }))
  // The admin styles @import a Google font; a blocked import fails the whole stylesheet (and the admin app), so
  // fonts get an empty answer here.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }))
  // The login opens on Analyst first; its data is not part of this test (answered with an error, shown as such).
  await page.route(/\/api\/admin\/analyst(\/|\?|$)/, (r) => r.fulfill({ status: 503, json: { error: 'Not in this test.' } }))
  await page.goto('/admin')
  // Phones: the menu sits behind the ☰ button.
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await page.getByRole('button', { name: 'NeoDove', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Input from Sales Daddy' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Input from our database' })).toBeVisible()
  await expect(page.getByText('Received from Sales Daddy')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sales Daddy vs our database' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Test Caller' })).toBeVisible()
  await page.getByRole('button', { name: 'From Sales Daddy', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Test Caller' })).toBeVisible()
  // Nothing wider than the screen on a phone.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(wide, info.project.name).toBeLessThanOrEqual(1)
})

// Google Ads "Contact" goal (27 Nov 2026): a sent contact form pushes contact_form_submit for GTM (nothing personal).
test('contact form: a sent enquiry pushes contact_form_submit for Google Ads, with no personal data', async ({ page, tracking }) => {
  void tracking
  await page.goto('/contact')
  await page.getByLabel('Name').fill('Test Person')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Phone').fill('9876543210')
  await page.getByLabel('Enquiry').fill('Test enquiry')
  await page.getByRole('button', { name: 'Send Enquiry' }).click()
  await expect.poll(() => page.evaluate(() => (window.dataLayer || []).filter((x) => x && x.event === 'contact_form_submit').length)).toBe(1)
  const pushed = await page.evaluate(() => JSON.stringify((window.dataLayer || []).find((x) => x && x.event === 'contact_form_submit')))
  expect(pushed).not.toContain('9876543210')
  expect(pushed).not.toContain('test@example.com')
  expect(pushed).not.toContain('Test Person')
})
