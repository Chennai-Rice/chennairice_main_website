// The team's alert emails as ONE summary a day, at 9 o'clock India time, instead of an
// email for every event: new paid orders (new or repeat customer, and where they came
// from), cancellations, orders waiting too long at a step, and packs running low.
//
// The 10-minute job (jobs.js) calls sendDailyDigest(); it sends once the clock passes 9:00
// IST and the day's summary has not gone out yet. It covers everything since the last one.
// Nothing new and nothing waiting means no email that day.
import { query as defaultQuery } from '../db.js'
import { queueEmail, staffRecipients } from './email.js'
import { SOURCES } from './attribution.js'
import { formatInr, istDateStamp } from './util.js'

export const DIGEST_HOUR_IST = 9
const LAST_KEY = 'staff_digest_last_at'
const DAY_KEY = 'staff_digest_day'

// Orders sitting too long at one step (same rules the per-order reminders used).
const SLA = [
  { status: ['placed'], since: 'placed_at', after: '4 hours', what: 'paid but not confirmed for 4 hours' },
  { status: ['confirmed', 'packed'], since: 'placed_at', after: '2 days', what: 'not shipped 2 days after payment' },
  { status: ['shipped'], since: 'shipped_at', after: '7 days', what: 'shipped 7 days ago and not marked delivered' },
]

const istHour = (d = new Date()) => new Date(d.getTime() + 330 * 60000).getUTCHours()

const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** The summary for the orders and stock between `from` and `to`, or null when there is nothing to report. */
export async function buildDigest(from, to, query = defaultQuery) {
  const { rows: sales } = await query(
    `select o.order_number, o.contact_name, o.contact_phone, o.total_paise, o.placed_at,
            o.traffic_source, o.traffic_campaign, o.traffic_ad,
            (select count(*)::int from orders p
              where p.customer_id = o.customer_id and p.id <> o.id and p.payment_status in ('paid', 'partially_refunded', 'refunded')
                and p.placed_at < o.placed_at) as earlier
       from orders o
      where o.placed_at >= $1 and o.placed_at < $2 and o.payment_status in ('paid', 'partially_refunded', 'refunded')
      order by o.placed_at`,
    [from, to]
  )
  const { rows: cancelled } = await query(
    `select order_number, contact_name, contact_phone, total_paise, cancel_reason, payment_status, cancelled_at
       from orders
      where status = 'cancelled' and placed_at is not null and cancelled_at >= $1 and cancelled_at < $2
      order by cancelled_at`,
    [from, to]
  )
  const waiting = []
  for (const rule of SLA) {
    const { rows } = await query(
      `select order_number, contact_name, contact_phone, total_paise from orders
        where status = any($1) and ${rule.since} < now() - $2::interval order by ${rule.since} limit 50`,
      [rule.status, rule.after]
    )
    for (const r of rows) waiting.push({ ...r, what: rule.what })
  }
  const { rows: [alerts] } = await query(`select value from company_settings where key = 'low_stock_alerts'`)
  const { rows: low } = alerts && alerts.value === 'off' ? { rows: [] } : await query(
    `select p.name, v.pack_kg, v.reorder_level, coalesce(s.on_hand - s.reserved, 0) as available
       from product_variants v join products p on p.id = v.product_id
       left join stock_locations l on l.is_fulfilment
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where v.is_active and p.is_active and v.reorder_level > 0 and coalesce(s.on_hand - s.reserved, 0) <= v.reorder_level
      order by p.name, v.pack_kg`
  )
  if (!sales.length && !cancelled.length && !waiting.length && !low.length) return null

  const total = sales.reduce((n, r) => n + Number(r.total_paise), 0)
  const fresh = sales.filter((r) => r.earlier === 0).length
  const lines = []
  lines.push(`Summary since ${when(from)}.`, '')

  lines.push(`NEW PAID ORDERS: ${sales.length}${sales.length ? ` (${formatInr(total)}; ${fresh} new customer${fresh === 1 ? '' : 's'})` : ''}`)
  for (const r of sales) {
    const src = [SOURCES[r.traffic_source || 'direct'] || r.traffic_source, r.traffic_campaign && 'campaign ' + r.traffic_campaign, r.traffic_ad && 'ad ' + r.traffic_ad].filter(Boolean).join(' · ')
    lines.push(`- ${r.order_number}  ${r.contact_name} (${r.contact_phone})  ${formatInr(r.total_paise)}  ${r.earlier === 0 ? 'NEW customer' : 'repeat customer'}  | from: ${src}`)
  }
  lines.push('')

  lines.push(`CANCELLED ORDERS: ${cancelled.length}`)
  for (const r of cancelled) {
    const paid = ['paid', 'partially_refunded'].includes(r.payment_status)
    lines.push(`- ${r.order_number}  ${r.contact_name} (${r.contact_phone})  ${formatInr(r.total_paise)}${r.cancel_reason ? '  reason: ' + r.cancel_reason : ''}${paid ? '  | PAID: check the refund' : ''}`)
  }
  lines.push('')

  if (waiting.length) {
    lines.push(`ORDERS WAITING TOO LONG: ${waiting.length}`)
    for (const r of waiting) lines.push(`- ${r.order_number}  ${r.contact_name} (${r.contact_phone})  ${formatInr(r.total_paise)}  ${r.what}`)
    lines.push('')
  }
  if (low.length) {
    lines.push(`LOW STOCK: ${low.length}`)
    for (const r of low) lines.push(`- ${r.name} ${r.pack_kg} kg: ${r.available} left (reorder at ${r.reorder_level})`)
    lines.push('')
  }
  lines.push('Open the admin panel to act on these.')

  const bits = [sales.length && `${sales.length} new order${sales.length === 1 ? '' : 's'}`, cancelled.length && `${cancelled.length} cancelled`, waiting.length && `${waiting.length} waiting`, low.length && `${low.length} low stock`].filter(Boolean)
  return { subject: `Daily summary: ${bits.join(', ')}`, text: lines.join('\n') }
}

/**
 * Called by the 10-minute job. Sends the day's summary once, after 9:00 IST. Returns what happened.
 * `now` is injectable for tests.
 */
export async function sendDailyDigest({ query = defaultQuery, now = new Date() } = {}) {
  if (istHour(now) < DIGEST_HOUR_IST) return { sent: false, reason: 'before the digest hour' }
  const day = istDateStamp(now)
  const { rows: [doneRow] } = await query(`select value from company_settings where key = $1`, [DAY_KEY])
  if (doneRow && doneRow.value === day) return { sent: false, reason: 'already done today' }

  const { rows: [last] } = await query(`select value from company_settings where key = $1`, [LAST_KEY])
  const from = last && !Number.isNaN(Date.parse(last.value)) ? new Date(last.value) : new Date(now.getTime() - 24 * 3600 * 1000)
  const digest = await buildDigest(from, now, query)
  // Even when nothing is reported, the day is done and the window moves on.
  for (const [key, value] of [[LAST_KEY, now.toISOString()], [DAY_KEY, day]]) {
    await query(
      `insert into company_settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value]
    )
  }
  if (!digest) return { sent: false, reason: 'nothing to report' }
  const to = await staffRecipients({ query })
  if (!to) return { sent: false, reason: 'no recipients' }
  await queueEmail({ query }, { to, ...digest, template: 'staff_digest', dedupeKey: 'staff-digest:' + day })
  return { sent: true }
}
