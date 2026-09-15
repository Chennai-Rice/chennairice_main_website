// STUB — no checkout UI exists in this app yet, so nothing here is wired up
// or called from anywhere today. This file exists so a future checkout flow
// has a service layer to build against without having to design the
// order-creation contract from scratch.
//
// Why these throw instead of querying Supabase directly: the `orders` /
// `order_items` tables only have `authenticated`-role SELECT policies today
// (checked against the live project) — there is no INSERT policy, so a
// browser client can never create an order directly, by design (order
// creation needs to validate stock, compute totals server-side, and likely
// coordinate with payments — that belongs behind a service-role edge
// function, not client-side RLS). Read paths (e.g. "my orders") are safe to
// implement for real once there's UI to call them; write paths are stubbed
// until that edge function exists.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

function notImplemented(name) {
  throw new Error(
    `orders.service.${name} is not yet implemented — no checkout UI exists yet. ` +
      'Order creation is expected to go through a future Supabase edge function ' +
      '(server-role, so it can validate stock/pricing and bypass RLS safely), not this ' +
      'browser client. This stub exists so a future checkout flow has a stable function ' +
      'to call.'
  )
}

/**
 * Create an order from cart items. NOT IMPLEMENTED — see file header.
 * @param {{ userId: string, cartId: string, shippingAddressId?: string, billingAddressId?: string }} _input
 * @returns {Promise<never>}
 */
export async function createOrder(_input) {
  return notImplemented('createOrder')
}

/**
 * List the signed-in user's orders. Real (non-stub) read path — RLS
 * (`orders_select`, authenticated-only) allows a signed-in user to read
 * their own orders once `customer_id` is populated by a real order-creation
 * flow. Safe to call once there is UI to show it; returns [] today because
 * no order-creation path exists yet to have populated any rows.
 * @param {string} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getMyOrders(userId) {
  if (!hasSupabase) {
    throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).')
  }
  if (!userId) throw new Error('getMyOrders requires a userId.')

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getMyOrders failed: ${error.message}`)
  return data ?? []
}

/**
 * Fetch one order by id, scoped to the signed-in user via RLS.
 * NOT IMPLEMENTED as a distinct call yet — kept as a stub for symmetry with
 * createOrder until a checkout/order-detail UI defines exactly what it needs.
 * @param {{ userId: string, orderId: string }} _input
 * @returns {Promise<never>}
 */
export async function getOrderById(_input) {
  return notImplemented('getOrderById')
}

/**
 * Cancel an order. NOT IMPLEMENTED — see file header (needs a server-role
 * edge function to safely validate cancellation rules and update inventory).
 * @param {{ userId: string, orderId: string }} _input
 * @returns {Promise<never>}
 */
export async function cancelOrder(_input) {
  return notImplemented('cancelOrder')
}
