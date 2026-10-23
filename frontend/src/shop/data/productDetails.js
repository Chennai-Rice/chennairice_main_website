// Per-product content for the product detail page, keyed by PRODUCTS[].id.
//
// Nothing here states a fact that isn't already verified elsewhere in the
// project (FEATURES in shop/data/content.jsx, SOURCING_STEPS in
// data/infrastructure.js). Nutrition and cooking figures are not yet
// confirmed for any pack, so those fields are left null and the page shows
// a clearly labelled "coming soon" state instead of inventing numbers.


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
// The journey shown on every product page (order set by the owner, Oct 2026).
export const GRAIN_JOURNEY = [
  { num: "01", title: "Paddy Selection", text: "Paddy is chosen batch by batch from growing regions known for the varieties we mill.", image: "/assets/infrastructure/paddy-selection.webp" },
  { num: "02", title: "Procurement", text: "Each lot is bought and recorded so varieties stay separate and traceable from purchase onwards.", image: "/assets/infrastructure/procurement.webp" },
  { num: "03", title: "Quality Testing", text: "Moisture, purity and grain condition are tested on arrival; only lots that pass move forward.", image: "/assets/infrastructure/quality-inspection.webp" },
  { num: "04", title: "Storage", text: "Paddy rests in our silos under monitored, temperature-controlled conditions until it is milled.", image: "/assets/about/silos.webp" },
  { num: "05", title: "Parboiled", text: "Paddy is soaked, steamed and dried so the grain stays firm, cooks separate and keeps its goodness.", image: "/assets/infrastructure/paddy-macro.webp" },
  { num: "06", title: "Milling", text: "Cleaning, husking, polishing, grading and colour sorting on our milling line at Erode.", image: "/assets/about/factory.webp" },
  { num: "07", title: "Packing", text: "Finished rice is checked once more, then packed and sealed in our bags for dispatch.", image: "/assets/shop/pack-premium.webp" },
  { num: "08", title: "Customer", text: "From our mill in Erode to family kitchens and tables across Tamil Nadu.", image: "/assets/about/food.jpg" },
];

// Nutrition, cooking ratios and per-product description bullets are not yet
// confirmed against pack labelling — left null/empty on purpose so the UI
// renders an honest placeholder instead of a guessed figure.
export const DETAILS_BY_ID = {
  default: {
    aboutBullets: [],
    nutrition: null, // { per: "100g", rows: [{ label, value }] }
    // From the Chennai Rice "Cooking Tips" card (Oct 2026).
    cooking: {
      prep: "Rinse the rice thoroughly and soak in slightly warm water for 60 minutes.",
      openPan: ["5 cups of water for 1 cup of rice."],
      closedPan: [
        "Add 3 cups of water for 1 cup of rice.",
        "At a hill station, add 2.5 cups of water.",
        "Add 1 tbsp of butter, olive oil or margarine, and salt to taste.",
      ],
      note: "The rice may need slightly more or less water depending on the water where you cook.",
    },
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
