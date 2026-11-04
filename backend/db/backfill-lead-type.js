// Gives the leads already sent to NeoDove their "Lead type" (Meta Ads, Google Ads, WhatsApp, Bulk enquiry, checkout...).
//
//   node db/backfill-lead-type.js                 counts what it would do, sends nothing
//   node db/backfill-lead-type.js --apply         updates every lead
//   node db/backfill-lead-type.js --apply --limit 1   updates just one lead, to check it first
//
// It needs the database settings of db:migrate and the NeoDove links (NEODOVE_ENDPOINT_GAYATHRI / _RAMYA / _LAVANYA, and
// NEODOVE_ENDPOINT, NEODOVE_PAYMENT_ENDPOINT, NEODOVE_DETAILS_ENDPOINT for leads sent to the older campaigns) in the environment.
import { closePool, query } from '../lib/db.js'
import { backfillLeadTypes } from '../lib/neodove.js'

const apply = process.argv.includes('--apply')
const i = process.argv.indexOf('--limit')
const limit = i > 0 ? Math.max(1, Number(process.argv[i + 1]) || 1) : 500
try {
  const r = await backfillLeadTypes({ query, apply, limit })
  console.log(JSON.stringify(r, null, 2))
  if (!apply) console.log('Nothing was sent. Run again with --apply (add --limit 1 to try one lead first).')
} finally {
  await closePool()
}
