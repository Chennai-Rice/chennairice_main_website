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
  // The Dispatch page splits "to dispatch" into Ready and Packing.
  ready: ['placed', 'confirmed'],
  packing: ['packed'],
  dispatched: ['shipped'],
  delivered: ['delivered'],
  cancelled: ['cancelled', 'returned'],
  all: ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'],
}

// Cards arrive in pages as the list is scrolled.
const PAGE = 20
// The page asks for everything it has already loaded when it auto-refreshes.
const MAX_PAGE = 500

export const DATE = /^\d{4}-\d{2}-\d{2}$/
// India time, so "today" means the shop's today, not UTC's.
const IST_DAY = `(o.placed_at at time zone 'Asia/Kolkata')::date`

/**
 * WHERE clause for every filter except the status tab, so the same filters
 * can drive the list, the tab counts and the packing summary.
 */
export function filterSql(f, params) {
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
export async function listWarehouseOrders(f = {}, { maxLimit = MAX_PAGE, money = false } = {}) {
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
            o.contact_name, o.contact_phone, o.shipping_address, o.needs_attention, o.total_paise,
            (select json_build_object('id', sh.id, 'method', sh.method, 'carrier', sh.carrier_name,
                    'trackingNumber', sh.tracking_number, 'lrNumber', sh.lr_number, 'vehicle', sh.vehicle_number,
                    'trackingUrl', sh.tracking_url, 'driverName', sh.driver_name, 'driverPhone', sh.driver_phone,
                    'notes', sh.notes, 'expectedDelivery', sh.expected_delivery)
               from shipments sh where sh.order_id = o.id and sh.status <> 'cancelled'
              order by sh.created_at desc limit 1) as shipment,
            json_agg(json_build_object('name', i.product_name, 'packKg', i.pack_kg, 'qty', i.quantity, 'sku', i.sku,
                                       'image', p.image_url)
                     order by i.product_name, i.pack_kg) as items,
            sum(i.quantity)::int as packs,
            sum(i.quantity * i.pack_kg) as total_kg
       from orders o
       join order_items i on i.order_id = o.id
       join product_variants v on v.id = i.variant_id
       join products p on p.id = v.product_id
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
    // Amounts only for roles allowed to see money (owner, admin).
    orders: rows.map((r) => ({ ...shapeRow(r), shipment: r.shipment, ...(money ? { total: Number(r.total_paise) / 100 } : {}) })),
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
export function cell(value) {
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

/**
 * Customers who have paid for an order, for the warehouse's Customers page:
 * who they are, how to reach them, where they are, and how often they buy.
 * No money: order counts and packs only.
 */
export async function listWarehouseCustomers(f = {}) {
  const params = []
  let where = `o.status <> 'pending_payment'`
  const q = str(f.q).slice(0, 100)
  if (q) {
    params.push('%' + q + '%')
    const digits = q.replace(/\D/g, '')
    where += ` and (c.name ilike $1 or c.email::text ilike $1 or o.shipping_address->>'city' ilike $1`
    if (digits.length >= 4) {
      params.push('%' + digits + '%')
      where += ` or regexp_replace(c.phone, '\D', '', 'g') like $2`
    }
    where += ')'
  }
  const limit = Math.min(Math.max(Number(f.limit) || 20, 1), 100)
  const offset = Math.max(Number(f.offset) || 0, 0)
  const { rows } = await query(
    `select c.id, c.name, c.phone,
            (array_agg(o.shipping_address->>'city' order by o.placed_at desc))[1] as city,
            (array_agg(o.ship_state order by o.placed_at desc))[1] as state,
            count(distinct o.id)::int as orders,
            coalesce(sum(i.quantity), 0)::int as packs,
            max(o.placed_at) as last_order_at,
            min(o.placed_at) as first_order_at
       from customers c
       join orders o on o.customer_id = c.id
       join order_items i on i.order_id = o.id
      where ${where}
      group by c.id
      order by max(o.placed_at) desc
      limit ${limit} offset ${offset}`,
    params
  )
  const { rows: [{ n }] } = await query(
    `select count(distinct c.id)::int as n from customers c join orders o on o.customer_id = c.id where ${where}`,
    params
  )
  return {
    total: n,
    customers: rows.map((r) => ({
      id: r.id, name: r.name, phone: r.phone, city: r.city, state: r.state,
      orders: r.orders, packs: r.packs, lastOrderAt: r.last_order_at, firstOrderAt: r.first_order_at,
    })),
  }
}

/**
 * Warehouse reports over the last `days` days (default 30), in packs and
 * orders, never money: dispatches per day, packs per product, the status mix,
 * and how long paid orders wait before dispatch.
 */
export async function warehouseReport({ days } = {}) {
  const span = Math.min(Math.max(Number(days) || 30, 1), 365)
  const since = `now() - make_interval(days => ${span})`
  const [perDay, perProduct, mix, speed] = await Promise.all([
    query(
      `select (o.shipped_at at time zone 'Asia/Kolkata')::date::text as day, count(*)::int as orders,
              sum((select sum(quantity) from order_items i where i.order_id = o.id))::int as packs
         from orders o
        where o.shipped_at is not null and o.shipped_at > ${since} and o.status in ('shipped', 'delivered')
        group by 1 order by 1`),
    query(
      `select i.product_name as name, i.pack_kg as "packKg", sum(i.quantity)::int as packs, count(distinct o.id)::int as orders
         from orders o join order_items i on i.order_id = o.id
        where o.status not in ('pending_payment', 'cancelled') and o.placed_at > ${since}
        group by 1, 2 order by packs desc, name limit 20`),
    query(
      `select status, count(*)::int as n from orders
        where status <> 'pending_payment' and placed_at > ${since} group by status`),
    query(
      `select round(avg(extract(epoch from (shipped_at - placed_at)) / 3600)::numeric, 1)::float as avg_hours,
              count(*)::int as dispatched
         from orders where shipped_at is not null and placed_at > ${since} and status in ('shipped', 'delivered')`),
  ])
  return {
    days: span,
    perDay: perDay.rows,
    perProduct: perProduct.rows.map((r) => ({ ...r, packKg: Number(r.packKg) })),
    statusMix: Object.fromEntries(mix.rows.map((r) => [r.status, r.n])),
    avgHoursToDispatch: speed.rows[0].avg_hours,
    dispatched: speed.rows[0].dispatched,
  }
}
