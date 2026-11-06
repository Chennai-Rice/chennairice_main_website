// NeoDove (telecalling CRM), with our database in the middle.
//
//   ad / WhatsApp sign-up, not a buyer
//        └▶ lead_status 'not_converted' ─▶ neodove_outbox ─▶ NeoDove campaign (Custom Integration endpoint)
//   telecaller's call result in NeoDove
//        └▶ POST /api/neodove/webhook ─▶ neodove_events ─▶ lead_status 'qualified' / 'not_qualified'
//                                                       └▶ Sales Daddy: note + "Qualified" / "Not qualified" stage
//   paid order with the same mobile ─▶ lead_status 'converted' (and Sales Daddy Converted, see crm.js)
//
//   checkout journey that stopped before paying (journey-followup.js)
//        └▶ neodove_outbox, campaign 'checkout_payment' or 'checkout_details' ─▶ its own NeoDove campaign
//
//   bulk-order enquiry (website form)
//        └▶ neodove_outbox, campaign 'bulk_enquiry'
//
//   THE TEAM'S THREE CAMPAIGNS: when NEODOVE_ENDPOINT_GAYATHRI / _RAMYA / _LAVANYA are set (one NeoDove campaign
//   each, with its own Custom Integration endpoint), every lead above - sign-up, checkout not paid, bulk enquiry -
//   goes to a telecaller: Google Ads leads to Lavanya only, all others (Meta Ads, WhatsApp, website, bulk) shared between
//   Gayathri and Ramya, whichever of the two has had the fewest leads in the last 14 days (AGENT_GROUPS).
//   `agent` on the outbox row says who got it. Until at least one of the three is set, the older one-endpoint-per-source
//   settings below are used.
//
//   NEODOVE_ENDPOINT          the sign-up campaign's Custom Integration "Endpoint" URL (Secret Manager)
//   NEODOVE_PAYMENT_ENDPOINT  the "Payment not completed" campaign's endpoint
//   NEODOVE_DETAILS_ENDPOINT  the "Left at details" campaign's endpoint
//                             Until a campaign's endpoint is a real https URL, its leads wait in
//                             neodove_outbox and go out once it is set.
//   NEODOVE_WEBHOOK_KEY  the secret NeoDove's webhook sends (X-API-Key header or ?key= in the URL)
//
// NeoDove's webhook format is not published: the parser accepts flat and nested shapes and every
// call is stored as it came (neodove_events), so the mapping can be checked against real data.
import { hasDatabase, query as defaultQuery } from './db.js'
import { crmMobile, crmLead, sendCrmLeads, crmEnabled, isBlockedMobile } from './crm.js'
import { httpError, safeEqual } from './sales/util.js'

/** What kind of lead it is, for the telecaller's lead details and the tag on the call result in Sales Daddy. */
const SOURCE_TYPES = {
  meta_ads_facebook: 'Meta Ads', meta_ads_instagram: 'Meta Ads', meta_ads: 'Meta Ads', google_ads: 'Google Ads', whatsapp: 'WhatsApp',
  facebook: 'Social media', instagram: 'Social media', google_search: 'Google search', expo: 'Expo QR',
}
export function leadType(campaign, source) {
  if (campaign === 'bulk_enquiry') return 'Bulk enquiry'
  if (campaign === 'checkout_payment') return 'Checkout: payment not completed'
  if (campaign === 'checkout_details') return 'Checkout: left at details'
  return SOURCE_TYPES[source] || 'Website sign-up'
}

const MAX_ATTEMPTS = 8
const BACKOFF = [1, 5, 15, 30, 60, 120, 360, 720] // minutes

// Each NeoDove campaign has its own Custom Integration endpoint.
export const NEODOVE_CAMPAIGNS = {
  signup: 'NEODOVE_ENDPOINT',
  checkout_payment: 'NEODOVE_PAYMENT_ENDPOINT',
  checkout_details: 'NEODOVE_DETAILS_ENDPOINT',
}
const endpoint = (campaign = 'signup') => String(process.env[NEODOVE_CAMPAIGNS[campaign]] || '').trim()

// The telecallers' campaigns, in the order a tie is settled.
export const NEODOVE_AGENTS = { gayathri: 'NEODOVE_ENDPOINT_GAYATHRI', ramya: 'NEODOVE_ENDPOINT_RAMYA', lavanya: 'NEODOVE_ENDPOINT_LAVANYA' }
const AGENT_NAMES = { gayathri: 'Gayathri', ramya: 'Ramya', lavanya: 'Lavanya' }
// Who gets which leads (owner, 6 Nov 2026): Google Ads leads only Lavanya; Meta Ads and every other lead
// (WhatsApp, website, checkout, bulk enquiry) are shared between Gayathri and Ramya.
export const AGENT_GROUPS = { google_ads: ['lavanya'], other: ['gayathri', 'ramya'] }
/** The telecallers a lead may go to, of those whose campaign is set up (all of them if none of its group is). */
export function agentsFor(adSource, pool) {
  const group = AGENT_GROUPS[adSource === 'google_ads' ? 'google_ads' : 'other'].filter((a) => pool.includes(a))
  return group.length ? group : pool
}
const agentEndpoint = (agent) => String(process.env[NEODOVE_AGENTS[agent]] || '').trim()
// https only (a plain http address is accepted for this machine, for the tests).
const usable = (url) => (/^https:\/\/\S+$/.test(url) && (url.match(/https?:\/\//g) || []).length === 1) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)
/** Telecallers whose endpoint is set but is not one clean link (for example the link pasted twice): nothing is sent until it is fixed. */
export const badAgentEndpoints = () => Object.keys(NEODOVE_AGENTS).filter((a) => agentEndpoint(a) && !usable(agentEndpoint(a)))
/** The telecallers whose campaign has a real endpoint. */
export const poolAgents = () => Object.keys(NEODOVE_AGENTS).filter((a) => usable(agentEndpoint(a)))
export const neodoveEnabled = (campaign = 'signup') => poolAgents().length > 0 || usable(endpoint(campaign))
const enabledCampaigns = () => (poolAgents().length ? [...Object.keys(NEODOVE_CAMPAIGNS), 'bulk_enquiry'] : Object.keys(NEODOVE_CAMPAIGNS).filter((c) => usable(endpoint(c))))

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
    if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) continue
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
      // Tagged "NeoDove call" (CRM_TAGS). A number Sales Daddy does not have yet — one of the team's
      // other NeoDove campaigns — is created with the Manual source, not Website.
      // The kind of lead it was (Meta Ads, Google Ads, WhatsApp, Bulk enquiry…) as a tag, when we sent this mobile to NeoDove.
      const { rows: [sentAs] } = await defaultQuery(`select campaign from neodove_outbox where mobile = $1 order by created_at desc limit 1`, [r.mobile])
      const lead = crmLead('call_result', { name: row.name || r.name || `Lead ${r.mobile}`, phone: r.mobile, email: row.email, source: 'manual',
        tags: sentAs ? [leadType(sentAs.campaign, row.source)] : [] })
      if (!lead.name || lead.mobile.length < 10) continue
      const note = [
        `NeoDove call: ${r.disposition || 'no disposition'}${verdict ? ' · ' + LABEL[verdict] : ''}${r.connected === false && r.disposition !== 'Not connected' ? ' (call not connected)' : ''}`,
        r.remark && `Remark: ${r.remark}`,
        r.followUp && `Follow-up: ${r.followUp}`,
        r.campaign && `Campaign: ${r.campaign}`,
        [r.agent && `By ${r.agent}`, fmt(r.at)].filter(Boolean).join(', '),
      ].filter(Boolean).join('\n')
      const stage = row.status === 'converted' ? null : verdict === 'qualified' ? 'qualified' : verdict === 'not_qualified' ? 'notQualified' : null
      // The agent and result as the lead's own fields ("NeoDove Agent" / "NeoDove Result" columns).
      const custom = { ...(r.agent && { neodove_agent: r.agent }), ...(r.disposition && { neodove_result: verdict ? `${r.disposition} · ${LABEL[verdict]}` : r.disposition }) }
      const { rows: [o] } = await defaultQuery(`insert into crm_outbox (kind, payload) values ('call_result', $1) returning id`,
        [{ lead, note, ...(stage && { stage }), ...(Object.keys(custom).length && { custom }) }])
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
  if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) return null
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
      'Lead type': leadType('signup', source), tags: leadType('signup', source), 'Cart value': '', Source: sourceLabel || source || '', Campaign: campaign || '', Ad: ad || '', Page: page || '',
      'Signed up': fmt(new Date()),
    }
    const { rows: [o] } = await db.query(
      `insert into neodove_outbox (mobile, payload) values ($1, $2) on conflict (mobile) where campaign = 'signup' do nothing returning id`, [mobile, payload])
    return o?.id || null
  } catch (err) {
    console.error('[neodove] could not record a sign-up:', err.message)
    return null
  }
}

/**
 * A bulk-order enquiry from the website form: queued for NeoDove, at most once a week per mobile. Goes out only through the
 * telecallers' three campaigns. Returns the outbox id to send now, or null. Never throws.
 */
export async function recordBulkEnquiry(db, { name, phone, email, company, buyerType, gstin, message }) {
  if (!hasDatabase()) return null
  const mobile = crmMobile(phone)
  if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) return null
  try {
    const { rows: [recent] } = await db.query(
      `select 1 from neodove_outbox where mobile = $1 and campaign = 'bulk_enquiry' and created_at > now() - interval '7 days' limit 1`, [mobile])
    if (recent) return null
    const payload = {
      name: name || company || 'Bulk enquiry', mobile: Number(mobile), email: email || '',
      'Lead type': leadType('bulk_enquiry'), tags: leadType('bulk_enquiry'), 'Cart value': '', Source: 'Bulk order form', Company: company || '', 'Buyer type': buyerType || '', GSTIN: gstin || '', Message: message || '',
      'Enquired': fmt(new Date()),
    }
    const { rows: [o] } = await db.query(`insert into neodove_outbox (mobile, campaign, payload) values ($1, 'bulk_enquiry', $2) returning id`, [mobile, payload])
    return o?.id || null
  } catch (err) {
    console.error('[neodove] could not record a bulk enquiry:', err.message)
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

async function post(body, url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, text }
}

/**
 * Sends queued leads to their NeoDove campaigns (oldest first). With `id`, just that one. A campaign
 * without an endpoint yet keeps its leads queued. Never throws.
 */
export async function sendNeodoveLeads({ id = null, limit = 20, query = defaultQuery } = {}) {
  const bad = badAgentEndpoints()
  if (bad.length) {
    console.error('[neodove] sending is paused: the endpoint of', bad.join(', '), 'is not one clean https link')
    return { sent: 0, failed: 0, skipped: 'bad endpoint: ' + bad.join(', ') }
  }
  const campaigns = enabledCampaigns()
  if (!hasDatabase() || !campaigns.length) return { sent: 0, failed: 0, skipped: campaigns.length ? 'no database' : 'no NeoDove endpoint' }
  let sent = 0
  let failed = 0
  const pool = poolAgents()
  const byAgent = {}
  // Of the telecallers the lead may go to (agentsFor), the one with the fewest leads in the last 14 days gets it (a tie goes in the order above).
  let load = null
  const pickAgent = async (among) => {
    if (!load) {
      const { rows: counts } = await query(
        `select agent, count(*)::int n from neodove_outbox where agent = any($1::text[]) and created_at > now() - interval '14 days' group by agent`, [pool])
      load = Object.fromEntries(pool.map((a) => [a, counts.find((c) => c.agent === a)?.n || 0]))
    }
    const agent = [...among].sort((x, y) => load[x] - load[y])[0]
    load[agent] += 1
    return agent
  }
  try {
    const { rows } = await query(
      `update neodove_outbox set next_try_at = now() + interval '2 minutes'
        where id in (select id from neodove_outbox
                      where status = 'queued' and next_try_at <= now() and ($1::uuid is null or id = $1)
                        and campaign = any($3::text[])
                      order by created_at limit $2 for update skip locked)
        returning id, mobile, campaign, agent, payload, attempts, created_at,
          -- Where the lead came from: the sign-up's source, or the checkout's traffic source.
          coalesce((select j.traffic_source from checkout_journeys j where j.id = neodove_outbox.journey_id),
                   (select l.source from lead_status l where l.mobile = neodove_outbox.mobile)) as ad_source`,
      [id, limit, campaigns]
    )
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    for (const r of rows) {
      // Queued before the number was blocked: dropped, never sent.
      if (isBlockedMobile(r.mobile)) {
        await query(`update neodove_outbox set status = 'failed', last_error = 'blocked: company number' where id = $1`, [r.id])
        continue
      }
      let result
      let agent = null
      try {
        if (pool.length) {
          const among = agentsFor(r.ad_source, pool)
          agent = among.includes(r.agent) ? r.agent : await pickAgent(among)
          if (agent !== r.agent) await query('update neodove_outbox set agent = $2 where id = $1', [r.id, agent])
        }
        result = await post(pool.length ? { ...r.payload, Telecaller: AGENT_NAMES[agent] } : r.payload, pool.length ? agentEndpoint(agent) : endpoint(r.campaign))
      } catch (err) { result = { status: 0, text: err.message } }
      if (result.status >= 200 && result.status < 300) {
        sent++
        if (agent) byAgent[agent] = (byAgent[agent] || 0) + 1
        await query(`update neodove_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [r.id])
        if (r.campaign === 'signup') await query(`update lead_status set neodove_sent_at = now(), updated_at = now() where mobile = $1`, [r.mobile])
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
  return { sent, failed, byAgent }
}

/**
 * Gives the leads sent to NeoDove before "Lead type" existed their type, through the campaign's "update only" link
 * (the endpoint plus ?update=true, which only changes leads NeoDove already has). Each row is marked with its type
 * (payload."Lead type"), so a second run skips it. With `apply` false nothing is sent: the result only counts.
 */
export async function backfillLeadTypes({ query = defaultQuery, apply = false, limit = 500 } = {}) {
  const pool = poolAgents()
  const { rows } = await query(
    `select o.id, o.mobile, o.campaign, o.agent, o.payload, l.source
       from neodove_outbox o left join lead_status l on l.mobile = o.mobile
      where o.status = 'sent' and not (o.payload ? 'Lead type') order by o.created_at limit $1`, [limit])
  const out = { found: rows.length, updated: 0, failed: 0, byType: {}, skipped: 0 }
  for (const r of rows) {
    const type = leadType(r.campaign, r.source)
    out.byType[type] = (out.byType[type] || 0) + 1
    if (!apply) continue
    const base = pool.includes(r.agent) ? agentEndpoint(r.agent) : endpoint(r.campaign)
    if (!usable(base)) { out.skipped++; continue }
    const url = base + (base.includes('?') ? '&' : '?') + 'update=true'
    const body = { name: r.payload?.name || 'Lead', mobile: Number(r.mobile), email: r.payload?.email || '', 'Lead type': type }
    let result
    try { result = await post(body, url) } catch (err) { result = { status: 0, text: err.message } }
    if (result.status >= 200 && result.status < 300) {
      out.updated++
      await query(`update neodove_outbox set payload = payload || jsonb_build_object('Lead type', $2::text) where id = $1`, [r.id, type])
    } else {
      out.failed++
      console.error('[neodove] backfill refused:', result.status, String(result.text).slice(0, 120))
    }
  }
  return out
}
