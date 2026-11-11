// One-off (Nov 2026): copies the old Supabase project's analytics and enquiries to JSON files, so they can be
// loaded into Cloud SQL with db/import-supabase.js. Read-only on Supabase. Uses SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from backend/server/.env (never printed).
//
//   node db/export-supabase.js <folder>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(fs.readFileSync(path.join(here, '..', 'server', '.env'), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l.trim())).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/server/.env'); process.exit(1) }

const out = process.argv[2]
if (!out) { console.error('Give an output folder.'); process.exit(1) }
fs.mkdirSync(out, { recursive: true })

// Parents before children (sessions before page views etc.), the order they must be loaded in.
export const TABLES = ['visitors', 'visitor_sessions', 'visitor_pageviews', 'visitor_events', 'visitor_interactions', 'contact_enquiries', 'bulk_order_enquiries']
const ORDER = { visitors: 'visitor_no', visitor_sessions: 'started_at', visitor_pageviews: 'entered_at', visitor_events: 'occurred_at', visitor_interactions: 'occurred_at', contact_enquiries: 'created_at', bulk_order_enquiries: 'created_at' }
const PAGE = 1000

for (const t of TABLES) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL}/rest/v1/${t}?select=*&order=${ORDER[t]}.asc`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' },
    })
    if (!res.ok) { console.log(`${t}: not exported (${res.status} ${(await res.text()).slice(0, 120)})`); break }
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) break
  }
  fs.writeFileSync(path.join(out, `${t}.json`), JSON.stringify(rows))
  console.log(`${t}: ${rows.length} rows`)
}
