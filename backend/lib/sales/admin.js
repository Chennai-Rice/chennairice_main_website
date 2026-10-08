// Dashboard figures, company settings, delivery zones and the email queue.
import { query } from '../db.js'
import { audit, requirePermission } from './staff.js'
import { httpError, str, toPaise, toRupees } from './util.js'

export async function dashboard() {
  const [byStatus, today, week, attention, lowStock, overdue, mail] = await Promise.all([
    query(`select status, count(*)::int as n from orders where status <> 'pending_payment' group by status`),
    query(
      `select count(*)::int as orders, coalesce(sum(total_paise), 0)::bigint as revenue
         from orders where payment_status in ('paid', 'partially_refunded')
          and (placed_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date`),
    query(
      `select (placed_at at time zone 'Asia/Kolkata')::date::text as day, count(*)::int as orders,
              coalesce(sum(total_paise), 0)::bigint as revenue
         from orders where payment_status in ('paid', 'partially_refunded')
          and placed_at > now() - interval '7 days'
        group by 1 order by 1`),
    query(`select count(*)::int as n from orders where needs_attention is not null`),
    query(
      `select p.name as product_name, v.sku, v.pack_kg, v.reorder_level, coalesce(s.on_hand - s.reserved, 0) as available
         from product_variants v join products p on p.id = v.product_id
         left join stock_locations l on l.is_fulfilment
         left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
        where v.is_active and v.reorder_level > 0 and coalesce(s.on_hand - s.reserved, 0) <= v.reorder_level
        order by available`),
    query(
      `select
         count(*) filter (where status = 'placed' and placed_at < now() - interval '4 hours')::int as unconfirmed,
         count(*) filter (where status in ('confirmed', 'packed') and placed_at < now() - interval '2 days')::int as unshipped,
         count(*) filter (where status = 'shipped' and shipped_at < now() - interval '7 days')::int as undelivered
       from orders`),
    query(`select status, count(*)::int as n from email_outbox group by status`),
  ])
  return {
    ordersByStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.n])),
    today: { orders: today.rows[0].orders, revenue: toRupees(today.rows[0].revenue) },
    last7Days: week.rows.map((r) => ({ day: r.day, orders: r.orders, revenue: toRupees(r.revenue) })),
    needsAttention: attention.rows[0].n,
    lowStock: lowStock.rows,
    overdue: overdue.rows[0],
    emails: Object.fromEntries(mail.rows.map((r) => [r.status, r.n])),
  }
}

const EDITABLE_SETTINGS = [
  'seller_legal_name', 'seller_address', 'seller_state', 'seller_state_code', 'seller_gstin',
  'seller_phone', 'seller_email', 'invoice_prefix', 'reservation_minutes', 'low_stock_alerts',
]

export async function getSettingsAdmin() {
  const { rows } = await query('select key, value, updated_at from company_settings order by key')
  return rows
}

export async function updateSettings(staff, body) {
  requirePermission(staff, 'settings.manage')
  const changes = Object.entries(body || {}).filter(([k]) => EDITABLE_SETTINGS.includes(k))
  if (!changes.length) throw httpError('Nothing to change. Editable: ' + EDITABLE_SETTINGS.join(', '))
  for (const [key, raw] of changes) {
    const value = str(String(raw ?? ''))
    if (key === 'seller_gstin' && value && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) {
      throw httpError('That does not look like a GSTIN (15 characters, e.g. 33ABCDE1234F1Z5).')
    }
    if (key === 'reservation_minutes' && !(Number(value) >= 10 && Number(value) <= 240)) {
      throw httpError('Stock hold must be 10–240 minutes.')
    }
    await query(
      `insert into company_settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value]
    )
  }
  await audit({ query }, staff, 'settings.update', 'settings', null, Object.fromEntries(changes))
  return getSettingsAdmin()
}

export async function listZones() {
  const { rows } = await query('select * from shipping_zones order by is_default desc, name')
  return rows.map((z) => ({
    ...z,
    ratePerKg: toRupees(z.rate_per_kg_paise),
    minFee: toRupees(z.min_fee_paise),
    freeAbove: z.free_above_paise == null ? null : toRupees(z.free_above_paise),
  }))
}

export async function upsertZone(staff, body) {
  requirePermission(staff, 'shipping.manage')
  const code = str(body?.code).toUpperCase()
  if (!/^[A-Z0-9_]{2,30}$/.test(code)) throw httpError('Zone code: 2–30 letters, digits or _.')
  const money = (v, what) => {
    if (v == null || v === '') return 0
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw httpError(what + ' must be zero or more.')
    return toPaise(n)
  }
  const states = Array.isArray(body?.states) ? body.states.map((s) => str(s)).filter(Boolean) : []
  const { rows: [zone] } = await query(
    `insert into shipping_zones (code, name, states, rate_per_kg_paise, min_fee_paise, free_above_paise, is_active)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (code) do update set name = excluded.name, states = excluded.states,
        rate_per_kg_paise = excluded.rate_per_kg_paise, min_fee_paise = excluded.min_fee_paise,
        free_above_paise = excluded.free_above_paise, is_active = excluded.is_active
     returning *`,
    [code, str(body?.name) || code, states, money(body?.ratePerKg, 'Rate per kg'), money(body?.minFee, 'Minimum fee'),
      body?.freeAbove == null || body.freeAbove === '' ? null : money(body.freeAbove, 'Free above'),
      body?.isActive !== false]
  )
  await audit({ query }, staff, 'shipping.zone.upsert', 'zone', zone.id, { code })
  return zone
}

export async function listEmails({ status, limit = 100 } = {}) {
  const params = [Math.min(Number(limit) || 100, 500)]
  let where = ''
  if (status) {
    params.push(status)
    where = 'where status = $2'
  }
  const { rows } = await query(
    `select id, to_email, subject, template, status, attempts, last_error, created_at, sent_at
       from email_outbox ${where} order by created_at desc limit $1`,
    params
  )
  return rows
}
