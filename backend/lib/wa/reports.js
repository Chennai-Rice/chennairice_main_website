// WhatsApp reports (/whatsappbot → Reports), for a period (IST dates):
//   by source   automations, broadcasts, bot, inbox, order messages: sent, delivered, read, failed, replies
//               (within 3 days), orders and revenue from those numbers within 7 days, approx. cost
//   by template the same per template
//   bot         chats it answered, replies, chats a person then took over
//   team        per person: chats handled, messages, median and average first reply time
import { query as defaultQuery } from '../db.js'
import { formatInr } from '../sales/util.js'
import { metaCost } from './admin.js'
import { cloudEnabled } from './cloud.js'

const RATE = { marketing: 0.78, utility: 0.115, authentication: 0.115 }
const IST = 'Asia/Kolkata'

export function periodOf({ from, to } = {}) {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
  const f = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : today.slice(0, 8) + '01'
  const t = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today
  return { from: f, to: t }
}

const SOURCE_NAMES = {
  order_placed: 'Order placed', bot: 'Bot', inbox: 'Inbox (team)', test: 'Tests', broadcast: 'Broadcasts', dashboard: 'Dashboard',
  spin_code: 'Spin: prize code', spin_reminder: 'Spin: reminder', spin_last_chance: 'Spin: last chance',
  ref_share_code: 'Referral: share code', ref_friend_ordered: 'Referral: friend ordered', ref_reward_ready: 'Referral: reward ready',
  ref_reward_expiring: 'Referral: reward expiring', ref_nudge: 'Referral: reminder', restock: 'Restock', winback: 'Win-back', cart: 'Cart', review: 'Review request',
}

async function grouped(by, p, query, money) {
  const col = by === 'template' ? `coalesce(m.template_name, '(free text)')` : `coalesce(m.source, 'other')`
  const { rows } = await query(
    `with m as (
       select m.*, (select min(r.created_at) from wa_messages r where r.phone = m.phone and r.direction = 'in' and r.created_at > m.created_at and r.created_at < m.created_at + interval '3 days') as replied_at
         from wa_messages m
        where m.direction = 'out' and (m.created_at at time zone '${IST}')::date between $1::date and $2::date
     ), o as (
       select m.id as msg, o.id as order_id, o.total_paise
         from m join orders o on right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10) = right(m.phone, 10)
          and o.status not in ('pending_payment', 'cancelled') and o.placed_at > m.created_at and o.placed_at < m.created_at + interval '7 days'
     )
     select ${col} as key, min(m.category) as category,
            count(*)::int as sent, count(*) filter (where m.status in ('delivered', 'read'))::int as delivered,
            count(*) filter (where m.status = 'read')::int as read, count(*) filter (where m.status = 'failed')::int as failed,
            count(*) filter (where m.replied_at is not null)::int as replied,
            count(*) filter (where m.status in ('delivered', 'read') and m.category = 'marketing')::int as paid_marketing,
            count(*) filter (where m.status in ('delivered', 'read') and m.category = 'utility')::int as paid_utility,
            (select count(distinct o.order_id) from o where o.msg = any(array_agg(m.id)))::int as orders,
            (select coalesce(sum(x.total_paise), 0) from (select distinct o.order_id, o.total_paise from o where o.msg = any(array_agg(m.id))) x)::bigint as revenue
       from m group by 1 order by sent desc`, [p.from, p.to])
  return rows.map((r) => ({
    key: r.key, name: by === 'template' ? r.key : SOURCE_NAMES[r.key] || r.key, category: r.category,
    sent: r.sent, delivered: r.delivered, read: r.read, failed: r.failed, replied: r.replied, orders: r.orders,
    revenue: money ? Number(r.revenue) / 100 : null,
    cost: Math.round((r.paid_marketing * RATE.marketing + r.paid_utility * RATE.utility) * 100) / 100,
  }))
}

export async function report(input = {}, { query = defaultQuery, money = true } = {}) {
  const p = periodOf(input)
  const [bySource, byTemplate] = await Promise.all([grouped('source', p, query, money), grouped('template', p, query, money)])
  const { rows: [bot] } = await query(
    `select count(*)::int as replies, count(distinct phone)::int as chats,
            count(distinct phone) filter (where exists (select 1 from wa_messages x where x.phone = m.phone and x.source = 'inbox' and x.created_at > m.created_at
                                                          and (x.created_at at time zone '${IST}')::date <= $2::date))::int as taken_over
       from wa_messages m where m.source = 'bot' and (m.created_at at time zone '${IST}')::date between $1::date and $2::date`, [p.from, p.to])
  const { rows: [inbound] } = await query(
    `select count(*)::int as messages, count(distinct phone)::int as customers
       from wa_messages where direction = 'in' and (created_at at time zone '${IST}')::date between $1::date and $2::date`, [p.from, p.to])
  // First reply time: a customer's message that starts their turn, to the team's next Inbox reply.
  const { rows: team } = await query(
    `with ins as (
       select m.phone, m.created_at,
              lag(m.direction) over (partition by m.phone order by m.created_at) as prev
         from wa_messages m where (m.created_at at time zone '${IST}')::date between $1::date and $2::date
     ), waits as (
       select i.phone, i.created_at,
              (select x.created_at from wa_messages x where x.phone = i.phone and x.source = 'inbox' and x.created_at > i.created_at order by x.created_at limit 1) as replied_at,
              (select x.staff_id from wa_messages x where x.phone = i.phone and x.source = 'inbox' and x.created_at > i.created_at order by x.created_at limit 1) as staff_id
         from ins i where i.prev is distinct from 'in'
     ), sent as (
       select staff_id, count(*)::int as messages, count(distinct phone)::int as chats
         from wa_messages where source = 'inbox' and staff_id is not null and (created_at at time zone '${IST}')::date between $1::date and $2::date group by 1
     )
     select s.full_name, s.email, coalesce(sent.messages, 0) as messages, coalesce(sent.chats, 0) as chats,
            percentile_cont(0.5) within group (order by extract(epoch from w.replied_at - w.created_at)) as median_s,
            avg(extract(epoch from w.replied_at - w.created_at)) as avg_s, count(w.*)::int as answered
       from sent join staff_users s on s.id = sent.staff_id
       left join waits w on w.staff_id = sent.staff_id and w.replied_at is not null and w.replied_at < w.created_at + interval '2 days'
      group by s.full_name, s.email, sent.messages, sent.chats order by messages desc`, [p.from, p.to])
  const totals = bySource.reduce((t, r) => ({
    sent: t.sent + r.sent, delivered: t.delivered + r.delivered, read: t.read + r.read, replied: t.replied + r.replied,
    orders: t.orders + r.orders, revenue: money ? t.revenue + (r.revenue || 0) : null, cost: Math.round((t.cost + r.cost) * 100) / 100,
  }), { sent: 0, delivered: 0, read: 0, replied: 0, orders: 0, revenue: 0, cost: 0 })
  // Marketing / utility / free split: our own count (delivered or read) and approx. cost, beside what Meta charged.
  const { rows: cats } = await query(
    `select coalesce(nullif(category, ''), 'other') as category, count(*)::int as sent,
            count(*) filter (where status in ('delivered', 'read'))::int as delivered,
            count(*) filter (where status in ('delivered', 'read') and coalesce(billable, true))::int as billable
       from wa_messages where direction = 'out' and (created_at at time zone '${IST}')::date between $1::date and $2::date group by 1`, [p.from, p.to])
  const from = new Date(p.from + 'T00:00:00+05:30')
  const to = new Date(new Date(p.to + 'T00:00:00+05:30').getTime() + 864e5)
  const meta = cloudEnabled() ? await metaCost(from, to) : null
  const split = ['marketing', 'utility', 'authentication', 'service'].map((c) => {
    const ours = cats.find((r) => r.category === c) || { sent: 0, delivered: 0, billable: 0 }
    const m = meta?.byCategory?.[c]
    return {
      category: c, sent: ours.sent, delivered: ours.delivered,
      approxCost: c === 'service' ? 0 : Math.round(ours.billable * (RATE[c] || 0) * 100) / 100,
      meta: m ? { messages: m.volume, cost: Math.round(m.cost * 100) / 100 } : null,
    }
  })
  return {
    period: p, totals, inbound, bySource, byTemplate, bot,
    split, metaCurrency: meta?.currency || null, metaError: meta?.error || null,
    team: team.map((t) => ({ name: t.full_name || t.email, messages: t.messages, chats: t.chats, answered: t.answered,
      medianMinutes: t.median_s == null ? null : Math.round(t.median_s / 6) / 10, avgMinutes: t.avg_s == null ? null : Math.round(t.avg_s / 6) / 10 })),
    note: 'Orders and revenue: orders from the same mobile number within 7 days after a message. Cost is approximate (Meta’s India rates).',
  }
}

export async function reportCsv(input = {}, opts = {}) {
  const r = await report(input, opts)
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s }
  const head = ['Group', 'Name', 'Category', 'Sent', 'Delivered', 'Read', 'Failed', 'Replied (3 days)', 'Orders (7 days)', 'Revenue (Rs)', 'Approx. cost (Rs)']
  const rows = [
    ...r.bySource.map((x) => ['Source', x.name, x.category, x.sent, x.delivered, x.read, x.failed, x.replied, x.orders, x.revenue, x.cost]),
    ...r.byTemplate.map((x) => ['Template', x.name, x.category, x.sent, x.delivered, x.read, x.failed, x.replied, x.orders, x.revenue, x.cost]),
  ]
  return [`WhatsApp report ${r.period.from} to ${r.period.to}`, head.join(','), ...rows.map((row) => row.map(esc).join(','))].join('\n')
}

export { formatInr }
