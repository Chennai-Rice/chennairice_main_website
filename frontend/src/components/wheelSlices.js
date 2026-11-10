// The eight slices of the Spin & Win wheel picture (/assets/spin-wheel.webp), clockwise from the top, and which
// prize lands on which (Nov 2026). Used by the wheel and by /offers → Spin & Win, which warns when the prize list
// and the picture do not match. A gift prize ("Exclusive surprise gift"…) lands on the free-bag slice.
export const WHEEL_SLICES = [
  { key: 'p25', label: '₹25 OFF', re: /₹\s*25\b/, add: { label: '₹25 OFF', kind: 'amount', amount: 25 } },
  { key: 'p150', label: '₹150 OFF', re: /₹\s*150\b/, add: { label: '₹150 OFF', kind: 'amount', amount: 150 } },
  { key: 'p50', label: '₹50 OFF', re: /₹\s*50\b/, add: { label: '₹50 OFF', kind: 'amount', amount: 50 } },
  { key: 'free', label: 'Free Delivery', re: /free\s*delivery/i, add: { label: 'Free Delivery', kind: 'free_delivery' } },
  { key: 'p75', label: '₹75 OFF', re: /₹\s*75\b/, add: { label: '₹75 OFF', kind: 'amount', amount: 75 } },
  { key: 'pct5', label: '5% OFF', re: /\b5\s*%/, add: { label: '5% OFF', kind: 'percent', percent: 5, maxOff: 150 } },
  { key: 'p100', label: '₹100 OFF', re: /₹\s*100\b/, add: { label: '₹100 OFF', kind: 'amount', amount: 100 } },
  { key: 'bag', label: 'Free 5kg bag (gift)', re: /bag|gift|surprise/i, add: { label: 'Free 5kg Kitchadi Ponni Slogan Bag', kind: 'gift', gift: 'Free 5 kg Kitchidi Ponni Slogan Bag' } },
]

/** Which slice shows this prize: by its words (₹25 OFF, Free Delivery, a gift…), then its key; -1 if none. */
export function sliceOf(prize) {
  const label = String(prize?.label || '')
  const byLabel = WHEEL_SLICES.findIndex((s) => s.re.test(label))
  if (byLabel >= 0) return byLabel
  if (prize?.kind === 'gift') return WHEEL_SLICES.findIndex((s) => s.key === 'bag')
  return WHEEL_SLICES.findIndex((s) => s.key === prize?.key)
}
