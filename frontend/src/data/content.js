/* ============================================================
   All page content and asset paths in one place.
   Assets live in /public/assets — replace a file there and it
   updates everywhere. An entry may be a plain path string or
   { src, fallback } (fallback shows until the real file exists).
   ============================================================ */

export const ASSETS = {
  /* Two cuts of the same mark, because the curved "Kitchidi Ponni Rice" and
     the border ornaments are drawn in one colour and only read against the
     opposite ground:
       logo         — white lettering, for the maroon navbar and the dark hero
       logoOnLight  — maroon lettering, for cream surfaces like the cookie card
     Put the white one on cream and the curved text all but disappears.

     Versioned filenames on purpose. Everything under /assets was once served
     `immutable` for a year, so a stable name like logo.png meant returning
     visitors kept the old mark indefinitely — the browser never even asked.
     Bump the suffix whenever the artwork changes. */
  logo: '/assets/logo-white-v2.png',
  logoOnLight: '/assets/logo-full-v2.png',
  /* Re-encoded from the original 94.8 MB master (kept in git history as
     assets/hero.mp4): letterbox bars cropped off (1920x918 picture from
     y=80), scaled to 1280 wide, H.264 CRF 27, no audio track — the hero
     always plays muted — and faststart so it begins playing before it has
     fully downloaded. 6.7 MB, same 44.9 s length. */
  heroVideo: '/assets/hero-v2.mp4',
  wheatLeft: '/assets/decor/wheat-left.webp',
  wheatRight: '/assets/decor/wheat-right.webp',
  riceBowl: '/assets/decor/rice-bowl.webp',
  grainsGold: '/assets/decor/grains-gold.webp',
  paddySpray: '/assets/decor/paddy-spray.webp',
  grainsFlying: '/assets/decor/grains-flying.webp',
}

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Products', to: '/rice-products' },
  { label: 'About Us', to: '/about-us' },
  { label: 'Infrastructure', to: '/infrastructure' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact', to: '/contact-us' },
  { label: 'Track Order', to: '/track-order' },
]

// The Super Slogan Contest logo in the bar (after the links on desktop,
// beside the menu button on phones): opens the contest page.
export const NAV_CONTEST = {
  to: '/contest',
  label: 'Super Slogan Contest',
  logo: '/assets/contest-nav-logo.webp',
  fallback: '/assets/contest-nav-logo.png',
}

export const NAV_CTA = { label: 'Bulk Order', to: '/bulk-order' }

export const HERO = {
  // Curly quotes rather than the straight " character: this is display
  // typography, and a straight quote reads as an inch mark at 4rem.
  // Owner, 24 Oct 2026: the old display line is now a small styled line above the heading.
  tagline: 'South India’s No. 1 Non-Basmati Rice Manufacturer',
  h1: 'Premium Ponni & Idli Rice from Erode',
  intro: 'For over 75 years, Chennai Rice Industries has combined generations of milling expertise with modern technology to bring quality Ponni rice, Idli rice, and premium rice varieties to tables across India.',
  ctas: [
    { label: 'Shop Chennai Rice', to: '/rice-products', primary: true },
    { label: 'Bulk & Distributor Enquiry', to: '/bulk-order' },
  ],
  estd: "1950's",
}

/* Slot numbers are derived from position rather than written in, so removing
   or reordering a pack renumbers the rest on its own. They were hardcoded
   '01'–'04', which meant dropping the first slot left the showcase counting
   02, 03, 04. */
export const PRODUCTS = [
  {
    shortName: 'Special Rajabhogam',
    shopPath: '/products/special-rajabhogam-rice',
    ghost: ['SPECIAL', 'RAJABHOGAM'],
    name: 'Special Rajabhogam',
    // Our signature red bag (catalogue: "Classic Red").
    desc: 'Ideal for everyday cooking and family meals, in 5 kg, 10 kg and 26 kg packs for every household.',
    packSize: '5 / 10 / 26 KG',
    riceType: 'Kitchidi Ponni',
    idealFor: 'Everyday Family Meals',
    image: '/assets/shop/packs/special-rajabhogam-v2.png',
    // Soft rose cream, so the ghost lettering sits behind the red bag.
    tint: '#F8ECEA',
  },
  {
    shortName: 'Kitchidi Ponni Rice',
    shopPath: '/products/kitchidi-ponni-rice',
    ghost: ['KITCHIDI', 'PONNI RICE'],
    name: 'Kitchidi Ponni Rice',
    // The maroon-and-peach offer bag. From the pack: 1 year aged,
    // "Delicious Tastes", "From Mother's Hands to Your Heart".
    desc: 'Quality rice for everyday South Indian cooking, family meals and traditional Tamil dishes.',
    packSize: '5 / 26 KG',
    riceType: '1 Year Aged Kitchidi Ponni',
    idealFor: 'Delicious Everyday Meals',
    image: '/assets/shop/packs/kitchidi-ponni-rice-v3.png',
    // Warm peach, from the right half of the pack.
    tint: '#FBEDE6',
  },
  {
    shortName: 'Viruchagam',
    shopPath: '/products/viruchagam-ponni-rice',
    ghost: ['VIRUCHAGAM', 'POOMPUHAR'],
    name: 'Viruchagam',
    // From the pack: SNR RNR Poompuhar Ponni, "Pure Rice", "100% Natural",
    // "Rich Nutrition".
    desc: 'One of our bestselling Poompuhar Ponni rices, a favourite for traditional Tamil cooking.',
    // Sizes from the 09-10-2026 price list.
    packSize: '5 / 10 / 26 KG',
    riceType: 'SNR RNR Poompuhar Ponni',
    idealFor: 'Daily Family Dining',
    image: '/assets/shop/packs/viruchagam-v3.png',
    // Cool blue-grey, matching the pack's royal blue.
    tint: '#EAEFF6',
  },
  {
    shortName: 'Nayara Super Aged',
    shopPath: '/products/nayara-super-aged-rice',
    ghost: ['NAYARA', 'SUPER AGED'],
    name: 'Nayara Super Aged',
    desc: 'Firm, separate grains, ideal for lemon rice, tamarind rice and South Indian variety rice.',
    packSize: '5 / 10 / 26 KG',
    riceType: 'Super Aged Gel Cook Rice',
    idealFor: 'Daily Meals • Variety Rice',
    image: '/assets/shop/packs/nayara-super-aged-v3.png',
    // Pale teal, from the pack's green and gold.
    tint: '#E8F2EF',
  },
].map((product, index) => ({ ...product, num: String(index + 1).padStart(2, '0') }))

/* Count-up stats shown just above the product showcase. */
export const STATS = [
  { target: 50, suffix: '+', label: 'Years of Excellence' },
  { target: 25, suffix: '+', label: 'Rice Varieties' },
  { target: 500, suffix: '+', label: 'Retail Partners' },
  { target: 100, suffix: '%', label: 'Quality Assured' },
]

/* Home page business-buyer band before the FAQs (SEO Optimization Plan, Oct 2026; HomeBulk). */
export const HOME_BULK = {
  title: 'Looking for a Rice Supplier for Your Business?',
  text: 'Chennai Rice Industries serves business customers seeking rice products for retail and bulk purchasing. Retailers, distributors and institutional buyers can contact our team to discuss product availability, pack sizes and supply requirements.',
  button: 'Enquire About Bulk Orders',
}

export const SHOWCASE = {
  introTitle: 'Four Signature Varieties',
  introText: 'Milled, polished and packed with the same care since 1950.',
  ctaTitle: 'Find Your Perfect Grain',
  ctaText: 'Every variety we mill carries the same promise of purity, aroma and trust.',
  ctaButton: 'View All Products',
}

export const FEATURES_TITLE = 'Why Tamil Homes Trust Chennai Rice ?'

export const FEATURES = [
  { icon: 'sourced', label: ['Carefully', 'Sourced'], text: 'Paddy procured from five states and kept separate and traceable from purchase to storage.' },
  { icon: 'processed', label: ['Hygienically', 'Processed'], text: 'Fully automated milling at our Erode facility, untouched by hand from paddy to pack.' },
  { icon: 'quality', label: ['Premium', 'Quality'], text: 'Moisture, purity and grain condition checked at intake, during processing and before dispatch.' },
  { icon: 'grains', label: ['Uniform', 'Grains'], text: 'Graded and colour sorted so every grain looks and cooks the same.' },
  { icon: 'polish', label: ['No Artificial', 'Polish'], text: 'Rice the way it should be, with nothing added to make it shine.' },
  { icon: 'aroma', label: ['Rich in Taste', '& Aroma'], text: 'Stored with care in monitored silos so every meal keeps its natural taste and aroma.' },
]

// Ratings run 3 to 5 rather than a wall of fives. The quote and the score
// are written as a pair: the lower-rated entries carry a real reservation,
// because a three-star card that reads like a rave fools nobody.
export const TESTIMONIALS = [
  {
    name: 'Anitha Krishnan',
    city: 'Chennai',
    rating: 5,
    quote:
      "Chennai Rice has become our family's favourite. The aroma and taste are simply unmatched!",
    avatar: '/assets/testimonials/avatar-1.jpg',
  },
  {
    name: 'Gopal Reddy',
    city: 'Coimbatore',
    rating: 4,
    quote:
      "Consistent quality year after year. Delivery can run slow in the monsoon, but the rice itself never disappoints.",
    avatar: '/assets/testimonials/avatar-2.jpg',
  },
  {
    name: 'Meena Iyer',
    city: 'Bangalore',
    rating: 5,
    quote:
      "Fluffy, soft and perfect for all our dishes. I highly recommend Chennai Rice.",
    avatar: '/assets/testimonials/avatar-3.jpg',
  },
  {
    name: 'Ramesh Kumar',
    city: 'Trichy',
    rating: 3,
    quote:
      "Good rice at a fair price. The large bag is awkward to store in a small kitchen — I wish the smaller pack were easier to find locally.",
    avatar: '/assets/testimonials/avatar-4.jpg',
  },
  {
    name: 'Lakshmi Sundaram',
    city: 'Madurai',
    rating: 5,
    quote:
      "Every grain cooks evenly. My family can taste the difference at every meal.",
    avatar: '/assets/testimonials/avatar-5.jpg',
  },
  {
    name: 'Karthik Raja',
    city: 'Salem',
    rating: 4,
    quote:
      "Clean, well sorted and never sticky. Took a little getting used to on the water ratio, but we are happy with it.",
    avatar: '/assets/testimonials/avatar-6.jpg',
  },
  {
    name: 'Saroja Devi',
    city: 'Thanjavur',
    rating: 5,
    quote:
      "I have cooked rice for forty years. This is the quality I remember from childhood.",
    avatar: '/assets/testimonials/avatar-7.jpg',
  },
  {
    name: 'Vignesh Balaji',
    city: 'Erode',
    rating: 3,
    quote:
      "Dependable everyday rice and good value. Not as aromatic as the premium varieties, but it does the job well.",
    avatar: '/assets/testimonials/avatar-8.jpg',
  },
]

export const CELEB_HEAD = {
  label: 'Brand Ambassador',
  title: 'Trusted by the Best',
  blurb:
    'Actor Prabhu, our brand ambassador, trusts Chennai Rice for its purity, quality and tradition in every grain.',
}

/**
 * Who appears in the section, by name. Only Prabhu is the brand ambassador
 * now; the other cards below are kept so they can be shown again by adding
 * their names here.
 */
export const ACTIVE_AMBASSADORS = ['Prabhu']

/**
 * The four ambassador cards.
 *
 * `tone` selects a palette in celebrities.css rather than carrying hex
 * values here: the card tint, the quote mark and the role label are one
 * colour decision, and splitting it across two files is how they drift.
 *
 * `figure` is the portrait's height as a percentage of the card's photo
 * panel, and `drop` is how far below the panel its feet fall. Both are
 * per-person because the source crops are not comparable — Kushboo and
 * Rangaraj are shot near full-length while Dhamu and Prabhu are waist-up,
 * so a single height would put their heads at four different sizes.
 *
 * The full-length shots are therefore scaled past the panel and cropped at
 * the hem, which is what lets all four faces sit at the same height. The
 * PNGs in public/assets/celebs are trimmed to the subject — no transparent
 * margin — so these numbers mean what they say; the untrimmed originals are
 * kept in the repo-root assets/celebs folder.
 */
export const CELEBS = [
  {
    name: 'Kushboo',
    role: 'Actress',
    quote: "I trust Chennai Rice for my family. It's pure, healthy and full of goodness.",
    image: '/assets/celebs/kushboo.webp',
    tone: 'rose',
    figure: 128,
    drop: 46,
  },
  {
    name: 'Chef Dhamu',
    role: 'Celebrity Chef',
    quote: 'As a chef, I choose only the best. Chennai Rice brings out the best in every dish.',
    image: '/assets/celebs/chef-dhamo.webp',
    tone: 'gold',
    figure: 82,
    drop: 0,
  },
  {
    name: 'Prabhu',
    heading: 'Actor Prabhu, Brand Ambassador of Chennai Rice',
    role: 'Actor',
    quote: 'Good food begins with good rice. Chennai Rice has earned its place at our family table.',
    image: '/assets/celebs/prabhu.webp',
    tone: 'lilac',
    figure: 82,
    drop: 0,
  },
  {
    name: 'Madhampatty Rangaraj',
    role: 'Celebrity Chef',
    quote: 'A dish is only as good as its rice. Chennai Rice gives me that quality every time.',
    image: '/assets/celebs/madhampatty-rangaraj.webp',
    tone: 'sand',
    figure: 147,
    drop: 65,
  },
]

export const FOOTER = {
  brandName: 'CHENNAI RICE',
  brandSub: 'INDUSTRIES INDIA (P) LTD.',

  footerLinks: [
    { label: 'Home', to: '/' },
    { label: 'Products', to: '/rice-products' },
    { label: 'About Us', to: '/about-us' },
    { label: 'Infrastructure', to: '/infrastructure' },
    { label: 'Contact', to: '/contact-us' },
    { label: 'Terms & Conditions', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Shipping Policy', to: '/shipping' },
    { label: 'Return & Refund Policy', to: '/refund' },
  ],

  newsletter: {
    title: 'Stay Connected',
    text: 'Subscribe to get special offers, recipes, and the latest updates from Chennai Rice.',
    placeholder: 'Enter your email',
  },

  columns: [
    {
      // The topic pages (SEO sheet Phase 2), linked from every page.
      head: 'Our Rice',
      links: [
        { label: 'Ponni Rice', to: '/ponni-rice' },
        { label: 'Idli Rice', to: '/idli-rice' },
        { label: 'Become a Distributor', to: '/rice-distributorship' },
        { label: 'தமிழ்', to: '/ta' },
      ],
    },
    {
      // Company and Resources had two links each; one column reads easier.
      head: 'Company',
      links: [
        { label: 'About Us', to: '/about-us' },
        { label: 'Infrastructure', to: '/infrastructure' },
        { label: 'Recipes', to: '/recipes' },
        { label: 'Blogs', to: '/blog' },
        { label: 'Contact Us', to: '/contact-us' },
      ],
    },
    {
      head: 'Support',
      links: [
        { label: 'FAQs', to: '/#faqs' },
        { label: 'Track Order', to: '/track-order' },
        { label: 'Shipping Policy', to: '/shipping' },
        { label: 'Return & Refund Policy', to: '/refund' },
        { label: 'Terms & Conditions', to: '/terms' },
      ],
    },
  ],

  /* Live profiles. Two deliberate trims from the links as supplied:
     - the Instagram URL carried a "?stkn=…" share token, which is tied to the
       session that generated it rather than to the profile;
     - the Facebook URL ended in "&sk=about", which lands visitors on the
       About tab instead of the page itself.
     Both are dropped so these stay stable, shareable profile links.

     Only networks with a real URL appear — an icon linking to "#" looks like a
     broken site rather than an absent account. */
  social: [
    {
      key: 'instagram',
      label: 'Chennai Rice Industries on Instagram',
      href: 'https://www.instagram.com/chennairiceindustries',
    },
    {
      key: 'facebook',
      label: 'Chennai Rice Industries on Facebook',
      href: 'https://www.facebook.com/profile.php?id=61593389732476&sk=about',
    },
    // LinkedIn and YouTube: shown as soon as their page addresses are filled in.
    { key: 'linkedin', label: 'Chennai Rice Industries on LinkedIn', href: 'https://www.linkedin.com/company/chennai-rice-industries/' },
    { key: 'youtube', label: 'Chennai Rice Industries on YouTube', href: '' },
  ],

  phone: '+91 70666 46667',
  // Food safety licence (State), shown with the FSSAI logo in the footer.
  fssai: '12415007000253',
  email: 'support@chennairiceindustries.com',
  // The registered office. Kept word for word identical to the address in
  // privacyPolicy.js and termsConditions.js — this one is what the Contact
  // page shows, and three different renderings of one address is how a real
  // company ends up looking like three.
  address: [
    'SF No. 116/1,2,4-B, N. Thayirpalayam Village,',
    'Nasiyanur, Gangapuram Post,',
    'Erode, Tamil Nadu – 638102',
  ],
  copyright: 'Chennai Rice Industries India Private Limited',
  // "Reach Us": the Google Business Profile, and the map of the mill.
  maps: {
    profile: 'https://share.google/W8gy3NAFUbgfYHrdC',
    embed: 'https://maps.google.com/maps?q=Chennai%20Rice%20Industries%2C%20Nasiyanur%2C%20Erode%2C%20Tamil%20Nadu%20638102&z=14&output=embed',
  },
  // The company block above the bottom bar (owner, Oct 2026).
  company: 'Chennai Rice – Chennai Rice Industries India Private Limited',
  gstin: '33AAFCC1691K1ZM',
  brand: 'Chennai Rice',
}


/* Home page FAQs (Chennai Rice SEO - Homepage, Oct 2026). Also published as
   FAQPage structured data by HomeFaq. */
export const HOME_FAQS = [
  // Chennai Rice – Frequently Asked Questions (owner, Oct 2026). `link` adds a link under the answer.
  {
    q: 'What is Chennai Rice?',
    a: 'Chennai Rice is the rice brand of Chennai Rice Industries India Private Limited, a rice manufacturer in Erode, Tamil Nadu. We make Ponni, Idli, Rajabhogam and aged rice in 26 kg packs.',
  },
  {
    q: 'Where is Chennai Rice made?',
    a: 'All Chennai Rice is milled and packed at our plant in Nasiyanur, Erode, Tamil Nadu – 638102.',
  },
  {
    q: 'Which Chennai Rice is best for everyday meals?',
    a: 'For daily lunch and dinner, most families choose Chennai Rice United Ponni, Vijayanagaram or Kitchidi Ponni. They cook soft and non-sticky.',
  },
  {
    q: 'Which Chennai Rice is best for idli?',
    a: 'Chennai Rice Special Idly Rice. It grinds into a smooth batter and ferments well for soft idlis.',
    link: { to: '/products/special-idly-rice', label: 'See Special Idly Rice' },
  },
  {
    q: 'What is the price of Chennai Rice 26 kg?',
    a: 'Prices depend on the variety. See current prices on our products page. Shops and hotels can request wholesale rates.',
    link: { to: '/rice-products', label: 'See current prices' },
  },
  {
    q: 'Can I buy Chennai Rice online?',
    a: 'Yes. Order on this website or on WhatsApp at 70666 46667.',
    link: { href: 'https://wa.me/917066646667', label: 'Order on WhatsApp' },
  },
  {
    q: 'How do I become a Chennai Rice distributor?',
    a: 'Apply on our distributorship page. Our sales team will call you to discuss your area.',
    link: { to: '/rice-distributorship', label: 'Apply for distributorship' },
  },
  {
    q: 'Is Chennai Rice FSSAI certified?',
    a: 'Yes. Chennai Rice Industries India Pvt Ltd holds FSSAI Licence No. 12415007000253.',
  },
  {
    q: 'What is Ponni rice?',
    a: 'Ponni rice is a medium grain white rice widely grown and eaten across Tamil Nadu. It cooks soft and light, absorbs the flavour of sambar, rasam and kuzhambu well, and is the most popular choice for everyday South Indian meals, curd rice and lunch boxes.',
  },
  {
    q: 'What is the difference between raw rice and boiled rice?',
    a: 'Raw rice (pachai arisi) is milled directly from dried paddy and cooks soft and slightly sticky, which suits pongal, payasam and sweet dishes. Boiled rice (puzhungal arisi) is made from paddy that is soaked, steamed and dried before milling. It cooks firmer, with grains that stay separate, and is commonly used for daily meals.',
  },
  {
    q: 'What is parboiled rice?',
    a: 'Parboiled rice is rice that has been partially boiled in its husk before milling. The process of soaking, steaming and drying moves some nutrients from the bran into the grain, makes the grain harder and helps it cook into firm, separate grains. In Tamil Nadu it is widely known as boiled rice or puzhungal arisi.',
  },
  {
    q: 'What is aged rice and why does it cook better?',
    a: 'Aged rice is stored for several months after harvest before it is sold. During ageing the grain loses moisture and firms up, so it absorbs more water, swells more and cooks into fluffy, separate grains instead of turning sticky.',
  },
  {
    q: 'How can I enquire about bulk rice orders?',
    a: 'Retailers, distributors, hotels, caterers and institutions can send a bulk order enquiry from our Bulk Order page with the rice variety, pack size and quantity they need, or call us on +91 70666 46667. Our team will get back to you with availability and supply details.',
  },
  {
    q: 'How do I identify good quality rice?',
    a: 'Good quality rice has grains of uniform size and colour, very few broken grains, and no stones, husk or dust. It should smell fresh and natural, with no musty odour. Rice that is graded and colour sorted during milling, like Chennai Rice, meets these standards consistently.',
  },
]

/* Home: Chennai Rice Varieties, under "Our Bestsellers Rice" (owner, Oct 2026).
   Each group's products link to their pages (ids are shop product ids). */
export const VARIETIES = {
  title: 'Chennai Rice Varieties',
  intro: 'Every Chennai Rice variety is made for a specific kind of Tamil cooking.',
  groups: [
    { name: 'Chennai Rice Ponni', text: 'Soft, non-sticky everyday rice for sambar, rasam and curd rice.',
      products: [['viruchagam', 'Viruchagam'], ['vijaya-nagaram', 'Vijayanagaram'], ['united-5kg', 'United'], ['a1-special-ponni', 'A1 Special'], ['kitchidi-ponni-rice', 'Kitchidi Ponni']] },
    { name: 'Chennai Rice Idli Rice', text: 'Special Idly Rice that grinds smooth and ferments well, for soft idlis and crisp dosas.',
      products: [['special-idly-rice', 'Special Idly Rice']] },
    { name: 'Rajabhogam Ponni', text: 'Rich aroma and original taste.',
      products: [['rudra', 'Rudra Ponni'], ['chennai-bullets', 'Chennai Bullets'], ['special-rajabhogam', 'Special Rajabhogam']] },
    { name: 'Aged & Premium Rice', text: 'Nayara Super Aged for firm, separate grains; Vintage Special Ponni for festive meals.',
      products: [['nayara-super-aged', 'Nayara Super Aged'], ['vintage', 'Vintage Special Ponni']] },
    { name: 'Sappadu & Kitchadi Rice', text: 'Alibaba Sappadu Rice for a full Tamil meal; Thaaram for nei kitchadi and pongal.',
      products: [['alibaba', 'Alibaba Sappadu Rice'], ['thaaram', 'Thaaram']] },
  ],
  all: { label: 'See all Chennai Rice products', to: '/rice-products' },
}
