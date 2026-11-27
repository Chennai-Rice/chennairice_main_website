// WhatsApp messages to customers through AskEva (backend.askeva.io): the
// "order placed" thank-you, sent as an approved template message. Each message
// is written to whatsapp_outbox first, then sent; if AskEva is unreachable it is
// retried by the 10-minute job (see jobs.js).
//
//   ASKEVA_TOKEN               the API token (Secret Manager)
//   ASKEVA_BASE_URL            optional, defaults to https://backend.askeva.io
//   ASKEVA_ORDER_TEMPLATE      optional, defaults to order_placed
//
// The template body is: Hey {{1}}, your order #{{2}} has been placed
// successfully! You can track your shipment here: {{3}} …
// Without a token, messages wait in the outbox and go out once one is set.
import { hasDatabase, query as defaultQuery } from './db.js'
import { crmMobile } from './crm.js'
import { sendMessage, templateMessage } from './wa/cloud.js'
import { formatInr } from './sales/util.js'

/**
 * The order_thank_you message for an order (Tamil if the customer chose தமிழ் in the bot and the Tamil version is
 * approved): their first name, the order number, what they bought, the amount, and the two buttons.
 */
export function thankYouMessage(to, order, items, lang) {
  const what = items.length ? `${items[0]}${items.length > 1 ? ` + ${items.length - 1} more` : ''}` : 'your rice'
  const first = String(order.contact_name || '').trim().split(/\s+/)[0] || (lang === 'ta' ? 'வாடிக்கையாளர்' : 'there')
  return templateMessage(to, 'order_thank_you', {
    language: lang,
    components: [
      { type: 'body', parameters: [first, order.order_number, what.slice(0, 100), formatInr(order.total_paise)].map((text) => ({ type: 'text', text: String(text) })) },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `track-${order.order_number}` }] },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: `invoice-${order.order_number}.${order.id}` }] },
    ],
  })
}

/** For an order: the order_thank_you message if that template is approved (in the chat's language), else null. */
async function thankYouFor(query, orderId, to, approved) {
  if (!orderId || !approved.size) return null
  const { rows: [o] } = await query('select id, order_number, contact_name, total_paise from orders where id = $1', [orderId])
  if (!o) return null
  const { rows: items } = await query(
    `select product_name || ' ' || trim(to_char(pack_kg, 'FM999')) || ' kg × ' || quantity as line from order_items where order_id = $1 order by product_name`, [orderId])
  const { rows: [st] } = await query('select lang from wa_bot_state where phone = $1', [to.slice(-10)]).catch(() => ({ rows: [] }))
  const lang = st?.lang === 'ta' && approved.has('ta') ? 'ta' : approved.has('en') ? 'en' : null
  return lang ? thankYouMessage(to, o, items.map((i) => i.line), lang) : null
}

const MAX_ATTEMPTS = 8
// Minutes to wait before each retry.
const BACKOFF = [1, 5, 15, 30, 60, 120, 360, 720]

export const whatsappEnabled = () => Boolean(process.env.ASKEVA_TOKEN)
const base = () => (process.env.ASKEVA_BASE_URL || 'https://backend.askeva.io').replace(/\/$/, '')
const templateName = () => process.env.ASKEVA_ORDER_TEMPLATE || 'order_placed'

/** Indian mobile with the country code, as AskEva wants it ('' if it is not one). */
export function whatsappNumber(raw) {
  const m = crmMobile(raw)
  return /^[6-9]\d{9}$/.test(m) ? '91' + m : ''
}

/** AskEva's send-message body for a template with three text parameters. */
export function templateBody(to, name, params) {
  return {
    to,
    type: 'template',
    template: {
      language: { policy: 'deterministic', code: 'en' },
      name,
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
    },
  }
}

/**
 * Queues the order-placed message. `db` is a query runner (a transaction or the
 * pool). Returns the outbox id, or null when there is nothing to send to.
 */
export async function queueOrderPlaced(db, order, trackUrl) {
  if (!hasDatabase()) return null
  const to = whatsappNumber(order.contact_phone)
  if (!to) return null
  const firstName = String(order.contact_name || '').trim().split(/\s+/)[0] || 'there'
  const { rows: [row] } = await db.query(
    `insert into whatsapp_outbox (order_id, kind, to_phone, params) values ($1, 'order_placed', $2, $3)
     on conflict (order_id, kind) do nothing returning id`,
    [order.id, to, JSON.stringify([firstName, order.order_number, trackUrl])])
  return row?.id || null
}

async function post(body) {
  const res = await fetch(`${base()}/v1/message/send-message?token=${encodeURIComponent(process.env.ASKEVA_TOKEN)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

/**
 * Sends queued messages (oldest first). With `id`, just that one — used right
 * after an order is paid. Never throws: a WhatsApp problem must not fail the
 * customer's payment or the job.
 */
export async function sendWhatsAppMessages({ id = null, limit = 20, query = defaultQuery } = {}) {
  if (!hasDatabase()) return { sent: 0, failed: 0, skipped: 'no database' }
  // Which route the order message takes: AskEva (default) or our own Cloud API number, switched in
  // /whatsapp → Settings once Meta has approved the order_placed template there.
  const { rows: [via] } = await query(`select value from company_settings where key = 'whatsapp_order_via'`).catch(() => ({ rows: [] }))
  // order_thank_you approved on our own number: every order message goes that way, in English or Tamil (27 Nov 2026).
  const { rows: ty } = process.env.WHATSAPP_TOKEN
    ? await query(`select language from wa_templates where name = 'order_thank_you' and status = 'APPROVED'`).catch(() => ({ rows: [] }))
    : { rows: [] }
  const approved = new Set(ty.map((t) => t.language))
  const cloud = via?.value === 'cloud' || approved.size > 0
  if (cloud ? !process.env.WHATSAPP_TOKEN : !whatsappEnabled()) return { sent: 0, failed: 0, skipped: 'no API token' }
  let sent = 0
  let failed = 0
  try {
    const { rows } = await query(
      `update whatsapp_outbox set next_try_at = now() + interval '2 minutes'
        where id in (select id from whatsapp_outbox
                      where status = 'queued' and next_try_at <= now() and ($1::uuid is null or id = $1)
                      order by created_at limit $2 for update skip locked)
        returning id, order_id, to_phone, params, attempts`,
      [id, limit]
    )
    for (const r of rows) {
      let result
      let wamid = null
      let template = 'order_placed'
      try {
        const thanks = await thankYouFor(query, r.order_id, r.to_phone, approved).catch(() => null)
        if (thanks) {
          template = 'order_thank_you'
          wamid = await sendMessage(thanks)
          result = { status: 200, data: {} }
        } else if (cloud) {
          wamid = await sendMessage(templateMessage(r.to_phone, 'order_placed', { params: r.params }))
          result = { status: 200, data: {} }
        } else {
          result = await post(templateBody(r.to_phone, templateName(), r.params))
        }
      } catch (err) {
        // Meta's refusals carry their HTTP status (err.meta.status); a network problem has none.
        result = { status: err.meta?.status || 0, data: { message: err.publicMessage || err.message } }
      }
      if (result.status >= 200 && result.status < 300) {
        sent++
        await query(`update whatsapp_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [r.id])
        // Which route took it (migration 050); kept separate so a missing column can never get a sent message resent.
        await query(`update whatsapp_outbox set via = $2, wamid = $3 where id = $1`, [r.id, template === 'order_thank_you' ? 'cloud:order_thank_you' : cloud ? 'cloud' : 'askeva', wamid]).catch(() => {})
        if (wamid) {
          // In the /whatsapp log too, so delivered / read come back on it.
          await query(
            `insert into wa_messages (wamid, direction, phone, kind, template_name, category, body, status, source)
             values ($1, 'out', $2, 'template', $4, 'utility', $3, 'sent', $4) on conflict (wamid) do nothing`,
            [wamid, r.to_phone.slice(2), `Order #${r.params?.[1] || ''} ${template === 'order_thank_you' ? 'thank you + invoice' : 'placed'} (to ${r.params?.[0] || ''})`, template]).catch(() => {})
        }
        continue
      }
      failed++
      const attempts = r.attempts + 1
      const error = `${result.status} ${JSON.stringify(result.data)}`.slice(0, 300)
      // A message AskEva refuses (a 4xx such as a bad number or template) is
      // final; only it being down, busy or unreachable is worth retrying.
      const refused = result.status >= 400 && result.status < 500 && ![401, 408, 429].includes(result.status)
      const permanent = refused || attempts >= MAX_ATTEMPTS
      await query(
        `update whatsapp_outbox set attempts = $2, last_error = $3, status = $4,
                next_try_at = now() + make_interval(mins => $5) where id = $1`,
        [r.id, attempts, error, permanent ? 'failed' : 'queued', BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)]])
      console.error(cloud ? '[whatsapp] Meta did not take a message:' : '[whatsapp] AskEva did not take a message:', error)
    }
  } catch (err) {
    console.error('[whatsapp]', err.message)
  }
  return { sent, failed }
}
