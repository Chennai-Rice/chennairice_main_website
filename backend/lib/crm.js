// Sends website leads to the Sales Daddy CRM (salesdaddy.in, Developer API):
// contest sign-ups from the ad popup, contact enquiries and bulk-order
// enquiries. Each lead is written to crm_outbox first, then sent; if Sales
// Daddy is unreachable it is retried by the 10-minute job (see jobs.js).
//
// Shop orders follow the same path ('order_event'): a paid order, an
// abandoned checkout and every warehouse step after payment are queued in the
// same transaction as the status change (queueOrderEvent, called from
// recordOrderStatus) and land as notes on the customer's lead, so sales sees
// where each order is without opening the warehouse page.
//
//   SALESDADDY_API_KEY   the API key with the Leads scope (Secret Manager)
//   SALESDADDY_BASE_URL  optional, defaults to https://api.salesdaddy.in
//
// Without a key, leads wait in the outbox and go out once one is set.
import { hasDatabase, query as defaultQuery } from './db.js'

const MAX_ATTEMPTS = 8
// Minutes to wait before each retry.
const BACKOFF = [1, 5, 15, 30, 60, 120, 360, 720]

export const crmEnabled = () => Boolean(process.env.SALESDADDY_API_KEY)
const base = () => (process.env.SALESDADDY_BASE_URL || 'https://api.salesdaddy.in').replace(/\/$/, '')

const clip = (v, n) => (v == null || v === '' ? undefined : String(v).trim().slice(0, n) || undefined)
/** Indian mobile as 10 digits (Sales Daddy dedupes leads by mobile). */
export function crmMobile(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return d
}

/**
 * Where the website puts a lead in Sales Daddy's pipeline (Settings →
 * Pipelines & stages, Oct 2026). Leads are told apart by STAGE, not tags:
 *   New                    enquiries, WhatsApp chats (Sales Daddy's default)
 *   Signed up – not bought the ad / WhatsApp-link sign-up form
 *   Checkout not paid      pressed Pay but never paid
 *   Qualified              NeoDove call result (neodove.js)
 *   Not qualified (lost)   NeoDove call result
 *   Converted (won)        a paid order, with the order amount (markConverted)
 * The website only ever moves a lead FORWARD along New → Signed up → Checkout
 * not paid, and never out of a stage the team has set (Contacted, Follow-up…).
 * A NeoDove call result moves a lead from those stages, or between Qualified
 * and Not qualified (a later call can change the answer).
 * Stages are found by name, so they can be renamed only with this list.
 */
export const CRM_STAGES = {
  signedUp: /^signed up/i,
  checkoutNotPaid: /^checkout not paid/i,
  qualified: /^qualified$/i,
  notQualified: /^not qualified$/i,
}

/**
 * The lead in Sales Daddy's shape (POST /v1/ext/leads). `f.source` is a
 * Sales Daddy source key (instagram, facebook, whatsapp…), website by default.
 */
export function crmLead(kind, f) {
  const lead = {
    name: clip(f.name, 200),
    mobile: crmMobile(f.phone),
    email: clip(f.email, 320),
    company: clip(f.company, 200),
    city: clip(f.city, 100),
    state: clip(f.state, 100),
    source: f.source || 'website',
    note: clip(f.note, 2000),
    custom: f.custom || {},
  }
  for (const k of Object.keys(lead)) if (lead[k] === undefined) delete lead[k]
  return lead
}

/**
 * Queues one lead. `db` is a query runner (a transaction or the pool).
 * `fields.stage` (a CRM_STAGES key) is where the lead should go.
 * Returns the outbox id, or null when there is no database.
 */
export async function queueCrmLead(kind, fields, db = { query: defaultQuery }) {
  if (!hasDatabase()) return null
  const lead = crmLead(kind, fields)
  if (!lead.name || lead.mobile.length < 10) return null
  const payload = fields.stage ? { ...lead, stage: fields.stage } : lead
  const { rows: [row] } = await db.query(
    'insert into crm_outbox (kind, payload) values ($1, $2) returning id', [kind, payload])
  return row.id
}

async function post(payload, path = '/v1/ext/leads') {
  const res = await fetch(base() + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SALESDADDY_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function request(method, path, payload) {
  const res = await fetch(base() + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.SALESDADDY_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(payload && { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

const accepted = (r) => r.status >= 200 && r.status < 300 && r.data.ok !== false
const leadPath = (id) => `/v1/ext/leads/${encodeURIComponent(id)}`

/**
 * One outbox row to Sales Daddy. An enquiry is a lead with its note; when the
 * mobile already has a lead, the enquiry goes on it as a note. An order event
 * first finds (or creates) the customer's lead, since Sales Daddy matches by
 * mobile, then adds the event as a note on it, so a repeat buyer's orders all
 * collect on one lead. Then the lead's stage moves on (moveForward /
 * markConverted).
 */
async function deliver(kind, payload, ref) {
  // An event (order step, NeoDove call result) is { lead, note, stage? } and always adds its note.
  const event = kind === 'order_event' || kind === 'call_result'
  // `stage` is ours, not a Sales Daddy field; `tags` may be left on rows queued before stages.
  const { stage: leadStage, tags: _t, ...fields } = event ? payload.lead : payload
  const stage = payload.stage || leadStage
  const { note } = payload
  const lead = await post({ ...fields, clientRef: ref })
  if (!accepted(lead)) return lead
  const leadId = lead.data.leadId
  if (!leadId) {
    return event || lead.data.duplicate
      ? { status: 502, data: { error: 'no_lead_id', message: 'Sales Daddy did not return the lead' } }
      : lead
  }
  if (event || lead.data.duplicate) {
    if (note) {
      const added = await post({ body: note }, `${leadPath(leadId)}/notes`)
      if (!accepted(added)) return added
    }
  }
  if (payload.won) await markConverted(leadId, payload.won.value)
  else if (stage) await moveForward(leadId, stage)
  return lead
}

// Sales Daddy's pipeline stages, looked up from its masters and kept for 10
// minutes (so a stage renamed or added in Sales Daddy is picked up soon).
const stageCache = new Map() // Sales Daddy address → { at, ids }
async function stageIds() {
  const hit = stageCache.get(base())
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.ids
  const got = await request('GET', '/v1/ext/masters')
  const statuses = accepted(got) ? got.data.statuses || [] : []
  if (!statuses.length) return {}
  const find = (re) => statuses.find((s) => re.test(s.name))?.id || null
  const won = statuses.find((s) => s.stage_class === 'won' && /^converted$/i.test(s.name)) || statuses.find((s) => s.stage_class === 'won')
  const ids = {
    new: (statuses.find((s) => /^new$/i.test(s.name)) || [...statuses].sort((a, b) => a.sort - b.sort)[0])?.id || null,
    signedUp: find(CRM_STAGES.signedUp),
    checkoutNotPaid: find(CRM_STAGES.checkoutNotPaid),
    qualified: find(CRM_STAGES.qualified),
    notQualified: find(CRM_STAGES.notQualified),
    won: won?.id || null,
  }
  stageCache.set(base(), { at: Date.now(), ids })
  return ids
}

/**
 * Moves the lead to the website stage `key` — only forward along New →
 * Signed up – not bought → Checkout not paid, and never out of any other
 * stage (one the team set, Converted or Lost). Best effort.
 */
async function moveForward(leadId, key) {
  try {
    const ids = await stageIds()
    const target = ids[key]
    if (!target) return
    const order = [ids.new, ids.signedUp, ids.checkoutNotPaid].filter(Boolean)
    const calls = [ids.qualified, ids.notQualified].filter(Boolean)
    const got = await request('GET', leadPath(leadId))
    if (!accepted(got)) return
    const now = got.data.lead?.status_id
    const allowed = calls.includes(target)
      // a call result: from the website's early stages, or Qualified ↔ Not qualified
      ? (order.includes(now) || calls.includes(now)) && now !== target
      // the website's own stages: forward only, and only from them
      : order.includes(now) && order.indexOf(target) > order.indexOf(now)
    if (!allowed) return
    const r = await request('POST', `${leadPath(leadId)}/status`, { statusId: target })
    if (!accepted(r)) console.error('[crm] could not move stage:', r.status, r.data.error || '', r.data.message || '')
  } catch (err) {
    console.error('[crm] could not move stage:', err.message)
  }
}

/**
 * A paid order: the customer's lead goes to the won stage, "Converted", with
 * the order amount (rupees) as its value — so Sales Daddy's pipeline and
 * reports count the sale. A lead already won (a repeat buyer) is left as it
 * is. Best effort: never fails the delivery.
 */
async function markConverted(leadId, valueRupees) {
  try {
    const statusId = (await stageIds()).won
    if (!statusId) return
    const got = await request('GET', leadPath(leadId))
    if (accepted(got) && got.data.lead?.stage_class === 'won') return
    const r = await request('POST', `${leadPath(leadId)}/status`, { statusId, convertedValue: Math.max(0, Math.round(valueRupees || 0)) })
    if (!accepted(r)) console.error('[crm] could not mark converted:', r.status, r.data.error || '', r.data.message || '')
  } catch (err) {
    console.error('[crm] could not mark converted:', err.message)
  }
}

/**
 * Sends queued leads (oldest first). With `id`, just that one — used right
 * after a form is submitted. Never throws: a CRM problem must not fail the
 * customer's form or the job.
 */
export async function sendCrmLeads({ id = null, limit = 20, query = defaultQuery } = {}) {
  if (!hasDatabase() || !crmEnabled()) return { sent: 0, failed: 0, skipped: crmEnabled() ? 'no database' : 'no API key' }
  let sent = 0
  let failed = 0
  try {
    const { rows } = await query(
      `update crm_outbox set next_try_at = now() + interval '2 minutes'
        where id in (select id from crm_outbox
                      where status = 'queued' and next_try_at <= now() and ($1::uuid is null or id = $1)
                      order by created_at limit $2 for update skip locked)
        returning id, kind, payload, attempts, created_at`,
      [id, limit]
    )
    // UPDATE ... RETURNING has no order of its own; send oldest first so an
    // order's notes land in the order things happened.
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    for (const r of rows) {
      let result
      try {
        // clientRef lets Sales Daddy recognise a retry of the same lead.
        result = await deliver(r.kind, r.payload, r.id)
      } catch (err) {
        result = { status: 0, data: { error: 'network', message: err.message } }
      }
      const ok = accepted(result)
      if (ok) {
        sent++
        await query(
          `update crm_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null,
                  crm_lead_id = $2, duplicate = $3 where id = $1`,
          [r.id, result.data.leadId || null, result.data.duplicate === true])
        continue
      }
      failed++
      const attempts = r.attempts + 1
      const error = `${result.status} ${result.data.error || ''} ${result.data.message || ''}`.trim().slice(0, 300)
      // A lead Sales Daddy refuses (a 4xx such as an invalid or own number) is
      // final; only it being down, busy or unreachable is worth retrying.
      const refused = result.status >= 400 && result.status < 500 && ![401, 408, 429].includes(result.status)
      const permanent = refused || attempts >= MAX_ATTEMPTS
      await query(
        `update crm_outbox set attempts = $2, last_error = $3, status = $4,
                next_try_at = now() + make_interval(mins => $5) where id = $1`,
        [r.id, attempts, error, permanent ? 'failed' : 'queued', BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)]])
      console.error('[crm] Sales Daddy refused a lead:', error)
    }
  } catch (err) {
    console.error('[crm]', err.message)
  }
  return { sent, failed }
}

/** Queue a lead and try to send it at once (best effort, never throws). */
export async function pushCrmLead(kind, fields) {
  try {
    const id = await queueCrmLead(kind, fields)
    if (id) await sendCrmLeads({ id })
  } catch (err) {
    console.error('[crm] could not queue a lead:', err.message)
  }
}

// ---- shop orders --------------------------------------------------------------

const rupees = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** The note line for each order step; a status not listed here sends nothing. */
const ORDER_NOTE = {
  placed: (o) => `Website order ${o.order_number} paid: ${rupees(o.total_paise)}`,
  confirmed: (o) => `Website order ${o.order_number} confirmed by sales`,
  packed: (o) => `Website order ${o.order_number} packed, ready to dispatch`,
  shipped: (o) => `Website order ${o.order_number} dispatched`,
  delivered: (o) => `Website order ${o.order_number} delivered`,
  returned: (o) => `Website order ${o.order_number} returned`,
  cancelled: (o) => `Website order ${o.order_number} cancelled`,
}

const METHOD = { own_vehicle: 'Own vehicle', courier: 'Courier', transport: 'Transport', pickup: 'Customer pickup' }

function shipmentLines(s) {
  if (!s) return []
  const lines = [`Sent by: ${[METHOD[s.method] || s.method, s.carrier_name].filter(Boolean).join(', ')}`]
  if (s.tracking_number) lines.push(`Tracking no: ${s.tracking_number}`)
  if (s.lr_number) lines.push(`LR no: ${s.lr_number}`)
  if (s.vehicle_number) lines.push(`Vehicle: ${s.vehicle_number}${s.driver_name ? ` (${s.driver_name}${s.driver_phone ? ', ' + s.driver_phone : ''})` : ''}`)
  if (s.expected_delivery) lines.push(`Expected delivery: ${String(s.expected_delivery).slice(0, 10)}`)
  if (s.tracking_url) lines.push(`Track: ${s.tracking_url}`)
  return lines
}

/**
 * The outbox payload for one order status change, or null when the change is
 * not worth telling sales about (an order being created and waiting for
 * payment is noise; it is still unpaid). Reads with `db` so it sees the
 * transaction's own uncommitted changes.
 */
export async function orderEventPayload(db, { orderId, from, to, reason }) {
  const abandoned = from === 'pending_payment' && to === 'cancelled'
  if (!ORDER_NOTE[to]) return null
  const { rows: [o] } = await db.query(
    `select order_number, contact_name, contact_email, contact_phone, shipping_address, ship_state,
            total_paise, payment_status
       from orders where id = $1`, [orderId])
  if (!o) return null
  const mobile = crmMobile(o.contact_phone)
  if (!o.contact_name || mobile.length < 10) return null

  const lines = [abandoned
    ? `Website checkout not completed: order ${o.order_number} for ${rupees(o.total_paise)} was not paid in time. Worth a call.`
    : ORDER_NOTE[to](o)]

  if (to === 'placed' || abandoned) {
    const { rows: items } = await db.query(
      'select product_name, pack_kg, quantity from order_items where order_id = $1 order by product_name', [orderId])
    for (const i of items) lines.push(`${i.quantity} x ${i.product_name} ${Number(i.pack_kg)} kg`)
    const a = o.shipping_address || {}
    const place = [a.city, a.state || o.ship_state, a.pincode].filter(Boolean).join(', ')
    if (place) lines.push(`Ship to: ${place}`)
  }
  if (to === 'shipped') {
    const { rows: [s] } = await db.query(
      `select method, carrier_name, tracking_number, lr_number, tracking_url, vehicle_number, driver_name,
              driver_phone, expected_delivery
         from shipments where order_id = $1 and status = 'shipped' order by shipped_at desc limit 1`, [orderId])
    lines.push(...shipmentLines(s))
  }
  if (reason && to !== 'placed' && !abandoned) lines.push(`Reason: ${reason}`)
  if (to === 'cancelled' && !abandoned && ['paid', 'partially_refunded'].includes(o.payment_status)) {
    lines.push('Customer had paid: check the refund.')
  }

  const a = o.shipping_address || {}
  return {
    lead: crmLead('order_event', {
      name: o.contact_name, phone: o.contact_phone, email: o.contact_email,
      city: a.city, state: a.state || o.ship_state,
    }),
    note: lines.join('\n').slice(0, 2000),
    // Paid → the Converted stage with the order amount; unpaid checkout → "Checkout not paid".
    ...(to === 'placed' && { won: { value: Number(o.total_paise) / 100 } }),
    ...(abandoned && { stage: 'checkoutNotPaid' }),
  }
}

/**
 * Queues an order status change for Sales Daddy inside the caller's
 * transaction, so the note exists exactly when the change commits. Guarded by
 * a savepoint: nothing about the CRM may ever fail or roll back an order step
 * (for example before migration 023 has been applied).
 */
export async function queueOrderEvent(db, change) {
  if (!hasDatabase()) return
  let savepoint = false
  try {
    await db.query('savepoint crm_order_event')
    savepoint = true
  } catch {
    // Not inside a transaction (a pool query): each statement stands alone.
  }
  try {
    const payload = await orderEventPayload(db, change)
    if (payload) {
      const { rows: [row] } = await db.query(
        `insert into crm_outbox (kind, payload) values ('order_event', $1) returning id`, [payload])
      // Best effort: try to send soon after the transaction commits; the
      // 10-minute job sends it anyway if this does not get to run.
      if (crmEnabled()) setTimeout(() => sendCrmLeads({ id: row.id }).catch(() => {}), 3000).unref?.()
    }
    if (savepoint) await db.query('release savepoint crm_order_event')
  } catch (err) {
    if (savepoint) await db.query('rollback to savepoint crm_order_event').catch(() => {})
    console.error('[crm] could not queue an order event:', err.message)
  }
}
