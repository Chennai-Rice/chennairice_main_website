// Spin reminder results (Nov 2026): every Spin & Win reminder sent on WhatsApp (the automatic spin_reminder /
// spin_last_chance and bulk sends of any spin_reminder* template, e.g. the Tamil versions), and what came of it:
// delivered / read, the Claim link tapped (wa_link_clicks), and the paid order that used the code, with its revenue.
// The code is read from the message's own button values (spin-<CODE>), so each send is tied to its spin.

import { query as defaultQuery } from '../db.js'
import { str, toRupees } from '../sales/util.js'

const PAID = ['paid', 'partially_refunded']
// The same code written with or without its hyphens (WhatsApp's Copy code drops them).
const norm = (sql) => `upper(regexp_replace(${sql}, '[^A-Za-z0-9]', '', 'g'))`
const TEMPLATE_RE = /^[a-z0-9_]{1,80}$/

/** A tap on a /w/<slug> link (public; rate-limited by the route). Returns { ok }. */
export async function recordLinkClick(slug, { query = defaultQuery } = {}) {
  const s = str(slug).slice(0, 120)
  if (!/^[a-z]+-[A-Za-z0-9._-]{1,100}$/i.test(s)) return { ok: false }
  const m = /^spin-(?!bot$)(.+)$/i.exec(s)
  const code = m ? m[1].toUpperCase().replace(/[^A-Z0-9]/g, '') : null
  await query('insert into wa_link_clicks (slug, code) values ($1, $2)', [s, code])
  return { ok: true }
}

/**
 * The report. Options: template (one template name, else every spin reminder template), from / to (YYYY-MM-DD,
 * India dates of the send). Returns { templates, summary, byTemplate, people }.
 */
export async function spinReminderReport({ template = '', from = '', to = '' } = {}, { query = defaultQuery } = {}) {
  const params = []
  const where = [`(q.template_name ilike 'spin\\_reminder%' or q.template_name ilike 'spin\\_last\\_chance%')`]
  if (template && TEMPLATE_RE.test(template)) { params.push(template); where.push(`q.template_name = $${params.length}`) }
  const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '')
  if (day(from)) { params.push(day(from)); where.push(`(coalesce(q.sent_at, q.created_at) at time zone 'Asia/Kolkata')::date >= $${params.length}::date`) }
  if (day(to)) { params.push(day(to)); where.push(`(coalesce(q.sent_at, q.created_at) at time zone 'Asia/Kolkata')::date <= $${params.length}::date`) }

  const { rows } = await query(
    `with sends as (
       select q.id, q.phone, q.template_name, q.language, q.source, q.status as queue_status, q.reason, q.wamid,
              q.created_at, q.sent_at, coalesce(q.sent_at, q.created_at) as at,
              (select ${norm(`substring(e.value from '^[sS][pP][iI][nN]-(.+)$')`)}
                 from jsonb_each_text(coalesce(q.vals->'buttons', '{}'::jsonb)) e
                where e.value ~* '^spin-' and e.value !~* '^spin-bot$' limit 1) as code_key
         from wa_queue q
        where ${where.join(' and ')}
     )
     select s.*, m.status as msg_status, m.status_at, d.code, d.expires_at, d.min_order_paise,
            sp.name, sp.prize_label,
            k.clicks, k.first_click,
            o.order_number, o.placed_at, o.total_paise, o.discount_paise, o.items, o.city
       from sends s
       left join wa_messages m on m.wamid = s.wamid
       left join discount_codes d on s.code_key is not null and ${norm('d.code')} = s.code_key
       left join spins sp on sp.code_id = d.id
       left join lateral (
         select count(*)::int as clicks, min(c.clicked_at) as first_click from wa_link_clicks c
          where c.code = s.code_key and c.clicked_at >= s.at - interval '1 minute') k on true
       left join lateral (
         select o.order_number, o.placed_at, o.total_paise, o.discount_paise, o.shipping_address->>'city' as city,
                (select string_agg(i.product_name || ' ' || (i.pack_kg::float)::text || ' kg × ' || i.quantity, ', ' order by i.product_name)
                   from order_items i where i.order_id = o.id) as items
           from orders o
          where d.id is not null and o.discount_code_id = d.id and o.payment_status = any($${params.length + 1})
            and o.placed_at >= s.at - interval '1 minute'
          order by o.placed_at limit 1) o on true
      order by s.at desc
      limit 20000`, [...params, PAID])

  const people = rows.map((r) => {
    const sent = r.queue_status === 'sent'
    const st = sent ? (r.msg_status || 'sent') : r.queue_status
    return {
      at: r.at, phone: r.phone, name: r.name || '', template: r.template_name, language: r.language,
      prize: r.prize_label || '', code: r.code || '', expiresAt: r.expires_at, minOrder: toRupees(r.min_order_paise || 0),
      // queued / skipped (with the reason) / failed, or for a sent one: sent / delivered / read / failed.
      status: st, reason: sent ? '' : r.reason || '',
      clicks: r.clicks || 0, clickedAt: r.first_click,
      order: r.order_number ? { number: r.order_number, at: r.placed_at, items: r.items || '', total: toRupees(r.total_paise), discount: toRupees(r.discount_paise), city: r.city || '' } : null,
    }
  })

  const tally = (list) => {
    const bought = list.filter((p) => p.order)
    return {
      messages: list.length,
      sent: list.filter((p) => ['sent', 'delivered', 'read'].includes(p.status)).length,
      delivered: list.filter((p) => ['delivered', 'read'].includes(p.status)).length,
      read: list.filter((p) => p.status === 'read').length,
      failed: list.filter((p) => p.status === 'failed').length,
      notSent: list.filter((p) => ['queued', 'skipped'].includes(p.status)).length,
      clicked: list.filter((p) => p.clicks > 0).length,
      purchased: bought.length,
      revenue: Math.round(bought.reduce((n, p) => n + p.order.total, 0) * 100) / 100,
      discount: Math.round(bought.reduce((n, p) => n + p.order.discount, 0) * 100) / 100,
    }
  }
  const templates = [...new Set(people.map((p) => p.template))].sort()
  return {
    templates,
    summary: tally(people),
    byTemplate: templates.map((t) => ({ template: t, ...tally(people.filter((p) => p.template === t)) })),
    people,
  }
}
