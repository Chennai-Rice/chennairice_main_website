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
    description: 'Explore Chennai Rice’s Erode infrastructure: 2,44,000 MTPA milling capacity, 27 silos storing 61,500 MT of paddy and a 10 stage quality process.',
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
    title: 'A1 Special Ponni Rice | Soft Everyday Rice | Chennai Rice',
    description: 'A1 Special Ponni cooks soft and fluffy, ideal for sambar sadam, rasam rice and curd rice. Quality graded for everyday meals. Order online today.',
  },
  'alibaba': {
    about: "A proper saapadu needs rice that holds its own on the plate. Alibaba is 100% pure, original quality rice with full flavour in every grain. Serve it with kuzhambu, rasam, poriyal, kootu and appalam for a complete Tamil lunch, whether it is a busy weekday, a Sunday family meal or guests visiting home. A dependable choice for households that enjoy a hearty plate of rice every day.",
    name: 'Alibaba',
    line: 'Full flavoured rice for a complete Tamil saapadu.',
    dishes: ['Full Tamil Saapadu', 'Kuzhambu Rice', 'Rasam Rice'],
    slug: 'alibaba-sappadu-rice',
    title: 'Alibaba Premium Sappadu Rice | Chennai Rice',
    description: 'Alibaba is pure, full flavoured rice for a complete Tamil saapadu with kuzhambu, poriyal and kootu. Perfect for daily family lunch. Shop online.',
  },
  'nayara-super-aged': {
    about: "If you want rice that does not turn sticky, choose Nayara Super Aged. This aged gel cook rice cooks into separate, firm grains, making it ideal for variety rice such as lemon rice, puliyodharai, coconut rice and tomato rice. It keeps its texture in school and office lunch boxes, on travel days and for prasadam made at home. Use it whenever presentation and grain separation matter.",
    name: 'Nayara Super Aged',
    line: 'Cooks separate and firm, perfect for lemon rice and lunch boxes.',
    dishes: ['Lemon Rice', 'Tamarind Rice', 'Lunch Boxes'],
    slug: 'nayara-super-aged-rice',
    title: 'Nayara Super Aged Rice | Separate Grains | Chennai Rice',
    description: 'Nayara Super Aged rice cooks separate and firm, never sticky. Perfect for lemon rice, tamarind rice, coconut rice and lunch boxes. Order online now.',
  },
  'rudra': {
    about: "Rudra brings original taste and a rich aroma that fills the kitchen as the rice finishes cooking. It suits larger families and homes that host relatives, festivals and weekend gatherings. Enjoy it with sambar, kara kuzhambu, mor kuzhambu or simple rasam for a satisfying everyday meal. Store in a cool, dry place and keep the bag sealed after opening.",
    name: 'Rudra',
    line: 'Original taste and rich aroma for everyday family meals.',
    dishes: ['Sambar Rice', 'Kara Kuzhambu Rice', 'Mor Kuzhambu Rice'],
    slug: 'rudra-ponni-rice',
    title: 'Rudra Rice | Aromatic Rice for Daily Meals | Chennai Rice',
    description: 'Rudra rice brings original taste and a rich aroma to every meal. Ideal for sambar, kara kuzhambu and rasam with the whole family. Order online today.',
  },
  'special-rajabhogam': {
    about: "Look for the signature red pack on your grocery list. Special Rajabhogam is milled and sealed at our Erode facility, so it reaches your kitchen clean and consistent. It is everyday rice for lunch and dinner at home, served with sambar, rasam, vathal kuzhambu and vegetable poriyal. A comforting choice for daily family meals and easy weeknight cooking.",
    name: 'Special Rajabhogam',
    line: 'Everyday rice in our signature red pack for comforting home meals.',
    dishes: ['Sambar Rice', 'Vathal Kuzhambu Rice', 'Rasam Rice'],
    slug: 'special-rajabhogam-rice',
    title: 'Special Rajabhogam Rice | Red Pack | Chennai Rice',
    description: 'Special Rajabhogam in our signature red pack, sealed at Erode for clean grains. Everyday rice for lunch and dinner at home. Shop online today.',
  },
  'thaaram': {
    about: "A good nei kitchadi needs rice that will not break down in the pot. Thaaram has strong grains with superior taste and rich aroma, made for ghee rich kitchadi, ven pongal and sakkarai pongal. Cook it for Pongal and Margazhi mornings, Sunday breakfasts, poojas at home or any day you want a festive dish on the table. Adjust water to the texture your family likes.",
    name: 'Thaaram Nei Kitchadi',
    line: 'Strong grains that hold shape in nei kitchadi and pongal.',
    dishes: ['Nei Kitchadi', 'Ven Pongal', 'Sakkarai Pongal'],
    slug: 'thaaram-pooni-rice',
    title: 'Thaaram Nei Kitchadi Rice | Kitchadi & Pongal | Chennai Rice',
    description: 'Make perfect nei kitchadi and ven pongal with Thaaram: strong grains that hold shape, superior taste and rich aroma. Ideal for festive mornings.',
  },
  'united-5kg': {
    about: "United is everyday rice made simple. Clean, consistent grains cook easily for daily rice meals, quick curd rice, lunch boxes and weeknight dinners. It is a great fit for couples, small families, working professionals and students cooking for themselves, and an easy way to try Chennai Rice for the first time.",
    name: 'United',
    line: 'Clean, consistent rice for small families and daily meals.',
    dishes: ['Daily Rice Meals', 'Curd Rice', 'Lunch Boxes'],
    slug: 'united-ponni-rice',
    title: 'United Rice | Everyday Rice for Daily Meals | Chennai Rice',
    description: 'United is clean, consistent everyday rice for couples, small families and students cooking at home. Great for daily meals and lunch boxes. Order online.',
  },
  'vijaya-nagaram': {
    about: "Vijaya Nagaram is milled for everyday South Indian cooking, with the familiar taste your family grew up with. Serve it at lunch with sambar, rasam and kootu, at dinner with kara kuzhambu, or as curd rice on warm afternoons. A comforting rice for family meals, festival lunches and the daily plate at home.",
    name: 'Vijaya Nagaram',
    line: 'Familiar taste for sambar, rasam, kootu and curd rice.',
    dishes: ['Sambar Rice', 'Rasam Rice', 'Curd Rice'],
    slug: 'vijaya-nagaram-rice',
    title: 'Vijaya Nagaram Rice | South Indian Meals | Chennai Rice',
    description: 'Vijaya Nagaram brings familiar taste to everyday South Indian meals with sambar, rasam, kootu and curd rice. Shop online today.',
  },
  'vintage': {
    about: "Vintage is our premium selection, recognisable by its black and gold pack. Milled and sealed at our Erode facility, it is the rice to bring out for occasions: Deepavali and Pongal lunches, birthdays, housewarming meals, family gatherings and Sunday feasts on a banana leaf. Pair it with sambar, rasam, payasam and a full spread of poriyal for a meal worth remembering.",
    name: 'Vintage',
    line: 'Our premium choice for festival lunches and family gatherings.',
    dishes: ['Festival Lunches', 'Banana Leaf Feasts', 'Family Gatherings'],
    slug: 'vintage-ponni-rice',
    title: 'Vintage Rice | Premium Rice for Festivals | Chennai Rice',
    description: 'Vintage in the black and gold pack is our premium rice for festival lunches, family gatherings and special meals at home. Order online today.',
  },
  'viruchagam': {
    about: "Look for the blue and gold pack. Viruchagam suits the everyday traditional Tamil menu: steamed rice with kuzhambu, rasam and poriyal at lunch, or a simple plate of rice and curd at dinner. Dependable grains that cook well day after day make it a reliable rice for regular family cooking all through the week.",
    name: 'Viruchagam',
    line: 'Everyday rice for traditional Tamil lunch and dinner.',
    dishes: ['Kuzhambu Rice', 'Rasam Rice', 'Curd Rice'],
    slug: 'viruchagam-ponni-rice',
    title: 'Viruchagam Rice | Traditional Tamil Meals | Chennai Rice',
    description: 'Viruchagam in the blue and gold pack is everyday rice for traditional Tamil lunch and dinner with kuzhambu, rasam and poriyal. Shop online.',
  },
  'chennai-bullets': {
    about: "Chennai Bullets is aromatic rice made for big kitchens and bigger gatherings. It is ideal for joint families, homes that cook for many every day, and occasions such as poojas, housewarmings, family functions and festival feasts. Serve it with sambar, kara kuzhambu and a full spread of sides, and enjoy rich aroma in every meal.",
    name: 'Chennai Bullets',
    line: 'Rich aroma for joint families, poojas and home functions.',
    dishes: ['Poojas and Home Functions', 'Joint Family Meals', 'Festival Feasts'],
    slug: 'chennai-bullets-rice',
    title: 'Chennai Bullets Rice | Rich Aroma Rice | Chennai Rice',
    description: 'Chennai Bullets brings rich aroma to every meal. Ideal for joint families, home functions, poojas and festival feasts. Order online today.',
  },
  'kitchidi-ponni-rice': {
    about: "Nothing feels quite like veettu saapadu, the simple meal of rice, kuzhambu, rasam and poriyal cooked at home. Kitchidi Ponni is made for exactly that. It is processed end to end in our fully automated Erode mill with no human handling, so the grains reach your kitchen clean. Cook it for everyday lunch and dinner, school and office lunch boxes, and the comforting Sunday meal at home.",
    name: 'Kitchidi Ponni',
    line: 'Everyday rice for real veettu saapadu, lunch and dinner.',
    dishes: ['Veettu Saapadu', 'Sambar Rice', 'Curd Rice'],
    slug: 'kitchidi-ponni-rice',
    title: 'Kitchidi Ponni Rice | Everyday Home Meal Rice | Chennai Rice',
    description: 'Celebrate every special meal with Kitchidi Ponni Rice. Perfect for festive feasts, family gatherings, and everyday home cooking with authentic taste and aroma.',
  },
  'special-idly-rice': {
    about: "Soft idlis start with the right rice. Special Idly Rice, in the pink pack, is made for grinding batter at home with urad dal. Steam it into soft, fluffy idlis, spread it into crisp golden dosas, or use it for kuzhi paniyaram and uthappam. Perfect for weekday breakfasts, Sunday tiffin and evening dinners. Adjust soaking and fermentation time to suit your kitchen and weather.",
    name: 'Special Idly Rice',
    line: 'For soft, fluffy idlis and crisp golden dosas.',
    dishes: ['Soft Idlis', 'Crisp Dosas', 'Uthappam'],
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
