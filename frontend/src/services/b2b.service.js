// Thin wrapper functions around the EXISTING /api/contact and
// /api/bulk-order endpoints (api/contact.js, api/bulk-order.js, backed by
// api/_lib/enquiries.js -> contact_enquiries / bulk_order_enquiries tables).
// Those endpoints do the real validation server-side and are unchanged here
// — this file just gives calling components a documented function instead
// of an inline fetch(), matching the field names those endpoints already
// expect.
//
// Unlike analytics.service.js, these do NOT swallow errors: a contact/bulk
// order form needs to know a submission failed so it can show the user the
// server's error message (see api/_lib/enquiries.js's client-safe error
// strings), the same way the existing contact/bulk-order form components
// already handle the raw fetch today.

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || `Request to ${path} failed (HTTP ${res.status}).`)
  }
  return data
}

/**
 * Submit the contact-page enquiry form.
 * @param {{ name: string, email: string, phone: string, enquiry: string }} params
 * @returns {Promise<{ ok: true, stored: boolean }>}
 */
export function submitContactEnquiry(params) {
  return post('/api/contact', params)
}

/**
 * Submit the bulk-order enquiry form.
 * @param {{ type: 'distributor'|'wholesaler'|'retailer'|'other', otherType?: string, company: string, name?: string, email: string, phone: string, quantity: string, message?: string }} params
 *   `otherType` required when type === 'other'. `name` required unless
 *   type === 'retailer' (see api/_lib/enquiries.js buildBulkOrderRow).
 * @returns {Promise<{ ok: true, stored: boolean }>}
 */
export function submitBulkOrderEnquiry(params) {
  return post('/api/bulk-order', params)
}
