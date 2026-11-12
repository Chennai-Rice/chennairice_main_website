import { useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// /offers → Who spun: every Spin & Win entry on its own page (newest first): when, name, mobile, prize,
// code, valid till, and whether the code was used on a paid order. Search, filter, and a CSV for Excel.
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')
const stateOf = (s) => (s.usedOn ? 'used' : s.expiresAt && new Date(s.expiresAt) < new Date() ? 'expired' : 'open')
const LABEL = { used: 'Used', open: 'Not yet', expired: 'Expired' }
// The India date (YYYY-MM-DD) of a moment, and the date ranges for the period filter.
const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)
const shift = (ymd, days) => new Date(Date.parse(ymd + 'T00:00:00Z') + days * 864e5).toISOString().slice(0, 10)
function rangeOf(period, from, to) {
  const today = istDay(Date.now())
  if (period === 'today') return [today, today]
  if (period === 'yesterday') return [shift(today, -1), shift(today, -1)]
  if (period === '7') return [shift(today, -6), today]
  if (period === '30') return [shift(today, -29), today]
  if (period === 'month') return [today.slice(0, 8) + '01', today]
  if (period === 'last_month') {
    const first = today.slice(0, 8) + '01'
    const prev = shift(first, -1)
    return [prev.slice(0, 8) + '01', prev]
  }
  if (period === 'custom') return [from || '0000-01-01', to || '9999-12-31']
  return null
}
// Prizes in a sensible order: ₹ amounts low to high, then free delivery, then gifts.
const prizeRank = (p) => { const m = String(p).match(/₹\s*(\d+)/); return m ? Number(m[1]) : /delivery/i.test(p) ? 100000 : 200000 }

export default function WhoSpun({ onAuthError }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [show, setShow] = useState('')
  const [prize, setPrize] = useState('')
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    staffJson('/api/admin/spin').then((d) => setRows(d.recent || [])).catch((err) => { if (!onAuthError(err)) setError(err.message) })
  }, [onAuthError])

  // Period and prize first (the counts follow them), then used / not yet and the search.
  const scoped = useMemo(() => {
    const r = rangeOf(period, from, to)
    return (rows || []).filter((s) => (!prize || s.prize === prize) && (!r || (istDay(s.at) >= r[0] && istDay(s.at) <= r[1])))
  }, [rows, prize, period, from, to])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return scoped.filter((s) => (!show || stateOf(s) === show) &&
      (!t || [s.phone, s.name, s.code, s.prize, s.email, s.usedOn].some((v) => String(v || '').toLowerCase().includes(t))))
  }, [scoped, q, show])
  const prizes = useMemo(() => [...new Set((rows || []).map((s) => s.prize).filter(Boolean))].sort((a, b) => prizeRank(a) - prizeRank(b) || a.localeCompare(b)), [rows])

  if (error) return <p className="of-alert" role="alert">{error}</p>
  if (!rows) return <p className="wh-muted">Loading…</p>
  const count = (k) => scoped.filter((s) => stateOf(s) === k).length

  function csv() {
    const cell = (v) => {
      let t = String(v ?? '')
      if (/^[=+\-@]/.test(t)) t = "'" + t // never a spreadsheet formula
      return '"' + t.replace(/"/g, '""') + '"'
    }
    const lines = [['When', 'Name', 'Mobile', 'Prize', 'Code', 'Valid till', 'Used', 'Order']]
      .concat(list.map((s) => [when(s.at), s.name, s.phone, s.prize, s.code, day(s.expiresAt), LABEL[stateOf(s)], s.usedOn || '']))
    const blob = new Blob(['﻿' + lines.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const r = rangeOf(period, from, to)
    a.download = `spin-and-win${prize ? '-' + prize.replace(/[^A-Za-z0-9]+/g, '') : ''}${r ? `-${r[0].replace('0000-01-01', 'start')}-to-${r[1].replace('9999-12-31', 'today')}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="wh-panel of-who">
      <div className="of-who-head">
        <div className="of-who-stats">
          <span><strong>{scoped.length}</strong> spins</span>
          <span><strong>{count('used')}</strong> used</span>
          <span><strong>{count('open')}</strong> not yet used</span>
          <span><strong>{count('expired')}</strong> expired</span>
        </div>
        <div className="of-who-tools">
          <input className="wh-input of-who-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile or code…" aria-label="Search" />
          <span className="wh-select"><select value={prize} onChange={(e) => setPrize(e.target.value)} aria-label="Prize">
            <option value="">All prizes</option>
            {prizes.map((p) => <option key={p} value={p}>{p} ({rows.filter((s) => s.prize === p).length})</option>)}
          </select></span>
          <span className="wh-select"><select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Date">
            <option value="all">All dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option>
            <option value="last_month">Last month</option><option value="custom">Custom dates…</option>
          </select></span>
          {period === 'custom' && (
            <span className="of-who-dates">
              <input type="date" className="wh-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <span>to</span>
              <input type="date" className="wh-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            </span>
          )}
          <span className="wh-select"><select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
            <option value="">All</option><option value="used">Used</option><option value="open">Not yet used</option><option value="expired">Expired</option>
          </select></span>
          <button type="button" className="wh-btn" onClick={csv} disabled={!list.length}>Download CSV</button>
        </div>
      </div>
      <div className="of-who-table">
        <table>
          <thead>
            <tr><th>When</th><th>Name</th><th>Mobile</th><th>Prize</th><th>Code</th><th>Valid till</th><th>Used</th></tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const st = stateOf(s)
              return (
                <tr key={s.phone}>
                  <td>{when(s.at)}</td>
                  <td>{s.name || '—'}</td>
                  <td><a className="of-who-phone" href={'tel:+91' + s.phone}>{s.phone}</a></td>
                  <td>{s.prize}</td>
                  <td className="wh-mono">{s.code}</td>
                  <td>{day(s.expiresAt)}</td>
                  <td><span className={'of-pill of-pill--' + st}>{LABEL[st]}</span>{s.usedOn && <span className="of-who-order wh-mono">{s.usedOn}</span>}</td>
                </tr>
              )
            })}
            {!list.length && <tr><td colSpan={7} className="wh-muted">{rows.length ? 'No spins match these filters.' : 'No spins yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
