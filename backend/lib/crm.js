// Sends website leads to the Sales Daddy CRM (salesdaddy.in, Developer API):
// contest sign-ups from the ad popup, contact enquiries and bulk-order
// enquiries. Each lead is written to crm_outbox first, then sent; if Sales
// Daddy is unreachable it is retried by the 10-minute job (see jobs.js).
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

/** The lead in Sales Daddy's shape (POST /v1/ext/leads). */
export function crmLead(kind, f) {
  const tags = {
    contest_signup: ['Website', 'Super Slogan Contest'],
    contact: ['Website', 'Contact form'],
    bulk_order: ['Website', 'Bulk order'],
  }[kind].concat(f.tags || [])
  const lead = {
    name: clip(f.name, 200),
    mobile: crmMobile(f.phone),
    email: clip(f.email, 320),
    company: clip(f.company, 200),
    city: clip(f.city, 100),
    state: clip(f.state, 100),
    source: 'website',
    tags: [...new Set(tags.map((t) => String(t).slice(0, 50)).filter(Boolean))].slice(0, 20),
    note: clip(f.note, 2000),
    custom: f.custom || {},
  }
  for (const k of Object.keys(lead)) if (lead[k] === undefined) delete lead[k]
  return lead
}

/**
 * Queues one lead. `db` is a query runner (a transaction or the pool).
 * Returns the outbox id, or null when there is no database.
 */
export async function queueCrmLead(kind, fields, db = { query: defaultQuery }) {
  if (!hasDatabase()) return null
  const lead = crmLead(kind, fields)
  if (!lead.name || lead.mobile.length < 10) return null
  const { rows: [row] } = await db.query(
    'insert into crm_outbox (kind, payload) values ($1, $2) returning id', [kind, lead])
  return row.id
}

async function post(payload) {
  const res = await fetch(base() + '/v1/ext/leads', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SALESDADDY_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
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
        returning id, payload, attempts`,
      [id, limit]
    )
    for (const r of rows) {
      // clientRef lets Sales Daddy recognise a retry of the same lead.
      const payload = { ...r.payload, clientRef: r.id }
      let result
      try {
        result = await post(payload)
      } catch (err) {
        result = { status: 0, data: { error: 'network', message: err.message } }
      }
      const ok = result.status >= 200 && result.status < 300 && result.data.ok !== false
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
