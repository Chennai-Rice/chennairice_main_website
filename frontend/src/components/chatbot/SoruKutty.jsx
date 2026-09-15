import { useCallback, useId, useRef, useState } from 'react'
import { RiceGrainIcon } from './icons.jsx'
import ChatWindow from './ChatWindow.jsx'
import useChat from '../../hooks/useChat.js'
import { SORU_KUTTY } from '../../data/chatbot.js'
import './chatbot.css'

const CLOSE_ANIMATION_MS = 280

/**
 * Floating Soru Kutty launcher + chat window, mounted once at the app root
 * (see App.jsx) alongside the global Navbar/Footer. Self-contained: no
 * existing page or component is modified to add this.
 */
export default function SoruKutty() {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimeoutRef = useRef(null)
  const titleId = useId()
  const chat = useChat()

  const open = useCallback(() => {
    clearTimeout(closeTimeoutRef.current)
    setIsClosing(false)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsClosing(true)
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
    }, CLOSE_ANIMATION_MS)
  }, [])

  return (
    <div className="sk" data-analytics-ignore="">
      {isOpen && (
        <ChatWindow chat={chat} isClosing={isClosing} onClose={close} onMinimize={close} titleId={titleId} />
      )}

      {!isOpen && (
        <div className="sk-launcher">
          <div className="sk-launcher-tooltip" role="tooltip">
            <span className="sk-launcher-tooltip-name">{SORU_KUTTY.name}</span>
            <span className="sk-launcher-tooltip-sub">{SORU_KUTTY.tooltip}</span>
          </div>
          <button
            type="button"
            className="sk-launcher-btn"
            aria-label={`Open ${SORU_KUTTY.name} chat`}
            onClick={open}
          >
            <RiceGrainIcon className="sk-launcher-icon" />
          </button>
        </div>
      )}
    </div>
  )
}
