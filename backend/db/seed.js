// Fills the reference data the shop cannot run without. Safe to re-run: it
// inserts what is missing and never overwrites a price, stock figure or
// setting someone has since changed in the admin panel.
//
//   npm run db:seed                  catalog, plant location, settings, zone
//   npm run db:seed -- --demo        ALSO sample prices + stock, for trying the
//                                    checkout locally. Refuses to run against
//                                    Cloud SQL so made-up prices never go live.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from '../lib/db.js'

// The range the website sells (frontend/src/shop/data/products.js), one pack
// size each. Prices start empty on purpose: an unpriced pack is listed but can
// never be ordered, so nothing sells at a guessed price.
export const CATALOG = [
  { slug: 'kitchidi-ponni-rice', name: 'Kitchidi Ponni Rice', tag: '1 Year Aged', packKg: 5, description: "Kitchidi Ponni, aged for a year, in our Chennai Rice premium pack. From Mother's Hands to Your Heart." },
  { slug: 'special-rajabhogam', name: 'Special Rajabhogam', tag: 'Classic Red', packKg: 10, description: 'Kitchidi Ponni rice in our signature red pack, milled and sealed at Erode.' },
  { slug: 'nayara-super-aged', name: 'Nayara Super Aged', tag: 'Super Aged', packKg: 10, description: 'Super-aged gel cook rice that stays separate and firm on the plate.' },
  { slug: 'vijaya-nagaram', name: 'Vijaya Nagaram', tag: 'Amman Ponni', packKg: 5, description: 'Amman Ponni, HMT Ponni grain, milled for everyday South Indian meals.' },
  { slug: 'vintage', name: 'Vintage', tag: 'Black & Gold', packKg: 10, description: 'Our black-and-gold selection, milled and sealed at the Erode facility.' },
  { slug: 'viruchagam', name: 'Viruchagam', tag: 'Poompuhar Ponni', packKg: 10, description: 'Poompuhar Ponni in the blue and gold pack, from SNR RNR paddy.' },
  { slug: 'united-5kg', name: 'United', tag: 'Green Pack', packKg: 5, description: 'The everyday United pack, in a 5 kg family size.' },
  { slug: 'alibaba', name: 'Alibaba', tag: 'Premium Sappadu', packKg: 10, description: 'Premium Sappadu rice, 100% pure original quality, for full-flavoured meals.' },
  { slug: 'chennai-bullets', name: 'Chennai Bullets', tag: 'Rajabhogam Ponni', packKg: 26, description: 'Rajabhogam Ponni with a rich aroma, in our largest 26 kg trade pack.' },
  { slug: 'a1-special-ponni', name: 'A1 Special Ponni', tag: 'No.1 Ponni', packKg: 5, description: 'Special Ponni rice, quality graded and packed at our Erode facility.' },
  { slug: 'rudra', name: 'Rudra', tag: 'Rajabhogam Ponni', packKg: 25, description: 'Rajabhogam Ponni rice, original taste and rich aroma, in a 25 kg pack.' },
  { slug: 'thaaram', name: 'Thaaram Nei Kitchadi', tag: 'Akshaya Ponni', packKg: 25, description: 'Akshaya Ponni for nei kitchadi: strong grain, superior taste, rich aroma.' },
  { slug: 'special-idly-rice', name: 'Special Idly Rice', tag: 'Idly Rice', packKg: 5, description: 'Idly rice in our pink pack, for soft, fluffy idlis and crisp dosas.' },
]

// GST on pre-packaged, labelled rice is 5% for packs up to 25 kg. A single
// pack above 25 kg falls outside that definition and has been treated as
// exempt. CONFIRM BOTH WITH THE COMPANY'S CA before going live — the rate is
// editable per pack in the admin panel and only affects new orders.
export function defaultTaxRateBp(packKg) {
  return packKg <= 25 ? 500 : 0
}

export function skuFor(slug, packKg) {
  return 'CR-' + slug.toUpperCase() + '-' + packKg + 'KG'
}

const SETTINGS = {
  seller_legal_name: 'Chennai Rice Industries India Private Limited',
  seller_address: 'SF No. 116/1,2,4-B, N. Thayirpalayam Village, Nasiyanur, Gangapuram Post, Erode, Tamil Nadu 638102',
  seller_state: 'Tamil Nadu',
  seller_state_code: '33',
  seller_gstin: '',           // fill in before the first invoice is issued
  seller_phone: '+91 70666 46667',
  seller_email: 'support@chennairiceindustries.com',
  invoice_prefix: 'CRI',
  reservation_minutes: '30',
  low_stock_alerts: 'on',
}

export async function seed({ pool, demo = false, log = console.log } = {}) {
  pool = pool || (await getPool())

  for (const [key, value] of Object.entries(SETTINGS)) {
    await pool.query('insert into company_settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, value])
  }

  await pool.query(
    `insert into stock_locations (code, name, address, is_fulfilment)
     values ('NASIYANUR', 'Nasiyanur plant, Erode', $1, true)
     on conflict (code) do nothing`,
    [SETTINGS.seller_address]
  )

  await pool.query(
    `insert into shipping_zones (code, name, is_default) values ('ALL_INDIA', 'All India', true)
     on conflict (code) do nothing`
  )

  for (const [i, p] of CATALOG.entries()) {
    const { rows } = await pool.query(
      `insert into products (slug, name, tag, description, image_url, display_order)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (slug) do update set slug = excluded.slug
       returning id`,
      [p.slug, p.name, p.tag, p.description, '/assets/shop/packs/' + p.slug + '.png', i + 1]
    )
    await pool.query(
      `insert into product_variants (product_id, sku, pack_kg, tax_rate_bp, reorder_level)
       values ($1, $2, $3, $4, $5)
       on conflict (sku) do nothing`,
      [rows[0].id, skuFor(p.slug, p.packKg), p.packKg, defaultTaxRateBp(p.packKg), 20]
    )
  }
  log('  catalog: ' + CATALOG.length + ' packs, plant location, settings, delivery zone')

  if (demo) {
    if (process.env.CLOUD_SQL_INSTANCE) throw new Error('--demo is for local databases only.')
    // Round illustrative numbers, clearly not real prices.
    await pool.query(
      `update product_variants set price_paise = (pack_kg * 8000)::bigint, mrp_paise = (pack_kg * 9000)::bigint
       where price_paise is null`
    )
    await pool.query(
      `insert into stock_levels (location_id, variant_id, on_hand)
       select l.id, v.id, 100 from stock_locations l cross join product_variants v
       where l.is_fulfilment
       on conflict do nothing`
    )
    log('  demo prices (₹80/kg) and 100 packs of each in stock')
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed({ demo: process.argv.includes('--demo') })
    .then(() => closePool())
    .catch(async (err) => {
      console.error('Seed failed:', err.message)
      await closePool()
      process.exit(1)
    })
}
