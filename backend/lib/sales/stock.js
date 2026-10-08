// Every stock change goes through moveStock(): one ledger row in
// stock_movements and the matching change to stock_levels, in the caller's
// transaction. The CHECK constraints on stock_levels (nothing below zero,
// never more reserved than on hand) are the last line of defence; the
// conditional updates here turn those cases into clear messages instead.
import { httpError } from './util.js'

/**
 * @param db a client inside a transaction
 * @param {{ locationId, variantId, type, onHand?, reserved?, damaged?, orderId?, shipmentId?, batchId?, reason?, staffId? }} m
 *   onHand / reserved / damaged are signed deltas.
 */
export async function moveStock(db, m) {
  const onHand = m.onHand || 0
  const reserved = m.reserved || 0
  const damaged = m.damaged || 0

  await db.query(
    `insert into stock_levels (location_id, variant_id) values ($1, $2) on conflict do nothing`,
    [m.locationId, m.variantId]
  )
  const { rowCount } = await db.query(
    `update stock_levels
        set on_hand = on_hand + $3, reserved = reserved + $4, damaged = damaged + $5
      where location_id = $1 and variant_id = $2
        and on_hand + $3 >= 0 and reserved + $4 >= 0 and damaged + $5 >= 0
        and reserved + $4 <= on_hand + $3`,
    [m.locationId, m.variantId, onHand, reserved, damaged]
  )
  if (!rowCount) {
    throw httpError('Not enough stock for that change.', {
      status: 409,
      code: 'insufficient_stock',
      publicMessage: m.type === 'reserve' ? 'Some items just sold out. Please review your cart.' : 'Not enough stock for that change.',
    })
  }

  await db.query(
    `insert into stock_movements
       (location_id, variant_id, type, on_hand_delta, reserved_delta, damaged_delta,
        batch_id, order_id, shipment_id, reason, staff_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [m.locationId, m.variantId, m.type, onHand, reserved, damaged,
      m.batchId || null, m.orderId || null, m.shipmentId || null, m.reason || null, m.staffId || null]
  )
}

/** Hold stock for every line of an order. */
export async function reserveForOrder(db, { orderId, locationId, lines }) {
  for (const line of lines) {
    await moveStock(db, { locationId, variantId: line.variant_id, type: 'reserve', reserved: line.quantity, orderId })
  }
}

/** Give back whatever this order still holds (idempotent: it nets the ledger). */
export async function releaseForOrder(db, { orderId, reason, staffId }) {
  const { rows } = await db.query(
    `select location_id, variant_id, sum(reserved_delta)::int as held
       from stock_movements where order_id = $1
      group by location_id, variant_id
     having sum(reserved_delta) > 0`,
    [orderId]
  )
  for (const r of rows) {
    await moveStock(db, {
      locationId: r.location_id, variantId: r.variant_id, type: 'release',
      reserved: -r.held, orderId, reason, staffId,
    })
  }
}

/** Packs currently held for an order (0 once released or dispatched). */
export async function heldForOrder(db, orderId) {
  const { rows } = await db.query(
    `select coalesce(sum(reserved_delta), 0)::int as held from stock_movements where order_id = $1`,
    [orderId]
  )
  return rows[0].held
}
