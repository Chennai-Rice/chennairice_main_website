// Applies the official price list to the sales database.
//
//   npm run db:prices                    prices only
//   npm run db:prices -- --stock 100     ALSO sets 100 packs of every priced
//                                        size in stock (local databases only)
//
// "Regional delivered price" sheets (Oct 2026): Tamil Nadu, South, North and
// North East, 5 kg packs only. For every pack the sheets take the list price
// (from the price list of 09-10-2026) and:
//   absorbed      = ₹111 of the delivery cost, carried in the price
//                   (less for packs where that would cross MRP)
//   website price = list price + absorbed                (what the pack costs)
//   delivery      = region's delivery cost − absorbed, rounded to the rupee
// The region comes from the customer's PIN code at checkout
// (lib/sales/regions.js). The website shows MRP struck through, the website
// price, and the delivery charge per pack. Prices include GST.
//
// What it does, and it is safe to re-run:
//   - creates any pack size on the list that does not exist yet
//   - sets each listed size's website price, MRP and delivery charge
//   - pack sizes NOT on the list are switched off (10 kg, 26 kg for now)
//   - products NOT on the list get no price: shown out of stock, refused at checkout
//   - sets up the four delivery regions; PIN codes outside them are refused
// Changes apply to new orders only; existing orders keep the price they paid.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from '../lib/db.js'
import { moveStock } from '../lib/sales/stock.js'
import { defaultTaxRateBp, skuFor } from './seed.js'

export const EFFECTIVE_FROM = '2026-10-13'

// From the sheets: the part of the delivery cost carried in the website price,
// and each region's delivery cost for one 5 kg pack (courier cost + 18% GST).
export const ABSORBED_RUPEES = 111
export const REGION_DELIVERY_RUPEES = {
  TN: 165.2,     // ₹140 + GST
  SOUTH: 264.32, // ₹224 + GST
  NORTH: 396.48, // ₹336 + GST
  NE: 528.64,    // ₹448 + GST
}
const REGION_NAMES = { TN: 'Tamil Nadu', SOUTH: 'South India', NORTH: 'North India', NE: 'North East' }

// slug → { packKg: [list price, MRP, absorbed (optional, else ₹111 capped at
// MRP)] }. Item and variety as on the sheet.
export const PRICE_LIST = {
  'vintage': { 5: [471, 619] },             // Vintage Spl Ponni · JSR Kolam
  'special-rajabhogam': { 5: [441, 599] },  // Chennai Rice · Vada Kolam Kitchidi Ponni (red bag)
  'vijaya-nagaram': { 5: [471, 619] },      // Vijayanagaram · Shikaripura Amaan Ponni
  'united-5kg': { 5: [471, 619] },          // United · Shikaripura Amaan Ponni
  'viruchagam': { 5: [471, 619] },          // Viruchagam · Shikaripura Amaan Ponni
  'nayara-super-aged': { 5: [471, 619] },   // Nayara · Akshaya Amman Ponni
  'a1-special-ponni': { 5: [471, 619] },    // A1 Ponni Rice · Akshaya Amman Ponni
  'chennai-bullets': { 5: [441, 599] },     // Chennai Bullets · TN RNR / Kodad Bapatla / KA KNM
  'alibaba': { 5: [441, 599] },             // Alibaba · TN RNR / Kodad Bapatla / KA KNM
  'special-idly-rice': { 5: [255, 349, 85] }, // Special Idly Rice (Pink) 5 kg · Kalli Muthan kar (sheet: ₹85 absorbed)
  'kitchidi-ponni-rice': { 5: [444, 599] }, // Chennai Rice Premium Kitchidi Ponni Rice (pink bag)
  // Broken Rice (Jeera Old) is on the sheet but not sold online.
}

/** Website price, absorbed part and delivery charge per region (₹) for one pack. */
export function packPricing(listPrice, mrp, absorbed = Math.min(ABSORBED_RUPEES, mrp - listPrice)) {
  const website = listPrice + absorbed
  if (website > mrp) throw new Error(`Website price ₹${website} would be above MRP ₹${mrp}.`)
  const delivery = Object.fromEntries(Object.entries(REGION_DELIVERY_RUPEES)
    .map(([code, cost]) => [code, Math.max(0, Math.round(cost - absorbed))]))
  return { website, mrp, absorbed, delivery }
}

// On the price list and added after the first catalog: created if missing,
// and shown in the shop with its pack photo.
const NEW_PRODUCTS = {
  'special-idly-rice': {
    name: 'Special Idly Rice', tag: 'Idly Rice',
    description: 'Idly rice in our pink pack, for soft, fluffy idlis and crisp dosas.',
    image: '/assets/shop/packs/special-idly-rice-v2.png',
  },
  // The contest pack: listed first in the shop.
  'kitchidi-ponni-rice': {
    name: 'Kitchidi Ponni Rice', tag: '1 Year Aged',
    description: "Kitchidi Ponni, aged for a year, in our Chennai Rice premium pack. From Mother's Hands to Your Heart.",
    image: '/assets/shop/packs/kitchidi-ponni-rice.png',
    displayOrder: 0,
  },
}

export async function applyPriceList({ pool, stock = 0, log = console.log } = {}) {
  pool = pool || (await getPool())
  if (stock && process.env.CLOUD_SQL_INSTANCE) throw new Error('--stock is for local databases only.')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows: [loc] } = await client.query('select id from stock_locations where is_fulfilment')

    for (const [slug, info] of Object.entries(NEW_PRODUCTS)) {
      await client.query(
        `insert into products (slug, name, tag, description, image_url, is_active, display_order)
         values ($1, $2, $3, $4, $5, true, coalesce($6, (select coalesce(max(display_order), 0) + 1 from products)))
         on conflict (slug) do update set image_url = excluded.image_url, description = excluded.description,
                                          is_active = true`,
        [slug, info.name, info.tag, info.description, info.image, info.displayOrder ?? null]
      )
    }

    // Delivery regions, chosen by PIN code. Every other zone (the old free
    // "All India" default) is switched off.
    for (const [code, rupees] of Object.entries(REGION_DELIVERY_RUPEES)) {
      await client.query(
        `insert into shipping_zones (code, name, is_default, is_active, pack_delivery_cost_paise)
         values ($1, $2, false, true, $3)
         on conflict (code) do update set name = excluded.name, is_active = true,
                                          pack_delivery_cost_paise = excluded.pack_delivery_cost_paise`,
        [code, REGION_NAMES[code], Math.round(rupees * 100)]
      )
    }
    await client.query(`update shipping_zones set is_active = false, is_default = false where not (code = any($1))`,
      [Object.keys(REGION_DELIVERY_RUPEES)])
    log(`  Delivery regions: ${Object.entries(REGION_DELIVERY_RUPEES).map(([c, r]) => `${REGION_NAMES[c]} ₹${r}`).join(', ')}`)

    const { rows: products } = await client.query('select id, slug, name, is_active from products')
    for (const p of products) {
      const prices = PRICE_LIST[p.slug]
      if (!prices) {
        await client.query('update product_variants set price_paise = null where product_id = $1', [p.id])
        log(`  ${p.name}: not on the price list, shown as out of stock`)
        continue
      }
      // Sizes no longer on the list are switched off rather than deleted,
      // because past orders still point at them.
      await client.query('update product_variants set is_active = false where product_id = $1 and not (pack_kg = any($2))',
        [p.id, Object.keys(prices).map(Number)])
      const shown = []
      for (const [kg, [listPrice, mrp, absorbedRupees]] of Object.entries(prices)) {
        const packKg = Number(kg)
        const { website, absorbed, delivery } = packPricing(listPrice, mrp, absorbedRupees)
        const { rows: [v] } = await client.query(
          `insert into product_variants (product_id, sku, pack_kg, price_paise, mrp_paise, delivery_absorbed_paise, tax_rate_bp, reorder_level, is_active)
           values ($1, $2, $3, $4, $5, $6, $7, 20, true)
           on conflict (product_id, pack_kg) do update
             set price_paise = excluded.price_paise, mrp_paise = excluded.mrp_paise,
                 delivery_absorbed_paise = excluded.delivery_absorbed_paise, is_active = true
           returning id`,
          [p.id, skuFor(p.slug, packKg), packKg, website * 100, mrp * 100, absorbed * 100, defaultTaxRateBp(packKg)]
        )
        shown.push(`${kg} kg MRP ₹${mrp} → ₹${website} + delivery TN ₹${delivery.TN} · South ₹${delivery.SOUTH} · North ₹${delivery.NORTH} · NE ₹${delivery.NE}`)
        if (stock && loc) {
          const { rows: [lvl] } = await client.query(
            'select on_hand, reserved from stock_levels where location_id = $1 and variant_id = $2', [loc.id, v.id])
          const delta = Math.max(stock, lvl?.reserved || 0) - (lvl?.on_hand || 0)
          if (delta) {
            await moveStock(client, { locationId: loc.id, variantId: v.id, type: 'adjustment', onHand: delta, reason: 'Local test stock' })
          }
        }
      }
      log(`  ${p.name}: ${shown.join(', ')}${p.is_active ? '' : '  (hidden: no pack photo yet)'}`)
    }
    await client.query('commit')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--stock')
  const stock = i > -1 ? Number(process.argv[i + 1]) || 0 : 0
  console.log(`Applying price list effective ${EFFECTIVE_FROM}`)
  applyPriceList({ stock })
    .then(() => closePool())
    .catch(async (err) => {
      console.error('Price list failed:', err.message)
      await closePool()
      process.exit(1)
    })
}
