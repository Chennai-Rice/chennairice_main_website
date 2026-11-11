import { useEffect, useState } from 'react'
import { staffJson, staffFetch } from '../../services/staffAuth.js'
import { I, num, pct, inr } from './ui.jsx'

const ist = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)
function preset(id) {
  const now = new Date()
  const today = ist(now)
  if (id === 'today') return { from: today, to: today }
  if (id === '7') return { from: ist(new Date(now - 6 * 864e5)), to: today }
  if (id === '30') return { from: ist(new Date(now - 29 * 864e5)), to: today }
  if (id === 'last_month') {
    const y = Number(today.slice(0, 4)); const m = Number(today.slice(5, 7)) - 1
    const first = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1)).toISOString().slice(0, 10)
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    return { from: first, to: last }
  }
  return { from: today.slice(0, 8) + '01', to: today }
}

function Table({ rows, first }) {
  if (!rows.length) return <p className="wa-empty">Nothing sent in this period.</p>
  return (
    <div className="wa-table-wrap">
      <table className="wa-table">
        <thead><tr><th>{first}</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Replied</th><th>Orders</th><th>Revenue</th><th>Cost (approx.)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><b>{r.name}</b>{r.category && <small>{r.category}</small>}</td>
              <td>{num(r.sent)}</td>
              <td>{num(r.delivered)}<small>{pct(r.delivered, r.sent)}%</small></td>
              <td>{num(r.read)}<small>{pct(r.read, r.sent)}%</small></td>
              <td>{num(r.failed)}</td>
              <td>{num(r.replied)}<small>{pct(r.replied, r.sent)}%</small></td>
              <td>{num(r.orders)}</td>
              <td>{r.revenue == null ? '—' : inr(r.revenue)}</td>
              <td>{inr(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Reports() {
  const [p, setP] = useState(preset('month'))
  const [which, setWhich] = useState('month')
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setD(null)
    staffJson('/api/admin/whatsapp/reports?' + new URLSearchParams(p)).then(setD).catch((e) => setError(e.message))
  }, [p])
  async function csv() {
    const res = await staffFetch('/api/admin/whatsapp/reports.csv?' + new URLSearchParams(p))
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `whatsapp-report-${p.from}-to-${p.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const pick = (id) => { setWhich(id); if (id !== 'custom') setP(preset(id)) }
  const t = d?.totals

  return (
    <>
      <div className="wa-titlebar">
        <h1>Reports</h1>
        <div className="wa-actions">
          <div className="wa-seg">
            {[['today', 'Today'], ['7', '7 days'], ['month', 'This month'], ['30', '30 days'], ['last_month', 'Last month'], ['custom', 'Custom']].map(([id, label]) => (
              <button key={id} type="button" className={which === id ? 'is-on' : ''} onClick={() => pick(id)}>{label}</button>
            ))}
          </div>
          {which === 'custom' && (
            <span className="wa-dates">
              <input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /> –
              <input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} />
            </span>
          )}
          <button type="button" className="wa-btn" onClick={csv}><I name="arrow" size={16} /> CSV</button>
        </div>
      </div>
      {error && <p className="wa-alert">{error}</p>}
      {!d && !error && <p className="wa-muted">Loading…</p>}
      {d && (
        <>
          <div className="wa-stat-strip wa-stat-strip--big">
            <div><b>{num(t.sent)}</b><span>sent</span></div>
            <div><b>{pct(t.delivered, t.sent)}%</b><span>delivered</span></div>
            <div><b>{pct(t.read, t.sent)}%</b><span>read</span></div>
            <div><b>{num(t.replied)}</b><span>replied within 3 days</span></div>
            <div className="is-lime"><b>{num(t.orders)}</b><span>orders within 7 days{t.revenue != null ? ` · ${inr(t.revenue)}` : ''}</span></div>
            <div><b>{inr(t.cost)}</b><span>approx. cost</span></div>
            <div><b>{num(d.inbound.messages)}</b><span>messages from {num(d.inbound.customers)} customers</span></div>
          </div>
          <section className="wa-dark">
            <div className="wa-dark-head"><h2>By message type</h2></div>
            <Table rows={d.bySource} first="Sent by" />
          </section>
          <section className="wa-dark wa-mt2">
            <div className="wa-dark-head"><h2>By template</h2></div>
            <Table rows={d.byTemplate} first="Template" />
          </section>
          <div className="wa-two wa-mt2">
            <section className="wa-card">
              <h2 className="wa-h2">Bot</h2>
              <div className="wa-stat-strip">
                <div><b>{num(d.bot.chats)}</b><span>chats answered</span></div>
                <div><b>{num(d.bot.replies)}</b><span>replies</span></div>
                <div><b>{num(d.bot.taken_over)}</b><span>then answered by the team</span></div>
              </div>
            </section>
            <section className="wa-card">
              <h2 className="wa-h2">Team</h2>
              {d.team.length === 0 ? <p className="wa-muted">No replies from the Inbox in this period.</p> : (
                <table className="wa-table wa-table--light">
                  <thead><tr><th>Person</th><th>Chats</th><th>Messages</th><th>First reply (median)</th><th>Average</th></tr></thead>
                  <tbody>{d.team.map((x) => (
                    <tr key={x.name}><td><b>{x.name}</b></td><td>{num(x.chats)}</td><td>{num(x.messages)}</td>
                      <td>{x.medianMinutes == null ? '—' : `${x.medianMinutes} min`}</td><td>{x.avgMinutes == null ? '—' : `${x.avgMinutes} min`}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          </div>
          <p className="wa-muted wa-foot">{d.note}</p>
        </>
      )}
    </>
  )
}
