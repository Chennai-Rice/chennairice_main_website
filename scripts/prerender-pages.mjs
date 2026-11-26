// The full text of the company and policy pages, for crawlers that do not run JavaScript (SEO audit, 26 Nov 2026:
// /infrastructure, /founder, /contact-us, /contest, /privacy, /terms, /shipping and /refund sent only a heading, one
// sentence and the shared "About Chennai Rice Industries" block, 153–166 words). Each page now carries its own text,
// read from the same data files the pages show, so the two never differ.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => pathToFileURL(join(ROOT, 'frontend', 'src', p)).href

const INFRA = await import(src('data/infrastructure.js'))
const { FOUNDER } = await import(src('shop/data/founder.js'))
const { SHIPPING_POLICY, REFUND_POLICY, POLICY_CONTACT: SUPPORT } = await import(src('data/policies.js'))
const PRIVACY = await import(src('data/privacyPolicy.js'))
const TERMS = await import(src('data/termsConditions.js'))
const { FOOTER } = await import(src('data/content.js'))

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const p = (t) => `<p>${esc(t)}</p>`
const ul = (items) => (items?.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
const ol = (items) => (items?.length ? `<ol>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '')
const a = (to, label) => `<a href="${esc(to)}">${esc(label)}</a>`
const table = (t) => (t ? `<table><thead><tr>${t.head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '')

// A policy section: any of paragraphs, list, steps, table, after (data/policies.js, privacyPolicy.js, termsConditions.js).
const section = (s) => `<section><h2>${esc(s.title)}</h2>${(s.paragraphs || []).map(p).join('')}${ul(s.list)}${ol(s.steps)}${table(s.table)}${(s.after || []).map(p).join('')}</section>`

function policy(h1, { updated, intro, sections, contact }) {
  return [
    `<h1>${esc(h1)}</h1>`,
    updated ? p(`Last updated: ${updated}`) : '',
    ...(intro || []).map(p),
    ...sections.map(section),
    contact || '',
    `<p>${a('/shipping', 'Shipping policy')} · ${a('/refund', 'Return & refund policy')} · ${a('/privacy', 'Privacy policy')} · ${a('/terms', 'Terms & conditions')} · ${a('/contact-us', 'Contact us')}</p>`,
  ].join('\n')
}

const supportBlock = () => `<section><h2>Need help with an order?</h2>${p(SUPPORT.hours)}<p>Phone / WhatsApp ${esc(SUPPORT.phone)} · ${esc(SUPPORT.email)}</p></section>`
const legalContact = (c) => `<section><h2>${esc(c.heading || 'Contact us')}</h2>${p(c.intro)}${p(c.companyName)}${p(c.email)}${p((c.address || []).join(' '))}</section>`

export const PAGE_BODIES = {
  infrastructure: (meta) => {
    const stats = INFRA.SHOWCASE_STATS.map((s) => `${s.value} ${s.label}`)
    return [
      `<h1>${esc(meta.h1)}</h1>`,
      p(INFRA.INFRA_HERO.subtitle),
      `<section><h2>Our facility in numbers</h2>${ul(stats)}${p(INFRA.PLANNED_CAPACITY.description)}</section>`,
      ...INFRA.SHOWCASE_SLIDES.map((s) => `<section><h2>${esc(s.titleLines.join(' '))}</h2>${p(s.text)}</section>`),
      `<section><h2>Paddy sourcing</h2>${INFRA.SOURCING_STEPS.map((s) => `<h3>${esc(s.title)}</h3>${p(s.text)}`).join('')}</section>`,
      `<section><h2>Quality we check at intake</h2>${INFRA.QUALITY_CARDS.map((c) => `<h3>${esc(c.title)}</h3>${p(c.text)}`).join('')}</section>`,
      `<section><h2>From paddy to your home: 10 processing stages, then dispatch and delivery</h2>${p('Cleaning, destoning, husking and separation run on Bühler machines at our Nasiyanur, Erode mill.')}<ol>${INFRA.PROCESSING_STAGES.map((s) => `<li><strong>${esc(s.title)}</strong>: ${esc(s.text)}</li>`).join('')}</ol></section>`,
      INFRA.SILO_LOCATIONS?.length ? `<section><h2>Storage silos</h2>${ul(INFRA.SILO_LOCATIONS.map((s) => `${s.value} silos at ${s.location}`))}</section>` : '',
      INFRA.QC_CARDS?.length ? `<section><h2>Quality control</h2>${INFRA.QC_CARDS.map((c) => `<h3>${esc(c.title)}</h3>${p(c.text)}`).join('')}</section>` : '',
      INFRA.LOGISTICS_FLOW?.length ? `<section><h2>Distribution</h2>${p(INFRA.LOGISTICS_FLOW.join(' → '))}</section>` : '',
      `<section><h2>${esc(INFRA.INFRA_FINAL_CTA.title)}</h2>${p(INFRA.INFRA_FINAL_CTA.text)}<p>${a('/rice-products', 'See our rice products')} · ${a('/about-us', 'About Chennai Rice')} · ${a('/bulk-order', 'Bulk and distributor enquiries')}</p></section>`,
    ].join('\n')
  },

  founder: (meta) => [
    `<h1>${esc(meta.h1)}</h1>`,
    `<p><strong>${esc(FOUNDER.name)}</strong>, ${esc(FOUNDER.title)}, ${esc(FOUNDER.company)}</p>`,
    p(FOUNDER.intro),
    `<section><h2>${esc(FOUNDER.visionHeading)}</h2>${FOUNDER.bioLead.map(p).join('')}${FOUNDER.bio.map(p).join('')}${p(FOUNDER.bioClosing)}</section>`,
    `<section><h2>${esc(FOUNDER.heroStatsEyebrow)}</h2>${ul(FOUNDER.heroStats.map((s) => `${s.to.toLocaleString('en-IN')}${s.suffix} ${s.text}`))}</section>`,
    `<section><h2>At a glance</h2>${ul(FOUNDER.glance.map((g) => `${g.label}: ${g.value}`))}</section>`,
    `<blockquote>${p(FOUNDER.quote)}<p>— ${esc(FOUNDER.quoteAttribution)}</p></blockquote>`,
    `<p>${a('/about-us', 'Our story')} · ${a('/infrastructure', 'Our infrastructure')} · ${a('/rice-products', 'Our rice')}</p>`,
  ].join('\n'),

  contact: (meta) => [
    `<h1>${esc(meta.h1)}</h1>`,
    p('Have a question about our rice products, bulk purchasing or distribution opportunities? Contact Chennai Rice Industries and let our team guide you to the right information.'),
    `<section><h2>Chennai Rice Industries</h2><p>Phone and WhatsApp: <a href="tel:${esc(FOOTER.phone.replace(/\s/g, ''))}">${esc(FOOTER.phone)}</a></p><p>Email: <a href="mailto:${esc(FOOTER.email)}">${esc(FOOTER.email)}</a></p><p>Address: ${esc(FOOTER.address.join(' '))}</p></section>`,
    `<section><h2>How we can help</h2>${ul([
      'Product questions: our rice varieties, pack sizes (5, 10 and 26 kg) and which rice suits which dish.',
      'Orders placed on the website: tracking, delivery and returns, with your order number.',
      'Bulk orders for shops, hotels, caterers and institutions.',
      'Distributorship enquiries across Tamil Nadu and South India.',
    ])}${p(SUPPORT.hours)}</section>`,
    `<p>${a('/bulk-order', 'Bulk order enquiry')} · ${a('/rice-distributorship', 'Become a distributor')} · ${a('/track-order', 'Track your order')} · ${a('/shipping', 'Shipping policy')} · ${a('/refund', 'Return & refund policy')}</p>`,
  ].join('\n'),

  contest: (meta) => [
    `<h1>${esc(meta.h1)}</h1>`,
    p('Have a great slogan for Chennai Rice? Take part in the Chennai Rice Super Slogan Contest 2026 and share your creativity. Eligible promotional packs contain a coupon code that participants can use to submit their entry through the official contest portal or designated WhatsApp participation channel.'),
    `<section><h2>How to participate</h2>${ol([
      'Buy Kitchidi Ponni Chennai Rice: purchase a Kitchidi Ponni Chennai Rice pack and find the unique code.',
      'Scan and enter: scan the QR code and submit your details.',
      'Share your slogan: win exciting prizes with your best slogan.',
    ])}</section>`,
    `<section><h2>Prizes</h2>${ul(['Car', 'Scooter', 'Gold jewellery', 'Gold coin', 'LED TV', 'Refrigerator', 'Smartphone', 'Silk sarees', 'Mixer grinder', 'Gas stove', 'Pressure cooker', 'Cookware set'])}</section>`,
    `<section><h2>Winners</h2>${p('Prize winners will be announced on this page.')}</section>`,
    `<p>${a('/products/kitchidi-ponni-rice', 'Kitchidi Ponni Rice')} · ${a('/blog/slogan-contest', 'About the contest')} · ${a('/contact-us', 'Contact us')}</p>`,
  ].join('\n'),

  privacy: (meta) => policy(meta.h1, { updated: PRIVACY.POLICY_LAST_UPDATED, intro: PRIVACY.POLICY_INTRO, sections: PRIVACY.POLICY_SECTIONS, contact: legalContact(PRIVACY.POLICY_CONTACT) }),
  terms: (meta) => policy(meta.h1, { updated: TERMS.TERMS_LAST_UPDATED, intro: TERMS.TERMS_INTRO, sections: TERMS.TERMS_SECTIONS, contact: legalContact(TERMS.TERMS_CONTACT) }),
  shipping: (meta) => policy(meta.h1, { updated: SHIPPING_POLICY.lastUpdated, intro: SHIPPING_POLICY.intro, sections: SHIPPING_POLICY.sections, contact: supportBlock() }),
  refund: (meta) => policy(meta.h1, { updated: REFUND_POLICY.lastUpdated, intro: REFUND_POLICY.intro, sections: REFUND_POLICY.sections, contact: supportBlock() }),
}

