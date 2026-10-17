import { useCallback, useEffect, useState } from 'react'
import {
  canUseGoogleSignIn, canUseLocalSignIn, hasStaffSession, signInLocal, signInWithGoogle, staffJson,
} from '../../services/staffAuth.js'
import '../warehouse/warehouse.css'
import '../warehouse/warehouse-pages.css'

/**
 * The staff Google sign-in for /admin sections whose data comes from the
 * sales backend (Ad campaigns, Enquiries). /admin's own login is separate, so
 * this asks for the staff account once if needed, then shows the section when
 * the role has `perm`. Children get `onAuthError` to send a lapsed sign-in
 * back here.
 */
export default function StaffGate({ perm, title, why, deniedText, children }) {
  const [state, setState] = useState('checking') // checking | signin | denied | ready
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  const check = useCallback(async () => {
    setError('')
    if (!(await hasStaffSession())) return setState('signin')
    try {
      const me = await staffJson('/api/admin/me')
      setState(me.permissions?.includes(perm) ? 'ready' : 'denied')
    } catch {
      setState('signin')
    }
  }, [perm])
  useEffect(() => { check() }, [check])

  async function run(fn) {
    setError('')
    try {
      await fn()
      await check()
    } catch (err) {
      setError(err.message || 'Could not sign in.')
    }
  }

  const onAuthError = useCallback((err) => {
    if (err?.status === 401 || err?.status === 403) {
      setState('signin')
      return true
    }
    return false
  }, [])

  if (state === 'checking') return <p className="ad-muted">Loading…</p>

  if (state === 'signin' || state === 'denied') {
    return (
      <div className="wh-embed">
        <section className="wh-panel" style={{ maxWidth: 520 }}>
          <h2 className="wh-panel-title">{title}</h2>
          <p className="wh-muted">{state === 'denied' ? deniedText : why}</p>
          {canUseGoogleSignIn && (
            <button type="button" className="wh-btn wh-btn--primary" onClick={() => run(signInWithGoogle)}>
              Sign in with Google
            </button>
          )}
          {canUseLocalSignIn && (
            <form style={{ display: 'flex', gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); run(() => signInLocal(email)) }}>
              <input className="wh-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff email (local test)" />
              <button type="submit" className="wh-btn wh-btn--outline">Sign in</button>
            </form>
          )}
          {error && <p className="wh-small" style={{ color: 'var(--wh-bad)' }}>{error}</p>}
        </section>
      </div>
    )
  }

  return children({ onAuthError })
}
