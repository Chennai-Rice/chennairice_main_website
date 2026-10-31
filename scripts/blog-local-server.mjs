// A throwaway local database for trying the journal editor without any live service:
//   npm run blog:local            (this server, port 5175, SQLite file in scripts/.blog-local/)
//   VITE_BLOG_LOCAL=1 npm run dev (the site, switched to this server; then open /dev/journal)
// It answers the same API as backend/lib/sales/blog.js (no sign-in), so the editor behaves as it will live.
// Posts and uploaded pictures live in scripts/.blog-local/ and nowhere else.
import { DatabaseSync } from 'node:sqlite'
import http from 'node:http'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.BLOG_LOCAL_PORT) || 5175
const dir = join(dirname(fileURLToPath(import.meta.url)), '.blog-local')
mkdirSync(join(dir, 'files'), { recursive: true })

const db = new DatabaseSync(join(dir, 'blog.db'))
db.exec(`
  create table if not exists blog_posts (
    id text primary key,
    slug text not null unique,
    title text not null,
    card_title text,
    excerpt text,
    content_md text not null default '',
    cover_path text,
    cover_alt text,
    author_name text not null default 'Chennai Rice Industries',
    status text not null default 'draft',
    reading_minutes integer,
    published_at text,
    created_at text not null,
    updated_at text not null
  )`)

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }
const CONTENT_TYPES = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([t, e]) => [e, t]))
const imageUrl = (p) => (p ? `/api/blog/images/${p}` : null)

const card = (r) => ({
  id: r.id, slug: r.slug, title: r.title, cardTitle: r.card_title || '', excerpt: r.excerpt,
  coverUrl: imageUrl(r.cover_path), coverAlt: r.cover_alt || '', author: r.author_name || 'Chennai Rice Industries',
  publishedAt: r.published_at, readingMinutes: r.reading_minutes,
})
const editable = (r) => ({
  ...card(r), excerpt: r.excerpt || '', contentMd: r.content_md || '', coverPath: r.cover_path, status: r.status, updatedAt: r.updated_at,
})

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}
const fail = (res, status, message) => send(res, status, { error: message })
const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks)))
})
const one = (sql, ...args) => db.prepare(sql).get(...args) ?? null

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '')

    // Readers
    if (req.method === 'GET' && path === '/api/blog/posts') {
      const rows = db.prepare(`select * from blog_posts where status = 'published' and published_at <= ? order by published_at desc`).all(new Date().toISOString())
      return send(res, 200, { posts: rows.map(card) })
    }
    if (req.method === 'GET' && path.startsWith('/api/blog/posts/')) {
      const r = one(`select * from blog_posts where slug = ? and status = 'published' and published_at <= ?`, decodeURIComponent(path.slice(16)), new Date().toISOString())
      return r ? send(res, 200, { post: editable(r) }) : fail(res, 404, 'No such post.')
    }
    if (req.method === 'GET' && path.startsWith('/api/blog/images/')) {
      const file = join(dir, 'files', basename(path))
      if (!existsSync(file)) return fail(res, 404, 'No such picture.')
      return send(res, 200, readFileSync(file), CONTENT_TYPES[file.split('.').pop()] || 'application/octet-stream')
    }

    // Writers (no sign-in here)
    if (req.method === 'GET' && path === '/api/admin/blog/posts') {
      return send(res, 200, { posts: db.prepare('select * from blog_posts order by updated_at desc').all().map((r) => ({ ...card(r), status: r.status, updatedAt: r.updated_at })) })
    }
    if (req.method === 'GET' && path.startsWith('/api/admin/blog/posts/')) {
      const r = one('select * from blog_posts where id = ?', path.slice(22))
      return r ? send(res, 200, { post: editable(r) }) : fail(res, 404, 'That post could not be opened. It may have been deleted.')
    }
    if (req.method === 'POST' && path === '/api/admin/blog/posts') {
      const { id, row } = JSON.parse((await readBody(req)).toString() || '{}')
      if (!row?.title?.trim()) return fail(res, 400, 'Give the post a title.')
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug || '')) return fail(res, 400, 'The web address may only contain lowercase letters, numbers and hyphens.')
      const status = row.status === 'published' ? 'published' : 'draft'
      const publishedAt = status === 'published' ? row.published_at || new Date().toISOString() : null
      const v = [row.slug, row.title.trim(), row.card_title || null, row.excerpt || null, row.content_md ?? '', row.cover_path || null, row.cover_alt || null, status, row.reading_minutes ?? null, publishedAt]
      const now = new Date().toISOString()
      try {
        if (id) {
          db.prepare(`update blog_posts set slug=?, title=?, card_title=?, excerpt=?, content_md=?, cover_path=?, cover_alt=?, status=?, reading_minutes=?, published_at=?, updated_at=? where id=?`).run(...v, now, id)
          return send(res, 200, { post: editable(one('select * from blog_posts where id = ?', id)) })
        }
        const newId = randomUUID()
        db.prepare(`insert into blog_posts (id, slug, title, card_title, excerpt, content_md, cover_path, cover_alt, status, reading_minutes, published_at, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(newId, ...v, now, now)
        return send(res, 200, { post: editable(one('select * from blog_posts where id = ?', newId)) })
      } catch (err) {
        if (/unique/i.test(err.message)) return fail(res, 409, 'That web address is already used by another post. Change the link and try again.')
        throw err
      }
    }
    if (req.method === 'DELETE' && path.startsWith('/api/admin/blog/posts/')) {
      db.prepare('delete from blog_posts where id = ?').run(path.slice(22))
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === '/api/admin/blog/images') {
      const ext = IMAGE_TYPES[String(req.headers['content-type'] || '').split(';')[0].trim()]
      if (!ext) return fail(res, 400, 'Use a JPEG, PNG, WebP or AVIF image.')
      const name = `${randomUUID()}.${ext}`
      writeFileSync(join(dir, 'files', name), await readBody(req))
      return send(res, 200, { path: name, url: imageUrl(name) })
    }
    fail(res, 404, 'Not found')
  } catch (err) {
    fail(res, 500, err.message)
  }
}).listen(PORT, () => console.log(`Local blog test database on http://localhost:${PORT} (files in scripts/.blog-local/)`))
