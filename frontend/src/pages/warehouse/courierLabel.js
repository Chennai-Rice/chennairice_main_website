import JsBarcode from 'jsbarcode'
import qrcode from 'qrcode-generator'
import { staffJson } from '../../services/staffAuth.js'

// The courier label stuck on each bag: 4 × 6 inch, black only, for a 4-inch
// thermal printer (TSC, Zebra, TVS…). Laid out after the Chennai Rice label
// design (Oct 2026): logo, PREPAID, ship-to with a large PIN code, the
// courier's tracking number and the order number as Code 128 barcodes (so the
// courier's and our scanners read them), handling marks, and the return
// address with a QR code to the order's tracking page.

const SITE = 'https://chennairiceindustries.com'
const RETURN_TO = [
  'Chennai Rice Industries India Pvt. Ltd.',
  'SF No. 116/1,2,4-B, N. Thayirpalayam Village,',
  'Nasiyanur, Gangapuram Post, Erode, Tamil Nadu – 638102',
  'Ph: 70666 46667 · FSSAI 12415007000253',
]
const METHOD = { own_vehicle: 'Own vehicle', courier: 'Courier', transport: 'Transport', pickup: 'Customer pickup' }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** A Code 128 barcode as an <svg> string (scannable at 203 dpi). */
function barcode(value, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, value, { format: 'CODE128', width: 2, height, margin: 0, displayValue: false })
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('class', 'bc')
  return svg.outerHTML
}

function qr(text) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true })
}

const ICONS = {
  dry: '<svg viewBox="0 0 48 48" class="ic"><path d="M24 8C13 8 5 16 4 26h40C43 16 35 8 24 8z"/><path d="M24 26v12a4 4 0 0 1-8 0" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/><path d="M12 4l-2 4M24 1v4M36 4l2 4" stroke="#000" stroke-width="3" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 48 48" class="ic"><path d="M10 40h28" stroke="#000" stroke-width="4"/><path d="M17 34V14h-6l9-10 9 10h-6v20zM31 34V14h-6l9-10 9 10h-6v20z" transform="translate(-3 0)"/></svg>',
  hooks: '<svg viewBox="0 0 48 48" class="ic"><path d="M24 4v18a8 8 0 1 1-8 8" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/><path d="M6 6l36 36" stroke="#000" stroke-width="4" stroke-linecap="round"/></svg>',
}

function labelHtml(d) {
  const a = d.address || {}
  // Customers type commas and spaces loosely (",virugambakkam(near …"): tidy them.
  const tidy = (t) => String(t || '').replace(/\s*,\s*/g, ', ').replace(/\s*\(\s*/g, ' (').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '')
  const street = tidy([a.line1, a.line2].filter(Boolean).join(', ') + (a.landmark ? ` (near ${a.landmark.replace(/^near\s+/i, '')})` : ''))
  const place = [a.city, a.state].filter(Boolean).join(', ')
  const s = d.shipment || {}
  const carrier = s.carrier || METHOD[s.method] || ''
  const awb = s.trackingNumber || s.lrNumber || ''
  const packs = d.items.reduce((n, i) => n + i.qty, 0)
  const kg = d.items.reduce((n, i) => n + i.packKg * i.qty, 0)
  const contents = d.items.map((i) => `${i.qty} × ${i.name} ${i.packKg} kg`).join(', ')
  const paid = ['paid', 'partially_refunded'].includes(d.paymentStatus)
  const date = new Date(d.placedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const track = `${SITE}/track-order?order=${encodeURIComponent(d.orderNumber)}`

  return `<section class="label">
    <header class="hd">
      <img class="logo" src="${window.location.origin}/assets/label-logo.png" alt="">
      <div class="brand"><b>CHENNAI<br>RICE</b><span>INDUSTRIES INDIA (P) LTD</span></div>
    </header>
    <div class="row pay"><span class="tag">${paid ? 'PREPAID' : 'PAYMENT PENDING'}</span><span class="date">${esc(date)}</span></div>
    <div class="row ship">
      <div class="to">
        <small>SHIP TO</small>
        <strong class="name">${esc(d.name)}</strong>
        <p>${esc(street)}<br>${esc(place)}${a.pincode ? ' – ' + esc(a.pincode) : ''}</p>
        <p class="ph">Ph: ${esc(d.phone)}</p>
      </div>
      <div class="pin"><small>PIN CODE</small><b>${esc(a.pincode || '')}</b></div>
    </div>
    ${carrier || awb ? `<div class="row awb">
      ${carrier ? `<div class="k">COURIER: <b>${esc(carrier)}</b></div>` : ''}
      ${awb ? `${barcode(awb, 46)}<div class="num">${esc(awb)}</div>` : ''}
    </div>` : ''}
    <div class="row ord">
      <div class="k">ORDER NO: <b>${esc(d.orderNumber)}</b></div>
      ${barcode(d.orderNumber, 30)}
      <div class="contents">${esc(contents)}<br>Weight: ${kg} kg · Packs: ${packs}</div>
    </div>
    <div class="row marks">
      <div>${ICONS.dry}<span>KEEP DRY</span></div>
      <div>${ICONS.up}<span>THIS SIDE UP</span></div>
      <div>${ICONS.hooks}<span>USE NO HOOKS</span></div>
    </div>
    <footer class="from">
      <div><small>FROM / RETURN TO</small>${RETURN_TO.map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : `<span>${esc(l)}</span>`)).join('')}</div>
      <div class="qr">${qr(track)}<span>Track order</span></div>
    </footer>
  </section>`
}

const STYLE = `
@page { size: 4in 6in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.label { width: 4in; height: 6in; padding: 0.08in 0.12in; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
.label:last-child { page-break-after: auto; break-after: auto; }
.row { border-top: 1.5px solid #000; padding: 3px 0; }
small { display: block; font-size: 8pt; font-weight: 700; letter-spacing: .04em; }
.hd { display: flex; align-items: center; gap: 10px; padding-bottom: 3px; }
/* The colour roundel as pure black and white (thermal printers print no grey). */
.logo { width: 0.86in; height: auto; filter: url(#mono); }
.brand { border-left: 1.5px solid #000; padding-left: 10px; }
.brand b { display: block; font-size: 18pt; line-height: .95; letter-spacing: .02em; }
.brand span { display: block; font-size: 7pt; font-weight: 700; margin-top: 3px; letter-spacing: .06em; }
.pay { display: flex; justify-content: space-between; align-items: center; }
.tag { background: #000; color: #fff; font-weight: 800; font-size: 14pt; padding: 1px 12px; letter-spacing: .04em; }
.date { font-size: 9pt; font-weight: 700; }
.ship { display: flex; gap: 8px; align-items: flex-start; }
.to { flex: 1; min-width: 0; }
.name { display: block; font-size: 14pt; line-height: 1.1; margin: 1px 0 2px; word-break: break-word; }
.to p { margin: 0; font-size: 9pt; line-height: 1.2; word-break: break-word; }
.to .ph { margin-top: 2px; font-weight: 700; font-size: 10pt; }
.pin { border: 2px solid #000; padding: 3px 6px; text-align: center; flex: 0 0 auto; }
.pin b { display: block; font-size: 21pt; line-height: 1; letter-spacing: .02em; }
.k { font-size: 9pt; font-weight: 700; margin-bottom: 3px; }
.k b { font-size: 11pt; }
.bc { display: block; width: 100%; height: 0.42in; }
.ord .bc { height: 0.28in; width: 80%; }
.num { text-align: center; font-size: 10pt; font-weight: 700; letter-spacing: .08em; margin-top: 2px; }
.blank { font-size: 10pt; padding: 12px 0 8px; }
.contents { font-size: 8.5pt; line-height: 1.25; margin-top: 3px; }
/* Handling marks: small, icon beside its words, each centred in its third. */
.marks { display: flex; align-items: center; }
.marks > div { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; border-left: 1px solid #000; padding: 1px 0; }
.marks > div:first-child { border-left: 0; }
.ic { width: 0.18in; height: 0.18in; fill: #000; flex: 0 0 auto; }
.marks span { font-size: 6.5pt; font-weight: 800; white-space: nowrap; }
.from { border-top: 1.5px solid #000; padding-top: 4px; display: flex; gap: 8px; align-items: center; }
/* Spare height is shared evenly between the sections (no empty band above
   the return address); each section's content sits in the middle of its band. */
.label > .row, .label > .from { flex: 1 1 auto; }
.ship, .marks { align-items: center; }
.awb, .ord { display: flex; flex-direction: column; justify-content: center; }
.ord .bc { align-self: flex-start; }
.from > div:first-child { flex: 1; min-width: 0; }
.from b { display: block; font-size: 8.5pt; }
.from span { display: block; font-size: 7pt; line-height: 1.25; }
.qr { flex: 0 0 auto; text-align: center; }
.qr svg { width: 0.72in; height: 0.72in; display: block; }
.qr span { font-size: 6.5pt; font-weight: 700; }
/* A long address or many items: shrink in two steps until the label fits (FIT below). */
.tight .hd .logo { width: 0.6in; height: auto; }
.tight .brand b { font-size: 15pt; }
.tight .name { font-size: 12pt; }
.tight .to p, .tight .contents { font-size: 8pt; line-height: 1.15; }
.tight .pin b { font-size: 18pt; }
.tight .bc { height: 0.34in; }
.tight .ord .bc { height: 0.22in; }
.tight .ic { width: 0.2in; height: 0.2in; }
.tighter .from span { font-size: 6.5pt; line-height: 1.15; }
.tighter .qr svg { width: 0.56in; height: 0.56in; }
.tighter .bc { height: 0.28in; }
.tighter .marks span { font-size: 6pt; }
@media screen { body { background: #ddd; } .label { background: #fff; margin: 12px auto; box-shadow: 0 1px 6px rgba(0,0,0,.3); } }
`

const FIT = `<script>
  for (const l of document.querySelectorAll('.label')) {
    for (const step of ['tight', 'tighter']) {
      if (l.scrollHeight <= l.clientHeight + 1) break
      l.classList.add(step)
    }
  }
</script>`

// Luminance, then a hard threshold: dark maroon and the gold rice ears print
// black, white stays white.
const MONO = `<svg width="0" height="0" style="position:absolute"><filter id="mono" color-interpolation-filters="sRGB">
  <feColorMatrix type="saturate" values="0"/>
  <feComponentTransfer><feFuncR type="discrete" tableValues="0 0 0 0 1"/><feFuncG type="discrete" tableValues="0 0 0 0 1"/><feFuncB type="discrete" tableValues="0 0 0 0 1"/></feComponentTransfer>
</filter></svg>`

/** The whole printable document for these labels (one 4 × 6 in page each). */
export function labelsDocument(data) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Courier labels (${data.length})</title>
      <style>${STYLE}</style></head><body>${MONO}${data.map(labelHtml).join("")}${FIT}</body></html>`
}

/** Prints courier labels for these orders in one window, one label per page. */
export async function printLabels(ids, say) {
  const win = window.open('', '_blank')
  if (!win) return say('Allow pop-ups for this site to print labels.', 'error')
  try {
    const data = await Promise.all(ids.map((id) => staffJson(`/api/admin/orders/${id}/label`)))
    win.document.open()
    win.document.write(labelsDocument(data))
    win.document.close()
    win.focus()
    // Wait for the logo before printing so it is on every label.
    const imgs = [...win.document.images]
    await Promise.race([
      Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r })))),
      new Promise((r) => window.setTimeout(r, 3000)),
    ])
    window.setTimeout(() => win.print(), 200)
  } catch (err) {
    win.close()
    say(err.message, 'error')
  }
}
