// The website's contact and bulk-order enquiries for the /admin Enquiries dashboard. Stored in Cloud SQL
// (lib/enquiries.js writes them; migration 053) since Nov 2026, before that in Supabase. Staff see them
// through the staff sign-in (enquiries.view).
import { hasDatabase, query } from '../db.js'
import { httpError, str } from './util.js'

const TABLES = { contact: 'contact_enquiries', bulk: 'bulk_order_enquiries' }
const STATUSES = ['new', 'contacted', 'closed', 'spam']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMIT = 1000

function failed(error) {
  console.error('[enquiries]', error.message)
  return httpError('Enquiries read failed', { status: 502, publicMessage: 'Could not load the enquiries just now. Please try again.' })
}

/** Both kinds of enquiry, newest first, with counts for the dashboard. */
export async function listEnquiries() {
  if (!hasDatabase()) return { contact: [], bulk: [], counts: null, configured: false }
  let contact
  let bulk
  try {
    ;[{ rows: contact }, { rows: bulk }] = await Promise.all(
      Object.values(TABLES).map((t) => query(`select * from ${t} order by created_at desc limit ${LIMIT}`)))
  } catch (err) {
    throw failed(err)
  }
  const all = [...contact, ...bulk]
  const since = (days) => Date.now() - days * 864e5
  const counts = {
    total: all.length,
    contact: contact.length,
    bulk: bulk.length,
    new: all.filter((e) => e.status === 'new').length,
    contacted: all.filter((e) => e.status === 'contacted').length,
    closed: all.filter((e) => e.status === 'closed').length,
    spam: all.filter((e) => e.status === 'spam').length,
    today: all.filter((e) => new Date(e.created_at).getTime() > since(1)).length,
    week: all.filter((e) => new Date(e.created_at).getTime() > since(7)).length,
  }
  return { contact, bulk, counts, configured: true }
}

/** Status (new / contacted / closed / spam) and the team's notes on one enquiry. */
export async function updateEnquiry(kind, id, body) {
  const table = TABLES[kind]
  if (!table) throw httpError('Unknown enquiry type.')
  if (!UUID.test(String(id))) throw httpError('Not found', { status: 404, publicMessage: 'That enquiry could not be found.' })
  if (body?.status !== undefined && !STATUSES.includes(body.status)) throw httpError('Status must be new, contacted, closed or spam.')
  if (!hasDatabase()) throw httpError('No database', { status: 503, publicMessage: 'Enquiries are not available right now.' })
  const notes = body?.notes !== undefined ? str(body.notes).slice(0, 2000) || null : undefined
  const { rows: [data] } = await query(
    `update ${table} set status = coalesce($2, status), notes = case when $3 then $4 else notes end, updated_at = now()
      where id = $1 returning *`,
    [id, body?.status ?? null, notes !== undefined, notes ?? null]).catch((err) => { throw failed(err) })
  if (!data) throw httpError('Not found', { status: 404, publicMessage: 'That enquiry could not be found.' })
  return data
}
