// Writes frontend/public/sitemap.xml and robots.txt before every build.
//
// Runs as the `prebuild` npm script, so the sitemap can never drift from what
// the site actually contains: a product added to Supabase, or a blog post
// published, appears in the next deploy's sitemap without anyone remembering
// to update a hand-written file.
//
// Deliberately NOT listed: /admin and /blog/studio (private tools), /cart,
// /wishlist and /checkout (per-visitor state, nothing to index), the legacy
// .html redirects, and the "coming soon" placeholder pages — submitting thin
// placeholder pages to Google invites them to be indexed as low-value.
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = join(ROOT, 'frontend', 'public')
const SITE = process.env.SITE_URL || 'https://chennairiceindustries.com'

/** Static routes, with the priority each deserves relative to the homepage. */
const STATIC_ROUTES = [
  ['/', 1.0, 'weekly'],
  ['/products', 0.9, 'weekly'],
  ['/infrastructure', 0.7, 'monthly'],
  ['/about', 0.7, 'monthly'],
  ['/contact', 0.7, 'monthly'],
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
 * Published blog posts, if Supabase credentials happen to be present. Absent
 * credentials are not an error: the sitemap is simply built without them, so a
 * machine that cannot reach the database can still produce a valid file.
 */
async function blogSlugs() {
  const envPath = join(ROOT, 'backend', 'server', '.env')
  let url = process.env.SUPABASE_URL
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if ((!url || !key) && existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i)
      const v = t.slice(i + 1).trim()
      if (k === 'SUPABASE_URL' && !url) url = v
      if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !key) key = v
    }
  }
  if (!url || !key) return []

  try {
    const res = await fetch(
      url + '/rest/v1/blog_posts?select=slug,published_at&status=eq.published&order=published_at.desc',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } }
    )
    if (!res.ok) return []
    const rows = await res.json()
    return rows.filter((r) => r.slug).map((r) => ({ slug: r.slug, lastmod: r.published_at }))
  } catch {
    return []
  }
}

const today = new Date().toISOString().slice(0, 10)
const entries = []

for (const [path, priority, changefreq] of STATIC_ROUTES) {
  entries.push({ loc: SITE + path, priority, changefreq, lastmod: today })
}
for (const slug of productSlugs()) {
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
// protection is the Supabase RLS behind them.
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
