import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// Discount codes for the checkout (backend/lib/sales/discounts.js): add a code, switch it off, and see
// how often it was used, the money given away and the sales it brought. Owners and IT only
// (settings.manage); the backend checks every value again. Spin & Win and referral codes show here too.
const EMPTY = {
  code: '', kind: 'amount', amount: '50', percent: '10', maxOff: '', minOrder: '', region: '',
  maxUses: '', usesPerPhone: '1', lockedPhone: '', firstOrderOnly: false, startsAt: '', expiresAt: '', note: '',
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
  const [linking, setLinking] = useState(false)

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
        <button type="button" className="wh-btn" onClick={() => setLinking((v) => !v)}>{linking ? 'Close order link' : 'Order link for a customer'}</button>
        <label className="wh-select" style={{ minWidth: 180 }}>
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Which codes">
            <option value="">All codes</option>
            {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {linking && <OrderLink say={say} onAuthError={onAuthError} codes={data.codes.filter((c) => c.active)} />}

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
              <input className="wh-input" type="number" min="1" max="5000" step="0.01" value={form.amount} onChange={set('amount')} required />
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
          <label className="wh-field"><span>Only this mobile (optional)</span>
            <input className="wh-input" inputMode="numeric" value={form.lockedPhone} onChange={set('lockedPhone')} placeholder="Anyone" maxLength={14} />
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

const NO_LINK = { name: '', phone: '', email: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', code: '' }

/** One customer's order link: checkout opens with these packs, their details and the code; they only press Pay. */
function OrderLink({ say, onAuthError, codes }) {
  const [catalog, setCatalog] = useState([])
  const [lines, setLines] = useState([{ pack: '', qty: 1 }])
  const [f, setF] = useState(NO_LINK)
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then((d) => setCatalog(d.products || [])).catch(() => {})
  }, [])
  const packs = catalog.flatMap((p) => p.variants.filter((v) => v.price != null).map((v) => ({
    key: p.slug + '|' + Number(v.packKg), label: `${p.name} (${Number(v.packKg)} kg) · ${rupees(v.price)}`,
  })))
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const setLine = (n, k, v) => setLines((ls) => ls.map((l, i) => (i === n ? { ...l, [k]: v } : l)))

  async function make(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const items = lines.filter((l) => l.pack).map((l) => { const [slug, kg] = l.pack.split('|'); return { slug, kg: Number(kg), qty: Number(l.qty) } })
      const { code, ...contact } = f
      setOut(await staffJson('/api/admin/discounts/order-link', { method: 'POST', body: JSON.stringify({ items, contact, code }) }))
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(out.url); say('Link copied. Send it to the customer.') } catch { say('Select the link and copy it.', 'error') }
  }

  return (
    <form onSubmit={make} style={{ border: '1px solid rgba(74,44,34,0.15)', borderRadius: 12, padding: 14, margin: '12px 0 18px' }}>
      <h3 style={{ margin: '0 0 4px' }}>Order link for one customer</h3>
      <p className="wh-muted wh-small" style={{ marginTop: 0 }}>
        The link opens checkout with these packs, the customer's details and the code filled in, so they only check and press Pay.
        Today's prices and delivery are used, and the code's rules are checked again. For a code only this customer can use, add it
        first with "Only this mobile" and "Uses in all: 1". The link works for 30 days.
      </p>
      {lines.map((l, n) => (
        <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="wh-select" style={{ flex: '1 1 260px' }}><select value={l.pack} onChange={(e) => setLine(n, 'pack', e.target.value)} aria-label="Pack">
            <option value="">Choose a pack…</option>
            {packs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select></span>
          <input className="wh-input" type="number" min="1" max="50" value={l.qty} onChange={(e) => setLine(n, 'qty', e.target.value)} style={{ width: 80 }} aria-label="How many" />
          {lines.length > 1 && <button type="button" className="wh-btn wh-btn--small" onClick={() => setLines((ls) => ls.filter((_, i) => i !== n))}>Remove</button>}
        </div>
      ))}
      <button type="button" className="wh-btn wh-btn--small" onClick={() => setLines((ls) => [...ls, { pack: '', qty: 1 }])}>+ Another pack</button>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
        <label className="wh-field"><span>Name</span><input className="wh-input" value={f.name} onChange={set('name')} required /></label>
        <label className="wh-field"><span>Mobile</span><input className="wh-input" inputMode="numeric" value={f.phone} onChange={set('phone')} required /></label>
        <label className="wh-field"><span>Email</span><input className="wh-input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="wh-field"><span>Address (door, street)</span><input className="wh-input" value={f.addressLine1} onChange={set('addressLine1')} /></label>
        <label className="wh-field"><span>Area / landmark</span><input className="wh-input" value={f.addressLine2} onChange={set('addressLine2')} /></label>
        <label className="wh-field"><span>City</span><input className="wh-input" value={f.city} onChange={set('city')} /></label>
        <label className="wh-field"><span>State</span><input className="wh-input" value={f.state} onChange={set('state')} /></label>
        <label className="wh-field"><span>PIN code</span><input className="wh-input" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} /></label>
        <label className="wh-field"><span>Code (optional)</span>
          <span className="wh-select"><select value={f.code} onChange={set('code')}>
            <option value="">No code</option>
            {codes.map((c) => <option key={c.id} value={c.code}>{c.code} · {c.label}{c.lockedPhone ? ' · only ' + c.lockedPhone : ''}</option>)}
          </select></span>
        </label>
      </div>
      <div style={{ marginTop: 12 }}><button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Making…' : 'Make the link'}</button></div>
      {out && (
        <div style={{ marginTop: 14 }}>
          <p className="wh-small" style={{ margin: '0 0 6px' }}>
            {out.items.map((i) => `${i.qty} × ${i.name}`).join(', ')} · rice {rupees(out.subtotal)} (before delivery){out.code ? ` · code ${out.code}` : ''}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="wh-input" readOnly value={out.url} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
            <button type="button" className="wh-btn wh-btn--primary" onClick={copy}>Copy</button>
          </div>
        </div>
      )}
    </form>
  )
}
