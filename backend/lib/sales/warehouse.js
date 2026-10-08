// The /warehouse page: paid orders with what to pack and where it goes.
//
// Deliberately price-free. The warehouse team sees packs, quantities, the
// customer's name, phone and delivery address, and payment status, but never
// a rupee figure: they do not need one to pack a bag.
import { query } from '../db.js'
import { httpError, str, parseTrackingRef, phoneKey } from './util.js'

// Status tabs, in the order the work happens. "To dispatch" also takes
// orders confirmed or packed from the office screens.
export const TABS = {
  to_dispatch: ['placed', 'confirmed', 'packed'],
  dispatched: ['shipped'],
  delivered: ['delivered'],
  cancelled: ['cancelled', 'returned'],
  all: ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'],
}

// Cards arrive in pages as the list is scrolled.
const PAGE = 20
// The page asks for everything it has already loaded when it auto-refreshes.
const MAX_PAGE = 500

const DATE = /^\d{4}-\d{2}-\d{2}$/
// India time, so "today" means the shop's today, not UTC's.
const IST_DAY = `(o.placed_at at time zone 'Asia/Kolkata')::date`

/**
 * WHERE clause for every filter except the status tab, so the same filters
 * can drive the list, the tab counts and the packing summary.
 */
function filterSql(f, params) {
  const where = [`o.status <> 'pending_payment'`]
  const add = (value) => {
    params.push(value)
    return '$' + params.length
  }

  if (f.payment === 'paid') where.push(`o.payment_status = 'paid'`)
  else if (f.payment === 'refunded') where.push(`o.payment_status in ('refunded', 'partially_refunded')`)

  if (['5', '10', '26'].includes(String(f.pack))) {
    where.push(`exists (select 1 from order_items x where x.order_id = o.id and x.pack_kg = ${add(Number(f.pack))})`)
  }

  if (f.state === 'tn') where.push(`lower(o.ship_state) in ('tamil nadu', 'tn')`)
  else if (f.state === 'other') where.push(`lower(o.ship_state) not in ('tamil nadu', 'tn')`)

  if (DATE.test(str(f.from))) where.push(`${IST_DAY} >= ${add(f.from)}::date`)
  if (DATE.test(str(f.to))) where.push(`${IST_DAY} <= ${add(f.to)}::date`)

  const q = str(f.q).slice(0, 100)
  if (q) {
    const ref = parseTrackingRef(q)
    if (ref?.orderNumber) where.push(`o.order_number = ${add(ref.orderNumber)}`)
    else if (ref?.shipmentId) where.push(`o.shipment_id = ${add(ref.shipmentId)}`)
    else {
      const like = add('%' + q + '%')
      const parts = [
        `o.order_number ilike ${like}`,
        `o.shipment_id ilike ${like}`,
        `o.contact_name ilike ${like}`,
        `o.shipping_address->>'city' ilike ${like}`,
        `o.shipping_address->>'pincode' ilike ${like}`,
        `exists (select 1 from order_items x where x.order_id = o.id and x.product_name ilike ${like})`,
      ]
      const digits = q.replace(/\D/g, '')
      if (digits.length >= 4) parts.push(`regexp_replace(o.contact_phone, '\\D', '', 'g') like ${add('%' + digits + '%')}`)
      where.push('(' + parts.join(' or ') + ')')
    }
  }
  return where
}

function shapeRow(r) {
  const a = r.shipping_address || {}
  const hoursWaiting = (Date.now() - new Date(r.placed_at).getTime()) / 3600000
  return {
    id: r.id,
    orderNumber: r.order_number,
    shipmentId: r.shipment_id,
    status: r.status,
    paymentStatus: r.payment_status,
    placedAt: r.placed_at,
    shippedAt: r.shipped_at,
    customer: { name: r.contact_name, phone: r.contact_phone },
    address: {
      line1: a.line1, line2: a.line2 || null, landmark: a.landmark || null,
      city: a.city, state: a.state, pincode: a.pincode,
    },
    items: r.items,
    packs: r.packs,
    totalKg: Number(r.total_kg),
    needsAttention: r.needs_attention,
    // Shown as a red badge: waiting past the reminder times in jobs.js.
    overdue:
      r.status === 'placed' && hoursWaiting > 4 ? 'Waiting over 4 hours to confirm'
        : ['confirmed', 'packed'].includes(r.status) && hoursWaiting > 48 ? 'Not shipped 2 days after payment'
          : null,
  }
}

/**
 * One page of the list for the current tab and filters, plus a count for
 * every tab under the same filters (so the page knows when it has them all).
 * `limit`/`offset` page through; the CSV export passes a large limit.
 */
export async function listWarehouseOrders(f = {}, { maxLimit = MAX_PAGE } = {}) {
  const tab = TABS[f.tab] ? f.tab : 'to_dispatch'
  const sort = f.sort === 'newest' ? 'desc' : 'asc'
  const limit = Math.min(Math.max(Number(f.limit) || PAGE, 1), maxLimit)
  const offset = Math.max(Number(f.offset) || 0, 0)

  const params = []
  const where = filterSql(f, params)
  const base = where.join(' and ')

  const listParams = [...params, TABS[tab]]
  const { rows } = await query(
    `select o.id, o.order_number, o.shipment_id, o.status, o.payment_status, o.placed_at, o.shipped_at,
            o.contact_name, o.contact_phone, o.shipping_address, o.needs_attention,
            json_agg(json_build_object('name', i.product_name, 'packKg', i.pack_kg, 'qty', i.quantity, 'sku', i.sku)
                     order by i.product_name, i.pack_kg) as items,
            sum(i.quantity)::int as packs,
            sum(i.quantity * i.pack_kg) as total_kg
       from orders o join order_items i on i.order_id = o.id
      where ${base} and o.status = any($${listParams.length})
      group by o.id
      order by o.placed_at ${sort}, o.order_number
      limit ${limit} offset ${offset}`,
    listParams
  )

  const { rows: counts } = await query(
    `select o.status, count(*)::int as n from orders o where ${base} group by o.status`,
    params
  )
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]))
  const tabCounts = Object.fromEntries(
    Object.entries(TABS).map(([key, statuses]) => [key, statuses.reduce((t, s) => t + (byStatus[s] || 0), 0)])
  )

  return {
    tab,
    orders: rows.map(shapeRow),
    counts: tabCounts,
    offset,
    tabCount: tabCounts[tab],
    hasMore: offset + rows.length < tabCounts[tab],
  }
}

const STATUS_LABEL = {
  placed: 'To dispatch', confirmed: 'To dispatch', packed: 'To dispatch', shipped: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
}
const PAYMENT_LABEL = { paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Partly refunded', pending: 'Pending', failed: 'Failed' }

/** One CSV cell. Text that Excel would run as a formula is defused. */
function cell(value) {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** "98765 43210": the customer's 10 digits, kept as text so Excel cannot mangle it. */
function phoneForSheet(phone) {
  const d = phoneKey(phone)
  return d.length === 10 ? d.slice(0, 5) + ' ' + d.slice(5) : str(phone)
}

/** The filtered list as CSV, opening straight in Excel (UTF-8 with BOM, so ₹ and Tamil survive). */
export async function warehouseCsv(f = {}) {
  // Every matching order, not one page of them.
  const { orders } = await listWarehouseOrders({ ...f, limit: 5000, offset: 0 }, { maxLimit: 5000 })
  const header = [
    'Order ID', 'Shipment ID', 'Order date', 'Products', 'Total packs', 'Total weight (kg)',
    'Customer name', 'Phone', 'Address', 'City', 'State', 'PIN', 'Payment status', 'Order status',
  ]
  const lines = orders.map((o) => [
    o.orderNumber,
    o.shipmentId,
    new Date(o.placedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    o.items.map((i) => `${i.qty} x ${i.name} (${Number(i.packKg)} kg)`).join('; '),
    o.packs,
    o.totalKg,
    o.customer.name,
    phoneForSheet(o.customer.phone),
    [o.address.line1, o.address.line2, o.address.landmark && 'Landmark: ' + o.address.landmark].filter(Boolean).join(', '),
    o.address.city,
    o.address.state,
    o.address.pincode,
    PAYMENT_LABEL[o.paymentStatus] || o.paymentStatus,
    STATUS_LABEL[o.status] || o.status,
  ].map(cell).join(','))
  return '﻿' + [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n'
}

export function assertTab(tab) {
  if (tab && !TABS[tab]) throw httpError('Unknown tab.')
}
