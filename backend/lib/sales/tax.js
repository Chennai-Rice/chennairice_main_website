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
