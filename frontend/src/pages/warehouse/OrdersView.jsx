import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import {
  Confirm, Icon, NOT_DISPATCHED, PAYMENT, Pagination, STATUS, STATUS_KEY, dayLabel, istDay, telHref, timeLabel,
} from './shared.jsx'

// Status keys match TABS in backend/lib/sales/warehouse.js.
const KPIS = [
  { key: 'to_dispatch', label: 'To Dispatch', note: 'Orders awaiting dispatch', icon: 'truck', tone: 'rose' },
  { key: 'dispatched', label: 'Dispatched', note: 'In transit to customers', icon: 'box', tone: 'blue' },
  { key: 'delivered', label: 'Delivered', note: 'Successfully delivered', icon: 'check', tone: 'green' },
  { key: 'cancelled', label: 'Cancelled', note: 'Cancelled orders', icon: 'cancel', tone: 'pink' },
]

const EMPTY = { q: '', date: '', from: '', to: '', payment: '', pack: '', state: '' }
const REFRESH_MS = 30000

// Rows the checkbox and bulk actions can change.
const canDispatch = (o) => NOT_DISPATCHED.includes(o.status) && !o.needsAttention
const canUndo = (o) => o.status === 'shipped'
const isSelectable = (o) => canDispatch(o) || canUndo(o)

function dateRange(f) {
  if (f.date === 'today') return { from: istDay(0), to: istDay(0) }
  if (f.date === 'yesterday') return { from: istDay(-1), to: istDay(-1) }
  if (f.date === '7days') return { from: istDay(-6), to: istDay(0) }
  if (f.date === '30days') return { from: istDay(-29), to: istDay(0) }
  if (f.date === 'custom') return { from: f.from, to: f.to }
  return { from: '', to: '' }
}

function queryString(status, sort, f, extra = {}) {
  const p = new URLSearchParams({ tab: status, sort })
  const { from, to } = dateRange(f)
  for (const [k, v] of Object.entries({ q: f.q.trim(), payment: f.payment, pack: f.pack, state: f.state, from, to, ...extra })) {
    if (v !== '' && v != null) p.set(k, v)
  }
  return p.toString()
}

/** Prints several packing slips in one window, one per page. */
export async function printSlips(ids, say) {
  const win = window.open('', '_blank')
  if (!win) return say('Allow pop-ups for this site to print slips.', 'error')
  try {
    const pages = await Promise.all(ids.map((id) => staffFetch(`/api/admin/orders/${id}/packing-slip`).then((r) => r.text())))
    const parser = new DOMParser()
    const docs = pages.map((html) => parser.parseFromString(html, 'text/html'))
    const style = docs[0]?.querySelector('style')?.textContent || ''
    const bodies = docs.map((d) => `<section class="slip">${d.body.innerHTML}</section>`).join('')
    win.document.open()
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slips (${ids.length})</title>
      <style>${style} .slip{page-break-after:always} .slip:last-child{page-break-after:auto}</style></head><body>${bodies}</body></html>`)
    win.document.close()
    win.focus()
    window.setTimeout(() => win.print(), 300)
  } catch (err) {
    win.close()
    say(err.message, 'error')
  }
}

function ProductCell({ items }) {
  const [first, ...rest] = items
  return (
    <div className="wh-prod">
      {first.image ? <img src={first.image} alt="" className="wh-prod-img" loading="lazy" /> : <span className="wh-prod-img" />}
      <div className="wh-prod-text">
        <strong>{first.name}</strong>
        <span className="wh-muted">
          {Number(first.packKg)} kg × {first.qty} {first.qty === 1 ? 'pack' : 'packs'}
        </span>
        {rest.length > 0 && (
          <span
            className="wh-more-chip"
            title={rest.map((i) => `${i.qty} × ${i.name} (${Number(i.packKg)} kg)`).join('\n')}
          >
            +{rest.length} more
          </span>
        )}
      </div>
    </div>
  )
}

function RowMenu({ order, onView, onUndo, onClose, say }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      say(`${what} copied`)
    } catch {
      say('Could not copy. Select and copy it from the order details.', 'error')
    }
    onClose()
  }
  return (
    <div className="wh-menu" ref={ref} role="menu">
      <button type="button" role="menuitem" onClick={() => { onView(order); onClose() }}><Icon name="eye" size={16} /> View details</button>
      <button type="button" role="menuitem" onClick={() => copy(order.orderNumber, 'Order ID')}><Icon name="copy" size={16} /> Copy order ID</button>
      {order.shipmentId && (
        <button type="button" role="menuitem" onClick={() => copy(order.shipmentId, 'Shipment ID')}><Icon name="copy" size={16} /> Copy shipment ID</button>
      )}
      {order.shipment?.trackingUrl && (
        <a role="menuitem" href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}>
          <Icon name="truck" size={16} /> Track on {order.shipment.carrier || 'courier'}
        </a>
      )}
      <a role="menuitem" href={telHref(order.customer.phone)} onClick={onClose}><Icon name="phone" size={16} /> Call customer</a>
      {canUndo(order) && (
        <button type="button" role="menuitem" className="is-danger" onClick={() => { onUndo(order); onClose() }}>
          <Icon name="undo" size={16} /> Undo dispatch
        </button>
      )}
    </div>
  )
}

function Details({ order, onClose }) {
  const a = order.address
  return (
    <div className="wh-modal-backdrop" onClick={onClose}>
      <div className="wh-modal wh-modal--wide" role="dialog" aria-modal="true" aria-labelledby="wh-details-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wh-modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-details-title">{order.orderNumber}</h2>
        <p className="wh-muted">
          Shipment ID <strong className="wh-mono">{order.shipmentId || '—'}</strong> · {dayLabel(order.placedAt).text}, {timeLabel(order.placedAt)}
        </p>
        <div className="wh-details-grid">
          <div>
            <h3>Products</h3>
            <ul className="wh-details-items">
              {order.items.map((i) => (
                <li key={i.sku}>
                  {i.image && <img src={i.image} alt="" />}
                  <span><strong>{i.qty} ×</strong> {i.name} ({Number(i.packKg)} kg)</span>
                </li>
              ))}
            </ul>
            <p className="wh-muted">{order.packs} packs · {order.totalKg} kg</p>
          </div>
          <div>
            <h3>Deliver to</h3>
            <p>
              <strong>{order.customer.name}</strong><br />
              <a className="wh-phone" href={telHref(order.customer.phone)}>{order.customer.phone}</a>
            </p>
            <address>
              {a.line1}{a.line2 && <>, {a.line2}</>}
              {a.landmark && <><br />Landmark: {a.landmark}</>}
              <br />{a.city}, {a.state} – {a.pincode}
            </address>
            <p>
              <span className={`wh-badge wh-badge--pay-${order.paymentStatus}`}>{PAYMENT[order.paymentStatus]}</span>{' '}
              <span className={`wh-status wh-status--${STATUS_KEY[order.status]}`}>{STATUS[order.status]}</span>
            </p>
            {order.needsAttention && <p className="wh-flag-note">Flagged: {order.needsAttention}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrdersView({ status, onStatus, prefs, say, onAuthError, focusQuery, money = false }) {
  const [filters, setFilters] = useState(EMPTY)
  const [draft, setDraft] = useState('')
  const [sort, setSort] = useState(prefs.sort)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ orders: [], counts: {}, tabCount: 0 })
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(() => new Map())
  const [pending, setPending] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [printMenu, setPrintMenu] = useState(false)
  const [details, setDetails] = useState(null)
  const requestId = useRef(0)
  const pageSize = prefs.pageSize

  // A search handed over from elsewhere (bell, Customers page).
  useEffect(() => {
    if (focusQuery == null) return
    setDraft(focusQuery.q)
    setFilters({ ...EMPTY, q: focusQuery.q })
    setPage(1)
  }, [focusQuery])

  const qs = useMemo(
    () => queryString(status, sort, filters, { limit: pageSize, offset: (page - 1) * pageSize }),
    [status, sort, filters, page, pageSize]
  )

  const load = useCallback(async ({ quiet = false } = {}) => {
    const id = ++requestId.current
    if (!quiet) setLoading(true)
    try {
      const result = await staffJson('/api/admin/warehouse/orders?' + qs)
      if (id !== requestId.current) return
      setData(result)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [qs, say, onAuthError])

  useEffect(() => { load() }, [load])

  // Back to page 1 whenever what is being listed changes.
  useEffect(() => { setPage(1) }, [status, sort, filters, pageSize])

  // New paid orders appear by themselves.
  useEffect(() => {
    if (!prefs.autoRefresh) return undefined
    const t = window.setInterval(() => {
      if (!pending.size && !confirm && !details && document.visibilityState === 'visible') load({ quiet: true })
    }, REFRESH_MS)
    return () => window.clearInterval(t)
  }, [prefs.autoRefresh, load, pending, confirm, details])

  // Search waits for a pause in typing (the Search button applies at once).
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === draft ? f : { ...f, q: draft })), 450)
    return () => window.clearTimeout(t)
  }, [draft])

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))
  const reset = () => {
    setDraft('')
    setFilters(EMPTY)
    setSort(prefs.sort)
    onStatus('all')
  }

  // ---- selection: kept across pages, so Select all can be pressed page by page ----
  const pageSelectable = data.orders.filter(isSelectable)
  const allOnPage = pageSelectable.length > 0 && pageSelectable.every((o) => selected.has(o.id))
  const chosen = [...selected.values()]
  const toDispatch = chosen.filter(canDispatch)
  const toUndo = chosen.filter(canUndo)

  function togglePage() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (allOnPage) pageSelectable.forEach((o) => next.delete(o.id))
      else pageSelectable.forEach((o) => next.set(o.id, o))
      return next
    })
  }
  function toggleOne(order, on) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (on) next.set(order.id, order)
      else next.delete(order.id)
      return next
    })
  }

  const mark = (ids, on) => setPending((prev) => {
    const next = new Set(prev)
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
    return next
  })

  async function run(list, on) {
    const ids = list.map((o) => o.id)
    mark(ids, true)
    try {
      if (ids.length === 1) {
        await staffJson(`/api/admin/orders/${ids[0]}/dispatched`, {
          method: 'POST', body: JSON.stringify({ on, expect: list[0].status }),
        })
        say(`${list[0].orderNumber}: ${on ? 'dispatched' : 'dispatch undone'}`)
        setSelected((prev) => { const n = new Map(prev); n.delete(ids[0]); return n })
      } else {
        const r = await staffJson('/api/admin/warehouse/dispatch', { method: 'POST', body: JSON.stringify({ on, ids }) })
        const failed = r.results.filter((x) => !x.ok)
        say(
          failed.length
            ? `${r.done} ${on ? 'dispatched' : 'undone'}, ${failed.length} not changed: ${failed[0].error}`
            : `${r.done} orders ${on ? 'marked as dispatched' : 'set back to To Dispatch'}`,
          failed.length ? 'error' : 'ok'
        )
        setSelected((prev) => {
          const n = new Map()
          failed.forEach((f) => prev.has(f.id) && n.set(f.id, prev.get(f.id)))
          return n
        })
      }
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      mark(ids, false)
      setConfirm(null)
      load({ quiet: true })
    }
  }

  function askDispatch(list) {
    if (!list.length) return
    setConfirm({
      title: list.length === 1 ? `Dispatch ${list[0].orderNumber}?` : `Mark ${list.length} orders as dispatched?`,
      body: 'Stock is taken out and the customer sees "Dispatched" on Track Order. You can undo it until delivery.',
      confirmLabel: list.length === 1 ? 'Mark as dispatched' : `Dispatch ${list.length} orders`,
      onConfirm: () => run(list, true),
    })
  }
  function askUndo(list) {
    if (!list.length) return
    setConfirm({
      title: list.length === 1 ? `Undo dispatch of ${list[0].orderNumber}?` : `Undo dispatch of ${list.length} orders?`,
      body: 'The packs go back on hold and the order returns to To Dispatch. Its shipment ID stays the same.',
      confirmLabel: 'Undo dispatch',
      danger: true,
      onConfirm: () => run(list, false),
    })
  }

  async function downloadCsv() {
    try {
      const res = await staffFetch('/api/admin/warehouse/orders.csv?' + queryString(status, sort, filters))
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'warehouse-orders.csv'
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

  const total = data.tabCount || 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const firstRow = total ? (page - 1) * pageSize + 1 : 0
  const lastRow = Math.min(page * pageSize, total)

  return (
    <>
      <section className="wh-kpis" aria-label="Order counts">
        {KPIS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`wh-kpi wh-kpi--${k.tone}${status === k.key ? ' is-active' : ''}`}
            aria-pressed={status === k.key}
            onClick={() => onStatus(status === k.key ? 'all' : k.key)}
          >
            <span className="wh-kpi-icon"><Icon name={k.icon} size={26} /></span>
            <span className="wh-kpi-text">
              <strong>{data.counts[k.key] ?? 0}</strong>
              <span className="wh-kpi-label">{k.label}</span>
              <span className="wh-kpi-note">{k.note}</span>
            </span>
            <Icon name="chevronRight" size={20} className="wh-kpi-arrow" />
          </button>
        ))}
      </section>

      <section className="wh-panel wh-filters-panel" aria-label="Search and filters">
        <form
          className="wh-searchrow"
          onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, q: draft })) }}
          role="search"
        >
          <label className="wh-search">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Search orders</span>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search order ID, customer name, phone, product, or PIN code..."
            />
          </label>
          <button type="submit" className="wh-btn wh-btn--primary">Search</button>
          <button type="button" className="wh-btn wh-btn--outline wh-csv" onClick={downloadCsv} disabled={!total}>
            <Icon name="download" size={18} /> Download CSV
          </button>
        </form>

        <div className="wh-filter-row">
          <label className="wh-filter">
            <span>Order Date</span>
            <span className="wh-select wh-select--icon">
              <Icon name="calendar" size={16} />
              <select value={filters.date} onChange={set('date')}>
                <option value="">All dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
                <option value="custom">Custom range…</option>
              </select>
            </span>
          </label>
          {filters.date === 'custom' && (
            <>
              <label className="wh-filter"><span>From</span><input className="wh-input" type="date" value={filters.from} onChange={set('from')} /></label>
              <label className="wh-filter"><span>To</span><input className="wh-input" type="date" value={filters.to} onChange={set('to')} /></label>
            </>
          )}
          <label className="wh-filter">
            <span>Dispatch Status</span>
            <span className="wh-select">
              <select value={status} onChange={(e) => onStatus(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="to_dispatch">To Dispatch</option>
                <option value="dispatched">Dispatched</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled / Returned</option>
              </select>
            </span>
          </label>
          <label className="wh-filter">
            <span>Payment Status</span>
            <span className="wh-select">
              <select value={filters.payment} onChange={set('payment')}>
                <option value="">All payments</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </span>
          </label>
          <label className="wh-filter">
            <span>Pack Size</span>
            <span className="wh-select">
              <select value={filters.pack} onChange={set('pack')}>
                <option value="">All pack sizes</option>
                <option value="5">5 kg</option>
                <option value="10">10 kg</option>
                <option value="26">26 kg</option>
              </select>
            </span>
          </label>
          <label className="wh-filter">
            <span>Location / State</span>
            <span className="wh-select">
              <select value={filters.state} onChange={set('state')}>
                <option value="">All states</option>
                <option value="tn">Tamil Nadu</option>
                <option value="other">Other states</option>
              </select>
            </span>
          </label>
          <label className="wh-filter">
            <span>Sort by</span>
            <span className="wh-select">
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </span>
          </label>
          <button type="button" className="wh-btn wh-btn--outline wh-reset" onClick={reset}>
            <Icon name="reset" size={17} /> Reset
          </button>
        </div>
      </section>

      <section className="wh-panel wh-table-panel" aria-label="Orders" aria-busy={loading}>
        <header className="wh-table-head">
          <h2>Total Orders: {total}</h2>
          <div className="wh-table-tools">
            <label className="wh-selectall">
              <input type="checkbox" checked={allOnPage} onChange={togglePage} disabled={!pageSelectable.length} />
              Select all ({selected.size})
            </label>
            <button
              type="button"
              className="wh-btn wh-btn--soft"
              disabled={!toDispatch.length}
              onClick={() => askDispatch(toDispatch)}
            >
              <Icon name="truck" size={18} /> Mark as Dispatched{toDispatch.length ? ` (${toDispatch.length})` : ''}
            </button>
            <div className="wh-split">
              <button
                type="button"
                className="wh-btn wh-btn--outline"
                onClick={() => printSlips((chosen.length ? chosen : data.orders).map((o) => o.id), say)}
                disabled={!data.orders.length}
              >
                <Icon name="print" size={18} /> Print Slips{chosen.length ? ` (${chosen.length})` : ''}
              </button>
              <button
                type="button"
                className="wh-btn wh-btn--outline wh-split-arrow"
                aria-label="More bulk actions"
                aria-expanded={printMenu}
                onClick={() => setPrintMenu((v) => !v)}
              >
                <Icon name="chevron" size={16} />
              </button>
              {printMenu && (
                <div className="wh-menu wh-menu--right" role="menu" onMouseLeave={() => setPrintMenu(false)}>
                  <button type="button" role="menuitem" disabled={!chosen.length}
                    onClick={() => { setPrintMenu(false); printSlips(chosen.map((o) => o.id), say) }}>
                    <Icon name="print" size={16} /> Print selected ({chosen.length})
                  </button>
                  <button type="button" role="menuitem" disabled={!data.orders.length}
                    onClick={() => { setPrintMenu(false); printSlips(data.orders.map((o) => o.id), say) }}>
                    <Icon name="print" size={16} /> Print all on this page ({data.orders.length})
                  </button>
                  <button type="button" role="menuitem" className="is-danger" disabled={!toUndo.length}
                    onClick={() => { setPrintMenu(false); askUndo(toUndo) }}>
                    <Icon name="undo" size={16} /> Undo dispatch of selected ({toUndo.length})
                  </button>
                  <button type="button" role="menuitem" disabled={!selected.size}
                    onClick={() => { setPrintMenu(false); setSelected(new Map()) }}>
                    <Icon name="x" size={16} /> Clear selection
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={`wh-table wh-table--orders${money ? ' has-money' : ''}`} role="table" aria-label="Orders">
          <div className="wh-tr wh-th" role="row">
            <span role="columnheader" className="visually-hidden">Select</span>
            <span role="columnheader">Order ID</span>
            <span role="columnheader">Date &amp; Time</span>
            <span role="columnheader">Products</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Delivery Address</span>
            {money && <span role="columnheader">Amount</span>}
            <span role="columnheader">Payment</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Actions</span>
          </div>

          {data.orders.map((o, i) => {
            const d = dayLabel(o.placedAt)
            const busy = pending.has(o.id)
            const a = o.address
            const locked = !canDispatch(o) && !canUndo(o)
            return (
              <div key={o.id} className={`wh-tr${selected.has(o.id) ? ' is-selected' : ''}`} role="row">
                <span role="cell" className="wh-td-pick">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    disabled={!isSelectable(o)}
                    onChange={(e) => toggleOne(o, e.target.checked)}
                    aria-label={'Select ' + o.orderNumber}
                  />
                </span>
                <span role="cell" className="wh-td-order">
                  <strong>ORDER #{(page - 1) * pageSize + i + 1}</strong>
                  <span className="wh-mono wh-muted">{o.orderNumber}</span>
                  {o.needsAttention && <span className="wh-badge wh-badge--flag" title={o.needsAttention}>Flagged</span>}
                </span>
                <span role="cell" className="wh-td-date">
                  <strong className={d.recent ? 'is-recent' : ''}>{d.text}</strong>
                  <span className="wh-muted">{timeLabel(o.placedAt)}</span>
                </span>
                <span role="cell" className="wh-td-products"><ProductCell items={o.items} /></span>
                <span role="cell" className="wh-td-customer">
                  <strong>{o.customer.name}</strong>
                  <a className="wh-phone" href={telHref(o.customer.phone)}>{o.customer.phone}</a>
                </span>
                <span role="cell" className="wh-td-address">
                  <Icon name="pin" size={15} className="wh-pin" />
                  <span>
                    {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
                    {a.city}, {a.state} - {a.pincode}
                  </span>
                </span>
                {money && (
                  <span role="cell" className="wh-td-amount">
                    <strong>₹{Number(o.total).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                  </span>
                )}
                <span role="cell" className="wh-td-payment">
                  <span className={`wh-badge wh-badge--pay-${o.paymentStatus}`}>{PAYMENT[o.paymentStatus] || o.paymentStatus}</span>
                  <span className="wh-muted wh-small">{STATUS[o.status]}</span>
                </span>
                <span role="cell" className="wh-td-status">
                  <span className={`wh-status wh-status--${STATUS_KEY[o.status]}`}>{STATUS[o.status]}</span>
                </span>
                <span role="cell" className="wh-td-actions">
                  <button
                    type="button"
                    className={`wh-icon-btn wh-icon-btn--primary${canUndo(o) ? ' is-done' : ''}`}
                    disabled={locked || busy}
                    title={canDispatch(o) ? 'Mark as dispatched' : canUndo(o) ? 'Dispatched (open menu to undo)' : o.needsAttention ? 'Flagged: ask sales or the owner' : STATUS[o.status]}
                    aria-label={canDispatch(o) ? `Mark ${o.orderNumber} as dispatched` : `${o.orderNumber} is ${STATUS[o.status]}`}
                    onClick={() => (canDispatch(o) ? askDispatch([o]) : canUndo(o) ? askUndo([o]) : null)}
                  >
                    <Icon name={canUndo(o) ? 'check' : 'truck'} size={18} />
                  </button>
                  <button type="button" className="wh-icon-btn" title="Print packing slip" aria-label={`Print slip for ${o.orderNumber}`}
                    onClick={() => printSlips([o.id], say)}>
                    <Icon name="print" size={18} />
                  </button>
                  <span className="wh-menu-wrap">
                    <button type="button" className="wh-icon-btn" aria-label={`More for ${o.orderNumber}`} aria-expanded={menuFor === o.id}
                      onClick={() => setMenuFor(menuFor === o.id ? null : o.id)}>
                      <Icon name="more" size={18} />
                    </button>
                    {menuFor === o.id && (
                      <RowMenu order={o} say={say} onView={setDetails} onUndo={(x) => askUndo([x])} onClose={() => setMenuFor(null)} />
                    )}
                  </span>
                </span>
              </div>
            )
          })}

          {!loading && !data.orders.length && <p className="wh-empty">No orders match these filters.</p>}
        </div>

        <Pagination page={page} pages={pages} total={total} from={firstRow} to={lastRow} onPage={setPage} />
      </section>

      {confirm && (
        <Confirm {...confirm} busy={pending.size > 0} onCancel={() => setConfirm(null)} />
      )}
      {details && <Details order={details} onClose={() => setDetails(null)} />}
    </>
  )
}
