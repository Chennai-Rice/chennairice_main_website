// Housekeeping that runs on a timer (every 10 minutes in production — see
// functions/src/index.js — or POST /api/jobs/run with the X-Job-Token header).
//
//   1. cancel unpaid orders whose 30-minute stock hold has lapsed
//   2. the team's summary email, once a day at 9:00 India time (digest.js): new orders and
//      where they came from, cancellations, orders waiting too long, low stock
//   3. send queued emails, retry CRM leads, WhatsApp messages and Purchases for Meta
//   4. checkout journeys that stopped before paying, to NeoDove and Sales Daddy (journey-followup.js)
//   5. the bank's UTIB code for settled payments (settlements.js), a catch-up for the settlement webhook
import { query } from '../db.js'
import { runCloudChecks } from './cloud-checks.js'
import { expireUnpaidOrders } from './checkout.js'
import { issueMissingInvoices } from './operations.js'
import { sendQueued } from './email.js'
import { sendDailyDigest } from './digest.js'
import { sendCrmLeads } from '../crm.js'
import { sendWhatsAppMessages } from '../whatsapp.js'
import { sendNeodoveLeads } from '../neodove.js'
import { syncLeadForms } from '../lead-forms.js'
import { syncSettlements } from './settlements.js'
import { followUpJourneys } from './journey-followup.js'
import { sendCartReminders, sendPaymentFailedEmails, sendGoogleReviewEmails } from './cart-recovery.js'
import { sendPendingPurchases } from './meta-capi.js'
import { runWhatsAppAutomations } from '../wa/automations.js'

export async function runJobs() {
  const expired = await expireUnpaidOrders()
  // A GST invoice for any paid order still without one (normally issued at payment).
  const invoices = await issueMissingInvoices({ query }).catch((err) => ({ error: err.message }))
  // The team's alerts go out as one summary a day, at 9:00 India time.
  const digest = await sendDailyDigest({ query })
  // Abandoned cart reminder emails (cart-recovery.js), queued just before the mail goes out.
  const cartReminders = await sendCartReminders({ query })
  // "Payment didn't go through" with a Retry Payment link (cart-recovery.js).
  const paymentFailed = await sendPaymentFailedEmails({ query })
  // "How was your Chennai Rice?" with the Google review link, 2 days after delivery (cart-recovery.js).
  const googleReview = await sendGoogleReviewEmails({ query })
  const email = await sendQueued({ query })
  // Checkout journeys that stopped before paying: queued for NeoDove and Sales Daddy, sent just below.
  const journeys = await followUpJourneys({ query })
  // Leads Sales Daddy could not take at the time are retried here.
  const crm = await sendCrmLeads({ query })
  const whatsapp = await sendWhatsAppMessages({ query })
  // WhatsApp automations and broadcasts (wa/automations.js): who is due, then the queue.
  const waAutomations = await runWhatsAppAutomations({ query })
  await query("delete from wa_events where received_at < now() - interval '90 days'").catch(() => {})
  // Purchases the server could not send to Meta at the time (meta-capi.js).
  const metaCapi = await sendPendingPurchases().catch((err) => ({ error: err.message }))
  // Raw AskEva webhook calls are kept 90 days for checking, then dropped.
  await query("delete from askeva_events where received_at < now() - interval '90 days'").catch(() => {})
  // Meta Instant Form leads that reached Sales Daddy: copied here and queued for NeoDove's Meta campaign (lead-forms.js).
  const leadForms = await syncLeadForms({ query }).catch((err) => ({ error: err.message }))
  // Sign-ups NeoDove could not take at the time; its raw webhook calls kept 90 days.
  // 60 a run (owner, 28 Nov 2026: 329 waiting would have taken over 2½ hours at 20 a run; a launch day queues more).
  const neodove = await sendNeodoveLeads({ query, limit: 60 }).catch(() => ({}))
  await query("delete from neodove_events where received_at < now() - interval '90 days'").catch(() => {})
  // Checkout journeys are kept 90 days (Privacy Policy, 'How we collect your information').
  await query("delete from checkout_journeys where updated_at < now() - interval '90 days'").catch(() => {})
  // Cloud Centre counters (migration 032): API calls per hour and job runs, kept 90 days.
  await query("delete from api_usage where day < (now() at time zone 'Asia/Kolkata')::date - 90").catch(() => {})
  await query("delete from job_runs where started_at < now() - interval '90 days'").catch(() => {})
  await query("delete from uptime_checks where checked_at < now() - interval '90 days'").catch(() => {})
  await query("delete from site_speed where checked_at < now() - interval '90 days'").catch(() => {})
  // The bank's UTIB code for payments Razorpay has settled: a catch-up for the settlement webhook, twice a
  // day (just after 2 pm and 8 pm India time, when payouts have gone), and only while a paid payment
  // from more than a day ago still has none.
  const ist = new Date(Date.now() + 330 * 60000)
  let settlements = null
  if ([14, 20].includes(ist.getUTCHours()) && ist.getUTCMinutes() < 10) {
    const { rows: [due] } = await query(
      `select count(*)::int as n from payments where status = 'paid' and bank_utr is null and paid_at < now() - interval '1 day'`)
    if (due.n) settlements = await syncSettlements({ days: 4 }).catch((err) => ({ error: err.message }))
  }
  // Cloud Centre: uptime of every site, alert emails, and at night one PageSpeed check (cloud-checks.js).
  const cloud = await runCloudChecks({ query })
  return { expired, invoices, digest, cartReminders, paymentFailed, googleReview, email, journeys, crm, whatsapp, waAutomations, metaCapi, leadForms, neodove, settlements, cloud }
}
