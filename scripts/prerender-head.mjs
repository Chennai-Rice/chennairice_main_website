// Gives every public page its own <head> in the built site (dist/), after
// `vite build` (the `postbuild` npm script).
//
// The site is a single-page app: without this, every URL is served the same
// index.html, so a crawler or a link preview that does not run JavaScript sees
// the home page's title and description on every page. This writes one HTML
// file per page with its own title, meta description, canonical URL, Open
// Graph tags and structured data (schema.org JSON-LD), all from
// frontend/src/seo.js (the "Chennai Rice SEO - Sheet1" plan, Oct 2026). The
// page body is still the app, which takes over as usual.
//
//   dist/index.html             the home page
//   dist/<page>/index.html      every other page (firebase.json trailingSlash: false
//                               serves it at /<page>, without a slash)
//   dist/app.html               the plain app shell, for every other URL (blog
//                               posts, cart, …); the app sets their tags itself
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SITE = 'https://chennairiceindustries.com'
const src = (p) => pathToFileURL(join(ROOT, 'frontend', 'src', p)).href

const { PAGE_META, PRODUCT_SEO, productPath } = await import(src('seo.js'))
const { FOOTER } = await import(src('data/content.js'))
const { LANDING } = await import(src('data/landing.js'))

// Pack images, from the shop's built-in catalogue (the same block the sitemap reads).
const catalogue = readFileSync(join(ROOT, 'frontend', 'src', 'shop', 'data', 'products.js'), 'utf8')
const fallback = catalogue.match(/const FALLBACK_PRODUCTS = \[([\s\S]*?)\n\]\.map/)?.[1] || ''
const IMAGE = Object.fromEntries(
  [...fallback.matchAll(/slug:\s*"([^"]+)"[\s\S]*?image:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])
)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const abs = (path) => SITE + (path === '/' ? '/' : path)

// ---- Structured data --------------------------------------------------------
const ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: 'SF No. 116/1,2,4-B, N. Thayirpalayam Village, Nasiyanur, Gangapuram Post',
  addressLocality: 'Erode',
  addressRegion: 'Tamil Nadu',
  postalCode: '638102',
  addressCountry: 'IN',
}
const PHONE = '+91-70666-46667'
const LOGO = SITE + '/assets/logo-full-v2.png'
const SAME_AS = (FOOTER.social || []).map((s) => s.href.replace(/&sk=about$/, ''))
const ORG_ID = SITE + '/#organization'

const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Chennai Rice Industries',
  legalName: 'Chennai Rice Industries India Private Limited',
  url: SITE + '/',
  logo: LOGO,
  email: FOOTER.email,
  telephone: PHONE,
  address: ADDRESS,
  sameAs: SAME_AS,
}
const localBusiness = {
  '@type': 'LocalBusiness',
  '@id': SITE + '/#localbusiness',
  name: 'Chennai Rice Industries',
  description: 'Rice mill in Erode, Tamil Nadu: Ponni rice, idli rice and everyday rice in 5, 10 and 26 kg packs.',
  url: SITE + '/',
  image: LOGO,
  telephone: PHONE,
  email: FOOTER.email,
  address: ADDRESS,
  parentOrganization: { '@id': ORG_ID },
}
const website = { '@type': 'WebSite', '@id': SITE + '/#website', name: 'Chennai Rice', url: SITE + '/', publisher: { '@id': ORG_ID } }

function breadcrumb(...trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [['Home', '/'], ...trail].map(([name, path], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: abs(path),
    })),
  }
}
const crumb = (key) => breadcrumb([PAGE_META[key].h1, PAGE_META[key].path])

const productNames = Object.entries(PRODUCT_SEO).map(([id, p]) => [p.h1.replace(/ – \d+ kg$/, ''), productPath(id)])

const SCHEMA = {
  home: [organization, localBusiness, website],
  products: [
    { '@type': 'ItemList', name: PAGE_META.products.h1, itemListElement: productNames.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, url: abs(path) })) },
    crumb('products'),
  ],
  about: [organization, localBusiness, crumb('about')],
  infrastructure: [crumb('infrastructure')],
  contact: [{ '@type': 'ContactPage', name: PAGE_META.contact.h1, url: abs(PAGE_META.contact.path), about: { '@id': ORG_ID } }, localBusiness, crumb('contact')],
  blog: [{ '@type': 'Blog', name: PAGE_META.blog.h1, url: abs(PAGE_META.blog.path), publisher: { '@id': ORG_ID } }, crumb('blog')],
  bulkOrder: [{ '@type': 'Service', name: PAGE_META.bulkOrder.h1, serviceType: 'Wholesale and bulk rice supply', provider: { '@id': ORG_ID }, areaServed: 'IN', url: abs(PAGE_META.bulkOrder.path) }, organization, crumb('bulkOrder')],
  founder: [{ '@type': 'Person', name: 'M. S. Tamilselvan', jobTitle: 'Founder & Chairman', worksFor: { '@id': ORG_ID }, url: abs(PAGE_META.founder.path) }, organization, crumb('founder')],
  contest: [crumb('contest')],
  privacy: [crumb('privacy')],
  terms: [crumb('terms')],
}

// Landing pages (data/landing.js): their packs, their FAQs and a breadcrumb.
for (const [key, page] of Object.entries(LANDING)) {
  const items = []
  const packs = (page.productIds || []).filter((id) => PRODUCT_SEO[id])
  if (packs.length) {
    items.push({ '@type': 'ItemList', name: page.productsHeading, itemListElement: packs.map((id, i) => ({
      '@type': 'ListItem', position: i + 1, name: PRODUCT_SEO[id].h1.replace(/ – \d+ kg$/, ''), url: abs(productPath(id)),
    })) })
  }
  if (page.faqs?.length) {
    items.push({ '@type': 'FAQPage', inLanguage: page.lang, mainEntity: page.faqs.map((q) => ({
      '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a },
    })) })
  }
  items.push(key === 'taHome' ? breadcrumb() : crumb(key))
  SCHEMA[key] = items
}

// hreflang: each English page and its Tamil version name each other, and
// English is the default for everyone else.
const ALTERNATE = {}
for (const page of Object.values(PAGE_META)) {
  if (!page.alternate) continue
  const ta = page.lang === 'ta' ? page.path : page.alternate
  const en = page.lang === 'ta' ? page.alternate : page.path
  ALTERNATE[ta] = ALTERNATE[en] = { en, ta }
}
const TAMIL_FONT = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&display=swap'

const jsonLd = (items) => items.length
  ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': items }).replace(/</g, '\\u003c')}</script>`
  : ''

// ---- HTML -------------------------------------------------------------------
const shell = readFileSync(join(DIST, 'index.html'), 'utf8')
writeFileSync(join(DIST, 'app.html'), shell)

function render({ path, title, description, noindex, image, lang, schema = [] }) {
  const url = abs(path)
  let html = shell
  if (lang && lang !== 'en') html = html.replace('<html lang="en">', `<html lang="${lang}">`)
  const swap = (re, value) => {
    if (!re.test(html)) throw new Error(`prerender-head: ${re} not found in index.html`)
    html = html.replace(re, () => value)
  }
  swap(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  swap(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`)
  swap(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`)
  swap(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`)
  swap(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${esc(url)}" />`)
  if (image) swap(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${esc(SITE + image)}" />`)
  const extra = [
    noindex ? '<meta name="robots" content="noindex, follow" />' : `<link rel="canonical" href="${esc(url)}" />`,
    ...(ALTERNATE[path] ? [
      `<link rel="alternate" hreflang="en" href="${esc(abs(ALTERNATE[path].en))}" />`,
      `<link rel="alternate" hreflang="ta" href="${esc(abs(ALTERNATE[path].ta))}" />`,
      `<link rel="alternate" hreflang="x-default" href="${esc(abs(ALTERNATE[path].en))}" />`,
    ] : []),
    lang === 'ta' ? `<link rel="stylesheet" href="${TAMIL_FONT}" />` : '',
    jsonLd(schema),
  ].filter(Boolean).join('\n    ')
  html = html.replace('</head>', `    ${extra}\n  </head>`)
  const file = path === '/' ? join(DIST, 'index.html') : join(DIST, path.slice(1), 'index.html')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, html)
  return path
}

const written = []
for (const [key, page] of Object.entries(PAGE_META)) {
  written.push(render({ ...page, schema: page.noindex ? [] : SCHEMA[key] || [] }))
}
for (const [id, p] of Object.entries(PRODUCT_SEO)) {
  const path = productPath(id)
  written.push(render({
    path, title: p.title, description: p.description, image: IMAGE[id],
    // The Product schema with live prices is added by the product page itself.
    schema: [breadcrumb([PAGE_META.products.h1, PAGE_META.products.path], [p.h1.replace(/ – \d+ kg$/, ''), path])],
  }))
}
console.log(`prerender-head: ${written.length} pages`)
