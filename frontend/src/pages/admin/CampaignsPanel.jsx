import { useCallback, useEffect, useState } from 'react'
import {
  canUseGoogleSignIn, canUseLocalSignIn, hasStaffSession, signInLocal, signInWithGoogle, staffJson,
} from '../../services/staffAuth.js'
import SourcesReport from '../warehouse/SourcesReport.jsx'
import '../warehouse/warehouse.css'
import '../warehouse/warehouse-pages.css'

/**
 * /admin → Ad campaigns: the "Where orders come from" report from the
 * warehouse panel. Sales figures need a staff account with money access
 * (owner, admin or IT team); /admin already signs staff in, and the gate
 * below only shows if that sign-in has lapsed.
 */
export default function CampaignsPanel() {
  const [state, setState] = useState('checking') // checking | signin | denied | ready
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  const check = useCallback(async () => {
    setError('')
    if (!(await hasStaffSession())) return setState('signin')
    try {
      const me = await staffJson('/api/admin/me')
      setState(me.permissions?.includes('money.view') ? 'ready' : 'denied')
    } catch {
      setState('signin')
    }
  }, [])
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

  const say = useCallback((message, tone) => { if (tone === 'error') setError(message) }, [])
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
          <h2 className="wh-panel-title">Sign in to see sales</h2>
          <p className="wh-muted">
            {state === 'denied'
              ? 'This staff account cannot see sales figures. Sign in as the owner, an admin or the IT team.'
              : 'Ad results include order values, so they need your staff Google account (owner, admin or IT team).'}
          </p>
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

  return (
    <div className="wh-embed">
      {error && <p className="ad-alert" role="alert">{error}</p>}
      <SourcesReport say={say} onAuthError={onAuthError} />
    </div>
  )
}
