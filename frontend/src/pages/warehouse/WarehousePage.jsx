import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import {
  canUseGoogleSignIn, canUseLocalSignIn, hasStaffSession, signInLocal, signInWithGoogle, signOutStaff, staffJson,
} from '../../services/staffAuth.js'
import { Icon, dayLabel, readPrefs, timeLabel } from './shared.jsx'
import OrdersView from './OrdersView.jsx'
import DashboardView from './DashboardView.jsx'
import DispatchView from './DispatchView.jsx'
import DeliveriesView from './DeliveriesView.jsx'
import IssuesView from './IssuesView.jsx'
import InventoryView from './InventoryView.jsx'
import TrackerView from './TrackerView.jsx'
import { CustomersView, ReportsView, SettingsView } from './OtherViews.jsx'
import './warehouse.css'
import './warehouse-pages.css'

const ALLOWED_ROLES = ['owner', 'admin', 'sales', 'dispatch', 'inventory', 'warehouse']

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'reports' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'dispatch', label: 'Dispatch', icon: 'truck' },
  { id: 'deliveries', label: 'Deliveries', icon: 'delivered' },
  { id: 'tracker', label: 'Tracker Upload', icon: 'download' },
  { id: 'returns', label: 'Returns & Issues', icon: 'returns' },
  { id: 'inventory', label: 'Products & Inventory', icon: 'box' },
  { divider: true },
  { id: 'customers', label: 'Customers', icon: 'users' },
  { id: 'reports', label: 'Reports', icon: 'calendar' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]
const TITLES = {
  dashboard: 'Dashboard', orders: 'Orders', dispatch: 'Dispatch', deliveries: 'Deliveries', tracker: 'Tracker Upload', returns: 'Returns & Issues',
  inventory: 'Products & Inventory', customers: 'Customers', reports: 'Reports', settings: 'Settings',
}
// Letters only, so "Owner (local)" gives "OL", not "O(".
const initials = (name) =>
  String(name || '?').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
const ROLE_LABEL = {
  owner: 'Owner', admin: 'Warehouse Admin', warehouse: 'Warehouse staff', sales: 'Sales', dispatch: 'Dispatch', inventory: 'Inventory',
}
const SEEN_KEY = 'cr.wh.lastSeenOrder'

function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(signIn) {
    setBusy(true)
    setError('')
    try {
      const me = await signIn()
      if (!ALLOWED_ROLES.includes(me.role)) {
        await signOutStaff()
        throw new Error('Your role does not include the warehouse page.')
      }
      onSignedIn(me)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const submit = (event) => {
    event.preventDefault()
    run(() => signInLocal(email))
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
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="warehouse@chennairiceindustries.com" autoComplete="username" required />
            </label>
            <button className="wh-btn wh-btn--primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <p className="wh-note">Local test sign-in. The live site will use Google sign-in.</p>
          </form>
        ) : canUseGoogleSignIn ? (
          <>
            <button className="wh-btn wh-btn--google" type="button" disabled={busy} onClick={() => run(signInWithGoogle)}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {busy ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <p className="wh-note">Use your Chennai Rice Google account. Ask the owner to add you to the team first.</p>
          </>
        ) : (
          <p className="wh-note">Staff sign-in is being set up. Please contact the owner for access.</p>
        )}
        {error && <p className="wh-error" role="alert">{error}</p>}
      </div>
    </main>
  )
}

/** Bell: paid orders waiting for dispatch, newest first; a dot for ones not yet seen. */
function Bell({ onOpenOrder, onAuthError }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN_KEY) || '' } catch { return '' } })
  const ref = useRef(null)

  const load = useCallback(() => {
    staffJson('/api/admin/warehouse/orders?tab=to_dispatch&sort=newest&limit=6')
      .then((r) => setItems(r.orders))
      .catch((err) => onAuthError(err))
  }, [onAuthError])
  useEffect(() => {
    load()
    const t = window.setInterval(load, 60000)
    return () => window.clearInterval(t)
  }, [load])
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const unseen = items.filter((o) => !seen || o.placedAt > seen).length
  function toggle() {
    setOpen((v) => !v)
    if (items[0]) {
      setSeen(items[0].placedAt)
      try { localStorage.setItem(SEEN_KEY, items[0].placedAt) } catch { /* fine */ }
    }
  }

  return (
    <div className="wh-bell" ref={ref}>
      <button type="button" className="wh-top-icon" onClick={toggle} aria-expanded={open}
        aria-label={unseen ? `${unseen} new orders to dispatch` : 'Notifications'}>
        <Icon name="bell" size={22} />
        {unseen > 0 && <span className="wh-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="wh-menu wh-menu--right wh-bell-menu" role="menu">
          <p className="wh-menu-title">Waiting for dispatch</p>
          {items.length ? items.map((o) => {
            const d = dayLabel(o.placedAt)
            return (
              <button key={o.id} type="button" role="menuitem" onClick={() => { setOpen(false); onOpenOrder(o.orderNumber) }}>
                <Icon name="truck" size={16} />
                <span><strong>{o.orderNumber}</strong><br /><span className="wh-muted wh-small">{o.customer.name} · {d.text} {timeLabel(o.placedAt)}</span></span>
              </button>
            )
          }) : <p className="wh-muted wh-small wh-menu-empty">Nothing waiting. All caught up.</p>}
        </div>
      )}
    </div>
  )
}

function UserMenu({ me, onSettings, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  return (
    <div className="wh-user" ref={ref}>
      <button type="button" className="wh-user-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="wh-user-avatar" aria-hidden="true">{initials(me.fullName)}</span>
        <span className="wh-user-text"><strong>{me.fullName}</strong><span>{ROLE_LABEL[me.role] || me.role}</span></span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="wh-menu wh-menu--right" role="menu">
          <p className="wh-menu-title">{me.email}</p>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSettings() }}><Icon name="settings" size={16} /> Settings</button>
          <button type="button" role="menuitem" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

export default function WarehousePage() {
  usePageMeta('Warehouse — Chennai Rice Industries', 'Staff only.')
  const [params, setParams] = useSearchParams()
  const [me, setMe] = useState(null)
  const [checking, setChecking] = useState(true)
  const [prefs, setPrefs] = useState(readPrefs)
  const [toast, setToast] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const [locations, setLocations] = useState([])
  const [focusQuery, setFocusQuery] = useState(null)
  const toastTimer = useRef(null)

  const view = TITLES[params.get('view')] ? params.get('view') : 'dashboard'
  // The sub-view: the status filter on Orders, the tab on Deliveries/Inventory.
  const sub = params.get('tab') || ''
  const status = view === 'orders' ? sub || 'all' : 'all'
  const [topSearch, setTopSearch] = useState('')

  const go = useCallback((nextView, nextSub) => {
    const p = new URLSearchParams()
    p.set('view', nextView)
    if (nextSub && nextSub !== 'all') p.set('tab', nextSub)
    setParams(p)
    setDrawer(false)
  }, [setParams])

  const say = useCallback((text, kind = 'ok') => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, kind })
    toastTimer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const onAuthError = useCallback((err) => {
    if (err?.status === 401) {
      setMe(null)
      return true
    }
    return false
  }, [])

  const signOut = useCallback(() => {
    signOutStaff()
    setMe(null)
  }, [])

  useEffect(() => {
    let live = true
    hasStaffSession()
      .then((signedIn) => signedIn && staffJson('/api/admin/me')
        .then((profile) => live && setMe(ALLOWED_ROLES.includes(profile.role) ? profile : null)))
      .catch(() => signOutStaff())
      .finally(() => live && setChecking(false))
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!me) return
    staffJson('/api/admin/locations').then((r) => setLocations(r.locations)).catch(onAuthError)
  }, [me, onAuthError])

  // Close the phone menu with Escape.
  useEffect(() => {
    if (!drawer) return undefined
    const esc = (e) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [drawer])

  if (checking) return <main className="wh-signin"><p className="wh-muted">Loading…</p></main>
  if (!me) return <SignIn onSignedIn={setMe} />

  const fulfilment = locations.find((l) => l.is_fulfilment)
  const activeNav = view
  const money = me.permissions?.includes('money.view')
  const openOrders = (q) => {
    go('orders', 'all')
    setFocusQuery({ q, at: Date.now() })
  }

  return (
    <div className={`wh-app${drawer ? ' has-drawer' : ''}`}>
      <aside className="wh-side" aria-label="Warehouse menu">
        <div className="wh-side-brand">
          <img src="/assets/shop/logo.png" alt="" width="44" height="44" />
          <div>
            <strong>Warehouse</strong>
            <span>Nasiyanur mill · Chennai Rice</span>
          </div>
        </div>
        <nav className="wh-side-nav">
          {NAV.map((n, i) =>
            n.divider ? (
              <span key={'d' + i} className="wh-side-divider" aria-hidden="true" />
            ) : (
              <button
                key={n.id}
                type="button"
                className={`wh-side-link${activeNav === n.id ? ' is-active' : ''}`}
                aria-current={activeNav === n.id ? 'page' : undefined}
                onClick={() => go(n.id)}
              >
                <Icon name={n.icon} size={21} />
                {n.label}
              </button>
            )
          )}
        </nav>
      </aside>
      <button type="button" className="wh-scrim" aria-label="Close menu" onClick={() => setDrawer(false)} tabIndex={drawer ? 0 : -1} />

      <div className="wh-body">
        <header className="wh-topbar">
          <button type="button" className="wh-top-icon wh-hamburger" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Icon name="menu" size={22} />
          </button>
          <label className="wh-location">
            <Icon name="building" size={20} />
            <span className="visually-hidden">Warehouse location</span>
            <select value={fulfilment?.id || ''} onChange={() => {}} aria-label="Warehouse location">
              {fulfilment ? <option value={fulfilment.id}>{fulfilment.name}</option> : <option value="">Warehouse (Local)</option>}
            </select>
            <Icon name="chevron" size={16} />
          </label>
          <h1 className="wh-view-title">{TITLES[view]}</h1>
          {/* Search from anywhere: opens Orders filtered by what was typed. */}
          <form
            className="wh-top-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (topSearch.trim()) openOrders(topSearch.trim())
            }}
          >
            <Icon name="search" size={17} />
            <span className="visually-hidden">Search orders</span>
            <input type="search" value={topSearch} onChange={(e) => setTopSearch(e.target.value)} placeholder="Search order, customer…" />
          </form>
          <div className="wh-top-right">
            <Bell onOpenOrder={openOrders} onAuthError={onAuthError} />
            <UserMenu me={me} onSettings={() => go('settings')} onSignOut={signOut} say={say} onAuthError={onAuthError} />
            <button type="button" className="wh-btn wh-btn--signout" onClick={signOut}>
              <Icon name="logout" size={18} /> <span>Sign out</span>
            </button>
          </div>
        </header>

        <main className="wh-content">
          {view === 'dashboard' && <DashboardView say={say} onAuthError={onAuthError} go={go} money={money} />}
          {view === 'orders' && (
            <OrdersView
              status={status}
              onStatus={(s) => go('orders', s)}
              prefs={prefs}
              say={say}
              onAuthError={onAuthError}
              focusQuery={focusQuery}
              money={money}
            />
          )}
          {view === 'dispatch' && <DispatchView say={say} onAuthError={onAuthError} />}
          {view === 'deliveries' && <DeliveriesView say={say} onAuthError={onAuthError} initialTab={sub || undefined} />}
          {view === 'tracker' && <TrackerView say={say} onAuthError={onAuthError} />}
          {view === 'returns' && <IssuesView say={say} onAuthError={onAuthError} />}
          {view === 'inventory' && (
            <InventoryView say={say} onAuthError={onAuthError} permissions={me.permissions || []} initialTab={sub || undefined} />
          )}
          {view === 'customers' && <CustomersView say={say} onAuthError={onAuthError} onOpenOrders={openOrders} />}
          {view === 'reports' && <ReportsView say={say} onAuthError={onAuthError} />}
          {view === 'settings' && (
            <SettingsView me={me} prefs={prefs} setPrefs={setPrefs} location={fulfilment?.name} onSignOut={signOut} />
          )}
        </main>
      </div>

      {toast && (
        <div className={`wh-toast wh-toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.text}</div>
      )}
    </div>
  )
}
