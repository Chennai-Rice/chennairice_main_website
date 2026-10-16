// Writes frontend/public/sitemap.xml and robots.txt before every build.
//
// Runs as the `prebuild` npm script, so the sitemap can never drift from what
// the site actually contains: a product added to the catalog, or a blog post
// published, appears in the next deploy's sitemap without anyone remembering
// to update a hand-written file.
//
// Deliberately NOT listed: /admin and /blog/studio (private tools), /cart,
// /wishlist and /checkout (per-visitor state, nothing to index), the legacy
// .html redirects, and the "coming soon" placeholder pages — submitting thin
// placeholder pages to Google invites them to be indexed as low-value.
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = join(ROOT, 'frontend', 'public')
const SITE = process.env.SITE_URL || 'https://chennairiceindustries.com'

/** Static routes, with the priority each deserves relative to the homepage. */
const STATIC_ROUTES = [
  ['/', 1.0, 'weekly'],
  ['/rice-products', 0.9, 'weekly'],
  ['/infrastructure', 0.7, 'monthly'],
  ['/about-us', 0.7, 'monthly'],
  ['/contact-us', 0.7, 'monthly'],
  ['/track-order', 0.5, 'monthly'],
  ['/bulk-order', 0.7, 'monthly'],
  ['/founder', 0.6, 'yearly'],
  ['/blog', 0.6, 'weekly'],
  ['/privacy', 0.3, 'yearly'],
  ['/terms', 0.3, 'yearly'],
]

/** Product slugs, read from the shop's own catalogue so the two cannot drift. */
function productSlugs() {
  const file = join(ROOT, 'frontend', 'src', 'shop', 'data', 'products.js')
  const src = readFileSync(file, 'utf8')
  // The FALLBACK_PRODUCTS block lists every pack the site ships with.
  const block = src.match(/const FALLBACK_PRODUCTS = \[([\s\S]*?)\n\]\.map/)
  if (!block) return []
  return [...block[1].matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1])
}

/**
 * Published blog posts, read from the live site's public blog API (Cloud SQL
 * behind it). BLOG_API_BASE points it elsewhere, e.g. a local server. An
 * unreachable API is not an error: the sitemap is simply built without them.
 */
async function blogSlugs() {
  const apiBase = (process.env.BLOG_API_BASE || SITE).replace(/\/$/, '')
  try {
    const res = await fetch(apiBase + '/api/blog/posts', { signal: AbortSignal.timeout(10000) })
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return []
    const { posts } = await res.json()
    return (posts || []).filter((p) => p.slug).map((p) => ({ slug: p.slug, lastmod: p.published_at }))
  } catch {
    return []
  }
}

const today = new Date().toISOString().slice(0, 10)
const entries = []

for (const [path, priority, changefreq] of STATIC_ROUTES) {
  entries.push({ loc: SITE + path, priority, changefreq, lastmod: today })
}
const { PRODUCT_SEO } = await import(pathToFileURL(join(ROOT, 'frontend', 'src', 'seo.js')).href)
const publicSlugs = [...new Set([...productSlugs().map((id) => PRODUCT_SEO[id]?.slug || id), ...Object.values(PRODUCT_SEO).map((p) => p.slug)])]
for (const slug of publicSlugs) {
  entries.push({ loc: SITE + '/products/' + slug, priority: 0.8, changefreq: 'monthly', lastmod: today })
}
for (const post of await blogSlugs()) {
  entries.push({
    loc: SITE + '/blog/' + post.slug,
    priority: 0.5,
    changefreq: 'yearly',
    lastmod: (post.lastmod || today).slice(0, 10),
  })
}

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  entries
    .map(
      (e) =>
        '  <url>\n' +
        '    <loc>' + e.loc + '</loc>\n' +
        '    <lastmod>' + e.lastmod + '</lastmod>\n' +
        '    <changefreq>' + e.changefreq + '</changefreq>\n' +
        '    <priority>' + e.priority.toFixed(1) + '</priority>\n' +
        '  </url>'
    )
    .join('\n') +
  '\n</urlset>\n'

writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), xml)

// /admin and /blog/studio are disallowed as a courtesy to crawlers, not as
// security — they are client-side routes and robots.txt is advisory. Real
// protection is the staff sign-in the server checks behind them.
const robots =
  '# https://www.robotstxt.org/robotstxt.html\n' +
  'User-agent: *\n' +
  'Allow: /\n' +
  'Disallow: /admin\n' +
  'Disallow: /blog/studio\n' +
  'Disallow: /cart\n' +
  'Disallow: /checkout\n' +
  'Disallow: /wishlist\n' +
  '\n' +
  'Sitemap: ' + SITE + '/sitemap.xml\n'

writeFileSync(join(PUBLIC_DIR, 'robots.txt'), robots)

console.log('sitemap.xml: ' + entries.length + ' urls (' + SITE + ')')
console.log('robots.txt : written')
