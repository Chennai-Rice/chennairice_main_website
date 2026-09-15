// Supabase-backed cart functions for a FUTURE authenticated-cart sync path.
//
// The live cart today is src/shop/hooks/useCart.jsx — entirely
// localStorage-based, anonymous, and already wired into every cart UI
// component (CartButton, CartRow, CheckoutBar, CardQuantityControl,
// ProductDetailPage, CartPage, AddToCartButton, Navbar — checked by grep
// before writing this file). None of that is changed here. Nothing in this
// file is called from the app yet.
//
// IMPORTANT — current RLS shape (checked against the live project before
// writing this): `carts` and `cart_items` only have policies for the
// `authenticated` role, keyed off `carts.user_id = auth.uid()`. The
// `carts.session_token` column exists but there is no matching RLS policy
// for anonymous/session-token access today. That means:
//   - getOrCreateCart(userId) below works once a user is actually signed in
//     (see auth.service.js) — the anon client can read/write its own cart
//     under RLS.
//   - There is currently NO way for an anonymous visitor to read/write a
//     `carts` row via the browser client — only an authenticated user can.
// This is a decision the orchestrator / a later phase should know about: if
// anonymous server-side cart persistence is wanted, it needs either (a) a
// service-role edge function, or (b) a new RLS policy on session_token that
// doesn't yet exist. Not added here since it wasn't asked for and a wrong
// anonymous-access policy is worse than none.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

function assertSupabase() {
  if (!hasSupabase) {
    throw new Error(
      'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — ' +
        'see .env.local.example.'
    )
  }
}

/**
 * Fetch the signed-in user's active cart, creating one if it doesn't exist
 * yet. Requires an authenticated Supabase session (see auth.service.js) —
 * RLS rejects this for anonymous callers today (see file-level note above).
 *
 * @param {string} userId - auth.users id (e.g. from supabase.auth.getUser()).
 * @returns {Promise<{ id: string, user_id: string, status: string, created_at: string, updated_at: string }>}
 */
export async function getOrCreateCart(userId) {
  assertSupabase()
  if (!userId) throw new Error('getOrCreateCart requires a userId.')

  const { data: existing, error: findError } = await supabase
    .from('carts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (findError) throw new Error(`getOrCreateCart lookup failed: ${findError.message}`)
  if (existing) return existing

  const { data: created, error: createError } = await supabase
    .from('carts')
    .insert({ user_id: userId, status: 'active' })
    .select('*')
    .single()

  if (createError) throw new Error(`getOrCreateCart insert failed: ${createError.message}`)
  return created
}

/**
 * Push the anonymous localStorage cart (useCart.jsx's `items`) into the
 * signed-in user's Supabase cart — intended for the moment a visitor with an
 * existing local cart logs in. Matches local items to `product_variants` by
 * id: local cart line ids are either a bare productId or
 * "<productId>-<kg>kg" (see useCart.jsx / AddToCartButton), which do not
 * correspond 1:1 to `product_variants.id` (a uuid) yet — so `variantId` must
 * be resolved by the caller (e.g. via products.service.js) and passed
 * explicitly per line rather than guessed here.
 *
 * @param {string} userId
 * @param {Array<{ variantId: string, qty: number, price: number }>} localItems
 *   Pre-resolved lines: variantId is a product_variants.id, price is the
 *   unit price to snapshot as cart_items.unit_price.
 * @returns {Promise<{ id: string }>} the cart the items were synced into.
 */
export async function syncLocalCartToSupabase(userId, localItems) {
  assertSupabase()
  if (!userId) throw new Error('syncLocalCartToSupabase requires a userId.')
  if (!Array.isArray(localItems) || localItems.length === 0) {
    return getOrCreateCart(userId)
  }

  const cart = await getOrCreateCart(userId)

  const { data: existingLines, error: linesError } = await supabase
    .from('cart_items')
    .select('id, product_variant_id, quantity')
    .eq('cart_id', cart.id)

  if (linesError) throw new Error(`syncLocalCartToSupabase read failed: ${linesError.message}`)

  const existingByVariant = new Map((existingLines ?? []).map((line) => [line.product_variant_id, line]))

  for (const item of localItems) {
    if (!item?.variantId || !item?.qty || item.qty < 1) continue

    const existingLine = existingByVariant.get(item.variantId)
    if (existingLine) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: existingLine.quantity + item.qty })
        .eq('id', existingLine.id)
      if (error) throw new Error(`syncLocalCartToSupabase update failed: ${error.message}`)
    } else {
      const { error } = await supabase.from('cart_items').insert({
        cart_id: cart.id,
        product_variant_id: item.variantId,
        quantity: item.qty,
        unit_price: item.price,
      })
      if (error) throw new Error(`syncLocalCartToSupabase insert failed: ${error.message}`)
    }
  }

  return cart
}
