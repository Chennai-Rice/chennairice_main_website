// Printable documents, as self-contained HTML pages: open, then Ctrl+P.
//   invoiceHtml      tax invoice / bill of supply (exists once the order has shipped)
//   packingSlipHtml  for the packing table — items, quantities, no prices
import { formatInr } from './util.js'
import { invoiceModel } from './invoice-model.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Shown on the customer's copy only. "Save as PDF" in the print dialog is the
// download: the PDF takes its file name from the <title>, e.g.
// "Invoice CRI-2026-27-000001.pdf", and needs no PDF library on the server.
const TOOLBAR_STYLE = `
  .toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;margin:-32px -32px 24px;background:#6e1b22;color:#fff}
  .toolbar button{font:inherit;font-weight:bold;padding:8px 18px;border:0;border-radius:999px;background:#f3e6c4;color:#4a1016;cursor:pointer}
  @media print{.toolbar{display:none}}`
const TOOLBAR = `<div class="toolbar"><span>Choose <strong>Save as PDF</strong> in the print window to download.</span>
  <button type="button" onclick="window.print()">Download PDF</button></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 300) })</script>`

const STYLE = `
  body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:32px;font-size:13px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}
  th{background:#f3eee2} td.n,th.n{text-align:right} .grid{display:flex;gap:32px} .grid>div{flex:1}
  .muted{color:#666} .total td{font-weight:bold} @media print{body{margin:12mm}}`

function addressLines(a) {
  return [a.line1, a.line2, a.landmark && 'Landmark: ' + a.landmark, `${a.city}, ${a.state} ${a.pincode}`]
    .filter(Boolean).map(esc).join('<br>')
}

// Laid out after the company's own invoices (see invoice-model.js).
const INVOICE_STYLE = `
  body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:24px auto;max-width:820px;font-size:11.5px}
  .doc-title{text-align:center;font-weight:bold;font-size:15px;margin:0 0 4px}
  table.inv{width:100%;border-collapse:collapse}
  table.inv td,table.inv th{border:1px solid #000;padding:3px 5px;vertical-align:top;text-align:left}
  .box{border:1px solid #000}
  .head{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #000}
  .left>div{padding:4px 6px;border-bottom:1px solid #000;border-right:1px solid #000}
  .left>div:last-child{border-bottom:0}
  .meta{display:grid;grid-template-columns:1fr 1fr;align-content:start}
  .meta>div{border-right:1px solid #000;border-bottom:1px solid #000;padding:3px 6px;min-height:26px}
  .meta>div:nth-child(2n){border-right:0}
  .lbl{font-size:10px;color:#222} .b{font-weight:bold}
  .n{text-align:right!important} .c{text-align:center!important}
  .items td{border-top:0;border-bottom:0} .items tr.last td{border-bottom:1px solid #000}
  .items thead th{font-weight:normal;text-align:center}
  .tot td{border-top:1px solid #000!important;font-weight:bold}
  .it{font-style:italic} .small{font-size:10px}
  .foot{display:grid;grid-template-columns:1fr 1fr}
  .foot>div{border:1px solid #000;margin:-1px -1px 0 0;padding:4px 6px}
  .sign{display:flex;justify-content:space-between;margin-top:26px}
  .center{text-align:center;margin-top:6px}
  @media print{body{margin:8mm auto}}`

const money = (paise) =>
  (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function invoiceHtml(detail, { forCustomer = false } = {}) {
  const m = invoiceModel(detail)
  const s = m.seller
  const party = (title, p) => `<div><span class="lbl">${title}</span><br><span class="b">${esc(p.name)}</span><br>
    ${p.lines.map(esc).join(',<br>')}<br>
    State Name &nbsp;: ${esc(p.state)}${p.stateCode ? ', Code : ' + esc(p.stateCode) : ''}<br>
    Contact &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${esc(p.phone)}</div>`
  const metaCell = (label, value) => `<div><span class="lbl">${label}</span><br><span class="b">${esc(value || '')}</span></div>`
  const taxCols = m.taxed

  const itemRows = m.lines.map((l) => `<tr>
      <td class="c">${l.sl}</td>
      <td><span class="b">${esc(l.description)}</span></td>
      <td>${esc(l.hsn || '')}</td>
      <td class="n">${l.bags != null ? `<span class="b">${l.bags}.0 Bags</span><br><span class="it small">(${l.kgs.toFixed(3)} Kgs)</span>` : ''}</td>
      <td class="n">${l.rate != null ? money(l.rate) : ''}</td>
      <td>${l.bags != null ? 'Bags' : ''}</td>
      <td></td>
      <td class="n b">${money(l.amount)}</td></tr>`).join('')
  const subtotal = m.taxRows.length || m.discount ? `<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
      <td class="n" style="border-top:1px solid #000">${money(m.taxable)}</td></tr>` : ''
  const taxRows = m.taxRows.map((t) => `<tr><td></td><td class="n it b">${esc(t.label)}</td><td></td><td></td>
      <td class="n it">${t.pct.toFixed(2)}</td><td class="it">%</td><td></td><td class="n b">${money(t.amount)}</td></tr>`).join('')
  const discountRow = m.discount ? `<tr><td></td><td class="n it b">Less : Discount</td><td></td><td></td><td></td><td></td><td></td>
      <td class="n b">(-)${money(m.discount)}</td></tr>` : ''
  const roundRow = m.roundOff ? `<tr><td></td><td class="n it b">Rounded Off</td><td></td><td></td><td></td><td></td><td></td>
      <td class="n b">${money(m.roundOff)}</td></tr>` : ''

  const hsnHead = !taxCols
    ? '<tr><th>HSN/SAC</th><th class="n">Taxable Value</th></tr>'
    : m.intra
      ? `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2" class="n">Taxable Value</th><th colspan="2" class="c">CGST</th>
         <th colspan="2" class="c">SGST/UTGST</th><th rowspan="2" class="n">Total Tax Amount</th></tr>
         <tr><th>Rate</th><th class="n">Amount</th><th>Rate</th><th class="n">Amount</th></tr>`
      : `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2" class="n">Taxable Value</th><th colspan="2" class="c">IGST</th>
         <th rowspan="2" class="n">Total Tax Amount</th></tr><tr><th>Rate</th><th class="n">Amount</th></tr>`
  const hsnRow = (h) => !taxCols
    ? `<tr><td>${esc(h.hsn)}</td><td class="n">${money(h.taxable)}</td></tr>`
    : m.intra
      ? `<tr><td>${esc(h.hsn)}</td><td class="n">${money(h.taxable)}</td><td>${(h.rateBp / 200).toFixed(2)}%</td><td class="n">${money(h.cgst)}</td>
         <td>${(h.rateBp / 200).toFixed(2)}%</td><td class="n">${money(h.sgst)}</td><td class="n">${money(h.cgst + h.sgst)}</td></tr>`
      : `<tr><td>${esc(h.hsn)}</td><td class="n">${money(h.taxable)}</td><td>${(h.rateBp / 100).toFixed(2)}%</td>
         <td class="n">${money(h.igst)}</td><td class="n">${money(h.igst)}</td></tr>`
  const sum = (k) => m.hsnRows.reduce((t, h) => t + h[k], 0)
  const hsnTotal = !taxCols
    ? `<tr class="b"><td class="n">Total</td><td class="n">${money(m.taxable)}</td></tr>`
    : m.intra
      ? `<tr class="b"><td class="n">Total</td><td class="n">${money(m.taxable)}</td><td></td><td class="n">${money(sum('cgst'))}</td>
         <td></td><td class="n">${money(sum('sgst'))}</td><td class="n">${money(m.tax)}</td></tr>`
      : `<tr class="b"><td class="n">Total</td><td class="n">${money(m.taxable)}</td><td></td><td class="n">${money(sum('igst'))}</td>
         <td class="n">${money(m.tax)}</td></tr>`

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${esc(m.meta.invoiceNo.replaceAll('/', '-'))}</title><style>${INVOICE_STYLE}${forCustomer ? TOOLBAR_STYLE : ''}</style></head><body>
  ${forCustomer ? TOOLBAR : ''}
  <p class="doc-title">${esc(m.title)}</p>
  <div class="box">
    <div class="head">
      <div class="left"><div>
        <span class="b">${esc(s.name)}</span><br>
        ${s.formerName ? `Formerly : ${esc(s.formerName)}<br>` : ''}${esc(s.address)}<br>
        ${s.fssai ? `FSSAI No. ${esc(s.fssai)}<br>` : ''}GSTIN/UIN: ${esc(s.gstin || '')}<br>
        State Name : ${esc(s.state)}, Code : ${esc(s.stateCode)}<br>
        Contact : ${esc(s.phone)}<br>E-Mail : ${esc(s.email)}
      </div>${party('Consignee (Ship to)', m.shipTo)}${party('Buyer (Bill to)', m.billTo)}</div>
      <div class="meta">
        ${metaCell('Invoice No.', m.meta.invoiceNo)}${metaCell('Dated', m.meta.date)}
        ${metaCell('Delivery Note', '')}${metaCell('Mode/Terms of Payment', m.meta.terms)}
        ${metaCell('Reference No. &amp; Date.', `${m.meta.invoiceNo} dt. ${m.meta.date}`)}${metaCell('Razorpay Payment ID', m.meta.paymentId)}
        ${metaCell('Buyer’s Order No.', m.meta.orderNo)}${metaCell('Dated', m.meta.orderDate)}
        ${metaCell('Dispatch Doc No.', '')}${metaCell('Delivery Note Date', '')}
        ${metaCell('Dispatched through', m.meta.dispatchedThrough)}${metaCell('Destination', m.meta.destination)}
        ${metaCell('Bill of Lading/LR-RR No.', m.meta.lrNo ? `${m.meta.lrNo}${m.meta.lrDate ? ' dt. ' + m.meta.lrDate : ''}` : '')}${metaCell('Motor Vehicle No.', m.meta.vehicleNo)}
        <div style="grid-column:span 2;border-right:0;border-bottom:0"><span class="lbl">Terms of Delivery</span></div>
      </div>
    </div>
    <table class="inv items">
      <thead><tr><th style="width:24px">Sl<br>No.</th><th>Description of Goods</th><th style="width:70px">HSN/SAC</th>
        <th style="width:80px">Quantity</th><th style="width:70px">Rate</th><th style="width:34px">per</th><th style="width:40px">Disc. %</th>
        <th style="width:90px">Amount</th></tr></thead>
      <tbody>${itemRows}${subtotal}${taxRows}${discountRow}${roundRow}
        <tr class="last"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="tot"><td></td><td class="n">Total</td><td></td><td class="n">${m.bags}.0 Bags</td><td></td><td></td><td></td>
          <td class="n">₹ ${money(m.total)}</td></tr></tbody>
    </table>
    <div style="padding:4px 6px;border-top:1px solid #000"><span class="lbl">Amount Chargeable (in words)</span>
      <span style="float:right" class="it">E. &amp; O.E</span><br><span class="b">${esc(m.totalWords)}</span></div>
    <table class="inv">${hsnHead}${m.hsnRows.map(hsnRow).join('')}${hsnTotal}</table>
    <div style="padding:4px 6px">Tax Amount (in words) : <span class="b">${esc(m.taxWords)}</span></div>
    <div class="foot">
      <div style="border-left:0;border-bottom:0"><span style="text-decoration:underline">Declaration</span><br>
        We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
      <div style="border-right:0;border-bottom:0;display:flex;align-items:flex-end">
        <div class="sign" style="flex:1"><span>Prepared by</span><span>Verified by</span><span>Authorised Signatory</span></div></div>
    </div>
  </div>
  <p class="center">This is a Computer Generated Invoice</p>
  </body></html>`
}

export function packingSlipHtml({ order, items }) {
  const rows = items.map((i) => `<tr><td>${esc(i.product_name)}</td><td>${esc(i.sku)}</td><td class="n">${Number(i.pack_kg)} kg</td>
    <td class="n">${i.quantity}</td><td>☐</td></tr>`).join('')
  const totalKg = items.reduce((t, i) => t + Number(i.pack_kg) * i.quantity, 0)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${esc(order.order_number)}</title><style>${STYLE}</style></head><body>
  <h1>Packing slip · ${esc(order.order_number)}</h1>
  <div class="grid"><div><h2>Ship to</h2><strong>${esc(order.contact_name)}</strong><br>${addressLines(order.shipping_address)}<br>${esc(order.contact_phone)}</div>
  <div><h2>Order</h2>Order ID: <strong>${esc(order.order_number)}</strong><br>
    Shipment ID: <strong>${esc(order.shipment_id || '—')}</strong><br>
    Placed: ${order.placed_at ? new Date(order.placed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}<br>
    Total weight: ${totalKg} kg<br>Packs: ${items.reduce((t, i) => t + i.quantity, 0)}</div></div>
  <table><thead><tr><th>Item</th><th>SKU</th><th class="n">Pack</th><th class="n">Qty</th><th>Packed</th></tr></thead><tbody>${rows}</tbody></table>
  <p>Packed by: ____________________ &nbsp; Checked by: ____________________ &nbsp; Batch no(s): ____________________</p>
  </body></html>`
}
