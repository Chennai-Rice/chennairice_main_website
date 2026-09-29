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

/* The live catalogue, generated from src/shop/data/products.js so the two
   cannot drift — the chatbot used to name four packs that had been retired.
   Kept as a local copy so keyword matching needs no shop import. */
export const CHAT_PRODUCTS = [
  {
    id: "special-rajabhogam",
    name: "Special Rajabhogam",
    packSize: "10 KG",
    blurb: "Kitchidi Ponni rice in our signature red pack, milled and sealed at Erode.",
    image: "/assets/shop/packs/special-rajabhogam.png",
    keywords: ["special rajabhogam","special","rajabhogam","classic","kitchidi","signature","milled","sealed","erode"],
  },
  {
    id: "nayara-super-aged",
    name: "Nayara Super Aged",
    packSize: "10 KG",
    blurb: "Super-aged gel cook rice that stays separate and firm on the plate.",
    image: "/assets/shop/packs/nayara-super-aged.png",
    keywords: ["nayara super aged","nayara","super","aged","cook","stays","separate","firm","plate"],
  },
  {
    id: "vijaya-nagaram",
    name: "Vijaya Nagaram",
    packSize: "5 KG",
    blurb: "Amman Ponni — HMT Ponni grain, milled for everyday South Indian meals.",
    image: "/assets/shop/packs/vijaya-nagaram.png",
    keywords: ["vijaya nagaram","vijaya","nagaram","amman","grain","milled","everyday","south","indian"],
  },
  {
    id: "vintage",
    name: "Vintage",
    packSize: "10 KG",
    blurb: "Our black-and-gold selection, milled and sealed at the Erode facility.",
    image: "/assets/shop/packs/vintage.png",
    keywords: ["vintage","vintage","black","gold","selection","milled","sealed","erode","facility"],
  },
  {
    id: "viruchagam",
    name: "Viruchagam",
    packSize: "10 KG",
    blurb: "Poompuhar Ponni in the blue and gold pack, from SNR RNR paddy.",
    image: "/assets/shop/packs/viruchagam.png",
    keywords: ["viruchagam","viruchagam","poompuhar","blue","gold","paddy"],
  },
  {
    id: "united-5kg",
    name: "United",
    packSize: "5 KG",
    blurb: "The everyday United pack, in a 5 kg family size.",
    image: "/assets/shop/packs/united-5kg.png",
    keywords: ["united","united","green","everyday","family","size"],
  },
  {
    id: "alibaba",
    name: "Alibaba",
    packSize: "10 KG",
    blurb: "Premium Sappadu rice — 100% pure original quality, for full-flavoured meals.",
    image: "/assets/shop/packs/alibaba.png",
    keywords: ["alibaba","alibaba","premium","sappadu","pure","original","quality","full","flavoured"],
  },
  {
    id: "chennai-bullets",
    name: "Chennai Bullets",
    packSize: "26 KG",
    blurb: "Rajabhogam Ponni with a rich aroma, in our largest 26 kg trade pack.",
    image: "/assets/shop/packs/chennai-bullets.png",
    keywords: ["chennai bullets","chennai","bullets","rajabhogam","rich","aroma","largest","trade"],
  },
  {
    id: "a1-special-ponni",
    name: "A1 Special Ponni",
    packSize: "5 KG",
    blurb: "Special Ponni rice, quality graded and packed at our Erode facility.",
    image: "/assets/shop/packs/a1-special-ponni.png",
    keywords: ["a1 special ponni","special","quality","graded","packed","erode","facility"],
  },
  {
    id: "rudra",
    name: "Rudra",
    packSize: "25 KG",
    blurb: "Rajabhogam Ponni rice — original taste and rich aroma, in a 25 kg pack.",
    image: "/assets/shop/packs/rudra.png",
    keywords: ["rudra","rudra","rajabhogam","original","taste","rich","aroma"],
  },
  {
    id: "thaaram",
    name: "Thaaram Nei Kitchadi",
    packSize: "25 KG",
    blurb: "Akshaya Ponni for nei kitchadi — strong grain, superior taste, rich aroma.",
    image: "/assets/shop/packs/thaaram.png",
    keywords: ["thaaram nei kitchadi","thaaram","kitchadi","akshaya","strong","grain","superior","taste","rich"],
  },
]

/** Finds the first product whose keywords appear in the given text (case-insensitive). */
export function matchProduct(text) {
  if (!text) return null
  const lower = text.toLowerCase()
  return CHAT_PRODUCTS.find(p => p.keywords.some(k => lower.includes(k))) || null
}

/* Shown when the request to /api/chat fails outright — the assistant was never
   reached, so nothing was understood or judged.

   The old wording ("I'm not fully sure about that one") blamed the answer for
   what is actually a connection failure: it reads as though Soru Kutty
   considered the question and came up short, which misleads the visitor about
   what went wrong and makes the bot look ignorant rather than offline. */
export const FALLBACK_MESSAGE = {
  text: "I can't reach my brain right now — sorry about that. Our team can answer this for you in the meantime.",
  cta: { label: 'Contact Us →', to: '/contact' },
}

export const CHAT_ENDPOINT = '/api/chat'
