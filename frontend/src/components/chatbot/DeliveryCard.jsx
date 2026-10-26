import { Link } from 'react-router-dom'
import { rupees } from './chatCatalog.js'

const TEXT = {
  en: { yes: 'We deliver here', charge: 'Delivery charge per pack', note: 'Added in your cart at checkout.', shop: 'Shop rice →', pack: 'kg pack' },
  ta: { yes: 'இங்கே டெலிவரி செய்கிறோம்', charge: 'ஒரு பேக்கிற்கு டெலிவரி கட்டணம்', note: 'செக்அவுட்டில் கார்ட்டில் சேர்க்கப்படும்.', shop: 'அரிசி வாங்க →', pack: 'கிலோ பேக்' },
}

/** "Do you deliver to my PIN code?" — from /api/delivery: the region and the charge per pack size. */
export default function DeliveryCard({ delivery, lang = 'en' }) {
  const t = TEXT[lang] || TEXT.en
  return (
    <div className="sk-order sk-delivery">
      <div className="sk-order-head">
        <span className="sk-order-label">PIN {delivery.pincode}</span>
        <strong className="sk-delivery-yes">✓ {t.yes} · {delivery.region.name}</strong>
      </div>
      {delivery.charges.length > 0 && (
        <>
          <p className="sk-delivery-title">{t.charge}</p>
          <ul className="sk-delivery-list">
            {delivery.charges.map((c) => (
              <li key={c.packKg}>
                <span>{c.packKg} {t.pack}</span>
                <strong>{c.from === c.to ? rupees(c.from) : `${rupees(c.from)} – ${rupees(c.to)}`}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="sk-delivery-note">{t.note}</p>
      <div className="sk-order-actions">
        <Link className="sk-order-btn is-primary" to="/rice-products">{t.shop}</Link>
      </div>
    </div>
  )
}
