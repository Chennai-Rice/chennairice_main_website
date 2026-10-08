// Applies the official price list to the sales database.
//
//   npm run db:prices                    prices only
//   npm run db:prices -- --stock 100     ALSO sets 100 packs of every priced
//                                        size in stock (local databases only)
//
// Price list "New Price List Effect From 27-09-2026". Prices are the
// customer price per pack (GST-inclusive), in rupees.
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

export const EFFECTIVE_FROM = '2026-09-27'

// slug → { packKg: price }. Brand names as on the price list in comments.
export const PRICE_LIST = {
  'vintage': { 5: 451, 10: 889, 26: 2150 },            // Vintage Spl Ponni
  'special-rajabhogam': { 5: 420, 10: 828, 26: 1999 }, // Chennai Rice (the red Chennai Rice pack)
  'vijaya-nagaram': { 5: 420, 10: 828, 26: 1999 },     // Vijayanagaram
  'united-5kg': { 5: 420, 10: 828, 26: 1999 },         // United
  'viruchagam': { 5: 420, 10: 828, 26: 1999 },         // Viruchagam
  'nayara-super-aged': { 5: 420, 10: 828, 26: 1999 },  // Nayara
  'a1-special-ponni': { 5: 420, 10: 828, 26: 1999 },   // A1 Ponni Rice
  'chennai-bullets': { 26: 1900 },                     // Chennai Bullets
  'alibaba': { 5: 400, 10: 788, 26: 1900 },            // Alibaba
  'special-idly-rice': { 5: 290, 10: 566, 26: 1350 },  // Special Idly Rice (Pink)
  // Broken Rice (26 kg, ₹1000) is on the list but not sold online.
}

// On the price list but with no pack photo yet: priced, kept hidden from the
// shop until an image is added and the product is switched on.
const NEW_PRODUCTS = {
  'special-idly-rice': {
    name: 'Special Idly Rice', tag: 'Idly Rice',
    description: 'Special idly rice in the pink pack, for soft idlis and dosas.',
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
        `insert into products (slug, name, tag, description, is_active, display_order)
         values ($1, $2, $3, $4, false, (select coalesce(max(display_order), 0) + 1 from products))
         on conflict (slug) do nothing`,
        [slug, info.name, info.tag, info.description]
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
