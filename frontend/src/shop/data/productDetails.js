// Per-product content for the product detail page, keyed by PRODUCTS[].id.
//
// Nothing here states a fact that isn't already verified elsewhere in the
// project (FEATURES in shop/data/content.jsx, SOURCING_STEPS in
// data/infrastructure.js). Nutrition and cooking figures are not yet
// confirmed for any pack, so those fields are left null and the page shows
// a clearly labelled "coming soon" state instead of inventing numbers.

// Shown after each product's own pack shot in the PDP gallery — the same
// three story photos for every product (grain, field, cooked bowl), since
// they illustrate the shared journey rather than one specific pack.
export const GALLERY_EXTRAS = [
  { src: "/assets/shop/gallery/grain-macro.jpg", alt: "Close-up of polished rice grains", scene: true },
  { src: "/assets/about/hero-field.png", alt: "Green paddy fields where the rice is grown", scene: true },
  { src: "/assets/shop/gallery/rice-bowl-cooked.jpg", alt: "A warm bowl of cooked rice", scene: true },
];

/* `variant` is a presentation token — it picks the card's colour treatment,
   nothing more — so it cannot carry a claim about what is in the bag. Keying a
   variety label off it printed "Kolam Rice" on five product pages (Nayara,
   Vijaya Nagaram and both United packs among them), and none of the thirteen
   packs is Kolam; it likewise called Alibaba's Premium Sappadu "Rajabhogam".
   The variety now comes from the product's own tag, which is read off the pack
   artwork, and anything that does not name a variety falls back to plain
   "Rice" rather than guessing. */
const VARIETY_WORDS = /\b(ponni|sappadu|rajabhogam|kitchadi|kitchidi)\b/i;

// Mirrors SOURCING_STEPS in data/infrastructure.js — same facility, same
// verified copy, reused rather than re-described for the product page.
export const GRAIN_JOURNEY = [
  {
    num: "01",
    title: "Paddy Selection",
    text: "Paddy is sourced from growing regions known for the varieties Chennai Rice processes, chosen batch by batch before it ever reaches the mill.",
    image: "/assets/infrastructure/paddy-selection.png",
  },
  {
    num: "02",
    title: "Quality Inspection",
    text: "Incoming paddy is inspected on arrival, so only lots that meet our intake standard move forward into procurement.",
    image: "/assets/infrastructure/quality-inspection.png",
  },
  {
    num: "03",
    title: "Controlled Procurement",
    text: "Procurement is managed to keep varieties separate and traceable from the point of purchase through to storage.",
    image: "/assets/infrastructure/procurement.png",
  },
  {
    num: "04",
    title: "Transportation",
    text: "Paddy is moved to our facility under controlled handling, protecting grain condition before it enters storage and processing.",
    image: "/assets/infrastructure/transportation.png",
  },
  {
    num: "05",
    title: "Processing",
    text: "Grain moves through cleaning, husking and polishing at our facility before grading.",
    image: "/assets/infrastructure/facility-aerial.png",
  },
  {
    num: "06",
    title: "Quality Testing",
    text: "A quality check is carried out before the batch proceeds to packaging.",
    image: "/assets/infrastructure/paddy-macro.png",
  },
  {
    num: "07",
    title: "Packaging",
    text: "Finished rice is packed and prepared for dispatch.",
    image: "/assets/shop/pack-premium.png",
  },
  {
    num: "08",
    title: "Your Kitchen",
    text: "From our facility in Erode to family kitchens across Tamil Nadu.",
    image: "/assets/about/hero-field.png",
  },
];

// Nutrition, cooking ratios and per-product description bullets are not yet
// confirmed against pack labelling — left null/empty on purpose so the UI
// renders an honest placeholder instead of a guessed figure.
export const DETAILS_BY_ID = {
  default: {
    aboutBullets: [],
    nutrition: null, // { per: "100g", rows: [{ label, value }] }
    cooking: null, // { rinse, ratio, soak, cookTime, serve }
  },
};

export function getDetails(id) {
  return DETAILS_BY_ID[id] || DETAILS_BY_ID.default;
}

export function getCategoryLabel(product) {
  const tag = product?.tag?.trim();
  if (tag && VARIETY_WORDS.test(tag)) return tag;

  // Some packs carry the variety in the product name instead of the tag
  // ("Special Rajabhogam", "Kitchidi Ponni Rice"). Take just the variety word
  // from it — the full name would make the breadcrumb repeat itself.
  // Ponni is checked first because it is the varietal name, while Kitchidi and
  // Rajabhogam are grades of it — "Kitchidi Ponni Rice" should read as Ponni,
  // and a plain left-to-right match would have returned Kitchidi.
  const fromName =
    product?.name?.match(/\bponni\b/i)?.[0] ?? product?.name?.match(VARIETY_WORDS)?.[0];
  if (fromName) {
    return `${fromName[0].toUpperCase()}${fromName.slice(1).toLowerCase()} Rice`;
  }

  // Nothing on the pack names a variety, so nothing is claimed.
  return "Rice";
}
