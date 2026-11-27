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

const META_ID = /^\d{5,40}$/
/** Meta's ID for the form submission (Sales Daddy's meta_lead_id, from 25 Nov 2026), as text, or null. */
export const metaLeadId = (l) => {
  const v = String(l?.meta_lead_id ?? '').trim()
  return META_ID.test(v) ? v : null
}
/**
 * Every Meta lead ID for the person, first one first (Sales Daddy's meta_lead_ids, 27 Nov 2026: a repeat form
 * submission adds one), as text. Falls back to meta_lead_id for the older API answer.
 */
export const metaLeadIds = (l) => {
  const list = Array.isArray(l?.meta_lead_ids) ? l.meta_lead_ids.map((v) => String(v ?? '').trim()).filter((v) => META_ID.test(v)) : []
  const first = metaLeadId(l)
  if (first && !list.includes(first)) list.unshift(first)
  return [...new Set(list)].slice(0, 50)
}
/** Where the form was filled in: Sales Daddy's platform (facebook / instagram / audience_network / messenger), else the source. */
export const PLATFORMS = ['facebook', 'instagram', 'audience_network', 'messenger']
export const leadPlatform = (l) => {
  const p = String(l?.platform || '').trim().toLowerCase()
  return PLATFORMS.includes(p) ? p : text(l?.source, 40)
}
/**
 * Saves one form lead. Sales Daddy's id is the person (one per phone): set up once (`inserted`). On later reads the row
 * only gains what was missing: Meta lead IDs (a repeat submission adds one), and the campaign, ad set, ad and platform
 * that Sales Daddy fills in after its Facebook reconnect (27 Nov 2026). Returns a row only when it inserted or added
 * something; `inserted` is true only for a new row (xmax = 0). Shared with db/lead-forms-dryrun.js.
 */
export const LEAD_FORM_UPSERT =
  `insert into lead_forms (sd_lead_id, mobile, name, email, city, state, platform, form_name, facebook_page, campaign_name, ad_name,
                           created_at_sd, meta_lead_id, adset_name, meta_lead_ids)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::text[])
   on conflict (sd_lead_id) do update set
     meta_lead_id = coalesce(lead_forms.meta_lead_id, excluded.meta_lead_id),
     meta_lead_ids = (select coalesce(array_agg(x order by o), '{}') from (
                        select distinct on (x) x, o from unnest(lead_forms.meta_lead_ids || excluded.meta_lead_ids) with ordinality u(x, o)
                        order by x, o) d),
     campaign_name = coalesce(lead_forms.campaign_name, excluded.campaign_name),
     adset_name = coalesce(lead_forms.adset_name, excluded.adset_name),
     ad_name = coalesce(lead_forms.ad_name, excluded.ad_name),
     -- Sales Daddy's own platform ($16) replaces the earlier guess from the source; without it nothing changes.
     platform = coalesce($16, lead_forms.platform)
   where (lead_forms.meta_lead_id is null and excluded.meta_lead_id is not null)
      or ($16::text is not null and lead_forms.platform is distinct from $16::text)
      or not (excluded.meta_lead_ids <@ lead_forms.meta_lead_ids)
      or (lead_forms.campaign_name is null and excluded.campaign_name is not null)
      or (lead_forms.adset_name is null and excluded.adset_name is not null)
      or (lead_forms.ad_name is null and excluded.ad_name is not null)
   returning id, mobile, campaign_name, (xmax = 0) as inserted`
export const leadFormParams = (l, mobile, created) => [
  String(l.id), mobile, text(l.name, 200), text(l.email, 200), text(l.city, 120), text(l.state, 120), leadPlatform(l),
  text(l.form_name, 200), text(l.facebook_page, 200), text(l.campaign_name, 200), text(l.ad_name, 200), created, metaLeadId(l),
  text(l.adset_name, 200), metaLeadIds(l), PLATFORMS.includes(String(l?.platform || '').trim().toLowerCase()) ? String(l.platform).trim().toLowerCase() : null,
]

/**
 * A lead that came from a Meta lead form: it has Meta's lead ID (Sales Daddy's own rule), or, for leads read before
 * that field existed, a Facebook / Instagram source with the form or Page set (only form leads have those).
 */
export const isFormLead = (l) => metaLeadIds(l).length > 0 ||
  (['facebook', 'instagram'].includes(String(l?.source || '')) && Boolean(l?.form_name || l?.facebook_page))

const PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger' }

// Sales Daddy fills ad details in later and adds repeat submissions to the same lead, without changing when the lead
// was created, so the 10-minute read (new leads only) would not see them: every 6 hours the last 3 days are read again.
const REFRESH_EVERY_MS = 6 * 3600e3
const REFRESH_DAYS = 3
const REFRESH_PAGES = 40

/**
 * Copies the new Instant Form leads. Returns what happened; never throws.
 * `since` is for the tests and for a manual catch-up (reads from that time instead of the last stop).
 */
export async function syncLeadForms({ query = defaultQuery, since = null, now = new Date(), maxPages = 0, fillOnly = false } = {}) {
  if (!crmEnabled()) return { skipped: 'no Sales Daddy key' }
  if (!hasDatabase()) return { skipped: 'no database' }
  try {
    const { rows: [st] } = await query('select since, refreshed_at from lead_forms_sync where id = 1')
    // The periodic re-read of the last few days (ad details filled in later, repeat submissions); see REFRESH_EVERY_MS.
    const refresh = !since && Boolean(st?.since) && (!st.refreshed_at || now - new Date(st.refreshed_at) >= REFRESH_EVERY_MS)
    const start = since
      ? new Date(since)
      : refresh
        ? new Date(now.getTime() - REFRESH_DAYS * 86400e3)
        : st?.since
          ? new Date(new Date(st.since).getTime() - OVERLAP_MS)
          : new Date(process.env.LEAD_FORMS_SINCE || now.getTime() - 60 * 60000)
    const pages = since || refresh ? maxPages || REFRESH_PAGES : MAX_PAGES

    const leads = []
    let cursor = null
    for (let page = 0; page < pages; page++) {
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
    let updated = 0
    let skipped = 0
    let newest = null
    const toSend = []
    for (const l of leads) {
      const created = l.createdAt ? new Date(l.createdAt) : null
      if (created && !Number.isNaN(created.getTime()) && (!newest || created > newest)) newest = created
      if (!isFormLead(l) || !l.id) continue
      const mobile = crmMobile(l.phone)
      if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile)) { skipped++; continue }
      // Fill-only (the one-off catch-up after Sales Daddy's reconnect, db/lead-forms-refill.js): only leads already
      // copied are completed; an old lead we never had is not set up or sent to the telecallers weeks later.
      if (fillOnly && !(await query('select 1 from lead_forms where sd_lead_id = $1', [String(l.id)])).rows.length) { skipped++; continue }
      const { rows: [row] } = await query(LEAD_FORM_UPSERT, leadFormParams(l, mobile, created))
      if (!row) continue // copied before, nothing new
      if (!row.inserted) {
        // Copied before and now completed (ad details filled in, or a repeat submission): the sign-up record gets the
        // campaign it was missing, so reports by campaign include it. Not set up or sent to NeoDove again.
        updated++
        if (row.campaign_name) {
          await query(`update lead_status set campaign = $2, updated_at = now() where mobile = $1 and campaign is null`, [row.mobile, row.campaign_name])
        }
        continue
      }
      saved++
      const platform = leadPlatform(l)
      const outboxId = await recordSignup({ query }, {
        name: text(l.name, 200) || 'Lead form',
        phone: mobile,
        email: text(l.email, 200),
        source: 'lead_form',
        sourceLabel: `Lead form (${PLATFORM_LABEL[platform] || 'Facebook'})`,
        campaign: text(l.campaign_name, 200),
        ad: text(l.ad_name, 200),
        page: text(l.form_name, 200) || text(l.facebook_page, 200),
      })
      if (outboxId) toSend.push(outboxId)
    }

    if (fillOnly) return { read: leads.length, updated, skipped, fillOnly: true }
    // Next time start here (an empty read moves on to now, the overlap covers a late arrival).
    const next = newest && newest < now ? newest : now
    await query(
      `insert into lead_forms_sync (id, since, ran_at, refreshed_at) values (1, $1, now(), $2)
       on conflict (id) do update set since = greatest(lead_forms_sync.since, excluded.since), ran_at = now(),
         refreshed_at = coalesce(excluded.refreshed_at, lead_forms_sync.refreshed_at)`, [next, refresh ? now : null])

    let neodove = 0
    for (const id of toSend) {
      const r = await sendNeodoveLeads({ id, query }).catch(() => null)
      if (r?.sent) neodove += r.sent
    }
    const meta = await sendLeadFormEvents(query)
    return { read: leads.length, saved, updated, skipped, queued: toSend.length, neodove, meta, ...(refresh && { refresh: true }) }
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
