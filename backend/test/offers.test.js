import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orderOffer } from '../lib/sales/offers.js'

test('offer on an order, for the invoice and Accounts: Spin & Win, Refer a friend, reward, cart, code, gift, none', () => {
  assert.deepEqual(orderOffer({ discount_code: 'SPIN-AB12CD', discount_source: 'spin', discount_paise: 5000 }), { kind: 'spin', label: 'Spin & Win', detail: '₹50 OFF', code: 'SPIN-AB12CD', gift: '' })
  assert.equal(orderOffer({ discount_code: 'RAMYA50', discount_source: 'referral', discount_paise: 5000 }).label, 'Refer a friend')
  assert.equal(orderOffer({ discount_code: 'RW-1234', discount_source: 'reward', discount_paise: 10000 }).label, 'Refer a friend reward')
  assert.equal(orderOffer({ discount_code: 'CART-1A2B3C', discount_paise: 9000 }).kind, 'cart')
  assert.equal(orderOffer({ discount_code: 'DIWALI', discount_source: 'manual', discount_paise: 2000 }).label, 'Discount code')
  // A Spin & Win gift prize: no money off, a free bag packed with the order.
  assert.deepEqual(orderOffer({ discount_code: 'SPIN-GIFT01', discount_source: 'spin', discount_paise: 0, gift_note: 'Free 5 kg Kitchidi Ponni bag' }),
    { kind: 'spin', label: 'Spin & Win', detail: 'Free 5 kg Kitchidi Ponni bag', code: 'SPIN-GIFT01', gift: 'Free 5 kg Kitchidi Ponni bag' })
  assert.equal(orderOffer({ discount_paise: 0 }), null)
})

test('offer detail, as the customer saw it: the Spin & Win prize, ₹ off, % off, free delivery, gift', async () => {
  const { offerDetail } = await import('../lib/sales/offers.js')
  assert.equal(offerDetail({ prize_label: '₹150 OFF' }), '₹150 OFF')
  assert.equal(offerDetail({ dc_kind: 'amount', dc_amount_paise: 10000 }), '₹100 OFF')
  assert.equal(offerDetail({ dc_kind: 'percent', dc_percent_bp: 500 }), '5% OFF')
  assert.equal(offerDetail({ dc_kind: 'free_delivery' }), 'Free delivery')
  assert.equal(offerDetail({ dc_kind: 'gift', gift_note: 'Free 5 kg bag' }), 'Free 5 kg bag')
  assert.equal(offerDetail({ discount_paise: 2500 }), '₹25 OFF')
})
