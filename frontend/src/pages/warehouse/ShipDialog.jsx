import { useState } from 'react'
import { Icon } from './shared.jsx'

export const METHODS = [
  { key: 'own_vehicle', label: 'Own vehicle', needs: 'vehicle number' },
  { key: 'courier', label: 'Courier', needs: 'courier name and tracking number' },
  { key: 'transport', label: 'Transport (lorry)', needs: 'transport company and LR number' },
  { key: 'pickup', label: 'Customer pickup', needs: 'nothing more' },
]
export const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.key, m.label]))

/**
 * How an order leaves the mill: method plus the details that make it
 * traceable. Used to dispatch (Dispatch page) and to add or correct details
 * afterwards (Deliveries page). `initial` pre-fills from an existing shipment.
 */
export default function ShipDialog({ title, subtitle, initial = {}, submitLabel, busy, onSubmit, onCancel }) {
  const [f, setF] = useState({
    method: initial.method || 'own_vehicle',
    carrierName: initial.carrier || '',
    trackingNumber: initial.trackingNumber || '',
    lrNumber: initial.lrNumber || '',
    trackingUrl: initial.trackingUrl || '',
    vehicleNumber: initial.vehicle || '',
    driverName: initial.driverName || '',
    driverPhone: initial.driverPhone || '',
    expectedDelivery: initial.expectedDelivery || '',
    notes: initial.notes || '',
  })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const m = f.method

  return (
    <div className="wh-modal-backdrop" onClick={onCancel}>
      <form
        className="wh-modal wh-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wh-ship-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(f)
        }}
      >
        <button type="button" className="wh-modal-x" onClick={onCancel} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-ship-title">{title}</h2>
        {subtitle && <p className="wh-muted">{subtitle}</p>}

        <fieldset className="wh-methods">
          <legend>How is it going?</legend>
          {METHODS.map((x) => (
            <label key={x.key} className={`wh-method${m === x.key ? ' is-on' : ''}`}>
              <input type="radio" name="method" value={x.key} checked={m === x.key} onChange={set('method')} />
              <strong>{x.label}</strong>
              <span>Needs {x.needs}</span>
            </label>
          ))}
        </fieldset>

        <div className="wh-form-grid">
          {(m === 'courier' || m === 'transport') && (
            <label className="wh-filter">
              <span>{m === 'courier' ? 'Courier' : 'Transport company'} *</span>
              <input className="wh-input" value={f.carrierName} onChange={set('carrierName')} required
                placeholder={m === 'courier' ? 'e.g. DTDC, Professional' : 'e.g. KPN, VRL'} />
            </label>
          )}
          {m === 'courier' && (
            <label className="wh-filter">
              <span>Tracking number *</span>
              <input className="wh-input" value={f.trackingNumber} onChange={set('trackingNumber')} required />
            </label>
          )}
          {m === 'transport' && (
            <label className="wh-filter">
              <span>LR number *</span>
              <input className="wh-input" value={f.lrNumber} onChange={set('lrNumber')} required />
            </label>
          )}
          {m === 'courier' && (
            <label className="wh-filter wh-span-2">
              <span>Courier tracking link (optional)</span>
              <input className="wh-input" type="url" value={f.trackingUrl} onChange={set('trackingUrl')} placeholder="https://" />
            </label>
          )}
          {(m === 'own_vehicle' || m === 'transport') && (
            <label className="wh-filter">
              <span>Vehicle number{m === 'own_vehicle' ? ' *' : ''}</span>
              <input className="wh-input" value={f.vehicleNumber} onChange={set('vehicleNumber')} required={m === 'own_vehicle'}
                placeholder="TN 33 AB 1234" />
            </label>
          )}
          {m !== 'pickup' && m !== 'courier' && (
            <>
              <label className="wh-filter">
                <span>Driver name</span>
                <input className="wh-input" value={f.driverName} onChange={set('driverName')} />
              </label>
              <label className="wh-filter">
                <span>Driver phone</span>
                <input className="wh-input" value={f.driverPhone} onChange={set('driverPhone')} inputMode="tel" />
              </label>
            </>
          )}
          {m !== 'pickup' && (
            <label className="wh-filter">
              <span>Expected delivery</span>
              <input className="wh-input" type="date" value={f.expectedDelivery} onChange={set('expectedDelivery')} />
            </label>
          )}
          <label className="wh-filter wh-span-2">
            <span>Notes</span>
            <input className="wh-input" value={f.notes} onChange={set('notes')} placeholder="Anything dispatch should know" />
          </label>
        </div>

        <div className="wh-modal-actions">
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>
            <Icon name="truck" size={18} /> {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
