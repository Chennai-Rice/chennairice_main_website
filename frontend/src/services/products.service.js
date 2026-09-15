// Read-only product catalog queries against Supabase, using the public
// browser client (src/lib/supabaseClient.js — anon key only). These rely on
// the public-read RLS policies already in place on `products`,
// `product_variants` and `categories` (SELECT allowed to anon/authenticated
// where is_active = true).
//
// This is the catalog service the shop pages now run on: src/shop/data/products.js
// wraps getProducts()/getProductBySlug() below in a small `useProducts()` /
// `useProduct()` React hook pair and maps each row to the shape the existing
// shop components (ProductCard, PackSizeSelector, etc.) already expect.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

/** @typedef {{ id: string, product_id: string, pack_size_kg: number, sku: string|null, price: number, mrp: number|null, discount_price: number|null, stock_quantity: number, low_stock_threshold: number|null, weight: number|null, is_active: boolean, created_at: string, updated_at: string }} ProductVariant */
/** @typedef {{ id: string, name: string, slug: string, description: string|null, short_description: string|null, variety: string|null, category_id: string|null, origin: string|null, grade: string|null, cooking_type: string|null, image_url: string|null, gallery: unknown, nutritional_info: unknown, features: unknown, is_active: boolean, is_featured: boolean, display_order: number, created_at: string, updated_at: string, product_variants?: ProductVariant[] }} Product */

function assertSupabase() {
  if (!hasSupabase) {
    throw new Error(
      'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — ' +
        'see .env.local.example.'
    )
  }
}

/**
 * List active products, optionally filtered.
 *
 * @param {{ category?: string, search?: string, isActive?: boolean }} [opts]
 *   category — a categories.slug to filter by.
 *   search — matched against product name/short_description (ILIKE).
 *   isActive — defaults to true (public storefront view); pass false/undefined
 *     explicitly only from admin-style callers that are allowed to see
 *     inactive rows (RLS still enforces this server-side regardless).
 * @returns {Promise<Product[]>}
 */
export async function getProducts({ category, search, isActive = true } = {}) {
  assertSupabase()

  let query = supabase
    .from('products')
    .select('*, product_variants(*)')
    .order('display_order', { ascending: true })

  if (isActive !== undefined) query = query.eq('is_active', isActive)
  if (search) query = query.ilike('name', `%${search}%`)

  if (category) {
    const { data: cat, error: catError } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', category)
      .maybeSingle()
    if (catError) throw new Error(`Could not resolve category "${category}": ${catError.message}`)
    if (!cat) return []
    query = query.eq('category_id', cat.id)
  }

  const { data, error } = await query
  if (error) throw new Error(`getProducts failed: ${error.message}`)
  return data ?? []
}

/**
 * One product by slug, with its variants joined.
 * @param {string} slug
 * @returns {Promise<Product | null>}
 */
export async function getProductBySlug(slug) {
  assertSupabase()
  if (!slug) throw new Error('getProductBySlug requires a slug.')

  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`getProductBySlug("${slug}") failed: ${error.message}`)
  return data ?? null
}

/**
 * Active, featured products (is_featured = true), for homepage-style rails.
 * @returns {Promise<Product[]>}
 */
export async function getFeaturedProducts() {
  assertSupabase()

  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('display_order', { ascending: true })

  if (error) throw new Error(`getFeaturedProducts failed: ${error.message}`)
  return data ?? []
}
