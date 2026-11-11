import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// Refer a friend (backend/lib/sales/referrals.js): switch it on, set the friend's discount, the reward,
// the monthly limit and how long rewards last; see the top referrers and the latest rewards, and take back a
// suspicious one. Owners and IT only (settings.manage); the backend checks every value again.
const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const STATUS = { issued: 'Given', over_limit: 'Over monthly limit', cancelled: 'Taken back' }

export default function ReferralSettings({ say, onAuthError }) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const take = (d) => {
    setData(d)
    setForm({ enabled: d.settings.enabled, friend: String(d.settings.friend), reward: String(d.settings.reward), cap: String(d.settings.cap), days: String(d.settings.days) })
  }
  const load = useCallback(() => {
    staffJson('/api/admin/referrals').then(take).catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])
  useEffect(() => { load() }, [load])
  if (!form) return null

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await staffJson('/api/admin/referrals', {
        method: 'PUT',
        body: JSON.stringify({ enabled: form.enabled, friend: Number(form.friend), reward: Number(form.reward), cap: Number(form.cap), days: Number(form.days) }),
      })
      take(d)
      say(d.settings.enabled ? 'Saved. Refer a friend is on.' : 'Saved. Refer a friend is switched off.')
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(r) {
    if (!window.confirm(`Take back the ${rupees(r.amount)} reward ${r.code} given to ${r.referrer}? Its code stops working.`)) return
    try {
      take(await staffJson(`/api/admin/referrals/rewards/${r.id}/cancel`, { method: 'POST' }))
      say('Reward taken back.')
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const t = data.totals
  const cell = { padding: '7px 8px', borderBottom: '1px solid rgba(74,44,34,0.12)', fontSize: 14, textAlign: 'left', verticalAlign: 'top' }

  return (
    <section className="wh-panel">
      <h2 className="wh-panel-title">Refer a friend</h2>
      <p className="wh-muted wh-small">
        Every paying customer gets a code (shown after payment, in the order email and at /refer). A friend types it, or the
        customer's mobile number, at checkout and saves on their first order. When that order is delivered, the customer gets
        a reward used by itself at their next checkout (same mobile number and email).
      </p>
      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '10px 0' }}>
        <span><strong>{t.referrers}</strong> customers with a code</span>
        <span><strong>{t.friendOrders}</strong> friends ordered ({rupees(t.sales)})</span>
        <span><strong>{rupees(t.friendOff)}</strong> off for friends</span>
        <span><strong>{t.rewards}</strong> rewards given, {rupees(t.rewardsUsed)} used</span>
      </p>

      <form onSubmit={save} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1' }}>
          <input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> Refer a friend is on
        </label>
        <label className="wh-field"><span>Friend's first order (₹ off)</span><input className="wh-input" type="number" min="1" max="2000" value={form.friend} onChange={set('friend')} /></label>
        <label className="wh-field"><span>Reward for the customer (₹)</span><input className="wh-input" type="number" min="1" max="2000" value={form.reward} onChange={set('reward')} /></label>
        <label className="wh-field"><span>Rewards a month, each</span><input className="wh-input" type="number" min="1" max="100" value={form.cap} onChange={set('cap')} /></label>
        <label className="wh-field"><span>Reward lasts (days)</span><input className="wh-input" type="number" min="1" max="365" value={form.days} onChange={set('days')} /></label>
        <div style={{ alignSelf: 'end' }}><button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>

      <h3 className="wh-small" style={{ margin: '8px 0' }}>Top referrers</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr><th style={cell}>Customer</th><th style={cell}>Code</th><th style={cell}>Friends ordered</th><th style={cell}>Friends' sales</th><th style={cell}>Rewards</th></tr></thead>
          <tbody>
            {data.top.map((r) => (
              <tr key={r.id}><td style={cell}>{r.name}<div className="wh-muted wh-small">{r.phone}</div></td><td style={cell} className="wh-mono">{r.code}</td>
                <td style={cell}>{r.friends}</td><td style={cell}>{rupees(r.sales)}</td><td style={cell}>{r.rewards}</td></tr>
            ))}
            {!data.top.length && <tr><td style={cell} colSpan={5} className="wh-muted">No referral codes yet. They are made when customers pay while this is on.</td></tr>}
          </tbody>
        </table>
      </div>

      {data.recent.length > 0 && (
        <>
          <h3 className="wh-small" style={{ margin: '16px 0 8px' }}>Latest rewards</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead><tr><th style={cell}>When</th><th style={cell}>Customer</th><th style={cell}>Friend's order</th><th style={cell}>Reward</th><th style={cell}></th></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td style={cell}>{day(r.at)}</td><td style={cell}>{r.referrer}</td>
                    <td style={cell}>{r.friend}<div className="wh-muted wh-small wh-mono">{r.orderNumber}</div></td>
                    <td style={cell}>{r.amount != null ? `${rupees(r.amount)} · ${r.code}` : '—'}<div className="wh-muted wh-small">{STATUS[r.status] || r.status}</div></td>
                    <td style={cell}>{r.status === 'issued' && <button type="button" className="wh-btn wh-btn--small" onClick={() => cancel(r)}>Take back</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
