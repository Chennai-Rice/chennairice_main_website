// The journal (blog): posts in Cloud SQL (blog_posts), pictures in a Cloud Storage bucket (BLOG_BUCKET).
// Moved from Supabase in Oct 2026. Readers get published posts without signing in; writers are staff with
// the 'blog.manage' permission (staff.js: owner, admin, IT team and the 'blog' role).
//
//   GET  /api/blog/posts            published posts, newest first (cards)
//   GET  /api/blog/posts/:slug      one published post
//   GET  /api/blog/images/:name     a picture from the bucket
//   /api/admin/blog/...             list, open, save, delete, upload (routes.js)
import { randomUUID } from 'node:crypto'
import { httpError, str } from './util.js'

const AUTHOR = () => process.env.BLOG_AUTHOR_NAME || 'Chennai Rice Industries'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }
const CONTENT_TYPES = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]))
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const iso = (v) => (v ? new Date(v).toISOString() : null)
const imageUrl = (path) => (path ? `/api/blog/images/${path}` : null)

const card = (r) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  cardTitle: r.card_title || '',
  excerpt: r.excerpt,
  coverUrl: imageUrl(r.cover_path),
  coverAlt: r.cover_alt || '',
  author: r.author_name,
  publishedAt: iso(r.published_at),
  readingMinutes: r.reading_minutes,
})

const editable = (r) => ({
  ...card(r),
  excerpt: r.excerpt || '',
  contentMd: r.content_md || '',
  coverPath: r.cover_path,
  status: r.status,
  updatedAt: iso(r.updated_at),
})

// ----------------------------------------------------------------- readers

export async function publishedPosts({ query }) {
  const { rows } = await query(
    `select * from blog_posts where status = 'published' and published_at <= now() order by published_at desc`)
  return rows.map(card)
}

export async function publishedPost({ query }, slug) {
  const { rows: [r] } = await query(
    `select * from blog_posts where slug = $1 and status = 'published' and published_at <= now()`, [str(slug)])
  return r ? editable(r) : null
}

// ----------------------------------------------------------------- writers

export async function allPosts({ query }) {
  const { rows } = await query('select * from blog_posts order by updated_at desc')
  return rows.map(card).map((c, i) => ({ ...c, status: rows[i].status, updatedAt: iso(rows[i].updated_at) }))
}

export async function openPost({ query }, id) {
  const { rows: [r] } = await query('select * from blog_posts where id::text = $1', [str(id)])
  return r ? editable(r) : null
}

/** Creates (no id) or updates a post from the editor's fields. Returns the saved post. */
export async function savePost({ query }, staff, body = {}) {
  const row = body.row || {}
  const title = str(row.title)
  const slug = str(row.slug)
  if (!title) throw httpError('No title', { status: 400, publicMessage: 'Give the post a title.' })
  if (!SLUG.test(slug)) {
    throw httpError('Bad slug', { status: 400, publicMessage: 'The web address may only contain lowercase letters, numbers and hyphens.' })
  }
  const status = row.status === 'published' ? 'published' : 'draft'
  const publishedAt = status === 'published' ? (row.published_at && !Number.isNaN(Date.parse(row.published_at)) ? new Date(row.published_at) : new Date()) : null
  const values = [
    slug, title, str(row.card_title) || null, str(row.excerpt) || null, String(row.content_md ?? ''),
    str(row.cover_path) || null, str(row.cover_alt) || null, status,
    Number.isInteger(row.reading_minutes) ? row.reading_minutes : null, publishedAt,
  ]
  try {
    if (body.id) {
      const { rows: [r] } = await query(
        `update blog_posts set slug = $1, title = $2, card_title = $3, excerpt = $4, content_md = $5, cover_path = $6,
                cover_alt = $7, status = $8, reading_minutes = $9, published_at = $10, updated_at = now()
          where id::text = $11 returning *`, [...values, str(body.id)])
      if (!r) throw httpError('No such post', { status: 404, publicMessage: 'That post could not be saved. It may have been deleted.' })
      return editable(r)
    }
    const { rows: [r] } = await query(
      `insert into blog_posts (slug, title, card_title, excerpt, content_md, cover_path, cover_alt, status, reading_minutes,
                               published_at, author_name, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`, [...values, AUTHOR(), staff.email])
    return editable(r)
  } catch (err) {
    if (err.code === '23505') {
      throw httpError('Duplicate slug', { status: 409, publicMessage: 'That web address is already used by another post. Change the link and try again.' })
    }
    throw err
  }
}

export async function deletePost({ query }, id) {
  await query('delete from blog_posts where id::text = $1', [str(id)])
  return { ok: true }
}

// ---------------------------------------------------------------- pictures

const memory = new Map() // tests and local runs: BLOG_BUCKET=memory
let bucketRef = null
async function bucket() {
  const name = process.env.BLOG_BUCKET || 'chennai-rice-blog-images'
  if (name === 'memory') return null
  if (!bucketRef) {
    const { Storage } = await import('@google-cloud/storage')
    bucketRef = new Storage().bucket(name)
  }
  return bucketRef
}

/** Stores one picture (JPEG, PNG, WebP or AVIF, up to 5 MB) and returns its object name. */
export async function saveImage(buffer, contentType) {
  const ext = IMAGE_TYPES[String(contentType || '').split(';')[0].trim().toLowerCase()]
  if (!ext) throw httpError('Bad type', { status: 400, publicMessage: 'Use a JPEG, PNG, WebP or AVIF image.' })
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError('Empty', { status: 400, publicMessage: 'Choose an image first.' })
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw httpError('Too big', { status: 413, publicMessage: `That image is ${(buffer.length / 1048576).toFixed(1)}MB. Keep pictures under 5MB.` })
  }
  const path = `${randomUUID()}.${ext}`
  const b = await bucket()
  if (!b) memory.set(path, buffer)
  else await b.file(path).save(buffer, { contentType: CONTENT_TYPES[ext], resumable: false })
  return { path, url: imageUrl(path) }
}

/** A stored picture: { data, contentType }. */
export async function readImage(name) {
  const file = str(name)
  const ext = file.split('.').pop()
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|avif)$/.test(file)) throw httpError('Bad name', { status: 404, publicMessage: 'No such picture.' })
  const b = await bucket()
  if (!b) {
    if (!memory.has(file)) throw httpError('Missing', { status: 404, publicMessage: 'No such picture.' })
    return { data: memory.get(file), contentType: CONTENT_TYPES[ext] }
  }
  try {
    const [data] = await b.file(file).download()
    return { data, contentType: CONTENT_TYPES[ext] }
  } catch (err) {
    if (err.code === 404) throw httpError('Missing', { status: 404, publicMessage: 'No such picture.' })
    throw err
  }
}
