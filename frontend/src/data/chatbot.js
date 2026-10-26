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
  { id: 'delivery', label: 'Check Delivery', icon: 'pin', prompt: 'Do you deliver to my area?' },
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

/* The packs Soru Kutty can show as cards. Prices, pack sizes and stock come
   from the live catalog (/api/catalog) when the card opens; the picture and
   line here are only used if that cannot be read. */
export const CHAT_PRODUCTS = [
  { id: 'kitchidi-ponni-rice', name: 'Kitchidi Ponni Rice', match: /Kitchidi Ponni Rice/, image: '/assets/shop/packs/kitchidi-ponni-rice-v3.png', blurb: 'Year-aged Kitchidi Ponni in a premium pack.' },
  { id: 'special-rajabhogam', name: 'Special Rajabhogam', match: /Special Rajabhogam/i, image: '/assets/shop/packs/special-rajabhogam-v2.png', blurb: 'Kitchidi Ponni rice in our signature red pack.' },
  { id: 'nayara-super-aged', name: 'Nayara Super Aged', match: /Nayara/i, image: '/assets/shop/packs/nayara-super-aged-v3.png', blurb: 'Super-aged rice that stays separate and firm.' },
  { id: 'vijaya-nagaram', name: 'Vijaya Nagaram', match: /Vijaya ?Nagaram/i, image: '/assets/shop/packs/vijaya-nagaram-v3.png', blurb: 'Amman Ponni for everyday South Indian meals.' },
  { id: 'vintage', name: 'Vintage', match: /\bVintage\b/, image: '/assets/shop/packs/vintage-v3.png', blurb: 'Our black-and-gold selection.' },
  { id: 'viruchagam', name: 'Viruchagam', match: /Viruchagam/i, image: '/assets/shop/packs/viruchagam-v3.png', blurb: 'Poompuhar Ponni in the blue and gold pack.' },
  { id: 'united-5kg', name: 'United', match: /\bUnited\b/, image: '/assets/shop/packs/united-v3.png', blurb: 'The everyday United pack.' },
  { id: 'alibaba', name: 'Alibaba', match: /Ali ?baba/i, image: '/assets/shop/packs/alibaba-v3.png', blurb: 'Premium Sappadu rice for full-flavoured meals.' },
  { id: 'chennai-bullets', name: 'Chennai Bullets', match: /Chennai Bullets?/i, image: '/assets/shop/packs/chennai-bullets-v3.png', blurb: 'Rajabhogam Ponni with a rich aroma.' },
  { id: 'a1-special-ponni', name: 'A1 Special Ponni', match: /\bA1\b/i, image: '/assets/shop/packs/a1-special-ponni-v3.png', blurb: 'Special Ponni, quality graded at Erode.' },
  { id: 'rudra', name: 'Rudra', match: /\bRudra\b/i, image: '/assets/shop/packs/rudra.png', blurb: 'Rajabhogam Ponni — original taste and rich aroma.' },
  { id: 'thaaram', name: 'Thaaram Nei Kitchadi', match: /Thaaram/i, image: '/assets/shop/packs/thaaram.png', blurb: 'Akshaya Ponni for nei kitchadi.' },
  { id: 'special-idly-rice', name: 'Special Idly Rice', match: /Special Idl[iy] Rice/i, image: '/assets/shop/packs/special-idly-rice-v3.png', blurb: 'For soft idli and crisp dosa.' },
]

/**
 * The packs Soru Kutty names in a reply, in the order it names them (at most
 * three). Only product names count — the old keyword list matched words like
 * "Erode" or "aged" and put a card under answers that named no product.
 */
export function matchProducts(text) {
  if (!text) return []
  return CHAT_PRODUCTS
    .map((p) => ({ p, at: text.search(p.match) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, 3)
    .map((m) => m.p)
}

/* Shown when the request to /api/chat fails outright — the assistant was never
   reached, so nothing was understood or judged.

   The old wording ("I'm not fully sure about that one") blamed the answer for
   what is actually a connection failure: it reads as though Soru Kutty
   considered the question and came up short, which misleads the visitor about
   what went wrong and makes the bot look ignorant rather than offline. */
export const FALLBACK_MESSAGE = {
  text: "I can't reach my brain right now — sorry about that. Our team can answer this for you in the meantime.",
  cta: { label: 'Contact Us →', to: '/contact-us' },
}

export const CHAT_ENDPOINT = '/api/chat'
