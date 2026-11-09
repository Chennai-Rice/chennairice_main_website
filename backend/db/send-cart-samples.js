// Sends the two cart reminder emails, filled with sample packs, to one address: to check how they look.
//
//   $env:SMTP_PASS = (gcloud secrets versions access latest --secret=SMTP_PASS --project=chennai-rice-website)
//   node db/send-cart-samples.js ashleyjosco@chennairiceindustries.com
//
// The other mail settings (host, mailbox, From) are read from functions/.env. The sample links do not open a cart.
import fs from 'node:fs'
import nodemailer from 'nodemailer'
import { reminderEmail } from '../lib/sales/cart-recovery.js'

const to = process.argv[2]
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || '')) throw new Error('Give an email: node db/send-cart-samples.js you@example.com')
for (const line of fs.readFileSync(new URL('../../functions/.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^(SMTP_HOST|SMTP_PORT|SMTP_USER|EMAIL_FROM)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!process.env.SMTP_PASS) throw new Error('Set SMTP_PASS first (see the top of this file).')

const lines = [
  { id: 'kitchidi-ponni-rice-26kg', name: 'Kitchidi Ponni Rice (26 kg)', qty: 1, price: 2499, packKg: 26, image: '/assets/shop/packs/kitchidi-ponni-rice-v3.png' },
  { id: 'special-idly-rice-5kg', name: 'Special Idly Rice (5 kg)', qty: 2, price: 299, packKg: 5, image: '/assets/shop/packs/special-idly-rice-v3.png' },
]
const until = new Date(Date.now() + 48 * 3600 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
const mails = [
  reminderEmail({ step: 1, name: 'Ashley Josco', lines, token: 'sample-preview-email-one' }),
  reminderEmail({ step: 2, name: 'Ashley Josco', lines, token: 'sample-preview-email-two', code: { code: 'CART-SAMPLE', label: 'Free delivery', until } }),
]
const port = Number(process.env.SMTP_PORT) || 465
const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
for (const [i, m] of mails.entries()) {
  await t.sendMail({ from: process.env.EMAIL_FROM, to, subject: `[Sample ${i + 1} of 2] ${m.subject}`, text: m.text, html: m.html })
  console.log(`Sent sample ${i + 1} of 2 to ${to}: ${m.subject}`)
}
