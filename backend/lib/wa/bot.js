// The WhatsApp bot (/whatsappbot → Bot): answers customers on +91 70666 46667 by itself.
//
//   "hi" / "hello" / "vanakkam" / "menu"   → the welcome message with the menu (buttons or a list)
//   tapping a menu item, or its keywords    → that item's reply or action
//   an order number (CR-20261111-AB12C)     → its status, if the order was placed from this WhatsApp number
//   a 6-digit PIN code                      → whether we deliver there and the delivery charge
//   anything else                           → the fallback message and the menu
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

const SITE = 'https://chennairiceindustries.com'
// Links go through the short /w/ links (ShortLink.jsx adds utm_source=whatsapp): tidy in a chat and credited to WhatsApp.
const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })
export const ACTIONS = ['reply', 'track_order', 'offers', 'prices', 'delivery', 'handoff']
const MAX_REPLIES_A_DAY = 60 // per chat: a safety net against loops with another bot

export const DEFAULT_BOT = {
  enabled: true,
  greetings: ['hi', 'hii', 'hello', 'hey', 'hai', 'vanakkam', 'menu', 'start', 'good morning', 'good evening'],
  welcome: {
    text: 'Vanakkam {{name}}! 🙏 Welcome to *Chennai Rice Industries*, makers of Kitchadi Ponni rice.\n\nHow can we help you today? Choose from the menu below.',
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
      reply: 'Thank you! 🙏 Our team will reply to you here shortly (Mon–Sat, 9 am – 7 pm).' },
  ],
  fallback: 'Sorry, I did not get that. 🙏 Please choose from the menu, or type *menu* any time.',
  handoffHours: 12,
}

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
    reply: String(it.reply || '').slice(0, 1024),
  })).filter((it) => it.label)
  const ids = new Set()
  for (const it of items) { while (ids.has(it.id)) it.id += 'x'; ids.add(it.id) }
  return {
    enabled: input.enabled !== false,
    greetings: (Array.isArray(input.greetings) ? input.greetings : String(input.greetings || '').split(',')).map((k) => str(k).toLowerCase()).filter(Boolean).slice(0, 30),
    welcome: {
      text: String(input.welcome?.text || DEFAULT_BOT.welcome.text).slice(0, 1024),
      style: input.welcome?.style === 'buttons' ? 'buttons' : 'list',
      button: str(input.welcome?.button || 'Menu').slice(0, 20),
    },
    items,
    fallback: String(input.fallback || DEFAULT_BOT.fallback).slice(0, 1024),
    handoffHours: Math.min(72, Math.max(1, Number(input.handoffHours) || 12)),
  }
}

/** What to do with one incoming message. Pure: no database, no network. */
export function decide(bot, { text = '', replyId = '' } = {}, state = {}) {
  const items = bot.items || []
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
  if (fresh && state.awaiting === 'order_number' && t) return { kind: 'track', ref: null, text }
  if (!t) return { kind: 'fallback' }
  if ((bot.greetings || []).some((g) => t === norm(g) || t.startsWith(norm(g) + ' '))) return { kind: 'welcome' }
  const item = items.find((it) => (it.keywords || []).some((k) => hasWord(t, k)) || norm(it.label) === t)
  if (item) return { kind: 'item', item }
  return { kind: 'fallback' }
}

// ---- WhatsApp message bodies (without "to") ----
const textMsg = (body) => ({ type: 'text', text: { body: body.slice(0, 4096), preview_url: true } })

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
        sections: [{ title: 'Chennai Rice', rows: items.slice(0, 10).map((it) => ({ id: it.id, title: it.label.slice(0, 24), ...(it.description ? { description: it.description.slice(0, 72) } : {}) })) }],
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
export async function render(bot, decision, { phone = '', name = '' } = {}, deps = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there'
  const welcome = () => menuMsg(bot, bot.welcome.text.replaceAll('{{name}}', first))
  const out = { messages: [], state: { awaiting: null } }
  if (decision.kind === 'welcome') { out.messages.push(welcome()); return out }
  if (decision.kind === 'fallback') { out.messages.push(menuMsg(bot, bot.fallback)); return out }

  if (decision.kind === 'track') {
    const ref = decision.ref || parseTrackingRef(decision.text)
    if (!ref) {
      out.messages.push(textMsg('That does not look like an order number. It looks like *CR-20261111-AB12C*. Please send it again, or type *menu*.'))
      out.state = { awaiting: 'order_number' }
      return out
    }
    const order = await deps.findOrder(ref, phone)
    if (!order) out.messages.push(textMsg('We could not find that order. Please check the number on your order email or SMS. 🙏'))
    else if (!order.samePhone) out.messages.push(textMsg('For your privacy, we can only share an order\'s status with the WhatsApp number used to place it. Please message us from that number, or check it here: ' + SITE + '/track-order'))
    else {
      const lines = [`Order *${order.orderNumber}* is ${STATUS_WORDS[order.status] || order.status.replaceAll('_', ' ')}.`]
      if (order.trackingUrl) lines.push(`Track the courier: ${order.trackingUrl}`)
      if (order.expected) lines.push(`Expected by ${order.expected}.`)
      lines.push(`Full details: ${SITE}/track-order?order=${encodeURIComponent(order.orderNumber)}`)
      out.messages.push(textMsg(lines.join('\n')))
    }
    return out
  }

  if (decision.kind === 'pincode') {
    const d = await deps.delivery(decision.pin)
    if (!d?.delivers) out.messages.push(textMsg(`Sorry, we do not deliver to ${decision.pin} yet. 🙏 For bulk orders, call us on +91 70666 46667.`))
    else {
      const charges = (d.charges || []).map((c) => `• ${c.packKg} kg pack: ${c.from === c.to ? rupees(c.from) : `${rupees(c.from)}–${rupees(c.to)}`} delivery`).join('\n')
      out.messages.push(textMsg(`Yes! ✅ We deliver to ${decision.pin} (${d.region?.name || 'your area'}).${charges ? '\n' + charges : ''}\n\nOrder here: ${SITE}/w/shop-bot`))
    }
    return out
  }

  const item = decision.item
  if (item.action === 'track_order') { out.messages.push(textMsg(item.reply || 'Please send your order number.')); out.state = { awaiting: 'order_number' }; return out }
  if (item.action === 'delivery') { out.messages.push(textMsg(item.reply || 'Please send your 6-digit PIN code.')); out.state = { awaiting: 'pincode' }; return out }
  if (item.action === 'handoff') {
    out.messages.push(textMsg(item.reply || 'Our team will reply to you shortly.'))
    out.state = { awaiting: null, pausedHours: bot.handoffHours }
    return out
  }
  if (item.action === 'prices') {
    const list = await deps.prices()
    const lines = list.length ? list.map((p) => `• ${p.name} ${p.packKg} kg: *${rupees(p.price)}*${p.mrp && p.mrp > p.price ? ` ~${rupees(p.mrp)}~` : ''}`).join('\n') : 'Prices are on our website.'
    out.messages.push(textMsg(`${item.reply || 'Today\'s prices:'}\n${lines}\n\nDelivery charge depends on your PIN code. Order here: ${SITE}/w/shop-bot`))
    return out
  }
  if (item.action === 'offers') {
    const codes = await deps.offers(phone)
    if (!codes.length) out.messages.push(textMsg(item.reply))
    else {
      const lines = codes.map((c) => `• *${c.code}*: ${c.label}${c.until ? ` (till ${c.until})` : ''}`).join('\n')
      out.messages.push(textMsg(`Your offers on this number 🎁\n${lines}\n\nThey are applied automatically when you order from this mobile number: ${SITE}/w/shop-bot`))
    }
    return out
  }
  out.messages.push(textMsg(item.reply || '🙏'))
  return out
}

// ---- the real lookups -------------------------------------------------------------------------------------------
const dateIn = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null)

export function liveDeps(query = defaultQuery) {
  return {
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
  const decision = decide(bot, { text, replyId }, state || {})
  const res = await render(bot, decision, { phone, name }, liveDeps(query))
  const awaiting = res.state.awaiting
  return { decision: decision.kind, messages: res.messages, state: { awaiting, awaiting_at: awaiting ? new Date().toISOString() : null }, paused: Boolean(res.state.pausedHours) }
}

/** A readable copy of a message body for the log. */
export function logText(m) {
  if (m.type === 'text') return m.text.body
  const i = m.interactive
  const opts = i.type === 'button' ? i.action.buttons.map((b) => b.reply.title) : i.action.sections.flatMap((s) => s.rows.map((r) => r.title))
  return `${i.body.text}\n[${opts.join(' · ')}]`
}

/**
 * A customer's message arrived (webhook): answer it if the bot is on and nobody has taken the chat over.
 * `to` is the customer's WhatsApp id (e.g. 919876543210). Never throws.
 */
export async function answer({ to, phone, name, text, replyId }, { query = defaultQuery, fetchImpl } = {}) {
  try {
    const bot = await getBot(query)
    if (!bot.enabled) return { skipped: 'off' }
    const { rows: [st] } = await query('select * from wa_bot_state where phone = $1', [phone])
    if (st?.paused_until && new Date(st.paused_until) > new Date()) {
      // "menu" brings the bot back before the pause ends.
      if (!(text && norm(text) === 'menu')) return { skipped: 'a person is handling this chat' }
    }
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
    const { rows: [c] } = await query(
      `select coalesce((select replies_today from wa_bot_state where phone = $1 and day = $2::date), 0)::int as n`, [phone, today])
    if (c.n >= MAX_REPLIES_A_DAY) return { skipped: 'daily limit for this chat' }
    const decision = decide(bot, { text, replyId }, st || {})
    const res = await render(bot, decision, { phone, name }, liveDeps(query))
    for (const m of res.messages) {
      const message = { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...m }
      const wamid = await sendMessage(message, { fetchImpl })
      await query(
        `insert into wa_messages (wamid, direction, phone, kind, body, payload, status, source, category)
         values ($1, 'out', $2, $3, $4, $5, 'sent', 'bot', 'service') on conflict (wamid) do nothing`,
        [wamid, phone, m.type, logText(m).slice(0, 4000), JSON.stringify(message)])
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
    return { replied: res.messages.length, decision: decision.kind }
  } catch (err) {
    console.error('[wa-bot]', err.publicMessage || err.message)
    return { error: err.message }
  }
}
