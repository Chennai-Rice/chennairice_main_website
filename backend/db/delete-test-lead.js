// Removes a test sign-up from the website database: the lead, its NeoDove / Sales Daddy queue rows and OTPs.
//   node db/delete-test-lead.js 7299307266        (database settings of db:migrate in the environment)
// Orders and payments are never touched.
import { closePool, query } from '../lib/db.js'

const digits = String(process.argv[2] || '').replace(/\D/g, '').slice(-10)
if (digits.length !== 10) { console.error('Give the 10-digit mobile, e.g. node db/delete-test-lead.js 7299307266'); process.exit(1) }
const like = `%${digits}`
try {
  const run = async (label, sql) => { const r = await query(sql, [like]); console.log(`${label}: ${r.rowCount} removed`) }
  await run('Sign-up (contest_leads)', `delete from contest_leads where regexp_replace(phone, '\\D', '', 'g') like $1`)
  await run('NeoDove queue (neodove_outbox)', `delete from neodove_outbox where regexp_replace(mobile, '\\D', '', 'g') like $1`)
  await run('Lead status (lead_status)', `delete from lead_status where regexp_replace(mobile, '\\D', '', 'g') like $1`)
  await run('OTP requests', `delete from contest_otp_requests where regexp_replace(phone, '\\D', '', 'g') like $1`)
  await run('Sales Daddy queue (crm_outbox)', `delete from crm_outbox where kind = 'contest_signup' and payload::text like '%' || right($1, 10) || '%'`)
} finally {
  await closePool()
}
