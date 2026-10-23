import { useMemo, useState } from 'react'
import { Icon } from './shared.jsx'

// The Analyst overview, laid out after the owner's reference: a revenue card
// with the rice-type split, a 2×2 of headline numbers, a stacked "leads per
// day" chart, the kg target bar, two "needs attention" cards, and the
// period's orders in a searchable table.

const INK = '#1f1a17'
const RICE = { raw: 'Raw', idli: 'Idli', boiled: 'Boiled' }
const STATUS = {
  pending_payment: ['Unpaid', 'grey'], placed: ['Paid · to confirm', 'amber'], confirmed: ['Confirmed', 'amber'],
  packed: ['Packed', 'amber'], shipped: ['Dispatched', 'blue'], delivered: ['Delivered', 'green'],
  cancelled: ['Cancelled', 'red'], returned: ['Returned', 'grey'],
}

const inr = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }))
const kg = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} t` : `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`)
const count = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'))
const dayFmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

function Delta({ value, label = 'than previous period', light }) {
  if (value == null) return null
  const up = value > 0
  return (
    <span className="ov-delta-row">
      <span className={`ov-delta ${value === 0 ? '' : up ? 'is-good' : 'is-bad'}${light ? ' is-light' : ''}`}>{up ? '↑' : value < 0 ? '↓' : '→'} {Math.abs(value)}%</span>
      <span>{label}</span>
    </span>
  )
}

function Stat({ label, value, icon, delta, note, hero }) {
  return (
    <div className={`ov-stat${hero ? ' is-hero' : ''}`}>
      <div className="ov-stat-top"><span>{label}</span><span className="ov-icon" aria-hidden="true"><Icon name={icon} size={16} /></span></div>
      <strong className="ov-stat-value">{value}</strong>
      {delta != null ? <Delta value={delta} label="vs previous" light={hero} /> : <span className="ov-stat-note">{note}</span>}
    </div>
  )
}

/** Leads per day, each bar split: became an order (dark) under not yet (striped maroon). */
function LeadsChart({ days }) {
  const [hover, setHover] = useState(null)
  // More than 5 weeks of days: one bar per week.
  const bars = useMemo(() => {
    if (days.length <= 35) return days.map((d) => ({ ...d, label: dayFmt(d.day) }))
    const out = []
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7)
      out.push({ day: chunk[0].day, label: `${dayFmt(chunk[0].day)} – ${dayFmt(chunk[chunk.length - 1].day)}`, leads: chunk.reduce((a, d) => a + d.leads, 0), won: chunk.reduce((a, d) => a + d.won, 0) })
    }
    return out
  }, [days])
  const max = Math.max(1, ...bars.map((b) => b.leads))
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0].map((t) => Math.round(t))
  return (
    <div className="ov-chart-box">
      <div className="ov-chart-head">
        <span>Leads and orders</span>
        <span className="ov-legend"><i className="is-won" /> Became an order <i className="is-open" /> Not yet</span>
      </div>
      <div className="ov-chart" onMouseLeave={() => setHover(null)}>
        <div className="ov-y" aria-hidden="true">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
        <div className="ov-plot">
          {ticks.map((t, i) => <span key={i} className="ov-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
          <div className="ov-bars" style={{ '--n': bars.length }}>
            {bars.map((b, i) => (
              <button key={b.day} type="button" className="ov-bar" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
                aria-label={`${b.label}: ${b.leads} leads, ${b.won} became orders`}>
                <span className="ov-bar-stack" style={{ height: `${(b.leads / top) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.5 }}>
                  {b.leads - b.won > 0 && <span className="ov-seg is-open" style={{ flexGrow: b.leads - b.won }} />}
                  {b.won > 0 && <span className="ov-seg is-won" style={{ flexGrow: b.won }} />}
                </span>
              </button>
            ))}
          </div>
          {hover !== null && (
            <div className="ov-tip" style={{ left: `${((hover + 0.5) / bars.length) * 100}%` }} role="status">
              <strong>{bars[hover].label}</strong>
              <span>{bars[hover].leads} leads · {bars[hover].won} became orders</span>
            </div>
          )}
        </div>
      </div>
      {bars.length > 1 && <div className="ov-x"><span>{bars[0].label.split(' – ')[0]}</span><span>{bars[bars.length - 1].label.split(' – ').pop()}</span></div>}
    </div>
  )
}

function OrdersTable({ orders }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const rows = orders.filter((o) => (!status || o.status === status)
    && (!q || `${o.order} ${o.customer} ${o.items} ${o.city}`.toLowerCase().includes(q.trim().toLowerCase())))
  const allPicked = rows.length > 0 && rows.every((o) => picked.has(o.order))
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  function download() {
    const list = rows.filter((o) => !picked.size || picked.has(o.order))
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [['Order', 'Customer', 'Items', 'City', 'Amount', 'Status', 'Date'], ...list.map((o) => [o.order, o.customer, o.items, o.city, o.amount, (STATUS[o.status] || [o.status])[0], when(o.placedAt)])]
      .map((r) => r.map(cell).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = 'analyst-orders.csv'
    document.body.appendChild(a); a.click(); a.remove()
  }
  return (
    <section className="ov-card ov-orders">
      <div className="ov-orders-head">
        <h2 className="ov-title">Orders in this period</h2>
        <div className="ov-orders-tools">
          <label className="ov-search"><Icon name="search" size={16} /><input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" /></label>
          <label className="ov-filter">
            <span className="visually-hidden">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Filter</option>
              {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <button type="button" className="ov-btn-light ov-btn-sm" onClick={download} disabled={!rows.length}>
            <Icon name="download" size={16} /> {picked.size ? `CSV (${picked.size})` : 'CSV'}
          </button>
        </div>
      </div>
      <div className="ov-table-wrap">
        <table className="ov-table">
          <thead>
            <tr>
              <th className="ov-check"><input type="checkbox" aria-label="Select all" checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((o) => o.order)))} /></th>
              <th>Order ID</th><th>Items</th><th className="is-num">Amount</th><th>Status</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((o) => {
              const [label, tone] = STATUS[o.status] || [o.status, 'grey']
              return (
                <tr key={o.order} className={picked.has(o.order) ? 'is-picked' : ''}>
                  <td className="ov-check"><input type="checkbox" aria-label={`Select ${o.order}`} checked={picked.has(o.order)} onChange={() => toggle(o.order)} /></td>
                  <td><span className="ov-mono">{o.order}</span><span className="ov-sub">{o.customer}{o.city ? ` · ${o.city}` : ''}</span></td>
                  <td className="ov-items">{o.items || '—'}</td>
                  <td className="is-num">{inr(o.amount)}</td>
                  <td><span className={`ov-status is-${tone}`}><i />{label}</span></td>
                  <td className="ov-date">{when(o.placedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <p className="ov-empty">{orders.length ? 'No orders match.' : 'No orders in this period.'}</p>}
      </div>
    </section>
  )
}

export default function AnalystOverview({ data, go, periodLabel }) {
  const s = data.sales
  const prev = data.previous || {}
  const t = data.target
  const l = data.leads
  const filled = t.kgPerMonth ? Math.min(100, (t.kgThisMonth / t.kgPerMonth) * 100) : 0
  return (
    <div className="ov">
      <section className="ov-card ov-balance">
        <div className="ov-balance-top">
          <span className="ov-label">Total revenue</span>
          <span className="ov-chip">{periodLabel}</span>
        </div>
        <strong className="ov-big">{inr(s.revenue)}</strong>
        <Delta value={prev.revenue} />
        <div className="ov-actions">
          <button type="button" className="ov-btn-dark" onClick={() => go('sales')}><Icon name="reports" size={18} /> Sales details</button>
          <button type="button" className="ov-btn-light" onClick={() => go('ceo')}><Icon name="calendar" size={18} /> CEO report</button>
        </div>
        <div className="ov-wallets">
          <div className="ov-wallets-head"><strong>Rice types</strong> <span>| Raw, Idli, Boiled</span></div>
          <div className="ov-wallet-row">
            {s.byRice.map((r) => (
              <div key={r.riceType} className="ov-wallet">
                <span className="ov-wallet-name">{RICE[r.riceType]}</span>
                <strong>{inr(r.revenue)}</strong>
                <span className="ov-wallet-note">{r.orders} orders · {kg(r.kg)}</span>
                <span className={`ov-wallet-state ${r.orders ? 'is-on' : 'is-off'}`}>{r.orders ? 'Selling' : 'No sales'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ov-card ov-stats">
        <Stat hero label="Orders" value={count(s.orders)} icon="orders" delta={prev.orders} />
        <Stat label="Kg sold" value={kg(s.kg)} icon="box" delta={prev.kg} />
        <Stat label="New leads" value={count(l.newLeads.total)} icon="users" delta={prev.newLeads} />
        <Stat label="Conversion" value={l.conversion == null ? '—' : `${l.conversion}%`} icon="check" note="Orders ÷ new leads" />
      </section>

      <section className="ov-card ov-income">
        <h2 className="ov-title">Leads per {l.perDay.length > 35 ? 'week' : 'day'}</h2>
        <p className="ov-muted">New leads in this period, and how many became a paid order.</p>
        <LeadsChart days={l.perDay} />
      </section>

      <div className="ov-side">
        <section className="ov-card">
          <h2 className="ov-title ov-title--sm">Monthly kg target</h2>
          {t.kgPerMonth ? (
            <>
              <div className="ov-progress" role="img" aria-label={`${kg(t.kgThisMonth)} of ${kg(t.kgPerMonth)}`}><span style={{ width: `${filled}%` }} /></div>
              <div className="ov-progress-foot"><span><strong>{kg(t.kgThisMonth)}</strong> sold this month, out of</span><strong>{kg(t.kgPerMonth)}</strong></div>
            </>
          ) : (
            <p className="ov-muted">No target yet. <button type="button" className="ov-link" onClick={() => go('settings')}>Set it in Settings</button></p>
          )}
        </section>
        <section className="ov-card">
          <div className="ov-cards-head"><span className="ov-icon ov-icon--box" aria-hidden="true"><Icon name="bell" size={16} /></span><h2 className="ov-title ov-title--sm">Needs attention</h2></div>
          <div className="ov-paycards">
            <button type="button" className="ov-paycard is-dark" onClick={() => go('leads')}>
              <span className="ov-pc-chip">{l.overdue.total ? 'Overdue' : 'All clear'}</span>
              <strong>{count(l.overdue.total)}</strong>
              <span>Follow-ups past their date</span>
            </button>
            <button type="button" className="ov-paycard is-brand" onClick={() => go('delivery')}>
              <span className="ov-pc-chip">{data.delivery.pendingDispatch.total ? 'Waiting' : 'All clear'}</span>
              <strong>{count(data.delivery.pendingDispatch.total)}</strong>
              <span>Paid orders not yet dispatched</span>
            </button>
          </div>
        </section>
      </div>

      <OrdersTable orders={data.recentOrders || []} />
    </div>
  )
}
