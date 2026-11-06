// Applies the official price list to the sales database.
//
//   npm run db:prices                    prices only
//   npm run db:prices -- --stock 100     ALSO sets 100 packs of every priced
//                                        size in stock (local databases only)
//
// "Regional delivered price" sheets (Oct 2026) for 5, 10 and 26 kg packs:
// Tamil Nadu, South, North and North East. For every pack the sheets take the
// list price (price list of 19-10-2026) and:
//   absorbed      = a fixed part of the delivery cost carried in the price
//                   (5 kg ₹111, 10 kg ₹120, 26 kg ₹250; less where that
//                   would cross MRP, or as the sheet sets for a pack)
//   MRP           = the bag's MRP + 60% of the Tamil Nadu delivery cost for
//                   that size (MRP_DELIVERY_SHARE), rounded to the rupee
//   website price = list price + absorbed, the same in every region, and
//                   never above that MRP or ₹2,800 (MAX_PACK_PRICE) for any bag
//   delivery      = the region's delivery cost for that pack size − absorbed,
//                   rounded to the rupee
// The region comes from the customer's PIN code at checkout
// (lib/sales/regions.js). One row per pack and region is written to
// variant_region_prices. The website shows MRP struck through, the website
// price, and the delivery charge per pack. Prices include GST.
//
// What it does, and it is safe to re-run:
//   - creates any pack size on the list that does not exist yet
//   - sets each listed size's website price and MRP, and its price and
//     delivery charge in every region
//   - pack sizes NOT on the list are switched off
//   - products NOT on the list get no price: shown out of stock, refused at checkout
//   - sets up the four delivery regions; PIN codes outside them are refused
// Changes apply to new orders only; existing orders keep the price they paid.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from '../lib/db.js'
import { moveStock } from '../lib/sales/stock.js'
import { defaultTaxRateBp, skuFor } from './seed.js'

export const EFFECTIVE_FROM = '2026-10-19'

// No bag is sold for more than this on the website, whatever its size.
export const MAX_PACK_PRICE = 2800

// The share of the Tamil Nadu delivery cost added to each bag's MRP (19-10-2026).
export const MRP_DELIVERY_SHARE = 0.6

const REGION_NAMES = { TN: 'Tamil Nadu', SOUTH: 'South India', NORTH: 'North India', NE: 'North East' }

// From the sheets, per pack size: each region's delivery cost for one pack
// (courier cost + 18% GST) and the part absorbed into the website price.
export const DELIVERY = {
  5: { absorbed: 111, cost: { TN: 165.2, SOUTH: 264.32, NORTH: 396.48, NE: 528.64 } },
  10: { absorbed: 120, cost: { TN: 330.4, SOUTH: 528.64, NORTH: 792.96, NE: 1057.28 } },
  26: { absorbed: 250, cost: { TN: 687.23, SOUTH: 1374.46, NORTH: 2061.7, NE: 3092.54 } },
}

// 26 kg packs from the "26 kg Pricing" sheet (Nov 2026): the MRP as the sheet gives it, a hidden part per
// product (₹99 to ₹179), and one courier charge for every product: Tamil Nadu ₹589 = the ₹687 courier cost
// less the ₹98 the price always carries, so the cost is recovered on every product. Other regions follow
// the same rule: their courier cost less ₹98.
export const SHEET_26 = { oldMrp: true, deliveryInPrice: 98, inHouse: 200 }

// 10 kg and 5 kg packs from the pricing sheets (Nov 2026), MRP as given:
//   10 kg: one courier charge for every product, Tamil Nadu ₹120 (other regions: their cost less the same
//          ₹210.40 Tamil Nadu leaves out); in-house ₹100 a bag.
//   5 kg:  courier = the region's cost less the hidden part (Tamil Nadu ₹165 − ₹75 = ₹90; Kitchidi ₹125);
//          in-house ₹49 a bag (Kitchidi ₹60).
export const SHEET_10 = { oldMrp: true, deliveryInPrice: 330.4 - 120, inHouse: 100 }
export const SHEET_5 = { oldMrp: true, inHouse: 49 }

// slug → { packKg: [list price, MRP before the delivery share, absorbed (only where the sheet differs
// from the size's usual amount), options] }. Options: oldMrp: true shows the MRP as given (no delivery
// share added); deliveryInPrice: the delivery charge is the region's cost less this (instead of less the
// absorbed part); inHouse: the in-house delivery charge for one bag (₹). Item and variety as on the sheets.
export const PRICE_LIST = {
  // Final website prices (Nov 2026), top bag to bottom: base, MRP, hidden (website price − base), and the
  // courier as before (5 kg: Tamil Nadu ₹90, Kitchidi ₹125; 10 kg ₹120; 26 kg ₹589), and the
  // in-house delivery a bag in Tamil Nadu (5 kg ₹50–90, 10 kg ₹90–110, 26 kg ₹110–150, top bag lowest).
  'kitchidi-ponni-rice': { 5: [515, 699, 40, { ...SHEET_5, deliveryInPrice: 40, inHouse: 50 }], 26: [2470, 2999, 29, { ...SHEET_26, inHouse: 110 }] }, // Chennai Rice Premium Kitchidi Ponni Rice (pink bag)
  'special-rajabhogam': { 5: [515, 699, 34, { ...SHEET_5, deliveryInPrice: 75, inHouse: 54 }], 10: [1020, 1299, 79, { ...SHEET_10, inHouse: 90 }], 26: [2470, 2999, 18, { ...SHEET_26, inHouse: 114 }] }, // Chennai Rice-Red-Raj.Ponni · Vada Kolam Kitchidi Ponni (red bag)
  'vintage': { 5: [515, 699, 24, { ...SHEET_5, deliveryInPrice: 75, inHouse: 58 }], 10: [1020, 1299, 68, { ...SHEET_10, inHouse: 92 }], 26: [2470, 2999, 7, { ...SHEET_26, inHouse: 118 }] }, // Vintage Spl Ponni · JSR Kolam
  'united-5kg': { 5: [501, 679, 28, { ...SHEET_5, deliveryInPrice: 75, inHouse: 62 }], 10: [990, 1279, 59, { ...SHEET_10, inHouse: 94 }], 26: [2400, 2899, 69, { ...SHEET_26, inHouse: 122 }] }, // United · Shikaripura Amaan Ponni
  'vijaya-nagaram': { 5: [501, 679, 26, { ...SHEET_5, deliveryInPrice: 75, inHouse: 66 }], 10: [990, 1279, 55, { ...SHEET_10, inHouse: 97 }], 26: [2400, 2899, 65, { ...SHEET_26, inHouse: 126 }] }, // Vijayanagaram · Shikaripura Amaan Ponni
  'viruchagam': { 5: [501, 679, 24, { ...SHEET_5, deliveryInPrice: 75, inHouse: 70 }], 10: [990, 1279, 45, { ...SHEET_10, inHouse: 99 }], 26: [2400, 2899, 55, { ...SHEET_26, inHouse: 130 }] }, // Viruchagam · Shikaripura Amaan Ponni
  'nayara-super-aged': { 5: [501, 679, 20, { ...SHEET_5, deliveryInPrice: 75, inHouse: 74 }], 10: [990, 1279, 40, { ...SHEET_10, inHouse: 101 }], 26: [2400, 2899, 44, { ...SHEET_26, inHouse: 134 }] }, // Nayara · Akshaya Amman Ponni
  'a1-special-ponni': { 5: [501, 679, 14, { ...SHEET_5, deliveryInPrice: 75, inHouse: 78 }], 10: [990, 1279, 39, { ...SHEET_10, inHouse: 103 }], 26: [2400, 2899, 39, { ...SHEET_26, inHouse: 138 }] }, // A1 Ponni Rice · Akshaya Amman Ponni
  'chennai-bullets': { 5: [501, 679, 11, { ...SHEET_5, deliveryInPrice: 75, inHouse: 82 }], 10: [990, 1279, 35, { ...SHEET_10, inHouse: 106 }], 26: [2400, 2899, 29, { ...SHEET_26, inHouse: 142 }] }, // Chennai Bullets · TN RNR / Kodad Bapatla / KA KNM
  'alibaba': { 5: [501, 679, 8, { ...SHEET_5, deliveryInPrice: 75, inHouse: 86 }], 10: [990, 1279, 29, { ...SHEET_10, inHouse: 108 }], 26: [2400, 2899, 19, { ...SHEET_26, inHouse: 146 }] }, // Alibaba · TN RNR / Kodad Bapatla / KA KNM
  'special-idly-rice': { 5: [295, 449, 4, { ...SHEET_5, deliveryInPrice: 75, inHouse: 90 }], 10: [566, 799, 33, { ...SHEET_10, inHouse: 110 }], 26: [1350, 1699, 49, { ...SHEET_26, inHouse: 150 }] }, // Special Idly Rice (Pink) · Kalli Muthan kar
  // Chennai Rice Jeera Rice (Jeera Old, 26 kg ₹1,200) is on the sheet but not sold online.
}

/** Website price, absorbed part and delivery charge per region (₹) for one pack. */
export function packPricing(packKg, listPrice, mrp, absorbed, { oldMrp = false, deliveryInPrice = null, inHouse = null } = {}) {
  const size = DELIVERY[packKg]
  if (!size) throw new Error(`No delivery costs for ${packKg} kg packs.`)
  if (!oldMrp) mrp += Math.round(size.cost.TN * MRP_DELIVERY_SHARE)
  const take = Math.max(0, Math.min(absorbed ?? size.absorbed, mrp - listPrice, MAX_PACK_PRICE - listPrice))
  const website = listPrice + take
  const offset = deliveryInPrice ?? take
  const delivery = Object.fromEntries(Object.entries(size.cost)
    .map(([code, cost]) => [code, Math.max(0, Math.round(cost - offset))]))
  return { website, mrp, absorbed: take, delivery, inHouse }
}

// On the price list and added after the first catalog: created if missing,
// and shown in the shop with its pack photo.
const NEW_PRODUCTS = {
  'special-idly-rice': {
    name: 'Special Idly Rice', tag: 'Idly Rice',
    description: 'Idly rice in our pink pack, for soft, fluffy idlis and crisp dosas.',
    image: '/assets/shop/packs/special-idly-rice-v3.png',
  },
  // The contest pack: listed first in the shop.
  'kitchidi-ponni-rice': {
    name: 'Kitchidi Ponni Rice', tag: '1 Year Aged',
    description: "Kitchidi Ponni, aged for a year, in our Chennai Rice premium pack. From Mother's Hands to Your Heart.",
    image: '/assets/shop/packs/kitchidi-ponni-rice-v3.png',
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
    for (const [code, name] of Object.entries(REGION_NAMES)) {
      await client.query(
        `insert into shipping_zones (code, name, is_default, is_active) values ($1, $2, false, true)
         on conflict (code) do update set name = excluded.name, is_active = true`,
        [code, name]
      )
    }
    await client.query(`update shipping_zones set is_active = false, is_default = false where not (code = any($1))`,
      [Object.keys(REGION_NAMES)])
    log(`  Delivery regions: ${Object.values(REGION_NAMES).join(', ')}`)

    const { rows: products } = await client.query('select id, slug, name, is_active from products')
    for (const p of products) {
      const prices = PRICE_LIST[p.slug]
      if (!prices) {
        await client.query('update product_variants set price_paise = null where product_id = $1', [p.id])
        await client.query('delete from variant_region_prices where variant_id in (select id from product_variants where product_id = $1)', [p.id])
        log(`  ${p.name}: not on the price list, shown as out of stock`)
        continue
      }
      // Sizes no longer on the list are switched off rather than deleted,
      // because past orders still point at them.
      await client.query('update product_variants set is_active = false where product_id = $1 and not (pack_kg = any($2))',
        [p.id, Object.keys(prices).map(Number)])
      await client.query(
        `delete from variant_region_prices where variant_id in
           (select id from product_variants where product_id = $1 and not (pack_kg = any($2)))`,
        [p.id, Object.keys(prices).map(Number)])
      const shown = []
      for (const [kg, [listPrice, bagMrp, absorbedRupees, opts]] of Object.entries(prices)) {
        const packKg = Number(kg)
        const { website, mrp, delivery, inHouse } = packPricing(packKg, listPrice, bagMrp, absorbedRupees, opts)
        const { rows: [v] } = await client.query(
          `insert into product_variants (product_id, sku, pack_kg, price_paise, mrp_paise, tax_rate_bp, reorder_level, is_active, in_house_paise)
           values ($1, $2, $3, $4, $5, $6, 20, true, $7)
           on conflict (product_id, pack_kg) do update
             set price_paise = excluded.price_paise, mrp_paise = excluded.mrp_paise, is_active = true,
                 in_house_paise = excluded.in_house_paise
           returning id`,
          [p.id, skuFor(p.slug, packKg), packKg, website * 100, mrp * 100, defaultTaxRateBp(packKg), inHouse == null ? null : Math.round(inHouse * 100)]
        )
        for (const [region, rupees] of Object.entries(delivery)) {
          await client.query(
            `insert into variant_region_prices (variant_id, region, price_paise, delivery_paise) values ($1, $2, $3, $4)
             on conflict (variant_id, region) do update
               set price_paise = excluded.price_paise, delivery_paise = excluded.delivery_paise`,
            [v.id, region, website * 100, rupees * 100]
          )
        }
        shown.push(`${kg} kg MRP ₹${mrp} → ₹${website} + delivery TN ${delivery.TN} · S ${delivery.SOUTH} · N ${delivery.NORTH} · NE ${delivery.NE}${inHouse == null ? '' : ' · in-house ' + inHouse}`)
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
