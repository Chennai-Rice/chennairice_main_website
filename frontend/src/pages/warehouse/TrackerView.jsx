import { useCallback, useEffect, useRef, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { Confirm, Icon, dayLabel, timeLabel } from './shared.jsx'

const ACTION = {
  dispatch: ['dispatched', 'Will dispatch'],
  update: ['todispatch', 'Will update'],
  unchanged: ['delivered', 'No change'],
  skip: ['cancelled', 'Skipped'],
}
const DONE = { dispatch: 'Dispatched', update: 'Updated' }
const FILTERS = [
  { key: 'all', label: 'All rows' },
  { key: 'change', label: 'Will change' },
  { key: 'skip', label: 'Skipped' },
]

async function postFile(file, apply) {
  const res = await staffFetch(`/api/admin/warehouse/tracker?apply=${apply ? 1 : 0}&filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  return res.json()
}

export default function TrackerView({ say, onAuthError }) {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [uploads, setUploads] = useState([])
  const input = useRef(null)

  const loadUploads = useCallback(() => {
    staffJson('/api/admin/warehouse/tracker/uploads')
      .then((r) => setUploads(r.uploads))
      .catch((err) => onAuthError(err))
  }, [onAuthError])
  useEffect(() => { loadUploads() }, [loadUploads])

  async function check(f) {
    if (!f) return
    if (!/\.(xlsx|csv)$/i.test(f.name)) {
      say('Choose an Excel (.xlsx) or CSV file.', 'error')
      return
    }
    setFile(f)
    setResult(null)
    setFilter('all')
    setBusy(true)
    try {
      setResult(await postFile(f, false))
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
      setFile(null)
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    setBusy(true)
    try {
      const r = await postFile(file, true)
      setResult(r)
      setFilter('all')
      say(`Applied: ${r.summary.dispatched} dispatched, ${r.summary.updated} updated${r.summary.skip ? `, ${r.summary.skip} skipped` : ''}.`)
      loadUploads()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  async function template() {
    try {
      const res = await staffFetch('/api/admin/warehouse/tracker/template.xlsx')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(await res.blob())
      a.download = 'product-tracker-template.xlsx'
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  const rows = (result?.rows || []).filter((r) =>
    filter === 'all' ? true : filter === 'skip' ? r.action === 'skip' : ['dispatch', 'update'].includes(r.action))
  const s = result?.summary
  const changes = s ? (s.dispatch || 0) + (s.update || 0) : 0

  return (
    <>
      <div className="wh-page-head wh-page-head--row">
        <div>
          <h2>Product Tracker Upload</h2>
          <p className="wh-muted">Upload the delivery partner's sheet: order ID, tracking link or AWB, and partner name</p>
        </div>
        <button type="button" className="wh-btn wh-btn--outline" onClick={template}>
          <Icon name="download" size={18} /> Download template
        </button>
      </div>

      <section className="wh-panel">
        <div
          className={`wh-drop${drag ? ' is-drag' : ''}${busy ? ' is-busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); check(e.dataTransfer.files?.[0]) }}
        >
          <span className="wh-drop-icon"><Icon name="download" size={30} /></span>
          <div>
            <strong>{file ? file.name : 'Drop the tracker Excel here'}</strong>
            <p className="wh-muted wh-small">
              {busy ? 'Reading the sheet…' : 'Excel (.xlsx) or CSV, up to 5 MB and 2,000 rows. Columns are found by their headings.'}
            </p>
          </div>
          <button type="button" className="wh-btn wh-btn--primary" onClick={() => input.current?.click()} disabled={busy}>
            {file ? 'Choose another file' : 'Choose file'}
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e) => { check(e.target.files?.[0]); e.target.value = '' }}
          />
        </div>
      </section>

      {result && (
        <section className="wh-panel wh-table-panel">
          <header className="wh-table-head">
            <div>
              <h2>{result.applied ? 'Upload applied' : 'Check before applying'}</h2>
              <div className="wh-chips">
                {result.applied ? (
                  <>
                    <span className="wh-status wh-status--dispatched">{s.dispatched} dispatched</span>
                    <span className="wh-status wh-status--todispatch">{s.updated} updated</span>
                  </>
                ) : (
                  <>
                    <span className="wh-status wh-status--dispatched">{s.dispatch} to dispatch</span>
                    <span className="wh-status wh-status--todispatch">{s.update} to update</span>
                  </>
                )}
                <span className="wh-status wh-status--delivered">{s.unchanged} unchanged</span>
                <span className="wh-status wh-status--cancelled">{s.skip} skipped</span>
                {s.partners.map((p) => <span key={p} className="wh-chip">{p}</span>)}
              </div>
            </div>
            <div className="wh-table-tools">
              <nav className="wh-tabs wh-tabs--inline" aria-label="Rows to show">
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" className={`wh-tab${filter === f.key ? ' is-active' : ''}`} onClick={() => setFilter(f.key)}>
                    {f.label}
                  </button>
                ))}
              </nav>
              {!result.applied && (
                <button type="button" className="wh-btn wh-btn--primary" disabled={!changes || busy} onClick={() => setConfirm(true)}>
                  <Icon name="check" size={18} /> Apply {changes} {changes === 1 ? 'change' : 'changes'}
                </button>
              )}
            </div>
          </header>

          <div className="wh-table wh-table--tracker" role="table" aria-label="Tracker rows">
            <div className="wh-tr wh-th" role="row">
              <span role="columnheader">Row</span>
              <span role="columnheader">Order</span>
              <span role="columnheader">Delivery partner</span>
              <span role="columnheader">AWB / Tracking</span>
              <span role="columnheader">Tracking page</span>
              <span role="columnheader">{result.applied ? 'Result' : 'What happens'}</span>
            </div>
            {rows.map((r) => {
              const [tone, label] = ACTION[r.action]
              return (
                <div key={r.rowNo} className="wh-tr" role="row">
                  <span role="cell" className="wh-muted"><span className="wh-k">Row</span>{r.rowNo}</span>
                  <span role="cell">
                    <strong className="wh-mono">{r.orderNumber || r.ref || '—'}</strong>
                    {r.customer && <span className="wh-muted wh-small">{r.customer}</span>}
                  </span>
                  <span role="cell">
                    <strong>{r.courierName || r.partner || '—'}</strong>
                    {r.courierName && (
                      <span className={`wh-small ${r.courierKnown ? 'wh-up' : 'wh-warn-text'}`}>
                        {r.courierKnown ? '✓ ' + (r.deepLink ? 'Direct tracking link' : 'Own tracking page') : 'Not a known partner'}
                      </span>
                    )}
                  </span>
                  <span role="cell" className="wh-mono">{r.trackingNumber || <span className="wh-muted">{r.tracking || '—'}</span>}</span>
                  <span role="cell">
                    {r.trackingUrl ? (
                      <a className="wh-ext" href={r.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Open <span className="wh-muted wh-small">{new URL(r.trackingUrl).hostname.replace(/^www\./, '')}</span>
                      </a>
                    ) : <span className="wh-muted">—</span>}
                  </span>
                  <span role="cell">
                    <span className={`wh-status wh-status--${tone}`}>{r.done ? DONE[r.action] : label}</span>
                    <span className="wh-small wh-muted">{r.message}{r.note ? ' ' + r.note : ''}</span>
                  </span>
                </div>
              )
            })}
            {!rows.length && <p className="wh-empty">No rows here.</p>}
          </div>
        </section>
      )}

      <section className="wh-panel">
        <h3 className="wh-panel-title">Recent uploads</h3>
        {uploads.length ? (
          <div className="wh-table wh-table--uploads" role="table" aria-label="Recent uploads">
            <div className="wh-tr wh-th" role="row">
              <span role="columnheader">When</span>
              <span role="columnheader">File</span>
              <span role="columnheader">By</span>
              <span role="columnheader">Dispatched</span>
              <span role="columnheader">Updated</span>
              <span role="columnheader">Skipped</span>
              <span role="columnheader">Partners</span>
            </div>
            {uploads.map((u) => (
              <div key={u.id} className="wh-tr" role="row">
                <span role="cell">{dayLabel(u.at).text}<span className="wh-muted wh-small">{timeLabel(u.at)}</span></span>
                <span role="cell" className="wh-clamp">{u.filename}</span>
                <span role="cell">{u.by || '—'}</span>
                <span role="cell"><span className="wh-k">Dispatched</span>{u.dispatched}</span>
                <span role="cell"><span className="wh-k">Updated</span>{u.updated}</span>
                <span role="cell"><span className="wh-k">Skipped</span>{u.skipped}</span>
                <span role="cell" className="wh-small">{u.partners.join(', ') || '—'}</span>
              </div>
            ))}
          </div>
        ) : <p className="wh-muted wh-small">No uploads yet.</p>}
      </section>

      {confirm && (
        <Confirm
          title={`Apply ${changes} ${changes === 1 ? 'change' : 'changes'}?`}
          body={`${s.dispatch} orders will be marked dispatched and ${s.update} will get new tracking. Customers see the partner's tracking link on their Track Order page straight away. Skipped rows are left unchanged.`}
          confirmLabel="Apply"
          busy={busy}
          onConfirm={apply}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}
