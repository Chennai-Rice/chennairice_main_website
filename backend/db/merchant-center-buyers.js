// Read-only: paid orders that came through Google Merchant Center (Google Shopping / free listings).
//   node db/merchant-center-buyers.js            (database settings of db:migrate in the environment)
//
// Sure:     from 13 Nov 2026 the site keeps Merchant Center's srsltid tag, so those orders are 'google_shopping'.
// Likely:   before that (the product feed went live on 29 Oct 2026), a Merchant Center visit was saved as a Google
//           search visit. A Google visit with no ad click that LANDED ON A PRODUCT PAGE is very likely a Merchant
//           Center listing, because the feed links straight to /products/<rice>; an ordinary Google search
//           usually lands on the home page.
import { closePool, query } from '../lib/db.js'

const IST = "at time zone 'Asia/Kolkata'"
try {
  const r = await query(`
    select case when o.traffic_source = 'google_shopping' or (o.attribution->>'srsltid') is not null then 'Sure'
                else 'Likely' end as match,
           o.order_number, to_char(o.placed_at ${IST}, 'DD Mon YYYY HH24:MI') as placed,
           o.contact_name as name, o.contact_phone as phone, o.contact_email as email,
           round(o.total_paise / 100.0, 2) as total_rs, o.status,
           o.attribution->>'landing' as landing
      from orders o
     where o.placed_at is not null and o.payment_status in ('paid', 'partially_refunded')
       and (o.traffic_source = 'google_shopping' or (o.attribution->>'srsltid') is not null
            or (o.traffic_source = 'google_search' and (o.attribution->>'gclid') is null
                and o.attribution->>'landing' like '/products/%'
                and o.placed_at >= '2026-10-29'))
     order by o.placed_at desc`)
  console.log(`Merchant Center buyers: ${r.rowCount} orders`)
  console.table(r.rows)
  const sum = r.rows.reduce((t, x) => t + Number(x.total_rs), 0)
  console.log(`Total: Rs ${sum.toFixed(2)}`)
} finally {
  await closePool()
}
