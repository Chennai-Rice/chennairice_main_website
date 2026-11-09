import { useCallback, useEffect, useState } from 'react'
import StaffGate from '../admin/StaffGate.jsx'
import DiscountCodes from '../warehouse/DiscountCodes.jsx'
import SpinSettings from '../warehouse/SpinSettings.jsx'
import ReferralSettings from '../warehouse/ReferralSettings.jsx'
import WhoSpun from './WhoSpun.jsx'
import CartReminders from './CartReminders.jsx'
import { staffJson, signOutStaff } from '../../services/staffAuth.js'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import { Icon } from '../warehouse/shared.jsx'
import '../warehouse/warehouse.css'
import '../warehouse/warehouse-pages.css'
import '../warehouse/warehouse-shell.css'
import './offers.css'

/**
 * /offers: the offers dashboard, on its own and in the same look as the /warehouse panel (sidebar, top bar
 * with the sections as pills, panels). Spin & Win, Refer a friend and discount codes: switch them on, set amounts and prizes, see
 * who used what and the sales they brought. Owners and IT only (settings.manage, as the backend checks).
 */
const VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'reports', subtitle: 'Spin & Win, Refer a friend and discount codes at a glance' },
  { id: 'spin', label: 'Spin & Win', icon: 'refresh', subtitle: 'Prizes, chances and budget' },
  { id: 'spins', label: 'Who spun', icon: 'users', subtitle: 'Every spin: name, mobile, prize, code and whether it was used' },
  { id: 'referral', label: 'Refer a friend', icon: 'user', subtitle: 'Amounts, top referrers and rewards' },
  { id: 'cart', label: 'Cart reminders', icon: 'bell', subtitle: 'Emails to shoppers who stopped at checkout: switch, offer and recovered orders' },
  { id: 'codes', label: 'Discount codes', icon: 'copy', subtitle: 'Every code, its uses, money given and sales' },
]
const ROLE = { owner: 'Owner', it: 'IT team' }
const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

function Overview({ onAuthError, go }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([staffJson('/api/admin/spin'), staffJson('/api/admin/referrals'), staffJson('/api/admin/discounts')])
      .then(([spin, ref, codes]) => setD({ spin, ref, codes }))
      .catch((err) => { if (!onAuthError(err)) setError(err.message) })
  }, [onAuthError])
  if (error) return <p className="of-alert" role="alert">{error}</p>
  if (!d) return <p className="wh-muted">Loading…</p>
  const s = d.spin.report
  const r = d.ref.totals
  const t = d.codes.totals
  const cards = [
    { id: 'spin', title: 'Spin & Win', on: d.spin.enabled, big: s.spins, unit: 'spins',
      lines: [`${s.lastWeek} this week`, `${s.orders} paid orders with a prize`, `${rupees(s.given)} given · ${rupees(s.sales)} sales`] },
    { id: 'referral', title: 'Refer a friend', on: d.ref.settings.enabled, big: r.friendOrders, unit: 'friends ordered',
      lines: [`${r.referrers} customers with a code`, `${r.rewards} rewards given · ${rupees(r.rewardsUsed)} used`, `${rupees(r.friendOff)} off · ${rupees(r.sales)} sales`] },
    { id: 'codes', title: 'Discount codes', on: null, big: t.uses, unit: 'paid orders with a code',
      lines: [`${d.codes.codes.length} codes`, `${rupees(t.given)} given`, `${rupees(t.sales)} sales`] },
  ]
  return (
    <div className="of-cards">
      {cards.map((c) => (
        <button type="button" key={c.id} className="of-card" onClick={() => go(c.id)}>
          <span className="of-card-head">
            <span className="of-card-title">{c.title}</span>
            {c.on != null && <span className={'of-pill ' + (c.on ? 'is-on' : 'is-off')}>{c.on ? 'On' : 'Off'}</span>}
          </span>
          <span className="of-big">{c.big}</span>
          <span className="of-unit">{c.unit}</span>
          {c.lines.map((l) => <span key={l} className="of-line">{l}</span>)}
          <span className="of-bar" aria-hidden="true"><span style={{ width: Math.min(100, Number(c.big) * 10) + '%' }} /></span>
          <span className="of-open">Open →</span>
        </button>
      ))}
    </div>
  )
}

function Dashboard({ onAuthError }) {
  const [view, setView] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return VIEWS.some((v) => v.id === h) ? h : 'overview'
  })
  const [navOpen, setNavOpen] = useState(false)
  const [me, setMe] = useState(null)
  const [toast, setToast] = useState(null)
  useEffect(() => { staffJson('/api/admin/me').then(setMe).catch(() => {}) }, [])
  // A link to /offers#spins (and the browser's back button) opens that page.
  useEffect(() => {
    const on = () => { const h = window.location.hash.replace('#', ''); if (VIEWS.some((v) => v.id === h)) setView(h) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const say = useCallback((message, tone = 'ok') => {
    setToast({ message, tone })
    window.clearTimeout(say.t)
    say.t = window.setTimeout(() => setToast(null), 4000)
  }, [])
  const go = (id) => { setView(id); setNavOpen(false); window.history.replaceState(null, '', '#' + id) }
  const active = VIEWS.find((v) => v.id === view)
  const email = me?.staff?.email || me?.email || ''
  const role = me?.staff?.role || me?.role || ''

  return (
    <div className={`wh-app wh-shell${navOpen ? ' has-drawer' : ''}`}>
      <aside className="wh-side" aria-label="Offers menu">
        <div className="wh-side-brand">
          <img src="/assets/warehouse-logo.png" alt="" width="44" height="44" />
          <div>
            <strong>Offers</strong>
            <span>Spin &amp; Win · Referrals · Codes</span>
          </div>
        </div>
        <nav className="wh-side-nav">
          {VIEWS.map((item) => (
            <button key={item.id} type="button" className={`wh-side-link${item.id === view ? ' is-active' : ''}`}
              aria-current={item.id === view ? 'page' : undefined} onClick={() => go(item.id)}>
              <Icon name={item.icon} size={21} />
              {item.label}
            </button>
          ))}
          <span className="wh-side-divider" aria-hidden="true" />
          <a className="wh-side-link" href="/warehouse"><Icon name="building" size={21} />Warehouse</a>
        </nav>
      </aside>
      <button type="button" className="wh-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} tabIndex={navOpen ? 0 : -1} />

      <div className="wh-body">
        <header className="wh-topbar">
          <button type="button" className="wh-top-icon wh-hamburger" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Icon name="menu" size={22} />
          </button>
          <div className="wh-brand">
            <img src="/assets/warehouse-logo.png" alt="" width="40" height="40" />
            <span className="wh-brand-pill"><Icon name="building" size={15} />Offers</span>
          </div>
          <h1 className="wh-view-title">{active.label}</h1>
          <nav className="wh-pills" aria-label="Sections">
            {VIEWS.map((item) => (
              <button key={item.id} type="button" className={`wh-pill${item.id === view ? ' is-active' : ''}`}
                aria-current={item.id === view ? 'page' : undefined} onClick={() => go(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="wh-top-right">
            <span className="of-user" title={email}>
              <span className="wh-user-avatar" aria-hidden="true">{email.charAt(0).toUpperCase() || 'C'}</span>
              <span className="of-user-text"><strong>{email}</strong><span>{ROLE[role] || 'Staff'}</span></span>
            </span>
            <button type="button" className="wh-top-icon" aria-label="Sign out" title="Sign out" onClick={() => signOutStaff().then(() => window.location.reload())}>
              <Icon name="logout" size={20} />
            </button>
          </div>
        </header>

        <main className="wh-content">
          <p className="of-subtitle">{active.subtitle}</p>
          {view === 'overview' && <Overview onAuthError={onAuthError} go={go} />}
          {view === 'spin' && <SpinSettings say={say} onAuthError={onAuthError} />}
          {view === 'spins' && <WhoSpun onAuthError={onAuthError} />}
          {view === 'referral' && <ReferralSettings say={say} onAuthError={onAuthError} />}
          {view === 'cart' && <CartReminders say={say} onAuthError={onAuthError} />}
          {view === 'codes' && <DiscountCodes say={say} onAuthError={onAuthError} />}
        </main>
      </div>
      {toast && <div className={`wh-toast wh-toast--${toast.tone === 'error' ? 'error' : 'ok'}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.message}</div>}
    </div>
  )
}

export default function OffersPage() {
  usePageMeta('Offers — Chennai Rice', 'Spin & Win, Refer a friend and discount codes.', { noindex: true })
  return (
    <StaffGate
      perm="settings.manage"
      title="Offers"
      why="Spin & Win, Refer a friend and discount codes. For the owner and the IT team."
      deniedText="This staff account cannot manage offers. Sign in as the owner or the IT team."
    >
      {({ onAuthError }) => <Dashboard onAuthError={onAuthError} />}
    </StaffGate>
  )
}
