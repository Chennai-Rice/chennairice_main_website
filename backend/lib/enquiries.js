// Shared enquiry-form logic — used by both the Vercel serverless functions
// (api/contact.js, api/bulk-order.js, production) and the local dev proxy
// (backend/server/index.js). Keeping one copy avoids the two drifting apart, the
// same arrangement as lib/consent.js.
// Stored in Cloud SQL (migration 053) since Nov 2026; before that in Supabase.
import { hasDatabase, query } from './db.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+()\-\s\d]{8,16}$/
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const BUYER_TYPES = ['distributor', 'wholesaler', 'retailer', 'other']

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Who is writing: the contact page's "Segment" dropdown (Nov 2026; includes every segment of the
 * owner's lead list). The page lists the same keys and labels (ContactPage.jsx). */
export const CONTACT_TOPICS = {
  customer: 'Customer',
  wholesaler: 'Wholesaler',
  retailer: 'Retailer',
  distributor: 'Distributor',
  wholesale_distributors: 'Wholesale Distributors',
  sudehy: 'SuDeHy (Supermarket / Hypermarket / Departmental Stores)',
  horeca: 'HoReCa (Hotels, Restaurants, Caterers)',
  batter_making: 'Batter Making',
  exporters: 'Exporters',
  rice_millers: 'Rice Millers',
  retail_consumers: 'Retail Consumers',
  b2c: 'B2C',
  na: 'NA',
}

/**
 * Validates a /contact submission and shapes it into a contact_enquiries row.
 * Returns { row, topic } on success or { error } with a client-safe message.
 *
 * Who they are, name, mobile and a message are needed; email is optional (many customers only use a
 * phone) but checked when given. Who they are and the city/PIN go at the top of the saved message,
 * so the team sees them in /admin and the CRM without a new column.
 */
export function buildContactRow(body) {
  const name = str(body?.name)
  const email = str(body?.email)
  const phone = str(body?.phone)
  const message = str(body?.enquiry)
  const topicKey = str(body?.topic)
  // An older cached page sends no type: saved as "Not given" rather than refused.
  const topic = Object.hasOwn(CONTACT_TOPICS, topicKey) ? CONTACT_TOPICS[topicKey] : topicKey ? '' : 'Not given'
  const city = str(body?.city).slice(0, 80)

  if (!topic) return { error: 'Please select a segment.' }
  if (!name) return { error: 'Please tell us your name.' }
  if (!phone || !PHONE_PATTERN.test(phone)) return { error: 'A valid phone number is required.' }
  if (email && !EMAIL_PATTERN.test(email)) return { error: 'That email address does not look right.' }
  if (!message) return { error: 'Please tell us what you need.' }

  const enquiry = ['Segment: ' + topic, city ? 'City / PIN: ' + city : ''].filter(Boolean).join('\n') + '\n\n' + message

  return { row: { name, email, phone, enquiry }, topic }
}

/**
 * Validates a /bulk-order submission and shapes it into a
 * bulk_order_enquiries row.
 */
export function buildBulkOrderRow(body) {
  const buyerType = str(body?.type)
  const otherType = str(body?.otherType)
  const company = str(body?.company)
  const name = str(body?.name)
  const email = str(body?.email)
  const phone = str(body?.phone)
  /* The form no longer asks for a quantity, but the column stays and is still
     read off the body: rows written before the field was dropped keep their
     value, and an older cached build of the page can still post one. */
  const quantity = str(body?.quantity)
  const message = str(body?.message)
  const gstin = str(body?.gstin).toUpperCase()

  if (!BUYER_TYPES.includes(buyerType)) return { error: 'Please choose who you are ordering as.' }
  if (buyerType === 'other' && !otherType) return { error: 'Please tell us your business type.' }
  if (!company) return { error: 'Please add your company or business name.' }
  if (!gstin || !GSTIN_PATTERN.test(gstin)) return { error: 'A valid GSTIN is required.' }
  if (!name) return { error: "Please add the representative's name." }
  if (!email || !EMAIL_PATTERN.test(email)) return { error: 'A valid email address is required.' }
  if (!phone || !PHONE_PATTERN.test(phone)) return { error: 'A valid phone number is required.' }

  return {
    row: {
      buyer_type: buyerType,
      other_type: buyerType === 'other' ? otherType : null,
      company_or_name: company,
      representative_name: name,
      email,
      phone,
      quantity_kg: quantity || null,
      message: message || null,
      gstin,
    },
  }
}

/**
 * Inserts one row into the given table. Resolves to true when stored and
 * false when there is no database — a missing store must not fail the
 * request, since the visitor should still see their enquiry as accepted only
 * once we are certain we can retain it, so callers surface `false` as a
 * clear "not delivered yet" state rather than a fabricated success.
 */
export async function insertEnquiry(table, row) {
  if (!hasDatabase()) return false
  if (!['contact_enquiries', 'bulk_order_enquiries'].includes(table)) throw new Error('Unknown enquiry table ' + table)

  const cols = Object.keys(row)
  const error = await query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, cols.map((c) => row[c]))
    .then(() => null, (e) => e)
  // Table not created yet (migration 053 not run): not stored, but the visitor is not shown an error.
  if (error?.code === '42P01') { console.error('[enquiries] table missing, run migration 053'); return false }
  if (error) {
    const err = new Error(`Database insert into ${table} failed: ${error.message}`)
    err.status = 502
    err.publicMessage = 'Could not save your enquiry. Please try again shortly.'
    throw err
  }
  return true
}
