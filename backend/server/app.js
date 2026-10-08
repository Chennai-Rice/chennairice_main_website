// The Express application: every /api route, and nothing else.
//
// Deliberately free of side effects — it builds the app and exports it,
// without binding a port. That is what lets one copy of these routes serve
// two very different runtimes: index.js listens on a port for local dev,
// and the Firebase Cloud Function in functions/ hands the same app to
// onRequest(). Calling app.listen() here would break the second.
//
// The Vercel functions in backend/functions/ are a third consumer of the
// same logic, though they import backend/lib directly rather than this app.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { callGroq } from '../lib/soruKutty.js'
import {
  POLICY_VERSION,
  buildRecord,
  clientIp,
  hasStore,
  readRecord,
  saveRecord,
} from '../lib/consent.js'
import { buildContactRow, buildBulkOrderRow, insertEnquiry } from '../lib/enquiries.js'
import {
  buildSessionRow,
  insertSession,
  touchSession,
  insertPageview,
  insertEvent,
  insertInteractions,
} from '../lib/analytics.js'
import { hasSupabase } from '../lib/supabase.js'
import { createCheckoutSession, confirmCheckout } from '../lib/checkout.js'
import { availableGateways } from '../lib/gateways.js'
import { hasDatabase } from '../lib/db.js'
import { createSalesRouter } from '../lib/sales/routes.js'

export const app = express()
app.use(cors())
app.use(
  express.json({
    limit: '200kb',
    // Webhook signatures are computed over the exact bytes received. Cloud
    // Functions already provide req.rawBody; this covers the local server.
    verify: (req, _res, buf) => {
      if (!req.rawBody) req.rawBody = buf
    },
  })
)

// The sales backend (PostgreSQL / Cloud SQL): catalog, checkout, order
// tracking, webhooks and the staff admin API. Mounted ahead of the older
// Supabase checkout routes below, so once a database is configured it answers
// /api/checkout/* and those are never reached. Without one, nothing changes.
if (hasDatabase()) app.use(createSalesRouter())

const PORT = process.env.PORT || 8787
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(GROQ_API_KEY), consentStore: hasStore, supabase: hasSupabase, salesDb: hasDatabase() })
})

/* Cookie consent — mirrors api/consent.js so the banner behaves the same
   against the dev proxy as it does on Vercel. */
app.get('/api/consent', async (req, res) => {
  const { id } = req.query
  if (!id) return res.json({ policyVersion: POLICY_VERSION, stored: hasStore })

  try {
    const record = await readRecord(id)
    if (!record) return res.status(404).json({ error: 'No consent recorded for that id.' })
    res.json({ consent: record })
  } catch (err) {
    console.error('Consent read error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not read the consent record.' })
  }
})

app.post('/api/consent', async (req, res) => {
  const { record, error } = buildRecord({
    body: req.body,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'],
    now: Date.now(),
  })
  if (error) return res.status(400).json({ error })

  try {
    const stored = await saveRecord(record)
    res.json({ consent: record, stored })
  } catch (err) {
    console.error('Consent write error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record the consent.' })
  }
})

/* Enquiry forms — mirror api/contact.js and api/bulk-order.js so they behave
   the same against the dev proxy as they do on Vercel. */
app.post('/api/contact', async (req, res) => {
  const { row, error } = buildContactRow(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const stored = await insertEnquiry('contact_enquiries', row)
    res.json({ ok: true, stored })
  } catch (err) {
    console.error('Contact enquiry error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not save your enquiry.' })
  }
})

app.post('/api/bulk-order', async (req, res) => {
  const { row, error } = buildBulkOrderRow(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const stored = await insertEnquiry('bulk_order_enquiries', row)
    res.json({ ok: true, stored })
  } catch (err) {
    console.error('Bulk order enquiry error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not save your enquiry.' })
  }
})

/* Visitor analytics — mirrors api/track/*.js so tracking behaves the same
   against the dev proxy as it does on Vercel. */
app.post('/api/track/session', async (req, res) => {
  const { row, error } = await buildSessionRow({ body: req.body, req })
  if (error) return res.status(400).json({ error })

  try {
    const stored = await insertSession(row)
    res.json({ ok: true, stored })
  } catch (err) {
    console.error('Session tracking error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not start session.' })
  }
})

app.post('/api/track/heartbeat', async (req, res) => {
  const { sessionId, totalSeconds, pageCount } = req.body || {}
  try {
    const stored = await touchSession({ sessionId, totalSeconds, pageCount })
    res.json({ ok: true, stored })
  } catch (err) {
    console.error('Heartbeat error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not update session.' })
  }
})

app.post('/api/track/pageview', async (req, res) => {
  try {
    const { error, stored } = await insertPageview(req.body)
    if (error) return res.status(400).json({ error })
    res.json({ ok: true, stored })
  } catch (err) {
    console.error('Pageview tracking error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record pageview.' })
  }
})

app.post('/api/track/event', async (req, res) => {
  try {
    const { error, stored } = await insertEvent(req.body)
    if (error) return res.status(400).json({ error })
    res.json({ ok: true, stored })
  } catch (err) {
    console.error('Event tracking error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record event.' })
  }
})

app.post('/api/track/interactions', async (req, res) => {
  try {
    const { error, stored, skipped } = await insertInteractions(req.body)
    if (error) return res.status(400).json({ error })
    res.json({ ok: true, stored, skipped })
  } catch (err) {
    console.error('Interaction tracking error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record interactions.' })
  }
})

app.post('/api/chat', async (req, res) => {
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' })
  }

  const { messages } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' })
  }

  try {
    const reply = await callGroq({ apiKey: GROQ_API_KEY, model: GROQ_MODEL, messages })
    res.json({ reply })
  } catch (err) {
    console.error('Chat proxy error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'Something went wrong talking to Soru Kutty.' })
  }
})

/* Guest checkout — mirrors api/checkout/*.js so payment behaves the same
   against the dev proxy as it does on Vercel. */
app.post('/api/checkout/session', async (req, res) => {
  try {
    const session = await createCheckoutSession(req.body)
    res.json({ ok: true, ...session })
  } catch (err) {
    console.error('Checkout session error:', err)
    res
      .status(err.status || 500)
      .json({ error: err.publicMessage || 'We could not start your order. Please try again.' })
  }
})

app.post('/api/checkout/verify', async (req, res) => {
  try {
    const result = await confirmCheckout(req.body)
    res.json(result)
  } catch (err) {
    console.error('Checkout verify error:', err)
    res.status(err.status || 500).json({ error: err.publicMessage || 'We could not confirm your payment.' })
  }
})
