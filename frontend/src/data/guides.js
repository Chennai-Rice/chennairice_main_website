// Rice guides (Oct 2026): answer pages for the questions people ask Google,
// ChatGPT, Gemini and other AI assistants ("which Ponni rice is best for
// daily meals?", "raw rice or boiled rice?", "how much rice for a family?").
// Same blocks as the topic landing pages (data/landing.js) and rendered by
// pages/LandingPage.jsx; their titles, descriptions and H1s are GUIDE_META,
// merged into PAGE_META in seo.js.
//
// Facts about Chennai Rice come only from what the site already publishes:
// the packs and their descriptions, ageing where the pack states it, the
// parboiling and milling steps, the cooking card, pack sizes and how ordering
// and delivery work. General rice knowledge is kept general and hedged
// ("usually", "commonly"); there are no health or nutrition claims.

const PONNI_IDS = [
  'kitchidi-ponni-rice', 'special-rajabhogam', 'a1-special-ponni', 'viruchagam', 'united-5kg',
  'vijaya-nagaram', 'vintage', 'chennai-bullets', 'nayara-super-aged',
]

const GUIDE_LINKS = [
  { to: '/best-ponni-rice-for-daily-meals', label: 'Best Ponni rice for daily meals' },
  { to: '/raw-rice-vs-boiled-rice', label: 'Raw rice vs boiled rice' },
  { to: '/what-is-aged-rice', label: 'What is aged rice?' },
  { to: '/ponni-vs-sona-masoori', label: 'Ponni vs Sona Masoori' },
  { to: '/how-much-rice-per-month', label: 'How much rice does a family need?' },
  { to: '/buy-ponni-rice-online', label: 'Buy Ponni rice online' },
]
const linksExcept = (path) => [
  ...GUIDE_LINKS.filter((l) => l.to !== path).slice(0, 3),
  { to: '/rice-products', label: 'See all Chennai Rice packs' },
]

export const GUIDE_META = {
  guideDaily: {
    path: '/best-ponni-rice-for-daily-meals',
    title: 'Best Ponni Rice for Daily Meals – How to Choose | Chennai Rice',
    description: 'Which Ponni rice is best for everyday lunch and dinner? A simple guide to soft, separate-cooking Ponni for sambar, rasam, curd rice and lunch boxes, from Chennai Rice, Erode.',
    h1: 'Best Ponni Rice for Daily Meals',
    keywords: 'best Ponni rice, best rice for daily meals, Ponni rice brand, everyday rice Tamil Nadu',
  },
  guideRawBoiled: {
    path: '/raw-rice-vs-boiled-rice',
    title: 'Raw Rice vs Boiled Rice (Pachai Arisi vs Puzhungal Arisi) | Chennai Rice',
    description: 'What is the difference between raw rice and boiled (parboiled) rice? How each is made, how it cooks and which dishes suit each — pachai arisi and puzhungal arisi explained.',
    h1: 'Raw Rice vs Boiled Rice: Pachai Arisi and Puzhungal Arisi',
    keywords: 'raw rice vs boiled rice, pachai arisi, puzhungal arisi, parboiled rice, boiled rice for daily meals',
  },
  guideAged: {
    path: '/what-is-aged-rice',
    title: 'What Is Aged Rice? Why Aged Ponni Cooks Better | Chennai Rice',
    description: 'Aged rice is stored for months after harvest before packing. Learn why aged Ponni cooks fluffier and more separate, and how Kitchidi Ponni (aged a year) and Nayara Super Aged differ.',
    h1: 'What Is Aged Rice and Why Does It Cook Better?',
    keywords: 'aged rice, aged Ponni rice, old rice, Kitchidi Ponni, super aged rice',
  },
  guidePonniSona: {
    path: '/ponni-vs-sona-masoori',
    title: 'Ponni vs Sona Masoori Rice – Differences Explained | Chennai Rice',
    description: 'Ponni and Sona Masoori are two popular South Indian medium grain rices. How they differ in origin, grain, cooking and the dishes they suit — and how to choose.',
    h1: 'Ponni vs Sona Masoori: Which Rice Should You Choose?',
    keywords: 'Ponni vs Sona Masoori, Sona Masoori or Ponni, South Indian rice, Ponni rice',
  },
  guidePerMonth: {
    path: '/how-much-rice-per-month',
    title: 'How Much Rice Does a Family Need per Month? 5, 10 or 26 kg | Chennai Rice',
    description: 'A simple way to estimate how much rice your family uses in a month, and whether a 5 kg, 10 kg or 26 kg pack suits you best.',
    h1: 'How Much Rice Does a Family Need per Month?',
    keywords: 'rice per month family, how much rice per person, 26 kg rice bag, 10 kg rice, 5 kg rice',
  },
  guideBuyOnline: {
    path: '/buy-ponni-rice-online',
    title: 'Buy Ponni Rice Online – Delivered Across India | Chennai Rice',
    description: 'Order Ponni rice and idli rice online from Chennai Rice, Erode: 5, 10 and 26 kg packs, delivered across India with the delivery charge shown from your PIN code. Bulk orders welcome.',
    h1: 'Buy Ponni Rice Online from the Mill',
    keywords: 'buy Ponni rice online, Ponni rice online, rice delivery Tamil Nadu, 26 kg rice online, buy rice online India',
  },
}

export const GUIDES = {
  guideDaily: {
    key: 'guideDaily',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'For everyday lunch and dinner in a Tamil home, most families want rice that cooks soft but stays separate, takes in sambar, rasam and kuzhambu well, and is still pleasant in a lunch box a few hours later. That is what Ponni rice is known for.',
      'Chennai Rice Industries mills Ponni at its own plant in Erode, Tamil Nadu, and packs it in 5, 10 and 26 kg bags. This guide explains what to look for and which of our packs suits which kind of kitchen.',
    ],
    productIds: PONNI_IDS,
    productsHeading: 'Our everyday Ponni packs',
    sections: [
      {
        h2: 'What makes a good everyday rice',
        list: [
          'Soft, separate grains: boiled (parboiled) Ponni usually cooks firmer and more separate than raw rice, which is why most Tamil homes use it daily.',
          'Ageing: rice stored for months after harvest absorbs more water and turns out fluffier and less sticky.',
          'A mild taste that lets sambar, rasam and kuzhambu stand out.',
          'Consistency from bag to bag, so the same water and time give the same result every day.',
        ],
      },
      {
        h2: 'Which Chennai Rice pack for which kitchen',
        table: {
          head: ['If you want…', 'Choose', 'Why'],
          rows: [
            ['Everyday rice that cooks soft and separate', 'Kitchidi Ponni Rice', 'Kitchidi Ponni, aged for a year'],
            ['A classic daily lunch rice', 'Special Rajabhogam', 'Kitchidi Ponni rice in our red pack'],
            ['Sambar sadam and curd rice', 'A1 Special Ponni', 'Quality graded for even, fluffy grains'],
            ['Traditional Tamil meals', 'Viruchagam', 'Poompuhar Ponni from RNR paddy'],
            ['Lunch boxes and lemon / tamarind rice', 'Nayara Super Aged', 'Super aged gel cook rice that stays separate'],
            ['Everyday meals at a friendly price', 'United or Vijaya Nagaram', 'Everyday Ponni / Amman Ponni (HMT grain)'],
            ['Large families, hotels and trade', 'Chennai Bullets', 'Rajabhogam Ponni with a rich aroma'],
          ],
        },
      },
      {
        h2: 'How to cook it for daily meals',
        steps: [
          'Rinse the rice well and soak it in slightly warm water for about 60 minutes.',
          'In a cooker or closed pan, use about 3 cups of water for 1 cup of rice (about 2.5 cups at a hill station).',
          'Add salt, and a little ghee or oil if you like, and cook until soft; rest for a few minutes before serving.',
        ],
        note: 'Water differs from place to place — adjust a little until the texture suits your family.',
      },
    ],
    faqs: [
      { q: 'Which Ponni rice is best for daily meals?', a: 'For everyday lunch and dinner, a boiled Ponni that cooks soft and separate is the usual choice. From Chennai Rice, Kitchidi Ponni Rice (aged a year), Special Rajabhogam and A1 Special Ponni are made for daily meals; Nayara Super Aged suits lunch boxes and variety rice.' },
      { q: 'Is boiled rice or raw rice better for everyday meals?', a: 'Most Tamil homes use boiled (parboiled) rice for daily meals because it cooks firmer with separate grains. Raw rice cooks softer and stickier and is usually kept for pongal, payasam and sweets.' },
      { q: 'Who makes Kitchidi Ponni Rice and Special Rajabhogam?', a: 'Both are milled and packed by Chennai Rice Industries India (P) Ltd at Nasiyanur, Erode, Tamil Nadu — a family-run rice mill founded in 1980.' },
      { q: 'Which pack size should I buy?', a: 'A 26 kg bag usually suits a family that eats rice twice a day; 5 or 10 kg suits smaller households or trying a new variety. See our guide on how much rice a family needs per month.' },
      { q: 'Where can I buy these packs?', a: 'Order online at chennairiceindustries.com (delivered across India, with the delivery charge shown from your PIN code), through our distributors and shops, or send a bulk enquiry for larger quantities.' },
    ],
    links: linksExcept('/best-ponni-rice-for-daily-meals'),
  },

  guideRawBoiled: {
    key: 'guideRawBoiled',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'In Tamil kitchens rice comes in two forms: raw rice (pachai arisi) and boiled rice (puzhungal arisi). They can be the same variety — Ponni, for example, is sold both ways — but they are made differently, cook differently and suit different dishes.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'nayara-super-aged', 'special-idly-rice'],
    productsHeading: 'Chennai Rice packs for everyday cooking',
    sections: [
      {
        h2: 'How each is made',
        p: [
          'Raw rice is milled straight from dried paddy: the husk is removed and the grain is polished.',
          'Boiled rice (also called parboiled rice) goes through an extra step before milling: the paddy is soaked, steamed and dried. At our mill in Erode this is how the boiled rice is made — paddy is soaked, steamed and dried so the grain stays firm and cooks separate — and then it is cleaned, husked, polished, graded and colour sorted.',
        ],
      },
      {
        h2: 'Differences at a glance',
        table: {
          head: ['', 'Raw rice (pachai arisi)', 'Boiled rice (puzhungal arisi)'],
          rows: [
            ['Made from', 'Dried paddy, milled directly', 'Paddy soaked, steamed and dried, then milled'],
            ['When cooked', 'Softer and slightly sticky', 'Firmer, grains stay separate'],
            ['Usually used for', 'Pongal, payasam, sweets, some variety rice', 'Daily meals with sambar, rasam, kuzhambu; curd rice'],
            ['Water and time', 'Usually a little less water and time', 'Usually a little more water and time'],
          ],
        },
      },
      {
        h2: 'Which should you buy?',
        list: [
          'For everyday lunch and dinner: boiled rice — for example Kitchidi Ponni Rice or Special Rajabhogam.',
          'For lunch boxes and lemon or tamarind rice that should not clump: an aged boiled rice such as Nayara Super Aged.',
          'For idli and dosa batter: a rice meant for batter, such as our Special Idly Rice.',
          'For pongal, payasam and sweets: raw rice.',
        ],
      },
    ],
    faqs: [
      { q: 'What is the difference between raw rice and boiled rice?', a: 'Raw rice is milled directly from dried paddy and cooks soft and slightly sticky. Boiled (parboiled) rice is made from paddy that is soaked, steamed and dried before milling, so it cooks firmer with separate grains.' },
      { q: 'Is Ponni rice raw or boiled?', a: 'Ponni is a variety and is sold both ways. Boiled Ponni is the usual choice for daily meals in Tamil Nadu; raw Ponni suits pongal and sweets.' },
      { q: 'Is parboiled rice the same as boiled rice?', a: 'Yes. In Tamil Nadu parboiled rice is commonly called boiled rice or puzhungal arisi.' },
      { q: 'Which Chennai Rice packs are boiled rice?', a: 'Our everyday Ponni packs such as Kitchidi Ponni Rice and Special Rajabhogam are made for daily meals and cook firm and separate. Check each product page for its description.' },
    ],
    links: linksExcept('/raw-rice-vs-boiled-rice'),
  },

  guideAged: {
    key: 'guideAged',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'You may have heard that "old rice" or aged rice cooks better. It is not marketing: aged rice is rice that has been stored for months after harvest before it is packed, and it behaves differently in the pot.',
    ],
    productIds: ['kitchidi-ponni-rice', 'nayara-super-aged'],
    productsHeading: 'Our aged rice',
    sections: [
      {
        h2: 'Why aged rice cooks fluffier',
        p: [
          'Freshly harvested rice holds more moisture and tends to turn sticky when cooked. As rice is stored after harvest, the grain loses moisture and firms up. Aged rice therefore absorbs more water, swells more and cooks into fluffy, separate grains — which is why many Tamil households prefer it for daily meals and variety rice.',
        ],
      },
      {
        h2: 'Aged rice from Chennai Rice',
        table: {
          head: ['Pack', 'What it is', 'Best for'],
          rows: [
            ['Kitchidi Ponni Rice', 'Kitchidi Ponni, aged for a year', 'Everyday home meals'],
            ['Nayara Super Aged', 'Super aged gel cook rice that stays separate and firm', 'Lemon rice, tamarind rice, lunch boxes'],
          ],
        },
      },
      {
        h2: 'Cooking aged rice',
        list: [
          'Aged rice usually needs a little more water than new rice — start with about 3 cups of water for 1 cup of rice in a cooker and adjust.',
          'Soaking for about 60 minutes in slightly warm water helps it cook evenly.',
          'Rest the cooked rice for a few minutes so the grains separate.',
        ],
      },
    ],
    faqs: [
      { q: 'What is aged rice?', a: 'Aged rice is rice stored for months after harvest before it is packed. It loses moisture, absorbs more water while cooking and turns out fluffy and separate.' },
      { q: 'Is aged rice better than new rice?', a: 'For dishes where you want separate grains — daily meals, lemon rice, tamarind rice, lunch boxes — many people prefer aged rice. New rice can be stickier.' },
      { q: 'How long is Kitchidi Ponni Rice aged?', a: 'Chennai Rice Kitchidi Ponni Rice is aged for a year.' },
      { q: 'Does aged rice need more water?', a: 'Usually a little more. Start with about 3 cups of water for 1 cup of rice in a cooker and adjust for your water and taste.' },
    ],
    links: linksExcept('/what-is-aged-rice'),
  },

  guidePonniSona: {
    key: 'guidePonniSona',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'Ponni and Sona Masoori are two of the most familiar rices in South Indian homes. Both are medium grain, both cook soft, and both are eaten every day — but they come from different regions and many families have a clear favourite.',
      'Chennai Rice mills Ponni (not Sona Masoori), so this guide sticks to general, widely known differences and helps you decide what suits your kitchen.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'a1-special-ponni'],
    productsHeading: 'Ponni rice from Chennai Rice',
    sections: [
      {
        h2: 'The main differences',
        table: {
          head: ['', 'Ponni', 'Sona Masoori'],
          rows: [
            ['Where it is grown', 'Mainly Tamil Nadu (Cauvery delta)', 'Mainly Andhra Pradesh, Telangana and Karnataka'],
            ['How it is usually sold in Tamil Nadu', 'Most often as boiled (parboiled) rice for daily meals', 'Most often as raw rice'],
            ['Grain', 'Medium grain', 'Medium grain, light'],
            ['Cooked texture', 'Soft, separate grains (boiled)', 'Soft and light (raw)'],
            ['Typical dishes', 'Sambar, rasam, kuzhambu, curd rice, lunch boxes', 'Everyday rice, variety rice, sweets'],
          ],
        },
      },
      {
        h2: 'How to choose',
        list: [
          'If your family eats rice with sambar, rasam and kuzhambu every day and likes separate grains, boiled Ponni is the traditional Tamil Nadu choice.',
          'If you prefer a lighter raw rice, Sona Masoori is a common choice in Andhra Pradesh, Telangana and Karnataka.',
          'Whichever you choose, aged rice cooks fluffier and less sticky than new rice.',
        ],
      },
    ],
    faqs: [
      { q: 'Is Ponni better than Sona Masoori?', a: 'Neither is better for everyone. Ponni (usually boiled) is the everyday rice of Tamil Nadu and cooks soft and separate; Sona Masoori (usually raw) is light and soft and popular in Andhra Pradesh, Telangana and Karnataka. Choose by the texture your family likes.' },
      { q: 'Does Chennai Rice sell Sona Masoori?', a: 'No. Chennai Rice mills Ponni rice (including Kitchidi, Rajabhogam, Akshaya and Amman Ponni) and idli rice at its plant in Erode.' },
      { q: 'Which Ponni should I try first?', a: 'For daily meals, Kitchidi Ponni Rice (aged a year) or Special Rajabhogam are good starting points; 5 kg packs make it easy to try.' },
    ],
    links: linksExcept('/ponni-vs-sona-masoori'),
  },

  guidePerMonth: {
    key: 'guidePerMonth',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'Buying the right bag size saves money and trips to the shop. Rice use differs a lot from home to home, so here is a simple way to estimate your own — and then pick a 5, 10 or 26 kg pack.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'special-idly-rice'],
    productsHeading: 'Packs in 5, 10 and 26 kg',
    sections: [
      {
        h2: 'A quick way to estimate',
        steps: [
          'Note how many cups (or grams) of uncooked rice you cook for one meal. Many homes cook roughly 75–100 g of uncooked rice per adult per meal — but measure your own for a week if you can.',
          'Multiply by the number of rice meals a day, then by 30 days.',
          'Add the rice you use for idli and dosa batter, if you make it at home.',
        ],
        note: 'Example (an estimate, not a rule): a family of four eating rice twice a day at about 90 g per person per meal uses about 4 × 2 × 0.09 kg × 30 ≈ 22 kg a month.',
      },
      {
        h2: 'Which bag size suits you',
        table: {
          head: ['Household', 'Typical choice'],
          rows: [
            ['1–2 people, or trying a new variety', '5 kg'],
            ['2–3 people eating rice once a day', '10 kg'],
            ['A family of 4 or more eating rice twice a day', '26 kg'],
            ['Hotels, caterers, institutions, shops', 'Bulk order'],
          ],
        },
      },
      {
        h2: 'Storing a bigger bag',
        list: [
          'Keep the bag in a cool, dry place, off the floor and away from moisture and strong smells.',
          'Close the bag or transfer the rice to a clean, airtight container after opening.',
        ],
      },
    ],
    faqs: [
      { q: 'How much rice does a family of four need per month?', a: 'It depends on how often you eat rice. As an estimate, a family of four eating rice twice a day at about 90 g of uncooked rice per person per meal uses around 22 kg a month — so a 26 kg bag usually lasts about a month.' },
      { q: 'How long does a 26 kg rice bag last?', a: 'For a family of four eating rice twice a day, roughly a month; for smaller families, longer. Measure your own use for a week for a better estimate.' },
      { q: 'What pack sizes does Chennai Rice sell?', a: 'Most of our packs come in 5, 10 and 26 kg bags; Rudra and Thaaram Nei Kitchadi come in 25 kg. Larger quantities can be ordered through a bulk enquiry.' },
    ],
    links: linksExcept('/how-much-rice-per-month'),
  },

  guideBuyOnline: {
    key: 'guideBuyOnline',
    lang: 'en',
    eyebrow: 'Buy online',
    intro: [
      'You can order Chennai Rice directly from our mill in Erode, Tamil Nadu. Every pack is milled, checked and sealed at our own plant, and online orders are delivered across India.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'nayara-super-aged', 'a1-special-ponni', 'special-idly-rice', 'alibaba'],
    productsHeading: 'Popular packs to order online',
    sections: [
      {
        h2: 'How ordering works',
        steps: [
          'Choose your rice and pack size (5, 10 or 26 kg) on the product page and add it to the cart.',
          'Enter your delivery address and PIN code — the delivery charge for your region is shown before you pay.',
          'Pay securely online. You get an order confirmation by email with your GST invoice.',
          'When the order is dispatched you get the courier and tracking details; you can also track it any time on our Track Order page.',
        ],
      },
      {
        h2: 'Where we deliver',
        list: [
          'Across Tamil Nadu, the rest of South India, North India and the North East — the delivery charge depends on your region and pack size and is shown from your PIN code.',
          'Andaman & Nicobar and Army Postal Service addresses are not served online yet.',
          'For shops, hotels, caterers, institutions and distributors, use the bulk order form for wholesale supply.',
        ],
      },
      {
        h2: 'Need help?',
        p: [
          'Message us on WhatsApp at 70666 46667 or email support@chennairiceindustries.com. Our Shipping Policy and Return & Refund Policy explain delivery times and what happens if a bag arrives damaged.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I buy Ponni rice online from Chennai Rice?', a: 'Yes. Order at chennairiceindustries.com: choose the pack and size, enter your PIN code to see the delivery charge, and pay online. Orders are delivered across India.' },
      { q: 'Do you deliver outside Tamil Nadu?', a: 'Yes — to the rest of South India, North India and the North East, with a delivery charge by region shown from your PIN code. Andaman & Nicobar is not served online yet.' },
      { q: 'How do I track my order?', a: 'Use the Track Order page with your order number (it starts with CR-) or shipment ID, or ask our chat assistant Soru Kutty.' },
      { q: 'Can I order in bulk?', a: 'Yes. Retailers, wholesalers, hotels, caterers and institutions can send a bulk enquiry and our team will get back to them.' },
    ],
    links: [
      { to: '/rice-products', label: 'See all Chennai Rice packs' },
      { to: '/track-order', label: 'Track an order' },
      { to: '/shipping', label: 'Shipping Policy' },
      { to: '/bulk-order', label: 'Bulk & wholesale orders' },
    ],
  },
}

export const GUIDE_PAGES = Object.entries(GUIDE_META).map(([key, m]) => ({ path: m.path, key, meta: key }))
export { GUIDE_LINKS }
