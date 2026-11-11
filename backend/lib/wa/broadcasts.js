// Broadcasts (/whatsappbot → Broadcasts): one approved template to a segment of contacts, now or at a set
// time. Each person's {{1}}, {{2}}… come from their own details (first name, city, last product) or a fixed
// text. Messages go through wa_queue, so the same rules apply as for automations: marketing only to people
// who said yes and not STOP, 1 a day / 3 a week each, 9 am – 8 pm India time.
//
// Results: sent, delivered, read, failed / skipped (and why), replies within 3 days, and orders (and
// their value) from those numbers within 7 days of the message.
import { query as defaultQuery } from '../db.js'
import { httpError, str, formatInr } from '../sales/util.js'
import { segmentPeople } from './contacts.js'
import { fromComponents } from './templates.js'
import { sendQueue } from './automations.js'

const FROM = {
  first_name: (p) => String(p.name || '').trim().split(/\s+/)[0] || 'there',
  name: (p) => p.name || 'there',
  city: (p) => p.city || 'your city',
  last_product: (p) => (p.lastProduct ? `${p.lastProduct}${p.lastPackKg ? ' ' + p.lastPackKg + ' kg' : ''}` : 'Kitchadi Ponni rice'),
  prize: (p) => p.prize || 'your offer',
}
export const FIELDS = { first_name: 'First name', name: 'Full name', city: 'City', last_product: 'Last product bought', prize: 'Spin & Win prize', fixed: 'Fixed text' }

/** One person's values for the template, from the broadcast's mapping. */
export function valuesFor(person, mapping = {}) {
  const pick = (m) => (m?.from && m.from !== 'fixed' && FROM[m.from] ? FROM[m.from](person) : str(m?.text))
  return {
    body: (mapping.body || []).map(pick),
    ...(mapping.header ? { header: pick(mapping.header) } : {}),
    buttons: Object.fromEntries(Object.entries(mapping.buttons || {}).map(([i, m]) => [i, pick(m)])),
  }
}

async function template(name, query) {
  const { rows: [t] } = await query(`select * from wa_templates where name = $1 and language = 'en'`, [name])
  return t
}

/** Who the broadcast reaches: the segment, minus people the rules exclude. */
export async function audience({ segment = {}, templateName }, { query = defaultQuery } = {}) {
  const t = templateName ? await template(templateName, query) : null
  const marketing = !t || t.category === 'MARKETING'
  const people = await segmentPeople(segment, { query })
  const eligible = people.filter((p) => !p.optedOutAt && (!marketing || p.optedInAt))
  return {
    inSegment: people.length,
    eligible: eligible.length,
    excludedStop: people.filter((p) => p.optedOutAt).length,
    excludedNoPermission: marketing ? people.filter((p) => !p.optedOutAt && !p.optedInAt).length : 0,
    marketing,
    sample: eligible.slice(0, 5).map((p) => ({ phone: p.phone.replace(/^(\d{2})\d{5}/, '$1•••••'), name: p.name })),
    people: eligible,
  }
}

export async function listBroadcasts({ query = defaultQuery, money = true } = {}) {
  const { rows } = await query(
    `select b.*, s.full_name as created_by_name,
            count(q.*) filter (where q.status = 'queued')::int as queued,
            count(q.*) filter (where q.status = 'sent')::int as sent,
            count(q.*) filter (where q.status = 'skipped')::int as skipped,
            count(q.*) filter (where q.status = 'failed')::int as failed,
            count(m.*) filter (where m.status in ('delivered', 'read'))::int as delivered,
            count(m.*) filter (where m.status = 'read')::int as read,
            count(*) filter (where exists (select 1 from wa_messages r where r.phone = q.phone and r.direction = 'in' and r.created_at > q.sent_at and r.created_at < q.sent_at + interval '3 days'))::int as replied,
            min(q.sent_at) as first_sent, max(q.sent_at) as last_sent
       from wa_broadcasts b left join wa_queue q on q.broadcast_id = b.id left join wa_messages m on m.wamid = q.wamid
       left join staff_users s on s.id = b.created_by
      group by b.id, s.full_name order by b.created_at desc limit 100`)
  const ids = rows.map((r) => r.id)
  const { rows: orders } = ids.length ? await query(
    `select q.broadcast_id, count(distinct o.id)::int as orders, coalesce(sum(o.total_paise), 0)::bigint as revenue
       from wa_queue q join orders o on right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10) = q.phone
        and o.status not in ('pending_payment', 'cancelled') and o.placed_at > q.sent_at and o.placed_at < q.sent_at + interval '7 days'
      where q.broadcast_id = any($1) and q.status = 'sent' group by q.broadcast_id`, [ids]) : { rows: [] }
  const ob = Object.fromEntries(orders.map((o) => [o.broadcast_id, o]))
  for (const r of rows) {
    if (r.status === 'sending' && r.queued === 0 && r.sent + r.skipped + r.failed > 0) {
      r.status = 'done'
      await query(`update wa_broadcasts set status = 'done', updated_at = now() where id = $1`, [r.id])
    }
  }
  return rows.map((r) => ({
    id: r.id, name: r.name, template: r.template_name, segment: r.segment, mapping: r.mapping, status: r.status,
    scheduledAt: r.scheduled_at, audience: r.audience, createdAt: r.created_at, createdBy: r.created_by_name,
    stats: { queued: r.queued, sent: r.sent, skipped: r.skipped, failed: r.failed, delivered: r.delivered, read: r.read, replied: r.replied,
      orders: ob[r.id]?.orders || 0, revenue: money ? formatInr(ob[r.id]?.revenue || 0) : null, firstSent: r.first_sent, lastSent: r.last_sent },
  }))
}

export async function saveBroadcast(input, staff, { query = defaultQuery } = {}) {
  const name = str(input.name).slice(0, 80)
  if (!name) throw httpError('No name', { publicMessage: 'Give the broadcast a name.' })
  const t = await template(str(input.template), query)
  if (!t || t.status !== 'APPROVED') throw httpError('Not approved', { publicMessage: 'Choose an approved template.' })
  const segment = input.segment && typeof input.segment === 'object' ? input.segment : {}
  const mapping = input.mapping && typeof input.mapping === 'object' ? input.mapping : {}
  if (input.id) {
    const { rows: [b] } = await query(`select status from wa_broadcasts where id = $1`, [input.id])
    if (!b) throw httpError('Gone', { status: 404, publicMessage: 'That broadcast is gone.' })
    if (b.status !== 'draft') throw httpError('Sent', { publicMessage: 'A broadcast that has started cannot be changed. Duplicate it instead.' })
    const { rows: [r] } = await query(
      `update wa_broadcasts set name = $2, template_name = $3, segment = $4, mapping = $5, updated_at = now() where id = $1 returning id`,
      [input.id, name, t.name, JSON.stringify(segment), JSON.stringify(mapping)])
    return { id: r.id }
  }
  const { rows: [r] } = await query(
    `insert into wa_broadcasts (name, template_name, segment, mapping, created_by) values ($1, $2, $3, $4, $5) returning id`,
    [name, t.name, JSON.stringify(segment), JSON.stringify(mapping), staff?.id || null])
  return { id: r.id }
}

/** Starts a broadcast now, or schedules it (`at`, ISO time). Everyone eligible goes into the queue. */
export async function launchBroadcast(id, { at = null } = {}, { query = defaultQuery, fetchImpl } = {}) {
  const { rows: [b] } = await query(`select * from wa_broadcasts where id = $1`, [id])
  if (!b) throw httpError('Gone', { status: 404, publicMessage: 'That broadcast is gone.' })
  if (b.status !== 'draft') throw httpError('Started', { publicMessage: 'This broadcast has already been sent or scheduled.' })
  const t = await template(b.template_name, query)
  if (!t || t.status !== 'APPROVED') throw httpError('Not approved', { publicMessage: 'The template is not approved (any more).' })
  const when = at ? new Date(at) : new Date()
  if (Number.isNaN(when.getTime())) throw httpError('Bad time', { publicMessage: 'Choose a valid date and time.' })
  const aud = await audience({ segment: b.segment, templateName: b.template_name }, { query })
  if (!aud.eligible) throw httpError('Nobody', { publicMessage: 'Nobody in this segment can receive it (check WhatsApp permission).' })
  const model = fromComponents(t.components)
  const nBody = Math.max(0, ...[...String(model.body.text).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))
  const mapping = b.mapping || {}
  if ((mapping.body || []).length < nBody) throw httpError('Mapping', { publicMessage: 'Fill in every {{ }} of the template.' })
  for (const p of aud.people) {
    await query(
      `insert into wa_queue (phone, template_name, language, category, vals, source, ref, broadcast_id, send_after)
       values ($1, $2, $3, $4, $5, 'broadcast', $6, $7, $8) on conflict (ref) where ref is not null do nothing`,
      [p.phone, t.name, t.language, String(t.category).toLowerCase(), JSON.stringify(valuesFor(p, mapping)), `bc:${b.id}:${p.phone}`, b.id, when])
  }
  const now = when.getTime() <= Date.now() + 60e3
  await query(`update wa_broadcasts set status = $2, scheduled_at = $3, audience = $4, updated_at = now() where id = $1`,
    [b.id, now ? 'sending' : 'scheduled', when, aud.eligible])
  // The first batch right away; the 10-minute job sends the rest.
  const first = now ? await sendQueue({ query, fetchImpl, broadcastId: b.id, limit: 60 }) : null
  return { ok: true, queued: aud.eligible, first }
}

export async function cancelBroadcast(id, { query = defaultQuery } = {}) {
  await query(`update wa_queue set status = 'skipped', reason = 'broadcast cancelled' where broadcast_id = $1 and status = 'queued'`, [id])
  await query(`update wa_broadcasts set status = 'cancelled', updated_at = now() where id = $1 and status in ('draft', 'scheduled', 'sending')`, [id])
  return { ok: true }
}

export async function deleteBroadcast(id, { query = defaultQuery } = {}) {
  const { rows: [b] } = await query(`select status from wa_broadcasts where id = $1`, [id])
  if (b && b.status !== 'draft' && b.status !== 'cancelled') throw httpError('Sent', { publicMessage: 'Only drafts and cancelled broadcasts can be deleted (sent ones stay for the reports).' })
  await query(`delete from wa_broadcasts where id = $1`, [id])
  return { ok: true }
}

/** Scheduled broadcasts whose time has come: mark them sending (the queue already holds their messages). */
export async function startScheduled({ query = defaultQuery } = {}) {
  await query(`update wa_broadcasts set status = 'sending', updated_at = now() where status = 'scheduled' and scheduled_at <= now()`)
}
