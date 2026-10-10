// Warehouse panel data beyond the order list: the Deliveries page, the
// Dispatch page's pick list, and the Dashboard. Packs and orders for every
// staff role; amounts only when the caller passes money: true (owner, admin).
import { query } from '../db.js'
import { str, parseTrackingRef } from './util.js'
import { DATE, TABS, filterSql, cell } from './warehouse.js'

/* ----------------------------------------------------------- deliveries */

// Deliveries page tabs. "Delayed": still on the way after its expected date.
const SHIP_TABS = {
  all: `s.status in ('shipped', 'delivered')`,
  in_transit: `s.status = 'shipped'`,
  delivered: `s.status = 'delivered'`,
  delayed: `s.status = 'shipped' and s.expected_delivery < (now() at time zone 'Asia/Kolkata')::date`,
}
const METHODS = ['own_vehicle', 'courier', 'transport', 'pickup']

/** Shipments that have left the mill: where they are going and how. */
export async function listShipments(f = {}) {
  const tab = SHIP_TABS[f.tab] ? f.tab : 'all'
  const params = []
  const add = (v) => {
    params.push(v)
    return '$' + params.length
  }
  const where = []
  const q = str(f.q).slice(0, 100)
  if (q) {
    const ref = parseTrackingRef(q)
    if (ref?.orderNumber) where.push(`o.order_number = ${add(ref.orderNumber)}`)
    else if (ref?.shipmentId) where.push(`o.shipment_id = ${add(ref.shipmentId)}`)
    else {
      const like = add('%' + q + '%')
      where.push(`(o.contact_name ilike ${like} or s.tracking_number ilike ${like} or s.lr_number ilike ${like}
                   or s.vehicle_number ilike ${like} or o.order_number ilike ${like})`)
    }
  }
  if (str(f.transporter)) where.push(`s.carrier_name ilike ${add('%' + str(f.transporter) + '%')}`)
  if (METHODS.includes(f.method)) where.push(`s.method = ${add(f.method)}`)
  if (f.state === 'tn') where.push(`lower(o.ship_state) in ('tamil nadu', 'tn')`)
  else if (f.state === 'other') where.push(`lower(o.ship_state) not in ('tamil nadu', 'tn')`)
  const day = `(s.shipped_at at time zone 'Asia/Kolkata')::date`
  if (DATE.test(str(f.from))) where.push(`${day} >= ${add(f.from)}::date`)
  if (DATE.test(str(f.to))) where.push(`${day} <= ${add(f.to)}::date`)
  const extra = where.length ? ' and ' + where.join(' and ') : ''
  const limit = Math.min(Math.max(Number(f.limit) || 10, 1), 200)
  const offset = Math.max(Number(f.offset) || 0, 0)

  const { rows } = await query(
    `select s.id, s.shipment_number, s.method, s.carrier_name, s.tracking_number, s.lr_number, s.tracking_url,
            s.vehicle_number, s.driver_name, s.driver_phone, s.status, s.expected_delivery, s.shipped_at,
            s.delivered_at, s.notes, o.id as order_id, o.order_number, o.contact_name, o.contact_phone,
            o.shipping_address, o.ship_state
       from shipments s join orders o on o.id = s.order_id
      where ${SHIP_TABS[tab]}${extra}
      order by s.shipped_at desc
      limit ${limit} offset ${offset}`,
    params
  )
  const counts = {}
  for (const [key, cond] of Object.entries(SHIP_TABS)) {
    const { rows: [{ n }] } = await query(
      `select count(*)::int as n from shipments s join orders o on o.id = s.order_id where ${cond}${extra}`, params)
    counts[key] = n
  }
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  return {
    tab,
    counts,
    total: counts[tab],
    shipments: rows.map((r) => ({
      id: r.id,
      shipmentNumber: r.shipment_number,
      orderId: r.order_id,
      orderNumber: r.order_number,
      method: r.method,
      carrier: r.carrier_name,
      trackingNumber: r.tracking_number,
      lrNumber: r.lr_number,
      trackingUrl: r.tracking_url,
      vehicle: r.vehicle_number,
      driverName: r.driver_name,
      driverPhone: r.driver_phone,
      status: r.status,
      delayed: Boolean(r.status === 'shipped' && r.expected_delivery && r.expected_delivery < today),
      expectedDelivery: r.expected_delivery,
      shippedAt: r.shipped_at,
      deliveredAt: r.delivered_at,
      notes: r.notes,
      customer: { name: r.contact_name, phone: r.contact_phone },
      destination: { city: r.shipping_address?.city, state: r.ship_state, pincode: r.shipping_address?.pincode },
    })),
  }
}

/* ------------------------------------------------------------ pick list */

/**
 * What to pull from the shelves for the orders waiting (Ready + Packing,
 * under the same filters as the list): one line per product and pack size.
 */
export async function pickList(f = {}) {
  const params = []
  const where = filterSql(f, params)
  const tab = ['ready', 'packing', 'to_dispatch'].includes(f.tab) ? f.tab : 'to_dispatch'
  params.push(TABS[tab])
  const { rows } = await query(
    `select i.product_name as name, i.sku, i.pack_kg as "packKg", sum(i.quantity)::int as packs,
            count(distinct o.id)::int as orders
       from orders o join order_items i on i.order_id = o.id
      where ${where.join(' and ')} and o.status = any($${params.length})
      group by i.product_name, i.sku, i.pack_kg
      order by i.product_name, i.pack_kg`,
    params
  )
  return rows.map((r) => ({ ...r, packKg: Number(r.packKg) }))
}

export async function pickListCsv(f = {}) {
  const lines = await pickList(f)
  const header = ['Product', 'SKU', 'Pack size (kg)', 'Packs to pick', 'Orders']
  const body = lines.map((l) => [l.name, l.sku, l.packKg, l.packs, l.orders].map(cell).join(','))
  return '﻿' + [header.map(cell).join(','), ...body].join('\r\n') + '\r\n'
}

/* ------------------------------------------------------------ dashboard */

const IST = `at time zone 'Asia/Kolkata'`

export async function warehouseDashboard({ money = false } = {}) {
  const [counts, issues, today, hours, month, top, recent, low] = await Promise.all([
    query(`select status, count(*)::int as n from orders where status <> 'pending_payment' group by status`),
    query(`select count(*) filter (where status <> 'resolved')::int as open from order_issues`),
    query(`select
        count(*) filter (where (placed_at ${IST})::date = (now() ${IST})::date)::int as today,
        count(*) filter (where (placed_at ${IST})::date = (now() ${IST})::date - 1)::int as yesterday
      from orders where placed_at is not null`),
    query(`select extract(hour from placed_at ${IST})::int as hour, count(*)::int as n
       from orders where placed_at is not null and (placed_at ${IST})::date = (now() ${IST})::date
      group by 1 order by 1`),
    query(`select status, count(*)::int as n from orders
      where placed_at is not null and date_trunc('month', placed_at ${IST}) = date_trunc('month', now() ${IST})
      group by status`),
    query(`select i.product_name as name, sum(i.quantity)::int as packs, min(p.image_url) as image
       from orders o join order_items i on i.order_id = o.id
       join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
      where o.status not in ('pending_payment', 'cancelled')
        and date_trunc('month', o.placed_at ${IST}) = date_trunc('month', now() ${IST})
      group by i.product_name order by packs desc limit 5`),
    query(`select o.id, o.order_number, o.contact_name, o.status, o.placed_at, o.total_paise,
            (select string_agg(i.product_name || ' (' || trim(to_char(i.pack_kg, 'FM999')) || ' kg)', ', ' order by i.product_name)
               from order_items i where i.order_id = o.id) as products
       from orders o where o.status <> 'pending_payment'
      order by o.placed_at desc nulls last limit 6`),
    query(`select p.name, p.image_url as image, v.pack_kg, v.reorder_level,
            coalesce(s.on_hand - s.reserved, 0) as available
       from product_variants v join products p on p.id = v.product_id
       left join stock_locations l on l.is_fulfilment
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where v.is_active and p.is_active and v.price_paise is not null and v.reorder_level > 0
        and coalesce(s.on_hand - s.reserved, 0) <= v.reorder_level
      order by available limit 6`),
  ])
  const by = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]))
  const m = Object.fromEntries(month.rows.map((r) => [r.status, r.n]))
  return {
    counts: {
      toDispatch: (by.placed || 0) + (by.confirmed || 0) + (by.packed || 0),
      dispatched: by.shipped || 0,
      delivered: by.delivered || 0,
      openIssues: issues.rows[0].open,
      cancelled: (by.cancelled || 0) + (by.returned || 0),
    },
    todayOrders: today.rows[0].today,
    yesterdayOrders: today.rows[0].yesterday,
    todayByHour: Array.from({ length: 24 }, (_, h) => hours.rows.find((r) => r.hour === h)?.n || 0),
    monthStatus: {
      toDispatch: (m.placed || 0) + (m.confirmed || 0) + (m.packed || 0),
      dispatched: m.shipped || 0,
      delivered: m.delivered || 0,
      cancelled: (m.cancelled || 0) + (m.returned || 0),
    },
    topProducts: top.rows,
    recentOrders: recent.rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      customer: r.contact_name,
      products: r.products,
      status: r.status,
      placedAt: r.placed_at,
      ...(money ? { total: Number(r.total_paise) / 100 } : {}),
    })),
    lowStock: low.rows.map((r) => ({
      name: r.name, image: r.image, packKg: Number(r.pack_kg), available: r.available, reorderLevel: r.reorder_level,
    })),
  }
}
