// All seven customer emails, filled with a sample order, to check how they look.
//
//   node db/send-email-samples.js --preview <folder>          writes 01-…07 .html files (no email sent)
//   $env:SMTP_PASS = (gcloud secrets versions access latest --secret=SMTP_PASS --project=chennai-rice-website)
//   node db/send-email-samples.js ashleyjosco@chennairiceindustries.com
//
// The mail settings other than the password come from functions/.env. The sample links do not open real orders.
import fs from 'node:fs'
import path from 'node:path'
import { templates } from '../lib/sales/email.js'
import { reminderEmail } from '../lib/sales/cart-recovery.js'

const SITE = 'https://chennairiceindustries.com'
const now = Date.now()
const order = {
  id: '00000000-0000-0000-0000-000000000001', order_number: 'CR-20261108-VKU26',
  contact_name: 'Ashley Josco', contact_phone: '+91 98765 43210', contact_email: 'sample@example.com',
  shipping_address: { line1: '12 Gandhi Road', line2: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040' },
  placed_at: new Date(now), total_paise: 68000, shipping_paise: 9000, discount_paise: 0, payment_status: 'paid', delivery_method: 'courier',
}
const items = [{ product_name: 'Kitchidi Ponni Rice', pack_kg: 5, quantity: 1, line_total_paise: 59000, image_url: '/assets/shop/packs/kitchidi-ponni-rice-v3.png' }]
const shipment = {
  method: 'courier', carrier_name: 'DTDC', tracking_number: 'D12345678', tracking_url: 'https://www.dtdc.in/tracking.asp',
  shipment_number: 'SH-20261109-0001', shipped_at: new Date(now), expected_delivery: new Date(now + 2 * 86400000),
}
const until = new Date(now + 48 * 3600000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
const cartLines = [{ name: 'Kitchidi Ponni Rice (5 kg)', qty: 1, price: 590, image: '/assets/shop/packs/kitchidi-ponni-rice-v3.png' }]

export const samples = [
  ['01 Order Confirmed', templates.orderPlaced(order, items, { method: 'upi' })],
  ['02 Order Packed', templates.orderConfirmed(order, items)],
  ['03 Order Shipped', templates.orderShipped(order, shipment, items)],
  ['04 Out for Delivery', templates.outForDelivery(order, shipment, items)],
  ['05 Order Delivered', templates.orderDelivered(order, items, { reviewUrl: `${SITE}/review?o=${order.order_number}&t=sample` })],
  ['06 Payment Failed', templates.paymentFailed({ ...order, payment_status: 'failed' }, items, { retryUrl: `${SITE}/checkout` })],
  ['07 Cart Reminder', reminderEmail({ step: 2, name: order.contact_name, lines: cartLines, token: 'sample-preview-email-two', code: { code: 'CART-SAMPLE', label: 'Free delivery', until } })],
]

const args = process.argv.slice(2)
if (args[0] === '--preview') {
  const dir = args[1]
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, m] of samples) fs.writeFileSync(path.join(dir, name.replace(/\s+/g, '-') + '.html'), m.html)
  console.log(`Wrote ${samples.length} previews to ${dir}`)
} else {
  const to = args[0]
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || '')) throw new Error('Give an email: node db/send-email-samples.js you@example.com')
  for (const line of fs.readFileSync(new URL('../../functions/.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^(SMTP_HOST|SMTP_PORT|SMTP_USER|EMAIL_FROM)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  if (!process.env.SMTP_PASS) throw new Error('Set SMTP_PASS first (see the top of this file).')
  const { default: nodemailer } = await import('nodemailer')
  const port = Number(process.env.SMTP_PORT) || 465
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  for (const [name, m] of samples) {
    await t.sendMail({ from: process.env.EMAIL_FROM, to, subject: `[Sample ${name}] ${m.subject}`, text: m.text, html: m.html })
    console.log(`Sent ${name}`)
  }
}
