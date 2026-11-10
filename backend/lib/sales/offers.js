// Which offer an order used, in words, for the invoice and Accounts (Nov 2026).
// discount_codes.source: spin (Spin & Win prize), referral (a friend's Refer a friend code), reward (the referrer's
// reward for a delivered friend), cart (cart reminder email 2), manual (a code made in /offers).
export const OFFER_KINDS = {
  spin: 'Spin & Win',
  referral: 'Refer a friend',
  reward: 'Refer a friend reward',
  cart: 'Cart reminder',
  manual: 'Discount code',
}

/** { kind, label, code, gift } for an order row with discount_source, or null when no offer was used. */
export function orderOffer(o) {
  const code = o.discount_code || ''
  const gift = o.gift_note || ''
  if (!code && !gift && !Number(o.discount_paise)) return null
  const kind = o.discount_source || (/^SPIN-/i.test(code) ? 'spin' : /^CART-/i.test(code) ? 'cart' : code ? 'manual' : gift ? 'spin' : 'manual')
  return { kind, label: OFFER_KINDS[kind] || 'Discount code', code, gift }
}
