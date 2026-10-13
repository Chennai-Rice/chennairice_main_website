// Delivery regions by PIN code, for the regional delivered-price sheets
// (Oct 2026): Tamil Nadu, South, North and North East. "North" is the rest of
// India. The region is read from the PIN code's leading digits (India Post
// postal circles), so it cannot be gamed by the state typed at checkout.
//
//   60–64        Tamil Nadu (incl. Puducherry's Pondicherry and Karaikal)
//   50–53        Andhra Pradesh, Telangana               → South
//   56–59        Karnataka                               → South
//   67–69        Kerala (incl. Lakshadweep, Mahe)        → South
//   78, 79, 737  Assam, the north-eastern states, Sikkim → North East
//   744          Andaman & Nicobar                       → not delivered
//   90–99        Army Postal Service                     → not delivered
//   anything else from 11 to 85                         → North

export const REGIONS = {
  TN: 'Tamil Nadu',
  SOUTH: 'South India',
  NORTH: 'North India',
  NE: 'North East',
}

const PIN = /^[1-9]\d{5}$/

/** The delivery region code for a PIN code, or null where we do not deliver. */
export function regionForPincode(pincode) {
  const pin = String(pincode ?? '').replace(/\s+/g, '')
  if (!PIN.test(pin)) return null
  const two = Number(pin.slice(0, 2))
  const three = Number(pin.slice(0, 3))
  if (three === 744) return null
  if (three === 737) return 'NE'
  if (two >= 60 && two <= 64) return 'TN'
  if ((two >= 50 && two <= 53) || (two >= 56 && two <= 59) || (two >= 67 && two <= 69)) return 'SOUTH'
  if (two === 78 || two === 79) return 'NE'
  if (two >= 11 && two <= 85) return 'NORTH'
  return null
}
