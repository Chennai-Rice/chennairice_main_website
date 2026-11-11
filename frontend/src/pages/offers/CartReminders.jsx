import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// /offers → Cart reminders (Nov 2026): the abandoned cart emails. Switch them on, choose email 2's offer, and see
// how many were sent, clicked and turned into paid orders (a paid order on the same mobile or email within 7 days).
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')
const rupees = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const PERIODS = [[7, '7 days'], [30, '30 days'], [90, '90 days']]

export default function CartReminders({ say, onAuthError }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    staffJson(`/api/admin/cart-reminders?days=${days}`).then(setData).catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [days, onAuthError, say])
  useEffect(() => { load() }, [load])

  async function save(changes) {
    setBusy(true)
    try {
      setData(await staffJson('/api/admin/cart-reminders', { method: 'PUT', body: JSON.stringify(changes) }))
      say('Saved.', 'ok')
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <p className="wh-muted">Loading…</p>
  const s = data.stats
  const tiles = [
    ['Carts reminded', s.carts], ['Email 1 sent', s.sent1], ['Email 2 sent', s.sent2], ['Clicked', s.clicked],
    ['Recovered orders', s.recovered], ['Recovered sales', rupees(s.revenue)], ['Recovery rate', s.rate + '%'], ['Unsubscribed', s.unsubscribed],
  ]

  return (
    <>
      <section className="wh-panel" style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={data.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />
          <strong>Send cart reminder emails</strong>
        </label>
        <p className="wh-muted wh-small" style={{ margin: 0 }}>
          Email 1 goes an hour after a shopper stops at checkout (once they have typed their mobile and email). Email 2 goes a day
          later if they still have not paid: the last one. Only between 9 am and 9 pm, never after they pay, and never to anyone
          who unsubscribed.
        </p>
        <label className="wh-field" style={{ maxWidth: 320 }}><span>Offer in email 2</span>
          <span className="wh-select"><select value={data.offer} disabled={busy} onChange={(e) => save({ offer: e.target.value })}>
            {Object.entries(data.offers).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></span>
        </label>
      </section>

      <section className="wh-panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Results</h2>
          <div className="wh-seg" role="group" aria-label="Period">
            {PERIODS.map(([d, label]) => (
              <button key={d} type="button" className={`wh-seg-btn${days === d ? ' is-active' : ''}`} aria-pressed={days === d} onClick={() => setDays(d)}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {tiles.map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--wh-line)', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
              <div className="wh-muted wh-small">{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
        <p className="wh-muted wh-small" style={{ margin: '10px 0 0' }}>Recovered = a paid order on the same mobile or email within 7 days of a reminder.</p>
      </section>

      <section className="wh-panel of-who" style={{ marginTop: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Latest reminders</h2>
        <div className="of-who-table">
          <table>
            <thead><tr><th>Sent</th><th>Email</th><th>Name</th><th>Cart</th><th>Code</th><th>Clicked</th><th>Order</th></tr></thead>
            <tbody>
              {data.recent.map((r, i) => (
                <tr key={i}>
                  <td>{when(r.sentAt)}<div className="wh-muted wh-small">Email {r.step}</div></td>
                  <td>{r.email}</td>
                  <td>{r.name || '—'}</td>
                  <td>{r.value == null ? '—' : rupees(r.value)}</td>
                  <td className="wh-mono">{r.code || '—'}</td>
                  <td>{r.clickedAt ? when(r.clickedAt) : '—'}</td>
                  <td>{r.orderNumber ? <span className="of-pill of-pill--used">{r.orderNumber}</span> : '—'}</td>
                </tr>
              ))}
              {!data.recent.length && <tr><td colSpan={7} className="wh-muted">No reminders sent yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
