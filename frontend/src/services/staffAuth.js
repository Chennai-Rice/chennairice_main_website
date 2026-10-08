// Staff sign-in for the internal pages (/warehouse).
//
// The backend decides everything: who is staff, and what each role may do.
// This file only holds the sign-in token for the browser tab and attaches it
// to /api/admin requests.
//
// Two kinds of token:
//   - Firebase ID token (live site, once Google sign-in is set up)
//   - "dev:<email>" for local testing. The backend accepts it ONLY when it is
//     running against a database on the same machine with STAFF_DEV_LOGIN=true
//     (see devLoginEnabled in backend/lib/sales/staff.js), and only `npm run
//     dev` builds offer it, so it can never work on the live site.

const KEY = 'cr.staff.token'

export const canUseLocalSignIn = import.meta.env.DEV

function read() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(token) {
  try {
    if (token) sessionStorage.setItem(KEY, token)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* private mode: sign-in lasts until reload */
  }
}

let memoryToken = read()

export function hasStaffToken() {
  return Boolean(memoryToken)
}

export function signOutStaff() {
  memoryToken = null
  write(null)
}

/** Local testing only: sign in by email. Returns the staff profile. */
export async function signInLocal(email) {
  memoryToken = 'dev:' + String(email || '').trim().toLowerCase()
  try {
    const me = await staffJson('/api/admin/me')
    write(memoryToken)
    return me
  } catch (err) {
    memoryToken = null
    throw err
  }
}

/** fetch() for /api/admin, with the sign-in attached. A 401 signs out. */
export async function staffFetch(path, options = {}) {
  if (!memoryToken) {
    const err = new Error('Please sign in.')
    err.status = 401
    throw err
  }
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: 'Bearer ' + memoryToken,
    },
  })
  if (res.status === 401) signOutStaff()
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(
      data.error ||
        (res.status === 404 ? 'The staff service is not running here yet.' : 'Something went wrong. Please try again.')
    )
    err.status = res.status
    throw err
  }
  return res
}

export async function staffJson(path, options) {
  return (await staffFetch(path, options)).json()
}
