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
// An order that was never paid (failed / cancelled checkout) has no placed_at;
// it is dated by when the customer tried to check out.
const WHEN = 'coalesce(o.placed_at, o.created_at)'
const IST_DAY = `(${WHEN} at time zone 'Asia/Kolkata')::date`

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
  // Payment never went through (failed or abandoned), so the order was cancelled.
  else if (f.payment === 'failed') where.push(`o.payment_status in ('failed', 'pending')`)

  // Abandoned checkouts: the customer gave their details and pressed Pay, but never paid.
  if (f.abandoned === '1' || f.abandoned === true) where.push(`o.status = 'cancelled' and o.payment_status in ('failed', 'pending')`)

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
    `select o.id, o.order_number, o.shipment_id, o.status, o.payment_status, ${WHEN} as placed_at, o.shipped_at,
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
      order by ${WHEN} ${sort}, o.order_number
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

/** The Customers page as a spreadsheet: every customer matching the search, not one page of them. */
export async function customersCsv(f = {}) {
  const { customers } = await listWarehouseCustomers({ ...f, limit: 20000, offset: 0 }, { maxLimit: 20000 })
  const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '')
  const header = ['Customer name', 'Phone', 'Email', 'Source', 'Status', 'City', 'State', 'Orders', 'Packs', 'First order', 'Last order']
  const lines = customers.map((c) => [
    c.name, phoneForSheet(c.phone), c.email, c.source, c.converted ? 'Converted' : 'Not converted', c.city, c.state, c.orders, c.packs, when(c.firstOrderAt), when(c.lastOrderAt),
  ].map(cell).join(','))
  return '\ufeff' + [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n'
}

export function assertTab(tab) {
  if (tab && !TABS[tab]) throw httpError('Unknown tab.')
}

/**
 * Customers who have paid for an order, for the warehouse's Customers page:
 * who they are, how to reach them, where they are, and how often they buy.
 * No money: order counts and packs only.
 */
export async function listWarehouseCustomers(f = {}, { maxLimit = 100 } = {}) {
  const params = []
  const q = str(f.q).slice(0, 100)
  let search = ''
  if (q) {
    params.push('%' + q + '%')
    search = `(name ilike $1 or email ilike $1 or city ilike $1`
    const digits = q.replace(/\D/g, '')
    if (digits.length >= 4) {
      params.push('%' + digits + '%')
      search += ` or regexp_replace(phone, '[^0-9]', '', 'g') like $2`
    }
    search += ')'
  }
  // Converted = has paid for an order. Everyone else (a sign-up who has not bought, or a buyer whose
  // payment never went through) is "not converted".
  const status = f.status === 'converted' ? 'converted' : f.status === 'not_converted' ? 'not_converted' : ''
  const SOURCE_LABELS = ['Meta', 'Google Ads', 'Google search', 'WhatsApp', 'Other website', 'Direct']
  const source = SOURCE_LABELS.includes(f.source) ? f.source : ''
  let sourceSql = ''
  if (source) {
    params.push(source)
    sourceSql = `src_label = $${params.length}`
  }
  // The counts on the toggle ignore the status, so each button shows how many people it would list.
  const baseWhere = [search, sourceSql].filter(Boolean).join(' and ')
  const where = [baseWhere, status === 'converted' ? 'converted' : status === 'not_converted' ? 'not converted' : ''].filter(Boolean).join(' and ')
  const limit = Math.min(Math.max(Number(f.limit) || 20, 1), maxLimit)
  const offset = Math.max(Number(f.offset) || 0, 0)

  // People who ordered (or tried to), plus contest sign-ups that have not ordered. A sign-up whose mobile
  // number has an order is shown once, as the customer.
  const base = `
    with buyers as (
      select c.id::text as id, c.name, c.phone, c.email::text as email,
             (array_agg(o.shipping_address->>'city' order by o.placed_at desc nulls last))[1] as city,
             (array_agg(o.ship_state order by o.placed_at desc nulls last))[1] as state,
             count(distinct o.id)::int as orders,
             coalesce(sum(i.quantity), 0)::int as packs,
             max(o.placed_at) as last_order_at,
             min(o.placed_at) as first_order_at,
             -- Where they first came from: the contest sign-up if they made one, else their earliest tagged order.
             coalesce(
               nullif((select l.source from contest_leads l
                        where right(regexp_replace(l.phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10) limit 1), 'direct'),
               (array_agg(o.traffic_source order by (o.traffic_source is not null and o.traffic_source <> 'direct') desc, o.placed_at asc nulls last))[1]
             ) as source,
             bool_or(o.payment_status in ('paid', 'partially_refunded', 'refunded')) as converted,
             right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10) as pkey,
             max(coalesce(o.placed_at, o.created_at)) as recent
        from customers c
        join orders o on o.customer_id = c.id
        join order_items i on i.order_id = o.id
       where o.status <> 'pending_payment'
       group by c.id
    ), signups as (
      select l.id::text as id, l.name, l.phone, l.email, null::text as city, null::text as state,
             0 as orders, 0 as packs, null::timestamptz as last_order_at, null::timestamptz as first_order_at,
             l.source, false as converted, right(regexp_replace(l.phone, '[^0-9]', '', 'g'), 10) as pkey, l.updated_at
        from contest_leads l
       where right(regexp_replace(l.phone, '[^0-9]', '', 'g'), 10) not in (select pkey from buyers)
    ), everyone as (
      select id, name, phone, email, city, state, orders, packs, last_order_at, first_order_at, source, converted,
             'customer' as kind, recent
        from buyers
      union all
      select id, name, phone, email, city, state, orders, packs, last_order_at, first_order_at, source, converted,
             'signup' as kind, updated_at as recent
        from signups
    ), labeled as (
      select *, case
               when source ~ '^meta_ads' or source in ('facebook', 'instagram') then 'Meta'
               when source = 'google_ads' then 'Google Ads'
               when source = 'google_search' then 'Google search'
               when source = 'whatsapp' then 'WhatsApp'
               when source = 'other_website' then 'Other website'
               else 'Direct' end as src_label
        from everyone
    )`
  const filter = where ? `where ${where}` : ''
  const { rows } = await query(
    `${base}
     select * from labeled ${filter}
      order by recent desc
      limit ${limit} offset ${offset}`,
    params
  )
  const { rows: [{ n }] } = await query(`${base} select count(*)::int as n from labeled ${filter}`, params)
  const { rows: [c] } = await query(
    `${base} select count(*)::int as everyone, count(*) filter (where converted)::int as converted,
                    count(*) filter (where not converted)::int as not_converted
               from labeled ${baseWhere ? 'where ' + baseWhere : ''}`,
    params
  )
  return {
    total: n,
    counts: { all: c.everyone, converted: c.converted, notConverted: c.not_converted },
    customers: rows.map((r) => ({
      id: r.id, kind: r.kind, name: r.name, phone: r.phone, email: r.email, city: r.city, state: r.state,
      orders: r.orders, packs: r.packs, lastOrderAt: r.last_order_at, firstOrderAt: r.first_order_at,
      converted: r.converted, source: r.src_label,
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
