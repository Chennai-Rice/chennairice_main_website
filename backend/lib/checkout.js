// Guest checkout — order creation and payment confirmation.
//
// Shared by the Vercel functions (api/checkout/*.js) and the local dev proxy
// (backend/server/index.js), the same arrangement as lib/enquiries.js.
//
// Two rules this file exists to enforce:
//
//   1. The browser never sets a price. A cart posted from localStorage is
//      treated purely as "which pack, how many" — every rupee is looked up
//      again from `product_variants` here. A customer editing localStorage can
//      change what they are buying, never what it costs.
//
//   2. The browser never picks the gateway or the reference its payment is
//      checked against. Which gateway minted the session, and under what id, is
//      written to a pending `payments` row at session time and read back from
//      there at confirmation. The browser only reports what its widget said.
//
// Gateway selection and failover live in lib/gateways.js — Razorpay first,
// Zoho Payments as the fallback, reorderable via PAYMENT_GATEWAY_PRIORITY.
//
// Guest checkout, so `orders.customer_id` stays null. The buyer's contact
// details and delivery address cannot go in `addresses` (that table requires a
// user_id, i.e. a real auth.users row), so they are stored as JSON in
// `orders.notes` under the GUEST_NOTE_PREFIX below. When a login flow arrives,
// those become real address rows and this shim can go.
import crypto from 'node:crypto'
import { hasSupabase, supabase } from './supabase.js'
import { createSessionWithFailover, getGateway, hasAnyGateway } from './gateways.js'

export { hasAnyGateway }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+()\-\s\d]{8,16}$/
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/
const MAX_QTY_PER_LINE = 50
const MAX_LINES = 20

// How long a pending order may be resumed for. Past this it is stale enough
// that the customer has almost certainly moved on, and reusing it would attach
// a payment to an order they no longer remember placing.
const RESUME_WINDOW_MS = 60 * 60 * 1000

export const GUEST_NOTE_PREFIX = 'guest_checkout:'

// A cart line id is the product slug, optionally suffixed with the pack size:
// product cards add "rajabhogam-premium" (always the 10 kg price), while the
// detail page adds "rajabhogam-premium-10kg" for the size the buyer picked.
// Both forms have to resolve to the same variant.
const PACK_SUFFIX = /-(\d+)kg$/i
const DEFAULT_PACK_KG = 10

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function checkoutError(message, { status = 400, publicMessage } = {}) {
  const err = new Error(message)
  err.status = status
  err.publicMessage = publicMessage || message
  return err
}

function assertSupabase() {
  if (!hasSupabase) {
    throw checkoutError(
      'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing) — see backend/server/.env.example.',
      { status: 503, publicMessage: 'Ordering is temporarily unavailable. Please try again shortly.' }
    )
  }
}

/** Split a cart line id into the catalog slug and the pack size it refers to. */
export function parseCartLineId(id) {
  const raw = str(id)
  const match = raw.match(PACK_SUFFIX)
  if (!match) return { slug: raw, packKg: DEFAULT_PACK_KG }
  return { slug: raw.slice(0, match.index), packKg: Number(match[1]) }
}

/**
 * Validate the buyer's details. Guest checkout, so this is the only identity we
 * will ever have for the order — it has to be enough to actually deliver.
 * Returns { customer } or { error } with a client-safe message.
 */
export function buildGuestCustomer(body) {
  const name = str(body?.name)
  const email = str(body?.email)
  const phone = str(body?.phone)
  const addressLine1 = str(body?.addressLine1)
  const addressLine2 = str(body?.addressLine2)
  const city = str(body?.city)
  const state = str(body?.state)
  const pincode = str(body?.pincode)
  const landmark = str(body?.landmark)

  if (!name) return { error: 'Please tell us your name.' }
  if (!email || !EMAIL_PATTERN.test(email)) return { error: 'A valid email address is required.' }
  if (!phone || !PHONE_PATTERN.test(phone)) return { error: 'A valid phone number is required.' }
  if (!addressLine1) return { error: 'Please add your delivery address.' }
  if (!city) return { error: 'Please add your city or town.' }
  if (!state) return { error: 'Please add your state.' }
  if (!pincode || !PINCODE_PATTERN.test(pincode)) return { error: 'A valid 6-digit PIN code is required.' }

  return {
    customer: { name, email, phone, addressLine1, addressLine2, city, state, pincode, landmark },
  }
}

/** Read the guest block back out of orders.notes. */
function readGuestNote(notes) {
  const raw = String(notes || '')
  if (!raw.startsWith(GUEST_NOTE_PREFIX)) return null
  try {
    return JSON.parse(raw.slice(GUEST_NOTE_PREFIX.length))
  } catch {
    return null
  }
}

/**
 * Price a posted cart against the live catalog.
 *
 * Everything the browser sent about money is discarded. Each line is matched to
 * an active product + active variant; anything unmatched, inactive or out of
 * stock fails the whole checkout rather than silently dropping a line, so a
 * customer never pays for a basket that differs from the one they reviewed.
 *
 * @returns {Promise<{ lines: Array<object>, subtotal: number }>}
 */
export async function priceCart(items) {
  assertSupabase()

  if (!Array.isArray(items) || items.length === 0) {
    throw checkoutError('Your cart is empty.')
  }
  if (items.length > MAX_LINES) {
    throw checkoutError('That is more different packs than we can take in one order.')
  }

  // Collapse duplicate lines first: two entries for the same variant should buy
  // one line of two, not two lines that each pass the per-line cap.
  const wanted = new Map()
  for (const item of items) {
    const { slug, packKg } = parseCartLineId(item?.id)
    const qty = Math.floor(Number(item?.qty))
    if (!slug) throw checkoutError('One of the items in your cart is not recognised.')
    if (!Number.isFinite(qty) || qty < 1) throw checkoutError('Every item needs a quantity of at least 1.')
    if (!Number.isFinite(packKg) || packKg < 1) throw checkoutError('One of the items has an unrecognised pack size.')

    const key = slug + '-' + packKg
    const existing = wanted.get(key)
    const total = (existing ? existing.qty : 0) + qty
    if (total > MAX_QTY_PER_LINE) {
      throw checkoutError(
        'Please order at most ' + MAX_QTY_PER_LINE + ' of any one pack. For larger volumes, use our bulk order form.'
      )
    }
    wanted.set(key, { slug, packKg, qty: total })
  }

  const slugs = [...new Set([...wanted.values()].map((w) => w.slug))]
  const { data: products, error } = await supabase
    .from('products')
    .select('id, slug, name, is_active, product_variants(id, pack_size_kg, price, is_active, stock_quantity)')
    .in('slug', slugs)

  if (error) {
    throw checkoutError('Could not load the catalog: ' + error.message, {
      status: 502,
      publicMessage: 'We could not price your order just now. Please try again.',
    })
  }

  const bySlug = new Map((products || []).map((p) => [p.slug, p]))
  const lines = []
  let subtotal = 0

  for (const { slug, packKg, qty } of wanted.values()) {
    const product = bySlug.get(slug)
    if (!product || product.is_active === false) {
      throw checkoutError('"' + slug + '" is no longer available. Please remove it from your cart.')
    }

    const variant = (product.product_variants || []).find(
      (v) => Number(v.pack_size_kg) === packKg && v.is_active !== false
    )
    if (!variant) {
      throw checkoutError('The ' + packKg + ' kg pack of ' + product.name + ' is no longer available.')
    }
    if (Number(variant.stock_quantity) < qty) {
      throw checkoutError('We only have ' + variant.stock_quantity + ' of the ' + packKg + ' kg ' + product.name + ' left.')
    }

    // The authoritative price, from the catalog — not from the browser.
    const unitPrice = Number(variant.price)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw checkoutError('We could not price ' + product.name + '. Please try again.', {
        status: 502,
        publicMessage: 'We could not price your order just now. Please try again.',
      })
    }

    const totalPrice = Number((unitPrice * qty).toFixed(2))
    subtotal += totalPrice
    lines.push({
      product_variant_id: variant.id,
      product_name_snapshot: product.name,
      pack_size_snapshot: packKg + ' kg',
      quantity: qty,
      unit_price: unitPrice,
      discount: 0,
      tax: 0,
      total_price: totalPrice,
    })
  }

  return { lines, subtotal: Number(subtotal.toFixed(2)) }
}

/** Human-readable, non-guessable order reference (CR-20260911-4F2A). */
function makeOrderNumber() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return 'CR-' + today + '-' + crypto.randomBytes(2).toString('hex').toUpperCase()
}

/** Create the order header and its items, rolling back the header if the
 *  items fail — an order with no contents looks like a real charge for
 *  nothing. */
async function insertOrder({ customer, lines, subtotal }) {
  // Free delivery, prices treated as final/GST-inclusive — so the total is
  // simply the sum of the lines. Give tax or shipping a real rule here and
  // total_amount is the only thing that has to change.
  const discount = 0
  const tax = 0
  const shippingFee = 0
  const totalAmount = Number((subtotal - discount + tax + shippingFee).toFixed(2))
  const orderNumber = makeOrderNumber()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      customer_id: null,
      subtotal,
      discount,
      tax,
      shipping_fee: shippingFee,
      total_amount: totalAmount,
      payment_status: 'pending',
      order_status: 'pending',
      fulfillment_status: 'unfulfilled',
      notes: GUEST_NOTE_PREFIX + JSON.stringify(customer),
    })
    .select()
    .single()

  if (orderError) {
    throw checkoutError('Could not create order: ' + orderError.message, {
      status: 502,
      publicMessage: 'We could not start your order. Please try again.',
    })
  }

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(lines.map((line) => ({ ...line, order_id: order.id })))

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    throw checkoutError('Could not save order items: ' + itemsError.message, {
      status: 502,
      publicMessage: 'We could not start your order. Please try again.',
    })
  }

  return order
}

/**
 * Load a pending order the customer is resuming, verifying they are the one who
 * placed it. Without a login the guest email is the only thing tying a person
 * to an order, so it has to match — otherwise anyone with an order id could
 * read back someone else's total and address.
 */
async function loadResumableOrder({ orderId, email }) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (error) {
    throw checkoutError('Could not load order: ' + error.message, {
      status: 502,
      publicMessage: 'We could not resume your order. Please try again.',
    })
  }
  if (!order) throw checkoutError('That order does not exist.', { status: 404 })
  if (order.payment_status === 'paid') {
    throw checkoutError('That order has already been paid.', {
      status: 409,
      publicMessage: 'That order is already paid — no need to pay again.',
    })
  }
  if (order.payment_status !== 'pending' && order.payment_status !== 'failed') {
    throw checkoutError('Order ' + order.order_number + ' is ' + order.payment_status + ' and cannot be resumed.', {
      status: 409,
      publicMessage: 'That order can no longer be paid. Please start a new one.',
    })
  }
  if (Date.now() - new Date(order.created_at).getTime() > RESUME_WINDOW_MS) {
    throw checkoutError('Order ' + order.order_number + ' is too old to resume.', {
      status: 410,
      publicMessage: 'That order has expired. Please place it again.',
    })
  }

  const guest = readGuestNote(order.notes)
  if (!guest || !email || guest.email.toLowerCase() !== email.toLowerCase()) {
    throw checkoutError('Email does not match order ' + order.order_number, {
      status: 403,
      publicMessage: 'Those details do not match that order.',
    })
  }

  return order
}

/**
 * Step 1 of checkout: settle on an order, then mint a payment session for it on
 * the first gateway that answers.
 *
 * Called in two situations:
 *   - a fresh checkout: prices the cart and creates the order;
 *   - a retry (`orderId` given): reuses the existing order, so a failed or
 *     abandoned attempt does not leave a second order behind for one purchase.
 *
 * `excludeGateway` is how the browser reports a gateway that failed on its
 * side — a checkout script that would not load, a widget that would not open.
 * The server cannot see those, so it takes the browser's word for which gateway
 * to skip, which is safe: the worst a forged value can do is route the customer
 * to the other working gateway.
 *
 * @returns {Promise<object>} the order, the chosen gateway, and that gateway's
 *   client payload.
 */
export async function createCheckoutSession(body) {
  assertSupabase()

  const { customer, error: customerError } = buildGuestCustomer(body)
  if (customerError) throw checkoutError(customerError)

  const resumeId = str(body?.orderId)
  const order = resumeId
    ? await loadResumableOrder({ orderId: resumeId, email: customer.email })
    : await insertOrder({ customer, ...(await priceCart(body?.items)) })

  const exclude = []
  for (const name of [].concat(body?.excludeGateway || [])) {
    const id = str(name).toLowerCase()
    if (id) exclude.push(id)
  }

  let session
  try {
    session = await createSessionWithFailover({
      exclude,
      amount: Number(order.total_amount),
      currency: 'INR',
      orderNumber: order.order_number,
      orderId: order.id,
      customer,
    })
  } catch (err) {
    // Every gateway refused, so this order cannot be paid as things stand.
    // Mark it failed rather than leaving it pending forever — a resumed
    // attempt can still revive it inside the resume window.
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id)
    throw err
  }

  // Supersede any earlier attempt on this order: exactly one pending payment
  // row at a time, so confirmation can never pick up a stale reference.
  await supabase.from('payments').delete().eq('order_id', order.id).eq('status', 'pending')

  const { error: paymentError } = await supabase.from('payments').insert({
    order_id: order.id,
    payment_provider: session.gateway,
    // Holds the gateway's own order/session id until a real payment id
    // replaces it on success.
    transaction_id: session.reference,
    amount: Number(order.total_amount),
    currency: 'INR',
    status: 'pending',
    gateway_response: { stage: 'session', gateway: session.gateway, reference: session.reference },
  })

  if (paymentError) {
    // Without this row we would not know which gateway to verify against, so
    // letting the customer pay now would strand the payment.
    throw checkoutError('Could not record the payment attempt: ' + paymentError.message, {
      status: 502,
      publicMessage: 'We could not start your payment. Please try again.',
    })
  }

  // A retry revives an order that a previous failure marked failed.
  if (order.payment_status !== 'pending') {
    await supabase.from('orders').update({ payment_status: 'pending' }).eq('id', order.id)
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    amount: Number(order.total_amount),
    currency: 'INR',
    gateway: session.gateway,
    gatewayLabel: session.label,
    testMode: session.testMode,
    // Whatever the chosen gateway's widget needs — shape differs per gateway.
    client: session.client,
    customer: { name: customer.name, email: customer.email, phone: customer.phone },
    // Present when the primary gateway was skipped, so the UI can say so.
    failedOver: session.attempts.length > 0 ? session.attempts.map((a) => a.gateway) : undefined,
  }
}

/**
 * Step 2 of checkout: confirm what the widget reported.
 *
 * Which gateway to ask, and under which reference, comes from the pending
 * `payments` row written at session time — not from the request. The browser
 * only supplies what its widget handed back (a payment id and a signature),
 * both of which are checked against that server-held reference.
 *
 * Only when the gateway's own record says the payment succeeded, for the amount
 * the order is for, is the order marked paid.
 *
 * @returns {Promise<{ ok: boolean, orderNumber: string, status: string, paymentId: string|null }>}
 */
export async function confirmCheckout(body) {
  assertSupabase()

  const orderId = str(body?.orderId)
  if (!orderId) throw checkoutError('orderId is required.')

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError) {
    throw checkoutError('Could not load order: ' + orderError.message, {
      status: 502,
      publicMessage: 'We could not confirm your payment. Please contact us with your order number.',
    })
  }
  if (!order) throw checkoutError('That order does not exist.', { status: 404 })

  // Confirming twice (a refresh, a double-click) must not double-record — but
  // it should still answer with everything the receipt needs, otherwise the
  // second response renders a slip with its payment details missing.
  if (order.payment_status === 'paid') {
    const { data: settled } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', order.id)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      ok: true,
      orderNumber: order.order_number,
      status: 'paid',
      alreadyConfirmed: true,
      gateway: settled?.payment_provider || null,
      gatewayLabel: getGateway(settled?.payment_provider)?.label || null,
      paymentId: settled?.transaction_id || null,
      amount: Number(settled?.amount ?? order.total_amount),
      currency: settled?.currency || 'INR',
      method: settled?.payment_method || null,
      last4: settled?.gateway_response?.card?.last4 || null,
      paidAt: settled?.paid_at || null,
    }
  }

  const { data: pending, error: pendingError } = await supabase
    .from('payments')
    .select('*')
    .eq('order_id', order.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendingError) {
    throw checkoutError('Could not load the payment attempt: ' + pendingError.message, {
      status: 502,
      publicMessage: 'We could not confirm your payment. Please contact us with your order number.',
    })
  }
  if (!pending) {
    throw checkoutError('No pending payment attempt for order ' + order.order_number, {
      status: 409,
      publicMessage: 'We have no record of a payment in progress for that order.',
    })
  }

  const gateway = getGateway(pending.payment_provider)
  if (!gateway) {
    throw checkoutError('Unknown payment provider "' + pending.payment_provider + '".', {
      status: 500,
      publicMessage: 'We could not confirm your payment. Please contact us with your order number.',
    })
  }

  const reference = pending.gateway_response?.reference || pending.transaction_id
  const outcome = await gateway.confirm({ reference, body })

  const expectedAmount = Number(order.total_amount)
  const capturedAmount = Number(outcome.amount)
  const amountMatches = Number.isFinite(capturedAmount) && Math.abs(capturedAmount - expectedAmount) < 0.01

  if (!outcome.paid) {
    await supabase
      .from('payments')
      .update({
        status: 'failed',
        transaction_id: outcome.transactionId || pending.transaction_id,
        gateway_response: outcome.raw,
      })
      .eq('id', pending.id)
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id)

    throw checkoutError(outcome.reason || 'The payment did not succeed.', {
      status: 402,
      publicMessage: outcome.pendingCapture
        ? 'Your payment is still being confirmed. We will email you once it clears.'
        : 'That payment did not go through. Please try again.',
    })
  }

  await supabase
    .from('payments')
    .update({
      status: amountMatches ? 'success' : 'pending',
      transaction_id: outcome.transactionId,
      amount: capturedAmount,
      currency: outcome.currency || 'INR',
      payment_method: outcome.method,
      gateway_response: outcome.raw,
      paid_at: new Date().toISOString(),
    })
    .eq('id', pending.id)

  if (!amountMatches) {
    // The gateway says paid, but not the amount we asked for. Never auto-fulfil
    // that — a human needs to look at it.
    console.error(
      'Amount mismatch on order ' + order.order_number + ' via ' + gateway.label +
        ': expected ' + expectedAmount + ', captured ' + capturedAmount
    )
    throw checkoutError('Captured amount did not match order total.', {
      status: 409,
      publicMessage: 'We received a payment of a different amount. Our team will contact you shortly.',
    })
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', order_status: 'confirmed' })
    .eq('id', order.id)

  if (updateError) {
    // The money is in and the payment row is written, so this is a bookkeeping
    // failure, not a payment failure — say so loudly, but do not tell the
    // customer their successful payment failed.
    console.error('Order ' + order.order_number + ' paid but not marked paid:', updateError.message)
  }

  // Everything the printed receipt shows, so the confirmation screen renders
  // what actually happened rather than echoing back what the browser sent.
  return {
    ok: true,
    orderNumber: order.order_number,
    status: 'paid',
    gateway: gateway.id,
    gatewayLabel: gateway.label,
    paymentId: outcome.transactionId,
    amount: capturedAmount,
    currency: outcome.currency || 'INR',
    method: outcome.method || null,
    last4: outcome.last4 || null,
    paidAt: new Date().toISOString(),
  }
}
