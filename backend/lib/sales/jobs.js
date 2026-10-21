// Housekeeping that runs on a timer (every 10 minutes in production — see
// functions/src/index.js — or POST /api/jobs/run with the X-Job-Token header).
//
//   1. cancel unpaid orders whose 30-minute stock hold has lapsed
//   2. the team's summary email, once a day at 9:00 India time (digest.js): new orders and
//      where they came from, cancellations, orders waiting too long, low stock
//   3. send queued emails, retry CRM leads and WhatsApp messages
import { query } from '../db.js'
import { expireUnpaidOrders } from './checkout.js'
import { sendQueued } from './email.js'
import { sendDailyDigest } from './digest.js'
import { sendCrmLeads } from '../crm.js'
import { sendWhatsAppMessages } from '../whatsapp.js'

export async function runJobs() {
  const expired = await expireUnpaidOrders()
  // The team's alerts go out as one summary a day, at 9:00 India time.
  const digest = await sendDailyDigest({ query })
  const email = await sendQueued({ query })
  // Leads Sales Daddy could not take at the time are retried here.
  const crm = await sendCrmLeads({ query })
  const whatsapp = await sendWhatsAppMessages({ query })
  return { expired, digest, email, crm, whatsapp }
}
