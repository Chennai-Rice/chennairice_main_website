// Merchant feed delivery charges and names (no database needed). SEO audit error 10, 26 Nov 2026.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { FEED_PAGES, REGION_PIN_PREFIXES, feedShipping } from '../lib/sales/merchant-feed.js'
import { regionForPincode } from '../lib/sales/regions.js'
import { PRODUCT_SEO, productPath, productName } from '../../frontend/src/seo.js'

test('feed: delivery charge per pack for every PIN prefix, by the same regions as checkout', () => {
  const xml = feedShipping({ TN: 165.2, SOUTH: 264.32, NORTH: 396.48, NE: 528.64 })
  assert.match(xml, /<g:postal_code>60\*<\/g:postal_code><g:price>165\.20 INR<\/g:price>/)
  assert.match(xml, /<g:postal_code>56\*<\/g:postal_code><g:price>264\.32 INR<\/g:price>/)
  assert.match(xml, /<g:postal_code>11\*<\/g:postal_code><g:price>396\.48 INR<\/g:price>/)
  assert.match(xml, /<g:postal_code>737\*<\/g:postal_code><g:price>528\.64 INR<\/g:price>/)
  for (const [code, prefixes] of Object.entries(REGION_PIN_PREFIXES)) {
    for (const pre of prefixes) assert.equal(regionForPincode(pre.padEnd(6, '0')), code, pre)
  }
  assert.ok((xml.match(/<g:shipping>/g) || []).length <= 100) // Google's limit per item
  assert.equal(feedShipping(null), '')
})

test('feed pages, names and photos match the website', () => {
  assert.deepEqual(Object.keys(FEED_PAGES).sort(), Object.keys(PRODUCT_SEO).sort())
  for (const [id, [slug, name]] of Object.entries(FEED_PAGES)) {
    assert.equal('/products/' + slug, productPath(id), id)
    assert.equal(name, productName(id), id)
    assert.ok(existsSync(new URL(`../../frontend/public/assets/shop/feed/${id}.jpg`, import.meta.url)), `photo for ${id}`)
  }
})
