// Creates (or resets) a blog writer's login: an email and a password for /admin, opening the Journal and nothing
// else (Oct 2026). No Firebase: the backend checks the password itself and issues a JWT (lib/sales/writer-login.js).
//
// Run by someone who manages the database, in a PowerShell window that has the database settings (as for
// npm run db:migrate) and these:
//   $env:BLOG_WRITER_EMAIL = "blog@gmail.com"
//   $env:BLOG_WRITER_PASSWORD = "<the password, at least 10 characters>"
//   $env:BLOG_WRITER_NAME = "Blog writer"          (optional)
//   node db/create-blog-writer.js
//
// The password is only read from the environment and is stored as a salted hash: it is never kept in the code or
// readable from the database. Run it again to change the password or to unlock the account.
import { query, closePool } from '../lib/db.js'
import { hashPassword } from '../lib/sales/writer-login.js'

const email = String(process.env.BLOG_WRITER_EMAIL || '').trim().toLowerCase()
const password = String(process.env.BLOG_WRITER_PASSWORD || '')
const name = process.env.BLOG_WRITER_NAME || 'Blog writer'

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set BLOG_WRITER_EMAIL to the writer\'s email.')
if (password.length < 10) throw new Error('Set BLOG_WRITER_PASSWORD to a password of at least 10 characters.')

const hash = await hashPassword(password)
const { rows: [staff] } = await query('select id, role from staff_users where email = $1', [email])
if (!staff) {
  await query(`insert into staff_users (email, full_name, role, password_hash) values ($1, $2, 'blog', $3)`, [email, name, hash])
  console.log(`Writer account created: ${email}`)
} else if (staff.role === 'blog') {
  await query('update staff_users set password_hash = $2, is_active = true, login_failures = 0, locked_until = null where id = $1', [staff.id, hash])
  console.log(`Writer account updated: ${email} (password changed, unlocked)`)
} else {
  throw new Error(`${email} is already a staff account with the '${staff.role}' role. A writer login needs the blog role, so nothing was changed.`)
}
await closePool()
console.log('Done. Sign in at https://chennairiceindustries.com/admin with this email and password.')
