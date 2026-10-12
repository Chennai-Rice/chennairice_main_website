// Page URLs, meta titles and meta descriptions, from the "Chennai Rice SEO URL,
// Meta Title, Description" sheet (Oct 2026). One place, read by the pages, the
// links, the router and the sitemap generator (scripts/generate-sitemap.mjs),
// so a URL can never be changed in one and missed in another.
//
// Product IDs inside the shop and the sales database stay as they were (carts,
// orders and the warehouse use them); only the public URL changes. Every old
// URL is redirected to its new one (firebase.json, 301) and in the app.

export const PATHS = {
  home: '/',
  products: '/rice-products',
  about: '/about-us',
  contact: '/contact-us',
  infrastructure: '/infrastructure',
  blog: '/blog',
}

/** Old address → new address, for the redirects. */
export const MOVED_PAGES = {
  '/home': PATHS.home,
  '/products': PATHS.products,
  '/about': PATHS.about,
  '/contact': PATHS.contact,
}

export const PAGE_META = {
  home: {
    title: 'Chennai Rice | Quality Ponni Rice & Idli Rice',
    description: 'Discover quality Ponni Rice, Idli Rice and everyday rice at Chennai Rice, bringing 75+ years of rice expertise and tradition to every meal.',
  },
  products: {
    title: 'Shop Ponni Rice, Idli Rice & More | Chennai Rice',
    description: "Explore Chennai Rice's Ponni Rice, Idli Rice and everyday rice varieties for daily cooking, traditional South Indian meals and family favourites.",
  },
  about: {
    title: 'About Chennai Rice | 75+ Years of Rice Expertise',
    description: "Discover Chennai Rice's 75+ year legacy of rice expertise, advanced automated milling and hygienic processing for consistent quality in every pack.",
  },
  infrastructure: {
    title: 'Rice Mill & Paddy Storage Infrastructure | Chennai Rice',
    description: 'Explore Chennai Rice’s Erode infrastructure: 2,44,000 MTPA milling capacity, 21 silos storing 61,500 MT of paddy and a 10 stage quality process.',
  },
  contact: {
    title: 'Contact Chennai Rice | Erode, Tamil Nadu',
    description: 'Get in touch with Chennai Rice for product enquiries, orders and where to buy. Call 70 6664 6667 or email support@chennairiceindustries.com.',
  },
  blog: {
    title: 'Rice Guides, Insights & Stories | Chennai Rice Blog',
    description: 'Learn about rice from 75+ years of expertise: how rice is milled, how to choose and store it, quality insights and stories from Tamil Nadu’s paddy fields.',
  },
}

/** Shop product ID → its public URL slug, title and description. */
export const PRODUCT_SEO = {
  'a1-special-ponni': {
    slug: 'a1-special-ponni-rice',
    title: 'A1 Special Ponni Rice | Soft Everyday Rice | Chennai Rice',
    description: 'A1 Special Ponni cooks soft and fluffy, ideal for sambar sadam, rasam rice and curd rice. Quality graded for everyday meals. Order online today.',
  },
  'alibaba': {
    slug: 'alibaba-sappadu-rice',
    title: 'Alibaba Premium Sappadu Rice | Chennai Rice',
    description: 'Alibaba is pure, full flavoured rice for a complete Tamil saapadu with kuzhambu, poriyal and kootu. Perfect for daily family lunch. Shop online.',
  },
  'nayara-super-aged': {
    slug: 'nayara-super-aged-rice',
    title: 'Nayara Super Aged Rice | Separate Grains | Chennai Rice',
    description: 'Nayara Super Aged rice cooks separate and firm, never sticky. Perfect for lemon rice, tamarind rice, coconut rice and lunch boxes. Order online now.',
  },
  'rudra': {
    slug: 'rudra-ponni-rice',
    title: 'Rudra Rice | Aromatic Rice for Daily Meals | Chennai Rice',
    description: 'Rudra rice brings original taste and a rich aroma to every meal. Ideal for sambar, kara kuzhambu and rasam with the whole family. Order online today.',
  },
  'special-rajabhogam': {
    slug: 'special-rajabhogam-rice',
    title: 'Special Rajabhogam Rice | Red Pack | Chennai Rice',
    description: 'Special Rajabhogam in our signature red pack, sealed at Erode for clean grains. Everyday rice for lunch and dinner at home. Shop online today.',
  },
  'thaaram': {
    slug: 'thaaram-pooni-rice',
    title: 'Thaaram Nei Kitchadi Rice | Kitchadi & Pongal | Chennai Rice',
    description: 'Make perfect nei kitchadi and ven pongal with Thaaram: strong grains that hold shape, superior taste and rich aroma. Ideal for festive mornings.',
  },
  'united-5kg': {
    slug: 'united-ponni-rice',
    title: 'United Rice | Everyday Rice for Daily Meals | Chennai Rice',
    description: 'United is clean, consistent everyday rice for couples, small families and students cooking at home. Great for daily meals and lunch boxes. Order online.',
  },
  'vijaya-nagaram': {
    slug: 'vijaya-nagaram-rice',
    title: 'Vijaya Nagaram Rice | South Indian Meals | Chennai Rice',
    description: 'Vijaya Nagaram brings familiar taste to everyday South Indian meals with sambar, rasam, kootu and curd rice. Shop online today.',
  },
  'vintage': {
    slug: 'vintage-ponni-rice',
    title: 'Vintage Rice | Premium Rice for Festivals | Chennai Rice',
    description: 'Vintage in the black and gold pack is our premium rice for festival lunches, family gatherings and special meals at home. Order online today.',
  },
  'viruchagam': {
    slug: 'viruchagam-ponni-rice',
    title: 'Viruchagam Rice | Traditional Tamil Meals | Chennai Rice',
    description: 'Viruchagam in the blue and gold pack is everyday rice for traditional Tamil lunch and dinner with kuzhambu, rasam and poriyal. Shop online.',
  },
  'chennai-bullets': {
    slug: 'chennai-bullets-rice',
    title: 'Chennai Bullets Rice | Rich Aroma Rice | Chennai Rice',
    description: 'Chennai Bullets brings rich aroma to every meal. Ideal for joint families, home functions, poojas and festival feasts. Order online today.',
  },
  'kitchidi-ponni-rice': {
    slug: 'kitchidi-ponni-rice',
    title: 'Kitchidi Ponni Rice | Everyday Home Meal Rice | Chennai Rice',
    description: 'Celebrate every special meal with Kitchidi Ponni Rice. Perfect for festive feasts, family gatherings, and everyday home cooking with authentic taste and aroma.',
  },
  'special-idly-rice': {
    slug: 'special-idly-rice',
    title: 'Special Idly Rice | Soft Idli & Crisp Dosa | Chennai Rice',
    description: 'Special Idly Rice for soft, fluffy idlis and crisp dosas. Grind fresh batter at home for breakfast and tiffin. Buy idli rice online today.',
  },
}

const ID_BY_SLUG = Object.fromEntries(Object.entries(PRODUCT_SEO).map(([id, s]) => [s.slug, id]))

/** The public URL of a product page, from its shop ID. */
export function productPath(id) {
  return `/products/${PRODUCT_SEO[id]?.slug || id}`
}

/** The shop ID for a URL slug: a new public slug, or an old ID still in use. */
export function productIdFromSlug(slug) {
  return ID_BY_SLUG[slug] || slug
}
