// Staff sign-in for the internal pages (/warehouse).
//
// The backend decides everything: who is staff, and what each role may do.
// This file only signs the person in and attaches proof of it to
// /api/admin requests.
//
// Two kinds of token:
//   - Firebase ID token: the live site. Staff sign in with their Google
//     account; Firebase refreshes the token by itself every hour.
//   - "dev:<email>" for local testing. The backend accepts it ONLY when it is
//     running against a database on the same machine with STAFF_DEV_LOGIN=true
//     (see devLoginEnabled in backend/lib/sales/staff.js), and only `npm run
//     dev` builds offer it, so it can never work on the live site.

const KEY = 'cr.staff.token'

export const canUseLocalSignIn = import.meta.env.DEV

const FIREBASE = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
/** Google sign-in is available once the Firebase web settings are in the build. */
export const canUseGoogleSignIn = Boolean(FIREBASE.apiKey && FIREBASE.authDomain && FIREBASE.projectId && FIREBASE.appId)

/* ---------------------------------------------------- local test token */

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

let devToken = canUseLocalSignIn ? read() : null

/* ------------------------------------------------------------- Firebase */

// Loaded only on /warehouse, so shoppers never download the Firebase SDK.
let firebasePromise = null
function firebase() {
  if (!firebasePromise) {
    firebasePromise = Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, auth]) => {
      const instance = app.getApps()[0] || app.initializeApp(FIREBASE)
      return { auth: auth.getAuth(instance), lib: auth }
    })
  }
  return firebasePromise
}

/** Resolves once Firebase knows whether someone is still signed in from before. */
async function currentUser() {
  if (!canUseGoogleSignIn) return null
  const { auth } = await firebase()
  await auth.authStateReady()
  return auth.currentUser
}

async function bearer() {
  if (devToken) return devToken
  const user = await currentUser()
  return user ? user.getIdToken() : null
}

/* ----------------------------------------------------------- public API */

/** Is someone signed in from an earlier visit? (Checks Firebase, so it is async.) */
export async function hasStaffSession() {
  if (devToken) return true
  return Boolean(await currentUser())
}

export async function signOutStaff() {
  devToken = null
  write(null)
  if (canUseGoogleSignIn && firebasePromise) {
    const { auth, lib } = await firebase()
    await lib.signOut(auth).catch(() => {})
  }
}

/** Live site: Google sign-in pop-up, then the staff profile from the backend. */
export async function signInWithGoogle() {
  const { auth, lib } = await firebase()
  const provider = new lib.GoogleAuthProvider()
  // Suggests the company account first; the backend still checks the staff list.
  provider.setCustomParameters({ hd: 'chennairiceindustries.com', prompt: 'select_account' })
  try {
    await lib.signInWithPopup(auth, provider)
  } catch (err) {
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in was cancelled.')
    }
    if (err?.code === 'auth/popup-blocked') throw new Error('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.')
    if (err?.code === 'auth/unauthorized-domain') throw new Error('Google sign-in is not enabled for this website address yet.')
    if (err?.code === 'auth/configuration-not-found' || err?.code === 'auth/operation-not-allowed') {
      throw new Error('Google sign-in is not switched on in Firebase yet (Authentication → Sign-in method → Google).')
    }
    // The code (e.g. auth/network-request-failed) tells whoever fixes it where to look.
    throw new Error(`Google sign-in failed (${err?.code || 'unknown'}). Please try again.`)
  }
  try {
    return await staffJson('/api/admin/me')
  } catch (err) {
    await signOutStaff()
    throw err
  }
}

/** Local testing only: sign in by email. Returns the staff profile. */
export async function signInLocal(email) {
  devToken = 'dev:' + String(email || '').trim().toLowerCase()
  try {
    const me = await staffJson('/api/admin/me')
    write(devToken)
    return me
  } catch (err) {
    devToken = null
    throw err
  }
}

/** fetch() for /api/admin, with the sign-in attached. A 401 signs out. */
export async function staffFetch(path, options = {}) {
  const token = await bearer()
  if (!token) {
    const err = new Error('Please sign in.')
    err.status = 401
    throw err
  }
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: 'Bearer ' + token,
    },
  })
  if (res.status === 401) await signOutStaff()
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
