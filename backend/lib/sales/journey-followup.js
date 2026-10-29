// Checkout journeys that stopped before a purchase, followed up by the sales team (migration 031).
//
// 30 minutes after a shopper's last step, a journey with a mobile number and no paid order on that
// mobile since it started goes to:
//   NeoDove   "Payment not completed" campaign: pressed Pay, then cancelled / failed / never finished
//             "Left at details" campaign:       filled in the checkout form, never pressed Pay
//             (each its own campaign, apart from the sign-up one; see NEODOVE_CAMPAIGNS in neodove.js)
//   Sales Daddy  "Left at details" journeys: a note on the customer's lead with the basket and the steps,
//                tag "Left at details". "Payment not completed" is not sent again here: its unpaid order
//                already reaches Sales Daddy when it expires ("Abandoned checkout", Checkout not paid).
// A mobile is called at most once a week per campaign. Cart-only journeys have no mobile and are not sent.
// Run by the 10-minute job (jobs.js). Never throws.
import { query as defaultQuery } from '../db.js'
import { crmMobile, crmLead, crmEnabled } from '../crm.js'

const WAIT_MINUTES = 30
// Journeys from before this went live, or long stale, are left alone.
const MAX_AGE_HOURS = 48
const PAID = ['paid', 'partially_refunded']
const STAGE_LABEL = { details: 'Filled in details, did not press Pay', payment: 'Went to payment, did not finish',
  cancelled: 'Cancelled the payment', failed: 'Payment failed' }

const rupees = (paise) => '₹' + (Number(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const when = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const basket = (items) => (Array.isArray(items) ? items.map((i) => `${i.qty || 1} x ${i.name || i.id}`).join(', ') : '')

/** 'payment' or 'details': which campaign a journey's last stage belongs to (null: not followed up). */
export function followupKind(stage) {
  if (['payment', 'cancelled', 'failed'].includes(stage)) return 'payment'
  if (stage === 'details') return 'details'
  return null
}

/** What the telecaller sees in NeoDove. */
export function neodovePayload(j, mobile) {
  return {
    name: j.contact_name || 'Website shopper',
    // NeoDove's own example sends the mobile as a number.
    mobile: Number(mobile),
    email: j.contact_email || '',
    Stopped: STAGE_LABEL[j.stage] || j.stage,
    Basket: basket(j.items),
    Value: j.value_paise != null ? rupees(j.value_paise) : '',
    Place: [j.city, j.state, j.pincode].filter(Boolean).join(', '),
    Order: j.order_number || '',
    Error: j.last_error || '',
    Source: j.traffic_source || '',
    'Last step': when(j.updated_at),
  }
}

/** The Sales Daddy note for a journey that stopped at the details step. */
export function journeyNote(j) {
  const steps = Object.entries(j.steps || {}).sort((a, b) => new Date(a[1]) - new Date(b[1]))
    .map(([s, t]) => `${s} ${when(t)}`).join(' → ')
  return [
    `Website checkout left at the details step: filled in name and mobile, did not press Pay.${j.value_paise ? ` Basket ${rupees(j.value_paise)}.` : ''} Worth a call.`,
    basket(j.items) && `Basket: ${basket(j.items)}`,
    [j.city, j.state, j.pincode].filter(Boolean).length ? `Place: ${[j.city, j.state, j.pincode].filter(Boolean).join(', ')}` : null,
    steps && `Steps: ${steps}`,
    j.traffic_source && `Came from: ${j.traffic_source}`,
  ].filter(Boolean).join('\n').slice(0, 2000)
}

export async function followUpJourneys({ query = defaultQuery, waitMinutes = WAIT_MINUTES } = {}) {
  const done = { payment: 0, details: 0, salesDaddy: 0, skipped: 0 }
  try {
    const { rows } = await query(
      `select j.*, o.payment_status as order_payment
         from checkout_journeys j left join orders o on o.id = j.order_id
        where j.followed_up_at is null and j.contact_phone is not null and j.stage <> 'purchased'
          and j.updated_at < now() - make_interval(mins => $1)
          and j.updated_at > now() - make_interval(hours => $2)
        order by j.updated_at limit 50`,
      [waitMinutes, MAX_AGE_HOURS])
    for (const j of rows) {
      const mark = (what) => query(`update checkout_journeys set followed_up_at = now(), followup = $2 where id = $1 and followed_up_at is null`, [j.id, what])
      const mobile = crmMobile(j.contact_phone)
      const kind = followupKind(j.stage)
      if (!/^[6-9]\d{9}$/.test(mobile) || !kind) { done.skipped++; await mark(!kind ? `skipped: stage ${j.stage}` : 'skipped: no valid mobile'); continue }
      // Bought after all (this journey's order, or another order on the same mobile since it started).
      const { rows: [paid] } = await query(
        `select 1 from orders where payment_status = any($3::text[]) and placed_at >= $2
            and right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1 limit 1`, [mobile, j.started_at, PAID])
      if (paid || PAID.includes(j.order_payment)) { done.skipped++; await mark('skipped: bought'); continue }

      const campaign = `checkout_${kind}`
      const { rows: [recent] } = await query(
        `select 1 from neodove_outbox where mobile = $1 and campaign = $2 and created_at > now() - interval '7 days' limit 1`, [mobile, campaign])
      if (!recent) {
        await query(`insert into neodove_outbox (mobile, campaign, journey_id, payload) values ($1, $2, $3, $4)`,
          [mobile, campaign, j.id, neodovePayload(j, mobile)])
        done[kind]++
      }
      // Sales Daddy only for "left at details" (an unpaid order is already sent when it expires).
      let sd = false
      if (kind === 'details' && !j.order_id) {
        const { rows: [noted] } = await query(
          `select 1 from crm_outbox where kind = 'journey' and payload->'lead'->>'mobile' = $1 and created_at > now() - interval '7 days' limit 1`, [mobile])
        if (!noted) {
          await query(`insert into crm_outbox (kind, payload) values ('journey', $1)`, [{
            lead: crmLead('journey', { name: j.contact_name || 'Website shopper', phone: mobile, email: j.contact_email, city: j.city, state: j.state }),
            note: journeyNote(j),
          }])
          sd = true
          done.salesDaddy++
        }
      }
      await mark(recent && !sd ? `${kind} (already called this week)` : kind)
    }
  } catch (err) {
    console.error('[journey follow-up]', err.message)
  }
  return { ...done, salesDaddyEnabled: crmEnabled() }
}
