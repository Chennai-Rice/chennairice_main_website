import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// Discount codes for the checkout (backend/lib/sales/discounts.js): add a code, switch it off, and see
// how often it was used, the money given away and the sales it brought. Owners and IT only
// (settings.manage); the backend checks every value again. Spin & Win and referral codes show here too.
const EMPTY = {
  code: '', kind: 'amount', amount: '50', percent: '10', maxOff: '', minOrder: '', region: '',
  maxUses: '', usesPerPhone: '1', firstOrderOnly: false, startsAt: '', expiresAt: '', note: '',
}
const SOURCE = { manual: 'Made here', spin: 'Spin & Win', referral: 'Referral', reward: 'Referral reward' }
const REGION = { '': 'All India', TN: 'Tamil Nadu', SOUTH: 'South India', NORTH: 'North India', NE: 'North East' }
const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')

export default function DiscountCodes({ say, onAuthError }) {
  const [data, setData] = useState({ codes: [], totals: { uses: 0, given: 0, sales: 0 } })
  const [form, setForm] = useState(EMPTY)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState('')

  const load = useCallback(() => {
    staffJson('/api/admin/discounts' + (source ? '?source=' + source : ''))
      .then(setData)
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say, source])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { code } = await staffJson('/api/admin/discounts', { method: 'POST', body: JSON.stringify(form) })
      say(`Saved. Customers can now use ${code.code} (${code.label}).`)
      setForm(EMPTY)
      setAdding(false)
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(c) {
    try {
      await staffJson('/api/admin/discounts/' + c.id, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) })
      say(c.active ? `${c.code} is switched off.` : `${c.code} is switched on again.`)
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const cell = { padding: '8px 10px', borderBottom: '1px solid rgba(74,44,34,0.12)', verticalAlign: 'top', fontSize: 14 }
  const head = { ...cell, fontSize: 12, fontWeight: 600, textAlign: 'left', color: 'var(--heading)' }

  return (
    <section className="wh-panel">
      <h2 className="wh-panel-title">Discount codes</h2>
      <p className="wh-muted wh-small">
        Codes customers type at checkout. The website checks every rule before the discount is given, and again when the
        order is placed. One code per order. The discount is printed on the invoice.
      </p>

      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '10px 0' }}>
        <span><strong>{data.totals.uses}</strong> paid orders with a code</span>
        <span><strong>{rupees(data.totals.given)}</strong> given away</span>
        <span><strong>{rupees(data.totals.sales)}</strong> sales with a code</span>
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        {!adding && <button type="button" className="wh-btn wh-btn--primary" onClick={() => setAdding(true)}>Add a code</button>}
        <label className="wh-select" style={{ minWidth: 180 }}>
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Which codes">
            <option value="">All codes</option>
            {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {adding && (
        <form onSubmit={save} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: '12px 0 18px' }}>
          <label className="wh-field"><span>Code</span>
            <input className="wh-input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DIWALI50" maxLength={24} required />
          </label>
          <label className="wh-field"><span>Type</span>
            <span className="wh-select"><select value={form.kind} onChange={set('kind')}>
              <option value="amount">₹ off</option>
              <option value="percent">% off</option>
              <option value="free_delivery">Free delivery</option>
            </select></span>
          </label>
          {form.kind === 'amount' && (
            <label className="wh-field"><span>Amount off (₹)</span>
              <input className="wh-input" type="number" min="1" max="5000" value={form.amount} onChange={set('amount')} required />
            </label>
          )}
          {form.kind === 'percent' && (
            <>
              <label className="wh-field"><span>% off</span>
                <input className="wh-input" type="number" min="1" max="50" value={form.percent} onChange={set('percent')} required />
              </label>
              <label className="wh-field"><span>Most off (₹, optional)</span>
                <input className="wh-input" type="number" min="0" max="5000" value={form.maxOff} onChange={set('maxOff')} />
              </label>
            </>
          )}
          <label className="wh-field"><span>Minimum order (₹, rice)</span>
            <input className="wh-input" type="number" min="0" value={form.minOrder} onChange={set('minOrder')} placeholder="0" />
          </label>
          <label className="wh-field"><span>Area</span>
            <span className="wh-select"><select value={form.region} onChange={set('region')}>
              {Object.entries(REGION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></span>
          </label>
          <label className="wh-field"><span>Uses in all (optional)</span>
            <input className="wh-input" type="number" min="1" value={form.maxUses} onChange={set('maxUses')} placeholder="No limit" />
          </label>
          <label className="wh-field"><span>Uses per mobile number</span>
            <input className="wh-input" type="number" min="1" max="100" value={form.usesPerPhone} onChange={set('usesPerPhone')} required />
          </label>
          <label className="wh-field"><span>From (optional)</span>
            <input className="wh-input" type="date" value={form.startsAt} onChange={set('startsAt')} />
          </label>
          <label className="wh-field"><span>Until (optional)</span>
            <input className="wh-input" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
          </label>
          <label className="wh-field"><span>Note (optional)</span>
            <input className="wh-input" value={form.note} onChange={set('note')} maxLength={200} placeholder="Diwali offer, Instagram" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" checked={form.firstOrderOnly} onChange={set('firstOrderOnly')} /> First order only
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
            <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save code'}</button>
            <button type="button" className="wh-btn" onClick={() => { setAdding(false); setForm(EMPTY) }}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={head}>Code</th><th style={head}>Gives</th><th style={head}>Rules</th><th style={head}>Valid</th>
              <th style={head}>Used</th><th style={head}>Given</th><th style={head}>Sales</th><th style={head}></th>
            </tr>
          </thead>
          <tbody>
            {data.codes.map((c) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                <td style={cell}>
                  <strong className="wh-mono">{c.code}</strong>
                  <div className="wh-muted wh-small">{SOURCE[c.source]}{c.note ? ' · ' + c.note : ''}</div>
                </td>
                <td style={cell}>{c.label}{c.kind === 'percent' && c.maxOff != null ? ` (up to ${rupees(c.maxOff)})` : ''}</td>
                <td style={cell} className="wh-small">
                  {[
                    c.minOrder ? `Orders above ${rupees(c.minOrder)}` : '',
                    c.region ? REGION[c.region] + ' only' : '',
                    c.firstOrderOnly ? 'First order only' : '',
                    c.lockedPhone ? `Only ${c.lockedPhone}` : '',
                    c.ownerPhone ? `Shared by ${c.ownerPhone}` : '',
                    c.maxUses ? `${c.maxUses} uses in all` : '',
                    `${c.usesPerPhone} per mobile`,
                  ].filter(Boolean).join(' · ')}
                </td>
                <td style={cell} className="wh-small">
                  {c.startsAt || c.expiresAt ? `${c.startsAt ? day(c.startsAt) : 'Now'} – ${c.expiresAt ? day(c.expiresAt) : 'no end'}` : 'No end date'}
                  {!c.active && <div><strong>Switched off</strong></div>}
                </td>
                <td style={cell}>{c.uses}</td>
                <td style={cell}>{rupees(c.given)}</td>
                <td style={cell}>{rupees(c.sales)}</td>
                <td style={cell}>
                  <button type="button" className="wh-btn wh-btn--small" onClick={() => toggle(c)}>{c.active ? 'Switch off' : 'Switch on'}</button>
                </td>
              </tr>
            ))}
            {!data.codes.length && <tr><td style={cell} colSpan={8} className="wh-muted">No codes yet. Add one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
