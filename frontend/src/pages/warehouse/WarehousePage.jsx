import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import {
  canUseLocalSignIn, hasStaffToken, signInLocal, signOutStaff, staffFetch, staffJson,
} from '../../services/staffAuth.js'
import './warehouse.css'

// Status tabs. Keys match TABS in backend/lib/sales/warehouse.js.
const TABS = [
  { key: 'to_dispatch', label: 'To dispatch' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]

const PAYMENT = { paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Part refunded' }
const STATUS = {
  placed: 'To dispatch', confirmed: 'To dispatch', packed: 'To dispatch', shipped: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
}
// Orders the switch (and the bulk bar) can still change.
const NOT_DISPATCHED = ['placed', 'confirmed', 'packed']
const isSelectable = (o) => (NOT_DISPATCHED.includes(o.status) && !o.needsAttention) || o.status === 'shipped'

const ALLOWED_ROLES = ['owner', 'admin', 'sales', 'dispatch', 'inventory', 'warehouse']
const PAGE = 20
const REFRESH_MS = 30000
const EMPTY_FILTERS = { q: '', payment: '', pack: '', date: '', from: '', to: '', state: '', sort: 'oldest' }

/** YYYY-MM-DD for a day offset from today, in India. */
function istDay(offset = 0) {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function dateRange(f) {
  if (f.date === 'today') return { from: istDay(0), to: istDay(0) }
  if (f.date === 'yesterday') return { from: istDay(-1), to: istDay(-1) }
  if (f.date === '7days') return { from: istDay(-6), to: istDay(0) }
  if (f.date === 'custom') return { from: f.from, to: f.to }
  return { from: '', to: '' }
}

function queryString(tab, f) {
  const p = new URLSearchParams({ tab, sort: f.sort })
  const { from, to } = dateRange(f)
  for (const [k, v] of Object.entries({ q: f.q.trim(), payment: f.payment, pack: f.pack, state: f.state, from, to })) {
    if (v) p.set(k, v)
  }
  return p.toString()
}

// Order date, India time: "Today" / "Yesterday" for recent orders (what the
// floor actually asks), the full date otherwise.
function dayLabel(iso) {
  if (!iso) return ''
  const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  if (day === istDay(0)) return 'Today'
  if (day === istDay(-1)) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

const timeLabel = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''

/* -------------------------------------------------------------------------- */

function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const me = await signInLocal(email)
      if (!ALLOWED_ROLES.includes(me.role)) {
        signOutStaff()
        throw new Error('Your role does not include the warehouse page.')
      }
      onSignedIn(me)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="wh-signin">
      <div className="wh-signin-card">
        <img src="/assets/shop/logo.png" alt="" width="64" height="64" />
        <h1>Warehouse</h1>
        <p className="wh-muted">Chennai Rice Industries · staff only</p>
        {canUseLocalSignIn ? (
          <form onSubmit={submit}>
            <label className="wh-field">
              <span>Staff email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="warehouse@chennairiceindustries.com"
                autoComplete="username"
                required
              />
            </label>
            <button className="wh-btn wh-btn--primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="wh-note">Local test sign-in. The live site will use Google sign-in.</p>
          </form>
        ) : (
          <p className="wh-note">Staff sign-in is being set up. Please contact the owner for access.</p>
        )}
        {error && <p className="wh-error" role="alert">{error}</p>}
      </div>
    </main>
  )
}

/** Accessible on/off switch. */
function Switch({ label, on, disabled, busy, reason, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`wh-switch${on ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      disabled={disabled || busy}
      title={reason || ''}
      onClick={() => onChange(!on)}
    >
      <span className="wh-switch-track" aria-hidden="true">
        <span className="wh-switch-knob" />
      </span>
      <span className="wh-switch-label">{label}</span>
    </button>
  )
}

function OrderRow({ order, selected, onSelect, pending, onDispatch, onPrint }) {
  const s = order.status
  const dispatched = ['shipped', 'delivered'].includes(s)
  const locked = ['delivered', 'cancelled', 'returned'].includes(s)
  const flagged = NOT_DISPATCHED.includes(s) && Boolean(order.needsAttention)
  const reason = locked
    ? s === 'delivered' ? 'Already delivered' : 'Order ' + s
    : flagged ? 'Flagged — ask sales or the owner' : ''
  const a = order.address
  const tel = order.customer.phone.replace(/[^\d+]/g, '')
  const selectable = isSelectable(order)

  return (
    <article className={`wh-row wh-row--${s}${selected ? ' is-selected' : ''}`}>
      <div className="wh-cell wh-cell--pick">
        <input
          type="checkbox"
          className="wh-check"
          checked={selected}
          disabled={!selectable}
          onChange={(e) => onSelect(order.id, e.target.checked)}
          aria-label={'Select ' + order.orderNumber}
        />
      </div>

      <div className="wh-cell wh-cell--order">
        <span className="wh-k">Order ID</span>
        <strong className="wh-mono">{order.orderNumber}</strong>
        <span className="wh-when" title="Order placed">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="wh-when-text">
            <strong>{dayLabel(order.placedAt)}</strong>
            <span>{timeLabel(order.placedAt)}</span>
          </span>
        </span>
        {order.needsAttention && <span className="wh-badge wh-badge--flag" title={order.needsAttention}>Flagged</span>}
      </div>

      <div className="wh-cell wh-cell--items">
        <span className="wh-k">Products</span>
        <ul>
          {order.items.map((i) => (
            <li key={i.sku}>
              <strong>{i.qty} ×</strong> {i.name} <span className="wh-muted">({Number(i.packKg)} kg)</span>
            </li>
          ))}
        </ul>
        <span className="wh-muted wh-small">
          {order.packs} {order.packs === 1 ? 'pack' : 'packs'} · {order.totalKg} kg
        </span>
      </div>

      <div className="wh-cell wh-cell--customer">
        <span className="wh-k">Customer</span>
        <strong>{order.customer.name}</strong>
        <a className="wh-phone" href={'tel:' + tel}>{order.customer.phone}</a>
      </div>

      <div className="wh-cell wh-cell--address">
        <span className="wh-k">Deliver to</span>
        <address>
          {a.line1}
          {a.line2 && <>, {a.line2}</>}
          {a.landmark && <><br /><span className="wh-muted">Landmark: {a.landmark}</span></>}
          <br />
          {a.city}, {a.state} – <strong>{a.pincode}</strong>
        </address>
      </div>

      <div className="wh-cell wh-cell--payment">
        <span className="wh-k">Payment</span>
        <span className={`wh-badge wh-badge--pay-${order.paymentStatus}`}>
          {PAYMENT[order.paymentStatus] || order.paymentStatus}
        </span>
        <span className={`wh-status wh-status--${s}`}>{STATUS[s] || s}</span>
      </div>

      <div className="wh-cell wh-cell--actions">
        <Switch
          label="Dispatched"
          on={dispatched}
          disabled={locked || flagged}
          busy={pending.has(order.id)}
          reason={reason}
          onChange={(on) => onDispatch(order, on)}
        />
        <button type="button" className="wh-btn wh-btn--ghost wh-btn--small" onClick={() => onPrint(order)}>
          Print slip
        </button>
      </div>
    </article>
  )
}

/* -------------------------------------------------------------------------- */

export default function WarehousePage() {
  usePageMeta('Warehouse — Chennai Rice Industries', 'Staff only.')
  const [me, setMe] = useState(null)
  const [checking, setChecking] = useState(hasStaffToken())
  const [tab, setTab] = useState('to_dispatch')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState([])
  const [counts, setCounts] = useState({})
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [pending, setPending] = useState(() => new Set())
  const [selected, setSelected] = useState(() => new Set())
  const [confirming, setConfirming] = useState(null) // 'on' | 'off' while the bulk button awaits a second tap
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const requestId = useRef(0)
  const sentinel = useRef(null)
  const ordersRef = useRef(orders)
  ordersRef.current = orders

  const qs = useMemo(() => queryString(tab, filters), [tab, filters])

  const say = useCallback((text, kind = 'ok') => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, kind })
    toastTimer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const handleAuthError = useCallback((err) => {
    if (err.status === 401) {
      setMe(null)
      return true
    }
    return false
  }, [])

  // Already signed in this tab? Check the token is still good.
  useEffect(() => {
    if (!hasStaffToken()) return
    staffJson('/api/admin/me')
      .then((profile) => setMe(ALLOWED_ROLES.includes(profile.role) ? profile : null))
      .catch(() => signOutStaff())
      .finally(() => setChecking(false))
  }, [])

  /**
   * reset: first page for a new tab / filter (clears the selection).
   * refresh: reload everything already on screen, in place (auto-refresh and
   * after a change), so scrolling position and selection survive.
   */
  const load = useCallback(
    async ({ mode = 'reset' } = {}) => {
      const id = ++requestId.current
      if (mode === 'reset') {
        setLoading(true)
        setSelected(new Set())
        setConfirming(null)
      }
      const limit = mode === 'refresh' ? Math.min(Math.max(ordersRef.current.length, PAGE), 500) : PAGE
      try {
        const result = await staffJson(`/api/admin/warehouse/orders?${qs}&limit=${limit}&offset=0`)
        if (id !== requestId.current) return // a newer request has taken over
        setOrders(result.orders)
        setCounts(result.counts)
        setHasMore(result.hasMore)
        setUpdatedAt(new Date())
        // Drop selections for orders that have left this list.
        if (mode === 'refresh') {
          const still = new Set(result.orders.filter(isSelectable).map((o) => o.id))
          setSelected((prev) => new Set([...prev].filter((x) => still.has(x))))
        }
      } catch (err) {
        if (!handleAuthError(err)) say(err.message, 'error')
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [qs, handleAuthError, say]
  )

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const id = requestId.current
    setLoadingMore(true)
    try {
      const result = await staffJson(`/api/admin/warehouse/orders?${qs}&limit=${PAGE}&offset=${ordersRef.current.length}`)
      if (id !== requestId.current) return
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id))
        return [...prev, ...result.orders.filter((o) => !seen.has(o.id))]
      })
      setCounts(result.counts)
      setHasMore(result.hasMore)
    } catch (err) {
      if (!handleAuthError(err)) say(err.message, 'error')
    } finally {
      setLoadingMore(false)
    }
  }, [qs, hasMore, loadingMore, handleAuthError, say])

  useEffect(() => {
    if (me) load({ mode: 'reset' })
  }, [me, load])

  // The next page loads as the bottom of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return undefined
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    }, { rootMargin: '300px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadMore])

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 300)
    return () => window.clearTimeout(t)
  }, [search])

  // New paid orders appear by themselves; skipped while saving or in the background.
  useEffect(() => {
    if (!me) return undefined
    const t = window.setInterval(() => {
      if (!pending.size && document.visibilityState === 'visible') load({ mode: 'refresh' })
    }, REFRESH_MS)
    return () => window.clearInterval(t)
  }, [me, load, pending])

  const markPending = (ids, on) =>
    setPending((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })

  async function dispatchOne(order, on) {
    markPending([order.id], true)
    try {
      await staffJson(`/api/admin/orders/${order.id}/dispatched`, {
        method: 'POST',
        body: JSON.stringify({ on, expect: order.status }),
      })
      say(`${order.orderNumber}: ${on ? 'Dispatched' : 'Dispatch undone'}`)
    } catch (err) {
      if (!handleAuthError(err)) say(err.message, 'error')
    } finally {
      markPending([order.id], false)
      load({ mode: 'refresh' })
    }
  }

  // ---- selection ----
  const selectable = orders.filter(isSelectable)
  const selectedOrders = orders.filter((o) => selected.has(o.id))
  const toDispatch = selectedOrders.filter((o) => NOT_DISPATCHED.includes(o.status))
  const toUndo = selectedOrders.filter((o) => o.status === 'shipped')
  const newlyLoaded = selectable.filter((o) => !selected.has(o.id)).length

  function selectOne(id, on) {
    setConfirming(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // Adds every card loaded so far. After scrolling loads more, pressing it
  // again adds the new ones too.
  function selectAllLoaded() {
    setConfirming(null)
    setSelected((prev) => new Set([...prev, ...selectable.map((o) => o.id)]))
  }

  function clearSelection() {
    setConfirming(null)
    setSelected(new Set())
  }

  async function bulk(on) {
    const list = on ? toDispatch : toUndo
    if (!list.length) return
    // First tap arms, second tap acts: a whole page of orders is too much to
    // change by a stray touch.
    if (confirming !== (on ? 'on' : 'off')) {
      setConfirming(on ? 'on' : 'off')
      return
    }
    setConfirming(null)
    const ids = list.map((o) => o.id)
    markPending(ids, true)
    try {
      const result = await staffJson('/api/admin/warehouse/dispatch', {
        method: 'POST',
        body: JSON.stringify({ on, ids }),
      })
      const failed = result.results.filter((r) => !r.ok)
      if (failed.length) {
        say(`${result.done} ${on ? 'dispatched' : 'undone'}, ${failed.length} not changed: ${failed[0].error}`, 'error')
      } else {
        say(`${result.done} ${result.done === 1 ? 'order' : 'orders'} ${on ? 'marked dispatched' : 'set back to not dispatched'}`)
      }
      setSelected(new Set(failed.map((f) => f.id)))
    } catch (err) {
      if (!handleAuthError(err)) say(err.message, 'error')
    } finally {
      markPending(ids, false)
      load({ mode: 'refresh' })
    }
  }

  async function downloadCsv() {
    try {
      const res = await staffFetch('/api/admin/warehouse/orders.csv?' + qs)
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'warehouse-orders.csv'
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      if (!handleAuthError(err)) say(err.message, 'error')
    }
  }

  async function printSlip(order) {
    // Opened before the request so the browser treats it as the click's
    // own window rather than a pop-up.
    const win = window.open('', '_blank')
    if (!win) return say('Allow pop-ups for this site to print slips.', 'error')
    try {
      const html = await (await staffFetch(`/api/admin/orders/${order.id}/packing-slip`)).text()
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      window.setTimeout(() => win.print(), 300)
    } catch (err) {
      win.close()
      if (!handleAuthError(err)) say(err.message, 'error')
    }
  }

  const setFilter = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value }))
  const filtersActive =
    search || Object.entries(filters).some(([k, v]) => k !== 'q' && k !== 'sort' && v) || filters.sort !== 'oldest'

  function clearFilters() {
    setSearch('')
    setFilters(EMPTY_FILTERS)
  }

  if (checking) return <main className="wh-signin"><p className="wh-muted">Loading…</p></main>
  if (!me) return <SignIn onSignedIn={setMe} />

  const tabTotal = counts[tab] ?? 0

  return (
    <div className="wh">
      <header className="wh-top">
        <div className="wh-top-brand">
          <img src="/assets/shop/logo.png" alt="" width="40" height="40" />
          <div>
            <strong>Warehouse</strong>
            <span>Nasiyanur mill · Chennai Rice</span>
          </div>
        </div>
        <div className="wh-top-user">
          <span className="wh-small">
            {me.fullName} · <span className="wh-role">{me.role}</span>
          </span>
          <button
            type="button"
            className="wh-btn wh-btn--light wh-btn--small"
            onClick={() => {
              signOutStaff()
              setMe(null)
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="wh-main">
        <nav className="wh-tabs" aria-label="Order status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`wh-tab${tab === t.key ? ' is-active' : ''}`}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="wh-tab-count">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </nav>

        <section className="wh-toolbar" aria-label="Search and filters">
          <label className="wh-search">
            <span className="visually-hidden">Search</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order / shipment ID, name, phone, product, city or PIN"
            />
          </label>

          <div className="wh-filters">
            <select value={filters.payment} onChange={setFilter('payment')} aria-label="Payment">
              <option value="">All payments</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
            </select>
            <select value={filters.pack} onChange={setFilter('pack')} aria-label="Pack size">
              <option value="">All pack sizes</option>
              <option value="5">5 kg</option>
              <option value="10">10 kg</option>
              <option value="26">26 kg</option>
            </select>
            <select value={filters.date} onChange={setFilter('date')} aria-label="Date">
              <option value="">Any date</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 days</option>
              <option value="custom">Custom…</option>
            </select>
            {filters.date === 'custom' && (
              <>
                <input type="date" value={filters.from} onChange={setFilter('from')} aria-label="From date" />
                <input type="date" value={filters.to} onChange={setFilter('to')} aria-label="To date" />
              </>
            )}
            <select value={filters.state} onChange={setFilter('state')} aria-label="State">
              <option value="">All states</option>
              <option value="tn">Tamil Nadu</option>
              <option value="other">Other states</option>
            </select>
            <select value={filters.sort} onChange={setFilter('sort')} aria-label="Sort">
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
            {filtersActive && (
              <button type="button" className="wh-btn wh-btn--ghost wh-btn--small" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          <div className="wh-toolbar-end">
            <span className="wh-muted wh-small" aria-live="polite">
              {loading ? 'Updating…' : updatedAt ? 'Updated ' + updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            <button type="button" className="wh-btn wh-btn--ghost wh-btn--small" onClick={() => load({ mode: 'refresh' })}>
              Refresh
            </button>
            <button type="button" className="wh-btn wh-btn--primary wh-btn--small" onClick={downloadCsv} disabled={!orders.length}>
              Download CSV
            </button>
          </div>
        </section>

        {/* Selection bar: stays in view while scrolling. */}
        <section className={`wh-bulk${selected.size ? ' has-selection' : ''}`} aria-label="Selection">
          <button
            type="button"
            className="wh-btn wh-btn--ghost wh-btn--small"
            onClick={selectAllLoaded}
            disabled={!newlyLoaded}
          >
            {selected.size && newlyLoaded
              ? `Select all (+${newlyLoaded} new)`
              : selected.size
                ? 'All loaded selected'
                : `Select all (${selectable.length})`}
          </button>
          <span className="wh-bulk-count" aria-live="polite">
            {selected.size ? `${selected.size} selected` : `Showing ${orders.length} of ${tabTotal}`}
          </span>
          {selected.size > 0 && (
            <>
              {toDispatch.length > 0 && (
                <button
                  type="button"
                  className={`wh-btn wh-btn--small ${confirming === 'on' ? 'wh-btn--danger' : 'wh-btn--primary'}`}
                  onClick={() => bulk(true)}
                >
                  {confirming === 'on' ? `Tap again to dispatch ${toDispatch.length}` : `Mark dispatched (${toDispatch.length})`}
                </button>
              )}
              {toUndo.length > 0 && (
                <button
                  type="button"
                  className={`wh-btn wh-btn--small ${confirming === 'off' ? 'wh-btn--danger' : 'wh-btn--ghost'}`}
                  onClick={() => bulk(false)}
                >
                  {confirming === 'off' ? `Tap again to undo ${toUndo.length}` : `Undo dispatched (${toUndo.length})`}
                </button>
              )}
              <button type="button" className="wh-btn wh-btn--link wh-btn--small" onClick={clearSelection}>
                Clear
              </button>
            </>
          )}
        </section>

        <section className="wh-list" aria-label="Orders" aria-busy={loading}>
          <div className="wh-head" aria-hidden="true">
            <span />
            <span>Order</span>
            <span>Products &amp; quantity</span>
            <span>Customer</span>
            <span>Delivery address</span>
            <span>Payment</span>
            <span>Status</span>
          </div>
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              selected={selected.has(order.id)}
              onSelect={selectOne}
              pending={pending}
              onDispatch={dispatchOne}
              onPrint={printSlip}
            />
          ))}
          {!loading && orders.length === 0 && (
            <p className="wh-empty">{filtersActive ? 'No orders match these filters.' : 'Nothing here right now.'}</p>
          )}
          <div ref={sentinel} className="wh-sentinel" aria-hidden="true" />
          {hasMore && (
            <button type="button" className="wh-btn wh-btn--ghost wh-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading more…' : 'Load more'}
            </button>
          )}
          {!hasMore && orders.length > 0 && <p className="wh-end wh-muted wh-small">All {orders.length} shown</p>}
        </section>
      </main>

      {toast && (
        <div className={`wh-toast wh-toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
