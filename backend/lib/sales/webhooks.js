// Razorpay webhooks — the server-to-server record of what happened to a
// payment, independent of the customer's browser.
//
// Set up in Razorpay Dashboard → Webhooks:
//   URL     https://chennairiceindustries.com/api/payments/webhook/razorpay
//   Secret  same value as RAZORPAY_WEBHOOK_SECRET
//   Events  payment.captured, payment.failed, refund.processed, refund.failed
//
// Every event is stored once by its id; Razorpay retries deliveries, and a
// repeat is acknowledged without being applied again.
import crypto from 'node:crypto'
import { query } from '../db.js'
import { markOrderPaid } from './checkout.js'
import { httpError, safeEqual } from './util.js'

export function verifyRazorpayWebhook(rawBody, signature, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  if (!secret || !rawBody || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(expected, signature)
}

export async function handleRazorpayWebhook({ rawBody, signature, eventId }) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    throw httpError('RAZORPAY_WEBHOOK_SECRET is not set.', { status: 503 })
  }
  if (!verifyRazorpayWebhook(rawBody, signature)) {
    throw httpError('Bad webhook signature.', { status: 400 })
  }

  const event = JSON.parse(rawBody.toString('utf8'))
  const id = eventId || 'rzp:' + crypto.createHash('sha256').update(rawBody).digest('hex')

  const { rowCount } = await query(
    `insert into payment_webhook_events (event_id, gateway, event_type, payload)
     values ($1, 'razorpay', $2, $3) on conflict do nothing`,
    [id, event.event, event]
  )
  if (!rowCount) return { duplicate: true }

  try {
    await apply(event)
    await query('update payment_webhook_events set processed_at = now() where event_id = $1', [id])
  } catch (err) {
    await query('update payment_webhook_events set error = $2 where event_id = $1', [id, err.message.slice(0, 1000)])
    // Let the row go so Razorpay's retry gets another chance at it.
    await query('delete from payment_webhook_events where event_id = $1 and processed_at is null', [id])
    throw err
  }
  return { duplicate: false }
}

async function apply(event) {
  const payment = event.payload?.payment?.entity
  const refund = event.payload?.refund?.entity

  if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id) {
    const { rows: [row] } = await query(
      `select id from payments where gateway = 'razorpay' and gateway_order_ref = $1`,
      [payment.order_id]
    )
    if (!row) return // not one of ours (e.g. a payment link made by hand)
    await markOrderPaid({
      paymentRowId: row.id,
      actor: 'gateway',
      outcome: {
        transactionId: payment.id,
        amountPaise: Number(payment.amount),
        currency: payment.currency,
        method: payment.method,
        last4: payment.card?.last4 || null,
        raw: payment,
      },
    })
    return
  }

  if (event.event === 'payment.failed' && payment?.order_id) {
    await query(
      `update payments set status = 'failed', gateway_payment_id = coalesce(gateway_payment_id, $2), failure_reason = $3, raw = $4
        where gateway = 'razorpay' and gateway_order_ref = $1 and status = 'created'`,
      [payment.order_id, payment.id, payment.error_description || 'Payment failed', payment]
    )
    return
  }

  if ((event.event === 'refund.processed' || event.event === 'refund.failed') && refund?.id) {
    await query(
      `update refunds set status = $2, processed_at = case when $2 = 'processed' then now() else processed_at end, raw = $3
        where gateway_refund_id = $1`,
      [refund.id, event.event === 'refund.processed' ? 'processed' : 'failed', refund]
    )
  }
}
