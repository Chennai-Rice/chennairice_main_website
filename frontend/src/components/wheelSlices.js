// The seven slices of the Spin & Win wheel picture (/assets/spin7-rotor.webp, from the "Seven-Segment Chennai Rice
// Prize Wheel" design, Nov 2026), clockwise from the top, with where each slice's middle is (degrees clockwise from
// the top, measured on the picture: its slices are not all the same size). Used by the wheel (to stop with the
// prize under the pointer on the right) and by /offers → Spin & Win, which warns when the prize list and the
// picture do not match. A gift prize ("Exclusive surprise gift"…) lands on the free-bag slice.
export const WHEEL_SLICES = [
  { key: 'p25', label: '₹25 OFF', center: 358, re: /₹\s*25\b/, add: { label: '₹25 OFF', kind: 'amount', amount: 25 } },
  { key: 'p150', label: '₹150 OFF', center: 50, re: /₹\s*150\b/, add: { label: '₹150 OFF', kind: 'amount', amount: 150 } },
  { key: 'p50', label: '₹50 OFF', center: 103, re: /₹\s*50\b/, add: { label: '₹50 OFF', kind: 'amount', amount: 50 } },
  { key: 'free', label: 'Free Delivery', center: 154, re: /free\s*delivery/i, add: { label: 'Free Delivery', kind: 'free_delivery' } },
  { key: 'p75', label: '₹75 OFF', center: 205, re: /₹\s*75\b/, add: { label: '₹75 OFF', kind: 'amount', amount: 75 } },
  { key: 'p100', label: '₹100 OFF', center: 256, re: /₹\s*100\b/, add: { label: '₹100 OFF', kind: 'amount', amount: 100 } },
  { key: 'bag', label: 'Free 5kg bag (gift)', center: 307, re: /bag|gift|surprise/i, add: { label: 'Free 5kg Kitchadi Ponni Slogan Bag', kind: 'gift', gift: 'Free 5 kg Kitchidi Ponni Slogan Bag' } },
]

/** Which slice shows this prize: by its words (₹25 OFF, Free Delivery, a gift…), then its key; -1 if none. */
export function sliceOf(prize) {
  const label = String(prize?.label || '')
  const byLabel = WHEEL_SLICES.findIndex((s) => s.re.test(label))
  if (byLabel >= 0) return byLabel
  if (prize?.kind === 'gift') return WHEEL_SLICES.findIndex((s) => s.key === 'bag')
  return WHEEL_SLICES.findIndex((s) => s.key === prize?.key)
}

/** How far to turn the wheel (0–359°) so slice `i` sits under the pointer on the right (90° from the top). */
export const landingAngle = (i) => (((90 - (WHEEL_SLICES[i]?.center ?? 0)) % 360) + 360) % 360
