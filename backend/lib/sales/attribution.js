// Where a visit, and the order it led to, came from.
//
// The browser sends what it saw on landing: utm_source / utm_medium /
// utm_campaign / utm_content from the ad link, Meta's fbclid, Google's
// gclid, Merchant Center's srsltid, and the referring site. Here that becomes one source:
//
//   meta_ads_facebook, meta_ads_instagram, meta_ads   paid Meta ad
//   google_ads                                         paid Google ad
//   google_shopping                                    Google Merchant Center listing (free listing / Shopping tab)
//   facebook, instagram, google_search, whatsapp       unpaid visits
//   other_website, direct
//
// plus the campaign and ad names from the link. A Meta click ID alone is not
// proof of an ad (Facebook adds it to ordinary post links too), so a Meta
// visit counts as an ad when the link says utm_medium=paid (or cpc, ads…).
import { httpError, str } from './util.js'
import { otpEnabled, sendOtp, verifyOtp } from './otp.js'
import { pushCrmLead, CRM_TAGS } from '../crm.js'
import { recordSignup, sendNeodoveLeads } from '../neodove.js'

export const SOURCES = {
  meta_ads_facebook: 'Meta ad · Facebook',
  meta_ads_instagram: 'Meta ad · Instagram',
  meta_ads: 'Meta ad',
  google_ads: 'Google Ads',
  google_shopping: 'Google Shopping (Merchant Center)',
  facebook: 'Facebook (not an ad)',
  instagram: 'Instagram (not an ad)',
  google_search: 'Google search',
  whatsapp: 'WhatsApp',
  expo: 'Expo QR',
  other_website: 'Other website',
  direct: 'Direct / typed the address',
}

// Sales Daddy: the lead source key for the platforms it knows (its own sources).
const CRM_SOURCE = { meta_ads_instagram: 'instagram', meta_ads_facebook: 'facebook', whatsapp: 'whatsapp' }
// The tag for each ad channel (they exist in Sales Daddy; see CRM_TAGS in crm.js).
export const AD_TAG = {
  meta_ads_instagram: 'Instagram ad',
  meta_ads_facebook: 'Facebook ad',
  meta_ads: 'Meta ad',
  google_ads: 'Google ad',
}

const PAID = /^(paid|cpc|ppc|ads?|paid[_-]?social|paidsocial|paid[_-]?search|display|sponsored)$/i
const clip = (v, n = 120) => str(String(v ?? '')).slice(0, n)

/** The landing details as sent by the browser, cleaned and length-capped. */
export function cleanAttribution(raw) {
  if (!raw || typeof raw !== 'object') return null
  const a = {
    utm_source: clip(raw.utm_source, 60),
    utm_medium: clip(raw.utm_medium, 60),
    utm_campaign: clip(raw.utm_campaign),
    utm_content: clip(raw.utm_content),
    utm_term: clip(raw.utm_term),
    fbclid: raw.fbclid ? true : undefined,
    gclid: raw.gclid ? true : undefined,
    srsltid: raw.srsltid ? true : undefined,
    referrer: clip(raw.referrer, 200),
    landing: clip(raw.landing, 200),
    at: clip(raw.at, 40),
  }
  for (const k of Object.keys(a)) if (!a[k]) delete a[k]
  return Object.keys(a).length ? a : null
}

function referrerHost(ref) {
  try {
    return new URL(ref).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** { source, campaign, ad } for a set of landing details (null = direct). */
export function classify(a) {
  if (!a) return { source: 'direct', campaign: '', ad: '' }
  const s = (a.utm_source || '').toLowerCase()
  const m = (a.utm_medium || '').toLowerCase()
  const host = referrerHost(a.referrer)
  const campaign = a.utm_campaign || ''
  const ad = a.utm_content || ''
  const paid = PAID.test(m)

  const isGoogle = /^(google|adwords|googleads|google_ads)$/.test(s)
  if (a.gclid || (isGoogle && paid)) return { source: 'google_ads', campaign, ad }
  // Google Merchant Center: its srsltid tag on the product link, or a link tagged as Shopping / free listing
  // (utm_medium=shopping..., or utm_source=google_shopping / merchant_center). A paid Shopping ad has a gclid and
  // stays Google Ads above, where its cost is.
  if (a.srsltid || /^(shopping|free[_-]?listings?|organic[_-]?shopping|merchant[_-]?cent(er|re))$/.test(m) ||
      /^(google[_-]?shopping|merchant[_-]?cent(er|re)|gmc)$/.test(s)) return { source: 'google_shopping', campaign, ad }

  const igSource = /^(ig|instagram)$/.test(s)
  const fbSource = /^(fb|facebook|meta)$/.test(s)
  const igHost = /(^|\.)instagram\.com$/.test(host)
  const fbHost = /(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)
  if (igSource || fbSource || ((igHost || fbHost) && paid) || (a.fbclid && paid)) {
    if (paid) {
      // Platform from the link's source (Meta's {{site_source_name}} gives
      // fb / ig), else from the referring site; "meta" alone stays unknown.
      const instagram = igSource || (!/^(fb|facebook)$/.test(s) && igHost)
      const facebook = !instagram && (/^(fb|facebook)$/.test(s) || fbHost)
      return { source: instagram ? 'meta_ads_instagram' : facebook ? 'meta_ads_facebook' : 'meta_ads', campaign, ad }
    }
    return { source: igSource || igHost ? 'instagram' : 'facebook', campaign, ad }
  }
  if (igHost) return { source: 'instagram', campaign, ad }
  if (fbHost || a.fbclid) return { source: 'facebook', campaign, ad }
  if (/(^|\.)google\.[a-z.]+$/.test(host) || isGoogle) return { source: 'google_search', campaign, ad }
  if (/whatsapp|^wa\.me$/.test(host) || /whatsapp|^wa$/.test(s)) return { source: 'whatsapp', campaign, ad }
  // The QR code at an expo opens /expo, which tags the visit utm_source=expo.
  if (s === 'expo') return { source: 'expo', campaign, ad }
  if (host && !/chennairiceindustries\.com$|localhost/.test(host)) return { source: 'other_website', campaign, ad }
  if (s) return { source: 'other_website', campaign, ad }
  return { source: 'direct', campaign, ad }
}

/** Count one landing (only sources other than a plain direct visit). */
export async function recordVisit(db, raw) {
  const a = cleanAttribution(raw)
  const { source, campaign, ad } = classify(a)
  if (source === 'direct') return { source }
  await db.query(
    `insert into traffic_visits (day, source, campaign, ad, visits)
     values ((now() at time zone 'Asia/Kolkata')::date, $1, $2, $3, 1)
     on conflict (day, source, campaign, ad) do update set visits = traffic_visits.visits + 1`,
    [source, campaign, ad]
  )
  return { source }
}

const PAID_STATUSES = ['paid', 'partially_refunded']

const DAY = /^\d{4}-\d{2}-\d{2}$/
/**
 * The period a report is for, as India dates (both included): ?from&to when given, else the last `days` days
 * (30 by default) up to today. `from` alone runs to today; a single day is from = to.
 */
export function reportRange({ days, from, to } = {}) {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  if (DAY.test(String(from || '')) || DAY.test(String(to || ''))) {
    let f = DAY.test(String(from || '')) ? from : to
    let t = DAY.test(String(to || '')) ? to : today
    if (f > t) [f, t] = [t, f]
    return { from: f, to: t }
  }
  const span = Math.min(3660, Math.max(1, Number(days) || 30))
  return { from: new Date(Date.parse(today + 'T00:00:00Z') - (span - 1) * 86400000).toISOString().slice(0, 10), to: today }
}
const inRange = (col, a, b) => `(${col} at time zone 'Asia/Kolkata')::date between $${a}::date and $${b}::date`

/**
 * Sales by source, campaign and ad for a period: visits (tagged landings),
 * checkouts started, paid orders, packs and revenue. Optionally for one
 * product (orders that include it; packs and revenue of that product only).
 */
export async function sourcesReport(db, { days, from, to, product = '' } = {}) {
  const range = reportRange({ days, from, to })
  const slug = str(product)

  const { rows: orders } = await db.query(
    `select coalesce(o.traffic_source, 'direct') as source, coalesce(o.traffic_campaign, '') as campaign,
            coalesce(o.traffic_ad, '') as ad,
            count(*)::int as checkouts,
            count(*) filter (where o.payment_status = any($3))::int as orders,
            coalesce(sum(x.packs) filter (where o.payment_status = any($3)), 0)::int as packs,
            coalesce(sum(x.amount) filter (where o.payment_status = any($3)), 0)::bigint as revenue
       from orders o
       join lateral (
         select sum(i.quantity) as packs, sum(i.line_total_paise) + case when $2 = '' then o.shipping_paise else 0 end as amount
           from order_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
          where i.order_id = o.id and ($2 = '' or p.slug = $2)
         having count(*) > 0
       ) x on true
      where ${inRange('o.created_at', 1, 4)}
      group by 1, 2, 3`,
    [range.from, slug, PAID_STATUSES, range.to]
  )
  const { rows: visits } = await db.query(
    `select source, campaign, ad, sum(visits)::int as visits
       from traffic_visits where day between $1::date and $2::date
      group by 1, 2, 3`,
    [range.from, range.to]
  )

  const key = (r) => `${r.source}|${r.campaign}|${r.ad}`
  const rows = new Map()
  for (const v of visits) rows.set(key(v), { ...v, checkouts: 0, orders: 0, packs: 0, revenue: 0 })
  for (const o of orders) {
    const r = rows.get(key(o)) || { source: o.source, campaign: o.campaign, ad: o.ad, visits: null }
    rows.set(key(o), { ...r, checkouts: o.checkouts, orders: o.orders, packs: o.packs, revenue: Number(o.revenue) / 100 })
  }
  const list = [...rows.values()]
    .map((r) => ({ ...r, label: SOURCES[r.source] || r.source }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || (b.visits || 0) - (a.visits || 0))

  const bySource = {}
  for (const r of list) {
    const t = bySource[r.source] || (bySource[r.source] = { source: r.source, label: r.label, visits: 0, checkouts: 0, orders: 0, packs: 0, revenue: 0 })
    t.visits += r.visits || 0
    t.checkouts += r.checkouts
    t.orders += r.orders
    t.packs += r.packs
    t.revenue += r.revenue
  }
  return {
    ...range,
    product: slug || null,
    sources: Object.values(bySource).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders),
    campaigns: list,
  }
}

/** Paid orders for one source / campaign / ad, newest first (for the drill-down). */
export async function sourceOrders(db, { days, from, to, source, campaign = '', ad = '', product = '' } = {}) {
  const range = reportRange({ days, from, to })
  const { rows } = await db.query(
    `select o.order_number, o.placed_at, o.contact_name, o.total_paise, o.status,
            (o.shipping_address->>'city') as city,
            (select string_agg(i.product_name || ' ' || trim(to_char(i.pack_kg, 'FM999')) || ' kg × ' || i.quantity, ', ')
               from order_items i where i.order_id = o.id) as items
       from orders o
      where o.payment_status = any($5)
        and coalesce(o.traffic_source, 'direct') = $2 and coalesce(o.traffic_campaign, '') = $3 and coalesce(o.traffic_ad, '') = $4
        and ${inRange('o.created_at', 1, 7)}
        and ($6 = '' or exists (select 1 from order_items i join product_variants v on v.id = i.variant_id
                                 join products p on p.id = v.product_id where i.order_id = o.id and p.slug = $6))
      order by o.placed_at desc nulls last limit 200`,
    [range.from, str(source), str(campaign), str(ad), PAID_STATUSES, str(product), range.to]
  )
  return rows.map((r) => ({ ...r, total: Number(r.total_paise) / 100 }))
}

/**
 * Everyone who checked out in the period from the given sources (paid or not),
 * one row per order, with who they are and which campaign / ad brought them.
 * `sources` is a comma list of source keys; empty means every source.
 */
export async function sourcePeople(db, { days, from, to, sources = '', product = '' } = {}) {
  const range = reportRange({ days, from, to })
  const list = String(sources || '').split(',').map((s) => s.trim()).filter((s) => SOURCES[s])
  const { rows } = await db.query(
    `select o.order_number, o.created_at, o.placed_at, o.contact_name, o.contact_phone, o.contact_email, o.total_paise,
            o.status, o.payment_status, coalesce(o.traffic_source, 'direct') as source,
            coalesce(o.traffic_campaign, '') as campaign, coalesce(o.traffic_ad, '') as ad,
            (o.shipping_address->>'city') as city,
            (select string_agg(i.product_name || ' ' || trim(to_char(i.pack_kg, 'FM999')) || ' kg × ' || i.quantity, ', ')
               from order_items i where i.order_id = o.id) as items
       from orders o
      where ${inRange('o.created_at', 1, 4)}
        and (cardinality($2::text[]) = 0 or coalesce(o.traffic_source, 'direct') = any($2))
        and ($3 = '' or exists (select 1 from order_items i join product_variants v on v.id = i.variant_id
                                 join products p on p.id = v.product_id where i.order_id = o.id and p.slug = $3))
      order by o.created_at desc limit 500`,
    [range.from, list, str(product), range.to]
  )
  return rows.map((r) => ({
    ...r, total: Number(r.total_paise) / 100, total_paise: undefined,
    paid: PAID_STATUSES.includes(r.payment_status), label: SOURCES[r.source] || r.source,
  }))
}

// ---- Super Slogan Contest sign-ups (the popup form shown to ad visitors) ----

const NAME = /^[\p{L}][\p{L} .'-]{1,79}$/u
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

/** Indian mobile number as 10 digits, or '' if it is not one. */
export function cleanMobile(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : ''
}

// Visitors shown the sign-up form: from a Meta or Google ad, or a WhatsApp link.
const AD_SOURCES = ['meta_ads_facebook', 'meta_ads_instagram', 'meta_ads', 'google_ads', 'whatsapp']

/** Name, mobile and email checked and tidied, or a 400 saying which is wrong. */
function leadFields(body) {
  const name = str(body?.name).replace(/\s+/g, ' ')
  const phone = cleanMobile(body?.phone)
  const email = str(body?.email).toLowerCase()
  if (!NAME.test(name)) throw httpError('Bad name', { publicMessage: 'Please enter your name.' })
  if (!phone) throw httpError('Bad phone', { publicMessage: 'Please enter a valid 10-digit mobile number.' })
  if (email.length > 120 || !EMAIL.test(email)) throw httpError('Bad email', { publicMessage: 'Please enter a valid email address.' })
  return { name, phone, email }
}

/**
 * Step 1 of the sign-up: checks the details and texts an OTP to the mobile
 * (MSG91). Only for visitors who came from a Meta or Google ad, the only ones
 * shown the form, so the SMS budget is not spent on anyone else.
 */
export async function startContestLead(db, body, { ip = '' } = {}) {
  const { phone } = leadFields(body)
  if (!otpEnabled()) return { otpRequired: false }
  const { source } = classify(cleanAttribution(body?.attribution))
  if (!AD_SOURCES.includes(source)) {
    throw httpError('Not from an ad', { status: 403, publicMessage: 'This sign-up is only for visitors from our ads or WhatsApp links.' })
  }
  return sendOtp(db, phone, { resend: body?.resend === true, ip })
}

/**
 * Step 2: saves the sign-up. With OTP switched on (MSG91 configured), the
 * mobile number must first be confirmed with the OTP sent to it. The same
 * mobile number again updates its row.
 */
export async function saveContestLead(db, body) {
  const { name, phone, email } = leadFields(body)
  const verified = otpEnabled() ? await verifyOtp(phone, body?.otp) : false
  const a = cleanAttribution(body?.attribution)
  const { source, campaign, ad } = classify(a)
  await db.query(
    `insert into contest_leads (name, phone, email, source, campaign, ad, landing, attribution, phone_verified)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (phone) do update set name = excluded.name, email = excluded.email,
       source = excluded.source, campaign = excluded.campaign, ad = excluded.ad,
       landing = excluded.landing, attribution = excluded.attribution,
       phone_verified = contest_leads.phone_verified or excluded.phone_verified,
       submissions = contest_leads.submissions + 1, updated_at = now()`,
    [name, phone, email, source, campaign, ad, clip(body?.page || a?.landing, 200) || null, a, verified]
  )
  // Into the Sales Daddy CRM: the lead's source is the platform of the ad
  // (Instagram / Facebook, Sales Daddy's own sources) and a tag names the ad
  // channel, so sales can filter each apart. The campaign and ad are in the note.
  // "Not converted" until this mobile pays for an order (the order's paid note
  // takes it off); someone who has already bought does not get it.
  const label = SOURCES[source] || source
  const mobile = String(phone).replace(/\D/g, '').slice(-10)
  const { rows: [bought] } = await db.query(
    `select 1 from orders where right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1
        and payment_status in ('paid', 'partially_refunded') limit 1`, [mobile])
  await pushCrmLead('contest_signup', {
    name, phone, email,
    source: CRM_SOURCE[source],
    tags: [AD_TAG[source], !bought && CRM_TAGS.notConverted].filter(Boolean),
    // "Signed up – not bought" stage, unless this mobile has already bought.
    stage: bought ? undefined : 'signedUp',
    note: [
      'Super Slogan Contest sign-up from the website.',
      'Came from: ' + label + (campaign ? ' · campaign ' + campaign : '') + (ad ? ' · ad ' + ad : ''),
      'Mobile verified by OTP: ' + (verified ? 'yes' : 'no'),
    ].join('\n'),
    custom: { contest: 'Super Slogan Contest', came_from: label, campaign: campaign || '', ad: ad || '' },
  })
  // Not a buyer: "not converted" in our database, and on to NeoDove for a call (once per mobile).
  if (!bought) {
    const id = await recordSignup(db, { name, phone, email, source, sourceLabel: label, campaign, ad, page: clip(body?.page || a?.landing, 200) })
    if (id) await sendNeodoveLeads({ id }).catch(() => {})
  }
  return { ok: true }
}

/**
 * New leads in the period, newest first: the same three kinds the Analyst dashboard's "New leads" counts, so both
 * show the same total (Nov 2026): contest sign-ups (by the day they first signed up), expo QR leads, and people who
 * messaged the business WhatsApp number for the first time.
 */
export async function contestLeads(db, { days, from, to } = {}) {
  const range = reportRange({ days, from, to })
  const { rows } = await db.query(
    `select * from (
       select name, phone, email, source, campaign, ad, landing, submissions, phone_verified, created_at, updated_at, null::text as message
         from contest_leads where ${inRange('created_at', 1, 2)}
       union all
       select name, phone, coalesce(email, ''), 'expo', campaign, null, null, submissions, false, created_at, updated_at, location || ' · ' || array_to_string(requirements, ', ')
         from expo_leads where ${inRange('created_at', 1, 2)}
       union all
       select coalesce(nullif(name, ''), 'WhatsApp contact'), phone, '', 'whatsapp_chat', null, null, null, messages, false,
              coalesce(first_message_at, created_at), coalesce(last_message_at, updated_at), first_message
         from whatsapp_contacts where source = 'webhook' and ${inRange('coalesce(first_message_at, created_at)', 1, 2)}
     ) l order by created_at desc limit 10000`,
    [range.from, range.to]
  )
  const label = { ...SOURCES, expo: 'Expo QR', whatsapp_chat: 'WhatsApp chat' }
  return rows.map((r) => ({ ...r, sourceLabel: label[r.source] || r.source }))
}

/**
 * Ad campaigns → All-in-one report (Nov 2026): for each channel (Meta ads, Google Ads, Google search, WhatsApp,
 * Direct, Other) in the period — revenue, paid orders, average order value, website visits, and the leads funnel:
 * new leads (contest sign-ups, WhatsApp chats, expo QR; one per mobile per channel), how many converted (a paid
 * order on that mobile after they became a lead), the revenue from them, and the conversion rate.
 */
export const CHANNEL_ORDER = ['meta', 'google_ads', 'google_shopping', 'google_search', 'whatsapp', 'direct', 'other']
export const CHANNEL_LABEL = { meta: 'Meta ads', google_ads: 'Google Ads', google_shopping: 'Google Shopping', google_search: 'Google search', whatsapp: 'WhatsApp', direct: 'Direct', other: 'Other' }
export function channelKey(source, campaign = '') {
  const s = String(source || 'direct')
  // A link whose placeholders were never filled in ({{campaign.name}}, <campaign-name>…) is a test or broken link,
  // not an ad: Other, as on the Ad campaigns page.
  if (/\{\{|<(campaign|ad)[-_ ]?(name|id)>/i.test(String(campaign || ''))) return 'other'
  // A facebook / instagram link that carries a campaign (its ID or its name) is a Meta ad, as in the Meta ads panel.
  if (s.startsWith('meta_ads') || ((s === 'facebook' || s === 'instagram') && String(campaign || '').trim() !== '')) return 'meta'
  if (s === 'google_ads') return 'google_ads'
  if (s === 'google_shopping') return 'google_shopping'
  if (s === 'google_search') return 'google_search'
  if (s === 'whatsapp' || s === 'whatsapp_chat') return 'whatsapp'
  if (s === 'direct') return 'direct'
  return 'other'
}

export async function channelReport(db, { days, from, to } = {}) {
  const range = reportRange({ days, from, to })
  const sales = await sourcesReport(db, range)
  const leads = await contestLeads(db, range)
  const col = () => ({ revenue: 0, orders: 0, visits: 0, leads: 0, converted: 0, convertedRevenue: 0 })
  const by = Object.fromEntries(CHANNEL_ORDER.map((k) => [k, col()]))
  for (const r of sales.campaigns) {
    const c = by[channelKey(r.source, r.campaign)]
    c.revenue += r.revenue || 0
    c.orders += r.orders || 0
    c.visits += r.visits || 0
  }
  // One lead per mobile per channel, from when they first came in that channel.
  const first = new Map()
  for (const l of leads) {
    const m = String(l.phone || '').replace(/\D/g, '').slice(-10)
    if (m.length < 10) continue
    const k = channelKey(l.source, l.campaign) + '|' + m
    const at = new Date(l.created_at)
    if (!first.has(k) || at < first.get(k).at) first.set(k, { channel: k.split('|')[0], mobile: m, at })
  }
  const mobiles = [...new Set([...first.values()].map((v) => v.mobile))]
  const { rows: paid } = mobiles.length ? await db.query(
    `select right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10) as m, created_at, total_paise from orders
      where payment_status = any($1) and right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10) = any($2)`,
    [PAID_STATUSES, mobiles]) : { rows: [] }
  const ordersOf = new Map()
  for (const o of paid) (ordersOf.get(o.m) || ordersOf.set(o.m, []).get(o.m)).push(o)
  for (const v of first.values()) {
    const c = by[v.channel]
    c.leads += 1
    // Converted: paid after becoming a lead (10 minutes' grace for the same visit).
    const after = (ordersOf.get(v.mobile) || []).filter((o) => new Date(o.created_at) >= new Date(v.at.getTime() - 10 * 60000))
    if (after.length) { c.converted += 1; c.convertedRevenue += after.reduce((t, o) => t + Number(o.total_paise) / 100, 0) }
  }
  const round = (n) => Math.round(n * 100) / 100
  const columns = CHANNEL_ORDER.map((k) => {
    const c = by[k]
    return {
      key: k, label: CHANNEL_LABEL[k],
      revenue: round(c.revenue), orders: c.orders, visits: c.visits,
      leads: c.leads, converted: c.converted, convertedRevenue: round(c.convertedRevenue), notConverted: c.leads - c.converted,
      conversion: c.leads ? Math.round((c.converted / c.leads) * 1000) / 10 : null,
      aov: c.orders ? Math.round(c.revenue / c.orders) : null,
    }
  })
  const sum = (f) => columns.reduce((t, c) => t + (c[f] || 0), 0)
  const total = {
    key: 'total', label: 'Total', revenue: round(sum('revenue')), orders: sum('orders'), visits: sum('visits'),
    leads: sum('leads'), converted: sum('converted'), convertedRevenue: round(sum('convertedRevenue')), notConverted: sum('notConverted'),
  }
  total.conversion = total.leads ? Math.round((total.converted / total.leads) * 1000) / 10 : null
  total.aov = total.orders ? Math.round(total.revenue / total.orders) : null
  // Meta's own count for the same dates (Ads Manager's "Website purchases", its attribution: clicks and views,
  // any device), next to ours. Needs META_ADS_TOKEN; a Meta error never breaks the report.
  let meta = { connected: false }
  try {
    const { metaAdsReport } = await import('./meta-ads.js')
    const r = await metaAdsReport(range, { query: db.query.bind(db) })
    if (r.connected) meta = { connected: true, purchases: r.totals.purchases, purchaseValue: round((r.campaigns || []).reduce((t, c) => t + (c.purchaseValue || 0), 0)), spend: r.totals.spend }
  } catch (err) {
    meta = { connected: true, error: 'Could not read Meta just now.' }
  }
  return { ...range, columns, total, meta }
}
