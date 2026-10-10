import { useCallback, useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon, Pagination, dayLabel, istDay, telHref } from './shared.jsx'
import ShipDialog, { METHOD_LABEL } from './ShipDialog.jsx'

const TABS = [
  { key: 'all', label: 'All Shipments' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'delayed', label: 'Delayed' },
]
const PAGE = 10

function DeliverDialog({ s, busy, onSubmit, onCancel }) {
  const [note, setNote] = useState('')
  return (
    <div className="wh-modal-backdrop" onClick={onCancel}>
      <form className="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wh-deliver-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(note) }}>
        <h2 id="wh-deliver-title">Confirm delivery</h2>
        <p>
          <strong>{s.orderNumber}</strong> to {s.customer.name}, {s.destination.city}.
          The customer's tracking page will show <strong>Delivered</strong>.
        </p>
        <label className="wh-filter">
          <span>Note (optional)</span>
          <input className="wh-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Received by the customer's son" />
        </label>
        <div className="wh-modal-actions">
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy} autoFocus>
            <Icon name="check" size={18} /> {busy ? 'Saving…' : 'Mark as delivered'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TrackDialog({ s, onClose }) {
  return (
    <div className="wh-modal-backdrop" onClick={onClose}>
      <div className="wh-modal wh-modal--wide" role="dialog" aria-modal="true" aria-labelledby="wh-track-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wh-modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-track-title">{s.shipmentNumber}</h2>
        <p className="wh-muted">Order {s.orderNumber}</p>
        <dl className="wh-dl">
          <div><dt>Method</dt><dd>{s.method ? METHOD_LABEL[s.method] : 'Not recorded yet'}{s.carrier ? ` · ${s.carrier}` : ''}</dd></div>
          {s.trackingNumber && <div><dt>Tracking no.</dt><dd className="wh-mono">{s.trackingNumber}</dd></div>}
          {s.lrNumber && <div><dt>LR no.</dt><dd className="wh-mono">{s.lrNumber}</dd></div>}
          {s.vehicle && <div><dt>Vehicle</dt><dd className="wh-mono">{s.vehicle}</dd></div>}
          {(s.driverName || s.driverPhone) && (
            <div><dt>Driver</dt><dd>{s.driverName} {s.driverPhone && <a className="wh-phone" href={telHref(s.driverPhone)}>{s.driverPhone}</a>}</dd></div>
          )}
          <div><dt>Dispatched</dt><dd>{dayLabel(s.shippedAt).text}</dd></div>
          {s.expectedDelivery && <div><dt>Expected</dt><dd>{s.expectedDelivery}{s.delayed && <span className="wh-badge wh-badge--late"> Delayed</span>}</dd></div>}
          {s.deliveredAt && <div><dt>Delivered</dt><dd>{dayLabel(s.deliveredAt).text}</dd></div>}
          <div><dt>Customer</dt><dd>{s.customer.name} · <a className="wh-phone" href={telHref(s.customer.phone)}>{s.customer.phone}</a></dd></div>
          <div><dt>Destination</dt><dd>{s.destination.city}, {s.destination.state} - {s.destination.pincode}</dd></div>
          {s.notes && <div><dt>Notes</dt><dd>{s.notes}</dd></div>}
        </dl>
        <div className="wh-modal-actions">
          {s.trackingUrl && (
            <a className="wh-btn wh-btn--primary" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">
              Open {s.carrier || 'courier'} tracking
            </a>
          )}
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function DeliveriesView({ say, onAuthError, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'all')
  const [draft, setDraft] = useState('')
  const [f, setF] = useState({ q: '', date: '', transporter: '', method: '', state: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ shipments: [], counts: {}, total: 0 })
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(null) // { kind: 'track' | 'deliver' | 'edit', s }
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])
  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.q === draft ? x : { ...x, q: draft })), 400)
    return () => window.clearTimeout(t)
  }, [draft])
  useEffect(() => setPage(1), [tab, f])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ tab, limit: PAGE, offset: (page - 1) * PAGE })
    for (const k of ['q', 'transporter', 'method', 'state']) if (f[k]) p.set(k, f[k])
    if (f.date === 'today') { p.set('from', istDay(0)); p.set('to', istDay(0)) }
    if (f.date === '7days') { p.set('from', istDay(-6)); p.set('to', istDay(0)) }
    if (f.date === '30days') { p.set('from', istDay(-29)); p.set('to', istDay(0)) }
    return p.toString()
  }, [tab, f, page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await staffJson('/api/admin/warehouse/shipments?' + qs))
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [qs, say, onAuthError])
  useEffect(() => { load() }, [load])

  async function act(fn, success) {
    setBusy(true)
    try {
      await fn()
      say(success)
      setDialog(null)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
      load()
    }
  }

  async function downloadCsv() {
    // Every matching shipment (up to 200), not just this page.
    let all
    try {
      const p = new URLSearchParams(qs)
      p.set('limit', '200')
      p.set('offset', '0')
      all = (await staffJson('/api/admin/warehouse/shipments?' + p)).shipments
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
      return
    }
    const header = ['Order ID', 'Shipment ID', 'Dispatched', 'Method', 'Transporter', 'Tracking / LR no.', 'Vehicle', 'Customer', 'Phone', 'Destination', 'PIN', 'Expected', 'Status']
    const esc = (v) => {
      let s = v == null ? '' : String(v)
      if (/^[=+\-@]/.test(s)) s = "'" + s
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const rows = all.map((s) => [s.orderNumber, s.shipmentNumber, dayLabel(s.shippedAt).text, METHOD_LABEL[s.method] || '',
      s.carrier, s.trackingNumber || s.lrNumber, s.vehicle, s.customer.name, s.customer.phone, `${s.destination.city}, ${s.destination.state}`,
      s.destination.pincode, s.expectedDelivery, s.status === 'delivered' ? 'Delivered' : s.delayed ? 'Delayed' : 'In transit'].map(esc).join(','))
    const blob = new Blob(['﻿' + [header.join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `deliveries-${istDay(0)}.csv`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const total = data.total || 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <>
      <div className="wh-page-head">
        <h2>Deliveries</h2>
        <p className="wh-muted">Track dispatched shipments and confirm delivery</p>
      </div>

      <section className="wh-panel">
        <nav className="wh-tabs" aria-label="Delivery status">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`wh-tab${tab === t.key ? ' is-active' : ''}${t.key === 'delayed' && data.counts.delayed ? ' is-alert' : ''}`}
              aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} ({data.counts[t.key] ?? 0})
            </button>
          ))}
        </nav>
        <div className="wh-searchrow">
          <label className="wh-search">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Search</span>
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search order ID, customer, tracking, LR or vehicle number..." />
          </label>
          <button type="button" className="wh-btn wh-btn--outline wh-csv" onClick={downloadCsv} disabled={!data.shipments.length}>
            <Icon name="download" size={18} /> Download CSV
          </button>
        </div>
        <div className="wh-filter-row">
          <label className="wh-filter"><span>Dispatch Date</span>
            <span className="wh-select wh-select--icon"><Icon name="calendar" size={16} />
              <select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>
                <option value="">All dates</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option>
              </select>
            </span>
          </label>
          <label className="wh-filter"><span>Method</span>
            <span className="wh-select"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option value="">All methods</option>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></span>
          </label>
          <label className="wh-filter"><span>Transporter</span>
            <input className="wh-input" value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} placeholder="e.g. DTDC" />
          </label>
          <label className="wh-filter"><span>State</span>
            <span className="wh-select"><select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">All states</option><option value="tn">Tamil Nadu</option><option value="other">Other states</option>
            </select></span>
          </label>
          <button type="button" className="wh-btn wh-btn--outline wh-reset" onClick={() => { setDraft(''); setF({ q: '', date: '', transporter: '', method: '', state: '' }) }}>
            <Icon name="reset" size={17} /> Reset
          </button>
        </div>
      </section>

      <section className="wh-panel wh-table-panel" aria-busy={loading}>
        <div className="wh-table wh-table--deliveries" role="table" aria-label="Shipments">
          <div className="wh-tr wh-th" role="row">
            <span role="columnheader">Order ID</span>
            <span role="columnheader">Dispatched</span>
            <span role="columnheader">Tracking / LR No.</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Destination</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Actions</span>
          </div>
          {data.shipments.map((s) => {
            const d = dayLabel(s.shippedAt)
            const status = s.status === 'delivered' ? ['delivered', 'Delivered'] : s.delayed ? ['cancelled', 'Delayed'] : ['dispatched', 'In Transit']
            return (
              <div key={s.id} className="wh-tr" role="row">
                <span role="cell" className="wh-td-order"><strong className="wh-mono">{s.orderNumber}</strong><span className="wh-muted wh-small">{s.shipmentNumber}</span></span>
                <span role="cell"><span className={d.recent ? 'is-recent' : ''}>{d.text}</span>
                  {s.expectedDelivery && <span className="wh-muted wh-small">Expected {s.expectedDelivery}</span>}</span>
                <span role="cell">
                  {s.method ? (
                    <><strong className="wh-mono">{s.trackingNumber || s.lrNumber || s.vehicle || '—'}</strong>
                      <span className="wh-muted wh-small">{METHOD_LABEL[s.method]}{s.carrier ? ` · ${s.carrier}` : ''}</span></>
                  ) : <span className="wh-badge wh-badge--flag">Details missing</span>}
                </span>
                <span role="cell" className="wh-td-customer"><strong>{s.customer.name}</strong><a className="wh-phone" href={telHref(s.customer.phone)}>{s.customer.phone}</a></span>
                <span role="cell" className="wh-td-address"><Icon name="pin" size={15} className="wh-pin" /><span>{s.destination.city}, {s.destination.state}<br /><span className="wh-muted wh-small">{s.destination.pincode}</span></span></span>
                <span role="cell"><span className={`wh-status wh-status--${status[0]}`}>{status[1]}</span></span>
                <span role="cell" className="wh-td-actions">
                  <button type="button" className="wh-btn wh-btn--outline wh-btn--small" onClick={() => setDialog({ kind: 'track', s })}>Track</button>
                  {s.status === 'shipped' && (
                    <>
                      <button type="button" className="wh-btn wh-btn--primary wh-btn--small" disabled={busy} onClick={() => setDialog({ kind: 'deliver', s })}>
                        Delivered
                      </button>
                      <button type="button" className="wh-icon-btn" title={s.method ? 'Edit shipping details' : 'Add shipping details'}
                        aria-label={`Shipping details for ${s.orderNumber}`} onClick={() => setDialog({ kind: 'edit', s })}>
                        <Icon name="truck" size={18} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            )
          })}
          {!loading && !data.shipments.length && <p className="wh-empty">No shipments here.</p>}
        </div>
        <Pagination page={page} pages={pages} total={total} from={total ? (page - 1) * PAGE + 1 : 0}
          to={Math.min(page * PAGE, total)} onPage={setPage} noun="shipments" />
      </section>

      {dialog?.kind === 'track' && <TrackDialog s={dialog.s} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'deliver' && (
        <DeliverDialog s={dialog.s} busy={busy} onCancel={() => setDialog(null)}
          onSubmit={(note) => act(
            () => staffJson(`/api/admin/shipments/${dialog.s.id}/deliver`, { method: 'POST', body: JSON.stringify({ note }) }),
            `${dialog.s.orderNumber} marked as delivered`
          )} />
      )}
      {dialog?.kind === 'edit' && (
        <ShipDialog
          title={`Shipping details: ${dialog.s.orderNumber}`}
          subtitle={`${dialog.s.customer.name} · ${dialog.s.destination.city}`}
          initial={dialog.s}
          submitLabel="Save details"
          busy={busy}
          onCancel={() => setDialog(null)}
          onSubmit={(form) => act(
            () => staffJson(`/api/admin/shipments/${dialog.s.id}/details`, { method: 'PATCH', body: JSON.stringify(form) }),
            `${dialog.s.orderNumber}: shipping details saved`
          )}
        />
      )}
    </>
  )
}
