// Order operations for the team: the manual path from "paid" to "delivered".
//
//   placed ──sales confirms──▶ confirmed ──packed──▶ packed ──dispatch ships──▶ shipped ──▶ delivered
//      └──────────────── cancel (stock released) ───────────────┘                 └──▶ returned
//
// Every step checks the person's role, locks the order row so two people
// cannot move the same order at once, writes the status history and an audit
// row, and queues the customer email — all in one transaction.
import { tx, query } from '../db.js'
import { createRefund as razorpayRefund } from '../razorpay.js'
import { moveStock, releaseForOrder } from './stock.js'
import { queueEmail, templates, queueShippedEmail, cancelShippedEmails } from './email.js'
import { audit, requirePermission } from './staff.js'
import { findCourier, buildTrackingUrl } from './couriers.js'
import {
  httpError, str, toPaise, toRupees, financialYear, getSettings, recordOrderStatus, phoneKey, shipmentNumberFor, newShipmentId, parseTrackingRef, reserveId,
} from './util.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function assertId(id, what = 'order') {
  if (!UUID.test(String(id))) throw httpError('No such ' + what + '.', { status: 404 })
}

async function lockOrder(db, id) {
  assertId(id)
  const { rows: [order] } = await db.query('select * from orders where id = $1 for update', [id])
  if (!order) throw httpError('No such order.', { status: 404 })
  return order
}

function expectStatus(order, allowed, action) {
  if (!allowed.includes(order.status)) {
    throw httpError(`Order ${order.order_number} is ${order.status}; cannot ${action}.`, { status: 409 })
  }
}

async function setStatus(db, staff, order, to, extra = {}, reason = null) {
  const sets = ['status = $2']
  const params = [order.id, to]
  for (const [col, val] of Object.entries(extra)) {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  const { rows: [updated] } = await db.query(`update orders set ${sets.join(', ')} where id = $1 returning *`, params)
  await recordOrderStatus(db, { orderId: order.id, from: order.status, to, actor: 'staff', staffId: staff.id, reason })
  await audit(db, staff, 'order.' + to, 'order', order.id, reason ? { reason } : null)
  return updated
}

// ---- reading ----------------------------------------------------------------

export async function listOrders({ status, q, attention, limit = 50, offset = 0 } = {}) {
  const where = []
  const params = []
  if (status) {
    params.push(String(status).split(','))
    where.push(`o.status = any($${params.length})`)
  } else {
    // Unpaid baskets are noise for the team; show them only when asked.
    where.push(`o.status <> 'pending_payment'`)
  }
  if (attention === '1' || attention === true) where.push('o.needs_attention is not null')
  const term = str(q)
  if (term) {
    params.push('%' + term + '%')
    const like = `$${params.length}`
    const digits = phoneKey(term)
    params.push(digits.length >= 6 ? '%' + digits : '__no_match__')
    where.push(`(o.order_number ilike ${like} or o.contact_name ilike ${like} or o.contact_email::text ilike ${like}
                 or regexp_replace(o.contact_phone, '\\D', '', 'g') like $${params.length})`)
  }
  params.push(Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0))
  const { rows } = await query(
    `select o.id, o.order_number, o.status, o.payment_status, o.contact_name, o.contact_phone,
            o.ship_state, o.shipping_address->>'city' as city, o.total_paise, o.needs_attention,
            o.created_at, o.placed_at, o.shipped_at,
            (select coalesce(sum(quantity), 0) from order_items i where i.order_id = o.id)::int as packs
       from orders o
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by coalesce(o.placed_at, o.created_at) desc
      limit $${params.length - 1} offset $${params.length}`,
    params
  )
  return rows.map((r) => ({ ...r, total: toRupees(r.total_paise) }))
}

export async function getOrderDetail(id, db = { query }) {
  assertId(id)
  const { rows: [order] } = await db.query('select * from orders where id = $1', [id])
  if (!order) throw httpError('No such order.', { status: 404 })
  const [items, history, notes, payments, refunds, shipments, shipmentItems, invoice] = await Promise.all([
    db.query('select * from order_items where order_id = $1 order by product_name', [id]),
    db.query(
      `select h.*, s.full_name as staff_name from order_status_history h
         left join staff_users s on s.id = h.staff_id where order_id = $1 order by h.created_at, h.id`, [id]),
    db.query(
      `select n.*, s.full_name as staff_name from order_notes n
         left join staff_users s on s.id = n.staff_id where order_id = $1 order by n.created_at`, [id]),
    db.query('select id, gateway, gateway_order_ref, gateway_payment_id, amount_paise, status, method, card_last4, failure_reason, paid_at, created_at from payments where order_id = $1 order by created_at', [id]),
    db.query('select * from refunds where order_id = $1 order by created_at', [id]),
    db.query('select * from shipments where order_id = $1 order by created_at', [id]),
    db.query(
      `select si.*, b.batch_no from shipment_items si
         join shipments s on s.id = si.shipment_id
         left join production_batches b on b.id = si.batch_id
        where s.order_id = $1`, [id]),
    db.query('select * from invoices where order_id = $1', [id]),
  ])
  return {
    order,
    items: items.rows,
    history: history.rows,
    notes: notes.rows,
    payments: payments.rows,
    refunds: refunds.rows,
    shipments: shipments.rows.map((s) => ({ ...s, items: shipmentItems.rows.filter((i) => i.shipment_id === s.id) })),
    invoice: invoice.rows[0] || null,
  }
}

// ---- moving an order along ---------------------------------------------------

export async function confirmOrder(staff, id) {
  requirePermission(staff, 'order.confirm')
  return tx(async (db) => {
    const order = await lockOrder(db, id)
    expectStatus(order, ['placed'], 'confirm')
    if (order.needs_attention) {
      throw httpError('Resolve the flagged problem on this order before confirming it.', { status: 409 })
    }
    const updated = await setStatus(db, staff, order, 'confirmed', { confirmed_at: new Date() })
    await queueEmail(db, { to: updated.contact_email, ...templates.orderConfirmed(updated), orderId: id, dedupeKey: 'confirmed:' + id })
    return updated
  })
}

export async function packOrder(staff, id) {
  requirePermission(staff, 'order.pack')
  return tx(async (db) => {
    const order = await lockOrder(db, id)
    expectStatus(order, ['confirmed'], 'mark packed')
    return setStatus(db, staff, order, 'packed', { packed_at: new Date() })
  })
}

/**
 * Number for the nth shipment of an order, entered in the ID register: the
 * order's own shipment ID for the first, then ID-2, ID-3. An order paid
 * before shipment IDs existed is given one here, claimed like any other.
 */
async function shipmentNumberForNext(db, order, n) {
  let base = order.shipment_id
  if (!base) {
    base = await reserveId(db, 'shipment', newShipmentId, order.id)
    await db.query('update orders set shipment_id = $2 where id = $1', [order.id, base])
  }
  const number = shipmentNumberFor(base, n)
  if (n > 1) {
    // Derived from this order's own ID, so no other order can hold it.
    await db.query(
      `insert into issued_ids (value, kind, order_id) values ($1, 'shipment', $2) on conflict (value) do nothing`,
      [number, order.id])
  }
  return number
}

// Statuses the warehouse can still dispatch from. Confirmed and packed are
// kept for orders moved along from the office screens.
export const DISPATCHABLE = ['placed', 'confirmed', 'packed']

/**
 * The warehouse page's one switch: Dispatched.
 *
 *   on   the order leaves the mill: a shipment is recorded under the order's
 *        shipment ID (courier / vehicle details can be added later), the
 *        packs come out of stock, and the GST invoice is issued.
 *   off  a mis-tap corrected before delivery: the packs go back on hold, the
 *        shipment is marked cancelled (kept, because the stock ledger points
 *        at it) and the order is back to waiting. Switching on again reuses
 *        that same shipment, so the shipment ID never changes.
 *
 * `expect` is the status the page showed. If someone else moved the order
 * since, the change is refused and the page refreshes instead of overwriting.
 */
export async function setDispatched(staff, id, { on, expect } = {}) {
  requirePermission(staff, 'order.ship')
  if (typeof on !== 'boolean') throw httpError('Say whether the order is dispatched.')

  return tx(async (db) => {
    const order = await lockOrder(db, id)
    if (expect && order.status !== expect) {
      throw httpError('Order changed', {
        status: 409,
        publicMessage: `Someone else just updated ${order.order_number}. The list has been refreshed.`,
      })
    }
    const { rows: items } = await db.query('select * from order_items where order_id = $1', [id])

    if (on) {
      if (!DISPATCHABLE.includes(order.status)) {
        throw httpError(`Order ${order.order_number} is ${order.status}.`, {
          status: 409, publicMessage: `${order.order_number} is already ${order.status}.`,
        })
      }
      if (order.needs_attention) {
        throw httpError('Flagged', {
          status: 409, publicMessage: `${order.order_number} is flagged for checking. Ask sales or the owner to clear it first.`,
        })
      }

      let { rows: [shipment] } = await db.query(
        `select * from shipments where order_id = $1 and status = 'cancelled' order by created_at limit 1`, [id])
      if (shipment) {
        ;({ rows: [shipment] } = await db.query(
          `update shipments set status = 'shipped', shipped_at = now(), delivered_at = null, dispatched_by = $2
            where id = $1 returning *`, [shipment.id, staff.id]))
      } else {
        const { rows: [{ n }] } = await db.query('select count(*)::int as n from shipments where order_id = $1', [id])
        ;({ rows: [shipment] } = await db.query(
          `insert into shipments (order_id, shipment_number, location_id, dispatched_by)
           values ($1, $2, $3, $4) returning *`,
          [id, await shipmentNumberForNext(db, order, n + 1), order.fulfilment_location_id, staff.id]))
        for (const item of items) {
          await db.query('insert into shipment_items (shipment_id, order_item_id, quantity) values ($1, $2, $3)',
            [shipment.id, item.id, item.quantity])
        }
      }
      for (const item of items) {
        await moveStock(db, {
          locationId: order.fulfilment_location_id, variantId: item.variant_id, type: 'dispatch',
          onHand: -item.quantity, reserved: -item.quantity, orderId: id, shipmentId: shipment.id, staffId: staff.id,
        })
      }
      await db.query(`insert into shipment_status_history (shipment_id, to_status, staff_id, note) values ($1, 'shipped', $2, 'Dispatched from the warehouse page')`,
        [shipment.id, staff.id])
      const now = new Date()
      const updated = await setStatus(db, staff, order, 'shipped', {
        shipped_at: now, confirmed_at: order.confirmed_at || now, packed_at: order.packed_at || now,
      })
      await issueInvoice(db, updated)
      // The customer hears straight away; the AWB, when it comes, follows in a
      // "Tracking details" email (queueShippedEmail).
      await queueShippedEmail(db, updated, shipment)
      return { id, status: updated.status, shippedAt: updated.shipped_at }
    }

    if (order.status !== 'shipped') {
      throw httpError(`Order ${order.order_number} is ${order.status}.`, {
        status: 409,
        publicMessage: order.status === 'delivered'
          ? `${order.order_number} is already delivered and cannot be un-dispatched.`
          : `${order.order_number} is not dispatched.`,
      })
    }
    const { rows: shipments } = await db.query(`select * from shipments where order_id = $1 and status = 'shipped'`, [id])
    for (const s of shipments) {
      const { rows: lines } = await db.query(
        `select si.quantity, i.variant_id from shipment_items si join order_items i on i.id = si.order_item_id where si.shipment_id = $1`, [s.id])
      for (const line of lines) {
        await moveStock(db, {
          locationId: s.location_id, variantId: line.variant_id, type: 'dispatch_reversal',
          onHand: line.quantity, reserved: line.quantity, orderId: id, shipmentId: s.id, staffId: staff.id,
          reason: 'Dispatch undone on the warehouse page',
        })
      }
      await db.query(`update shipments set status = 'cancelled' where id = $1`, [s.id])
      await cancelShippedEmails(db, s.id, 'Dispatch undone before the email went out')
      await db.query(`insert into shipment_status_history (shipment_id, from_status, to_status, staff_id, note) values ($1, 'shipped', 'cancelled', $2, 'Dispatch undone on the warehouse page')`,
        [s.id, staff.id])
    }
    const updated = await setStatus(db, staff, order, 'placed', { shipped_at: null }, 'Dispatch undone on the warehouse page')
    return { id, status: updated.status, shippedAt: null }
  })
}

/** Dispatch (or undo) several orders: each in its own transaction, so one
 *  refusal does not hold back the rest. Reports every order's outcome. */
export async function setDispatchedMany(staff, { ids, on } = {}) {
  requirePermission(staff, 'order.ship')
  if (!Array.isArray(ids) || !ids.length) throw httpError('Select at least one order.')
  if (ids.length > 200) throw httpError('Select at most 200 orders at a time.')
  const results = []
  for (const id of [...new Set(ids.map(String))]) {
    try {
      const r = await setDispatched(staff, id, { on })
      results.push({ id, ok: true, status: r.status })
    } catch (err) {
      results.push({ id, ok: false, error: err.publicMessage || err.message })
    }
  }
  return { results, done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length }
}

const SHIP_METHODS = ['own_vehicle', 'courier', 'transport', 'pickup']

function shipmentInput(body) {
  const s = (k, max = 200) => {
    const v = str(body?.[k])
    if (v.length > max) throw httpError(k + ' is too long.')
    return v || null
  }
  const input = {
    method: s('method'),
    carrierName: s('carrierName'),
    trackingNumber: s('trackingNumber', 100),
    lrNumber: s('lrNumber', 100),
    trackingUrl: s('trackingUrl', 500),
    vehicleNumber: s('vehicleNumber', 30),
    driverName: s('driverName', 100),
    driverPhone: s('driverPhone', 20),
    expectedDelivery: s('expectedDelivery', 10),
    notes: s('notes', 2000),
  }
  if (!SHIP_METHODS.includes(input.method)) throw httpError('Method must be one of ' + SHIP_METHODS.join(', ') + '.')
  if (input.method === 'courier' && !(input.carrierName && input.trackingNumber)) throw httpError('A courier needs its name and tracking number.')
  if (input.method === 'transport' && !(input.carrierName && input.lrNumber)) throw httpError('Transport needs the company name and LR number.')
  if (input.method === 'own_vehicle' && !input.vehicleNumber) throw httpError('Own vehicle needs the vehicle number.')
  if (input.trackingUrl && !/^https:\/\//i.test(input.trackingUrl)) throw httpError('Tracking link must start with https://')
  if (input.expectedDelivery && !/^\d{4}-\d{2}-\d{2}$/.test(input.expectedDelivery)) throw httpError('Expected delivery must be YYYY-MM-DD.')
  // A known courier without a link gets its own tracking page, pre-filled where it allows.
  const courier = input.method === 'courier' ? findCourier(input.carrierName) : null
  if (courier) {
    input.carrierName = courier.name
    if (!input.trackingUrl) input.trackingUrl = buildTrackingUrl(courier, input.trackingNumber)
  }
  return input
}

/** Issue the GST invoice for an order (once; returns the existing one after). */
export async function issueInvoice(db, order) {
  const { rows: [existing] } = await db.query('select * from invoices where order_id = $1', [order.id])
  if (existing) return existing
  const settings = await getSettings(db)
  const fy = financialYear()
  const { rows: [counter] } = await db.query(
    `insert into invoice_counters (financial_year, last_number) values ($1, 1)
     on conflict (financial_year) do update set last_number = invoice_counters.last_number + 1
     returning last_number`,
    [fy]
  )
  const number = `${settings.invoice_prefix || 'CRI'}/${fy}/${String(counter.last_number).padStart(6, '0')}`
  const { rows: [t] } = await db.query(
    `select sum(taxable_paise)::bigint as taxable, sum(cgst_paise)::bigint as cgst,
            sum(sgst_paise)::bigint as sgst, sum(igst_paise)::bigint as igst
       from order_items where order_id = $1`,
    [order.id]
  )
  const seller = {
    name: settings.seller_legal_name, address: settings.seller_address, gstin: settings.seller_gstin || null,
    state: settings.seller_state, stateCode: settings.seller_state_code, phone: settings.seller_phone, email: settings.seller_email,
  }
  const buyer = { name: order.contact_name, phone: order.contact_phone, email: order.contact_email, address: order.shipping_address }
  const { rows: [invoice] } = await db.query(
    `insert into invoices (order_id, invoice_number, financial_year, seller, buyer, place_of_supply,
                           taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [order.id, number, fy, seller, buyer, order.ship_state, t.taxable, t.cgst, t.sgst, t.igst, order.total_paise]
  )
  return invoice
}

/**
 * Dispatch the whole order: records how it left, takes the packs out of stock
 * (from reserved), issues the invoice and emails the customer.
 * body.batches optionally maps order_item_id → production batch id.
 */
export async function shipOrder(staff, id, body) {
  requirePermission(staff, 'order.ship')
  const input = shipmentInput(body)
  return tx(async (db) => {
    const order = await lockOrder(db, id)
    expectStatus(order, DISPATCHABLE, 'ship')
    if (order.needs_attention) throw httpError('Resolve the flagged problem on this order before shipping it.', { status: 409 })

    const { rows: items } = await db.query('select * from order_items where order_id = $1', [id])
    const details = [input.method, input.carrierName, input.trackingNumber, input.lrNumber, input.trackingUrl,
      input.vehicleNumber, input.driverName, input.driverPhone, input.expectedDelivery, input.notes, staff.id]
    // A dispatch switched off earlier left a cancelled shipment: reuse it, so
    // the order keeps the one shipment ID the customer was given.
    let { rows: [shipment] } = await db.query(
      `select * from shipments where order_id = $1 and status = 'cancelled' order by created_at limit 1`, [id])
    const reused = Boolean(shipment)
    if (reused) {
      ;({ rows: [shipment] } = await db.query(
        `update shipments set method = $2, carrier_name = $3, tracking_number = $4, lr_number = $5, tracking_url = $6,
                vehicle_number = $7, driver_name = $8, driver_phone = $9, expected_delivery = $10, notes = $11,
                dispatched_by = $12, status = 'shipped', shipped_at = now(), delivered_at = null
          where id = $1 returning *`,
        [shipment.id, ...details]))
    } else {
      const { rows: [{ n }] } = await db.query('select count(*)::int as n from shipments where order_id = $1', [id])
      ;({ rows: [shipment] } = await db.query(
        `insert into shipments (order_id, shipment_number, location_id, method, carrier_name, tracking_number, lr_number,
                                tracking_url, vehicle_number, driver_name, driver_phone, expected_delivery, notes, dispatched_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning *`,
        [id, await shipmentNumberForNext(db, order, n + 1), order.fulfilment_location_id, ...details]))
    }

    const batches = body?.batches && typeof body.batches === 'object' ? body.batches : {}
    for (const item of items) {
      const batchId = batches[item.id] || null
      if (batchId) {
        assertId(batchId, 'batch')
        const { rowCount } = await db.query('select 1 from production_batches where id = $1 and variant_id = $2', [batchId, item.variant_id])
        if (!rowCount) throw httpError(`Batch does not match ${item.product_name}.`)
      }
      if (reused) {
        await db.query('update shipment_items set batch_id = $3 where shipment_id = $1 and order_item_id = $2', [shipment.id, item.id, batchId])
      } else {
        await db.query(
          'insert into shipment_items (shipment_id, order_item_id, quantity, batch_id) values ($1, $2, $3, $4)',
          [shipment.id, item.id, item.quantity, batchId]
        )
      }
      await moveStock(db, {
        locationId: order.fulfilment_location_id, variantId: item.variant_id, type: 'dispatch',
        onHand: -item.quantity, reserved: -item.quantity, orderId: id, shipmentId: shipment.id, batchId, staffId: staff.id,
      })
    }
    await db.query(`insert into shipment_status_history (shipment_id, to_status, staff_id) values ($1, 'shipped', $2)`, [shipment.id, staff.id])

    const updated = await setStatus(db, staff, order, 'shipped', {
      shipped_at: new Date(), packed_at: order.packed_at || new Date(),
    })
    const invoice = await issueInvoice(db, updated)
    await queueShippedEmail(db, updated, shipment)
    return { order: updated, shipment, invoice }
  })
}

/**
 * The Dispatch page's "Packing" step: an order being packed now (on) or put
 * back to Ready (off). Only between ready and packing; dispatch comes after.
 */
export async function setPacking(staff, id, { on, expect } = {}) {
  requirePermission(staff, 'order.pack')
  if (typeof on !== 'boolean') throw httpError('Say whether the order is being packed.')
  return tx(async (db) => {
    const order = await lockOrder(db, id)
    if (expect && order.status !== expect) {
      throw httpError('Order changed', { status: 409, publicMessage: `Someone else just updated ${order.order_number}. The list has been refreshed.` })
    }
    if (on) {
      expectStatus(order, ['placed', 'confirmed'], 'start packing')
      if (order.needs_attention) {
        throw httpError('Flagged', { status: 409, publicMessage: `${order.order_number} is flagged for checking. Ask sales or the owner to clear it first.` })
      }
      const now = new Date()
      return setStatus(db, staff, order, 'packed', { packed_at: now, confirmed_at: order.confirmed_at || now })
    }
    expectStatus(order, ['packed'], 'move back to Ready')
    return setStatus(db, staff, order, 'confirmed', { packed_at: null }, 'Moved back to Ready to dispatch')
  })
}

/**
 * Add or correct how a dispatched shipment is travelling (vehicle, courier,
 * transport and LR number, expected date) after it has left: for orders
 * dispatched with the one-tap switch, or a typo fixed later.
 */
export async function updateShipmentDetails(staff, shipmentId, body) {
  requirePermission(staff, 'order.ship')
  assertId(shipmentId, 'shipment')
  const input = shipmentInput(body)
  return tx(async (db) => {
    const { rows: [s] } = await db.query('select * from shipments where id = $1 for update', [shipmentId])
    if (!s) throw httpError('No such shipment.', { status: 404 })
    if (s.status !== 'shipped') throw httpError(`That shipment is ${s.status}.`, { status: 409 })
    const { rows: [updated] } = await db.query(
      `update shipments set method = $2, carrier_name = $3, tracking_number = $4, lr_number = $5, tracking_url = $6,
              vehicle_number = $7, driver_name = $8, driver_phone = $9, expected_delivery = $10, notes = $11
        where id = $1 returning *`,
      [s.id, input.method, input.carrierName, input.trackingNumber, input.lrNumber, input.trackingUrl,
        input.vehicleNumber, input.driverName, input.driverPhone, input.expectedDelivery, input.notes])
    await db.query(`insert into shipment_status_history (shipment_id, from_status, to_status, staff_id, note) values ($1, 'shipped', 'shipped', $2, 'Shipping details updated')`,
      [s.id, staff.id])
    await audit(db, staff, 'shipment.details', 'shipment', s.id, { method: input.method })
    const { rows: [order] } = await db.query('select * from orders where id = $1', [s.order_id])
    await queueShippedEmail(db, order, updated)
    return updated
  })
}

export async function deliverShipment(staff, shipmentId, body = {}) {
  requirePermission(staff, 'order.deliver')
  assertId(shipmentId, 'shipment')
  return tx(async (db) => {
    const { rows: [shipment] } = await db.query('select * from shipments where id = $1 for update', [shipmentId])
    if (!shipment) throw httpError('No such shipment.', { status: 404 })
    if (shipment.status !== 'shipped') throw httpError('That shipment is already ' + shipment.status + '.', { status: 409 })
    const proof = str(body.proofOfDeliveryPath) || null
    const note = str(body.note) || null
    const { rows: [done] } = await db.query(
      `update shipments set status = 'delivered', delivered_at = now(), delivered_by = $2,
              proof_of_delivery_path = coalesce($3, proof_of_delivery_path)
        where id = $1 returning *`,
      [shipmentId, staff.id, proof]
    )
    await db.query(
      `insert into shipment_status_history (shipment_id, from_status, to_status, staff_id, note) values ($1, 'shipped', 'delivered', $2, $3)`,
      [shipmentId, staff.id, note]
    )
    await cancelShippedEmails(db, shipmentId, 'Delivered before the tracking was added', { onlyWaiting: true })
    const order = await lockOrder(db, shipment.order_id)
    const { rows: [{ open }] } = await db.query(
      `select count(*)::int as open from shipments where order_id = $1 and status = 'shipped'`, [order.id])
    let updated = order
    if (!open && order.status === 'shipped') {
      updated = await setStatus(db, staff, order, 'delivered', { delivered_at: new Date() }, note)
      await queueEmail(db, { to: updated.contact_email, ...templates.orderDelivered(updated), orderId: order.id, dedupeKey: 'delivered:' + order.id })
    }
    return { order: updated, shipment: done }
  })
}

export async function cancelOrder(staff, id, body = {}) {
  requirePermission(staff, 'order.cancel')
  const reason = str(body.reason)
  if (!reason) throw httpError('Please give a reason for cancelling.')
  const result = await tx(async (db) => {
    const order = await lockOrder(db, id)
    expectStatus(order, ['pending_payment', 'placed', 'confirmed', 'packed'], 'cancel')
    await releaseForOrder(db, { orderId: id, reason: 'Cancelled: ' + reason, staffId: staff.id })
    await db.query(`update payments set status = 'superseded' where order_id = $1 and status = 'created'`, [id])
    const updated = await setStatus(db, staff, order, 'cancelled', { cancelled_at: new Date(), cancel_reason: reason }, reason)
    if (order.payment_status === 'paid' && !body.refund) {
      await db.query(`update orders set needs_attention = 'Cancelled after payment: refund the customer.' where id = $1`, [id])
    }
    if (order.status !== 'pending_payment') {
      const note = order.payment_status === 'paid' ? 'Your payment will be refunded in full.' : null
      await queueEmail(db, { to: updated.contact_email, ...templates.orderCancelled(updated, note), orderId: id, dedupeKey: 'cancelled:' + id })
    }
    return updated
  })
  if (body.refund && result.payment_status === 'paid') {
    await refundOrder(staff, id, { reason: 'Order cancelled: ' + reason })
  }
  return result
}

export async function returnOrder(staff, id, body = {}) {
  requirePermission(staff, 'order.return')
  const reason = str(body.reason)
  if (!reason) throw httpError('Please give a reason for the return.')
  // restock=true puts the packs back on the shelf; false records them as damaged.
  const restock = body.restock !== false
  return tx(async (db) => {
    const order = await lockOrder(db, id)
    expectStatus(order, ['shipped', 'delivered'], 'record a return')
    const { rows: items } = await db.query('select * from order_items where order_id = $1', [id])
    for (const item of items) {
      await moveStock(db, {
        locationId: order.fulfilment_location_id, variantId: item.variant_id, type: 'return_in',
        ...(restock ? { onHand: item.quantity } : { damaged: item.quantity }),
        orderId: id, reason, staffId: staff.id,
      })
    }
    await db.query(`update shipments set status = 'returned' where order_id = $1 and status in ('shipped', 'delivered')`, [id])
    const updated = await setStatus(db, staff, order, 'returned', {}, reason)
    if (order.payment_status === 'paid') {
      await db.query(`update orders set needs_attention = 'Returned: decide on a refund.' where id = $1`, [id])
    }
    return updated
  })
}

export async function addNote(staff, id, body) {
  requirePermission(staff, 'order.note')
  assertId(id)
  const text = str(body?.body)
  if (!text) throw httpError('The note is empty.')
  if (text.length > 4000) throw httpError('Notes are limited to 4000 characters.')
  const { rows: [note] } = await query(
    'insert into order_notes (order_id, staff_id, body) values ($1, $2, $3) returning *',
    [id, staff.id, text]
  )
  return note
}

export async function resolveAttention(staff, id, body = {}) {
  requirePermission(staff, 'order.resolve')
  const note = str(body.note)
  if (!note) throw httpError('Say how it was resolved.')
  return tx(async (db) => {
    const order = await lockOrder(db, id)
    if (!order.needs_attention) return order
    await db.query('insert into order_notes (order_id, staff_id, body) values ($1, $2, $3)',
      [id, staff.id, `Resolved "${order.needs_attention}": ${note}`])
    const { rows: [updated] } = await db.query('update orders set needs_attention = null where id = $1 returning *', [id])
    await audit(db, staff, 'order.resolve', 'order', id, { was: order.needs_attention, note })
    return updated
  })
}

/**
 * Refund all or part of an order. Razorpay payments are refunded through the
 * API; Zoho Payments refunds are recorded here and done from the Zoho
 * dashboard (status "manual").
 * body.amount is in rupees; omitted means "everything not yet refunded".
 */
export async function refundOrder(staff, id, body = {}) {
  requirePermission(staff, 'refund.create')
  const reason = str(body.reason)
  if (!reason) throw httpError('Please give a reason for the refund.')

  // Reserve the refund in the database first, so two clicks cannot both pass
  // the "not more than was paid" check.
  const { refund, payment, order } = await tx(async (db) => {
    const order = await lockOrder(db, id)
    const { rows: [payment] } = await db.query(`select * from payments where order_id = $1 and status = 'paid'`, [id])
    if (!payment) throw httpError('This order has no successful payment to refund.', { status: 409 })
    const { rows: [{ done }] } = await db.query(
      `select coalesce(sum(amount_paise), 0)::bigint as done from refunds where payment_id = $1 and status <> 'failed'`, [payment.id])
    const remaining = payment.amount_paise - done
    const amount = body.amount == null ? remaining : toPaise(body.amount)
    if (!(amount > 0)) throw httpError('Nothing left to refund on this order.', { status: 409 })
    if (amount > remaining) throw httpError(`At most ₹${toRupees(remaining)} can still be refunded.`, { status: 409 })
    const { rows: [refund] } = await db.query(
      `insert into refunds (payment_id, order_id, amount_paise, reason, status, staff_id)
       values ($1, $2, $3, $4, 'pending', $5) returning *`,
      [payment.id, id, amount, reason, staff.id]
    )
    return { refund, payment, order }
  })

  let status = 'manual'
  let gatewayRefundId = null
  let raw = null
  if (payment.gateway === 'razorpay') {
    try {
      raw = await razorpayRefund(payment.gateway_payment_id, {
        amountPaise: refund.amount_paise, receipt: refund.id.slice(0, 40), notes: { order_number: order.order_number },
      })
      gatewayRefundId = raw.id
      status = raw.status === 'processed' ? 'processed' : 'pending'
    } catch (err) {
      await query(`update refunds set status = 'failed', raw = $2 where id = $1`, [refund.id, { error: err.message }])
      throw httpError('Razorpay refused the refund: ' + err.message, { status: 502, publicMessage: 'Razorpay refused the refund. ' + (err.message || '') })
    }
  }

  return tx(async (db) => {
    const { rows: [saved] } = await db.query(
      `update refunds set status = $2, gateway_refund_id = $3, raw = $4,
              processed_at = case when $2 = 'processed' then now() else null end
        where id = $1 returning *`,
      [refund.id, status, gatewayRefundId, raw]
    )
    const { rows: [{ done }] } = await db.query(
      `select coalesce(sum(amount_paise), 0)::bigint as done from refunds where payment_id = $1 and status <> 'failed'`, [payment.id])
    const full = done >= payment.amount_paise
    const { rows: [updated] } = await db.query(
      `update orders set payment_status = $2,
              needs_attention = case when $3 then null else needs_attention end
        where id = $1 returning *`,
      [id, full ? 'refunded' : 'partially_refunded', full]
    )
    await audit(db, staff, 'refund.create', 'order', id, { amount_paise: refund.amount_paise, gateway: payment.gateway, status })
    await queueEmail(db, { to: updated.contact_email, ...templates.refundIssued(updated, refund.amount_paise), orderId: id, dedupeKey: 'refund:' + refund.id })
    return {
      refund: saved,
      order: updated,
      ...(status === 'manual' ? { action: 'Refund this amount from the Zoho Payments dashboard; it is recorded here.' } : {}),
    }
  })
}

// ---- customer-facing tracking ------------------------------------------------

/**
 * Order status from an order number or shipment ID alone (pasted from the
 * receipt). No phone number is asked for, so nothing private is returned:
 * no name, address, phone or prices, only the status, the delivery city, the
 * packs and the courier details. Wrong guesses are rate-limited in routes.js.
 * The receipt link also sends the private order id; if given it must match.
 */
export async function trackOrder({ orderNumber, orderId }) {
  const ref = parseTrackingRef(orderNumber)
  const notFound = httpError('Not found', { status: 404, publicMessage: 'We could not find that order. Please check the order number or shipment ID on your receipt.' })
  if (!ref) throw notFound
  const { rows: [order] } = ref.orderNumber
    ? await query('select * from orders where order_number = $1', [ref.orderNumber])
    : await query('select * from orders where shipment_id = $1', [ref.shipmentId])
  if (!order || order.status === 'pending_payment') throw notFound
  if (orderId && String(orderId).toLowerCase() !== order.id) throw notFound

  const [{ rows: items }, { rows: history }, { rows: shipments }] = await Promise.all([
    query('select product_name, pack_kg, quantity from order_items where order_id = $1 order by product_name', [order.id]),
    query('select to_status, created_at from order_status_history where order_id = $1 order by created_at, id', [order.id]),
    query(
      `select shipment_number, method, carrier_name, tracking_number, lr_number, tracking_url, status, expected_delivery, shipped_at, delivered_at
         from shipments where order_id = $1 and status <> 'cancelled' order by created_at`, [order.id]),
  ])
  return {
    orderNumber: order.order_number,
    shipmentId: order.shipment_id,
    status: order.status,
    paymentStatus: order.payment_status,
    placedAt: order.placed_at,
    city: order.shipping_address.city,
    items: items.map((i) => ({ name: i.product_name, packKg: i.pack_kg, qty: i.quantity })),
    timeline: history.map((h) => ({ status: h.to_status, at: h.created_at })),
    shipments: shipments.map((s) => ({
      shipmentId: s.shipment_number,
      method: s.method, carrier: s.carrier_name, trackingNumber: s.tracking_number, lrNumber: s.lr_number,
      trackingUrl: s.tracking_url, status: s.status, expectedDelivery: s.expected_delivery,
      // False when the link opens the courier's search page and the number must be pasted in.
      trackingPrefilled: Boolean(s.tracking_url && s.tracking_number && s.tracking_url.includes(encodeURIComponent(s.tracking_number))),
      shippedAt: s.shipped_at, deliveredAt: s.delivered_at,
    })),
  }
}

/**
 * The GST invoice for the customer who just paid. The order id (a random
 * UUID only that buyer's browser was given) and the order number must both
 * match. The invoice is issued on first request if dispatch has not issued it
 * yet, and its number then stays the same for good.
 */
export async function customerInvoice({ orderId, orderNumber }) {
  const notFound = httpError('Not found', { status: 404, publicMessage: 'We could not find that invoice.' })
  if (!UUID.test(String(orderId)) || !str(orderNumber)) throw notFound
  await tx(async (db) => {
    const { rows: [order] } = await db.query('select * from orders where id = $1 for update', [orderId])
    if (!order || order.order_number !== str(orderNumber).toUpperCase()) throw notFound
    if (!['paid', 'partially_refunded'].includes(order.payment_status) || order.status === 'cancelled') {
      throw httpError('Not invoiceable', { status: 409, publicMessage: 'An invoice is only available for a paid order.' })
    }
    await issueInvoice(db, order)
  })
  return getOrderDetail(orderId)
}
