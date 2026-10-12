import { isSameState } from './util.js'
// GST worked backwards from GST-inclusive prices.
//
// Prices on the site are what the customer pays, as printed on the pack. For
// the invoice each line is split into its taxable value and the tax inside it:
//
//   taxable = total × 100 / (100 + rate)        rounded to the paisa
//   tax     = total − taxable                   so the parts always add up
//
// Delivery inside Tamil Nadu (the seller's state) is intra-state: the tax is
// half CGST, half SGST. Anywhere else it is inter-state: all IGST.

export function splitInclusive(totalPaise, rateBp, intraState) {
  const total = Math.round(Number(totalPaise))
  const taxable = Math.round((total * 10000) / (10000 + Number(rateBp)))
  const tax = total - taxable
  if (intraState) {
    const cgst = Math.floor(tax / 2)
    return { taxable, cgst, sgst: tax - cgst, igst: 0, tax }
  }
  return { taxable, cgst: 0, sgst: 0, igst: tax, tax }
}

// GST inside the delivery charge. The delivered-price sheet (Oct 2026) builds
// the delivery charge from courier costs that carry 18% GST, so 18% unless
// company_settings.delivery_tax_rate_bp says otherwise (e.g. 500 if the
// accountant treats delivery as part of a composite supply of rice at 5%).
export const DEFAULT_DELIVERY_TAX_RATE_BP = 1800

export function deliveryTaxRateBp(settings = {}) {
  const v = Number(settings.delivery_tax_rate_bp)
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DELIVERY_TAX_RATE_BP
}

/** The delivery charge of an order split into taxable value and GST, the
 *  same way as its rice lines (CGST + SGST within Tamil Nadu, else IGST). */
export function shippingTax(order) {
  const paise = Number(order?.shipping_paise || 0)
  const rate = Number(order?.shipping_tax_rate_bp || 0)
  if (!paise) return { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, rateBp: 0 }
  const intra = isSameState(order.ship_state, 'Tamil Nadu')
  return { ...splitInclusive(paise, rate, intra), rateBp: rate }
}
