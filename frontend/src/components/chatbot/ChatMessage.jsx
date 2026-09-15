import { Link } from 'react-router-dom'
import { RiceGrainIcon } from './icons.jsx'
import ProductCard from './ProductCard.jsx'
import { FALLBACK_MESSAGE } from '../../data/chatbot.js'

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user'

  return (
    <>
      <div className={`sk-msg-row ${isUser ? 'is-user' : 'is-assistant'}`}>
        {!isUser && (
          <div className="sk-msg-avatar" aria-hidden="true">
            <RiceGrainIcon />
          </div>
        )}
        <div className="sk-msg-bubble">
          {message.text}
          {message.fallback && (
            <Link className="sk-msg-cta" to={FALLBACK_MESSAGE.cta.to}>
              {FALLBACK_MESSAGE.cta.label}
            </Link>
          )}
        </div>
      </div>
      {message.product && <ProductCard product={message.product} />}
    </>
  )
}
