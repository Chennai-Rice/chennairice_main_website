// Read only: paid website orders for a period, for matching leads to orders (time, phone, email, amount, products).
//   node db/export-orders.js 2026-11-03 2026-11-12 "D:\Reports\meta_leads\orders.csv"
// Run with the same database settings as db:migrate. Nothing is changed.
import fs from 'node:fs'
import { query, closePool } from '../lib/db.js'
const [from = '2026-11-03', to = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), file = 'orders.csv'] = process.argv.slice(2)
try {
  const { rows } = await query(
    `select o.order_number, to_char(o.placed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as placed_ist,
            o.contact_name, o.contact_phone, o.contact_email, round(o.total_paise / 100.0, 2) as amount, o.payment_status, o.status,
            coalesce(o.traffic_source, 'direct') as source, coalesce(o.traffic_campaign, '') as campaign,
            (select string_agg(i.product_name || ' ' || trim(to_char(i.pack_kg, 'FM999')) || ' kg x ' || i.quantity, '; ')
               from order_items i where i.order_id = o.id) as items
       from orders o
      where o.placed_at is not null and o.payment_status in ('paid', 'partially_refunded')
        and (o.placed_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date
      order by o.placed_at`, [from, to])
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = Object.keys(rows[0] || { order_number: 0 })
  fs.writeFileSync(file, '\ufeff' + [head, ...rows.map((r) => head.map((h) => r[h]))].map((r) => r.map(cell).join(',')).join('\r\n'))
  console.log(`${rows.length} paid orders ${from} to ${to} saved to ${file}`)
} finally {
  await closePool()
}
