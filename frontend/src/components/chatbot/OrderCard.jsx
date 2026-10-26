import { Link } from 'react-router-dom'

// An order in the chat: number, items, a five-step progress bar and the
// courier link — from /api/orders/track (the same lookup as the Track Order page).

const STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered']
const LABEL = {
  en: { placed: 'Paid', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Dispatched', delivered: 'Delivered',
    cancelled: 'Cancelled', returned: 'Returned', order: 'Order', track: 'Track on courier site', details: 'Full details',
    courier: 'Courier', awb: 'Tracking no.', expected: 'Expected by', on: 'Ordered on' },
  ta: { placed: 'பணம் செலுத்தப்பட்டது', confirmed: 'உறுதி செய்யப்பட்டது', packed: 'பேக் செய்யப்பட்டது', shipped: 'அனுப்பப்பட்டது', delivered: 'டெலிவரி ஆனது',
    cancelled: 'ரத்து செய்யப்பட்டது', returned: 'திருப்பி அனுப்பப்பட்டது', order: 'ஆர்டர்', track: 'கூரியர் தளத்தில் பார்க்க', details: 'முழு விவரம்',
    courier: 'கூரியர்', awb: 'டிராக்கிங் எண்', expected: 'எதிர்பார்க்கும் தேதி', on: 'ஆர்டர் செய்த நாள்' },
}
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')

export default function OrderCard({ order, lang = 'en' }) {
  const t = LABEL[lang] || LABEL.en
  const stopped = order.status === 'cancelled' || order.status === 'returned'
  const reached = STEPS.indexOf(order.status)
  const ship = order.shipments?.[order.shipments.length - 1]
  return (
    <div className="sk-order">
      <div className="sk-order-head">
        <span className="sk-order-label">{t.order}</span>
        <strong className="sk-order-no">{order.orderNumber}</strong>
        {order.placedAt && <span className="sk-order-date">{t.on} {day(order.placedAt)}</span>}
      </div>
      <ul className="sk-order-items">
        {order.items.map((i) => <li key={i.name + i.packKg}>{i.qty} × {i.name} {Number(i.packKg)} kg</li>)}
      </ul>
      {stopped ? (
        <p className="sk-order-stopped">{t[order.status]}</p>
      ) : (
        <ol className="sk-order-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= reached ? (i === reached ? 'is-now' : 'is-done') : ''}>
              <span className="sk-order-dot" aria-hidden="true" />
              <span className="sk-order-step">{t[s]}</span>
            </li>
          ))}
        </ol>
      )}
      {ship && (ship.carrier || ship.trackingNumber) && (
        <p className="sk-order-ship">
          {ship.carrier && <>{t.courier}: <strong>{ship.carrier}</strong></>}
          {ship.trackingNumber && <> · {t.awb}: <strong>{ship.trackingNumber}</strong></>}
          {ship.expectedDelivery && !ship.deliveredAt && <> · {t.expected} {day(ship.expectedDelivery)}</>}
        </p>
      )}
      <div className="sk-order-actions">
        {ship?.trackingUrl && (
          <a className="sk-order-btn is-primary" href={ship.trackingUrl} target="_blank" rel="noopener noreferrer">{t.track} →</a>
        )}
        <Link className="sk-order-btn" to={`/track-order?order=${encodeURIComponent(order.orderNumber)}`}>{t.details}</Link>
      </div>
    </div>
  )
}
