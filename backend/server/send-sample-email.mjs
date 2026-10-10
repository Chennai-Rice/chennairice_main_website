// Sends a sample order confirmation (dummy data) to check the email design
// and the SMTP settings in backend/server/.env.
//
//   node send-sample-email.mjs someone@chennairiceindustries.com
//
// Uses the real template (backend/templates/order-confirmation.html) and a
// dummy invoice PDF. No order is created and no customer data is used.
import 'dotenv/config'
import nodemailer from 'nodemailer'
import { renderTemplate } from '../lib/sales/email-template.js'
import { invoicePdf } from '../lib/sales/invoice-pdf.js'

const to = process.argv[2]
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error('Usage: node send-sample-email.mjs <recipient email>')
  process.exit(1)
}
const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'].filter((k) => !process.env[k])
if (missing.length) {
  console.error('Not sent: set ' + missing.join(', ') + ' in backend/server/.env (see .env.example).')
  process.exit(1)
}

const ORDER = 'CR-20261010-K7M4Q'
const html = renderTemplate('order-confirmation.html', {
  'Customer Name': 'Priya Raman',
  'Order ID': ORDER,
  'Order Date': '10 Oct 2026, 12:15 pm',
  'Total Amount': '₹3,137.00',
  'Payment Method': 'UPI',
  'Payment Status': 'Paid',
  'Address': '12, Gandhi Road, Landmark: Near Railway Station',
  'City': 'Coimbatore',
  'State': 'Tamil Nadu',
  'Pincode': '641001',
  'Contact Number': '+91 98765 43210',
  'Tracking URL': 'https://chennairiceindustries.com/track-order?order=' + ORDER,
  'Support Number': process.env.SUPPORT_PHONE || '+91 70666 46667',
  'Support Email': process.env.SUPPORT_EMAIL || 'support@chennairiceindustries.com',
}, [
  { 'Product Name': 'Vintage (26 kg)', 'Quantity': 1, 'Price': '₹2,249.00', 'Product Image': 'https://chennairiceindustries.com/assets/shop/packs/vintage.png' },
  { 'Product Name': 'Kitchidi Ponni Rice (5 kg)', 'Quantity': 2, 'Price': '₹888.00', 'Product Image': 'https://chennairiceindustries.com/assets/shop/logo.png' },
])

// A dummy invoice with the same figures (5% GST inside Tamil Nadu: CGST + SGST).
const line = (name, sku, kg, qty, unit) => {
  const total = unit * qty
  const taxable = Math.round(total / 1.05)
  const gst = total - taxable
  return { product_name: name, sku, pack_kg: kg, quantity: qty, hsn_code: '1006', unit_price_paise: unit, taxable_paise: taxable,
    tax_rate_bp: 500, cgst_paise: Math.floor(gst / 2), sgst_paise: gst - Math.floor(gst / 2), igst_paise: 0, line_total_paise: total }
}
const items = [line('Vintage', 'CR-VINTAGE-26KG', 26, 1, 224900), line('Kitchidi Ponni Rice', 'CR-KITCHIDI-5KG', 5, 2, 44400)]
const sum = (k) => items.reduce((t, i) => t + i[k], 0)
const pdf = await invoicePdf({
  order: {
    order_number: ORDER, contact_name: 'Priya Raman', contact_phone: '+91 98765 43210',
    shipping_address: { line1: '12, Gandhi Road', landmark: 'Near Railway Station', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001' },
    shipping_paise: 0, discount_paise: 0,
  },
  items,
  shipments: [],
  invoice: {
    invoice_number: 'SAMPLE/2026-27/000000', issued_at: new Date(), place_of_supply: 'Tamil Nadu',
    taxable_paise: sum('taxable_paise'), cgst_paise: sum('cgst_paise'), sgst_paise: sum('sgst_paise'), igst_paise: 0, total_paise: sum('line_total_paise'),
    seller: {
      name: 'Chennai Rice Industries India Private Limited', address: 'Nasiyanur, Erode, Tamil Nadu 638102', gstin: null,
      state: 'Tamil Nadu', stateCode: '33', phone: '+91 70666 46667', email: 'support@chennairiceindustries.com',
    },
  },
})

const port = Number(process.env.SMTP_PORT || 465)
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465 && process.env.SMTP_REQUIRE_TLS !== 'false',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
})
try {
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
    subject: `[Sample] Order Confirmed - ${ORDER}`,
    text: `Sample order confirmation for ${ORDER} (dummy data). View this email in HTML to see the design.`,
    html,
    attachments: [{ filename: 'Invoice SAMPLE-2026-27-000000.pdf', content: pdf, contentType: 'application/pdf' }],
  })
  console.log(`Sent to ${to} (message id ${info.messageId}).`)
} catch (err) {
  console.error('Not sent: ' + err.message)
  process.exit(1)
}
