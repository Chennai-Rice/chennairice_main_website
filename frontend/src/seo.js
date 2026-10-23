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

// Every public page's title, meta description and H1, from the "Chennai Rice
// SEO - Sheet1" on-page plan (Oct 2026), with only facts already on the site.
// The pages read these, and scripts/prerender-head.mjs writes them into each
// page's HTML so a crawler sees them before any JavaScript runs. noindex pages
// are left out of the sitemap.
export const PAGE_META = {
  home: {
    path: '/',
    title: 'Chennai Rice | Quality Ponni Rice for Every Home',
    description: 'Discover Chennai Rice\'s range of Ponni rice and everyday rice varieties. Explore quality-focused rice for traditional Tamil meals and family dining.',
    h1: 'Chennai Rice: Quality Rice for Every Tamil Kitchen',
    keywords: 'Chennai Rice, Ponni rice, rice varieties, Tamil Nadu rice, idli rice, buy rice online',
  },
  products: {
    path: '/rice-products',
    title: 'Rice Varieties in Tamil Nadu | Chennai Rice',
    description: 'Explore rice varieties from Chennai Rice, including Kitchidi Ponni, Nayara Super Aged, Special Rajabhogam and Viruchagam. Find rice for everyday meals.',
    h1: 'Explore Rice Varieties for Every Meal',
    keywords: 'rice varieties, Ponni rice, aged rice, Kitchidi Ponni, Nayara Super Aged, Special Rajabhogam, Viruchagam',
  },
  about: {
    path: '/about-us',
    title: 'About Chennai Rice Industries | Our Story & Quality',
    description: 'Discover Chennai Rice Industries, our rice heritage, sourcing practices, processing capabilities and commitment to consistent rice quality.',
    h1: 'About Chennai Rice Industries',
    keywords: 'Chennai Rice Industries, rice company Tamil Nadu, rice mill Erode',
  },
  infrastructure: {
    path: '/infrastructure',
    title: 'Rice Processing Infrastructure | Chennai Rice Industries',
    description: 'Learn about Chennai Rice Industries\' rice processing facility, milling technology, quality checks, storage and production capabilities.',
    h1: 'Rice Processing Infrastructure at Chennai Rice Industries',
    keywords: 'rice processing company, rice mill, rice milling infrastructure, paddy storage',
  },
  contact: {
    path: '/contact-us',
    title: 'Contact Chennai Rice Industries | Sales & Enquiries',
    description: 'Contact Chennai Rice Industries for product enquiries, bulk orders, distribution opportunities and customer support. Reach our team through the available contact options.',
    h1: 'Contact Chennai Rice Industries',
    keywords: 'contact Chennai Rice Industries, rice enquiries, bulk rice orders',
  },
  blog: {
    path: '/blog',
    title: 'Rice Guides, Tips & Updates | Chennai Rice Blog',
    description: 'Explore rice varieties, cooking tips, rice knowledge, product updates and stories from Chennai Rice Industries.',
    h1: 'Rice Guides, Cooking Tips and Stories From Chennai Rice',
    keywords: 'rice knowledge, rice recipes, cooking tips, Ponni rice guide',
  },
  bulkOrder: {
    path: '/bulk-order',
    title: 'Wholesale Rice Supplier in Tamil Nadu | Chennai Rice',
    description: 'Looking for a wholesale rice supplier? Explore bulk rice purchasing and business enquiry options from Chennai Rice Industries for retailers and distributors.',
    h1: 'Wholesale Rice Supplier for Retailers and Distributors',
    keywords: 'wholesale rice supplier, bulk rice, rice distributor, rice supplier Tamil Nadu',
  },
  founder: {
    path: '/founder',
    title: 'Our Founder & Rice Heritage | Chennai Rice Industries',
    description: 'Discover the story, vision and legacy behind Chennai Rice Industries and its commitment to bringing quality rice to households.',
    h1: 'The Vision and Legacy Behind Chennai Rice Industries',
    keywords: 'Chennai Rice founder, Chennai Rice Industries history, M. S. Tamilselvan',
  },
  contest: {
    path: '/contest',
    title: 'Chennai Rice Super Slogan Contest 2026 | Prizes',
    description: 'Chennai Rice Super Slogan Contest 2026. Check participation instructions, eligibility, terms and conditions, and official contest updates.',
    h1: 'Chennai Rice Super Slogan Contest 2026',
    keywords: 'Chennai Rice Super Slogan Contest, slogan contest 2026, Chennai Rice contest prizes',
  },
  // Phase 2 landing pages (data/landing.js). lang and alternate drive the
  // hreflang links between each English page and its Tamil version.
  ponni: {
    path: '/ponni-rice',
    alternate: '/ta/ponni-rice',
    title: 'Ponni Rice 26 kg – Aged Ponni Rice Online | Chennai Rice',
    description: 'Buy Ponni rice 26 kg from Chennai Rice, Erode. Aged Ponni varieties that cook soft and non-sticky for everyday meals. See prices and order online.',
    h1: 'Ponni Rice – 26 kg Packs from Chennai Rice',
    keywords: 'Ponni rice, Ponni rice 26 kg, aged Ponni rice',
  },
  idli: {
    path: '/idli-rice',
    alternate: '/ta/idli-rice',
    title: 'Idli Rice 26 kg for Soft Idli & Dosa | Chennai Rice',
    description: 'Chennai Rice Special Idly Rice in 26 kg packs: grinds smooth, ferments well and steams into soft, fluffy idlis and crisp dosas. Order for home or wholesale.',
    h1: 'Idli Rice for Soft Idlis & Crisp Dosas – 26 kg',
    keywords: 'idli rice, idly rice, idli rice 26 kg',
  },
  distributor: {
    path: '/rice-distributorship',
    title: 'Rice Distributorship in Tamil Nadu | Join Chennai Rice',
    description: 'Become a Chennai Rice distributor. A rice brand since the 1950s, steady supply from our Erode mill and 13 rice packs to sell. Apply online today.',
    h1: 'Become a Chennai Rice Distributor',
    keywords: 'rice distributorship, rice distributor Tamil Nadu',
  },
  taHome: {
    path: '/ta',
    lang: 'ta',
    alternate: '/',
    title: 'சென்னை ரைஸ் – பொன்னி & இட்லி அரிசி உற்பத்தியாளர், ஈரோடு',
    description: 'ஈரோடு சென்னை ரைஸ் இண்டஸ்ட்ரீஸ் – 1950களிலிருந்து தரமான பொன்னி, இட்லி மற்றும் புழுங்கல் அரிசி 26 கிலோ பைகளில். இப்போதே ஆர்டர் செய்யுங்கள்.',
    h1: 'தரமான பொன்னி அரிசி & இட்லி அரிசி – ஈரோடு',
  },
  taPonni: {
    path: '/ta/ponni-rice',
    lang: 'ta',
    alternate: '/ponni-rice',
    title: 'பொன்னி அரிசி 26 கிலோ – விலை & ஆர்டர் | சென்னை ரைஸ்',
    description: 'சென்னை ரைஸ் பொன்னி அரிசி 26 கிலோ – பழைய பொன்னி வகைகள். தினசரி சாப்பாட்டுக்கு ஏற்றது. விலை பார்த்து ஆன்லைனில் ஆர்டர் செய்யுங்கள்.',
    h1: 'பொன்னி அரிசி – 26 கிலோ',
  },
  taIdli: {
    path: '/ta/idli-rice',
    lang: 'ta',
    alternate: '/idli-rice',
    title: 'இட்லி அரிசி 26 கிலோ – மென்மையான இட்லிக்கு | சென்னை ரைஸ்',
    description: 'சென்னை ரைஸ் ஸ்பெஷல் இட்லி அரிசி 26 கிலோ – மிருதுவான இட்லி, மொறுமொறுப்பான தோசைக்கு. வீட்டுக்கும் மொத்த விற்பனைக்கும் ஆர்டர் செய்யுங்கள்.',
    h1: 'இட்லி அரிசி – மென்மையான இட்லிக்கு',
  },
  trackOrder: {
    path: '/track-order',
    title: 'Track Your Order | Chennai Rice',
    description: 'Track your Chennai Rice order status.',
    h1: 'Track Your Order',
    noindex: true,
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy | Chennai Rice Industries',
    description: 'Read the Chennai Rice Industries privacy policy to understand how personal information is collected, used, stored and protected.',
    h1: 'Privacy Policy',
  },
  shipping: {
    path: '/shipping',
    title: 'Shipping Policy | Chennai Rice',
    description: 'How Chennai Rice packs, ships and delivers website orders across India: dispatch in 1–2 working days, delivery charges shown before you pay, tracking and delivery attempts.',
    h1: 'Shipping Policy',
  },
  refund: {
    path: '/refund',
    title: 'Return & Refund Policy | Chennai Rice',
    description: 'Damaged, wrong, short-weight or quality issues with your Chennai Rice order: report within 48 hours or 7 days for a free replacement or full refund. Cancellations and refund timelines.',
    h1: 'Return & Refund Policy',
  },
  terms: {
    path: '/terms',
    title: 'Terms & Conditions | Chennai Rice',
    description: 'The terms and conditions for using the Chennai Rice Industries website and for orders placed through it: payment, delivery, returns and refunds.',
    h1: 'Terms & Conditions',
  },
}

/**
 * Shop product ID → its public URL slug, title and description, plus the
 * on-page headings from "Chennai Rice SEO - Product Page" (Oct 2026): the
 * heading name (H1, card H3, "About <name> Rice"…), the one-line card text
 * on the products page, the "About <name> Rice" text (SEO Description
 * sheet, Oct 2026) and the "Best Dishes to Cook with…" H3s.
 */
export const PRODUCT_SEO = {
  'a1-special-ponni': {
    about: "A1 Special Ponni is quality graded for even grains that cook soft, fluffy and light every time. It is the everyday rice for weekday lunches and family dinners, made for sambar sadam, rasam rice, kuzhambu and a cooling bowl of curd rice. Pack it in lunch boxes, serve it at Sunday family meals or keep it as your regular kitchen rice. Graded and packed at our Erode facility so every bag cooks the same way, meal after meal.",
    name: 'A1 Special Ponni',
    line: 'Soft, fluffy grains for sambar sadam and curd rice.',
    dishes: ['Sambar Sadam', 'Rasam Rice', 'Curd Rice'],
    slug: 'a1-special-ponni-rice',
    h1: 'A1 Special Ponni Rice – 26 kg',
    title: 'A1 Special Ponni Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy A1 Special Ponni Rice 26 kg from Chennai Rice, Erode. Quality graded, soft and fluffy for sambar sadam and curd rice. Home & wholesale delivery.',
  },
  'alibaba': {
    about: "A proper saapadu needs rice that holds its own on the plate. Alibaba is 100% pure, original quality rice with full flavour in every grain. Serve it with kuzhambu, rasam, poriyal, kootu and appalam for a complete Tamil lunch, whether it is a busy weekday, a Sunday family meal or guests visiting home. A dependable choice for households that enjoy a hearty plate of rice every day.",
    name: 'Alibaba',
    line: 'Full flavoured rice for a complete Tamil saapadu.',
    dishes: ['Full Tamil Saapadu', 'Kuzhambu Rice', 'Rasam Rice'],
    slug: 'alibaba-sappadu-rice',
    h1: 'Alibaba Sappadu Rice – 26 kg',
    title: 'Alibaba Sappadu Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy Alibaba Sappadu Rice 26 kg from Chennai Rice, Erode. 100% pure, full-flavoured rice for a complete Tamil saapadu. Home & wholesale delivery.',
  },
  'nayara-super-aged': {
    about: "If you want rice that does not turn sticky, choose Nayara Super Aged. This aged gel cook rice cooks into separate, firm grains, making it ideal for variety rice such as lemon rice, puliyodharai, coconut rice and tomato rice. It keeps its texture in school and office lunch boxes, on travel days and for prasadam made at home. Use it whenever presentation and grain separation matter.",
    name: 'Nayara Super Aged',
    line: 'Cooks separate and firm, perfect for lemon rice and lunch boxes.',
    dishes: ['Lemon Rice', 'Tamarind Rice', 'Lunch Boxes'],
    slug: 'nayara-super-aged-rice',
    h1: 'Nayara Super Aged Rice for Everyday Cooking',
    title: 'Nayara Super Aged Rice | Chennai Rice',
    description: 'Discover Nayara Super Aged Rice from Chennai Rice, suitable for everyday meals and variety rice preparations. Explore available pack sizes.',
    keywords: 'Nayara Super Aged rice',
  },
  'rudra': {
    about: "Rudra brings original taste and a rich aroma that fills the kitchen as the rice finishes cooking. It suits larger families and homes that host relatives, festivals and weekend gatherings. Enjoy it with sambar, kara kuzhambu, mor kuzhambu or simple rasam for a satisfying everyday meal. Store in a cool, dry place and keep the bag sealed after opening.",
    name: 'Rudra',
    line: 'Original taste and rich aroma for everyday family meals.',
    dishes: ['Sambar Rice', 'Kara Kuzhambu Rice', 'Mor Kuzhambu Rice'],
    slug: 'rudra-ponni-rice',
    h1: 'Rudra Ponni Rice – 25 kg',
    title: 'Rudra Ponni Rice 25 kg – Buy Online | Chennai Rice',
    description: 'Buy Rudra Ponni Rice 25 kg from Chennai Rice, Erode. Rajabhogam Ponni with original taste and a rich aroma. Home & wholesale delivery.',
  },
  'special-rajabhogam': {
    about: "Look for the signature red pack on your grocery list. Special Rajabhogam is milled and sealed at our Erode facility, so it reaches your kitchen clean and consistent. It is everyday rice for lunch and dinner at home, served with sambar, rasam, vathal kuzhambu and vegetable poriyal. A comforting choice for daily family meals and easy weeknight cooking.",
    name: 'Special Rajabhogam',
    line: 'Everyday rice in our signature red pack for comforting home meals.',
    dishes: ['Sambar Rice', 'Vathal Kuzhambu Rice', 'Rasam Rice'],
    slug: 'special-rajabhogam-rice',
    h1: 'Special Rajabhogam Rice for Family Meals',
    title: 'Special Rajabhogam Rice | Chennai Rice',
    description: 'Discover Special Rajabhogam Rice from Chennai Rice for everyday family meals. Explore the available pack sizes and product details.',
    keywords: 'Special Rajabhogam rice',
  },
  'thaaram': {
    about: "A good nei kitchadi needs rice that will not break down in the pot. Thaaram has strong grains with superior taste and rich aroma, made for ghee rich kitchadi, ven pongal and sakkarai pongal. Cook it for Pongal and Margazhi mornings, Sunday breakfasts, poojas at home or any day you want a festive dish on the table. Adjust water to the texture your family likes.",
    name: 'Thaaram Nei Kitchadi',
    line: 'Strong grains that hold shape in nei kitchadi and pongal.',
    dishes: ['Nei Kitchadi', 'Ven Pongal', 'Sakkarai Pongal'],
    slug: 'thaaram-pooni-rice',
    h1: 'Thaaram Nei Kitchadi Rice – 25 kg',
    title: 'Thaaram Nei Kitchadi Rice 25 kg – Buy Online | Chennai Rice',
    description: 'Buy Thaaram Nei Kitchadi Rice 25 kg from Chennai Rice, Erode. Akshaya Ponni with strong grains for nei kitchadi and pongal. Home & wholesale delivery.',
  },
  'united-5kg': {
    about: "United is everyday rice made simple. Clean, consistent grains cook easily for daily rice meals, quick curd rice, lunch boxes and weeknight dinners. It is a great fit for couples, small families, working professionals and students cooking for themselves, and an easy way to try Chennai Rice for the first time.",
    name: 'United',
    line: 'Clean, consistent rice for small families and daily meals.',
    dishes: ['Daily Rice Meals', 'Curd Rice', 'Lunch Boxes'],
    slug: 'united-ponni-rice',
    h1: 'United Ponni Rice – 26 kg',
    title: 'United Ponni Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy United Ponni Rice 26 kg from Chennai Rice, Erode. Dependable everyday rice for lunch and dinner at home. Home & wholesale delivery.',
  },
  'vijaya-nagaram': {
    about: "Vijaya Nagaram is milled for everyday South Indian cooking, with the familiar taste your family grew up with. Serve it at lunch with sambar, rasam and kootu, at dinner with kara kuzhambu, or as curd rice on warm afternoons. A comforting rice for family meals, festival lunches and the daily plate at home.",
    name: 'Vijaya Nagaram',
    line: 'Familiar taste for sambar, rasam, kootu and curd rice.',
    dishes: ['Sambar Rice', 'Rasam Rice', 'Curd Rice'],
    slug: 'vijaya-nagaram-rice',
    h1: 'Vijaya Nagaram Rice – 26 kg',
    title: 'Vijaya Nagaram Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy Vijaya Nagaram Rice 26 kg from Chennai Rice, Erode. Amman Ponni (HMT grain) for everyday South Indian meals. Home & wholesale delivery.',
  },
  'vintage': {
    about: "Vintage is our premium selection, recognisable by its black and gold pack. Milled and sealed at our Erode facility, it is the rice to bring out for occasions: Deepavali and Pongal lunches, birthdays, housewarming meals, family gatherings and Sunday feasts on a banana leaf. Pair it with sambar, rasam, payasam and a full spread of poriyal for a meal worth remembering.",
    name: 'Vintage',
    line: 'Our premium choice for festival lunches and family gatherings.',
    dishes: ['Festival Lunches', 'Banana Leaf Feasts', 'Family Gatherings'],
    slug: 'vintage-ponni-rice',
    h1: 'Vintage Special Ponni Rice – 26 kg',
    title: 'Vintage Special Ponni Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy Vintage Special Ponni Rice 26 kg from Chennai Rice, Erode. Premium rice in the black-and-gold pack for festive meals. Home & wholesale delivery.',
  },
  'viruchagam': {
    about: "Look for the blue and gold pack. Viruchagam suits the everyday traditional Tamil menu: steamed rice with kuzhambu, rasam and poriyal at lunch, or a simple plate of rice and curd at dinner. Dependable grains that cook well day after day make it a reliable rice for regular family cooking all through the week.",
    name: 'Viruchagam',
    line: 'Everyday rice for traditional Tamil lunch and dinner.',
    dishes: ['Kuzhambu Rice', 'Rasam Rice', 'Curd Rice'],
    slug: 'viruchagam-ponni-rice',
    h1: 'Viruchagam Ponni Rice for Traditional Meals',
    title: 'Viruchagam Ponni Rice | Chennai Rice',
    description: 'Explore Viruchagam Ponni Rice from Chennai Rice, made for traditional family meals. View product details and available pack sizes.',
    keywords: 'Viruchagam Ponni rice',
  },
  'chennai-bullets': {
    about: "Chennai Bullets is aromatic rice made for big kitchens and bigger gatherings. It is ideal for joint families, homes that cook for many every day, and occasions such as poojas, housewarmings, family functions and festival feasts. Serve it with sambar, kara kuzhambu and a full spread of sides, and enjoy rich aroma in every meal.",
    name: 'Chennai Bullets',
    line: 'Rich aroma for joint families, poojas and home functions.',
    dishes: ['Poojas and Home Functions', 'Joint Family Meals', 'Festival Feasts'],
    slug: 'chennai-bullets-rice',
    h1: 'Chennai Bullets Rice – 26 kg',
    title: 'Chennai Bullets Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy Chennai Bullets Rice 26 kg from Chennai Rice, Erode. Rajabhogam Ponni with a rich aroma in our trade pack. Home & wholesale delivery.',
  },
  'kitchidi-ponni-rice': {
    about: "Nothing feels quite like veettu saapadu, the simple meal of rice, kuzhambu, rasam and poriyal cooked at home. Kitchidi Ponni is made for exactly that. It is processed end to end in our fully automated Erode mill with no human handling, so the grains reach your kitchen clean. Cook it for everyday lunch and dinner, school and office lunch boxes, and the comforting Sunday meal at home.",
    name: 'Kitchidi Ponni',
    line: 'Everyday rice for real veettu saapadu, lunch and dinner.',
    dishes: ['Veettu Saapadu', 'Sambar Rice', 'Curd Rice'],
    slug: 'kitchidi-ponni-rice',
    h1: 'Kitchidi Ponni Rice for Everyday South Indian Meals',
    title: 'Kitchidi Ponni Rice | Chennai Rice',
    description: 'Explore Chennai Rice Kitchidi Ponni, an aged rice variety for everyday South Indian meals. View available pack sizes and ordering options.',
    keywords: 'Kitchidi Ponni rice',
  },
  'special-idly-rice': {
    about: "Soft idlis start with the right rice. Special Idly Rice, in the pink pack, is made for grinding batter at home with urad dal. Steam it into soft, fluffy idlis, spread it into crisp golden dosas, or use it for kuzhi paniyaram and uthappam. Perfect for weekday breakfasts, Sunday tiffin and evening dinners. Adjust soaking and fermentation time to suit your kitchen and weather.",
    name: 'Special Idly Rice',
    line: 'For soft, fluffy idlis and crisp golden dosas.',
    dishes: ['Soft Idlis', 'Crisp Dosas', 'Uthappam'],
    slug: 'special-idly-rice',
    h1: 'Special Idly Rice – 26 kg',
    title: 'Special Idly Rice 26 kg – Buy Online | Chennai Rice',
    description: 'Buy Special Idly Rice 26 kg from Chennai Rice, Erode. Idly rice for soft, fluffy idlis and crisp dosas. Home & wholesale delivery.',
  },
}

const ID_BY_SLUG = Object.fromEntries(Object.entries(PRODUCT_SEO).map(([id, s]) => [s.slug, id]))

/** The public URL of a product page, from its shop ID. */
/** The product's plain name ("Kitchidi Ponni Rice") for breadcrumbs and Product data, whatever its H1 says. */
export function productName(id) {
  const p = PRODUCT_SEO[id]
  if (!p) return ''
  if (/ – \d+ kg$/.test(p.h1)) return p.h1.replace(/ – \d+ kg$/, '')
  return /rice$/i.test(p.name) ? p.name : `${p.name} Rice`
}

/** The page's keywords (SEO Optimization Plan) for a path, or the home page's. */
export function keywordsFor(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const page = Object.values(PAGE_META).find((p) => p.path === path)
  if (page) return page.keywords || PAGE_META.home.keywords
  const id = Object.keys(PRODUCT_SEO).find((k) => productPath(k) === path)
  return (id && (PRODUCT_SEO[id].keywords || `${productName(id)}, Chennai Rice, buy rice online`)) || PAGE_META.home.keywords
}

export function productPath(id) {
  return `/products/${PRODUCT_SEO[id]?.slug || id}`
}

/** The shop ID for a URL slug: a new public slug, or an old ID still in use. */
export function productIdFromSlug(slug) {
  return ID_BY_SLUG[slug] || slug
}
