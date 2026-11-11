// One-off (Nov 2026): loads the old Supabase analytics and enquiries (exported by db/export-supabase.js) into
// Cloud SQL, keeping every id, visitor number and timestamp, so /admin shows the full history. Safe to run
// again: rows already there are skipped. Page views, events and clicks whose session is missing are skipped.
//
//   node db/import-supabase.js <folder>          (uses DATABASE_URL / CLOUD_SQL_INSTANCE, like db:migrate)
import fs from 'node:fs'
import path from 'node:path'
import { query, closePool } from '../lib/db.js'

const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) { console.error('Give the folder with the exported .json files.'); process.exit(1) }

const BATCH = 500
const CHILD = new Set(['visitor_pageviews', 'visitor_events', 'visitor_interactions'])
const TABLES = ['visitors', 'visitor_sessions', 'visitor_pageviews', 'visitor_events', 'visitor_interactions', 'contact_enquiries', 'bulk_order_enquiries']

try {
  for (const t of TABLES) {
    const file = path.join(dir, `${t}.json`)
    if (!fs.existsSync(file)) { console.log(`${t}: no file, skipped`); continue }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    let added = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = JSON.stringify(rows.slice(i, i + BATCH))
      // Columns are matched by name; the table's own column order is used on both sides.
      const sql = t === 'visitors'
        ? `insert into visitors overriding system value
             select * from json_populate_recordset(null::visitors, $1::json) on conflict do nothing`
        : CHILD.has(t)
          ? `insert into ${t} select x.* from json_populate_recordset(null::${t}, $1::json) x
              where exists (select 1 from visitor_sessions s where s.session_id = x.session_id) on conflict do nothing`
          : `insert into ${t} select * from json_populate_recordset(null::${t}, $1::json) on conflict do nothing`
      const r = await query(sql, [chunk])
      added += r.rowCount
    }
    console.log(`${t}: ${added} added of ${rows.length}`)
  }
  // New visitors continue after the highest imported number.
  await query(`select setval(pg_get_serial_sequence('visitors', 'visitor_no'), greatest((select max(visitor_no) from visitors), 1))`)
  console.log('visitor numbers continue from', (await query('select max(visitor_no) as n from visitors')).rows[0].n)
} catch (err) {
  console.error('Import failed:', err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
