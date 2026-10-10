import { useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon, STATUS, STATUS_KEY, dayLabel, timeLabel } from './shared.jsx'

// Validated with the dataviz palette checker (all checks pass); every slice
// is also named with its count in the legend, so colour is never alone.
const DONUT = [
  { key: 'toDispatch', label: 'To Dispatch', color: '#d9480f' },
  { key: 'dispatched', label: 'Dispatched', color: '#1c7ed6' },
  { key: 'delivered', label: 'Delivered', color: '#2b8a3e' },
  { key: 'cancelled', label: 'Cancelled', color: '#9c36b5' },
]
const BAR = '#a3364a'
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

function Donut({ data }) {
  const [hover, setHover] = useState(null)
  const total = DONUT.reduce((t, d) => t + (data[d.key] || 0), 0)
  const R = 46
  const C = 2 * Math.PI * R
  const gap = total > 0 && DONUT.filter((d) => data[d.key]).length > 1 ? 2 : 0 // 2px surface gap between slices
  let offset = 0
  return (
    <div className="wh-donut-wrap">
      <figure className="wh-donut" aria-label={`Order status this month, ${total} orders`}>
        <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-hidden="true">
          <circle cx="60" cy="60" r={R} fill="none" stroke="#f1ebe2" strokeWidth="18" />
          {total > 0 && DONUT.map((d, i) => {
            const v = data[d.key] || 0
            if (!v) return null
            const len = (v / total) * C
            const seg = (
              <circle
                key={d.key}
                cx="60" cy="60" r={R} fill="none"
                stroke={d.color}
                strokeWidth={hover === i ? 21 : 18}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width 0.12s ease', cursor: 'default' }}
              />
            )
            offset += len
            return seg
          })}
        </svg>
        <figcaption className="wh-donut-center">
          <strong>{hover === null ? total : data[DONUT[hover].key] || 0}</strong>
          <span>{hover === null ? 'Total orders' : DONUT[hover].label}</span>
        </figcaption>
      </figure>
      <ul className="wh-legend">
        {DONUT.map((d, i) => (
          <li key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="wh-legend-dot" style={{ background: d.color }} aria-hidden="true" />
            <span>{d.label}</span>
            <strong>{data[d.key] || 0}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HourBars({ hours }) {
  // Business hours only (6 am to 10 pm), so the bars stay readable.
  const shown = hours.slice(6, 23)
  const max = Math.max(1, ...shown)
  const label = (h) => (h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : h - 12 + 'p')
  return (
    <div className="wh-hours" role="img" aria-label="Orders today by hour">
      {shown.map((n, i) => (
        <span key={i} className="wh-hour" title={`${label(i + 6)}: ${n} ${n === 1 ? 'order' : 'orders'}`}>
          <span style={{ height: `${Math.max((n / max) * 100, n ? 6 : 0)}%`, background: BAR }} />
        </span>
      ))}
      <span className="wh-hours-axis" aria-hidden="true"><span>6a</span><span>12p</span><span>6p</span><span>10p</span></span>
    </div>
  )
}

export default function DashboardView({ say, onAuthError, go, money }) {
  const [d, setD] = useState(null)
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

  const change = d.yesterdayOrders ? Math.round(((d.todayOrders - d.yesterdayOrders) / d.yesterdayOrders) * 100) : null
  const cards = [
    { key: 'toDispatch', label: 'To Dispatch', icon: 'truck', tone: 'rose', to: () => go('dispatch') },
    { key: 'dispatched', label: 'Dispatched', icon: 'box', tone: 'blue', to: () => go('deliveries') },
    { key: 'delivered', label: 'Delivered', icon: 'check', tone: 'green', to: () => go('deliveries', 'delivered') },
    { key: 'openIssues', label: 'Returns / Issues', icon: 'returns', tone: 'pink', to: () => go('returns') },
  ]
  const maxTop = Math.max(1, ...d.topProducts.map((p) => p.packs))

  return (
    <>
      <div className="wh-page-head">
        <h2>Dashboard</h2>
        <p className="wh-muted">Today at the Nasiyanur mill</p>
      </div>

      <section className="wh-kpis" aria-label="Order counts">
        {cards.map((c) => (
          <button key={c.key} type="button" className={`wh-kpi wh-kpi--${c.tone}`} onClick={c.to}>
            <span className="wh-kpi-icon"><Icon name={c.icon} size={26} /></span>
            <span className="wh-kpi-text">
              <strong>{d.counts[c.key]}</strong>
              <span className="wh-kpi-label">{c.label}</span>
            </span>
            <Icon name="chevronRight" size={20} className="wh-kpi-arrow" />
          </button>
        ))}
      </section>

      <div className="wh-dash-grid">
        <section className="wh-panel">
          <h3 className="wh-panel-title">Today's Orders</h3>
          <div className="wh-today">
            <strong>{d.todayOrders}</strong>
            {change !== null && (
              <span className={`wh-trend ${change >= 0 ? 'is-up' : 'is-down'}`}>
                {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% <span className="wh-muted">vs yesterday</span>
              </span>
            )}
          </div>
          <HourBars hours={d.todayByHour} />
        </section>

        <section className="wh-panel">
          <h3 className="wh-panel-title">Order Status (This Month)</h3>
          <Donut data={d.monthStatus} />
        </section>

        <section className="wh-panel">
          <h3 className="wh-panel-title">Top Products (This Month)</h3>
          {d.topProducts.length ? (
            <ul className="wh-top">
              {d.topProducts.map((p) => (
                <li key={p.name}>
                  {p.image ? <img src={p.image} alt="" /> : <span className="wh-prod-img" />}
                  <span className="wh-top-name">{p.name}</span>
                  <span className="wh-top-bar"><span style={{ width: `${(p.packs / maxTop) * 100}%`, background: BAR }} /></span>
                  <strong>{p.packs}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="wh-empty">No orders this month yet.</p>}
          <p className="wh-muted wh-small">Packs ordered</p>
        </section>
      </div>

      <div className="wh-dash-grid wh-dash-grid--2">
        <section className="wh-panel">
          <header className="wh-panel-head">
            <h3 className="wh-panel-title">Recent Orders</h3>
            <button type="button" className="wh-link" onClick={() => go('orders')}>View all</button>
          </header>
          <div className={`wh-table wh-table--recent${money ? ' has-money' : ''}`} role="table" aria-label="Recent orders">
            <div className="wh-tr wh-th" role="row">
              <span role="columnheader">Order ID</span>
              <span role="columnheader">Customer</span>
              <span role="columnheader">Products</span>
              {money && <span role="columnheader">Amount</span>}
              <span role="columnheader">Status</span>
              <span role="columnheader">Date</span>
            </div>
            {d.recentOrders.map((o) => {
              const day = dayLabel(o.placedAt)
              return (
                <div className="wh-tr" role="row" key={o.id}>
                  <span role="cell" className="wh-mono">{o.orderNumber}</span>
                  <span role="cell">{o.customer}</span>
                  <span role="cell" className="wh-clamp">{o.products}</span>
                  {money && <span role="cell"><strong>{inr(o.total)}</strong></span>}
                  <span role="cell"><span className={`wh-status wh-status--${STATUS_KEY[o.status]}`}>{STATUS[o.status]}</span></span>
                  <span role="cell"><span className={day.recent ? 'is-recent' : ''}>{day.text}</span><span className="wh-muted wh-small">{timeLabel(o.placedAt)}</span></span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="wh-panel">
          <header className="wh-panel-head">
            <h3 className="wh-panel-title">Low Stock Alerts</h3>
            <button type="button" className="wh-link" onClick={() => go('inventory', 'low')}>View all</button>
          </header>
          {d.lowStock.length ? (
            <ul className="wh-lowstock">
              {d.lowStock.map((p) => (
                <li key={p.name + p.packKg}>
                  {p.image ? <img src={p.image} alt="" /> : <span className="wh-prod-img" />}
                  <span><strong>{p.name}</strong><span className="wh-muted wh-small">{p.packKg} kg</span></span>
                  <span className="wh-stock wh-stock--low">Stock: {p.available} packs</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wh-empty"><Icon name="check" size={18} /> All packs above their reorder level.</p>
          )}
        </section>
      </div>
    </>
  )
}
