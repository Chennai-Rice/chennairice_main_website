import { useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { I, num, pct, inr, when } from './ui.jsx'

const PERIODS = [['this_month', 'This month'], ['last_30', 'Last 30 days'], ['last_month', 'Last month']]
const QUALITY = { GREEN: 'High', YELLOW: 'Medium', RED: 'Low', UNKNOWN: 'Not rated yet' }
const TIER = { TIER_250: '250 / day', TIER_1K: '1,000 / day', TIER_2K: '2,000 / day', TIER_10K: '10,000 / day', TIER_100K: '1 lakh / day', TIER_UNLIMITED: 'Unlimited' }
const initial = (s) => String(s || '?').replace(/\D/g, '').slice(-2) || '?'

export default function Overview({ go }) {
  const [p, setP] = useState('this_month')
  const [d, setD] = useState(null)
  const [s, setS] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setD(null)
    setError('')
    staffJson('/api/admin/whatsapp/overview?period=' + p).then(setD).catch((e) => setError(e.message))
  }, [p])
  useEffect(() => { staffJson('/api/admin/whatsapp/settings').then(setS).catch(() => {}) }, [])

  const t = d?.totals || {}
  const max = Math.max(1, ...(d?.days || []).map((x) => x.sent + x.received))
  const phone = s?.account?.phone || {}
  const approved = d?.templates?.APPROVED || 0
  const orderSent = (d?.orderMessages || []).filter((r) => r.status === 'sent').reduce((a, r) => a + r.n, 0)
  const orderFailed = (d?.orderMessages || []).filter((r) => r.status === 'failed').reduce((a, r) => a + r.n, 0)

  return (
    <>
      <div className="wa-titlebar">
        <h1>Overview</h1>
        <div className="wa-actions">
          <div className="wa-seg">
            {PERIODS.map(([id, label]) => (
              <button key={id} type="button" className={p === id ? 'is-on' : ''} onClick={() => setP(id)}>{label}</button>
            ))}
          </div>
          <button type="button" className="wa-btn" onClick={() => go('templates')}><I name="template" size={16} /> Templates</button>
        </div>
      </div>
      {error && <p className="wa-alert">{error}</p>}
      {!d && !error && <p className="wa-muted">Loading…</p>}
      {d && (
        <>
          <div className="wa-hero">
            <section className="wa-card wa-stats">
              <div className="wa-stat-row">
                <div><span className="wa-label">Messages sent</span><b className="wa-big">{num(t.sent)}</b><span className="wa-sub">to {num(t.customers_out)} customers</span></div>
                <div><span className="wa-label">Read</span><b className="wa-big">{pct(t.read, t.sent)}<small>%</small></b><span className="wa-sub">{num(t.delivered)} delivered · {num(t.failed)} failed</span></div>
                <div><span className="wa-label">Messages received</span><b className="wa-big">{num(t.received)}</b><span className="wa-sub">from {num(t.customers_in)} customers · {num(d.contacts?.new)} new</span></div>
              </div>
              <div className="wa-bars" aria-label="Messages per day">
                {d.days.map((x) => (
                  <div key={x.day} className="wa-bar-col" title={`${x.day}: ${x.sent} sent, ${x.read} read, ${x.received} received`}>
                    <span className="wa-bar wa-bar--in" style={{ height: `${(x.received / max) * 100}%` }} />
                    <span className="wa-bar wa-bar--out" style={{ height: `${(x.sent / max) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="wa-bars-legend">
                <span><i className="wa-key wa-key--out" /> Sent</span><span><i className="wa-key wa-key--in" /> Received</span>
                <span className="wa-muted">{d.days[0]?.day?.slice(5)} → {d.days[d.days.length - 1]?.day?.slice(5)}</span>
              </div>
            </section>

            <section className="wa-card wa-cost">
              <div className="wa-cost-top">
                <div>
                  <span className="wa-label">Cost {PERIODS.find((x) => x[0] === p)[1].toLowerCase()}</span>
                  <b className="wa-big">{inr(d.approxCost)}</b>
                  <span className="wa-chip">{d.meta?.cost != null ? `Meta: ${d.meta.cost} (account currency)` : 'approx.'}</span>
                </div>
                <button type="button" className="wa-round" title="Settings" onClick={() => go('settings')}><I name="arrow" /></button>
              </div>
              <div className="wa-tiles">
                <div className="wa-tile"><span>Quality</span><b>{QUALITY[phone.quality_rating] || '—'}</b><small>{phone.display_phone_number || 'not connected'}</small></div>
                <div className="wa-tile wa-tile--lime"><span>Templates</span><b>{approved} approved</b><small>{d.templates.PENDING || 0} in review · {d.templates.DRAFT || 0} drafts</small></div>
                <div className="wa-tile"><span>Daily limit</span><b>{TIER[phone.messaging_limit_tier] || '—'}</b><small>new customers</small></div>
              </div>
            </section>
          </div>

          <section className="wa-dark">
            <div className="wa-dark-head">
              <h2>Recent messages</h2>
            </div>
            <div className="wa-split wa-split--overview">
              <ul className="wa-list">
                {d.recent.length === 0 && <li className="wa-empty">No messages yet. They appear here once the number is connected and the webhook is on (Settings).</li>}
                {d.recent.map((m) => (
                  <li key={m.id} className="wa-row">
                    <span className={'wa-av' + (m.direction === 'in' ? ' wa-av--in' : '')}>{m.direction === 'in' ? initial(m.phone) : <I name="send" size={15} />}</span>
                    <span className="wa-row-main">
                      <b>{m.direction === 'in' ? m.phone : m.template_name || m.kind}</b>
                      <small>{m.direction === 'in' ? when(m.created_at) : `to ${m.phone} · ${when(m.created_at)}`}</small>
                      <span className="wa-row-text">{m.body}</span>
                    </span>
                    <span className={'wa-ghost wa-ghost--' + m.status}>{m.direction === 'in' ? 'received' : m.status}</span>
                  </li>
                ))}
              </ul>
              <div className="wa-detail">
                <div className="wa-detail-head">
                  <div><span className="wa-label">Order messages</span><b className="wa-mid">{num(orderSent)} sent</b></div>
                  <span className="wa-pill wa-pill--light">via {s?.orderVia === 'cloud' ? 'your number' : 'AskEva'}</span>
                </div>
                <div className="wa-mini-grid">
                  <div className="wa-mini"><b>{num(orderSent)}</b><span>Order placed sent</span></div>
                  <div className="wa-mini"><b>{num(orderFailed)}</b><span>Failed</span></div>
                  <div className="wa-mini"><b>{num(d.contacts?.all)}</b><span>WhatsApp contacts</span></div>
                </div>
                <div className="wa-detail-foot">
                  <div><span className="wa-label">Marketing</span><b>{num(d.byCategory.marketing)}</b></div>
                  <div><span className="wa-label">Utility</span><b>{num(d.byCategory.utility)}</b></div>
                  <div><span className="wa-label">Free (replies)</span><b>{num(d.byCategory.service)}</b></div>
                  <button type="button" className="wa-btn wa-btn--lime" onClick={() => go('templates')}>New template</button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}
