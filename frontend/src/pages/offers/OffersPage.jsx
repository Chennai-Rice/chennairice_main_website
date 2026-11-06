import { useCallback, useEffect, useState } from 'react'
import StaffGate from '../admin/StaffGate.jsx'
import DiscountCodes from '../warehouse/DiscountCodes.jsx'
import SpinSettings from '../warehouse/SpinSettings.jsx'
import ReferralSettings from '../warehouse/ReferralSettings.jsx'
import { staffJson, signOutStaff } from '../../services/staffAuth.js'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import '../admin/admin.css'
import '../warehouse/warehouse.css'
import './offers.css'

/**
 * /offers: the offers dashboard, on its own and in the same look as the /admin dashboard (sidebar, page
 * title, cards). Spin & Win, Refer a friend and discount codes: switch them on, set amounts and prizes, see
 * who used what and the sales they brought. Owners and IT only (settings.manage, as the backend checks).
 */
const PATHS = {
  grid: <><rect x="3" y="3" width="5.6" height="5.6" rx="1.2" /><rect x="11.4" y="3" width="5.6" height="5.6" rx="1.2" /><rect x="3" y="11.4" width="5.6" height="5.6" rx="1.2" /><rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1.2" /></>,
  wheel: <><circle cx="10" cy="10" r="7.2" /><circle cx="10" cy="10" r="1.6" /><path d="M10 2.8v5.6M10 11.6v5.6M2.8 10h5.6M11.6 10h5.6M4.9 4.9l3.9 3.9M11.2 11.2l3.9 3.9M15.1 4.9l-3.9 3.9M8.8 11.2l-3.9 3.9" /></>,
  people: <><circle cx="7.2" cy="7" r="2.6" /><path d="M2.6 16.2c.6-2.8 2.4-4.2 4.6-4.2s4 1.4 4.6 4.2" /><circle cx="13.8" cy="7.6" r="2.1" /><path d="M13 11.9c2 .1 3.6 1.4 4.2 3.8" /></>,
  ticket: <><path d="M3 6.2h14v2.3a1.6 1.6 0 0 0 0 3v2.3H3v-2.3a1.6 1.6 0 0 0 0-3z" /><path d="M12.2 6.2v7.6" strokeDasharray="1.4 1.6" /></>,
}
const NavIcon = ({ name }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ad-nav-icon">
    {PATHS[name]}
  </svg>
)

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'grid', subtitle: 'Spin & Win, Refer a friend and discount codes at a glance' },
  { id: 'spin', label: 'Spin & Win', icon: 'wheel', subtitle: 'Prizes, chances, budget, and who spun' },
  { id: 'referral', label: 'Refer a friend', icon: 'people', subtitle: 'Amounts, top referrers and rewards' },
  { id: 'codes', label: 'Discount codes', icon: 'ticket', subtitle: 'Every code, its uses, money given and sales' },
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
  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!d) return <p className="ad-muted">Loading…</p>
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
    <div className={`ad-shell ad-app${navOpen ? ' is-nav-open' : ''}`}>
      <a className="ad-skip" href="#ad-main">Skip to content</a>
      <button type="button" className="ad-backdrop" aria-label="Close navigation" tabIndex={navOpen ? 0 : -1} onClick={() => setNavOpen(false)} />

      <aside className="ad-side" aria-label="Offers sections">
        <div className="ad-side-brand">
          <span className="ad-logo" aria-hidden="true">CR</span>
          <span className="ad-side-name">Offers</span>
        </div>
        <nav className="ad-nav">
          {VIEWS.map((item) => (
            <button key={item.id} type="button" className={`ad-nav-item${item.id === view ? ' is-active' : ''}`}
              aria-current={item.id === view ? 'page' : undefined} onClick={() => go(item.id)}>
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ad-side-user">
          <span className="ad-avatar" aria-hidden="true">{email.charAt(0).toUpperCase() || 'C'}</span>
          <span className="ad-side-user-text">
            <span className="ad-side-email" title={email}>{email}</span>
            <span className="ad-muted ad-small">{ROLE[role] || 'Staff'}</span>
          </span>
        </div>
      </aside>

      <div className="ad-main-col">
        <header className="ad-topbar">
          <button type="button" className="ad-btn ad-btn-quiet ad-nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen} aria-label="Toggle navigation">
            <span aria-hidden="true">☰</span>
          </button>
          <div className="ad-topbar-title">
            <h1 className="ad-page-title">{active.label}</h1>
            <p className="ad-muted ad-small">{active.subtitle}</p>
          </div>
          <div className="ad-topbar-actions">
            <button type="button" className="ad-btn ad-btn-quiet" onClick={() => signOutStaff().then(() => window.location.reload())}>Sign out</button>
          </div>
        </header>

        <main className="ad-main" id="ad-main">
          <div className="wh-embed of-content">
            {view === 'overview' && <Overview onAuthError={onAuthError} go={go} />}
            {view === 'spin' && <SpinSettings say={say} onAuthError={onAuthError} />}
            {view === 'referral' && <ReferralSettings say={say} onAuthError={onAuthError} />}
            {view === 'codes' && <DiscountCodes say={say} onAuthError={onAuthError} />}
          </div>
        </main>
      </div>
      {toast && <div className={'of-toast' + (toast.tone === 'error' ? ' is-error' : '')} role="status">{toast.message}</div>}
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
