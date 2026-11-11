// How an order reaches the customer: by courier (the regional charge per pack from the price list), or
// by Chennai Rice's own delivery team, a flat charge per order where the team delivers (Nov 2026).
//
// Our team is offered only when it costs the customer less than the courier for that cart (the courier
// charge grows with the number of packs; ours is one flat charge), so a single small bag stays courier.
//
// Our team carries only the big bags (Nov 2026): a cart with any 5 kg or 10 kg bag goes by courier, so
// the choice appears only when every bag is above 10 kg (the 25 and 26 kg packs).
//
// The customer chooses at checkout once the PIN code is known; the server works out both charges and
// checks the choice again when the order is placed, so a PIN outside the area or a changed amount is
// never accepted. Settings (company_settings, edited in Warehouse → Settings):
//   in_house_delivery_enabled   'true' / 'false'           (on unless set to 'false')
//   in_house_delivery_paise     flat charge per order       (default 20000 = ₹200, every pack size: the
//                               pricing sheet, Nov 2026: website price + ₹200 = what the customer pays)
//   in_house_delivery_26kg_paise  the charge when the order has a 26 kg bag (default: the same as above)
//   in_house_delivery_only_cheaper  'true' = offered only when it costs less than the courier (default:
//                               offered on every order the team covers; the cheaper choice is preselected)
//   in_house_delivery_pins      PIN codes or prefixes, e.g. "638, 600001" (empty = all of Tamil Nadu)
//   in_house_delivery_promise   what the customer is told   (default "Within 48 hours")
import { httpError, str } from './util.js'
import { regionForPincode } from './regions.js'

export const DELIVERY_METHODS = ['courier', 'in_house']
export const IN_HOUSE_DEFAULTS = { paise: 20000, promise: 'Within 48 hours' }
/** Bags of this size or smaller (the 5 and 10 kg packs) are never delivered by our team. */
export const IN_HOUSE_SMALL_PACK_KG = 10

/** The in-house delivery settings, cleaned. */
export function inHouseSettings(settings = {}) {
  const paise = Number(settings.in_house_delivery_paise)
  const raw26 = settings.in_house_delivery_26kg_paise
  const paise26 = raw26 == null || raw26 === '' ? NaN : Number(raw26)
  const pins = str(settings.in_house_delivery_pins).split(/[\s,;]+/).filter((p) => /^\d{1,6}$/.test(p))
  return {
    enabled: str(settings.in_house_delivery_enabled).toLowerCase() !== 'false',
    paise: Number.isInteger(paise) && paise >= 0 ? paise : IN_HOUSE_DEFAULTS.paise,
    paise26: Number.isInteger(paise26) && paise26 >= 0 ? paise26 : (Number.isInteger(paise) && paise >= 0 ? paise : IN_HOUSE_DEFAULTS.paise),
    onlyCheaper: str(settings.in_house_delivery_only_cheaper).toLowerCase() === 'true',
    pins,
    promise: str(settings.in_house_delivery_promise) || IN_HOUSE_DEFAULTS.promise,
  }
}

/**
 * Does the cart have a 5 or 10 kg bag (which keeps it on courier)? From its lines, or, without them, from
 * its biggest bag.
 */
export function hasSmallBag({ largestPackKg = 0, lines = null } = {}) {
  const small = (kg) => !(Number(kg) > IN_HOUSE_SMALL_PACK_KG)
  return Array.isArray(lines) && lines.length ? lines.some((l) => small(l.packKg)) : small(largestPackKg)
}

/** Does the team deliver to this PIN code? The listed PINs / prefixes, or all of Tamil Nadu when none are listed. */
export function inHouseCovers(pincode, settings = {}) {
  const s = inHouseSettings(settings)
  const pin = str(pincode).replace(/\s+/g, '')
  if (!s.enabled || !/^[1-9]\d{5}$/.test(pin)) return false
  return s.pins.length ? s.pins.some((p) => pin.startsWith(p)) : regionForPincode(pin) === 'TN'
}

/**
 * The ways this cart can be delivered to this PIN code, cheapest method first among equals:
 * [{ method: 'courier', paise, days }, { method: 'in_house', paise, promise }] (in-house only where covered,
 * for carts with no 5 or 10 kg bag, and, when so set, cheaper than the courier).
 * `courierPaise` is the courier charge the price list worked out (null while the PIN code is unknown);
 * `largestPackKg` the biggest bag in the cart (a 26 kg bag has its own in-house charge); `lines` the cart's
 * packs: when every pack has an in-house charge from the price list (per bag), the charge is their sum.
 */
export function deliveryOptions(courierPaise, pincode, settings = {}, { largestPackKg = 0, lines = null } = {}) {
  if (courierPaise == null) return []
  const options = [{ method: 'courier', paise: courierPaise, promise: '3–5 days' }]
  const s = inHouseSettings(settings)
  const perBag = Array.isArray(lines) && lines.length && lines.every((l) => l.inHousePaise != null)
  const own = perBag
    ? lines.reduce((t, l) => t + Number(l.inHousePaise) * Number(l.quantity), 0)
    : Number(largestPackKg) >= 26 ? s.paise26 : s.paise
  if (!hasSmallBag({ largestPackKg, lines }) && inHouseCovers(pincode, settings) && (!s.onlyCheaper || own < courierPaise)) {
    options.push({ method: 'in_house', paise: own, promise: s.promise })
  }
  return options
}

/**
 * The method and charge for an order: the chosen method when it is offered for this PIN code, otherwise
 * an error (never a silent switch, so the customer always pays what they chose). No choice = courier.
 */
export function chooseDelivery(courierPaise, pincode, method, settings = {}, cart = {}) {
  const wanted = str(method) || 'courier'
  if (!DELIVERY_METHODS.includes(wanted)) throw httpError('Unknown delivery method.')
  const option = deliveryOptions(courierPaise, pincode, settings, cart).find((o) => o.method === wanted)
  if (!option && wanted === 'in_house' && hasSmallBag(cart) && inHouseCovers(pincode, settings)) {
    // the PIN is covered: it is the cart's 5 or 10 kg bags that keep it on courier
    throw httpError('In-house delivery is not offered for 5 or 10 kg bags.', {
      status: 422,
      publicMessage: 'Chennai Rice delivery is only for 25 and 26 kg bags. Please choose courier delivery.',
    })
  }
  if (!option) {
    throw httpError('In-house delivery is not offered for that PIN code.', {
      status: 422,
      publicMessage: 'Chennai Rice delivery is not available for this PIN code. Please choose courier delivery.',
    })
  }
  return option
}
