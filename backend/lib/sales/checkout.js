// Guest checkout on the sales database.
//
// Answers /api/checkout/session and /api/checkout/verify with exactly the same
// response shapes as the earlier Supabase version (lib/checkout.js), so the
// storefront's CheckoutPage needs no change when the switch is made.
//
//   session  validate buyer → price cart → create order + HOLD STOCK (30 min)
//            → open a payment on the first working gateway
//   verify   ask the gateway what happened → mark paid → queue emails
//
// A Razorpay webhook (webhooks.js) reaches the same markOrderPaid(), so a
// customer who pays and closes the tab before the browser reports back still
// gets their order.
import { tx, query } from '../db.js'
import { createSessionWithFailover, getGateway } from '../gateways.js'
import { priceCart, quoteShipping } from './catalog.js'
import { moveStock, releaseForOrder } from './stock.js'
import { queueEmail, staffInbox, templates } from './email.js'
import {
  httpError, str, toRupees, getSettings, recordOrderStatus, newShipmentId, newOrderNumber, reserveId, linkId,
} from './util.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+()\-\s\d]{8,16}$/
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/

export function buildGuestCustomer(body) {
  const f = (k) => str(body?.[k])
  const c = {
    name: f('name'), email: f('email').toLowerCase(), phone: f('phone'),
    addressLine1: f('addressLine1'), addressLine2: f('addressLine2'), city: f('city'),
    state: f('state'), pincode: f('pincode'), landmark: f('landmark'),
  }
  if (!c.name || c.name.length > 120) return { error: 'Please tell us your name.' }
  if (!c.email || !EMAIL_PATTERN.test(c.email) || c.email.length > 200) return { error: 'A valid email address is required.' }
  if (!c.phone || !PHONE_PATTERN.test(c.phone)) return { error: 'A valid phone number is required.' }
  if (!c.addressLine1) return { error: 'Please add your delivery address.' }
  if (!c.city) return { error: 'Please add your city or town.' }
  if (!c.state) return { error: 'Please add your state.' }
  if (!PINCODE_PATTERN.test(c.pincode)) return { error: 'A valid 6-digit PIN code is required.' }
  for (const k of ['addressLine1', 'addressLine2', 'city', 'state', 'landmark']) {
    if (c[k].length > 300) return { error: 'One of the address fields is too long.' }
  }
  return { customer: c }
}

/** Price a cart for display (no order is created, nothing is held). */
export async function quoteCart(body) {
  const priced = await priceCart({ query }, body?.items, { shipState: str(body?.state) })
  const shipping = await quoteShipping({ query }, { state: body?.state, subtotalPaise: priced.subtotalPaise, totalKg: priced.totalKg })
  return {
    lines: priced.lines.map((l) => ({
      id: l.slug + '-' + l.packKg + 'kg', name: l.name, packKg: l.packKg, qty: l.quantity,
      unitPrice: toRupees(l.unitPricePaise), lineTotal: toRupees(l.lineTotalPaise),
    })),
    subtotal: toRupees(priced.subtotalPaise),
    shipping: toRupees(shipping),
    total: toRupees(priced.subtotalPaise + shipping),
    taxIncluded: toRupees(priced.taxPaise),
    currency: 'INR',
  }
}

/** Create the order and hold its stock, all or nothing. */
export async function placeOrder(customer, items) {
  return tx(async (db) => {
    const settings = await getSettings(db)
    const holdMinutes = Number(settings.reservation_minutes) || 30

    const { rows: [loc] } = await db.query('select id from stock_locations where is_fulfilment and is_active')
    if (!loc) throw httpError('No fulfilment location is set up.', { status: 503, publicMessage: 'Ordering is temporarily unavailable.' })

    const priced = await priceCart(db, items, { shipState: customer.state })
    const shipping = await quoteShipping(db, { state: customer.state, subtotalPaise: priced.subtotalPaise, totalKg: priced.totalKg })

    const { rows: [cust] } = await db.query(
      `insert into customers (email, name, phone) values ($1, $2, $3)
       on conflict (email) do update set name = excluded.name, phone = excluded.phone
       returning id`,
      [customer.email, customer.name, customer.phone]
    )

    const address = {
      line1: customer.addressLine1, line2: customer.addressLine2 || null, landmark: customer.landmark || null,
      city: customer.city, state: customer.state, pincode: customer.pincode,
    }
    const { rows: [order] } = await db.query(
      `insert into orders (order_number, customer_id, contact_name, contact_email, contact_phone,
                           shipping_address, ship_state, fulfilment_location_id,
                           subtotal_paise, shipping_paise, total_paise, tax_paise, reservation_expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() + make_interval(mins => $13))
       returning *`,
      [await reserveId(db, 'order', newOrderNumber), cust.id, customer.name, customer.email, customer.phone,
        address, customer.state, loc.id, priced.subtotalPaise, shipping,
        priced.subtotalPaise + shipping, priced.taxPaise, holdMinutes]
    )
    await linkId(db, order.order_number, order.id)

    for (const l of priced.lines) {
      await db.query(
        `insert into order_items (order_id, variant_id, product_name, sku, pack_kg, hsn_code, tax_rate_bp,
                                  unit_price_paise, quantity, line_total_paise, taxable_paise,
                                  cgst_paise, sgst_paise, igst_paise)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [order.id, l.variantId, l.name, l.sku, l.packKg, l.hsnCode, l.taxRateBp, l.unitPricePaise,
          l.quantity, l.lineTotalPaise, l.taxable, l.cgst, l.sgst, l.igst]
      )
      await moveStock(db, { locationId: loc.id, variantId: l.variantId, type: 'reserve', reserved: l.quantity, orderId: order.id })
    }

    await recordOrderStatus(db, { orderId: order.id, from: null, to: 'pending_payment', actor: 'customer' })
    return order
  })
}

/** A pending order the same buyer is retrying. The email is the only proof
 *  of ownership a guest has, so it must match. */
async function loadResumable(orderId, email) {
  return tx(async (db) => {
    const { rows: [order] } = await db.query('select * from orders where id = $1 for update', [orderId])
    if (!order) throw httpError('That order does not exist.', { status: 404 })
    if (order.contact_email.toLowerCase() !== email.toLowerCase()) {
      throw httpError('Email does not match order.', { status: 403, publicMessage: 'Those details do not match that order.' })
    }
    if (order.payment_status === 'paid') {
      throw httpError('Order already paid.', { status: 409, publicMessage: 'That order is already paid — no need to pay again.' })
    }
    if (order.status !== 'pending_payment' || new Date(order.reservation_expires_at) < new Date()) {
      throw httpError('Order expired.', { status: 410, publicMessage: 'That order has expired. Please place it again.' })
    }
    // Still holding stock — give the buyer a fresh window to finish paying.
    const { rows: [fresh] } = await db.query(
      `update orders set reservation_expires_at = greatest(reservation_expires_at, now() + interval '30 minutes')
        where id = $1 returning *`,
      [orderId]
    )
    return fresh
  })
}

function invalidUuid(id) {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export async function createCheckoutSession(body) {
  const { customer, error } = buildGuestCustomer(body)
  if (error) throw httpError(error)

  const resumeId = str(body?.orderId)
  if (resumeId && invalidUuid(resumeId)) throw httpError('That order does not exist.', { status: 404 })
  const order = resumeId ? await loadResumable(resumeId, customer.email) : await placeOrder(customer, body?.items)

  const exclude = [].concat(body?.excludeGateway || []).map((g) => str(g).toLowerCase()).filter(Boolean)
  // If no gateway answers, the order stays pending with its stock held until
  // the hold lapses, so the customer can retry without losing their basket.
  const session = await createSessionWithFailover({
    exclude,
    amount: toRupees(order.total_paise),
    currency: 'INR',
    orderNumber: order.order_number,
    orderId: order.id,
    customer,
  })

  await tx(async (db) => {
    // Exactly one live attempt per order, so verification can never be
    // checked against a stale reference.
    await db.query(`update payments set status = 'superseded' where order_id = $1 and status = 'created'`, [order.id])
    await db.query(
      `insert into payments (order_id, gateway, gateway_order_ref, amount_paise) values ($1, $2, $3, $4)`,
      [order.id, session.gateway, session.reference, order.total_paise]
    )
    if (order.payment_status === 'failed') {
      await db.query(`update orders set payment_status = 'pending' where id = $1`, [order.id])
    }
  })

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    amount: toRupees(order.total_paise),
    currency: 'INR',
    gateway: session.gateway,
    gatewayLabel: session.label,
    testMode: session.testMode,
    client: session.client,
    customer: { name: customer.name, email: customer.email, phone: customer.phone },
    failedOver: session.attempts.length ? session.attempts.map((a) => a.gateway) : undefined,
  }
}

/**
 * Record a successful payment against its order. Used by browser verification
 * and by the webhook; safe to call twice for the same payment.
 *
 * @returns {{ order, payment, already: boolean, mismatch: boolean }}
 */
export async function markOrderPaid({ paymentRowId, outcome, actor }) {
  return tx(async (db) => {
    const { rows: [payment] } = await db.query('select * from payments where id = $1 for update', [paymentRowId])
    const { rows: [order] } = await db.query('select * from orders where id = $1 for update', [payment.order_id])

    if (payment.status === 'paid') return { order, payment, already: true, mismatch: false }

    if (order.payment_status === 'paid') {
      // A second, different payment for an already-paid order: money taken
      // twice. Keep the evidence and flag it for a refund.
      await db.query(
        `update payments set status = 'failed', gateway_payment_id = $2, failure_reason = $3, raw = $4 where id = $1`,
        [payment.id, outcome.transactionId, 'Duplicate payment for an already-paid order — refund it', outcome.raw]
      )
      await db.query(`update orders set needs_attention = $2 where id = $1`,
        [order.id, 'Customer paid twice (payment ' + outcome.transactionId + '). Refund the duplicate.'])
      return { order, payment, already: true, mismatch: false }
    }

    const { rows: [paid] } = await db.query(
      `update payments set status = 'paid', gateway_payment_id = $2, amount_paise = $3, currency = $4,
              method = $5, card_last4 = $6, raw = $7, paid_at = now()
        where id = $1 returning *`,
      [payment.id, outcome.transactionId, outcome.amountPaise, outcome.currency || 'INR',
        outcome.method || null, outcome.last4 || null, outcome.raw ?? null]
    )

    const problems = []
    if (outcome.amountPaise !== Number(order.total_paise)) {
      problems.push(`Paid ${toRupees(outcome.amountPaise)} but the order total is ${toRupees(order.total_paise)}.`)
    }

    // Paid after the stock hold lapsed and the order was auto-cancelled:
    // try to hold the stock again; if it has gone, a person must decide.
    if (order.status === 'cancelled') {
      const { rows: items } = await db.query('select variant_id, quantity from order_items where order_id = $1', [order.id])
      await db.query('savepoint rehold')
      try {
        for (const i of items) {
          await moveStock(db, { locationId: order.fulfilment_location_id, variantId: i.variant_id, type: 'reserve', reserved: i.quantity, orderId: order.id, reason: 'Paid after hold expired' })
        }
        await db.query('release savepoint rehold')
      } catch (err) {
        if (err.code !== 'insufficient_stock') throw err
        await db.query('rollback to savepoint rehold')
        problems.push('Paid after the stock hold expired and the stock is no longer available. Restock or refund.')
      }
    }

    const { rows: [updated] } = await db.query(
      `update orders set status = 'placed', payment_status = 'paid', placed_at = now(),
              reservation_expires_at = null, cancelled_at = null, cancel_reason = null,
              needs_attention = $2,
              -- Its own shipment ID from the moment it is paid, so the receipt can show it.
              shipment_id = coalesce(shipment_id, $3)
        where id = $1 returning *`,
      [order.id, problems.length ? problems.join(' ') : null,
        order.shipment_id || (await reserveId(db, 'shipment', newShipmentId, order.id))]
    )
    await recordOrderStatus(db, { orderId: order.id, from: order.status, to: 'placed', actor, reason: 'Paid via ' + payment.gateway })

    const { rows: items } = await db.query('select * from order_items where order_id = $1', [order.id])
    const forCustomer = templates.orderPlaced(updated, items)
    await queueEmail(db, { to: updated.contact_email, ...forCustomer, orderId: order.id, dedupeKey: 'placed:' + order.id })
    const forStaff = templates.newOrderForStaff(updated, items)
    await queueEmail(db, { to: staffInbox(), ...forStaff, orderId: order.id, dedupeKey: 'staff-placed:' + order.id })

    return { order: updated, payment: paid, already: false, mismatch: problems.length > 0 && outcome.amountPaise !== Number(order.total_paise) }
  })
}

function receipt(order, payment, extra = {}) {
  return {
    ok: true,
    orderNumber: order.order_number,
    shipmentId: order.shipment_id,
    status: 'paid',
    ...extra,
    gateway: payment.gateway,
    gatewayLabel: getGateway(payment.gateway)?.label || null,
    paymentId: payment.gateway_payment_id,
    amount: toRupees(payment.amount_paise),
    currency: payment.currency,
    method: payment.method,
    last4: payment.card_last4,
    paidAt: payment.paid_at ? new Date(payment.paid_at).toISOString() : null,
  }
}

export async function confirmCheckout(body) {
  const orderId = str(body?.orderId)
  if (!orderId) throw httpError('orderId is required.')
  if (invalidUuid(orderId)) throw httpError('That order does not exist.', { status: 404 })

  const { rows: [order] } = await query('select * from orders where id = $1', [orderId])
  if (!order) throw httpError('That order does not exist.', { status: 404 })

  if (order.payment_status === 'paid') {
    const { rows: [settled] } = await query(`select * from payments where order_id = $1 and status = 'paid'`, [order.id])
    return receipt(order, settled, { alreadyConfirmed: true })
  }

  const { rows: [pending] } = await query(
    // 'superseded' too: an attempt the expiry job closed while the customer
    // was still on the payment screen. The signature check below still proves
    // the payment belongs to that attempt.
    `select * from payments where order_id = $1 and status in ('created', 'superseded')
      order by (status = 'created') desc, created_at desc limit 1`,
    [order.id]
  )
  if (!pending) {
    throw httpError('No pending payment attempt.', { status: 409, publicMessage: 'We have no record of a payment in progress for that order.' })
  }

  const gateway = getGateway(pending.gateway)
  const outcome = await gateway.confirm({ reference: pending.gateway_order_ref, body })

  if (!outcome.paid) {
    if (!outcome.pendingCapture) {
      await query(
        `update payments set status = 'failed', gateway_payment_id = coalesce($2, gateway_payment_id), failure_reason = $3, raw = $4
          where id = $1 and status = 'created'`,
        [pending.id, outcome.transactionId || null, outcome.reason, outcome.raw ?? null]
      )
      await query(`update orders set payment_status = 'failed' where id = $1 and payment_status = 'pending'`, [order.id])
    }
    throw httpError(outcome.reason || 'The payment did not succeed.', {
      status: 402,
      publicMessage: outcome.pendingCapture
        ? 'Your payment is still being confirmed. We will email you once it clears.'
        : 'That payment did not go through. Please try again.',
    })
  }

  const result = await markOrderPaid({
    paymentRowId: pending.id,
    actor: 'customer',
    outcome: { ...outcome, amountPaise: Math.round(Number(outcome.amount) * 100) },
  })

  if (result.mismatch) {
    throw httpError('Captured amount did not match order total.', {
      status: 409,
      publicMessage: 'We received a payment of a different amount. Our team will contact you shortly.',
    })
  }
  return receipt(result.order, result.payment)
}

/** Cancel unpaid orders whose stock hold has lapsed, and free the stock. */
export async function expireUnpaidOrders() {
  const { rows } = await query(
    `select id from orders where status = 'pending_payment' and reservation_expires_at < now() limit 200`
  )
  let expired = 0
  for (const { id } of rows) {
    await tx(async (db) => {
      const { rows: [o] } = await db.query('select * from orders where id = $1 for update', [id])
      if (o.status !== 'pending_payment' || new Date(o.reservation_expires_at) >= new Date()) return
      await releaseForOrder(db, { orderId: id, reason: 'Payment not completed in time' })
      await db.query(
        `update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Payment not completed in time',
                payment_status = case when payment_status = 'pending' then 'failed' else payment_status end
          where id = $1`,
        [id]
      )
      await db.query(`update payments set status = 'superseded' where order_id = $1 and status = 'created'`, [id])
      await recordOrderStatus(db, { orderId: id, from: 'pending_payment', to: 'cancelled', actor: 'system', reason: 'Payment not completed in time' })
      expired++
    })
  }
  return expired
}
