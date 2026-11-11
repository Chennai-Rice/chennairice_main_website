// WhatsApp contacts (/whatsappbot → Contacts) and segments (used by Broadcasts).
//
// "People" are everyone we have a mobile number for: website buyers (paid orders), Spin & Win players,
// WhatsApp chats (AskEva's and ours) and imported contacts. Their WhatsApp permission lives in
// wa_contacts: opted in (checkout box, spin form box, START, import) / opted out (STOP).
import { query as defaultQuery } from '../db.js'
import { httpError, str } from '../sales/util.js'

export const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10)
const clean10 = (p) => { const m = last10(p); return /^[6-9]\d{9}$/.test(m) ? m : '' }

// Everyone, one row per number, with what we know about them.
const PEOPLE = `
with o as (
  select right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) as phone,
         (array_agg(contact_name order by placed_at desc nulls last))[1] as name,
         (array_agg(shipping_address->>'city' order by placed_at desc nulls last))[1] as city,
         count(*)::int as orders, sum(total_paise)::bigint as spent_paise,
         max(coalesce(placed_at, created_at)) as last_order_at,
         max(delivered_at) as last_delivered_at
    from orders where status not in ('pending_payment', 'cancelled')
   group by 1
), lastpack as (
  select distinct on (right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10))
         right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10) as phone, i.pack_kg, i.product_name
    from orders o join order_items i on i.order_id = o.id
   where o.status not in ('pending_payment', 'cancelled')
   order by right(regexp_replace(o.contact_phone, '\\D', '', 'g'), 10), o.placed_at desc nulls last, i.pack_kg desc
), s as (
  select sp.phone, sp.name, sp.created_at as spun_at, sp.prize_label,
         (d.id is not null and d.is_active and (d.expires_at is null or d.expires_at > now())
           and not exists (select 1 from orders x where x.discount_code_id = d.id and x.status not in ('pending_payment', 'cancelled'))) as spin_unused
    from spins sp left join discount_codes d on d.id = sp.code_id
), w as (
  select phone, name, last_message_at from whatsapp_contacts where phone ~ '^\\d{10}$'
), phones as (
  select phone from o union select phone from s union select phone from w union select phone from wa_contacts
)
select p.phone,
       coalesce(c.name, o.name, s.name, w.name) as name,
       o.city, coalesce(o.orders, 0) as orders, coalesce(o.spent_paise, 0) as spent_paise,
       o.last_order_at, o.last_delivered_at, lp.pack_kg as last_pack_kg, lp.product_name as last_product,
       s.spun_at, s.prize_label, coalesce(s.spin_unused, false) as spin_unused,
       greatest(w.last_message_at, c.last_in_at) as last_chat_at,
       c.opted_in_at, c.opt_in_source, c.opted_out_at, coalesce(c.tags, '{}') as tags,
       array_remove(array[case when o.phone is not null then 'buyer' end, case when s.phone is not null then 'spin' end,
                          case when w.phone is not null or c.last_in_at is not null then 'whatsapp' end], null) as sources
  from phones p
  left join o on o.phone = p.phone
  left join lastpack lp on lp.phone = p.phone
  left join s on s.phone = p.phone
  left join w on w.phone = p.phone
  left join wa_contacts c on c.phone = p.phone
 where p.phone ~ '^[6-9]\\d{9}$'`

/**
 * The filters both Contacts and Broadcasts use. Returns [sql where-clauses, params].
 *   q, tag, permission ('in' | 'out' | 'none' | 'not_out'), bought ('yes' | 'no'),
 *   lastOrderMin / lastOrderMax (days since the last order), packKg, city, spinUnused, source
 */
export function segmentWhere(f = {}, params = []) {
  const w = []
  const add = (sql, v) => { params.push(v); w.push(sql.replaceAll('$?', '$' + params.length)) }
  if (str(f.q)) add(`(x.phone like $? or lower(coalesce(x.name, '')) like $?)`, '%' + str(f.q).toLowerCase().replace(/[%_]/g, '') + '%')
  if (str(f.tag)) add(`$? = any(x.tags)`, str(f.tag).toLowerCase())
  if (f.permission === 'in') w.push('x.opted_in_at is not null and x.opted_out_at is null')
  if (f.permission === 'out') w.push('x.opted_out_at is not null')
  if (f.permission === 'none') w.push('x.opted_in_at is null and x.opted_out_at is null')
  if (f.permission === 'not_out') w.push('x.opted_out_at is null')
  if (f.bought === 'yes') w.push('x.orders > 0')
  if (f.bought === 'no') w.push('x.orders = 0')
  if (Number(f.lastOrderMin) > 0) add(`x.last_order_at <= now() - make_interval(days => $?::int)`, Number(f.lastOrderMin))
  if (Number(f.lastOrderMax) > 0) add(`x.last_order_at >= now() - make_interval(days => $?::int)`, Number(f.lastOrderMax))
  if (Number(f.packKg) > 0) add(`x.last_pack_kg = $?::numeric`, Number(f.packKg))
  if (str(f.city)) add(`lower(coalesce(x.city, '')) like $?`, '%' + str(f.city).toLowerCase() + '%')
  if (f.spinUnused === true || f.spinUnused === 'true') w.push('x.spin_unused')
  if (['buyer', 'spin', 'whatsapp'].includes(f.source)) add(`$? = any(x.sources)`, f.source)
  return [w.length ? 'where ' + w.join(' and ') : '', params]
}

export async function listContacts(f = {}, { query = defaultQuery } = {}) {
  const [where, params] = segmentWhere(f)
  const limit = Math.min(Number(f.limit) || 100, 500)
  const offset = Math.max(Number(f.offset) || 0, 0)
  const { rows } = await query(
    `select x.*, count(*) over ()::int as total from (${PEOPLE}) x ${where}
      order by greatest(x.last_order_at, x.last_chat_at, x.spun_at) desc nulls last limit ${limit} offset ${offset}`, params)
  const { rows: [t] } = await query(
    `select count(*)::int as all,
            count(*) filter (where opted_in_at is not null and opted_out_at is null)::int as opted_in,
            count(*) filter (where opted_out_at is not null)::int as opted_out,
            count(*) filter (where orders > 0)::int as buyers
       from (${PEOPLE}) x`)
  const { rows: tags } = await query(`select t as tag, count(*)::int as n from wa_contacts, unnest(tags) t group by t order by n desc limit 50`)
  return { contacts: rows.map(shapeContact), total: rows[0]?.total || 0, totals: t, tags }
}

const shapeContact = (r) => ({
  phone: r.phone, name: r.name, city: r.city, orders: r.orders, spent: Number(r.spent_paise) / 100,
  lastOrderAt: r.last_order_at, lastPackKg: r.last_pack_kg == null ? null : Number(r.last_pack_kg), lastProduct: r.last_product,
  spunAt: r.spun_at, prize: r.prize_label, spinUnused: r.spin_unused, lastChatAt: r.last_chat_at,
  optedInAt: r.opted_in_at, optInSource: r.opt_in_source, optedOutAt: r.opted_out_at, tags: r.tags || [], sources: r.sources || [],
})

/** The people a segment reaches (Broadcasts): phone, name and the fields a template can use. */
export async function segmentPeople(f = {}, { query = defaultQuery, limit = 100000 } = {}) {
  const [where, params] = segmentWhere(f)
  const { rows } = await query(`select x.* from (${PEOPLE}) x ${where} limit ${Number(limit) | 0}`, params)
  return rows.map(shapeContact)
}

export async function contactsCsv(f = {}, { query = defaultQuery } = {}) {
  const people = await segmentPeople(f, { query })
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s }
  const head = ['Mobile', 'Name', 'City', 'Orders', 'Spent (Rs)', 'Last order', 'Last pack (kg)', 'Spin prize', 'Spin code unused', 'Last WhatsApp chat', 'WhatsApp offers', 'Tags', 'Sources']
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '')
  const lines = people.map((p) => [p.phone, p.name, p.city, p.orders, p.spent, d(p.lastOrderAt), p.lastPackKg, p.prize, p.spinUnused ? 'yes' : '', d(p.lastChatAt),
    p.optedOutAt ? 'opted out (STOP)' : p.optedInAt ? `opted in (${p.optInSource || ''})` : '', p.tags.join(' '), p.sources.join(' ')].map(esc).join(','))
  return [head.join(','), ...lines].join('\n')
}

// ---- permission and tags -------------------------------------------------------------------------------------
/** Records a "yes" to WhatsApp offers (website forms, START, import). */
export async function optIn(phone, { name = null, source = 'website', query = defaultQuery } = {}) {
  const p = clean10(phone)
  if (!p) throw httpError('Bad phone', { publicMessage: 'Please enter a valid 10-digit mobile number.' })
  await query(
    `insert into wa_contacts (phone, name, opted_in_at, opt_in_source) values ($1, $2, now(), $3)
     on conflict (phone) do update set opted_in_at = coalesce(wa_contacts.opted_in_at, now()), opt_in_source = coalesce(wa_contacts.opt_in_source, $3),
       opted_out_at = case when $3 in ('start', 'staff') then null else wa_contacts.opted_out_at end,
       name = coalesce(wa_contacts.name, $2), updated_at = now()`, [p, name, source])
  return { ok: true }
}

export async function optOut(phone, { query = defaultQuery } = {}) {
  const p = last10(phone)
  await query(
    `insert into wa_contacts (phone, opted_out_at) values ($1, now())
     on conflict (phone) do update set opted_out_at = now(), updated_at = now()`, [p])
  return { ok: true }
}

export async function setTags(phone, tags, { query = defaultQuery } = {}) {
  const t = [...new Set((tags || []).map((x) => str(x).toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 20)
  await query(
    `insert into wa_contacts (phone, tags) values ($1, $2) on conflict (phone) do update set tags = $2, updated_at = now()`, [last10(phone), t])
  return { tags: t }
}

/** Staff changing a contact's permission by hand (e.g. the customer asked on a call). */
export async function setPermission(phone, value, { query = defaultQuery } = {}) {
  if (value === 'in') return optIn(phone, { source: 'staff', query })
  if (value === 'out') return optOut(phone, { query })
  await query(`update wa_contacts set opted_in_at = null, opt_in_source = null, opted_out_at = null, updated_at = now() where phone = $1`, [last10(phone)])
  return { ok: true }
}

/** CSV import: rows of { phone, name, tags, optIn }. Only numbers who agreed may be marked opted in. */
export async function importContacts(rows, { query = defaultQuery } = {}) {
  let added = 0
  let skipped = 0
  for (const r of (rows || []).slice(0, 20000)) {
    const p = clean10(r.phone)
    if (!p) { skipped++; continue }
    const tags = String(r.tags || '').split(/[,;| ]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
    const yes = /^(y|yes|true|1)$/i.test(String(r.optIn || ''))
    await query(
      `insert into wa_contacts (phone, name, tags, opted_in_at, opt_in_source) values ($1, $2, $3, case when $4 then now() end, case when $4 then 'import' end)
       on conflict (phone) do update set name = coalesce(wa_contacts.name, excluded.name),
         tags = (select array(select distinct unnest(wa_contacts.tags || excluded.tags))),
         opted_in_at = coalesce(wa_contacts.opted_in_at, excluded.opted_in_at), opt_in_source = coalesce(wa_contacts.opt_in_source, excluded.opt_in_source),
         updated_at = now()`, [p, str(r.name) || null, tags, yes])
    added++
  }
  return { added, skipped }
}

/** May we send this number a marketing message? (opted in, not opted out) */
export async function canMarket(phone, query = defaultQuery) {
  const { rows: [c] } = await query('select opted_in_at, opted_out_at from wa_contacts where phone = $1', [last10(phone)])
  return Boolean(c?.opted_in_at && !c.opted_out_at)
}
