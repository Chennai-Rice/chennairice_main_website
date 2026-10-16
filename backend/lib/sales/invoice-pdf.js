// The invoice as a PDF, for the order confirmation email. Same figures and
// layout as invoiceHtml() in documents.js, both from invoiceModel(): laid out
// after the company's own Tax Invoice / Bill of Supply. Built with the PDF
// standard Helvetica, which has no ₹ glyph, so the total reads "Rs.".
import PDFDocument from 'pdfkit'
import { invoiceModel } from './invoice-model.js'

const money = (paise) =>
  (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Resolves to the invoice PDF as a Buffer. */
export function invoicePdf(detail) {
  const m = invoiceModel(detail)
  const s = m.seller
  const doc = new PDFDocument({
    size: 'A4', margin: 28,
    info: { Title: `Invoice ${m.meta.invoiceNo}`, Author: s.name, Subject: `Order ${m.meta.orderNo}` },
  })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const L = doc.page.margins.left
  const W = doc.page.width - L - doc.page.margins.right
  const half = W / 2
  doc.lineWidth(0.6).strokeColor('#000').fillColor('#000')

  const font = (bold, size, italic = false) =>
    doc.font(bold ? (italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : italic ? 'Helvetica-Oblique' : 'Helvetica').fontSize(size)
  const box = (x, y, w, h) => doc.rect(x, y, w, h).stroke()
  const hline = (x1, x2, y) => doc.moveTo(x1, y).lineTo(x2, y).stroke()
  const vline = (x, y1, y2) => doc.moveTo(x, y1).lineTo(x, y2).stroke()

  // Title
  font(true, 11).text(m.title, L, 24, { width: W, align: 'center' })
  const top = 40

  // --- Header: seller / consignee / buyer on the left, details on the right
  const pad = 4
  const lw = half - pad * 2
  const block = (y, parts) => {
    let yy = y + pad
    for (const [text, bold, size = 7.5] of parts) {
      font(bold, size).text(text, L + pad, yy, { width: lw })
      yy = doc.y
    }
    return yy + pad
  }
  const partyParts = (title, p) => [
    [title, false, 7], [p.name, true, 8], ...p.lines.map((l) => [l]),
    [`State Name : ${p.state || ''}${p.stateCode ? ', Code : ' + p.stateCode : ''}`], [`Contact : ${p.phone || ''}`],
  ]
  let y = block(top, [
    [s.name, true, 9],
    ...(s.formerName ? [[`Formerly : ${s.formerName}`]] : []),
    [s.address],
    ...(s.fssai ? [[`FSSAI No. ${s.fssai}`]] : []),
    [`GSTIN/UIN: ${s.gstin || ''}`],
    [`State Name : ${s.state}, Code : ${s.stateCode}`],
    [`Contact : ${s.phone}`],
    [`E-Mail : ${s.email}`],
  ])
  const sep1 = y
  y = block(y, partyParts('Consignee (Ship to)', m.shipTo))
  const sep2 = y
  y = block(y, partyParts('Buyer (Bill to)', m.billTo))
  const metaRows = [
    ['Invoice No.', m.meta.invoiceNo, 'Dated', m.meta.date],
    ['Delivery Note', '', 'Mode/Terms of Payment', m.meta.terms],
    ['Reference No. & Date.', `${m.meta.invoiceNo} dt. ${m.meta.date}`, 'Razorpay Payment ID', m.meta.paymentId],
    ['Buyer’s Order No.', m.meta.orderNo, 'Dated', m.meta.orderDate],
    ['Dispatch Doc No.', '', 'Delivery Note Date', ''],
    ['Dispatched through', m.meta.dispatchedThrough, 'Destination', m.meta.destination],
    ['Bill of Lading/LR-RR No.', m.meta.lrNo ? `${m.meta.lrNo}${m.meta.lrDate ? ' dt. ' + m.meta.lrDate : ''}` : '', 'Motor Vehicle No.', m.meta.vehicleNo],
  ]
  const rowH = 24
  const headBottom = Math.max(y, top + rowH * metaRows.length + 30)
  box(L, top, W, headBottom - top)
  vline(L + half, top, headBottom)
  hline(L, L + half, sep1)
  hline(L, L + half, sep2)
  const mx = L + half
  const cw = half / 2
  metaRows.forEach((r, i) => {
    const ry = top + i * rowH
    hline(mx, L + W, ry + rowH)
    vline(mx + cw, ry, ry + rowH)
    for (const [k, cx] of [[0, mx], [2, mx + cw]]) {
      font(false, 6.5).text(r[k], cx + pad, ry + 3, { width: cw - pad * 2, lineBreak: false })
      font(true, 7.5).text(r[k + 1] || '', cx + pad, ry + 12, { width: cw - pad * 2, height: 10, ellipsis: true })
    }
  })
  font(false, 6.5).text('Terms of Delivery', mx + pad, top + rowH * metaRows.length + 3)

  // --- Items
  const cols = [['Sl\nNo.', 22], ['Description of Goods', 0], ['HSN/SAC', 52], ['Quantity', 66], ['Rate', 56], ['per', 28], ['Disc. %', 32], ['Amount', 70]]
  cols[1][1] = W - cols.reduce((t, [, w]) => t + w, 0)
  const xs = []
  cols.reduce((x, [, w]) => { xs.push(x); return x + w }, L)
  y = headBottom
  const tableTop = y
  const headH = 18
  cols.forEach(([label, w], i) => font(false, 7).text(label, xs[i] + 2, y + 3, { width: w - 4, align: 'center' }))
  hline(L, L + W, y + headH)
  y += headH + 3
  const cell = (i, text, { bold = false, italic = false, size = 7.5, align = 'right' } = {}) => {
    font(bold, size, italic).text(text, xs[i] + 3, y, { width: cols[i][1] - 6, align })
  }
  for (const l of m.lines) {
    const rowTop = y
    cell(0, String(l.sl), { align: 'center' })
    font(true, 7.5).text(l.description, xs[1] + 3, rowTop, { width: cols[1][1] - 6 })
    let rowBottom = doc.y
    y = rowTop
    cell(2, l.hsn || '', { align: 'left' })
    if (l.bags != null) {
      cell(3, `${l.bags}.0 Bags`, { bold: true })
      y = rowTop + 10
      cell(3, `(${l.kgs.toFixed(3)} Kgs)`, { italic: true, size: 6.5 })
      rowBottom = Math.max(rowBottom, rowTop + 19)
      y = rowTop
      cell(4, money(l.rate))
      cell(5, 'Bags', { align: 'left' })
    }
    cell(7, money(l.amount), { bold: true })
    y = rowBottom + 5
  }
  if (m.taxRows.length || m.discount) {
    hline(xs[7], L + W, y - 2)
    cell(7, money(m.taxable))
    y += 12
  }
  const sideRow = (label, pct, amount) => {
    cell(1, label, { bold: true, italic: true })
    if (pct != null) { cell(4, pct.toFixed(2), { italic: true }); cell(5, '%', { italic: true, align: 'left' }) }
    cell(7, amount, { bold: true })
    y += 11
  }
  for (const t of m.taxRows) sideRow(t.label, t.pct, money(t.amount))
  if (m.discount) sideRow('Less : Discount', null, '(-)' + money(m.discount))
  if (m.roundOff) sideRow('Rounded Off', null, money(m.roundOff))
  y = Math.max(y + 6, tableTop + 230)
  const totalTop = y
  hline(L, L + W, totalTop)
  y += 4
  cell(1, 'Total', { bold: false })
  cell(3, `${m.bags}.0 Bags`, { bold: true })
  cell(7, `Rs. ${money(m.total)}`, { bold: true, size: 8.5 })
  const itemsBottom = totalTop + 16
  box(L, tableTop, W, itemsBottom - tableTop)
  xs.slice(1).forEach((x) => vline(x, tableTop, itemsBottom))

  // --- Amount in words
  y = itemsBottom
  font(false, 6.5).text('Amount Chargeable (in words)', L + pad, y + 3)
  font(false, 7, true).text('E. & O.E', L, y + 3, { width: W - pad, align: 'right' })
  font(true, 8).text(m.totalWords, L + pad, y + 12, { width: W - pad * 2 })
  y = doc.y + 4
  box(L, itemsBottom, W, y - itemsBottom)

  // --- HSN summary
  const hcols = !m.taxed
    ? [['HSN/SAC', 0], ['Taxable Value', 110]]
    : m.intra
      ? [['HSN/SAC', 0], ['Taxable Value', 80], ['CGST Rate', 46], ['CGST Amount', 66], ['SGST Rate', 46], ['SGST Amount', 66], ['Total Tax Amount', 76]]
      : [['HSN/SAC', 0], ['Taxable Value', 90], ['IGST Rate', 56], ['IGST Amount', 80], ['Total Tax Amount', 90]]
  hcols[0][1] = W - hcols.reduce((t, [, w]) => t + w, 0)
  const hx = []
  hcols.reduce((x, [, w]) => { hx.push(x); return x + w }, L)
  const hTop = y
  const hrow = (cells, { bold = false } = {}) => {
    const ry = y
    cells.forEach((c, i) => font(bold, 7).text(c, hx[i] + 3, ry + 3, { width: hcols[i][1] - 6, align: i === 0 ? 'left' : 'right' }))
    y = ry + 13
    hline(L, L + W, y)
  }
  hrow(hcols.map(([h]) => h))
  const pct = (bp, div) => `${(bp / div).toFixed(2)}%`
  for (const h of m.hsnRows) {
    hrow(!m.taxed ? [h.hsn, money(h.taxable)]
      : m.intra ? [h.hsn, money(h.taxable), pct(h.rateBp, 200), money(h.cgst), pct(h.rateBp, 200), money(h.sgst), money(h.cgst + h.sgst)]
        : [h.hsn, money(h.taxable), pct(h.rateBp, 100), money(h.igst), money(h.igst)])
  }
  const sum = (k) => m.hsnRows.reduce((t, h) => t + h[k], 0)
  hrow(!m.taxed ? ['Total', money(sum('taxable'))]
    : m.intra ? ['Total', money(sum('taxable')), '', money(sum('cgst')), '', money(sum('sgst')), money(m.tax)]
      : ['Total', money(sum('taxable')), '', money(sum('igst')), money(m.tax)], { bold: true })
  box(L, hTop, W, y - hTop)
  hx.slice(1).forEach((x) => vline(x, hTop, y))

  // --- Tax in words, declaration, signatures
  const fTop = y
  font(false, 7.5).text('Tax Amount (in words) :  ', L + pad, y + 4, { continued: true })
  font(true, 7.5).text(m.taxWords)
  y = doc.y + 6
  font(false, 7).text('Declaration', L + pad, y + 40, { underline: true })
  font(false, 7).text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    L + pad, doc.y, { width: half - pad * 2 })
  const signY = Math.max(doc.y, y + 52)
  font(false, 7)
  doc.text('Prepared by', L + half + pad, signY)
  doc.text('Verified by', L + half + half / 3, signY, { width: half / 3, align: 'center' })
  doc.text('Authorised Signatory', L + half, signY, { width: half - pad, align: 'right' })
  const fBottom = signY + 12
  box(L, fTop, W, fBottom - fTop)
  vline(L + half, y - 2, fBottom)
  font(false, 7).text('This is a Computer Generated Invoice', L, fBottom + 8, { width: W, align: 'center' })

  doc.end()
  return done
}
