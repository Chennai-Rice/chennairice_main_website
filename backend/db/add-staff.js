// Add a staff member, or change their role (works on whichever database the environment points at).
//
//   node db/add-staff.js arun@chennairiceindustries.com "Arun" owner
//
// Roles: owner, admin, it, sales, inventory, plant, dispatch, warehouse, accounts, cloud, blog, mis, performance.
// They sign in with Google using that email.
import { query, closePool } from '../lib/db.js'
import { ROLES } from '../lib/sales/staff.js'

const [email, name, role] = process.argv.slice(2)
try {
  const e = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Give an email, e.g. node db/add-staff.js arun@chennairiceindustries.com "Arun" owner')
  if (!ROLES.includes(role)) throw new Error('Role must be one of: ' + ROLES.join(', '))
  const { rows: [r] } = await query(
    `insert into staff_users (email, full_name, role) values ($1, $2, $3)
     on conflict (email) do update set role = excluded.role, is_active = true
     returning email, full_name, role, is_active`,
    [e, String(name || e.split('@')[0]).trim(), role])
  console.log(`Done: ${r.email} (${r.full_name}) is now ${r.role}${r.is_active ? '' : ' (inactive)'}.`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
