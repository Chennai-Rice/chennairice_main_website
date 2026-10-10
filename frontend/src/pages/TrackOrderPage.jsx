import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import './page.css'
import './trackorder.css'

// The order a customer can follow, in the order it happens. Cancelled and
// returned are shown as a banner instead, because they end the journey early.
// The warehouse works with one switch (Dispatched), so the customer sees the
// same three steps. Confirmed / packed orders are still "placed" to them.
const STEPS = [
  { key: 'placed', label: 'Order placed' },
  { key: 'shipped', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
]
const STEP_OF = { placed: 0, confirmed: 0, packed: 0, shipped: 1, delivered: 2 }

const METHOD = {
  own_vehicle: 'Our own vehicle',
  courier: 'Courier',
  transport: 'Transport (lorry)',
  pickup: 'Pickup from our mill',
}

// Anything that looks like an order number (CR-20261008-K7M4Q, or the older
// CR-20261006-592A) or shipment ID (SHP-K7M4-Q9X2), wherever it sits in what
// was pasted.
const ID_PATTERN = /\b(?:CR-\d{8}-[0-9A-Z]{4,5}|SHP-[A-Z0-9]{4}-[A-Z0-9]{4}(?:-\d+)?)\b/i

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
      })
    : ''
const day = (d) =>
  d ? new Date(d + (d.length === 10 ? 'T00:00:00+05:30' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

async function fetchTracking(body) {
  const res = await fetch('/api/orders/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 404 && !data.error) {
    throw new Error('Online tracking is not available yet. Please call us on +91 70666 46667 with your order number.')
  }
  if (!res.ok) throw new Error(data.error || 'We could not look up that order. Please try again.')
  return data
}

export default function TrackOrderPage() {
  usePageMeta(
    'Track your order — Chennai Rice Industries',
    'Follow your Chennai Rice order from our Erode mill to your door with your order number or shipment ID.'
  )
  const [params] = useSearchParams()
  const [orderRef, setOrderRef] = useState(params.get('order') || '')
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })
  const [copied, setCopied] = useState('')
  const copyNumber = (n) => {
    navigator.clipboard?.writeText(n).then(() => setCopied(n), () => {})
  }

  async function track(body) {
    setState({ status: 'loading', data: null, error: '' })
    try {
      setState({ status: 'done', data: await fetchTracking(body), error: '' })
    } catch (err) {
      setState({ status: 'error', data: null, error: err.message })
    }
  }

  // Arriving from the receipt's "Track order" button (or any link carrying
  // ?order=), the status shows straight away.
  useEffect(() => {
    const order = params.get('order')
    const id = params.get('id')
    if (order) track({ orderNumber: order, ...(id ? { orderId: id } : {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pasting is the whole job: pick the ID out of whatever was pasted and look
  // it up at once.
  function onPaste(event) {
    const match = event.clipboardData.getData('text').match(ID_PATTERN)
    if (!match) return
    event.preventDefault()
    setOrderRef(match[0].toUpperCase())
    track({ orderNumber: match[0] })
  }

  function onSubmit(event) {
    event.preventDefault()
    if (!ID_PATTERN.test(orderRef)) {
      setState({ status: 'error', data: null, error: 'Enter an order number (CR-…) or shipment ID (SHP-…) from your receipt.' })
      return
    }
    track({ orderNumber: orderRef })
  }

  const data = state.data
  const reached = data ? new Map(data.timeline.map((t) => [t.status, t.at])) : new Map()
  const currentIndex = data ? STEP_OF[data.status] ?? -1 : -1
  const ended = data && (data.status === 'cancelled' || data.status === 'returned')

  return (
    <main className="page track-page">
      <div className="container">
        <div className="page-inner page-inner--wide track-inner">
          <p className="section-label">Order tracking</p>
          <h1 className="page-title">Track your order</h1>
          <p className="page-text">Paste your order number or shipment ID from your receipt.</p>

          <form className="contact-form track-form" onSubmit={onSubmit} noValidate>
            <label className="field">
              <span className="field-label">Order number or shipment ID</span>
              <input
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value.toUpperCase())}
                onPaste={onPaste}
                placeholder="CR-20261008-K7M4Q or SHP-K7M4-Q9X2"
                autoComplete="off"
                spellCheck="false"
              />
            </label>
            <button className="btn-maroon" type="submit" disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Looking up…' : 'Track order'}
            </button>
          </form>

          {state.status === 'error' && (
            <p className="track-error" role="alert">{state.error}</p>
          )}

          {data && (
            <section className="track-result" aria-live="polite">
              <header className="track-head">
                <div>
                  <span className="track-k">Order</span>
                  <strong className="track-mono">{data.orderNumber}</strong>
                </div>
                <div>
                  <span className="track-k">Shipment ID</span>
                  <strong className="track-mono">{data.shipments[0]?.shipmentId || data.shipmentId}</strong>
                </div>
                <div>
                  <span className="track-k">Delivering to</span>
                  <strong className="track-city">{data.city}</strong>
                </div>
              </header>

              {ended ? (
                <p className="track-ended">
                  This order was {data.status}
                  {reached.get(data.status) ? ' on ' + when(reached.get(data.status)) : ''}.
                  {data.paymentStatus === 'refunded' && ' Your payment has been refunded.'}
                  {' '}For help, call +91 70666 46667.
                </p>
              ) : (
                <ol className="track-steps">
                  {STEPS.map((step, i) => {
                    const done = i <= currentIndex
                    return (
                      <li
                        key={step.key}
                        className={`track-step${done ? ' is-done' : ''}${i === currentIndex ? ' is-current' : ''}`}
                      >
                        <span className="track-dot" aria-hidden="true">{done ? '✓' : i + 1}</span>
                        <span className="track-label">{step.label}</span>
                        {/* Only the date a step was reached; steps still to come stay bare. */}
                        {/* `done` as well: a step the warehouse switched back off
                            still has a date in the history but is not reached. */}
                        {done && reached.get(step.key) && <span className="track-note">{when(reached.get(step.key))}</span>}
                      </li>
                    )
                  })}
                </ol>
              )}

              {data.shipments.map((s) => (
                <div className="track-shipment" key={s.shipmentId}>
                  <h2>
                    {METHOD[s.method] || s.method}
                    {s.carrier ? ' · ' + s.carrier : ''}
                  </h2>
                  <dl>
                    <div><dt>Shipment ID</dt><dd className="track-mono">{s.shipmentId}</dd></div>
                    {s.trackingNumber && <div><dt>Tracking number</dt><dd className="track-mono">{s.trackingNumber}</dd></div>}
                    {s.lrNumber && <div><dt>LR number</dt><dd className="track-mono">{s.lrNumber}</dd></div>}
                    {s.shippedAt && <div><dt>Shipped</dt><dd>{when(s.shippedAt)}</dd></div>}
                    {s.status === 'delivered'
                      ? <div><dt>Delivered</dt><dd>{when(s.deliveredAt)}</dd></div>
                      : s.expectedDelivery && <div><dt>Expected delivery</dt><dd>{day(s.expectedDelivery)}</dd></div>}
                  </dl>
                  {s.trackingUrl && !s.trackingPrefilled && s.trackingNumber && (
                    <p className="track-paste">
                      The {s.carrier || 'courier'} page asks for the tracking number: copy it, then paste it there.
                      <button type="button" className="track-copy" onClick={() => copyNumber(s.trackingNumber)}>
                        {copied === s.trackingNumber ? 'Copied ✓' : 'Copy ' + s.trackingNumber}
                      </button>
                    </p>
                  )}
                  {s.trackingUrl && (
                    <a className="btn-outline" href={s.trackingUrl} target="_blank" rel="noopener noreferrer"
                      onClick={() => { if (!s.trackingPrefilled && s.trackingNumber) copyNumber(s.trackingNumber) }}>
                      Track on {s.carrier || 'the courier website'}
                    </a>
                  )}
                </div>
              ))}

              <div className="track-items">
                <h2>In this order</h2>
                <ul>
                  {data.items.map((item, i) => (
                    <li key={i}>
                      {item.qty} × {item.name} ({item.packKg} kg)
                    </li>
                  ))}
                </ul>
              </div>

              <p className="track-help">
                Questions about this order? Call <a href="tel:+917066646667">+91 70666 46667</a> or{' '}
                <Link to="/contact">write to us</Link>, quoting {data.orderNumber}.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
