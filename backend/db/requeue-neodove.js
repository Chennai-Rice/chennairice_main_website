// Puts NeoDove leads back in the queue after a wrong endpoint made NeoDove answer 404 (Nov 2026).
//
//   node db/requeue-neodove.js          shows how many would go back, changes nothing
//   node db/requeue-neodove.js --apply  puts them back (the 10-minute job then sends them to the telecallers)
//
// Only leads that failed with a 404 in the last 3 days, and whose mobile has not bought since, are put back. Run it with
// the same database settings as db:migrate.
import { getPool, closePool } from '../lib/db.js'

const apply = process.argv.includes('--apply')
const where = `status = 'failed' and last_error like '404%' and created_at > now() - interval '3 days'
  and not exists (select 1 from lead_status l where l.mobile = neodove_outbox.mobile and l.status = 'converted')`

try {
  const pool = await getPool()
  const { rows: [n] } = await pool.query(`select count(*)::int as n from neodove_outbox where ${where}`)
  console.log(`${n.n} lead${n.n === 1 ? '' : 's'} failed with a 404 in the last 3 days.`)
  if (apply && n.n) {
    const { rowCount } = await pool.query(
      `update neodove_outbox set status = 'queued', attempts = 0, agent = null, last_error = null, next_try_at = now() where ${where}`)
    console.log(`Put ${rowCount} back in the queue.`)
  } else if (!apply) {
    console.log('Nothing changed. Run again with --apply to put them back.')
  }
} finally {
  await closePool()
}
