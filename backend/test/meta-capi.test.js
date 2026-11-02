// The server-side Purchase for Meta: same event ID as the browser Pixel, hashed buyer details.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cleanMetaSignal, purchaseEvent } from '../lib/sales/meta-capi.js'

const sha = (v) => createHash('sha256').update(v).digest('hex')

test('browser details are checked before they are kept', () => {
  const m = cleanMetaSignal(
    { fbp: 'fb.1.1700000000000.123456789', fbc: 'not-a-cookie', url: 'https://evil.example/x', consent: 'yes' },
    { ip: '203.0.113.9', userAgent: 'Mozilla/5.0' })
  assert.deepEqual(m, { fbp: 'fb.1.1700000000000.123456789', consent: 'unset', ip: '203.0.113.9', ua: 'Mozilla/5.0' })
  assert.equal(cleanMetaSignal({ consent: 'denied' }).consent, 'denied')
})

test('the Purchase matches the Pixel and hashes the buyer', () => {
  const order = {
    order_number: 'CR-20261031-ABCDE', customer_id: 'c1', total_paise: 60900, placed_at: '2026-10-31T12:00:00Z',
    contact_name: 'Ravi Kumar', contact_email: ' Ravi@Example.com', contact_phone: '98765 43210',
    shipping_address: { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    attribution: { utm_source: 'facebook', meta: { fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc', ip: '203.0.113.9', ua: 'UA', url: 'https://chennairiceindustries.com/checkout' } },
  }
  const e = purchaseEvent(order, [{ slug: 'rudra', pack_kg: '25.00', quantity: 1, unit_price_paise: 60900 }])
  assert.equal(e.event_id, 'purchase-CR-20261031-ABCDE') // the browser's eventID (metaPixel.js)
  assert.equal(e.event_name, 'Purchase')
  assert.equal(e.action_source, 'website')
  assert.equal(e.event_time, Date.parse('2026-10-31T12:00:00Z') / 1000)
  assert.deepEqual(e.custom_data.content_ids, ['rudra-25kg'])
  assert.equal(e.custom_data.value, 609)
  assert.equal(e.custom_data.currency, 'INR')
  assert.deepEqual(e.user_data.em, [sha('ravi@example.com')])
  assert.deepEqual(e.user_data.ph, [sha('919876543210')])
  assert.deepEqual(e.user_data.fn, [sha('ravi')])
  assert.deepEqual(e.user_data.st, [sha('tamilnadu')])
  assert.equal(e.user_data.fbc, 'fb.1.1.abc')
  assert.equal(e.user_data.client_ip_address, '203.0.113.9')
  assert.equal(e.event_source_url, 'https://chennairiceindustries.com/checkout')
})
