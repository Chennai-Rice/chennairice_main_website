import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// /offers → Reviews (Nov 2026): reviews customers wrote from the "Order Delivered" email. Publish the ones to show on
// chennairiceindustries.com/review; hide the rest. New ones wait as "Waiting".
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')
const TABS = [['pending', 'Waiting'], ['published', 'Published'], ['hidden', 'Hidden'], ['', 'All']]
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)

export default function ReviewsAdmin({ say, onAuthError }) {
  const [status, setStatus] = useState('pending')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    staffJson(`/api/admin/reviews${status ? '?status=' + status : ''}`).then(setData).catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [status, onAuthError, say])
  useEffect(() => { load() }, [load])

  async function set(id, next) {
    setBusy(id)
    try {
      await staffJson(`/api/admin/reviews/${id}`, { method: 'PUT', body: JSON.stringify({ status: next }) })
      say(next === 'published' ? 'Published on the website.' : next === 'hidden' ? 'Hidden.' : 'Moved back to waiting.', 'ok')
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  if (!data) return <p className="wh-muted">Loading…</p>
  return (
    <section className="wh-panel of-who">
      <div className="of-who-head">
        <div className="wh-seg" role="group" aria-label="Show">
          {TABS.map(([k, label]) => (
            <button key={k || 'all'} type="button" className={`wh-seg-btn${status === k ? ' is-active' : ''}`} aria-pressed={status === k} onClick={() => setStatus(k)}>
              {label}{k ? ` (${data.counts[k] || 0})` : ''}
            </button>
          ))}
        </div>
        <a className="wh-btn wh-btn--outline" href="/review" target="_blank" rel="noreferrer">Open the review page ↗</a>
      </div>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {data.reviews.map((r) => (
          <article key={r.id} style={{ border: '1px solid var(--wh-line)', borderRadius: 12, padding: '14px 16px', background: '#fff', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: '#e09a1f', fontSize: 20, letterSpacing: 2 }} aria-label={`${r.rating} stars`}>{stars(r.rating)}</span>
              <span className="wh-muted wh-small">{when(r.createdAt)} · <span className="wh-mono">{r.orderNumber}</span></span>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{r.text ? `“${r.text}”` : <span className="wh-muted">(stars only, no words)</span>}</p>
            <p className="wh-small" style={{ margin: 0 }}><strong>{r.name}</strong>{r.city ? `, ${r.city}` : ''} · {r.phone}{r.products ? ` · ${r.products}` : ''}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {r.status !== 'published' && <button type="button" className="wh-btn wh-btn--primary wh-btn--small" disabled={busy === r.id} onClick={() => set(r.id, 'published')}>Publish</button>}
              {r.status !== 'hidden' && <button type="button" className="wh-btn wh-btn--outline wh-btn--small" disabled={busy === r.id} onClick={() => set(r.id, 'hidden')}>Hide</button>}
              {r.status !== 'pending' && <button type="button" className="wh-btn wh-btn--outline wh-btn--small" disabled={busy === r.id} onClick={() => set(r.id, 'pending')}>Back to waiting</button>}
              <span className={'of-pill of-pill--' + (r.status === 'published' ? 'used' : r.status === 'hidden' ? 'expired' : 'open')} style={{ marginLeft: 'auto' }}>
                {r.status === 'published' ? 'Published' : r.status === 'hidden' ? 'Hidden' : 'Waiting'}
              </span>
            </div>
          </article>
        ))}
        {!data.reviews.length && <p className="wh-muted">No reviews here yet.</p>}
      </div>
    </section>
  )
}
