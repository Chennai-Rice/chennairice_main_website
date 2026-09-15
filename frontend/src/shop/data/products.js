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
  { id: "kolam", label: "Kolam" },
];

// slug -> presentation metadata not carried by the `products` table.
const PRESENTATION = {
  "rajabhogam-premium": {
    variant: "premium",
    width: 456,
    height: 748,
    tags: ["premium", "ponni"],
    search: "special rajabhogam premium kitchidi ponni rice black gold aged",
    flag: "★ Premium",
  },
  "raja-bogam-ponni": {
    variant: "red",
    width: 515,
    height: 820,
    tags: ["ponni"],
    search: "raja bogam rajabhogam ponni rice classic red everyday family pack",
  },
  "vada-kolam": {
    variant: "gold",
    width: 490,
    height: 820,
    tags: ["kolam"],
    search: "vada kolam kitchidi ponni rice golden fine slender grains",
  },
  "akshaya-ponni": {
    variant: "orange",
    width: 492,
    height: 820,
    tags: ["ponni"],
    search: "akshaya ponni akashaya kitchidi ponni rice orange everyday",
  },
};

const FALLBACK_PRESENTATION = { variant: "red", width: 500, height: 800, tags: [], search: "" };


// ---------------------------------------------------------------------------
// Offline catalog.
//
// Supabase is not guaranteed to answer: a checkout (or a deploy) may carry no
// VITE_SUPABASE_* keys at all, the project may be paused, or the `products`
// table may simply be empty on a fresh database. In any of those cases the
// storefront used to render an error and zero cards, which is worse than
// showing the four packs we actually sell — they change rarely, and their
// photos ship in this repo either way (public/assets/shop/pack-*.png).
//
// So these four rows are a floor, never the source of truth: whenever Supabase
// does return products, its rows win and nothing below is used. The 10 kg
// prices are the figures the catalog was seeded from; 5 kg and 25 kg scale
// per-kg, exactly as the pre-Supabase catalog did.
// ---------------------------------------------------------------------------
const scalePrice = (price10kg, kg) => Math.round((price10kg / 10) * kg);

const withPackSizes = (price10kg) => [
  { kg: 5, price: scalePrice(price10kg, 5) },
  { kg: 10, price: price10kg },
  { kg: 25, price: scalePrice(price10kg, 25) },
];

const FALLBACK_PRODUCTS = [
  {
    slug: "rajabhogam-premium",
    tag: "Black & Gold",
    name: "Rajabhogam Premium",
    description: "Our finest pack — aged, hand-graded premium grains.",
    price: 995,
    image: "/assets/shop/pack-premium.png",
    alt: "Special Rajabhogam Kitchidi Ponni Rice in the premium black and gold 10 kg pack",
  },
  {
    slug: "raja-bogam-ponni",
    tag: "Classic Red",
    name: "Raja Bogam Ponni",
    description: "The everyday family pack — soft bite, clean aroma.",
    price: 795,
    image: "/assets/shop/pack-red.png",
    alt: "Raja Bogam Ponni rice in the classic red 10 kg pack",
  },
  {
    slug: "vada-kolam",
    tag: "Golden",
    name: "Vada Kolam",
    description: "Fine slender grains that cook light and fluffy.",
    price: 895,
    image: "/assets/shop/pack-gold.png",
    alt: "Vada Kolam rice in the golden 10 kg pack",
  },
  {
    slug: "akshaya-ponni",
    tag: "Orange",
    name: "Akshaya Ponni",
    description: "Full-bodied Ponni grains for generous everyday meals.",
    price: 845,
    image: "/assets/shop/pack-akshaya.png",
    alt: "Akshaya Ponni rice in the orange 10 kg pack",
  },
].map(({ slug, tag, name, description, price, image, alt }) => {
  const presentation = PRESENTATION[slug] || { ...FALLBACK_PRESENTATION };
  return {
    id: slug,
    variant: presentation.variant,
    tag,
    flag: presentation.flag,
    name,
    description,
    price,
    packSizes: withPackSizes(price),
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

/** Fetch the full active catalog, mapped to the shop's product shape. Also
 * derives LINEUP (the closing 3D-stage strip) from the same fetch so both
 * stay in sync with the live catalog automatically. */
export async function fetchProducts() {
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
