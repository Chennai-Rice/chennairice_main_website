import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import StaffGate from './StaffGate.jsx'
import { downloadCsv } from './AdvisorAnswer.jsx'
import './journeys.css'

/*
  /admin → Checkout journeys (Oct 2026): every shopper's way through the shop —
  Add to cart → Proceed to checkout → Details filled → Continue to payment →
  Payment cancelled / failed, or Purchased — as a funnel, and as a list of
  people with what they had in the cart and where they stopped, so the team
  can follow up those who filled their details but did not pay.
  Owner and IT only (/api/admin/journeys).
*/

const STEPS = [
  { key: 'cart', label: 'Added to cart' },
  { key: 'checkout', label: 'Proceeded to checkout' },
  { key: 'details', label: 'Filled details' },
  { key: 'payment', label: 'Continued to payment' },
  { key: 'purchased', label: 'Purchased' },
]
// Where a stopped journey was sent for a call (journey-followup.js).
const FOLLOWUP = {
  payment: 'Sent to NeoDove: Payment not completed',
  details: 'Sent to NeoDove: Left at details · Sales Daddy',
}
const OUTCOME = {
  purchased: { text: 'Purchased', tone: 'good' },
  cancelled: { text: 'Payment cancelled', tone: 'bad' },
  failed: { text: 'Payment failed', tone: 'bad' },
  payment: { text: 'Left at payment', tone: 'warn' },
  details: { text: 'Left at details', tone: 'warn' },
  checkout: { text: 'Left at checkout', tone: 'muted' },
  cart: { text: 'Left at cart', tone: 'muted' },
}
const FILTERS = ['', 'purchased', 'cancelled', 'failed', 'payment', 'details', 'checkout', 'cart']
const PAGE = 50

const inr = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }))
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10)
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

function Funnel({ f }) {
  return (
    <section className="cj-funnel" aria-label="Checkout funnel">
      {STEPS.map((s, i) => {
        const n = f[s.key] || 0
        const prev = i ? f[STEPS[i - 1].key] || 0 : null
        return (
          <div key={s.key} className={`cj-step${s.key === 'purchased' ? ' is-last' : ''}`}>
            <span className="cj-step-label">{s.label}</span>
            <strong>{n.toLocaleString('en-IN')}</strong>
            <div className="cj-bar"><span style={{ width: `${f.cart ? Math.max(2, pct(n, f.cart)) : 0}%` }} /></div>
            {prev != null && (
              <span className="cj-step-foot">{pct(n, prev)}% carried on · <b>{Math.max(0, prev - n)}</b> stopped</span>
            )}
          </div>
        )
      })}
      <div className="cj-extra">
        <span className="cj-pill is-bad">Payment cancelled <b>{f.cancelled || 0}</b></span>
        <span className="cj-pill is-bad">Payment failed <b>{f.failed || 0}</b></span>
        <span className="cj-pill is-warn">Unpaid carts with details <b>{inr(f.openValue)}</b></span>
      </div>
    </section>
  )
}

function Journey({ j, picked, onPick, onDelete }) {
  const o = OUTCOME[j.outcome] || OUTCOME.cart
  const phone = digits(j.customer?.phone)
  const items = (j.items || []).map((i) => `${i.qty} × ${i.name || i.id}`).join(', ')
  return (
    <li className={`cj-row${picked ? ' is-picked' : ''}`}>
      <div className="cj-who">
        <label className="cj-check">
          <input type="checkbox" checked={picked} onChange={() => onPick(j.id)} aria-label={`Select ${j.customer?.name || 'this visitor'}`} />
          <span className="cj-muted">Select</span>
        </label>
        {j.customer ? (
          <>
            <strong>{j.customer.name || 'No name'}</strong>
            {j.customer.phone && <span>{j.customer.phone}</span>}
            {j.customer.email && <span className="cj-muted">{j.customer.email}</span>}
            {phone.length === 10 && (
              <span className="cj-contact">
                <a href={`tel:+91${phone}`}>Call</a>
                <a href={`https://wa.me/91${phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </span>
            )}
          </>
        ) : <strong className="cj-muted">Visitor (no details yet)</strong>}
        {j.place && <span className="cj-muted">{j.place}</span>}
      </div>
      <div className="cj-cart">
        <span>{items || '—'}</span>
        <strong>{inr(j.value)}</strong>
        {j.orderNumber && <span className="cj-mono">{j.orderNumber}</span>}
      </div>
      <div className="cj-path" aria-label="Steps reached">
        {STEPS.map((s) => {
          const at = s.key === 'purchased' ? (j.outcome === 'purchased' ? j.steps?.purchased || j.updatedAt : null) : j.steps?.[s.key]
          return <span key={s.key} className={`cj-dot${at ? ' is-on' : ''}`} title={at ? `${s.label}: ${when(at)}` : `${s.label}: not reached`} />
        })}
      </div>
      <div className="cj-end">
        <span className={`cj-badge is-${o.tone}`}>{o.text}</span>
        <span className="cj-muted">{when(j.updatedAt)}</span>
        {j.paymentAttempts > 1 && <span className="cj-muted">{j.paymentAttempts} payment attempts</span>}
        {j.lastError && j.outcome !== 'purchased' && <span className="cj-note">{j.lastError}</span>}
        {j.source && <span className="cj-muted">Source: {j.source}</span>}
        {FOLLOWUP[j.followup] && j.outcome !== 'purchased' && (
          <span className="cj-note" title={j.followedUpAt ? `Sent ${when(j.followedUpAt)}` : undefined}>{FOLLOWUP[j.followup]}</span>
        )}
        <button type="button" className="cj-del" onClick={() => onDelete([j.id])}>Delete</button>
      </div>
    </li>
  )
}

function Journeys({ onAuthError }) {
  const [days, setDays] = useState(7)
  const [outcome, setOutcome] = useState('')
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState(() => new Set())

  useEffect(() => {
    const t = window.setTimeout(() => setQ(draft.trim()), 400)
    return () => window.clearTimeout(t)
  }, [draft])

  const load = useCallback(async (offset = 0) => {
    setLoading(true)
    setError('')
    try {
      const r = await staffJson('/api/admin/journeys?' + new URLSearchParams({ days, outcome, q, limit: PAGE, offset }))
      setData(r)
      setRows((prev) => (offset ? [...prev, ...r.journeys] : r.journeys))
    } catch (err) {
      if (!onAuthError(err)) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days, outcome, q, onAuthError])
  useEffect(() => { load(0) }, [load])

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const allShown = rows.length > 0 && rows.every((j) => picked.has(j.id))
  const toggleAll = () => setPicked(allShown ? new Set() : new Set(rows.map((j) => j.id)))

  // Removes journey records only: an order a journey led to is never deleted.
  async function remove(ids) {
    const real = rows.filter((j) => ids.includes(j.id) && j.orderNumber).length
    const text = `Delete ${ids.length === 1 ? 'this journey' : `these ${ids.length} journeys`}?

` +
      (real ? `${real} led to an order. The order itself stays; only the journey (and its place in the funnel) goes.

` : '') +
      'This cannot be undone.'
    if (!window.confirm(text)) return
    setError('')
    try {
      await staffJson('/api/admin/journeys/delete', { method: 'POST', body: JSON.stringify({ ids }) })
      setPicked(new Set())
      load(0)
    } catch (err) {
      if (!onAuthError(err)) setError(err.message || 'Could not delete.')
    }
  }

  async function csv() {
    try {
      const r = await staffJson('/api/admin/journeys?' + new URLSearchParams({ days, outcome, q, limit: 500 }))
      downloadCsv(`checkout-journeys-${r.period.from}-to-${r.period.to}`,
        ['Started', 'Last update', 'Outcome', 'Name', 'Phone', 'Email', 'Place', 'Cart', 'Value (₹)', 'Order', 'Payment attempts', 'Note', 'Source'],
        r.journeys.map((j) => [when(j.startedAt), when(j.updatedAt), (OUTCOME[j.outcome] || {}).text || j.outcome, j.customer?.name || '', j.customer?.phone || '', j.customer?.email || '',
          j.place || '', (j.items || []).map((i) => `${i.qty} x ${i.name || i.id}`).join('; '), j.value ?? '', j.orderNumber || '', j.paymentAttempts, j.lastError || '', j.source || '']))
    } catch (err) {
      if (!onAuthError(err)) setError(err.message)
    }
  }

  return (
    <div className="cj">
      <div className="cj-toolbar">
        <div className="cj-seg" role="group" aria-label="Period">
          {[7, 30, 90].map((d) => <button key={d} type="button" className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>Last {d} days</button>)}
        </div>
        <div className="cj-actions">
          {picked.size > 0 && (
            <button type="button" className="cj-btn cj-btn--danger" onClick={() => remove([...picked])}>Delete selected ({picked.size})</button>
          )}
          <button type="button" className="cj-btn" onClick={csv} disabled={!rows.length}>⬇ Download CSV</button>
        </div>
      </div>
      {error && <p className="ad-alert" role="alert">{error}</p>}
      {data && <Funnel f={data.funnel} />}

      <section className="cj-list-card">
        <div className="cj-filters">
          <div className="cj-chips">
            {FILTERS.map((k) => (
              <button key={k || 'all'} type="button" className={outcome === k ? 'is-on' : ''} onClick={() => setOutcome(k)}>
                {k ? OUTCOME[k].text : 'All'}
              </button>
            ))}
          </div>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search name, phone, city or order…" aria-label="Search journeys" />
        </div>
        {data && (
          <p className="cj-count">
            {data.total.toLocaleString('en-IN')} {data.total === 1 ? 'journey' : 'journeys'} · {data.period.from} to {data.period.to}
            {rows.length > 0 && (
              <label className="cj-check cj-check--all">
                <input type="checkbox" checked={allShown} onChange={toggleAll} /> Select all shown
              </label>
            )}
          </p>
        )}
        {rows.length ? <ul className="cj-list">{rows.map((j) => <Journey key={j.id} j={j} picked={picked.has(j.id)} onPick={toggle} onDelete={remove} />)}</ul>
          : !loading && <p className="cj-empty">No journeys here yet. Steps are recorded from today's update onwards.</p>}
        {data && rows.length < data.total && (
          <button type="button" className="cj-btn cj-more" onClick={() => load(rows.length)} disabled={loading}>{loading ? 'Loading…' : 'Show more'}</button>
        )}
      </section>
    </div>
  )
}

export default function CheckoutJourneysPanel() {
  return (
    <StaffGate
      perm="analyst.view"
      title="Sign in to see checkout journeys"
      why="Checkout journeys include customers' names and mobile numbers, so they need your staff Google account (owner or IT team)."
      deniedText="This staff account cannot open checkout journeys. Sign in as the owner or the IT team."
    >
      {({ onAuthError }) => <Journeys onAuthError={onAuthError} />}
    </StaffGate>
  )
}
