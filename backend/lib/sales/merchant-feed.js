// Product feed for shopping and AI product listings (Oct 2026): Google Merchant
// Center (Google Shopping, Gemini), Bing Merchant Center (Bing Shopping,
// ChatGPT search) and others that read the same RSS 2.0 format.
//
// One item per pack size, with the live price and stock (so it never disagrees
// with the shop), the square white-background photo (public/assets/shop/feed),
// the brand and a link to the product page. Served at GET /api/merchant-feed.xml.
import { listCatalog } from './catalog.js'

const SITE = 'https://chennairiceindustries.com'
// Shop ID → the product page's address and full name (as in frontend/src/seo.js
// PRODUCT_SEO; test/merchant-feed.test.js checks the two agree).
export const FEED_PAGES = {
  'kitchidi-ponni-rice': ['kitchidi-ponni-rice', 'Kitchidi Ponni Rice'],
  'special-rajabhogam': ['special-rajabhogam-rice', 'Special Rajabhogam Rice'],
  'nayara-super-aged': ['nayara-super-aged-rice', 'Nayara Super Aged Rice'],
  'vijaya-nagaram': ['vijaya-nagaram-rice', 'Vijaya Nagaram Rice'],
  vintage: ['vintage-ponni-rice', 'Vintage Special Ponni Rice'],
  viruchagam: ['viruchagam-ponni-rice', 'Viruchagam Rice'],
  'united-5kg': ['united-ponni-rice', 'United Ponni Rice'],
  alibaba: ['alibaba-sappadu-rice', 'Alibaba Sappadu Rice'],
  'chennai-bullets': ['chennai-bullets-rice', 'Chennai Bullets Rice'],
  'a1-special-ponni': ['a1-special-ponni-rice', 'A1 Special Ponni Rice'],
  rudra: ['rudra-ponni-rice', 'Rudra Ponni Rice'],
  thaaram: ['thaaram-pooni-rice', 'Thaaram Nei Kitchadi Rice'],
  'special-idly-rice': ['special-idly-rice', 'Special Idly Rice'],
}
const CATEGORY = 'Food, Beverages & Tobacco > Food Items > Grains, Rice & Cereal > Rice'

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tag = (name, value) => (value === '' || value == null ? '' : `      <${name}>${xml(value)}</${name}>\n`)

/** The feed as XML, from the live catalogue. Packs without a price are left out. */
export async function merchantFeed({ query }) {
  const products = await listCatalog({ query })
  const items = []
  for (const p of products) {
    const page = FEED_PAGES[p.slug]
    if (!page) continue
    const [pageSlug, fullName] = page
    for (const v of p.variants || []) {
      if (v.price == null) continue
      items.push('    <item>\n' +
        tag('g:id', v.sku || v.id) +
        tag('g:item_group_id', p.slug) +
        tag('g:title', `Chennai Rice ${fullName} – ${v.packKg} kg`) +
        tag('g:description', `${p.description || fullName} ${v.packKg} kg pack, milled and packed by Chennai Rice Industries at Erode, Tamil Nadu. Delivered across India.`) +
        tag('g:link', `${SITE}/products/${pageSlug}`) +
        tag('g:image_link', `${SITE}/assets/shop/feed/${p.slug}.jpg`) +
        tag('g:additional_image_link', p.image ? SITE + p.image : '') +
        tag('g:availability', v.inStock ? 'in_stock' : 'out_of_stock') +
        tag('g:price', `${Number(v.price).toFixed(2)} INR`) +
        tag('g:brand', 'Chennai Rice') +
        tag('g:condition', 'new') +
        tag('g:identifier_exists', 'no') +
        tag('g:mpn', v.sku || v.id) +
        tag('g:google_product_category', CATEGORY) +
        tag('g:product_type', p.tag ? `Rice > ${p.tag}` : 'Rice') +
        tag('g:size', `${v.packKg} kg`) +
        tag('g:product_weight', `${v.packKg} kg`) +
        '    </item>')
    }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n' +
    '    <title>Chennai Rice – rice packs</title>\n' +
    `    <link>${SITE}/</link>\n` +
    '    <description>Ponni rice and idli rice from Chennai Rice Industries, Erode: live prices and stock.</description>\n' +
    items.join('\n') + '\n  </channel>\n</rss>\n'
}
