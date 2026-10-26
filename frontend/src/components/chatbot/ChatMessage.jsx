import { Link } from 'react-router-dom'
import ProductCard from './ProductCard.jsx'
import OrderCard from './OrderCard.jsx'
import DeliveryCard from './DeliveryCard.jsx'
import { FALLBACK_MESSAGE } from '../../data/chatbot.js'

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user'

  return (
    <>
      <div className={`sk-msg-row ${isUser ? 'is-user' : 'is-assistant'}`}>
        {!isUser && (
          <div className="sk-msg-avatar" aria-hidden="true">
            <img src="/assets/soru-kutty-face.webp" alt="" width="28" height="28" />
          </div>
        )}
        <div className="sk-msg-bubble">
          {message.text}
          {message.fallback && (
            <Link className="sk-msg-cta" to={FALLBACK_MESSAGE.cta.to}>
              {FALLBACK_MESSAGE.cta.label}
            </Link>
          )}
          {message.link && (
            <a className="sk-msg-cta" href={message.link.href} target="_blank" rel="noopener noreferrer">
              {message.link.label}
            </a>
          )}
        </div>
      </div>
      {message.order && <OrderCard order={message.order} lang={message.lang} />}
      {message.delivery && <DeliveryCard delivery={message.delivery} lang={message.lang} />}
      {message.products?.map((p) => <ProductCard key={p.id} product={p} lang={message.lang} />)}
    </>
  )
}
