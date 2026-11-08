// Creates (or resets) an email-and-password login for /admin (Oct/Nov 2026): the blog writer (opens the Journal) or the
// MIS user (opens the MIS dashboard), and nothing else. No Firebase: the backend checks the password itself and
// issues a JWT (lib/sales/writer-login.js).
//
// Run by someone who manages the database, in a PowerShell window that has the database settings (as for
// npm run db:migrate) and these:
//   $env:LOGIN_ROLE = "mis"                       (mis, blog or performance)
//   $env:LOGIN_EMAIL = "mis@gmail.com"
//   $env:LOGIN_PASSWORD = "<the password, at least 10 characters>"
//   $env:LOGIN_NAME = "MIS"                       (optional)
//   node db/create-password-login.js
//
// The password is only read from the environment and is stored as a salted hash: it is never kept in the code or
// readable from the database. Run it again to change the password or to unlock the account.
import { query, closePool } from '../lib/db.js'
import { hashPassword, PASSWORD_ROLES } from '../lib/sales/writer-login.js'

const role = String(process.env.LOGIN_ROLE || '').trim().toLowerCase()
const email = String(process.env.LOGIN_EMAIL || '').trim().toLowerCase()
const password = String(process.env.LOGIN_PASSWORD || '')
const name = process.env.LOGIN_NAME || (role === 'mis' ? 'MIS' : role === 'performance' ? 'Performance' : 'Blog writer')

if (!PASSWORD_ROLES.includes(role)) throw new Error(`Set LOGIN_ROLE to one of: ${PASSWORD_ROLES.join(', ')}.`)
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set LOGIN_EMAIL to the login email.')
if (password.length < 10) throw new Error('Set LOGIN_PASSWORD to a password of at least 10 characters.')

const hash = await hashPassword(password)
const { rows: [staff] } = await query('select id, role from staff_users where email = $1', [email])
if (!staff) {
  await query('insert into staff_users (email, full_name, role, password_hash) values ($1, $2, $3, $4)', [email, name, role, hash])
  console.log(`${role} login created: ${email}`)
} else if (staff.role === role) {
  await query('update staff_users set password_hash = $2, is_active = true, login_failures = 0, locked_until = null where id = $1', [staff.id, hash])
  console.log(`${role} login updated: ${email} (password changed, unlocked)`)
} else {
  throw new Error(`${email} is already a staff account with the '${staff.role}' role, not '${role}'. Nothing was changed.`)
}
await closePool()
console.log('Done. Sign in at https://chennairiceindustries.com/admin with this email and password.')
