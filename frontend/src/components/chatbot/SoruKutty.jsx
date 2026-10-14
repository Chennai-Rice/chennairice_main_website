import { useCallback, useId, useRef, useState } from 'react'
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
          <button
            type="button"
            className="sk-launcher-btn"
            aria-label={`Open ${SORU_KUTTY.name} chat`}
            onClick={open}
          >
            <picture>
              <source srcSet="/assets/soru-kutty-hello.webp" type="image/webp" />
              <img
                className="sk-launcher-avatar"
                src="/assets/soru-kutty-hello.png"
                alt=""
                width="320"
                height="271"
              />
            </picture>
          </button>
        </div>
      )}
    </div>
  )
}
