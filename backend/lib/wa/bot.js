// The WhatsApp bot (/whatsappbot → Bot): answers customers on +91 70666 46667 by itself.
//
//   "hi" / "hello" / "vanakkam" / "menu"   → the welcome message with the menu (buttons or a list)
//   tapping a menu item, or its keywords    → that item's reply or action
//   an order or shipment ID (CR-… / SHP-…)  → its status, if the order was placed from this WhatsApp number
//   a 6-digit PIN code                      → whether we deliver there and that state's delivery charge
//   anything else                           → an AI reply (Groq, ai.js): short, warm, in their language, from
//                                             their own orders, prices and offers; complaints go to the team.
//                                             Without AI (switched off, or no GROQ_API_KEY): the fallback + menu
//
// Actions an item can have: reply (its text), track_order, offers (this number's spin / referral codes),
// prices (a button to the website), delivery (the standard charges: Tamil Nadu / other states), handoff (a person takes over; the bot is
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
export const ACTIONS = ['reply', 'track_order', 'offers', 'prices', 'delivery', 'handoff', 'bulk']
const MAX_REPLIES_A_DAY = 60 // per chat: a safety net against loops with another bot

// Track: the order number or the shipment ID; Delivery: the standard charges by state, no PIN code (owner, 26 Nov 2026).
const TRACK_REPLY = 'Please send your order number (like *CR-20261111-AB12C*) or shipment ID (like *SHP-AB12-CD34*). You will find them in your order email and SMS.'
const TRACK_REPLY_TA = 'உங்கள் ஆர்டர் எண் (*CR-20261111-AB12C* போல) அல்லது ஷிப்மென்ட் ID (*SHP-AB12-CD34* போல) அனுப்பவும். இவை உங்கள் ஆர்டர் மின்னஞ்சல் மற்றும் SMS-இல் உள்ளன.'
const DELIVERY_REPLY = '🚚 *Delivery charges* (per pack, standard rates)'
const DELIVERY_REPLY_TA = '🚚 *டெலிவரி கட்டணம்* (ஒரு பேக்கிற்கு, நிலையான கட்டணம்)'
// Saved settings from before: the old track / delivery texts are replaced by the new defaults.
const OLD_TRACK = /^Please send your order number\. It looks like/
const OLD_DELIVERY = /PIN/i

// Talk to our team: with the company number (owner, 26 Nov 2026); the old saved texts are updated.
const HUMAN_DESC = 'A person will reply, or call 70666 46667'
const HUMAN_REPLY = 'Thank you! 🙏 Our team will get back to you here soon.\n\n📞 You can also call us on +91 70666 46667.'

// The menu, word for word from "WhatsApp chatbot content – English & Tamil, eight menu options" (owner, 26 Nov 2026).
// Each option: its text, then a button (a link to the website, or a reply button for the next step).
// Bump CONTENT_VERSION when the default texts change: settings saved before then take the new menu (cleanBot).
export const CONTENT_VERSION = 3 // 3: Super Slogan Contest added (27 Nov 2026)
const TALK_REPLY = "Need help? We're here for you! Share your questions with us. Our customer support team will assist you shortly.\n+91 70666 46667"
const TALK_REPLY_TA = 'உங்களுக்கு ஏதேனும் உதவி வேண்டுமா? உங்கள் கேள்விகளை எங்களுடன் பகிர்ந்துகொள்ளுங்கள். எங்கள் வாடிக்கையாளர் சேவைக் குழு விரைவில் உங்களுக்கு உதவும்.\n+91 70666 46667'

export const DEFAULT_BOT = {
  enabled: true,
  contentVersion: CONTENT_VERSION,
  greetings: ['hi', 'hii', 'hello', 'hey', 'hai', 'vanakkam', 'menu', 'start', 'good morning', 'good evening'],
  welcome: {
    text: 'Vanakkam {{name}}! 🙏 Welcome to *Chennai Rice Industries*, makers of Kitchidi Ponni rice.\n\nHow can we help you today? Choose from the menu below.',
    style: 'list',
    button: 'Menu',
  },
  items: [
    { id: 'shop', label: '🛒 Buy Rice', description: 'Order online, home delivery', keywords: ['buy', 'order rice', 'shop', 'purchase', 'website', 'buy rice'], action: 'reply',
      reply: 'Order your favourite Chennai Rice online and get it delivered to your doorstep. Choose your rice and pack size to place your order.',
      button: 'Shop Now', link: SITE + '/w/shop-bot' },
    { id: 'prices', label: '💰 Check Prices', description: '5, 10 and 26 kg packs', keywords: ['price', 'prices', 'rate', 'cost', 'how much', 'vilai', 'check prices'], action: 'prices',
      reply: "Looking for today's rice prices? Check the latest prices of our rice varieties in 5 kg, 10 kg and 26 kg packs.",
      button: 'View Prices', link: SITE + '/w/shop-bot' },
    { id: 'track', label: '📦 Track My Order', description: 'Order ID or Shipment ID', keywords: ['track', 'where is my order', 'order status', 'delivery status', 'not received', 'track my order'], action: 'track_order',
      reply: 'Want to know where your order is? Enter your Order ID or Shipment ID to check your order status. You can find these details in your order confirmation SMS or email.',
      button: 'Track Order', link: SITE + '/track-order' },
    { id: 'offers', label: '🎁 My Offers', description: 'Spin & Win, referral, coupons', keywords: ['offer', 'offers', 'coupon', 'code', 'discount', 'spin', 'reward', 'my offers'], action: 'offers',
      reply: 'Enjoy more savings with Chennai Rice! Explore your available Spin & Win rewards, referral offers and discount coupons.',
      button: 'View Offers', link: SITE + '/w/spin-bot' },
    { id: 'delivery', label: '🚚 Delivery Charges', description: 'Tamil Nadu and other states', keywords: ['deliver', 'delivery charge', 'delivery charges', 'pincode', 'pin code', 'shipping', 'courier'], action: 'delivery',
      reply: 'Want to know your delivery charges? Delivery charges vary depending on your location and pack size. Check the applicable delivery charges for Tamil Nadu and other states.',
      button: 'Check Charges' },
    { id: 'human', label: '👤 Talk to Us', description: 'Call or chat: 70666 46667', keywords: ['agent', 'human', 'person', 'call me', 'talk', 'help', 'complaint', 'phone number', 'contact', 'talk to us'], action: 'handoff',
      reply: TALK_REPLY },
    { id: 'bulk', label: '🏢 Bulk Order', description: 'Hotels, shops, caterers, traders', keywords: ['bulk', 'wholesale', 'bulk order', 'dealer', 'distributor', 'hotel', 'catering'], action: 'bulk',
      reply: 'Looking to purchase rice in bulk for your business? We supply rice to hotels, restaurants, caterers, retailers and wholesalers. Share your requirements, and our sales team will assist you with pricing and order details.',
      button: 'Bulk Enquiry' },
    // The Super Slogan Contest (owner, 27 Nov 2026): how to take part, as on the contest page, and a button to it.
    { id: 'contest', label: '🏆 Super Slogan Contest', description: 'Win a car, scooter, gold and more', keywords: ['contest', 'slogan', 'super slogan', 'slogan contest', 'prize', 'prizes'], action: 'reply',
      reply: 'Take part in the Chennai Rice Super Slogan Contest 2026! 🏆\n\nBuy a Kitchidi Ponni Chennai Rice pack and find the unique code inside. Scan the QR code, submit your details and share your best slogan to win exciting prizes: a car, scooter, gold jewellery, gold coin, LED TV, smartphone and more.',
      button: 'Join Contest', link: SITE + '/w/contest-bot' },
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
      shop: { label: '🛒 அரிசி வாங்க', description: 'ஆன்லைன் ஆர்டர், வீட்டுக்கே டெலிவரி', keywords: ['ஆர்டர்', 'வாங்க', 'அரிசி வாங்க'],
        reply: 'உங்களுக்குப் பிடித்த சென்னை ரைஸ் அரிசியை ஆன்லைனில் ஆர்டர் செய்து வீட்டுக்கே பெற்றிடுங்கள். உங்களுக்கு விருப்பமான அரிசி வகையையும் அளவையும் தேர்வு செய்யுங்கள்.',
        button: 'அரிசி வாங்க' },
      prices: { label: '💰 விலை பார்க்க', description: '5, 10 மற்றும் 26 கிலோ', keywords: ['விலை', 'ரேட்', 'விலை பார்க்க'],
        reply: 'இன்றைய அரிசி விலையைத் தெரிந்துகொள்ள வேண்டுமா? 5 கிலோ, 10 கிலோ மற்றும் 26 கிலோ அரிசி மூட்டைகளின் விலையைப் பாருங்கள்.',
        button: 'விலை பார்க்க' },
      track: { label: '📦 ஆர்டர் நிலை', description: 'ஆர்டர் எண் அல்லது Shipment ID', keywords: ['ஆர்டர் நிலை', 'டிராக்'],
        reply: 'உங்கள் ஆர்டர் எங்கே இருக்கிறது என்று தெரிந்துகொள்ள வேண்டுமா? உங்கள் ஆர்டர் எண் அல்லது Shipment ID-ஐ அனுப்புங்கள். இந்த விவரங்கள் உங்களுக்கு வந்த SMS அல்லது Email-ல் இருக்கும்.',
        button: 'ஆர்டர் நிலை' },
      offers: { label: '🎁 என் சலுகைகள்', description: 'Spin & Win, பரிந்துரை, கூப்பன்கள்', keywords: ['சலுகை', 'தள்ளுபடி', 'கூப்பன்'],
        reply: 'சென்னை ரைஸ் அரிசியைச் சலுகை விலையில் வாங்கி மகிழுங்கள்! உங்களுக்கான Spin & Win பரிசுகள், பரிந்துரைச் சலுகைகள் மற்றும் தள்ளுபடி கூப்பன்களைப் பாருங்கள்.',
        button: 'சலுகை பார்க்க' },
      delivery: { label: '🚚 டெலிவரி கட்டணம்', description: 'தமிழ்நாடு மற்றும் பிற மாநிலங்கள்', keywords: ['டெலிவரி', 'கட்டணம்', 'பின்கோடு'],
        reply: 'டெலிவரி கட்டணம் எவ்வளவு என்று தெரிந்துகொள்ள வேண்டுமா? உங்கள் பகுதி மற்றும் அரிசி மூட்டையின் எடையைப் பொறுத்து டெலிவரி கட்டணம் மாறுபடும். தமிழ்நாடு மற்றும் பிற மாநிலங்களுக்கான டெலிவரி கட்டணத்தைப் பாருங்கள்.',
        button: 'கட்டணம் பார்க்க' },
      human: { label: '👤 உதவி பெற', description: 'அழைக்க அல்லது சாட்: 70666 46667', keywords: ['உதவி', 'புகார்', 'பேச', 'உதவி பெற'],
        reply: TALK_REPLY_TA },
      bulk: { label: '🏢 மொத்த ஆர்டர்', description: 'ஹோட்டல், கடை, கேட்டரிங், வியாபாரிகள்', keywords: ['மொத்த', 'மொத்த ஆர்டர்', 'ஹோல்சேல்'],
        reply: 'உங்கள் வியாபாரத்திற்கு மொத்தமாக அரிசி தேவையா? ஹோட்டல்கள், உணவகங்கள், கேட்டரிங் நிறுவனங்கள், சில்லறை மற்றும் மொத்த வியாபாரிகளுக்கு அரிசி வழங்குகிறோம். உங்கள் தேவைகளைத் தெரிவியுங்கள். விலை மற்றும் ஆர்டர் விவரங்களை அறிய எங்கள் விற்பனைக் குழு உங்களுக்கு உதவும்.',
        button: 'மொத்த ஆர்டர்' },
      contest: { label: '🏆 ஸ்லோகன் போட்டி', description: 'கார், ஸ்கூட்டர், தங்கம் மற்றும் பல பரிசுகள்', keywords: ['போட்டி', 'ஸ்லோகன்', 'பரிசு'],
        reply: 'சென்னை ரைஸ் சூப்பர் ஸ்லோகன் போட்டி 2026-இல் பங்கேற்றுங்கள்! 🏆\n\nகிச்சடி பொன்னி சென்னை ரைஸ் பேக்கை வாங்கி, அதில் உள்ள தனித்துவமான குறியீட்டைக் கண்டுபிடியுங்கள். QR குறியீட்டை ஸ்கேன் செய்து, உங்கள் விவரங்களைச் சமர்ப்பித்து, உங்கள் சிறந்த ஸ்லோகனைப் பகிருங்கள். கார், ஸ்கூட்டர், தங்க நகைகள், தங்க நாணயம், LED TV, ஸ்மார்ட்போன் மற்றும் பல அற்புதமான பரிசுகளை வெல்லுங்கள்!',
        button: 'போட்டியில் சேர' },
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
/** Option 07, Change Language: "Which language would you like to continue in?" with தமிழ் / English. */
export function changeLanguageMsg(lang = 'en') {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: lang === 'ta' ? 'எந்த மொழியில் தொடர விரும்புகிறீர்கள்?' : 'Which language would you like to continue in?' },
      action: { buttons: [{ type: 'reply', reply: { id: 'lang_ta', title: 'தமிழ்' } }, { type: 'reply', reply: { id: 'lang_en', title: 'English' } }] },
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
      return t ? { ...it, label: t.label || it.label, description: t.description ?? it.description, reply: t.reply || it.reply, button: t.button || it.button, keywords: [...(it.keywords || []), ...(t.keywords || [])] } : it
    }),
    fallback: ta.fallback || bot.fallback,
  }
}

// The bot's own sentences (not editable in the dashboard), per language.
const TEXT = {
  en: {
    notOrderNo: 'That does not look like an order number or shipment ID. They look like *CR-20261111-AB12C* or *SHP-AB12-CD34* (in your order email and SMS). Send it any time, or choose from the menu below.',
    notFound: 'We could not find a placed order with that number or shipment ID. 🙏 Please check it on your order email or SMS. If the payment did not go through, the order was not placed — you can order again here: ' + SITE + '/w/shop-bot',
    privacy: 'For your privacy, we can only share an order\'s status with the WhatsApp number used to place it. Please message us from that number, or check it here: ' + SITE + '/track-order',
    orderIs: (no, status) => `Order *${no}* is ${status}.`,
    courier: (url) => `Track the courier: ${url}`,
    expected: (d) => `Expected by ${d}.`,
    details: (url) => `Full details: ${url}`,
    noPin: (pin) => `Sorry, we do not deliver to ${pin} yet. 🙏 For bulk orders, call us on +91 70666 46667.`,
    yesPin: (pin, area, charges) => `Yes! ✅ We deliver to ${pin} (${area || 'your area'}).${charges ? '\n' + charges : ''}\n\nOrder here: ${SITE}/w/shop-bot`,
    deliveryZone: (zone, packs) => `*${zone === 'TN' ? 'Tamil Nadu' : 'Other states'}:* ${packs}`,
    deliveryFoot: `Shown again before you pay. Order here: ${SITE}/w/shop-bot`,
    deliveryNone: `The delivery charge is a standard rate for Tamil Nadu and for other states, shown before you pay. Order here: ${SITE}/w/shop-bot`,
    charge: (kg, amount) => `• ${kg} kg pack: ${amount} delivery`,
    offers: (lines) => `Your offers on this number 🎁\n${lines}\n\nThey are applied automatically when you order from this mobile number: ${SITE}/w/shop-bot`,
    until: (d) => ` (till ${d})`,
    sorryWait: 'Sorry for the wait 🙏 Our team will get back to you here soon.',
    handoff: 'Our team will reply to you shortly.',
    askOrder: TRACK_REPLY,
    trackWeb: 'Or track it yourself on our website',
    products: "Looking for today's rice prices? Check the latest prices of our rice varieties in 5 kg, 10 kg and 26 kg packs.",
    productsButton: 'View Prices',
    deliveryHead: '🚚 *Delivery charges* (per pack)',
    bulkDetails: 'Please share the following details to help us serve you better:\n• Name\n• Business / Shop Name\n• Business Type\n• Required Quantity (kg)\n• Location / Pincode\n• Contact Number',
    bulkThanks: 'Thank you for your interest in Chennai Rice! Our sales team will contact you shortly to discuss your bulk order requirements.',
    offersNone: 'No active offers on this number right now.',
    status: {
      placed: 'received ✅ and waiting to be confirmed', confirmed: 'confirmed ✅ and being packed', packed: 'packed 📦 and ready to leave our mill',
      shipped: 'on the way 🚚', delivered: 'delivered ✅', cancelled: 'cancelled', returned: 'returned',
    },
  },
  ta: {
    notOrderNo: 'இது ஆர்டர் எண் அல்லது ஷிப்மென்ட் ID போல இல்லை. அவை *CR-20261111-AB12C* அல்லது *SHP-AB12-CD34* போல இருக்கும் (உங்கள் ஆர்டர் மின்னஞ்சல் மற்றும் SMS-இல்). எப்போது வேண்டுமானாலும் அனுப்பலாம், அல்லது கீழே உள்ள மெனுவில் தேர்ந்தெடுக்கவும்.',
    notFound: 'இந்த எண் அல்லது ஷிப்மென்ட் ID-யில் ஆர்டர் எதுவும் கிடைக்கவில்லை. 🙏 உங்கள் ஆர்டர் மின்னஞ்சல் அல்லது SMS-இல் எண்ணைச் சரிபார்க்கவும். பணம் செலுத்துதல் முடியவில்லை என்றால் ஆர்டர் பதிவாகவில்லை; இங்கே மீண்டும் ஆர்டர் செய்யலாம்: ' + SITE + '/w/shop-bot',
    privacy: 'உங்கள் தனியுரிமைக்காக, ஆர்டர் செய்த WhatsApp எண்ணுக்கு மட்டுமே ஆர்டர் நிலையைப் பகிர முடியும். அந்த எண்ணிலிருந்து மெசேஜ் செய்யவும், அல்லது இங்கே பார்க்கவும்: ' + SITE + '/track-order',
    orderIs: (no, status) => `ஆர்டர் *${no}*: ${status}.`,
    courier: (url) => `கூரியரைப் பின்தொடர: ${url}`,
    expected: (d) => `${d}-க்குள் வந்து சேரும்.`,
    details: (url) => `முழு விவரம்: ${url}`,
    noPin: (pin) => `மன்னிக்கவும், ${pin}-க்கு இப்போது டெலிவரி இல்லை. 🙏 மொத்த ஆர்டர்களுக்கு +91 70666 46667 என்ற எண்ணில் அழைக்கவும்.`,
    yesPin: (pin, area, charges) => `ஆம்! ✅ ${pin}${area ? ` (${area})` : ''}-க்கு டெலிவரி செய்கிறோம்.${charges ? '\n' + charges : ''}\n\nஇங்கே ஆர்டர் செய்யவும்: ${SITE}/w/shop-bot`,
    charge: (kg, amount) => `• ${kg} kg பேக்: டெலிவரி ${amount}`,
    deliveryZone: (zone, packs) => `*${zone === 'TN' ? 'தமிழ்நாடு' : 'பிற மாநிலங்கள்'}:* ${packs}`,
    deliveryFoot: `பணம் செலுத்தும் முன் மீண்டும் காட்டப்படும். இங்கே ஆர்டர் செய்யவும்: ${SITE}/w/shop-bot`,
    deliveryNone: `டெலிவரி கட்டணம் தமிழ்நாட்டுக்கும் பிற மாநிலங்களுக்கும் நிலையான கட்டணம்; பணம் செலுத்தும் முன் காட்டப்படும். இங்கே ஆர்டர் செய்யவும்: ${SITE}/w/shop-bot`,
    offers: (lines) => `இந்த எண்ணில் உள்ள உங்கள் சலுகைகள் 🎁\n${lines}\n\nஇந்த மொபைல் எண்ணிலிருந்து ஆர்டர் செய்யும்போது தானாகவே பொருந்தும்: ${SITE}/w/shop-bot`,
    until: (d) => ` (${d} வரை)`,
    sorryWait: 'காத்திருக்க வைத்ததற்கு மன்னிக்கவும் 🙏 எங்கள் குழு விரைவில் இங்கே பதில் அளிக்கும்.',
    handoff: 'எங்கள் குழு விரைவில் பதில் அளிக்கும்.',
    askOrder: TRACK_REPLY_TA,
    trackWeb: 'அல்லது எங்கள் இணையதளத்தில் நீங்களே பார்க்கலாம்',
    products: 'இன்றைய அரிசி விலையைத் தெரிந்துகொள்ள வேண்டுமா? 5 கிலோ, 10 கிலோ மற்றும் 26 கிலோ அரிசி மூட்டைகளின் விலையைப் பாருங்கள்.',
    productsButton: 'விலை பார்க்க',
    deliveryHead: '🚚 *டெலிவரி கட்டணம்* (ஒரு மூட்டைக்கு)',
    bulkDetails: 'உங்களுக்கு சிறந்த முறையில் உதவ, கீழ்க்கண்ட விவரங்களை அனுப்புங்கள்:\n• உங்கள் பெயர்\n• கடை / நிறுவனத்தின் பெயர்\n• வியாபார வகை\n• தேவையான அரிசி அளவு (கிலோ)\n• ஊர் / பின்கோடு\n• தொடர்பு எண்',
    bulkThanks: 'சென்னை ரைஸ் மீது நீங்கள் காட்டும் ஆர்வத்திற்கு நன்றி! உங்கள் மொத்த ஆர்டர் தேவைகள் குறித்து எங்கள் விற்பனைக் குழு விரைவில் உங்களைத் தொடர்புகொள்ளும்.',
    offersNone: 'இந்த எண்ணில் தற்போது சலுகைகள் எதுவும் இல்லை.',
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
    ...(it.button ? { button: str(it.button).slice(0, 20) } : {}),
    ...(/^https:\/\/chennairiceindustries\.com\//.test(str(it.link)) ? { link: str(it.link) } : {}),
  })).filter((it) => it.label)
  for (const it of items) {
    const def = DEFAULT_BOT.items.find((d) => d.id === it.id)
    if (it.action === 'track_order' && (!it.reply || OLD_TRACK.test(it.reply))) it.reply = TRACK_REPLY
    // Talk to our team always gives the company number, whatever reply was saved in Bot settings.
    if (it.action === 'handoff' && it.id === 'human') {
      if (!/70666/.test(it.reply)) it.reply = it.reply ? `${it.reply.trimEnd()}\n\n📞 You can also call us on +91 70666 46667.` : HUMAN_REPLY
      if (!/70666/.test(it.description) && (!it.description || /person will reply/i.test(it.description))) it.description = HUMAN_DESC
    }
    if (it.action === 'delivery' && def && (OLD_DELIVERY.test(it.description) || OLD_DELIVERY.test(it.reply) || it.label === '🚚 Delivery to my area')) {
      Object.assign(it, { label: def.label, description: def.description, reply: def.reply })
    }
  }
  // Settings saved before the 8-option content (owner, 26 Nov 2026): the new menu, plus any item added in the dashboard.
  const old = (Number(input.contentVersion) || 0) < CONTENT_VERSION
  if (old && items.length) {
    const own = items.filter((it) => !['shop', 'prices', 'track', 'offers', 'delivery', 'human', 'bulk', 'contest'].includes(it.id))
    items.splice(0, items.length, ...DEFAULT_BOT.items.map((d) => ({ ...d, keywords: [...d.keywords] })), ...own.slice(0, 2))
  }
  const ids = new Set()
  for (const it of items) { while (ids.has(it.id)) it.id += 'x'; ids.add(it.id) }
  return {
    enabled: input.enabled !== false,
    contentVersion: CONTENT_VERSION,
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
    ta: input.ta && typeof input.ta === 'object' && !old ? {
      welcome: { text: noHours(input.ta.welcome?.text || DEFAULT_BOT.ta.welcome.text).slice(0, 1024), button: str(input.ta.welcome?.button || DEFAULT_BOT.ta.welcome.button).slice(0, 20) },
      items: { ...DEFAULT_BOT.ta.items, ...(input.ta.items && typeof input.ta.items === 'object' ? input.ta.items : {}), },
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
  if (replyId === 'lang') return { kind: 'chooseLang', change: true }
  // Reply buttons under option 05 (delivery charges) and 08 (bulk enquiry).
  if (replyId === 'delivery_rates') return { kind: 'deliveryRates' }
  if (replyId === 'bulk_enquiry') return { kind: 'bulkAsk' }
  const said = String(text || '').trim().toLowerCase()
  if (LANG_WORDS[said]) return { kind: 'lang', lang: LANG_WORDS[said] }
  if (PICK_WORDS.includes(said)) return { kind: 'chooseLang', change: true }
  if (replyId) {
    const item = items.find((it) => it.id === replyId)
    if (item) return { kind: 'item', item }
    if (replyId === 'menu') return { kind: 'welcome' }
  }
  const t = norm(text)
  // Bulk enquiry: the next message after the details request is the enquiry (unless it is a greeting, "menu" or "cancel").
  const bulkFresh = state.awaiting === 'bulk_details' && state.awaiting_at && Date.now() - new Date(state.awaiting_at).getTime() < 60 * 60e3
  if (bulkFresh && t && !ESCAPE_WORDS.includes(t) && !(bot.greetings || []).some((g) => t === norm(g))) return { kind: 'bulkDetails', text }
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

// The list rows: the items, with "Change Language" as option 07 (before Bulk Order, as in the content PDF).
function menuRows(bot, items) {
  const rows = items.slice(0, 9).map((it) => ({ id: it.id, title: it.label.slice(0, 24), ...(it.description ? { description: it.description.slice(0, 72) } : {}) }))
  const langRow = { id: 'lang', title: bot.lang === 'ta' ? '🌐 மொழியை மாற்ற' : '🌐 Change Language', description: 'தமிழ் / English' }
  const at = rows.findIndex((r) => r.id === 'bulk')
  rows.splice(at < 0 ? rows.length : at, 0, langRow)
  return rows
}

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
        sections: [{ title: 'Chennai Rice', rows: menuRows(bot, items) }],
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
  // Option 05's button: the standard charges per pack, Tamil Nadu and other states.
  async function deliveryRatesMsg() {
    const zones = deps.deliveryCharges ? await deps.deliveryCharges().catch(() => null) : null
    const lines = ['TN', 'OTHER'].filter((z) => zones?.[z]?.length)
      .map((z) => t.deliveryZone(z, zones[z].map((c) => `${c.packKg} kg *${c.from === c.to ? rupees(c.from) : `${rupees(c.from)}–${rupees(c.to)}`}*`).join('  ·  ')))
    return textMsg(lines.length ? [t.deliveryHead, ...lines, t.deliveryFoot].join('\n\n') : t.deliveryNone)
  }
  const welcome = () => menuMsg(bot, bot.welcome.text.replaceAll(' {{name}}', first ? ' ' + first : '').replaceAll('{{name}}', first))
  const out = { messages: [], state: { awaiting: null } }
  // A message with one button: a link to our website (cta_url) or a reply button for the next step.
  const linkButton = (body, label, url) => ({ type: 'interactive', interactive: { type: 'cta_url', body: { text: body.slice(0, 1024) }, action: { name: 'cta_url', parameters: { display_text: String(label).slice(0, 20), url } } } })
  const replyButton = (body, label, id) => ({ type: 'interactive', interactive: { type: 'button', body: { text: body.slice(0, 1024) }, action: { buttons: [{ type: 'reply', reply: { id, title: String(label).slice(0, 20) } }] } } })
  const itemById = (id) => (bot.items || []).find((it) => it.id === id) || {}
  if (decision.kind === 'chooseLang') { out.messages.push(decision.change ? changeLanguageMsg(lang) : languageMsg()); return out }
  if (decision.kind === 'deliveryRates') return { ...out, messages: [await deliveryRatesMsg()] }
  if (decision.kind === 'bulkAsk') { out.messages.push(plainText(t.bulkDetails)); out.state = { awaiting: 'bulk_details' }; return out }
  if (decision.kind === 'bulkDetails') {
    // Thank them; the chat goes to the team with the enquiry as a note (answer() writes it).
    out.messages.push(plainText(t.bulkThanks))
    out.state = { awaiting: null, pausedHours: bot.handoffHours, bulk: String(decision.text || '').slice(0, 1000) }
    return out
  }
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
  if (item.action === 'track_order') {
    out.messages.push(item.button ? linkButton(item.reply || t.askOrder, item.button, item.link || SITE + '/track-order') : textMsg(`${item.reply || t.askOrder}\n\n${t.trackWeb}: ${SITE}/track-order`))
    out.state = { awaiting: 'order_number' }
    return out
  }
  if (item.action === 'bulk') { out.messages.push(replyButton(item.reply, item.button || (lang === 'ta' ? 'மொத்த ஆர்டர்' : 'Bulk Enquiry'), 'bulk_enquiry')); return out }
  if (item.action === 'delivery') {
    out.messages.push(item.button ? replyButton(item.reply, item.button, 'delivery_rates') : await deliveryRatesMsg())
    return out
  }
  if (item.action === 'handoff') {
    out.messages.push(textMsg(item.reply || t.handoff))
    out.state = { awaiting: null, pausedHours: bot.handoffHours }
    return out
  }
  if (item.action === 'prices') {
    out.messages.push(item.button ? linkButton(item.reply || t.products, item.button, item.link || SITE + '/w/shop-bot') : productsMsg(lang))
    return out
  }
  if (item.action === 'offers') {
    const codes = await deps.offers(phone)
    const lines = codes.map((c) => `• *${c.code}*: ${c.label}${c.until ? t.until(c.until) : ''}`).join('\n')
    if (item.button) {
      // The option's text, this number's own codes (or none), and View Offers: the shop (codes apply there) or Spin & Win.
      const body = [item.reply, codes.length ? lines : t.offersNone].filter(Boolean).join('\n\n')
      out.messages.push(linkButton(body, item.button, codes.length ? SITE + '/w/shop-bot' : (item.link || SITE + '/w/spin-bot')))
    } else if (!codes.length) out.messages.push(textMsg(item.reply))
    else out.messages.push(textMsg(t.offers(lines)))
    return out
  }
  out.messages.push(item.button && item.link ? linkButton(item.reply || '🙏', item.button, item.link) : textMsg(item.reply || '🙏'))
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
    /** The standard delivery charge per pack: Tamil Nadu, and every other state (the other regions together). */
    async deliveryCharges() {
      const { rows } = await query(
        `select (rp.region = 'TN') as tn, v.pack_kg, min(rp.delivery_paise) as lo, max(rp.delivery_paise) as hi
           from variant_region_prices rp
           join product_variants v on v.id = rp.variant_id and v.is_active and v.price_paise is not null
           join products p on p.id = v.product_id and p.is_active
           join shipping_zones z on z.code = rp.region and z.is_active
          group by 1, 2 order by 1 desc, 2`)
      const out = { TN: [], OTHER: [] }
      for (const r of rows) out[r.tn ? 'TN' : 'OTHER'].push({ packKg: Number(r.pack_kg), from: Number(r.lo) / 100, to: Number(r.hi) / 100 })
      return out
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
    // Tapping English / தமிழ் (even on an older message) is a fresh start too: the menu in that language, not the AI
    // (owner, 26 Nov 2026: தமிழ் tapped after "Talk to our team" got an AI reply).
    const langTap = handedOver && /^lang(_en|_ta)?$/.test(String(replyId || ''))
    // The chat's language (English unless they chose Tamil). Read with the Tamil words too, so "விலை" works.
    const lang = st?.lang === 'ta' ? 'ta' : 'en'
    let decision = ref ? { kind: 'track', ref, handedOver: true }
      : langTap ? decide(botFor(bot, lang), { text, replyId }, {})
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
    // Bulk enquiry details: a note on the chat for the sales team, and the chat opens in the Inbox.
    if (res.state.bulk) {
      await query('insert into wa_notes (phone, staff_id, body) values ($1, null, $2)', [phone, `🏢 Bulk order enquiry from ${name || 'the customer'}: ${res.state.bulk}`]).catch(() => {})
      await query(`update wa_contacts set status = 'open', updated_at = now() where phone = $1`, [phone]).catch(() => {})
    }
    if (res.state.ai?.handoff) await aiHandoff({ phone, name, text, ai: res.state.ai }, { query })
    // One line per answered message in the server log (no message text), to see what the bot did.
    console.log('[wa-bot]', String(phone).slice(-4), decision.kind, `${res.messages.length} sent`, res.state.ai ? `ai handoff=${res.state.ai.handoff}` : '', handedOver ? 'after handover' : '')
    return { replied: res.messages.length, decision: decision.kind, ...(res.state.ai ? { handoff: res.state.ai.handoff } : {}) }
  } catch (err) {
    console.error('[wa-bot]', err.publicMessage || err.message)
    return { error: err.message }
  }
}
