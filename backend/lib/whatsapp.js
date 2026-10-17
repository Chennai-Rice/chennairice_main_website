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
  if (!hasDatabase() || !whatsappEnabled()) return { sent: 0, failed: 0, skipped: whatsappEnabled() ? 'no database' : 'no API token' }
  let sent = 0
  let failed = 0
  try {
    const { rows } = await query(
      `update whatsapp_outbox set next_try_at = now() + interval '2 minutes'
        where id in (select id from whatsapp_outbox
                      where status = 'queued' and next_try_at <= now() and ($1::uuid is null or id = $1)
                      order by created_at limit $2 for update skip locked)
        returning id, to_phone, params, attempts`,
      [id, limit]
    )
    for (const r of rows) {
      let result
      try {
        result = await post(templateBody(r.to_phone, templateName(), r.params))
      } catch (err) {
        result = { status: 0, data: { message: err.message } }
      }
      if (result.status >= 200 && result.status < 300) {
        sent++
        await query(`update whatsapp_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [r.id])
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
      console.error('[whatsapp] AskEva did not take a message:', error)
    }
  } catch (err) {
    console.error('[whatsapp]', err.message)
  }
  return { sent, failed }
}
