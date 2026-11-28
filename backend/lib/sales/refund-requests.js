// Refund requests and GST credit notes (owner, 28 Nov 2026).
//
//   request (order, amount, reason, remark) ──accounts──▶ approved      → money back (Razorpay) + credit note + email
//                                            └─────────▶ not approved  → nothing is refunded; the note says why
//
// Raised from /warehouse → Accounts → Refunds (or by anyone with refund.request); decided there by the accounts team
// (refund.approve). Approval can also cancel an order that has not left (stock back on the shelf), for "stock not
// available" refunds. A Razorpay refusal leaves the request open with the error, to try again.
import { query, tx } from '../db.js'
import { audit, requirePermission } from './staff.js'
import { cancelOrder, getOrderDetail, refundOrder } from './operations.js'
import { httpError, str, toPaise, toRupees } from './util.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CANCELLABLE = ['pending_payment', 'placed', 'confirmed', 'packed']
// The reasons offered in the panel; anything else may be typed.
export const REFUND_REASONS = [
  'Stock not available at the warehouse',
  'Order cancelled by the customer',
  'Delivery not possible to this address',
  'Damaged or wrong item delivered',
  'Paid twice / extra amount paid',
]

/** What is still refundable on an order: paid amount less refunds not failed. */
async function refundable(db, orderId) {
  const { rows: [p] } = await db.query(`select id, amount_paise from payments where order_id = $1 and status = 'paid'`, [orderId])
  if (!p) return { payment: null, remaining: 0 }
  const { rows: [{ done }] } = await db.query(
    `select coalesce(sum(amount_paise), 0)::bigint as done from refunds where payment_id = $1 and status <> 'failed'`, [p.id])
  return { payment: p, remaining: Number(p.amount_paise) - Number(done) }
}

/** The order by its id or its order number (CR-20261107-AS7TP), for the request form. */
async function findOrder(db, { orderId, orderNumber }) {
  if (orderId && UUID.test(String(orderId))) return (await db.query('select * from orders where id = $1', [orderId])).rows[0]
  const no = str(orderNumber).toUpperCase().replace(/\s+/g, '')
  if (!no) return null
  return (await db.query('select * from orders where upper(order_number) = $1', [no])).rows[0]
}

/** Look up an order before raising a request: who, how much was paid, how much can still be refunded. */
export async function refundCheck(staff, params) {
  requirePermission(staff, 'refund.request')
  const order = await findOrder({ query }, params)
  if (!order) throw httpError('No order with that number.', { status: 404 })
  const { payment, remaining } = await refundable({ query }, order.id)
  const { rows: [open] } = await query(`select id from refund_requests where order_id = $1 and status = 'requested'`, [order.id])
  const { rows: [inv] } = await query('select invoice_number from invoices where order_id = $1', [order.id])
  return {
    orderId: order.id, orderNumber: order.order_number, customer: order.contact_name, status: order.status,
    paymentStatus: order.payment_status, total: toRupees(order.total_paise), paid: payment ? toRupees(payment.amount_paise) : 0,
    refundable: toRupees(remaining), invoiceNumber: inv?.invoice_number || '', openRequest: Boolean(open),
    canCancel: CANCELLABLE.includes(order.status),
  }
}

export async function createRefundRequest(staff, body = {}) {
  requirePermission(staff, 'refund.request')
  const reason = str(body.reason)
  const remark = str(body.remark) || null
  if (!reason) throw httpError('Please give a reason for the refund.')
  if (reason.length > 300 || (remark && remark.length > 2000)) throw httpError('The reason or remark is too long.')
  return tx(async (db) => {
    const order = await findOrder(db, body)
    if (!order) throw httpError('No order with that number.', { status: 404 })
    await db.query('select id from orders where id = $1 for update', [order.id])
    const { payment, remaining } = await refundable(db, order.id)
    if (!payment) throw httpError('This order has no successful payment to refund.', { status: 409 })
    const amount = body.amount == null || body.amount === '' ? remaining : toPaise(body.amount)
    if (Number.isNaN(amount)) throw httpError('Enter the amount in rupees, or leave it empty for the full refund.')
    if (!(amount > 0)) throw httpError('Nothing left to refund on this order.', { status: 409 })
    if (amount > remaining) throw httpError(`At most ₹${toRupees(remaining)} can still be refunded.`, { status: 409 })
    const { rows: [open] } = await db.query(`select id from refund_requests where order_id = $1 and status = 'requested'`, [order.id])
    if (open) throw httpError('This order already has a refund request waiting for approval.', { status: 409 })
    const cancel = Boolean(body.cancelOrder) && CANCELLABLE.includes(order.status)
    const { rows: [request] } = await db.query(
      `insert into refund_requests (order_id, amount_paise, reason, remark, cancel_order, requested_by)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [order.id, amount, reason, remark, cancel, staff.id])
    await db.query('insert into order_notes (order_id, staff_id, body) values ($1, $2, $3)',
      [order.id, staff.id, `Refund of ₹${toRupees(amount)} requested: ${reason}${remark ? ' — ' + remark : ''}. Waiting for approval in Accounts.`])
    await audit(db, staff, 'refund.request', 'order', order.id, { request: request.id, amount_paise: amount, reason, cancel })
    return { request }
  })
}

/**
 * Approve: (cancel the order if asked and it has not left) → refund → credit note, then the request is approved.
 * A claim on the request stops two people approving it at once; a failure releases it with the error.
 */
export async function approveRefundRequest(staff, id, body = {}) {
  requirePermission(staff, 'refund.approve')
  if (!UUID.test(String(id))) throw httpError('No such refund request.', { status: 404 })
  const note = str(body.note) || null
  const { rows: [request] } = await query(
    `update refund_requests set decided_by = $2, decided_at = now(), last_error = null
      where id = $1 and status = 'requested' and (decided_at is null or decided_at < now() - interval '2 minutes')
      returning *`, [id, staff.id])
  if (!request) {
    const { rows: [r] } = await query('select status from refund_requests where id = $1', [id])
    if (!r) throw httpError('No such refund request.', { status: 404 })
    throw httpError(r.status === 'requested' ? 'Someone is approving this request right now.' : 'This request has already been decided.', { status: 409 })
  }
  try {
    const { rows: [order] } = await query('select status from orders where id = $1', [request.order_id])
    let cancelled = false
    if (request.cancel_order && CANCELLABLE.includes(order.status)) {
      await cancelOrder(staff, request.order_id, { reason: request.reason }, { approved: true })
      cancelled = true
    }
    const done = await refundOrder(staff, request.order_id,
      { amount: toRupees(request.amount_paise), reason: request.reason },
      { approved: true, creditNote: { reason: request.reason, remark: request.remark, requestId: request.id } })
    const { rows: [saved] } = await query(
      `update refund_requests set status = 'approved', decided_at = now(), decision_note = $2, refund_id = $3 where id = $1 returning *`,
      [id, note, done.refund.id])
    await audit({ query }, staff, 'refund.approve', 'order', request.order_id, { request: id, credit_note: done.creditNote?.credit_note_number, cancelled })
    return { request: saved, refund: done.refund, creditNote: done.creditNote, cancelled, ...(done.action ? { action: done.action } : {}) }
  } catch (err) {
    await query('update refund_requests set decided_by = null, decided_at = null, last_error = $2 where id = $1',
      [id, String(err.publicMessage || err.message).slice(0, 500)])
    throw err
  }
}

export async function rejectRefundRequest(staff, id, body = {}) {
  requirePermission(staff, 'refund.approve')
  if (!UUID.test(String(id))) throw httpError('No such refund request.', { status: 404 })
  const note = str(body.note)
  if (!note) throw httpError('Please say why it is not approved.')
  return tx(async (db) => {
    const { rows: [request] } = await db.query(
      `update refund_requests set status = 'not_approved', decided_by = $2, decided_at = now(), decision_note = $3
        where id = $1 and status = 'requested' and (decided_at is null or decided_at < now() - interval '2 minutes') returning *`,
      [id, staff.id, note])
    if (!request) throw httpError('This request has already been decided, or is being approved.', { status: 409 })
    await db.query('insert into order_notes (order_id, staff_id, body) values ($1, $2, $3)',
      [request.order_id, staff.id, `Refund request of ₹${toRupees(request.amount_paise)} not approved: ${note}`])
    await audit(db, staff, 'refund.reject', 'order', request.order_id, { request: id, note })
    return { request }
  })
}

const STATUSES = ['requested', 'approved', 'not_approved']

/** Refund requests for the Accounts panel, newest first; status '' = all. */
export async function refundRequestsList(db, params = {}) {
  const status = STATUSES.includes(params.status) ? params.status : null
  const { rows } = await db.query(
    `select q.*, o.order_number, o.contact_name, o.status as order_status, o.total_paise as order_total,
            a.full_name as requested_by_name, d.full_name as decided_by_name,
            r.status as refund_status, r.gateway_refund_id,
            c.id as credit_note_id, c.credit_note_number,
            (select v.invoice_number from invoices v where v.order_id = o.id) as invoice_number
       from refund_requests q join orders o on o.id = q.order_id
       left join staff_users a on a.id = q.requested_by left join staff_users d on d.id = q.decided_by
       left join refunds r on r.id = q.refund_id
       left join credit_notes c on c.refund_request_id = q.id
      where ($1::text is null or q.status = $1)
      order by (q.status = 'requested') desc, q.requested_at desc limit 500`, [status])
  const { rows: [counts] } = await db.query(
    `select count(*) filter (where status = 'requested')::int as requested, count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'not_approved')::int as not_approved from refund_requests`)
  return {
    counts,
    requests: rows.map((r) => ({
      id: r.id, status: r.status, amount: toRupees(r.amount_paise), reason: r.reason, remark: r.remark || '',
      cancelOrder: r.cancel_order, orderId: r.order_id, orderNumber: r.order_number, customer: r.contact_name,
      orderStatus: r.order_status, orderTotal: toRupees(r.order_total), invoiceNumber: r.invoice_number || '',
      requestedAt: r.requested_at, requestedBy: r.requested_by_name || '',
      decidedAt: r.status === 'requested' ? null : r.decided_at, decidedBy: r.status === 'requested' ? '' : r.decided_by_name || '',
      decisionNote: r.decision_note || '', lastError: r.last_error || '',
      refundStatus: r.refund_status || '', refundId: r.gateway_refund_id || '',
      creditNoteId: r.credit_note_id || '', creditNoteNumber: r.credit_note_number || '',
    })),
    reasons: REFUND_REASONS,
  }
}

/** A credit note with its order's detail, for the PDF. */
export async function creditNoteDetail(db, id) {
  if (!UUID.test(String(id))) throw httpError('No such credit note.', { status: 404 })
  const { rows: [cn] } = await db.query(
    `select c.*, r.gateway_refund_id from credit_notes c left join refunds r on r.id = c.refund_id where c.id = $1`, [id])
  if (!cn) throw httpError('No such credit note.', { status: 404 })
  const detail = await getOrderDetail(cn.order_id, db)
  // The invoice the credit note was raised against.
  detail.invoice = (await db.query('select * from invoices where id = $1', [cn.invoice_id])).rows[0] || detail.invoice
  return { detail, creditNote: { ...cn, gatewayRefundId: cn.gateway_refund_id } }
}
