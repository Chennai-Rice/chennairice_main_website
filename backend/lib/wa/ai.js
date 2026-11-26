// The WhatsApp bot's AI replies (Groq): whatever a customer types that the menu does not cover —
// "I ordered on 10th, still not delivered", "which rice for biryani?", "why is no one answering?" — gets a
// short, warm, human reply in the customer's own language, written from facts we look up for them:
// their orders (by their WhatsApp number), today's prices, their offers. It never invents a price, a date
// or a promise. A complaint, a refund, a damaged pack, an angry customer or anything it is unsure of is
// handed to the team (the reply says so, and the team is told).
//
// One call per message (no tool loop): the facts are fetched first and given to the model, which answers
// in JSON { reply, handoff, reason, order }.
import { query as defaultQuery } from '../db.js'
import { downloadMedia as cloudDownload } from './cloud.js'

// Groq's model that can see pictures; it only reads the photo into facts, the reply is written as usual.
const VISION_MODELS = () => [...new Set([process.env.WA_AI_VISION_MODEL, 'qwen/qwen3.8-27b', 'meta-llama/llama-4-scout-17b-16e-instruct'].filter(Boolean))]
const MAX_PHOTO_BYTES = 4 * 1024 * 1024

const MODEL = () => process.env.WA_AI_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
// When the main model's per-minute token allowance is used up (429), this one answers instead.
const FALLBACK_MODEL = () => process.env.WA_AI_FALLBACK_MODEL || 'openai/gpt-oss-20b'
const SITE = 'https://chennairiceindustries.com'
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10)
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '')
const rupees = (paise) => '₹' + (Number(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

// What each order status means, in words a customer understands (and what to tell them).
const STATUS = {
  pending_payment: 'not paid yet (the payment was not completed, so this is not a confirmed order)',
  placed: 'paid and received, waiting to be confirmed and packed',
  confirmed: 'confirmed, being packed',
  packed: 'packed, waiting for the courier',
  shipped: 'with the courier, on the way',
  out_for_delivery: 'out for delivery today',
  delivered: 'delivered',
  cancelled: 'cancelled',
  returned: 'returned',
}

/** This customer's recent orders (placed from this WhatsApp number), with what is happening to each. */
export async function customerOrders(query, phone) {
  const p = last10(phone)
  if (p.length !== 10) return []
  const { rows } = await query(
    `select o.id, o.order_number, o.status, o.payment_status, o.total_paise, o.created_at, o.delivery_method,
            o.shipping_address->>'city' as city,
            (select string_agg(i.quantity || ' × ' || i.product_name || ' (' || i.pack_kg || ' kg)', ', ')
               from order_items i where i.order_id = o.id) as items,
            s.tracking_url, s.expected_delivery, s.carrier_name
       from orders o
       left join lateral (select tracking_url, expected_delivery, carrier_name from shipments
                           where order_id = o.id and status <> 'returned' order by shipped_at desc limit 1) s on true
      where right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10) = $1
        and (o.status <> 'pending_payment' or o.created_at > now() - interval '2 days')
      order by o.created_at desc limit 5`, [p])
  const now = Date.now()
  return rows.map((o) => {
    const days = Math.floor((now - new Date(o.created_at).getTime()) / 86400e3)
    // Paid but not moving for 2+ days (still "placed"/"confirmed"): late, and the team must know.
    const late = ['placed', 'confirmed'].includes(o.status) && days >= 2
    return {
      orderNumber: o.order_number,
      placed: day(o.created_at),
      daysAgo: days,
      status: o.status,
      meaning: STATUS[o.status] || o.status,
      paid: o.payment_status === 'paid',
      total: rupees(o.total_paise),
      totalPaise: Number(o.total_paise),
      items: o.items || '',
      city: o.city || '',
      delivery: o.delivery_method === 'in_house' ? 'our own delivery team' : 'courier',
      tracking: o.tracking_url || null,
      courier: o.carrier_name || null,
      expected: day(o.expected_delivery) || null,
      late,
      trackPage: `${SITE}/track-order?order=${encodeURIComponent(o.order_number)}`,
    }
  })
}

/** The chat so far (oldest first), as the model's turns. */
export async function chatHistory(query, phone, limit = 14) {
  const { rows } = await query(
    `select direction, body, source from wa_messages where phone = $1 and body is not null and body <> ''
      order by created_at desc limit $2`, [phone, limit])
  return rows.reverse().map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: (m.direction === 'out' && m.source === 'inbox' ? '[Team member] ' : '') + String(m.body).slice(0, 800),
  }))
}

/** India time and whether the team is in (Mon–Sat, 9 am – 7 pm). */
export function teamHours(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600e3)
  const dow = ist.getUTCDay()
  const h = ist.getUTCHours()
  const open = dow !== 0 && h >= 9 && h < 19
  const when = ist.toISOString().slice(0, 16).replace('T', ' ')
  return { open, when, weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow] }
}

/** What the vision model saw, plus the order a payment screenshot matches (worked out here, not by the model). */
function photoFacts(photo) {
  if (!photo) return ''
  if (photo.unreadable) return 'PHOTO: the customer sent a photo that could not be opened. Ask them to type in a line what it is about, and hand over if it may be a complaint.\n'
  const lines = [`PHOTO the customer just sent (read by our system): ${photo.kind}: ${photo.summary || 'no description'}`]
  if (photo.kind === 'payment') {
    lines.push(`Payment shown: ${photo.amount ? '₹' + photo.amount : 'amount unclear'}${photo.date ? ', ' + photo.date : ''}${photo.status ? ', status ' + photo.status : ''}${photo.app ? ', via ' + photo.app : ''}.`)
    if (photo.match?.paid) lines.push(`It matches their order ${photo.match.orderNumber}, which our system ALREADY shows as PAID. Thank them, confirm we have their payment for that order, and give that order's status (and if it is LATE, follow the late-order rule).`)
    else if (photo.match) lines.push(`It matches the amount of their order ${photo.match.orderNumber}, but our system does NOT show that order as paid. Do not confirm the payment: say the team will check it and update them, and hand over.`)
    else lines.push('It does not match any order of theirs. Do not confirm anything: thank them, say the team will check the payment and update them, and hand over.')
  }
  if (photo.kind === 'damaged_or_wrong') lines.push('Say sorry sincerely, say the team will sort it out, and hand over. Do not promise a refund or replacement.')
  return lines.join('\n') + '\n'
}

export function systemPrompt({ name, orders, prices, offers, hours, handedOver, photo = null, lang = 'en' }) {
  const orderLines = orders.length
    ? orders.map((o) => `- ${o.orderNumber}: placed ${o.placed} (${o.daysAgo} days ago), ${o.items || 'items not listed'}, total ${o.total}, to ${o.city || 'their address'} by ${o.delivery}. Status: ${o.meaning}.`
      + (o.tracking ? ` Courier${o.courier ? ` (${o.courier})` : ''} tracking: ${o.tracking}.` : '') + (o.expected ? ` Expected by ${o.expected}.` : '')
      + (o.late ? ' LATE: paid but not dispatched for 2+ days.' : '') + ` Details page: ${o.trackPage}`).join('\n')
    : '- No orders from this WhatsApp number. (They may have ordered from another number: ask for the order number, which looks like CR-20261111-AB12C.)'
  const priceLines = prices.length ? prices.map((p) => `- ${p.name}, ${p.packKg} kg pack: ₹${p.price} for the whole ${p.packKg} kg pack`).join('\n') : '- (prices unavailable right now: send them to the website)'
  const offerLines = offers.length ? offers.map((o) => `- ${o.code}: ${o.label}${o.until ? ` (till ${o.until})` : ''}`).join('\n') : '- none'

  return `You are a friendly person on the Chennai Rice Industries customer team, replying on WhatsApp (+91 70666 46667). Chennai Rice makes Kitchidi Ponni and other rice, milled and packed in Erode, Tamil Nadu, and sells online at ${SITE} with home delivery.

HOW TO WRITE
- Sound like a warm, real person texting — not a bot, not a form letter. Short: usually 1–4 sentences. No headings, no long lists. At most one emoji, only when it fits.
${lang === 'ta' ? '- This customer chose Tamil (தமிழ்) for this chat: write your whole reply in Tamil letters (product names, prices, order numbers and links may stay in English), unless their latest message is clearly in English.\n' : ''}- Reply in the customer's language AND script. If their message is written in Tamil letters (e.g. "இட்லிக்கு எந்த அரிசி?"), write your whole reply in Tamil letters (product names, prices and links may stay in English). Tamil words in English letters (Tanglish, e.g. "biryani ku entha rice") → reply in Tanglish. English → simple English.
- Describe a rice only with what its name and pack say (e.g. "aged", "idly rice"); do not invent qualities.
- Use their name (${name || 'unknown'}) at most once, and only if it feels natural.
- When they are upset (late order, nobody answered), first say sorry sincerely and own it, then give the facts, then the next step. Never argue, never blame them.
- WhatsApp formatting only: *bold* for an order number or price. Plain links.

ONLY THESE FACTS — never invent anything
Their orders (looked up from their WhatsApp number):
${orderLines}

Today's prices, per pack (inclusive of GST; delivery is a standard charge per pack, one rate for Tamil Nadu and one for other states, shown on the website before paying; never mention PIN codes or an MRP discount):
${priceLines}

Their offers / codes:
${offerLines}

Timing: never mention working hours, days, dates or times for a reply (no "Monday", "tomorrow", "9 am", "next working morning"). Just say the team will get back to them soon.
${photoFacts(photo)}${handedOver ? 'This chat has already been passed to the team and no one has replied yet: apologise for the wait and reassure them the team has been reminded.\n' : ''}
RULES
- An order number that is not in their list above may still exist (placed from another number): never say it is not in our system — ask them to send just the order number (it looks like CR-20261111-AB12C) or the shipment ID (SHP-AB12-CD34) and the bot will check it.
- Order status: say what the status means in plain words, with the courier link or details page if there is one. Never promise a delivery date unless "Expected by" is given.
- A LATE order (paid, not dispatched for 2+ days): apologise, say you have flagged it to the dispatch team right now and someone from the team will get back to them soon, and hand over.
- Prices: only from the list above. If they ask for the prices of all or several rices, or the price list ("price list", "all rice rate", "what rices do you have"): do NOT type the list — write one short line (e.g. "You can see all our rice and today's prices here 👇") and set "showPrices": true; an "Our product range" button to the website is sent after it. For one rice, give its packs one per line, e.g. "Kitchidi Ponni:\\n5 kg — *₹555*\\n26 kg — *₹2,499*". To buy: ${SITE}/w/shop-bot (pay by UPI, card or net banking). Rice choice: Kitchidi Ponni / Ponni packs suit daily meals; for idli/dosa suggest our idly rice if it is in the list.
- Never promise refunds, replacements, discounts, free delivery or call-backs at a set time — the team decides those (hand over).
- Hand over to the team (handoff: true) for: complaints, late or missing orders, damaged or wrong items, refunds or cancellations, payment taken but no order, bulk/wholesale/dealer enquiries, anything you cannot answer from the facts, or when they ask for a person. When you hand over, tell them our team will get back to them here soon.
- Photos: if a PHOTO line is given above, answer from it (never claim to see more than it says). Voice notes or files: you cannot hear or open them — ask them to type the problem in a line, and hand over if it sounds like a complaint.
- Never share another customer's details. Never ask for card numbers, OTPs or passwords.
- Off-topic chat: answer kindly in one line and bring it back to how you can help.

ANSWER WITH JSON ONLY:
{"reply": "<the WhatsApp message>", "handoff": true|false, "reason": "<for the team, 1 short line, English>", "order": "<order number this is about, or empty>", "showPrices": true|false}`
}

/**
 * Ask the model. Returns { reply, handoff, reason, order } or throws. `fetchImpl` for tests.
 * Without a GROQ_API_KEY it throws (the bot then sends the menu as before).
 */
/** The model's answer: the JSON object (also when wrapped in text or ```json fences), else the text as the reply. */
export function parseAnswer(raw) {
  const text = String(raw || '').trim()
  try { return JSON.parse(text) } catch { /* not bare JSON */ }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const j = JSON.parse(text.slice(start, end + 1))
      if (j && typeof j.reply === 'string') return j
    } catch { /* not JSON inside either */ }
  }
  return { reply: text.replace(/^```(?:json)?|```$/g, '').trim() }
}

export async function askModel({ system, history, text }, { fetchImpl = fetch, apiKey = process.env.GROQ_API_KEY } = {}) {
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')
  const messages = [{ role: 'system', content: system }, ...history]
  // The message being answered is the last turn (it may already be in the history from the webhook).
  const lastUser = [...history].reverse().find((m) => m.role === 'user')
  if (!lastUser || lastUser.content !== text) messages.push({ role: 'user', content: String(text).slice(0, 1500) })
  // A reminder as the last word: earlier plain-text turns in the chat can tempt the model to answer in plain text.
  messages.push({ role: 'system', content: 'Answer with the JSON object only: {"reply": ..., "handoff": ..., "reason": ..., "order": ...}' })
  const call = (strict, model = MODEL()) => fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      max_tokens: 700,
      reasoning_effort: 'low',
      ...(strict ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
  })
  let res = await call(true)
  // Groq's per-minute token limit for the model reached (429): the smaller model has its own allowance.
  if (res.status === 429) res = await call(true, FALLBACK_MODEL())
  // Groq refuses a reply that is not valid JSON (json_validate_failed): ask once more without strict JSON
  // and take the JSON out of the answer, or the plain text as the reply.
  if (res.status === 400) {
    const why = await res.text()
    if (!/json_validate_failed|Failed to generate JSON/i.test(why)) throw new Error(`Groq 400: ${why.slice(0, 200)}`)
    res = await call(false)
    if (res.status === 429) res = await call(false, FALLBACK_MODEL())
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content?.trim() || ''
  const out = parseAnswer(raw)
  const reply = String(out.reply || '').trim()
  if (!reply) throw new Error('Empty AI reply')
  return {
    reply: reply.slice(0, 1500),
    handoff: out.handoff === true || out.handoff === 'true',
    reason: String(out.reason || '').slice(0, 300),
    order: String(out.order || '').toUpperCase().match(/CR-\d{8}-[A-Z0-9]{5}/)?.[0] || '',
    showPrices: out.showPrices === true || out.showPrices === 'true',
  }
}

/** Everything for one AI reply: the facts, the chat so far, the model. */
/**
 * Read a customer's photo into facts with Groq's vision model: { kind, summary, amount, date, status, app }.
 * kind: payment (a UPI / bank payment screenshot), damaged_or_wrong (a torn, wet, wrong or short pack),
 * product (a pack or rice), other. Returns { unreadable: true } if it cannot be fetched or read.
 */
export async function readPhoto(image, { fetchImpl = fetch, download = cloudDownload, apiKey = process.env.GROQ_API_KEY } = {}) {
  try {
    if (!apiKey) throw new Error('GROQ_API_KEY is not set')
    const { buffer, type } = await download(image.id)
    if (!/^image\//.test(type) || buffer.length > MAX_PHOTO_BYTES) return { unreadable: true }
    const ask = 'A customer of Chennai Rice Industries (a rice company) sent this photo on WhatsApp'
      + (image.caption ? ` with the caption "${image.caption.slice(0, 200)}"` : '')
      + '. Describe only what is clearly visible. Answer JSON only: {"kind": "payment" | "damaged_or_wrong" | "product" | "other", "summary": "<one short English line>", "amount": <rupees as a number, or null>, "date": "<payment date as shown, or empty>", "status": "<e.g. Completed / Failed / Pending, or empty>", "app": "<e.g. Google Pay, PhonePe, Paytm, bank, or empty>", "payee": "<who was paid, or empty>"}. "payment" only for a payment receipt or screenshot. Never include card, account or UPI ID numbers.'
    // Groq renames and retires its picture models: the first one this account has wins.
    let res
    for (const model of VISION_MODELS()) {
      res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: ask },
              { type: 'image_url', image_url: { url: `data:${type};base64,${buffer.toString('base64')}` } },
            ],
          }],
        }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
      })
      if (res.status !== 404 && res.status !== 400) break
      const why = await res.clone().text().catch(() => '')
      if (!/model_not_found|does not exist|decommissioned/i.test(why)) break
    }
    if (!res.ok) throw new Error(`Groq vision ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content?.trim() || ''
    let j
    try { j = JSON.parse(raw) } catch { j = { kind: 'other', summary: raw.slice(0, 200) } }
    const kinds = ['payment', 'damaged_or_wrong', 'product', 'other']
    const amount = Number(String(j.amount ?? '').replace(/[^\d.]/g, ''))
    return {
      kind: kinds.includes(j.kind) ? j.kind : 'other',
      summary: String(j.summary || '').slice(0, 300),
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      date: String(j.date || '').slice(0, 40),
      status: String(j.status || '').slice(0, 40),
      app: String(j.app || '').slice(0, 40),
      payee: String(j.payee || '').slice(0, 120),
    }
  } catch (err) {
    console.error('[wa-ai] photo', err.message)
    return { unreadable: true }
  }
}

/** The customer's order a payment screenshot is for: same amount (to the rupee), the most recent first. */
export function matchPayment(photo, orders) {
  if (photo?.kind !== 'payment' || !photo.amount) return null
  const o = orders.find((x) => Math.abs(x.totalPaise / 100 - photo.amount) < 1)
  return o ? { orderNumber: o.orderNumber, paid: o.paid } : null
}

export async function aiReply({ phone, name, text, image = null, handedOver = false, lang = 'en' }, { query = defaultQuery, deps, fetchImpl } = {}) {
  const [orders, prices, offers, history, photo] = await Promise.all([
    customerOrders(query, phone).catch(() => []),
    deps?.prices ? deps.prices().catch(() => []) : [],
    deps?.offers ? deps.offers(phone).catch(() => []) : [],
    chatHistory(query, phone).catch(() => []),
    image ? readPhoto(image, { fetchImpl, ...(deps?.downloadMedia ? { download: deps.downloadMedia } : {}) }) : null,
  ])
  if (photo && photo.kind === 'payment') photo.match = matchPayment(photo, orders)
  const said = image ? (text ? `📷 Photo: ${text}` : '📷 Photo') : text
  const system = systemPrompt({ name, orders, prices, offers, hours: teamHours(), handedOver, photo, lang })
  const out = await askModel({ system, history, text: said }, { fetchImpl })
  // A payment we cannot match to a paid order, and a damaged / wrong pack, are always the team's.
  if (photo?.kind === 'payment' && !photo.match?.paid) {
    out.handoff = true
    out.reason = out.reason || `Payment screenshot ${photo.amount ? '₹' + photo.amount : ''} ${photo.match ? 'for unpaid order ' + photo.match.orderNumber : 'matches no order'}`.trim()
  }
  if (photo?.kind === 'payment' && photo.match) out.order = out.order || photo.match.orderNumber
  if (photo?.kind === 'damaged_or_wrong') {
    out.handoff = true
    out.reason = out.reason || `Photo: ${photo.summary || 'damaged or wrong item'}`
  }
  if (photo) out.photo = photo
  // A late order is always the team's, whatever the model decided.
  const late = orders.find((o) => o.late && (!out.order || o.orderNumber === out.order))
  if (late && (photo?.kind === 'payment' || /deliver|order|late|not|received|where|still|enna|eppo|varala/i.test(text))) {
    out.handoff = true
    out.order = out.order || late.orderNumber
    out.reason = out.reason || `Order ${late.orderNumber} paid ${late.daysAgo} days ago, not dispatched`
  }
  // Only an order of theirs can be flagged.
  if (out.order && !orders.some((o) => o.orderNumber === out.order)) out.order = ''
  return out
}
