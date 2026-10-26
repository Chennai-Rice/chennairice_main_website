import { useCallback, useRef, useState } from 'react'
import { CHAT_ENDPOINT, FALLBACK_MESSAGE, matchProducts } from '../data/chatbot.js'

let idCounter = 0
const nextId = () => `msg-${++idCounter}-${Date.now()}`

// Order tracking is answered by the website itself, not the AI: an order
// number (CR-20261023-ABCDE) or shipment ID (SHP-XXXX-XXXX) in a message is
// looked up at /api/orders/track and shown as an order card. "Track My Order"
// (or a "where is my order" question) asks for the number first.
const ORDER_REF = /\b(CR-\d{8}-[0-9A-Z]{4,5}|SHP-[A-Z0-9]{4}-[A-Z0-9]{4}(?:-\d+)?)\b/i
const WANTS_TRACKING = /where is my order|track (my )?order|order status|my order|ஆர்டர் (எங்கே|நிலை)|என் ஆர்டர்/i
// Delivery is checked by the website too: a 6-digit PIN code with a delivery
// question (or on its own, or after Soru Kutty asked for one) is looked up at
// /api/delivery and shown as a delivery card.
const PINCODE = /(?<!\d)([1-9]\d{2}\s?\d{3})(?!\d)/
const WANTS_DELIVERY = /deliver|delivery|pin ?code|pincode|shipping charge|delivery charge|courier charge|டெலிவரி|அஞ்சல் குறியீடு|பின் ?கோட்/i
const TAMIL = /[஀-௿]/
const WHATSAPP = 'https://wa.me/917066646667'

const TEXT = {
  en: {
    ask: 'Sure! Please send your order number — it looks like CR-20261023-ABC12 and is on your order SMS, email or receipt. 📦',
    again: "I couldn't spot an order number in that. It looks like CR-20261023-ABC12 (or a shipment ID like SHP-AB12-CD34). Please send it here.",
    found: (o) => `Here's your order ${o.orderNumber}:`,
    notFound: "I couldn't find that order. Please check the number on your SMS, email or receipt — or message us on WhatsApp and we'll check for you.",
    failed: "Sorry, I couldn't check orders right now. Please try again in a minute, or message us on WhatsApp.",
    whatsapp: 'Message us on WhatsApp →',
    askPin: 'Sure! Please send your 6-digit PIN code and I\'ll check delivery and the delivery charge for you. 📍',
    pinFound: (d) => `Good news — we deliver to ${d.pincode}! 🚚`,
    pinNo: (pin) => `Sorry, we don't deliver to ${pin} yet. Message us on WhatsApp and we'll see what we can do.`,
    pinFailed: "Sorry, I couldn't check delivery right now. Please try again in a minute, or message us on WhatsApp.",
  },
  ta: {
    ask: 'நிச்சயமாக! உங்கள் ஆர்டர் எண்ணை அனுப்புங்கள் — அது CR-20261023-ABC12 போல இருக்கும், உங்கள் SMS, மின்னஞ்சல் அல்லது ரசீதில் இருக்கும். 📦',
    again: 'அதில் ஆர்டர் எண் கிடைக்கவில்லை. அது CR-20261023-ABC12 போல இருக்கும் (அல்லது SHP-AB12-CD34 போன்ற ஷிப்மென்ட் ID). இங்கே அனுப்புங்கள்.',
    found: (o) => `உங்கள் ஆர்டர் ${o.orderNumber} விவரம்:`,
    notFound: 'அந்த ஆர்டர் கிடைக்கவில்லை. உங்கள் SMS, மின்னஞ்சல் அல்லது ரசீதில் உள்ள எண்ணை சரிபாருங்கள் — அல்லது WhatsApp-ல் எங்களுக்கு செய்தி அனுப்புங்கள்.',
    failed: 'மன்னிக்கவும், இப்போது ஆர்டரை சரிபார்க்க முடியவில்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும், அல்லது WhatsApp-ல் செய்தி அனுப்புங்கள்.',
    whatsapp: 'WhatsApp-ல் செய்தி அனுப்ப →',
    askPin: 'நிச்சயமாக! உங்கள் 6 இலக்க PIN கோடை அனுப்புங்கள் — டெலிவரி மற்றும் டெலிவரி கட்டணத்தை சரிபார்க்கிறேன். 📍',
    pinFound: (d) => `நல்ல செய்தி — ${d.pincode}-க்கு டெலிவரி செய்கிறோம்! 🚚`,
    pinNo: (pin) => `மன்னிக்கவும், ${pin}-க்கு இன்னும் டெலிவரி இல்லை. WhatsApp-ல் செய்தி அனுப்புங்கள், நாங்கள் பார்க்கிறோம்.`,
    pinFailed: 'மன்னிக்கவும், இப்போது டெலிவரியை சரிபார்க்க முடியவில்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும், அல்லது WhatsApp-ல் செய்தி அனுப்புங்கள்.',
  },
}

/**
 * Owns the Soru Kutty conversation: message list, in-flight state, the call
 * to /api/chat for everything else, and order tracking. Product cards are
 * attached client-side by keyword-matching the assistant's own reply.
 */
export default function useChat() {
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const historyRef = useRef([]) // role/content pairs sent to the API, kept separate from UI-only fields
  const awaitingOrderRef = useRef(false) // asked for an order number, waiting for it
  const awaitingPinRef = useRef(false) // asked for a PIN code, waiting for it
  const langRef = useRef('en') // the customer's language, kept when a message is only an order number

  const say = (msg) => setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', ...msg }])

  const trackOrder = useCallback(async (ref, lang) => {
    const t = TEXT[lang]
    try {
      const res = await fetch('/api/orders/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: ref }),
      })
      if (res.status === 404) return say({ text: t.notFound, link: { href: WHATSAPP, label: t.whatsapp } })
      if (!res.ok) throw new Error('track failed')
      const order = await res.json()
      awaitingOrderRef.current = false
      say({ text: t.found(order), order, lang })
    } catch {
      say({ text: t.failed, link: { href: WHATSAPP, label: t.whatsapp } })
    }
  }, [])

  const checkDelivery = useCallback(async (pin, lang) => {
    const t = TEXT[lang]
    try {
      const res = await fetch('/api/delivery?pincode=' + encodeURIComponent(pin))
      if (!res.ok) throw new Error('delivery failed')
      const delivery = await res.json()
      awaitingPinRef.current = false
      if (!delivery.delivers) return say({ text: t.pinNo(delivery.pincode), link: { href: WHATSAPP, label: t.whatsapp } })
      say({ text: t.pinFound(delivery), delivery, lang })
    } catch {
      say({ text: t.pinFailed, link: { href: WHATSAPP, label: t.whatsapp } })
    }
  }, [])

  const sendMessage = useCallback(async text => {
    const trimmed = text.trim()
    if (!trimmed || isThinking) return

    const userMessage = { id: nextId(), role: 'user', text: trimmed }
    setMessages(prev => [...prev, userMessage])
    // Tamil or English as the customer writes; a bare order number keeps the language already in use.
    const words = trimmed.replace(ORDER_REF, '').replace(/[^\p{L}]/gu, '')
    if (words) langRef.current = TAMIL.test(trimmed) ? 'ta' : 'en'
    const lang = langRef.current

    // Orders: an order number anywhere in the message is looked up directly.
    const ref = trimmed.match(ORDER_REF)?.[1]
    if (ref) {
      setIsThinking(true)
      await trackOrder(ref.toUpperCase(), lang)
      setIsThinking(false)
      return
    }
    if (WANTS_TRACKING.test(trimmed) && trimmed.length < 60) {
      awaitingOrderRef.current = true
      say({ text: TEXT[lang].ask })
      return
    }
    if (awaitingOrderRef.current && /\d{6,}|cr-?\d/i.test(trimmed)) {
      say({ text: TEXT[lang].again })
      return
    }
    awaitingOrderRef.current = false

    // Delivery: a PIN code asked about, sent on its own, or sent after we asked for one.
    const pin = trimmed.match(PINCODE)?.[1]?.replace(/\s/g, '')
    const pinOnly = pin && trimmed.replace(PINCODE, '').replace(/[^\p{L}]/gu, '').length < 12
    if (pin && (awaitingPinRef.current || pinOnly || WANTS_DELIVERY.test(trimmed))) {
      setIsThinking(true)
      await checkDelivery(pin, lang)
      setIsThinking(false)
      return
    }
    if (WANTS_DELIVERY.test(trimmed) && trimmed.length < 80) {
      awaitingPinRef.current = true
      say({ text: TEXT[lang].askPin })
      return
    }
    awaitingPinRef.current = false

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
      const products = isDisclaimer ? [] : matchProducts(reply)

      setMessages(prev => [
        ...prev,
        { id: nextId(), role: 'assistant', text: reply, products, lang },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { id: nextId(), role: 'assistant', text: FALLBACK_MESSAGE.text, fallback: true },
      ])
    } finally {
      setIsThinking(false)
    }
  }, [isThinking, trackOrder, checkDelivery])

  const reset = useCallback(() => {
    setMessages([])
    historyRef.current = []
    awaitingOrderRef.current = false
    awaitingPinRef.current = false
    langRef.current = 'en'
    setIsThinking(false)
  }, [])

  return { messages, isThinking, sendMessage, reset }
}
