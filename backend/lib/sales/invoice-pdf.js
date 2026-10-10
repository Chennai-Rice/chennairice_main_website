// The GST tax invoice as a PDF, for the order confirmation email.
// Same figures and layout as invoiceHtml() in documents.js. Built with the
// PDF standard Helvetica, which has no ₹ glyph, so amounts read "Rs.".
import PDFDocument from 'pdfkit'

const MAROON = '#6e1420'
const MUTED = '#666666'
const LINE = '#bbbbbb'
const METHOD = { own_vehicle: 'Own vehicle', courier: 'Courier', transport: 'Transport', pickup: 'Pickup from mill' }

const amount = (paise) =>
  (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rs = (paise) => 'Rs. ' + amount(paise)
const day = (d) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })

function addressLines(a = {}) {
  return [a.line1, a.line2, a.landmark && 'Landmark: ' + a.landmark, `${a.city || ''}, ${a.state || ''} ${a.pincode || ''}`.trim()]
    .filter(Boolean)
}

// How it travels, once shipped. The shipment ID is not shown on the invoice.
function shipmentLines(all = []) {
  const shipments = all.filter((s) => s.status !== 'cancelled')
  if (!shipments.length) return ['To be dispatched']
  return shipments.flatMap((s) => {
    const ref = s.tracking_number ? 'Tracking no. ' + s.tracking_number
      : s.lr_number ? 'LR no. ' + s.lr_number
      : s.vehicle_number ? 'Vehicle ' + s.vehicle_number : null
    return [(METHOD[s.method] || 'Dispatched') + (s.carrier_name ? ' · ' + s.carrier_name : ''), ref].filter(Boolean)
  })
}

/** Resolves to the invoice PDF as a Buffer. */
export function invoicePdf({ order, items, invoice, shipments }) {
  const s = invoice.seller
  const intra = Number(invoice.igst_paise) === 0
  const doc = new PDFDocument({
    size: 'A4', margin: 40,
    info: { Title: `Invoice ${invoice.invoice_number}`, Author: s.name, Subject: `Order ${order.order_number}` },
  })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right

  // Heading
  doc.fillColor(MAROON).font('Helvetica-Bold').fontSize(18).text('Tax Invoice', left, 40)
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
    .text(`Invoice ${invoice.invoice_number}  ·  ${day(invoice.issued_at)}  ·  Order ${order.order_number}`)
  doc.moveDown(1)

  // Three blocks: seller, buyer, shipment
  const top = doc.y
  const colW = (width - 24) / 3
  const block = (x, title, bold, lines) => {
    doc.fillColor(MAROON).font('Helvetica-Bold').fontSize(10).text(title, x, top, { width: colW })
    doc.moveDown(0.3)
    doc.fillColor('#222222').font('Helvetica-Bold').fontSize(9).text(bold, { width: colW })
    doc.font('Helvetica').fontSize(8.5)
    for (const l of lines) doc.text(l, { width: colW })
    return doc.y
  }
  const bottoms = [
    block(left, 'Sold by', s.name, [s.address, `GSTIN: ${s.gstin || '— not yet set —'}`, `State: ${s.state} (${s.stateCode})`, [s.phone, s.email].filter(Boolean).join(' · ')]),
    block(left + colW + 12, 'Bill / ship to', order.contact_name, [...addressLines(order.shipping_address), order.contact_phone, `Place of supply: ${invoice.place_of_supply}`]),
    block(left + (colW + 12) * 2, 'Delivery', '', shipmentLines(shipments)),
  ]
  let y = Math.max(...bottoms) + 16

  // Items table
  const cols = intra
    ? [['#', 18], ['Item', 0], ['HSN', 42], ['Qty', 26], ['Rate', 56], ['Taxable', 56], ['GST', 28], ['CGST', 48], ['SGST', 48], ['Amount', 60]]
    : [['#', 18], ['Item', 0], ['HSN', 42], ['Qty', 26], ['Rate', 56], ['Taxable', 56], ['GST', 28], ['IGST', 56], ['Amount', 60]]
  const fixed = cols.reduce((t, [, w]) => t + w, 0)
  cols[1][1] = width - fixed
  const xs = []
  cols.reduce((x, [, w]) => { xs.push(x); return x + w }, left)
  const numeric = (i) => i >= 3

  const drawRow = (cells, { head = false, fill = null } = {}) => {
    doc.font(head ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
    const h = Math.max(...cells.map((c, i) => doc.heightOfString(String(c ?? ''), { width: cols[i][1] - 8 }))) + 8
    if (y + h > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage()
      y = doc.page.margins.top
    }
    if (fill) doc.rect(left, y, width, h).fill(fill)
    doc.fillColor('#222222')
    cells.forEach((c, i) => {
      doc.text(String(c ?? ''), xs[i] + 4, y + 4, { width: cols[i][1] - 8, align: numeric(i) ? 'right' : 'left' })
    })
    doc.lineWidth(0.5).strokeColor(LINE).rect(left, y, width, h).stroke()
    xs.slice(1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + h).stroke())
    y += h
  }
  const drawWide = (label, value, { bold = false } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
    const lastX = xs[xs.length - 1]
    const h = doc.heightOfString(label, { width: lastX - left - 8 }) + 8
    doc.fillColor('#222222').text(label, left + 4, y + 4, { width: lastX - left - 8 })
    doc.text(value, lastX + 4, y + 4, { width: cols[cols.length - 1][1] - 8, align: 'right' })
    doc.lineWidth(0.5).strokeColor(LINE).rect(left, y, width, h).stroke()
    doc.moveTo(lastX, y).lineTo(lastX, y + h).stroke()
    y += h
  }

  drawRow(cols.map(([label]) => label), { head: true, fill: '#f3eee2' })
  items.forEach((i, n) => {
    drawRow([
      n + 1, `${i.product_name} (${Number(i.pack_kg)} kg)\n${i.sku || ''}`.trim(), i.hsn_code, i.quantity,
      amount(i.unit_price_paise), amount(i.taxable_paise), `${i.tax_rate_bp / 100}%`,
      ...(intra ? [amount(i.cgst_paise), amount(i.sgst_paise)] : [amount(i.igst_paise)]),
      amount(i.line_total_paise),
    ])
  })
  if (Number(order.shipping_paise)) drawWide('Delivery charge', amount(order.shipping_paise))
  if (Number(order.discount_paise)) drawWide('Discount', '-' + amount(order.discount_paise))
  drawWide(
    `Total (taxable ${rs(invoice.taxable_paise)} + ` +
      (intra ? `CGST ${rs(invoice.cgst_paise)} + SGST ${rs(invoice.sgst_paise)})` : `IGST ${rs(invoice.igst_paise)})`),
    rs(invoice.total_paise), { bold: true })

  doc.fillColor(MUTED).font('Helvetica').fontSize(8)
    .text('Amounts in Indian Rupees. Rate is per pack, inclusive of GST. This is a computer-generated invoice.', left, y + 10, { width })
  doc.end()
  return done
}
