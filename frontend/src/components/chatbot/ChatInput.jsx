import { useState } from 'react'
import { PlusIcon, MicIcon, SendIcon } from './icons.jsx'

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('')

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="sk-input-area">
      <div className="sk-input-shell">
        <button type="button" className="sk-input-round-btn" aria-label="Add attachment" tabIndex={-1}>
          <PlusIcon />
        </button>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Soru Kutty anything..."
          aria-label="Message Soru Kutty"
          disabled={disabled}
        />
        <button type="button" className="sk-input-round-btn" aria-label="Voice input" tabIndex={-1}>
          <MicIcon />
        </button>
        <button
          type="button"
          className="sk-input-round-btn sk-send-btn"
          aria-label="Send message"
          onClick={submit}
          disabled={disabled || !value.trim()}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
