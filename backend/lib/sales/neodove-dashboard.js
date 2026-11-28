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

/**
 * Why leads are waiting or failed, in plain words, from what the sender wrote on each item (neodove.js). Right now, not
 * for the period: every queued or failed item, grouped by reason, with what it means and what clears it.
 */
function whyGroups(rows) {
  const groups = new Map()
  for (const r of rows) {
    const err = String(r.reason || '').trim()
    let m
    let g
    if (r.status === 'queued' && (m = err.match(/^waiting: already in (.+?); its "Endpoint \(Update only\)" link \((\w+)\) is not set/))) {
      g = { kind: 'update_link', route: m[1], key: m[2], inNeoDove: true,
        title: `Already in NeoDove (${m[1]} campaign): waiting for the update link`,
        why: `These customers are already a lead in NeoDove's ${m[1]} campaign, so the website does not create them a second time. It adds what they did since (a Meta form, Spin & Win, a checkout) to that lead, and NeoDove needs the "Endpoint (Update only)" link of the ${m[1]} campaign for that. That link is not set yet, so the addition waits and is tried again every 10 minutes.`,
        fix: `Add the "Endpoint (Update only)" link of the ${m[1]} campaign (NeoDove, Custom Integration) as the secret ${m[2]}. The waiting items then go out within about 10 minutes.` }
    } else if (r.status === 'queued' && (m = err.match(/^waiting: (.+?) campaign link not set/))) {
      g = { kind: 'campaign_link', route: m[1], inNeoDove: false,
        title: `${m[1]} campaign link not set`,
        why: `NeoDove has no link for the ${m[1]} campaign here yet, so these leads cannot be sent.`,
        fix: `Add the ${m[1]} campaign's endpoint link as its secret. The leads then go out within about 10 minutes.` }
    } else if (r.status === 'queued' && !err) {
      g = { kind: 'not_reached', inNeoDove: null,
        title: 'Not tried yet',
        why: 'Nothing has gone wrong with these: no attempt has been made and there is no error. The sender takes the oldest 20 leads on each run.',
        fix: 'If this number does not come down, ask the IT team to check the sender.' }
    } else if (r.status === 'queued') {
      g = { kind: 'retrying', reason: err, inNeoDove: null,
        title: 'NeoDove did not take it yet: trying again',
        why: `NeoDove's last answer was: ${err}. The website tries again after 1, 5, 15, 30, 60 minutes and so on, up to 8 times, and then marks it failed.`,
        fix: 'Usually clears by itself. If it stays, ask the IT team.' }
    } else if (/^converted before sending/.test(err)) {
      g = { kind: 'bought', inNeoDove: false,
        title: 'Not sent: the customer had already bought',
        why: 'The customer paid for an order before this lead was sent, so NeoDove does not need it as a new lead.', fix: 'Nothing to do.' }
    } else if (/^blocked/.test(err)) {
      g = { kind: 'blocked', inNeoDove: false, title: 'Not sent: our own number',
        why: 'The number belongs to the company (a test or staff number), so it is never sent to NeoDove.', fix: 'Nothing to do.' }
    } else {
      g = { kind: 'failed', reason: err, inNeoDove: null, title: 'NeoDove refused it',
        why: `NeoDove answered: ${err || 'no reason given'}. A refusal like this is not tried again.`,
        fix: 'Ask the IT team to check the link and resend.' }
    }
    g.status = r.status === 'queued' ? 'waiting' : 'failed'
    const key = [g.status, g.kind, g.route || '', g.reason || ''].join('|')
    const x = groups.get(key) || { ...g, leads: 0, customers: 0, oldest: null, types: {} }
    x.leads += r.leads
    x.customers += r.customers
    if (!x.oldest || new Date(r.oldest) < new Date(x.oldest)) x.oldest = r.oldest
    const type = r.campaign === 'signup' && r.source === 'lead_form' ? 'Meta lead form' : leadType(r.campaign, r.source)
    x.types[type] = (x.types[type] || 0) + r.leads
    groups.set(key, x)
  }
  return [...groups.values()]
    .map((x) => ({ ...x, types: Object.entries(x.types).map(([type, leads]) => ({ type, leads })).sort((a, b) => b.leads - a.leads) }))
    .sort((a, b) => (a.status === b.status ? b.leads - a.leads : a.status === 'waiting' ? -1 : 1))
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
       select lf.saved_at, n.status, n.created_at as queued_at, ${ALREADY} as already, s.status as lead_status,
              (n.campaign = 'signup' and n.created_at >= lf.saved_at - interval '5 minutes') as own
         from lf
         -- The form lead's own sign-up item (created with it) comes first; a customer who was already in NeoDove has none, so
         -- their latest earlier item stands in (that is the "already in NeoDove" case). Later Spin & Win / checkout items do
         -- not decide the status of the form lead (they made 48 sent form leads look "waiting", 27 Nov 2026).
         left join lateral (select * from neodove_outbox n where n.mobile = lf.mobile
                             order by (n.campaign = 'signup' and n.created_at >= lf.saved_at - interval '5 minutes') desc, n.created_at desc limit 1) n on true
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

  // ---- why leads are waiting (right now)
  const whyRows = await db.query(
    `select n.status, n.campaign, s.source, left(regexp_replace(coalesce(n.last_error, ''), '[0-9]{10}', 'X', 'g'), 200) as reason,
            count(*)::int as leads, count(distinct n.mobile)::int as customers, min(n.created_at) as oldest
       from neodove_outbox n left join lead_status s on s.mobile = n.mobile
      where n.status in ('queued', 'failed') group by 1, 2, 3, 4`)
  const waitingGroups = whyGroups(whyRows.rows)

  // ---- input
  const blank = () => ({ queued: 0, pushed: 0, already: 0, waiting: 0, failed: 0 })
  const input = { salesdaddy: { received: sdRows.rows.length, ...blank(), notQueued: 0, buyers: 0 }, website: { ...blank(), byType: {} } }
  for (const r of sdRows.rows) {
    const t = input.salesdaddy
    if (!r.status) { t.notQueued++; if (r.lead_status === 'converted') t.buyers++; continue }
    // No sign-up item of its own: the customer was already in NeoDove from an earlier lead, so the form lead was not created again.
    if (r.already || !r.own) t.already++
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
    waiting: { total: waitingGroups.filter((g) => g.status === 'waiting').reduce((a, g) => a + g.leads, 0), groups: waitingGroups },
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
