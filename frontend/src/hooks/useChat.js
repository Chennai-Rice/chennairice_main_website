import { useCallback, useRef, useState } from 'react'
import { CHAT_ENDPOINT, FALLBACK_MESSAGE, matchProduct } from '../data/chatbot.js'

let idCounter = 0
const nextId = () => `msg-${++idCounter}-${Date.now()}`

/**
 * Owns the Soru Kutty conversation: message list, in-flight state, and the
 * call to the local /api/chat proxy (see server/). Product cards are
 * attached client-side by keyword-matching the assistant's own reply, so
 * the server stays a plain text-in/text-out proxy.
 */
export default function useChat() {
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const historyRef = useRef([]) // role/content pairs sent to the API, kept separate from UI-only fields

  const sendMessage = useCallback(async text => {
    const trimmed = text.trim()
    if (!trimmed || isThinking) return

    const userMessage = { id: nextId(), role: 'user', text: trimmed }
    setMessages(prev => [...prev, userMessage])
    historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }]
    setIsThinking(true)

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
      })

      if (!res.ok) throw new Error('chat request failed')
      const data = await res.json()
      const reply = data.reply

      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      // Match only against Soru Kutty's own reply, and only when it isn't a
      // "we don't have that verified" disclaimer — a mention in the user's
      // question alone shouldn't attach a card to an unrelated answer.
      const isDisclaimer = /don't have verified|not fully sure|let me connect you/i.test(reply)
      const product = isDisclaimer ? null : matchProduct(reply)

      setMessages(prev => [
        ...prev,
        { id: nextId(), role: 'assistant', text: reply, product },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { id: nextId(), role: 'assistant', text: FALLBACK_MESSAGE.text, fallback: true },
      ])
    } finally {
      setIsThinking(false)
    }
  }, [isThinking])

  const reset = useCallback(() => {
    setMessages([])
    historyRef.current = []
    setIsThinking(false)
  }, [])

  return { messages, isThinking, sendMessage, reset }
}
