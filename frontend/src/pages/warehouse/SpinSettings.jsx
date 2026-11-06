import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// Spin & Win (backend/lib/sales/spin.js): switch it on, set the prizes and their chances, a monthly budget,
// and see how it is doing. Owners and IT only (settings.manage); the backend checks every value again.
const REGION = { '': 'All India', TN: 'Tamil Nadu only' }
const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export default function SpinSettings({ say, onAuthError }) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const take = (d) => {
    setData(d)
    setForm({ enabled: d.enabled, budget: String(d.budget), validDays: String(d.validDays), prizes: d.prizes.map((p) => ({ ...p, region: p.region || '' })) })
  }
  const load = useCallback(() => {
    staffJson('/api/admin/spin').then(take).catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])
  useEffect(() => { load() }, [load])

  if (!form) return null
  const total = form.prizes.reduce((t, p) => t + (Number(p.chance) || 0), 0)

  async function save(e) {
    e.preventDefault()
    if (Math.abs(total - 100) > 0.001) return say(`The chances add up to ${total}%. They must add up to 100%.`, 'error')
    setBusy(true)
    try {
      const d = await staffJson('/api/admin/spin', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: form.enabled, budget: Number(form.budget) || 0, validDays: Number(form.validDays) || 7,
          prizes: form.prizes.map((p) => ({ ...p, amount: Number(p.amount) || 0, minOrder: Number(p.minOrder) || 0, chance: Number(p.chance) || 0, region: p.region || null })),
        }),
      })
      take(d)
      say(d.enabled ? 'Saved. Spin & Win is on the website.' : 'Saved. Spin & Win is switched off.')
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const setPrize = (i, k) => (e) => setForm((f) => ({ ...f, prizes: f.prizes.map((p, j) => (j === i ? { ...p, [k]: k === 'label' ? e.target.value.toUpperCase() : e.target.value } : p)) }))
  const addPrize = () => setForm((f) => ({ ...f, prizes: [...f.prizes, { key: 'p' + Date.now().toString(36).slice(-5), label: '₹10 OFF', kind: 'amount', amount: 10, minOrder: 0, region: '', chance: 0 }] }))
  const removePrize = (i) => setForm((f) => ({ ...f, prizes: f.prizes.filter((_, j) => j !== i) }))
  const cell = { padding: '6px 6px', verticalAlign: 'middle' }
  const r = data.report

  return (
    <section className="wh-panel">
      <h2 className="wh-panel-title">Spin &amp; Win</h2>
      <p className="wh-muted wh-small">
        Visitors type their name and mobile number and spin once. Every spin wins a discount code that works only with that
        mobile number, for the days set below. The website picks the prize by the chances below; visitors never see the chances.
      </p>

      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '10px 0' }}>
        <span><strong>{r.spins}</strong> spins ({r.lastWeek} this week)</span>
        <span><strong>{r.orders}</strong> paid orders with a prize</span>
        <span><strong>{rupees(r.given)}</strong> given away</span>
        <span><strong>{rupees(r.sales)}</strong> sales</span>
      </p>
      {r.byPrize.length > 0 && (
        <p className="wh-small wh-muted" style={{ margin: '0 0 12px' }}>
          {r.byPrize.map((b) => `${b.label}: ${b.spins} won, ${b.orders} used`).join(' · ')}
        </p>
      )}

      <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
          Show Spin &amp; Win on the website
        </label>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label className="wh-field"><span>Monthly budget (₹, 0 = no limit)</span>
            <input className="wh-input" type="number" min="0" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
          </label>
          <label className="wh-field"><span>Prize valid for (days)</span>
            <input className="wh-input" type="number" min="1" max="60" value={form.validDays} onChange={(e) => setForm((f) => ({ ...f, validDays: e.target.value }))} />
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr className="wh-small" style={{ textAlign: 'left' }}>
                <th style={cell}>On the wheel</th><th style={cell}>Gives</th><th style={cell}>₹ off</th><th style={cell}>Min. order ₹</th>
                <th style={cell}>Area</th><th style={cell}>Chance %</th><th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {form.prizes.map((p, i) => (
                <tr key={p.key}>
                  <td style={cell}><input className="wh-input" value={p.label} onChange={setPrize(i, 'label')} maxLength={20} aria-label="Label on the wheel" /></td>
                  <td style={cell}>
                    <span className="wh-select"><select value={p.kind} onChange={setPrize(i, 'kind')} aria-label="Gives">
                      <option value="amount">₹ off</option>
                      <option value="free_delivery">Free delivery</option>
                    </select></span>
                  </td>
                  <td style={cell}>{p.kind === 'amount'
                    ? <input className="wh-input" type="number" min="1" max="2000" value={p.amount} onChange={setPrize(i, 'amount')} aria-label="Rupees off" style={{ width: 90 }} />
                    : <span className="wh-muted">—</span>}</td>
                  <td style={cell}><input className="wh-input" type="number" min="0" value={p.minOrder} onChange={setPrize(i, 'minOrder')} aria-label="Minimum order" style={{ width: 100 }} /></td>
                  <td style={cell}>
                    <span className="wh-select"><select value={p.region} onChange={setPrize(i, 'region')} aria-label="Area">
                      {Object.entries(REGION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></span>
                  </td>
                  <td style={cell}><input className="wh-input" type="number" min="0" max="100" step="0.5" value={p.chance} onChange={setPrize(i, 'chance')} aria-label="Chance" style={{ width: 80 }} /></td>
                  <td style={cell}>{form.prizes.length > 2 && <button type="button" className="wh-btn wh-btn--small" onClick={() => removePrize(i)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="wh-small" style={{ margin: 0, color: Math.abs(total - 100) > 0.001 ? '#b3261e' : undefined }}>
          Chances add up to <strong>{total}%</strong>{Math.abs(total - 100) > 0.001 ? ' (must be 100%)' : ''}.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {form.prizes.length < 8 && <button type="button" className="wh-btn" onClick={addPrize}>Add a prize</button>}
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </section>
  )
}
