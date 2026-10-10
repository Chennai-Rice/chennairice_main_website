// Product catalog — now backed by Supabase (`products` + `product_variants`,
// via src/services/products.service.js) instead of a hand-written array.
//
// Consumers call the `useProducts()` hook (or `fetchProducts()` directly,
// e.g. in a route loader) instead of importing a static PRODUCTS array. The
// shape returned per product is unchanged from the old static data, so every
// existing component (ProductCard, PackSizeSelector, ProductGallery, the
// cart/wishlist stores, etc.) keeps working without touching JSX or CSS.
//
// A few presentational facts have no home in the `products` table because
// they aren't catalog data at all — they're facts about the *static assets*
// and *filter UI* this specific storefront ships with (the pack photo's
// pixel dimensions, which filter chip a card should match, the little
// "★ Premium" flag, the free-text search haystack). Those stay in
// PRESENTATION below, keyed by the DB row's `slug` (== the old hand-written
// `id`), and are merged onto every live-fetched row. Everything that IS
// catalog data — name, description, pricing, which pack sizes exist —
// comes from Supabase and is never hand-maintained here again.
import { useEffect, useState } from "react";
import { getProducts, getProductBySlug } from "../../services/products.service.js";
import { hasSupabase } from "../../lib/supabaseClient.js";

export const FILTERS = [
  { id: "all", label: "All packs" },
  { id: "premium", label: "Premium" },
  { id: "ponni", label: "Ponni" },
  { id: "bulk", label: "Bulk packs" },
];

// slug -> presentation metadata not carried by the `products` table.
const PRESENTATION = {
  "kitchidi-ponni-rice": {
    variant: "red",
    width: 600,
    height: 843,
    tags: ["ponni", "premium"],
    search: "kitchidi ponni rice chennai rice premium pack 1 year aged 5kg 26kg ponni premium offer",
    flag: "★ Offer",
  },
  "special-rajabhogam": {
    variant: "red",
    width: 592,
    height: 839,
    tags: ["ponni"],
    search: "special rajabhogam classic red kitchidi ponni 10kg ponni",
  },
  "nayara-super-aged": {
    variant: "gold",
    width: 429,
    height: 638,
    tags: [],
    search: "nayara super aged super aged gel cook rice 10kg",
  },
  "vijaya-nagaram": {
    variant: "gold",
    width: 433,
    height: 627,
    tags: ["ponni"],
    search: "vijaya nagaram amman ponni hmt ponni 5kg ponni",
  },
  "vintage": {
    variant: "premium",
    width: 429,
    height: 650,
    tags: ["premium"],
    search: "vintage black & gold ponni 10kg premium",
    flag: "★ Premium",
  },
  "viruchagam": {
    variant: "premium",
    width: 432,
    height: 646,
    tags: ["ponni"],
    search: "viruchagam poompuhar ponni snr rnr poompuhar ponni 10kg ponni",
  },
  "united-5kg": {
    variant: "gold",
    width: 428,
    height: 650,
    tags: ["ponni"],
    search: "united green pack ponni 5kg ponni",
  },
  "alibaba": {
    variant: "premium",
    width: 456,
    height: 701,
    tags: ["premium"],
    search: "alibaba premium sappadu sappadu rice 10kg premium",
    flag: "★ Premium",
  },
  "chennai-bullets": {
    variant: "premium",
    width: 488,
    height: 624,
    tags: ["ponni","bulk"],
    search: "chennai bullets rajabhogam ponni rnr kodad bapatla knm 5kg 10kg 26kg ponni bulk",
  },
  "a1-special-ponni": {
    variant: "orange",
    width: 592,
    height: 843,
    tags: ["ponni"],
    search: "a1 special ponni no.1 ponni ponni 5kg ponni",
  },
  "rudra": {
    variant: "premium",
    width: 587,
    height: 838,
    tags: ["ponni","bulk"],
    search: "rudra rajabhogam ponni rajabhogam ponni 25kg ponni bulk",
  },
  "thaaram": {
    variant: "gold",
    width: 572,
    height: 808,
    tags: ["ponni","bulk"],
    search: "thaaram nei kitchadi akshaya ponni akshaya ponni 25kg ponni bulk",
  },
  "special-idly-rice": {
    variant: "red",
    width: 600,
    height: 924,
    tags: [],
    search: "special idly rice idli dosa pink pack kalli muthan kar 5kg offer",
    flag: "★ Offer",
  },
};

const FALLBACK_PRESENTATION = { variant: "red", width: 500, height: 800, tags: [], search: "" };


// ---------------------------------------------------------------------------
// Offline catalog.
//
// Supabase is not guaranteed to answer: a deploy may carry no VITE_SUPABASE_*
// keys at all, the project may be paused, or the `products` table may be empty
// on a fresh database. In any of those cases the storefront would otherwise
// render an error and zero cards, which is worse than showing the range we
// actually sell — the pack photos ship in this repo either way.
//
// These rows are a floor, never the source of truth: whenever Supabase returns
// products, its rows win and nothing below is used.
//
// There are no prices here, and price 0 is deliberate rather than missing. The
// supplied artwork carries no pricing, and inventing a figure on a live
// storefront would be worse than showing none — the cards say "Price on
// request" instead (see showCardPrices in src/config.js). Fill these in, and
// the matching product_variants rows, once real prices are confirmed.
// ---------------------------------------------------------------------------
const FALLBACK_PRODUCTS = [
  {
    slug: "kitchidi-ponni-rice",
    tag: "1 Year Aged",
    name: "Kitchidi Ponni Rice",
    description: "Kitchidi Ponni, aged for a year, in our Chennai Rice premium pack. From Mother's Hands to Your Heart.",
    packKg: 5,
    image: "/assets/shop/packs/kitchidi-ponni-rice.png",
    alt: "Chennai Rice Kitchidi Ponni Rice — premium pack, 1 year aged",
  },
  {
    slug: "special-rajabhogam",
    tag: "Classic Red",
    name: "Special Rajabhogam",
    description: "Kitchidi Ponni rice in our signature red pack, milled and sealed at Erode.",
    packKg: 10,
    image: "/assets/shop/packs/special-rajabhogam.png",
    alt: "Special Rajabhogam — Kitchidi Ponni, 10 kg pack",
  },
  {
    slug: "nayara-super-aged",
    tag: "Super Aged",
    name: "Nayara Super Aged",
    description: "Super-aged gel cook rice that stays separate and firm on the plate.",
    packKg: 10,
    image: "/assets/shop/packs/nayara-super-aged.png",
    alt: "Nayara Super Aged — Gel cook rice, 10 kg pack",
  },
  {
    slug: "vijaya-nagaram",
    tag: "Amman Ponni",
    name: "Vijaya Nagaram",
    description: "Amman Ponni — HMT Ponni grain, milled for everyday South Indian meals.",
    packKg: 5,
    image: "/assets/shop/packs/vijaya-nagaram.png",
    alt: "Vijaya Nagaram — HMT Ponni, 5 kg pack",
  },
  {
    slug: "vintage",
    tag: "Black & Gold",
    name: "Vintage",
    description: "Our black-and-gold selection, milled and sealed at the Erode facility.",
    packKg: 10,
    image: "/assets/shop/packs/vintage.png",
    alt: "Vintage — Ponni, 10 kg pack",
  },
  {
    slug: "viruchagam",
    tag: "Poompuhar Ponni",
    name: "Viruchagam",
    description: "Poompuhar Ponni in the blue and gold pack, from SNR RNR paddy.",
    packKg: 10,
    image: "/assets/shop/packs/viruchagam.png",
    alt: "Viruchagam — SNR RNR Poompuhar Ponni, 10 kg pack",
  },
  {
    slug: "united-5kg",
    tag: "Green Pack",
    name: "United",
    description: "The everyday United pack, in a 5 kg family size.",
    packKg: 5,
    image: "/assets/shop/packs/united-5kg.png",
    alt: "United — Ponni, 5 kg pack",
  },
  {
    slug: "alibaba",
    tag: "Premium Sappadu",
    name: "Alibaba",
    description: "Premium Sappadu rice — 100% pure original quality, for full-flavoured meals.",
    packKg: 10,
    image: "/assets/shop/packs/alibaba.png",
    alt: "Alibaba — Sappadu rice, 10 kg pack",
  },
  {
    slug: "chennai-bullets",
    tag: "Rajabhogam Ponni",
    name: "Chennai Bullets",
    description: "Rajabhogam Ponni with a rich aroma, in our largest 26 kg trade pack.",
    packKg: 26,
    image: "/assets/shop/packs/chennai-bullets.png",
    alt: "Chennai Bullets — Rajabhogam Ponni, 26 kg pack",
  },
  {
    slug: "a1-special-ponni",
    tag: "No.1 Ponni",
    name: "A1 Special Ponni",
    description: "Special Ponni rice, quality graded and packed at our Erode facility.",
    packKg: 5,
    image: "/assets/shop/packs/a1-special-ponni.png",
    alt: "A1 Special Ponni — Ponni, 5 kg pack",
  },
  {
    slug: "rudra",
    tag: "Rajabhogam Ponni",
    name: "Rudra",
    description: "Rajabhogam Ponni rice — original taste and rich aroma, in a 25 kg pack.",
    packKg: 25,
    image: "/assets/shop/packs/rudra.png",
    alt: "Rudra — Rajabhogam Ponni, 25 kg pack",
  },
  {
    slug: "thaaram",
    tag: "Akshaya Ponni",
    name: "Thaaram Nei Kitchadi",
    description: "Akshaya Ponni for nei kitchadi — strong grain, superior taste, rich aroma.",
    packKg: 25,
    image: "/assets/shop/packs/thaaram.png",
    alt: "Thaaram Nei Kitchadi — Akshaya Ponni, 25 kg pack",
  },
  {
    slug: "special-idly-rice",
    tag: "Idly Rice",
    name: "Special Idly Rice",
    description: "Idly rice in our pink pack, for soft, fluffy idlis and crisp dosas.",
    packKg: 5,
    image: "/assets/shop/packs/special-idly-rice.png",
    alt: "Chennai Rice Special Idly Rice — pink pack",
  },
].map(({ slug, tag, name, description, packKg, image, alt }) => {
  const presentation = PRESENTATION[slug] || { ...FALLBACK_PRESENTATION };
  return {
    id: slug,
    variant: presentation.variant,
    tag,
    flag: presentation.flag,
    name,
    description,
    price: 0,
    packSizes: [{ kg: packKg, price: 0 }],
    image,
    alt,
    width: presentation.width,
    height: presentation.height,
    tags: presentation.tags,
    search: presentation.search,
  };
});

const FALLBACK_IMAGES = Object.fromEntries(FALLBACK_PRODUCTS.map((p) => [p.id, p.image]));

/** LINEUP rows (the closing 3D-stage strip) derived from a mapped product list. */
function toLineup(products) {
  return products.map((p) => ({
    id: p.id,
    image: p.image,
    alt: `${p.name} pack`,
    width: p.width,
    height: p.height,
  }));
}

// `short_description` was seeded as "<tag> — <flag>" or just "<tag>" (see the
// commerce product seed) — split it back into the two display fields the UI
// expects: a short tag chip ("Classic Red") and an optional flag badge
// ("★ Premium").
function splitShortDescription(shortDescription) {
  if (!shortDescription) return { tag: "", flag: undefined };
  const [tag, flag] = shortDescription.split(" — ");
  return { tag: tag?.trim() || "", flag: flag?.trim() || undefined };
}

function mapVariants(variants) {
  return (variants || [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({ kg: Number(v.pack_size_kg), price: Number(v.price) }))
    .sort((a, b) => a.kg - b.kg);
}

/** Map one Supabase `products` row (with `product_variants` joined) to the
 * shape every shop component already expects. */
function mapProduct(row) {
  const presentation = PRESENTATION[row.slug] || { ...FALLBACK_PRESENTATION };
  const { tag, flag } = splitShortDescription(row.short_description);
  const packSizes = mapVariants(row.product_variants);
  const tenKg = packSizes.find((s) => s.kg === 10) || packSizes[0];

  return {
    id: row.slug,
    variant: presentation.variant,
    tag,
    flag,
    name: row.name,
    description: row.description || "",
    price: tenKg ? tenKg.price : 0,
    packSizes,
    // A row with no image_url still gets its pack photo — the file ships in
    // this repo, so a blank card is never the right answer.
    image: row.image_url || FALLBACK_IMAGES[row.slug] || null,
    alt: row.name,
    width: presentation.width,
    height: presentation.height,
    tags: presentation.tags,
    search: presentation.search,
  };
}

// The sales backend's catalog (/api/catalog, PostgreSQL). It is the same
// database checkout charges from, so the price on the card is the price paid.
// Where that backend is not running (it answers 404 until a database is
// configured), this returns null and Supabase / the bundled packs are used.
async function fetchSalesCatalog() {
  try {
    const res = await fetch("/api/catalog", { headers: { Accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    const { products } = await res.json();
    if (!Array.isArray(products) || !products.length) return null;
    return products.map((row) => {
      const presentation = PRESENTATION[row.slug] || { ...FALLBACK_PRESENTATION };
      const fallback = FALLBACK_PRODUCTS.find((p) => p.id === row.slug);
      const packSizes = row.variants
        // An unpriced pack cannot be ordered, so it is out of stock as far as
        // the shop is concerned.
        // No price stays null (not 0), so the card says "Out of stock" instead of "₹0".
        .map((v) => ({ kg: Number(v.packKg), price: v.price == null ? null : Number(v.price), inStock: v.price != null && v.inStock }))
        .sort((a, b) => a.kg - b.kg);
      const tenKg = packSizes.find((s) => s.kg === 10) || packSizes[0];
      return {
        id: row.slug,
        variant: presentation.variant,
        tag: row.tag || fallback?.tag || "",
        flag: presentation.flag,
        name: row.name,
        description: row.description || "",
        price: tenKg ? tenKg.price : 0,
        packSizes,
        image: row.image || FALLBACK_IMAGES[row.slug] || null,
        alt: fallback?.alt || row.name,
        width: presentation.width,
        height: presentation.height,
        tags: presentation.tags,
        search: presentation.search,
        inStock: packSizes.some((s) => s.inStock),
      };
    })
      // Stable sort: packs that can be bought first, catalog order otherwise.
      .sort((a, b) => Number(b.inStock) - Number(a.inStock));
  } catch {
    return null;
  }
}

/** Fetch the full active catalog, mapped to the shop's product shape. Also
 * derives LINEUP (the closing 3D-stage strip) from the same fetch so both
 * stay in sync with the live catalog automatically. */
export async function fetchProducts() {
  const sales = await fetchSalesCatalog();
  if (sales) return { products: sales, lineup: toLineup(sales) };
  if (hasSupabase) {
    try {
      const rows = await getProducts({ isActive: true });
      const products = rows.map(mapProduct);
      // An empty table reads as an outage, not as "we sell nothing".
      if (products.length) return { products, lineup: toLineup(products) };
    } catch (error) {
      console.warn("[products] Supabase catalog unavailable — showing the bundled packs.", error);
    }
  }
  return { products: FALLBACK_PRODUCTS, lineup: toLineup(FALLBACK_PRODUCTS) };
}

/** Fetch one product by its slug (the old static `id`). Returns null if not
 * found or inactive. */
export async function fetchProductBySlug(slug) {
  const sales = await fetchSalesCatalog();
  if (sales) return sales.find((p) => p.id === slug) || null;
  if (hasSupabase) {
    try {
      const row = await getProductBySlug(slug);
      if (row) return mapProduct(row);
    } catch (error) {
      console.warn(`[products] Supabase lookup for "${slug}" failed — showing the bundled pack.`, error);
    }
  }
  return FALLBACK_PRODUCTS.find((p) => p.id === slug) || null;
}

/**
 * React hook wrapping fetchProducts(). Components that used to do
 * `import { PRODUCTS } from "../data/products.js"` now do
 * `const { products, lineup, loading, error } = useProducts();` instead.
 *
 * Kept deliberately simple (no cache/react-query) — this is a small, mostly
 * static catalog (4 products) fetched once per page visit.
 */
export function useProducts() {
  const [state, setState] = useState({ products: [], lineup: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchProducts()
      .then(({ products, lineup }) => {
        if (!cancelled) setState({ products, lineup, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ products: [], lineup: [], loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * React hook for a single product by slug (product detail page).
 * `loading` starts true whenever `slug` is set, false immediately when it
 * isn't (nothing to fetch).
 */
export function useProduct(slug) {
  const [state, setState] = useState({ product: null, loading: Boolean(slug), error: null });

  useEffect(() => {
    if (!slug) {
      setState({ product: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ product: null, loading: true, error: null });
    fetchProductBySlug(slug)
      .then((product) => {
        if (!cancelled) setState({ product, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ product: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
