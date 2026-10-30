import { useEffect, useState } from 'react'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import { hasStaffSession, signOutStaff } from '../services/staffAuth.js'
import CloudCentrePanel from './admin/CloudCentrePanel.jsx'
import './admin/admin.css'
import './cloud-page.css'

/**
 * /cloud — the Cloud Centre on its own page (Oct 2026), for the IT team's
 * email-and-password login (role 'cloud'), which cannot open /admin or
 * /warehouse. The same panel as /admin → Cloud Centre; staff only, not indexed.
 */
export default function CloudPage() {
  usePageMeta('Cloud Centre — Chennai Rice Industries', 'Staff only.', { noindex: true })
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let alive = true
    const tick = () => hasStaffSession().then((s) => { if (alive) setSignedIn(s) })
    tick()
    const t = window.setInterval(tick, 5000)
    return () => { alive = false; window.clearInterval(t) }
  }, [])

  async function signOut() {
    await signOutStaff()
    window.location.reload()
  }

  return (
    <div className="ad-shell cloud-page">
      <header className="cloud-page-top">
        <a href="/" className="cloud-page-brand">
          <img src="/assets/logo-full-v2.png" alt="Chennai Rice" width="40" height="40" />
          <span>Chennai Rice · IT</span>
        </a>
        {signedIn && <button type="button" className="cloud-page-out" onClick={signOut}>Sign out</button>}
      </header>
      <main className="ad-main cloud-page-main">
        <CloudCentrePanel />
      </main>
    </div>
  )
}
