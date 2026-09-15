import { useEffect, useRef } from 'react'
import { RiceGrainIcon, CloseIcon, MinimizeIcon } from './icons.jsx'
import ChatOrb from './ChatOrb.jsx'
import ChatMessage from './ChatMessage.jsx'
import ChatInput from './ChatInput.jsx'
import { QuickActionsGrid, OptionPills } from './QuickActions.jsx'
import { SORU_KUTTY, COOKING_OPTIONS, NUTRITION_OPTIONS } from '../../data/chatbot.js'

const COOKING_TRIGGER = 'which rice should i buy'
const NUTRITION_TRIGGER = 'tell me about the nutrition.'

export default function ChatWindow({ chat, isClosing, onClose, onMinimize, titleId }) {
  const { messages, isThinking, sendMessage } = chat
  const bodyRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [messages, isThinking])

  const lastMessage = messages[messages.length - 1]
  const lastUserText = lastMessage?.role === 'user' ? lastMessage.text.trim().toLowerCase() : null

  const showCookingOptions = !isThinking && lastUserText === COOKING_TRIGGER
  const showNutritionOptions = !isThinking && lastUserText === NUTRITION_TRIGGER

  const handleEscKey = e => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className={`sk-window${isClosing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleEscKey}
    >
      <header className="sk-header">
        <div className="sk-header-avatar" aria-hidden="true">
          <RiceGrainIcon />
        </div>
        <div className="sk-header-text">
          <div className="sk-header-name" id={titleId}>{SORU_KUTTY.name}</div>
          <div className="sk-header-tagline">{SORU_KUTTY.tagline}</div>
        </div>
        <div className="sk-header-actions">
          <button type="button" className="sk-icon-btn" aria-label="Minimize chat" onClick={onMinimize}>
            <MinimizeIcon />
          </button>
          <button type="button" className="sk-icon-btn" aria-label="Close chat" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="sk-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="sk-welcome">
            <ChatOrb />
            <h2 className="sk-welcome-title">{SORU_KUTTY.greetingTitle}</h2>
            <p className="sk-welcome-sub">{SORU_KUTTY.greetingSubtitle}</p>
            <QuickActionsGrid onSelect={sendMessage} />
          </div>
        )}

        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {showCookingOptions && (
          <OptionPills options={COOKING_OPTIONS} onSelect={sendMessage} label="What are you cooking?" />
        )}
        {showNutritionOptions && (
          <OptionPills options={NUTRITION_OPTIONS} onSelect={sendMessage} label="Which rice variety?" />
        )}

        {isThinking && (
          <div className="sk-msg-row is-assistant sk-thinking" aria-live="polite" aria-label="Soru Kutty is thinking">
            <div className="sk-msg-avatar" aria-hidden="true">
              <RiceGrainIcon />
            </div>
            <div className="sk-thinking-bubble">
              <span className="sk-thinking-dot" />
              <span className="sk-thinking-dot" />
              <span className="sk-thinking-dot" />
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={sendMessage} disabled={isThinking} />
    </div>
  )
}
