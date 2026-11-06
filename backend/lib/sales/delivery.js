// How an order reaches the customer: by courier (the regional charge per pack from the price list), or
// by Chennai Rice's own delivery team, a flat charge per order where the team delivers (Nov 2026).
//
// The customer chooses at checkout once the PIN code is known; the server works out both charges and
// checks the choice again when the order is placed, so a PIN outside the area or a changed amount is
// never accepted. Settings (company_settings, edited in Warehouse → Settings):
//   in_house_delivery_enabled   'true' / 'false'           (on unless set to 'false')
//   in_house_delivery_paise     flat charge per order       (default 10000 = ₹100)
//   in_house_delivery_pins      PIN codes or prefixes, e.g. "638, 600001" (empty = all of Tamil Nadu)
//   in_house_delivery_promise   what the customer is told   (default "Within 48 hours")
import { httpError, str } from './util.js'
import { regionForPincode } from './regions.js'

export const DELIVERY_METHODS = ['courier', 'in_house']
export const IN_HOUSE_DEFAULTS = { paise: 10000, promise: 'Within 48 hours' }

/** The in-house delivery settings, cleaned. */
export function inHouseSettings(settings = {}) {
  const paise = Number(settings.in_house_delivery_paise)
  const pins = str(settings.in_house_delivery_pins).split(/[\s,;]+/).filter((p) => /^\d{1,6}$/.test(p))
  return {
    enabled: str(settings.in_house_delivery_enabled).toLowerCase() !== 'false',
    paise: Number.isInteger(paise) && paise >= 0 ? paise : IN_HOUSE_DEFAULTS.paise,
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
 * [{ method: 'courier', paise, days }, { method: 'in_house', paise, promise }] (in-house only where covered).
 * `courierPaise` is the courier charge the price list worked out (null while the PIN code is unknown).
 */
export function deliveryOptions(courierPaise, pincode, settings = {}) {
  if (courierPaise == null) return []
  const options = [{ method: 'courier', paise: courierPaise, promise: '3–5 days' }]
  if (inHouseCovers(pincode, settings)) {
    const s = inHouseSettings(settings)
    options.push({ method: 'in_house', paise: s.paise, promise: s.promise })
  }
  return options
}

/**
 * The method and charge for an order: the chosen method when it is offered for this PIN code, otherwise
 * an error (never a silent switch, so the customer always pays what they chose). No choice = courier.
 */
export function chooseDelivery(courierPaise, pincode, method, settings = {}) {
  const wanted = str(method) || 'courier'
  if (!DELIVERY_METHODS.includes(wanted)) throw httpError('Unknown delivery method.')
  const option = deliveryOptions(courierPaise, pincode, settings).find((o) => o.method === wanted)
  if (!option) {
    throw httpError('In-house delivery is not offered for that PIN code.', {
      status: 422,
      publicMessage: 'Chennai Rice delivery is not available for this PIN code. Please choose courier delivery.',
    })
  }
  return option
}
