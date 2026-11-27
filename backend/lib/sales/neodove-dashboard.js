// The NeoDove dashboard (/admin → NeoDove; owner, IT team and the Performance (Analyst) login, perm analyst.view).
// Owner, 27 Nov 2026: what goes into NeoDove from Sales Daddy and from our own database, kept apart, and how
// those leads perform once there.
//
//   From Sales Daddy   Meta Instant Form leads: Sales Daddy receives them from Meta, the website copies them every
//                      10 minutes (lead-forms.js → lead_forms) and queues them for NeoDove's Meta campaign.
//   From our database  everything else the website queues for NeoDove (neodove_outbox): website sign-ups from ads
//                      and WhatsApp, checkouts not paid, bulk and contact enquiries, Spin & Win, referrals.
//
// A lead counts as "pushed" when NeoDove accepted it (outbox status sent). One lead per customer: a mobile NeoDove
// already has is not pushed again ("already in NeoDove"). Calls come from NeoDove's webhook (neodove_events, the
// "dispose" calls), results from lead_status, and a conversion is a paid order (same mobile) after the push.
// Counts only: no names or numbers leave the server. Periods are India dates.
import { query } from '../db.js'
import { leadType, routeOf, ROUTE_NAMES } from '../neodove.js'
import { analystPeriod } from './analyst.js'

const IST = 330 * 60000
const key10 = (col) => `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`
const WON = `o.placed_at is not null and o.payment_status in ('paid', 'partially_refunded') and o.status not in ('cancelled', 'returned')`
const DISPOSE = `coalesce(e.payload->>'event_name', '') ilike '%dispose%'`
// "not sent again: already in NeoDove" (neodove.js): marked sent, but NeoDove already had the customer.
const ALREADY = `coalesce(n.last_error, '') ilike 'not sent again%'`
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const rupees = (paise) => Math.round(Number(paise || 0)) / 100
const istDay = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10)
const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10
}

/** The NeoDove campaign a lead went to: the source campaign (source mode) or, before that, the telecaller's. */
function campaignName(agent, campaign, source) {
  if (agent && ROUTE_NAMES[agent]) return ROUTE_NAMES[agent]
  if (agent) return agent.charAt(0).toUpperCase() + agent.slice(1)
  return ROUTE_NAMES[routeOf(campaign, source)] || 'Other'
}

/** One period's NeoDove picture: input by origin, performance by origin / campaign / caller / lead type, the trend, health. */
export async function neodoveDashboard(q = {}, db = { query }) {
  const p = analystPeriod(q)
  const args = [p.fromTs, p.toTs]

  const [inputRows, sdRows, perfRows, callDays, health] = await Promise.all([
    // Every lead queued for NeoDove in the period (one row each), with where it came from.
    db.query(
      `select n.campaign, n.agent, n.status, ${ALREADY} as already, n.created_at, s.source,
              (n.campaign = 'signup' and s.source = 'lead_form') as from_sd
         from neodove_outbox n left join lead_status s on s.mobile = n.mobile
        where n.created_at >= $1 and n.created_at < $2`, args),
    // Sales Daddy input: each Meta form lead copied in the period (one per mobile) and what became of it.
    db.query(
      `with lf as (
         select distinct on (mobile) mobile, saved_at from lead_forms
          where saved_at >= $1 and saved_at < $2 order by mobile, saved_at)
       select lf.saved_at, n.status, n.created_at as queued_at, ${ALREADY} as already, s.status as lead_status
         from lf
         left join lateral (select * from neodove_outbox n where n.mobile = lf.mobile order by n.created_at desc limit 1) n on true
         left join lead_status s on s.mobile = lf.mobile`, args),
    // Performance: every lead NeoDove accepted from a push in the period, with its calls, result and orders.
    db.query(
      `with pushed as (
         select n.id, n.mobile, n.campaign, n.agent, n.created_at, coalesce(n.sent_at, n.created_at) as sent_at, s.source,
                s.status as lead_status, s.last_agent, (n.campaign = 'signup' and s.source = 'lead_form') as from_sd
           from neodove_outbox n left join lead_status s on s.mobile = n.mobile
          where n.created_at >= $1 and n.created_at < $2 and n.status = 'sent' and not ${ALREADY}),
       calls as (
         select ${key10("e.payload->>'mobile'")} as m, min(e.received_at) as first_at, count(*)::int as calls,
                (array_agg(nullif(e.payload->>'agent_name', '') order by e.received_at desc))[1] as caller
           from neodove_events e
          where ${DISPOSE} and e.received_at >= $1
          group by 1),
       won as (
         select ${key10('o.contact_phone')} as m, o.placed_at, o.total_paise
           from orders o
          where ${WON} and o.placed_at >= $1)
       -- Orders placed after the push count (an earlier order does not make the push a conversion).
       select p.campaign, p.agent, p.source, p.from_sd, p.lead_status,
              coalesce(c.caller, p.last_agent) as caller,
              c.calls, extract(epoch from (c.first_at - p.sent_at)) / 3600 as hours_to_call,
              count(w.m) > 0 as converted, coalesce(sum(w.total_paise), 0)::bigint as paise
         from pushed p
         left join calls c on c.m = p.mobile and c.first_at >= p.created_at
         left join won w on w.m = p.mobile and w.placed_at >= p.created_at
        group by p.id, p.campaign, p.agent, p.source, p.from_sd, p.lead_status, p.last_agent, p.sent_at, c.caller, c.calls, c.first_at`, args),
    // People called per day (one per mobile per day), for the trend.
    db.query(
      `select (e.received_at at time zone 'Asia/Kolkata')::date::text as day,
              count(distinct ${key10("e.payload->>'mobile'")})::int as called
         from neodove_events e
        where ${DISPOSE} and e.received_at >= $1 and e.received_at < $2
        group by 1`, args),
    // Right now: what is waiting or failed, the last push, the last Sales Daddy copy and the last NeoDove call.
    db.query(
      `select
         (select count(*)::int from neodove_outbox where status = 'queued') as queued,
         (select min(created_at) from neodove_outbox where status = 'queued') as oldest_queued,
         (select count(*)::int from neodove_outbox where status = 'failed') as failed,
         (select max(sent_at) from neodove_outbox where status = 'sent') as last_push,
         (select ran_at from lead_forms_sync where id = 1) as last_sd_copy,
         (select max(received_at) from neodove_events) as last_call,
         (select coalesce(json_agg(x), '[]') from (
            select left(coalesce(last_error, 'no reason given'), 90) as reason, count(*)::int as leads
              from neodove_outbox where status in ('queued', 'failed') and last_error is not null
             group by 1 order by 2 desc limit 6) x) as problems`),
  ])

  // ---- input
  const blank = () => ({ queued: 0, pushed: 0, already: 0, waiting: 0, failed: 0 })
  const input = { salesdaddy: { received: sdRows.rows.length, ...blank(), notQueued: 0, buyers: 0 }, website: { ...blank(), byType: {} } }
  for (const r of sdRows.rows) {
    const t = input.salesdaddy
    if (!r.status) { t.notQueued++; if (r.lead_status === 'converted') t.buyers++; continue }
    // Queued before this form lead arrived: the customer was already in NeoDove from an earlier lead.
    if (r.already || new Date(r.queued_at) < new Date(r.saved_at) - 5 * 60000) t.already++
    else if (r.status === 'sent') t.pushed++
    else if (r.status === 'queued') t.waiting++
    else t.failed++
  }
  input.salesdaddy.queued = input.salesdaddy.pushed + input.salesdaddy.waiting + input.salesdaddy.failed
  for (const r of inputRows.rows) {
    if (r.from_sd) continue
    const t = input.website
    const type = leadType(r.campaign, r.source)
    const bt = (t.byType[type] ||= blank())
    for (const x of [t, bt]) {
      x.queued++
      if (r.already) x.already++
      else if (r.status === 'sent') x.pushed++
      else if (r.status === 'queued') x.waiting++
      else x.failed++
    }
  }
  input.website.byType = Object.entries(input.website.byType).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.queued - a.queued)

  // ---- performance
  const acc = () => ({ pushed: 0, called: 0, qualified: 0, notQualified: 0, converted: 0, paise: 0, hours: [] })
  const add = (a, r) => {
    a.pushed++
    if (r.calls) { a.called++; if (r.hours_to_call != null && r.hours_to_call >= 0) a.hours.push(Number(r.hours_to_call)) }
    if (r.lead_status === 'qualified') a.qualified++
    if (r.lead_status === 'not_qualified') a.notQualified++
    if (r.converted) { a.converted++; a.paise += Number(r.paise || 0) }
  }
  const done = (a) => ({
    pushed: a.pushed, called: a.called, notCalled: a.pushed - a.called, qualified: a.qualified, notQualified: a.notQualified,
    converted: a.converted, revenue: rupees(a.paise), callRate: pct(a.called, a.pushed), qualifiedRate: pct(a.qualified, a.called),
    conversionRate: pct(a.converted, a.pushed), medianHoursToCall: median(a.hours),
  })
  const byOrigin = { all: acc(), salesdaddy: acc(), website: acc() }
  const groups = { campaign: {}, caller: {}, type: {} }
  for (const r of perfRows.rows) {
    const origin = r.from_sd ? 'salesdaddy' : 'website'
    add(byOrigin.all, r); add(byOrigin[origin], r)
    const keys = {
      campaign: campaignName(r.agent, r.campaign, r.source),
      caller: r.calls ? (r.caller || 'Unknown') : 'Not called yet',
      type: r.from_sd ? 'Meta lead form (Sales Daddy)' : leadType(r.campaign, r.source),
    }
    for (const [g, k] of Object.entries(keys)) {
      const slot = (groups[g][k] ||= { all: acc(), salesdaddy: acc(), website: acc() })
      add(slot.all, r); add(slot[origin], r)
    }
  }
  const table = (g) => Object.entries(groups[g]).map(([name, v]) => ({ name, all: done(v.all), salesdaddy: done(v.salesdaddy), website: done(v.website) }))
    .sort((a, b) => b.all.pushed - a.all.pushed)

  // ---- trend (every day of the period, oldest first)
  const days = {}
  for (let t = p.fromTs.getTime(); t < p.toTs.getTime(); t += 86400000) days[istDay(t)] = { day: istDay(t), sdReceived: 0, sdPushed: 0, webQueued: 0, webPushed: 0, called: 0 }
  for (const r of sdRows.rows) { const d = days[istDay(r.saved_at)]; if (d) d.sdReceived++ }
  for (const r of inputRows.rows) {
    const d = days[istDay(r.created_at)]; if (!d) continue
    const pushed = r.status === 'sent' && !r.already
    if (r.from_sd) { if (pushed) d.sdPushed++ } else { d.webQueued++; if (pushed) d.webPushed++ }
  }
  for (const r of callDays.rows) if (days[r.day]) days[r.day].called = r.called

  const h = health.rows[0]
  return {
    period: { from: p.from, to: p.to, days: p.days },
    input,
    performance: { salesdaddy: done(byOrigin.salesdaddy), website: done(byOrigin.website), all: done(byOrigin.all) },
    byCampaign: table('campaign'),
    byCaller: table('caller'),
    byType: table('type'),
    trend: Object.values(days),
    health: {
      queued: h.queued, failed: h.failed, oldestQueuedMinutes: h.oldest_queued ? Math.round((Date.now() - new Date(h.oldest_queued)) / 60000) : null,
      lastPush: h.last_push, lastSalesDaddyCopy: h.last_sd_copy, lastCall: h.last_call, problems: h.problems || [],
    },
  }
}
