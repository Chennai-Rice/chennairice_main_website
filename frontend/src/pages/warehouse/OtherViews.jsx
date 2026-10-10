import TeamView from './TeamView.jsx'
import { useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon, Pagination, dayLabel, telHref, writePrefs } from './shared.jsx'

function useLoad(path, say, onAuthError) {
  const [state, setState] = useState({ data: null, loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    staffJson(path)
      .then((data) => live && setState({ data, loading: false }))
      .catch((err) => {
        if (!live) return
        setState({ data: null, loading: false })
        if (!onAuthError(err)) say(err.message, 'error')
      })
    return () => { live = false }
  }, [path, say, onAuthError])
  return state
}

/* ------------------------------------------------------------ Products */

function stockState(s) {
  // Unpriced packs cannot be bought, whatever is on the shelf.
  if (!s.is_active || s.priced === false) return { key: 'off', label: 'Not sold online' }
  if (s.available <= 0) return { key: 'out', label: 'Out of stock' }
  if (s.low) return { key: 'low', label: 'Low stock' }
  return { key: 'ok', label: 'In stock' }
}

export function ProductsView({ say, onAuthError }) {
  const { data, loading } = useLoad('/api/admin/inventory', say, onAuthError)
  const [q, setQ] = useState('')
  const products = useMemo(() => {
    const rows = (data?.stock || []).filter((r) => r.is_fulfilment && r.product_active !== false)
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.product_name)) map.set(r.product_name, { name: r.product_name, image: r.image_url, sizes: [] })
      map.get(r.product_name).sizes.push(r)
    }
    const term = q.trim().toLowerCase()
    return [...map.values()]
      .map((p) => ({ ...p, sizes: p.sizes.filter((s) => s.is_active).sort((a, b) => a.pack_kg - b.pack_kg) }))
      .filter((p) => p.sizes.length && (!term || p.name.toLowerCase().includes(term)))
  }, [data, q])

  const totals = products.reduce(
    (t, p) => {
      p.sizes.forEach((s) => {
        t.available += s.available
        t.held += s.reserved
        if (stockState(s).key === 'low') t.low++
        if (stockState(s).key === 'out') t.out++
      })
      return t
    },
    { available: 0, held: 0, low: 0, out: 0 }
  )

  return (
    <>
      <section className="wh-kpis wh-kpis--compact">
        <div className="wh-kpi wh-kpi--green"><span className="wh-kpi-icon"><Icon name="box" size={24} /></span>
          <span className="wh-kpi-text"><strong>{totals.available}</strong><span className="wh-kpi-label">Packs available</span><span className="wh-kpi-note">Ready to sell</span></span></div>
        <div className="wh-kpi wh-kpi--blue"><span className="wh-kpi-icon"><Icon name="truck" size={24} /></span>
          <span className="wh-kpi-text"><strong>{totals.held}</strong><span className="wh-kpi-label">Packs held</span><span className="wh-kpi-note">For paid orders, not dispatched</span></span></div>
        <div className="wh-kpi wh-kpi--rose"><span className="wh-kpi-icon"><Icon name="reports" size={24} /></span>
          <span className="wh-kpi-text"><strong>{totals.low}</strong><span className="wh-kpi-label">Low stock</span><span className="wh-kpi-note">At or below reorder level</span></span></div>
        <div className="wh-kpi wh-kpi--pink"><span className="wh-kpi-icon"><Icon name="cancel" size={24} /></span>
          <span className="wh-kpi-text"><strong>{totals.out}</strong><span className="wh-kpi-label">Out of stock</span><span className="wh-kpi-note">Pack sizes with none left</span></span></div>
      </section>

      <section className="wh-panel">
        <header className="wh-table-head">
          <h2>Products &amp; stock</h2>
          <label className="wh-search wh-search--small">
            <Icon name="search" size={16} />
            <span className="visually-hidden">Search products</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
          </label>
        </header>
        {loading && <p className="wh-empty">Loading…</p>}
        <div className="wh-product-grid">
          {products.map((p) => (
            <article className="wh-product" key={p.name}>
              <div className="wh-product-head">
                {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="wh-prod-img" />}
                <h3>{p.name}</h3>
              </div>
              <table className="wh-mini-table">
                <thead><tr><th>Pack</th><th>On hand</th><th>Held</th><th>Available</th><th>Status</th></tr></thead>
                <tbody>
                  {p.sizes.map((s) => {
                    const st = stockState(s)
                    return (
                      <tr key={s.variant_id}>
                        <td><strong>{Number(s.pack_kg)} kg</strong></td>
                        <td>{s.on_hand}</td>
                        <td>{s.reserved}</td>
                        <td><strong>{s.available}</strong></td>
                        <td><span className={`wh-stock wh-stock--${st.key}`}>{st.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </article>
          ))}
        </div>
        {!loading && !products.length && <p className="wh-empty">No products match.</p>}
      </section>
    </>
  )
}

/* ----------------------------------------------------------- Customers */

const CUST_PAGE = 20

export function CustomersView({ say, onAuthError, onOpenOrders }) {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const t = window.setTimeout(() => { setQ(draft.trim()); setPage(1) }, 400)
    return () => window.clearTimeout(t)
  }, [draft])
  const path = `/api/admin/warehouse/customers?${new URLSearchParams({ q, limit: CUST_PAGE, offset: (page - 1) * CUST_PAGE })}`
  const { data, loading } = useLoad(path, say, onAuthError)
  const total = data?.total || 0
  const pages = Math.max(1, Math.ceil(total / CUST_PAGE))

  return (
    <section className="wh-panel">
      <header className="wh-table-head">
        <h2>Customers: {total}</h2>
        <label className="wh-search wh-search--small">
          <Icon name="search" size={16} />
          <span className="visually-hidden">Search customers</span>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Name, phone or city" />
        </label>
      </header>
      <div className="wh-table wh-table--customers" role="table" aria-label="Customers">
        <div className="wh-tr wh-th" role="row">
          <span role="columnheader">Customer</span>
          <span role="columnheader">Phone</span>
          <span role="columnheader">Location</span>
          <span role="columnheader">Orders</span>
          <span role="columnheader">Packs</span>
          <span role="columnheader">Last order</span>
          <span role="columnheader">Actions</span>
        </div>
        {(data?.customers || []).map((c) => {
          const last = dayLabel(c.lastOrderAt)
          return (
            <div className="wh-tr" role="row" key={c.id}>
              <span role="cell"><span className="wh-avatar">{c.name.slice(0, 1).toUpperCase()}</span><strong>{c.name}</strong></span>
              <span role="cell"><a className="wh-phone" href={telHref(c.phone)}>{c.phone}</a></span>
              <span role="cell" className="wh-td-address"><Icon name="pin" size={15} className="wh-pin" /><span>{c.city}, {c.state}</span></span>
              <span role="cell"><span className="wh-k">Orders</span><strong>{c.orders}</strong></span>
              <span role="cell"><span className="wh-k">Packs</span>{c.packs}</span>
              <span role="cell"><span className="wh-k">Last order</span><span className={last.recent ? 'is-recent' : ''}>{last.text}</span></span>
              <span role="cell">
                <button type="button" className="wh-btn wh-btn--outline wh-btn--small" onClick={() => onOpenOrders(c.phone)}>
                  View orders
                </button>
              </span>
            </div>
          )
        })}
        {!loading && !(data?.customers || []).length && <p className="wh-empty">No customers yet.</p>}
      </div>
      <Pagination page={page} pages={pages} total={total} from={total ? (page - 1) * CUST_PAGE + 1 : 0}
        to={Math.min(page * CUST_PAGE, total)} onPage={setPage} noun="customers" />
    </section>
  )
}

/* ------------------------------------------------------------- Reports */

const BAR = '#a3364a' // brand maroon, lightened to the chart lightness band (validated)

function DispatchChart({ perDay, days }) {
  const [hover, setHover] = useState(null)
  // One bar per day of the period, including days with nothing dispatched.
  const series = useMemo(() => {
    const byDay = new Map(perDay.map((d) => [d.day, d]))
    return Array.from({ length: days }, (_, i) => {
      const day = new Date(Date.now() + 330 * 60000 - (days - 1 - i) * 86400000).toISOString().slice(0, 10)
      return { day, orders: byDay.get(day)?.orders || 0, packs: byDay.get(day)?.packs || 0 }
    })
  }, [perDay, days])
  const max = Math.max(1, ...series.map((d) => d.orders))
  const fmt = (day) => new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <figure className="wh-chart">
      <figcaption className="wh-chart-title">Orders dispatched per day</figcaption>
      <div className="wh-chart-plot" onMouseLeave={() => setHover(null)}>
        <div className="wh-chart-axis" aria-hidden="true">
          {ticks.slice().reverse().map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="wh-chart-bars" style={{ '--n': series.length }}>
          {ticks.map((t) => <span key={'g' + t} className="wh-chart-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
          {series.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className="wh-chart-hit"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${fmt(d.day)}: ${d.orders} orders, ${d.packs} packs`}
            >
              <span className="wh-chart-bar" style={{ height: `${(d.orders / max) * 100}%`, background: BAR, opacity: hover === null || hover === i ? 1 : 0.55 }} />
            </button>
          ))}
          {hover !== null && (
            <div className="wh-chart-tip" style={{ left: `${((hover + 0.5) / series.length) * 100}%` }} role="status">
              <strong>{fmt(series[hover].day)}</strong>
              <span>{series[hover].orders} orders · {series[hover].packs} packs</span>
            </div>
          )}
        </div>
      </div>
      <div className="wh-chart-x" aria-hidden="true">
        <span>{fmt(series[0].day)}</span>
        <span>{fmt(series[series.length - 1].day)}</span>
      </div>
      {/* The same numbers as a table, for screen readers. */}
      <table className="visually-hidden">
        <caption>Orders dispatched per day</caption>
        <thead><tr><th>Day</th><th>Orders</th><th>Packs</th></tr></thead>
        <tbody>{series.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.orders}</td><td>{d.packs}</td></tr>)}</tbody>
      </table>
    </figure>
  )
}

export function ReportsView({ say, onAuthError }) {
  const [days, setDays] = useState(30)
  const { data, loading } = useLoad(`/api/admin/warehouse/reports?days=${days}`, say, onAuthError)
  const mix = data?.statusMix || {}
  const waiting = (mix.placed || 0) + (mix.confirmed || 0) + (mix.packed || 0)
  const hours = data?.avgHoursToDispatch
  const speed = hours == null ? '—' : hours < 48 ? `${hours} h` : `${(hours / 24).toFixed(1)} days`
  const maxPacks = Math.max(1, ...(data?.perProduct || []).map((p) => p.packs))

  return (
    <>
      <div className="wh-report-bar">
        <label className="wh-filter">
          <span>Period</span>
          <span className="wh-select">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </span>
        </label>
      </div>

      <section className="wh-kpis wh-kpis--compact">
        <div className="wh-kpi wh-kpi--blue"><span className="wh-kpi-icon"><Icon name="truck" size={24} /></span>
          <span className="wh-kpi-text"><strong>{data?.dispatched ?? '—'}</strong><span className="wh-kpi-label">Dispatched</span><span className="wh-kpi-note">Orders sent in this period</span></span></div>
        <div className="wh-kpi wh-kpi--green"><span className="wh-kpi-icon"><Icon name="returns" size={24} /></span>
          <span className="wh-kpi-text"><strong>{speed}</strong><span className="wh-kpi-label">Average time to dispatch</span><span className="wh-kpi-note">From payment to dispatch</span></span></div>
        <div className="wh-kpi wh-kpi--rose"><span className="wh-kpi-icon"><Icon name="orders" size={24} /></span>
          <span className="wh-kpi-text"><strong>{waiting}</strong><span className="wh-kpi-label">Waiting</span><span className="wh-kpi-note">Paid, not yet dispatched</span></span></div>
        <div className="wh-kpi wh-kpi--pink"><span className="wh-kpi-icon"><Icon name="cancel" size={24} /></span>
          <span className="wh-kpi-text"><strong>{(mix.cancelled || 0) + (mix.returned || 0)}</strong><span className="wh-kpi-label">Cancelled / returned</span><span className="wh-kpi-note">In this period</span></span></div>
      </section>

      <div className="wh-report-grid">
        <section className="wh-panel">
          {loading || !data ? <p className="wh-empty">Loading…</p> : <DispatchChart perDay={data.perDay} days={data.days} />}
        </section>
        <section className="wh-panel">
          <h2 className="wh-panel-title">Packs ordered, by product</h2>
          <ul className="wh-hbars">
            {(data?.perProduct || []).map((p) => (
              <li key={p.name + p.packKg}>
                <span className="wh-hbar-label">{p.name} <span className="wh-muted">{p.packKg} kg</span></span>
                <span className="wh-hbar-track"><span className="wh-hbar" style={{ width: `${(p.packs / maxPacks) * 100}%`, background: BAR }} /></span>
                <span className="wh-hbar-value">{p.packs}</span>
              </li>
            ))}
          </ul>
          {data && !data.perProduct.length && <p className="wh-empty">No orders in this period.</p>}
        </section>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ Settings */

export function SettingsView({ me, prefs, setPrefs, location, onSignOut, say, onAuthError }) {
  const update = (key, value) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    writePrefs(next)
  }
  return (
    <div className="wh-settings">
      <section className="wh-panel">
        <h2 className="wh-panel-title">Your account</h2>
        <dl className="wh-dl">
          <div><dt>Name</dt><dd>{me.fullName}</dd></div>
          <div><dt>Email</dt><dd>{me.email}</dd></div>
          <div><dt>Role</dt><dd className="wh-role-chip">{me.role}</dd></div>
          <div><dt>Warehouse</dt><dd>{location || '—'}</dd></div>
        </dl>
        <p className="wh-muted wh-small">
          What you can do depends on your role, set by the owner. Every dispatch you make is recorded with your name.
        </p>
        <button type="button" className="wh-btn wh-btn--outline" onClick={onSignOut}><Icon name="logout" size={18} /> Sign out</button>
      </section>

      {me.permissions?.includes('staff.manage') && <TeamView me={me} say={say} onAuthError={onAuthError} />}

      <section className="wh-panel">
        <h2 className="wh-panel-title">Preferences</h2>
        <p className="wh-muted wh-small">Saved on this device only.</p>
        <label className="wh-filter wh-filter--wide">
          <span>Orders per page</span>
          <span className="wh-select">
            <select value={prefs.pageSize} onChange={(e) => update('pageSize', Number(e.target.value))}>
              {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
        </label>
        <label className="wh-filter wh-filter--wide">
          <span>Default sort</span>
          <span className="wh-select">
            <select value={prefs.sort} onChange={(e) => update('sort', e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </span>
        </label>
        <label className="wh-toggle">
          <input type="checkbox" checked={prefs.autoRefresh} onChange={(e) => update('autoRefresh', e.target.checked)} />
          <span>Refresh orders automatically every 30 seconds</span>
        </label>
      </section>
    </div>
  )
}
