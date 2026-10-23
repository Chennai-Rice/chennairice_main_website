import { useEffect, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { telHref } from './shared.jsx'

// The leads from the QR code at the expo (the /expo form): who, where, what they are and what rice they need.
export default function ExpoLeads({ say, onAuthError }) {
  const [leads, setLeads] = useState(null)

  useEffect(() => {
    staffJson('/api/admin/warehouse/expo-leads?days=366')
      .then((r) => setLeads(r.leads))
      .catch((err) => { setLeads([]); if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])

  async function download() {
    try {
      const res = await staffFetch('/api/admin/warehouse/expo-leads.csv')
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'expo-leads.csv'
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  return (
    <section className="wh-panel">
      <header className="wh-table-head">
        <h2>Expo QR leads{leads ? `: ${leads.length}` : ''}</h2>
        <button type="button" className="wh-btn wh-btn--outline wh-csv" onClick={download} disabled={!leads?.length}>
          Download CSV
        </button>
      </header>
      <p className="wh-muted wh-small">People who scanned the QR code at the expo and filled in the form. They also go to Sales Daddy.</p>
      <div className="wh-expo-list" role="table" aria-label="Expo leads">
        {(leads || []).map((l) => (
          <div className="wh-expo-row" role="row" key={l.phone}>
            <span role="cell"><strong>{l.name}</strong><br /><span className="wh-muted wh-small">{l.location}</span></span>
            <span role="cell"><a className="wh-phone" href={telHref(l.phone)}>{l.phone}</a>{l.email && <><br /><span className="wh-muted wh-small">{l.email}</span></>}</span>
            <span role="cell"><span className="wh-badge wh-badge--pay-refunded">{l.buyerType}</span></span>
            <span role="cell" className="wh-small">{l.requirement}</span>
            <span role="cell" className="wh-small wh-muted">{new Date(l.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        {leads && !leads.length && <p className="wh-empty">No expo leads yet. They appear here as people submit the form.</p>}
      </div>
    </section>
  )
}
