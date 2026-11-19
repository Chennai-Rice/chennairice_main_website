import { useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// /offers → Spin reminders: every Spin & Win reminder sent on WhatsApp (automatic and bulk, every spin_reminder
// template incl. the Tamil ones) and what came of it: delivered / read, Claim link tapped, bought with the code,
// and the revenue. One row per message; per-template totals to compare versions; a CSV for Excel.
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '—')
const STATUS = { read: 'Read', delivered: 'Delivered', sent: 'Sent', failed: 'Not delivered', queued: 'Waiting', skipped: 'Held back' }
const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)
const shift = (ymd, days) => new Date(Date.parse(ymd + 'T00:00:00Z') + days * 864e5).toISOString().slice(0, 10)
function rangeOf(period, from, to) {
  const today = istDay(Date.now())
  if (period === 'today') return [today, today]
  if (period === 'yesterday') return [shift(today, -1), shift(today, -1)]
  if (period === '7') return [shift(today, -6), today]
  if (period === '30') return [shift(today, -29), today]
  if (period === 'custom') return [from || '', to || '']
  return ['', '']
}

export default function SpinReminders({ onAuthError }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [template, setTemplate] = useState('')
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [show, setShow] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const [f, t] = rangeOf(period, from, to)
    const qs = new URLSearchParams({ ...(template ? { template } : {}), ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) })
    setData(null)
    staffJson('/api/admin/spin/reminders?' + qs)
      .then(setData)
      .catch((err) => { if (!onAuthError(err)) setError(err.message) })
  }, [template, period, from, to, onAuthError])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data?.people || []).filter((p) =>
      (!show || (show === 'clicked' && p.clicks > 0) || (show === 'bought' && p.order) || (show === 'clicked_not_bought' && p.clicks > 0 && !p.order) ||
        (show === 'read_no_click' && p.status === 'read' && !p.clicks) || (show === 'not_delivered' && ['failed', 'skipped', 'queued'].includes(p.status))) &&
      (!t || [p.phone, p.name, p.code, p.prize, p.order?.number].some((v) => String(v || '').toLowerCase().includes(t))))
  }, [data, q, show])

  if (error) return <p className="of-alert" role="alert">{error}</p>
  const s = data?.summary

  function csv() {
    const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"' }
    const lines = [['Sent at', 'Name', 'Mobile', 'Template', 'Prize', 'Code', 'Message', 'Reason', 'Clicked', 'First click', 'Bought', 'Order', 'Order date', 'Items', 'Paid (Rs)', 'Discount (Rs)', 'City']]
      .concat(list.map((p) => [when(p.at), p.name, p.phone, p.template, p.prize, p.code, STATUS[p.status] || p.status, p.reason,
        p.clicks ? `Yes (${p.clicks})` : 'No', when(p.clickedAt), p.order ? 'Yes' : 'No', p.order?.number || '', when(p.order?.at), p.order?.items || '',
        p.order ? p.order.total : '', p.order ? p.order.discount : '', p.order?.city || '']))
    const blob = new Blob(['﻿' + lines.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `spin-reminders${template ? '-' + template : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="wh-panel of-who of-rem">
      <div className="of-who-head">
        <div className="of-who-tools">
          <span className="wh-select"><select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Template">
            <option value="">All reminder templates</option>
            {(data?.templates || []).map((t) => <option key={t} value={t}>{t}</option>)}
            {template && !(data?.templates || []).includes(template) && <option value={template}>{template}</option>}
          </select></span>
          <span className="wh-select"><select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Sent">
            <option value="all">All dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom dates…</option>
          </select></span>
          {period === 'custom' && (
            <span className="of-who-dates">
              <input type="date" className="wh-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <span>to</span>
              <input type="date" className="wh-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            </span>
          )}
          <input className="wh-input of-who-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile, code or order…" aria-label="Search" />
          <span className="wh-select"><select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
            <option value="">Everyone</option><option value="clicked">Clicked</option><option value="bought">Bought</option>
            <option value="clicked_not_bought">Clicked, did not buy</option><option value="read_no_click">Read, did not click</option>
            <option value="not_delivered">Not delivered / not sent</option>
          </select></span>
          <button type="button" className="wh-btn" onClick={csv} disabled={!list.length}>Download CSV</button>
        </div>
      </div>

      {!data ? <p className="wh-muted">Loading…</p> : (
        <>
          <div className="of-rem-funnel" role="list" aria-label="Results">
            <div role="listitem"><b>{s.sent}</b><span>Sent</span><small>{s.notSent ? `${s.notSent} not sent` : ' '}</small></div>
            <div role="listitem"><b>{s.delivered}</b><span>Delivered</span><small>{pct(s.delivered, s.sent)} of sent</small></div>
            <div role="listitem"><b>{s.read}</b><span>Read</span><small>{pct(s.read, s.delivered)} of delivered</small></div>
            <div role="listitem"><b>{s.clicked}</b><span>Clicked</span><small>{pct(s.clicked, s.delivered)} of delivered</small></div>
            <div role="listitem"><b>{s.purchased}</b><span>Bought</span><small>{pct(s.purchased, s.delivered)} of delivered</small></div>
            <div role="listitem" className="is-money"><b>{inr(s.revenue)}</b><span>Revenue</span><small>{inr(s.discount)} discount given</small></div>
          </div>

          {data.byTemplate.length > 1 && (
            <div className="of-who-table of-rem-split">
              <table>
                <thead><tr><th>Template</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Clicked</th><th>Bought</th><th>Bought / delivered</th><th>Revenue</th></tr></thead>
                <tbody>
                  {data.byTemplate.map((t) => (
                    <tr key={t.template}>
                      <td className="wh-mono">{t.template}</td><td>{t.sent}</td><td>{t.delivered}</td><td>{t.read}</td><td>{t.clicked}</td>
                      <td>{t.purchased}</td><td>{pct(t.purchased, t.delivered)}</td><td>{inr(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="of-who-table">
            <table>
              <thead><tr><th>Sent</th><th>Name</th><th>Mobile</th><th>Prize · code</th><th>Template</th><th>Message</th><th>Clicked</th><th>Bought</th></tr></thead>
              <tbody>
                {list.map((p, i) => (
                  <tr key={p.phone + p.at + i}>
                    <td>{when(p.at)}</td>
                    <td>{p.name || '—'}</td>
                    <td><a className="of-who-phone" href={'tel:+91' + String(p.phone).slice(-10)}>{p.phone}</a></td>
                    <td>{p.prize || '—'}<div className="wh-mono of-who-order">{p.code}</div></td>
                    <td className="wh-mono">{p.template}</td>
                    <td><span className={'of-pill of-rem-st--' + p.status}>{STATUS[p.status] || p.status}</span>{p.reason && <div className="of-rem-reason">{p.reason}</div>}</td>
                    <td>{p.clicks ? <><b>Yes</b>{p.clicks > 1 && ` (${p.clicks})`}<div className="of-rem-reason">{when(p.clickedAt)}</div></> : <span className="wh-muted">No</span>}</td>
                    <td>
                      {p.order ? (
                        <div className="of-who-buy">
                          <b>{p.order.number} · {inr(p.order.total)}</b>
                          <span>{when(p.order.at)}</span>
                          <span>{p.order.items}</span>
                          {p.order.discount > 0 && <span>Discount {inr(p.order.discount)}</span>}
                        </div>
                      ) : <span className="wh-muted">—</span>}
                    </td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="8" className="wh-muted">No reminders match.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="wh-muted of-rem-note">
            Clicked: the "Claim my reward" / பரிசைப் பெறுங்கள் button was tapped (counted only from the day click counting went live; earlier reminders show No).
            Bought: a paid order that used this person's code after the reminder was sent.
          </p>
        </>
      )}
    </section>
  )
}
