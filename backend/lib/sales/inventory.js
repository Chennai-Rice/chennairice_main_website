// Inventory, plant production and catalog administration.
import { tx, query } from '../db.js'
import { moveStock } from './stock.js'
import { audit, requirePermission } from './staff.js'
import { httpError, str, toPaise, toRupees, istDateStamp, randomCode } from './util.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function positiveInt(value, what) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0 || n > 100000) throw httpError(what + ' must be a whole number above zero.')
  return n
}

async function variantOrThrow(db, id) {
  if (!UUID.test(String(id))) throw httpError('No such pack.', { status: 404 })
  const { rows: [v] } = await db.query(
    'select v.*, p.name as product_name from product_variants v join products p on p.id = v.product_id where v.id = $1', [id])
  if (!v) throw httpError('No such pack.', { status: 404 })
  return v
}

async function locationOrDefault(db, id) {
  if (id) {
    if (!UUID.test(String(id))) throw httpError('No such location.', { status: 404 })
    const { rows: [l] } = await db.query('select * from stock_locations where id = $1 and is_active', [id])
    if (!l) throw httpError('No such location.', { status: 404 })
    return l
  }
  const { rows: [l] } = await db.query('select * from stock_locations where is_fulfilment')
  if (!l) throw httpError('No fulfilment location is set up.', { status: 503 })
  return l
}

// ---- stock -------------------------------------------------------------------

export async function listStock() {
  const { rows } = await query(
    `select v.id as variant_id, p.name as product_name, v.sku, v.pack_kg, v.reorder_level, v.is_active,
            l.id as location_id, l.name as location_name, l.is_fulfilment,
            coalesce(s.on_hand, 0) as on_hand, coalesce(s.reserved, 0) as reserved, coalesce(s.damaged, 0) as damaged,
            coalesce(s.on_hand - s.reserved, 0) as available
       from product_variants v
       join products p on p.id = v.product_id
       cross join stock_locations l
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where l.is_active
      order by p.display_order, p.name, v.pack_kg, l.is_fulfilment desc, l.name`
  )
  return rows.map((r) => ({ ...r, low: r.is_fulfilment && r.reorder_level > 0 && r.available <= r.reorder_level }))
}

export async function listMovements({ variantId, limit = 100 } = {}) {
  const params = []
  let where = ''
  if (variantId) {
    if (!UUID.test(String(variantId))) throw httpError('No such pack.', { status: 404 })
    params.push(variantId)
    where = 'where m.variant_id = $1'
  }
  params.push(Math.min(Number(limit) || 100, 500))
  const { rows } = await query(
    `select m.*, v.sku, l.name as location_name, s.full_name as staff_name, o.order_number, b.batch_no
       from stock_movements m
       join product_variants v on v.id = m.variant_id
       join stock_locations l on l.id = m.location_id
       left join staff_users s on s.id = m.staff_id
       left join orders o on o.id = m.order_id
       left join production_batches b on b.id = m.batch_id
      ${where}
      order by m.created_at desc, m.id desc limit $${params.length}`,
    params
  )
  return rows
}

/** Correct a count after a physical stock-take. delta may be negative. */
export async function adjustStock(staff, body) {
  requirePermission(staff, 'inventory.adjust')
  const delta = Number(body?.delta)
  if (!Number.isInteger(delta) || delta === 0) throw httpError('Change must be a whole number, not zero.')
  const reason = str(body?.reason)
  if (!reason) throw httpError('Please give a reason for the adjustment.')
  return tx(async (db) => {
    const v = await variantOrThrow(db, body?.variantId)
    const loc = await locationOrDefault(db, body?.locationId)
    await moveStock(db, { locationId: loc.id, variantId: v.id, type: 'adjustment', onHand: delta, reason, staffId: staff.id })
    await audit(db, staff, 'stock.adjust', 'variant', v.id, { delta, reason, location: loc.code })
    return { ok: true }
  })
}

/** Move sellable packs to damaged (torn bag, pests, water). */
export async function markDamaged(staff, body) {
  requirePermission(staff, 'inventory.adjust')
  const quantity = positiveInt(body?.quantity, 'Quantity')
  const reason = str(body?.reason)
  if (!reason) throw httpError('Please say what happened.')
  return tx(async (db) => {
    const v = await variantOrThrow(db, body?.variantId)
    const loc = await locationOrDefault(db, body?.locationId)
    await moveStock(db, { locationId: loc.id, variantId: v.id, type: 'damage', onHand: -quantity, damaged: quantity, reason, staffId: staff.id })
    await audit(db, staff, 'stock.damage', 'variant', v.id, { quantity, reason })
    return { ok: true }
  })
}

export async function transferStock(staff, body) {
  requirePermission(staff, 'inventory.adjust')
  const quantity = positiveInt(body?.quantity, 'Quantity')
  return tx(async (db) => {
    const v = await variantOrThrow(db, body?.variantId)
    const from = await locationOrDefault(db, body?.fromLocationId)
    const to = await locationOrDefault(db, body?.toLocationId)
    if (from.id === to.id) throw httpError('Pick two different locations.')
    const reason = str(body?.reason) || `${from.name} → ${to.name}`
    await moveStock(db, { locationId: from.id, variantId: v.id, type: 'transfer_out', onHand: -quantity, reason, staffId: staff.id })
    await moveStock(db, { locationId: to.id, variantId: v.id, type: 'transfer_in', onHand: quantity, reason, staffId: staff.id })
    await audit(db, staff, 'stock.transfer', 'variant', v.id, { quantity, from: from.code, to: to.code })
    return { ok: true }
  })
}

export async function listLocations() {
  const { rows } = await query('select * from stock_locations order by is_fulfilment desc, name')
  return rows
}

export async function createLocation(staff, body) {
  requirePermission(staff, 'settings.manage')
  const code = str(body?.code).toUpperCase()
  const name = str(body?.name)
  if (!/^[A-Z0-9_]{2,30}$/.test(code)) throw httpError('Code: 2–30 letters, digits or _.')
  if (!name) throw httpError('A name is required.')
  const { rows: [row] } = await query(
    `insert into stock_locations (code, name, address) values ($1, $2, $3) on conflict (code) do nothing returning *`,
    [code, name, str(body?.address) || null]
  )
  if (!row) throw httpError('That code is taken.', { status: 409 })
  return row
}

// ---- plant -------------------------------------------------------------------

/** The plant records a packed batch; it goes straight into sellable stock. */
export async function recordProduction(staff, body) {
  requirePermission(staff, 'production.create')
  const quantity = positiveInt(body?.quantity, 'Quantity')
  const packedOn = str(body?.packedOn) || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const bestBefore = str(body?.bestBefore) || null
  if (!DATE.test(packedOn) || (bestBefore && !DATE.test(bestBefore))) throw httpError('Dates must be YYYY-MM-DD.')
  const batchNo = str(body?.batchNo).toUpperCase() || 'B' + istDateStamp() + '-' + randomCode(2)
  if (batchNo.length > 40) throw httpError('Batch number is too long.')
  return tx(async (db) => {
    const v = await variantOrThrow(db, body?.variantId)
    const loc = await locationOrDefault(db, body?.locationId)
    const { rows: [batch] } = await db.query(
      `insert into production_batches (batch_no, variant_id, location_id, quantity, packed_on, best_before, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (batch_no) do nothing returning *`,
      [batchNo, v.id, loc.id, quantity, packedOn, bestBefore, str(body?.notes) || null, staff.id]
    )
    if (!batch) throw httpError('Batch ' + batchNo + ' already exists.', { status: 409 })
    await moveStock(db, { locationId: loc.id, variantId: v.id, type: 'production_in', onHand: quantity, batchId: batch.id, reason: 'Batch ' + batchNo, staffId: staff.id })
    await audit(db, staff, 'production.create', 'batch', batch.id, { batchNo, quantity, sku: v.sku })
    return batch
  })
}

export async function listBatches({ variantId, limit = 100 } = {}) {
  const params = [Math.min(Number(limit) || 100, 500)]
  let where = ''
  if (variantId) {
    if (!UUID.test(String(variantId))) throw httpError('No such pack.', { status: 404 })
    params.push(variantId)
    where = 'where b.variant_id = $2'
  }
  const { rows } = await query(
    `select b.*, v.sku, p.name as product_name, v.pack_kg, l.name as location_name, s.full_name as created_by_name
       from production_batches b
       join product_variants v on v.id = b.variant_id
       join products p on p.id = v.product_id
       join stock_locations l on l.id = b.location_id
       left join staff_users s on s.id = b.created_by
      ${where}
      order by b.packed_on desc, b.created_at desc limit $1`,
    params
  )
  return rows
}

/**
 * What the plant should pack next: for each pack, open orders still to ship,
 * stock available, and the shortfall against the reorder level.
 */
export async function demandBoard() {
  const { rows } = await query(
    `select v.id as variant_id, p.name as product_name, v.sku, v.pack_kg, v.reorder_level,
            coalesce(s.on_hand, 0) as on_hand, coalesce(s.reserved, 0) as reserved,
            coalesce(s.on_hand - s.reserved, 0) as available,
            coalesce((select sum(i.quantity) from order_items i join orders o on o.id = i.order_id
                       where i.variant_id = v.id and o.status in ('placed', 'confirmed', 'packed')), 0)::int as open_order_packs
       from product_variants v
       join products p on p.id = v.product_id
       left join stock_locations l on l.is_fulfilment
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where v.is_active and p.is_active
      order by p.display_order, v.pack_kg`
  )
  return rows.map((r) => ({ ...r, suggested_production: Math.max(0, r.reorder_level - r.available) }))
}

// ---- catalog ------------------------------------------------------------------

export async function listCatalogAdmin() {
  const { rows } = await query(
    `select p.id as product_id, p.slug, p.name, p.tag, p.is_active as product_active, p.display_order,
            v.id as variant_id, v.sku, v.pack_kg, v.price_paise, v.mrp_paise, v.hsn_code, v.tax_rate_bp,
            v.reorder_level, v.is_active
       from products p left join product_variants v on v.product_id = p.id
      order by p.display_order, p.name, v.pack_kg`
  )
  return rows.map((r) => ({
    ...r,
    price: r.price_paise == null ? null : toRupees(r.price_paise),
    mrp: r.mrp_paise == null ? null : toRupees(r.mrp_paise),
  }))
}

function rupeesOrNull(value, what) {
  if (value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || n > 1000000) throw httpError(what + ' must be a positive amount in rupees.')
  return toPaise(n)
}

/** Price, MRP, GST rate, reorder level, on/off. Changes affect new orders only. */
export async function updateVariant(staff, id, body) {
  requirePermission(staff, 'catalog.edit')
  return tx(async (db) => {
    const v = await variantOrThrow(db, id)
    const next = {
      price_paise: 'price' in (body || {}) ? rupeesOrNull(body.price, 'Price') : v.price_paise,
      mrp_paise: 'mrp' in (body || {}) ? rupeesOrNull(body.mrp, 'MRP') : v.mrp_paise,
      tax_rate_bp: v.tax_rate_bp,
      reorder_level: v.reorder_level,
      hsn_code: v.hsn_code,
      is_active: typeof body?.isActive === 'boolean' ? body.isActive : v.is_active,
    }
    if (body?.taxRatePercent != null) {
      const pct = Number(body.taxRatePercent)
      if (![0, 5, 12, 18].includes(pct)) throw httpError('GST rate must be 0, 5, 12 or 18%.')
      next.tax_rate_bp = pct * 100
    }
    if (body?.reorderLevel != null) {
      const r = Number(body.reorderLevel)
      if (!Number.isInteger(r) || r < 0) throw httpError('Reorder level must be a whole number.')
      next.reorder_level = r
    }
    if (body?.hsnCode != null) {
      if (!/^\d{4,8}$/.test(String(body.hsnCode))) throw httpError('HSN code is 4 to 8 digits.')
      next.hsn_code = String(body.hsnCode)
    }
    if (next.mrp_paise != null && next.price_paise != null && next.price_paise > next.mrp_paise) {
      throw httpError('Price cannot be above MRP.')
    }
    const { rows: [row] } = await db.query(
      `update product_variants set price_paise = $2, mrp_paise = $3, tax_rate_bp = $4, reorder_level = $5,
              hsn_code = $6, is_active = $7 where id = $1 returning *`,
      [v.id, next.price_paise, next.mrp_paise, next.tax_rate_bp, next.reorder_level, next.hsn_code, next.is_active]
    )
    await audit(db, staff, 'catalog.variant.update', 'variant', v.id, {
      before: { price_paise: v.price_paise, mrp_paise: v.mrp_paise, tax_rate_bp: v.tax_rate_bp, is_active: v.is_active },
      after: { price_paise: row.price_paise, mrp_paise: row.mrp_paise, tax_rate_bp: row.tax_rate_bp, is_active: row.is_active },
    })
    return row
  })
}

export async function createProduct(staff, body) {
  requirePermission(staff, 'catalog.edit')
  const slug = str(body?.slug).toLowerCase()
  const name = str(body?.name)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || /-\d+kg$/.test(slug)) throw httpError('Slug: lowercase words joined by hyphens, not ending in a pack size.')
  if (!name) throw httpError('A name is required.')
  return tx(async (db) => {
    const { rows: [p] } = await db.query(
      `insert into products (slug, name, tag, description, image_url, display_order)
       values ($1, $2, $3, $4, $5, coalesce($6, (select coalesce(max(display_order), 0) + 1 from products)))
       on conflict (slug) do nothing returning *`,
      [slug, name, str(body?.tag) || null, str(body?.description) || null, str(body?.imageUrl) || null,
        body?.displayOrder == null ? null : Number(body.displayOrder)]
    )
    if (!p) throw httpError('That slug is taken.', { status: 409 })
    await audit(db, staff, 'catalog.product.create', 'product', p.id, { slug })
    return p
  })
}

export async function createVariant(staff, productId, body) {
  requirePermission(staff, 'catalog.edit')
  if (!UUID.test(String(productId))) throw httpError('No such product.', { status: 404 })
  const packKg = Number(body?.packKg)
  if (!(packKg > 0 && packKg <= 100)) throw httpError('Pack size must be between 0 and 100 kg.')
  return tx(async (db) => {
    const { rows: [p] } = await db.query('select * from products where id = $1', [productId])
    if (!p) throw httpError('No such product.', { status: 404 })
    const sku = 'CR-' + p.slug.toUpperCase() + '-' + packKg + 'KG'
    const { rows: [v] } = await db.query(
      `insert into product_variants (product_id, sku, pack_kg, price_paise, mrp_paise, tax_rate_bp)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning *`,
      [p.id, sku, packKg, rupeesOrNull(body?.price ?? null, 'Price'), rupeesOrNull(body?.mrp ?? null, 'MRP'),
        packKg <= 25 ? 500 : 0]
    )
    if (!v) throw httpError('That pack size already exists.', { status: 409 })
    await audit(db, staff, 'catalog.variant.create', 'variant', v.id, { sku })
    return v
  })
}
