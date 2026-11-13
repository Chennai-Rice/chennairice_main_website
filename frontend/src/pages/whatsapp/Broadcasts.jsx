import { useEffect, useState } from 'react'
import { staffJson, staffFetch } from '../../services/staffAuth.js'
import { I, WaText, num, pct, when } from './ui.jsx'
import { SegmentFilters, BLANK_SEGMENT } from './Contacts.jsx'

const STATUS = { draft: ['Draft', 'draft'], scheduled: ['Scheduled', 'pending'], sending: ['Sending', 'pending'], done: ['Sent', 'ok'], cancelled: ['Cancelled', 'bad'] }

function Editor({ fields, onDone }) {
  const [templates, setTemplates] = useState(null)
  const [tags, setTags] = useState([])
  const [name, setName] = useState('')
  const [tname, setTname] = useState('')
  const [seg, setSeg] = useState({ ...BLANK_SEGMENT, permission: 'in' })
  const [mapping, setMapping] = useState({ body: [], buttons: {} })
  // Who gets it: a group of contacts, or an uploaded CSV / Excel file (kept on a draft on the server).
  const [mode, setMode] = useState('group')
  const [draftId, setDraftId] = useState(null)
  const [file, setFile] = useState(null)
  const [fileCols, setFileCols] = useState({ phoneColumn: '', nameColumn: '', optedIn: false })
  const [uploading, setUploading] = useState(false)
  const [aud, setAud] = useState(null)
  const [when_, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    staffJson('/api/admin/whatsapp/templates').then((d) => setTemplates(d.templates.filter((t) => t.status === 'APPROVED'))).catch((e) => setErr(e.message))
    staffJson('/api/admin/whatsapp/contacts?limit=1').then((d) => setTags(d.tags)).catch(() => {})
  }, [])
  const t = templates?.find((x) => x.name === tname)
  const segment = mode === 'file' ? { file: fileCols } : seg
  const segKey = JSON.stringify(segment)
  useEffect(() => {
    if (!tname || (mode === 'file' && (!draftId || !fileCols.phoneColumn))) { setAud(null); return undefined }
    const id = setTimeout(() => {
      staffJson('/api/admin/whatsapp/broadcasts/audience', { method: 'POST', body: JSON.stringify({ segment: JSON.parse(segKey), templateName: tname, broadcastId: draftId }) })
        .then(setAud).catch((e) => setErr(e.message))
    }, 400)
    return () => clearTimeout(id)
  }, [segKey, tname, mode, draftId, fileCols.phoneColumn])

  async function upload(f) {
    if (!/\.(csv|xlsx)$/i.test(f.name)) { setErr('Choose a .csv or .xlsx file. (An old .xls: open it in Excel and Save as .xlsx.)'); return }
    setUploading(true)
    setErr('')
    try {
      const q = new URLSearchParams({ name: f.name, ...(draftId ? { id: draftId } : {}) })
      const res = await staffFetch('/api/admin/whatsapp/broadcasts/file?' + q, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || d.message || 'Could not read the file.')
      setDraftId(d.id)
      setFile(d.file)
      setFileCols({ phoneColumn: d.file.phoneColumn, nameColumn: d.file.nameColumn, optedIn: false })
      if (!name) setName(f.name.replace(/\.(csv|xlsx)$/i, ''))
    } catch (e) { setErr(e.message) } finally { setUploading(false) }
  }
  // A {{ }} or button value: a contact field, fixed text, or (for a file) one of its columns.
  const mapValue = (m) => (m.from === 'col' ? 'col:' + m.col : m.from)
  const fromValue = (v, m) => (v.startsWith('col:') ? { from: 'col', col: v.slice(4) } : { from: v, text: m.text || '' })
  const sourceOptions = (withFields) => (
    <>
      {mode === 'file' && file && <optgroup label="From the file">{file.columns.map((c) => <option key={c} value={'col:' + c}>Column: {c}</option>)}</optgroup>}
      {withFields
        ? <optgroup label={mode === 'file' ? 'Other' : 'From the contact'}>{Object.entries(fields).filter(([k]) => mode !== 'file' || ['first_name', 'name', 'fixed'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
        : <option value="fixed">Fixed text</option>}
    </>
  )

  function pickTemplate(n) {
    setTname(n)
    const tt = templates.find((x) => x.name === n)
    if (!tt) return
    const vars = [...new Set([...tt.model.body.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))]
    setMapping({
      body: Array.from({ length: Math.max(0, ...vars) }, (_, i) => (i === 0 ? { from: 'first_name' } : { from: 'fixed', text: tt.model.body.samples[i] || '' })),
      buttons: Object.fromEntries(tt.model.buttons.map((b, i) => [i, b]).filter(([, b]) => (b.type === 'URL' && /\{\{1\}\}$/.test(b.url)) || b.type === 'COPY_CODE').map(([i, b]) => [i, { from: 'fixed', text: b.sample || '' }])),
    })
  }
  const firstRow = file?.sample?.[0] || {}
  const sampleOf = (m) => (m.from === 'fixed' ? m.text
    : m.from === 'col' ? firstRow[m.col] || `[${m.col}]`
    : mode === 'file' && (m.from === 'first_name' || m.from === 'name') && fileCols.nameColumn
      ? (m.from === 'first_name' ? String(firstRow[fileCols.nameColumn] || '').split(/\s+/)[0] : firstRow[fileCols.nameColumn]) || 'there'
      : { first_name: 'Ravi', name: 'Ravi Kumar', city: 'Chennai', last_product: 'Kitchidi Ponni Rice 5 kg', prize: '₹75 OFF' }[m.from])
  const preview = t ? t.model.body.text.replace(/\{\{(\d+)\}\}/g, (a, d) => sampleOf(mapping.body[Number(d) - 1] || {}) || a) : ''

  async function go(launch) {
    setBusy(true)
    setErr('')
    try {
      if (mode === 'file' && !draftId) throw new Error('Upload the file first.')
      const { id } = await staffJson('/api/admin/whatsapp/broadcasts', { method: 'POST', body: JSON.stringify({ ...(mode === 'file' ? { id: draftId } : {}), name, template: tname, segment, mapping }) })
      if (launch) {
        if (!window.confirm(`Send "${tname}" to ${num(aud?.eligible)} people${when_ ? ' at ' + new Date(when_).toLocaleString('en-IN') : ' now'}?`)) { onDone(); return }
        await staffJson(`/api/admin/whatsapp/broadcasts/${id}/launch`, { method: 'POST', body: JSON.stringify({ at: when_ ? new Date(when_).toISOString() : null }) })
      }
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!templates) return <p className="wa-muted">{err || 'Loading…'}</p>
  return (
    <section className="wa-card wa-bc-editor">
      <div className="wa-bc-cols">
        <div className="wa-bc-main">
          <label className="wa-lbl">Name (only you see it)<input value={name} placeholder="Diwali offer – Chennai buyers" onChange={(e) => setName(e.target.value)} /></label>
          <label className="wa-lbl">Template
            <select value={tname} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">Choose an approved template…</option>
              {templates.map((x) => <option key={x.id} value={x.name}>{x.name} ({x.category === 'UTILITY' ? 'utility' : 'marketing'})</option>)}
            </select>
          </label>
          {templates.length === 0 && <p className="wa-muted">No approved templates yet: create one in Templates and wait for Meta.</p>}
          <h3 className="wa-h3">Who gets it</h3>
          <div className="wa-seg wa-seg--light">
            <button type="button" className={mode === 'group' ? 'is-on' : ''} onClick={() => setMode('group')}>A group of contacts</button>
            <button type="button" className={mode === 'file' ? 'is-on' : ''} onClick={() => setMode('file')}>Upload a file (CSV / Excel)</button>
          </div>
          {mode === 'group' ? <SegmentFilters f={seg} set={setSeg} tags={tags} /> : (
            <div className="wa-bc-file">
              <label className="wa-btn">
                <I name="upload" size={14} /> {uploading ? 'Reading…' : file ? 'Upload another file' : 'Choose a CSV or Excel file'}
                <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
              </label>
              {!file && <p className="wa-muted">First row: column names, for example <b>Name, Mobile, Prize, Code</b>. One person per row, up to 20,000. Each column can fill a {'{{ }}'} of the template.</p>}
              {file && (
                <>
                  <p className="wa-muted"><b>{file.name}</b> · {num(file.total)} rows · {num(file.valid)} valid mobile numbers</p>
                  <div className="wa-map">
                    <div className="wa-map-row"><span>Mobile</span>
                      <select value={fileCols.phoneColumn} onChange={(e) => setFileCols({ ...fileCols, phoneColumn: e.target.value })}>
                        <option value="">Choose the mobile number column…</option>
                        {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="wa-map-row"><span>Name</span>
                      <select value={fileCols.nameColumn} onChange={(e) => setFileCols({ ...fileCols, nameColumn: e.target.value })}>
                        <option value="">No name column</option>
                        {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="wa-table-wrap wa-bc-sample">
                    <table className="wa-table wa-table--light">
                      <thead><tr>{file.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>{file.sample.map((r, i) => <tr key={i}>{file.columns.map((c) => <td key={c}>{r[c]}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                  {(!t || t.category === 'MARKETING') && (
                    <label className="wa-check wa-bc-permission">
                      <input type="checkbox" checked={fileCols.optedIn} onChange={(e) => setFileCols({ ...fileCols, optedIn: e.target.checked })} />
                      <span>These people agreed to get WhatsApp offers from Chennai Rice. Needed for a marketing template: WhatsApp only allows offers to people who said yes, and numbers that report us lower the account's quality. Anyone who replied STOP is always left out.</span>
                    </label>
                  )}
                </>
              )}
            </div>
          )}
          {aud && (
            <div className="wa-stat-strip">
              <div className="is-lime"><b>{num(aud.eligible)}</b><span>will get it</span></div>
              <div><b>{num(aud.inSegment)}</b><span>{mode === 'file' ? 'different numbers in the file' : 'in this group'}</span></div>
              {mode === 'file' && aud.invalidPhones > 0 && <div><b>{num(aud.invalidPhones)}</b><span>left out: not a mobile number</span></div>}
              {aud.marketing && <div><b>{num(aud.excludedNoPermission)}</b><span>left out: never said yes</span></div>}
              <div><b>{num(aud.excludedStop)}</b><span>left out: said STOP</span></div>
            </div>
          )}
          {t && (
            <>
              <h3 className="wa-h3">Fill in the message</h3>
              <div className="wa-map">
                {mapping.body.map((m, i) => (
                  <div key={i} className="wa-map-row">
                    <span>{`{{${i + 1}}}`}</span>
                    <select value={mapValue(m)} onChange={(e) => { const body = [...mapping.body]; body[i] = fromValue(e.target.value, m); setMapping({ ...mapping, body }) }}>
                      {sourceOptions(true)}
                    </select>
                    {m.from === 'fixed' && <input value={m.text || ''} onChange={(e) => { const body = [...mapping.body]; body[i] = { ...m, text: e.target.value }; setMapping({ ...mapping, body }) }} />}
                  </div>
                ))}
                {Object.entries(mapping.buttons).map(([i, m]) => (
                  <div key={'b' + i} className="wa-map-row">
                    <span>{t.model.buttons[i].type === 'COPY_CODE' ? 'Code' : 'Link end'}</span>
                    {mode === 'file' && file && (
                      <select value={mapValue(m)} onChange={(e) => setMapping({ ...mapping, buttons: { ...mapping.buttons, [i]: fromValue(e.target.value, m) } })}>
                        {sourceOptions(false)}
                      </select>
                    )}
                    {m.from !== 'col' && <input value={m.text || ''} onChange={(e) => setMapping({ ...mapping, buttons: { ...mapping.buttons, [i]: { from: 'fixed', text: e.target.value } } })} />}
                  </div>
                ))}
              </div>
            </>
          )}
          <h3 className="wa-h3">When</h3>
          <div className="wa-inline">
            <label className="wa-check"><input type="radio" checked={!when_} onChange={() => setWhen('')} /> Now</label>
            <label className="wa-check"><input type="radio" checked={!!when_} onChange={() => setWhen(new Date(Date.now() + 3600e3).toISOString().slice(0, 16))} /> Later:</label>
            {when_ && <input type="datetime-local" value={when_} onChange={(e) => setWhen(e.target.value)} />}
          </div>
          {err && <p className="wa-alert">{err}</p>}
          <div className="wa-inline wa-mt">
            <button type="button" className="wa-btn" disabled={busy || !name || !tname} onClick={() => go(false)}>Save as draft</button>
            <button type="button" className="wa-btn wa-btn--lime" disabled={busy || !name || !tname || !aud?.eligible} onClick={() => go(true)}>
              <I name="send" size={14} /> {when_ ? 'Schedule' : 'Send'} to {num(aud?.eligible || 0)}
            </button>
            <button type="button" className="wa-link" onClick={onDone}>Cancel</button>
          </div>
        </div>
        {t && (
          <div className="wa-phone wa-bc-preview">
            <div className="wa-phone-top"><b>Chennai Rice</b></div>
            <div className="wa-phone-chat">
              <div className="wa-bubble"><p className="wa-bubble-body"><WaText text={preview} /></p>{t.model.footer && <p className="wa-bubble-foot">{t.model.footer}</p>}</div>
              {t.model.buttons.map((b, i) => <div key={i} className="wa-bubble-btn">{b.type === 'COPY_CODE' ? 'Copy code' : b.text}</div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default function Broadcasts() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const load = () => staffJson('/api/admin/whatsapp/broadcasts').then(setD).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  const act = async (url, method = 'POST', confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    try { await staffJson(url, { method }); load() } catch (e) { setError(e.message) }
  }

  return (
    <>
      <div className="wa-titlebar">
        <h1>Broadcasts</h1>
        <div className="wa-actions">
          <button type="button" className="wa-round" title="Refresh" onClick={load}><I name="refresh" /></button>
          {!editing && <button type="button" className="wa-btn" onClick={() => setEditing(true)}><I name="plus" size={16} /> New broadcast</button>}
        </div>
      </div>
      {error && <p className="wa-alert">{error}</p>}
      {editing && d && <Editor fields={d.fields} onDone={() => { setEditing(false); load() }} />}
      <section className="wa-dark">
        <div className="wa-dark-head"><h2>All broadcasts</h2></div>
        {!d && <p className="wa-empty">Loading…</p>}
        {d?.broadcasts.length === 0 && <p className="wa-empty">No broadcasts yet. A broadcast sends one approved template to a group of contacts, for example a festival offer to everyone who bought in the last 3 months.</p>}
        <div className="wa-table-wrap">
          {d?.broadcasts.length > 0 && (
            <table className="wa-table">
              <thead><tr><th>Broadcast</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Orders (7 days)</th><th>Held back</th><th /></tr></thead>
              <tbody>
                {d.broadcasts.map((b) => {
                  const [label, tone] = STATUS[b.status] || [b.status, 'draft']
                  const s = b.stats
                  return (
                    <tr key={b.id}>
                      <td><b>{b.name}</b><small>{b.template} · {b.scheduledAt ? new Date(b.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : when(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ''}</small></td>
                      <td><span className={`wa-pill wa-pill--${tone}`}>{label}</span>{s.queued > 0 && <small>{num(s.queued)} waiting</small>}</td>
                      <td>{num(s.sent)}{b.audience ? <small>of {num(b.audience)}</small> : null}</td>
                      <td>{num(s.delivered)}<small>{pct(s.delivered, s.sent)}%</small></td>
                      <td>{num(s.read)}<small>{pct(s.read, s.sent)}%</small></td>
                      <td>{num(s.replied)}</td>
                      <td>{num(s.orders)}{s.revenue ? <small>{s.revenue}</small> : null}</td>
                      <td>{num(s.skipped + s.failed)}</td>
                      <td className="wa-row-actions">
                        {b.status === 'draft' && <button type="button" className="wa-btn wa-btn--small" onClick={() => act(`/api/admin/whatsapp/broadcasts/${b.id}/launch`, 'POST', `Send "${b.name}" now?`)}>Send</button>}
                        {['scheduled', 'sending'].includes(b.status) && <button type="button" className="wa-btn wa-btn--small" onClick={() => act(`/api/admin/whatsapp/broadcasts/${b.id}/cancel`, 'POST', 'Stop this broadcast? Messages already sent stay sent.')}>Stop</button>}
                        {['draft', 'cancelled'].includes(b.status) && <button type="button" className="wa-round wa-round--small" title="Delete" onClick={() => act(`/api/admin/whatsapp/broadcasts/${b.id}`, 'DELETE', 'Delete this broadcast?')}><I name="trash" size={13} /></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  )
}
