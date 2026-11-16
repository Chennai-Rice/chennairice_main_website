// Finds customers saved more than once under the same mobile number (checkout used to key customers by email, so
// one person who typed two emails became two customers) and merges each group into its oldest record, Nov 2026.
// Also reports how many mobiles appear in more than one lead list (sign-up, expo QR, WhatsApp chat): those are not
// removed, each list keeps its own row, and the dashboards now count such a person once.
//
//   node db/merge-duplicate-customers.js          shows the counts, changes nothing
//   node db/merge-duplicate-customers.js --apply  merges the duplicate customers
//
// Prints counts only, never names or numbers. Orders are kept: they move to the record that stays.
// Run it with the same database settings as db:migrate.
import { query, tx, closePool } from '../lib/db.js'

const apply = process.argv.includes('--apply')
const ten = (col) => `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`

try {
  const { rows: groups } = await query(
    `select ${ten('phone')} as m, array_agg(id order by created_at, id) as ids
       from customers where length(${ten('phone')}) = 10
      group by 1 having count(*) > 1`)
  const extra = groups.reduce((a, g) => a + g.ids.length - 1, 0)
  const { rows: [leads] } = await query(
    `with l as (
       select ${ten('phone')} as m, 'signup' as k from contest_leads
       union all select ${ten('phone')}, 'expo' from expo_leads
       union all select ${ten('phone')}, 'chat' from whatsapp_contacts where source = 'webhook')
     select count(*)::int as mobiles, coalesce(sum(n - 1), 0)::int as extra
       from (select m, count(distinct k) as n from l group by m having count(distinct k) > 1) d`)

  console.log(`Customers: ${groups.length} mobile number(s) saved as more than one customer (${extra} extra record(s)).`)
  console.log(`Leads: ${leads.mobiles} mobile number(s) are in more than one lead list (${leads.extra} extra); kept, counted once on the dashboards.`)

  if (!apply) {
    if (extra) console.log('Nothing changed. Run again with --apply to merge the duplicate customers.')
  } else if (extra) {
    const moved = await tx(async (db) => {
      let orders = 0
      for (const g of groups) {
        const [keep, ...drop] = g.ids
        const r = await db.query('update orders set customer_id = $1 where customer_id = any($2::uuid[])', [keep, drop])
        orders += r.rowCount
        await db.query('delete from customers where id = any($1::uuid[])', [drop])
      }
      return orders
    })
    console.log(`Done: merged ${extra} duplicate customer record(s); ${moved} order(s) moved to the record that stays.`)
  }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
