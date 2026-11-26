// The WhatsApp bot (/whatsappbot → Bot): answers customers on +91 70666 46667 by itself.
//
//   "hi" / "hello" / "vanakkam" / "menu"   → the welcome message with the menu (buttons or a list)
//   tapping a menu item, or its keywords    → that item's reply or action
//   an order number (CR-20261111-AB12C)     → its status, if the order was placed from this WhatsApp number
//   a 6-digit PIN code                      → whether we deliver there and the delivery charge
//   anything else                           → an AI reply (Groq, ai.js): short, warm, in their language, from
//                                             their own orders, prices and offers; complaints go to the team.
//                                             Without AI (switched off, or no GROQ_API_KEY): the fallback + menu
//
// Actions an item can have: reply (its text), track_order, offers (this number's spin / referral codes),
// prices (live from the catalog), delivery (asks for a PIN), handoff (a person takes over; the bot is
// quiet in that chat for some hours). Replies go out inside the customer's 24-hour window, so they are
// free "service" messages, not templates.
//
// decide() and render() take everything they need as arguments, so the dashboard's simulator runs the
// same code on unsaved settings without sending anything.
import { query as defaultQuery } from '../db.js'
import { httpError, str, parseTrackingRef, formatInr } from '../sales/util.js'
import { listCatalog, checkDelivery } from '../sales/catalog.js'
import { sendMessage } from './cloud.js'
import { aiReply } from './ai.js'
import { queueEmail, staffRecipients } from '../sales/email.js'

const SITE = 'https://chennairiceindustries.com'
// No days or hours promised to customers (owner, 15 Nov 2026): saved replies still carrying them are updated.
const noHours = (text) => String(text || '')
  // The brand spelling is Kitchidi Ponni (owner, 26 Nov 2026): saved replies with the old spelling are corrected too.
  .replace(/Kitchadi Ponni/g, 'Kitchidi Ponni')
  .replace(/\s*\(Mon[–-]Sat,?\s*9\s*am\s*[–-]\s*7\s*pm\)/gi, '')
  .replace(/Our team will reply to you here shortly\./g, 'Our team will get back to you here soon.')
// Links go through the short /w/ links (ShortLink.jsx adds utm_source=whatsapp): tidy in a chat and credited to WhatsApp.
const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })
export const ACTIONS = ['reply', 'track_order', 'offers', 'prices', 'delivery', 'handoff']
const MAX_REPLIES_A_DAY = 60 // per chat: a safety net against loops with another bot

export const DEFAULT_BOT = {
  enabled: true,
  greetings: ['hi', 'hii', 'hello', 'hey', 'hai', 'vanakkam', 'menu', 'start', 'good morning', 'good evening'],
  welcome: {
    text: 'Vanakkam {{name}}! 🙏 Welcome to *Chennai Rice Industries*, makers of Kitchidi Ponni rice.\n\nHow can we help you today? Choose from the menu below.',
    style: 'list',
    button: 'Menu',
  },
  items: [
    { id: 'shop', label: '🛒 Order rice', description: 'Buy online, home delivery', keywords: ['buy', 'order rice', 'shop', 'purchase', 'website'], action: 'reply',
      reply: 'You can order online with home delivery here:\n' + SITE + '/w/shop-bot\n\nPay by UPI, card or net banking. 🍚' },
    { id: 'prices', label: '💰 Prices', description: 'Today\'s price for every pack', keywords: ['price', 'rate', 'cost', 'how much', 'vilai'], action: 'prices',
      reply: 'Here are today\'s prices:' },
    { id: 'track', label: '📦 Track my order', description: 'Where is my order?', keywords: ['track', 'where is my order', 'order status', 'delivery status', 'not received'], action: 'track_order',
      reply: 'Please send your order number. It looks like *CR-20261111-AB12C* and is in your order email and SMS.' },
    { id: 'offers', label: '🎁 My offers', description: 'Spin & Win and referral codes', keywords: ['offer', 'coupon', 'code', 'discount', 'spin', 'reward'], action: 'offers',
      reply: 'You have no active offers on this number right now. Spin the wheel on our website for a chance to win up to ₹150 OFF: ' + SITE + '/w/spin-bot' },
    { id: 'delivery', label: '🚚 Delivery to my area', description: 'Check your PIN code', keywords: ['deliver', 'pincode', 'pin code', 'shipping', 'courier'], action: 'delivery',
      reply: 'Please send your 6-digit PIN code and we will tell you if we deliver there and the delivery charge.' },
    { id: 'human', label: '👤 Talk to our team', description: 'A person will reply', keywords: ['agent', 'human', 'person', 'call me', 'talk', 'help', 'complaint'], action: 'handoff',
      reply: 'Thank you! 🙏 Our team will get back to you here soon.' },
  ],
  fallback: 'Sorry, I did not get that. 🙏 Please choose from the menu, or type *menu* any time.',
  handoffHours: 12,
  // AI replies (Groq) for anything the menu does not cover.
  ai: { enabled: true },
  // Tamil (owner, 26 Nov 2026): the customer picks English or தமிழ் on their first message; a Tamil chat gets these
  // texts. Menu items are matched by id; an item added in the dashboard without a Tamil text stays in English.
  ta: {
    welcome: {
      text: 'வணக்கம் {{name}}! 🙏 *சென்னை ரைஸ் இண்டஸ்ட்ரீஸ்*-க்கு உங்களை அன்புடன் வரவேற்கிறோம். நாங்கள் கிச்சடி பொன்னி அரிசி தயாரிப்பாளர்கள்.\n\nஇன்று உங்களுக்கு எப்படி உதவலாம்? கீழே உள்ள மெனுவில் தேர்ந்தெடுக்கவும்.',
      button: 'மெனு',
    },
    items: {
      shop: { label: '🛒 அரிசி ஆர்டர்', description: 'ஆன்லைனில் வாங்கலாம், வீட்டுக்கே டெலிவரி', keywords: ['ஆர்டர்', 'வாங்க'],
        reply: 'வீட்டுக்கே டெலிவரியுடன் இங்கே ஆன்லைனில் ஆர்டர் செய்யலாம்:\n' + SITE + '/w/shop-bot\n\nUPI, கார்டு அல்லது நெட் பேங்கிங் மூலம் பணம் செலுத்தலாம். 🍚' },
      prices: { label: '💰 விலை', description: 'ஒவ்வொரு பேக்கின் இன்றைய விலை', keywords: ['விலை', 'ரேட்'], reply: 'இன்றைய விலை' },
      track: { label: '📦 ஆர்டர் நிலை', description: 'என் ஆர்டர் எங்கே?', keywords: ['ஆர்டர் நிலை', 'டிராக்'],
        reply: 'உங்கள் ஆர்டர் எண்ணை அனுப்பவும். அது *CR-20261111-AB12C* போல இருக்கும்; உங்கள் ஆர்டர் மின்னஞ்சல் மற்றும் SMS-இல் உள்ளது.' },
      offers: { label: '🎁 என் சலுகைகள்', description: 'Spin & Win மற்றும் பரிந்துரை குறியீடுகள்', keywords: ['சலுகை', 'தள்ளுபடி', 'கூப்பன்'],
        reply: 'இந்த எண்ணில் தற்போது சலுகைகள் எதுவும் இல்லை. ₹150 வரை தள்ளுபடி வெல்ல எங்கள் இணையதளத்தில் சக்கரத்தைச் சுற்றுங்கள்: ' + SITE + '/w/spin-bot' },
      delivery: { label: '🚚 டெலிவரி பகுதி', description: 'உங்கள் PIN கோடைச் சரிபார்க்கவும்', keywords: ['டெலிவரி', 'பின்கோடு'],
        reply: 'உங்கள் 6 இலக்க PIN கோடை அனுப்பவும். அங்கு டெலிவரி செய்கிறோமா, டெலிவரி கட்டணம் எவ்வளவு என்று சொல்கிறோம்.' },
      human: { label: '👤 குழுவிடம் பேச', description: 'எங்கள் குழுவில் ஒருவர் பதில் அளிப்பார்', keywords: ['உதவி', 'புகார்', 'பேச'],
        reply: 'நன்றி! 🙏 எங்கள் குழு விரைவில் இங்கே உங்களைத் தொடர்புகொள்ளும்.' },
    },
    fallback: 'மன்னிக்கவும், புரியவில்லை. 🙏 மெனுவில் தேர்ந்தெடுக்கவும், அல்லது எப்போது வேண்டுமானாலும் *menu* என்று டைப் செய்யவும்.',
  },
}

// ---- languages -------------------------------------------------------------------------------------------------------
export const LANGS = ['en', 'ta']
/** The first message: English or Tamil, as two buttons. */
export function languageMsg() {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Vanakkam! 🙏 Welcome to *Chennai Rice Industries*.\nவணக்கம்! 🙏 சென்னை ரைஸ் இண்டஸ்ட்ரீஸ்-க்கு வரவேற்கிறோம்.\n\nPlease choose your language.\nஉங்கள் மொழியைத் தேர்ந்தெடுக்கவும்.' },
      action: { buttons: [{ type: 'reply', reply: { id: 'lang_en', title: 'English' } }, { type: 'reply', reply: { id: 'lang_ta', title: 'தமிழ்' } }] },
    },
  }
}
const LANG_WORDS = { english: 'en', eng: 'en', tamil: 'ta', 'தமிழ்': 'ta' }
const PICK_WORDS = ['language', 'lang', 'மொழி', 'change language']

/** The bot's texts in a language: Tamil swaps in the Tamil welcome, menu and fallback (keywords of both work). */
export function botFor(bot, lang) {
  if (lang !== 'ta' || !bot.ta) return bot
  const ta = bot.ta
  return {
    ...bot,
    lang: 'ta',
    welcome: { ...bot.welcome, text: ta.welcome?.text || bot.welcome.text, button: ta.welcome?.button || bot.welcome.button },
    items: (bot.items || []).map((it) => {
      const t = ta.items?.[it.id]
      return t ? { ...it, label: t.label || it.label, description: t.description ?? it.description, reply: t.reply || it.reply, keywords: [...(it.keywords || []), ...(t.keywords || [])] } : it
    }),
    fallback: ta.fallback || bot.fallback,
  }
}

// The bot's own sentences (not editable in the dashboard), per language.
const TEXT = {
  en: {
    notOrderNo: 'That does not look like an order number. It looks like *CR-20261111-AB12C* (in your order email and SMS). Send it any time, or choose from the menu below.',
    notFound: 'We could not find a placed order with that number. 🙏 Please check it on your order email or SMS. If the payment did not go through, the order was not placed — you can order again here: ' + SITE + '/w/shop-bot',
    privacy: 'For your privacy, we can only share an order\'s status with the WhatsApp number used to place it. Please message us from that number, or check it here: ' + SITE + '/track-order',
    orderIs: (no, status) => `Order *${no}* is ${status}.`,
    courier: (url) => `Track the courier: ${url}`,
    expected: (d) => `Expected by ${d}.`,
    details: (url) => `Full details: ${url}`,
    noPin: (pin) => `Sorry, we do not deliver to ${pin} yet. 🙏 For bulk orders, call us on +91 70666 46667.`,
    yesPin: (pin, area, charges) => `Yes! ✅ We deliver to ${pin} (${area || 'your area'}).${charges ? '\n' + charges : ''}\n\nOrder here: ${SITE}/w/shop-bot`,
    charge: (kg, amount) => `• ${kg} kg pack: ${amount} delivery`,
    offers: (lines) => `Your offers on this number 🎁\n${lines}\n\nThey are applied automatically when you order from this mobile number: ${SITE}/w/shop-bot`,
    until: (d) => ` (till ${d})`,
    sorryWait: 'Sorry for the wait 🙏 Our team will get back to you here soon.',
    handoff: 'Our team will reply to you shortly.',
    askOrder: 'Please send your order number.',
    trackWeb: 'Or track it yourself on our website',
    askPin: 'Please send your 6-digit PIN code.',
    pricesHeading: 'Today\'s prices',
    offMrp: (n) => ` — up to ${n}% off MRP`,
    pricesFoot: `Prices per pack, GST included. Delivery depends on your PIN code.\n🛒 Order: ${SITE}/w/shop-bot`,
    pricesWeb: `Our prices are on the website: ${SITE}/w/shop-bot`,
    products: '🍚 See all our rice and today’s prices on our website: 5, 10 and 26 kg packs, GST included. Delivery depends on your PIN code.',
    productsButton: 'Our product range',
    status: {
      placed: 'received ✅ and waiting to be confirmed', confirmed: 'confirmed ✅ and being packed', packed: 'packed 📦 and ready to leave our mill',
      shipped: 'on the way 🚚', delivered: 'delivered ✅', cancelled: 'cancelled', returned: 'returned',
    },
  },
  ta: {
    notOrderNo: 'இது ஆர்டர் எண் போல இல்லை. ஆர்டர் எண் *CR-20261111-AB12C* போல இருக்கும் (உங்கள் ஆர்டர் மின்னஞ்சல் மற்றும் SMS-இல்). எப்போது வேண்டுமானாலும் அனுப்பலாம், அல்லது கீழே உள்ள மெனுவில் தேர்ந்தெடுக்கவும்.',
    notFound: 'இந்த எண்ணில் ஆர்டர் எதுவும் கிடைக்கவில்லை. 🙏 உங்கள் ஆர்டர் மின்னஞ்சல் அல்லது SMS-இல் எண்ணைச் சரிபார்க்கவும். பணம் செலுத்துதல் முடியவில்லை என்றால் ஆர்டர் பதிவாகவில்லை; இங்கே மீண்டும் ஆர்டர் செய்யலாம்: ' + SITE + '/w/shop-bot',
    privacy: 'உங்கள் தனியுரிமைக்காக, ஆர்டர் செய்த WhatsApp எண்ணுக்கு மட்டுமே ஆர்டர் நிலையைப் பகிர முடியும். அந்த எண்ணிலிருந்து மெசேஜ் செய்யவும், அல்லது இங்கே பார்க்கவும்: ' + SITE + '/track-order',
    orderIs: (no, status) => `ஆர்டர் *${no}*: ${status}.`,
    courier: (url) => `கூரியரைப் பின்தொடர: ${url}`,
    expected: (d) => `${d}-க்குள் வந்து சேரும்.`,
    details: (url) => `முழு விவரம்: ${url}`,
    noPin: (pin) => `மன்னிக்கவும், ${pin}-க்கு இப்போது டெலிவரி இல்லை. 🙏 மொத்த ஆர்டர்களுக்கு +91 70666 46667 என்ற எண்ணில் அழைக்கவும்.`,
    yesPin: (pin, area, charges) => `ஆம்! ✅ ${pin}${area ? ` (${area})` : ''}-க்கு டெலிவரி செய்கிறோம்.${charges ? '\n' + charges : ''}\n\nஇங்கே ஆர்டர் செய்யவும்: ${SITE}/w/shop-bot`,
    charge: (kg, amount) => `• ${kg} kg பேக்: டெலிவரி ${amount}`,
    offers: (lines) => `இந்த எண்ணில் உள்ள உங்கள் சலுகைகள் 🎁\n${lines}\n\nஇந்த மொபைல் எண்ணிலிருந்து ஆர்டர் செய்யும்போது தானாகவே பொருந்தும்: ${SITE}/w/shop-bot`,
    until: (d) => ` (${d} வரை)`,
    sorryWait: 'காத்திருக்க வைத்ததற்கு மன்னிக்கவும் 🙏 எங்கள் குழு விரைவில் இங்கே பதில் அளிக்கும்.',
    handoff: 'எங்கள் குழு விரைவில் பதில் அளிக்கும்.',
    askOrder: 'உங்கள் ஆர்டர் எண்ணை அனுப்பவும்.',
    trackWeb: 'அல்லது எங்கள் இணையதளத்தில் நீங்களே பார்க்கலாம்',
    askPin: 'உங்கள் 6 இலக்க PIN கோடை அனுப்பவும்.',
    pricesHeading: 'இன்றைய விலை',
    offMrp: (n) => ` — MRP-இல் ${n}% வரை தள்ளுபடி`,
    pricesFoot: `விலை ஒரு பேக்கிற்கு, GST உட்பட. டெலிவரி கட்டணம் உங்கள் PIN கோடைப் பொறுத்தது.\n🛒 ஆர்டர்: ${SITE}/w/shop-bot`,
    pricesWeb: `எங்கள் விலைகள் இணையதளத்தில் உள்ளன: ${SITE}/w/shop-bot`,
    products: '🍚 எங்கள் அனைத்து அரிசி வகைகளும் இன்றைய விலையும் இணையதளத்தில் உள்ளன: 5, 10 மற்றும் 26 கிலோ பேக்குகள், GST உட்பட. டெலிவரி கட்டணம் உங்கள் PIN கோடைப் பொறுத்தது.',
    productsButton: 'எங்கள் அரிசி வகைகள்',
    status: {
      placed: 'பெறப்பட்டது ✅, உறுதிப்படுத்தக் காத்திருக்கிறது', confirmed: 'உறுதி செய்யப்பட்டது ✅, பேக் செய்யப்படுகிறது', packed: 'பேக் செய்யப்பட்டது 📦, எங்கள் ஆலையிலிருந்து புறப்படத் தயார்',
      shipped: 'வழியில் உள்ளது 🚚', delivered: 'டெலிவரி செய்யப்பட்டது ✅', cancelled: 'ரத்து செய்யப்பட்டது', returned: 'திருப்பி அனுப்பப்பட்டது',
    },
  },
}
const T = (lang) => TEXT[lang === 'ta' ? 'ta' : 'en']

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
const hasWord = (text, kw) => {
  const k = norm(kw)
  return k && (` ${text} `).includes(` ${k} `)
}

/** Cleans settings from the dashboard (keeps the limits WhatsApp sets on menus). */
export function cleanBot(input = {}) {
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 10).map((it, i) => ({
    id: str(it.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || `item${i + 1}`,
    label: str(it.label).slice(0, 24),
    description: str(it.description).slice(0, 72),
    keywords: (Array.isArray(it.keywords) ? it.keywords : String(it.keywords || '').split(',')).map((k) => str(k).toLowerCase()).filter(Boolean).slice(0, 30),
    action: ACTIONS.includes(it.action) ? it.action : 'reply',
    reply: noHours(it.reply).slice(0, 1024),
  })).filter((it) => it.label)
  const ids = new Set()
  for (const it of items) { while (ids.has(it.id)) it.id += 'x'; ids.add(it.id) }
  return {
    enabled: input.enabled !== false,
    greetings: (Array.isArray(input.greetings) ? input.greetings : String(input.greetings || '').split(',')).map((k) => str(k).toLowerCase()).filter(Boolean).slice(0, 30),
    welcome: {
      text: noHours(input.welcome?.text || DEFAULT_BOT.welcome.text).slice(0, 1024),
      style: input.welcome?.style === 'buttons' ? 'buttons' : 'list',
      button: str(input.welcome?.button || 'Menu').slice(0, 20),
    },
    items,
    fallback: noHours(input.fallback || DEFAULT_BOT.fallback).slice(0, 1024),
    handoffHours: Math.min(72, Math.max(1, Number(input.handoffHours) || 12)),
    // Email the team each time the AI passes a chat on ("WhatsApp: … needs a reply"). Off unless switched on
    // (owner, Nov 2026: too many after a bulk message); the chat still opens in the Inbox with the AI's note.
    handoffEmail: input.handoffEmail === true,
    ai: { enabled: input.ai?.enabled !== false },
    // Tamil texts: the defaults unless the settings carry their own (the dashboard edits the English ones).
    ta: input.ta && typeof input.ta === 'object' ? {
      welcome: { text: noHours(input.ta.welcome?.text || DEFAULT_BOT.ta.welcome.text).slice(0, 1024), button: str(input.ta.welcome?.button || DEFAULT_BOT.ta.welcome.button).slice(0, 20) },
      items: { ...DEFAULT_BOT.ta.items, ...(input.ta.items && typeof input.ta.items === 'object' ? input.ta.items : {}) },
      fallback: noHours(input.ta.fallback || DEFAULT_BOT.ta.fallback).slice(0, 1024),
    } : DEFAULT_BOT.ta,
  }
}

// The order buttons of the scrapped_data / supermarket WhatsApp campaigns ("ஆர்டர் செய்ய!" and "ஆர்டர் செய்ய !!", spaces ignored):
// no prices or links, the customer is told in Tamil that the team will contact them, and the chat is handed to the team.
const CAMPAIGN_ORDER_BUTTONS = ['ஆர்டர்செய்ய!', 'ஆர்டர்செய்ய!!']
const CAMPAIGN_ORDER_REPLY = 'நன்றி! 🙏 எங்கள் குழு விரைவில் உங்களைத் தொடர்புகொள்ளும்.'
// Words that leave a waiting step (order number) and go on as usual.
const ESCAPE_WORDS = ['cancel', 'back', 'stop', 'exit', 'main menu']

/** Just a greeting ("hi", "Hello!", "vanakkam", "menu"): at most 3 words starting with one of the bot's greetings. */
export function isGreeting(bot, text) {
  const t = norm(text)
  return Boolean(t) && t.split(' ').length <= 3 && (bot.greetings || []).some((g) => t === norm(g) || t.startsWith(norm(g) + ' '))
}

/** A greeting that starts a chat ("hi", "hello", "vanakkam"): English / தமிழ் first, then the menu (owner, 26 Nov 2026).
 * "menu" itself still opens the menu straight away. */
export function startsChat(bot, text) {
  return isGreeting(bot, text) && !['menu', 'மெனு'].includes(norm(text))
}

/** What to do with one incoming message. Pure: no database, no network. */
export function decide(bot, { text = '', replyId = '', image = null } = {}, state = {}) {
  const items = bot.items || []
  if (!image && CAMPAIGN_ORDER_BUTTONS.includes(String(text).normalize('NFC').replace(/\s+/g, ''))) {
    return { kind: 'item', item: { id: 'campaign_order', action: 'handoff', reply: CAMPAIGN_ORDER_REPLY } }
  }
  // A photo: the AI looks at it (a payment screenshot, a damaged pack…). Without AI, the menu as before.
  if (image) return bot.ai?.enabled ? { kind: 'ai', text: text || '', image } : { kind: 'fallback' }
  // Language: the English / தமிழ் buttons, or typing "English", "Tamil", "தமிழ்"; "language" / "மொழி" asks again.
  if (replyId === 'lang_en' || replyId === 'lang_ta') return { kind: 'lang', lang: replyId.slice(5) }
  if (replyId === 'lang') return { kind: 'chooseLang' }
  const said = String(text || '').trim().toLowerCase()
  if (LANG_WORDS[said]) return { kind: 'lang', lang: LANG_WORDS[said] }
  if (PICK_WORDS.includes(said)) return { kind: 'chooseLang' }
  if (replyId) {
    const item = items.find((it) => it.id === replyId)
    if (item) return { kind: 'item', item }
    if (replyId === 'menu') return { kind: 'welcome' }
  }
  const t = norm(text)
  const ref = parseTrackingRef(text)
  if (ref) return { kind: 'track', ref }
  const pin = String(text).match(/\b[1-9]\d{5}\b/)
  const fresh = state.awaiting_at && Date.now() - new Date(state.awaiting_at).getTime() < 30 * 60e3
  if (pin && (fresh && state.awaiting === 'pincode' || t === pin[0])) return { kind: 'pincode', pin: pin[0] }
  // Waiting for an order number: a greeting, "menu", "cancel"/"back" or a menu item's name still does what it
  // always does, so the customer is never stuck in this step (owner, 24 Nov 2026: "menu" and "hi" kept getting
  // "That does not look like an order number").
  const escapes = t && ((bot.greetings || []).some((g) => t === norm(g) || t.startsWith(norm(g) + ' '))
    || ESCAPE_WORDS.includes(t) || items.some((it) => norm(it.label) === t))
  if (fresh && state.awaiting === 'order_number' && t && !escapes) return { kind: 'track', ref: null, text }
  if (!t) return bot.ai?.enabled && text ? { kind: 'ai', text } : { kind: 'fallback' }
  // With AI on, a sentence ("hi, I ordered on 10th and it has not come") is answered by the AI rather
  // than matched on one of its words; short messages ("hi", "price", "track") still get the menu.
  const short = !bot.ai?.enabled || t.split(' ').length <= 3
  if (short && (bot.greetings || []).some((g) => t === norm(g) || t.startsWith(norm(g) + ' '))) return { kind: 'welcome' }
  const exact = items.find((it) => norm(it.label) === t)
  if (exact) return { kind: 'item', item: exact }
  const item = short && items.find((it) => (it.keywords || []).some((k) => hasWord(t, k)))
  if (item) return { kind: 'item', item }
  return bot.ai?.enabled ? { kind: 'ai', text } : { kind: 'fallback' }
}

/**
 * Today's prices, easy to read on a phone (owner, 24 Nov 2026: one long line per rice was hard to read):
 *   *Kitchadi Ponni*
 *   5 kg *₹555*  ·  26 kg *₹2,499*
 * Two lines per rice (name, then all packs), a blank line between rices, then delivery and the link.
 */
export function priceListText(list = [], heading = '', lang = 'en') {
  const t = T(lang)
  if (!list.length) return t.pricesWeb
  const byRice = new Map()
  for (const p of list) {
    if (!byRice.has(p.name)) byRice.set(p.name, [])
    byRice.get(p.name).push(p)
  }
  // Two lines per rice: the name, then every pack on one line. No struck-out MRP on each pack (owner, 24 Nov 2026:
  // "too clumsy"): the best saving is said once at the top instead.
  const blocks = [...byRice].map(([name, packs]) =>
    `*${name}*\n${packs.sort((a, b) => a.packKg - b.packKg).map((p) => `${p.packKg} kg *${rupees(p.price)}*`).join('  ·  ')}`)
  const off = Math.max(0, ...list.filter((p) => p.mrp > p.price).map((p) => Math.floor((1 - p.price / p.mrp) * 100)))
  return [
    `🍚 *${String(heading || '').trim().replace(/[:.\s]+$/, '') || t.pricesHeading}*${off >= 5 ? t.offMrp(off) : ''}`,
    ...blocks,
    t.pricesFoot,
  ].join('\n\n')
}

/** Prices: no list in the chat any more, a line and an "Our product range" button to the website (owner, 26 Nov 2026). */
export function productsMsg(lang = 'en') {
  const t = T(lang)
  return { type: 'interactive', interactive: { type: 'cta_url', body: { text: t.products }, action: { name: 'cta_url', parameters: { display_text: t.productsButton, url: `${SITE}/w/shop-bot` } } } }
}

// ---- WhatsApp message bodies (without "to") ----
const plainText = (body) => ({ type: 'text', text: { body: body.slice(0, 4096), preview_url: true } })
// Our own links become a button under the message (WhatsApp "cta_url") instead of a bare link with a big
// preview card (owner, 26 Nov 2026). One site link per message; otherwise, or if too long, plain text.
const SITE_LINK = new RegExp(SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\s)]*', 'g')
const LINK_LABELS = {
  en: [[/track-order/, '📦 Track order'], [/\/w\/spin/, '🎡 Spin & Win'], [/./, '🛒 Shop now']],
  ta: [[/track-order/, '📦 ஆர்டர் நிலை'], [/\/w\/spin/, '🎡 Spin & Win'], [/./, '🛒 ஆர்டர் செய்ய']],
}
export function linkMsg(body, lang = 'en') {
  const links = body.match(SITE_LINK) || []
  if (links.length !== 1) return plainText(body)
  const url = links[0]
  const text = body
    .replace(new RegExp(`:\\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '.')
    .replace(url, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text || text.length > 1024) return plainText(body)
  const label = (LINK_LABELS[lang] || LINK_LABELS.en).find(([re]) => re.test(url))[1]
  return { type: 'interactive', interactive: { type: 'cta_url', body: { text }, action: { name: 'cta_url', parameters: { display_text: label, url } } } }
}
const textMsg = plainText

export function menuMsg(bot, body) {
  const items = (bot.items || []).filter((it) => it.label)
  if (!items.length) return textMsg(body)
  if (bot.welcome?.style === 'buttons' && items.length <= 3) {
    return {
      type: 'interactive',
      interactive: { type: 'button', body: { text: body.slice(0, 1024) },
        action: { buttons: items.map((it) => ({ type: 'reply', reply: { id: it.id, title: it.label.slice(0, 20) } })) } },
    }
  }
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body.slice(0, 1024) },
      action: {
        button: (bot.welcome?.button || 'Menu').slice(0, 20),
        // Plus a row to switch language (WhatsApp allows 10 rows in all).
        sections: [{ title: 'Chennai Rice', rows: [
          ...items.slice(0, 9).map((it) => ({ id: it.id, title: it.label.slice(0, 24), ...(it.description ? { description: it.description.slice(0, 72) } : {}) })),
          { id: 'lang', title: '🌐 English / தமிழ்', description: bot.lang === 'ta' ? 'மொழியை மாற்ற' : 'Change language' },
        ] }],
      },
    },
  }
}

const STATUS_WORDS = {
  placed: 'received ✅ and waiting to be confirmed',
  confirmed: 'confirmed ✅ and being packed',
  packed: 'packed 📦 and ready to leave our mill',
  shipped: 'on the way 🚚',
  delivered: 'delivered ✅',
  cancelled: 'cancelled',
  returned: 'returned',
}

/**
 * The replies for a decision. `deps` does the lookups (findOrder, offers, prices, delivery), so the
 * simulator and tests can use stand-ins. Returns { messages, state } where state is what to remember.
 */
export async function render(baseBot, decision, { phone = '', name = '', lang: chatLang = 'en' } = {}, deps = {}) {
  // The chat's language: the one just picked, else the one remembered for this number.
  const lang = decision.kind === 'lang' ? decision.lang : chatLang
  const bot = botFor(baseBot, lang)
  const t = T(lang)
  const textMsg = (body) => linkMsg(body, lang) // shadows the plain one: our links become a button
  const first = String(name || '').trim().split(/\s+/)[0] || (lang === 'ta' ? '' : 'there')
  const welcome = () => menuMsg(bot, bot.welcome.text.replaceAll(' {{name}}', first ? ' ' + first : '').replaceAll('{{name}}', first))
  const out = { messages: [], state: { awaiting: null } }
  if (decision.kind === 'chooseLang') { out.messages.push(languageMsg()); return out }
  if (decision.kind === 'lang') { out.messages.push(welcome()); out.state = { awaiting: null, lang }; return out }
  if (decision.kind === 'welcome') { out.messages.push(welcome()); return out }
  if (decision.kind === 'fallback') { out.messages.push(menuMsg(bot, bot.fallback)); return out }
  if (decision.kind === 'ai') {
    // The AI's reply; if it cannot answer (Groq down, no key), the menu as before.
    const r = deps.ai
      ? await deps.ai({ phone, name, text: decision.text, image: decision.image || null, handedOver: Boolean(decision.handedOver), lang }).catch((err) => {
        console.error('[wa-ai]', err.message)
        return null
      })
      : null
    if (!r) {
      // Never silence: with the team on it, a short "we'll get back to you"; otherwise the menu.
      if (decision.handedOver) {
        out.messages.push(textMsg(t.sorryWait))
        out.state = { awaiting: null, pausedHours: bot.handoffHours }
      } else out.messages.push(menuMsg(bot, bot.fallback))
      return out
    }
    out.messages.push(textMsg(r.reply))
    // Asked for the prices / price list: the same tidy list as the Prices menu item, not one the AI types out.
    if (r.showPrices) out.messages.push(productsMsg(lang))
    out.state = { awaiting: null, ai: r, ...(r.handoff ? { pausedHours: bot.handoffHours } : {}) }
    return out
  }

  if (decision.kind === 'track') {
    const ref = decision.ref || parseTrackingRef(decision.text)
    if (!ref) {
      // Asked once only: the menu comes with it and the bot stops waiting, so the next message is read as usual.
      // An order number sent later is still found (it is recognised anywhere in a message).
      out.messages.push(menuMsg(bot, t.notOrderNo))
      out.state = { awaiting: null }
      return out
    }
    const order = await deps.findOrder(ref, phone)
    // A chat with the team stays with the team after the lookup.
    if (decision.handedOver) out.state = { awaiting: null, pausedHours: bot.handoffHours }
    // Unpaid orders are not orders yet (findOrder skips pending_payment): say so, instead of only "not found".
    if (!order) out.messages.push(textMsg(t.notFound))
    else if (!order.samePhone) out.messages.push(textMsg(t.privacy))
    else {
      const lines = [t.orderIs(order.orderNumber, t.status[order.status] || order.status.replaceAll('_', ' '))]
      if (order.trackingUrl) lines.push(t.courier(order.trackingUrl))
      if (order.expected) lines.push(t.expected(order.expected))
      lines.push(t.details(`${SITE}/track-order?order=${encodeURIComponent(order.orderNumber)}`))
      out.messages.push(textMsg(lines.join('\n')))
    }
    return out
  }

  if (decision.kind === 'pincode') {
    const d = await deps.delivery(decision.pin)
    if (!d?.delivers) out.messages.push(textMsg(t.noPin(decision.pin)))
    else {
      const charges = (d.charges || []).map((c) => t.charge(c.packKg, c.from === c.to ? rupees(c.from) : `${rupees(c.from)}–${rupees(c.to)}`)).join('\n')
      out.messages.push(textMsg(t.yesPin(decision.pin, d.region?.name, charges)))
    }
    return out
  }

  const item = decision.item
  // Track my order: send the number here, or a Track order button to the website (owner, 26 Nov 2026).
  if (item.action === 'track_order') { out.messages.push(textMsg(`${item.reply || t.askOrder}\n\n${t.trackWeb}: ${SITE}/track-order`)); out.state = { awaiting: 'order_number' }; return out }
  if (item.action === 'delivery') { out.messages.push(textMsg(item.reply || t.askPin)); out.state = { awaiting: 'pincode' }; return out }
  if (item.action === 'handoff') {
    out.messages.push(textMsg(item.reply || t.handoff))
    out.state = { awaiting: null, pausedHours: bot.handoffHours }
    return out
  }
  if (item.action === 'prices') {
    out.messages.push(productsMsg(lang))
    return out
  }
  if (item.action === 'offers') {
    const codes = await deps.offers(phone)
    if (!codes.length) out.messages.push(textMsg(item.reply))
    else {
      const lines = codes.map((c) => `• *${c.code}*: ${c.label}${c.until ? t.until(c.until) : ''}`).join('\n')
      out.messages.push(textMsg(t.offers(lines)))
    }
    return out
  }
  out.messages.push(textMsg(item.reply || '🙏'))
  return out
}

// ---- the real lookups -------------------------------------------------------------------------------------------
const dateIn = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null)

export function liveDeps(query = defaultQuery, { fetchImpl } = {}) {
  const deps = {
    async ai(args) {
      return aiReply(args, { query, deps, fetchImpl: fetchImpl || fetch })
    },
    async findOrder(ref, phone) {
      const { rows: [o] } = ref.orderNumber
        ? await query(`select id, order_number, status, contact_phone from orders where order_number = $1 and status <> 'pending_payment'`, [ref.orderNumber])
        : await query(`select id, order_number, status, contact_phone from orders where shipment_id = $1 and status <> 'pending_payment'`, [ref.shipmentId])
      if (!o) return null
      const { rows: [s] } = await query(
        `select tracking_url, expected_delivery from shipments where order_id = $1 and status <> 'cancelled' order by created_at desc limit 1`, [o.id]).catch(() => ({ rows: [] }))
      const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10)
      return { orderNumber: o.order_number, status: o.status, samePhone: !!phone && last10(o.contact_phone) === last10(phone), trackingUrl: s?.tracking_url || null, expected: dateIn(s?.expected_delivery) }
    },
    async offers(phone) {
      const p = String(phone || '').replace(/\D/g, '').slice(-10)
      if (!p) return []
      const { rows } = await query(
        `select d.code, d.kind, d.amount_paise, d.percent_bp, d.min_order_paise, d.expires_at, d.source
           from discount_codes d
          where (d.locked_phone = $1 or d.owner_phone = $1) and d.is_active
            and (d.expires_at is null or d.expires_at > now())
            and (d.owner_phone = $1 or not exists (select 1 from orders o where o.discount_code_id = d.id and o.status not in ('pending_payment', 'cancelled')))
          order by d.created_at desc limit 5`, [p])
      return rows.map((d) => {
        const what = d.kind === 'free_delivery' ? 'free delivery' : d.kind === 'percent' ? `${d.percent_bp / 100}% off` : `${formatInr(d.amount_paise).replace('.00', '')} off`
        const label = d.source === 'referral' ? `your referral code to share: friends get ${what} on their first order` : `${what}${Number(d.min_order_paise) ? ` on orders above ${formatInr(d.min_order_paise).replace('.00', '')}` : ''}`
        return { code: d.code, label, until: dateIn(d.expires_at) }
      })
    },
    async prices() {
      const cat = await listCatalog({ query })
      return cat.flatMap((p) => p.variants.filter((v) => v.price != null).map((v) => ({ name: p.name, packKg: Number(v.packKg), price: v.price, mrp: v.mrp }))).slice(0, 40)
    },
    async delivery(pin) {
      return checkDelivery({ query }, pin).catch(() => ({ delivers: false }))
    },
  }
  return deps
}

/**
 * The AI passed a chat to the team: a note on the chat (what and why), the order flagged for attention,
 * the chat reopened, and an email to the staff list (at most one per chat every 3 hours). Best effort.
 */
export async function aiHandoff({ phone, name, text, ai }, { query = defaultQuery } = {}) {
  const why = ai.reason || 'The customer needs a person'
  const about = ai.order ? ` (order ${ai.order})` : ''
  // What their photo showed (a payment screenshot's amount and status, a torn pack…), for the team.
  const p = ai.photo && !ai.photo.unreadable ? ai.photo : null
  const seen = p ? `Their photo: ${p.summary || p.kind}${p.amount ? `, ₹${p.amount}` : ''}${p.status ? `, ${p.status}` : ''}${p.date ? `, ${p.date}` : ''}` : ''
  await query('insert into wa_notes (phone, staff_id, body) values ($1, null, $2)',
    [phone, `🤖 AI passed this chat to the team: ${why}${about}${seen ? `. ${seen}` : ''}`]).catch(() => {})
  await query(`update wa_contacts set status = 'open', updated_at = now() where phone = $1`, [phone]).catch(() => {})
  if (ai.order) {
    await query(
      `update orders set needs_attention = $2
        where order_number = $1 and needs_attention is null
          and right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $3`,
      [ai.order, ('WhatsApp: ' + why).slice(0, 500), String(phone).replace(/\D/g, '').slice(-10)]).catch(() => {})
  }
  if (!(await getBot(query)).handoffEmail) return
  const to = await staffRecipients({ query }).catch(() => [])
  if (!to.length) return
  const bucket = Math.floor(Date.now() / (3 * 3600e3))
  const lines = [
    `${name || 'A customer'} (${phone}) on WhatsApp needs a person.`,
    '',
    `Why: ${why}`,
    ai.order ? `Order: ${ai.order}` : null,
    seen || null,
    '',
    `They wrote: "${String(text).slice(0, 500)}"`,
    `The AI replied: "${ai.reply.slice(0, 500)}"`,
    '',
    `Reply here: ${SITE}/whatsappbot`,
  ].filter((l) => l !== null)
  await queueEmail({ query }, {
    to,
    subject: `WhatsApp: ${name || phone} needs a reply${about}`,
    text: lines.join('\n'),
    template: 'wa_handoff',
    dedupeKey: `wa-handoff:${phone}:${bucket}`,
  }).catch((err) => console.error('[wa-ai] handoff email', err.message))
}

// ---- settings ------------------------------------------------------------------------------------------------------
export async function getBot(query = defaultQuery) {
  const { rows: [r] } = await query(`select value from company_settings where key = 'wa_bot'`).catch(() => ({ rows: [] }))
  if (!r) return cleanBot(DEFAULT_BOT)
  try { return cleanBot(JSON.parse(r.value)) } catch { return cleanBot(DEFAULT_BOT) }
}

export async function saveBot(input, { query = defaultQuery } = {}) {
  const bot = cleanBot(input)
  if (!bot.welcome.text.trim()) throw httpError('Empty welcome', { publicMessage: 'Write a welcome message.' })
  if (!bot.items.length) throw httpError('No items', { publicMessage: 'Add at least one menu item.' })
  await query(`insert into company_settings (key, value) values ('wa_bot', $1)
               on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(bot)])
  return bot
}

/** The dashboard's simulator: what the bot would answer, with the (unsaved) settings given. Sends nothing. */
export async function simulate({ bot: input, text, replyId, phone, name, state }, { query = defaultQuery } = {}) {
  const bot = cleanBot(input || DEFAULT_BOT)
  // Like a real chat: no language yet → the English / தமிழ் question first; the pick is kept in the returned state.
  const lang = state?.lang === 'ta' ? 'ta' : state?.lang === 'en' ? 'en' : null
  let decision = decide(botFor(bot, lang || 'en'), { text, replyId }, state || {})
  if (startsChat(bot, text) || (!lang && decision.kind !== 'lang' && decision.kind !== 'chooseLang' && decision.item?.id !== 'campaign_order')) decision = { kind: 'chooseLang' }
  const res = await render(bot, decision, { phone, name, lang: lang || 'en' }, liveDeps(query))
  const awaiting = res.state.awaiting
  return {
    decision: decision.kind, messages: res.messages, paused: Boolean(res.state.pausedHours),
    state: { awaiting, awaiting_at: awaiting ? new Date().toISOString() : null, lang: res.state.lang || lang },
  }
}

/** A readable copy of a message body for the log. */
export function logText(m) {
  if (m.type === 'text') return m.text.body
  const i = m.interactive
  if (i.type === 'cta_url') return `${i.body.text}\n[${i.action.parameters.display_text}: ${i.action.parameters.url}]`
  const opts = i.type === 'button' ? i.action.buttons.map((b) => b.reply.title) : i.action.sections.flatMap((s) => s.rows.map((r) => r.title))
  return `${i.body.text}\n[${opts.join(' · ')}]`
}

/**
 * A customer's message arrived (webhook): answer it if the bot is on and nobody has taken the chat over.
 * `to` is the customer's WhatsApp id (e.g. 919876543210). Never throws.
 */
export async function answer({ to, phone, name, text, replyId, image = null }, { query = defaultQuery, fetchImpl, aiFetch } = {}) {
  try {
    const bot = await getBot(query)
    if (!bot.enabled) return { skipped: 'off' }
    const { rows: [st] } = await query('select * from wa_bot_state where phone = $1', [phone])
    let handedOver = false
    if (st?.paused_until && new Date(st.paused_until) > new Date()) {
      // "menu" brings the bot back before the pause ends. Otherwise the bot is quiet while a person has the
      // chat; but if nobody from the team has replied since it was handed over, the AI keeps answering
      // (sorry for the wait, the team has been reminded) instead of leaving the customer unanswered.
      if (!(text && norm(text) === 'menu')) {
        if (!bot.ai?.enabled) return { skipped: 'a person is handling this chat' }
        const since = new Date(new Date(st.paused_until).getTime() - bot.handoffHours * 3600e3)
        const { rows: [team] } = await query(
          `select 1 from wa_messages where phone = $1 and direction = 'out' and source = 'inbox' and created_at >= $2 limit 1`, [phone, since])
        if (team) return { skipped: 'a person is handling this chat' }
        handedOver = true
      }
    }
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
    const { rows: [c] } = await query(
      `select coalesce((select replies_today from wa_bot_state where phone = $1 and day = $2::date), 0)::int as n`, [phone, today])
    if (c.n >= MAX_REPLIES_A_DAY) return { skipped: 'daily limit for this chat' }
    // An order or shipment number is always looked up, even while the chat is with the team: the AI only knows
    // orders placed from this WhatsApp number and was answering "we could not find order …" (24 Nov 2026).
    const ref = handedOver && !image ? parseTrackingRef(text) : null
    // A greeting ("hi", "hello", "vanakkam") while no one from the team has replied yet is a fresh start: the menu,
    // and the hand-over ends (24 Nov 2026: "hi" got the AI's "we couldn't locate that order" again).
    const greeting = handedOver && !image && isGreeting(bot, text)
    // The chat's language (English unless they chose Tamil). Read with the Tamil words too, so "விலை" works.
    const lang = st?.lang === 'ta' ? 'ta' : 'en'
    let decision = ref ? { kind: 'track', ref, handedOver: true }
      : greeting ? { kind: 'welcome' }
        : handedOver ? { kind: 'ai', text, image, handedOver: true } : decide(botFor(bot, lang), { text, replyId, image }, st || {})
    // English / தமிழ் first, then the menu (owner, 26 Nov 2026): on every greeting ("hi", also while waiting for the
    // team), and on a number's first message of any kind, except while the team has the chat and for the Tamil
    // campaign's order button. Before migration 061 (no lang column) the stored row has no "lang" field: then only
    // greetings ask, so no one is asked again and again.
    const askLanguage = (!image && startsChat(bot, text)) || (!handedOver && !st?.lang && (!st || 'lang' in st)
      && decision.kind !== 'lang' && decision.kind !== 'chooseLang' && decision.item?.id !== 'campaign_order')
    if (askLanguage) decision = { kind: 'chooseLang' }
    const res = await render(bot, decision, { phone, name, lang }, liveDeps(query, { fetchImpl: aiFetch }))
    const source = res.state.ai ? 'ai' : 'bot'
    for (const m of res.messages) {
      const message = { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...m }
      const wamid = await sendMessage(message, { fetchImpl })
      await query(
        `insert into wa_messages (wamid, direction, phone, kind, body, payload, status, source, category)
         values ($1, 'out', $2, $3, $4, $5, 'sent', $6, 'service') on conflict (wamid) do nothing`,
        [wamid, phone, m.type, logText(m).slice(0, 4000), JSON.stringify(message), source])
    }
    await query(
      `insert into wa_bot_state (phone, awaiting, awaiting_at, paused_until, last_reply_at, replies_today, day, updated_at)
       values ($1, $2, case when $2::text is null then null else now() end,
               case when $3::int is null then null else now() + make_interval(hours => $3::int) end, now(), 1, $4::date, now())
       on conflict (phone) do update set awaiting = excluded.awaiting, awaiting_at = excluded.awaiting_at,
         paused_until = case when $3::int is null then (case when wa_bot_state.paused_until > now() then null else wa_bot_state.paused_until end) else excluded.paused_until end,
         last_reply_at = now(), replies_today = case when wa_bot_state.day = $4::date then wa_bot_state.replies_today + 1 else 1 end,
         day = $4::date, updated_at = now()`,
      [phone, res.state.awaiting || null, res.state.pausedHours || null, today])
    // The language they picked, remembered for this number (migration 061; ignored until it is applied).
    if (res.state.lang) await query('update wa_bot_state set lang = $2 where phone = $1', [phone, res.state.lang]).catch(() => {})
    if (res.state.ai?.handoff) await aiHandoff({ phone, name, text, ai: res.state.ai }, { query })
    // One line per answered message in the server log (no message text), to see what the bot did.
    console.log('[wa-bot]', String(phone).slice(-4), decision.kind, `${res.messages.length} sent`, res.state.ai ? `ai handoff=${res.state.ai.handoff}` : '', handedOver ? 'after handover' : '')
    return { replied: res.messages.length, decision: decision.kind, ...(res.state.ai ? { handoff: res.state.ai.handoff } : {}) }
  } catch (err) {
    console.error('[wa-bot]', err.publicMessage || err.message)
    return { error: err.message }
  }
}
