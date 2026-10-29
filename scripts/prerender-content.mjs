// Readable page content, Product structured data and llms.txt for crawlers
// and AI assistants that do not run JavaScript (Oct 2026, "AI visibility"
// Part A). Used by prerender-head.mjs after `vite build`.
//
// Everything is built from the data the site already shows — seo.js
// (PRODUCT_SEO, PAGE_META), data/landing.js + data/guides.js, the cooking
// card, the Infrastructure figures and the live catalogue (/api/catalog, read
// once at build time for packs, prices and stock). Nothing new is claimed.
//
// The page text goes inside #root as plain HTML. The React app replaces it as
// soon as it starts, and a tiny script in <head> hides it for visitors whose
// browser runs JavaScript, so people see the normal site while crawlers that
// read the HTML get the real text of the page.

const SITE = 'https://chennairiceindustries.com'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

// ---- Company facts (as published on the About and Infrastructure pages) ---
export const COMPANY = {
  name: 'Chennai Rice Industries',
  legalName: 'Chennai Rice Industries India Private Limited',
  brand: 'Chennai Rice',
  // The family business: rice trading in Salem from 1951 ("over 75 years"), milling from 1956;
  // the company itself was incorporated in 2013 (shop/data/legacy.js).
  founded: '1951',
  incorporated: '2013',
  founder: 'M. S. Tamilselvan',
  place: 'Nasiyanur, Erode, Tamil Nadu, India',
  slogan: "South India's No. 1 Non-Basmati Rice Manufacturer",
  facts: [
    'Family rice business since 1951 (rice trading in Salem, milling since 1956), with the fifth generation now in the business; Chennai Rice Industries India Pvt. Ltd. (2013) runs the rice mill at Nasiyanur, Erode, Tamil Nadu.',
    "South India's No. 1 non-basmati rice manufacturer: Ponni rice, idli rice and everyday South Indian rice, not basmati.",
    'Capacity of 2,44,000 tonnes a year (MTPA), with 61,500 MT of paddy storage in 31 silos.',
    'Paddy is selected, tested, stored, parboiled (for boiled rice), milled on a 10-stage line (cleaning, husking, polishing, grading, colour sorting) and packed at the Erode plant.',
    'Sells Ponni rice and idli rice in 5, 10 and 26 kg packs (Rudra and Thaaram Nei Kitchadi in 25 kg) through distributors, shops and online across India.',
  ],
  phone: '+91 70666 46667',
  whatsapp: 'https://wa.me/917066646667',
  email: 'support@chennairiceindustries.com',
}

const COOKING = [
  'Rinse the rice thoroughly and soak it in slightly warm water for about 60 minutes.',
  'Closed pan or cooker: about 3 cups of water for 1 cup of rice (about 2.5 cups at a hill station). Open pan: about 5 cups of water, then drain.',
  'Add salt, and a little butter, ghee or oil if you like. Water differs from place to place, so adjust slightly.',
]

// ---- Live catalogue (prices, packs, stock) ---------------------------------
export async function loadCatalog() {
  try {
    const res = await fetch(SITE + '/api/catalog', { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const { products } = await res.json()
    return new Map(products.map((p) => [p.slug, p]))
  } catch (err) {
    console.warn('prerender-content: catalogue not reachable, building without prices —', err.message)
    return new Map()
  }
}

function packs(live) {
  return (live?.variants || []).map((v) => ({
    kg: Number(v.packKg),
    price: v.price == null ? null : Number(v.price),
    mrp: v.mrp == null ? null : Number(v.mrp),
    inStock: Boolean(v.inStock),
  }))
}

// ---- Product structured data ------------------------------------------------
/** Product for a pack page; the page itself adds the same @id with live prices, so they merge. */
export function productSchema({ id, seo, path, image, live, orgId }) {
  const ps = packs(live).filter((p) => p.price != null)
  const url = SITE + path
  return {
    '@type': 'Product',
    '@id': url + '#product',
    name: seo.name ? `${seo.name}${/rice$/i.test(seo.name) ? '' : ' Rice'}` : seo.h1,
    description: seo.about || seo.description,
    url,
    sku: id,
    ...(image ? { image: SITE + image } : {}),
    brand: { '@type': 'Brand', name: COMPANY.brand },
    manufacturer: { '@id': orgId },
    category: 'Rice',
    countryOfOrigin: 'IN',
    ...(live?.tag ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'Pack label', value: live.tag }] } : {}),
    ...(ps.length ? {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: Math.min(...ps.map((p) => p.price)),
        highPrice: Math.max(...ps.map((p) => p.price)),
        offerCount: ps.length,
        availability: ps.some((p) => p.inStock) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@id': orgId },
        url,
      },
    } : {}),
  }
}

// ---- Page text (inside #root) ------------------------------------------------
const link = (to, label) => `<a href="${esc(to)}">${esc(label)}</a>`
const ul = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '')
const companyBlock = () => `<section><h2>About Chennai Rice Industries</h2>${ul(COMPANY.facts.map(esc))}<p>Contact: WhatsApp ${esc(COMPANY.phone)} · ${esc(COMPANY.email)} · ${link('/contact-us', 'Contact page')}</p></section>`

function packsTable(live) {
  const ps = packs(live)
  if (!ps.length) return ''
  const rows = ps.map((p) => `<tr><td>${p.kg} kg</td><td>${p.price == null ? 'Price on request' : rupees(p.price) + (p.mrp && p.mrp > p.price ? ` (MRP ${rupees(p.mrp)})` : '')}</td><td>${p.price == null ? '—' : p.inStock ? 'In stock' : 'Out of stock'}</td></tr>`).join('')
  return `<table><thead><tr><th>Pack</th><th>Price (incl. GST)</th><th>Availability</th></tr></thead><tbody>${rows}</tbody></table><p>Delivery is extra and depends on the PIN code (shown before payment). Delivered across India from Erode.</p>`
}

/** A product page's text. */
export function productHtml({ seo, live, guides }) {
  return [
    `<h1>${esc(seo.h1)}</h1>`,
    `<p><strong>${esc(seo.line || '')}</strong> Made by ${esc(COMPANY.name)}, Erode, Tamil Nadu.</p>`,
    seo.about ? `<p>${esc(seo.about)}</p>` : '',
    live?.tag ? `<p>Pack label: ${esc(live.tag)}.${live.description ? ' ' + esc(live.description) : ''}</p>` : '',
    seo.dishes?.length ? `<h2>Best dishes to cook with ${esc(seo.name || 'this rice')}</h2>${ul(seo.dishes.map(esc))}` : '',
    `<h2>Pack sizes and prices</h2>${packsTable(live) || '<p>See the product page for current pack sizes and prices.</p>'}`,
    `<h2>How to cook it</h2>${ul(COOKING.map(esc))}`,
    `<h2>Rice guides</h2>${ul(guides.map((g) => link(g.to, g.label)))}`,
    companyBlock(),
  ].join('\n')
}

/** A landing page or rice guide (data/landing.js / data/guides.js shape). */
const longDate = (iso) => new Date(iso + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

export function landingHtml({ meta, page, productLinks }) {
  const blocks = (page.sections || []).map((s) => {
    let h = `<h2>${esc(s.h2)}</h2>`
    if (s.p) h += s.p.map((t) => `<p>${esc(t)}</p>`).join('')
    if (s.list) h += ul(s.list.map(esc))
    if (s.steps) h += `<ol>${s.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`
    if (s.table) h += `<table><thead><tr>${s.table.head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    if (s.note) h += `<p>${esc(s.note)}</p>`
    return `<section>${h}</section>`
  })
  return [
    `<h1>${esc(meta.h1)}</h1>`,
    meta.updated ? `<p>By ${esc(COMPANY.name)}, Erode · Updated <time datetime="${meta.updated}">${esc(longDate(meta.updated))}</time></p>` : '',
    ...(page.intro || []).map((t) => `<p>${esc(t)}</p>`),
    productLinks.length ? `<section><h2>${esc(page.productsHeading || 'Our packs')}</h2>${ul(productLinks.map(([n, p, line, price]) => `${link(p, n)}${line ? ' — ' + esc(line) : ''}${price ? ' ' + esc(price) : ''}`))}</section>` : '',
    ...blocks,
    page.faqs?.length ? `<section><h2>${page.lang === 'ta' ? 'அடிக்கடி கேட்கப்படும் கேள்விகள்' : 'Frequently asked questions'}</h2>${page.faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>` : '',
    page.links?.length ? `<p>${page.links.map((l) => link(l.to, l.label)).join(' · ')}</p>` : '',
    page.lang === 'ta' ? '' : companyBlock(),
  ].join('\n')
}

/** Any other page: its heading, its description and the company facts, with links to the main pages. */
export function basicHtml({ meta, productLinks, guides, faqs, withCompany = true }) {
  return [
    `<h1>${esc(meta.h1 || meta.title)}</h1>`,
    `<p>${esc(meta.description)}</p>`,
    productLinks?.length ? `<section><h2>Chennai Rice packs</h2>${ul(productLinks.map(([n, p, line]) => `${link(p, n)}${line ? ' — ' + esc(line) : ''}`))}</section>` : '',
    guides?.length ? `<section><h2>Rice guides</h2>${ul(guides.map((g) => link(g.to, g.label)))}</section>` : '',
    faqs?.length ? `<section><h2>Frequently asked questions</h2>${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>` : '',
    withCompany ? companyBlock() : '',
  ].join('\n')
}

/** Wraps page text for #root, plus the head bits that hide it once JavaScript runs. */
export const HEAD_SNIPPET = `<script>document.documentElement.classList.add('js')</script>
    <style>.js #prerender{display:none}#prerender{max-width:860px;margin:32px auto;padding:0 16px;font:16px/1.6 system-ui,sans-serif;color:#2b1d17}#prerender table{border-collapse:collapse}#prerender td,#prerender th{border:1px solid #ddd;padding:4px 8px;text-align:left}</style>`
export const wrap = (html) => `<main id="prerender">\n${html}\n</main>`

// ---- llms.txt ---------------------------------------------------------------
export function llmsTxt({ products, guides, landing }) {
  const lines = [
    `# ${COMPANY.name} (${COMPANY.brand})`,
    '',
    `> ${COMPANY.legalName} runs a rice mill at ${COMPANY.place}; the family has been in the rice business since ${COMPANY.founded} (over 75 years). It mills and packs Ponni rice and idli rice under the Chennai Rice brand and its pack brands (Kitchidi Ponni Rice, Special Rajabhogam, Nayara Super Aged, A1 Special Ponni and others), sold through distributors and shops and online across India at ${SITE}.`,
    '',
    '## Key facts',
    ...COMPANY.facts.map((f) => `- ${f}`),
    `- Website: ${SITE} · WhatsApp/phone: ${COMPANY.phone} · Email: ${COMPANY.email}`,
    '',
    '## Rice packs (brand — what it is — best for — pack sizes and current online price)',
    ...products.map((p) => `- [${p.name}](${SITE}${p.path}): ${p.line}${p.tag ? ` Pack label: ${p.tag}.` : ''}${p.dishes?.length ? ` Best for: ${p.dishes.join(', ')}.` : ''} ${p.packs || ''}`.trim()),
    '',
    '## Rice guides',
    ...guides.map((g) => `- [${g.label}](${SITE}${g.to})`),
    '',
    '## Topic pages',
    ...landing.map((l) => `- [${l.h1}](${SITE}${l.path})`),
    '',
    '## Buying',
    `- Online: ${SITE}/rice-products — 5, 10 and 26 kg packs, delivered across India; delivery charge by region shown from the PIN code; secure online payment; order tracking at ${SITE}/track-order.`,
    `- Bulk, wholesale, hotels, caterers and distributors: ${SITE}/bulk-order and ${SITE}/rice-distributorship.`,
    `- Policies: ${SITE}/shipping · ${SITE}/refund · ${SITE}/terms · ${SITE}/privacy`,
    '',
    '## Optional',
    `- [Full text for AI assistants](${SITE}/llms-full.txt)`,
    `- [About the company](${SITE}/about-us) · [Infrastructure](${SITE}/infrastructure) · [Founder](${SITE}/founder)`,
    '',
  ]
  return lines.join('\n')
}

export function llmsFullTxt({ products, landingPages }) {
  const out = [llmsTxt({ products, guides: [], landing: [] }).split('\n## Rice guides')[0], '']
  out.push('## Products in detail', '')
  for (const p of products) {
    out.push(`### ${p.name} (${SITE}${p.path})`, p.about || p.line, ...(p.tag ? [`Pack label: ${p.tag}.`] : []), ...(p.dishes?.length ? [`Best dishes: ${p.dishes.join(', ')}.`] : []), ...(p.packs ? [p.packs] : []), '')
  }
  out.push('## How to cook Chennai Rice', ...COOKING.map((c) => `- ${c}`), '')
  for (const { meta, page } of landingPages) {
    if (page.lang !== 'en') continue
    out.push(`## ${meta.h1} (${SITE}${meta.path})`, ...(page.intro || []), '')
    for (const s of page.sections || []) {
      out.push(`### ${s.h2}`)
      if (s.p) out.push(...s.p)
      if (s.list) out.push(...s.list.map((x) => `- ${x}`))
      if (s.steps) out.push(...s.steps.map((x, i) => `${i + 1}. ${x}`))
      if (s.table) out.push(`| ${s.table.head.join(' | ')} |`, `| ${s.table.head.map(() => '---').join(' | ')} |`, ...s.table.rows.map((r) => `| ${r.join(' | ')} |`))
      if (s.note) out.push(s.note)
      out.push('')
    }
    if (page.faqs?.length) {
      out.push('### Frequently asked questions')
      for (const f of page.faqs) out.push(`Q: ${f.q}`, `A: ${f.a}`, '')
    }
  }
  return out.join('\n')
}

export function packsLine(live) {
  const ps = packs(live).filter((p) => p.price != null)
  if (!ps.length) return ''
  return 'Packs: ' + ps.map((p) => `${p.kg} kg ${rupees(p.price)}${p.inStock ? '' : ' (out of stock)'}`).join(', ') + ' (online, incl. GST; delivery extra by PIN code).'
}
