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
  assert.deepEqual(mail.map((m) => m.template), ['order_placed']) // the team's mail is the daily 9 o'clock summary

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
  // The Razorpay payment ID and method, in place of "Other References".
  assert.match(invoice.body, /Razorpay Payment ID/)
  assert.match(invoice.body, /pay_[A-Za-z0-9]+/)
  assert.match(invoice.body, /Paid online via Razorpay/)
  assert.doesNotMatch(invoice.body, /Other References/)

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
    assert.ok(!invoicePage.body.includes(shipmentId), 'no shipment ID on the invoice')
    // The company's own layout: Tax Invoice, GSTIN, HSN summary, amount in words; support email; no bank details.
    for (const text of ['Tax Invoice', '33AAFCC1691K1ZM', 'HSN/SAC', 'Amount Chargeable (in words)', 'support@chennairiceindustries.com', 'This is a Computer Generated Invoice']) {
      assert.ok(invoicePage.body.includes(text), 'invoice shows ' + text)
    }
    for (const text of ['Bank of Maharashtra', '60440715045', 'cgriceindustries@gmail.com']) {
      assert.ok(!invoicePage.body.includes(text), 'invoice leaves out ' + text)
    }
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

test('delivery charge: by PIN code region, per pack, with its GST on the invoice', async () => {
  // As the price list sets it up: a price and delivery charge per region.
  const { rows: [v] } = await db.query(
    `select v.id, v.price_paise from product_variants v join products p on p.id = v.product_id
      where p.slug = 'alibaba' and v.pack_kg = 10`)
  await db.query('update stock_levels set on_hand = on_hand + 10 where variant_id = $1', [v.id])
  await db.query(`insert into shipping_zones (code, name) values ('TN', 'Tamil Nadu'), ('SOUTH', 'South India')`)
  await db.query(`update shipping_zones set is_active = false, is_default = false where code not in ('TN', 'SOUTH')`)
  await db.query(`insert into variant_region_prices (variant_id, region, price_paise, delivery_paise) values
    ($1, 'TN', $2, 21000), ($1, 'SOUTH', $2, 40900)`, [v.id, v.price_paise])
  const quote = (pincode, qty = 2) =>
    api('POST', '/api/checkout/quote', { body: { pincode, items: [{ id: 'alibaba-10kg', qty }] } })
  try {
    const tn = await quote('641001')
    assert.equal(tn.status, 200, JSON.stringify(tn.body))
    assert.equal(tn.body.shipping, 420) // ₹210 × 2 packs
    assert.equal(tn.body.total, tn.body.subtotal + 420)
    assert.equal(tn.body.region.code, 'TN')
    assert.equal(tn.body.lines[0].delivery, 210)

    const kerala = await quote('682001', 1)
    assert.equal(kerala.body.shipping, 409)
    assert.equal(kerala.body.region.code, 'SOUTH')

    const delhi = await quote('110001', 1) // North: no active zone in this test
    assert.equal(delhi.status, 422)
    assert.match(delhi.body.error, /do not deliver to PIN code 110001/)
    assert.equal((await quote('744101', 1)).status, 422) // Andaman: never

    const noPin = await quote('', 1)
    assert.equal(noPin.status, 200)
    assert.equal(noPin.body.shipping, null)
    assert.equal(noPin.body.total, noPin.body.subtotal)

    const { session, verify } = await buy([{ id: 'alibaba-10kg', qty: 2 }])
    assert.equal(verify.status, 200, JSON.stringify(verify.body))
    assert.equal(session.amount, tn.body.total)
    const { rows: [o] } = await db.query('select * from orders where id = $1', [session.orderId])
    assert.equal(Number(o.shipping_paise), 42000)
    assert.equal(o.shipping_tax_rate_bp, 1800)

    const { issueInvoice } = await import('../lib/sales/operations.js')
    const inv = await issueInvoice(db, o)
    const { rows: [t] } = await db.query(
      'select sum(taxable_paise)::int as taxable, sum(cgst_paise + sgst_paise)::int as tax from order_items where order_id = $1', [o.id])
    // ₹420 incl. 18% GST = ₹355.93 taxable + ₹64.07 GST (CGST + SGST within Tamil Nadu).
    assert.equal(Number(inv.taxable_paise), t.taxable + 35593)
    assert.equal(Number(inv.cgst_paise) + Number(inv.sgst_paise), t.tax + 6407)
    assert.equal(Number(inv.igst_paise), 0)
    assert.equal(Number(inv.total_paise), Number(o.total_paise))
  } finally {
    await db.query('delete from variant_region_prices where variant_id = $1', [v.id])
    await db.query(`delete from shipping_zones where code in ('TN', 'SOUTH')`)
    await db.query(`update shipping_zones set is_active = true, is_default = true where code = 'ALL_INDIA'`)
  }
})

test('PIN code regions and the delivered-price sheets', async () => {
  const { regionForPincode } = await import('../lib/sales/regions.js')
  const cases = { '600001': 'TN', '641001': 'TN', '605001': 'TN', '682001': 'SOUTH', '560001': 'SOUTH', '500001': 'SOUTH',
    '530001': 'SOUTH', '110001': 'NORTH', '400001': 'NORTH', '700001': 'NORTH', '403001': 'NORTH', '781001': 'NE',
    '795001': 'NE', '737101': 'NE', '744101': null, '900001': null, '12345': null, '012345': null }
  for (const [pin, region] of Object.entries(cases)) assert.equal(regionForPincode(pin), region, pin)

  // Website price and delivery per region, exactly as on the sheets.
  const { packPricing } = await import('../db/apply-price-list.js')
  const sheet = [
    [5, 471, 619, undefined, 582, { TN: 54, SOUTH: 153, NORTH: 285, NE: 418 }],
    [5, 255, 349, 85, 340, { TN: 80, SOUTH: 179, NORTH: 311, NE: 444 }],
    [10, 930, 1209, undefined, 1050, { TN: 210, SOUTH: 409, NORTH: 673, NE: 937 }],
    [10, 566, 739, undefined, 686, { TN: 210, SOUTH: 409, NORTH: 673, NE: 937 }],
    [26, 2249, 2899, undefined, 2499, { TN: 437, SOUTH: 1124, NORTH: 1812, NE: 2843 }],
    [26, 1350, 1749, undefined, 1600, { TN: 437, SOUTH: 1124, NORTH: 1812, NE: 2843 }],
  ]
  for (const [kg, list, mrp, absorbed, website, delivery] of sheet) {
    const p = packPricing(kg, list, mrp, absorbed)
    assert.equal(p.website, website, `${kg} kg ₹${list}`)
    assert.deepEqual(p.delivery, delivery, `${kg} kg ₹${list}`)
  }
})

test('sales by source: ad links and referrers become a source, orders and visits roll up by campaign and ad', async () => {
  const { classify } = await import('../lib/sales/attribution.js')
  const c = (a) => classify(a).source
  assert.equal(c(null), 'direct')
  assert.equal(c({ utm_source: 'ig', utm_medium: 'paid', utm_campaign: 'Kitchidi Offer' }), 'meta_ads_instagram')
  assert.equal(c({ utm_source: 'fb', utm_medium: 'paid' }), 'meta_ads_facebook')
  assert.equal(c({ utm_source: 'facebook', utm_medium: 'cpc' }), 'meta_ads_facebook')
  assert.equal(c({ fbclid: true, utm_medium: 'paid', referrer: 'https://l.instagram.com/' }), 'meta_ads_instagram')
  assert.equal(c({ fbclid: true, referrer: 'https://lm.facebook.com/' }), 'facebook') // a post link, not an ad
  assert.equal(c({ referrer: 'https://www.instagram.com/' }), 'instagram')
  assert.equal(c({ gclid: true }), 'google_ads')
  assert.equal(c({ utm_source: 'google', utm_medium: 'cpc' }), 'google_ads')
  assert.equal(c({ referrer: 'https://www.google.co.in/' }), 'google_search')
  assert.equal(c({ referrer: 'https://web.whatsapp.com/' }), 'whatsapp')
  assert.equal(c({ referrer: 'https://example.org/' }), 'other_website')

  const ig = { utm_source: 'ig', utm_medium: 'paid', utm_campaign: 'Kitchidi Offer', utm_content: 'Reel 1', fbclid: true }
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await api('POST', '/api/traffic/visit', { body: ig })).body.source, 'meta_ads_instagram')
  }
  await api('POST', '/api/traffic/visit', { body: { gclid: true, utm_campaign: '123' } })

  const before = await api('GET', '/api/admin/warehouse/sources?days=7', { token: OWNER })
  assert.equal(before.status, 200, JSON.stringify(before.body))
  const beforeIg = before.body.campaigns.find((r) => r.source === 'meta_ads_instagram' && r.ad === 'Reel 1')
  assert.equal(beforeIg.visits, 3)
  assert.equal(beforeIg.orders, 0)

  const { rows: [v] } = await db.query(
    `select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'alibaba' and v.pack_kg = 10`)
  await db.query('update stock_levels set on_hand = on_hand + 5 where variant_id = $1', [v.id])
  const { session, verify } = await buy([{ id: 'alibaba-10kg', qty: 1 }], buyer({ attribution: ig }))
  assert.equal(verify.status, 200, JSON.stringify(verify.body))
  const { rows: [o] } = await db.query('select traffic_source, traffic_campaign, traffic_ad from orders where id = $1', [session.orderId])
  assert.deepEqual(o, { traffic_source: 'meta_ads_instagram', traffic_campaign: 'Kitchidi Offer', traffic_ad: 'Reel 1' })
  await buy([{ id: 'alibaba-10kg', qty: 1 }]) // no ad: direct

  const after = await api('GET', '/api/admin/warehouse/sources?days=7&product=alibaba', { token: OWNER })
  const row = after.body.campaigns.find((r) => r.source === 'meta_ads_instagram' && r.ad === 'Reel 1')
  assert.equal(row.orders, 1)
  assert.equal(row.packs, 1)
  assert.ok(row.revenue > 0)
  assert.ok(after.body.sources.find((s) => s.source === 'direct').orders >= 1)

  const list = await api('GET', `/api/admin/warehouse/sources/orders?days=7&source=meta_ads_instagram&campaign=${encodeURIComponent('Kitchidi Offer')}&ad=${encodeURIComponent('Reel 1')}`, { token: OWNER })
  assert.equal(list.body.orders.length, 1)
  assert.equal(list.body.orders[0].order_number, session.orderNumber)
})

test('contest sign-up form: saved with the ad it came from, one row per mobile, owner-only list and CSV', async () => {
  const ad = { utm_source: 'ig', utm_medium: 'paid', utm_campaign: 'Kitchidi Offer', utm_content: 'Reel 1', fbclid: true, landing: '/' }
  const bad = await api('POST', '/api/contest/lead', { body: { name: 'Priya', phone: '12345', email: 'priya@example.com' } })
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /mobile/)
  assert.equal((await api('POST', '/api/contest/lead', { body: { name: 'Priya', phone: '98765 43210', email: 'not-an-email' } })).status, 400)
  const ok = await api('POST', '/api/contest/lead', { body: { name: 'Priya S', phone: '+91 98765 43210', email: 'Priya@Example.com', attribution: ad, page: '/rice-products' } })
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  // Same mobile again: updated, not duplicated.
  await api('POST', '/api/contest/lead', { body: { name: 'Priya Sundar', phone: '9876543210', email: 'priya@example.com', attribution: { gclid: true } } })
  assert.equal((await api('GET', '/api/admin/warehouse/contest-leads', { token: tokens.sales })).status, 403)
  const list = await api('GET', '/api/admin/warehouse/contest-leads', { token: OWNER })
  assert.equal(list.body.leads.length, 1)
  const lead = list.body.leads[0]
  assert.equal(lead.name, 'Priya Sundar')
  assert.equal(lead.phone, '9876543210')
  assert.equal(lead.email, 'priya@example.com')
  assert.equal(lead.source, 'google_ads')
  assert.equal(lead.submissions, 2)
  const csv = await api('GET', '/api/admin/warehouse/contest-leads.csv', { token: OWNER })
  assert.match(csv.body, /Priya Sundar/)
  assert.match(csv.body, /Google Ads/)
})

test('contest sign-up with MSG91 OTP: only for ad visitors, wrong OTP refused, verified sign-up saved, limits per mobile', async () => {
  // A stand-in for MSG91: remembers the OTP it "texted" to each mobile.
  const http = await import('node:http')
  const sent = new Map()
  const calls = []
  const fake = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    calls.push(`${req.method} ${u.pathname} key=${req.headers.authkey}`)
    const mobile = u.searchParams.get('mobile')
    let ok = false
    if (req.method === 'POST' && u.pathname === '/api/v5/otp') { sent.set(mobile, '482913'); ok = u.searchParams.get('template_id') === 'tmpl-1' }
    if (req.method === 'GET' && u.pathname === '/api/v5/otp/retry') ok = sent.has(mobile)
    if (req.method === 'GET' && u.pathname === '/api/v5/otp/verify') ok = sent.get(mobile) === u.searchParams.get('otp')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(ok ? { type: 'success', message: 'ok' } : { type: 'error', message: 'OTP not match' }))
  })
  await new Promise((r) => fake.listen(0, r))
  Object.assign(process.env, { MSG91_AUTH_KEY: 'test-key', MSG91_OTP_TEMPLATE_ID: 'tmpl-1', MSG91_BASE_URL: 'http://127.0.0.1:' + fake.address().port })
  try {
    const metaAd = { utm_source: 'fb', utm_medium: 'paid_social', utm_campaign: 'Slogan', utm_content: 'Reel 2', fbclid: true }
    const who = { name: 'Meena R', phone: '9123456780', email: 'meena@example.com' }
    // Not from an ad: no SMS is spent.
    const organic = await api('POST', '/api/contest/otp', { body: { ...who, attribution: { referrer: 'https://www.google.com/' } } })
    assert.equal(organic.status, 403)
    const start = await api('POST', '/api/contest/otp', { body: { ...who, attribution: metaAd }, headers: { 'X-Forwarded-For': '10.9.0.1' } })
    assert.equal(start.status, 200, JSON.stringify(start.body))
    assert.deepEqual(start.body, { otpRequired: true, sent: true })
    assert.ok(calls.some((c) => c === 'POST /api/v5/otp key=test-key'))
    // Saving without, or with a wrong, OTP is refused.
    assert.equal((await api('POST', '/api/contest/lead', { body: { ...who, attribution: metaAd } })).status, 400)
    const wrong = await api('POST', '/api/contest/lead', { body: { ...who, otp: '111111', attribution: metaAd } })
    assert.equal(wrong.status, 400)
    assert.match(wrong.body.error, /OTP/)
    // Resend, then the right OTP saves a verified sign-up.
    assert.equal((await api('POST', '/api/contest/otp', { body: { ...who, attribution: metaAd, resend: true }, headers: { 'X-Forwarded-For': '10.9.0.1' } })).status, 200)
    const ok = await api('POST', '/api/contest/lead', { body: { ...who, otp: '482 913', attribution: metaAd } })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    const lead = (await api('GET', '/api/admin/warehouse/contest-leads', { token: OWNER })).body.leads.find((l) => l.phone === '9123456780')
    assert.equal(lead.phone_verified, true)
    assert.equal(lead.source, 'meta_ads_facebook')
    // Three OTPs per mobile in 15 minutes, then a polite refusal.
    await api('POST', '/api/contest/otp', { body: { ...who, attribution: metaAd }, headers: { 'X-Forwarded-For': '10.9.0.2' } })
    const limited = await api('POST', '/api/contest/otp', { body: { ...who, attribution: metaAd }, headers: { 'X-Forwarded-For': '10.9.0.3' } })
    assert.equal(limited.status, 429)
  } finally {
    for (const k of ['MSG91_AUTH_KEY', 'MSG91_OTP_TEMPLATE_ID', 'MSG91_BASE_URL']) delete process.env[k]
    await new Promise((r) => fake.close(r))
  }
})

test('mail automation endpoint: API key required, returns contest sign-ups, since gives only newer ones', async () => {
  process.env.AUTOMATION_API_KEY = 'auto-test-key-123'
  try {
    assert.equal((await api('GET', '/api/automation/contacts')).status, 401)
    assert.equal((await api('GET', '/api/automation/contacts', { headers: { 'X-API-Key': 'wrong' } })).status, 401)
    const all = await api('GET', '/api/automation/contacts', { headers: { 'X-API-Key': 'auto-test-key-123' } })
    assert.equal(all.status, 200, JSON.stringify(all.body))
    assert.ok(all.body.count >= 1)
    const c = all.body.contacts.find((x) => x.email === 'priya@example.com')
    assert.equal(c.phone, '+919876543210')
    assert.equal(c.first_name, 'Priya')
    assert.equal(c.list, 'super_slogan_contest')
    assert.ok(all.body.next_since)
    // A new sign-up after next_since is the only one returned next time.
    await api('POST', '/api/contest/lead', { body: { name: 'Arjun K', phone: '9988776655', email: 'arjun@example.com', attribution: { gclid: true } } })
    const newer = await api('GET', '/api/automation/contacts?since=' + encodeURIComponent(all.body.next_since), { headers: { 'X-API-Key': 'auto-test-key-123' } })
    assert.deepEqual(newer.body.contacts.map((x) => x.email), ['arjun@example.com'])
    assert.equal(newer.body.contacts[0].source_label, 'Google Ads')
    assert.equal((await api('GET', '/api/automation/contacts?since=yesterday', { headers: { 'X-API-Key': 'auto-test-key-123' } })).status, 400)
  } finally {
    delete process.env.AUTOMATION_API_KEY
  }
})

test('accounts team: sees invoices, payments, refunds and GST totals; cannot run the warehouse or change anything', async () => {
  const add = await api('POST', '/api/admin/staff', { token: OWNER, body: { email: 'accounts@x.test', fullName: 'Accounts person', role: 'accounts' } })
  assert.equal(add.status, 200, JSON.stringify(add.body))
  const ACC = 'accounts@x.test|uid-accounts'
  const me = await api('GET', '/api/admin/me', { token: ACC })
  assert.equal(me.body.role, 'accounts')
  assert.ok(me.body.permissions.includes('accounts.view'))
  assert.ok(!me.body.permissions.includes('warehouse.view'))

  const range = '?from=2000-01-01&to=2100-12-31'
  const sum = await api('GET', '/api/admin/accounts/summary' + range, { token: ACC })
  assert.equal(sum.status, 200, JSON.stringify(sum.body))
  assert.ok(sum.body.invoices >= 1)
  assert.ok(sum.body.received > 0)
  const inv = await api('GET', '/api/admin/accounts/invoices' + range, { token: ACC })
  assert.equal(inv.body.invoices.length, sum.body.invoices)
  const first = inv.body.invoices[0]
  assert.match(first.invoiceNumber, /\//)
  assert.match(first.paymentId, /^pay_/)
  // The register adds up to the summary.
  const total = inv.body.invoices.reduce((t, r) => t + r.total, 0)
  assert.equal(Math.round(total * 100), Math.round(sum.body.invoiced * 100))
  const csv = await api('GET', '/api/admin/accounts/invoices.csv' + range, { token: ACC })
  assert.match(csv.body, /Razorpay Payment ID/)
  assert.match(csv.body, new RegExp(first.invoiceNumber.replace(/\//g, '\/')))
  const pdf = await fetch(base + `/api/admin/orders/${first.orderId}/invoice.pdf`, { headers: { Authorization: 'Bearer ' + ACC } })
  assert.equal(pdf.headers.get('content-type'), 'application/pdf')
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF')
  const html = await api('GET', `/api/admin/orders/${first.orderId}/invoice`, { token: ACC })
  assert.match(html.body, /Razorpay Payment ID/)
  const pays = await api('GET', '/api/admin/accounts/payments' + range + '&status=paid', { token: ACC })
  assert.ok(pays.body.payments.every((p) => p.status === 'paid'))
  assert.equal((await api('GET', '/api/admin/accounts/refunds' + range, { token: ACC })).status, 200)
  // Read-only: no warehouse, staff, settings or refunds.
  assert.equal((await api('GET', '/api/admin/warehouse/dashboard', { token: ACC })).status, 403)
  assert.equal((await api('GET', '/api/admin/staff', { token: ACC })).status, 403)
  assert.equal((await api('POST', `/api/admin/orders/${first.orderId}/refunds`, { token: ACC, body: { amount: 1, reason: 'x' } })).status, 403)
  // Sales staff cannot see the accounts section.
  assert.equal((await api('GET', '/api/admin/accounts/summary', { token: tokens.sales })).status, 403)
  assert.equal((await api('GET', '/api/admin/accounts/summary?from=2026-13-01', { token: ACC })).status, 400)
})

test('accounts team can read the order list and its CSV, with amounts, but not dispatch or print slips', async () => {
  const ACC = 'accounts@x.test|uid-accounts'
  const list = await api('GET', '/api/admin/warehouse/orders?tab=all&limit=5', { token: ACC })
  assert.equal(list.status, 200, JSON.stringify(list.body))
  assert.ok(list.body.orders.length >= 1)
  assert.ok(list.body.orders.some((o) => o.total != null || o.amount != null || o.totalPaise != null || o.items?.some?.((i) => i.price != null)), 'amounts shown')
  const csv = await api('GET', '/api/admin/warehouse/orders.csv?tab=all', { token: ACC })
  assert.equal(csv.status, 200)
  const id = list.body.orders[0].id
  assert.equal((await api('GET', `/api/admin/orders/${id}/packing-slip`, { token: ACC })).status, 403)
  assert.equal((await api('POST', `/api/admin/orders/${id}/dispatched`, { token: ACC, body: { on: true } })).status, 403)
  // Plant staff (no warehouse, no accounts) still cannot list orders.
  const plant = await api('GET', '/api/admin/warehouse/orders?tab=all', { token: 'plant@x.test|uid-plant' })
  assert.equal(plant.status, 403)
})

test('delete order: owner and IT team only, and only a cancelled order that was never paid', async () => {
  // An abandoned checkout: placed, never paid, then expired by the job.
  const s = await api('POST', '/api/checkout/session', {
    body: { ...buyer({ name: 'Abandoned Cart', phone: '+91 90000 11111' }), items: [{ id: 'alibaba', qty: 1 }] },
    headers: { 'X-Forwarded-For': '10.77.0.1' },
  })
  assert.equal(s.status, 200, JSON.stringify(s.body))
  await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [s.body.orderId])
  await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
  const { rows: [o] } = await db.query('select status, payment_status from orders where id = $1', [s.body.orderId])
  assert.equal(o.status, 'cancelled')

  // Not for sales or accounts.
  assert.equal((await api('DELETE', `/api/admin/orders/${s.body.orderId}`, { token: tokens.sales })).status, 403)
  assert.equal((await api('DELETE', `/api/admin/orders/${s.body.orderId}`, { token: 'accounts@x.test|uid-accounts' })).status, 403)
  // A paid order can never be deleted.
  const { rows: [paid] } = await db.query(`select id from orders where payment_status = 'paid' limit 1`)
  const refused = await api('DELETE', `/api/admin/orders/${paid.id}`, { token: OWNER })
  assert.equal(refused.status, 409)
  assert.match(refused.body.error, /never paid/)

  const del = await api('DELETE', `/api/admin/orders/${s.body.orderId}`, { token: OWNER })
  assert.equal(del.status, 200, JSON.stringify(del.body))
  assert.equal(del.body.deleted, s.body.orderNumber)
  assert.equal((await db.query('select 1 from orders where id = $1', [s.body.orderId])).rowCount, 0)
  assert.equal((await db.query('select 1 from payments where order_id = $1', [s.body.orderId])).rowCount, 0)
  // Recorded in the audit log; the order ID stays used in the register.
  const { rows: [log] } = await db.query(`select details from staff_audit_log where action = 'order.delete' order by created_at desc limit 1`)
  assert.equal(log.details.orderNumber, s.body.orderNumber)
  assert.equal((await api('DELETE', `/api/admin/orders/${s.body.orderId}`, { token: OWNER })).status, 404)
})

test('delete order: a paid ₹1 test order can be deleted — its bag goes back, its payment and invoice go with it', async () => {
  const vid = await variantId('rudra')
  const { rows: [before] } = await db.query('select price_paise from product_variants where id = $1', [vid])
  const { rows: regions } = await db.query('select region, price_paise, delivery_paise from variant_region_prices where variant_id = $1', [vid])
  await db.query('update product_variants set price_paise = 100 where id = $1', [vid])
  await db.query('update variant_region_prices set price_paise = 100, delivery_paise = 0 where variant_id = $1', [vid])
  try {
    const held = (await stockOf('rudra')).reserved
    const { session } = await buy([{ id: 'rudra', qty: 1 }], buyer({ name: 'Rupee Test', email: 'rupee@example.com', phone: '9600011111' }))
    const { rows: [o] } = await db.query('select status, payment_status, total_paise from orders where id = $1', [session.orderId])
    assert.deepEqual(o, { status: 'placed', payment_status: 'paid', total_paise: 100 })
    assert.equal((await stockOf('rudra')).reserved, held + 1)
    // The warehouse list lets owner / IT see it is a test order (₹1).
    const list = await api('GET', '/api/admin/warehouse/orders?tab=all&limit=100', { token: OWNER })
    assert.equal(list.body.orders.find((r) => r.id === session.orderId).total, 1)

    assert.equal((await api('DELETE', `/api/admin/orders/${session.orderId}`, { token: tokens.sales })).status, 403)
    const del = await api('DELETE', `/api/admin/orders/${session.orderId}`, { token: OWNER })
    assert.equal(del.status, 200, JSON.stringify(del.body))
    assert.equal(del.body.testOrder, true)
    for (const t of ['orders', 'payments', 'invoices']) {
      assert.equal((await db.query(`select 1 from ${t} where ${t === 'orders' ? 'id' : 'order_id'} = $1`, [session.orderId])).rowCount, 0, t)
    }
    assert.equal((await stockOf('rudra')).reserved, held)
    const { rows: [log] } = await db.query(`select details from staff_audit_log where action = 'order.delete' order by created_at desc limit 1`)
    assert.equal(log.details.testOrder, true)
    assert.match(log.details.razorpayPayments, /^pay_/)
  } finally {
    await db.query('update product_variants set price_paise = $2 where id = $1', [vid, before.price_paise])
    for (const r of regions) {
      await db.query('update variant_region_prices set price_paise = $3, delivery_paise = $4 where variant_id = $1 and region = $2', [vid, r.region, r.price_paise, r.delivery_paise])
    }
  }
})

test('Sales Daddy CRM: contest sign-ups and enquiries are sent as leads; failures wait and are retried; no key, nothing sent', async () => {
  const http = await import('node:http')
  const got = []
  let down = false
  const fake = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (down) { res.statusCode = 503; return res.end(JSON.stringify({ ok: false, error: 'server_error' })) }
      got.push({ auth: req.headers.authorization, path: req.url, lead: body ? JSON.parse(body) : {} })
      res.end(JSON.stringify({ ok: true, leadId: 'lead-' + got.length, duplicate: false }))
    })
  })
  await new Promise((r) => fake.listen(0, r))
  const { pushCrmLead, sendCrmLeads } = await import('../lib/crm.js')
  try {
    // No key: kept, not sent.
    await pushCrmLead('contact', { name: 'Kumar', phone: '+91 98400 55555', email: 'kumar@example.com', note: 'Need 50 bags' })
    assert.equal(got.length, 0)
    const { rows: [waiting] } = await db.query(`select status from crm_outbox where payload->>'mobile' = '9840055555'`)
    assert.equal(waiting.status, 'queued')

    Object.assign(process.env, { SALESDADDY_API_KEY: 'sd_live_test', SALESDADDY_BASE_URL: 'http://127.0.0.1:' + fake.address().port })
    // A contest sign-up from a Meta ad goes straight in, tagged with its ad.
    const r = await api('POST', '/api/contest/lead', { body: { name: 'Lakshmi Devi', phone: '9123400001', email: 'lakshmi@example.com',
      attribution: { utm_source: 'ig', utm_medium: 'paid_social', utm_campaign: 'Slogan', utm_content: 'Reel 3', fbclid: true } } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const contest = got.find((g) => g.lead.mobile === '9123400001')
    assert.equal(contest.path, '/v1/ext/leads')
    assert.equal(contest.auth, 'Bearer sd_live_test')
    assert.equal(contest.lead.name, 'Lakshmi Devi')
    // An Instagram ad sign-up: Sales Daddy's own Instagram source; a stage, and tags on top.
    assert.equal(contest.lead.source, 'instagram')
    assert.deepEqual(contest.lead.tags, ['Contest sign-up', 'Instagram ad', 'Not converted'])
    assert.match(contest.lead.note, /Reel 3/)
    assert.ok(contest.lead.clientRef)

    // The waiting one goes out with the job. (Order notes from the earlier
    // tests are set aside so they do not fill this run's batch.)
    await db.query(`update crm_outbox set status = 'failed' where kind = 'order_event' and status = 'queued'`)
    await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
    assert.ok(got.some((g) => g.lead.mobile === '9840055555'))

    // Sales Daddy down: kept and retried later.
    down = true
    await pushCrmLead('bulk_order', { name: 'Ravi', company: 'Ravi Stores', phone: '9000012345', email: 'r@example.com', note: 'GSTIN 33ABCDE1234F1Z5' })
    const { rows: [retry] } = await db.query(`select status, attempts, last_error from crm_outbox where payload->>'mobile' = '9000012345'`)
    assert.equal(retry.status, 'queued')
    assert.equal(retry.attempts, 1)
    assert.match(retry.last_error, /503/)
    down = false
    await db.query(`update crm_outbox set next_try_at = now() where payload->>'mobile' = '9000012345'`)
    assert.deepEqual(await sendCrmLeads({ query: db.query }), { sent: 1, failed: 0 })
    const bulk = got.find((g) => g.lead.mobile === '9000012345')
    assert.equal(bulk.lead.company, 'Ravi Stores')
    assert.deepEqual(bulk.lead.tags, ['Bulk enquiry'])
    assert.equal(bulk.lead.source, 'website')
    const { rows: [done] } = await db.query(`select status, crm_lead_id from crm_outbox where payload->>'mobile' = '9000012345'`)
    assert.equal(done.status, 'sent')
    assert.ok(done.crm_lead_id)
  } finally {
    for (const k of ['SALESDADDY_API_KEY', 'SALESDADDY_BASE_URL']) delete process.env[k]
    await new Promise((r) => fake.close(r))
  }
})

test('Sales Daddy CRM: a lead it refuses (e.g. own number) is not retried', async () => {
  const http = await import('node:http')
  const fake = http.createServer((req, res) => {
    req.resume().on('end', () => { res.statusCode = 400; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: false, error: 'own_number_not_allowed' })) })
  })
  await new Promise((r) => fake.listen(0, r))
  Object.assign(process.env, { SALESDADDY_API_KEY: 'sd_live_test', SALESDADDY_BASE_URL: 'http://127.0.0.1:' + fake.address().port })
  try {
    const { pushCrmLead } = await import('../lib/crm.js')
    await pushCrmLead('contact', { name: 'Own Number', phone: '9876500000', note: 'x' })
    const { rows: [r] } = await db.query(`select status, last_error from crm_outbox where payload->>'mobile' = '9876500000'`)
    assert.equal(r.status, 'failed')
    assert.match(r.last_error, /own_number_not_allowed/)
  } finally {
    for (const k of ['SALESDADDY_API_KEY', 'SALESDADDY_BASE_URL']) delete process.env[k]
    await new Promise((r) => fake.close(r))
  }
})

test('Sales Daddy CRM: website orders land as notes on the customer lead — paid, each warehouse step, abandoned checkout', async () => {
  const http = await import('node:http')
  const got = []
  const fake = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => {
      got.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null })
      if (req.url === '/v1/ext/masters') return res.end(JSON.stringify({ ok: true, statuses: [{ id: 'st-new', name: 'New', stage_class: 'open' }, { id: '2f9888a3-692b-467a-803b-2d685c5a6651', name: 'Converted', stage_class: 'won' }] }))
      if (req.method === 'GET') return res.end(JSON.stringify({ ok: true, lead: { id: 'lead-77', stage_class: 'open', tags: [] } }))
      if (req.url.endsWith('/status')) return res.end(JSON.stringify({ ok: true }))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url.endsWith('/notes') ? { ok: true, noteId: 'n' + got.length } : { ok: true, leadId: 'lead-77', duplicate: false }))
    })
  })
  await new Promise((r) => fake.listen(0, r))
  const { sendCrmLeads } = await import('../lib/crm.js')
  try {
    // A paid order, then confirm → pack → ship with a tracking number.
    const { session } = await buy([{ id: 'rudra', qty: 2 }], buyer({ name: 'Selvi Murugan', email: 'selvi@example.com', phone: '+91 94430 12121', city: 'Salem' }))
    const id = session.orderId
    assert.equal((await api('POST', `/api/admin/orders/${id}/confirm`, { token: tokens.sales })).status, 200)
    assert.equal((await api('POST', `/api/admin/orders/${id}/pack`, { token: tokens.dispatch })).status, 200)
    const { rows: [batch] } = await db.query(
      `select b.id from production_batches b join product_variants v on v.id = b.variant_id join products p on p.id = v.product_id where p.slug = 'rudra'`)
    const { rows: [item] } = await db.query('select id from order_items where order_id = $1', [id])
    const shipped = await api('POST', `/api/admin/orders/${id}/ship`, {
      token: tokens.dispatch,
      body: { method: 'courier', carrierName: 'DTDC', trackingNumber: 'D555000111', expectedDelivery: '2026-10-25', batches: { [item.id]: batch.id } },
    })
    assert.equal(shipped.status, 200, JSON.stringify(shipped.body))

    // An abandoned checkout: never paid, released by the job.
    const gone = await api('POST', '/api/checkout/session', {
      body: { ...buyer({ name: 'Arun Kumar', email: 'arun@example.com', phone: '9944001122' }), items: [{ id: 'alibaba', qty: 1 }] },
      headers: { 'X-Forwarded-For': '10.79.0.1' },
    })
    await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [gone.body.orderId])
    await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })

    // All queued with the steps (the order is never held up by the CRM)...
    const { rows: queued } = await db.query(`select payload from crm_outbox where kind = 'order_event' and status = 'queued' order by created_at`)
    const selvi = queued.filter((q) => q.payload.lead.mobile === '9443012121').map((q) => q.payload.note)
    assert.equal(selvi.length, 4)
    assert.match(selvi[0], new RegExp(`Website order ${session.orderNumber} paid: ₹`))
    assert.match(selvi[0], /2 x Rudra 25 kg/)
    assert.match(selvi[0], /Ship to: Salem/)
    // How it was paid, from the payment the checkout saved (fake Razorpay: a card ending 1111).
    const { rows: [pay] } = await db.query(`select gateway_order_ref, gateway_payment_id from payments where order_id = $1 and status = 'paid'`, [id])
    assert.match(selvi[0], /Payment: Razorpay · Card \(card ••1111\)/)
    assert.match(selvi[0], new RegExp(`Razorpay order ID: ${pay.gateway_order_ref}`))
    assert.match(selvi[0], new RegExp(`Payment ID: ${pay.gateway_payment_id}`))
    assert.match(selvi[0], /Paid at: /)
    const paidPayload = queued.find((q) => q.payload.lead.mobile === '9443012121' && q.payload.won).payload
    assert.equal(paidPayload.custom.last_order_no, session.orderNumber)
    assert.equal(paidPayload.custom.payment_id, pay.gateway_payment_id)
    assert.equal(paidPayload.custom.razorpay_order_id, pay.gateway_order_ref)
    assert.equal(paidPayload.custom.zoho_session_id, undefined)
    assert.equal(paidPayload.custom.payment_method, 'Card')
    assert.equal(paidPayload.custom.payment_via, 'card ••1111')
    assert.match(paidPayload.custom.last_product, / kg/) // the "Last Product" column
    assert.deepEqual(paidPayload.lead.custom, {}) // not on the lead's create call: set by PATCH, merged
    assert.match(selvi[1], /confirmed/)
    assert.doesNotMatch(selvi[1], /Payment ID/)
    assert.match(selvi[2], /packed/)
    assert.match(selvi[3], /dispatched/)
    assert.match(selvi[3], /Tracking no: D555000111/)
    const arun = queued.find((q) => q.payload.lead.mobile === '9944001122').payload
    assert.match(arun.note, /checkout not completed/)
    // An abandoned checkout goes to the "Checkout not paid" stage; a paid order to Converted.
    assert.equal(arun.stage, 'checkoutNotPaid')
    assert.deepEqual(arun.lead.tags, ['Abandoned checkout']) // not "Website order"
    assert.ok(queued.find((q) => q.payload.lead.mobile === '9443012121' && q.payload.won))

    // ...then sent: for each, the lead (found or created by mobile), then the note on it, oldest first.
    Object.assign(process.env, { SALESDADDY_API_KEY: 'sd_live_test', SALESDADDY_BASE_URL: 'http://127.0.0.1:' + fake.address().port })
    const sent = await sendCrmLeads({ query: db.query, limit: 1000 })
    assert.equal(sent.failed, 0)
    const forSelvi = got.filter((g, i) => g.body?.mobile === '9443012121' || (g.path.endsWith('/notes') && got[i - 1]?.body?.mobile === '9443012121'))
    assert.deepEqual(forSelvi.map((g) => g.path), [
      '/v1/ext/leads', '/v1/ext/leads/lead-77/notes', '/v1/ext/leads', '/v1/ext/leads/lead-77/notes',
      '/v1/ext/leads', '/v1/ext/leads/lead-77/notes', '/v1/ext/leads', '/v1/ext/leads/lead-77/notes',
    ])
    assert.match(forSelvi[1].body.body, /paid: ₹/)
    assert.match(forSelvi[7].body.body, /Tracking no: D555000111/)
    // The paid order moved the lead to the Converted (won) stage, valued at the order amount.
    const { rows: [paidOrder] } = await db.query('select total_paise from orders where id = $1', [id])
    const won = got.filter((g) => g.path === '/v1/ext/leads/lead-77/status')
    assert.ok(won.some((g) => g.body.statusId === '2f9888a3-692b-467a-803b-2d685c5a6651' && g.body.convertedValue === Math.round(Number(paidOrder.total_paise) / 100)))
    // The payment fields went onto the lead itself, once (only the paid step carries them).
    const patched = got.filter((g) => g.method === 'PATCH' && g.path === '/v1/ext/leads/lead-77' && g.body.custom?.last_order_no === session.orderNumber)
    assert.equal(patched.length, 1)
    assert.equal(patched[0].body.custom.payment_gateway, 'Razorpay')
    const { rows: left } = await db.query(`select status from crm_outbox where kind = 'order_event' and status <> 'sent' and payload->'lead'->>'mobile' in ('9443012121', '9944001122')`)
    assert.equal(left.length, 0)
  } finally {
    for (const k of ['SALESDADDY_API_KEY', 'SALESDADDY_BASE_URL']) delete process.env[k]
    await new Promise((r) => fake.close(r))
  }
})

test('Sales Daddy CRM: payment details for the lead — Razorpay UPI with bank reference, net banking, Zoho', async () => {
  const { paymentDetails } = await import('../lib/crm.js')
  const upi = paymentDetails({
    gateway: 'razorpay', gateway_payment_id: 'pay_UPI123', amount_paise: 42000, method: 'upi', card_last4: null,
    raw: { vpa: 'selvi@okaxis', acquirer_data: { rrn: '429011223344', upi_transaction_id: 'AXIS77' } }, paid_at: '2026-10-22T08:45:00Z',
  })
  assert.deepEqual(
    { gateway: upi.gateway, method: upi.method, via: upi.via, paymentId: upi.paymentId, bankRef: upi.bankRef },
    { gateway: 'Razorpay', method: 'UPI', via: 'selvi@okaxis', paymentId: 'pay_UPI123', bankRef: '429011223344' })
  const nb = paymentDetails({ gateway: 'razorpay', gateway_payment_id: 'pay_NB1', amount_paise: 100, method: 'netbanking', raw: { bank: 'HDFC', acquirer_data: { bank_transaction_id: 'HD998' } } })
  assert.equal(nb.method, 'Net banking')
  assert.equal(nb.via, 'HDFC')
  assert.equal(nb.bankRef, 'HD998')
  const zoho = paymentDetails({ gateway: 'zoho_payments', gateway_payment_id: 'zp_9', amount_paise: 100, method: null, raw: { payments: [{ status: 'succeeded', payment_method: 'upi' }] } })
  assert.equal(zoho.gateway, 'Zoho Payments')
  assert.equal(zoho.method, 'UPI')
  assert.equal(paymentDetails(null), null)
})

test('Sales Daddy CRM: a repeat customer — the enquiry goes on their existing lead as a note', async () => {
  const http = await import('node:http')
  const got = []
  const fake = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => {
      got.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null })
      res.setHeader('content-type', 'application/json')
      if (req.url.endsWith('/notes')) return res.end(JSON.stringify({ ok: true }))
      res.end(JSON.stringify({ ok: true, leadId: 'lead-9', duplicate: true }))
    })
  })
  await new Promise((r) => fake.listen(0, r))
  Object.assign(process.env, { SALESDADDY_API_KEY: 'sd_live_test', SALESDADDY_BASE_URL: 'http://127.0.0.1:' + fake.address().port })
  try {
    const { pushCrmLead } = await import('../lib/crm.js')
    await pushCrmLead('bulk_order', { name: 'Meena', company: 'Meena Traders', phone: '9790012345', note: 'Bulk order enquiry: 40 bags' })
    // An existing lead: its tags are read and the new one added, then the note.
    assert.deepEqual(got.map((g) => g.method + ' ' + g.path), ['POST /v1/ext/leads', 'GET /v1/ext/leads/lead-9', 'PATCH /v1/ext/leads/lead-9', 'POST /v1/ext/leads/lead-9/notes'])
    assert.deepEqual(got[0].body.tags, ['Bulk enquiry'])
    assert.deepEqual(got[2].body.tags, ['Bulk enquiry'])
    assert.match(got[3].body.body, /40 bags/)
    const { rows: [r] } = await db.query(`select status from crm_outbox where payload->>'mobile' = '9790012345'`)
    assert.equal(r.status, 'sent')
  } finally {
    for (const k of ['SALESDADDY_API_KEY', 'SALESDADDY_BASE_URL']) delete process.env[k]
    await new Promise((r) => fake.close(r))
  }
})

test('Sales Daddy CRM: stages — sign-up → "Signed up – not bought", unpaid checkout → "Checkout not paid", paid → Converted; only ever forward', async () => {
  const http = await import('node:http')
  const S = { new: 'st-new', signedUp: 'st-su', checkout: 'st-cnp', contacted: 'st-c', won: '2f9888a3-692b-467a-803b-2d685c5a6651' }
  const got = []
  let status = S.new
  const fake = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => {
      got.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null })
      res.setHeader('content-type', 'application/json')
      if (req.url === '/v1/ext/masters') return res.end(JSON.stringify({ ok: true, statuses: [
        { id: S.new, name: 'New', stage_class: 'open', sort: 0 }, { id: S.signedUp, name: 'Signed up – not bought', stage_class: 'open', sort: 1 },
        { id: S.checkout, name: 'Checkout not paid', stage_class: 'open', sort: 2 }, { id: S.contacted, name: 'Contacted', stage_class: 'working', sort: 3 },
        { id: S.won, name: 'Converted', stage_class: 'won', sort: 8 }] }))
      if (req.method === 'GET') return res.end(JSON.stringify({ ok: true, lead: { id: 'lead-s', status_id: status, stage_class: status === S.won ? 'won' : 'open' } }))
      if (req.url.endsWith('/status')) { status = JSON.parse(body).statusId; return res.end(JSON.stringify({ ok: true })) }
      if (req.url.endsWith('/notes')) return res.end(JSON.stringify({ ok: true }))
      res.end(JSON.stringify({ ok: true, leadId: 'lead-s', duplicate: true }))
    })
  })
  await new Promise((r) => fake.listen(0, r))
  const { sendCrmLeads } = await import('../lib/crm.js')
  const URL = 'http://127.0.0.1:' + fake.address().port
  // Each step is queued with Sales Daddy switched off, then sent — so the order is exact.
  const step = async (fn) => {
    delete process.env.SALESDADDY_API_KEY
    await fn()
    Object.assign(process.env, { SALESDADDY_API_KEY: 'sd_live_test', SALESDADDY_BASE_URL: URL })
    got.length = 0
    await sendCrmLeads({ query: db.query, limit: 1000 })
    return got.filter((g) => g.path === '/v1/ext/leads/lead-s/status').map((g) => g.body)
  }
  const signUp = () => api('POST', '/api/contest/lead', { body: { name: 'Kavya', phone: '9566012345', email: 'kavya@example.com',
    attribution: { utm_source: 'ig', utm_medium: 'paid_social', utm_campaign: 'Slogan', fbclid: true } }, headers: { 'X-Forwarded-For': '10.81.0.1' } })
  try {
    await db.query(`update crm_outbox set status = 'failed' where status = 'queued'`) // earlier tests' rows
    // 1. Ad sign-up: New → "Signed up – not bought", with its tags.
    let moved = await step(signUp)
    assert.deepEqual(moved, [{ statusId: S.signedUp }])
    const lead = got.find((g) => g.method === 'POST' && g.path === '/v1/ext/leads').body
    assert.deepEqual(lead.tags, ['Contest sign-up', 'Instagram ad', 'Not converted'])
    assert.equal(lead.stage, undefined) // ours, never sent to Sales Daddy
    assert.equal(lead.source, 'instagram')

    // 2. Pressed Pay, never paid: → "Checkout not paid".
    moved = await step(async () => {
      const s = await api('POST', '/api/checkout/session', { body: { ...buyer({ name: 'Kavya', email: 'kavya@example.com', phone: '9566012345' }), items: [{ id: 'alibaba', qty: 1 }] }, headers: { 'X-Forwarded-For': '10.81.0.2' } })
      await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [s.body.orderId])
      delete process.env.SALESDADDY_API_KEY
      await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
    })
    assert.deepEqual(moved, [{ statusId: S.checkout }])

    // 3. The team calls (Contacted); signing up again does not pull the lead back.
    status = S.contacted
    moved = await step(signUp)
    assert.deepEqual(moved, [])

    // 4. Pays: → Converted with the order amount, once; a second order leaves it there.
    let order
    moved = await step(async () => { order = (await buy([{ id: 'alibaba', qty: 1 }], buyer({ name: 'Kavya', email: 'kavya@example.com', phone: '9566012345' }))).session })
    const { rows: [paid] } = await db.query('select total_paise from orders where id = $1', [order.orderId])
    assert.deepEqual(moved, [{ statusId: S.won, convertedValue: Math.round(Number(paid.total_paise) / 100) }])
    assert.ok(got.some((g) => g.path.endsWith('/notes') && g.body.body.includes(order.orderNumber + ' paid')))
    moved = await step(() => buy([{ id: 'alibaba', qty: 1 }], buyer({ name: 'Kavya', email: 'kavya@example.com', phone: '9566012345' })))
    assert.deepEqual(moved, [])

    // 5. A buyer signing up is not put back to "Signed up – not bought".
    moved = await step(signUp)
    assert.deepEqual(moved, [])
  } finally {
    for (const k of ['SALESDADDY_API_KEY', 'SALESDADDY_BASE_URL']) delete process.env[k]
    await new Promise((r) => fake.close(r))
  }
})

test('courier label: ship-to, items and the courier tracking number for the warehouse — no prices', async () => {
  const { session } = await buy([{ id: 'alibaba', qty: 2 }], buyer({ name: 'Label Test', email: 'label@example.com', phone: '9600022222', city: 'Madurai' }))
  const r = await api('GET', `/api/admin/orders/${session.orderId}/label`, { token: tokens.dispatch })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.orderNumber, session.orderNumber)
  assert.equal(r.body.name, 'Label Test')
  assert.equal(r.body.address.city, 'Madurai')
  assert.equal(r.body.paymentStatus, 'paid')
  assert.deepEqual(r.body.items.map((i) => i.qty), [2])
  assert.equal(r.body.shipment, null) // not dispatched yet: the label leaves the courier blank
  assert.doesNotMatch(JSON.stringify(r.body), /price|paise|total/i)
  assert.equal((await api('GET', `/api/admin/orders/${session.orderId}/label`)).status, 401)
})

test('AskEva → WhatsApp contacts → Sales Daddy: webhook saves the contact, queues a lead once a day, ignores receipts; export import', async () => {
  process.env.ASKEVA_WEBHOOK_KEY = 'askeva-hook-test'
  try {
    const meta = (from, name, body, ts) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
      contacts: [{ wa_id: from, profile: { name } }], messages: [{ from, timestamp: String(ts), type: 'text', text: { body } }] } }] }] })
    const now = Math.floor(Date.now() / 1000)
    assert.equal((await api('POST', '/api/askeva/webhook', { body: meta('919751591220', 'Samiha', 'Hi', now) })).status, 401)
    assert.equal((await api('POST', '/api/askeva/webhook?key=wrong', { body: meta('919751591220', 'Samiha', 'Hi', now) })).status, 401)

    const r = await api('POST', '/api/askeva/webhook?key=askeva-hook-test', { body: meta('919751591220', 'Samiha', 'Hi, price of 26 kg Ponni?', now) })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.messages, 1)
    const { rows: [c] } = await db.query(`select * from whatsapp_contacts where phone = '9751591220'`)
    assert.equal(c.name, 'Samiha')
    assert.equal(c.messages, 1)
    assert.match(c.first_message, /26 kg Ponni/)
    const crm = async () => (await db.query(`select payload from crm_outbox where kind = 'whatsapp_chat' and payload->>'mobile' = '9751591220'`)).rows
    const [lead] = await crm()
    assert.equal(lead.payload.source, 'whatsapp')
    assert.deepEqual(lead.payload.tags, ['whatsapp'])
    assert.match(lead.payload.note, /New WhatsApp chat[\s\S]*26 kg Ponni/)

    // More messages the same day: counted, but no second note to Sales Daddy.
    await api('POST', '/api/askeva/webhook?key=askeva-hook-test', { body: meta('919751591220', 'Samiha', 'Do you deliver to Salem?', now + 60) })
    assert.equal((await db.query(`select messages, last_message from whatsapp_contacts where phone = '9751591220'`)).rows[0].messages, 2)
    assert.equal((await crm()).length, 1)
    // A day later: a new note.
    await db.query(`update whatsapp_contacts set crm_noted_at = now() - interval '25 hours' where phone = '9751591220'`)
    await api('POST', '/api/askeva/webhook?key=askeva-hook-test', { body: meta('919751591220', 'Samiha', 'Ordered!', now + 120) })
    assert.equal((await crm()).length, 2)

    // A flat payload works too; delivery receipts (no message) change nothing.
    const flat = await api('POST', '/api/askeva/webhook?key=askeva-hook-test', { body: { from: '917708749128', name: 'Anu Ak', message: 'QR scan panna mudiyala', timestamp: now } })
    assert.equal(flat.body.messages, 1)
    const receipt = await api('POST', '/api/askeva/webhook?key=askeva-hook-test', { body: { entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'read' }] } }] }] } })
    assert.equal(receipt.body.messages, 0)
    // AskEva's Test Run (Meta's sample: John Doe, +1 555…) is answered but saved as no contact.
    const sample = { object: 'whatsapp_business_account', entry: [{ id: '1234567890', changes: [{ value: { messaging_product: 'whatsapp',
      metadata: { display_phone_number: '15551234567', phone_number_id: '123456789012345' },
      contacts: [{ profile: { name: 'John Doe' }, wa_id: '15557654321' }], messages: [{ from: '15557654321', id: 'wamid.x', timestamp: String(now), type: 'text', text: { body: 'Hello' } }] } }] }] }
    const test = await api('POST', '/api/askeva/webhook', { body: sample, headers: { 'X-API-Key': 'askeva-hook-test' } })
    assert.equal(test.status, 200)
    assert.equal(test.body.messages, 0)
    assert.equal((await db.query(`select 1 from whatsapp_contacts where phone like '%5557654321'`)).rowCount, 0)
    assert.ok((await db.query('select count(*)::int n from askeva_events')).rows[0].n >= 5)

    // The one-time import of AskEva's export.
    const { importAskevaContacts } = await import('../lib/askeva-inbound.js')
    const res = await importAskevaContacts([
      { name: 'Dhinesh', phone: '917810091766', lastMessage: 'Hi, I am interested', lastMessageAt: '2026-10-20T12:30:45Z' },
      { name: 'Samiha', phone: '919751591220', lastMessage: 'image', lastMessageAt: '2026-10-21T04:25:18Z' }, // already here, noted today
      { name: 'No number', phone: '' },
    ])
    assert.deepEqual(res, { saved: 2, queued: 1, skipped: 1 })
    const { rows: [d] } = await db.query(`select source, messages from whatsapp_contacts where phone = '7810091766'`)
    assert.deepEqual(d, { source: 'import', messages: 0 })
  } finally {
    delete process.env.ASKEVA_WEBHOOK_KEY
  }
})

test('daily summary: tables in the email and the same lists as an Excel attachment', async () => {
  const { session } = await buy([{ id: 'alibaba', qty: 1 }], buyer({ name: 'Waiting Wilma', email: 'wilma@example.com', phone: '9600033333' }))
  await db.query(`update orders set placed_at = now() - interval '5 hours' where id = $1`, [session.orderId])
  const { buildDigest, digestWorkbook } = await import('../lib/sales/digest.js')
  const d = await buildDigest(new Date(Date.now() - 24 * 3600000), new Date(), db.query)
  assert.ok(d)
  assert.match(d.html, /<table/)
  assert.match(d.html, /Orders waiting too long/)
  assert.ok(d.html.includes(session.orderNumber))
  assert.match(d.text, new RegExp(session.orderNumber)) // plain-text copy kept
  assert.equal(d.attachments[0].kind, 'digest')
  assert.ok(d.attachments[0].data.waiting.some((r) => r.order === session.orderNumber && r.customer === 'Waiting Wilma'))

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await digestWorkbook(d.attachments[0].data))
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'New paid orders', 'Cancelled', 'Waiting too long'])
  assert.doesNotMatch(d.html + d.text + d.subject, /low stock/i) // left out of the summary (owner, 22 Oct 2026)
  const waiting = wb.getWorksheet('Waiting too long')
  assert.equal(waiting.getRow(1).getCell(1).value, 'Order')
  const found = []
  waiting.eachRow((row, i) => { if (i > 1) found.push(row.getCell(1).value) })
  assert.ok(found.includes(session.orderNumber))
})

test('NeoDove: not-converted sign-ups go to NeoDove once; call results come back as Qualified / Not qualified and go on to Sales Daddy; a purchase converts', async () => {
  const http = await import('node:http')
  const neo = []
  const fakeNeo = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => { neo.push(JSON.parse(body)); res.end('OK') })
  })
  const S = { new: 'st-new', signedUp: 'st-su', qualified: 'st-q', notQualified: 'st-nq', contacted: 'st-c', won: 'st-won' }
  const sd = []
  let status = S.signedUp
  const fakeSd = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c)).on('end', () => {
      sd.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null })
      res.setHeader('content-type', 'application/json')
      if (req.url === '/v1/ext/masters') return res.end(JSON.stringify({ ok: true, statuses: [
        { id: S.new, name: 'New', stage_class: 'open', sort: 0 }, { id: S.signedUp, name: 'Signed up – not bought', stage_class: 'open', sort: 1 },
        { id: S.qualified, name: 'Qualified', stage_class: 'working', sort: 3 }, { id: S.contacted, name: 'Contacted', stage_class: 'working', sort: 4 },
        { id: S.won, name: 'Converted', stage_class: 'won', sort: 7 }, { id: S.notQualified, name: 'Not qualified', stage_class: 'lost', sort: 10 }] }))
      if (req.method === 'GET') return res.end(JSON.stringify({ ok: true, lead: { status_id: status, stage_class: status === S.won ? 'won' : 'open' } }))
      if (req.url.endsWith('/status')) { status = JSON.parse(body).statusId; return res.end(JSON.stringify({ ok: true })) }
      if (req.url.endsWith('/notes')) return res.end(JSON.stringify({ ok: true }))
      res.end(JSON.stringify({ ok: true, leadId: 'lead-n', duplicate: true }))
    })
  })
  await new Promise((r) => fakeNeo.listen(0, r))
  await new Promise((r) => fakeSd.listen(0, r))
  const { classifyDisposition } = await import('../lib/neodove.js')
  const { sendCrmLeads } = await import('../lib/crm.js')
  Object.assign(process.env, { NEODOVE_ENDPOINT: `http://127.0.0.1:${fakeNeo.address().port}/campaign/abc`, NEODOVE_WEBHOOK_KEY: 'neo-hook-test' })
  const hook = (body, key = 'neo-hook-test') => api('POST', '/api/neodove/webhook', { body, headers: key ? { 'X-API-Key': key } : {} })
  const sdStatus = async () => {
    Object.assign(process.env, { SALESDADDY_API_KEY: 'sd_live_test', SALESDADDY_BASE_URL: `http://127.0.0.1:${fakeSd.address().port}` })
    sd.length = 0
    await sendCrmLeads({ query: db.query, limit: 1000 })
    delete process.env.SALESDADDY_API_KEY
    return { moved: sd.filter((g) => g.path.endsWith('/status')).map((g) => g.body.statusId), notes: sd.filter((g) => g.path.endsWith('/notes')).map((g) => g.body.body) }
  }
  try {
    assert.equal(classifyDisposition('Not Interested'), 'not_qualified')
    assert.equal(classifyDisposition('Interested - call back'), 'qualified')
    assert.equal(classifyDisposition('Busy'), null)
    await db.query(`update crm_outbox set status = 'failed' where status = 'queued'`)

    // 1. A WhatsApp-link sign-up (not a buyer) → not_converted, sent to the NeoDove campaign once.
    const signUp = () => api('POST', '/api/contest/lead', { body: { name: 'Divya R', phone: '9500044444', email: 'divya@example.com',
      attribution: { utm_source: 'whatsapp', utm_campaign: 'Diwali' } }, headers: { 'X-Forwarded-For': '10.82.0.1' } })
    assert.equal((await signUp()).status, 200)
    assert.equal(neo.length, 1)
    assert.deepEqual({ name: neo[0].name, mobile: neo[0].mobile, Source: neo[0].Source, Campaign: neo[0].Campaign }, { name: 'Divya R', mobile: 9500044444, Source: 'WhatsApp', Campaign: 'Diwali' })
    const { rows: [ls] } = await db.query(`select status, neodove_sent_at from lead_status where mobile = '9500044444'`)
    assert.equal(ls.status, 'not_converted')
    assert.ok(ls.neodove_sent_at)
    await signUp()
    assert.equal(neo.length, 1) // never twice

    // 2. Webhook: wrong key refused; "Interested" → qualified, note + Qualified stage in Sales Daddy.
    assert.equal((await hook({ mobile: '9500044444', disposition: 'Interested' }, 'wrong')).status, 401)
    assert.equal((await hook({ mobile: '9500044444', disposition: 'Interested' }, null)).status, 401)
    const r = await hook({ data: { lead: { mobile: '+91 95000 44444', name: 'Divya R' }, disposition_name: 'Interested', remarks: 'Wants 26 kg next week', agent_name: 'Priya' } })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.results, 1)
    assert.equal((await db.query(`select status from lead_status where mobile = '9500044444'`)).rows[0].status, 'qualified')
    // Tagged "NeoDove call"; a number Sales Daddy does not have is created as Manual, not Website.
    const { rows: [call] } = await db.query(`select payload from crm_outbox where kind = 'call_result' order by id desc limit 1`)
    assert.deepEqual([call.payload.lead.tags, call.payload.lead.source], [['NeoDove call'], 'manual'])
    assert.deepEqual(call.payload.custom, { neodove_agent: 'Priya', neodove_result: 'Interested · Qualified' }) // NeoDove Agent / Result columns
    let out = await sdStatus()
    assert.deepEqual(out.moved, [S.qualified])
    assert.ok(out.notes.some((n) => /NeoDove call: Interested · Qualified[\s\S]*Wants 26 kg next week[\s\S]*By Priya/.test(n)), JSON.stringify(out.notes))

    // 3. A bare attempt (Busy) is noted, nothing changes; a later "Not interested" → not_qualified.
    await hook({ mobile: '9500044444', disposition: 'Busy' })
    assert.equal((await db.query(`select status, calls from lead_status where mobile = '9500044444'`)).rows[0].status, 'qualified')
    out = await sdStatus()
    assert.deepEqual(out.moved, [])
    assert.ok(out.notes.some((n) => /NeoDove call: Busy/.test(n)))
    await hook({ mobile: '9500044444', disposition: 'Not Interested', remark: 'Buys locally' })
    assert.equal((await db.query(`select status from lead_status where mobile = '9500044444'`)).rows[0].status, 'not_qualified')
    out = await sdStatus()
    assert.deepEqual(out.moved, [S.notQualified])

    // 3b. NeoDove's own format (from its Webhook Setup sample): the stage name is the result, the numeric
    // lead_status code is ignored, and "Lead Create" echoes are not calls.
    const { parseCallResults } = await import('../lib/neodove.js')
    const sample = { name: 'Neodove', mobile: '9509624540', lead_id: 'ae8ef37e', campaign_id: 'be8ef37e', lead_status: '6', call_connected: 'false', lead_stage_name: 'Open', time: '1638806214940', event_name: 'LEAD_DISPOSE' }
    assert.deepEqual(parseCallResults(sample).map((x) => [x.mobile, x.disposition, x.connected]), [['9509624540', 'Open', false]])
    assert.equal(parseCallResults({ ...sample, lead_stage_name: '' })[0].disposition, 'Not connected')
    assert.equal(parseCallResults({ ...sample, lead_stage_name: 'Interested', call_connected: 'true' })[0].disposition, 'Interested')
    assert.deepEqual(parseCallResults({ ...sample, event_name: 'LEAD_CREATE' }), [])
    assert.equal(classifyDisposition('sent photo on whatsapp'), null)
    // A real NeoDove call: name "N/A", remark in dispose_remarks; the remark decides when the stage doesn't.
    const real = parseCallResults({ ...sample, name: 'N/A', lead_stage_name: 'Fresh Inquiry', call_connected: null, dispose_remarks: 'invalid no', follow_up_date_time: '23/10/2026, 00:59 pm', campaign_name: 'Campaign Oct 22', agent_name: 'Gayathri D' })[0]
    assert.deepEqual([real.name, real.disposition, real.remark, real.agent, real.followUp], [null, 'Fresh Inquiry', 'invalid no', 'Gayathri D', '23/10/2026, 00:59 pm'])
    await hook({ ...sample, mobile: '9500044444', lead_stage_name: 'Interested', call_connected: 'true' })
    assert.equal((await db.query(`select status from lead_status where mobile = '9500044444'`)).rows[0].status, 'qualified')
    out = await sdStatus()
    assert.deepEqual(out.moved, [S.qualified])

    // 4. The team moved it on (Contacted): a call result no longer moves the stage.
    status = S.contacted
    await hook({ mobile: '9500044444', disposition: 'Interested' })
    out = await sdStatus()
    assert.deepEqual(out.moved, [])

    // 5. They buy with the same mobile → converted, and a later call cannot change that.
    await buy([{ id: 'alibaba', qty: 1 }], buyer({ name: 'Divya R', email: 'divya@example.com', phone: '9500044444' }))
    assert.equal((await db.query(`select status from lead_status where mobile = '9500044444'`)).rows[0].status, 'converted')
    await hook({ mobile: '9500044444', disposition: 'Not interested' })
    assert.equal((await db.query(`select status from lead_status where mobile = '9500044444'`)).rows[0].status, 'converted')

    // 6. With no NeoDove link set, sign-ups wait in the queue.
    delete process.env.NEODOVE_ENDPOINT
    await api('POST', '/api/contest/lead', { body: { name: 'Queued Q', phone: '9500055555', email: 'queued@example.com', attribution: { utm_source: 'whatsapp' } }, headers: { 'X-Forwarded-For': '10.82.0.2' } })
    assert.equal((await db.query(`select status from neodove_outbox where mobile = '9500055555'`)).rows[0].status, 'queued')
    assert.ok((await db.query('select count(*)::int n from neodove_events')).rows[0].n >= 5) // the 2 refused calls are not stored
  } finally {
    for (const k of ['NEODOVE_ENDPOINT', 'NEODOVE_WEBHOOK_KEY', 'SALESDADDY_API_KEY', 'SALESDADDY_BASE_URL']) delete process.env[k]
    await new Promise((r) => fakeNeo.close(r))
    await new Promise((r) => fakeSd.close(r))
  }
})

test('order list: a cancelled, never-paid order is dated by when it was attempted', async () => {
  const s = await api('POST', '/api/checkout/session', {
    body: { ...buyer({ name: 'Never Paid', phone: '+91 90000 33333' }), items: [{ id: 'alibaba', qty: 1 }] },
    headers: { 'X-Forwarded-For': '10.78.0.1' },
  })
  await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [s.body.orderId])
  await api('POST', '/api/jobs/run', { headers: { 'X-Job-Token': 'job-token-for-tests' } })
  const list = await api('GET', '/api/admin/warehouse/orders?tab=cancelled&limit=50', { token: OWNER })
  const row = list.body.orders.find((o) => o.orderNumber === s.body.orderNumber)
  assert.ok(row, 'listed under cancelled')
  assert.ok(row.placedAt, 'has a date and time')
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const dated = await api('GET', `/api/admin/warehouse/orders?tab=cancelled&from=${today}&to=${today}&limit=50`, { token: OWNER })
  assert.ok(dated.body.orders.some((o) => o.orderNumber === s.body.orderNumber), 'found by the date filter')
})

test('/admin enquiries: owner, admin, IT and sales only; empty when Supabase is not set up here', async () => {
  const list = await api('GET', '/api/admin/enquiries', { token: OWNER })
  assert.equal(list.status, 200, JSON.stringify(list.body))
  assert.deepEqual(list.body.contact, [])
  assert.equal(list.body.configured, false)
  assert.equal((await api('GET', '/api/admin/enquiries', { token: tokens.sales })).status, 200)
  assert.equal((await api('GET', '/api/admin/enquiries', { token: tokens.dispatch })).status, 403)
  assert.equal((await api('GET', '/api/admin/enquiries', { token: 'accounts@x.test|uid-accounts' })).status, 403)
  const bad = await api('PATCH', '/api/admin/enquiries/contact/00000000-0000-0000-0000-000000000000', { token: OWNER, body: { status: 'maybe' } })
  assert.match(bad.body.error, /spam/)
  assert.equal(bad.status, 400)
})

test('expo QR lead form: validated, one row per mobile, goes to the CRM outbox, and is listed with the customers as Expo QR', async () => {
  const good = { name: 'Ramesh Kumar', phone: '98765 22001', email: '', location: 'Coimbatore', buyerType: 'horeca', requirements: ['raw_rice', 'idly_rice'], campaign: 'Expo Oct!' }
  for (const [bad, message] of [
    [{ ...good, name: '' }, /name/i],
    [{ ...good, phone: '12345' }, /10-digit/],
    [{ ...good, email: 'nope' }, /email/i],
    [{ ...good, location: '' }, /city or area/i],
    [{ ...good, buyerType: 'wholesaler' }, /Distributor, HORECA/],
    [{ ...good, requirements: [] }, /rice you need/],
  ]) {
    const r = await api('POST', '/api/expo/lead', { body: bad })
    assert.equal(r.status, 400)
    assert.match(r.body.error, message)
  }

  assert.deepEqual((await api('POST', '/api/expo/lead', { body: good })).body, { ok: true })
  // The same mobile again updates its row instead of adding one.
  await api('POST', '/api/expo/lead', { body: { ...good, buyerType: 'distributor', requirements: ['boiled_rice'] } })
  const { rows } = await db.query(`select * from expo_leads where phone = '9876522001'`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].buyer_type, 'distributor')
  assert.deepEqual(rows[0].requirements, ['boiled_rice'])
  assert.equal(rows[0].submissions, 2)
  assert.equal(rows[0].campaign, 'expooct') // tidied

  const { rows: queued } = await db.query(`select payload from crm_outbox where kind = 'expo_lead' and payload->>'mobile' = '9876522001'`)
  assert.ok(queued.length >= 1)
  assert.match(queued[0].payload.note, /Expo QR lead/)
  assert.match(queued[0].payload.note, /Needs: /)

  // The Customers page lists them as not converted, from the Expo QR.
  const list = await api('GET', '/api/admin/warehouse/customers?source=Expo%20QR', { token: OWNER })
  assert.equal(list.status, 200)
  const row = list.body.customers.find((c) => c.phone === '9876522001')
  assert.ok(row)
  assert.equal(row.source, 'Expo QR')
  assert.equal(row.converted, false)
  assert.equal(row.city, 'Coimbatore')
  const csv = await api('GET', '/api/admin/warehouse/expo-leads.csv', { token: OWNER })
  assert.match(csv.body, /Ramesh Kumar/)
})

test('expo leads: only the owner and IT team can delete one; a second delete says it is gone', async () => {
  await api('POST', '/api/expo/lead', { body: { name: 'Delete Me', phone: '9876522077', location: 'Salem', buyerType: 'consumer', requirements: ['boiled_rice'] } })
  const listed = await api('GET', '/api/admin/warehouse/expo-leads', { token: OWNER })
  const lead = listed.body.leads.find((l) => l.phone === '9876522077')
  assert.ok(lead?.id)
  // Sales can see leads but not delete them.
  assert.equal((await api('DELETE', '/api/admin/warehouse/expo-leads/' + lead.id, { token: tokens.sales })).status, 403)
  assert.equal((await api('DELETE', '/api/admin/warehouse/expo-leads/' + lead.id, { token: OWNER })).status, 200)
  assert.equal((await api('DELETE', '/api/admin/warehouse/expo-leads/' + lead.id, { token: OWNER })).status, 404)
  const { rows } = await db.query(`select 1 from expo_leads where phone = '9876522077'`)
  assert.equal(rows.length, 0)
  const { rows: log } = await db.query(`select details from staff_audit_log where action = 'expo.lead.delete' order by id desc limit 1`)
  assert.equal(log[0].details.phone, '9876522077')
})

test('Analyst: owner sees sales, leads, campaigns and delivery KPIs; rice type, kg target and ad spend are editable; other roles are refused', async () => {
  assert.equal((await api('GET', '/api/admin/analyst', { token: tokens.sales })).status, 403)
  // A sign-up from an Instagram ad campaign who then buys.
  const signup = await api('POST', '/api/contest/lead', { body: { name: 'Analyst Anu', phone: '9500077777', email: 'anu@example.com',
    attribution: { utm_source: 'ig', utm_medium: 'paid_social', utm_campaign: 'Diwali Reels', utm_content: 'Reel A', fbclid: true } }, headers: { 'X-Forwarded-For': '10.90.0.1' } })
  assert.equal(signup.status, 200)
  await buy([{ id: 'alibaba', qty: 1 }], buyer({ name: 'Analyst Anu', email: 'anu@example.com', phone: '9500077777' }))
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  assert.equal((await api('POST', '/api/admin/analyst/ad-spend', { token: OWNER, body: { spentOn: today, platform: 'meta', campaign: 'Diwali Reels', ad: 'Reel A', amount: 500 } })).status, 201)
  assert.equal((await api('PUT', '/api/admin/analyst/target', { token: OWNER, body: { kgPerMonth: 1000 } })).status, 200)

  const r = await api('GET', `/api/admin/analyst?from=${today}&to=${today}`, { token: OWNER })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const a = r.body
  assert.ok(a.sales.orders >= 1 && a.sales.revenue > 0 && a.sales.kg > 0)
  assert.ok(a.sales.byRice.find((x) => x.riceType === 'boiled').orders >= 1) // everything but Special Idly Rice starts as Boiled
  assert.ok(a.sales.byProduct.some((p) => p.slug === 'alibaba'))
  assert.equal(a.sales.perDay.length, 1)
  assert.equal(a.target.kgPerMonth, 1000)
  assert.ok(a.leads.newLeads.bySource.Instagram >= 1)
  const ig = a.leads.bySource.find((s) => s.source === 'Instagram')
  assert.ok(ig.won >= 1, JSON.stringify(a.leads.bySource))
  assert.equal(a.leads.funnel[0].stage, 'New lead')
  const camp = a.campaigns.byCampaign.find((c) => c.campaign === 'Diwali Reels')
  assert.ok(camp && camp.spend === 500 && camp.leads >= 1 && camp.costPerLead > 0, JSON.stringify(a.campaigns))
  assert.ok(a.ceo.monthToDate.orders >= 1 && 'pendingDispatch' in a.ceo)
  assert.ok(a.delivery.pendingDispatch.total >= 1)

  // Only Boiled: the split follows the rice type; changing a product's type moves it.
  const boiled = (await api('GET', `/api/admin/analyst?from=${today}&to=${today}&rice=boiled`, { token: OWNER })).body
  assert.ok(boiled.sales.orders >= 1)
  assert.equal((await api('PUT', '/api/admin/analyst/rice-type', { token: OWNER, body: { slug: 'alibaba', riceType: 'raw' } })).status, 200)
  const raw = (await api('GET', `/api/admin/analyst?from=${today}&to=${today}&rice=raw`, { token: OWNER })).body
  assert.ok(raw.sales.byProduct.some((p) => p.slug === 'alibaba'))
  assert.equal((await api('PUT', '/api/admin/analyst/rice-type', { token: OWNER, body: { slug: 'alibaba', riceType: 'boiled' } })).status, 200)
  assert.equal((await api('PUT', '/api/admin/analyst/rice-type', { token: OWNER, body: { slug: 'special-idly-rice', riceType: 'basmati' } })).status, 400)

  const settings = (await api('GET', `/api/admin/analyst/settings?from=${today}&to=${today}`, { token: OWNER })).body
  assert.ok(settings.products.length >= 10)
  const entry = settings.adSpend.find((s) => s.campaign === 'Diwali Reels')
  assert.equal(entry.amount, 500)
  assert.equal((await api('DELETE', `/api/admin/analyst/ad-spend/${entry.id}`, { token: OWNER })).status, 200)
})
