import { useEffect, useState } from 'react'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import { hasStaffSession, signOutStaff } from '../services/staffAuth.js'
import JournalGate from './blog/JournalGate.jsx'
import './admin/admin.css'
import './cloud-page.css'

/**
 * /journal — the writing tool on its own page (Oct 2026), for the writer's email-and-password login (role 'blog'),
 * which cannot open /admin or /warehouse. The same tool as /admin → Journal; staff only, not indexed.
 */
export default function JournalPage() {
  usePageMeta('Journal — Chennai Rice Industries', 'Staff only.', { noindex: true })
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
          <span>Chennai Rice · Journal</span>
        </a>
        {signedIn && <button type="button" className="cloud-page-out" onClick={signOut}>Sign out</button>}
      </header>
      <main className="ad-main cloud-page-main">
        <JournalGate />
      </main>
    </div>
  )
}
