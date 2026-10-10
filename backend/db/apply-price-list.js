// Applies the official price list to the sales database.
//
//   npm run db:prices                    prices only
//   npm run db:prices -- --stock 100     ALSO sets 100 packs of every priced
//                                        size in stock (local databases only)
//
// Price list "New Price List Effect From 09-10-2026" (CRIIPL). Prices are the
// customer price per pack, in rupees; the list notes GST is included on the
// 5 kg and 10 kg packs. Sizes a product no longer has on the list (e.g. the
// Idly Rice 10/26 kg) are switched off, not deleted.
//
// What it does, and it is safe to re-run:
//   - creates any pack size on the list that does not exist yet
//   - sets each listed size's price
//   - packs NOT on the list get no price, so the shop shows them out of stock
//     and checkout refuses them
// Changes apply to new orders only; existing orders keep the price they paid.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from '../lib/db.js'
import { moveStock } from '../lib/sales/stock.js'
import { defaultTaxRateBp, skuFor } from './seed.js'

export const EFFECTIVE_FROM = '2026-10-09'

// slug → { packKg: price }. Item and variety as on the price list in comments.
export const PRICE_LIST = {
  'vintage': { 5: 471, 10: 930, 26: 2249 },            // Vintage Spl Ponni · JSR Kolam
  'special-rajabhogam': { 5: 441, 10: 870, 26: 2099 }, // Chennai Rice · Vada Kolam Kitchidi Ponni
  'vijaya-nagaram': { 5: 471, 10: 930, 26: 2249 },     // Vijayanagaram · Shikaripura Amaan Ponni
  'united-5kg': { 5: 471, 10: 930, 26: 2249 },         // United · Shikaripura Amaan Ponni
  'viruchagam': { 5: 471, 10: 930, 26: 2249 },         // Viruchagam · Shikaripura Amaan Ponni
  'nayara-super-aged': { 5: 471, 10: 930, 26: 2249 },  // Nayara · Akshaya Amman Ponni
  'a1-special-ponni': { 5: 471, 10: 930, 26: 2249 },   // A1 Ponni Rice · Akshaya Amman Ponni
  'chennai-bullets': { 5: 441, 10: 870, 26: 2099 },    // Chennai Bullets · TN RNR / Kodad Bapatla / KA KNM
  'alibaba': { 5: 441, 10: 870, 26: 2099 },            // Alibaba · TN RNR / Kodad Bapatla / KA KNM
  'special-idly-rice': { 5: 255 },                     // OFFER: Special Idly Rice (Pink) 5 kg · Kalli Muthan kar
  'kitchidi-ponni-rice': { 5: 444, 26: 2099 },         // OFFER: Chennai Rice Premium Kitchidi Ponni Rice
  // Broken Rice (Jeera Old, 26 kg, ₹1000) is on the list but not sold online.
}

// On the price list and added after the first catalog: created if missing,
// and shown in the shop with its pack photo.
const NEW_PRODUCTS = {
  'special-idly-rice': {
    name: 'Special Idly Rice', tag: 'Idly Rice',
    description: 'Idly rice in our pink pack, for soft, fluffy idlis and crisp dosas.',
    image: '/assets/shop/packs/special-idly-rice.png',
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
      for (const [kg, rupees] of Object.entries(prices)) {
        const packKg = Number(kg)
        const { rows: [v] } = await client.query(
          `insert into product_variants (product_id, sku, pack_kg, price_paise, tax_rate_bp, reorder_level, is_active)
           values ($1, $2, $3, $4, $5, 20, true)
           on conflict (product_id, pack_kg) do update set price_paise = excluded.price_paise, is_active = true
           returning id`,
          [p.id, skuFor(p.slug, packKg), packKg, Math.round(rupees * 100), defaultTaxRateBp(packKg)]
        )
        if (stock && loc) {
          const { rows: [lvl] } = await client.query(
            'select on_hand, reserved from stock_levels where location_id = $1 and variant_id = $2', [loc.id, v.id])
          const delta = Math.max(stock, lvl?.reserved || 0) - (lvl?.on_hand || 0)
          if (delta) {
            await moveStock(client, { locationId: loc.id, variantId: v.id, type: 'adjustment', onHand: delta, reason: 'Local test stock' })
          }
        }
      }
      log(`  ${p.name}: ${Object.entries(prices).map(([kg, r]) => `${kg} kg ₹${r}`).join(', ')}${p.is_active ? '' : '  (hidden: no pack photo yet)'}`)
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
