// Customer and staff emails.
//
// queueEmail() writes to email_outbox inside the caller's transaction, so a
// message exists only if the change it describes was committed. sendQueued()
// (run by the jobs endpoint, and right after payment) delivers it:
//   - over SMTP when SMTP_HOST is set (Google Workspace: smtp.gmail.com, 465,
//     the sending mailbox and an app password in SMTP_USER / SMTP_PASS), or
//   - through Resend when RESEND_API_KEY is set.
// EMAIL_FROM is needed either way. Without them mail simply waits in the
// queue, visible in the admin panel, until they are set.
import nodemailer from 'nodemailer'
import { query } from '../db.js'
import { formatInr } from './util.js'
import { renderTemplate } from './email-template.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://chennairiceindustries.com'

export async function queueEmail(db, { to, subject, text, html = null, template, orderId = null, dedupeKey = null, attachments = [] }) {
  if (!to) return
  await db.query(
    `insert into email_outbox (to_email, subject, body_text, body_html, template, order_id, dedupe_key, attachments)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (dedupe_key) do nothing`,
    [to, subject, text, html, template, orderId, dedupeKey, JSON.stringify(attachments)]
  )
}

/**
 * Turn a queued message's attachment descriptions into files. The invoice is
 * issued (once) if it does not exist yet; an order cancelled before the mail
 * went out simply has no invoice to attach.
 */
async function buildAttachments(mail) {
  const files = []
  for (const a of mail.attachments || []) {
    if (a.kind !== 'invoice') continue
    const { customerInvoice } = await import('./operations.js')
    const { invoicePdf } = await import('./invoice-pdf.js')
    const { rows: [o] } = await query('select order_number from orders where id = $1', [a.orderId])
    if (!o) continue
    let detail
    try {
      detail = await customerInvoice({ orderId: a.orderId, orderNumber: o.order_number })
    } catch (err) {
      if (err.status === 409) continue // not invoiceable (cancelled / unpaid)
      throw err
    }
    files.push({
      filename: `Invoice ${detail.invoice.invoice_number.replaceAll('/', '-')}.pdf`,
      content: await invoicePdf(detail),
      contentType: 'application/pdf',
    })
  }
  return files
}

export function staffInbox() {
  return process.env.SALES_NOTIFY_EMAIL || ''
}

function itemsText(items) {
  return items.map((i) => `  ${i.quantity} × ${i.product_name} (${Number(i.pack_kg)} kg)  ${formatInr(i.line_total_paise)}`).join('\n')
}

const trackUrl = (order) => `${SITE}/track-order?order=${encodeURIComponent(order.order_number)}`
const trackLine = (order) => `Track your order: ${trackUrl(order)}`
const invoiceUrl = (order) =>
  `${SITE}/api/orders/${order.id}/invoice?n=${encodeURIComponent(order.order_number)}`

function addressLines(a = {}) {
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ' ' + a.pincode : '')]
    .filter((l) => l && String(l).trim())
}

const placedDate = (order) =>
  new Date(order.placed_at || Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

const PAYMENT_METHOD = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay Later' }
const PAYMENT_STATUS = { paid: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Partly refunded' }
const absolute = (url) => (!url ? null : /^https?:\/\//.test(url) ? url : SITE + (url.startsWith('/') ? '' : '/') + url)

function paymentMethod(payment) {
  if (!payment?.method) return 'Online payment'
  const label = PAYMENT_METHOD[payment.method] || payment.method
  return payment.method === 'card' && payment.card_last4 ? `${label} ending ${payment.card_last4}` : label
}

/** {{Variables}} for templates/order-confirmation.html. */
function orderConfirmationVars(order, payment) {
  const a = order.shipping_address || {}
  return {
    'Customer Name': order.contact_name,
    'Order ID': order.order_number,
    'Order Date': placedDate(order),
    'Total Amount': formatInr(order.total_paise),
    'Payment Method': paymentMethod(payment),
    'Payment Status': PAYMENT_STATUS[order.payment_status] || order.payment_status,
    'Address': [a.line1, a.line2, a.landmark && 'Landmark: ' + a.landmark].filter(Boolean).join(', '),
    'City': a.city,
    'State': a.state,
    'Pincode': a.pincode,
    'Contact Number': order.contact_phone,
    'Tracking URL': trackUrl(order),
    'Support Number': process.env.SUPPORT_PHONE || '+91 70666 46667',
    'Support Email': process.env.SUPPORT_EMAIL || 'support@chennairiceindustries.com',
  }
}

/** One set of {{Product ...}} values per order line. Price is the line amount. */
function orderConfirmationItems(items) {
  return items.map((i) => ({
    'Product Name': `${i.product_name} (${Number(i.pack_kg)} kg)`,
    'Quantity': i.quantity,
    'Price': formatInr(i.line_total_paise),
    'Product Image': absolute(i.image_url) || `${SITE}/assets/shop/logo.png`,
  }))
}

/** How a shipment is travelling, in the customer's words. */
function shippingDetails(s) {
  const base = { partner: 'To be confirmed', label: 'Tracking number', number: '', hint: '', url: '' }
  if (s.method === 'courier') {
    const prefilled = s.tracking_url && s.tracking_number && s.tracking_url.includes(encodeURIComponent(s.tracking_number))
    return {
      ...base,
      partner: s.carrier_name || 'Courier',
      label: 'AWB / Tracking number',
      number: s.tracking_number || '',
      url: s.tracking_url || '',
      hint: s.tracking_url && s.tracking_number && !prefilled
        ? `Copy the tracking number above, then paste it on the ${s.carrier_name || 'courier'} tracking page.` : '',
    }
  }
  if (s.method === 'transport') return { ...base, partner: s.carrier_name || 'Transport', label: 'LR number', number: s.lr_number || '' }
  if (s.method === 'own_vehicle') {
    return {
      ...base, partner: 'Chennai Rice own vehicle', label: 'Vehicle number', number: s.vehicle_number || '',
      hint: s.driver_phone ? `Driver: ${[s.driver_name, s.driver_phone].filter(Boolean).join(', ')}` : '',
    }
  }
  if (s.method === 'pickup') return { ...base, partner: 'Pickup from our mill' }
  return base
}

/** The detail that makes a shipment traceable, or null while it has none. */
const shipmentRef = (s) =>
  s.method === 'pickup' ? 'pickup' : s.tracking_number || s.lr_number || s.vehicle_number || null

export const templates = {
  orderPlaced(order, items, payment = null) {
    return {
      template: 'order_placed',
      subject: `Order Confirmed - ${order.order_number}`,
      text:
        `Dear ${order.contact_name},\n\nThank you for your order. We have received your payment and your order is confirmed. ` +
        `Your GST invoice is attached to this email.\n\n` +
        `Order ID: ${order.order_number}\nPlaced:   ${placedDate(order)}\n\n` +
        `${itemsText(items)}\n\nTotal paid: ${formatInr(order.total_paise)} (incl. GST)\n\n` +
        `Delivering to:\n${[order.contact_name, ...addressLines(order.shipping_address), order.contact_phone].join('\n')}\n\n` +
        `${trackLine(order)}\nDownload your invoice: ${invoiceUrl(order)}\n\n` +
        `Chennai Rice Industries\n+91 70666 46667`,
      html: renderTemplate('order-confirmation.html', orderConfirmationVars(order, payment), orderConfirmationItems(items)),
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
      subject: `Order ${order.order_number} is being packed`,
      text: `Dear ${order.contact_name},\n\nYour order ${order.order_number} is confirmed and is being packed at our Erode mill.\n\n${trackLine(order)}`,
    }
  },
  /**
   * "Your order is shipped", with the shipment ID, delivery partner and
   * tracking. update: the tracking arrived after the first shipped email.
   */
  orderShipped(order, shipment, items = [], { update = false } = {}) {
    const d = shippingDetails(shipment)
    const n = order.order_number
    const heading = update ? 'Tracking details for your order' : 'Your order is on its way'
    const intro = update
      ? `Here are the delivery details for your order ${n}.`
      : {
          courier: `Good news! Your order has been dispatched from our Erode mill and handed over to ${d.partner}.`,
          transport: `Good news! Your order has been dispatched from our Erode mill with ${d.partner}.`,
          own_vehicle: 'Good news! Your order has left our Erode mill in our own vehicle and is on its way to you.',
          pickup: 'Your order is packed and ready for you to collect from our mill.',
        }[shipment.method] || 'Good news! Your order has left our Erode mill. We will email you the courier tracking details as soon as they are ready.'
    const a = order.shipping_address || {}
    const vars = {
      'Heading': heading,
      'Intro': intro,
      'Customer Name': order.contact_name,
      'Order ID': n,
      'Shipment ID': shipment.shipment_number,
      'Dispatch Date': placedDate({ placed_at: shipment.shipped_at }),
      'Expected Delivery': shipment.expected_delivery
        ? new Date(shipment.expected_delivery).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
        : '',
      'Delivery Partner': d.partner,
      'Tracking Label': d.label,
      'Tracking Number': d.number,
      'Paste Hint': d.hint,
      'Courier Tracking URL': d.url,
      'Tracking URL': trackUrl(order),
      'Address': [a.line1, a.line2, a.landmark && 'Landmark: ' + a.landmark].filter(Boolean).join(', '),
      'City': a.city,
      'State': a.state,
      'Pincode': a.pincode,
      'Contact Number': order.contact_phone,
      'Support Number': process.env.SUPPORT_PHONE || '+91 70666 46667',
      'Support Email': process.env.SUPPORT_EMAIL || 'support@chennairiceindustries.com',
    }
    const products = items.map((i) => ({
      'Product Name': `${i.product_name} (${Number(i.pack_kg)} kg)`,
      'Quantity': i.quantity,
      'Product Image': absolute(i.image_url) || `${SITE}/assets/shop/logo.png`,
    }))
    return {
      template: update ? 'order_tracking' : 'order_shipped',
      subject: update ? `Tracking details - ${n}` : `Order Shipped - ${n}`,
      text:
        `Dear ${order.contact_name},\n\n${intro}\n\n` +
        `Order ID:         ${n}\nShipment ID:      ${shipment.shipment_number}\nDelivery partner: ${d.partner}\n` +
        (d.number ? `${d.label}: ${d.number}\n` : '') +
        (vars['Expected Delivery'] ? `Expected delivery: ${vars['Expected Delivery']}\n` : '') +
        (d.url ? `\nTrack on ${d.partner}: ${d.url}\n` : '') +
        (d.hint ? `${d.hint}\n` : '') +
        (products.length ? `\n${items.map((i) => `  ${i.quantity} × ${i.product_name} (${Number(i.pack_kg)} kg)`).join('\n')}\n` : '') +
        `\n${trackLine(order)}\n\nChennai Rice Industries\n${vars['Support Number']}`,
      html: renderTemplate('order-shipped.html', vars, products),
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

// A one-tap dispatch has no courier or AWB yet. Its shipped email waits this
// long for the courier's tracking sheet; if nothing comes, it goes out as
// "on its way" and a tracking email follows when the details are added.
export const SHIPPED_EMAIL_WAIT_MS = 3 * 60 * 60 * 1000

/**
 * Queue (or bring up to date) the shipped email for one shipment. Called on
 * dispatch and whenever its courier / tracking details change:
 *   - not sent yet: the waiting email is rewritten with the latest details
 *     and, once it has tracking, sent straight away;
 *   - already sent: a "tracking details" email, once per tracking number.
 */
export async function queueShippedEmail(db, order, shipment, { waitForTracking = false } = {}) {
  if (!order.contact_email) return
  const { rows: items } = await db.query(
    `select i.*, p.image_url from shipment_items si join order_items i on i.id = si.order_item_id
       left join product_variants v on v.id = i.variant_id left join products p on p.id = v.product_id
      where si.shipment_id = $1 order by i.product_name`, [shipment.id])
  const ref = shipmentRef(shipment)
  const key = 'shipped:' + shipment.id
  const { rows: [prev] } = await db.query('select id, status from email_outbox where dedupe_key = $1', [key])

  if (prev?.status === 'sent') {
    if (!ref) return
    await queueEmail(db, {
      to: order.contact_email, ...templates.orderShipped(order, shipment, items, { update: true }),
      orderId: order.id, dedupeKey: `${key}:${ref}`,
    })
    return
  }
  const mail = templates.orderShipped(order, shipment, items)
  const sendAfter = !ref && waitForTracking ? new Date(Date.now() + SHIPPED_EMAIL_WAIT_MS) : null
  if (prev) {
    await db.query(
      `update email_outbox set to_email = $2, subject = $3, body_text = $4, body_html = $5, template = $6,
              status = 'queued', attempts = 0, last_error = null, send_after = $7
        where id = $1`,
      [prev.id, order.contact_email, mail.subject, mail.text, mail.html, mail.template, sendAfter])
    return
  }
  await db.query(
    `insert into email_outbox (to_email, subject, body_text, body_html, template, order_id, dedupe_key, send_after)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (dedupe_key) do nothing`,
    [order.contact_email, mail.subject, mail.text, mail.html, mail.template, order.id, key, sendAfter])
}

/** Stop shipped emails for a shipment that have not gone out (dispatch undone, or delivered first). */
export async function cancelShippedEmails(db, shipmentId, reason, { onlyWaiting = false } = {}) {
  await db.query(
    `update email_outbox set status = 'failed', last_error = $2
      where status = 'queued' and (dedupe_key = 'shipped:' || $1 or dedupe_key like 'shipped:' || $1 || ':%')
        ${onlyWaiting ? 'and send_after is not null' : ''}`,
    [shipmentId, reason])
}

async function sendViaResend(mail, files) {
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
      ...(files.length ? { attachments: files.map((f) => ({ filename: f.filename, content: f.content.toString('base64') })) } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Resend HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200))
}

// One SMTP connection setup per process, rebuilt if the settings change (tests).
let smtp = null
function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || 465)
  const key = [process.env.SMTP_HOST, port, process.env.SMTP_USER, process.env.SMTP_PASS, process.env.SMTP_REQUIRE_TLS].join('|')
  if (!smtp || smtp.key !== key) {
    smtp = {
      key,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465, // 465: TLS from the start; 587: upgraded with STARTTLS
        requireTLS: port !== 465 && process.env.SMTP_REQUIRE_TLS !== 'false',
        ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}),
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      }),
    }
  }
  return smtp.transport
}

async function sendViaSmtp(mail, files) {
  await smtpTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: mail.to_email,
    subject: mail.subject,
    text: mail.body_text,
    ...(mail.body_html ? { html: mail.body_html } : {}),
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
    ...(files.length ? { attachments: files } : {}),
  })
}

/** 'smtp', 'resend', or null when no way to send is set up. */
export function emailProvider() {
  if (!process.env.EMAIL_FROM) return null
  if (process.env.SMTP_HOST) return 'smtp'
  if (process.env.RESEND_API_KEY) return 'resend'
  return null
}
export const canSendEmail = () => Boolean(emailProvider())

/** Deliver queued mail. Gives up on a message after 5 failed attempts. */
export async function sendQueued(db, { limit = 25, orderNumber = null } = {}) {
  const provider = emailProvider()
  if (!provider) return { sent: 0, failed: 0, skipped: 'email not configured' }
  // Claim the messages first, so a second sender running at the same moment
  // skips them instead of sending them again. Mail for the order just paid
  // (orderNumber) goes first, ahead of any backlog.
  const { rows } = await db.query(
    `update email_outbox set locked_until = now() + interval '2 minutes'
      where id in (select id from email_outbox
                    where status = 'queued' and attempts < 5 and (locked_until is null or locked_until < now())
                      and (send_after is null or send_after <= now())
                    order by coalesce(order_id = (select id from orders where order_number = $2), false) desc, created_at
                    limit $1 for update skip locked)
      returning *, coalesce(order_id = (select id from orders where order_number = $2), false) as first`,
    [limit, orderNumber]
  )
  rows.sort((a, b) => (b.first - a.first) || (a.created_at - b.created_at))
  let sent = 0
  let failed = 0
  for (const mail of rows) {
    try {
      const files = await buildAttachments(mail)
      await (provider === 'smtp' ? sendViaSmtp(mail, files) : sendViaResend(mail, files))
      await db.query(`update email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, locked_until = null where id = $1`, [mail.id])
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
