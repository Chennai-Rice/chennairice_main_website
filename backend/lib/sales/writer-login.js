// The blog writer's own sign-in: email and password in, a signed JWT out (Oct 2026), instead of Firebase.
//
//   POST /api/blog/login { email, password }  →  { token, expiresAt, staff }
//
// The token is an HS256 JWT valid for 12 hours, accepted by the staff check (staff.js) for the 'blog' role only.
// Passwords are stored as salted scrypt hashes in staff_users.password_hash and compared in constant time; five
// wrong passwords in a row lock the account for 15 minutes. The signing key is BLOG_JWT_SECRET, or, when that is
// not set, derived from the database password already held in Secret Manager.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { httpError, str } from './util.js'

const scrypt = promisify(scryptCb)
const ISSUER = 'chennairice-writer'
const LIFETIME_SECONDS = 12 * 3600
const MAX_FAILURES = 5
const LOCK_MINUTES = 15
const N = 16384

const b64 = (buf) => Buffer.from(buf).toString('base64url')

function signingKey() {
  if (process.env.BLOG_JWT_SECRET) return process.env.BLOG_JWT_SECRET
  if (process.env.DB_PASSWORD) return createHmac('sha256', process.env.DB_PASSWORD).update('chennairice/blog-writer-jwt/v1').digest()
  return null
}

// ---------------------------------------------------------------- passwords

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(String(password), salt, 64, { N, r: 8, p: 1 })
  return `scrypt$${N}$${b64(salt)}$${b64(hash)}`
}

async function passwordMatches(password, stored) {
  const [kind, n, salt, hash] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64url'), expected.length, { N: Number(n) || N, r: 8, p: 1 })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// A hash to compare against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY = hashPassword('not-a-real-password')

// -------------------------------------------------------------------- token

export function signWriterToken(staff, now = Date.now()) {
  const key = signingKey()
  if (!key) throw httpError('No signing key', { status: 503, publicMessage: 'The writer login is not set up yet.' })
  const iat = Math.floor(now / 1000)
  const body = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: ISSUER, sub: staff.id, email: staff.email, role: 'blog', iat, exp: iat + LIFETIME_SECONDS }))}`
  return { token: `${body}.${b64(createHmac('sha256', key).update(body).digest())}`, expiresAt: new Date((iat + LIFETIME_SECONDS) * 1000).toISOString() }
}

/** True for a JWT made by this module (HS256), so the staff check knows not to hand it to Firebase. */
export function isWriterToken(token) {
  try {
    const header = JSON.parse(Buffer.from(String(token).split('.')[0], 'base64url').toString())
    return header.alg === 'HS256'
  } catch {
    return false
  }
}

/** The token's claims when the signature and expiry are good; throws otherwise. Only HS256 is accepted. */
export function verifyWriterToken(token, now = Date.now()) {
  const bad = () => httpError('Invalid token', { status: 401, publicMessage: 'Your session has expired. Please sign in again.' })
  const key = signingKey()
  const parts = String(token).split('.')
  if (!key || parts.length !== 3) throw bad()
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (header.alg !== 'HS256') throw bad()
    const expected = createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest()
    const given = Buffer.from(parts[2], 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw bad()
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    if (claims.iss !== ISSUER || claims.role !== 'blog' || !claims.sub || !(claims.exp * 1000 > now)) throw bad()
    return claims
  } catch (err) {
    throw err.status ? err : bad()
  }
}

// -------------------------------------------------------------------- login

export async function loginWriter({ query }, { email, password } = {}) {
  const wrong = httpError('Wrong email or password', { status: 401, publicMessage: 'Wrong email or password.' })
  const address = str(email).toLowerCase()
  if (!address || !password) throw wrong

  const { rows: [staff] } = await query(`select * from staff_users where email = $1 and role = 'blog' and is_active`, [address])
  if (staff?.locked_until && new Date(staff.locked_until) > new Date()) {
    throw httpError('Locked', { status: 429, publicMessage: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.` })
  }

  const ok = await passwordMatches(password, staff?.password_hash || (await DUMMY))
  if (!staff || !staff.password_hash || !ok) {
    if (staff) {
      await query(
        `update staff_users set login_failures = login_failures + 1,
                locked_until = case when login_failures + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
          where id = $1`, [staff.id, MAX_FAILURES, LOCK_MINUTES])
    }
    throw wrong
  }

  await query('update staff_users set login_failures = 0, locked_until = null where id = $1', [staff.id])
  const { token, expiresAt } = signWriterToken(staff)
  return { token, expiresAt, staff: { email: staff.email, fullName: staff.full_name, role: staff.role } }
}

/** The active 'blog' staff row a token's claims point at, or null (removed, switched off, or no longer a writer). */
export async function writerFromClaims({ query }, claims) {
  const { rows: [staff] } = await query(`select * from staff_users where id::text = $1 and role = 'blog' and is_active`, [str(claims.sub)])
  return staff || null
}
