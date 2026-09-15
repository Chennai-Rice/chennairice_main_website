/* ============================================================
   All page content and asset paths in one place.
   Assets live in /public/assets — replace a file there and it
   updates everywhere. An entry may be a plain path string or
   { src, fallback } (fallback shows until the real file exists).
   ============================================================ */

export const ASSETS = {
  logo: '/assets/logo.png',
  heroVideo: '/assets/hero.mp4',
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
  titleLines: ['Rice.', 'The White Gold', 'Among Foods.'],
  subtitle: 'The simplicity of cooking rice is the most culturally satisfying experience.',
  estd: "1950's",
}

export const PRODUCTS = [
  {
    num: '01',
    shortName: 'Vada Kolam',
    ghost: ['VADA', 'KOLAM'],
    name: 'VADA KOLAM RICE',
    desc: 'The pride of Tamil Nadu — soft, fluffy, and perfect for everyday meals. Sourced from the fertile Kaveri delta.',
    packSize: '1, 5, 10, 26 KG',
    riceType: 'Vada Kolam Rice',
    idealFor: 'Everyday Meals',
    image: '/assets/products/product-1.png',
    tint: '#F8F3E9',
  },
  {
    num: '02',
    shortName: 'Premium',
    ghost: ['PREMIUM', 'RICE'],
    name: 'PREMIUM RICE',
    desc: 'Premium rice crafted for rich taste, soft texture, and versatile everyday cooking across every family meal.',
    packSize: '1, 5, 10, 26 KG',
    riceType: 'Premium Rice',
    idealFor: 'Daily Cooking • Family Meals',
    image: '/assets/products/product-2.png',
    tint: '#EBF3F8',
  },
  {
    num: '03',
    shortName: 'Raja Bogam Ponni',
    ghost: ['RAJA', 'BOGAM PONNI'],
    name: 'RAJA BOGAM PONNI',
    desc: 'Raja Bogam Ponni crafted for a rich, aromatic and premium dining experience.',
    packSize: '1, 5, 10, 26 KG',
    riceType: 'Raja Bogam Ponni',
    idealFor: 'Premium Signature Collection',
    image: '/assets/products/product-3.png',
    tint: '#FAF5EC',
  },
  {
    num: '04',
    shortName: 'Akshaya Ponni',
    ghost: ['AKSHAYA', 'PONNI'],
    name: 'AKSHAYA PONNI',
    desc: 'Akshaya Ponni brings a soft finish, satisfying aroma, and everyday comfort to your family meals.',
    packSize: '1, 5, 10, 26 KG',
    riceType: 'Akshaya Ponni',
    idealFor: 'Daily Family Dining',
    image: { src: '/assets/products/product-4.png', fallback: '/assets/products/product-1.png' },
    tint: '#EDF2F0',
  },
]

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

export const TESTIMONIALS = [
  {
    name: 'Anitha Krishnan',
    city: 'Chennai',
    quote:
      "Chennai Rice has become our family's favourite. The aroma and taste are simply unmatched!",
    avatar: '/assets/testimonials/avatar-1.jpg',
  },
  {
    name: 'Gopal Reddy',
    city: 'Coimbatore',
    quote:
      'We have been using Chennai Rice for years. Consistent quality and excellent taste every time.',
    avatar: '/assets/testimonials/avatar-2.jpg',
  },
  {
    name: 'Meena Iyer',
    city: 'Bangalore',
    quote: 'Fluffy, soft and perfect for all our dishes. I highly recommend Chennai Rice.',
    avatar: '/assets/testimonials/avatar-3.jpg',
  },
  {
    name: 'Ramesh Kumar',
    city: 'Trichy',
    quote: 'From everyday meals to festive feasts, Chennai Rice never disappoints!',
    avatar: '/assets/testimonials/avatar-4.jpg',
  },
  {
    name: 'Lakshmi Sundaram',
    city: 'Madurai',
    quote: 'Every grain cooks evenly. My family can taste the difference at every meal.',
    avatar: '/assets/testimonials/avatar-5.jpg',
  },
  {
    name: 'Karthik Raja',
    city: 'Salem',
    quote: 'Clean, well sorted and never sticky. This is the only brand I buy now.',
    avatar: '/assets/testimonials/avatar-6.jpg',
  },
  {
    name: 'Saroja Devi',
    city: 'Thanjavur',
    quote: 'I have cooked rice for forty years. This is the quality I remember from childhood.',
    avatar: '/assets/testimonials/avatar-7.jpg',
  },
  {
    name: 'Vignesh Balaji',
    city: 'Erode',
    quote: 'Great value and dependable quality. Our kitchen switched and never looked back.',
    avatar: '/assets/testimonials/avatar-8.jpg',
  },
]

export const CELEB_HEAD = {
  label: 'Brand Ambassadors',
  title: 'Trusted by the Best',
  blurb:
    'Our brand ambassadors share their trust in Chennai Rice — a promise of purity, quality and tradition in every grain.',
}

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
  estd: '1950',
  motto: 'From Our Fields to Your Family',

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
        { label: 'Our Team', to: '/our-team' },
        { label: 'Careers', to: '/careers' },
        { label: 'Contact Us', to: '/contact' },
      ],
    },
    {
      head: 'Products',
      links: [
        { label: 'Our Rice', to: '/products' },
        { label: 'Quality', to: '/quality' },
        { label: 'Varieties', to: '/products' },
        { label: 'Packaging', to: '/packaging' },
      ],
    },
    {
      head: 'Resources',
      links: [
        { label: 'Recipes', to: '/recipes' },
        { label: 'Blogs', to: '/blog' },
        { label: 'CSR', to: '/csr' },
        { label: 'Downloads', to: '/downloads' },
      ],
    },
    {
      head: 'Support',
      links: [
        { label: 'FAQs', to: '/faqs' },
        { label: 'Track Order', to: '/track-order' },
        { label: 'Shipping & Delivery', to: '/shipping' },
        { label: 'Terms & Conditions', to: '/terms' },
        { label: 'Privacy Policy', to: '/privacy' },
      ],
    },
  ],

  phone: '+91 12345 67890',
  email: 'info@chennairice.com',
  address: ['123, Rice Mill Road,', 'Chennai - 600 001, Tamil Nadu, India'],
  copyright: '© 2026 Chennai Rice Industries India (P) Ltd. All Rights Reserved.',
}

