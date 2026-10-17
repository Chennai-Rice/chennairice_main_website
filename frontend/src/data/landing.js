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

const PONNI_IDS = [
  'kitchidi-ponni-rice', 'special-rajabhogam', 'viruchagam', 'vintage', 'united-5kg', 'a1-special-ponni',
  'vijaya-nagaram', 'chennai-bullets', 'rudra', 'thaaram', 'nayara-super-aged',
]

export const LANDING = {
  ponni: {
    key: 'ponni',
    lang: 'en',
    alternate: { lang: 'ta', path: '/ta/ponni-rice', label: 'தமிழில் படிக்க' },
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
      { to: '/bulk-order', label: 'Bulk & wholesale orders' },
    ],
  },

  idli: {
    key: 'idli',
    lang: 'en',
    alternate: { lang: 'ta', path: '/ta/idli-rice', label: 'தமிழில் படிக்க' },
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

  // ---- Tamil -----------------------------------------------------------------
  taHome: {
    key: 'taHome',
    lang: 'ta',
    alternate: { lang: 'en', path: '/', label: 'Read in English' },
    eyebrow: 'சென்னை ரைஸ்',
    intro: [
      'ஈரோட்டில் உள்ள எங்கள் சொந்த ஆலையில் அரைத்து, சுத்தம் செய்து, பைகளில் அடைக்கப்படும் தரமான அரிசி. 1950களிலிருந்து அரிசித் தொழிலில் இருக்கும் குடும்ப நிறுவனம் சென்னை ரைஸ் இண்டஸ்ட்ரீஸ்.',
      'தினசரி சாப்பாட்டுக்கு பொன்னி அரிசி, மிருதுவான இட்லிக்கு இட்லி அரிசி, கலவை சாதத்துக்கு பழைய அரிசி — உங்கள் சமையலுக்கு ஏற்ற அரிசியை 5, 10 மற்றும் 26 கிலோ பைகளில் பெறுங்கள்.',
    ],
    productIds: ['kitchidi-ponni-rice', 'special-rajabhogam', 'nayara-super-aged', 'special-idly-rice'],
    productsHeading: 'எங்கள் பிரபலமான அரிசி வகைகள்',
    sections: [
      {
        h2: 'சென்னை ரைஸ் பற்றி',
        p: [
          '75 ஆண்டுகளுக்கும் மேலான அனுபவத்துடன், ஈரோடு நசியனூரில் உள்ள எங்கள் ஆலையில் ஆண்டுக்கு 2,44,000 மெட்ரிக் டன் அரைக்கும் திறனும், 61,500 மெட்ரிக் டன் நெல் சேமிக்கும் 31 சைலோக்களும் உள்ளன. நெல் கொள்முதல் முதல் கலர் சார்டிங், பேக்கிங் வரை 10 கட்ட தரச் சோதனைக்குப் பிறகே ஒவ்வொரு பையும் உங்கள் வீட்டுக்கு வருகிறது.',
        ],
      },
      {
        h2: 'சென்னை ரைஸை குடும்பங்கள் ஏன் தேர்வு செய்கின்றன',
        list: [
          'ஒவ்வொரு பையும் ஒரே மாதிரி சமையும் — சீரான தரம்.',
          'கற்கள், உமி, தூசி இல்லாமல் சுத்தம் செய்யப்பட்டு கலர் சார்ட் செய்யப்பட்ட அரிசி.',
          'ஒரு வருடம் பழைய கிச்சடி பொன்னி உட்பட, பழைய அரிசி வகைகள்.',
          'வீட்டுக்கும் கடைக்கும் ஏற்ற 5, 10, 26 கிலோ பைகள்.',
        ],
      },
      {
        h2: 'வியாபாரிகள் மற்றும் விநியோகஸ்தர்களுக்கு',
        p: [
          'சில்லறை வியாபாரிகள், மொத்த வியாபாரிகள், ஹோட்டல்கள் மற்றும் கேட்டரிங் நிறுவனங்களுக்கு மொத்த விலையில் அரிசி வழங்குகிறோம். மொத்த ஆர்டர் படிவத்தை நிரப்பினால் எங்கள் குழு உங்களைத் தொடர்பு கொள்ளும்.',
        ],
      },
    ],
    faqs: [
      { q: 'பொன்னி அரிசி என்றால் என்ன?', a: 'பொன்னி தமிழ்நாட்டில் அதிகம் விளையும், அதிகம் சாப்பிடப்படும் நடுத்தர அளவு வெள்ளை அரிசி. மிருதுவாகவும் லேசாகவும் சமையும்; சாம்பார், ரசம், குழம்புடன் சாப்பிட மிகவும் ஏற்றது.' },
      { q: 'பச்சரிசிக்கும் புழுங்கல் அரிசிக்கும் என்ன வித்தியாசம்?', a: 'பச்சரிசி காய்ந்த நெல்லிலிருந்து நேரடியாக அரைக்கப்படுகிறது; மிருதுவாகவும் லேசான ஒட்டும் தன்மையுடனும் சமையும் — பொங்கல், பாயசத்துக்கு ஏற்றது. புழுங்கல் அரிசி நெல்லை ஊறவைத்து, ஆவியில் வேகவைத்து, காயவைத்து அரைக்கப்படுகிறது; உதிரியாக சமையும் — தினசரி சாப்பாட்டுக்கு ஏற்றது.' },
      { q: 'ஆன்லைனில் ஆர்டர் செய்யலாமா?', a: 'ஆம். எங்கள் இணையதளத்தில் அரிசியைத் தேர்வு செய்து, ஆன்லைனில் பணம் செலுத்தி ஆர்டர் செய்யலாம். ஆர்டர் எண்ணைக் கொண்டு டெலிவரியை டிராக் செய்யலாம்.' },
    ],
    links: [
      { to: '/ta/ponni-rice', label: 'பொன்னி அரிசி' },
      { to: '/ta/idli-rice', label: 'இட்லி அரிசி' },
      { to: '/rice-products', label: 'அனைத்து அரிசி வகைகள் (English)' },
    ],
  },

  taPonni: {
    key: 'taPonni',
    lang: 'ta',
    alternate: { lang: 'en', path: '/ponni-rice', label: 'Read in English' },
    eyebrow: 'பொன்னி அரிசி',
    intro: [
      'தமிழ்நாட்டு வீடுகளில் தினமும் சமைக்கப்படும் அரிசி பொன்னி. மிருதுவாகவும் லேசாகவும் சமையும்; சாம்பார், ரசம், குழம்பின் சுவையை நன்றாக உள்வாங்கும்; டிபன் பாக்ஸிலும் சுவை மாறாது.',
      'ஈரோட்டில் உள்ள எங்கள் ஆலையில் அரைக்கப்படும் பொன்னி அரிசி 5, 10 மற்றும் 26 கிலோ பைகளில் கிடைக்கிறது (ருத்ரா, தாரம் 25 கிலோ பையில்).',
    ],
    productIds: PONNI_IDS,
    productsHeading: 'எங்கள் பொன்னி அரிசி வகைகள்',
    sections: [
      {
        h2: 'பொன்னி அரிசி என்றால் என்ன?',
        p: [
          'பொன்னி தமிழ்நாட்டில் உருவாக்கப்பட்டு, காவிரி டெல்டா பகுதிகளில் அதிகம் பயிரிடப்படும் நடுத்தர அளவு வெள்ளை அரிசி. குழையாமல் மிருதுவாக சமையும் தன்மையும், குழம்பின் சுவையை மறைக்காத இயல்பான சுவையும் இதன் சிறப்பு.',
          'ராஜபோகம், கிச்சடி, அட்சயா, அம்மன் (HMT) பொன்னி என பல வகைகள் உள்ளன. அரிசியின் அளவு, எவ்வளவு காலம் பழையதாக்கப்பட்டது, எவ்வளவு உதிரியாக சமையும் என்பதில் இவை வேறுபடுகின்றன.',
        ],
      },
      {
        h2: 'பச்சரிசி பொன்னி, புழுங்கல் பொன்னி',
        p: [
          'பச்சரிசி காய்ந்த நெல்லிலிருந்து நேரடியாக அரைக்கப்படுகிறது; பொங்கல், பாயசம், இனிப்பு வகைகளுக்கு ஏற்றது. புழுங்கல் அரிசி நெல்லை ஊறவைத்து, ஆவியில் வேகவைத்து, காயவைத்து அரைக்கப்படுகிறது; உதிரியாக சமைவதால் பெரும்பாலான தமிழ் வீடுகளில் தினசரி சாப்பாட்டுக்கு இதையே பயன்படுத்துகிறார்கள்.',
        ],
      },
      {
        h2: 'பழைய பொன்னி ஏன் நன்றாக சமைகிறது?',
        p: [
          'புதிதாக அறுவடை செய்த அரிசியில் ஈரப்பதம் அதிகம்; அதனால் ஒட்டிக்கொள்ளும். பழைய அரிசி அறுவடைக்குப் பிறகு பல மாதங்கள் சேமிக்கப்படுகிறது; ஈரப்பதம் குறைந்து, சமைக்கும்போது அதிக தண்ணீரை உறிஞ்சி, உதிரி உதிரியாக பூப்போல சமையும். எங்கள் கிச்சடி பொன்னி அரிசி ஒரு வருடம் பழையது.',
        ],
      },
      {
        h2: 'பொன்னி அரிசியை எப்படி சமைப்பது',
        steps: [
          'அரிசியை நன்றாகக் கழுவி, லேசான வெதுவெதுப்பான தண்ணீரில் சுமார் 60 நிமிடம் ஊறவைக்கவும்.',
          'மூடிய பாத்திரம் அல்லது குக்கரில் 1 கப் அரிசிக்கு சுமார் 3 கப் தண்ணீர் (மலைப் பிரதேசத்தில் 2.5 கப்). திறந்த பாத்திரத்தில் சுமார் 5 கப் தண்ணீர் வைத்து, வெந்ததும் வடிக்கவும்.',
          'உப்பு, விரும்பினால் ஒரு ஸ்பூன் நெய் அல்லது எண்ணெய் சேர்த்து, அரிசி மிருதுவாகும் வரை வேகவைக்கவும்.',
          'பரிமாறுவதற்கு முன் சில நிமிடங்கள் அப்படியே வைத்தால் சாதம் உதிரியாக இருக்கும்.',
        ],
        note: 'ஊருக்கு ஊர் தண்ணீர் மாறுபடும்; உங்கள் குடும்பத்துக்குப் பிடித்த பதம் வரும் வரை தண்ணீரைச் சற்று கூட்டியோ குறைத்தோ பார்க்கவும்.',
      },
    ],
    faqs: [
      { q: 'பொன்னி அரிசி பச்சரிசியா, புழுங்கல் அரிசியா?', a: 'பொன்னி ஒரு ரகம்; இரண்டு வகையாகவும் கிடைக்கிறது. புழுங்கல் பொன்னி உதிரியாக சமையும் — தினசரி சாப்பாட்டுக்கு ஏற்றது. பச்சரிசி பொன்னி மிருதுவாக சமையும் — பொங்கல், இனிப்புகளுக்கு ஏற்றது.' },
      { q: 'தினசரி சாப்பாட்டுக்கு எந்த பொன்னி சிறந்தது?', a: 'கிச்சடி பொன்னி அரிசி, ஸ்பெஷல் ராஜபோகம், A1 ஸ்பெஷல் பொன்னி போன்றவை தினசரி மதிய, இரவு உணவுக்கு ஏற்றவை. கலவை சாதம், டிபன் பாக்ஸுக்கு ஒட்டாத அரிசி வேண்டுமென்றால் நயாரா சூப்பர் ஏஜ்டு சிறந்தது.' },
      { q: 'என்னென்ன பை அளவுகளில் கிடைக்கும்?', a: 'பெரும்பாலான பொன்னி வகைகள் 5, 10, 26 கிலோ பைகளில் கிடைக்கும். ருத்ரா, தாரம் நெய் கிச்சடி 25 கிலோ பையில் கிடைக்கும்.' },
      { q: '26 கிலோ அரிசிப் பையை எப்படிச் சேமிப்பது?', a: 'ஈரம் இல்லாத, குளிர்ச்சியான இடத்தில், தரையில் படாமல் வைக்கவும். பையைத் திறந்த பிறகு நன்றாக மூடி வைக்கவும்.' },
    ],
    links: [
      { to: '/ta/idli-rice', label: 'இட்லி அரிசி' },
      { to: '/ta', label: 'சென்னை ரைஸ் முகப்பு' },
      { to: '/bulk-order', label: 'மொத்த ஆர்டர்' },
    ],
  },

  taIdli: {
    key: 'taIdli',
    lang: 'ta',
    alternate: { lang: 'en', path: '/idli-rice', label: 'Read in English' },
    eyebrow: 'இட்லி அரிசி',
    intro: [
      'மிருதுவான, பஞ்சு போன்ற இட்லியும் மொறுமொறுப்பான தோசையும் சரியான அரிசியில்தான் தொடங்குகின்றன. சென்னை ரைஸ் ஸ்பெஷல் இட்லி அரிசி நன்றாக அரைபடும், நன்றாகப் புளிக்கும், பூப்போன்ற இட்லியாக வேகும்.',
      '5, 10, 26 கிலோ பைகளில் கிடைப்பதால் வீட்டுச் சமையலுக்கும், தினமும் மாவு அரைக்கும் ஹோட்டல்கள், டிபன் சென்டர்களுக்கும் ஏற்றது.',
    ],
    productIds: ['special-idly-rice'],
    productsHeading: 'எங்கள் இட்லி அரிசி',
    sections: [
      {
        h2: 'நல்ல இட்லி அரிசியின் தன்மை',
        p: [
          'இட்லி அரிசி குட்டையான, பருமனான புழுங்கல் அரிசி. நெல்லை ஊறவைத்து, ஆவியில் வேகவைத்து, காயவைத்து அரைப்பதால் அரிசி உறுதியாகிறது; அதனால் மாவு மென்மையாக அரைபட்டு, புளிக்கும்போது காற்றைத் தக்கவைக்கிறது. அதுவே இட்லி உப்பி மிருதுவாக இருக்கக் காரணம்.',
        ],
      },
      {
        h2: 'இட்லி மாவு: அரிசி, உளுந்து அளவு',
        p: [
          'பெரும்பாலான வீடுகளில் 4 கப் இட்லி அரிசிக்கு 1 கப் முழு உளுந்து, உளுந்துடன் ஒரு சிறிய ஸ்பூன் வெந்தயம் சேர்த்து ஊறவைப்பார்கள். தோசை மொறுமொறுப்பாக வர, சிலர் ஒரு கைப்பிடி பச்சரிசி சேர்ப்பார்கள்.',
        ],
      },
      {
        h2: 'ஊறவைத்தல், அரைத்தல், புளிக்கவைத்தல்',
        steps: [
          'இட்லி அரிசியையும் உளுந்தையும் தனித்தனியாகக் கழுவி, 4 முதல் 6 மணி நேரம் ஊறவைக்கவும்.',
          'முதலில் உளுந்தை சிறிது குளிர்ந்த தண்ணீர் விட்டு பொங்கி வரும் வரை அரைக்கவும். அரிசியை சற்று கரகரப்பாக அரைக்கவும்.',
          'இரண்டையும் உப்புடன் கலந்து, மூடி 8 முதல் 12 மணி நேரம் புளிக்கவிடவும்.',
          'மெதுவாகக் கலக்கி, எண்ணெய் தடவிய இட்லித் தட்டில் ஊற்றி சுமார் 10–12 நிமிடம் ஆவியில் வேகவைக்கவும்.',
        ],
        note: 'குளிர் காலத்தில் மாவு புளிக்க அதிக நேரம் ஆகும்; சமையலறையில் சற்று வெதுவெதுப்பான இடத்தில் வைக்கவும்.',
      },
      {
        h2: 'ஹோட்டல்கள், கேட்டரிங், டிபன் சென்டர்களுக்கு',
        p: [
          'தினமும் மாவு அரைக்கும் சமையலறைகளுக்கு ஒவ்வொரு பையிலும் ஒரே மாதிரியான அரிசி தேவை. எங்கள் இட்லி அரிசி எங்கள் சொந்த ஆலையில் தரம் பிரித்து பேக் செய்யப்படுகிறது. தொடர்ந்து சப்ளை பெற மொத்த ஆர்டர் படிவத்தைப் பயன்படுத்துங்கள்.',
        ],
      },
    ],
    faqs: [
      { q: 'மிருதுவான இட்லிக்கு எந்த அரிசி சிறந்தது?', a: 'புழுங்கல் இட்லி அரிசி மென்மையாக அரைபட்டு, புளிக்கும்போது காற்றைத் தக்கவைப்பதால் மிருதுவான இட்லி கிடைக்கும். சென்னை ரைஸ் ஸ்பெஷல் இட்லி அரிசி இதற்காகவே தயாரிக்கப்படுகிறது.' },
      { q: 'இட்லி கெட்டியாக அல்லது தட்டையாக வருவது ஏன்?', a: 'பொதுவாக மாவு போதுமான அளவு புளிக்காதது, உளுந்து சரியாக அரைபடாதது அல்லது தண்ணீர் அதிகமானது காரணம். வெதுவெதுப்பான இடத்தில் புளிக்கவிட்டு, உளுந்தை பொங்கி வரும் வரை அரைக்கவும்.' },
      { q: 'ஸ்பெஷல் இட்லி அரிசி என்னென்ன அளவுகளில் கிடைக்கும்?', a: '5, 10, 26 கிலோ பைகளில் கிடைக்கும். ஹோட்டல்கள், கேட்டரிங் நிறுவனங்கள் மொத்த ஆர்டர் படிவம் மூலம் அதிக அளவில் ஆர்டர் செய்யலாம்.' },
    ],
    links: [
      { to: '/products/special-idly-rice', label: 'ஸ்பெஷல் இட்லி அரிசி வாங்க' },
      { to: '/ta/ponni-rice', label: 'பொன்னி அரிசி' },
      { to: '/bulk-order', label: 'மொத்த ஆர்டர்' },
    ],
  },
}

/** Landing pages by URL, for the router, the pre-rendered heads and the sitemap. */
export const LANDING_PAGES = [
  { path: '/ponni-rice', key: 'ponni', meta: 'ponni' },
  { path: '/idli-rice', key: 'idli', meta: 'idli' },
  { path: '/rice-distributorship', key: 'distributor', meta: 'distributor' },
  { path: '/ta', key: 'taHome', meta: 'taHome' },
  { path: '/ta/ponni-rice', key: 'taPonni', meta: 'taPonni' },
  { path: '/ta/idli-rice', key: 'taIdli', meta: 'taIdli' },
]
