// One-off, after Sales Daddy's Facebook reconnect and "Fill in missing ad details" (their note of 27 Nov 2026):
// re-reads the Meta form leads of the last N days (default 90) from Sales Daddy and completes the ones we already
// copied with the campaign, ad set, ad, platform and every Meta lead ID. Fill-only: a lead we never copied is NOT
// set up or sent to NeoDove (no old leads reach the telecallers). The 10-minute job keeps new leads complete after.
//
//   node db/lead-forms-refill.js [days]      (database settings of db:migrate and SALESDADDY_API_KEY in the environment)
//
// Prints counts only.
import { closePool, query } from '../lib/db.js'
import { syncLeadForms } from '../lib/lead-forms.js'

const days = Math.min(Math.max(Number(process.argv[2]) || 90, 1), 120)
const since = new Date(Date.now() - days * 86400e3).toISOString()
console.log(`Reading the Meta form leads of the last ${days} days from Sales Daddy (fill-only)…`)
const r = await syncLeadForms({ query, since, maxPages: 300, fillOnly: true })
if (r.error || r.skipped) console.log('Not done:', r.error || r.skipped)
else console.log(`Read ${r.read} leads; completed ${r.updated} we already had; ${r.skipped} skipped (not copied before, or not a valid mobile).`)
await closePool()
