// Staff sign-in and permissions for the admin panel.
//
// Sign-in is Firebase Auth (same project as the website). The browser sends
// its Firebase ID token as "Authorization: Bearer <token>"; we verify it, then
// look the email up in staff_users. No row, inactive row, or unverified email
// means no access — anyone can create a Firebase account, so the token alone
// proves only who someone is, never what they may do.
//
// First owner: list their email in OWNER_EMAILS (comma separated). On their
// first sign-in they are added as owner; from then on they add everyone else
// from the panel, and OWNER_EMAILS can be emptied.
import { query } from '../db.js'
import { httpError, str } from './util.js'

// warehouse: the team at the mill who confirm and pack orders on /warehouse.
export const ROLES = ['owner', 'admin', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse']
const ALL = ROLES
// Everyone except warehouse: these views carry prices and revenue, which the
// warehouse team does not need to pack an order.
const OFFICE = ROLES.filter((r) => r !== 'warehouse')

// Who may do what. Kept as one table so the whole policy is reviewable at once.
const PERMISSIONS = {
  'dashboard.view': OFFICE,
  'order.view': OFFICE,
  'order.note': ALL,
  'order.confirm': ['owner', 'admin', 'sales', 'warehouse'],
  'order.pack': ['owner', 'admin', 'dispatch', 'inventory', 'warehouse'],
  // The /warehouse page and its CSV export. Prices are never sent to it.
  'warehouse.view': ['owner', 'admin', 'sales', 'dispatch', 'inventory', 'warehouse'],
  'order.ship': ['owner', 'admin', 'dispatch', 'warehouse'],
  'order.deliver': ['owner', 'admin', 'dispatch'],
  'order.cancel': ['owner', 'admin', 'sales'],
  'order.return': ['owner', 'admin', 'sales'],
  'order.resolve': ['owner', 'admin', 'sales'],
  'refund.create': ['owner', 'admin'],
  'inventory.view': ALL,
  'inventory.adjust': ['owner', 'admin', 'inventory'],
  'production.create': ['owner', 'admin', 'plant', 'inventory'],
  'catalog.edit': ['owner', 'admin'],
  'staff.manage': ['owner', 'admin'],
  'settings.manage': ['owner'],
  'shipping.manage': ['owner', 'admin'],
  'emails.view': ['owner', 'admin'],
  // The register of every Order ID / Shipment ID issued, with Razorpay refs.
  'ids.view': ['owner', 'admin'],
}

export function can(staff, permission) {
  return Boolean(staff && PERMISSIONS[permission]?.includes(staff.role))
}

export function permissionsFor(role) {
  return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role))
}

export function requirePermission(staff, permission) {
  if (!can(staff, permission)) {
    throw httpError(`Role ${staff?.role} lacks ${permission}`, { status: 403, publicMessage: 'Your role does not allow that.' })
  }
}

let defaultVerifier = null
async function firebaseVerifier() {
  if (!defaultVerifier) {
    const { initializeApp, getApps } = await import('firebase-admin/app')
    const { getAuth } = await import('firebase-admin/auth')
    const app = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'chennai-rice-website' })
    const auth = getAuth(app)
    defaultVerifier = (token) => auth.verifyIdToken(token, true)
  }
  return defaultVerifier
}

/**
 * Local sign-in by email alone ("dev:<email>" as the token), for trying the
 * staff pages on a developer's machine before Firebase sign-in is set up.
 * Three locks, all required: STAFF_DEV_LOGIN=true, no Cloud SQL instance, and
 * a DATABASE_URL pointing at this machine. A live server fails all three.
 */
export function devLoginEnabled() {
  return (
    process.env.STAFF_DEV_LOGIN === 'true' &&
    !process.env.CLOUD_SQL_INSTANCE &&
    /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(String(process.env.DATABASE_URL || ''))
  )
}

/** Express middleware: sets req.staff or answers 401/403. */
export function staffAuth({ verifyIdToken } = {}) {
  return async (req, res, next) => {
    try {
      const header = String(req.headers.authorization || '')
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
      if (!token) throw httpError('Missing token', { status: 401, publicMessage: 'Please sign in.' })

      let decoded
      const devLogin = token.startsWith('dev:') && devLoginEnabled()
      if (devLogin) {
        // Local testing only — see devLoginEnabled(). The email must still be
        // on the staff list (or in OWNER_EMAILS) to get in.
        decoded = { email: token.slice(4), uid: null, email_verified: true }
      } else {
        try {
          const verify = verifyIdToken || (await firebaseVerifier())
          decoded = await verify(token)
        } catch {
          throw httpError('Invalid token', { status: 401, publicMessage: 'Your session has expired. Please sign in again.' })
        }
      }

      const email = str(decoded.email).toLowerCase()
      if (!email || decoded.email_verified !== true) {
        throw httpError('Unverified email', { status: 403, publicMessage: 'Please verify your email address before signing in.' })
      }

      let { rows: [staff] } = await query('select * from staff_users where email = $1', [email])
      if (!staff) {
        const owners = String(process.env.OWNER_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
        if (owners.includes(email)) {
          ;({ rows: [staff] } = await query(
            `insert into staff_users (email, firebase_uid, full_name, role) values ($1, $2, $3, 'owner')
             on conflict (email) do update set email = excluded.email returning *`,
            [email, decoded.uid, decoded.name || email.split('@')[0]]
          ))
        }
      }
      if (!staff || !staff.is_active) {
        throw httpError('Not staff', { status: 403, publicMessage: 'This account does not have access to the admin panel.' })
      }
      if (!devLogin && staff.firebase_uid && staff.firebase_uid !== decoded.uid) {
        throw httpError('UID mismatch', { status: 403, publicMessage: 'This account does not have access to the admin panel.' })
      }
      if (!devLogin && !staff.firebase_uid) {
        await query('update staff_users set firebase_uid = $2 where id = $1', [staff.id, decoded.uid])
      }
      req.staff = staff
      next()
    } catch (err) {
      next(err)
    }
  }
}

export async function audit(db, staff, action, entityType, entityId, details = null) {
  await db.query(
    `insert into staff_audit_log (staff_id, action, entity_type, entity_id, details) values ($1, $2, $3, $4, $5)`,
    [staff?.id || null, action, entityType, entityId == null ? null : String(entityId), details]
  )
}

// ---- managing staff ---------------------------------------------------------

export async function listStaff() {
  const { rows } = await query('select id, email, full_name, role, is_active, created_at from staff_users order by role, full_name')
  return rows
}

export async function createStaff(actor, body) {
  requirePermission(actor, 'staff.manage')
  const email = str(body?.email).toLowerCase()
  const fullName = str(body?.fullName)
  const role = str(body?.role)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError('A valid email is required.')
  if (!fullName) throw httpError('A name is required.')
  if (!ROLES.includes(role)) throw httpError('Role must be one of ' + ROLES.join(', ') + '.')
  if (role === 'owner' && actor.role !== 'owner') throw httpError('Only an owner can add an owner.', { status: 403 })
  const { rows: [row] } = await query(
    `insert into staff_users (email, full_name, role) values ($1, $2, $3)
     on conflict (email) do nothing returning id, email, full_name, role, is_active`,
    [email, fullName, role]
  )
  if (!row) throw httpError('That email is already on the team.', { status: 409 })
  await audit({ query }, actor, 'staff.create', 'staff', row.id, { email, role })
  return row
}

export async function updateStaff(actor, id, body) {
  requirePermission(actor, 'staff.manage')
  const { rows: [target] } = await query('select * from staff_users where id = $1', [id])
  if (!target) throw httpError('No such staff member.', { status: 404 })
  if ((target.role === 'owner' || body?.role === 'owner') && actor.role !== 'owner') {
    throw httpError('Only an owner can change an owner.', { status: 403 })
  }
  if (target.id === actor.id && (body?.isActive === false || (body?.role && body.role !== actor.role))) {
    throw httpError('You cannot remove your own access.', { status: 400 })
  }
  const role = body?.role ?? target.role
  if (!ROLES.includes(role)) throw httpError('Unknown role.')
  const isActive = typeof body?.isActive === 'boolean' ? body.isActive : target.is_active
  const fullName = str(body?.fullName) || target.full_name
  const { rows: [row] } = await query(
    `update staff_users set role = $2, is_active = $3, full_name = $4 where id = $1
     returning id, email, full_name, role, is_active`,
    [id, role, isActive, fullName]
  )
  await audit({ query }, actor, 'staff.update', 'staff', id, { role, isActive })
  return row
}
