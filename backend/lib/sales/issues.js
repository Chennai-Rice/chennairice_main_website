// Returns & Issues: problems on an order logged by staff (from a customer's
// call, a driver's report, a damaged consignment) and worked to a resolution.
import { tx, query } from '../db.js'
import { audit, requirePermission } from './staff.js'
import { httpError, str, parseTrackingRef } from './util.js'

export const ISSUE_TYPES = {
  damaged: 'Damaged bags',
  incorrect_quantity: 'Incorrect quantity',
  wrong_product: 'Wrong product',
  return_request: 'Return request',
  delivery_failed: 'Delivery failed',
  quality: 'Quality issue',
  other: 'Other',
}
const STATUSES = ['open', 'under_review', 'resolved']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

const issueRef = (n) => 'ISS-' + String(n).padStart(6, '0')

function shape(r) {
  return {
    id: r.id,
    ref: issueRef(r.issue_no),
    orderId: r.order_id,
    orderNumber: r.order_number,
    type: r.type,
    typeLabel: ISSUE_TYPES[r.type],
    description: r.description,
    status: r.status,
    resolution: r.resolution,
    customer: { name: r.contact_name, phone: r.contact_phone },
    city: r.city,
    createdBy: r.created_by_name,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }
}

const SELECT = `select i.*, o.order_number, o.contact_name, o.contact_phone, o.shipping_address->>'city' as city,
                       s.full_name as created_by_name
                  from order_issues i join orders o on o.id = i.order_id
                  left join staff_users s on s.id = i.created_by`

export async function listIssues(f = {}) {
  const tab = STATUSES.includes(f.tab) ? f.tab : 'open'
  const params = []
  const add = (v) => {
    params.push(v)
    return '$' + params.length
  }
  const where = []
  if (ISSUE_TYPES[f.type]) where.push(`i.type = ${add(f.type)}`)
  if (f.state === 'tn') where.push(`lower(o.ship_state) in ('tamil nadu', 'tn')`)
  else if (f.state === 'other') where.push(`lower(o.ship_state) not in ('tamil nadu', 'tn')`)
  const day = `(i.created_at at time zone 'Asia/Kolkata')::date`
  if (DATE.test(str(f.from))) where.push(`${day} >= ${add(f.from)}::date`)
  if (DATE.test(str(f.to))) where.push(`${day} <= ${add(f.to)}::date`)
  const q = str(f.q).slice(0, 100)
  if (q) {
    const ref = parseTrackingRef(q)
    if (ref?.orderNumber) where.push(`o.order_number = ${add(ref.orderNumber)}`)
    else if (/^ISS-?\d+$/i.test(q)) where.push(`i.issue_no = ${add(Number(q.replace(/\D/g, '')))}`)
    else {
      const like = add('%' + q + '%')
      where.push(`(o.contact_name ilike ${like} or i.description ilike ${like} or o.order_number ilike ${like})`)
    }
  }
  const extra = where.length ? ' and ' + where.join(' and ') : ''
  const limit = Math.min(Math.max(Number(f.limit) || 10, 1), 100)
  const offset = Math.max(Number(f.offset) || 0, 0)
  const tabParam = add(tab)
  const { rows } = await query(
    `${SELECT} where i.status = ${tabParam}${extra} order by i.created_at desc limit ${limit} offset ${offset}`,
    params
  )
  const { rows: counts } = await query(
    `select i.status, count(*)::int as n from order_issues i join orders o on o.id = i.order_id
      where true${extra} group by i.status`,
    params.slice(0, -1)
  )
  const c = Object.fromEntries(STATUSES.map((s) => [s, counts.find((x) => x.status === s)?.n || 0]))
  return { tab, counts: c, total: c[tab], issues: rows.map(shape) }
}

export async function getIssue(id) {
  if (!UUID.test(String(id))) throw httpError('No such issue.', { status: 404 })
  const { rows: [r] } = await query(`${SELECT} where i.id = $1`, [id])
  if (!r) throw httpError('No such issue.', { status: 404 })
  const { rows: events } = await query(
    `select e.from_status, e.to_status, e.note, e.created_at, s.full_name as staff
       from issue_events e left join staff_users s on s.id = e.staff_id
      where e.issue_id = $1 order by e.created_at, e.id`,
    [id]
  )
  return { ...shape(r), events }
}

/** Log a new issue against an order (by its order number or shipment ID). */
export async function createIssue(staff, body = {}) {
  requirePermission(staff, 'issues.manage')
  const ref = parseTrackingRef(body.order)
  if (!ref) throw httpError('Enter the order ID (CR-…) or shipment ID (SHP-…).')
  if (!ISSUE_TYPES[body.type]) throw httpError('Choose the type of issue.')
  const description = str(body.description)
  if (!description) throw httpError('Describe the issue.')
  if (description.length > 2000) throw httpError('Keep the description under 2000 characters.')
  return tx(async (db) => {
    const { rows: [order] } = ref.orderNumber
      ? await db.query('select id, status from orders where order_number = $1', [ref.orderNumber])
      : await db.query('select id, status from orders where shipment_id = $1', [ref.shipmentId])
    if (!order || order.status === 'pending_payment') throw httpError('No paid order with that ID.', { status: 404 })
    const { rows: [issue] } = await db.query(
      `insert into order_issues (order_id, type, description, created_by) values ($1, $2, $3, $4) returning *`,
      [order.id, body.type, description, staff.id]
    )
    await db.query(`insert into issue_events (issue_id, to_status, note, staff_id) values ($1, 'open', 'Issue logged', $2)`,
      [issue.id, staff.id])
    await audit(db, staff, 'issue.create', 'issue', issue.id, { type: body.type })
    return { id: issue.id, ref: issueRef(issue.issue_no) }
  })
}

/**
 * Move an issue along (open → under review → resolved, or back) and/or add a
 * note. Resolving needs a resolution in words.
 */
export async function updateIssue(staff, id, body = {}) {
  requirePermission(staff, 'issues.manage')
  if (!UUID.test(String(id))) throw httpError('No such issue.', { status: 404 })
  const to = body.status
  const note = str(body.note).slice(0, 2000) || null
  if (to && !STATUSES.includes(to)) throw httpError('Unknown status.')
  if (!to && !note) throw httpError('Nothing to change.')
  return tx(async (db) => {
    const { rows: [issue] } = await db.query('select * from order_issues where id = $1 for update', [id])
    if (!issue) throw httpError('No such issue.', { status: 404 })
    if (to && to !== issue.status) {
      if (to === 'resolved' && !note && !issue.resolution) throw httpError('Say how it was resolved.')
      await db.query(
        `update order_issues set status = $2,
                resolution = case when $2 = 'resolved' then coalesce($3, resolution) else resolution end,
                resolved_at = case when $2 = 'resolved' then now() else null end
          where id = $1`,
        [id, to, note]
      )
    }
    await db.query(
      `insert into issue_events (issue_id, from_status, to_status, note, staff_id) values ($1, $2, $3, $4, $5)`,
      [id, issue.status, to && to !== issue.status ? to : null, note, staff.id]
    )
    await audit(db, staff, 'issue.update', 'issue', id, { to, note: Boolean(note) })
    return { ok: true }
  })
}
