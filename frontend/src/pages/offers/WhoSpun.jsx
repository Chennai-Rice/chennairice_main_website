import { useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// /offers → Who spun: every Spin & Win entry on its own page (newest first): when, mobile, email, prize,
// code, valid till, and whether the code was used on a paid order. Search, filter, and a CSV for Excel.
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')
const stateOf = (s) => (s.usedOn ? 'used' : s.expiresAt && new Date(s.expiresAt) < new Date() ? 'expired' : 'open')
const LABEL = { used: 'Used', open: 'Not yet', expired: 'Expired' }

export default function WhoSpun({ onAuthError }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [show, setShow] = useState('')

  useEffect(() => {
    staffJson('/api/admin/spin').then((d) => setRows(d.recent || [])).catch((err) => { if (!onAuthError(err)) setError(err.message) })
  }, [onAuthError])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows || []).filter((s) => (!show || stateOf(s) === show) &&
      (!t || [s.phone, s.email, s.code, s.prize, s.name, s.usedOn].some((v) => String(v || '').toLowerCase().includes(t))))
  }, [rows, q, show])

  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!rows) return <p className="ad-muted">Loading…</p>
  const count = (k) => rows.filter((s) => stateOf(s) === k).length

  function csv() {
    const cell = (v) => {
      let t = String(v ?? '')
      if (/^[=+\-@]/.test(t)) t = "'" + t // never a spreadsheet formula
      return '"' + t.replace(/"/g, '""') + '"'
    }
    const lines = [['When', 'Mobile', 'Email', 'Prize', 'Code', 'Valid till', 'Used', 'Order']]
      .concat(list.map((s) => [when(s.at), s.phone, s.email, s.prize, s.code, day(s.expiresAt), LABEL[stateOf(s)], s.usedOn || '']))
    const blob = new Blob(['﻿' + lines.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `spin-and-win-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="wh-panel of-who">
      <div className="of-who-head">
        <div className="of-who-stats">
          <span><strong>{rows.length}</strong> spins</span>
          <span><strong>{count('used')}</strong> used</span>
          <span><strong>{count('open')}</strong> not yet used</span>
          <span><strong>{count('expired')}</strong> expired</span>
        </div>
        <div className="of-who-tools">
          <input className="wh-input of-who-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mobile, email or code…" aria-label="Search" />
          <span className="wh-select"><select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
            <option value="">All</option><option value="used">Used</option><option value="open">Not yet used</option><option value="expired">Expired</option>
          </select></span>
          <button type="button" className="wh-btn" onClick={csv} disabled={!list.length}>Download CSV</button>
        </div>
      </div>
      <div className="of-who-table">
        <table>
          <thead>
            <tr><th>When</th><th>Mobile</th><th>Email</th><th>Prize</th><th>Code</th><th>Valid till</th><th>Used</th></tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const st = stateOf(s)
              return (
                <tr key={s.phone}>
                  <td>{when(s.at)}</td>
                  <td><a className="of-who-phone" href={'tel:+91' + s.phone}>{s.phone}</a></td>
                  <td>{s.email ? <a href={'mailto:' + s.email}>{s.email}</a> : '—'}</td>
                  <td>{s.prize}</td>
                  <td className="wh-mono">{s.code}</td>
                  <td>{day(s.expiresAt)}</td>
                  <td><span className={'of-pill of-pill--' + st}>{LABEL[st]}</span>{s.usedOn && <span className="of-who-order wh-mono">{s.usedOn}</span>}</td>
                </tr>
              )
            })}
            {!list.length && <tr><td colSpan={7} className="ad-muted">{rows.length ? 'No spins match.' : 'No spins yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
