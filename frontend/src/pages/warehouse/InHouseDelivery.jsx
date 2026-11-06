import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'

// Chennai Rice's own delivery (backend/lib/sales/delivery.js): offered at checkout as a choice next to
// the courier, for a flat charge per order, where the team delivers. Owners and IT only (settings.manage);
// the backend checks every value again.
const KEYS = ['in_house_delivery_enabled', 'in_house_delivery_paise', 'in_house_delivery_pins', 'in_house_delivery_promise']

export default function InHouseDelivery({ say, onAuthError }) {
  const [form, setForm] = useState({ enabled: true, rupees: '100', pins: '', promise: 'Within 48 hours' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    staffJson('/api/admin/settings')
      .then((r) => {
        const v = Object.fromEntries(r.settings.filter((s) => KEYS.includes(s.key)).map((s) => [s.key, s.value]))
        setForm({
          enabled: v.in_house_delivery_enabled !== 'false',
          rupees: v.in_house_delivery_paise != null && v.in_house_delivery_paise !== '' ? String(Number(v.in_house_delivery_paise) / 100) : '100',
          pins: v.in_house_delivery_pins || '',
          promise: v.in_house_delivery_promise || 'Within 48 hours',
        })
      })
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
  }, [onAuthError, say])
  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    const rupees = Number(form.rupees)
    if (!(rupees >= 0 && rupees <= 1000)) return say('The charge must be between ₹0 and ₹1,000.', 'error')
    setBusy(true)
    try {
      await staffJson('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          in_house_delivery_enabled: form.enabled ? 'true' : 'false',
          in_house_delivery_paise: String(Math.round(rupees * 100)),
          in_house_delivery_pins: form.pins,
          in_house_delivery_promise: form.promise,
        }),
      })
      say(form.enabled ? 'Saved. In-house delivery is offered at checkout.' : 'Saved. In-house delivery is switched off.')
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  return (
    <section className="wh-panel">
      <h2 className="wh-panel-title">In-house delivery</h2>
      <p className="wh-muted wh-small">
        Customers in the area below can choose delivery by the Chennai Rice team at checkout, next to the courier, for one flat
        charge per order. It is offered only when it costs less than the courier for that cart. The courier stays the default. Orders that choose it show "Our delivery" in Orders and Dispatch.
      </p>
      <form onSubmit={save}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
          <input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> Offer in-house delivery at checkout
        </label>
        <label className="wh-field">
          <span>Charge per order (₹, GST included)</span>
          <input className="wh-input" type="number" min="0" max="1000" step="1" value={form.rupees} onChange={set('rupees')} required />
        </label>
        <label className="wh-field">
          <span>PIN codes the team delivers to</span>
          <textarea className="wh-input" rows={2} value={form.pins} onChange={set('pins')}
            placeholder={'Empty = all of Tamil Nadu. Or list full PINs (638104) or starts (638 = Erode area), separated by commas.'} />
        </label>
        <label className="wh-field">
          <span>What the customer is told</span>
          <input className="wh-input" maxLength={60} value={form.promise} onChange={set('promise')} required />
        </label>
        <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </section>
  )
}
