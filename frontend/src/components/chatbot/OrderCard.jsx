import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../shop/hooks/useCart.jsx'
import { loadCatalog, cartLine } from './chatCatalog.js'

// An order in the chat: number, items, a five-step progress bar and the
// courier link — from /api/orders/track (the same lookup as the Track Order page).

const STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered']
const LABEL = {
  en: { placed: 'Paid', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Dispatched', delivered: 'Delivered',
    cancelled: 'Cancelled', returned: 'Returned', order: 'Order', track: 'Track on courier site', details: 'Full details',
    courier: 'Courier', awb: 'Tracking no.', expected: 'Expected by', on: 'Ordered on',
    reorder: 'Reorder these items', added: (n) => `Added ${n} pack${n === 1 ? '' : 's'} to your cart.`, skipped: 'Not available right now:', none: 'None of these packs can be ordered right now.', failed: 'Could not reach the shop. Please try again.', cart: 'Go to cart →' },
  ta: { placed: 'பணம் செலுத்தப்பட்டது', confirmed: 'உறுதி செய்யப்பட்டது', packed: 'பேக் செய்யப்பட்டது', shipped: 'அனுப்பப்பட்டது', delivered: 'டெலிவரி ஆனது',
    cancelled: 'ரத்து செய்யப்பட்டது', returned: 'திருப்பி அனுப்பப்பட்டது', order: 'ஆர்டர்', track: 'கூரியர் தளத்தில் பார்க்க', details: 'முழு விவரம்',
    courier: 'கூரியர்', awb: 'டிராக்கிங் எண்', expected: 'எதிர்பார்க்கும் தேதி', on: 'ஆர்டர் செய்த நாள்',
    reorder: 'இதே பொருட்களை மீண்டும் ஆர்டர் செய்ய', added: (n) => `${n} பேக் உங்கள் கார்ட்டில் சேர்க்கப்பட்டது.`, skipped: 'இப்போது கிடைக்காதவை:', none: 'இந்த பேக்குகள் எதுவும் இப்போது கிடைக்கவில்லை.', failed: 'கடையை அணுக முடியவில்லை. மீண்டும் முயற்சிக்கவும்.', cart: 'கார்ட்டுக்கு செல்ல →' },
}
/**
 * "Reorder these items": the same packs and quantities go into the cart at
 * today's prices. Packs that are out of stock or no longer sold are left out
 * and named.
 */
function Reorder({ items, t }) {
  const { items: cart, add, setQty } = useCart()
  const [result, setResult] = useState(null)
  const reorder = async () => {
    try {
      const bySlug = await loadCatalog()
      let added = 0
      const skipped = []
      for (const item of items) {
        const m = /^(.+)-(\d+(?:\.\d+)?)kg$/.exec(item.id || '')
        const product = m && bySlug.get(m[1])
        const variant = product?.variants.find((v) => Number(v.packKg) === Number(m[2]))
        if (!variant?.inStock) { skipped.push(`${item.name} ${Number(item.packKg)} kg`); continue }
        const line = cartLine(product, variant)
        const have = cart.find((c) => c.id === line.id)?.qty || 0
        if (!have) add(line)
        setQty(line.id, have + item.qty)
        added += item.qty
      }
      setResult({ added, skipped })
    } catch {
      setResult({ failed: true })
    }
  }
  if (!result) return <button type="button" className="sk-order-btn is-primary" onClick={reorder}>{t.reorder}</button>
  return (
    <div className="sk-reorder-result">
      {result.failed ? t.failed : result.added ? t.added(result.added) : t.none}
      {result.skipped?.length > 0 && <span> {t.skipped} {result.skipped.join(', ')}</span>}
      {result.added > 0 && <Link className="sk-order-btn is-primary" to="/cart">{t.cart}</Link>}
    </div>
  )
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
        {order.items.some((i) => i.id) && <Reorder items={order.items} t={t} />}
        {ship?.trackingUrl && (
          <a className="sk-order-btn is-primary" href={ship.trackingUrl} target="_blank" rel="noopener noreferrer">{t.track} →</a>
        )}
        <Link className="sk-order-btn" to={`/track-order?order=${encodeURIComponent(order.orderNumber)}`}>{t.details}</Link>
      </div>
    </div>
  )
}
