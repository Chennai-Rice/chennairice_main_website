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
//   ONE CAMPAIGN PER SOURCE (13 Nov 2026, replaces the three below): when any of NEODOVE_ENDPOINT_META / _GOOGLE_ADS /
//   _WHATSAPP / _CART / _ENQUIRY is set, every lead goes to its source's campaign (SOURCE_CAMPAIGNS, routeOf) and NeoDove
//   shares each campaign between its telecallers. `agent` on the outbox row then holds the source campaign.
//
//   THE TEAM'S THREE CAMPAIGNS (no longer used once the source campaigns exist): when NEODOVE_ENDPOINT_GAYATHRI / _RAMYA / _LAVANYA are set (one NeoDove campaign
//   each, with its own Custom Integration endpoint), every lead above - sign-up, checkout not paid, bulk enquiry -
//   goes to the next telecaller in turn (round robin: Gayathri → Ramya → Lavanya → Gayathri…), whatever its source,
//   so all three get an equal share (owner, 6 Nov 2026).
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
  if (campaign === 'contact') return 'Contact enquiry'
  if (campaign === 'spin_wheel') return 'Spin & Win'
  if (campaign === 'referral') return 'Referral'
  if (campaign === 'checkout_payment') return 'Checkout: payment not completed'
  if (campaign === 'checkout_details') return 'Checkout: left at details'
  return SOURCE_TYPES[source] || 'Website sign-up'
}

// No lead goes to NeoDove before this (6:30 pm India time, 10 Nov 2026), see sendNeodoveLeads.
export const NEODOVE_PAUSE_UNTIL = '2026-11-10T18:30:00+05:30'

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
const agentEndpoint = (agent) => String(process.env[NEODOVE_AGENTS[agent]] || '').trim()
// https only (a plain http address is accepted for this machine, for the tests).
const usable = (url) => (/^https:\/\/\S+$/.test(url) && (url.match(/https?:\/\//g) || []).length === 1) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)
/** Telecallers whose endpoint is set but is not one clean link (for example the link pasted twice): nothing is sent until it is fixed. */
export const badAgentEndpoints = () => Object.keys(NEODOVE_AGENTS).filter((a) => agentEndpoint(a) && !usable(agentEndpoint(a)))
/** The telecallers whose campaign has a real endpoint. */
export const poolAgents = () => Object.keys(NEODOVE_AGENTS).filter((a) => usable(agentEndpoint(a)))
export const neodoveEnabled = (campaign = 'signup') => sourceMode() || poolAgents().length > 0 || usable(endpoint(campaign))
const enabledCampaigns = () => (sourceMode() || poolAgents().length ? [...Object.keys(NEODOVE_CAMPAIGNS), ...TEAM_ONLY] : Object.keys(NEODOVE_CAMPAIGNS).filter((c) => usable(endpoint(c))))

// Leads that go out only through the telecallers' campaigns (no campaign endpoint of their own).
const TEAM_ONLY = ['bulk_enquiry', 'spin_wheel', 'referral', 'contact']

// ---- NeoDove campaigns by where the lead came from (owner, 13 Nov 2026) ----------------------------------------------
// Replaces the telecallers' three campaigns: every lead goes to the campaign of its source, and NeoDove shares each
// campaign's leads between the telecallers added to it (its own lead distribution).
//   Meta         Meta ad sign-ups, and Instagram / Facebook organic sign-ups (marked Traffic: Organic)
//   Google Ads   Google Ads sign-ups
//   WhatsApp     WhatsApp-link sign-ups
//   Add to cart  checkouts not paid / left at the details step
//   Enquiries    bulk-order and contact-form enquiries, Spin & Win, referrals and any other sign-up
// A campaign whose link is not set yet (or set to a placeholder such as "pending") keeps its leads queued.
export const SOURCE_CAMPAIGNS = {
  meta: 'NEODOVE_ENDPOINT_META', google_ads: 'NEODOVE_ENDPOINT_GOOGLE_ADS', whatsapp: 'NEODOVE_ENDPOINT_WHATSAPP',
  cart: 'NEODOVE_ENDPOINT_CART', enquiry: 'NEODOVE_ENDPOINT_ENQUIRY',
}
const ROUTE_NAMES = { meta: 'Meta', google_ads: 'Google Ads', whatsapp: 'WhatsApp', cart: 'Add to cart', enquiry: 'Enquiries' }
const routeEndpoint = (route) => String(process.env[SOURCE_CAMPAIGNS[route]] || '').trim()
const ORGANIC = new Set(['facebook', 'instagram'])
/** Source mode is on once any of the five campaign secrets exists (a placeholder value counts: it holds the leads). */
export const sourceMode = () => Object.values(SOURCE_CAMPAIGNS).some((k) => String(process.env[k] || '').trim() !== '')
/** The source campaign for a lead: its kind (signup, checkout_…, bulk_enquiry…) and, for a sign-up, where it came from. */
export function routeOf(campaign, source) {
  if (campaign === 'checkout_payment' || campaign === 'checkout_details') return 'cart'
  if (campaign === 'signup') {
    const s = String(source || '')
    if (/^meta_ads/.test(s) || ORGANIC.has(s)) return 'meta'
    if (s === 'google_ads') return 'google_ads'
    if (s === 'whatsapp') return 'whatsapp'
  }
  return 'enquiry'
}
/** Source campaigns whose secret looks like a link but is not one clean https link: nothing is sent until fixed. */
export const badSourceEndpoints = () => Object.keys(SOURCE_CAMPAIGNS).filter((r) => /^https?:/i.test(routeEndpoint(r)) && !usable(routeEndpoint(r)))

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

/**
 * A contact-form enquiry ("Contact us" page): queued for NeoDove's Enquiries campaign, at most once a week per mobile.
 * Returns the outbox id to send now, or null. Never throws.
 */
export async function recordContactEnquiry(db, { name, phone, email, enquiry }) {
  if (!hasDatabase()) return null
  const mobile = crmMobile(phone)
  if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) return null
  try {
    const { rows: [recent] } = await db.query(
      `select 1 from neodove_outbox where mobile = $1 and campaign = 'contact' and created_at > now() - interval '7 days' limit 1`, [mobile])
    if (recent) return null
    const payload = {
      name: name || 'Contact enquiry', mobile: Number(mobile), email: email || '',
      'Lead type': leadType('contact'), tags: leadType('contact'), Source: 'Contact form', Message: String(enquiry || '').slice(0, 1000),
      Enquired: fmt(new Date()),
    }
    const { rows: [o] } = await db.query(`insert into neodove_outbox (mobile, campaign, payload) values ($1, 'contact', $2) returning id`, [mobile, payload])
    return o?.id || null
  } catch (err) {
    console.error('[neodove] could not record a contact enquiry:', err.message)
    return null
  }
}

/**
 * A Spin & Win spin or a referred friend: queued for NeoDove once per mobile and campaign, shared between the
 * telecallers. `fields` are shown on the lead (Prize, Code, Referred by…). Returns the outbox id to send now,
 * or null. Never throws.
 */
export async function recordWebsiteLead(db, campaign, { name, phone, fields = {} }) {
  if (!hasDatabase() || !['spin_wheel', 'referral'].includes(campaign)) return null
  const mobile = crmMobile(phone)
  if (!/^[6-9]\d{9}$/.test(mobile)) return null
  try {
    const { rows: [seen] } = await db.query('select 1 from neodove_outbox where mobile = $1 and campaign = $2 limit 1', [mobile, campaign])
    if (seen) return null
    const payload = {
      name: name || leadType(campaign), mobile: Number(mobile),
      'Lead type': leadType(campaign), tags: leadType(campaign), ...fields, When: fmt(new Date()),
    }
    const { rows: [o] } = await db.query('insert into neodove_outbox (mobile, campaign, payload) values ($1, $2, $3) returning id', [mobile, campaign, payload])
    return o?.id || null
  } catch (err) {
    console.error('[neodove] could not record a ' + campaign + ' lead:', err.message)
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
export async function sendNeodoveLeads({ id = null, limit = 20, query = defaultQuery, now = new Date() } = {}) {
  // Sending paused until this time (owner, 10 Nov 2026: pause, resume at 6:30 pm today). Leads keep being queued and go out after it.
  // NEODOVE_PAUSE_UNTIL (an ISO time) overrides it; empty or past means sending as usual.
  const pausedUntil = new Date(process.env.NEODOVE_PAUSE_UNTIL ?? NEODOVE_PAUSE_UNTIL)
  if (!Number.isNaN(pausedUntil.getTime()) && now < pausedUntil) {
    return { sent: 0, failed: 0, skipped: 'paused until ' + pausedUntil.toISOString() }
  }
  const bySource = sourceMode()
  const bad = bySource ? badSourceEndpoints() : badAgentEndpoints()
  if (bad.length) {
    console.error('[neodove] sending is paused: the endpoint of', bad.join(', '), 'is not one clean https link')
    return { sent: 0, failed: 0, skipped: 'bad endpoint: ' + bad.join(', ') }
  }
  const campaigns = enabledCampaigns()
  if (!hasDatabase() || !campaigns.length) return { sent: 0, failed: 0, skipped: campaigns.length ? 'no database' : 'no NeoDove endpoint' }
  let sent = 0
  let failed = 0
  // In source mode a lead goes to its source campaign; while that campaign's link is not set yet (they are set one by
  // one, owner 13 Nov 2026) it still goes round robin to the telecallers' campaigns, so no lead waits in between.
  const pool = poolAgents()
  const byAgent = {}
  const byCampaign = {}
  let waiting = 0
  // Round robin: the telecaller after the one who got the last lead (in the order above), whatever the lead's source.
  let last
  const pickAgent = async () => {
    if (last === undefined) {
      const { rows: [r] } = await query(
        `select agent from neodove_outbox where agent = any($1::text[]) order by coalesce(sent_at, next_try_at) desc, created_at desc limit 1`, [pool])
      last = r?.agent ?? null
    }
    last = pool[(pool.indexOf(last) + 1) % pool.length]
    return last
  }
  try {
    const { rows } = await query(
      `update neodove_outbox set next_try_at = now() + interval '2 minutes'
        where id in (select id from neodove_outbox
                      where status = 'queued' and next_try_at <= now() and ($1::uuid is null or id = $1)
                        and campaign = any($3::text[])
                      order by created_at limit $2 for update skip locked)
        returning id, mobile, campaign, agent, payload, attempts, created_at,
          (select l.source from lead_status l where l.mobile = neodove_outbox.mobile) as lead_source`,
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
      let viaSource = false
      const route = bySource ? routeOf(r.campaign, r.lead_source) : null
      const url = route ? routeEndpoint(route) : ''
      if (bySource && !usable(url) && !pool.length) {
        // That campaign's link is not set yet and there is no telecaller campaign to fall back on: keep the lead
        // queued, try again in 10 minutes (not a failure).
        waiting++
        await query(`update neodove_outbox set next_try_at = now() + interval '10 minutes', last_error = $2 where id = $1`,
          [r.id, `waiting: ${ROUTE_NAMES[route]} campaign link not set`])
        continue
      }
      if (bySource && usable(url)) {
        viaSource = true
        const extra = { Campaign: ROUTE_NAMES[route], ...(route === 'meta' && { Traffic: ORGANIC.has(r.lead_source) ? 'Organic' : 'Meta ad' }) }
        try { result = await post({ ...r.payload, ...extra }, url) } catch (err) { result = { status: 0, text: err.message } }
        agent = route
        if (r.agent !== route) await query('update neodove_outbox set agent = $2 where id = $1', [r.id, route]).catch(() => {})
      } else try {
        if (pool.length) {
          agent = pool.includes(r.agent) ? r.agent : await pickAgent()
          if (agent !== r.agent) await query('update neodove_outbox set agent = $2 where id = $1', [r.id, agent])
        }
        result = await post(pool.length ? { ...r.payload, Telecaller: AGENT_NAMES[agent] } : r.payload, pool.length ? agentEndpoint(agent) : endpoint(r.campaign))
      } catch (err) { result = { status: 0, text: err.message } }
      if (result.status >= 200 && result.status < 300) {
        sent++
        if (viaSource) byCampaign[ROUTE_NAMES[agent]] = (byCampaign[ROUTE_NAMES[agent]] || 0) + 1
        else if (agent) byAgent[agent] = (byAgent[agent] || 0) + 1
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
  return bySource ? { sent, failed, waiting, byCampaign, byAgent } : { sent, failed, byAgent }
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

/** What a telecaller's remark says about the call, as one status (the team's own-phone call sheets, Nov 2026). */
export function callStatus(remark) {
  const r = String(remark || '').toLowerCase()
  if (!r.trim()) return 'Called'
  if (/\brnr\b|busy|voi?c?e ?mail|call ?cut|disconnect|switch(ed)? ?off|not reachable|no answer|not answering|ringing/.test(r)) return 'Not connected'
  if (/placed (the |an |his |her )?order|ordered/.test(r)) return 'Ordered'
  if (/already (purchased|bought)|bought in|purchased in/.test(r)) return 'Already bought'
  if (/not interested|no need|price is high|don'?t need|wrong number/.test(r)) return 'Not interested'
  if (/interested|\bneed\b.*\b(rice|bag|kg|pink|ponni|idly|price)|\d+ ?kg|send (the )?link|will (order|place|purchase|buy)|place order|order (pink|in|online)/.test(r)) return 'Interested'
  if (/call\s*back|will check|after (diwali|some ?time|\d)|if (he|she) needs|later/.test(r)) return 'Call back'
  return 'Called'
}

/**
 * Leads the team called from their own phones (Nov 2026 call sheets), into NeoDove with what was said. By mobile:
 * a lead NeoDove already has (we sent it, so `neodove_outbox` knows which telecaller) is updated through that
 * campaign's "update only" link (?update=true) with the remark; any other lead is added, the telecallers taking turns
 * (round robin, as for new leads). `rows` are { name, mobile, email, leadType, remarks, location, pincode, signedUp }.
 * With `apply` false nothing is sent: the result says what would happen.
 */
export async function importCalledLeads(rows, { query = defaultQuery, apply = false } = {}) {
  const pool = poolAgents()
  const out = { rows: rows.length, update: 0, add: 0, skipped: 0, failed: 0, byAgent: {}, problems: [], plan: [] }
  if (!pool.length) return { ...out, problems: ['No telecaller NeoDove link is set (NEODOVE_ENDPOINT_GAYATHRI / _RAMYA / _LAVANYA).'] }
  const { rows: [lastRow] } = await query(
    `select agent from neodove_outbox where agent = any($1::text[]) order by coalesce(sent_at, next_try_at) desc, created_at desc limit 1`, [pool])
  let last = lastRow?.agent ?? null
  const next = () => (last = pool[(pool.indexOf(last) + 1) % pool.length])
  for (const r of rows) {
    const mobile = crmMobile(r.mobile)
    if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) { out.skipped++; out.problems.push(`skipped ${r.name || ''} ${r.mobile || ''}`.trim()); continue }
    const { rows: [had] } = await query(
      `select agent from neodove_outbox where mobile = $1 and status = 'sent' and agent = any($2::text[]) order by sent_at desc nulls last limit 1`, [mobile, pool])
    const agent = had?.agent || next()
    const mode = had ? 'update' : 'add'
    out[mode]++
    out.byAgent[agent] = out.byAgent[agent] || { update: 0, add: 0 }
    out.byAgent[agent][mode]++
    out.plan.push({ agent: AGENT_NAMES[agent], mobile, name: r.name || '', status: callStatus(r.remarks), remarks: r.remarks || '', mode })
    if (!apply) continue
    // An existing lead is changed only through the campaign's own "Endpoint (Update only)" link from NeoDove's
    // Custom Integration screen (NEODOVE_UPDATE_ENDPOINT_<NAME>); the create link with ?update=true is ignored by NeoDove.
    const updateLink = String(process.env[`NEODOVE_UPDATE_ENDPOINT_${agent.toUpperCase()}`] || '').trim()
    if (mode === 'update' && !usable(updateLink)) {
      out.failed++
      out.problems.push(`update ${mobile}: NEODOVE_UPDATE_ENDPOINT_${agent.toUpperCase()} (the "Endpoint (Update only)" link) is not set`)
      continue
    }
    const url = mode === 'update' ? updateLink : agentEndpoint(agent)
    const body = {
      name: r.name || `Lead ${mobile}`, mobile: Number(mobile), email: r.email || '',
      'Call status': callStatus(r.remarks), Remarks: r.remarks || '', Called: 'Yes - own phone (before NeoDove)',
      ...(r.location && { Location: r.location }), ...(r.pincode && { Pincode: String(r.pincode) }),
      ...(mode === 'add' && { 'Lead type': r.leadType || 'Website sign-up', tags: r.leadType || 'Website sign-up', Telecaller: AGENT_NAMES[agent], ...(r.signedUp && { 'Signed up': r.signedUp }) }),
    }
    let result
    try { result = await post(body, url) } catch (err) { result = { status: 0, text: err.message } }
    if (result.status < 200 || result.status >= 300) {
      out.failed++
      out.problems.push(`${mode} ${mobile} to ${agent}: ${result.status} ${String(result.text).slice(0, 120)}`)
    }
  }
  return out
}
