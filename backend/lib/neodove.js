// NeoDove (telecalling CRM), with our database in the middle.
//
//   ad / WhatsApp sign-up, not a buyer
//        └▶ lead_status 'not_converted' ─▶ neodove_outbox ─▶ NeoDove campaign (Custom Integration endpoint)
//   telecaller's call result in NeoDove
//        └▶ POST /api/neodove/webhook ─▶ neodove_events ─▶ lead_status 'qualified' / 'not_qualified'
//                                                       └▶ Sales Daddy: note + "Qualified" / "Not qualified" stage
//   paid order with the same mobile ─▶ lead_status 'converted' (and Sales Daddy Converted, see crm.js)
//
//   NEODOVE_ENDPOINT     the campaign's Custom Integration "Endpoint" URL (Secret Manager). Until it is a
//                        real https URL, leads wait in neodove_outbox and go out once it is set.
//   NEODOVE_WEBHOOK_KEY  the secret NeoDove's webhook sends (X-API-Key header or ?key= in the URL)
//
// NeoDove's webhook format is not published: the parser accepts flat and nested shapes and every
// call is stored as it came (neodove_events), so the mapping can be checked against real data.
import { hasDatabase, query as defaultQuery } from './db.js'
import { crmMobile, crmLead, sendCrmLeads, crmEnabled } from './crm.js'
import { httpError, safeEqual } from './sales/util.js'

const MAX_ATTEMPTS = 8
const BACKOFF = [1, 5, 15, 30, 60, 120, 360, 720] // minutes

const endpoint = () => String(process.env.NEODOVE_ENDPOINT || '').trim()
// https only (a plain http address is accepted for this machine, for the tests).
export const neodoveEnabled = () => /^https:\/\/\S+$/.test(endpoint()) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(endpoint())

export function checkNeodoveKey(req) {
  const key = process.env.NEODOVE_WEBHOOK_KEY
  const given = String(req.get('x-api-key') || req.query?.key || '')
  if (!key || !given || !safeEqual(given, key)) {
    throw httpError('Bad NeoDove webhook key', { status: 401, publicMessage: 'Unauthorised.' })
  }
}

// ---- call results ------------------------------------------------------------------

// Which NeoDove dispositions mean what (case-insensitive, matched anywhere in the text).
// Not-qualified words are checked first ("not interested" contains "interested").
// Anything else (busy, no answer, not reachable, switched off…) is a call attempt:
// noted, status unchanged.
export const DISPOSITIONS = {
  notQualified: ['not interested', 'not qualified', 'wrong number', 'invalid', 'junk', 'already bought', 'dnd', 'do not call', 'not required', 'fake'],
  qualified: ['interested', 'qualified', 'call back', 'callback', 'follow up', 'follow-up', 'followup', 'hot', 'warm', 'will order', 'will buy', 'ordered', 'converted', 'meeting'],
}

/** 'qualified' | 'not_qualified' | null (a call attempt with no decision). */
export function classifyDisposition(text) {
  const t = String(text || '').toLowerCase()
  if (!t) return null
  // Whole words only, so a remark like "sent photo" is not "hot".
  const has = (w) => new RegExp(`(^|[^a-z])${w.replace(/[-]/g, '\\-')}($|[^a-z])`).test(t)
  if (DISPOSITIONS.notQualified.some(has)) return 'not_qualified'
  if (DISPOSITIONS.qualified.some(has)) return 'qualified'
  return null
}

const pick = (o, keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((x, p) => (x && typeof x === 'object' ? x[p] : undefined), o)
    if (v != null && v !== '' && typeof v !== 'object') return String(v)
  }
  return ''
}
// Like pick, but skips bare numbers (NeoDove's lead_status is a code such as "6", not a name).
const pickText = (o, keys) => pick(Object.fromEntries(keys.map((k) => [k, pick(o, [k])]).filter(([, v]) => !/^\d+$/.test(v))), keys)

/** Call results in a webhook payload: [{ mobile, name, disposition, remark, agent, at }]. */
export function parseCallResults(payload) {
  const items = Array.isArray(payload) ? payload
    : Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.leads) ? payload.leads
        : [payload?.data && typeof payload.data === 'object' ? { ...payload, ...payload.data } : payload]
  const out = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const mobile = crmMobile(pick(it, ['mobile', 'phone', 'number', 'mobile_number', 'contact_number', 'phone_number', 'customer_number',
      'lead.mobile', 'lead.phone', 'lead.number', 'contact.mobile', 'contact.phone', 'customer.mobile', 'customer.phone']))
    if (!/^[6-9]\d{9}$/.test(mobile)) continue
    // NeoDove's "Lead Create" trigger echoes back leads we sent: not a call, nothing to record.
    if (/create/i.test(pick(it, ['event_name', 'event', 'type']))) continue
    const connected = pick(it, ['call_connected', 'connected', 'call.connected']).toLowerCase()
    const at = pick(it, ['called_at', 'disposed_at', 'updated_at', 'timestamp', 'created_at', 'time', 'call.time'])
    const d = at ? new Date(/^\d+$/.test(at) ? Number(at) * (at.length <= 10 ? 1000 : 1) : at) : new Date()
    out.push({
      mobile,
      name: pick(it, ['name', 'lead_name', 'lead.name', 'contact.name', 'customer.name']).replace(/^(n\/?a|null|-+)$/i, '').slice(0, 200) || null,
      disposition: (pickText(it, ['disposition', 'disposition_name', 'dispositionName', 'disposition.name', 'sub_disposition', 'lead_stage_name',
        'stage_name', 'status', 'lead_status', 'call_status', 'outcome', 'result', 'stage', 'lead.disposition', 'lead.status', 'call.disposition'])
        || (connected === 'false' ? 'Not connected' : '')).slice(0, 120),
      connected: connected === 'true' ? true : connected === 'false' ? false : null,
      followUp: pick(it, ['follow_up_date_time']).slice(0, 40),
      campaign: pick(it, ['campaign_name']).slice(0, 120),
      remark: pick(it, ['dispose_remarks', 'disposition_remarks', 'remark', 'remarks', 'notes', 'note', 'comment', 'comments', 'feedback', 'lead.remark', 'call.remark']).slice(0, 1000),
      agent: pick(it, ['agent', 'agent_name', 'agentName', 'user', 'user_name', 'caller', 'caller_name', 'assigned_to', 'agent.name', 'user.name']).slice(0, 120),
      at: Number.isNaN(d.getTime()) ? new Date() : d,
    })
  }
  return out
}

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const LABEL = { qualified: 'Qualified', not_qualified: 'Not qualified' }

/** Handles one NeoDove webhook call. Never throws on content — the raw call is kept for checking. */
export async function recordNeodoveWebhook(payload) {
  if (!hasDatabase()) return { ok: true, stored: false }
  const { rows: [ev] } = await defaultQuery('insert into neodove_events (payload) values ($1) returning id', [payload ?? {}])
  const results = parseCallResults(payload)
  const toSend = []
  const summary = []
  try {
    for (const r of results) {
      // The stage decides; if it doesn't (e.g. "Fresh Inquiry"), the agent's remark may ("invalid no").
      const verdict = classifyDisposition(r.disposition) || classifyDisposition(r.remark)
      const { rows: [row] } = await defaultQuery(
        `insert into lead_status (mobile, name, status, last_disposition, last_remark, last_agent, last_called_at, calls)
         values ($1, $2, coalesce($3, 'not_converted'), $4, $5, $6, $7, 1)
         on conflict (mobile) do update set
           name = coalesce(lead_status.name, excluded.name),
           -- A buyer stays converted; otherwise the latest decision wins (a bare call attempt changes nothing).
           status = case when lead_status.status = 'converted' then 'converted' else coalesce($3, lead_status.status) end,
           last_disposition = excluded.last_disposition, last_remark = excluded.last_remark,
           last_agent = excluded.last_agent, last_called_at = excluded.last_called_at,
           calls = lead_status.calls + 1, updated_at = now()
         returning *`,
        [r.mobile, r.name, verdict, r.disposition || null, r.remark || null, r.agent || null, r.at]
      )
      summary.push({ mobile: r.mobile, disposition: r.disposition, result: row.status })
      // On to Sales Daddy: a note, and the Qualified / Not qualified stage (unless they bought).
      const lead = crmLead('call_result', { name: row.name || r.name || `Lead ${r.mobile}`, phone: r.mobile, email: row.email })
      if (!lead.name || lead.mobile.length < 10) continue
      const note = [
        `NeoDove call: ${r.disposition || 'no disposition'}${verdict ? ' · ' + LABEL[verdict] : ''}${r.connected === false && r.disposition !== 'Not connected' ? ' (call not connected)' : ''}`,
        r.remark && `Remark: ${r.remark}`,
        r.followUp && `Follow-up: ${r.followUp}`,
        r.campaign && `Campaign: ${r.campaign}`,
        [r.agent && `By ${r.agent}`, fmt(r.at)].filter(Boolean).join(', '),
      ].filter(Boolean).join('\n')
      const stage = row.status === 'converted' ? null : verdict === 'qualified' ? 'qualified' : verdict === 'not_qualified' ? 'notQualified' : null
      const { rows: [o] } = await defaultQuery(`insert into crm_outbox (kind, payload) values ('call_result', $1) returning id`,
        [{ lead, note, ...(stage && { stage }) }])
      toSend.push(o.id)
    }
    await defaultQuery('update neodove_events set handled = true, result = $2 where id = $1', [ev.id, JSON.stringify(summary).slice(0, 1000)])
  } catch (err) {
    await defaultQuery('update neodove_events set error = $2 where id = $1', [ev.id, String(err.message).slice(0, 300)]).catch(() => {})
    console.error('[neodove] could not handle a webhook:', err.message)
  }
  if (crmEnabled()) for (const id of toSend) await sendCrmLeads({ id }).catch(() => {})
  return { ok: true, results: summary.length }
}

// ---- sign-ups out to NeoDove ---------------------------------------------------------

/**
 * A sign-up that has not bought: saved as 'not_converted' and queued for NeoDove (once per
 * mobile). `db` is a query runner. Returns the outbox id to send now, or null. Never throws.
 */
export async function recordSignup(db, { name, phone, email, source, sourceLabel, campaign, ad, page }) {
  if (!hasDatabase()) return null
  const mobile = crmMobile(phone)
  if (!/^[6-9]\d{9}$/.test(mobile)) return null
  try {
    const { rows: [row] } = await db.query(
      `insert into lead_status (mobile, name, email, source, campaign, status, signed_up_at)
       values ($1, $2, $3, $4, $5, 'not_converted', now())
       on conflict (mobile) do update set name = excluded.name, email = coalesce(excluded.email, lead_status.email),
         source = coalesce(lead_status.source, excluded.source), campaign = coalesce(lead_status.campaign, excluded.campaign),
         signed_up_at = coalesce(lead_status.signed_up_at, excluded.signed_up_at), updated_at = now()
       returning status`,
      [mobile, name, email || null, source || null, campaign || null]
    )
    if (row.status === 'converted') return null
    const payload = {
      // NeoDove's own example sends the mobile as a number.
      name, mobile: Number(mobile), email: email || '',
      Source: sourceLabel || source || '', Campaign: campaign || '', Ad: ad || '', Page: page || '',
      'Signed up': fmt(new Date()),
    }
    const { rows: [o] } = await db.query(
      `insert into neodove_outbox (mobile, payload) values ($1, $2) on conflict (mobile) do nothing returning id`, [mobile, payload])
    return o?.id || null
  } catch (err) {
    console.error('[neodove] could not record a sign-up:', err.message)
    return null
  }
}

/** A paid order on this mobile: the lead is converted (and is not sent to NeoDove any more). Never throws. */
export async function markLeadConverted(db, mobileRaw) {
  if (!hasDatabase()) return
  const mobile = crmMobile(mobileRaw)
  if (!/^[6-9]\d{9}$/.test(mobile)) return
  let savepoint = false
  try { await db.query('savepoint lead_converted'); savepoint = true } catch { /* not in a transaction */ }
  try {
    await db.query(
      `update lead_status set status = 'converted', converted_at = coalesce(converted_at, now()), updated_at = now() where mobile = $1`, [mobile])
    await db.query(`update neodove_outbox set status = 'failed', last_error = 'converted before sending' where mobile = $1 and status = 'queued'`, [mobile])
    if (savepoint) await db.query('release savepoint lead_converted')
  } catch (err) {
    if (savepoint) await db.query('rollback to savepoint lead_converted').catch(() => {})
    console.error('[neodove] could not mark converted:', err.message)
  }
}

async function post(body) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, text }
}

/** Sends queued sign-ups to NeoDove (oldest first). With `id`, just that one. Never throws. */
export async function sendNeodoveLeads({ id = null, limit = 20, query = defaultQuery } = {}) {
  if (!hasDatabase() || !neodoveEnabled()) return { sent: 0, failed: 0, skipped: neodoveEnabled() ? 'no database' : 'no NeoDove endpoint' }
  let sent = 0
  let failed = 0
  try {
    const { rows } = await query(
      `update neodove_outbox set next_try_at = now() + interval '2 minutes'
        where id in (select id from neodove_outbox
                      where status = 'queued' and next_try_at <= now() and ($1::uuid is null or id = $1)
                      order by created_at limit $2 for update skip locked)
        returning id, mobile, payload, attempts, created_at`,
      [id, limit]
    )
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    for (const r of rows) {
      let result
      try { result = await post(r.payload) } catch (err) { result = { status: 0, text: err.message } }
      if (result.status >= 200 && result.status < 300) {
        sent++
        await query(`update neodove_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [r.id])
        await query(`update lead_status set neodove_sent_at = now(), updated_at = now() where mobile = $1`, [r.mobile])
        continue
      }
      failed++
      const attempts = r.attempts + 1
      const error = `${result.status} ${String(result.text).slice(0, 200)}`.trim()
      const refused = result.status >= 400 && result.status < 500 && ![401, 408, 429].includes(result.status)
      await query(
        `update neodove_outbox set attempts = $2, last_error = $3, status = $4, next_try_at = now() + make_interval(mins => $5) where id = $1`,
        [r.id, attempts, error, refused || attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)]])
      console.error('[neodove] NeoDove did not take a lead:', error)
    }
  } catch (err) {
    console.error('[neodove]', err.message)
  }
  return { sent, failed }
}
