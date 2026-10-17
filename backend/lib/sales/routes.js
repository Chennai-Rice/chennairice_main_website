// HTTP routes for the sales backend, mounted into backend/server/app.js.
//
// Public (the storefront):
//   GET  /api/catalog                         packs, prices, in stock
//   POST /api/checkout/quote                  price a cart (nothing is held)
//   POST /api/checkout/session                create order, hold stock, open payment
//   POST /api/checkout/verify                 confirm payment
//   POST /api/orders/track                    { orderNumber, phone } → status
//   POST /api/payments/webhook/razorpay       Razorpay → us
//   POST /api/jobs/run                        timer (X-Job-Token)
//
// Staff (/api/admin/*, Firebase ID token, permissions per role — staff.js).
import express from 'express'
import { listCatalog } from './catalog.js'
import { createCheckoutSession, confirmCheckout, quoteCart } from './checkout.js'
import { handleRazorpayWebhook } from './webhooks.js'
import { runJobs } from './jobs.js'
import { sendQueued } from './email.js'
import { staffAuth, permissionsFor, requirePermission, listStaff, createStaff, updateStaff, can } from './staff.js'
import {
  listOrders, getOrderDetail, confirmOrder, packOrder, shipOrder, deliverShipment, cancelOrder,
  returnOrder, addNote, resolveAttention, refundOrder, deleteOrder, trackOrder, customerInvoice, setDispatched, setDispatchedMany, setPacking, updateShipmentDetails,
} from './operations.js'
import {
  listStock, listMovements, adjustStock, markDamaged, transferStock, listLocations, createLocation,
  recordProduction, listBatches, demandBoard, listCatalogAdmin, updateVariant, createProduct, createVariant,
} from './inventory.js'
import { dashboard, getSettingsAdmin, updateSettings, listZones, upsertZone, listEmails } from './admin.js'
import { listWarehouseOrders, warehouseCsv, assertTab, listWarehouseCustomers, warehouseReport } from './warehouse.js'
import { listShipments, pickList, pickListCsv, warehouseDashboard } from './deliveries.js'
import { listIssues, getIssue, createIssue, updateIssue } from './issues.js'
import { processTrackerUpload, listTrackerUploads, trackerTemplate, courierRedirect, dispatchBatchSheet } from './tracker.js'
import { listIssuedIds, issuedIdsCsv, checkRegister } from './idregister.js'
import { invoiceHtml, packingSlipHtml } from './documents.js'
import { recordVisit, sourcesReport, sourceOrders, saveContestLead, startContestLead, contestLeads } from './attribution.js'
import { checkAutomationKey, automationContacts } from './automation.js'
import { listEnquiries, updateEnquiry } from './enquiries-admin.js'
import { accountsSummary, invoiceRegister, invoiceRegisterCsv, paymentsList, refundsList, period } from './accounts.js'
import { invoicePdf } from './invoice-pdf.js'
import { query } from '../db.js'
import { httpError, safeEqual } from './util.js'

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** The caller's own address. Behind Firebase Hosting / Cloud Functions every
 *  request arrives from Google's front end, so the first X-Forwarded-For entry
 *  is the customer; locally there is no such header and the socket is used. */
function clientKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return fwd || req.ip || 'unknown'
}

/**
 * Per-caller limiter for endpoints a stranger could hammer.
 * failuresOnly: count only requests that end in 404 (a wrong guess), so a
 * customer refreshing their own order is never locked out, while someone
 * trying order numbers or phone numbers one after another still is.
 */
function rateLimit({ windowMs, max, failuresOnly = false }) {
  const hits = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const key = clientKey(req)
    let entry = hits.get(key)
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs }
      hits.set(key, entry)
    }
    if (entry.count >= max) {
      const wait = Math.max(1, Math.ceil((entry.reset - now) / 1000))
      res.set('Retry-After', String(wait))
      return next(httpError('Rate limited', {
        status: 429,
        publicMessage: `Too many attempts. Please try again in ${wait > 90 ? Math.ceil(wait / 60) + ' minutes' : wait + ' seconds'}.`,
      }))
    }
    if (failuresOnly) res.on('finish', () => { if (res.statusCode === 404) entry.count++ })
    else entry.count++
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    next()
  }
}

export function createSalesRouter({ verifyIdToken } = {}) {
  const router = express.Router()

  // ---- public -------------------------------------------------------------
  router.get('/api/catalog', wrap(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ products: await listCatalog({ query }) })
  }))

  // One landing from an ad link or another site (counts only, no visitor data).
  router.post('/api/traffic/visit', rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    res.json(await recordVisit({ query }, req.body))
  }))

  // Super Slogan Contest sign-up from the popup shown to ad visitors: an OTP
  // to the mobile first (MSG91), then the sign-up with that OTP.
  router.post('/api/contest/otp', rateLimit({ windowMs: 10 * 60000, max: 6 }), wrap(async (req, res) => {
    res.json(await startContestLead({ query }, req.body, { ip: clientKey(req) }))
  }))
  router.post('/api/contest/lead', rateLimit({ windowMs: 10 * 60000, max: 10 }), wrap(async (req, res) => {
    res.json(await saveContestLead({ query }, req.body))
  }))

  // Feed for the email-automation tool: contest sign-ups, behind an API key.
  router.get('/api/automation/contacts', rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    checkAutomationKey(req)
    res.set('Cache-Control', 'no-store')
    res.json(await automationContacts({ query }, req.query))
  }))

  router.post('/api/checkout/quote', wrap(async (req, res) => res.json(await quoteCart(req.body))))

  router.post('/api/checkout/session', rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    res.json({ ok: true, ...(await createCheckoutSession(req.body)) })
  }))

  router.post('/api/checkout/verify', wrap(async (req, res) => {
    const result = await confirmCheckout(req.body)
    res.json(result)
    // Send the "order received" email now rather than waiting for the timer.
    if (!result.alreadyConfirmed) sendQueued({ query }, { orderNumber: result.orderNumber }).catch((err) => console.error('[email]', err.message))
  }))

  router.post('/api/orders/track', rateLimit({ windowMs: 10 * 60000, max: 15, failuresOnly: true }), wrap(async (req, res) => {
    res.json(await trackOrder(req.body || {}))
  }))

  // The buyer's own invoice, opened in a new tab from the thank-you receipt.
  router.get('/api/orders/:id/invoice', rateLimit({ windowMs: 10 * 60000, max: 15, failuresOnly: true }), wrap(async (req, res) => {
    const detail = await customerInvoice({ orderId: req.params.id, orderNumber: req.query.n })
    res.set('Cache-Control', 'private, no-store')
    res.type('html').send(invoiceHtml(detail, { forCustomer: true }))
  }))

  // "Track on <partner>": sends the visitor to the courier's own tracking
  // page for this order, or to our Track Order page if it has none yet.
  router.get('/api/orders/track/go', rateLimit({ windowMs: 10 * 60000, max: 60 }), wrap(async (req, res) => {
    const ref = String(req.query.ref || '').slice(0, 60)
    const url = await courierRedirect(ref)
    res.set('Cache-Control', 'no-store')
    res.redirect(302, url || '/track-order?order=' + encodeURIComponent(ref))
  }))

  router.post('/api/payments/webhook/razorpay', wrap(async (req, res) => {
    // Signed over the exact bytes Razorpay sent, so the raw body is required.
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}))
    const result = await handleRazorpayWebhook({
      rawBody,
      signature: req.get('x-razorpay-signature'),
      eventId: req.get('x-razorpay-event-id'),
    })
    res.json({ ok: true, ...result })
    // A payment completed here (buyer closed the tab) gets its confirmation now too.
    sendQueued({ query }).catch((err) => console.error('[email]', err.message))
  }))

  router.post('/api/jobs/run', wrap(async (req, res) => {
    if (!process.env.JOB_TOKEN || !safeEqual(req.get('x-job-token'), process.env.JOB_TOKEN)) {
      throw httpError('Bad job token', { status: 401, publicMessage: 'Unauthorised.' })
    }
    res.json(await runJobs())
  }))

  // ---- staff ----------------------------------------------------------------
  const admin = express.Router()
  admin.use(staffAuth({ verifyIdToken }))
  // A dispatch, tracking upload or delivery queues customer emails: send them
  // as soon as the change succeeds instead of waiting for the 10-minute timer.
  // Mail that is waiting for tracking (send_after) stays queued.
  admin.use((req, res, next) => {
    if (req.method !== 'GET') {
      res.on('finish', () => {
        if (res.statusCode < 400) sendQueued({ query }).catch((err) => console.error('[email]', err.message))
      })
    }
    next()
  })
  // Any one of several permissions (e.g. the order list: warehouse or accounts).
  const permAny = (...ps) => (req, _res, next) =>
    next(ps.some((p) => can(req.staff, p)) ? undefined : httpError('Forbidden', { status: 403, publicMessage: 'Your role does not allow that.' }))
  const perm = (p) => (req, _res, next) => {
    try {
      requirePermission(req.staff, p)
      next()
    } catch (err) {
      next(err)
    }
  }

  admin.get('/me', (req, res) => {
    const { id, email, full_name, role } = req.staff
    res.json({ id, email, fullName: full_name, role, permissions: permissionsFor(role) })
  })
  admin.get('/dashboard', perm('dashboard.view'), wrap(async (_req, res) => res.json(await dashboard())))

  admin.get('/orders', perm('order.view'), wrap(async (req, res) => res.json({ orders: await listOrders(req.query) })))
  admin.get('/orders/:id', perm('order.view'), wrap(async (req, res) => res.json(await getOrderDetail(req.params.id))))
  admin.post('/orders/:id/confirm', wrap(async (req, res) => res.json({ order: await confirmOrder(req.staff, req.params.id) })))
  admin.post('/orders/:id/pack', wrap(async (req, res) => res.json({ order: await packOrder(req.staff, req.params.id) })))
  admin.post('/orders/:id/ship', wrap(async (req, res) => res.json(await shipOrder(req.staff, req.params.id, req.body))))
  admin.post('/orders/:id/cancel', wrap(async (req, res) => res.json({ order: await cancelOrder(req.staff, req.params.id, req.body) })))
  admin.post('/orders/:id/return', wrap(async (req, res) => res.json({ order: await returnOrder(req.staff, req.params.id, req.body) })))
  admin.post('/orders/:id/notes', wrap(async (req, res) => res.json({ note: await addNote(req.staff, req.params.id, req.body) })))
  admin.post('/orders/:id/resolve', wrap(async (req, res) => res.json({ order: await resolveAttention(req.staff, req.params.id, req.body) })))
  admin.delete('/orders/:id', perm('order.delete'), wrap(async (req, res) => res.json(await deleteOrder(req.staff, req.params.id))))
  admin.post('/orders/:id/refunds', wrap(async (req, res) => res.json(await refundOrder(req.staff, req.params.id, req.body))))
  admin.get('/orders/:id/invoice', perm('order.view'), wrap(async (req, res) => {
    const detail = await getOrderDetail(req.params.id)
    if (!detail.invoice) throw httpError('No invoice yet — it is issued when the order ships.', { status: 404 })
    res.type('html').send(invoiceHtml(detail))
  }))
  // The packing slip carries no prices, so the warehouse may print it.
  admin.get('/orders/:id/packing-slip', perm('warehouse.view'), wrap(async (req, res) => {
    res.type('html').send(packingSlipHtml(await getOrderDetail(req.params.id)))
  }))

  // ---- /warehouse page ----
  admin.get('/warehouse/dashboard', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await warehouseDashboard({ money: can(req.staff, 'money.view') }))
  }))
  admin.get('/warehouse/shipments', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listShipments(req.query))
  }))
  admin.get('/warehouse/pick-list', perm('warehouse.view'), wrap(async (req, res) => {
    res.json({ lines: await pickList(req.query) })
  }))
  admin.get('/warehouse/pick-list.csv', perm('warehouse.view'), wrap(async (req, res) => {
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    res.set('Content-Disposition', `attachment; filename="pick-list-${day}.csv"`)
    res.type('text/csv; charset=utf-8').send(await pickListCsv(req.query))
  }))
  admin.post('/orders/:id/packing', wrap(async (req, res) => {
    const order = await setPacking(req.staff, req.params.id, req.body)
    res.json({ order: { id: order.id, status: order.status } })
  }))
  admin.patch('/shipments/:id/details', wrap(async (req, res) => {
    res.json({ shipment: await updateShipmentDetails(req.staff, req.params.id, req.body) })
  }))
  // Product tracker upload. The sheet arrives as the raw file bytes
  // (application/octet-stream), so the 200 KB JSON limit does not apply.
  admin.post('/warehouse/tracker', express.raw({ type: () => true, limit: '5mb' }), wrap(async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : req.rawBody
    res.json(await processTrackerUpload(req.staff, body, {
      filename: String(req.query.filename || 'tracker.xlsx').slice(0, 200),
      apply: req.query.apply === '1',
    }))
  }))
  admin.get('/warehouse/tracker/uploads', perm('warehouse.view'), wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ uploads: await listTrackerUploads() })
  }))
  // Morning / evening dispatch sheet: orders waiting to go out, with empty
  // Courier, AWB and Tracking Link columns to fill in and upload back.
  admin.get('/warehouse/dispatch-batch.xlsx', perm('warehouse.view'), wrap(async (req, res) => {
    const sheet = await dispatchBatchSheet(req.query.batch === 'evening' ? 'evening' : 'morning')
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="${sheet.filename}"`)
    res.set('X-Order-Count', String(sheet.count))
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(sheet.buffer)
  }))
  admin.get('/warehouse/tracker/template.xlsx', perm('warehouse.view'), wrap(async (_req, res) => {
    res.set('Content-Disposition', 'attachment; filename="product-tracker-template.xlsx"')
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await trackerTemplate())
  }))
  admin.get('/warehouse/issues', perm('issues.manage'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listIssues(req.query))
  }))
  admin.get('/warehouse/issues/:id', perm('issues.manage'), wrap(async (req, res) => res.json(await getIssue(req.params.id))))
  admin.post('/warehouse/issues', wrap(async (req, res) => res.json(await createIssue(req.staff, req.body))))
  admin.patch('/warehouse/issues/:id', wrap(async (req, res) => res.json(await updateIssue(req.staff, req.params.id, req.body))))
  admin.get('/warehouse/orders', permAny('warehouse.view', 'accounts.view'), wrap(async (req, res) => {
    assertTab(req.query.tab)
    res.set('Cache-Control', 'no-store')
    res.json(await listWarehouseOrders(req.query, { money: can(req.staff, 'money.view') }))
  }))
  admin.get('/warehouse/customers', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listWarehouseCustomers(req.query))
  }))
  // Sales by source, campaign and ad (money: owner, admin, IT team).
  admin.get('/warehouse/sources', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await sourcesReport({ query }, req.query))
  }))
  admin.get('/warehouse/sources/orders', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ orders: await sourceOrders({ query }, req.query) })
  }))
  admin.get('/warehouse/contest-leads', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ leads: await contestLeads({ query }, req.query) })
  }))
  admin.get('/warehouse/contest-leads.csv', perm('money.view'), wrap(async (req, res) => {
    const leads = await contestLeads({ query }, req.query)
    const cell = (v) => {
      let t = String(v ?? '')
      if (/^[=+\-@]/.test(t)) t = "'" + t // never a spreadsheet formula
      return '"' + t.replace(/"/g, '""') + '"'
    }
    const lines = [['Signed up', 'Name', 'Mobile', 'Mobile verified (OTP)', 'Email', 'Came from', 'Campaign', 'Ad', 'Page', 'Times signed up']]
      .concat(leads.map((l) => [new Date(l.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), l.name, l.phone, l.phone_verified ? 'Yes' : 'No', l.email, l.sourceLabel, l.campaign, l.ad, l.landing, l.submissions]))
    res.set('Cache-Control', 'no-store')
    res.type('text/csv').attachment('contest-signups.csv').send('\ufeff' + lines.map((r) => r.map(cell).join(',')).join('\r\n'))
  }))
  admin.get('/warehouse/reports', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await warehouseReport(req.query))
  }))
  admin.get('/warehouse/orders.csv', permAny('warehouse.view', 'accounts.view'), wrap(async (req, res) => {
    assertTab(req.query.tab)
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="warehouse-orders-${day}.csv"`)
    res.type('text/csv; charset=utf-8').send(await warehouseCsv(req.query))
  }))
  // ---- the ID register ----
  admin.get('/order-ids', perm('ids.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listIssuedIds(req.query))
  }))
  admin.get('/order-ids.csv', perm('ids.view'), wrap(async (req, res) => {
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="order-ids-${day}.csv"`)
    res.type('text/csv; charset=utf-8').send(await issuedIdsCsv(req.query))
  }))
  admin.get('/order-ids/check', perm('ids.view'), wrap(async (_req, res) => res.json(await checkRegister())))

  // The Dispatched switch on one card, and the same for every selected card.
  admin.post('/orders/:id/dispatched', wrap(async (req, res) => {
    res.json({ order: await setDispatched(req.staff, req.params.id, req.body) })
  }))
  admin.post('/warehouse/dispatch', wrap(async (req, res) => {
    res.json(await setDispatchedMany(req.staff, req.body))
  }))
  admin.post('/shipments/:id/deliver', wrap(async (req, res) => res.json(await deliverShipment(req.staff, req.params.id, req.body))))

  admin.get('/inventory', perm('inventory.view'), wrap(async (_req, res) => res.json({ stock: await listStock() })))
  admin.get('/inventory/movements', perm('inventory.view'), wrap(async (req, res) => res.json({ movements: await listMovements(req.query) })))
  admin.post('/inventory/adjust', wrap(async (req, res) => res.json(await adjustStock(req.staff, req.body))))
  admin.post('/inventory/damage', wrap(async (req, res) => res.json(await markDamaged(req.staff, req.body))))
  admin.post('/inventory/transfer', wrap(async (req, res) => res.json(await transferStock(req.staff, req.body))))
  admin.get('/locations', perm('inventory.view'), wrap(async (_req, res) => res.json({ locations: await listLocations() })))
  admin.post('/locations', wrap(async (req, res) => res.json({ location: await createLocation(req.staff, req.body) })))

  admin.get('/production/batches', perm('inventory.view'), wrap(async (req, res) => res.json({ batches: await listBatches(req.query) })))
  admin.post('/production/batches', wrap(async (req, res) => res.json({ batch: await recordProduction(req.staff, req.body) })))
  admin.get('/production/demand', perm('inventory.view'), wrap(async (_req, res) => res.json({ demand: await demandBoard() })))

  admin.get('/catalog', perm('order.view'), wrap(async (_req, res) => res.json({ catalog: await listCatalogAdmin() })))
  admin.patch('/catalog/variants/:id', wrap(async (req, res) => res.json({ variant: await updateVariant(req.staff, req.params.id, req.body) })))
  admin.post('/catalog/products', wrap(async (req, res) => res.json({ product: await createProduct(req.staff, req.body) })))
  admin.post('/catalog/products/:id/variants', wrap(async (req, res) => res.json({ variant: await createVariant(req.staff, req.params.id, req.body) })))

  admin.get('/staff', perm('staff.manage'), wrap(async (_req, res) => res.json({ staff: await listStaff() })))
  admin.post('/staff', wrap(async (req, res) => res.json({ staff: await createStaff(req.staff, req.body) })))
  admin.patch('/staff/:id', wrap(async (req, res) => res.json({ staff: await updateStaff(req.staff, req.params.id, req.body) })))

  admin.get('/settings', perm('settings.manage'), wrap(async (_req, res) => res.json({ settings: await getSettingsAdmin() })))
  admin.patch('/settings', wrap(async (req, res) => res.json({ settings: await updateSettings(req.staff, req.body) })))
  admin.get('/shipping-zones', perm('shipping.manage'), wrap(async (_req, res) => res.json({ zones: await listZones() })))
  admin.put('/shipping-zones', wrap(async (req, res) => res.json({ zone: await upsertZone(req.staff, req.body) })))
  admin.get('/emails', perm('emails.view'), wrap(async (req, res) => res.json({ emails: await listEmails(req.query) })))

  // /admin → Enquiries: the website's contact and bulk-order enquiries.
  admin.get('/enquiries', perm('enquiries.view'), wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listEnquiries())
  }))
  admin.patch('/enquiries/:kind/:id', perm('enquiries.view'), wrap(async (req, res) => {
    res.json({ enquiry: await updateEnquiry(req.params.kind, req.params.id, req.body) })
  }))

  // Accounts section: invoices, payments, refunds and GST totals (read-only).
  admin.get('/accounts/summary', perm('accounts.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await accountsSummary({ query }, req.query))
  }))
  admin.get('/accounts/invoices', perm('accounts.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ invoices: await invoiceRegister({ query }, req.query) })
  }))
  admin.get('/accounts/invoices.csv', perm('accounts.view'), wrap(async (req, res) => {
    const { from, to } = period(req.query)
    res.set('Cache-Control', 'no-store')
    res.type('text/csv').attachment(`invoice-register-${from}-to-${to}.csv`).send(await invoiceRegisterCsv({ query }, req.query))
  }))
  admin.get('/accounts/payments', perm('accounts.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ payments: await paymentsList({ query }, req.query) })
  }))
  admin.get('/accounts/refunds', perm('accounts.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ refunds: await refundsList({ query }, req.query) })
  }))
  // The invoice as the same PDF the customer is emailed.
  admin.get('/orders/:id/invoice.pdf', perm('accounts.view'), wrap(async (req, res) => {
    const detail = await getOrderDetail(req.params.id)
    if (!detail.invoice) throw httpError('No invoice', { status: 404, publicMessage: 'This order has no invoice yet.' })
    res.set('Cache-Control', 'private, no-store')
    res.type('application/pdf').attachment(`Invoice ${detail.invoice.invoice_number.replaceAll('/', '-')}.pdf`).send(await invoicePdf(detail))
  }))

  router.use('/api/admin', admin)

  // One error shape for every route above. Internal detail is logged, never sent.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500)
    if (status >= 500) console.error('[sales]', req.method, req.path, err)
    res.status(status).json({ error: err.publicMessage || (status >= 500 ? 'Something went wrong. Please try again.' : err.message) })
  })

  return router
}
