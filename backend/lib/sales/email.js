// Customer and staff emails.
//
// queueEmail() writes to email_outbox inside the caller's transaction, so a
// message exists only if the change it describes was committed. sendQueued()
// (run by the jobs endpoint, and right after checkout) delivers through Resend
// when RESEND_API_KEY and EMAIL_FROM are set; otherwise mail simply waits in
// the queue, visible in the admin panel, until they are.
import { formatInr } from './util.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://chennairiceindustries.com'

export async function queueEmail(db, { to, subject, text, html = null, template, orderId = null, dedupeKey = null }) {
  if (!to) return
  await db.query(
    `insert into email_outbox (to_email, subject, body_text, body_html, template, order_id, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (dedupe_key) do nothing`,
    [to, subject, text, html, template, orderId, dedupeKey]
  )
}

export function staffInbox() {
  return process.env.SALES_NOTIFY_EMAIL || ''
}

function itemsText(items) {
  return items.map((i) => `  ${i.quantity} × ${i.product_name} (${Number(i.pack_kg)} kg)  ${formatInr(i.line_total_paise)}`).join('\n')
}

const trackLine = (order) => `Track your order: ${SITE}/track-order?order=${encodeURIComponent(order.order_number)}`

export const templates = {
  orderPlaced(order, items) {
    return {
      template: 'order_placed',
      subject: `Order ${order.order_number} received — Chennai Rice`,
      text:
        `Dear ${order.contact_name},\n\nThank you for your order. We have received your payment of ` +
        `${formatInr(order.total_paise)} and our team will confirm it shortly.\n\n${itemsText(items)}\n\n` +
        `${trackLine(order)}\n\nChennai Rice Industries\n+91 70666 46667`,
    }
  },
  newOrderForStaff(order, items) {
    return {
      template: 'staff_new_order',
      subject: `New paid order ${order.order_number} — ${formatInr(order.total_paise)}`,
      text:
        `${order.contact_name} (${order.contact_phone}) paid ${formatInr(order.total_paise)}.\n` +
        `Ship to: ${order.shipping_address.city}, ${order.ship_state}\n\n${itemsText(items)}\n\n` +
        `Confirm it in the admin panel.`,
    }
  },
  orderConfirmed(order) {
    return {
      template: 'order_confirmed',
      subject: `Order ${order.order_number} confirmed`,
      text: `Dear ${order.contact_name},\n\nYour order ${order.order_number} is confirmed and is being packed at our Erode mill.\n\n${trackLine(order)}`,
    }
  },
  orderShipped(order, shipment) {
    const how = {
      courier: `by ${shipment.carrier_name}, tracking number ${shipment.tracking_number}`,
      transport: `by ${shipment.carrier_name}, LR number ${shipment.lr_number}`,
      own_vehicle: `in our own vehicle${shipment.driver_phone ? ` (driver: ${shipment.driver_phone})` : ''}`,
      pickup: 'and is ready for you to collect',
    }[shipment.method] || 'and is on its way to you'
    return {
      template: 'order_shipped',
      subject: `Order ${order.order_number} is on its way`,
      text:
        `Dear ${order.contact_name},\n\nYour order ${order.order_number} has left our mill ${how}.` +
        (shipment.expected_delivery ? `\nExpected delivery: ${shipment.expected_delivery}.` : '') +
        (shipment.tracking_url ? `\nCourier tracking: ${shipment.tracking_url}` : '') +
        `\n\n${trackLine(order)}`,
    }
  },
  orderDelivered(order) {
    return {
      template: 'order_delivered',
      subject: `Order ${order.order_number} delivered`,
      text: `Dear ${order.contact_name},\n\nYour order ${order.order_number} has been delivered. Thank you for choosing Chennai Rice.`,
    }
  },
  orderCancelled(order, refundNote) {
    return {
      template: 'order_cancelled',
      subject: `Order ${order.order_number} cancelled`,
      text:
        `Dear ${order.contact_name},\n\nYour order ${order.order_number} has been cancelled.` +
        (order.cancel_reason ? `\nReason: ${order.cancel_reason}` : '') +
        (refundNote ? `\n\n${refundNote}` : '') +
        `\n\nFor any questions call +91 70666 46667.`,
    }
  },
  refundIssued(order, amountPaise) {
    return {
      template: 'refund_issued',
      subject: `Refund for order ${order.order_number}`,
      text: `Dear ${order.contact_name},\n\nWe have issued a refund of ${formatInr(amountPaise)} for order ${order.order_number}. It usually reaches your account in 5–7 working days.`,
    }
  },
}

async function sendViaResend(mail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [mail.to_email],
      subject: mail.subject,
      text: mail.body_text,
      ...(mail.body_html ? { html: mail.body_html } : {}),
      ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Resend HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200))
}

export const canSendEmail = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)

/** Deliver queued mail. Gives up on a message after 5 failed attempts. */
export async function sendQueued(db, { limit = 25 } = {}) {
  if (!canSendEmail()) return { sent: 0, failed: 0, skipped: 'email not configured' }
  const { rows } = await db.query(
    `select * from email_outbox where status = 'queued' and attempts < 5 order by created_at limit $1`,
    [limit]
  )
  let sent = 0
  let failed = 0
  for (const mail of rows) {
    try {
      await sendViaResend(mail)
      await db.query(`update email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = $1`, [mail.id])
      sent++
    } catch (err) {
      failed++
      await db.query(
        `update email_outbox set attempts = attempts + 1, last_error = $2,
                status = case when attempts + 1 >= 5 then 'failed' else 'queued' end
          where id = $1`,
        [mail.id, err.message.slice(0, 500)]
      )
    }
  }
  return { sent, failed }
}
