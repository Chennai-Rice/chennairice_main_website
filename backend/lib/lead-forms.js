// Meta Instant Form leads ("Lead form"): Sales Daddy receives them from Meta (Settings → Integrations → Meta Lead Ads);
// every 10 minutes (sales/jobs.js) the website reads the new ones from Sales Daddy's API, keeps a copy in lead_forms,
// records them as sign-ups with the source 'lead_form' and queues them for NeoDove's Meta campaign (neodove.js:
// one lead per customer, so someone already in NeoDove is not added again).
//
// Uses the same key as the rest of the CRM sync (SALESDADDY_API_KEY, Leads scope). Settings:
//   LEAD_FORMS_SINCE  optional ISO time: the first run reads leads from then (default: the last hour)
import { hasDatabase, query as defaultQuery } from './db.js'
import { crmEnabled, crmMobile, crmRequest, isBlockedMobile } from './crm.js'
import { recordSignup, sendNeodoveLeads } from './neodove.js'
import { leadFormEvent, sendMetaEvent } from './sales/meta-capi.js'

const OVERLAP_MS = 15 * 60000 // read a little before the last stop, so a lead that arrived late is not missed
const MAX_PAGES = 5
const PAGE = 100

const text = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null)

/** A lead that came from a Meta lead form (the form and Page fields are only set for those). */
export const isFormLead = (l) => ['facebook', 'instagram'].includes(String(l?.source || '')) && Boolean(l.form_name || l.facebook_page)

/**
 * Copies the new Instant Form leads. Returns what happened; never throws.
 * `since` is for the tests and for a manual catch-up (reads from that time instead of the last stop).
 */
export async function syncLeadForms({ query = defaultQuery, since = null, now = new Date() } = {}) {
  if (!crmEnabled()) return { skipped: 'no Sales Daddy key' }
  if (!hasDatabase()) return { skipped: 'no database' }
  try {
    const { rows: [st] } = await query('select since from lead_forms_sync where id = 1')
    const start = since
      ? new Date(since)
      : st?.since
        ? new Date(new Date(st.since).getTime() - OVERLAP_MS)
        : new Date(process.env.LEAD_FORMS_SINCE || now.getTime() - 60 * 60000)

    const leads = []
    let cursor = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ since: start.toISOString(), limit: String(PAGE) })
      if (cursor) qs.set('cursor', cursor)
      const res = await crmRequest('GET', '/v1/ext/leads?' + qs)
      if (res.status < 200 || res.status >= 300 || res.data?.ok === false) {
        const error = `${res.status} ${res.data?.error || ''}`.trim()
        console.error('[lead-forms] Sales Daddy did not return the leads:', error)
        return { error }
      }
      leads.push(...(res.data.leads || []))
      cursor = res.data.nextCursor
      if (!cursor) break
    }

    let saved = 0
    let skipped = 0
    let newest = null
    const toSend = []
    for (const l of leads) {
      const created = l.createdAt ? new Date(l.createdAt) : null
      if (created && !Number.isNaN(created.getTime()) && (!newest || created > newest)) newest = created
      if (!isFormLead(l) || !l.id) continue
      const mobile = crmMobile(l.phone)
      if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) { skipped++; continue }
      const { rows: [row] } = await query(
        `insert into lead_forms (sd_lead_id, mobile, name, email, city, state, platform, form_name, facebook_page, campaign_name, ad_name, created_at_sd)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (sd_lead_id) do nothing returning id`,
        [String(l.id), mobile, text(l.name, 200), text(l.email, 200), text(l.city, 120), text(l.state, 120), l.source,
          text(l.form_name, 200), text(l.facebook_page, 200), text(l.campaign_name, 200), text(l.ad_name, 200), created])
      if (!row) continue // copied before
      saved++
      const outboxId = await recordSignup({ query }, {
        name: text(l.name, 200) || 'Lead form',
        phone: mobile,
        email: text(l.email, 200),
        source: 'lead_form',
        sourceLabel: l.source === 'instagram' ? 'Lead form (Instagram)' : 'Lead form (Facebook)',
        campaign: text(l.campaign_name, 200),
        ad: text(l.ad_name, 200),
        page: text(l.form_name, 200) || text(l.facebook_page, 200),
      })
      if (outboxId) toSend.push(outboxId)
    }

    // Next time start here (an empty read moves on to now, the overlap covers a late arrival).
    const next = newest && newest < now ? newest : now
    await query(
      `insert into lead_forms_sync (id, since, ran_at) values (1, $1, now())
       on conflict (id) do update set since = greatest(lead_forms_sync.since, excluded.since), ran_at = now()`, [next])

    let neodove = 0
    for (const id of toSend) {
      const r = await sendNeodoveLeads({ id, query }).catch(() => null)
      if (r?.sent) neodove += r.sent
    }
    const meta = await sendLeadFormEvents(query)
    return { read: leads.length, saved, skipped, queued: toSend.length, neodove, meta }
  } catch (err) {
    console.error('[lead-forms]', err.message)
    return { error: err.message }
  }
}

/**
 * The Lead event to Meta for form leads not sent yet (Meta's "Conversions API for CRM", first stage: the raw lead), so
 * Meta learns which people filled the form. Also retries the ones Meta refused, for up to 6 days. Returns { sent, failed }.
 *
 * Off unless LEAD_FORMS_TO_META=on (25 Nov 2026). Sales Daddy gives us no Meta lead ID, so the event cannot carry it;
 * Meta then cannot match it to the form lead it already has and counts the same person again as a "website lead"
 * (21–24 Nov: 1,339 leads in Ads Manager for about 660 people). Turn it on only once the event carries Meta's lead ID.
 */
export async function sendLeadFormEvents(query = defaultQuery) {
  if (!process.env.META_CAPI_TOKEN || process.env.LEAD_FORMS_TO_META !== 'on') return { skipped: 'off' }
  const { rows } = await query(
    `select * from lead_forms where meta_sent_at is null and saved_at > now() - interval '6 days' order by saved_at limit 50`)
  let sent = 0
  let failed = 0
  for (const row of rows) {
    const r = await sendMetaEvent(leadFormEvent(row))
    if (r.sent) {
      sent++
      await query('update lead_forms set meta_sent_at = now(), meta_error = null where id = $1', [row.id])
    } else {
      failed++
      await query('update lead_forms set meta_error = $2 where id = $1', [row.id, r.error || r.skipped || 'not sent'])
    }
  }
  return { sent, failed }
}
