// Removes the company's own numbers (crm.js isBlockedMobile, e.g. 98940 06032) from the lead tables, Nov 2026.
// New sign-ups, checkouts, WhatsApp chats and NeoDove calls from these numbers are already ignored by the code;
// this clears what was saved before.
//
//   node db/remove-company-number.js          shows what would be removed, changes nothing
//   node db/remove-company-number.js --apply  removes it
//
// Orders and payments are kept (they are real money records). Run it with the same database settings as db:migrate.
import { getPool, closePool } from '../lib/db.js'

const apply = process.argv.includes('--apply')
const numbers = ['9894006032', ...String(process.env.BLOCKED_MOBILES || '').split(',')]
  .map((x) => x.replace(/\D/g, '').slice(-10)).filter((x) => x.length === 10)
const ten = (col) => `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10) = any($1::text[])`

// [what, table, where]: rows deleted.
const DELETE = [
  ['Lead status (NeoDove / sign-ups)', 'lead_status', ten('mobile')],
  ['NeoDove outbox', 'neodove_outbox', ten('mobile')],
  ['Sales Daddy outbox', 'crm_outbox', `${ten("payload->>'mobile'")} or ${ten("payload->'lead'->>'mobile'")}`],
  ['WhatsApp contacts', 'whatsapp_contacts', ten('phone')],
]

try {
  const pool = await getPool()
  console.log('Numbers:', numbers.join(', '))
  for (const [what, table, where] of DELETE) {
    const { rows: [n] } = await pool.query(`select count(*)::int n from ${table} where ${where}`, [numbers])
    let line = `${what}: ${n.n}`
    if (apply && n.n) {
      const { rowCount } = await pool.query(`delete from ${table} where ${where}`, [numbers])
      line += ` → removed ${rowCount}`
    }
    console.log(line)
  }
  // Checkout journeys stay (they are site analytics) but are marked so no follow-up is ever sent for them.
  const j = `followed_up_at is null and ${ten('contact_phone')}`
  const { rows: [jn] } = await pool.query(`select count(*)::int n from checkout_journeys where ${j}`, [numbers])
  let line = `Checkout journeys waiting for a follow-up: ${jn.n}`
  if (apply && jn.n) {
    const { rowCount } = await pool.query(`update checkout_journeys set followed_up_at = now(), followup = 'skipped: company number' where ${j}`, [numbers])
    line += ` → marked ${rowCount}`
  }
  console.log(line)
  if (!apply) console.log('Nothing changed. Run again with --apply to remove them.')
} finally {
  await closePool()
}
