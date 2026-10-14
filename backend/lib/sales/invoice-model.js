// Everything an invoice prints, worked out once for both layouts: the HTML
// page (documents.js) and the emailed PDF (invoice-pdf.js). Laid out after
// the company's own invoices (Tax Invoice GST/551/26-27, Bill of Supply
// 9814/2026-2027):
//
//   only taxed rice (5 / 10 / 25 kg packs, 5%)   → "Tax Invoice"
//   only exempt rice (26 kg packs, nil GST)      → "Bill of Supply"
//   both in one order                            → "Invoice-cum-Bill of Supply"
//                                                  (CGST Rule 46A)
//
// Amounts are in paise. The rate shown per bag is the taxable value (price
// less the GST inside it), as on the company's invoices.
import { isSameState } from './util.js'
import { shippingTax } from './tax.js'

// Printed when an invoice was issued before these details were stored with it.
export const COMPANY = {
  name: 'CHENNAI RICE INDUSTRIES INDIA (P) LTD.,',
  formerName: 'Chennai Gate Rice Industries (P) Ltd.',
  address: '116/1/2,4B, N.Thayirpalayam Village, Chittode Via, Gangapuram Post, Erode-638102.',
  fssai: '12415007000253',
  gstin: '33AAFCC1691K1ZM',
  state: 'Tamil Nadu',
  stateCode: '33',
  phone: '04242555556, 8012501262, 8012501251',
  email: 'support@chennairiceindustries.com',
}

const STATE_CODES = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', punjab: '03', chandigarh: '04', uttarakhand: '05', haryana: '06',
  delhi: '07', rajasthan: '08', 'uttar pradesh': '09', bihar: '10', sikkim: '11', 'arunachal pradesh': '12',
  nagaland: '13', manipur: '14', mizoram: '15', tripura: '16', meghalaya: '17', assam: '18', 'west bengal': '19',
  jharkhand: '20', odisha: '21', chhattisgarh: '22', 'madhya pradesh': '23', gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26', maharashtra: '27', karnataka: '29', goa: '30', lakshadweep: '31',
  kerala: '32', 'tamil nadu': '33', puducherry: '34', 'andaman and nicobar islands': '35', telangana: '36',
  'andhra pradesh': '37', ladakh: '38',
}
export const stateCode = (state) => STATE_CODES[String(state || '').trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ')] || ''

const PAYMENT_METHOD = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay Later' }

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
}
function belowThousand(n) {
  const h = Math.floor(n / 100)
  const r = n % 100
  return [h ? ONES[h] + ' Hundred' : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ')
}
/** Whole number in Indian words: 145970 → "One Lakh Forty Five Thousand Nine Hundred Seventy". */
export function inWords(n) {
  n = Math.floor(n)
  if (!n) return 'Zero'
  const parts = []
  const crore = Math.floor(n / 1e7); n %= 1e7
  const lakh = Math.floor(n / 1e5); n %= 1e5
  const thousand = Math.floor(n / 1e3); n %= 1e3
  if (crore) parts.push(inWords(crore) + ' Crore')
  if (lakh) parts.push(belowHundred(lakh) + ' Lakh')
  if (thousand) parts.push(belowHundred(thousand) + ' Thousand')
  if (n) parts.push(belowThousand(n))
  return parts.join(' ')
}
/** Amount in words as on the company's invoices: "Indian Rupees … and Ninety Six paise Only". */
export function rupeesInWords(paise) {
  const p = Math.round(Number(paise))
  const rupees = Math.floor(p / 100)
  const rest = p % 100
  return `Indian Rupees ${inWords(rupees)}${rest ? ' and ' + belowHundred(rest) + ' paise' : ''} Only`
}

const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '')

export function invoiceModel({ order, items, invoice, shipments = [], payments = [] }) {
  // Invoices issued before the company details were set (no GSTIN stored)
  // print the current company details, so every customer's invoice is right.
  const s = invoice.seller?.gstin ? invoice.seller : {}
  const seller = {
    ...COMPANY,
    ...Object.fromEntries(Object.entries(s).filter(([, v]) => v)),
  }
  const intra = isSameState(order.ship_state, seller.state || 'Tamil Nadu')
  const a = order.shipping_address || {}
  const party = {
    name: order.contact_name,
    lines: [a.line1, a.line2, a.landmark && 'Landmark: ' + a.landmark, [a.city, a.pincode].filter(Boolean).join(' - ')].filter(Boolean),
    state: a.state || order.ship_state,
    stateCode: stateCode(a.state || order.ship_state),
    phone: order.contact_phone,
    email: order.contact_email,
  }

  const lines = items.map((i, n) => ({
    sl: n + 1,
    description: `${i.product_name} - ${Number(i.pack_kg)}Kg.`,
    sku: i.sku,
    hsn: i.hsn_code,
    bags: i.quantity,
    kgs: Number(i.pack_kg) * i.quantity,
    rate: Number(i.taxable_paise) / i.quantity,
    amount: Number(i.taxable_paise),
    rateBp: i.tax_rate_bp,
    cgst: Number(i.cgst_paise), sgst: Number(i.sgst_paise), igst: Number(i.igst_paise),
  }))
  const ship = shippingTax(order)
  if (Number(order.shipping_paise)) {
    const taxable = ship.rateBp ? ship.taxable : Number(order.shipping_paise)
    lines.push({
      sl: lines.length + 1, description: 'Delivery Charges', hsn: '', bags: null, kgs: null, rate: null,
      amount: taxable, rateBp: ship.rateBp, cgst: ship.cgst, sgst: ship.sgst, igst: ship.igst,
    })
  }

  const taxed = lines.some((l) => l.rateBp > 0)
  const exempt = lines.some((l) => !l.rateBp)
  const title = taxed && exempt ? 'Invoice-cum-Bill of Supply' : taxed ? 'Tax Invoice' : 'Bill of Supply'

  // "Output CGST 2.5%" etc., one row per tax and rate.
  const byRate = new Map()
  for (const l of lines.filter((x) => x.rateBp > 0)) {
    const r = byRate.get(l.rateBp) || { rateBp: l.rateBp, cgst: 0, sgst: 0, igst: 0 }
    r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst
    byRate.set(l.rateBp, r)
  }
  const taxRows = [...byRate.values()].flatMap((r) => intra
    ? [{ label: `Output CGST ${r.rateBp / 200}%`, pct: r.rateBp / 200, amount: r.cgst },
      { label: `Output SGST ${r.rateBp / 200}%`, pct: r.rateBp / 200, amount: r.sgst }]
    : [{ label: `Output IGST ${r.rateBp / 100}%`, pct: r.rateBp / 100, amount: r.igst }])

  const taxable = lines.reduce((t, l) => t + l.amount, 0)
  const tax = lines.reduce((t, l) => t + l.cgst + l.sgst + l.igst, 0)
  const discount = Number(order.discount_paise || 0)
  const total = Number(order.total_paise)
  const roundOff = total - (taxable + tax - discount)

  // HSN/SAC summary, one row per code and rate.
  const hsn = new Map()
  for (const l of lines) {
    const key = `${l.hsn || (l.bags == null ? 'Delivery' : '')}|${l.rateBp}`
    const h = hsn.get(key) || { hsn: l.hsn || (l.bags == null ? 'Delivery' : ''), rateBp: l.rateBp, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    h.taxable += l.amount; h.cgst += l.cgst; h.sgst += l.sgst; h.igst += l.igst
    hsn.set(key, h)
  }

  const live = shipments.filter((x) => x.status !== 'cancelled')
  const shipment = live[live.length - 1]
  const paid = payments.find((p) => p.status === 'paid') || payments[payments.length - 1]

  return {
    title,
    taxed,
    intra,
    seller,
    shipTo: party,
    billTo: party,
    meta: {
      invoiceNo: invoice.invoice_number,
      date: day(invoice.issued_at),
      terms: paid ? `Paid online via Razorpay${PAYMENT_METHOD[paid.method] ? ' - ' + PAYMENT_METHOD[paid.method] : ''}` : 'Paid online',
      // The Razorpay payment ID (pay_…), in place of "Other References".
      paymentId: paid?.gateway_payment_id || '',
      orderNo: order.order_number,
      orderDate: day(order.placed_at || order.created_at),
      dispatchedThrough: shipment ? [shipment.carrier_name || ({ own_vehicle: 'Own vehicle', pickup: 'Pickup' })[shipment.method] || ''].join('') : '',
      lrNo: shipment ? shipment.tracking_number || shipment.lr_number || '' : '',
      lrDate: shipment ? day(shipment.shipped_at) : '',
      destination: a.city || '',
      vehicleNo: shipment?.vehicle_number || '',
    },
    lines,
    taxRows,
    discount,
    roundOff,
    total,
    bags: lines.reduce((t, l) => t + (l.bags || 0), 0),
    kgs: lines.reduce((t, l) => t + (l.kgs || 0), 0),
    totalWords: rupeesInWords(total),
    hsnRows: [...hsn.values()],
    taxable,
    tax,
    taxWords: tax ? rupeesInWords(tax) : 'NIL',
  }
}
