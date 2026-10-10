import { useCallback, useEffect, useMemo, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { Icon, Pagination, dayLabel, telHref, timeLabel } from './shared.jsx'
import { printSlips } from './OrdersView.jsx'
import ShipDialog, { METHOD_LABEL } from './ShipDialog.jsx'

const TABS = [
  { key: 'ready', label: 'Ready to Dispatch' },
  { key: 'packing', label: 'Packing' },
  { key: 'dispatched', label: 'Dispatched' },
]
const PAGE = 10

async function download(path, fallback, say, onAuthError) {
  try {
    const res = await staffFetch(path)
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallback
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    if (!onAuthError(err)) say(err.message, 'error')
  }
}

export default function DispatchView({ say, onAuthError }) {
  const [tab, setTab] = useState('ready')
  const [draft, setDraft] = useState('')
  const [f, setF] = useState({ q: '', state: '', pack: '', sort: 'oldest' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ orders: [], counts: {}, tabCount: 0 })
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [ship, setShip] = useState(null) // { order, mode: 'dispatch' | 'edit' }
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(null)

  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.q === draft ? x : { ...x, q: draft })), 400)
    return () => window.clearTimeout(t)
  }, [draft])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [tab, f])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ tab, sort: f.sort, limit: PAGE, offset: (page - 1) * PAGE })
    for (const k of ['q', 'state', 'pack']) if (f[k]) p.set(k, f[k])
    return p.toString()
  }, [tab, f, page])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await staffJson('/api/admin/warehouse/orders?' + qs))
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [qs, say, onAuthError])
  useEffect(() => { load() }, [load])

  async function act(fn, success) {
    setBusy(true)
    try {
      await fn()
      say(success)
      setShip(null)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
      load()
    }
  }

  const packing = (o, on) => act(
    () => staffJson(`/api/admin/orders/${o.id}/packing`, { method: 'POST', body: JSON.stringify({ on, expect: o.status }) }),
    on ? `${o.orderNumber} moved to Packing` : `${o.orderNumber} moved back to Ready`
  )

  async function bulkPacking() {
    const list = data.orders.filter((o) => selected.has(o.id))
    setBusy(true)
    let done = 0
    for (const o of list) {
      try {
        await staffJson(`/api/admin/orders/${o.id}/packing`, { method: 'POST', body: JSON.stringify({ on: true, expect: o.status }) })
        done++
      } catch (err) {
        if (onAuthError(err)) break
      }
    }
    setBusy(false)
    setSelected(new Set())
    say(`${done} of ${list.length} orders moved to Packing`, done === list.length ? 'ok' : 'error')
    load()
  }

  function submitShip(form) {
    const { order, mode } = ship
    if (mode === 'edit') {
      return act(
        () => staffJson(`/api/admin/shipments/${order.shipment.id}/details`, { method: 'PATCH', body: JSON.stringify(form) }),
        `${order.orderNumber}: shipping details saved`
      )
    }
    return act(
      () => staffJson(`/api/admin/orders/${order.id}/ship`, { method: 'POST', body: JSON.stringify(form) }),
      `${order.orderNumber} dispatched`
    )
  }

  async function showPickList() {
    try {
      const p = new URLSearchParams({ tab: tab === 'dispatched' ? 'to_dispatch' : tab })
      for (const k of ['q', 'state', 'pack']) if (f[k]) p.set(k, f[k])
      const r = await staffJson('/api/admin/warehouse/pick-list?' + p)
      setPick({ lines: r.lines, query: p.toString() })
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  const total = data.tabCount || 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const selectable = tab === 'ready' ? data.orders.filter((o) => !o.needsAttention) : data.orders
  const allSel = selectable.length > 0 && selectable.every((o) => selected.has(o.id))

  return (
    <>
      <div className="wh-page-head">
        <h2>Dispatch</h2>
        <p className="wh-muted">Pack orders, record how they travel, and mark them dispatched</p>
      </div>

      <section className="wh-panel">
        <nav className="wh-tabs" aria-label="Dispatch stage">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`wh-tab${tab === t.key ? ' is-active' : ''}`} aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}>
              {t.label} ({data.counts[t.key] ?? 0})
            </button>
          ))}
        </nav>

        <div className="wh-searchrow">
          <label className="wh-search">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Search</span>
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search order ID, customer, phone, product or PIN code..." />
          </label>
          <button type="button" className="wh-btn wh-btn--outline" onClick={showPickList}>
            <Icon name="orders" size={18} /> Pick List
          </button>
        </div>

        <div className="wh-filter-row">
          <label className="wh-filter"><span>State</span>
            <span className="wh-select"><select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">All states</option><option value="tn">Tamil Nadu</option><option value="other">Other states</option>
            </select></span>
          </label>
          <label className="wh-filter"><span>Pack size</span>
            <span className="wh-select"><select value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })}>
              <option value="">All pack sizes</option><option value="5">5 kg</option><option value="10">10 kg</option><option value="26">26 kg</option>
            </select></span>
          </label>
          <label className="wh-filter"><span>Sort by</span>
            <span className="wh-select"><select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
              <option value="oldest">Oldest first</option><option value="newest">Newest first</option>
            </select></span>
          </label>
          <div className="wh-filter-actions">
            {tab === 'ready' && (
              <button type="button" className="wh-btn wh-btn--soft" disabled={!selected.size || busy} onClick={bulkPacking}>
                <Icon name="box" size={18} /> Start packing ({selected.size})
              </button>
            )}
            <button type="button" className="wh-btn wh-btn--outline" disabled={!data.orders.length}
              onClick={() => printSlips((selected.size ? data.orders.filter((o) => selected.has(o.id)) : data.orders).map((o) => o.id), say)}>
              <Icon name="print" size={18} /> Print Slips{selected.size ? ` (${selected.size})` : ''}
            </button>
          </div>
        </div>
      </section>

      <section className="wh-panel wh-table-panel" aria-busy={loading}>
        <div className="wh-table wh-table--dispatch" role="table" aria-label="Orders to dispatch">
          <div className="wh-tr wh-th" role="row">
            <span role="columnheader">
              <input type="checkbox" checked={allSel} disabled={!selectable.length} aria-label="Select all on this page"
                onChange={() => setSelected(allSel ? new Set() : new Set(selectable.map((o) => o.id)))} />
            </span>
            <span role="columnheader">Order ID</span>
            <span role="columnheader">Products &amp; Qty</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Address</span>
            <span role="columnheader">{tab === 'dispatched' ? 'Shipment' : 'Waiting since'}</span>
            <span role="columnheader">Actions</span>
          </div>
          {data.orders.map((o) => {
            const d = dayLabel(o.placedAt)
            return (
              <div key={o.id} className={`wh-tr${selected.has(o.id) ? ' is-selected' : ''}`} role="row">
                <span role="cell" className="wh-td-pick">
                  <input type="checkbox" checked={selected.has(o.id)} aria-label={'Select ' + o.orderNumber}
                    disabled={tab === 'ready' && Boolean(o.needsAttention)}
                    onChange={(e) => setSelected((prev) => { const n = new Set(prev); e.target.checked ? n.add(o.id) : n.delete(o.id); return n })} />
                </span>
                <span role="cell" className="wh-td-order">
                  <strong className="wh-mono">{o.orderNumber}</strong>
                  <span className="wh-muted wh-small">{o.shipmentId}</span>
                  {o.needsAttention && <span className="wh-badge wh-badge--flag" title={o.needsAttention}>Flagged</span>}
                </span>
                <span role="cell" className="wh-td-products">
                  {o.items.map((i) => (
                    <span key={i.sku} className="wh-line">
                      {i.image ? <img src={i.image} alt="" /> : <span className="wh-prod-img" />}
                      <span><strong>{i.name}</strong> <span className="wh-muted">{Number(i.packKg)} kg × {i.qty}</span></span>
                    </span>
                  ))}
                </span>
                <span role="cell" className="wh-td-customer">
                  <strong>{o.customer.name}</strong>
                  <a className="wh-phone" href={telHref(o.customer.phone)}>{o.customer.phone}</a>
                </span>
                <span role="cell" className="wh-td-address">
                  <Icon name="pin" size={15} className="wh-pin" />
                  <span>{o.address.city} - {o.address.pincode}<br /><span className="wh-muted wh-small">{o.address.state}</span></span>
                </span>
                <span role="cell">
                  {tab === 'dispatched' ? (
                    o.shipment?.method ? (
                      <span><strong>{METHOD_LABEL[o.shipment.method]}</strong>{o.shipment.carrier ? ` · ${o.shipment.carrier}` : ''}<br />
                        <span className="wh-muted wh-small">{o.shipment.trackingNumber || o.shipment.lrNumber || o.shipment.vehicle || ''}</span></span>
                    ) : <span className="wh-badge wh-badge--flag">Details missing</span>
                  ) : (
                    <span><span className={d.recent ? 'is-recent' : ''}>{d.text}</span><br /><span className="wh-muted wh-small">{timeLabel(o.placedAt)}</span></span>
                  )}
                </span>
                <span role="cell" className="wh-td-actions">
                  {tab !== 'dispatched' && (
                    <button type="button" className="wh-btn wh-btn--primary wh-btn--small" disabled={busy || Boolean(o.needsAttention)}
                      onClick={() => setShip({ order: o, mode: 'dispatch' })}>
                      {tab === 'ready' ? 'Pack & Dispatch' : 'Dispatch'}
                    </button>
                  )}
                  {tab === 'ready' && (
                    <button type="button" className="wh-btn wh-btn--outline wh-btn--small" disabled={busy || Boolean(o.needsAttention)} onClick={() => packing(o, true)}>
                      Start packing
                    </button>
                  )}
                  {tab === 'packing' && (
                    <button type="button" className="wh-btn wh-btn--outline wh-btn--small" disabled={busy} onClick={() => packing(o, false)}>
                      Back to Ready
                    </button>
                  )}
                  {tab === 'dispatched' && o.shipment && (
                    <button type="button" className="wh-btn wh-btn--outline wh-btn--small" onClick={() => setShip({ order: o, mode: 'edit' })}>
                      {o.shipment.method ? 'Edit details' : 'Add details'}
                    </button>
                  )}
                  <button type="button" className="wh-icon-btn" title="Print packing slip" aria-label={`Print slip for ${o.orderNumber}`} onClick={() => printSlips([o.id], say)}>
                    <Icon name="print" size={18} />
                  </button>
                </span>
              </div>
            )
          })}
          {!loading && !data.orders.length && <p className="wh-empty">Nothing here right now.</p>}
        </div>
        <Pagination page={page} pages={pages} total={total} from={total ? (page - 1) * PAGE + 1 : 0}
          to={Math.min(page * PAGE, total)} onPage={setPage} />
      </section>

      {ship && (
        <ShipDialog
          title={ship.mode === 'edit' ? `Shipping details: ${ship.order.orderNumber}` : `Pack & dispatch ${ship.order.orderNumber}`}
          subtitle={`${ship.order.customer.name} · ${ship.order.address.city} · ${ship.order.packs} packs, ${ship.order.totalKg} kg`}
          initial={ship.mode === 'edit' ? { ...ship.order.shipment, vehicle: ship.order.shipment.vehicle } : {}}
          submitLabel={ship.mode === 'edit' ? 'Save details' : 'Mark as dispatched'}
          busy={busy}
          onSubmit={submitShip}
          onCancel={() => setShip(null)}
        />
      )}

      {pick && (
        <div className="wh-modal-backdrop" onClick={() => setPick(null)}>
          <div className="wh-modal wh-modal--wide" role="dialog" aria-modal="true" aria-labelledby="wh-pick-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="wh-modal-x" onClick={() => setPick(null)} aria-label="Close"><Icon name="x" size={18} /></button>
            <h2 id="wh-pick-title">Pick list</h2>
            <p className="wh-muted">Packs to pull from the shelves for the orders listed under {tab === 'packing' ? 'Packing' : 'Ready and Packing'}.</p>
            <table className="wh-mini-table">
              <thead><tr><th>Product</th><th>Pack</th><th>Packs</th><th>Orders</th></tr></thead>
              <tbody>
                {pick.lines.map((l) => (
                  <tr key={l.sku}><td><strong>{l.name}</strong></td><td>{l.packKg} kg</td><td><strong>{l.packs}</strong></td><td>{l.orders}</td></tr>
                ))}
                {!pick.lines.length && <tr><td colSpan="4" className="wh-muted">Nothing waiting.</td></tr>}
              </tbody>
            </table>
            <div className="wh-modal-actions">
              <button type="button" className="wh-btn wh-btn--ghost" onClick={() => window.print()}><Icon name="print" size={18} /> Print</button>
              <button type="button" className="wh-btn wh-btn--primary" disabled={!pick.lines.length}
                onClick={() => download('/api/admin/warehouse/pick-list.csv?' + pick.query, 'pick-list.csv', say, onAuthError)}>
                <Icon name="download" size={18} /> Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
