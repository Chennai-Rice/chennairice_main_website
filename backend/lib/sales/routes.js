// HTTP routes for the sales backend, mounted into backend/server/app.js.
//
// Public (the storefront):
//   GET  /api/catalog                         packs, prices, in stock
//   POST /api/checkout/quote                  price a cart (nothing is held)
//   POST /api/journey                         one step of a shopper's checkout journey
//   GET  /api/delivery?pincode=               do we deliver there, and the charge per pack size
//   POST /api/checkout/session                create order, hold stock, open payment
//   POST /api/checkout/verify                 confirm payment
//   POST /api/orders/track                    { orderNumber, phone } → status
//   POST /api/payments/webhook/razorpay       Razorpay → us
//   POST /api/jobs/run                        timer (X-Job-Token)
//
// Staff (/api/admin/*, Firebase ID token, permissions per role — staff.js).
import express from 'express'
import { listCatalog, checkDelivery } from './catalog.js'
import { merchantFeed } from './merchant-feed.js'
import { cloudOverview } from './cloud.js'
import { cloudSettings, saveCloudSettings, checkUptime, checkSpeed } from './cloud-checks.js'
import { cloudCosts, cloudSecurity } from './cloud-cost.js'
import { createCheckoutSession, confirmCheckout, quoteCart } from './checkout.js'
import { handleRazorpayWebhook } from './webhooks.js'
import { runJobs } from './jobs.js'
import { sendQueued } from './email.js'
import { pinInfo, searchAreas } from './places.js'
import { resumeCart, unsubscribeCart, cartRemindersAdmin, saveCartReminderSettings } from './cart-recovery.js'
import { reviewForm, submitReview, publicReviews, adminReviews, setReviewStatus } from './reviews.js'
import { staffAuth, permissionsFor, requirePermission, listStaff, createStaff, updateStaff, can } from './staff.js'
import {
  listOrders, getOrderDetail, confirmOrder, packOrder, shipOrder, deliverShipment, outForDelivery, cancelOrder,
  returnOrder, addNote, resolveAttention, refundOrder, deleteOrder, trackOrder, customerInvoice, setDispatched, setDispatchedMany, setPacking, updateShipmentDetails,
} from './operations.js'
import {
  listStock, listMovements, adjustStock, markDamaged, transferStock, listLocations, createLocation,
  recordProduction, listBatches, demandBoard, listCatalogAdmin, updateVariant, createProduct, createVariant,
} from './inventory.js'
import { dashboard, getSettingsAdmin, updateSettings, listZones, upsertZone, listEmails } from './admin.js'
import { listWarehouseOrders, warehouseCsv, assertTab, listWarehouseCustomers, customersCsv, warehouseReport } from './warehouse.js'
import { listShipments, pickList, pickListCsv, warehouseDashboard } from './deliveries.js'
import { listIssues, getIssue, createIssue, updateIssue } from './issues.js'
import { processTrackerUpload, listTrackerUploads, trackerTemplate, courierRedirect, dispatchBatchSheet } from './tracker.js'
import { listIssuedIds, issuedIdsCsv, checkRegister } from './idregister.js'
import { invoiceHtml, packingSlipHtml } from './documents.js'
import { recordVisit, sourcesReport, sourceOrders, sourcePeople, saveContestLead, startContestLead, contestLeads, channelReport } from './attribution.js'
import { saveExpoLead, listExpoLeads, deleteExpoLead } from './expo.js'
import { askAssistant } from './assistant.js'
import { askAdvisor, advisorUsage, setAdvisorCap } from './advisor.js'
import { recordJourney, listJourneys, deleteJourneys } from './journeys.js'
import { saveAdvisorFile, MAX_FILE_BYTES } from './advisor-files.js'
import { analystReport, analystPeriod, analystSettings, setRiceType, setMonthlyTarget, addAdSpend, deleteAdSpend } from './analyst.js'
import { metaAdsReport } from './meta-ads.js'
import { googleAdsReport } from './google-ads.js'
import { checkAutomationKey, automationContacts } from './automation.js'
import { checkAskevaKey, recordAskevaWebhook } from '../askeva-inbound.js'
import { verifyChallenge, signatureOk, handleWebhook } from '../wa/webhook.js'
import { listTemplates, saveTemplate, duplicateTemplate, submitTemplate, deleteTemplate, syncTemplates, checkModel } from '../wa/templates.js'
import { overview as waOverview, settings as waSettings, saveSettings as saveWaSettings, connectWebhook, sendTest as waSendTest, recentMessages, loadWabaId } from '../wa/admin.js'
import { uploadHeaderSample } from '../wa/cloud.js'
import { getBot, saveBot, simulate as simulateBot } from '../wa/bot.js'
import { runWhatsAppAutomations, automationsAdmin, saveAutomations, testAutomation } from '../wa/automations.js'
import { optIn as waOptIn, listContacts, contactsCsv, setTags, setPermission, importContacts } from '../wa/contacts.js'
import { listBroadcasts, saveBroadcast, launchBroadcast, cancelBroadcast, deleteBroadcast, audience as broadcastAudience, FIELDS as BROADCAST_FIELDS } from '../wa/broadcasts.js'
import { report as waReport, reportCsv as waReportCsv } from '../wa/reports.js'
import { listChats, getChat, replyText, replyTemplate, updateChat, addNote as addChatNote, listQuickReplies, saveQuickReply, deleteQuickReply } from '../wa/inbox.js'
import { checkNeodoveKey, recordNeodoveWebhook } from '../neodove.js'
import { listEnquiries, updateEnquiry } from './enquiries-admin.js'
import { listDiscountCodes, createDiscountCode, setDiscountCodeActive } from './discounts.js'
import { spinConfig, spin, spinAdmin, saveSpinSettings } from './spin.js'
import { myReferral, referralAdmin, saveReferralSettings, cancelReferralReward } from './referrals.js'
import { referralsOn } from './discounts.js'
import { listReports, reportCsv } from './reports.js'
import { contestReport } from './contest.js'
import { loginWriter } from './writer-login.js'
import { misData } from './mis.js'
import { publishedPosts, publishedPost, allPosts, openPost, savePost as saveBlogPost, deletePost as deleteBlogPost, saveImage, readImage, MAX_IMAGE_BYTES } from './blog.js'
import { syncSettlements, importSettlementFile } from './settlements.js'
import { accountsSummary, invoiceRegister, invoiceRegisterCsv, paymentsList, refundsList, period } from './accounts.js'
import { invoicePdf } from './invoice-pdf.js'
import { query } from '../db.js'
import { httpError, safeEqual, getSettings, str } from './util.js'

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
  // Checkout address suggestions (India Post directory, cached): a PIN's city, state and areas; areas by name.
  router.get('/api/places/pin/:pin', rateLimit({ windowMs: 60000, max: 40 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400')
    res.json((await pinInfo(req.params.pin)) || { pin: null, city: '', state: '', areas: [] })
  }))
  router.get('/api/places/areas', rateLimit({ windowMs: 60000, max: 60 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400')
    res.json({ areas: await searchAreas(req.query.q, { state: req.query.state }) })
  }))
  // Cart reminder emails: "Complete my order" (cart, form and code back) and "Unsubscribe from reminders".
  router.get('/api/cart/resume/:token', rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await resumeCart({ query }, req.params.token))
  }))
  router.get('/api/cart/unsubscribe', rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    const ok = await unsubscribeCart({ query }, req.query.t)
    res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chennai Rice</title><body style="margin:0;background:#f6f1e7;font-family:Arial,sans-serif;color:#2b1d17"><div style="max-width:480px;margin:60px auto;padding:32px;background:#fff;border-radius:16px;text-align:center"><h1 style="font-family:Georgia,serif;color:#6e1420;font-size:24px">${ok ? 'You’re unsubscribed' : 'Link not found'}</h1><p style="line-height:1.6">${ok ? 'We won’t send you any more cart reminders. Order emails (confirmation, shipping) still come as usual.' : 'This link is not valid.'}</p><p><a href="/" style="color:#6e1420">Back to chennairiceindustries.com</a></p></div></body>`)
  }))
  // Customer reviews: the published ones (/review), the form behind the delivery email's link, and sending one.
  router.get('/api/reviews', wrap(async (_req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(await publicReviews({ query })) }))
  router.get('/api/reviews/form', rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store'); res.json(await reviewForm({ query }, req.query))
  }))
  router.post('/api/reviews', rateLimit({ windowMs: 10 * 60000, max: 10 }), wrap(async (req, res) => res.json(await submitReview({ query }, req.body))))
  router.get('/api/catalog', wrap(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ products: await listCatalog({ query }) })
  }))

  // ---- the journal (blog.js): readers, no sign-in ------------------------------
  // The blog writer's own sign-in (writer-login.js): email and password for a JWT.
  router.post('/api/blog/login', rateLimit({ windowMs: 60000, max: 10 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await loginWriter({ query }, req.body))
  }))
  router.get('/api/blog/posts', wrap(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ posts: await publishedPosts({ query }) })
  }))
  router.get('/api/blog/posts/:slug', wrap(async (req, res) => {
    const post = await publishedPost({ query }, req.params.slug)
    if (!post) throw httpError('No such post', { status: 404, publicMessage: 'No such post.' })
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ post })
  }))
  router.get('/api/blog/images/:name', wrap(async (req, res) => {
    const { data, contentType } = await readImage(req.params.name)
    // A picture's name is a fresh uuid, so what is stored under it never changes.
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type(contentType).send(data)
  }))

  // Product feed for Google / Bing Merchant Center and AI shopping listings (merchant-feed.js).
  router.get('/api/merchant-feed.xml', wrap(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=900')
    res.type('application/xml').send(await merchantFeed({ query }))
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

  // The lead form at /expo, opened from the QR code at an expo.
  // Spin & Win: what the wheel shows, and the spin itself (one per mobile number; the prize is a code locked to it).
  router.get('/api/spin', wrap(async (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(await spinConfig({ query })) }))
  router.post('/api/spin', rateLimit({ windowMs: 10 * 60000, max: 8 }), wrap(async (req, res) => {
    const result = await spin({ query }, req.body, { ip: clientKey(req) })
    // The prize code on WhatsApp straight away (if that automation is on and the player said yes to WhatsApp).
    if (!result.already) await runWhatsAppAutomations({ query, only: ['spin_code'] }).catch(() => {})
    res.json(result)
  }))
  // "Send me offers on WhatsApp" ticked on the spin form or at checkout (wa/contacts.js).
  router.post('/api/whatsapp/optin', rateLimit({ windowMs: 10 * 60000, max: 10 }), wrap(async (req, res) => {
    res.json(await waOptIn(req.body?.phone, { name: str(req.body?.name).slice(0, 80) || null, source: ['spin', 'checkout'].includes(req.body?.source) ? req.body.source : 'website' }))
  }))

  // Refer a friend: whether it is running, and a customer's code and rewards (mobile number + order email).
  router.get('/api/referral', wrap(async (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ enabled: referralsOn(await getSettings({ query })) }) }))
  router.post('/api/referral/me', rateLimit({ windowMs: 10 * 60000, max: 10 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await myReferral({ query }, req.body))
  }))

  router.post('/api/expo/lead', rateLimit({ windowMs: 10 * 60000, max: 20 }), wrap(async (req, res) => {
    res.json(await saveExpoLead({ query }, req.body))
  }))

  // Feed for the email-automation tool: contest sign-ups, behind an API key.
  router.get('/api/automation/contacts', rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    checkAutomationKey(req)
    res.set('Cache-Control', 'no-store')
    res.json(await automationContacts({ query }, req.query))
  }))

  // AskEva → WhatsApp contacts → Sales Daddy (askeva-inbound.js). The key is in
  // the webhook URL AskEva calls: /api/askeva/webhook?key=<ASKEVA_WEBHOOK_KEY>.
  // NeoDove call results → our database → Sales Daddy (neodove.js). The key is in the
  // X-API-Key header or the URL: /api/neodove/webhook?key=<NEODOVE_WEBHOOK_KEY>.
  router.get('/api/neodove/webhook', wrap(async (req, res) => {
    checkNeodoveKey(req)
    res.json({ ok: true })
  }))
  router.post('/api/neodove/webhook', rateLimit({ windowMs: 60000, max: 600 }), wrap(async (req, res) => {
    checkNeodoveKey(req)
    res.json(await recordNeodoveWebhook(req.body))
  }))

  // Meta's WhatsApp Cloud API → us (wa/webhook.js). GET is Meta's one-time check; every POST must carry
  // Meta's signature (X-Hub-Signature-256, WHATSAPP_APP_SECRET) and always gets a 200 once stored.
  router.get('/api/whatsapp/webhook', wrap(async (req, res) => {
    res.type('text/plain').send(verifyChallenge(req.query))
  }))
  router.post('/api/whatsapp/webhook', rateLimit({ windowMs: 60000, max: 3000 }), wrap(async (req, res) => {
    if (!signatureOk(req.rawBody, req.get('x-hub-signature-256'))) {
      throw httpError('Bad WhatsApp signature', { status: 401, publicMessage: 'Unauthorised.' })
    }
    res.json(await handleWebhook(req.body))
  }))

  router.get('/api/askeva/webhook', wrap(async (req, res) => {
    checkAskevaKey(req)
    res.json({ ok: true })
  }))
  router.post('/api/askeva/webhook', rateLimit({ windowMs: 60000, max: 600 }), wrap(async (req, res) => {
    checkAskevaKey(req)
    res.json(await recordAskevaWebhook(req.body))
  }))

  router.post('/api/checkout/quote', wrap(async (req, res) => res.json(await quoteCart(req.body))))

  // One step of a shopper's checkout journey (cart, checkout, details, payment, cancelled, failed, purchased).
  router.post('/api/journey', rateLimit({ windowMs: 60000, max: 60 }), wrap(async (req, res) => {
    res.json(await recordJourney(req.body, { userAgent: req.get('user-agent') }))
  }))

  // Soru Kutty's delivery check: region and delivery charge per pack size for a PIN code.
  router.get('/api/delivery', rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300')
    res.json(await checkDelivery({ query }, req.query.pincode))
  }))

  router.post('/api/checkout/session', rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    res.json({ ok: true, ...(await createCheckoutSession(req.body, { ip: clientKey(req), userAgent: req.get('user-agent') })) })
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
  // The courier label (4 × 6 in, drawn by the warehouse page): who and where,
  // what is in the bag and the courier's tracking number. No prices.
  admin.get('/orders/:id/label', perm('warehouse.view'), wrap(async (req, res) => {
    const { order, items, shipments } = await getOrderDetail(req.params.id)
    const s = [...(shipments || [])].reverse().find((x) => x.status !== 'cancelled') || null
    res.set('Cache-Control', 'no-store')
    res.json({
      orderNumber: order.order_number,
      placedAt: order.placed_at || order.created_at,
      paymentStatus: order.payment_status,
      name: order.contact_name,
      phone: order.contact_phone,
      address: order.shipping_address || {},
      items: items.map((i) => ({ name: i.product_name, packKg: Number(i.pack_kg), qty: i.quantity })),
      shipment: s && {
        method: s.method, carrier: s.carrier_name, trackingNumber: s.tracking_number, lrNumber: s.lr_number,
      },
    })
  }))

  // ---- /warehouse page ----
  admin.get('/warehouse/dashboard', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await warehouseDashboard({ money: can(req.staff, 'money.view') }))
  }))
  // The assistant in the dashboard's Quick actions card: questions answered from live data.
  admin.post('/warehouse/assistant', perm('warehouse.view'), rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await askAssistant(req.staff, req.body, { money: can(req.staff, 'money.view') }))
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
  admin.get('/warehouse/customers', perm('customers.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listWarehouseCustomers(req.query))
  }))
  admin.get('/warehouse/customers.csv', perm('customers.view'), wrap(async (req, res) => {
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="customers-${day}.csv"`)
    res.type('text/csv; charset=utf-8').send(await customersCsv(req.query))
  }))
  // Sales by source, campaign and ad (money: owner, admin, IT team).
  admin.get('/warehouse/sources', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await sourcesReport({ query }, req.query))
  }))
  admin.get('/warehouse/sources/people', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ people: await sourcePeople({ query }, req.query) })
  }))
  admin.get('/warehouse/sources/orders', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ orders: await sourceOrders({ query }, req.query) })
  }))
  // Ad campaigns → All-in-one report: revenue, orders, visits and the leads funnel per channel.
  admin.get('/warehouse/channels', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await channelReport({ query }, req.query))
  }))
  admin.get('/warehouse/contest-leads', perm('money.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ leads: await contestLeads({ query }, req.query) })
  }))
  admin.get('/warehouse/expo-leads', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ leads: await listExpoLeads({ query }, req.query) })
  }))
  admin.delete('/warehouse/expo-leads/:id', perm('expo.delete'), wrap(async (req, res) => res.json(await deleteExpoLead({ query }, req.staff, req.params.id))))
  admin.get('/warehouse/expo-leads.csv', perm('warehouse.view'), wrap(async (req, res) => {
    const leads = await listExpoLeads({ query }, { ...req.query, days: req.query.days || 366 })
    const cell = (v) => {
      let t = String(v ?? '')
      if (/^[=+\-@]/.test(t)) t = "'" + t // never a spreadsheet formula
      return '"' + t.replace(/"/g, '""') + '"'
    }
    const lines = [['Date', 'Name', 'Mobile', 'Email', 'Location', 'Customer type', 'Requirement', 'Expo', 'Times submitted']]
      .concat(leads.map((l) => [new Date(l.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), l.name, l.phone, l.email, l.location, l.buyerType, l.requirement, l.campaign, l.submissions]))
    res.set('Cache-Control', 'no-store')
    res.type('text/csv').attachment('expo-leads.csv').send('﻿' + lines.map((r) => r.map(cell).join(',')).join('\r\n'))
  }))
  admin.get('/warehouse/contest-leads.csv', perm('money.view'), wrap(async (req, res) => {
    const leads = await contestLeads({ query }, req.query)
    const cell = (v) => {
      let t = String(v ?? '')
      if (/^[=+\-@]/.test(t)) t = "'" + t // never a spreadsheet formula
      return '"' + t.replace(/"/g, '""') + '"'
    }
    const lines = [['Date', 'Name', 'Mobile', 'Mobile verified (OTP)', 'Email', 'Type / came from', 'Campaign', 'Ad', 'Page', 'Message', 'Times']]
      .concat(leads.map((l) => [new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), l.name, l.phone, l.phone_verified ? 'Yes' : 'No', l.email, l.sourceLabel, l.campaign, l.ad, l.landing, l.message, l.submissions]))
    res.set('Cache-Control', 'no-store')
    res.type('text/csv').attachment('contest-signups.csv').send('\ufeff' + lines.map((r) => r.map(cell).join(',')).join('\r\n'))
  }))
  admin.get('/warehouse/reports', perm('warehouse.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await warehouseReport(req.query))
  }))
  // The Analyst page: KPIs for a period (?from&to as India dates, ?rice=raw|idli|boiled), and its settings.
  // Business Advisor (Gemini on Vertex AI): a question in, analysis and suggestions out; this month's spend and cap.
  admin.post('/advisor', perm('analyst.view'), rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await askAdvisor(req.staff, req.body))
  }))
  // A file for the Advisor: the raw bytes (Content-Type application/octet-stream), its name in ?name=.
  admin.post('/advisor/upload', perm('analyst.view'), rateLimit({ windowMs: 10 * 60000, max: 40 }),
    express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES + 1024 }),
    wrap(async (req, res) => {
      const buffer = Buffer.isBuffer(req.body) && req.body.length ? req.body : req.rawBody
      res.json(await saveAdvisorFile(req.staff, { name: req.query.name, buffer }))
    }))
  admin.get('/advisor/usage', perm('analyst.view'), wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await advisorUsage())
  }))
  admin.put('/advisor/cap', perm('analyst.view'), wrap(async (req, res) => {
    res.json(await setAdvisorCap(req.body?.capInr))
  }))
  // The MIS dashboard (mis.js): the leads of the MIS Google Sheet. ?refresh=1 reads the sheet again now.
  admin.get('/mis/data', perm('mis.view'), rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await misData({ refresh: req.query.refresh === '1' }))
  }))
  // /admin → Journal and /journal: write, publish and delete posts; upload a picture (blog.js).
  admin.get('/blog/posts', perm('blog.manage'), wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ posts: await allPosts({ query }) })
  }))
  admin.get('/blog/posts/:id', perm('blog.manage'), wrap(async (req, res) => {
    const post = await openPost({ query }, req.params.id)
    if (!post) throw httpError('No such post', { status: 404, publicMessage: 'That post could not be opened. It may have been deleted.' })
    res.set('Cache-Control', 'no-store')
    res.json({ post })
  }))
  admin.post('/blog/posts', perm('blog.manage'), wrap(async (req, res) => res.json({ post: await saveBlogPost({ query }, req.staff, req.body) })))
  admin.delete('/blog/posts/:id', perm('blog.manage'), wrap(async (req, res) => res.json(await deleteBlogPost({ query }, req.params.id))))
  admin.post('/blog/images', perm('blog.manage'), rateLimit({ windowMs: 60000, max: 60 }),
    express.raw({ type: () => true, limit: MAX_IMAGE_BYTES + 1024 }),
    wrap(async (req, res) => {
      const buffer = Buffer.isBuffer(req.body) && req.body.length ? req.body : req.rawBody
      res.json(await saveImage(buffer, req.headers['content-type']))
    }))
  // /admin → Checkout journeys: the funnel and the people at each step.
  // /admin → Cloud Centre: all Google Cloud and Firebase projects (read-only), ?days=1|7|30.
  admin.get('/cloud', perm('cloud.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await cloudOverview({ query, days: req.query.days }))
  }))
  // What the projects cost (billing export in BigQuery, ?days=1|7|30|90) and the security check (cloud-cost.js).
  admin.get('/cloud/costs', perm('cloud.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await cloudCosts({ query, days: req.query.days }))
  }))
  admin.get('/cloud/security', perm('cloud.view'), wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await cloudSecurity())
  }))
  // Who gets the alert emails, and the PageSpeed API key (never sent back, only whether one is set).
  admin.get('/cloud/settings', perm('cloud.view'), wrap(async (_req, res) => res.json(await cloudSettings({ query }))))
  admin.put('/cloud/settings', perm('cloud.view'), wrap(async (req, res) => res.json(await saveCloudSettings({ query }, req.body))))
  // "Check now": the uptime of every site, or the next PageSpeed check, without waiting for the job.
  admin.post('/cloud/check', perm('cloud.view'), wrap(async (req, res) => {
    res.json(req.body?.kind === 'speed' ? await checkSpeed({ query, force: true }) : await checkUptime({ query }))
  }))
  admin.get('/journeys', perm('analyst.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await listJourneys(req.query))
  }))
  // /admin → Reports: the website's data as spreadsheets (owner and IT team). ?days=7|30|90|365 or ?from&to.
  admin.get('/reports', perm('analyst.view'), wrap(async (_req, res) => res.json({ reports: listReports() })))
  admin.get('/reports/:id.csv', perm('analyst.view'), rateLimit({ windowMs: 60000, max: 20 }), wrap(async (req, res) => {
    const { filename, csv } = await reportCsv(req.params.id, req.query)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    res.type('text/csv; charset=utf-8').send(csv)
  }))
  // Delete checkout journeys from the list (only the journey records, never an order). Owner and IT team.
  admin.post('/journeys/delete', perm('analyst.view'), wrap(async (req, res) => {
    res.json(await deleteJourneys({ query }, req.staff, req.body?.ids))
  }))
  admin.get('/analyst', perm('analyst.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await analystReport(req.query))
  }))
  // Analyst → Campaigns: Meta's live campaign and ad figures beside the website's visits, sign-ups and orders.
  admin.get('/analyst/meta-ads', perm('analyst.view'), rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const p = analystPeriod(req.query)
    res.json(await metaAdsReport({ from: p.from, to: p.to, refresh: req.query.refresh === '1' }))
  }))
  // Analyst → Campaigns: Google Ads campaigns (through Sales Daddy) beside the website's visits, sign-ups and orders.
  admin.get('/analyst/google-ads', perm('analyst.view'), rateLimit({ windowMs: 60000, max: 30 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const p = analystPeriod(req.query)
    res.json(await googleAdsReport({ from: p.from, to: p.to, refresh: req.query.refresh === '1' }))
  }))
  // Analyst → Contest: the Super Slogan Contest entries (read from the coupon site's Firestore).
  admin.get('/contest', perm('analyst.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      res.json(await contestReport(req.query))
    } catch (err) {
      if (err.status) throw err
      console.error('contest report', err)
      throw httpError(err.message, { status: 502, publicMessage: 'Could not read the contest entries from the coupon site. Try again in a minute.' })
    }
  }))
  admin.get('/analyst/settings', perm('analyst.view'), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await analystSettings(req.query))
  }))
  admin.put('/analyst/rice-type', perm('analyst.view'), wrap(async (req, res) => {
    res.json(await setRiceType(req.staff, req.body?.slug, req.body?.riceType))
  }))
  admin.put('/analyst/target', perm('analyst.view'), wrap(async (req, res) => {
    res.json(await setMonthlyTarget(req.staff, req.body?.kgPerMonth))
  }))
  admin.post('/analyst/ad-spend', perm('analyst.view'), wrap(async (req, res) => {
    res.status(201).json(await addAdSpend(req.staff, req.body))
  }))
  admin.delete('/analyst/ad-spend/:id', perm('analyst.view'), wrap(async (req, res) => {
    res.json(await deleteAdSpend(req.staff, req.params.id))
  }))
  admin.get('/warehouse/orders.csv', permAny('warehouse.view', 'accounts.view'), wrap(async (req, res) => {
    assertTab(req.query.tab)
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="warehouse-orders-${day}.csv"`)
    res.type('text/csv; charset=utf-8').send(await warehouseCsv(req.query))
  }))
  // The same file for the orders ticked on the page (their ids in the body: too many for a web address).
  admin.post('/warehouse/orders.csv', permAny('warehouse.view', 'accounts.view'), wrap(async (req, res) => {
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="warehouse-orders-selected-${day}.csv"`)
    res.type('text/csv; charset=utf-8').send(await warehouseCsv({ ids: req.body?.ids, onlyIds: true }))
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
  admin.post('/shipments/:id/out-for-delivery', wrap(async (req, res) => res.json(await outForDelivery(req.staff, req.params.id))))

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
  // Warehouse → Settings → Discount codes (owners and IT): list with uses and money given, add, switch on/off.
  admin.get('/discounts', wrap(async (req, res) => res.json(await listDiscountCodes({ query }, req.staff, req.query))))
  admin.post('/discounts', wrap(async (req, res) => res.json({ code: await createDiscountCode({ query }, req.staff, req.body) })))
  admin.patch('/discounts/:id', wrap(async (req, res) => res.json({ code: await setDiscountCodeActive({ query }, req.staff, req.params.id, req.body?.active) })))
  // Warehouse → Settings → Spin & Win (owners and IT): prizes, chances, budget, on/off, and how it is doing.
  // Warehouse → Settings → Refer a friend (owners and IT): amounts, limit, on/off, top referrers, rewards.
  admin.get('/referrals', wrap(async (req, res) => res.json(await referralAdmin({ query }, req.staff))))
  admin.put('/referrals', wrap(async (req, res) => res.json(await saveReferralSettings({ query }, req.staff, req.body))))
  admin.post('/referrals/rewards/:id/cancel', wrap(async (req, res) => res.json(await cancelReferralReward({ query }, req.staff, req.params.id))))
  admin.get('/reviews', wrap(async (req, res) => res.json(await adminReviews({ query }, req.staff, req.query))))
  admin.put('/reviews/:id', wrap(async (req, res) => res.json(await setReviewStatus({ query }, req.staff, req.params.id, req.body?.status))))
  admin.get('/cart-reminders', wrap(async (req, res) => res.json(await cartRemindersAdmin({ query }, req.staff, { days: req.query.days }))))
  admin.put('/cart-reminders', wrap(async (req, res) => res.json(await saveCartReminderSettings({ query }, req.staff, req.body))))
  admin.get('/spin', wrap(async (req, res) => res.json(await spinAdmin({ query }, req.staff))))
  admin.put('/spin', wrap(async (req, res) => res.json(await saveSpinSettings({ query }, req.staff, req.body))))
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
  // The bank's UTIB code on each paid order: ask Razorpay for the last days' settlements, or upload its
  // Settlement Recon file (Razorpay → Reports → Settlement Recon, .xlsx or .csv). Owner, admin, IT team, accounts.
  admin.post('/settlements/sync', perm('accounts.view'), rateLimit({ windowMs: 60000, max: 6 }), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await syncSettlements({ days: Number(req.body?.days) || 31 }))
  }))
  admin.post('/settlements/import', perm('accounts.view'), rateLimit({ windowMs: 60000, max: 6 }),
    express.raw({ type: 'application/octet-stream', limit: '8mb' }),
    wrap(async (req, res) => {
      const buffer = Buffer.isBuffer(req.body) && req.body.length ? req.body : req.rawBody
      res.json(await importSettlementFile({ query }, { name: req.query.name, buffer }))
    }))
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

  // ---- /whatsapp: the WhatsApp dashboard (wa/*.js) ----
  const wa = perm('whatsapp.manage')
  // The WhatsApp account ID found from the token (Settings) before any call to Meta.
  admin.use('/whatsapp', (_req, _res, next) => { loadWabaId().then(() => next(), () => next()) })
  const noStore = (res) => res.set('Cache-Control', 'no-store')
  admin.get('/whatsapp/overview', wa, wrap(async (req, res) => { noStore(res); res.json(await waOverview({ period: req.query.period })) }))
  admin.get('/whatsapp/messages', wa, wrap(async (req, res) => { noStore(res); res.json({ messages: await recentMessages(req.query) }) }))
  admin.get('/whatsapp/templates', wa, wrap(async (_req, res) => { noStore(res); res.json(await listTemplates()) }))
  admin.post('/whatsapp/templates/check', wa, wrap(async (req, res) => res.json({ problems: checkModel(req.body || {}) })))
  admin.post('/whatsapp/templates', wa, wrap(async (req, res) => res.json(await saveTemplate(req.body || {}, req.staff))))
  admin.post('/whatsapp/templates/sync', wa, wrap(async (_req, res) => res.json(await syncTemplates())))
  admin.post('/whatsapp/templates/:id/submit', wa, wrap(async (req, res) => res.json(await submitTemplate(req.params.id))))
  admin.post('/whatsapp/templates/:id/duplicate', wa, wrap(async (req, res) => res.json(await duplicateTemplate(req.params.id, req.staff))))
  admin.delete('/whatsapp/templates/:id', wa, wrap(async (req, res) => res.json(await deleteTemplate(req.params.id))))
  // A header picture / video / PDF sample for a template: the file itself as the body (up to 16 MB).
  admin.post('/whatsapp/templates/upload', wa, express.raw({ type: ['image/*', 'video/*', 'application/pdf'], limit: '16mb' }), wrap(async (req, res) => {
    const buf = Buffer.isBuffer(req.body) && req.body.length ? req.body : req.rawBody
    const type = String(req.get('content-type') || '').split(';')[0]
    if (!buf?.length || !['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'].includes(type)) {
      throw httpError('Bad file', { publicMessage: 'Use a JPG or PNG picture, an MP4 video or a PDF.' })
    }
    res.json({ handle: await uploadHeaderSample(buf, type) })
  }))
  admin.post('/whatsapp/test', wa, wrap(async (req, res) => res.json(await waSendTest(req.body || {}, req.staff))))
  admin.get('/whatsapp/settings', wa, wrap(async (_req, res) => { noStore(res); res.json(await waSettings()) }))
  admin.put('/whatsapp/settings', wa, wrap(async (req, res) => res.json(await saveWaSettings(req.body || {}))))
  admin.get('/whatsapp/bot', wa, wrap(async (_req, res) => { noStore(res); res.json(await getBot()) }))
  admin.put('/whatsapp/bot', wa, wrap(async (req, res) => res.json(await saveBot(req.body || {}))))
  admin.post('/whatsapp/bot/simulate', wa, wrap(async (req, res) => res.json(await simulateBot(req.body || {}))))
  // Phase 2: Inbox and Contacts
  admin.get('/whatsapp/chats', wa, wrap(async (req, res) => { noStore(res); res.json(await listChats(req.query, req.staff)) }))
  admin.get('/whatsapp/chats/:phone', wa, wrap(async (req, res) => { noStore(res); res.json(await getChat(req.params.phone, req.staff, { money: can(req.staff, 'money.view') })) }))
  admin.post('/whatsapp/chats/:phone/reply', wa, wrap(async (req, res) => res.json(await replyText(req.params.phone, req.body?.text, req.staff))))
  admin.post('/whatsapp/chats/:phone/template', wa, wrap(async (req, res) => res.json(await replyTemplate(req.params.phone, req.body || {}, req.staff))))
  admin.put('/whatsapp/chats/:phone', wa, wrap(async (req, res) => res.json(await updateChat(req.params.phone, req.body || {}, req.staff))))
  admin.post('/whatsapp/chats/:phone/notes', wa, wrap(async (req, res) => res.json(await addChatNote(req.params.phone, req.body?.body, req.staff))))
  admin.get('/whatsapp/quick-replies', wa, wrap(async (_req, res) => { noStore(res); res.json(await listQuickReplies()) }))
  admin.post('/whatsapp/quick-replies', wa, wrap(async (req, res) => res.json(await saveQuickReply(req.body || {}))))
  admin.delete('/whatsapp/quick-replies/:id', wa, wrap(async (req, res) => res.json(await deleteQuickReply(req.params.id))))
  admin.get('/whatsapp/contacts', wa, wrap(async (req, res) => { noStore(res); res.json(await listContacts(req.query)) }))
  admin.get('/whatsapp/contacts.csv', wa, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.type('text/csv').attachment('whatsapp-contacts.csv').send(await contactsCsv(req.query))
  }))
  admin.put('/whatsapp/contacts/:phone/tags', wa, wrap(async (req, res) => res.json(await setTags(req.params.phone, req.body?.tags))))
  admin.put('/whatsapp/contacts/:phone/permission', wa, wrap(async (req, res) => res.json(await setPermission(req.params.phone, req.body?.value))))
  admin.post('/whatsapp/contacts/import', wa, express.json({ limit: '5mb' }), wrap(async (req, res) => res.json(await importContacts(req.body?.rows))))
  // Phase 3: Automations
  admin.get('/whatsapp/automations', wa, wrap(async (_req, res) => { noStore(res); res.json(await automationsAdmin()) }))
  admin.put('/whatsapp/automations', wa, wrap(async (req, res) => res.json(await saveAutomations(req.body || {}))))
  admin.post('/whatsapp/automations/:key/test', wa, wrap(async (req, res) => res.json(await testAutomation(req.params.key, req.body?.phone, req.staff))))
  admin.post('/whatsapp/automations/run', wa, wrap(async (_req, res) => res.json(await runWhatsAppAutomations())))
  // Phase 4: Broadcasts
  admin.get('/whatsapp/broadcasts', wa, wrap(async (req, res) => { noStore(res); res.json({ broadcasts: await listBroadcasts({ money: can(req.staff, 'money.view') }), fields: BROADCAST_FIELDS }) }))
  admin.post('/whatsapp/broadcasts', wa, wrap(async (req, res) => res.json(await saveBroadcast(req.body || {}, req.staff))))
  admin.post('/whatsapp/broadcasts/audience', wa, wrap(async (req, res) => { const a = await broadcastAudience(req.body || {}); delete a.people; res.json(a) }))
  admin.post('/whatsapp/broadcasts/:id/launch', wa, wrap(async (req, res) => res.json(await launchBroadcast(req.params.id, req.body || {}))))
  admin.post('/whatsapp/broadcasts/:id/cancel', wa, wrap(async (req, res) => res.json(await cancelBroadcast(req.params.id))))
  admin.delete('/whatsapp/broadcasts/:id', wa, wrap(async (req, res) => res.json(await deleteBroadcast(req.params.id))))
  // Phase 6: Reports
  admin.get('/whatsapp/reports', wa, wrap(async (req, res) => { noStore(res); res.json(await waReport(req.query, { money: can(req.staff, 'money.view') })) }))
  admin.get('/whatsapp/reports.csv', wa, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.type('text/csv').attachment('whatsapp-report.csv').send(await waReportCsv(req.query, { money: can(req.staff, 'money.view') }))
  }))
  admin.post('/whatsapp/webhook/connect', wa, wrap(async (_req, res) => res.json(await connectWebhook())))

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
