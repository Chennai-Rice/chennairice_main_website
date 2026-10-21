// WhatsApp contacts from AskEva → our database → the Sales Daddy CRM.
//
//   AskEva (webhook) ──POST /api/askeva/webhook?key=…──▶ whatsapp_contacts ──▶ crm_outbox ──▶ Sales Daddy
//
// Every call is stored as it came (askeva_events) and each incoming message
// updates the contact (first / last message, count). The contact then goes to
// Sales Daddy as a lead (source "whatsapp", tag "WhatsApp chat") with the
// message as a note — the first time we hear from them, and after that at most
// one note a day, so a long chat does not flood the lead.
//
// AskEva's webhook format is not published, so the parser accepts the Meta
// WhatsApp Cloud API shape (entry → changes → value → contacts / messages),
// which providers usually forward, and flat shapes ({ from, name, text, … }).
//
//   ASKEVA_WEBHOOK_KEY   the secret in the webhook URL (?key=) or X-API-Key header
import { hasDatabase, tx, query as defaultQuery } from './db.js'
import { crmMobile, queueCrmLead, sendCrmLeads, crmEnabled } from './crm.js'
import { httpError, safeEqual } from './sales/util.js'

export function checkAskevaKey(req) {
  const key = process.env.ASKEVA_WEBHOOK_KEY
  const given = String(req.query?.key || req.get('x-api-key') || '')
  if (!key || !given || !safeEqual(given, key)) {
    throw httpError('Bad AskEva webhook key', { status: 401, publicMessage: 'Unauthorised.' })
  }
}

/** The number as we store it: 10-digit Indian mobile, else just its digits. */
export function waPhone(raw) {
  const m = crmMobile(raw)
  return m.length >= 10 ? m : ''
}

/** A one-line description of any WhatsApp message (text, button, media…). */
function messageText(m) {
  if (!m || typeof m !== 'object') return typeof m === 'string' ? m : ''
  if (typeof m.text === 'string') return m.text
  if (m.text?.body) return m.text.body
  if (m.body && typeof m.body === 'string') return m.body
  if (m.message && typeof m.message === 'string') return m.message
  if (m.button?.text) return m.button.text
  if (m.interactive) return m.interactive.button_reply?.title || m.interactive.list_reply?.title || '[reply]'
  if (m.type && m.type !== 'text') return `[${m.type}${m[m.type]?.caption ? ': ' + m[m.type].caption : ''}]`
  return ''
}

const when = (t) => {
  if (t == null || t === '') return new Date()
  const n = Number(t)
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(t))
  return Number.isNaN(d.getTime()) ? new Date() : d
}

/** Incoming messages in a webhook payload: [{ phone, name, text, at }]. Outgoing statuses are ignored. */
export function parseMessages(payload) {
  const out = []
  const add = (phone, name, text, at) => {
    const p = waPhone(phone)
    if (p) out.push({ phone: p, name: name ? String(name).trim().slice(0, 200) : null, text: String(text || '').trim().slice(0, 1000), at: when(at) })
  }
  const list = Array.isArray(payload) ? payload : [payload]
  for (const body of list) {
    if (!body || typeof body !== 'object') continue
    // Meta WhatsApp Cloud API shape.
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {}
        // AskEva's "Test Run" sends Meta's sample (John Doe, +1 555… numbers): logged, not a contact.
        if (v.metadata?.phone_number_id === '123456789012345' || /^1555/.test(String(v.metadata?.display_phone_number || ''))) continue
        const names = Object.fromEntries((v.contacts || []).map((c) => [String(c.wa_id || ''), c.profile?.name]))
        for (const m of v.messages || []) add(m.from, names[String(m.from)], messageText(m), m.timestamp)
      }
    }
    if (body.entry) continue
    // Flat shapes, one message or a list of them.
    const items = Array.isArray(body.messages) ? body.messages : Array.isArray(body.data) ? body.data : [body.data && typeof body.data === 'object' ? body.data : body]
    for (const m of items) {
      if (!m || typeof m !== 'object') continue
      if (m.direction && !/^in/i.test(String(m.direction))) continue // our own outgoing messages
      const phone = m.from || m.phone || m.mobile || m.wa_id || m.waId || m.number || m.contact?.phone || m.contact?.wa_id || m.sender
      const name = m.name || m.profile_name || m.profileName || m.contact?.name || m.senderName || m.profile?.name
      add(phone, name, messageText(m.message && typeof m.message === 'object' ? m.message : m), m.timestamp || m.time || m.created_at || m.createdAt)
    }
  }
  return out
}

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/**
 * Saves one contact's message and queues it for Sales Daddy when due (first
 * contact, or no note in the last day). `db` is a query runner inside a
 * transaction. Returns the outbox id to send, or null.
 */
async function saveMessage(db, { phone, name, text, at }, source) {
  const { rows: [c] } = await db.query(
    `insert into whatsapp_contacts (phone, name, first_message, first_message_at, last_message, last_message_at, messages, source)
     values ($1, $2, $3, $4, $3, $4, case when $5 = 'import' then 0 else 1 end, $5)
     on conflict (phone) do update set
       name = coalesce(excluded.name, whatsapp_contacts.name),
       last_message = case when excluded.last_message_at >= coalesce(whatsapp_contacts.last_message_at, '-infinity') then excluded.last_message else whatsapp_contacts.last_message end,
       last_message_at = greatest(whatsapp_contacts.last_message_at, excluded.last_message_at),
       messages = whatsapp_contacts.messages + case when $5 = 'import' then 0 else 1 end,
       updated_at = now()
     returning *, (xmax = 0) as is_new`,
    [phone, name, text || null, at, source]
  )
  const due = c.is_new || !c.crm_noted_at || Date.now() - new Date(c.crm_noted_at).getTime() > 24 * 3600000
  if (!due) return null
  const id = await queueCrmLead('whatsapp_chat', {
    name: c.name || `WhatsApp ${phone}`,
    phone,
    source: 'whatsapp',
    note: [
      source === 'import' ? 'WhatsApp contact (from AskEva).' : (c.is_new ? 'New WhatsApp chat (AskEva).' : 'WhatsApp message (AskEva).'),
      text ? `Message (${fmt(at)}): ${text}` : `Last message: ${fmt(at)}`,
    ].join('\n'),
  }, db)
  if (id) await db.query('update whatsapp_contacts set crm_noted_at = now() where phone = $1', [phone])
  return id
}

/** Handles one webhook call. Never throws on content — a bad payload is kept for checking. */
export async function recordAskevaWebhook(payload) {
  if (!hasDatabase()) return { ok: true, stored: false }
  const { rows: [ev] } = await defaultQuery('insert into askeva_events (payload) values ($1) returning id', [payload ?? {}])
  const messages = parseMessages(payload)
  const toSend = []
  try {
    await tx(async (db) => {
      for (const m of messages) {
        const id = await saveMessage(db, m, 'webhook')
        if (id) toSend.push(id)
      }
    })
    await defaultQuery('update askeva_events set handled = true where id = $1', [ev.id])
  } catch (err) {
    await defaultQuery('update askeva_events set error = $2 where id = $1', [ev.id, String(err.message).slice(0, 300)]).catch(() => {})
    console.error('[askeva] could not handle a webhook:', err.message)
  }
  if (crmEnabled()) for (const id of toSend) await sendCrmLeads({ id }).catch(() => {})
  return { ok: true, messages: messages.length }
}

/**
 * Loads AskEva's UI-Contacts export: rows of { name, phone, lastMessage,
 * lastMessageAt }. Each contact is saved and queued for Sales Daddy once
 * (the 10-minute job sends them). Returns counts.
 */
export async function importAskevaContacts(rows, { query = defaultQuery } = {}) {
  let saved = 0
  let queued = 0
  let skipped = 0
  await tx(async (db) => {
    for (const r of rows) {
      const phone = waPhone(r.phone)
      if (!phone) { skipped++; continue }
      const id = await saveMessage(db, { phone, name: r.name || null, text: r.lastMessage || '', at: when(r.lastMessageAt) }, 'import')
      saved++
      if (id) queued++
    }
  })
  return { saved, queued, skipped }
}
