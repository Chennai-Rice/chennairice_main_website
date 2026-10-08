// Catalog reads and cart pricing.
//
// The browser never sets a price. A posted cart is read only as "which pack,
// how many"; every paisa is looked up here from product_variants.
import { httpError, str, isSameState, getSettings, toRupees } from './util.js'
import { splitInclusive } from './tax.js'

export const MAX_QTY_PER_LINE = 50
export const MAX_LINES = 20

// Cart line ids are the product slug, optionally with the pack size:
// "rudra" (the card's default pack) or "rudra-25kg" (picked on the detail page).
const PACK_SUFFIX = /-(\d+(?:\.\d+)?)kg$/i

export function parseCartLineId(id) {
  const raw = str(id)
  const match = raw.match(PACK_SUFFIX)
  if (!match) return { slug: raw, packKg: null }
  return { slug: raw.slice(0, match.index), packKg: Number(match[1]) }
}

/** Public catalog: active products, their packs, price and whether in stock. */
export async function listCatalog(db) {
  const { rows } = await db.query(
    `select p.id, p.slug, p.name, p.tag, p.description, p.image_url, p.display_order,
            v.id as variant_id, v.sku, v.pack_kg, v.price_paise, v.mrp_paise,
            coalesce(s.on_hand - s.reserved, 0) as available
       from products p
       join product_variants v on v.product_id = p.id and v.is_active
       left join stock_locations l on l.is_fulfilment
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where p.is_active
      order by p.display_order, p.name, v.pack_kg`
  )
  const bySlug = new Map()
  for (const r of rows) {
    if (!bySlug.has(r.slug)) {
      bySlug.set(r.slug, {
        slug: r.slug, name: r.name, tag: r.tag, description: r.description, image: r.image_url, variants: [],
      })
    }
    bySlug.get(r.slug).variants.push({
      id: r.slug + '-' + r.pack_kg + 'kg',
      sku: r.sku,
      packKg: r.pack_kg,
      price: r.price_paise == null ? null : toRupees(r.price_paise),
      mrp: r.mrp_paise == null ? null : toRupees(r.mrp_paise),
      inStock: r.price_paise != null && r.available > 0,
    })
  }
  return [...bySlug.values()]
}

/**
 * Turn a posted cart into priced lines. Anything unknown, inactive, unpriced or
 * short of stock fails the whole cart: a customer must never pay for a basket
 * different from the one they reviewed.
 */
export async function priceCart(db, items, { shipState } = {}) {
  if (!Array.isArray(items) || items.length === 0) throw httpError('Your cart is empty.')
  if (items.length > MAX_LINES) throw httpError('That is more different packs than we can take in one order.')

  const wanted = []
  for (const item of items) {
    const { slug, packKg } = parseCartLineId(item?.id)
    const qty = Math.floor(Number(item?.qty))
    if (!slug) throw httpError('One of the items in your cart is not recognised.')
    if (!Number.isFinite(qty) || qty < 1) throw httpError('Every item needs a quantity of at least 1.')
    wanted.push({ slug, packKg, qty })
  }

  const slugs = [...new Set(wanted.map((w) => w.slug))]
  const { rows } = await db.query(
    `select p.slug, p.name, p.is_active as product_active,
            v.id, v.sku, v.pack_kg, v.price_paise, v.hsn_code, v.tax_rate_bp, v.is_active,
            coalesce(s.on_hand - s.reserved, 0) as available
       from products p
       join product_variants v on v.product_id = p.id
       left join stock_locations l on l.is_fulfilment
       left join stock_levels s on s.variant_id = v.id and s.location_id = l.id
      where p.slug = any($1)`,
    [slugs]
  )

  // Merge duplicate lines for the same pack before applying the per-line cap.
  const lines = new Map()
  for (const w of wanted) {
    const packs = rows.filter((r) => r.slug === w.slug && r.is_active && r.product_active)
    if (!packs.length) throw httpError('"' + w.slug + '" is no longer available. Please remove it from your cart.')
    // No size in the id: the 10 kg pack if there is one, else the only pack.
    const variant =
      w.packKg != null
        ? packs.find((r) => r.pack_kg === w.packKg)
        : packs.find((r) => r.pack_kg === 10) || (packs.length === 1 ? packs[0] : null)
    if (!variant) {
      throw httpError('That pack size of ' + packs[0].name + ' is no longer available.')
    }
    const line = lines.get(variant.id) || { variant, qty: 0 }
    line.qty += w.qty
    if (line.qty > MAX_QTY_PER_LINE) {
      throw httpError('Please order at most ' + MAX_QTY_PER_LINE + ' of any one pack. For larger volumes, use our bulk order form.')
    }
    lines.set(variant.id, line)
  }

  const settings = await getSettings(db)
  const intraState = shipState ? isSameState(shipState, settings.seller_state || 'Tamil Nadu') : true

  const priced = []
  let subtotal = 0
  let tax = 0
  let totalKg = 0
  for (const { variant: v, qty } of lines.values()) {
    if (v.price_paise == null) {
      throw httpError(v.name + ' (' + v.pack_kg + ' kg) is not available to order online yet.', { status: 409 })
    }
    if (v.available < qty) {
      throw httpError(
        v.available > 0
          ? 'We only have ' + v.available + ' of the ' + v.pack_kg + ' kg ' + v.name + ' left.'
          : v.name + ' (' + v.pack_kg + ' kg) is out of stock right now.',
        { status: 409 }
      )
    }
    const lineTotal = v.price_paise * qty
    const split = splitInclusive(lineTotal, v.tax_rate_bp, intraState)
    subtotal += lineTotal
    tax += split.tax
    totalKg += v.pack_kg * qty
    priced.push({
      variantId: v.id,
      slug: v.slug,
      name: v.name,
      sku: v.sku,
      packKg: v.pack_kg,
      hsnCode: v.hsn_code,
      taxRateBp: v.tax_rate_bp,
      unitPricePaise: v.price_paise,
      quantity: qty,
      lineTotalPaise: lineTotal,
      ...split,
    })
  }

  return { lines: priced, subtotalPaise: subtotal, taxPaise: tax, totalKg, intraState }
}

/** Delivery charge for a state and basket. Zones are seeded free (₹0). */
export async function quoteShipping(db, { state, subtotalPaise, totalKg }) {
  const { rows } = await db.query(
    `select * from shipping_zones where is_active
      order by (lower($1) = any(select lower(x) from unnest(states) x)) desc, is_default desc
      limit 1`,
    [str(state)]
  )
  const zone = rows[0]
  if (!zone) return 0
  if (zone.free_above_paise != null && subtotalPaise >= zone.free_above_paise) return 0
  return Math.max(zone.min_fee_paise, Math.round(zone.rate_per_kg_paise * totalKg))
}
