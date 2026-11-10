import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orderOffer } from '../lib/sales/offers.js'

test('offer on an order, for the invoice and Accounts: Spin & Win, Refer a friend, reward, cart, code, gift, none', () => {
  assert.deepEqual(orderOffer({ discount_code: 'SPIN-AB12CD', discount_source: 'spin', discount_paise: 5000 }), { kind: 'spin', label: 'Spin & Win', code: 'SPIN-AB12CD', gift: '' })
  assert.equal(orderOffer({ discount_code: 'RAMYA50', discount_source: 'referral', discount_paise: 5000 }).label, 'Refer a friend')
  assert.equal(orderOffer({ discount_code: 'RW-1234', discount_source: 'reward', discount_paise: 10000 }).label, 'Refer a friend reward')
  assert.equal(orderOffer({ discount_code: 'CART-1A2B3C', discount_paise: 9000 }).kind, 'cart')
  assert.equal(orderOffer({ discount_code: 'DIWALI', discount_source: 'manual', discount_paise: 2000 }).label, 'Discount code')
  // A Spin & Win gift prize: no money off, a free bag packed with the order.
  assert.deepEqual(orderOffer({ discount_code: 'SPIN-GIFT01', discount_source: 'spin', discount_paise: 0, gift_note: 'Free 5 kg Kitchidi Ponni bag' }),
    { kind: 'spin', label: 'Spin & Win', code: 'SPIN-GIFT01', gift: 'Free 5 kg Kitchidi Ponni bag' })
  assert.equal(orderOffer({ discount_paise: 0 }), null)
})
