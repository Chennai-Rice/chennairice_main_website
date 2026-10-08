// The ID register, read back: every Order ID and Shipment ID ever issued, with
// what became of it, and a health check proving there are no duplicates or
// gaps. Owner and admin only (see 'ids.view' in staff.js).
import { query } from '../db.js'
import { str } from './util.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// What a register line means, in words the office uses.
function outcome(r) {
  if (!r.order_status) return 'No order (claim not used)'
  if (r.order_status === 'pending_payment') return 'Awaiting payment'
  if (r.order_status === 'cancelled' && r.payment_status !== 'paid' && r.payment_status !== 'refunded') return 'Not paid (expired or cancelled)'
  return {
    placed: 'Paid · to dispatch', confirmed: 'Paid · to dispatch', packed: 'Paid · to dispatch',
    shipped: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
  }[r.order_status] || r.order_status
}

/**
 * One page of the register, newest first.
 * filters: kind ('order' | 'shipment' | 'all'), q (any ID, Razorpay ref or
 * customer name), paid ('yes' | 'no'), from / to (issue date, India).
 */
export async function listIssuedIds(f = {}, { maxLimit = 200 } = {}) {
  const params = []
  const add = (v) => {
    params.push(v)
    return '$' + params.length
  }
  const where = []
  const kind = ['order', 'shipment'].includes(f.kind) ? f.kind : f.kind === 'all' ? null : 'order'
  if (kind) where.push(`r.kind = ${add(kind)}`)
  if (DATE.test(str(f.from))) where.push(`(r.issued_at at time zone 'Asia/Kolkata')::date >= ${add(f.from)}::date`)
  if (DATE.test(str(f.to))) where.push(`(r.issued_at at time zone 'Asia/Kolkata')::date <= ${add(f.to)}::date`)
  if (f.paid === 'yes') where.push(`o.payment_status in ('paid', 'partially_refunded', 'refunded')`)
  if (f.paid === 'no') where.push(`(o.id is null or o.payment_status in ('pending', 'failed'))`)
  const q = str(f.q).slice(0, 100)
  if (q) {
    const like = add('%' + q + '%')
    where.push(`(r.value ilike ${like} or o.order_number ilike ${like} or o.shipment_id ilike ${like}
                 or o.contact_name ilike ${like}
                 or exists (select 1 from payments x where x.order_id = o.id
                            and (x.gateway_order_ref ilike ${like} or x.gateway_payment_id ilike ${like})))`)
  }
  const sql = where.length ? 'where ' + where.join(' and ') : ''
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), maxLimit)
  const offset = Math.max(Number(f.offset) || 0, 0)

  const { rows } = await query(
    `select r.value, r.kind, r.issued_at, o.id as order_id, o.order_number, o.shipment_id,
            o.status as order_status, o.payment_status, o.contact_name,
            pay.gateway, pay.gateway_order_ref, pay.gateway_payment_id, pay.paid_at
       from issued_ids r
       left join orders o on o.id = r.order_id
       left join lateral (
         select gateway, gateway_order_ref, gateway_payment_id, paid_at from payments p
          where p.order_id = o.id
          order by (p.status = 'paid') desc, p.created_at desc limit 1
       ) pay on true
      ${sql}
      order by r.issued_at desc, r.value
      limit ${limit} offset ${offset}`,
    params
  )
  const { rows: [{ n }] } = await query(
    `select count(*)::int as n from issued_ids r left join orders o on o.id = r.order_id ${sql}`, params)

  return {
    total: n,
    ids: rows.map((r) => ({
      id: r.value,
      kind: r.kind,
      issuedAt: r.issued_at,
      orderNumber: r.order_number,
      shipmentId: r.shipment_id,
      customer: r.contact_name,
      orderStatus: r.order_status,
      paymentStatus: r.payment_status,
      outcome: outcome(r),
      gateway: r.gateway,
      razorpayOrderId: r.gateway === 'razorpay' ? r.gateway_order_ref : null,
      paymentId: r.gateway_payment_id,
      paidAt: r.paid_at,
    })),
  }
}

function cell(value) {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

const istStamp = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export async function issuedIdsCsv(f = {}) {
  const { ids } = await listIssuedIds({ ...f, limit: 100000, offset: 0 }, { maxLimit: 100000 })
  const header = ['ID', 'Type', 'Issued', 'Order ID', 'Shipment ID', 'Customer', 'Outcome',
    'Payment status', 'Gateway', 'Razorpay order ID', 'Payment ID', 'Paid at']
  const lines = ids.map((r) => [
    r.id, r.kind === 'order' ? 'Order' : 'Shipment', istStamp(r.issuedAt), r.orderNumber, r.shipmentId, r.customer,
    r.outcome, r.paymentStatus, r.gateway, r.razorpayOrderId, r.paymentId, istStamp(r.paidAt),
  ].map(cell).join(','))
  return '﻿' + [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n'
}

/**
 * Proves the register is whole and nothing is shared:
 *   - every order's Order ID and Shipment ID, and every shipment number, is in it
 *   - each register entry points at the order that actually carries it
 *   - no Razorpay order or payment reference belongs to two orders
 * Returns the totals and a list of problems (empty when all is well).
 */
export async function checkRegister() {
  const checks = [
    ['Order IDs missing from the register',
      `select o.order_number as id from orders o
        where not exists (select 1 from issued_ids r where r.value = o.order_number and r.kind = 'order')`],
    ['Shipment IDs missing from the register',
      `select o.shipment_id as id from orders o where o.shipment_id is not null
        and not exists (select 1 from issued_ids r where r.value = o.shipment_id and r.kind = 'shipment')`],
    ['Shipment numbers missing from the register',
      `select s.shipment_number as id from shipments s
        where not exists (select 1 from issued_ids r where r.value = s.shipment_number)`],
    ['Register entries pointing at the wrong order',
      `select r.value as id from issued_ids r join orders o on o.id = r.order_id
        where (r.kind = 'order' and r.value <> o.order_number)
           or (r.kind = 'shipment' and r.value <> o.shipment_id and r.value not like o.shipment_id || '-%')`],
    ['Razorpay order IDs used by more than one order',
      `select gateway_order_ref as id from payments where gateway = 'razorpay'
        group by gateway_order_ref having count(distinct order_id) > 1`],
    ['Payment IDs used by more than one order',
      `select gateway_payment_id as id from payments where gateway_payment_id is not null
        group by gateway, gateway_payment_id having count(distinct order_id) > 1`],
  ]
  const problems = []
  for (const [label, sql] of checks) {
    const { rows } = await query(sql + ' limit 20')
    if (rows.length) problems.push({ check: label, examples: rows.map((r) => r.id) })
  }
  const { rows: [t] } = await query(
    `select count(*) filter (where kind = 'order')::int as orders,
            count(*) filter (where kind = 'shipment')::int as shipments,
            count(*) filter (where kind = 'order' and (issued_at at time zone 'Asia/Kolkata')::date
                                     = (now() at time zone 'Asia/Kolkata')::date)::int as orders_today,
            count(*) filter (where order_id is null)::int as unused
       from issued_ids`)
  return { ok: problems.length === 0, totals: t, problems }
}
