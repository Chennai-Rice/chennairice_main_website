// Shared enquiry-form logic — used by both the Vercel serverless functions
// (api/contact.js, api/bulk-order.js, production) and the local dev proxy
// (backend/server/index.js). Keeping one copy avoids the two drifting apart, the
// same arrangement as lib/consent.js.
import { hasSupabase, supabase } from './supabase.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+()\-\s\d]{8,16}$/
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const BUYER_TYPES = ['distributor', 'wholesaler', 'retailer', 'other']

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validates a /contact submission and shapes it into a contact_enquiries row.
 * Returns { row } on success or { error } with a client-safe message.
 */
export function buildContactRow(body) {
  const name = str(body?.name)
  const email = str(body?.email)
  const phone = str(body?.phone)
  const enquiry = str(body?.enquiry)

  if (!name) return { error: 'Please tell us your name.' }
  if (!email || !EMAIL_PATTERN.test(email)) return { error: 'A valid email address is required.' }
  if (!phone || !PHONE_PATTERN.test(phone)) return { error: 'A valid phone number is required.' }
  if (!enquiry) return { error: 'Please tell us what you need.' }

  return { row: { name, email, phone, enquiry } }
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
  if (buyerType === 'other' && !quantity) return { error: 'Please tell us how many KGs you need.' }

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
 * false when Supabase is not configured — a missing store must not fail the
 * request, since the visitor should still see their enquiry as accepted only
 * once we are certain we can retain it, so callers surface `false` as a
 * clear "not delivered yet" state rather than a fabricated success.
 */
export async function insertEnquiry(table, row) {
  if (!hasSupabase) return false

  const { error } = await supabase.from(table).insert(row)
  if (error) {
    const err = new Error(`Supabase insert into ${table} failed: ${error.message}`)
    err.status = 502
    err.publicMessage = 'Could not save your enquiry. Please try again shortly.'
    throw err
  }
  return true
}
