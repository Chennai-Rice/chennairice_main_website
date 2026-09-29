/* ============================================================================
   Chennai Rice — Website to Figma

   Rebuilds the site's pages as editable Figma frames: real auto-layout, real
   text nodes, real image fills. Nothing here is a screenshot.

   Run it from Figma → Plugins → Development → Chennai Rice — Website to Figma.
   It is safe to run more than once: variables, text styles and the generated
   pages are reused or replaced rather than duplicated.

   Content is a snapshot of frontend/src/data/content.js and the shop
   catalogue, taken when this file was written. Re-run the generator (or edit
   DATA below) if the site's copy changes.
   ========================================================================= */

const ORIGIN = 'https://chennairiceindustries.com'

/* ------------------------------ design tokens ---------------------------- */
/* Values are the ones in frontend/src/styles/global.css. */
const COLORS = {
  'Maroon/maroon': '#7a1f2b',
  'Maroon/maroon-deep': '#5f141f',
  'Maroon/maroon-ink': '#4a1016',
  'Maroon/footer-bg': '#3d0d13',
  'Band/band-top': '#6b1722',
  'Band/band-mid': '#530f19',
  'Band/band-bottom': '#3a080f',
  'Cream/cream': '#f6efdc',
  'Cream/cream-soft': '#faf5e9',
  'Cream/white': '#ffffff',
  'Gold/gold': '#c69a3f',
  'Gold/gold-deep': '#a8842e',
  'Gold/gold-soft': '#d9b96a',
  'Gold/gold-pale': '#ecdfb6',
  'Ink/ink': '#33241f',
  'Ink/heading': '#4a2c22',
  'Ink/muted': '#7d6a5b',
  'Ink/green-deep': '#1e4d3a',
}

/* family, style, size, line-height %, letter-spacing % */
const RAMP = {
  'Display/Hero': ['DM Serif Display', 'Regular', 105, 106, -2],
  'Display/Hero Phone': ['DM Serif Display', 'Regular', 50, 110, -1],
  'Heading/Section': ['Playfair Display', 'SemiBold', 44, 120, 0],
  'Heading/Card': ['Playfair Display', 'SemiBold', 26, 125, 0],
  'Heading/Serif Sm': ['Playfair Display', 'Medium', 18, 140, 0],
  'Label/Section': ['Poppins', 'Medium', 13, 140, 35],
  'Label/Eyebrow': ['Poppins', 'SemiBold', 11.5, 140, 18],
  'Body/Regular': ['Poppins', 'Regular', 15, 170, 0],
  'Body/Small': ['Poppins', 'Light', 13.5, 165, 0],
  'Nav/Link': ['Poppins', 'Regular', 13.5, 140, 2],
  'Button/CTA': ['Poppins', 'Medium', 12, 140, 18],
  'Shop/Display': ['Marcellus', 'Regular', 40, 120, 0],
  'Shop/Body': ['Karla', 'Regular', 16, 160, 0],
  'Script/Signature': ['Mrs Saint Delafield', 'Regular', 42, 100, 0],
}

/* ------------------------------ site content ----------------------------- */
const DATA = {
  nav: ['Home', 'Products', 'About Us', 'Infrastructure', 'Blog', 'Contact'],
  navCta: 'Bulk Order',
  hero: {
    lines: ['“RICE”', 'The White Gold', 'Among Foods.'],
    subtitle: 'The simplicity of cooking rice is the most culturally satisfying experience.',
    estd: "1950's",
  },
  stats: [
    ['50+', 'Years of Excellence'],
    ['25+', 'Rice Varieties'],
    ['500+', 'Retail Partners'],
    ['100%', 'Quality Assured'],
  ],
  showcase: [
    {
      num: '01', name: 'CHENNAI BULLETS', short: 'Chennai Bullets',
      desc: 'Rajabhogam Ponni with a rich aroma and genuine taste, in our largest 26 kg pack — built for kitchens that cook at scale.',
      packSize: '26 KG', riceType: 'Rajabhogam Ponni', idealFor: 'Bulk Kitchens • Large Families',
      image: '/assets/products/chennai-bullets-hero.png', tint: '#EBF3F8',
    },
    {
      num: '02', name: 'ALIBABA', short: 'Alibaba',
      desc: 'Premium Sappadu rice — 100% pure, genuine quality, and hassle-free cooking for the everyday sappadu.',
      packSize: '10 KG', riceType: 'Premium Sappadu Rice', idealFor: 'Everyday Sappadu • Hassle-Free Cooking',
      image: '/assets/products/alibaba-hero.png', tint: '#FAF3E6',
    },
    {
      num: '03', name: 'VIRUCHAGAM', short: 'Viruchagam',
      desc: 'Poompuhar Ponni from SNR RNR paddy — pure rice, 100% natural, and rich in nutrition.',
      packSize: 'Enquire for pack size', riceType: 'SNR RNR Poompuhar Ponni', idealFor: 'Daily Family Dining',
      image: '/assets/products/viruchagam-hero.png', tint: '#EAEFF6',
    },
  ],
  features: [
    ['Carefully', 'Sourced'], ['Hygienically', 'Processed'], ['Premium', 'Quality'],
    ['Uniform', 'Grains'], ['No Artificial', 'Polish'], ['Rich in Taste', '& Aroma'],
  ],
  testimonials: [
    ['Anitha Krishnan', 'Chennai', 5, "Chennai Rice has become our family's favourite. The aroma and taste are simply unmatched!"],
    ['Gopal Reddy', 'Coimbatore', 4, 'Consistent quality year after year. Delivery can run slow in the monsoon, but the rice itself never disappoints.'],
    ['Meena Iyer', 'Bangalore', 5, 'Fluffy, soft and perfect for all our dishes. I highly recommend Chennai Rice.'],
    ['Ramesh Kumar', 'Trichy', 3, 'Good rice at a fair price. The large bag is awkward to store in a small kitchen — I wish the smaller pack were easier to find locally.'],
  ],
  /* 12 packs — Kitchidi Ponni was retired from the catalogue. */
  products: [
    ['special-rajabhogam', 'Classic Red', 'Special Rajabhogam', 10],
    ['nayara-super-aged', 'Super Aged', 'Nayara Super Aged', 10],
    ['vijaya-nagaram', 'Amman Ponni', 'Vijaya Nagaram', 5],
    ['vintage', 'Black & Gold', 'Vintage', 10],
    ['viruchagam', 'Poompuhar Ponni', 'Viruchagam', 10],
    ['united-5kg', 'Green Pack', 'United', 5],
    ['alibaba', 'Premium Sappadu', 'Alibaba', 10],
    ['chennai-bullets', 'Rajabhogam Ponni', 'Chennai Bullets', 26],
    ['a1-special-ponni', 'No.1 Ponni', 'A1 Special Ponni', 5],
    ['rudra', 'Rajabhogam Ponni', 'Rudra', 25],
    ['thaaram', 'Akshaya Ponni', 'Thaaram Nei Kitchadi', 25],
  ],
  productFilters: ['All packs', 'Premium', 'Ponni', 'Bulk packs'],
  footer: {
    newsletter: {
      title: 'Stay Connected',
      text: 'Subscribe to get special offers, recipes, and the latest updates from Chennai Rice.',
      placeholder: 'Enter your email',
    },
    columns: [
      ['Company', ['About Us', 'Contact Us']],
      ['Resources', ['Recipes', 'Blogs']],
      ['Support', ['FAQs', 'Track Order', 'Shipping & Delivery', 'Terms & Conditions', 'Privacy Policy']],
    ],
    copyright: 'Chennai Rice Industries India Private Limited',
    motto: 'From Our Fields to Your Family',
  },
}

const LOGO = '/assets/logo-white-v2.png'
const FOOTER_ART = '/assets/footer-v5.png'

/* Everything the plugin needs to fetch, de-duplicated. */
const IMAGE_PATHS = (() => {
  const set = [LOGO, FOOTER_ART]
  DATA.showcase.forEach(p => set.push(p.image))
  DATA.products.forEach(p => set.push('/assets/shop/packs/' + p[0] + '.png'))
  for (let i = 1; i <= 4; i += 1) set.push('/assets/testimonials/avatar-' + i + '.jpg')
  return set.filter((v, i) => set.indexOf(v) === i)
})()

/* ------------------------------- helpers --------------------------------- */
const rgb = h => {
  const n = h.replace('#', '')
  return {
    r: parseInt(n.slice(0, 2), 16) / 255,
    g: parseInt(n.slice(2, 4), 16) / 255,
    b: parseInt(n.slice(4, 6), 16) / 255,
  }
}
const solid = (h, opacity) => {
  const paint = { type: 'SOLID', color: rgb(h) }
  if (typeof opacity === 'number') paint.opacity = opacity
  return paint
}

let VARS = {}
let STYLES = {}
let IMAGES = {}

/** Auto-layout frame. The Plugin API has no createAutoLayout, so set it up. */
function af(direction, opts) {
  const o = opts || {}
  const f = figma.createFrame()
  f.layoutMode = direction
  f.primaryAxisSizingMode = 'AUTO'
  f.counterAxisSizingMode = 'AUTO'
  f.itemSpacing = o.gap || 0
  f.paddingTop = o.pt != null ? o.pt : o.py || 0
  f.paddingBottom = o.pb != null ? o.pb : o.py || 0
  f.paddingLeft = o.pl != null ? o.pl : o.px || 0
  f.paddingRight = o.pr != null ? o.pr : o.px || 0
  f.primaryAxisAlignItems = o.main || 'MIN'
  f.counterAxisAlignItems = o.cross || 'MIN'
  f.fills = o.fill ? [solid(o.fill)] : []
  if (o.name) f.name = o.name
  if (o.radius) f.cornerRadius = o.radius
  if (o.clip != null) f.clipsContent = o.clip
  return f
}

/** Text node. `width` makes it wrap; otherwise it hugs. */
function txt(chars, styleName, color, opts) {
  const o = opts || {}
  const t = figma.createText()
  const style = STYLES[styleName]
  if (style) t.textStyleId = style.id
  t.characters = String(chars)
  if (color) t.fills = [solid(color, o.opacity)]
  if (o.size) t.fontSize = o.size
  if (o.align) t.textAlignHorizontal = o.align
  if (o.width) {
    // Rule: resize() first, then the auto-resize mode, or the node collapses.
    t.textAutoResize = 'NONE'
    t.resize(o.width, 20)
    t.textAutoResize = 'HEIGHT'
  }
  if (o.name) t.name = o.name
  return t
}

/** Frame carrying one of the fetched images, letter-boxed or cropped. */
function imageFrame(path, w, h, mode, fallbackTint) {
  const f = figma.createFrame()
  f.resize(w, h)
  f.name = path.split('/').pop()
  const hash = IMAGES[path]
  if (hash) {
    f.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: mode || 'FIT' }]
  } else {
    f.fills = [solid(fallbackTint || '#e6dac2')]
    f.name += ' (image unavailable)'
  }
  return f
}

/* --------------------------- tokens & styles ----------------------------- */
async function ensureVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  let collection = collections.filter(c => c.name === 'Chennai Rice')[0]
  if (!collection) collection = figma.variables.createVariableCollection('Chennai Rice')
  const modeId = collection.modes[0].modeId

  const existing = await figma.variables.getLocalVariablesAsync('COLOR')
  const byName = {}
  existing.forEach(v => { byName[v.name] = v })

  Object.keys(COLORS).forEach(name => {
    let v = byName[name]
    if (!v) v = figma.variables.createVariable(name, collection, 'COLOR')
    v.setValueForMode(modeId, rgb(COLORS[name]))
    v.scopes = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR']
    VARS[name] = v
  })
  return Object.keys(VARS).length
}

async function ensureTextStyles() {
  const names = Object.keys(RAMP)

  // Every font must be loaded before a text node is touched.
  const pairs = {}
  names.forEach(n => { pairs[RAMP[n][0] + '|' + RAMP[n][1]] = true })
  // Inter is the default face on a fresh text node; loading it means a text
  // node still works if a style lookup ever misses.
  pairs['Inter|Regular'] = true
  await Promise.all(Object.keys(pairs).map(k => {
    const parts = k.split('|')
    return figma.loadFontAsync({ family: parts[0], style: parts[1] })
  }))

  const existing = await figma.getLocalTextStylesAsync()
  const byName = {}
  existing.forEach(s => { byName[s.name] = s })

  names.forEach(name => {
    const spec = RAMP[name]
    let s = byName[name]
    if (!s) { s = figma.createTextStyle(); s.name = name }
    s.fontName = { family: spec[0], style: spec[1] }
    s.fontSize = spec[2]
    s.lineHeight = { unit: 'PERCENT', value: spec[3] }
    s.letterSpacing = { unit: 'PERCENT', value: spec[4] }
    STYLES[name] = s
  })
  return names.length
}

/* ------------------------------ components -------------------------------- */
/* Built once as real components; every page places instances. */
function buildComponents(parentPage) {
  const made = {}

  // --- navbar ---
  const nav = af('HORIZONTAL', {
    name: 'Navbar', gap: 28, px: 60, py: 0, cross: 'CENTER', main: 'SPACE_BETWEEN', fill: '#530f19',
  })
  nav.resize(1440, 84)
  nav.layoutMode = 'HORIZONTAL'
  nav.primaryAxisSizingMode = 'FIXED'
  nav.counterAxisSizingMode = 'FIXED'
  nav.appendChild(imageFrame(LOGO, 61, 66, 'FIT'))
  const links = af('HORIZONTAL', { name: 'Links', gap: 28, cross: 'CENTER' })
  DATA.nav.forEach(label => links.appendChild(txt(label, 'Nav/Link', '#f2e7d0')))
  nav.appendChild(links)
  const cta = af('HORIZONTAL', { name: 'Bulk Order', px: 24, py: 11, fill: '#8c2331', radius: 4, cross: 'CENTER' })
  cta.appendChild(txt(DATA.navCta, 'Button/CTA', '#f4e6cd'))
  nav.appendChild(cta)

  const navComp = figma.createComponent()
  navComp.resize(1440, 84)
  navComp.name = 'Navbar'
  navComp.appendChild(nav)
  nav.x = 0; nav.y = 0
  parentPage.appendChild(navComp)
  made.navbar = navComp

  // --- product card (products page grid) ---
  const card = af('VERTICAL', {
    name: 'Card', gap: 14, px: 18, pt: 18, pb: 22, fill: '#ffffff', radius: 14, cross: 'CENTER',
  })
  card.resize(280, 400)
  card.primaryAxisSizingMode = 'FIXED'
  card.counterAxisSizingMode = 'FIXED'
  const media = imageFrame('/assets/shop/packs/special-rajabhogam.png', 244, 244, 'FIT', '#f6efdc')
  media.name = 'Pack'
  card.appendChild(media)
  const tag = txt('Classic Red', 'Label/Eyebrow', '#a8842e')
  tag.name = 'Tag'
  card.appendChild(tag)
  const nameT = txt('Special Rajabhogam', 'Heading/Serif Sm', '#4a2c22', { align: 'CENTER', width: 244 })
  nameT.name = 'Name'
  card.appendChild(nameT)
  const size = txt('10 kg', 'Body/Small', '#7d6a5b')
  size.name = 'Pack size'
  card.appendChild(size)
  const btn = af('HORIZONTAL', { name: 'Contact sales', px: 20, py: 10, fill: '#7a1f2b', radius: 4 })
  btn.appendChild(txt('Contact sales', 'Button/CTA', '#f4e6cd'))
  card.appendChild(btn)

  const cardComp = figma.createComponent()
  cardComp.resize(280, 400)
  cardComp.name = 'Product Card'
  cardComp.appendChild(card)
  card.x = 0; card.y = 0
  cardComp.x = 0; cardComp.y = 140
  parentPage.appendChild(cardComp)
  made.card = cardComp

  // --- footer ---
  const footer = af('VERTICAL', { name: 'Footer', gap: 0, fill: '#3d0d13', clip: true })
  footer.resize(1440, 560)
  footer.primaryAxisSizingMode = 'FIXED'
  footer.counterAxisSizingMode = 'FIXED'

  const art = imageFrame(FOOTER_ART, 1440, 960, 'FILL', '#4a1016')
  art.name = 'Footer artwork'
  footer.appendChild(art)
  art.layoutPositioning = 'ABSOLUTE'
  art.x = 0
  art.y = 560 - 960

  const top = af('HORIZONTAL', { name: 'Footer top', gap: 40, px: 60, pt: 42, pb: 28, main: 'SPACE_BETWEEN' })
  top.layoutPositioning = 'ABSOLUTE'
  top.x = 0; top.y = 0
  top.resize(1440, 220)
  top.primaryAxisSizingMode = 'FIXED'
  top.counterAxisSizingMode = 'FIXED'

  const connect = af('VERTICAL', { name: 'Stay Connected', gap: 9 })
  connect.appendChild(txt(DATA.footer.newsletter.title, 'Heading/Card', '#3f2a17', { size: 24 }))
  connect.appendChild(txt(DATA.footer.newsletter.text, 'Body/Small', '#6b5a45', { width: 285 }))
  const field = af('HORIZONTAL', { name: 'Subscribe', fill: '#fffdf7', radius: 8, cross: 'CENTER' })
  field.resize(295, 44)
  field.primaryAxisSizingMode = 'FIXED'
  field.counterAxisSizingMode = 'FIXED'
  field.paddingLeft = 14
  field.strokeWeight = 1
  field.strokes = [solid('#966e37', 0.35)]
  field.appendChild(txt(DATA.footer.newsletter.placeholder, 'Body/Small', '#a9967c'))
  connect.appendChild(field)
  top.appendChild(connect)

  const cols = af('HORIZONTAL', { name: 'Columns', gap: 60 })
  DATA.footer.columns.forEach(pair => {
    const col = af('VERTICAL', { name: pair[0], gap: 7, cross: 'CENTER' })
    col.appendChild(txt(pair[0].toUpperCase(), 'Label/Eyebrow', '#4a2c22'))
    const rule = figma.createRectangle()
    rule.resize(56, 1)
    rule.fills = [solid('#c69a3f')]
    rule.name = 'Rule'
    col.appendChild(rule)
    pair[1].forEach(l => col.appendChild(txt(l, 'Body/Small', '#5f4c3c')))
    cols.appendChild(col)
  })
  top.appendChild(cols)
  footer.appendChild(top)

  const bar = af('VERTICAL', { name: 'Legal', gap: 6, px: 60, py: 18, cross: 'CENTER' })
  bar.layoutPositioning = 'ABSOLUTE'
  bar.resize(1440, 70)
  bar.primaryAxisSizingMode = 'FIXED'
  bar.counterAxisSizingMode = 'FIXED'
  bar.x = 0; bar.y = 490
  bar.appendChild(txt(DATA.footer.copyright, 'Body/Small', '#e3c9b4', { align: 'CENTER' }))
  bar.appendChild(txt(DATA.footer.motto, 'Heading/Serif Sm', '#f2ddc0', { align: 'CENTER', size: 15 }))
  footer.appendChild(bar)

  const footerComp = figma.createComponent()
  footerComp.resize(1440, 560)
  footerComp.name = 'Footer'
  footerComp.appendChild(footer)
  footer.x = 0; footer.y = 0
  footerComp.x = 0; footerComp.y = 600
  parentPage.appendChild(footerComp)
  made.footer = footerComp

  return made
}

/* --------------------------------- pages --------------------------------- */
function buildHome(components) {
  const page = af('VERTICAL', { name: 'Home — Desktop 1440', gap: 0, fill: '#f6efdc' })
  page.resize(1440, 100)
  page.counterAxisSizingMode = 'FIXED'

  page.appendChild(components.navbar.createInstance())

  /* --- hero --- */
  const hero = af('VERTICAL', { name: 'Hero', gap: 0, cross: 'CENTER', pt: 150, pb: 0, fill: '#1c1409' })
  hero.resize(1440, 760)
  hero.primaryAxisSizingMode = 'FIXED'
  hero.counterAxisSizingMode = 'FIXED'
  hero.clipsContent = true

  const heroCopy = af('VERTICAL', { name: 'Hero copy', gap: 0, cross: 'CENTER' })
  DATA.hero.lines.forEach(line => {
    heroCopy.appendChild(txt(line, 'Display/Hero', '#f8f2e3', { align: 'CENTER' }))
  })
  const sub = txt(DATA.hero.subtitle, 'Body/Regular', '#e6dac0', { align: 'CENTER', width: 620 })
  sub.name = 'Subtitle'
  heroCopy.appendChild(sub)
  hero.appendChild(heroCopy)

  /* ESTD badge — a ring, as in the CSS */
  const badge = af('VERTICAL', { name: 'ESTD badge', gap: 2, cross: 'CENTER', main: 'CENTER' })
  badge.resize(96, 96)
  badge.primaryAxisSizingMode = 'FIXED'
  badge.counterAxisSizingMode = 'FIXED'
  badge.cornerRadius = 48
  badge.fills = [solid('#26100a', 0.55)]
  badge.strokeWeight = 1.5
  badge.strokes = [solid('#d6b264')]
  badge.appendChild(txt('ESTD', 'Label/Eyebrow', '#f0dcaa', { size: 10 }))
  badge.appendChild(txt(DATA.hero.estd, 'Heading/Serif Sm', '#f6e6bd', { size: 24 }))
  hero.appendChild(badge)
  badge.layoutPositioning = 'ABSOLUTE'
  badge.x = 1440 - 96 - 100
  badge.y = 470
  page.appendChild(hero)

  /* --- stats --- */
  const stats = af('HORIZONTAL', { name: 'Stats', gap: 0, py: 46, main: 'CENTER', fill: '#f6efdc' })
  stats.resize(1440, 140)
  stats.primaryAxisSizingMode = 'FIXED'
  stats.counterAxisSizingMode = 'FIXED'
  DATA.stats.forEach(pair => {
    const cell = af('VERTICAL', { name: pair[1], gap: 6, cross: 'CENTER' })
    cell.resize(300, 80)
    cell.primaryAxisSizingMode = 'FIXED'
    cell.counterAxisSizingMode = 'FIXED'
    cell.counterAxisAlignItems = 'CENTER'
    cell.primaryAxisAlignItems = 'CENTER'
    cell.appendChild(txt(pair[0], 'Heading/Section', '#a8842e', { size: 40, align: 'CENTER' }))
    cell.appendChild(txt(pair[1], 'Label/Eyebrow', '#7d6a5b', { align: 'CENTER' }))
    stats.appendChild(cell)
  })
  page.appendChild(stats)

  /* --- showcase --- */
  DATA.showcase.forEach(item => {
    const slot = af('HORIZONTAL', { name: 'Showcase ' + item.num, gap: 40, px: 80, py: 70, cross: 'CENTER', fill: item.tint })
    slot.resize(1440, 560)
    slot.primaryAxisSizingMode = 'FIXED'
    slot.counterAxisSizingMode = 'FIXED'

    const left = af('VERTICAL', { name: 'Copy', gap: 16 })
    left.resize(360, 300)
    left.primaryAxisSizingMode = 'AUTO'
    left.counterAxisSizingMode = 'FIXED'
    left.appendChild(txt(item.num, 'Heading/Section', '#c69a3f', { size: 46 }))
    left.appendChild(txt(item.short.toUpperCase(), 'Label/Eyebrow', '#7d6a5b'))
    left.appendChild(txt(item.desc, 'Body/Regular', '#33241f', { width: 360 }))
    const more = af('HORIZONTAL', { name: 'View more products', px: 24, py: 13, fill: '#7a1f2b', radius: 3 })
    more.appendChild(txt('View more products', 'Button/CTA', '#f4e6cd'))
    left.appendChild(more)
    const enq = af('HORIZONTAL', { name: 'Enquire', px: 24, py: 12, radius: 3 })
    enq.strokeWeight = 1
    enq.strokes = [solid('#7d6a5b', 0.5)]
    enq.appendChild(txt('Enquire', 'Button/CTA', '#4a2c22'))
    left.appendChild(enq)
    slot.appendChild(left)

    const pack = imageFrame(item.image, 380, 420, 'FIT', item.tint)
    pack.name = item.short + ' pack'
    slot.appendChild(pack)

    const right = af('VERTICAL', { name: 'Specs', gap: 18 })
    right.resize(340, 300)
    right.counterAxisSizingMode = 'FIXED'
    right.counterAxisAlignItems = 'MAX'
    right.appendChild(txt(item.name, 'Heading/Card', '#1e4d3a', { align: 'RIGHT', width: 340 }))
    ;[[item.packSize, 'PACK SIZE'], [item.riceType, 'RICE TYPE'], [item.idealFor, 'IDEAL FOR']].forEach(spec => {
      const row = af('VERTICAL', { name: spec[1], gap: 2 })
      row.counterAxisAlignItems = 'MAX'
      row.appendChild(txt(spec[0], 'Body/Regular', '#33241f', { align: 'RIGHT', width: 340 }))
      row.appendChild(txt(spec[1], 'Label/Eyebrow', '#a8842e', { align: 'RIGHT', width: 340, size: 10 }))
      right.appendChild(row)
    })
    slot.appendChild(right)
    page.appendChild(slot)
  })

  /* --- feature strip --- */
  const feats = af('HORIZONTAL', { name: 'Why Chennai Rice', gap: 0, py: 52, main: 'CENTER', fill: '#530f19' })
  feats.resize(1440, 170)
  feats.primaryAxisSizingMode = 'FIXED'
  feats.counterAxisSizingMode = 'FIXED'
  DATA.features.forEach(label => {
    const cell = af('VERTICAL', { name: label.join(' '), gap: 4, cross: 'CENTER' })
    cell.resize(200, 66)
    cell.primaryAxisSizingMode = 'FIXED'
    cell.counterAxisSizingMode = 'FIXED'
    cell.primaryAxisAlignItems = 'CENTER'
    cell.counterAxisAlignItems = 'CENTER'
    label.forEach(l => cell.appendChild(txt(l, 'Body/Small', '#f2e7d0', { align: 'CENTER' })))
    feats.appendChild(cell)
  })
  page.appendChild(feats)

  /* --- testimonials --- */
  const testi = af('VERTICAL', { name: 'Testimonials', gap: 30, py: 70, px: 80, cross: 'CENTER', fill: '#faf5e9' })
  testi.resize(1440, 420)
  testi.primaryAxisSizingMode = 'FIXED'
  testi.counterAxisSizingMode = 'FIXED'
  testi.appendChild(txt('WHAT OUR CUSTOMERS SAY', 'Label/Section', '#a8842e', { align: 'CENTER' }))
  const row = af('HORIZONTAL', { name: 'Cards', gap: 24 })
  DATA.testimonials.forEach((t, i) => {
    const c = af('VERTICAL', { name: t[0], gap: 10, px: 22, py: 24, fill: '#ffffff', radius: 12 })
    c.resize(300, 210)
    c.primaryAxisSizingMode = 'FIXED'
    c.counterAxisSizingMode = 'FIXED'
    const head = af('HORIZONTAL', { name: 'Person', gap: 10, cross: 'CENTER' })
    const avatar = imageFrame('/assets/testimonials/avatar-' + (i + 1) + '.jpg', 40, 40, 'FILL', '#e6dac2')
    avatar.cornerRadius = 20
    head.appendChild(avatar)
    const who = af('VERTICAL', { name: 'Name', gap: 0 })
    who.appendChild(txt(t[0], 'Body/Regular', '#4a2c22', { size: 14 }))
    who.appendChild(txt(t[1], 'Body/Small', '#7d6a5b', { size: 12 }))
    head.appendChild(who)
    c.appendChild(head)
    c.appendChild(txt('★'.repeat(t[2]) + '☆'.repeat(5 - t[2]), 'Body/Small', '#c69a3f'))
    c.appendChild(txt('“' + t[3] + '”', 'Body/Small', '#33241f', { width: 256 }))
    row.appendChild(c)
  })
  testi.appendChild(row)
  page.appendChild(testi)

  page.appendChild(components.footer.createInstance())
  return page
}

function buildProducts(components) {
  const page = af('VERTICAL', { name: 'Products — Desktop 1440', gap: 0, fill: '#f6efdc' })
  page.resize(1440, 100)
  page.counterAxisSizingMode = 'FIXED'
  page.appendChild(components.navbar.createInstance())

  const hero = af('VERTICAL', { name: 'Products hero', gap: 12, py: 64, px: 80, cross: 'CENTER', fill: '#faf5e9' })
  hero.resize(1440, 230)
  hero.primaryAxisSizingMode = 'FIXED'
  hero.counterAxisSizingMode = 'FIXED'
  hero.appendChild(txt('✦ PREMIUM COLLECTION ✦', 'Label/Section', '#a8842e', { align: 'CENTER' }))
  hero.appendChild(txt('Our Rice Packs', 'Shop/Display', '#4a2c22', { align: 'CENTER' }))
  hero.appendChild(txt(
    'Ponni, Sappadu and Rajabhogam varieties, milled and sealed at our own Erode facility and packed from 5 kg to 26 kg.',
    'Shop/Body', '#7d6a5b', { align: 'CENTER', width: 640 }
  ))
  page.appendChild(hero)

  const filters = af('HORIZONTAL', { name: 'Filters', gap: 12, py: 24, main: 'CENTER' })
  filters.resize(1440, 80)
  filters.primaryAxisSizingMode = 'FIXED'
  filters.counterAxisSizingMode = 'FIXED'
  DATA.productFilters.forEach((f, i) => {
    const pill = af('HORIZONTAL', { name: f, px: 20, py: 9, radius: 99, fill: i === 0 ? '#7a1f2b' : undefined })
    if (i !== 0) { pill.strokeWeight = 1; pill.strokes = [solid('#7d6a5b', 0.4)] }
    pill.appendChild(txt(f, 'Label/Eyebrow', i === 0 ? '#f4e6cd' : '#4a2c22'))
    filters.appendChild(pill)
  })
  page.appendChild(filters)

  const grid = af('VERTICAL', { name: 'Grid', gap: 26, px: 80, pb: 70 })
  grid.resize(1440, 100)
  grid.counterAxisSizingMode = 'FIXED'
  for (let i = 0; i < DATA.products.length; i += 4) {
    const r = af('HORIZONTAL', { name: 'Row', gap: 26 })
    DATA.products.slice(i, i + 4).forEach(p => {
      const inst = components.card.createInstance()
      const pack = inst.findOne(n => n.name.indexOf('.png') !== -1 || n.name.indexOf('image unavailable') !== -1)
      const hash = IMAGES['/assets/shop/packs/' + p[0] + '.png']
      if (pack && hash) {
        pack.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FIT' }]
        pack.name = p[0] + '.png'
      }
      const tagNode = inst.findOne(n => n.name === 'Tag')
      const nameNode = inst.findOne(n => n.name === 'Name')
      const sizeNode = inst.findOne(n => n.name === 'Pack size')
      if (tagNode) tagNode.characters = p[1]
      if (nameNode) nameNode.characters = p[2]
      if (sizeNode) sizeNode.characters = p[3] + ' kg'
      inst.name = p[2]
      r.appendChild(inst)
    })
    grid.appendChild(r)
  }
  page.appendChild(grid)

  page.appendChild(components.footer.createInstance())
  return page
}

/* --------------------------------- main ---------------------------------- */
async function run(images, failed) {
  images.forEach(img => {
    IMAGES[img.path] = figma.createImage(img.bytes).hash
  })

  const variableCount = await ensureVariables()
  const styleCount = await ensureTextStyles()

  // Components live on their own page so the screens stay uncluttered.
  const existingComponents = figma.root.children.filter(p => p.name === 'Components')[0]
  const componentPage = existingComponents || figma.createPage()
  componentPage.name = 'Components'
  await figma.setCurrentPageAsync(componentPage)
  componentPage.children.slice().forEach(c => c.remove())
  const components = buildComponents(componentPage)

  const existingScreens = figma.root.children.filter(p => p.name === 'Pages')[0]
  const screens = existingScreens || figma.createPage()
  screens.name = 'Pages'
  await figma.setCurrentPageAsync(screens)
  screens.children.slice().forEach(c => c.remove())

  const home = buildHome(components)
  home.x = 0
  home.y = 0
  screens.appendChild(home)

  const products = buildProducts(components)
  products.x = 1640
  products.y = 0
  screens.appendChild(products)

  figma.viewport.scrollAndZoomIntoView([home, products])

  return {
    variableCount,
    styleCount,
    pages: ['Home', 'Products'],
    imagesPlaced: Object.keys(IMAGES).length,
    imagesFailed: failed,
  }
}

figma.showUI(__html__, { width: 320, height: 200 })

figma.ui.onmessage = async msg => {
  // The iframe announces itself first; posting the job before it is listening
  // loses the message and the plugin hangs.
  if (msg.type === 'ready') {
    figma.ui.postMessage({ type: 'fetch-images', origin: ORIGIN, paths: IMAGE_PATHS })
    return
  }
  if (msg.type !== 'images') return
  try {
    const result = await run(msg.images, msg.failed || [])
    const note =
      'Built ' + result.pages.join(' and ') + ' — ' +
      result.imagesPlaced + ' images, ' +
      result.variableCount + ' colour variables, ' +
      result.styleCount + ' text styles.' +
      (result.imagesFailed.length ? ' ' + result.imagesFailed.length + ' image(s) unavailable.' : '')
    figma.closePlugin(note)
  } catch (err) {
    figma.closePlugin('Failed: ' + (err && err.message ? err.message : String(err)))
  }
}
