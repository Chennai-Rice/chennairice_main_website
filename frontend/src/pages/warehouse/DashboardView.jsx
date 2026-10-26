import { useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon, STATUS, STATUS_KEY, dayLabel, timeLabel } from './shared.jsx'
import './warehouse-dash.css'

/*
  Dashboard (Oct 2026, owner's reference): a greeting, four cards with the
  last 7 days as small bars and the change against the week before, then
  Recent Orders · Low Stock · Order Status, then Quick actions · the orders
  trend · Top Products. White cards on grey, black and red accents.
*/

// Order status this month: one bar split by status, each part named with its
// count in the legend, so colour is never the only cue.
const STATUS_PARTS = [
  { key: 'toDispatch', label: 'To Dispatch', color: '#e0262d' },
  { key: 'dispatched', label: 'Dispatched', color: '#2563eb' },
  { key: 'delivered', label: 'Delivered', color: '#16a34a' },
  { key: 'cancelled', label: 'Cancelled', color: '#17181a' },
]
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const sum = (rows, key) => rows.reduce((t, r) => t + (r[key] || 0), 0)
const weekday = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })

function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** The last 7 values as small bars, today's darkest. */
function MiniBars({ values }) {
  const max = Math.max(1, ...values)
  return (
    <span className="wd-mini" aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} className={i === values.length - 1 ? 'is-today' : ''} style={{ height: `${Math.max((v / max) * 100, 8)}%` }} />
      ))}
    </span>
  )
}

/** "+25% vs last week" — this week's total against the week before. */
function WeekChange({ now, before }) {
  if (!now && !before) return <span className="wd-change">No activity in 2 weeks</span>
  if (!before) return <span className="wd-change is-up">New this week</span>
  const pct = Math.round(((now - before) / before) * 100)
  return (
    <span className={`wd-change ${pct >= 0 ? 'is-up' : 'is-down'}`}>
      {pct >= 0 ? '+' : ''}{pct}% <span>vs last week</span>
    </span>
  )
}

/** Orders a day for the last 7 days; today in red with its count above it. */
function TrendChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.orders))
  const top = Math.max(4, Math.ceil(max / 4) * 4)
  return (
    <div className="wd-trend" role="img" aria-label={'Orders per day: ' + days.map((d) => `${weekday(d.day)} ${d.orders}`).join(', ')}>
      <div className="wd-trend-axis" aria-hidden="true">
        {[top, (top * 3) / 4, top / 2, top / 4, 0].map((v) => <span key={v}>{v}</span>)}
      </div>
      <div className="wd-trend-bars">
        {days.map((d, i) => {
          const today = i === days.length - 1
          return (
            <div key={d.day} className={`wd-trend-col${today ? ' is-today' : ''}`}>
              <div className="wd-trend-track">
                <span style={{ height: `${(d.orders / top) * 100}%` }}>
                  {today && <em>{d.orders} today</em>}
                </span>
              </div>
              <small>{today ? 'Today' : weekday(d.day)}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardView({ say, onAuthError, go, money, me, onSearch }) {
  const [d, setD] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    let live = true
    const load = () => staffJson('/api/admin/warehouse/dashboard')
      .then((x) => live && setD(x))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && load(), 60000)
    return () => { live = false; window.clearInterval(t) }
  }, [say, onAuthError])

  if (!d) return <p className="wh-empty">Loading…</p>

  const daily = d.daily || []
  const week = daily.slice(-7)
  const before = daily.slice(0, 7)
  const cards = [
    { key: 'toDispatch', label: 'To Dispatch', series: 'orders', note: 'orders placed', to: () => go('dispatch') },
    { key: 'dispatched', label: 'Dispatched', series: 'dispatched', note: 'dispatched', to: () => go('deliveries') },
    { key: 'delivered', label: 'Delivered', series: 'delivered', note: 'delivered', to: () => go('deliveries', 'delivered') },
    { key: 'openIssues', label: 'Returns / Issues', series: 'issues', note: 'opened', to: () => go('returns') },
  ]
  const monthTotal = STATUS_PARTS.reduce((t, p) => t + (d.monthStatus[p.key] || 0), 0)
  const firstName = String(me?.fullName || '').split(/\s+/)[0]
  const maxTop = Math.max(1, ...d.topProducts.map((p) => p.packs))
  const change = d.yesterdayOrders ? Math.round(((d.todayOrders - d.yesterdayOrders) / d.yesterdayOrders) * 100) : null

  return (
    <div className="wd">
      <header className="wd-hello">
        <h2>{greeting()}{firstName ? `, ${firstName}` : ''}</h2>
        <p>Here's what's happening at the Nasiyanur mill today.</p>
      </header>

      {/* ---- four cards ---- */}
      <section className="wd-cards" aria-label="Order counts">
        {cards.map((c) => (
          <button key={c.key} type="button" className="wd-card" onClick={c.to}>
            <span className="wd-card-top">
              <span>
                <span className="wd-card-label">{c.label}</span>
                <strong className="wd-card-value">{d.counts[c.key]}</strong>
              </span>
              <MiniBars values={week.map((x) => x[c.series] || 0)} />
            </span>
            <span className="wd-card-foot">
              <WeekChange now={sum(week, c.series)} before={sum(before, c.series)} />
              <span className="wd-card-note">{sum(week, c.series)} {c.note} this week</span>
              <Icon name="chevronRight" size={16} />
            </span>
          </button>
        ))}
      </section>

      {/* ---- Recent Orders · Low Stock · Order Status ---- */}
      <div className="wd-row">
        <section className="wd-panel">
          <header className="wd-panel-head">
            <h3>Recent Orders</h3>
            <button type="button" className="wd-more" onClick={() => go('orders')}>See all</button>
          </header>
          <ul className="wd-list">
            {d.recentOrders.slice(0, 5).map((o) => {
              const day = dayLabel(o.placedAt)
              return (
                <li key={o.id}>
                  <span className="wd-list-icon"><Icon name="orders" size={17} /></span>
                  <span className="wd-list-main">
                    <strong>{o.customer}</strong>
                    <span className="wd-clamp">{o.orderNumber} · {o.products}</span>
                  </span>
                  <span className="wd-list-side">
                    <span className={`wh-status wh-status--${STATUS_KEY[o.status]}`}>{STATUS[o.status]}</span>
                    <small>{money && o.total != null ? inr(o.total) + ' · ' : ''}{day.text === 'Today' ? timeLabel(o.placedAt) : day.text}</small>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="wd-panel">
          <header className="wd-panel-head">
            <h3>Low Stock Alerts</h3>
            <button type="button" className="wd-more" onClick={() => go('inventory', 'low')}>See all</button>
          </header>
          {d.lowStock.length ? (
            <ul className="wd-list">
              {d.lowStock.slice(0, 5).map((p) => (
                <li key={p.name + p.packKg}>
                  {p.image ? <img className="wd-list-img" src={p.image} alt="" /> : <span className="wd-list-icon"><Icon name="box" size={17} /></span>}
                  <span className="wd-list-main">
                    <strong>{p.name}</strong>
                    <span>{p.packKg} kg pack · reorder at {p.reorderLevel}</span>
                  </span>
                  <span className="wd-list-side"><span className="wd-low">{p.available} left</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wd-allgood"><Icon name="check" size={18} /> All packs are above their reorder level.</p>
          )}
        </section>

        <section className="wd-panel">
          <header className="wd-panel-head"><h3>Order Status</h3><span className="wd-chip">This month</span></header>
          <div className="wd-total">
            <span>Total orders</span>
            <strong>{monthTotal} <small>orders this month</small></strong>
          </div>
          <div className="wd-split" role="img" aria-label={STATUS_PARTS.map((p) => `${p.label} ${d.monthStatus[p.key] || 0}`).join(', ')}>
            {STATUS_PARTS.map((p) => {
              const n = d.monthStatus[p.key] || 0
              return n ? <span key={p.key} style={{ flexGrow: n, background: p.color }} /> : null
            })}
            {!monthTotal && <span style={{ flexGrow: 1, background: '#e6e8eb' }} />}
          </div>
          <ul className="wd-legend">
            {STATUS_PARTS.map((p) => (
              <li key={p.key}>
                <span style={{ background: p.color }} aria-hidden="true" />
                {p.label}
                <strong>{d.monthStatus[p.key] || 0}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---- Quick actions · trend · Top Products ---- */}
      <div className="wd-row">
        <section className="wd-panel wd-quick">
          <h3>Quick actions</h3>
          <div className="wd-quick-chips">
            <button type="button" onClick={() => go('dispatch')}>Dispatch orders ({d.counts.toDispatch})</button>
            <button type="button" onClick={() => go('tracker')}>Upload tracker</button>
            <button type="button" onClick={() => go('returns')}>Returns ({d.counts.openIssues})</button>
          </div>
          {onSearch && (
            <form className="wd-quick-search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) onSearch(q.trim()) }}>
              <p>{d.counts.toDispatch} {d.counts.toDispatch === 1 ? 'order is' : 'orders are'} waiting to go out</p>
              <div>
                <Icon name="search" size={17} />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an order, customer or phone…" aria-label="Find an order" />
                <button type="submit" aria-label="Search"><Icon name="chevronRight" size={18} /></button>
              </div>
            </form>
          )}
        </section>

        <section className="wd-panel">
          <header className="wd-panel-head">
            <h3>Orders Trend</h3>
            <span className="wd-chip">Last 7 days</span>
          </header>
          <p className="wd-trend-sum">
            <strong>{d.todayOrders}</strong> today
            {change !== null && <span className={`wd-change ${change >= 0 ? 'is-up' : 'is-down'}`}> {change >= 0 ? '+' : ''}{change}% <span>vs yesterday</span></span>}
          </p>
          <TrendChart days={week} />
        </section>

        <section className="wd-panel">
          <header className="wd-panel-head">
            <h3>Top Products</h3>
            <span className="wd-chip">This month</span>
          </header>
          {d.topProducts.length ? (
            <ul className="wd-list">
              {d.topProducts.map((p, i) => (
                <li key={p.name}>
                  {p.image ? <img className="wd-list-img" src={p.image} alt="" /> : <span className="wd-list-icon">{i + 1}</span>}
                  <span className="wd-list-main">
                    <strong>{p.name}</strong>
                    <span className="wd-bar"><span style={{ width: `${(p.packs / maxTop) * 100}%` }} /></span>
                  </span>
                  <span className="wd-list-side"><strong>{p.packs}</strong><small>packs</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="wd-allgood">No orders this month yet.</p>}
        </section>
      </div>
    </div>
  )
}
