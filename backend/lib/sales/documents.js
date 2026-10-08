// Printable documents, as self-contained HTML pages: open, then Ctrl+P.
//   invoiceHtml      GST tax invoice (exists once the order has shipped)
//   packingSlipHtml  for the packing table — items, quantities, no prices
import { formatInr } from './util.js'

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

const METHOD = { own_vehicle: 'Own vehicle', courier: 'Courier', transport: 'Transport', pickup: 'Pickup from mill' }

/** Shipment ID(s) and, once shipped, how and when it left. */
function shipmentBlock(order, all = []) {
  // A dispatch switched back off on the warehouse page is not a shipment.
  const shipments = all.filter((s) => s.status !== 'cancelled')
  if (!shipments.length) {
    return `<strong>${esc(order.shipment_id || '—')}</strong><br><span class="muted">To be dispatched</span>`
  }
  return shipments.map((s) => {
    const ref = s.tracking_number ? 'Tracking no. ' + s.tracking_number
      : s.lr_number ? 'LR no. ' + s.lr_number
      : s.vehicle_number ? 'Vehicle ' + s.vehicle_number : ''
    return `<strong>${esc(s.shipment_number)}</strong><br>${esc(METHOD[s.method] || 'Dispatched')}${s.carrier_name ? ' · ' + esc(s.carrier_name) : ''}` +
      (ref ? `<br>${esc(ref)}` : '') +
      `<br><span class="muted">${s.status === 'delivered' ? 'Delivered' : 'Shipped'} ${new Date(s.delivered_at || s.shipped_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>`
  }).join('<br><br>')
}

export function invoiceHtml({ order, items, invoice, shipments }, { forCustomer = false } = {}) {
  const s = invoice.seller
  const intra = invoice.igst_paise === 0
  const rows = items.map((i, n) => `
    <tr><td>${n + 1}</td><td>${esc(i.product_name)} (${Number(i.pack_kg)} kg)<br><span class="muted">${esc(i.sku)}</span></td>
      <td>${esc(i.hsn_code)}</td><td class="n">${i.quantity}</td><td class="n">${formatInr(i.unit_price_paise)}</td>
      <td class="n">${formatInr(i.taxable_paise)}</td><td class="n">${i.tax_rate_bp / 100}%</td>
      ${intra ? `<td class="n">${formatInr(i.cgst_paise)}</td><td class="n">${formatInr(i.sgst_paise)}</td>`
              : `<td class="n">${formatInr(i.igst_paise)}</td>`}
      <td class="n">${formatInr(i.line_total_paise)}</td></tr>`).join('')
  const span = intra ? 10 : 9
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(invoice.invoice_number.replaceAll('/', '-'))}</title><style>${STYLE}${forCustomer ? TOOLBAR_STYLE : ''}</style></head><body>
  ${forCustomer ? TOOLBAR : ''}
  <h1>Tax Invoice</h1>
  <div class="muted">Invoice ${esc(invoice.invoice_number)} · ${new Date(invoice.issued_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · Order ${esc(order.order_number)}</div>
  <div class="grid">
    <div><h2>Sold by</h2><strong>${esc(s.name)}</strong><br>${esc(s.address)}<br>
      GSTIN: ${esc(s.gstin || '— not yet set —')}<br>State: ${esc(s.state)} (${esc(s.stateCode)})<br>${esc(s.phone)} · ${esc(s.email)}</div>
    <div><h2>Bill / ship to</h2><strong>${esc(order.contact_name)}</strong><br>${addressLines(order.shipping_address)}<br>
      ${esc(order.contact_phone)}<br>Place of supply: ${esc(invoice.place_of_supply)}</div>
    <div><h2>Shipment</h2>${shipmentBlock(order, shipments)}</div>
  </div>
  <table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="n">Qty</th><th class="n">Rate (incl. GST)</th>
    <th class="n">Taxable value</th><th class="n">GST</th>${intra ? '<th class="n">CGST</th><th class="n">SGST</th>' : '<th class="n">IGST</th>'}
    <th class="n">Amount</th></tr></thead>
  <tbody>${rows}
    ${order.shipping_paise ? `<tr><td colspan="${span - 1}">Delivery charge</td><td class="n">${formatInr(order.shipping_paise)}</td></tr>` : ''}
    ${order.discount_paise ? `<tr><td colspan="${span - 1}">Discount</td><td class="n">−${formatInr(order.discount_paise)}</td></tr>` : ''}
    <tr class="total"><td colspan="${span - 1}">Total (taxable ${formatInr(invoice.taxable_paise)} +
      ${intra ? `CGST ${formatInr(invoice.cgst_paise)} + SGST ${formatInr(invoice.sgst_paise)}` : `IGST ${formatInr(invoice.igst_paise)}`})</td>
      <td class="n">${formatInr(invoice.total_paise)}</td></tr>
  </tbody></table>
  <p class="muted">Prices are inclusive of GST. This is a computer-generated invoice.</p>
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
