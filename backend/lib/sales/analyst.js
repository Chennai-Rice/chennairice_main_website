// The Analyst page (/warehouse → Analyst; owner and IT team): the KPIs of
// "Sales Dashboard KPIs" (Oct 2026), worked out from the website's own records:
//   sales      paid orders (Won = paid, not cancelled or returned), their items,
//              kg and products; split Raw / Idli / Boiled by products.rice_type
//   leads      website sign-ups (contest_leads), expo QR leads (Events), new
//              WhatsApp chats, and NeoDove call results (lead_status, neodove_events)
//   campaigns  ad spend entered by hand (ad_spend) against leads and orders
//              carrying the same campaign / ad name
//   delivery   delivery times, orders waiting for dispatch, sales by city
// Every period is in India time. Money is returned in rupees.
import { query } from '../db.js'
import { httpError, str } from './util.js'
import { audit } from './staff.js'

export const RICE_TYPES = ['raw', 'idli', 'boiled']
const TARGET_KEY = 'analyst_monthly_kg_target'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const IST = 330 * 60000

const istToday = () => new Date(Date.now() + IST).toISOString().slice(0, 10)
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const start = (day) => new Date(Date.parse(day + 'T00:00:00Z') - IST)
const rupees = (paise) => Math.round(Number(paise || 0)) / 100
const num = (v) => Number(v || 0)
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)

/** The period asked for: { from, to } as India dates (inclusive), this month by default. */
export function analystPeriod({ from, to } = {}) {
  const today = istToday()
  let f = DAY.test(from || '') ? from : today.slice(0, 8) + '01'
  let t = DAY.test(to || '') ? to : today
  if (f > t) [f, t] = [t, f]
  const days = Math.round((Date.parse(t) - Date.parse(f)) / 86400000) + 1
  if (days > 400) throw httpError('Period too long', { status: 400, publicMessage: 'Choose a period of up to 400 days.' })
  return { from: f, to: t, days, fromTs: start(f), toTs: start(addDays(t, 1)) }
}

// A paid order that stands: what the KPI sheet calls a Won order.
const WON = `o.placed_at is not null and o.payment_status in ('paid', 'partially_refunded') and o.status not in ('cancelled', 'returned')`
// Mobile numbers compared on their last 10 digits (stored as +91 98xxx…, 98xxx…, 9198xxx…).
const key10 = (col) => `right(regexp_replace(${col}, '\\D', '', 'g'), 10)`
// Website sign-up sources, grouped the way the KPI sheet splits them.
const BUCKET = `case
    when c.source in ('meta_ads_facebook', 'facebook') then 'Facebook'
    when c.source in ('meta_ads_instagram', 'instagram', 'meta_ads') then 'Instagram'
    when c.source = 'whatsapp' then 'WhatsApp'
    when c.source = 'expo' then 'Events'
    else 'Website' end`

/** Sales for a period: totals, and per rice type / product / day / source when `detail`. */
async function sales(p, rice, detail = true) {
  const args = [p.fromTs, p.toTs, rice || null]
  // Items of Won orders in the period (only the chosen rice type when one is chosen).
  const items = `
    from orders o
    join order_items i on i.order_id = o.id
    join product_variants v on v.id = i.variant_id
    join products pr on pr.id = v.product_id
   where ${WON} and o.placed_at >= $1 and o.placed_at < $2 and ($3::text is null or pr.rice_type = $3)`
  const totals = (await query(
    `select count(distinct o.id)::int as orders,
            count(distinct o.customer_id)::int as customers,
            coalesce(sum(i.pack_kg * i.quantity), 0)::float as kg,
            coalesce(sum(i.line_total_paise), 0)::bigint as item_paise,
            (select coalesce(sum(o2.total_paise), 0) from orders o2 where o2.id in (select distinct o.id ${items}))::bigint as order_paise
       ${items}`, args)).rows[0]
  // Whole orders (with delivery) when no rice type is chosen; item value when one is.
  const revenue = rupees(rice ? totals.item_paise : totals.order_paise)
  const out = {
    revenue, orders: totals.orders, kg: Math.round(totals.kg * 10) / 10, customers: totals.customers,
    aov: totals.orders ? Math.round((revenue / totals.orders) * 100) / 100 : null,
    revenuePerDay: Math.round((revenue / p.days) * 100) / 100,
    ordersPerDay: Math.round((totals.orders / p.days) * 100) / 100,
  }
  if (!detail) return out

  const [byRice, byProduct, perDay, bySource] = await Promise.all([
    query(`select pr.rice_type as "riceType", count(distinct o.id)::int as orders,
                  sum(i.line_total_paise)::bigint as paise, sum(i.pack_kg * i.quantity)::float as kg
             ${items} group by 1 order by paise desc`, args),
    query(`select pr.slug, pr.name, pr.rice_type as "riceType", count(distinct o.id)::int as orders,
                  sum(i.quantity)::int as packs, sum(i.pack_kg * i.quantity)::float as kg, sum(i.line_total_paise)::bigint as paise
             ${items} group by 1, 2, 3 order by paise desc`, args),
    query(`select (o.placed_at at time zone 'Asia/Kolkata')::date::text as day, count(distinct o.id)::int as orders,
                  sum(i.line_total_paise)::bigint as paise, sum(i.pack_kg * i.quantity)::float as kg
             ${items} group by 1 order by 1`, args),
    query(`select coalesce(nullif(o.traffic_source, ''), 'direct') as source, count(*)::int as orders, sum(o.total_paise)::bigint as paise
             from orders o where o.id in (select distinct o.id ${items}) group by 1 order by paise desc`, args),
  ])
  const itemTotal = byProduct.rows.reduce((s, r) => s + num(r.paise), 0) || 1
  out.byRice = RICE_TYPES.map((t) => {
    const r = byRice.rows.find((x) => x.riceType === t)
    return { riceType: t, orders: r?.orders || 0, revenue: rupees(r?.paise), kg: Math.round(num(r?.kg) * 10) / 10 }
  })
  out.byProduct = byProduct.rows.map((r) => ({
    slug: r.slug, name: r.name, riceType: r.riceType, orders: r.orders, packs: r.packs,
    kg: Math.round(num(r.kg) * 10) / 10, revenue: rupees(r.paise), share: pct(num(r.paise), itemTotal),
  }))
  const byDay = new Map(perDay.rows.map((r) => [r.day, r]))
  out.perDay = Array.from({ length: Math.min(p.days, 400) }, (_, i) => {
    const day = addDays(p.from, i)
    const r = byDay.get(day)
    return { day, orders: r?.orders || 0, revenue: rupees(r?.paise), kg: Math.round(num(r?.kg) * 10) / 10 }
  })
  out.bySource = bySource.rows.map((r) => ({ source: r.source, orders: r.orders, revenue: rupees(r.paise), aov: r.orders ? rupees(num(r.paise) / r.orders) : null }))
  out.repeat = await repeatCustomers(items, args)
  return out
}

/** Of the customers who bought in the period, how many have 2 or more Won orders in all. */
async function repeatCustomers(items, args) {
  const { rows: [r] } = await query(
    `select count(*)::int as customers,
            count(*) filter (where (select count(*) from orders o where o.customer_id = c.customer_id and ${WON}) >= 2)::int as repeat
       from (select distinct o.customer_id ${items}) c`, args)
  return { customers: r.customers, repeat: r.repeat, percent: pct(r.repeat, r.customers) }
}

/** Leads in the period: website sign-ups by source, expo QR leads, new WhatsApp chats. */
async function newLeads(p) {
  const [signups, expo, whatsapp] = await Promise.all([
    query(`select ${BUCKET} as bucket, count(*)::int as n from contest_leads c
            where c.created_at >= $1 and c.created_at < $2 group by 1`, [p.fromTs, p.toTs]),
    query(`select count(*)::int as n from expo_leads where created_at >= $1 and created_at < $2`, [p.fromTs, p.toTs]),
    query(`select count(*)::int as n from whatsapp_contacts
            where source = 'webhook' and coalesce(first_message_at, created_at) >= $1 and coalesce(first_message_at, created_at) < $2`, [p.fromTs, p.toTs]),
  ])
  const bySource = { Facebook: 0, Instagram: 0, WhatsApp: 0, Website: 0, Events: 0 }
  for (const r of signups.rows) bySource[r.bucket] += r.n
  bySource.Events += expo.rows[0].n
  const chats = whatsapp.rows[0].n
  const total = Object.values(bySource).reduce((a, b) => a + b, 0) + chats
  return { total, bySource, whatsappChats: chats }
}

/** Website sign-ups and expo leads of the period, each with how far it got. */
async function leadJourneys(p) {
  const { rows } = await query(
    `with leads as (
       select c.created_at, ${key10('c.phone')} as m, ${BUCKET} as bucket from contest_leads c
        where c.created_at >= $1 and c.created_at < $2
       union all
       select e.created_at, ${key10('e.phone')}, 'Events' from expo_leads e
        where e.created_at >= $1 and e.created_at < $2)
     select l.bucket, l.created_at,
            coalesce(s.calls, 0) > 0 as called,
            s.status = 'qualified' as qualified,
            exists (select 1 from orders o where ${key10('o.contact_phone')} = l.m and o.created_at >= l.created_at - interval '1 day') as checkout,
            (select min(o.placed_at) from orders o where ${key10('o.contact_phone')} = l.m and ${WON} and o.placed_at >= l.created_at - interval '1 day') as won_at
       from leads l left join lead_status s on s.mobile = l.m`, [p.fromTs, p.toTs])
  const buckets = ['Facebook', 'Instagram', 'WhatsApp', 'Website', 'Events']
  const bySource = buckets.map((b) => {
    const mine = rows.filter((r) => r.bucket === b)
    const won = mine.filter((r) => r.won_at)
    const days = won.map((r) => Math.max(0, (new Date(r.won_at) - new Date(r.created_at)) / 86400000))
    return {
      source: b, leads: mine.length, won: won.length, conversion: pct(won.length, mine.length),
      daysToConvert: days.length ? Math.round((days.reduce((a, c) => a + c, 0) / days.length) * 10) / 10 : null,
    }
  })
  const won = rows.filter((r) => r.won_at)
  const funnel = [
    { stage: 'New lead', n: rows.length },
    { stage: 'Contacted (called)', n: rows.filter((r) => r.called || r.qualified || r.won_at).length },
    { stage: 'Interested (qualified)', n: rows.filter((r) => r.qualified || r.won_at).length },
    { stage: 'Checkout started', n: rows.filter((r) => r.checkout || r.won_at).length },
    { stage: 'Won (paid order)', n: won.length },
  ]
  const allDays = won.map((r) => Math.max(0, (new Date(r.won_at) - new Date(r.created_at)) / 86400000))
  return {
    bySource, funnel,
    daysToConvert: allDays.length ? Math.round((allDays.reduce((a, c) => a + c, 0) / allDays.length) * 10) / 10 : null,
  }
}

/** NeoDove: people called in the period, by caller. */
async function contacted(p) {
  const { rows } = await query(
    `select coalesce(nullif(payload->>'agent_name', ''), 'Unknown') as caller,
            count(distinct payload->>'mobile')::int as leads, count(*)::int as calls
       from neodove_events
      where received_at >= $1 and received_at < $2 and coalesce(payload->>'event_name', '') ilike '%dispose%'
      group by 1 order by leads desc`, [p.fromTs, p.toTs])
  return { total: rows.reduce((a, r) => a + r.leads, 0), byCaller: rows }
}

/**
 * Follow-ups whose date has passed with no newer call: the latest NeoDove call
 * per mobile carries the follow-up date; buyers are left out. Now, not per period.
 */
async function overdueFollowUps() {
  const { rows } = await query(
    `select * from (
       select distinct on (payload->>'mobile') payload->>'mobile' as mobile,
              nullif(payload->>'name', 'N/A') as name,
              coalesce(nullif(payload->>'agent_name', ''), 'Unknown') as caller,
              nullif(payload->>'lead_stage_name', '') as result,
              nullif(payload->>'dispose_remarks', '') as remark,
              case when payload->>'follow_up_date' ~ '^\\d{10,13}$'
                   then to_timestamp((payload->>'follow_up_date')::bigint / case when length(payload->>'follow_up_date') > 10 then 1000.0 else 1 end)
              end as due
         from neodove_events
        where coalesce(payload->>'event_name', '') ilike '%dispose%' and payload->>'mobile' is not null
        order by payload->>'mobile', received_at desc) last
      where due is not null and due < now()
        and not exists (select 1 from lead_status s where s.mobile = right(regexp_replace(last.mobile, '\\D', '', 'g'), 10) and s.status = 'converted')
      order by due`).catch(() => ({ rows: [] }))
  const byCaller = {}
  for (const r of rows) byCaller[r.caller] = (byCaller[r.caller] || 0) + 1
  return {
    total: rows.length,
    byCaller: Object.entries(byCaller).map(([caller, n]) => ({ caller, n })).sort((a, b) => b.n - a.n),
    list: rows.slice(0, 50).map((r) => ({ ...r, due: r.due?.toISOString?.() || r.due })),
  }
}

/** Why leads were lost (NeoDove "not qualified" results) and why orders were cancelled. */
async function lostReasons(p) {
  const [calls, orders] = await Promise.all([
    query(`select coalesce(nullif(last_disposition, ''), 'No reason given') as reason, count(*)::int as n
             from lead_status where status = 'not_qualified' and last_called_at >= $1 and last_called_at < $2
            group by 1 order by n desc limit 15`, [p.fromTs, p.toTs]),
    query(`select coalesce(nullif(cancel_reason, ''), 'No reason given') as reason, count(*)::int as n
             from orders where status = 'cancelled' and placed_at is not null and cancelled_at >= $1 and cancelled_at < $2
            group by 1 order by n desc limit 15`, [p.fromTs, p.toTs]),
  ])
  return { leads: calls.rows, orders: orders.rows }
}

const norm = (s) => String(s || '').trim().toLowerCase()

/** Ad spend against the leads and Won orders carrying the same campaign / ad name. */
async function campaigns(p) {
  const [spend, leads, orders] = await Promise.all([
    query(`select campaign, ad, platform, sum(amount_paise)::bigint as paise from ad_spend
            where spent_on >= $1::date and spent_on <= $2::date group by 1, 2, 3`, [p.from, p.to]),
    query(`select campaign, ad, count(*)::int as n from contest_leads
            where created_at >= $1 and created_at < $2 and campaign <> '' group by 1, 2`, [p.fromTs, p.toTs]),
    query(`select coalesce(o.traffic_campaign, '') as campaign, coalesce(o.traffic_ad, '') as ad,
                  count(*)::int as n, sum(o.total_paise)::bigint as paise
             from orders o where ${WON} and o.placed_at >= $1 and o.placed_at < $2 and coalesce(o.traffic_campaign, '') <> ''
            group by 1, 2`, [p.fromTs, p.toTs]),
  ])
  const rollup = (level) => {
    const map = new Map()
    const get = (r) => {
      const k = level === 'campaign' ? norm(r.campaign) : norm(r.campaign) + '\u0000' + norm(r.ad)
      if (!map.has(k)) map.set(k, { campaign: r.campaign, ad: level === 'ad' ? r.ad : undefined, platform: r.platform || null, spend: 0, leads: 0, orders: 0, revenue: 0 })
      return map.get(k)
    }
    for (const r of spend.rows) { if (level === 'ad' && !r.ad) continue; const x = get(r); x.spend += rupees(r.paise); x.platform = x.platform || r.platform }
    for (const r of leads.rows) { if (level === 'ad' && !r.ad) continue; get(r).leads += r.n }
    for (const r of orders.rows) { if (level === 'ad' && !r.ad) continue; const x = get(r); x.orders += r.n; x.revenue += rupees(r.paise) }
    return [...map.values()].map((x) => ({
      ...x,
      spend: Math.round(x.spend * 100) / 100, revenue: Math.round(x.revenue * 100) / 100,
      costPerLead: x.spend && x.leads ? Math.round((x.spend / x.leads) * 100) / 100 : null,
      costPerOrder: x.spend && x.orders ? Math.round((x.spend / x.orders) * 100) / 100 : null,
      roas: x.spend ? Math.round((x.revenue / x.spend) * 100) / 100 : null,
    })).sort((a, b) => b.spend - a.spend || b.leads - a.leads)
  }
  const byCampaign = rollup('campaign')
  const ads = rollup('ad').filter((a) => a.spend > 0)
  const ranked = ads.slice().sort((a, b) => (a.costPerOrder ?? Infinity) - (b.costPerOrder ?? Infinity) || b.spend - a.spend)
  const totalSpend = byCampaign.reduce((s, c) => s + c.spend, 0)
  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    byCampaign,
    bestAds: ranked.filter((a) => a.costPerOrder != null).slice(0, 3),
    worstAds: ranked.slice().reverse().slice(0, 3),
  }
}

/** Delivery speed, orders waiting for dispatch (now), and sales by city / state. */
async function delivery(p) {
  const [byState, byCourier, pending, byCity] = await Promise.all([
    query(`select o.ship_state as state, count(*)::int as orders,
                  round(avg(extract(epoch from (o.delivered_at - o.placed_at)) / 86400)::numeric, 1)::float as days
             from orders o where o.delivered_at >= $1 and o.delivered_at < $2 and o.placed_at is not null
            group by 1 order by orders desc`, [p.fromTs, p.toTs]),
    query(`select coalesce(nullif(s.carrier_name, ''), s.method) as courier, count(*)::int as orders,
                  round(avg(extract(epoch from (o.delivered_at - o.placed_at)) / 86400)::numeric, 1)::float as days
             from orders o
             join lateral (select carrier_name, method from shipments s where s.order_id = o.id order by s.created_at desc limit 1) s on true
            where o.delivered_at >= $1 and o.delivered_at < $2 and o.placed_at is not null
            group by 1 order by orders desc`, [p.fromTs, p.toTs]),
    query(`select o.order_number as "order", o.contact_name as customer, o.status, o.placed_at as "placedAt",
                  coalesce(o.shipping_address->>'city', '') as city
             from orders o where o.status in ('placed', 'confirmed', 'packed') and o.payment_status in ('paid', 'partially_refunded')
            order by o.placed_at`),
    query(`select initcap(coalesce(nullif(trim(o.shipping_address->>'city'), ''), 'Unknown')) as city, o.ship_state as state,
                  count(*)::int as orders, sum(o.total_paise)::bigint as paise
             from orders o where ${WON} and o.placed_at >= $1 and o.placed_at < $2
            group by 1, 2 order by paise desc limit 40`, [p.fromTs, p.toTs]),
  ])
  const all = byState.rows.reduce((a, r) => ({ n: a.n + r.orders, d: a.d + r.days * r.orders }), { n: 0, d: 0 })
  return {
    avgDeliveryDays: all.n ? Math.round((all.d / all.n) * 10) / 10 : null,
    byState: byState.rows, byCourier: byCourier.rows,
    pendingDispatch: { total: pending.rows.length, oldest: pending.rows.slice(0, 15) },
    byCity: byCity.rows.map((r) => ({ city: r.city, state: r.state, orders: r.orders, revenue: rupees(r.paise) })),
  }
}

/** Expo QR leads by the location they gave (website sign-ups do not ask for a city yet). */
async function leadsByLocation(p) {
  const { rows } = await query(
    `select initcap(trim(e.location)) as location, count(*)::int as leads,
            count(*) filter (where not exists (select 1 from orders o where ${key10('o.contact_phone')} = ${key10('e.phone')} and ${WON}))::int as open
       from expo_leads e where e.created_at >= $1 and e.created_at < $2
      group by 1 order by leads desc limit 30`, [p.fromTs, p.toTs])
  return rows
}

async function monthlyTarget() {
  const { rows: [r] } = await query('select value from company_settings where key = $1', [TARGET_KEY])
  const v = Number(r?.value)
  return Number.isFinite(v) && v > 0 ? v : null
}

/** The 8 numbers for the CEO / MD: yesterday and month to date. */
async function ceoNumbers(overdue, pendingDispatch) {
  const today = istToday()
  const yesterday = addDays(today, -1)
  const one = async (from, to) => {
    const p = analystPeriod({ from, to })
    const [s, l, spend] = await Promise.all([
      sales(p, null, false), newLeads(p),
      query(`select coalesce(sum(amount_paise), 0)::bigint as paise from ad_spend where spent_on >= $1::date and spent_on <= $2::date`, [p.from, p.to]),
    ])
    const spent = rupees(spend.rows[0].paise)
    return {
      revenue: s.revenue, orders: s.orders, kg: s.kg, newLeads: l.total,
      conversion: pct(s.orders, l.total), costPerOrder: spent && s.orders ? Math.round((spent / s.orders) * 100) / 100 : null, adSpend: spent,
    }
  }
  const [y, mtd, target] = await Promise.all([one(yesterday, yesterday), one(today.slice(0, 8) + '01', today), monthlyTarget()])
  return { yesterday: { day: yesterday, ...y }, monthToDate: { from: today.slice(0, 8) + '01', to: today, ...mtd }, target, overdueFollowUps: overdue, pendingDispatch }
}

/** Everything on the Analyst page for one period (and rice type, for the sales KPIs). */
export async function analystReport(q = {}) {
  const p = analystPeriod(q)
  const rice = RICE_TYPES.includes(q.rice) ? q.rice : null
  const [s, leads, journeys, called, overdue, lost, camp, del, byLocation, target] = await Promise.all([
    sales(p, rice), newLeads(p), leadJourneys(p), contacted(p), overdueFollowUps(), lostReasons(p),
    campaigns(p), delivery(p), leadsByLocation(p), monthlyTarget(),
  ])
  // Kg against the monthly target: this month so far, whatever period is shown.
  const today = istToday()
  const month = await sales(analystPeriod({ from: today.slice(0, 8) + '01', to: today }), rice, false)
  // The same number of days just before, for the "↑ 7% vs previous period" badges.
  const prev = analystPeriod({ from: addDays(p.from, -p.days), to: addDays(p.from, -1) })
  const [ps, pl] = await Promise.all([sales(prev, rice, false), newLeads(prev)])
  const change = (now, before) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null)
  return {
    period: { from: p.from, to: p.to, days: p.days }, rice,
    previous: {
      from: prev.from, to: prev.to,
      revenue: change(s.revenue, ps.revenue), orders: change(s.orders, ps.orders), kg: change(s.kg, ps.kg),
      aov: change(s.aov || 0, ps.aov || 0), newLeads: change(leads.total, pl.total),
    },
    sales: s,
    target: { kgPerMonth: target, kgThisMonth: month.kg, percent: target ? pct(month.kg, target) : null },
    leads: {
      newLeads: leads, contacted: called,
      conversion: pct(s.orders, leads.total),
      bySource: journeys.bySource, funnel: journeys.funnel, daysToConvert: journeys.daysToConvert,
      overdue, lost, byLocation,
    },
    campaigns: camp,
    delivery: del,
    ceo: await ceoNumbers(overdue.total, del.pendingDispatch.total),
  }
}

/** The settings the Analyst page edits: rice type per product, the kg target, ad spend. */
export async function analystSettings({ from, to } = {}) {
  const p = analystPeriod({ from, to })
  const [products, target, spend] = await Promise.all([
    query(`select slug, name, rice_type as "riceType", is_active as active from products order by display_order, name`),
    monthlyTarget(),
    query(`select id, spent_on::text as "spentOn", platform, campaign, ad, amount_paise, note, created_by as "createdBy"
             from ad_spend where spent_on >= $1::date and spent_on <= $2::date order by spent_on desc, created_at desc`, [p.from, p.to]),
  ])
  return {
    products: products.rows, kgPerMonth: target,
    adSpend: spend.rows.map((r) => ({ ...r, amount: rupees(r.amount_paise), amount_paise: undefined })),
  }
}

export async function setRiceType(staff, slug, riceType) {
  if (!RICE_TYPES.includes(riceType)) throw httpError('Bad rice type', { status: 400, publicMessage: 'Rice type must be Raw, Idli or Boiled.' })
  const { rows: [r] } = await query('update products set rice_type = $2 where slug = $1 returning slug, name, rice_type as "riceType"', [str(slug), riceType])
  if (!r) throw httpError('No such product', { status: 404, publicMessage: 'That product was not found.' })
  await audit({ query }, staff, 'analyst.rice_type', 'product', r.slug, { riceType })
  return r
}

export async function setMonthlyTarget(staff, kg) {
  const v = Number(kg)
  if (!Number.isFinite(v) || v < 0 || v > 100000000) throw httpError('Bad target', { status: 400, publicMessage: 'Enter the monthly target in kg.' })
  await query(`insert into company_settings (key, value, updated_at) values ($1, $2, now())
               on conflict (key) do update set value = excluded.value, updated_at = now()`, [TARGET_KEY, String(v)])
  await audit({ query }, staff, 'analyst.target', 'setting', TARGET_KEY, { kg: v })
  return { kgPerMonth: v || null }
}

export async function addAdSpend(staff, body = {}) {
  const spentOn = DAY.test(body.spentOn || '') ? body.spentOn : null
  const campaign = str(body.campaign).slice(0, 200)
  const amount = Number(body.amount)
  if (!spentOn || !campaign || !(amount > 0) || amount > 100000000) {
    throw httpError('Bad ad spend', { status: 400, publicMessage: 'Enter the date, the campaign name and the amount spent.' })
  }
  const platform = ['meta', 'google', 'other'].includes(body.platform) ? body.platform : 'meta'
  const { rows: [r] } = await query(
    `insert into ad_spend (spent_on, platform, campaign, ad, amount_paise, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [spentOn, platform, campaign, str(body.ad).slice(0, 200), Math.round(amount * 100), str(body.note).slice(0, 300) || null, staff?.email || null])
  await audit({ query }, staff, 'analyst.ad_spend.add', 'ad_spend', r.id, { spentOn, platform, campaign, amount })
  return { id: r.id }
}

export async function deleteAdSpend(staff, id) {
  const { rows: [r] } = await query('delete from ad_spend where id = $1 returning campaign, amount_paise, spent_on::text as day', [str(id)])
  if (!r) throw httpError('No such entry', { status: 404, publicMessage: 'That ad spend entry was not found.' })
  await audit({ query }, staff, 'analyst.ad_spend.delete', 'ad_spend', id, { campaign: r.campaign, amount: rupees(r.amount_paise), day: r.day })
  return { ok: true }
}
