// Product tracker upload: the delivery agent's spreadsheet of
//   order / product ID  ·  tracking link or AWB number  ·  delivery partner
// read, matched to orders, previewed, then applied.
//
// Applying a row:
//   order still waiting (Ready / Packing)  → dispatched by courier with that tracking
//   order already dispatched               → its courier and tracking are updated
//   delivered / cancelled / not found      → left alone, with the reason shown
//
// The customer's Track Order page and the warehouse then show a
// "Track on <partner>" button that opens the partner's own tracking page.
import ExcelJS from 'exceljs'
import { tx, query } from '../db.js'
import { requirePermission, audit } from './staff.js'
import { httpError, str, parseTrackingRef } from './util.js'
import { shipOrder, DISPATCHABLE } from './operations.js'
import { queueShippedEmail } from './email.js'
import { findCourier, courierForHost, buildTrackingUrl, isCourierHost, awbFromUrl } from './couriers.js'

export const MAX_ROWS = 2000
const MAX_BYTES = 5 * 1024 * 1024

/* ------------------------------------------------------------- reading */

/** A cell's value as plain text: hyperlinks give their link, rich text its words. */
function cellText(v) {
  if (v == null) return ''
  if (typeof v === 'object') {
    if (v.hyperlink) return String(v.hyperlink)
    if (v.richText) return v.richText.map((r) => r.text).join('')
    if (v.text != null) return String(v.text)
    if (v.result != null) return String(v.result)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    return ''
  }
  return String(v)
}

// Which column is which, from its heading. Order matters: a "Tracking link"
// heading is the link column even though it also says "tracking".
const COLUMN_RULES = [
  ['partner', /(partner|courier|carrier|logistic|transporter|service\s*provider|delivery\s*by|shipped\s*(by|via))/i],
  ['link', /(link|url|website)/i],
  ['awb', /(awb|tracking|docket|consignment|waybill|way\s*bill|c\s*\/?\s*n\s*no|cn\s*no|lr\s*no)/i],
  ['ref', /(order|product|shipment|reference|ref\b|invoice|id\b)/i],
]

function mapHeader(cells) {
  const cols = {}
  cells.forEach((text, i) => {
    const t = text.trim()
    if (!t) return
    for (const [key, re] of COLUMN_RULES) {
      if (cols[key] == null && re.test(t)) {
        cols[key] = i
        break
      }
    }
  })
  return cols
}

/**
 * Rows of the first sheet as [{ rowNo, ref, tracking, partner }].
 * Accepts .xlsx and .csv. Headings are recognised in the first 10 rows; with
 * none, the columns are taken as: ID, tracking, partner.
 */
export async function readTrackerFile(buffer, filename = '') {
  if (!buffer?.length) throw httpError('The file is empty.')
  if (buffer.length > MAX_BYTES) throw httpError('The file is over 5 MB. Split it into smaller sheets.')
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b // .xlsx is a zip
  const lower = filename.toLowerCase()
  if (!isZip && lower.endsWith('.xls')) {
    throw httpError('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx), then upload again.')
  }

  const grid = []
  if (isZip) {
    const wb = new ExcelJS.Workbook()
    try {
      await wb.xlsx.load(buffer)
    } catch {
      throw httpError('That file could not be read as an Excel workbook (.xlsx).')
    }
    const ws = wb.worksheets.find((w) => w.rowCount > 0) || wb.worksheets[0]
    if (!ws) throw httpError('The workbook has no sheets.')
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      const cells = []
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellText(cell.value) })
      grid.push({ rowNo, cells: Array.from(cells, (c) => c ?? '') })
    })
  } else {
    // CSV (or text pasted into a .csv): simple quoted-field parser.
    const text = buffer.toString('utf8').replace(/^﻿/, '')
    const lines = []
    let field = ''
    let row = []
    let quoted = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
        else if (ch === '"') quoted = false
        else field += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',' || ch === '\t' || ch === ';') { row.push(field); field = '' }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(field); lines.push(row); row = []; field = ''
      } else field += ch
    }
    if (field || row.length) { row.push(field); lines.push(row) }
    lines.forEach((cells, i) => { if (cells.some((c) => c.trim())) grid.push({ rowNo: i + 1, cells }) })
  }

  if (!grid.length) throw httpError('No rows found in the file.')

  let cols = null
  let start = 0
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const c = mapHeader(grid[i].cells)
    if (c.ref != null && (c.awb != null || c.link != null) ) {
      cols = c
      start = i + 1
      break
    }
  }
  if (!cols) cols = { ref: 0, link: 1, partner: 2 } // the agent's usual layout

  const rows = grid.slice(start)
    .map(({ rowNo, cells }) => {
      const get = (k) => (cols[k] != null ? str(cells[cols[k]] || '') : '')
      return { rowNo, ref: get('ref'), tracking: get('link') || get('awb'), awb: cols.link != null ? get('awb') : '', partner: get('partner') }
    })
    .filter((r) => r.ref || r.tracking || r.partner)
  if (rows.length > MAX_ROWS) throw httpError(`The sheet has ${rows.length} rows; upload at most ${MAX_ROWS} at a time.`)
  return { rows, columns: cols }
}

/* ------------------------------------------------------------ matching */

/** The tracking details for one row: courier, AWB and a safe link. */
export function resolveTracking({ tracking, awb, partner }) {
  const raw = str(tracking)
  let url = null
  if (/^https?:\/\//i.test(raw)) {
    try {
      url = new URL(raw)
    } catch {
      url = null
    }
  }
  let courier = findCourier(partner) || (url ? courierForHost(url.hostname) : null)
  let number = str(awb) || (url ? awbFromUrl(url) : raw.replace(/\s+/g, ''))
  if (number && !/^[A-Za-z0-9-/]{4,40}$/.test(number)) number = ''

  let link = null
  let note = null
  if (courier) {
    // A known partner always gets its own tracking page, whatever link the sheet has.
    link = buildTrackingUrl(courier, number)
    if (url && !isCourierHost(courier, url.hostname)) note = `Link was not on ${courier.name}'s website, so ${courier.name}'s own tracking page is used.`
  } else if (url && url.protocol === 'https:') {
    link = url.toString() // unknown partner: keep its https link as given
  }
  return {
    courier,
    carrierName: courier ? courier.name : str(partner).replace(/\s+/g, ' ').slice(0, 80),
    trackingNumber: number || null,
    trackingUrl: link,
    deepLink: Boolean(link && number && link.includes(encodeURIComponent(number))),
    note,
  }
}

async function buildPreview(rows) {
  // Look every reference up in one go.
  const refs = rows.map((r) => ({ ...r, parsed: parseTrackingRef(r.ref) }))
  const orderNumbers = refs.map((r) => r.parsed?.orderNumber).filter(Boolean)
  const shipmentIds = refs.map((r) => r.parsed?.shipmentId).filter(Boolean)
  const { rows: found } = await query(
    `select o.id, o.order_number, o.shipment_id, o.status, o.needs_attention, o.contact_name,
            s.id as shipment_row, s.carrier_name, s.tracking_number, s.tracking_url, s.method
       from orders o
       left join lateral (select * from shipments x where x.order_id = o.id and x.status <> 'cancelled'
                           order by x.created_at desc limit 1) s on true
      where o.order_number = any($1) or o.shipment_id = any($2)`,
    [orderNumbers, shipmentIds]
  )
  const byNumber = new Map(found.map((o) => [o.order_number, o]))
  const byShipment = new Map(found.map((o) => [o.shipment_id, o]))

  // A reference listed twice: the later row wins.
  const lastRowFor = new Map()
  refs.forEach((r) => { if (r.parsed) lastRowFor.set(r.parsed.orderNumber || r.parsed.shipmentId, r.rowNo) })

  return refs.map((r) => {
    const base = { rowNo: r.rowNo, ref: r.ref, partner: r.partner, tracking: r.tracking }
    const skip = (message) => ({ ...base, action: 'skip', message })
    if (!r.ref) return skip('No order ID in this row.')
    if (!r.parsed) return skip('Not an order ID (CR-…) or shipment ID (SHP-…).')
    const key = r.parsed.orderNumber || r.parsed.shipmentId
    if (lastRowFor.get(key) !== r.rowNo) return skip(`Listed again in row ${lastRowFor.get(key)}; that row is used.`)
    const o = r.parsed.orderNumber ? byNumber.get(r.parsed.orderNumber) : byShipment.get(r.parsed.shipmentId)
    if (!o || o.status === 'pending_payment') return skip('No paid order with this ID.')
    if (!r.partner && !r.tracking) return skip('No delivery partner or tracking given.')
    const t = resolveTracking(r)
    const out = {
      ...base,
      orderId: o.id,
      orderNumber: o.order_number,
      shipmentId: o.shipment_id,
      customer: o.contact_name,
      status: o.status,
      courierKey: t.courier?.key || null,
      courierName: t.carrierName,
      courierKnown: Boolean(t.courier),
      trackingNumber: t.trackingNumber,
      trackingUrl: t.trackingUrl,
      deepLink: t.deepLink,
      note: t.note,
    }
    if (!t.carrierName) return { ...out, action: 'skip', message: 'Delivery partner name is missing.' }
    if (!t.trackingNumber) return { ...out, action: 'skip', message: 'No AWB / tracking number found in this row.' }
    if (['cancelled', 'returned'].includes(o.status)) return { ...out, action: 'skip', message: `Order is ${o.status}.` }
    if (o.status === 'delivered') return { ...out, action: 'skip', message: 'Already delivered.' }
    if (DISPATCHABLE.includes(o.status)) {
      if (o.needs_attention) return { ...out, action: 'skip', message: 'Order is flagged; ask sales or the owner to clear it first.' }
      return { ...out, action: 'dispatch', message: `Will be marked dispatched by ${t.carrierName}.` }
    }
    const same = o.method === 'courier' && o.carrier_name === t.carrierName &&
      o.tracking_number === t.trackingNumber && (o.tracking_url || null) === (t.trackingUrl || null)
    if (same) return { ...out, action: 'unchanged', message: 'Already has this tracking.' }
    return {
      ...out,
      action: 'update',
      shipmentRow: o.shipment_row,
      message: o.tracking_number ? `Tracking changes from ${o.tracking_number}.` : 'Tracking will be added.',
    }
  })
}

function summarise(rows) {
  const count = (a) => rows.filter((r) => r.action === a).length
  return {
    total: rows.length,
    dispatch: count('dispatch'),
    update: count('update'),
    unchanged: count('unchanged'),
    skip: count('skip'),
    partners: [...new Set(rows.filter((r) => r.action !== 'skip' && r.courierName).map((r) => r.courierName))],
  }
}

/* ----------------------------------------------------------- the upload */

/**
 * Preview (apply = false) or apply an uploaded tracker sheet.
 * Every row is applied on its own: one bad row never blocks the others.
 */
export async function processTrackerUpload(staff, buffer, { filename = 'tracker.xlsx', apply = false } = {}) {
  requirePermission(staff, 'order.ship')
  const { rows: sheet } = await readTrackerFile(buffer, filename)
  const preview = await buildPreview(sheet)
  if (!apply) return { applied: false, filename, summary: summarise(preview), rows: preview }

  const results = []
  for (const r of preview) {
    if (r.action === 'skip' || r.action === 'unchanged') {
      results.push(r)
      continue
    }
    try {
      if (r.action === 'dispatch') {
        await shipOrder(staff, r.orderId, {
          method: 'courier', carrierName: r.courierName, trackingNumber: r.trackingNumber,
          trackingUrl: r.trackingUrl || undefined, notes: `Tracking from ${filename}`,
        })
      } else {
        await tx(async (db) => {
          const { rows: [s] } = await db.query(`select * from shipments where id = $1 for update`, [r.shipmentRow])
          if (!s || s.status !== 'shipped') throw httpError('Shipment changed meanwhile; upload again.', { status: 409 })
          await db.query(
            `update shipments set method = 'courier', carrier_name = $2, tracking_number = $3, tracking_url = $4,
                    vehicle_number = null, driver_name = null, driver_phone = null, lr_number = null
              where id = $1`,
            [s.id, r.courierName, r.trackingNumber, r.trackingUrl]
          )
          await db.query(
            `insert into shipment_status_history (shipment_id, from_status, to_status, staff_id, note)
             values ($1, 'shipped', 'shipped', $2, $3)`,
            [s.id, staff.id, `Tracking from ${filename}: ${r.courierName} ${r.trackingNumber}`]
          )
          const { rows: [updated] } = await db.query('select * from shipments where id = $1', [s.id])
          const { rows: [order] } = await db.query('select * from orders where id = $1', [s.order_id])
          await queueShippedEmail(db, order, updated)
        })
      }
      results.push({ ...r, done: true })
    } catch (err) {
      results.push({ ...r, action: 'skip', message: err.publicMessage || err.message })
    }
  }
  const done = (a) => results.filter((r) => r.action === a && r.done).length
  const summary = {
    ...summarise(results),
    dispatched: done('dispatch'),
    updated: done('update'),
  }
  await query(
    `insert into tracker_uploads (filename, rows_total, dispatched, updated, unchanged, skipped, partners, staff_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [filename.slice(0, 200), results.length, summary.dispatched, summary.updated, summary.unchanged, summary.skip,
      summary.partners, staff.id]
  )
  await audit({ query }, staff, 'tracker.upload', 'tracker', null, { filename, ...summary })
  return { applied: true, filename, summary, rows: results }
}

export async function listTrackerUploads() {
  const { rows } = await query(
    `select u.*, s.full_name as staff_name from tracker_uploads u left join staff_users s on s.id = u.staff_id
      order by u.created_at desc limit 20`
  )
  return rows.map((u) => ({
    id: u.id, filename: u.filename, rows: u.rows_total, dispatched: u.dispatched, updated: u.updated,
    unchanged: u.unchanged, skipped: u.skipped, partners: u.partners, by: u.staff_name, at: u.created_at,
  }))
}

/** A ready-to-fill template for the delivery agent. */
export async function trackerTemplate() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Product tracker')
  ws.columns = [
    { header: 'Order ID', key: 'ref', width: 24 },
    { header: 'Tracking Link / AWB', key: 'link', width: 52 },
    { header: 'Delivery Partner', key: 'partner', width: 20 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.addRow({ ref: 'CR-20261008-K7M4Q', link: '1234567890', partner: 'Blue Dart' })
  ws.addRow({ ref: 'SHP-K7M4-Q9X2', link: 'https://www.delhivery.com/track/package/1234567890', partner: 'Delhivery' })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/* --------------------------------------------- customer: go to courier */

/**
 * Where "Track on <partner>" should take someone: the courier's own page for
 * this order's shipment, or our Track Order page when there is none yet.
 * Only links stored by the upload (already checked) are ever used.
 */
export async function courierRedirect(ref) {
  const parsed = parseTrackingRef(ref)
  if (!parsed) return null
  const { rows: [s] } = await query(
    `select s.tracking_url from orders o
       join shipments s on s.order_id = o.id and s.status <> 'cancelled'
      where (o.order_number = $1 or o.shipment_id = $2) and o.status <> 'pending_payment'
      order by s.created_at desc limit 1`,
    [parsed.orderNumber || null, parsed.shipmentId || null]
  )
  return s?.tracking_url || null
}
