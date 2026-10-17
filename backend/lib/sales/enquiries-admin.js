// The website's contact and bulk-order enquiries for the /admin Enquiries
// dashboard. They are stored in Supabase (lib/enquiries.js writes them there),
// read here with the server-side client; staff see them through the staff
// sign-in (enquiries.view), never through the browser's own Supabase access.
import { hasSupabase, supabase } from '../supabase.js'
import { httpError, str } from './util.js'

const TABLES = { contact: 'contact_enquiries', bulk: 'bulk_order_enquiries' }
const STATUSES = ['new', 'contacted', 'closed']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMIT = 1000

function failed(error) {
  console.error('[enquiries] Supabase:', error.message)
  return httpError('Supabase read failed', { status: 502, publicMessage: 'Could not load the enquiries just now. Please try again.' })
}

/** Both kinds of enquiry, newest first, with counts for the dashboard. */
export async function listEnquiries() {
  if (!hasSupabase) return { contact: [], bulk: [], counts: null, configured: false }
  const [contact, bulk] = await Promise.all(
    Object.values(TABLES).map((t) => supabase.from(t).select('*').order('created_at', { ascending: false }).limit(LIMIT))
  )
  for (const r of [contact, bulk]) if (r.error) throw failed(r.error)
  const all = [...contact.data, ...bulk.data]
  const since = (days) => Date.now() - days * 864e5
  const counts = {
    total: all.length,
    contact: contact.data.length,
    bulk: bulk.data.length,
    new: all.filter((e) => e.status === 'new').length,
    contacted: all.filter((e) => e.status === 'contacted').length,
    closed: all.filter((e) => e.status === 'closed').length,
    today: all.filter((e) => new Date(e.created_at).getTime() > since(1)).length,
    week: all.filter((e) => new Date(e.created_at).getTime() > since(7)).length,
  }
  return { contact: contact.data, bulk: bulk.data, counts, configured: true }
}

/** Status (new / contacted / closed) and the team's notes on one enquiry. */
export async function updateEnquiry(kind, id, body) {
  const table = TABLES[kind]
  if (!table) throw httpError('Unknown enquiry type.')
  if (!UUID.test(String(id))) throw httpError('Not found', { status: 404, publicMessage: 'That enquiry could not be found.' })
  const patch = { updated_at: new Date().toISOString() }
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw httpError('Status must be new, contacted or closed.')
    patch.status = body.status
  }
  if (body?.notes !== undefined) patch.notes = str(body.notes).slice(0, 2000) || null
  if (!hasSupabase) throw httpError('No Supabase', { status: 503, publicMessage: 'Enquiries are not available right now.' })
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().maybeSingle()
  if (error) throw failed(error)
  if (!data) throw httpError('Not found', { status: 404, publicMessage: 'That enquiry could not be found.' })
  return data
}
