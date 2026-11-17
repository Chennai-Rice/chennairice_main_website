// Meta → us: the WhatsApp Cloud API webhook (https://chennairiceindustries.com/api/whatsapp/webhook).
//
//   GET   Meta's one-time check when the URL is saved (hub.verify_token must equal WHATSAPP_VERIFY_TOKEN).
//   POST  everything after that: customers' messages, sent / delivered / read / failed, template verdicts,
//         quality changes. The X-Hub-Signature-256 header is checked with WHATSAPP_APP_SECRET.
//
// Every call is stored first (wa_events) and Meta always gets a 200, so it never retries a call we
// already have. A customer's message also goes through the existing WhatsApp-contacts path
// (askeva-inbound.js: whatsapp_contacts → New leads in Analyst → Sales Daddy), unchanged.
import crypto from 'node:crypto'
import { query as defaultQuery } from '../db.js'
import { httpError, safeEqual } from '../sales/util.js'
import { recordAskevaWebhook, waPhone } from '../askeva-inbound.js'
import { templateEvent } from './templates.js'
import { answer } from './bot.js'
import { optIn, optOut } from './contacts.js'
import { sendMessage } from './cloud.js'
import { crmMobile, queueCrmLead, sendCrmLeads } from '../crm.js'

/** Meta's GET check: returns the challenge to echo back, or throws 403. */
export function verifyChallenge(q = {}) {
  const want = process.env.WHATSAPP_VERIFY_TOKEN
  if (q['hub.mode'] === 'subscribe' && want && safeEqual(String(q['hub.verify_token'] || ''), want)) return String(q['hub.challenge'] || '')
  throw httpError('Bad verify token', { status: 403, publicMessage: 'Forbidden.' })
}

/** Is this POST really from Meta? (HMAC-SHA256 of the exact bytes with the app secret.) */
export function signatureOk(rawBody, header, secret = process.env.WHATSAPP_APP_SECRET) {
  if (!secret) return false
  const given = String(header || '').replace(/^sha256=/, '')
  const want = crypto.createHmac('sha256', secret).update(rawBody || Buffer.alloc(0)).digest('hex')
  return safeEqual(given, want)
}

/** One readable line for any incoming message. */
export function readable(m) {
  switch (m?.type) {
    case 'text': return m.text?.body || ''
    case 'button': return m.button?.text || m.button?.payload || '[button]'
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.interactive?.nfm_reply?.body || '[reply]'
    case 'image': return m.image?.caption ? `📷 ${m.image.caption}` : '📷 Photo'
    case 'video': return m.video?.caption ? `🎥 ${m.video.caption}` : '🎥 Video'
    case 'audio': return '🎤 Voice message'
    case 'document': return `📄 ${m.document?.filename || 'Document'}`
    case 'sticker': return 'Sticker'
    case 'location': return `📍 ${m.location?.name || m.location?.address || 'Location'}`
    case 'contacts': return '👤 Contact card'
    case 'reaction': return `Reacted ${m.reaction?.emoji || ''}`.trim()
    case 'order': return '🛒 Order from the catalogue'
    default: return `[${m?.type || 'message'}]`
  }
}

// A status never goes backwards (a late "delivered" after "read" is ignored); "failed" always wins.
const RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 9 }

async function onStatus(s, query) {
  const status = String(s.status || '')
  if (!(status in RANK)) return
  const err = s.errors?.[0]
  const error = err ? `${err.code || ''} ${err.title || ''}${err.error_data?.details ? ': ' + err.error_data.details : ''}`.trim().slice(0, 300) : null
  await query(
    `update wa_messages set status = $2, status_at = to_timestamp($3), error = coalesce($4, error),
            category = coalesce($5, category), billable = coalesce($6, billable)
      where wamid = $1 and (case status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 9 else 0 end) < $7`,
    [s.id, status, Number(s.timestamp) || Date.now() / 1000, error, s.pricing?.category || s.conversation?.origin?.type || null,
      s.pricing?.billable ?? null, RANK[status]])
}

async function onMessage(m, contacts, query, bot) {
  const phone = waPhone(m.from) || String(m.from || '')
  const name = contacts?.find((c) => c.wa_id === m.from)?.profile?.name || null
  const { rows: [isNew] } = await query(
    `insert into wa_messages (wamid, direction, phone, kind, body, payload, status, created_at, status_at)
     values ($1, 'in', $2, $3, $4, $5, 'received', to_timestamp($6), to_timestamp($6))
     on conflict (wamid) do nothing returning id`,
    [m.id, phone, m.type || 'text', readable(m).slice(0, 4000), JSON.stringify({ ...m, profileName: name }), Number(m.timestamp) || Date.now() / 1000])
  if (!isNew) return
  // The contact (Inbox / Contacts): name, last message, and a resolved chat opens again when they write.
  await query(
    `insert into wa_contacts (phone, name, last_in_at) values ($1, $2, now())
     on conflict (phone) do update set name = coalesce(wa_contacts.name, excluded.name), last_in_at = now(), status = 'open', updated_at = now()`,
    [phone, name]).catch(() => {})
  const replyId = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || m.button?.payload || ''
  const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  // STOP / START: no more offers, or offers again. Answered here; the bot does not see them.
  const word = String(text).trim().toLowerCase().replace(/[^a-z ]/g, '').trim()
  if (STOP_WORDS.includes(word) || START_WORDS.includes(word)) {
    const stop = STOP_WORDS.includes(word)
    await (stop ? optOut(phone, { query }) : optIn(phone, { name, source: 'start', query })).catch(() => {})
    const reply = stop
      ? 'You will not get offers from Chennai Rice on WhatsApp any more. 🙏 Order updates still come here. Reply START to get offers again.'
      : 'Thank you! ✅ You will get our offers and updates on WhatsApp. Reply STOP any time to stop.'
    const msg = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(m.from), type: 'text', text: { body: reply } }
    const wamid = await sendMessage(msg).catch(() => null)
    if (wamid) await query(`insert into wa_messages (wamid, direction, phone, kind, body, status, source, category) values ($1, 'out', $2, 'text', $3, 'sent', 'bot', 'service') on conflict (wamid) do nothing`, [wamid, phone, reply]).catch(() => {})
    return
  }
  // A button on a campaign template (CAMPAIGN_BUTTONS): its own reply and Sales Daddy tag; the bot stays out of it.
  if (m.type === 'button' && m.context?.id) {
    const { rows: [sent] } = await query('select template_name from wa_messages where wamid = $1', [m.context.id]).catch(() => ({ rows: [] }))
    const campaign = CAMPAIGN_BUTTONS[sent?.template_name]
    if (campaign) return campaignButton(campaign, { to: String(m.from), phone, name, text, at: Number(m.timestamp) || Date.now() / 1000 }, query)
  }
  // The bot answers each message once (Meta may deliver a call twice), and not old ones replayed after an outage.
  const ageMin = (Date.now() / 1000 - (Number(m.timestamp) || Date.now() / 1000)) / 60
  if (!bot || ageMin > 15 || m.type === 'reaction') return
  // A photo (a payment screenshot, a damaged pack…) goes to the bot too, for the AI to look at.
  const image = m.type === 'image' && m.image?.id ? { id: m.image.id, caption: m.image.caption || '', mime: m.image.mime_type || '' } : null
  await bot({ to: String(m.from), phone, name, text: text || image?.caption || '', replyId: m.button ? '' : replyId, ...(image ? { image } : {}) }, { query })
}

/**
 * WhatsApp campaigns whose template button is the customer saying "yes" (owner, 16 Nov 2026), by template name.
 * A tap: the automatic reply below, and the customer to Sales Daddy as a WhatsApp lead with the campaign's tag (once
 * per mobile; a later tap adds a note). The tag must exist in Sales Daddy (Settings → Tags), or Sales Daddy drops it.
 */
export const CAMPAIGN_BUTTONS = {
  chennai_traders: {
    tag: 'chennai_traders',
    reply: 'எங்களைத் தொடர்புகொண்டதற்கு மிக்க நன்றி! 🙏\n\nஉங்கள் ஆர்டர் தொடர்பான உதவிக்கு எங்கள் விற்பனைக் குழுவினர் விரைவில் உங்களைத் தொடர்புகொள்வார்கள்.',
  },
}

async function campaignButton(campaign, { to, phone, name, text, at }, query) {
  // The reply (the tap opened the 24-hour window, so plain text is allowed).
  const msg = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: campaign.reply } }
  const wamid = await sendMessage(msg).catch((err) => { console.error('[wa] campaign reply:', err.message); return null })
  if (wamid) {
    await query(`insert into wa_messages (wamid, direction, phone, kind, body, status, source, category) values ($1, 'out', $2, 'text', $3, 'sent', $4, 'service') on conflict (wamid) do nothing`,
      [wamid, phone, campaign.reply, `campaign:${campaign.tag}`]).catch(() => {})
  }
  // Sales Daddy: a WhatsApp lead tagged with the campaign. Sent once per mobile; a lead Sales Daddy already has gets the tag added.
  try {
    const mobile = crmMobile(phone)
    const { rows: [had] } = await query(
      `select 1 from crm_outbox where kind = 'whatsapp_chat' and payload->>'mobile' = $1 and payload->'tags' ? $2 limit 1`, [mobile, campaign.tag])
    if (had) return
    const when = new Date(at * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    const id = await queueCrmLead('whatsapp_chat', {
      name: name || `WhatsApp ${mobile}`, phone: mobile, source: 'whatsapp', tags: [campaign.tag], allowOwn: true, // the team's test taps too (owner, 16 Nov 2026)
      note: `WhatsApp campaign "${campaign.tag}": tapped "${text || 'button'}" (${when}). Wants a call about an order.`,
    }, { query })
    if (id) await sendCrmLeads({ id, query }).catch(() => {})
  } catch (err) {
    console.error('[wa] campaign lead:', err.message)
  }
}

const STOP_WORDS = ['stop', 'unsubscribe', 'stop all', 'stop promotions', 'opt out', 'optout']
const START_WORDS = ['start', 'subscribe', 'unstop']

/** Handles one webhook POST body (already checked). Never throws: errors are kept on the event. */
export async function handleWebhook(payload, { query = defaultQuery, contactsPath = recordAskevaWebhook, bot = answer } = {}) {
  const fields = new Set()
  let messages = 0
  let statuses = 0
  for (const entry of payload?.entry || []) for (const ch of entry.changes || []) fields.add(ch.field)
  const { rows: [ev] } = await query('insert into wa_events (field, payload) values ($1, $2) returning id', [[...fields].join(',') || null, JSON.stringify(payload ?? {})])
  try {
    for (const entry of payload?.entry || []) {
      for (const ch of entry.changes || []) {
        const v = ch.value || {}
        if (ch.field === 'messages') {
          for (const s of v.statuses || []) { await onStatus(s, query); statuses++ }
          for (const m of v.messages || []) { await onMessage(m, v.contacts, query, bot); messages++ }
        } else if (/^(message_template_|template_category_)/.test(ch.field)) {
          await templateEvent(ch.field, v, { query })
        }
      }
    }
    // Customers' messages → WhatsApp contacts → New leads and Sales Daddy, exactly as with AskEva.
    if (messages) await contactsPath(payload).catch((err) => console.error('[wa] contacts:', err.message))
    await query('update wa_events set handled = true where id = $1', [ev.id])
  } catch (err) {
    console.error('[wa] webhook:', err.message)
    await query('update wa_events set error = $2 where id = $1', [ev.id, String(err.message).slice(0, 300)]).catch(() => {})
  }
  return { messages, statuses }
}
