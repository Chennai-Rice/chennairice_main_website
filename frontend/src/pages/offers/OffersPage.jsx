import { useCallback, useEffect, useState } from 'react'
import StaffGate from '../admin/StaffGate.jsx'
import DiscountCodes from '../warehouse/DiscountCodes.jsx'
import SpinSettings from '../warehouse/SpinSettings.jsx'
import ReferralSettings from '../warehouse/ReferralSettings.jsx'
import { staffJson, signOutStaff } from '../../services/staffAuth.js'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import '../warehouse/warehouse.css'
import './offers.css'

/**
 * /offers: the offers dashboard, on its own (not in /admin or /warehouse). Spin & Win, Refer a friend and
 * discount codes: switch them on, set amounts and prizes, and see who used what and the sales they
 * brought. Owners and IT only (settings.manage, the same as the backend checks).
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'spin', label: 'Spin & Win' },
  { key: 'referral', label: 'Refer a friend' },
  { key: 'codes', label: 'Discount codes' },
]
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
    {
      key: 'spin', title: 'Spin & Win', on: d.spin.enabled,
      big: s.spins, unit: 'spins', lines: [`${s.lastWeek} this week`, `${s.orders} paid orders with a prize`, `${rupees(s.given)} given · ${rupees(s.sales)} sales`],
    },
    {
      key: 'referral', title: 'Refer a friend', on: d.ref.settings.enabled,
      big: r.friendOrders, unit: 'friends ordered', lines: [`${r.referrers} customers with a code`, `${r.rewards} rewards given, ${rupees(r.rewardsUsed)} used`, `${rupees(r.friendOff)} off · ${rupees(r.sales)} sales`],
    },
    {
      key: 'codes', title: 'Discount codes', on: null,
      big: t.uses, unit: 'paid orders with a code', lines: [`${d.codes.codes.length} codes`, `${rupees(t.given)} given`, `${rupees(t.sales)} sales`],
    },
  ]
  return (
    <div className="of-cards">
      {cards.map((c) => (
        <button type="button" key={c.key} className="of-card" onClick={() => go(c.key)}>
          <span className="of-card-head">
            <span className="of-card-title">{c.title}</span>
            {c.on != null && <span className={'of-pill ' + (c.on ? 'is-on' : 'is-off')}>{c.on ? 'On' : 'Off'}</span>}
          </span>
          <span className="of-big">{c.big}</span>
          <span className="of-unit">{c.unit}</span>
          {c.lines.map((l) => <span key={l} className="of-line">{l}</span>)}
          <span className="of-open">Open →</span>
        </button>
      ))}
    </div>
  )
}

export default function OffersPage() {
  usePageMeta('Offers — Chennai Rice', 'Spin & Win, Refer a friend and discount codes.', { noindex: true })
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return TABS.some((t) => t.key === h) ? h : 'overview'
  })
  const [toast, setToast] = useState(null)
  const say = useCallback((message, tone = 'ok') => {
    setToast({ message, tone })
    window.clearTimeout(say.t)
    say.t = window.setTimeout(() => setToast(null), 4000)
  }, [])
  const go = (key) => { setTab(key); window.history.replaceState(null, '', '#' + key) }

  return (
    <div className="wh-embed of-page">
      <StaffGate
        perm="settings.manage"
        title="Offers"
        why="Spin & Win, Refer a friend and discount codes. For the owner and the IT team."
        deniedText="This staff account cannot manage offers. Sign in as the owner or the IT team."
      >
        {({ onAuthError }) => (
          <>
            <header className="of-header">
              <div className="of-brand">
                <span className="of-logo">CR</span>
                <div>
                  <h1 className="of-title">Offers</h1>
                  <p className="of-sub">Spin &amp; Win, Refer a friend and discount codes</p>
                </div>
              </div>
              <button type="button" className="wh-btn" onClick={() => signOutStaff().then(() => window.location.reload())}>Sign out</button>
            </header>
            <nav className="of-tabs" aria-label="Offers">
              {TABS.map((t) => (
                <button key={t.key} type="button" className={'of-tab' + (tab === t.key ? ' is-active' : '')} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
                  {t.label}
                </button>
              ))}
            </nav>
            <main className="of-main">
              {tab === 'overview' && <Overview onAuthError={onAuthError} go={go} />}
              {tab === 'spin' && <SpinSettings say={say} onAuthError={onAuthError} />}
              {tab === 'referral' && <ReferralSettings say={say} onAuthError={onAuthError} />}
              {tab === 'codes' && <DiscountCodes say={say} onAuthError={onAuthError} />}
            </main>
            {toast && <div className={'of-toast' + (toast.tone === 'error' ? ' is-error' : '')} role="status">{toast.message}</div>}
          </>
        )}
      </StaffGate>
    </div>
  )
}
