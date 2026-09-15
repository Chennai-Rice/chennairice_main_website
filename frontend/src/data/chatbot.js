/* ============================================================
   Soru Kutty — chatbot identity, quick actions & product matching.
   Response text itself comes from the Groq-backed /api/chat proxy
   (see server/); this file only holds UI-facing config and the
   client-side product lookup used to render product cards.
   ============================================================ */

export const SORU_KUTTY = {
  name: 'Soru Kutty',
  tagline: 'Your little rice companion.',
  greetingTitle: 'Vanakkam! 👋 I\'m Soru Kutty 🍚',
  greetingSubtitle: 'Your little rice companion. What can I help you with today?',
  tooltip: 'Ask me about rice 🍚',
}

/* Quick actions shown under the welcome message. `prompt` is the exact
   message auto-sent to the chat when clicked. */
export const QUICK_ACTIONS = [
  { id: 'find-rice', label: 'Find My Rice', icon: 'search', prompt: 'Which rice should I buy?' },
  { id: 'nutrition', label: 'Nutrition', icon: 'leaf', prompt: 'Tell me about the nutrition.' },
  { id: 'cooking', label: 'Cooking & Recipes', icon: 'pot', prompt: 'Can you help me with cooking and recipes?' },
  { id: 'shop', label: 'Shop Rice', icon: 'book', prompt: 'I want to shop for rice.' },
  { id: 'track-order', label: 'Track My Order', icon: 'truck', prompt: 'Where is my order?' },
]

/* "What are you cooking?" branch options for the Find My Rice flow. */
export const COOKING_OPTIONS = [
  { id: 'daily', label: 'Daily Meals', prompt: 'I want rice for daily meals.' },
  { id: 'idli-dosa', label: 'Idli / Dosa', prompt: 'I want rice for idli and dosa.' },
  { id: 'biryani', label: 'Biryani', prompt: 'I want rice for biryani.' },
  { id: 'pongal', label: 'Pongal', prompt: 'I want rice for pongal.' },
  { id: 'fried-rice', label: 'Fried Rice', prompt: 'I want rice for fried rice.' },
  { id: 'special', label: 'Special Meals', prompt: 'I want rice for a special meal.' },
]

/* Nutrition-question variety picker (Example 3 in the brief). */
export const NUTRITION_OPTIONS = [
  { id: 'white-ponni', label: 'White Ponni', prompt: 'Tell me about the nutrition of White Ponni Rice.' },
  { id: 'idly-rice', label: 'Idly Rice', prompt: 'Tell me about the nutrition of Idly Rice.' },
  { id: 'rajabhogam', label: 'Rajabhogam', prompt: 'Tell me about the nutrition of Rajabhogam.' },
]

/* Real Chennai Rice product catalog (mirrors src/shop/data/products.js).
   Kept as a small local copy so the chatbot can match by keyword without
   importing the shop bundle; "View Product" always links to /products. */
export const CHAT_PRODUCTS = [
  {
    id: 'rajabhogam-premium',
    name: 'Rajabhogam Premium',
    packSize: '10 KG',
    blurb: 'Our finest pack — aged, hand-graded premium Ponni grains.',
    image: '/assets/shop/pack-premium.png',
    keywords: ['rajabhogam', 'raja bogam premium', 'special rajabhogam', 'premium', 'festive', 'special meal', 'special meals'],
  },
  {
    id: 'raja-bogam-ponni',
    name: 'Raja Bogam Ponni',
    packSize: '10 KG',
    blurb: 'The everyday family pack — soft bite, clean aroma.',
    image: '/assets/shop/pack-red.png',
    keywords: ['white ponni', 'ponni', 'daily', 'everyday', 'sadam', 'curd rice', 'pongal', 'daily meal', 'daily meals'],
  },
  {
    id: 'vada-kolam',
    name: 'Vada Kolam',
    packSize: '10 KG',
    blurb: 'Fine slender grains that cook light and fluffy — also a good idli/dosa base.',
    image: '/assets/shop/pack-gold.png',
    keywords: ['kolam', 'vada kolam', 'idli', 'idly', 'dosa', 'pulao', 'fried rice', 'lemon rice'],
  },
  {
    id: 'akshaya-ponni',
    name: 'Akshaya Ponni',
    packSize: '10 KG',
    blurb: 'Full-bodied Ponni grains for generous everyday meals.',
    image: '/assets/shop/pack-akshaya.png',
    keywords: ['akshaya', 'akashaya', 'generous', 'family pack'],
  },
]

/** Finds the first product whose keywords appear in the given text (case-insensitive). */
export function matchProduct(text) {
  if (!text) return null
  const lower = text.toLowerCase()
  return CHAT_PRODUCTS.find(p => p.keywords.some(k => lower.includes(k))) || null
}

export const FALLBACK_MESSAGE = {
  text: "I'm not fully sure about that one. Let me connect you with our team — they'll have the exact answer.",
  cta: { label: 'Contact Us →', to: '/contact' },
}

export const CHAT_ENDPOINT = '/api/chat'
