// Test harness: a real PostgreSQL 16 (embedded-postgres), a fresh database
// per test file, and a fake Razorpay answering on the fetch() the gateway
// code uses. Nothing here talks to the internet.
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(ROOT, '..', '.data', 'test-pg')
const PORT = 5499

export const RAZORPAY_SECRET = 'test_secret_' + crypto.randomBytes(4).toString('hex')
export const WEBHOOK_SECRET = 'whsec_' + crypto.randomBytes(4).toString('hex')

/** Starts Postgres, creates an empty database, points DATABASE_URL at it. */
export async function startDatabase() {
  const server = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: 'postgres', port: PORT, persistent: true })
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) await server.initialise()
  await server.start()
  const name = 'test_' + crypto.randomBytes(4).toString('hex')
  const admin = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' })
  await admin.connect()
  // UTF-8 like Cloud SQL; Windows would otherwise default to WIN1252, which cannot hold ₹.
  await admin.query('create database ' + name + " encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'")
  await admin.end()
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${name}`

  return async function stop(closePool) {
    await closePool()
    const c = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' })
    await c.connect()
    await c.query('drop database if exists ' + name + ' with (force)')
    await c.end()
    await server.stop()
  }
}

/** Environment the gateway modules read when they are first imported. */
export function setTestEnv() {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fake'
  process.env.RAZORPAY_KEY_SECRET = RAZORPAY_SECRET
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.PAYMENT_GATEWAY_PRIORITY = 'razorpay'
  process.env.OWNER_EMAILS = 'owner@chennairice.test'
  process.env.SALES_NOTIFY_EMAIL = 'sales@chennairice.test'
  process.env.JOB_TOKEN = 'job-token-for-tests'
  delete process.env.RESEND_API_KEY
  delete process.env.SMTP_HOST
  delete process.env.EMAIL_FROM
  delete process.env.CLOUD_SQL_INSTANCE
}

/**
 * A pretend Razorpay. Orders and payments live in memory; `pay(orderId)`
 * simulates the customer completing payment and returns what the checkout
 * widget would hand the browser (payment id + valid signature).
 */
export function fakeRazorpay() {
  const realFetch = globalThis.fetch
  const orders = new Map()
  const payments = new Map()
  let seq = 0
  const state = { failNextOrder: false, refunds: [] }

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (!u.startsWith('https://api.razorpay.com/')) return realFetch(url, init)
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    const p = u.replace('https://api.razorpay.com/v1', '')
    const body = init.body ? JSON.parse(init.body) : null
    if (p === '/orders' && init.method === 'POST') {
      if (state.failNextOrder) {
        state.failNextOrder = false
        return json(500, { error: { description: 'down' } })
      }
      const order = { id: 'order_' + ++seq, amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created' }
      orders.set(order.id, order)
      return json(200, order)
    }
    let m = p.match(/^\/payments\/([^/]+)\/refund$/)
    if (m) {
      const refund = { id: 'rfnd_' + ++seq, payment_id: m[1], amount: body.amount, status: 'processed' }
      state.refunds.push(refund)
      return json(200, refund)
    }
    m = p.match(/^\/payments\/([^/]+)$/)
    if (m) {
      const pay = payments.get(m[1])
      return pay ? json(200, pay) : json(404, { error: { description: 'no such payment' } })
    }
    return json(404, { error: { description: 'unknown path ' + p } })
  }

  function pay(orderId, { status = 'captured', amount } = {}) {
    const order = orders.get(orderId)
    const id = 'pay_' + ++seq
    payments.set(id, { id, order_id: orderId, amount: amount ?? order.amount, currency: 'INR', status, method: 'card', card: { last4: '1111' } })
    const signature = crypto.createHmac('sha256', RAZORPAY_SECRET).update(orderId + '|' + id).digest('hex')
    return { paymentId: id, signature, payment: payments.get(id) }
  }

  return { pay, orders, payments, state, restore: () => { globalThis.fetch = realFetch } }
}

/** Fake Firebase verifier: token "email|uid|verified". */
export function fakeVerifier(token) {
  const [email, uid, verified] = String(token).split('|')
  if (!email || !uid) throw new Error('bad token')
  return { email, uid, email_verified: verified !== 'unverified', name: email.split('@')[0] }
}

export function signWebhook(raw) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')
}
