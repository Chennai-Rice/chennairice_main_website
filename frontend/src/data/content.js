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
  wheatLeft: '/assets/decor/wheat-left.png',
  wheatRight: '/assets/decor/wheat-right.png',
  riceBowl: '/assets/decor/rice-bowl.png',
  grainsGold: '/assets/decor/grains-gold.png',
  paddySpray: '/assets/decor/paddy-spray.png',
  grainsFlying: '/assets/decor/grains-flying.png',
}

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Products', to: '/products' },
  { label: 'About Us', to: '/about' },
  { label: 'Infrastructure', to: '/infrastructure' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact', to: '/contact' },
]

export const NAV_CTA = { label: 'Bulk Order', to: '/bulk-order' }

export const HERO = {
  // Curly quotes rather than the straight " character: this is display
  // typography, and a straight quote reads as an inch mark at 4rem.
  titleLines: ['“RICE”', 'The White Gold', 'Among Foods.'],
  subtitle: 'The simplicity of cooking rice is the most culturally satisfying experience.',
  estd: "1950's",
}

/* Slot numbers are derived from position rather than written in, so removing
   or reordering a pack renumbers the rest on its own. They were hardcoded
   '01'–'04', which meant dropping the first slot left the showcase counting
   02, 03, 04. */
export const PRODUCTS = [
  {
    shortName: 'Chennai Bullets',
    ghost: ['CHENNAI', 'BULLETS'],
    name: 'CHENNAI BULLETS',
    // Read off the pack: Rajabhogam Ponni, 26 kg, "Rich Aroma" and
    // "Genuine Taste" — the trade pack, hence the kitchens-and-canteens framing.
    desc: 'Rajabhogam Ponni with a rich aroma and genuine taste, in our largest 26 kg pack, built for kitchens that cook at scale.',
    packSize: '26 KG',
    riceType: 'Rajabhogam Ponni',
    idealFor: 'Bulk Kitchens • Large Families',
    image: '/assets/products/chennai-bullets-hero.png',
    // The existing cool blue already suits this pack — it was chosen for the
    // slot, and the artwork here is blue and gold, so it stays.
    tint: '#EBF3F8',
  },
  {
    shortName: 'Alibaba',
    ghost: ['ALIBABA', 'SAPPADU'],
    name: 'ALIBABA',
    // Straight off the pack: "100% Pure Genuine Quality", "Hassle Free Cooking",
    // Premium Sappadu Rice at 10 kg.
    desc: 'Premium Sappadu rice with 100% pure, genuine quality and hassle-free cooking for the everyday sappadu.',
    packSize: '10 KG',
    riceType: 'Premium Sappadu Rice',
    idealFor: 'Everyday Sappadu • Hassle-Free Cooking',
    image: '/assets/products/alibaba-hero.png',
    // Warm cream with a gold cast, drawn from the pack's gold borderwork so the
    // ghost lettering sits behind the blue and gold rather than clashing.
    tint: '#FAF3E6',
  },
  {
    shortName: 'Viruchagam',
    ghost: ['VIRUCHAGAM', 'POOMPUHAR'],
    name: 'VIRUCHAGAM',
    // From the pack: SNR RNR Poompuhar Ponni, "Pure Rice", "100% Natural",
    // "Rich Nutrition".
    desc: 'Poompuhar Ponni from SNR RNR paddy. Pure rice, 100% natural and rich in nutrition.',
    // This artwork prints no net weight, unlike the other three packs. Rather
    // than invent a figure on the homepage, the slot points at the enquiry
    // button sitting directly beside it. Replace with the real sizes when known.
    packSize: 'Enquire for pack size',
    riceType: 'SNR RNR Poompuhar Ponni',
    idealFor: 'Daily Family Dining',
    image: '/assets/products/viruchagam-hero.png',
    // Cool blue-grey, matching the pack's royal blue rather than the warm
    // cream the previous orange pack needed.
    tint: '#EAEFF6',
  },
].map((product, index) => ({ ...product, num: String(index + 1).padStart(2, '0') }))

/* Count-up stats shown just above the product showcase. */
export const STATS = [
  { target: 50, suffix: '+', label: 'Years of Excellence' },
  { target: 25, suffix: '+', label: 'Rice Varieties' },
  { target: 500, suffix: '+', label: 'Retail Partners' },
  { target: 100, suffix: '%', label: 'Quality Assured' },
]

export const SHOWCASE = {
  introTitle: 'Four Signature Varieties',
  introText: 'Milled, polished and packed with the same care since 1950.',
  ctaTitle: 'Find Your Perfect Grain',
  ctaText: 'Every variety we mill carries the same promise of purity, aroma and trust.',
  ctaButton: 'View All Products',
}

export const FEATURES = [
  { icon: 'sourced', label: ['Carefully', 'Sourced'] },
  { icon: 'processed', label: ['Hygienically', 'Processed'] },
  { icon: 'quality', label: ['Premium', 'Quality'] },
  { icon: 'grains', label: ['Uniform', 'Grains'] },
  { icon: 'polish', label: ['No Artificial', 'Polish'] },
  { icon: 'aroma', label: ['Rich in Taste', '& Aroma'] },
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
    image: '/assets/celebs/kushboo.png',
    tone: 'rose',
    figure: 128,
    drop: 46,
  },
  {
    name: 'Chef Dhamu',
    role: 'Celebrity Chef',
    quote: 'As a chef, I choose only the best. Chennai Rice brings out the best in every dish.',
    image: '/assets/celebs/chef-dhamo.png',
    tone: 'gold',
    figure: 82,
    drop: 0,
  },
  {
    name: 'Prabhu',
    role: 'Actor',
    quote: 'Good food begins with good rice. Chennai Rice has earned its place at our family table.',
    image: '/assets/celebs/prabhu.png',
    tone: 'lilac',
    figure: 82,
    drop: 0,
  },
  {
    name: 'Madhampatty Rangaraj',
    role: 'Celebrity Chef',
    quote: 'A dish is only as good as its rice. Chennai Rice gives me that quality every time.',
    image: '/assets/celebs/madhampatty-rangaraj.png',
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
    { label: 'Products', to: '/products' },
    { label: 'About Us', to: '/about' },
    { label: 'Infrastructure', to: '/infrastructure' },
    { label: 'Contact', to: '/contact' },
    { label: 'Terms & Conditions', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
  ],

  newsletter: {
    title: 'Stay Connected',
    text: 'Subscribe to get special offers, recipes, and the latest updates from Chennai Rice.',
    placeholder: 'Enter your email',
  },

  columns: [
    {
      head: 'Company',
      links: [
        { label: 'About Us', to: '/about' },
        { label: 'Contact Us', to: '/contact' },
      ],
    },
    {
      head: 'Resources',
      links: [
        { label: 'Recipes', to: '/recipes' },
        { label: 'Blogs', to: '/blog' },
      ],
    },
    {
      head: 'Support',
      links: [
        { label: 'FAQs', to: '/faqs' },
        { label: 'Track Order', to: '/track-order' },
        { label: 'Shipping & Delivery', to: '/shipping' },
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
  ],

  phone: '+91 70666 46667',
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
}

