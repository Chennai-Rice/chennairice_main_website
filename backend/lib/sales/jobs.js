// Housekeeping that runs on a timer (every 10 minutes in production — see
// functions/src/index.js — or POST /api/jobs/run with the X-Job-Token header).
//
//   1. cancel unpaid orders whose 30-minute stock hold has lapsed
//   2. remind the team about orders sitting too long at one step
//   3. warn when a pack drops to its reorder level (once a day per pack)
//   4. send queued emails
import { query } from '../db.js'
import { expireUnpaidOrders } from './checkout.js'
import { queueEmail, sendQueued, staffInbox } from './email.js'
import { formatInr, istDateStamp } from './util.js'

const SLA = [
  { key: 'confirm', status: ['placed'], since: 'placed_at', after: '4 hours', what: 'paid but not confirmed for 4 hours' },
  { key: 'ship', status: ['confirmed', 'packed'], since: 'placed_at', after: '2 days', what: 'not shipped 2 days after payment' },
  { key: 'deliver', status: ['shipped'], since: 'shipped_at', after: '7 days', what: 'shipped 7 days ago and not marked delivered' },
]

async function slaReminders() {
  const inbox = staffInbox()
  if (!inbox) return 0
  let queued = 0
  for (const rule of SLA) {
    const { rows } = await query(
      `select id, order_number, contact_name, contact_phone, total_paise from orders
        where status = any($1) and ${rule.since} < now() - $2::interval
          and not exists (select 1 from email_outbox e where e.dedupe_key = 'sla-' || $3 || ':' || orders.id)
        limit 50`,
      [rule.status, rule.after, rule.key]
    )
    for (const o of rows) {
      await queueEmail({ query }, {
        to: inbox,
        subject: `Reminder: ${o.order_number} is ${rule.what}`,
        text: `${o.order_number} (${o.contact_name}, ${o.contact_phone}, ${formatInr(o.total_paise)}) is ${rule.what}. Please check it in the admin panel.`,
        template: 'staff_sla',
        orderId: o.id,
        dedupeKey: `sla-${rule.key}:${o.id}`,
      })
      queued++
    }
  }
  return queued
}

async function lowStockAlerts() {
  const inbox = process.env.INVENTORY_NOTIFY_EMAIL || staffInbox()
  if (!inbox) return 0
  const { rows: [setting] } = await query(`select value from company_settings where key = 'low_stock_alerts'`)
  if (setting && setting.value === 'off') return 0
  const { rows } = await query(
    `select v.id, p.name, v.pack_kg, v.reorder_level, coalesce(s.on_hand - s.reserved, 0) as available
       from product_variants v join products p on p.id = v.product_id
       left join stock_locations l on l.is_fulfilment
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where v.is_active and p.is_active and v.reorder_level > 0
        and coalesce(s.on_hand - s.reserved, 0) <= v.reorder_level`
  )
  const day = istDateStamp()
  for (const v of rows) {
    await queueEmail({ query }, {
      to: inbox,
      subject: `Low stock: ${v.name} ${v.pack_kg} kg (${v.available} left)`,
      text: `${v.name} ${v.pack_kg} kg has ${v.available} packs available, at or below its reorder level of ${v.reorder_level}. Plan a production batch.`,
      template: 'staff_low_stock',
      dedupeKey: `lowstock:${v.id}:${day}`,
    })
  }
  return rows.length
}

export async function runJobs() {
  const expired = await expireUnpaidOrders()
  const reminders = await slaReminders()
  const lowStock = await lowStockAlerts()
  const email = await sendQueued({ query })
  return { expired, reminders, lowStock, email }
}
