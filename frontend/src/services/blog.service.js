// The blog: reading posts (public) and writing them (staff).
//
// Posts live in Cloud SQL and pictures in a Cloud Storage bucket, behind the website's own API
// (backend/lib/sales/blog.js). Readers call /api/blog/* with no sign-in; the writing tool calls
// /api/admin/blog/* with the staff sign-in (Firebase, role owner / admin / IT team / blog), and the server decides
// who may do what, not this file.
//
// This module owns every blog request. The pages under src/pages/blog/ are presentation only.
import { staffFetch } from './staffAuth.js'
import { plainText, readingMinutes, slugify } from '../lib/markdown.jsx'

export class BlogError extends Error {}

/* Local test mode (npm run dev with VITE_BLOG_LOCAL=1): the same API served by scripts/blog-local-server.mjs, a
   SQLite file on this computer, with no sign-in. Compiled out of every production build. */
const LOCAL = import.meta.env.DEV && import.meta.env.VITE_BLOG_LOCAL === '1'
const API = LOCAL ? 'http://localhost:5175' : ''
export const LOCAL_AUTHOR = { user_id: 'local-tester', email: 'local@test', display_name: 'Chennai Rice Industries', role: 'author' }

/** Cover images. Kept modest deliberately: a 12MB phone photo on a listing page costs every reader on a slow connection. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

/** Picture addresses come back relative to the API; the local test server is on another port. */
const withBase = (post) => (post && post.coverUrl ? { ...post, coverUrl: API + post.coverUrl } : post)

async function reply(res) {
  if (res.ok) return res.json()
  const data = await res.json().catch(() => ({}))
  throw new BlogError(data.error || 'Something went wrong. Please try again.')
}

/** A reader's request: no sign-in. */
async function open(path, options) {
  let res
  try {
    res = await fetch(API + path, options)
  } catch {
    throw new BlogError(LOCAL ? 'The local test database is not running. Start it with: npm run blog:local' : 'Could not reach the journal. Please try again.')
  }
  return res
}

/** A writer's request: the staff sign-in is attached (not needed on the local test server). */
async function write(path, options) {
  if (LOCAL) return reply(await open(path, options))
  try {
    return await (await staffFetch(path, options)).json()
  } catch (err) {
    throw err.status ? Object.assign(new BlogError(err.message), { status: err.status }) : err
  }
}

/* ----------------------------------------------------------------- reads */

/** Every published post, newest first. */
export async function fetchPublishedPosts() {
  const res = await open('/api/blog/posts')
  return (await reply(res)).posts.map(withBase)
}

/** One published post by its web address; null when there is nothing to show. */
export async function fetchPostBySlug(slug) {
  const res = await open(`/api/blog/posts/${encodeURIComponent(slug)}`)
  if (res.status === 404) return null
  return withBase((await reply(res)).post)
}

/* ---------------------------------------------------------------- studio */

/** Every post, drafts included, for the writing tool. */
export async function fetchMyPosts() {
  return (await write('/api/admin/blog/posts')).posts.map(withBase)
}

/** One post by id, for the editor. By id rather than slug, because the editor can change the slug. */
export async function fetchPostById(id) {
  try {
    return withBase((await write(`/api/admin/blog/posts/${encodeURIComponent(id)}`)).post)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/** Uploads a picture (a cover, or one inside a post) and hands back where it went. */
export async function uploadCover(file) {
  if (!file) throw new BlogError('Choose an image first.')
  if (!COVER_TYPES.includes(file.type)) throw new BlogError('Use a JPEG, PNG, WebP or AVIF image.')
  if (file.size > MAX_COVER_BYTES) {
    const mb = (MAX_COVER_BYTES / 1024 / 1024).toFixed(0)
    throw new BlogError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep pictures under ${mb}MB.`)
  }
  const saved = await write('/api/admin/blog/images', { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
  return { path: saved.path, url: API + saved.url }
}

/**
 * Creates or updates a post. The derived fields (slug, excerpt, reading time) are filled in here, and the server
 * checks them again. Returns the saved post.
 */
export async function savePost(draft) {
  const title = (draft.title || '').trim()
  if (!title) throw new BlogError('Give the post a title.')

  const contentMd = draft.contentMd || ''
  const slug = slugify(draft.slug || title)
  if (!slug) throw new BlogError('The title needs at least one letter or number so it can have a web address.')

  const typedExcerpt = (draft.excerpt || '').trim()
  const body = plainText(contentMd)

  const row = {
    slug,
    title,
    card_title: (draft.cardTitle || '').trim() || null,
    // Falls back to the opening of the post rather than making the writer repeat themselves, and is trimmed at a
    // word so it never cuts a word in half on the card.
    excerpt: typedExcerpt || (body ? body.slice(0, 180).replace(/\s+\S*$/, '') : null),
    content_md: contentMd,
    cover_path: draft.coverPath || null,
    cover_alt: (draft.coverAlt || '').trim() || null,
    status: draft.status === 'published' ? 'published' : 'draft',
    reading_minutes: readingMinutes(contentMd),
    // Kept when re-editing something already live, so a typo fix does not move the post back to the top.
    published_at: draft.status === 'published' ? draft.publishedAt || new Date().toISOString() : null,
  }

  const saved = await write('/api/admin/blog/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: draft.id || null, row }),
  })
  return withBase(saved.post)
}

export async function deletePost(id) {
  await write(`/api/admin/blog/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ------------------------------------------------------------ formatting */

/** "12 August 2026": long form, because a blog date is read, not scanned. */
export function formatPostDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
