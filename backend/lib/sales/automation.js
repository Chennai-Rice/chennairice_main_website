// Read-only feed for the email-automation tool (Zoho, Mailchimp, n8n, Make…):
// the Super Slogan Contest sign-ups, who gave their name, mobile and email to
// hear about the contest. Customers who only placed an order are not listed —
// they have not asked for marketing email.
//
//   GET /api/automation/contacts?since=<ISO time>&limit=<1-1000>
//   header  X-API-Key: <AUTOMATION_API_KEY>
//
// Poll it with the `next_since` from the previous answer to get only the
// sign-ups that are new or changed since then.
import { httpError, safeEqual } from './util.js'
import { SOURCES } from './attribution.js'

export function checkAutomationKey(req) {
  const key = process.env.AUTOMATION_API_KEY
  const given = req.get('x-api-key') || ''
  if (!key || !given || !safeEqual(given, key)) {
    throw httpError('Bad automation key', { status: 401, publicMessage: 'A valid X-API-Key header is required.' })
  }
}

export async function automationContacts(db, params) {
  let since = null
  if (params?.since) {
    const d = new Date(String(params.since))
    if (Number.isNaN(d.getTime())) throw httpError('Bad since', { publicMessage: 'since must be a date-time, e.g. 2026-10-15T00:00:00Z.' })
    since = d.toISOString()
  }
  const limit = Math.min(1000, Math.max(1, Number.parseInt(params?.limit, 10) || 500))
  const { rows } = await db.query(
    `select name, email, phone, phone_verified, source, campaign, ad, landing, submissions, created_at, updated_at
       from contest_leads
      where $1::timestamptz is null or date_trunc('milliseconds', updated_at) > $1
      order by updated_at asc
      limit $2`,
    [since, limit]
  )
  const contacts = rows.map((r) => ({
    name: r.name,
    first_name: r.name.split(' ')[0],
    email: r.email,
    phone: '+91' + r.phone,
    phone_verified: r.phone_verified === true,
    list: 'super_slogan_contest',
    source: r.source,
    source_label: SOURCES[r.source] || r.source,
    campaign: r.campaign || null,
    ad: r.ad || null,
    landing_page: r.landing || null,
    times_signed_up: r.submissions,
    signed_up_at: r.created_at,
    updated_at: r.updated_at,
  }))
  return {
    contacts,
    count: contacts.length,
    // Pass this back as ?since= next time to get only newer sign-ups.
    next_since: contacts.length ? contacts[contacts.length - 1].updated_at : since,
    has_more: contacts.length === limit,
  }
}
