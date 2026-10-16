// The blog: reading posts, and writing them.
//
// Reading is the public /api/blog endpoints (published posts only). Writing
// goes through /api/admin/blog with the staff Google sign-in, and the
// backend decides who may write (blog.write in backend/lib/sales/staff.js).
// Posts and cover images live in Cloud SQL (backend/lib/sales/sitedata.js).
//
// This module owns every blog request. The pages under src/pages/blog/ are
// presentation only, so the data contract stays in one reviewable place.
import { plainText, readingMinutes, slugify } from '../lib/markdown.jsx'
import { staffJson } from './staffAuth.js'

export class BlogError extends Error {
  /**
   * `setupRequired` marks a failure that is not the visitor's problem: the
   * blog service is not reachable. The public journal shows a gentle
   * message instead of the detail.
   */
  constructor(message, options = {}) {
    super(message)
    this.setupRequired = options.setupRequired === true
  }
}

/** Cover images. Kept modest deliberately — a 12MB phone photo on a
 *  listing page costs every reader on a slow connection. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

/** Public request; a missing or failing service is reported, not thrown raw. */
async function publicJson(path) {
  let res
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch {
    throw new BlogError('Could not reach the journal. Check your connection and try again.')
  }
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) {
    throw new BlogError('The journal is not available right now.', { setupRequired: res.status === 404 })
  }
  return res.json()
}

/** Staff request, with server messages passed on as BlogErrors. */
async function studio(path, options) {
  try {
    return await staffJson('/api/admin/blog' + path, options)
  } catch (err) {
    throw new BlogError(err.status === 403 ? 'This account is not allowed to write posts.' : err.message)
  }
}

/* ----------------------------------------------------------------- reads */

/** Public URL for a stored cover ('img/<id>'). Null in, null out. */
export function coverUrl(path) {
  if (!path || !path.startsWith('img/')) return null
  return '/api/blog/images/' + path.slice(4)
}

function toCard(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: coverUrl(row.cover_path),
    coverAlt: row.cover_alt || '',
    author: row.author_name,
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
  }
}

/** Every published post, newest first. */
export async function fetchPublishedPosts() {
  const { posts } = await publicJson('/api/blog/posts')
  return (posts ?? []).map(toCard)
}

/** One published post by its URL, or null when there is nothing to show. */
export async function fetchPostBySlug(slug) {
  const { post } = await publicJson('/api/blog/posts/' + encodeURIComponent(slug))
  if (!post) return null
  return {
    ...toCard(post),
    contentMd: post.content_md || '',
    coverPath: post.cover_path,
    status: post.status,
    updatedAt: post.updated_at,
  }
}

/**
 * One post by id, for the editor.
 *
 * By id rather than by slug, because the editor can change the slug — and
 * a lookup that breaks the moment the writer edits the web address would be
 * a trap.
 */
export async function fetchPostById(id) {
  let data
  try {
    ;({ post: data } = await staffJson('/api/admin/blog/posts/' + encodeURIComponent(id)))
  } catch (err) {
    if (err.status === 404) return null
    throw new BlogError(err.message)
  }
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt || '',
    contentMd: data.content_md || '',
    coverPath: data.cover_path,
    coverUrl: coverUrl(data.cover_path),
    coverAlt: data.cover_alt || '',
    status: data.status,
    publishedAt: data.published_at,
  }
}

/* ---------------------------------------------------------------- studio */

/** Every post, drafts included. */
export async function fetchMyPosts() {
  const { posts } = await studio('/posts')
  return (posts ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    coverUrl: coverUrl(row.cover_path),
    coverAlt: row.cover_alt || '',
    author: row.author_name,
  }))
}

/**
 * Uploads a cover and hands back where it went. Type and size are checked
 * here as a courtesy to the writer; the server checks them again.
 */
export async function uploadCover(file) {
  if (!file) throw new BlogError('Choose an image first.')

  if (!COVER_TYPES.includes(file.type)) {
    throw new BlogError('Use a JPEG, PNG, WebP or AVIF image.')
  }
  if (file.size > MAX_COVER_BYTES) {
    const mb = (MAX_COVER_BYTES / 1024 / 1024).toFixed(0)
    throw new BlogError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep covers under ${mb}MB.`)
  }

  const { coverPath } = await studio('/images', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  return { path: coverPath, url: coverUrl(coverPath) }
}

/**
 * Creates or updates a post.
 *
 * The derived fields — slug, excerpt, reading time — are filled in here
 * rather than in the form, so a post saved from anywhere gets them the same
 * way and none of them can be left inconsistent with the body.
 */
export async function savePost(draft, author) {
  if (!author) throw new BlogError('Sign in before saving.')

  const title = (draft.title || '').trim()
  if (!title) throw new BlogError('Give the post a title.')

  const contentMd = draft.contentMd || ''
  const slug = slugify(draft.slug || title)
  if (!slug) {
    throw new BlogError('The title needs at least one letter or number so it can have a web address.')
  }

  const typedExcerpt = (draft.excerpt || '').trim()
  const body = plainText(contentMd)
  const status = draft.status === 'published' ? 'published' : 'draft'

  const row = {
    slug,
    title,
    // Falls back to the opening of the post rather than making the writer
    // repeat themselves, and is trimmed at a word so it never cuts a word
    // in half on the card.
    excerpt: typedExcerpt || (body ? body.slice(0, 180).replace(/\s+\S*$/, '') : ''),
    contentMd,
    coverPath: draft.coverPath || '',
    coverAlt: (draft.coverAlt || '').trim(),
    status,
    // Keep the original date when re-editing something already live, so a
    // typo fix does not move the post back to the top of the blog.
    publishedAt: status === 'published' ? draft.publishedAt || null : null,
    readingMinutes: readingMinutes(contentMd),
  }

  const { post } = await studio(draft.id ? '/posts/' + encodeURIComponent(draft.id) : '/posts', {
    method: draft.id ? 'PUT' : 'POST',
    body: JSON.stringify(row),
  })
  return post
}

export async function deletePost(id) {
  await studio('/posts/' + encodeURIComponent(id), { method: 'DELETE' })
}

/* ------------------------------------------------------------ formatting */

/** "12 August 2026" — long form, because a blog date is read, not scanned. */
export function formatPostDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
