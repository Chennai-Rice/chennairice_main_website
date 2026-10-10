import { useCallback, useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon, Pagination, dayLabel, istDay, telHref, timeLabel } from './shared.jsx'

const TABS = [
  { key: 'open', label: 'Open Issues' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'resolved', label: 'Resolved' },
]
const TYPES = {
  damaged: 'Damaged bags',
  incorrect_quantity: 'Incorrect quantity',
  wrong_product: 'Wrong product',
  return_request: 'Return request',
  delivery_failed: 'Delivery failed',
  quality: 'Quality issue',
  other: 'Other',
}
const STATUS = { open: ['cancelled', 'Open'], under_review: ['todispatch', 'Under Review'], resolved: ['delivered', 'Resolved'] }
const PAGE = 10

function CreateDialog({ busy, onSubmit, onCancel }) {
  const [f, setF] = useState({ order: '', type: 'damaged', description: '' })
  return (
    <div className="wh-modal-backdrop" onClick={onCancel}>
      <form className="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wh-issue-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(f) }}>
        <button type="button" className="wh-modal-x" onClick={onCancel} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-issue-title">Create issue</h2>
        <label className="wh-filter"><span>Order ID or shipment ID *</span>
          <input className="wh-input" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value.toUpperCase() })} required
            placeholder="CR-20261008-K7M4Q or SHP-K7M4-Q9X2" autoFocus />
        </label>
        <label className="wh-filter"><span>Issue type *</span>
          <span className="wh-select"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></span>
        </label>
        <label className="wh-filter"><span>What happened? *</span>
          <textarea className="wh-input wh-textarea" rows="4" value={f.description} maxLength={2000} required
            onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. 2 bags torn on arrival, customer sent photos on WhatsApp" />
        </label>
        <div className="wh-modal-actions">
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Create issue'}</button>
        </div>
      </form>
    </div>
  )
}

function IssueDialog({ id, busy, onUpdate, onClose, say, onAuthError }) {
  const [issue, setIssue] = useState(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    staffJson(`/api/admin/warehouse/issues/${id}`).then(setIssue).catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [id, say, onAuthError])
  if (!issue) return null
  const update = (status) => onUpdate(id, { status, note: note.trim() || undefined })
  return (
    <div className="wh-modal-backdrop" onClick={onClose}>
      <div className="wh-modal wh-modal--wide" role="dialog" aria-modal="true" aria-labelledby="wh-issue-view" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wh-modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-issue-view">{issue.ref} · {issue.typeLabel}</h2>
        <p className="wh-muted">
          Order <strong className="wh-mono">{issue.orderNumber}</strong> · {issue.customer.name} ·{' '}
          <a className="wh-phone" href={telHref(issue.customer.phone)}>{issue.customer.phone}</a> · {issue.city}
        </p>
        <p className="wh-issue-desc">{issue.description}</p>
        {issue.resolution && <p className="wh-issue-res"><strong>Resolution:</strong> {issue.resolution}</p>}
        <h3 className="wh-subhead">History</h3>
        <ol className="wh-timeline">
          {issue.events.map((e, i) => (
            <li key={i}>
              <strong>{e.to_status ? STATUS[e.to_status][1] : 'Note'}</strong>
              {e.note && <span> · {e.note}</span>}
              <span className="wh-muted wh-small"> · {e.staff || 'Staff'} · {dayLabel(e.created_at).text} {timeLabel(e.created_at)}</span>
            </li>
          ))}
        </ol>
        <label className="wh-filter"><span>{issue.status === 'resolved' ? 'Add a note' : 'Note (needed to resolve)'}</span>
          <textarea className="wh-input wh-textarea" rows="3" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={issue.status === 'resolved' ? '' : 'e.g. Sent 2 replacement bags with the next van'} />
        </label>
        <div className="wh-modal-actions wh-modal-actions--wrap">
          <button type="button" className="wh-btn wh-btn--ghost" disabled={busy || !note.trim()} onClick={() => update(undefined)}>Add note</button>
          {issue.status !== 'under_review' && issue.status !== 'resolved' && (
            <button type="button" className="wh-btn wh-btn--outline" disabled={busy} onClick={() => update('under_review')}>Mark under review</button>
          )}
          {issue.status === 'resolved' ? (
            <button type="button" className="wh-btn wh-btn--outline" disabled={busy} onClick={() => update('open')}>Reopen</button>
          ) : (
            <button type="button" className="wh-btn wh-btn--primary" disabled={busy || !note.trim()} onClick={() => update('resolved')}>
              <Icon name="check" size={18} /> Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function IssuesView({ say, onAuthError }) {
  const [tab, setTab] = useState('open')
  const [draft, setDraft] = useState('')
  const [f, setF] = useState({ q: '', type: '', date: '', state: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ issues: [], counts: {}, total: 0 })
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.q === draft ? x : { ...x, q: draft })), 400)
    return () => window.clearTimeout(t)
  }, [draft])
  useEffect(() => setPage(1), [tab, f])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ tab, limit: PAGE, offset: (page - 1) * PAGE })
    for (const k of ['q', 'type', 'state']) if (f[k]) p.set(k, f[k])
    if (f.date === '7days') { p.set('from', istDay(-6)); p.set('to', istDay(0)) }
    if (f.date === '30days') { p.set('from', istDay(-29)); p.set('to', istDay(0)) }
    return p.toString()
  }, [tab, f, page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await staffJson('/api/admin/warehouse/issues?' + qs))
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [qs, say, onAuthError])
  useEffect(() => { load() }, [load])

  async function create(form) {
    setBusy(true)
    try {
      const r = await staffJson('/api/admin/warehouse/issues', { method: 'POST', body: JSON.stringify(form) })
      say(`${r.ref} created`)
      setCreating(false)
      setTab('open')
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function update(id, body) {
    setBusy(true)
    try {
      await staffJson(`/api/admin/warehouse/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      say(body.status === 'resolved' ? 'Issue resolved' : body.status ? 'Issue updated' : 'Note added')
      setViewing(null)
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const total = data.total || 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <>
      <div className="wh-page-head wh-page-head--row">
        <div>
          <h2>Returns &amp; Issues</h2>
          <p className="wh-muted">Damaged goods, wrong quantities, return requests and failed deliveries</p>
        </div>
        <button type="button" className="wh-btn wh-btn--primary" onClick={() => setCreating(true)}>
          <Icon name="returns" size={18} /> Create Issue
        </button>
      </div>

      <section className="wh-panel">
        <nav className="wh-tabs" aria-label="Issue status">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`wh-tab${tab === t.key ? ' is-active' : ''}`} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} ({data.counts[t.key] ?? 0})
            </button>
          ))}
        </nav>
        <div className="wh-searchrow">
          <label className="wh-search">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Search issues</span>
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search order ID, customer, issue number or description..." />
          </label>
        </div>
        <div className="wh-filter-row">
          <label className="wh-filter"><span>Issue Type</span>
            <span className="wh-select"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="">All types</option>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></span>
          </label>
          <label className="wh-filter"><span>Date</span>
            <span className="wh-select wh-select--icon"><Icon name="calendar" size={16} />
              <select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>
                <option value="">All dates</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option>
              </select>
            </span>
          </label>
          <label className="wh-filter"><span>State</span>
            <span className="wh-select"><select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">All states</option><option value="tn">Tamil Nadu</option><option value="other">Other states</option>
            </select></span>
          </label>
          <button type="button" className="wh-btn wh-btn--outline wh-reset" onClick={() => { setDraft(''); setF({ q: '', type: '', date: '', state: '' }) }}>
            <Icon name="reset" size={17} /> Reset
          </button>
        </div>
      </section>

      <section className="wh-panel wh-table-panel" aria-busy={loading}>
        <div className="wh-table wh-table--issues" role="table" aria-label="Issues">
          <div className="wh-tr wh-th" role="row">
            <span role="columnheader">Issue</span>
            <span role="columnheader">Order ID</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Issue Type</span>
            <span role="columnheader">Description</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Actions</span>
          </div>
          {data.issues.map((i) => {
            const d = dayLabel(i.createdAt)
            return (
              <div key={i.id} className="wh-tr" role="row">
                <span role="cell"><strong className="wh-mono">{i.ref}</strong></span>
                <span role="cell" className="wh-mono">{i.orderNumber}</span>
                <span role="cell" className="wh-td-customer"><strong>{i.customer.name}</strong><a className="wh-phone" href={telHref(i.customer.phone)}>{i.customer.phone}</a></span>
                <span role="cell">{i.typeLabel}</span>
                <span role="cell" className="wh-clamp" title={i.description}>{i.description}</span>
                <span role="cell"><span className={d.recent ? 'is-recent' : ''}>{d.text}</span><span className="wh-muted wh-small">{timeLabel(i.createdAt)}</span></span>
                <span role="cell"><span className={`wh-status wh-status--${STATUS[i.status][0]}`}>{STATUS[i.status][1]}</span></span>
                <span role="cell" className="wh-td-actions">
                  <button type="button" className="wh-btn wh-btn--outline wh-btn--small" onClick={() => setViewing(i.id)}>View</button>
                </span>
              </div>
            )
          })}
          {!loading && !data.issues.length && <p className="wh-empty">No issues here.</p>}
        </div>
        <Pagination page={page} pages={pages} total={total} from={total ? (page - 1) * PAGE + 1 : 0}
          to={Math.min(page * PAGE, total)} onPage={setPage} noun="issues" />
      </section>

      {creating && <CreateDialog busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />}
      {viewing && <IssueDialog id={viewing} busy={busy} onUpdate={update} onClose={() => setViewing(null)} say={say} onAuthError={onAuthError} />}
    </>
  )
}
