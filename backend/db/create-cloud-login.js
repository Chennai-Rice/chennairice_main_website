// Creates (or resets) the email-and-password login for /cloud, the Cloud Centre (Oct 2026).
//
// Run once by someone who manages the Firebase project, in a PowerShell window that has the
// database settings (as for npm run db:migrate) and these two:
//   $env:CLOUD_LOGIN_EMAIL = "it_team@gmail.com"
//   $env:CLOUD_LOGIN_PASSWORD = "<the password>"
//   node db/create-cloud-login.js
//
// It makes the Firebase Authentication user in chennai-rice-website (marked verified, as the
// backend only accepts verified staff emails), and the staff account with the 'cloud' role,
// which can open the Cloud Centre and nothing else. Run it again to change the password.
// The password is only read from the environment: it is never stored in the code or the database.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { query, closePool } from '../lib/db.js'

const email = String(process.env.CLOUD_LOGIN_EMAIL || '').trim().toLowerCase()
const password = String(process.env.CLOUD_LOGIN_PASSWORD || '')
const name = process.env.CLOUD_LOGIN_NAME || 'IT Team (Cloud Centre)'

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set CLOUD_LOGIN_EMAIL to the login email.')
if (password.length < 10) throw new Error('Set CLOUD_LOGIN_PASSWORD to a password of at least 10 characters.')

const auth = getAuth(initializeApp({ projectId: process.env.FIREBASE_PROJECT || 'chennai-rice-website' }))
let user = await auth.getUserByEmail(email).catch((err) => (err.code === 'auth/user-not-found' ? null : Promise.reject(err)))
if (user) {
  user = await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false })
  console.log(`Firebase login updated: ${email} (password changed)`)
} else {
  user = await auth.createUser({ email, password, emailVerified: true, displayName: name })
  console.log(`Firebase login created: ${email}`)
}

const { rows: [staff] } = await query('select id, role, is_active from staff_users where email = $1', [email])
if (!staff) {
  await query(`insert into staff_users (email, firebase_uid, full_name, role) values ($1, $2, $3, 'cloud')`, [email, user.uid, name])
  console.log('Staff account created with the Cloud Centre role.')
} else {
  await query('update staff_users set firebase_uid = $2, is_active = true where id = $1', [staff.id, user.uid])
  console.log(staff.role === 'cloud'
    ? 'Staff account already there (Cloud Centre role), switched on.'
    : `Note: ${email} is already a staff account with the '${staff.role}' role, which was kept as it is.`)
}
await closePool()
console.log('Done. Sign in at https://chennairiceindustries.com/cloud')
