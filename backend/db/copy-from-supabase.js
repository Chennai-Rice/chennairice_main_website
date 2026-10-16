// One-time copy of everything the website kept in Supabase into Cloud SQL
// (tables from migration 018): enquiries, visitor analytics, blog posts and
// their cover images. Safe to run more than once — rows already copied are
// skipped — so it can be re-run just before switching over to catch anything
// that arrived in between.
//
//   node db/copy-from-supabase.js --dry   counts what Supabase holds, writes nothing
//   node db/copy-from-supabase.js         copies into the database in DATABASE_URL
//                                         (or CLOUD_SQL_INSTANCE + DB_USER/DB_PASSWORD/DB_NAME)
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or
// backend/server/.env. Neither is ever printed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, closePool } from '../lib/db.js'

const DRY = process.argv.includes('--dry')
const HERE = path.dirname(fileURLToPath(import.meta.url))

function supabaseEnv() {
  let url = process.env.SUPABASE_URL
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const envPath = path.join(HERE, '..', 'server', '.env')
  if ((!url || !key) && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=')
      if (i < 0 || line.trim().startsWith('#')) continue
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (k === 'SUPABASE_URL' && !url) url = v
      if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !key) key = v
    }
  }
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (backend/server/.env).')
  return { url: url.replace(/\/$/, ''), key }
}

const SB = supabaseEnv()
const headers = { apikey: SB.key, Authorization: 'Bearer ' + SB.key }

/** Every row of a Supabase table, 1000 at a time. A missing table gives []. */
async function readAll(table, order) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SB.url}/rest/v1/${table}?select=*&order=${order}.asc&limit=1000&offset=${offset}`, { headers })
    if (res.status === 404) return rows
    if (!res.ok) {
      const body = await res.text()
      if (/does not exist|could not find the table/i.test(body)) return rows
      throw new Error(`Reading ${table} from Supabase failed (${res.status}): ${body.slice(0, 200)}`)
    }
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

const columnsCache = new Map()
async function targetColumns(table) {
  if (!columnsCache.has(table)) {
    const { rows } = await query(
      `select column_name from information_schema.columns where table_schema = current_schema() and table_name = $1`,
      [table]
    )
    if (!rows.length) throw new Error(`Table ${table} is missing in Cloud SQL — run node db/migrate.js first.`)
    columnsCache.set(table, new Set(rows.map((r) => r.column_name)))
  }
  return columnsCache.get(table)
}

const asParam = (v) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v)

/**
 * Inserts rows, keeping only the columns the Cloud SQL table has. Rows that
 * are already there are skipped; rows whose parent session never reached
 * Supabase (foreign key) are skipped and counted.
 */
async function insertRows(table, rows) {
  if (!rows.length) return { inserted: 0, orphans: 0 }
  const have = await targetColumns(table)
  const cols = Object.keys(rows[0]).filter((c) => have.has(c))
  const insertOne = async (batch) => {
    const values = []
    const tuples = batch.map((row) => `(${cols.map((c) => { values.push(asParam(row[c] ?? null)); return '$' + values.length }).join(', ')})`)
    const { rowCount } = await query(`insert into ${table} (${cols.join(', ')}) values ${tuples.join(', ')} on conflict do nothing`, values)
    return rowCount
  }
  let inserted = 0
  let orphans = 0
  const size = Math.max(1, Math.floor(20000 / cols.length))
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    try {
      inserted += await insertOne(batch)
    } catch (err) {
      if (err.code !== '23503') throw err
      for (const row of batch) {
        try {
          inserted += await insertOne([row])
        } catch (e) {
          if (e.code !== '23503') throw e
          orphans++
        }
      }
    }
  }
  return { inserted, orphans }
}

/** Blog covers: downloaded from the blog-images bucket into blog_images. */
async function copyCover(coverPath) {
  if (!coverPath || coverPath.startsWith('img/')) return coverPath || null
  const res = await fetch(`${SB.url}/storage/v1/object/blog-images/${coverPath.split('/').map(encodeURIComponent).join('/')}`, { headers })
  if (!res.ok) {
    console.warn(`  cover ${coverPath} could not be downloaded (${res.status}); the post is copied without it`)
    return null
  }
  const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
  const data = Buffer.from(await res.arrayBuffer())
  // The same file copied twice (a re-run) reuses the stored image.
  const { rows: [found] } = await query('select id from blog_images where content_type = $1 and data = $2 limit 1', [type, data])
  if (found) return 'img/' + found.id
  const { rows: [row] } = await query('insert into blog_images (content_type, data) values ($1, $2) returning id', [type, data])
  return 'img/' + row.id
}

const TABLES = [
  ['contact_enquiries', 'created_at'],
  ['bulk_order_enquiries', 'created_at'],
  ['visitors', 'first_seen_at'],
  ['visitor_sessions', 'started_at'],
  ['visitor_pageviews', 'entered_at'],
  ['visitor_events', 'occurred_at'],
  ['visitor_interactions', 'occurred_at'],
]

console.log(DRY ? 'Dry run — nothing is written.\n' : 'Copying Supabase → Cloud SQL\n')

for (const [table, order] of TABLES) {
  const rows = await readAll(table, order)
  if (DRY) {
    console.log(`${table.padEnd(22)} ${rows.length} rows in Supabase`)
    continue
  }
  const { inserted, orphans } = await insertRows(table, rows)
  console.log(`${table.padEnd(22)} ${rows.length} in Supabase, ${inserted} copied now${orphans ? `, ${orphans} skipped (no session)` : ''}`)
}

// Visitor numbers continue after the highest one copied.
if (!DRY) {
  await query(`select setval(pg_get_serial_sequence('visitors', 'visitor_no'), coalesce((select max(visitor_no) from visitors), 0) + 1, false)`)
}

// Blog: author names come with the post; the author's email from blog_authors.
const authors = new Map((await readAll('blog_authors', 'user_id')).map((a) => [a.user_id, a]))
const posts = await readAll('blog_posts', 'created_at')
if (DRY) {
  const covers = posts.filter((p) => p.cover_path).length
  console.log(`${'blog_posts'.padEnd(22)} ${posts.length} posts in Supabase (${posts.filter((p) => p.status === 'published').length} published, ${covers} with a cover image)`)
} else {
  let copied = 0
  for (const post of posts) {
    const { rows: [exists] } = await query('select 1 from blog_posts where id = $1', [post.id])
    if (exists) continue
    const author = authors.get(post.author_id)
    const { inserted } = await insertRows('blog_posts', [{
      ...post,
      cover_path: await copyCover(post.cover_path),
      author_email: author?.email || null,
      author_name: post.author_name || author?.display_name || 'Chennai Rice',
    }])
    copied += inserted
  }
  console.log(`${'blog_posts'.padEnd(22)} ${posts.length} in Supabase, ${copied} copied now (covers included)`)
}

await closePool()
