// Content for the topic landing pages (SEO sheet, Oct 2026, Phase 2):
// /ponni-rice, /idli-rice, /rice-distributorship and the Tamil pages under /ta.
// Rendered by pages/LandingPage.jsx; titles, descriptions and H1s live in
// seo.js (PAGE_META) with the other pages.
//
// Only facts already published on the site are used: the packs and their
// descriptions, ageing where the pack states it, the mill figures from the
// About and Infrastructure pages, and the cooking card. Distributor margins,
// investment and territories are deliberately not stated — they are discussed
// on the call.
//
// Section blocks: { h2, p: [..] } paragraphs, { h2, list: [..] } bullets,
// { h2, steps: [..] } numbered steps, { h2, table: { head, rows } }.

import { GUIDES, GUIDE_PAGES } from './guides.js'

const PONNI_IDS = [
  'kitchidi-ponni-rice', 'special-rajabhogam', 'viruchagam', 'vintage', 'united-5kg', 'a1-special-ponni',
  'vijaya-nagaram', 'chennai-bullets', 'rudra', 'thaaram', 'nayara-super-aged',
]

export const LANDING = {
  ponni: {
    key: 'ponni',
    lang: 'en',
    eyebrow: 'Ponni Rice',
    intro: [
      'Ponni is the rice Tamil Nadu cooks every day: a medium grain that turns soft and light, soaks up sambar, rasam and kuzhambu, and stays pleasant in a lunch box. At Chennai Rice we mill Ponni at our own plant in Erode and pack it in 5, 10 and 26 kg bags (Rudra and Thaaram in 25 kg).',
      'Below is every Ponni pack we make, from the year-aged Kitchidi Ponni to the Rajabhogam Ponni in Rudra and Chennai Bullets, with a short guide to help you pick the right one for your kitchen.',
    ],
    productIds: PONNI_IDS,
    productsHeading: 'Our Ponni rice packs',
    sections: [
      {
        h2: 'What is Ponni rice?',
        p: [
          'Ponni is a medium grain white rice developed in Tamil Nadu and grown widely across the Cauvery delta. It is valued for grains that cook soft but not mushy, a mild natural taste that lets gravies shine, and a texture that suits everything from a plain plate of rice with ghee to curd rice and lemon rice.',
          'Within Ponni there are many grades and named varieties, such as Rajabhogam, Kitchidi, Akshaya and Amman (HMT) Ponni. They differ in grain size, how long the rice is aged and how firm it cooks, which is why one family prefers one pack and their neighbours another.',
        ],
      },
      {
        h2: 'Raw Ponni and boiled Ponni',
        p: [
          'Raw rice (pachai arisi) is milled straight from dried paddy. It cooks soft and slightly sticky, which suits pongal, payasam and sweet dishes. Boiled rice (puzhungal arisi) is made from paddy that is soaked, steamed and dried before milling. It cooks firmer, with grains that stay separate, and it is what most Tamil homes use for daily meals.',
          'Our process includes this parboiling step for boiled rice: paddy is soaked, steamed and dried so the grain stays firm, cooks separate and keeps its goodness.',
        ],
      },
      {
        h2: 'Why aged Ponni cooks better',
        p: [
          'Freshly harvested rice holds more moisture and tends to turn sticky. Aged rice is stored for months after harvest; the grain loses moisture and firms up, so it absorbs more water, swells more and cooks into fluffy, separate grains. Our Kitchidi Ponni Rice is aged for a year, and Nayara Super Aged is a gel cook rice aged to stay separate and firm on the plate.',
        ],
      },
      {
        h2: 'How to cook Ponni rice',
        steps: [
          'Rinse the rice well, then soak it in slightly warm water for about 60 minutes.',
          'In a closed pan or cooker, use about 3 cups of water for 1 cup of rice (2.5 cups at a hill station). In an open pan, use about 5 cups of water and drain the excess.',
          'Add salt, and a spoon of ghee or oil if you like, and cook until the grains are soft.',
          'Rest the rice for a few minutes before serving so the grains firm up and separate.',
        ],
        note: 'Every water is different: add a little more or less until the texture suits your family.',
      },
      {
        h2: 'Which Ponni pack is right for you?',
        table: {
          head: ['Pack', 'What it is', 'Best for', 'Pack sizes'],
          rows: [
            ['Kitchidi Ponni Rice', 'Kitchidi Ponni, aged for a year', 'Everyday home meals', '5, 26 kg'],
            ['Special Rajabhogam', 'Kitchidi Ponni in the red pack', 'Sambar, rasam, daily lunch', '5, 10, 26 kg'],
            ['Viruchagam', 'Poompuhar Ponni from RNR paddy', 'Traditional Tamil meals', '5, 10, 26 kg'],
            ['Vintage', 'Special Ponni, black-and-gold pack', 'Festivals and special meals', '5, 10, 26 kg'],
            ['United', 'Everyday Ponni', 'Lunch and dinner at home', '5, 10, 26 kg'],
            ['A1 Special Ponni', 'Quality graded Special Ponni', 'Sambar sadam, curd rice', '5, 10, 26 kg'],
            ['Vijaya Nagaram', 'Amman Ponni (HMT grain)', 'Everyday South Indian meals', '5, 10, 26 kg'],
            ['Chennai Bullets', 'Rajabhogam Ponni, rich aroma', 'Large families and trade', '5, 10, 26 kg'],
            ['Rudra', 'Rajabhogam Ponni, rich aroma', 'Sambar, kuzhambu, family meals', '25 kg'],
            ['Thaaram Nei Kitchadi', 'Akshaya Ponni, strong grain', 'Nei kitchadi and pongal', '25 kg'],
            ['Nayara Super Aged', 'Super aged gel cook rice', 'Lemon rice, lunch boxes', '5, 10, 26 kg'],
          ],
        },
      },
    ],
    faqs: [
      { q: 'Is Ponni rice raw rice or boiled rice?', a: 'Ponni is a variety, and it is sold both ways. Boiled (parboiled) Ponni cooks firmer with separate grains and is the usual choice for daily meals in Tamil Nadu; raw Ponni cooks softer and suits pongal and sweets.' },
      { q: 'Which Ponni rice is best for daily meals?', a: 'For everyday lunch and dinner, families usually choose a soft, separate-cooking Ponni such as Kitchidi Ponni Rice, Special Rajabhogam or A1 Special Ponni. For variety rice and lunch boxes that should not turn sticky, Nayara Super Aged is a good fit.' },
      { q: 'What does aged Ponni mean?', a: 'Aged Ponni is stored for months after harvest before it is packed. It loses moisture, absorbs more water while cooking and turns out fluffy and separate. Our Kitchidi Ponni Rice is aged for a year.' },
      { q: 'What pack sizes do you sell?', a: 'Most of our Ponni packs come in 5, 10 and 26 kg bags. Rudra and Thaaram Nei Kitchadi come in 25 kg bags. For larger quantities, use our bulk order form.' },
      { q: 'How should I store a 26 kg bag of rice?', a: 'Keep it in a cool, dry place off the floor, away from moisture and strong smells, and keep the bag or container closed after opening.' },
      { q: 'Can I buy Ponni rice in bulk?', a: 'Yes. Retailers, wholesalers, hotels, caterers and institutions can send a bulk enquiry and our team will get back to you.' },
    ],
    links: [
      { to: '/rice-products', label: 'See the full rice range' },
      { to: '/idli-rice', label: 'Idli rice for soft idlis' },
      { to: '/best-ponni-rice-for-daily-meals', label: 'Best Ponni rice for daily meals' },
      { to: '/what-is-aged-rice', label: 'What is aged rice?' },
      { to: '/bulk-order', label: 'Bulk & wholesale orders' },
    ],
  },

  idli: {
    key: 'idli',
    lang: 'en',
    eyebrow: 'Idli Rice',
    intro: [
      'Soft, spongy idlis and crisp dosas start with the right rice. Chennai Rice Special Idly Rice is milled at our Erode plant for idli and dosa batter: it grinds smooth, ferments well and steams into light, fluffy idlis.',
      'It comes in 5, 10 and 26 kg packs, so it suits a family kitchen as much as a hotel or tiffin centre that grinds batter every day.',
    ],
    productIds: ['special-idly-rice'],
    productsHeading: 'Our idli rice',
    sections: [
      {
        h2: 'What makes good idli rice',
        p: [
          'Idli rice is a short, bold, parboiled rice. Parboiling (soaking, steaming and drying the paddy before milling) firms the grain, so it grinds into a smooth, slightly grainy batter that holds air as it ferments. That trapped air is what makes an idli rise and stay soft.',
          'Good idli rice has grains of even size, very few broken pieces and no stones or husk, so the batter grinds evenly and every batch behaves the same way.',
        ],
      },
      {
        h2: 'Idli batter: rice and urad dal ratio',
        p: [
          'Most Tamil homes use about 4 cups of idli rice to 1 cup of whole urad dal, with a small spoon of fenugreek (vendhayam) soaked with the dal. For crisper dosas, some families add a handful of raw rice or a little more rice to the same batter.',
        ],
      },
      {
        h2: 'Soaking, grinding and fermenting',
        steps: [
          'Rinse the idli rice and urad dal separately, then soak each for 4 to 6 hours.',
          'Grind the urad dal first with a little cold water until it is light and fluffy. Grind the rice to a slightly coarse, smooth batter.',
          'Mix both with salt, cover and leave to ferment for 8 to 12 hours, until the batter has risen and smells pleasantly sour.',
          'Stir gently, pour into greased idli plates and steam for about 10 to 12 minutes.',
        ],
        note: 'In cold weather the batter takes longer to ferment; keep it in a warm spot in the kitchen.',
      },
      {
        h2: 'Idli rice or Ponni rice for idli?',
        p: [
          'Ponni is made for plates of rice with sambar and kuzhambu, not for batter. Using it for idli gives flatter, denser idlis. Idli rice grinds and ferments better, so keep a pack of each: Ponni for meals and idli rice for batter.',
        ],
      },
      {
        h2: 'For hotels, caterers and tiffin centres',
        p: [
          'Kitchens that grind batter every day need rice that behaves the same in every bag. Our idli rice is graded and packed at our own mill, and you can order it in bulk through our bulk order form for regular supply.',
        ],
      },
    ],
    faqs: [
      { q: 'Which rice is best for soft idlis?', a: 'A parboiled idli rice gives the softest idlis because it grinds smooth and holds air while the batter ferments. Chennai Rice Special Idly Rice is made for this.' },
      { q: 'Can I use the same batter for idli and dosa?', a: 'Yes. Most families use one batter for both; for crisper dosas, thin the batter a little or add a little raw rice when grinding.' },
      { q: 'Why are my idlis hard or flat?', a: 'Usually the batter did not ferment enough, the urad dal was ground too little, or too much water was added. Try a warmer spot for fermenting and grind the dal until it is light and fluffy.' },
      { q: 'What pack sizes does Special Idly Rice come in?', a: '5, 10 and 26 kg packs. Hotels and caterers can order larger quantities through the bulk order form.' },
      { q: 'Is idli rice the same as boiled rice?', a: 'Idli rice is a type of parboiled (boiled) rice, chosen for a short, bold grain that grinds well. Not every boiled rice makes good idli batter.' },
    ],
    links: [
      { to: '/products/special-idly-rice', label: 'Buy Special Idly Rice' },
      { to: '/ponni-rice', label: 'Ponni rice for daily meals' },
      { to: '/bulk-order', label: 'Bulk orders for hotels & caterers' },
    ],
  },

  distributor: {
    key: 'distributor',
    lang: 'en',
    eyebrow: 'Distributorship',
    intro: [
      'Chennai Rice is growing its network of distributors across Tamil Nadu. If you run a distribution business, a wholesale shop or a trading company and want a dependable rice brand to sell, we would like to hear from you.',
    ],
    sections: [
      {
        h2: 'Why partner with Chennai Rice',
        list: [
          'A family rice business since the 1950s, with 75+ years in rice.',
          'Our own mill in Erode with 2,44,000 MTPA milling capacity and 31 silos holding 61,500 MT of paddy, so supply stays steady through the year.',
          'A full range of 13 packs: Ponni for every budget, aged rice, idli rice and sappadu rice.',
          'Pack sizes that move in every market: 5, 10 and 26 kg bags (25 kg for Rudra and Thaaram).',
          'A 10-stage quality process, from paddy procurement to colour sorting and packing, so every bag cooks the same.',
          'Brand activity that brings customers to the shelf, such as the Chennai Rice Super Slogan Contest.',
        ],
      },
      {
        h2: 'Who can apply',
        list: [
          'Rice and grocery distributors serving retailers in their area.',
          'Wholesale traders and stockists.',
          'Businesses supplying hotels, caterers and institutions.',
          'Entrepreneurs planning a distribution business with storage space and a delivery vehicle.',
        ],
      },
      {
        h2: 'How it works',
        steps: [
          'Apply: send your details through the form (choose "Distributor").',
          'Call: our sales team calls you to understand your area, customers and storage.',
          'Visit: we meet you and, where possible, see your godown.',
          'Appointment: once both sides agree, we confirm the terms and start supply.',
        ],
        note: 'Terms such as territory, stock levels and margins are discussed with each partner on the call.',
      },
    ],
    faqs: [
      { q: 'How do I become a Chennai Rice distributor?', a: 'Send your details through the application form and choose "Distributor". Our sales team will call you to discuss your area and the next steps.' },
      { q: 'Which areas are you appointing distributors in?', a: 'We are growing across Tamil Nadu. Tell us your area in the form and our team will confirm whether it is open.' },
      { q: 'Which products will I distribute?', a: 'The full Chennai Rice range: Ponni rice packs, aged rice, idli rice and sappadu rice, in 5, 10, 25 and 26 kg bags.' },
      { q: 'Do I need a GST registration?', a: 'A GSTIN helps us set up your account and invoices. You can add it in the form; if you are still registering, mention that in your message.' },
    ],
    cta: { to: '/bulk-order?type=distributor', label: 'Apply to become a distributor' },
    links: [
      { to: '/about-us', label: 'About Chennai Rice' },
      { to: '/infrastructure', label: 'Our mill in Erode' },
      { to: '/rice-products', label: 'The rice range' },
    ],
  },

  // Rice guides (answer pages).
  ...GUIDES,
}

/** Landing pages by URL, for the router, the pre-rendered heads and the sitemap. */
export const LANDING_PAGES = [
  { path: '/ponni-rice', key: 'ponni', meta: 'ponni' },
  { path: '/idli-rice', key: 'idli', meta: 'idli' },
  { path: '/rice-distributorship', key: 'distributor', meta: 'distributor' },
  ...GUIDE_PAGES,
]
