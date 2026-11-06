// How an order reaches the customer: by courier (the regional charge per pack from the price list), or
// by Chennai Rice's own delivery team, a flat charge per order where the team delivers (Nov 2026).
//
// Our team is offered only when it costs the customer less than the courier for that cart (the courier
// charge grows with the number of packs; ours is one flat charge), so a single small bag stays courier.
//
// The customer chooses at checkout once the PIN code is known; the server works out both charges and
// checks the choice again when the order is placed, so a PIN outside the area or a changed amount is
// never accepted. Settings (company_settings, edited in Warehouse → Settings):
//   in_house_delivery_enabled   'true' / 'false'           (on unless set to 'false')
//   in_house_delivery_paise     flat charge per order       (default 10000 = ₹100)
//   in_house_delivery_26kg_paise  the flat charge when the order has a 26 kg bag (default 20000 = ₹200,
//                               the 26 kg pricing sheet, Nov 2026)
//   in_house_delivery_pins      PIN codes or prefixes, e.g. "638, 600001" (empty = all of Tamil Nadu)
//   in_house_delivery_promise   what the customer is told   (default "Within 48 hours")
import { httpError, str } from './util.js'
import { regionForPincode } from './regions.js'

export const DELIVERY_METHODS = ['courier', 'in_house']
export const IN_HOUSE_DEFAULTS = { paise: 10000, paise26: 20000, promise: 'Within 48 hours' }

/** The in-house delivery settings, cleaned. */
export function inHouseSettings(settings = {}) {
  const paise = Number(settings.in_house_delivery_paise)
  const raw26 = settings.in_house_delivery_26kg_paise
  const paise26 = raw26 == null || raw26 === '' ? NaN : Number(raw26)
  const pins = str(settings.in_house_delivery_pins).split(/[\s,;]+/).filter((p) => /^\d{1,6}$/.test(p))
  return {
    enabled: str(settings.in_house_delivery_enabled).toLowerCase() !== 'false',
    paise: Number.isInteger(paise) && paise >= 0 ? paise : IN_HOUSE_DEFAULTS.paise,
    paise26: Number.isInteger(paise26) && paise26 >= 0 ? paise26 : IN_HOUSE_DEFAULTS.paise26,
    pins,
    promise: str(settings.in_house_delivery_promise) || IN_HOUSE_DEFAULTS.promise,
  }
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
 * [{ method: 'courier', paise, days }, { method: 'in_house', paise, promise }] (in-house only where covered
 * and cheaper than the courier).
 * `courierPaise` is the courier charge the price list worked out (null while the PIN code is unknown);
 * `largestPackKg` the biggest bag in the cart (a 26 kg bag has its own in-house charge).
 */
export function deliveryOptions(courierPaise, pincode, settings = {}, { largestPackKg = 0 } = {}) {
  if (courierPaise == null) return []
  const options = [{ method: 'courier', paise: courierPaise, promise: '3–5 days' }]
  const s = inHouseSettings(settings)
  const own = Number(largestPackKg) >= 26 ? s.paise26 : s.paise
  if (inHouseCovers(pincode, settings) && own < courierPaise) {
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
  if (!option) {
    throw httpError('In-house delivery is not offered for that PIN code.', {
      status: 422,
      publicMessage: 'Chennai Rice delivery is not available for this PIN code. Please choose courier delivery.',
    })
  }
  return option
}
