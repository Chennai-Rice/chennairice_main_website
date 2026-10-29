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
  { to: '/how-to-cook-ponni-rice', label: 'How to cook Ponni rice' },
  { to: '/ponni-rice-price', label: 'Ponni rice price: 5, 10 and 26 kg' },
  { to: '/ponni-rice-vs-basmati-rice', label: 'Ponni rice vs basmati rice' },
  { to: '/bulk-rice-suppliers-tamil-nadu', label: 'Bulk rice supplier in Tamil Nadu' },
]
const linksExcept = (path) => [
  ...GUIDE_LINKS.filter((l) => l.to !== path).slice(0, 3),
  { to: '/rice-products', label: 'See all Chennai Rice packs' },
]

export const GUIDE_META = {
  guideDaily: {
    path: '/best-ponni-rice-for-daily-meals',
    published: '2026-10-27',
    updated: '2026-10-29',
    title: 'Best Ponni Rice for Daily Meals – How to Choose | Chennai Rice',
    description: 'Which Ponni rice is best for everyday lunch and dinner? A simple guide to soft, separate-cooking Ponni for sambar, rasam, curd rice and lunch boxes, from Chennai Rice, Erode.',
    h1: 'Best Ponni Rice for Daily Meals',
    keywords: 'best Ponni rice, best rice for daily meals, Ponni rice brand, everyday rice Tamil Nadu',
  },
  guideRawBoiled: {
    path: '/raw-rice-vs-boiled-rice',
    published: '2026-10-27',
    updated: '2026-10-27',
    title: 'Raw Rice vs Boiled Rice (Pachai Arisi vs Puzhungal Arisi) | Chennai Rice',
    description: 'What is the difference between raw rice and boiled (parboiled) rice? How each is made, how it cooks and which dishes suit each — pachai arisi and puzhungal arisi explained.',
    h1: 'Raw Rice vs Boiled Rice: Pachai Arisi and Puzhungal Arisi',
    keywords: 'raw rice vs boiled rice, pachai arisi, puzhungal arisi, parboiled rice, boiled rice for daily meals',
  },
  guideAged: {
    path: '/what-is-aged-rice',
    published: '2026-10-27',
    updated: '2026-10-27',
    title: 'What Is Aged Rice? Why Aged Ponni Cooks Better | Chennai Rice',
    description: 'Aged rice is stored for months after harvest before packing. Learn why aged Ponni cooks fluffier and more separate, and how Kitchidi Ponni (aged a year) and Nayara Super Aged differ.',
    h1: 'What Is Aged Rice and Why Does It Cook Better?',
    keywords: 'aged rice, aged Ponni rice, old rice, Kitchidi Ponni, super aged rice',
  },
  guidePonniSona: {
    path: '/ponni-vs-sona-masoori',
    published: '2026-10-27',
    updated: '2026-10-27',
    title: 'Ponni vs Sona Masoori Rice – Differences Explained | Chennai Rice',
    description: 'Ponni and Sona Masoori are two popular South Indian medium grain rices. How they differ in origin, grain, cooking and the dishes they suit — and how to choose.',
    h1: 'Ponni vs Sona Masoori: Which Rice Should You Choose?',
    keywords: 'Ponni vs Sona Masoori, Sona Masoori or Ponni, South Indian rice, Ponni rice',
  },
  guidePerMonth: {
    path: '/how-much-rice-per-month',
    published: '2026-10-27',
    updated: '2026-10-27',
    title: 'How Much Rice Does a Family Need per Month? 5, 10 or 26 kg | Chennai Rice',
    description: 'A simple way to estimate how much rice your family uses in a month, and whether a 5 kg, 10 kg or 26 kg pack suits you best.',
    h1: 'How Much Rice Does a Family Need per Month?',
    keywords: 'rice per month family, how much rice per person, 26 kg rice bag, 10 kg rice, 5 kg rice',
  },
  guideBuyOnline: {
    path: '/buy-ponni-rice-online',
    published: '2026-10-27',
    updated: '2026-10-27',
    title: 'Buy Ponni Rice Online – Delivered Across India | Chennai Rice',
    description: 'Order Ponni rice and idli rice online from Chennai Rice, Erode: 5, 10 and 26 kg packs, delivered across India with the delivery charge shown from your PIN code. Bulk orders welcome.',
    h1: 'Buy Ponni Rice Online from the Mill',
    keywords: 'buy Ponni rice online, Ponni rice online, rice delivery Tamil Nadu, 26 kg rice online, buy rice online India',
  },
  guideCook: {
    path: '/how-to-cook-ponni-rice',
    published: '2026-10-29',
    updated: '2026-10-29',
    title: 'How to Cook Ponni Rice: Water Ratio, Cooker and Open Pot | Chennai Rice',
    description: 'How much water for Ponni rice? Step-by-step cooking in a pressure cooker, closed pan or open pot, with soaking time and tips for soft, separate grains.',
    h1: 'How to Cook Ponni Rice',
    keywords: 'how to cook Ponni rice, Ponni rice water ratio, how much water for rice, boiled rice cooking, rice in pressure cooker',
  },
  guidePrice: {
    path: '/ponni-rice-price',
    published: '2026-10-29',
    updated: '2026-10-29',
    title: 'Ponni Rice Price: 5 kg, 10 kg and 26 kg Packs | Chennai Rice',
    description: 'Current online prices of Chennai Rice Ponni packs in 5, 10 and 26 kg, what makes one Ponni cost more than another, and how delivery is charged. Prices include GST.',
    h1: 'Ponni Rice Price: 5, 10 and 26 kg Packs',
    keywords: 'Ponni rice price, Ponni rice 26 kg price, Ponni rice 10 kg price, Ponni rice 5 kg price, rice price today',
  },
  guidePonniBasmati: {
    path: '/ponni-rice-vs-basmati-rice',
    published: '2026-10-29',
    updated: '2026-10-29',
    title: 'Ponni Rice vs Basmati Rice: Which for Daily Meals? | Chennai Rice',
    description: 'Ponni and basmati are very different rices. How they differ in grain, aroma, cooking and the dishes they suit, and why most South Indian homes eat Ponni every day.',
    h1: 'Ponni Rice vs Basmati Rice',
    keywords: 'Ponni vs basmati, Ponni rice or basmati, non-basmati rice, South Indian rice, daily rice',
  },
  guideBulk: {
    path: '/bulk-rice-suppliers-tamil-nadu',
    published: '2026-10-29',
    updated: '2026-10-29',
    title: 'Bulk Rice Supplier in Tamil Nadu: Wholesale Ponni & Idli Rice | Chennai Rice',
    description: 'Wholesale Ponni and idli rice direct from our mill in Erode for distributors, wholesalers, retailers, hotels, caterers and institutions. Trade packs and steady supply.',
    h1: 'Bulk Rice Supplier in Tamil Nadu, Direct from Our Erode Mill',
    keywords: 'bulk rice suppliers Tamil Nadu, wholesale rice supplier, rice manufacturer Erode, Ponni rice wholesale, rice for hotels and caterers',
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
      { q: 'Who makes Kitchidi Ponni Rice and Special Rajabhogam?', a: 'Both are milled and packed by Chennai Rice Industries India (P) Ltd at Nasiyanur, Erode, Tamil Nadu — a family rice business since 1951.' },
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

  guideCook: {
    key: 'guideCook',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'Ponni rice is easy to cook well once you know three things: rinse and soak it, use the right amount of water for your method, and let it rest before serving. The steps below follow the cooking guide on our packs, from our mill in Erode.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'a1-special-ponni', 'nayara-super-aged'],
    productsHeading: 'Ponni packs this guide is for',
    sections: [
      {
        h2: 'Before you cook: rinse and soak',
        steps: [
          'Measure the rice with a cup and rinse it two or three times, until the water runs almost clear.',
          'Soak it in slightly warm water for about 60 minutes, so it cooks evenly and the grains stay whole.',
        ],
      },
      {
        h2: 'How much water for Ponni rice',
        table: {
          head: ['Method', 'Water for 1 cup of rice', 'Note'],
          rows: [
            ['Pressure cooker or closed pan', 'About 3 cups', 'The usual way for daily lunch and dinner'],
            ['Cooker or closed pan at a hill station', 'About 2.5 cups', 'Adjust a little to your cooker'],
            ['Open pot (drain method)', 'About 5 cups', 'The extra water is drained off'],
          ],
        },
        note: 'These amounts are for boiled (parboiled) Ponni. Water differs from place to place, so adjust a little until the texture suits your family.',
      },
      {
        h2: 'Pressure cooker method',
        steps: [
          'Add the soaked, drained rice and about 3 cups of water for each cup of rice.',
          'Add salt, and a little ghee or oil if you like.',
          'Cook on a medium flame, usually for 3 to 4 whistles, then turn off the heat.',
          'Let the pressure release by itself, then rest the rice for a few minutes before fluffing it.',
        ],
      },
      {
        h2: 'Open pot (drain) method',
        steps: [
          'Bring about 5 cups of water to a rolling boil for each cup of rice.',
          'Add the soaked rice and cook uncovered, stirring now and then, until a grain presses soft between your fingers.',
          'Drain off the extra water, cover and rest for about 5 minutes.',
        ],
      },
      {
        h2: 'Tips for the texture you want',
        list: [
          'Softer rice for curd rice or for children: add a little more water or cook a little longer.',
          'Separate grains for lunch boxes, lemon or tamarind rice: use an aged rice such as Nayara Super Aged, and spread the cooked rice on a plate to cool before mixing.',
          'Mushy rice usually means too much water: reduce it a little next time.',
          'Aged rice usually takes a little more water than new rice and turns out fluffier.',
        ],
      },
    ],
    faqs: [
      { q: 'How much water do I need for 1 cup of Ponni rice?', a: 'For boiled Ponni in a pressure cooker or closed pan, about 3 cups of water for 1 cup of rice (about 2.5 cups at a hill station). For the open-pot drain method, about 5 cups, with the extra water drained off.' },
      { q: 'Should I soak Ponni rice before cooking?', a: 'Yes. Soaking it in slightly warm water for about 60 minutes helps it cook evenly and keeps the grains whole.' },
      { q: 'How many whistles for Ponni rice in a pressure cooker?', a: 'Usually 3 to 4 whistles on a medium flame, then let the pressure release by itself. Cookers differ, so add or remove a whistle if the rice is too firm or too soft.' },
      { q: 'Why does my rice turn sticky?', a: 'Usually too much water, or stirring the rice while it cooks. Reduce the water slightly; for separate grains, choose an aged boiled rice.' },
    ],
    links: linksExcept('/how-to-cook-ponni-rice'),
  },

  guidePrice: {
    key: 'guidePrice',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'The price of each of our Ponni packs is shown below, straight from our online shop, so it is always current. Prices include GST; the delivery charge is added at checkout from your PIN code.',
      'Below the packs you will find what makes one Ponni cost more than another, and how to get the best value for your family.',
    ],
    productIds: PONNI_IDS,
    productsHeading: 'Current prices of our Ponni packs',
    sections: [
      {
        h2: 'What decides the price of Ponni rice',
        list: [
          'Ageing: rice stored for months, or a year, after harvest costs more to hold, and cooks fluffier and more separate.',
          'Variety and grade: the paddy variety, the grain, and how closely the rice is graded and colour sorted.',
          'Pack size: larger packs usually cost less per kilo.',
          'Paddy prices, which change from one harvest season to the next.',
        ],
      },
      {
        h2: 'Which pack size gives the best value',
        p: [
          'Larger packs usually work out cheaper per kilo, so compare the 5, 10 and 26 kg prices of the same pack. A 26 kg bag suits a family that eats rice twice a day; 5 or 10 kg suits a smaller household, or trying a new variety first.',
        ],
      },
      {
        h2: 'How delivery is charged',
        list: [
          'Enter your PIN code on the product page or at checkout to see the delivery charge for your area.',
          'We deliver across India, except Andaman & Nicobar and Army Postal Service addresses.',
          'Shops, hotels, caterers and other bulk buyers can ask for a wholesale quote through a bulk enquiry.',
        ],
      },
    ],
    faqs: [
      { q: 'What is the price of Ponni rice 26 kg?', a: 'It depends on the pack. The current online price of each Chennai Rice Ponni pack, in 5, 10 and 26 kg, is shown on this page and on each product page, including GST; delivery is added from your PIN code.' },
      { q: 'Why do some Ponni rices cost more than others?', a: 'Mostly because of ageing, the paddy variety and how closely the rice is graded. Aged rice such as Kitchidi Ponni (aged a year) costs more to store but cooks fluffier and more separate.' },
      { q: 'Do the prices include GST?', a: 'Yes. Online prices include GST. The delivery charge is shown separately from your PIN code.' },
      { q: 'Do you give wholesale prices?', a: 'Yes, to shops, hotels, caterers, institutions and distributors. Send a bulk enquiry and our team will get back to you with a quote.' },
    ],
    links: linksExcept('/ponni-rice-price'),
  },

  guidePonniBasmati: {
    key: 'guidePonniBasmati',
    lang: 'en',
    eyebrow: 'Rice guide',
    intro: [
      'Basmati and Ponni are both popular in India, but they are used very differently. Basmati is a long, slender, aromatic grain grown mainly in North India and Pakistan, best known for biryani and pulao. Ponni is a medium grain developed in Tamil Nadu and eaten every day across South India with sambar, rasam and curd.',
      'Chennai Rice Industries is a non-basmati rice manufacturer: we mill Ponni rice and idli rice at our plant in Erode. Here is how the two compare.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'nayara-super-aged', 'chennai-bullets'],
    productsHeading: 'Our Ponni packs for daily meals',
    sections: [
      {
        h2: 'Differences at a glance',
        table: {
          head: ['', 'Ponni rice', 'Basmati rice'],
          rows: [
            ['Grain', 'Medium, plump', 'Long and slender; grows longer when cooked'],
            ['Aroma', 'Mild', 'Strong and nutty'],
            ['Grown mainly in', 'Tamil Nadu and South India', 'North India and Pakistan'],
            ['When cooked', 'Soft, separate grains (boiled Ponni)', 'Dry, fluffy, very long grains'],
            ['Usually used for', 'Daily meals with sambar, rasam and kuzhambu; curd rice; lunch boxes', 'Biryani, pulao, jeera rice, fried rice'],
            ['Price', 'Usually lower', 'Usually higher'],
          ],
        },
      },
      {
        h2: 'Which should you use?',
        list: [
          'Everyday lunch and dinner with sambar, rasam and kuzhambu: Ponni. It takes in gravies well and stays pleasant in a lunch box.',
          'Biryani and pulao, where long grains and aroma matter most: many cooks prefer basmati; in Tamil Nadu, seeraga samba is also popular for biryani.',
          'Lemon, tamarind and other variety rice: an aged Ponni that stays separate, such as Nayara Super Aged.',
          'Idli and dosa: neither. Use a rice meant for batter, such as our Special Idly Rice.',
        ],
      },
      {
        h2: 'Why South Indian homes eat Ponni every day',
        p: [
          'Ponni has a mild taste that lets sambar, rasam and kuzhambu stand out, cooks soft yet separate, and costs less than basmati for a family that eats rice twice a day. Aged Ponni, stored for months after harvest, cooks fluffier still.',
        ],
      },
    ],
    faqs: [
      { q: 'Is Ponni rice better than basmati?', a: 'Neither is better overall; they suit different dishes. Ponni is the usual choice for daily South Indian meals with sambar and rasam; basmati is usually chosen for biryani and pulao.' },
      { q: 'Is Ponni rice a basmati rice?', a: 'No. Ponni is a non-basmati, medium grain rice developed in Tamil Nadu. Basmati is a long-grain aromatic rice from North India and Pakistan.' },
      { q: 'Can I make biryani with Ponni rice?', a: 'You can, and some homes do, but the grains are shorter and the biryani turns out softer. For a classic biryani, cooks usually choose basmati or seeraga samba.' },
      { q: 'Does Chennai Rice sell basmati rice?', a: 'No. Chennai Rice Industries is a non-basmati rice manufacturer: we mill Ponni rice and idli rice at our plant in Erode, Tamil Nadu.' },
    ],
    links: linksExcept('/ponni-rice-vs-basmati-rice'),
  },

  guideBulk: {
    key: 'guideBulk',
    lang: 'en',
    eyebrow: 'Bulk & wholesale',
    intro: [
      'Chennai Rice Industries, a trusted rice manufacturer in Erode with over 75 years of expertise, supplies quality rice to wholesalers, distributors, retailers, hotels and institutional buyers.',
      'We store, mill and pack our own rice, so bulk buyers get the same rice bag after bag, direct from the mill.',
    ],
    cta: { to: '/bulk-order', label: 'Send a bulk enquiry' },
    productIds: ['chennai-bullets', 'rudra', 'special-rajabhogam', 'kitchidi-ponni-rice', 'thaaram', 'special-idly-rice'],
    productsHeading: 'Popular packs with trade and bulk buyers',
    sections: [
      {
        h2: 'Who we supply',
        list: [
          'Distributors and wholesalers',
          'Retail shops and supermarkets',
          'Hotels, restaurants, messes and caterers',
          'Schools, colleges, hostels and other institutions',
        ],
      },
      {
        h2: 'Why buy direct from the mill',
        list: [
          'Capacity of 2,44,000 tonnes a year, with 61,500 MT of paddy storage in 31 silos, for steady supply through the year.',
          'Paddy is selected and tested, parboiled for boiled rice, milled on a 10-stage line with colour sorting, and packed at our Erode plant.',
          'Ponni rice (Kitchidi, Rajabhogam, Akshaya and Amman Ponni), aged rice and idli rice under one roof.',
          'Trade packs of 26 kg (Rudra and Thaaram Nei Kitchadi in 25 kg).',
        ],
      },
      {
        h2: 'How to order in bulk',
        steps: [
          'Send a bulk enquiry with your business type, business name, GSTIN if you have one, phone number and the rice you need.',
          'Our team gets back to you with packs, prices and delivery for your quantity.',
          'For a regular supply in your area, apply to become a Chennai Rice distributor.',
        ],
      },
    ],
    faqs: [
      { q: 'Does Chennai Rice supply rice in bulk?', a: 'Yes. Chennai Rice Industries supplies Ponni rice and idli rice in bulk to wholesalers, distributors, retailers, hotels, caterers and institutions, from its mill in Erode, Tamil Nadu. Send a bulk enquiry for a quote.' },
      { q: 'Where is the Chennai Rice mill?', a: 'At Nasiyanur, Erode, Tamil Nadu 638102. The family has been in the rice business since 1951.' },
      { q: 'Which rice suits hotels, caterers and functions?', a: 'Chennai Bullets is made for big kitchens, functions and festival feasts; Rudra is Rajabhogam Ponni for everyday meals in large volumes; Special Idly Rice is for idli and dosa batter.' },
      { q: 'How do I become a Chennai Rice distributor?', a: 'Apply on our Rice Distributorship page and our team will contact you.' },
    ],
    links: [
      { to: '/bulk-order', label: 'Send a bulk enquiry' },
      { to: '/rice-distributorship', label: 'Become a distributor' },
      { to: '/infrastructure', label: 'See our mill' },
      { to: '/rice-products', label: 'See all Chennai Rice packs' },
    ],
  },
}

export const GUIDE_PAGES = Object.entries(GUIDE_META).map(([key, m]) => ({ path: m.path, key, meta: key }))
export { GUIDE_LINKS }
