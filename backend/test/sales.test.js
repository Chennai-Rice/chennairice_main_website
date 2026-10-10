// End-to-end tests of the sales backend over HTTP, against a real
// PostgreSQL 16 and a fake Razorpay.   Run: npm test   (from backend/)
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { startDatabase, setTestEnv, fakeRazorpay, fakeVerifier, signWebhook } from './helpers.js'

let stopDb, base, server, rzp, db, closePool

const OWNER = 'owner@chennairice.test|uid-owner'
const tokens = {}

async function api(method, path, { body, token, headers = {}, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  const type = res.headers.get('content-type') || ''
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() }
}

const buyer = (over = {}) => ({
  name: 'Lakshmi R', email: 'lakshmi@example.com', phone: '+91 98765 43210',
  addressLine1: '12 Gandhi Road', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001', ...over,
})

async function variantId(slug) {
  const { rows } = await db.query('select v.id from product_variants v join products p on p.id = v.product_id where p.slug = $1', [slug])
  return rows[0].id
}
async function stockOf(slug) {
  const { rows } = await db.query(
    `select s.on_hand, s.reserved, s.damaged from stock_levels s join product_variants v on v.id = s.variant_id
       join products p on p.id = v.product_id where p.slug = $1`, [slug])
  return rows[0] || { on_hand: 0, reserved: 0, damaged: 0 }
}

/** Full happy-path purchase; returns the session and the verify result. */
let buyerSeq = 0
async function buy(items, who = buyer()) {
  // Each simulated buyer has their own address, as real customers do, so the
  // whole suite does not trip the per-visitor checkout rate limit.
  const session = await api('POST', '/api/checkout/session', {
    body: { ...who, items }, headers: { 'X-Forwarded-For': `10.0.${Math.floor(++buyerSeq / 250)}.${buyerSeq % 250}` },
  })
  assert.equal(session.status, 200, JSON.stringify(session.body))
  const paid = rzp.pay(session.body.client.razorpayOrderId)
  const verify = await api('POST', '/api/checkout/verify', {
    body: { orderId: session.body.orderId, paymentId: paid.paymentId, signature: paid.signature },
  })
  return { session: session.body, verify, paid }
}

before(async () => {
  setTestEnv()
  stopDb = await startDatabase()
  rzp = fakeRazorpay()
  const dbmod = await import('../lib/db.js')
  closePool = dbmod.closePool
  db = { query: dbmod.query }
  const { runMigrations } = await import('../db/migrate.js')
  const { seed } = await import('../db/seed.js')
  await runMigrations({ log: () => {} })
  await seed({ log: () => {} })
  const { createSalesRouter } = await import('../lib/sales/routes.js')

  const app = express()
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf } }))
  app.use(createSalesRouter({ verifyIdToken: fakeVerifier }))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = 'http://127.0.0.1:' + server.address().port
})

after(async () => {
  rzp?.restore()
  await new Promise((r) => server?.close(r))
  await stopDb?.(closePool)
})

test('catalog lists all 13 packs, none orderable before prices are set', async () => {
  const res = await api('GET', '/api/catalog')
  assert.equal(res.status, 200)
  assert.equal(res.body.products.length, 13)
  assert.ok(res.body.products.every((p) => p.variants.every((v) => v.price === null && v.inStock === false)))

  const order = await api('POST', '/api/checkout/session', { body: { ...buyer(), items: [{ id: 'rudra', qty: 1 }] } })
  assert.equal(order.status, 409)
  assert.match(order.body.error, /not available to order online yet/)
})

test('staff access: no token 401, unverified 403, stranger 403, first owner bootstrapped', async () => {
  assert.equal((await api('GET', '/api/admin/me')).status, 401)
  assert.equal((await api('GET', '/api/admin/me', { token: 'owner@chennairice.test|uid-owner|unverified' })).status, 403)
  assert.equal((await api('GET', '/api/admin/me', { token: 'someone@gmail.com|uid-x' })).status, 403)
  const me = await api('GET', '/api/admin/me', { token: OWNER })
  assert.equal(me.status, 200)
  assert.equal(me.body.role, 'owner')
  // Same email from a different Firebase account is refused.
  assert.equal((await api('GET', '/api/admin/me', { token: 'owner@chennairice.test|uid-impostor' })).status, 403)
})

test('owner sets up the team, prices and opening stock', async () => {
  for (const [email, role] of [['sales@x.test', 'sales'], ['dispatch@x.test', 'dispatch'], ['plant@x.test', 'plant']]) {
    const r = await api('POST', '/api/admin/staff', { token: OWNER, body: { email, fullName: role + ' person', role } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    tokens[role] = email + '|uid-' + role
  }
  // Prices: ₹650 for Rudra 25 kg, ₹540 for Alibaba 10 kg, ₹2000 for the 26 kg pack.
  for (const [slug, price] of [['rudra', 650], ['alibaba', 540], ['chennai-bullets', 2000]]) {
    const r = await api('PATCH', '/api/admin/catalog/variants/' + (await variantId(slug)), { token: OWNER, body: { price, mrp: price + 50 } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
  }
  // Sales cannot change prices.
  const denied = await api('PATCH', '/api/admin/catalog/variants/' + (await variantId('rudra')), { token: tokens.sales, body: { price: 1 } })
  assert.equal(denied.status, 403)

  // The plant packs batches; they become sellable stock.
  for (const [slug, quantity] of [['rudra', 10], ['alibaba', 5], ['chennai-bullets', 3]]) {
    const r = await api('POST', '/api/admin/production/batches', {
      token: tokens.plant, body: { variantId: await variantId(slug), quantity, bestBefore: '2027-12-31' },
    })
    assert.equal(r.status, 200, JSON.stringify(r.body))
  }
  assert.deepEqual(await stockOf('rudra'), { on_hand: 10, reserved: 0, damaged: 0 })
  const cat = await api('GET', '/api/catalog')
  const rudra = cat.body.products.find((p) => p.slug === 'rudra').variants[0]
  assert.equal(rudra.price, 650)
  assert.equal(rudra.inStock, true)
})

test('quote prices a cart server-side and ignores any price the browser sends', async () => {
  const q = await api('POST', '/api/checkout/quote', { body: { state: 'Kerala', items: [{ id: 'rudra-25kg', qty: 2, price: 1 }] } })
  assert.equal(q.status, 200, JSON.stringify(q.body))
  assert.equal(q.body.subtotal, 1300)
  assert.equal(q.body.total, 1300)
  assert.equal(q.body.taxIncluded, 61.9) // 1300 − 1300/1.05
})

test('checkout: stock is held at session, order is placed when payment verifies', async () => {
  const before = await stockOf('rudra')
  const { session, verify } = await buy([{ id: 'rudra', qty: 2 }, { id: 'alibaba-10kg', qty: 1 }])
  assert.equal(session.amount, 1840)
  assert.equal(session.gateway, 'razorpay')
  assert.equal(session.client.amountPaise, 184000)
  // CR-<India date>-<5 characters with no 0/O or 1/I/L>
  assert.match(session.orderNumber, /^CR-\d{8}-[A-HJKMNP-Z2-9]{5}$/)

  assert.equal(verify.status, 200, JSON.stringify(verify.body))
  assert.equal(verify.body.status, 'paid')
  assert.equal(verify.body.amount, 1840)
  assert.equal(verify.body.last4, '1111')
  assert.match(verify.body.shipmentId, /^SHP-[A-Z0-9]{4}-[A-Z0-9]{4}$/)

  const s = await stockOf('rudra')
  assert.equal(s.on_hand, before.on_hand)
  assert.equal(s.reserved, before.reserved + 2)

  const { rows: [o] } = await db.query('select * from orders where id = $1', [session.orderId])
  assert.equal(o.status, 'placed')
  assert.equal(o.payment_status, 'paid')
  const { rows: mail } = await db.query('select template, to_email from email_outbox where order_id = $1 order by template', [o.id])
  assert.deepEqual(mail.map((m) => m.template), ['order_placed', 'staff_new_order'])

  // GST inside Tamil Nadu: CGST + SGST, and the parts add up to the line total.
  const { rows: items } = await db.query('select * from order_items where order_id = $1', [o.id])
  for (const i of items) {
    assert.equal(i.igst_paise, 0)
    assert.ok(i.cgst_paise > 0 && i.sgst_paise > 0)
    assert.equal(i.taxable_paise + i.cgst_paise + i.sgst_paise, i.line_total_paise)
  }

  // Confirming again is harmless and returns the same receipt.
  const again = await api('POST', '/api/checkout/verify', { body: { orderId: session.orderId } })
  assert.equal(again.body.alreadyConfirmed, true)
  assert.equal(again.body.paymentId, verify.body.paymentId)
})

test('a forged signature is rejected and nothing is marked paid', async () => {
  const session = await api('POST', '/api/checkout/session', { body: { ...buyer({ state: 'Karnataka' }), items: [{ id: 'alibaba', qty: 1 }] } })
  const paid = rzp.pay(session.body.client.razorpayOrderId)
  const r = await api('POST', '/api/checkout/verify', { body: { orderId: session.body.orderId, paymentId: paid.paymentId, signature: 'f'.repeat(64) } })
  assert.equal(r.status, 400)
  const { rows: [o] } = await db.query('select status, payment_status from orders where id = $1', [session.body.orderId])
  assert.deepEqual(o, { status: 'pending_payment', payment_status: 'pending' })

  // Outside Tamil Nadu the tax is all IGST.
  const { rows: [i] } = await db.query('select * from order_items where order_id = $1', [session.body.orderId])
  assert.equal(i.cgst_paise + i.sgst_paise, 0)
  assert.ok(i.igst_paise > 0)
})

test('cannot buy more than is in stock, and two buyers cannot both get the last packs', async () => {
  const { available } = (await db.query(
    `select on_hand - reserved as available from stock_levels s join product_variants v on v.id = s.variant_id
       join products p on p.id = v.product_id where p.slug = 'chennai-bullets'`)).rows[0]
  assert.equal(available, 3)
  const tooMany = await api('POST', '/api/checkout/session', { body: { ...buyer(), items: [{ id: 'chennai-bullets', qty: 4 }] } })
  assert.equal(tooMany.status, 409)

  const [a, b] = await Promise.all([
    api('POST', '/api/checkout/session', { body: { ...buyer({ email: 'a@example.com' }), items: [{ id: 'chennai-bullets', qty: 2 }] } }),
    api('POST', '/api/checkout/session', { body: { ...buyer({ email: 'b@example.com' }), items: [{ id: 'chennai-bullets', qty: 2 }] } }),
  ])
  assert.deepEqual([a.status, b.status].sort(), [200, 409])
  const s = await stockOf('chennai-bullets')
  assert.equal(s.reserved, 2)
})

test('unpaid orders expire: the job cancels them and frees their stock', async () => {
  const held = (await stockOf('chennai-bullets')).reserved
  assert.ok(held > 0)
  await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where status = 'pending_payment'`)
  assert.equal((await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'wrong' } })).status, 401)
  const run = await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
  assert.equal(run.status, 200, JSON.stringify(run.body))
  assert.ok(run.body.expired >= 2)
  assert.equal((await stockOf('chennai-bullets')).reserved, 0)
})

test('webhook marks an order paid when the browser never reported back; repeats are ignored', async () => {
  const session = await api('POST', '/api/checkout/session', { body: { ...buyer({ email: 'closed.tab@example.com' }), items: [{ id: 'chennai-bullets', qty: 1 }] } })
  const { payment } = rzp.pay(session.body.client.razorpayOrderId)
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } })

  const forged = await api('POST', '/api/payments/webhook/razorpay', { raw, headers: { 'X-Razorpay-Signature': 'bad', 'X-Razorpay-Event-Id': 'evt_1' } })
  assert.equal(forged.status, 400)

  const ok = await api('POST', '/api/payments/webhook/razorpay', { raw, headers: { 'X-Razorpay-Signature': signWebhook(raw), 'X-Razorpay-Event-Id': 'evt_1' } })
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.equal(ok.body.duplicate, false)
  const dup = await api('POST', '/api/payments/webhook/razorpay', { raw, headers: { 'X-Razorpay-Signature': signWebhook(raw), 'X-Razorpay-Event-Id': 'evt_1' } })
  assert.equal(dup.body.duplicate, true)

  const { rows: [o] } = await db.query('select status, payment_status from orders where id = $1', [session.body.orderId])
  assert.deepEqual(o, { status: 'placed', payment_status: 'paid' })
  // The browser arriving late still gets its receipt.
  const late = await api('POST', '/api/checkout/verify', { body: { orderId: session.body.orderId } })
  assert.equal(late.body.status, 'paid')
})

test('payment after the hold expired is accepted and the stock re-held', async () => {
  const session = await api('POST', '/api/checkout/session', { body: { ...buyer({ email: 'slow@example.com' }), items: [{ id: 'alibaba', qty: 1 }] } })
  await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [session.body.orderId])
  await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
  const paid = rzp.pay(session.body.client.razorpayOrderId)
  const r = await api('POST', '/api/checkout/verify', { body: { orderId: session.body.orderId, paymentId: paid.paymentId, signature: paid.signature } })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const { rows: [o] } = await db.query('select status, needs_attention from orders where id = $1', [session.body.orderId])
  assert.deepEqual(o, { status: 'placed', needs_attention: null })
})

test('dispatch flow: confirm → pack → ship → deliver, with roles, stock, invoice and tracking', async () => {
  const { session } = await buy([{ id: 'rudra', qty: 3 }], buyer({ email: 'flow@example.com', phone: '9123456780', state: 'Kerala', city: 'Kochi' }))
  const id = session.orderId
  const stockBefore = await stockOf('rudra')

  assert.equal((await api('POST', `/api/admin/orders/${id}/confirm`, { token: tokens.plant })).status, 403)
  assert.equal((await api('POST', `/api/admin/orders/${id}/pack`, { token: tokens.dispatch })).status, 409) // not confirmed yet
  assert.equal((await api('POST', `/api/admin/orders/${id}/confirm`, { token: tokens.sales })).status, 200)
  assert.equal((await api('POST', `/api/admin/orders/${id}/pack`, { token: tokens.dispatch })).status, 200)

  const slip = await api('GET', `/api/admin/orders/${id}/packing-slip`, { token: tokens.dispatch })
  assert.match(slip.body, /Packing slip/)
  assert.equal((await api('GET', `/api/admin/orders/${id}/invoice`, { token: tokens.sales })).status, 404)

  const incomplete = await api('POST', `/api/admin/orders/${id}/ship`, { token: tokens.dispatch, body: { method: 'courier', carrierName: 'DTDC' } })
  assert.equal(incomplete.status, 400)
  const { rows: [batch] } = await db.query(
    `select b.id from production_batches b join product_variants v on v.id = b.variant_id join products p on p.id = v.product_id where p.slug = 'rudra'`)
  const { rows: [item] } = await db.query('select id from order_items where order_id = $1', [id])
  const shipped = await api('POST', `/api/admin/orders/${id}/ship`, {
    token: tokens.dispatch,
    body: { method: 'courier', carrierName: 'DTDC', trackingNumber: 'D123456789', expectedDelivery: '2026-10-09', batches: { [item.id]: batch.id } },
  })
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body))
  assert.match(shipped.body.invoice.invoice_number, /^CRI\/\d{4}-\d{2}\/000001$/)
  assert.equal(shipped.body.order.status, 'shipped')

  const after = await stockOf('rudra')
  assert.equal(after.on_hand, stockBefore.on_hand - 3)
  assert.equal(after.reserved, stockBefore.reserved - 3)

  const invoice = await api('GET', `/api/admin/orders/${id}/invoice`, { token: tokens.sales })
  assert.match(invoice.body, /Tax Invoice/)
  assert.match(invoice.body, /IGST/)

  const track = await api('POST', '/api/orders/track', { body: { orderNumber: session.orderNumber.toLowerCase(), phone: '+91 91234 56780' } })
  assert.equal(track.status, 200, JSON.stringify(track.body))
  assert.equal(track.body.status, 'shipped')
  assert.equal(track.body.shipments[0].trackingNumber, 'D123456789')
  assert.equal(track.body.shipments[0].expectedDelivery, '2026-10-09')
  // Looked up by order number alone, so nothing private or priced comes back.
  assert.equal(track.body.email, undefined)
  assert.equal(track.body.total, undefined)
  assert.equal(track.body.items[0].lineTotal, undefined)
  assert.equal((await api('POST', '/api/orders/track', { body: { orderNumber: 'CR-20000101-0000' } })).status, 404)
  // The shipment ID is its own code, unrelated to the order number, and the
  // first shipment carries it. Pasted in any case, inside other text, it finds
  // the same order.
  assert.match(track.body.shipmentId, /^SHP-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  assert.ok(!track.body.shipmentId.includes(session.orderNumber.slice(3, 11)))
  assert.equal(track.body.shipments[0].shipmentId, track.body.shipmentId)
  const bySh = await api('POST', '/api/orders/track', {
    body: { orderNumber: 'my id: ' + track.body.shipmentId.toLowerCase() },
  })
  assert.equal(bySh.status, 200, JSON.stringify(bySh.body))
  assert.equal(bySh.body.orderNumber, session.orderNumber)
  assert.equal((await api('POST', '/api/orders/track', { body: { orderNumber: 'SHP-AAAA-AAAA' } })).status, 404)
  // The receipt link: private order id instead of the phone. A wrong id is refused.
  assert.equal((await api('POST', '/api/orders/track', { body: { orderNumber: session.orderNumber, orderId: id } })).status, 200)
  assert.equal((await api('POST', '/api/orders/track', { body: { orderNumber: session.orderNumber, orderId: '00000000-0000-0000-0000-000000000000' } })).status, 404)

  const delivered = await api('POST', `/api/admin/shipments/${shipped.body.shipment.id}/deliver`, { token: tokens.dispatch, body: { note: 'Handed to customer' } })
  assert.equal(delivered.status, 200)
  assert.equal(delivered.body.order.status, 'delivered')

  const detail = await api('GET', `/api/admin/orders/${id}`, { token: tokens.sales })
  assert.deepEqual(detail.body.history.map((h) => h.to_status), ['pending_payment', 'placed', 'confirmed', 'packed', 'shipped', 'delivered'])
  assert.equal(detail.body.shipments[0].items[0].batch_no.startsWith('B'), true)
})

test('warehouse page: list without prices, one Dispatched switch with undo, select-all dispatch, paging, CSV', async () => {
  const added = await api('POST', '/api/admin/staff', {
    token: OWNER, body: { email: 'store@x.test', fullName: 'Store keeper', role: 'warehouse' },
  })
  assert.equal(added.status, 200, JSON.stringify(added.body))
  const wh = 'store@x.test|uid-store'

  const { session } = await buy(
    [{ id: 'alibaba', qty: 2 }],
    buyer({ name: 'Meena Sundaram', email: 'meena@example.com', phone: '+91 99440 12345', city: 'Salem', pincode: '636001', landmark: 'Near bus stand' })
  )
  const id = session.orderId

  // What the warehouse sees: products, customer, phone, address, payment — no money.
  const list = await api('GET', '/api/admin/warehouse/orders?tab=to_dispatch', { token: wh })
  assert.equal(list.status, 200, JSON.stringify(list.body))
  const row = list.body.orders.find((o) => o.id === id)
  assert.ok(row)
  assert.equal(row.orderNumber, session.orderNumber)
  assert.deepEqual(row.items.map((i) => [i.name, i.packKg, i.qty]), [['Alibaba', 10, 2]])
  assert.equal(row.customer.name, 'Meena Sundaram')
  assert.equal(row.customer.phone, '+91 99440 12345')
  assert.equal(row.address.landmark, 'Near bus stand')
  assert.equal(row.paymentStatus, 'paid')
  assert.doesNotMatch(JSON.stringify(list.body), /price|paise|total"/i)
  assert.ok(list.body.counts.to_dispatch >= 1)

  // The warehouse cannot open priced views; plant staff cannot use the page.
  assert.equal((await api('GET', `/api/admin/orders/${id}`, { token: wh })).status, 403)
  assert.equal((await api('GET', '/api/admin/dashboard', { token: wh })).status, 403)
  assert.equal((await api('GET', '/api/admin/warehouse/orders', { token: tokens.plant })).status, 403)

  // Search: shipment ID, last phone digits, product, city. Filters: pack size, state.
  for (const q of [row.shipmentId.toLowerCase(), '12345', 'alibaba', 'salem']) {
    const r = await api('GET', '/api/admin/warehouse/orders?tab=all&q=' + encodeURIComponent(q), { token: wh })
    assert.ok(r.body.orders.some((o) => o.id === id), 'search for ' + q)
  }
  assert.ok((await api('GET', '/api/admin/warehouse/orders?tab=all&pack=10&q=Meena', { token: wh })).body.orders.some((o) => o.id === id))
  assert.ok(!(await api('GET', '/api/admin/warehouse/orders?tab=all&pack=26&q=Meena', { token: wh })).body.orders.some((o) => o.id === id))
  assert.ok(!(await api('GET', '/api/admin/warehouse/orders?tab=all&state=other&q=Meena', { token: wh })).body.orders.some((o) => o.id === id))

  // One switch. On: dispatched, stock taken out of reserve, invoice issued.
  const before = await stockOf('alibaba')
  const dispatch = (on, expect) => api('POST', `/api/admin/orders/${id}/dispatched`, { token: wh, body: { on, expect } })
  const d = await dispatch(true, 'placed')
  assert.equal(d.status, 200, JSON.stringify(d.body))
  assert.equal(d.body.order.status, 'shipped')
  let s = await stockOf('alibaba')
  assert.deepEqual([s.on_hand, s.reserved], [before.on_hand - 2, before.reserved - 2])
  const { rows: [inv] } = await db.query('select invoice_number from invoices where order_id = $1', [id])
  assert.ok(inv)
  // A second person whose page still showed "placed" is refused.
  assert.equal((await dispatch(true, 'placed')).status, 409)

  // The customer sees it: Dispatched, under the order's own shipment ID.
  let t = await api('POST', '/api/orders/track', { body: { orderNumber: row.shipmentId } })
  assert.equal(t.body.status, 'shipped')
  assert.equal(t.body.shipments[0].shipmentId, row.shipmentId)

  // Off: a mis-tap undone. Packs back on hold, shipment hidden from the customer.
  assert.equal((await dispatch(false, 'shipped')).body.order.status, 'placed')
  s = await stockOf('alibaba')
  assert.deepEqual([s.on_hand, s.reserved], [before.on_hand, before.reserved])
  t = await api('POST', '/api/orders/track', { body: { orderNumber: session.orderNumber } })
  assert.equal(t.body.status, 'placed')
  assert.equal(t.body.shipments.length, 0)
  // On again reuses the same shipment and invoice: the IDs never change.
  assert.equal((await dispatch(true)).body.order.status, 'shipped')
  const { rows: ships } = await db.query('select shipment_number, status from shipments where order_id = $1', [id])
  assert.deepEqual(ships, [{ shipment_number: row.shipmentId, status: 'shipped' }])
  const { rows: invs } = await db.query('select invoice_number from invoices where order_id = $1', [id])
  assert.deepEqual(invs, [inv])

  // Who did it is recorded.
  const { rows: hist } = await db.query(
    `select h.to_status, s.email from order_status_history h join staff_users s on s.id = h.staff_id where h.order_id = $1 order by h.id`, [id])
  assert.deepEqual(hist.map((h) => h.to_status), ['shipped', 'placed', 'shipped'])
  assert.ok(hist.every((h) => h.email === 'store@x.test'))

  // Select all → dispatch: several orders at once; one bad id does not stop the rest.
  const more = []
  for (const name of ['Bulk One', 'Bulk Two', 'Bulk Three']) {
    more.push((await buy([{ id: 'rudra', qty: 1 }], buyer({ name, email: name.replace(' ', '.') + '@example.com' }))).session.orderId)
  }
  const bulk = await api('POST', '/api/admin/warehouse/dispatch', {
    token: wh, body: { on: true, ids: [...more, '00000000-0000-0000-0000-000000000000'] },
  })
  assert.equal(bulk.status, 200, JSON.stringify(bulk.body))
  assert.deepEqual([bulk.body.done, bulk.body.failed], [3, 1])
  const { rows: bulkRows } = await db.query('select status from orders where id = any($1)', [more])
  assert.ok(bulkRows.every((r) => r.status === 'shipped'))

  // Paging: cards arrive a page at a time until hasMore is false.
  const p1 = await api('GET', '/api/admin/warehouse/orders?tab=all&limit=2&offset=0', { token: wh })
  const p2 = await api('GET', '/api/admin/warehouse/orders?tab=all&limit=2&offset=2', { token: wh })
  assert.equal(p1.body.orders.length, 2)
  assert.equal(p1.body.hasMore, true)
  assert.ok(!p2.body.orders.some((o) => p1.body.orders.some((x) => x.id === o.id)))

  // CSV of the whole filtered list (not one page), opening in Excel.
  const csv = await api('GET', '/api/admin/warehouse/orders.csv?tab=all&q=Meena', { token: wh })
  assert.equal(csv.status, 200)
  // fetch's text() drops the byte-order mark, so check the raw bytes for it:
  // it is what makes Excel read the file as UTF-8.
  assert.ok(csv.body.startsWith('Order ID,Shipment ID'))
  const raw = new Uint8Array(await (await fetch(base + '/api/admin/warehouse/orders.csv?tab=all', {
    headers: { Authorization: 'Bearer ' + wh },
  })).arrayBuffer())
  assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf])
  assert.match(csv.body, new RegExp(session.orderNumber + ',' + row.shipmentId))
  assert.match(csv.body, /2 x Alibaba \(10 kg\)/)
  assert.match(csv.body, /99440 12345/)
  assert.match(csv.body, /Dispatched/)
  assert.doesNotMatch(csv.body, /₹|788/)
  const allCsv = await api('GET', '/api/admin/warehouse/orders.csv?tab=all', { token: wh })
  assert.ok(allCsv.body.trim().split('\r\n').length - 1 >= p1.body.tabCount)

  // Order rows carry each pack's photo for the table.
  assert.match(row.items[0].image, /\/assets\/shop\/packs\//)

  // Customers and reports: available to the warehouse, never with money.
  const cust = await api('GET', '/api/admin/warehouse/customers?q=Meena', { token: wh })
  assert.equal(cust.status, 200, JSON.stringify(cust.body))
  const meena = cust.body.customers.find((c) => c.name === 'Meena Sundaram')
  assert.ok(meena && meena.orders >= 1 && meena.packs >= 2)
  assert.doesNotMatch(JSON.stringify(cust.body), /price|paise|total_|amount/i)
  const byPhone = await api('GET', '/api/admin/warehouse/customers?q=12345', { token: wh })
  assert.ok(byPhone.body.customers.some((c) => c.name === 'Meena Sundaram'))
  const report = await api('GET', '/api/admin/warehouse/reports?days=30', { token: wh })
  assert.equal(report.status, 200, JSON.stringify(report.body))
  assert.ok(report.body.dispatched >= 4)
  assert.ok(report.body.perDay.length >= 1)
  assert.ok(report.body.perProduct.some((p) => p.name === 'Alibaba'))
  assert.doesNotMatch(JSON.stringify(report.body), /price|paise|amount|revenue/i)
  assert.equal((await api('GET', '/api/admin/warehouse/reports', { token: tokens.plant })).status, 403)

  // Packing slip prints for the warehouse, with both IDs.
  const slip = await api('GET', `/api/admin/orders/${id}/packing-slip`, { token: wh })
  assert.equal(slip.status, 200)
  assert.match(slip.body, new RegExp(row.shipmentId))
})

test('cancel a paid order: stock released, flagged for refund; refunds cannot exceed the payment', async () => {
  const { session } = await buy([{ id: 'alibaba', qty: 1 }], buyer({ email: 'cancel@example.com' }))
  const id = session.orderId
  const held = (await stockOf('alibaba')).reserved

  assert.equal((await api('POST', `/api/admin/orders/${id}/cancel`, { token: tokens.sales, body: {} })).status, 400)
  const c = await api('POST', `/api/admin/orders/${id}/cancel`, { token: tokens.sales, body: { reason: 'Customer called to cancel' } })
  assert.equal(c.status, 200)
  assert.equal((await stockOf('alibaba')).reserved, held - 1)
  const { rows: [flag] } = await db.query('select needs_attention from orders where id = $1', [id])
  assert.match(flag.needs_attention, /refund/)

  assert.equal((await api('POST', `/api/admin/orders/${id}/refunds`, { token: tokens.sales, body: { reason: 'x' } })).status, 403)
  const part = await api('POST', `/api/admin/orders/${id}/refunds`, { token: OWNER, body: { amount: 100, reason: 'Cancelled' } })
  assert.equal(part.status, 200, JSON.stringify(part.body))
  assert.equal(part.body.order.payment_status, 'partially_refunded')
  assert.equal((await api('POST', `/api/admin/orders/${id}/refunds`, { token: OWNER, body: { amount: 1000, reason: 'Too much' } })).status, 409)
  const rest = await api('POST', `/api/admin/orders/${id}/refunds`, { token: OWNER, body: { reason: 'Balance' } })
  assert.equal(rest.status, 200)
  assert.equal(rest.body.order.payment_status, 'refunded')
  assert.equal(rest.body.order.needs_attention, null)
  assert.deepEqual(rzp.state.refunds.map((r) => r.amount), [10000, 44000])
})

test('inventory: damage and adjustments go through the ledger and never below zero', async () => {
  const v = await variantId('alibaba')
  const start = await stockOf('alibaba')
  assert.equal((await api('POST', '/api/admin/inventory/damage', { token: tokens.sales, body: { variantId: v, quantity: 1, reason: 'Torn' } })).status, 403)
  assert.equal((await api('POST', '/api/admin/inventory/damage', { token: OWNER, body: { variantId: v, quantity: 1, reason: 'Torn bag' } })).status, 200)
  const neg = await api('POST', '/api/admin/inventory/adjust', { token: OWNER, body: { variantId: v, delta: -1000, reason: 'count' } })
  assert.equal(neg.status, 409)
  const s = await stockOf('alibaba')
  assert.deepEqual(s, { on_hand: start.on_hand - 1, reserved: start.reserved, damaged: start.damaged + 1 })

  // stock_levels always equals the sum of the movement ledger.
  const { rows } = await db.query(
    `select l.variant_id, l.on_hand, l.reserved, l.damaged,
            coalesce(sum(m.on_hand_delta), 0)::int as oh, coalesce(sum(m.reserved_delta), 0)::int as rs, coalesce(sum(m.damaged_delta), 0)::int as dm
       from stock_levels l left join stock_movements m on m.variant_id = l.variant_id and m.location_id = l.location_id
      group by l.variant_id, l.location_id, l.on_hand, l.reserved, l.damaged`)
  for (const r of rows) assert.deepEqual([r.on_hand, r.reserved, r.damaged], [r.oh, r.rs, r.dm])

  const dash = await api('GET', '/api/admin/dashboard', { token: tokens.plant })
  assert.equal(dash.status, 200)
  assert.ok(dash.body.today.orders >= 4)
  const demand = await api('GET', '/api/admin/production/demand', { token: tokens.plant })
  assert.equal(demand.body.demand.length, 13)
})

test('order IDs: every checkout gets its own ID, claimed once in the register, never reused', async () => {
  // Plenty of stock so 30 buyers can check out at the same moment.
  const more = await api('POST', '/api/admin/production/batches', {
    token: OWNER, body: { variantId: await variantId('rudra'), quantity: 60 },
  })
  assert.equal(more.status, 200, JSON.stringify(more.body))

  const sessions = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      api('POST', '/api/checkout/session', {
        body: { ...buyer({ email: `rush${i}@example.com` }), items: [{ id: 'rudra', qty: 1 }] },
        headers: { 'X-Forwarded-For': '10.0.0.' + i },
      }))
  )
  assert.ok(sessions.every((s) => s.status === 200), JSON.stringify(sessions.find((s) => s.status !== 200)?.body))
  const numbers = sessions.map((s) => s.body.orderNumber)
  assert.equal(new Set(numbers).size, 30, 'all 30 order IDs differ')
  // Each Razorpay order carries our order ID as its receipt, one-to-one.
  const refs = sessions.map((s) => s.body.client.razorpayOrderId)
  assert.equal(new Set(refs).size, 30)
  assert.deepEqual(refs.map((r) => rzp.orders.get(r).receipt), numbers)

  // Every one is in the register, pointing at its own order.
  const { rows: reg } = await db.query(
    `select r.value, r.order_id, o.order_number from issued_ids r join orders o on o.id = r.order_id
      where r.value = any($1)`, [numbers])
  assert.equal(reg.length, 30)
  assert.ok(reg.every((r) => r.value === r.order_number))

  // A claimed ID is never handed out again: the generator's clash is skipped.
  const { reserveId } = await import('../lib/sales/util.js')
  const taken = numbers[0]
  const draws = [taken, taken, 'CR-20991231-ZZZZZ']
  const got = await reserveId(db, 'order', () => draws.shift())
  assert.equal(got, 'CR-20991231-ZZZZZ')
  await db.query(`delete from issued_ids where value = 'CR-20991231-ZZZZZ'`)

  // An unpaid order that expires keeps its ID in the register for good.
  await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where order_number = $1`, [numbers[1]])
  await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
  const { rows: [kept] } = await db.query(`select value from issued_ids where value = $1`, [numbers[1]])
  assert.ok(kept)

  // The register as the owner sees it, with the Razorpay references.
  const paid = rzp.pay(sessions[2].body.client.razorpayOrderId)
  await api('POST', '/api/checkout/verify', {
    body: { orderId: sessions[2].body.orderId, paymentId: paid.paymentId, signature: paid.signature },
  })
  const list = await api('GET', '/api/admin/order-ids?q=' + numbers[2], { token: OWNER })
  assert.equal(list.status, 200, JSON.stringify(list.body))
  assert.equal(list.body.ids.length, 1)
  const row = list.body.ids[0]
  assert.equal(row.id, numbers[2])
  assert.equal(row.razorpayOrderId, refs[2])
  assert.equal(row.paymentId, paid.paymentId)
  assert.equal(row.outcome, 'Paid · to dispatch')
  assert.match(row.shipmentId, /^SHP-/)
  // Looked up by the Razorpay reference instead, the same order comes back.
  assert.equal((await api('GET', '/api/admin/order-ids?q=' + refs[2], { token: OWNER })).body.ids[0].id, numbers[2])
  const expired = (await api('GET', '/api/admin/order-ids?q=' + numbers[1], { token: OWNER })).body.ids[0]
  assert.equal(expired.outcome, 'Not paid (expired or cancelled)')

  // Shipment IDs are in the register too.
  const ships = await api('GET', '/api/admin/order-ids?kind=shipment&q=' + row.shipmentId, { token: OWNER })
  assert.equal(ships.body.ids[0].orderNumber, numbers[2])

  // Only the owner / admin can read the register.
  assert.equal((await api('GET', '/api/admin/order-ids', { token: tokens.sales })).status, 403)

  // CSV and the health check.
  const csv = await api('GET', '/api/admin/order-ids.csv', { token: OWNER })
  assert.ok(csv.body.startsWith('ID,Type,Issued,Order ID'))
  assert.match(csv.body, new RegExp(numbers[2] + ',Order,'))
  const check = await api('GET', '/api/admin/order-ids/check', { token: OWNER })
  assert.equal(check.body.ok, true, JSON.stringify(check.body.problems))
  assert.ok(check.body.totals.orders >= 30)
})

test('warehouse panel phase 1: dashboard, packing, dispatch with details, deliveries, pick list, issues, money only for owner', async () => {
  const wh = 'store@x.test|uid-store'
  const { session: a } = await buy([{ id: 'rudra', qty: 2 }], buyer({ name: 'Panel One', email: 'panel1@example.com', city: 'Erode' }))
  const { session: b } = await buy([{ id: 'rudra', qty: 1 }], buyer({ name: 'Panel Two', email: 'panel2@example.com', state: 'Kerala', city: 'Kochi' }))

  // Dashboard: counts for everyone; amounts only for the owner.
  const dw = await api('GET', '/api/admin/warehouse/dashboard', { token: wh })
  assert.equal(dw.status, 200, JSON.stringify(dw.body))
  assert.ok(dw.body.counts.toDispatch >= 2)
  assert.equal(dw.body.todayByHour.length, 24)
  assert.ok(dw.body.recentOrders.length > 0 && dw.body.recentOrders.every((o) => o.total === undefined))
  const dOwner = await api('GET', '/api/admin/warehouse/dashboard', { token: OWNER })
  assert.ok(dOwner.body.recentOrders.some((o) => typeof o.total === 'number'))
  const ordersOwner = await api('GET', '/api/admin/warehouse/orders?tab=all&q=Panel', { token: OWNER })
  assert.ok(ordersOwner.body.orders.every((o) => typeof o.total === 'number'))
  const ordersWh = await api('GET', '/api/admin/warehouse/orders?tab=all&q=Panel', { token: wh })
  assert.ok(ordersWh.body.orders.every((o) => o.total === undefined))

  // Pick list for what is waiting.
  const pick = await api('GET', '/api/admin/warehouse/pick-list?tab=ready&q=Panel', { token: wh })
  assert.deepEqual(pick.body.lines.map((l) => [l.name, l.packs, l.orders]), [['Rudra', 3, 2]])

  // Packing step: Ready → Packing → back → Packing.
  const pack = (id, on, expect) => api('POST', `/api/admin/orders/${id}/packing`, { token: wh, body: { on, expect } })
  assert.equal((await pack(a.orderId, true, 'placed')).body.order.status, 'packed')
  assert.equal((await pack(a.orderId, false)).body.order.status, 'confirmed')
  assert.equal((await pack(a.orderId, true)).body.order.status, 'packed')
  const tabs = await api('GET', '/api/admin/warehouse/orders?tab=packing&q=Panel', { token: wh })
  assert.deepEqual(tabs.body.orders.map((o) => o.orderNumber), [a.orderNumber])

  // Dispatch with courier details straight from Ready (order b), and from Packing (order a).
  const shipB = await api('POST', `/api/admin/orders/${b.orderId}/ship`, {
    token: wh, body: { method: 'courier', carrierName: 'DTDC', trackingNumber: 'DT555', expectedDelivery: '2026-01-01' },
  })
  assert.equal(shipB.status, 200, JSON.stringify(shipB.body))
  assert.match(shipB.body.shipment.shipment_number, /^SHP-/)
  // One-tap dispatch for a, then add its details afterwards.
  const tapA = await api('POST', `/api/admin/orders/${a.orderId}/dispatched`, { token: wh, body: { on: true } })
  assert.equal(tapA.body.order.status, 'shipped')
  const { rows: [shA] } = await db.query(`select id from shipments where order_id = $1 and status = 'shipped'`, [a.orderId])
  const det = await api('PATCH', `/api/admin/shipments/${shA.id}/details`, {
    token: wh, body: { method: 'own_vehicle', vehicleNumber: 'TN 33 AB 1234', driverName: 'Ravi', driverPhone: '9000011111' },
  })
  assert.equal(det.status, 200, JSON.stringify(det.body))
  assert.equal(det.body.shipment.vehicle_number, 'TN 33 AB 1234')
  assert.equal((await api('PATCH', `/api/admin/shipments/${shA.id}/details`, { token: wh, body: { method: 'courier' } })).status, 400)

  // Deliveries: both in transit; b is delayed (expected date has passed).
  const dl = await api('GET', '/api/admin/warehouse/shipments?tab=in_transit&q=Panel', { token: wh })
  assert.equal(dl.status, 200, JSON.stringify(dl.body))
  assert.equal(dl.body.shipments.length, 2)
  const delayed = await api('GET', '/api/admin/warehouse/shipments?tab=delayed&q=Panel', { token: wh })
  assert.deepEqual(delayed.body.shipments.map((s) => s.orderNumber), [b.orderNumber])
  assert.equal((await api('GET', '/api/admin/warehouse/shipments?tab=all&q=DT555', { token: wh })).body.shipments[0].trackingNumber, 'DT555')
  // Confirm delivery from the warehouse.
  const bShip = dl.body.shipments.find((s) => s.orderNumber === b.orderNumber)
  const dv = await api('POST', `/api/admin/shipments/${bShip.id}/deliver`, { token: wh, body: { note: 'Handed over' } })
  assert.equal(dv.status, 200, JSON.stringify(dv.body))
  assert.equal(dv.body.order.status, 'delivered')
  assert.equal((await api('GET', '/api/admin/warehouse/shipments?tab=delivered&q=Panel', { token: wh })).body.total, 1)

  // Returns & Issues: log against a shipment ID, review, resolve with a note.
  const bad = await api('POST', '/api/admin/warehouse/issues', { token: wh, body: { order: 'CR-20000101-ZZZZZ', type: 'damaged', description: 'x' } })
  assert.equal(bad.status, 404)
  const { rows: [{ shipment_id: bShipmentId }] } = await db.query('select shipment_id from orders where id = $1', [b.orderId])
  const iss = await api('POST', '/api/admin/warehouse/issues', {
    token: wh, body: { order: bShipmentId, type: 'damaged', description: '2 bags torn on arrival' },
  })
  assert.equal(iss.status, 200, JSON.stringify(iss.body))
  assert.match(iss.body.ref, /^ISS-\d{6}$/)
  let list = await api('GET', '/api/admin/warehouse/issues?tab=open', { token: wh })
  assert.ok(list.body.issues.some((i) => i.id === iss.body.id && i.typeLabel === 'Damaged bags' && i.orderNumber === b.orderNumber))
  assert.equal((await api('PATCH', `/api/admin/warehouse/issues/${iss.body.id}`, { token: wh, body: { status: 'resolved' } })).status, 400)
  await api('PATCH', `/api/admin/warehouse/issues/${iss.body.id}`, { token: wh, body: { status: 'under_review', note: 'Called the customer' } })
  await api('PATCH', `/api/admin/warehouse/issues/${iss.body.id}`, { token: wh, body: { status: 'resolved', note: 'Sent 2 replacement bags' } })
  const one = await api('GET', `/api/admin/warehouse/issues/${iss.body.id}`, { token: wh })
  assert.equal(one.body.status, 'resolved')
  assert.equal(one.body.resolution, 'Sent 2 replacement bags')
  assert.deepEqual(one.body.events.map((e) => e.to_status), ['open', 'under_review', 'resolved'])
  list = await api('GET', '/api/admin/warehouse/issues?tab=resolved', { token: wh })
  assert.ok(list.body.counts.resolved >= 1)
  assert.equal((await api('GET', '/api/admin/warehouse/dashboard', { token: wh })).body.counts.openIssues, 0)
  assert.equal((await api('GET', '/api/admin/warehouse/issues', { token: tokens.plant })).status, 403)
})

test('product tracker upload: preview, dispatch and update from the sheet, courier links, customer redirect', async () => {
  const wh = 'store@x.test|uid-store'
  const { findCourier, isCourierHost } = await import('../lib/sales/couriers.js')
  const ExcelJS = (await import('exceljs')).default
  const { session: a } = await buy([{ id: 'rudra', qty: 1 }], buyer({ name: 'Track One', email: 'track1@example.com' }))
  const { session: b } = await buy([{ id: 'rudra', qty: 1 }], buyer({ name: 'Track Two', email: 'track2@example.com' }))
  await api('POST', `/api/admin/orders/${b.orderId}/dispatched`, { token: wh, body: { on: true } })
  const { rows: [{ shipment_id: bShipmentId }] } = await db.query('select shipment_id from orders where id = $1', [b.orderId])

  // The courier's sheet, headings in their own words; columns in any order.
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Courier Name', 'Product ID', 'Tracking Link'])
  ws.addRow(['BLUEDART', a.orderNumber, '81234567890'])
  ws.addRow(['dtdc', bShipmentId, 'https://evil.example/track?cn=D12345678'])
  ws.addRow(['Blue Dart', 'CR-20000101-ZZZZZ', '1111111111'])
  ws.addRow(['Trackon', 'hello', '2222222222'])
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer())
  const upload = async (bytes, { apply = false, token = wh, filename = 'tracker.xlsx' } = {}) => {
    const res = await fetch(`${base}/api/admin/warehouse/tracker?apply=${apply ? 1 : 0}&filename=${filename}`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: bytes,
    })
    return { status: res.status, body: await res.json() }
  }

  // Preview changes nothing.
  const pv = await upload(xlsx)
  assert.equal(pv.status, 200, JSON.stringify(pv.body))
  assert.equal(pv.body.applied, false)
  assert.deepEqual(pv.body.rows.map((r) => r.action), ['dispatch', 'update', 'skip', 'skip'])
  assert.deepEqual(pv.body.summary.partners.sort(), ['Blue Dart', 'DTDC'])
  const [ra, rb] = pv.body.rows
  assert.ok(isCourierHost(findCourier('Blue Dart'), new URL(ra.trackingUrl).hostname), ra.trackingUrl)
  // Each partner opens its own fixed tracking page; the AWB is pasted there.
  assert.equal(ra.trackingUrl, 'https://www.bluedart.com/web/guest/domestic')
  assert.equal(findCourier('delhivery').trackingPage, 'https://www.delhivery.com/tracking')
  // A link on someone else's website is never used; DTDC's own page is.
  assert.equal(rb.trackingNumber, 'D12345678')
  assert.ok(isCourierHost(findCourier('DTDC'), new URL(rb.trackingUrl).hostname), rb.trackingUrl)
  assert.equal((await db.query('select status from orders where id = $1', [a.orderId])).rows[0].status, 'placed')

  // Only people who dispatch may upload.
  assert.equal((await upload(xlsx, { token: tokens.plant })).status, 403)

  // Apply.
  const ap = await upload(xlsx, { apply: true })
  assert.equal(ap.status, 200, JSON.stringify(ap.body))
  assert.equal(ap.body.summary.dispatched, 1)
  assert.equal(ap.body.summary.updated, 1)
  const { rows: [sa] } = await db.query(
    `select o.status, s.carrier_name, s.tracking_number, s.tracking_url from orders o join shipments s on s.order_id = o.id
      where o.id = $1 and s.status <> 'cancelled'`, [a.orderId])
  assert.deepEqual([sa.status, sa.carrier_name, sa.tracking_number], ['shipped', 'Blue Dart', '81234567890'])

  // Same sheet again: nothing to do.
  const again = await upload(xlsx)
  assert.deepEqual(again.body.rows.slice(0, 2).map((r) => r.action), ['unchanged', 'unchanged'])

  // A CSV without headings: ID, tracking, partner.
  const csv = Buffer.from(`${a.orderNumber},81234567899,Blue Dart\n`)
  const c = await upload(csv, { filename: 'agent.csv' })
  assert.deepEqual(c.body.rows.map((r) => [r.action, r.trackingNumber]), [['update', '81234567899']])

  // Uploads history and template.
  const ups = await api('GET', '/api/admin/warehouse/tracker/uploads', { token: wh })
  assert.equal(ups.body.uploads[0].dispatched, 1)
  const tpl = await fetch(`${base}/api/admin/warehouse/tracker/template.xlsx`, { headers: { Authorization: 'Bearer ' + wh } })
  assert.equal(tpl.status, 200)
  assert.match(tpl.headers.get('content-type'), /spreadsheetml/)

  // Customers: Track Order shows the courier and link; "go" sends them to the courier's page.
  const tr = await api('POST', '/api/orders/track', { body: { orderNumber: a.orderNumber } })
  assert.equal(tr.status, 200, JSON.stringify(tr.body))
  assert.equal(tr.body.shipments[0].trackingUrl, sa.tracking_url)
  const go = await fetch(`${base}/api/orders/track/go?ref=${bShipmentId}`, { redirect: 'manual' })
  assert.equal(go.status, 302)
  assert.equal(go.headers.get('location'), rb.trackingUrl)
  const none = await fetch(`${base}/api/orders/track/go?ref=CR-20000101-ZZZZZ`, { redirect: 'manual' })
  assert.equal(none.headers.get('location'), '/track-order?order=CR-20000101-ZZZZZ')
})

test('order confirmation email: sent over SMTP once payment verifies, with the order details and links', async () => {
  const { SMTPServer } = await import('smtp-server')
  const { simpleParser } = await import('mailparser')
  const inbox = []
  const logins = []
  const smtpd = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    onAuth(auth, _session, cb) {
      logins.push(auth.username)
      return auth.username === 'orders@chennairice.test' && auth.password === 'app-password'
        ? cb(null, { user: auth.username }) : cb(new Error('Invalid login'))
    },
    onData(stream, session, cb) {
      simpleParser(stream).then((m) => { inbox.push({ rcpt: session.envelope.rcptTo.map((r) => r.address), m }); cb() }, cb)
    },
  })
  await new Promise((r) => smtpd.listen(0, '127.0.0.1', r))
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpd.server.address().port), SMTP_REQUIRE_TLS: 'false',
    SMTP_USER: 'orders@chennairice.test', SMTP_PASS: 'app-password',
    EMAIL_FROM: 'Chennai Rice <orders@chennairice.test>', EMAIL_REPLY_TO: 'support@chennairice.test',
  })
  try {
    const { session } = await buy([{ id: 'rudra', qty: 1 }], buyer({ name: 'Mail <Test>', email: 'mailtest@example.com', addressLine2: 'Near the temple' }))
    const { rows: [{ shipment_id: shipmentId }] } = await db.query('select shipment_id from orders where id = $1', [session.orderId])
    // Sent straight after payment, without waiting for the timer.
    let mine
    for (let i = 0; i < 50 && !mine; i++) {
      await new Promise((r) => setTimeout(r, 100))
      mine = inbox.find((x) => x.rcpt.includes('mailtest@example.com'))
    }
    assert.ok(mine, 'confirmation email arrived')
    const { m } = mine
    assert.equal(m.subject, `Order Confirmed - ${session.orderNumber}`)
    assert.equal(m.from.value[0].address, 'orders@chennairice.test')
    assert.equal(m.replyTo.value[0].address, 'support@chennairice.test')
    assert.ok(logins.includes('orders@chennairice.test'))
    for (const part of [m.text, m.html]) {
      assert.ok(part.includes(session.orderNumber), 'order ID')
      assert.ok(part.includes('Near the temple'), 'address')
      assert.ok(part.includes('/track-order?order=' + session.orderNumber), 'track link')
    }
    // The shipment ID is kept off the email and the invoice.
    assert.ok(!m.text.includes(shipmentId) && !m.html.includes(shipmentId), 'no shipment ID in the email')
    const invoicePage = await api('GET', `/api/orders/${session.orderId}/invoice?n=${session.orderNumber}`)
    assert.equal(invoicePage.status, 200)
    assert.ok(invoicePage.body.includes('To be dispatched') && !invoicePage.body.includes(shipmentId), 'no shipment ID on the invoice')
    assert.ok(m.text.includes(`/api/orders/${session.orderId}/invoice?n=${session.orderNumber}`), 'invoice link')
    // The HTML template: every placeholder filled, one product row per item, payment details.
    assert.ok(!/\{\{[A-Za-z ]+\}\}/.test(m.html), 'no placeholder left unfilled')
    assert.ok(m.html.includes('Rudra (') && m.html.includes('/assets/shop/'), 'product row with its image')
    assert.ok(m.html.includes('Card ending 1111') && m.html.includes('>Paid<'), 'payment method and status')
    assert.ok(m.html.includes('Coimbatore, Tamil Nadu - 641001'), 'city, state, pincode')
    // The GST invoice is attached as a PDF, the same invoice the receipt's download shows.
    const { rows: [inv] } = await db.query('select invoice_number from invoices where order_id = $1', [session.orderId])
    assert.ok(inv, 'invoice issued when the email was sent')
    assert.equal(m.attachments.length, 1)
    const [pdf] = m.attachments
    assert.equal(pdf.contentType, 'application/pdf')
    assert.equal(pdf.filename, `Invoice ${inv.invoice_number.replaceAll('/', '-')}.pdf`)
    assert.equal(pdf.content.subarray(0, 5).toString(), '%PDF-')
    assert.ok(pdf.content.includes(`Invoice ${inv.invoice_number}`), 'invoice number in the PDF')
    assert.ok(m.text.includes('invoice is attached'))
    // Names are escaped in the HTML.
    assert.ok(m.html.includes('Mail &lt;Test&gt;') && !m.html.includes('Mail <Test>'))
    const { rows: [row] } = await db.query(`select status, attempts from email_outbox where order_id = $1 and template = 'order_placed'`, [session.orderId])
    assert.deepEqual([row.status, row.attempts], ['sent', 1])

    // Running the sender again (the timer) never sends it a second time.
    const { sendQueued } = await import('../lib/sales/email.js')
    await Promise.all([sendQueued(db), sendQueued(db)])
    assert.equal(inbox.filter((x) => x.rcpt.includes('mailtest@example.com')).length, 1)

    // A wrong password: the mail stays queued with the error, to be retried.
    process.env.SMTP_PASS = 'wrong'
    const { session: s2 } = await buy([{ id: 'rudra', qty: 1 }], buyer({ email: 'mailtest2@example.com' }))
    await new Promise((r) => setTimeout(r, 800))
    const { rows: [r2] } = await db.query(`select status, attempts, last_error from email_outbox where order_id = $1 and template = 'order_placed'`, [s2.orderId])
    assert.equal(r2.status, 'queued')
    assert.equal(r2.attempts, 1)
    assert.match(r2.last_error, /auth|login/i)
    assert.ok(!r2.last_error.includes('wrong'), 'the password is never stored')
  } finally {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_REQUIRE_TLS', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_REPLY_TO']) delete process.env[k]
    await new Promise((r) => smtpd.close(r))
  }
})

test('shipped email: sent on dispatch with shipment ID and tracking; tracking added later follows; never duplicated', async () => {
  const { SMTPServer } = await import('smtp-server')
  const { simpleParser } = await import('mailparser')
  const wh = 'store@x.test|uid-store'
  const inbox = []
  const smtpd = new SMTPServer({
    disabledCommands: ['STARTTLS'], allowInsecureAuth: true, onAuth: (a, _s, cb) => cb(null, { user: a.username }),
    onData(stream, session, cb) {
      simpleParser(stream).then((m) => { inbox.push({ rcpt: session.envelope.rcptTo.map((r) => r.address), m }); cb() }, cb)
    },
  })
  await new Promise((r) => smtpd.listen(0, '127.0.0.1', r))
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpd.server.address().port), SMTP_REQUIRE_TLS: 'false',
    SMTP_USER: 'support@chennairice.test', SMTP_PASS: 'x', EMAIL_FROM: 'Chennai Rice <support@chennairice.test>',
  })
  // Earlier tests' unsent mail is not part of this test.
  await db.query(`update email_outbox set status = 'failed', last_error = 'test reset' where status = 'queued'`)
  const mailFor = (email) => inbox.filter((x) => x.rcpt.includes(email)).map((x) => x.m)
  const settle = async (email, count) => {
    for (let i = 0; i < 50 && mailFor(email).filter((m) => /Shipped|Tracking/.test(m.subject)).length < count; i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    await new Promise((r) => setTimeout(r, 200))
    return mailFor(email).filter((m) => /Shipped|Tracking/.test(m.subject))
  }
  const shipmentOf = async (orderId) =>
    (await db.query(`select * from shipments where order_id = $1 order by created_at desc limit 1`, [orderId])).rows[0]
  try {
    // A: dispatched with the courier and AWB: the email goes out at once.
    const { session: a } = await buy([{ id: 'rudra', qty: 1 }], buyer({ email: 'ship-a@example.com' }))
    const shipA = await api('POST', `/api/admin/orders/${a.orderId}/ship`, {
      token: wh, body: { method: 'courier', carrierName: 'bluedart', trackingNumber: '81234567801' },
    })
    assert.equal(shipA.status, 200, JSON.stringify(shipA.body))
    const [ma] = await settle('ship-a@example.com', 1)
    assert.equal(ma.subject, `Order Shipped - ${a.orderNumber}`)
    for (const part of [ma.text, ma.html]) {
      assert.ok(part.includes(shipA.body.shipment.shipment_number), 'shipment ID')
      assert.ok(part.includes('Blue Dart') && part.includes('81234567801'), 'partner and AWB')
      assert.ok(part.includes('https://www.bluedart.com/'), 'partner tracking page')
    }
    assert.ok(ma.html.includes('Track on Blue Dart') && ma.html.includes('paste it on the Blue Dart'))
    assert.ok(!/\{\{|<!-- IF/.test(ma.html), 'every placeholder and condition resolved')

    // B: one-tap dispatch: "Order Shipped" at once; the courier sheet then sends the tracking.
    const { session: b } = await buy([{ id: 'rudra', qty: 1 }], buyer({ email: 'ship-b@example.com' }))
    await api('POST', `/api/admin/orders/${b.orderId}/dispatched`, { token: wh, body: { on: true } })
    const [mb1] = await settle('ship-b@example.com', 1)
    assert.equal(mb1.subject, `Order Shipped - ${b.orderNumber}`)
    assert.ok(mb1.html.includes('To be confirmed') && mb1.html.includes('tracking details as soon as they are ready'))
    const csv = Buffer.from(`${b.orderNumber},D55566677,DTDC\n`)
    const up = await fetch(`${base}/api/admin/warehouse/tracker?apply=1&filename=agent.csv`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + wh, 'Content-Type': 'application/octet-stream' }, body: csv,
    })
    assert.equal((await up.json()).summary.updated, 1)
    const mb = await settle('ship-b@example.com', 2)
    assert.equal(mb.length, 2)
    assert.equal(mb[1].subject, `Tracking details - ${b.orderNumber}`)
    assert.ok(mb[1].html.includes('D55566677') && mb[1].html.includes('DTDC') && mb[1].html.includes('dtdc.com'))

    // C: one-tap, undo, dispatch again: the customer got one "Order Shipped", not two.
    const { session: c } = await buy([{ id: 'rudra', qty: 1 }], buyer({ email: 'ship-c@example.com' }))
    await api('POST', `/api/admin/orders/${c.orderId}/dispatched`, { token: wh, body: { on: true } })
    await settle('ship-c@example.com', 1)
    await api('POST', `/api/admin/orders/${c.orderId}/dispatched`, { token: wh, body: { on: false } })
    await api('POST', `/api/admin/orders/${c.orderId}/dispatched`, { token: wh, body: { on: true } })
    assert.equal((await settle('ship-c@example.com', 2)).length, 1)

    // D: tracking added by editing the shipment details: one tracking email, never repeated.
    const { session: d } = await buy([{ id: 'rudra', qty: 1 }], buyer({ email: 'ship-d@example.com' }))
    await api('POST', `/api/admin/orders/${d.orderId}/dispatched`, { token: wh, body: { on: true } })
    await settle('ship-d@example.com', 1)
    const shD = await shipmentOf(d.orderId)
    const details = { method: 'courier', carrierName: 'Trackon', trackingNumber: 'T99887766' }
    assert.equal((await api('PATCH', `/api/admin/shipments/${shD.id}/details`, { token: wh, body: details })).status, 200)
    const both = await settle('ship-d@example.com', 2)
    assert.equal(both.length, 2)
    assert.equal(both[1].subject, `Tracking details - ${d.orderNumber}`)
    assert.ok(both[1].html.includes('T99887766') && both[1].html.includes('Trackon Couriers') && both[1].html.includes(shD.shipment_number))
    // The same details saved again: no third email.
    await api('PATCH', `/api/admin/shipments/${shD.id}/details`, { token: wh, body: details })
    assert.equal((await settle('ship-d@example.com', 3)).length, 2)
  } finally {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_REQUIRE_TLS', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) delete process.env[k]
    await new Promise((r) => smtpd.close(r))
  }
})
