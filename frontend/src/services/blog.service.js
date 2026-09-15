// The blog: author sign-in, reading posts, and writing them.
//
// Everything goes through the ordinary browser Supabase client with the
// public anon key. There is no service-role key in this file and there must
// never be one — what decides who can read a draft or write a post is the
// RLS in database/migrations/add_blog.sql, not this JavaScript. A logged-out
// visitor running these exact queries sees published posts and nothing else.
//
// This module owns every blog query. The pages under src/pages/blog/ are
// presentation only, so the data contract stays in one reviewable place.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'
import { plainText, readingMinutes, slugify } from '../lib/markdown.jsx'

export class BlogError extends Error {
  /**
   * `setupRequired` marks the one failure that is not the visitor's
   * problem and not a bug: the migration has not been run yet. The studio
   * says which file to run; the public journal deliberately does not,
   * because a database table name is not something to show a shopper.
   */
  constructor(message, options = {}) {
    super(message)
    this.setupRequired = options.setupRequired === true
  }
}

const BUCKET = 'blog-images'

/** Cover images. Kept modest deliberately — a 12MB phone photo on a
 *  listing page costs every reader on a slow connection. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

/** Fields the public listing needs. Not select('*'): the listing does not
 *  need every post's full body, and sending it would be wasteful. */
const CARD_FIELDS =
  'id, slug, title, excerpt, cover_path, cover_alt, author_name, published_at, reading_minutes'

function requireClient() {
  if (!hasSupabase) {
    throw new BlogError(
      'Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    )
  }
}

/** Turns a Postgres failure into something the writer can act on. */
function writeError(error) {
  if (error.code === '23505') {
    return new BlogError('That web address is already used by another post. Change the link and try again.')
  }
  if (error.code === '23514') {
    return new BlogError('The web address may only contain lowercase letters, numbers and hyphens.')
  }
  if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
    return new BlogError('This account is not allowed to save that post.')
  }
  // PostgREST reports a missing table through its schema cache
  // ("Could not find the table 'public.blog_posts'"), not with Postgres's
  // own wording, so both are matched.
  if (
    error.code === 'PGRST205' ||
    /could not find the table|relation .*blog_(posts|authors).* does not exist/i.test(error.message || '')
  ) {
    return new BlogError(
      'The blog tables are not set up yet. Run database/migrations/add_blog.sql in the Supabase SQL editor.',
      { setupRequired: true }
    )
  }
  return new BlogError(error.message)
}

/* ------------------------------------------------------------------ auth */

export async function getSession() {
  if (!hasSupabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session ?? null
}

/**
 * The signed-in writer's own blog_authors row, or null when the account
 * has one but is not a writer. Relies on the blog_authors_read_self policy,
 * so a non-author simply reads back nothing and this cannot be faked from
 * the browser.
 */
export async function getAuthor() {
  if (!hasSupabase) return null
  const { data, error } = await supabase
    .from('blog_authors')
    .select('user_id, email, display_name, role')
    .maybeSingle()
  if (error) return null
  return data ?? null
}

export async function signIn(email, password) {
  requireClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // Supabase returns the same message for "no such user" and "wrong
    // password" on purpose. Repeating it verbatim avoids turning the login
    // form into a way to discover which addresses have accounts.
    throw new BlogError('Incorrect email or password.')
  }

  // Signing in is not the same as being allowed to write. Any Supabase
  // account authenticates; only a row in blog_authors makes someone a
  // writer, so the session is dropped again if there is none.
  const author = await getAuthor()
  if (!author) {
    await signOut()
    throw new BlogError('This account is not set up to write posts.')
  }
  return author
}

export async function signOut() {
  if (!hasSupabase) return
  await supabase.auth.signOut()
}

export function onAuthChange(callback) {
  if (!hasSupabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

/* ----------------------------------------------------------------- reads */

/** Public URL for a stored cover. Null in, null out. */
export function coverUrl(path) {
  if (!path || !hasSupabase) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
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

/**
 * Every post the caller is allowed to see, newest first.
 *
 * The status and date filters mirror the RLS policy rather than replacing
 * it. They are here so the query uses the index and so a signed-in author's
 * own drafts do not silently appear on the public listing — RLS lets them
 * read those rows, which is right for the studio and wrong for this page.
 */
export async function fetchPublishedPosts() {
  requireClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select(CARD_FIELDS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })

  if (error) throw writeError(error)
  return (data ?? []).map(toCard)
}

/**
 * One post by its URL.
 *
 * Returns null when there is nothing to show. A signed-in author reading
 * their own draft gets it — that is the preview, and it falls out of the
 * RLS policy rather than needing a separate code path.
 */
export async function fetchPostBySlug(slug) {
  requireClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw writeError(error)
  if (!data) return null

  return {
    ...toCard(data),
    contentMd: data.content_md || '',
    coverPath: data.cover_path,
    status: data.status,
    updatedAt: data.updated_at,
    authorId: data.author_id,
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
  requireClient()
  const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).maybeSingle()
  if (error) throw writeError(error)
  if (!data) return null
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

/** Everything the signed-in writer may edit, drafts included. */
export async function fetchMyPosts() {
  requireClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, status, published_at, updated_at, cover_path, cover_alt, author_name')
    .order('updated_at', { ascending: false })

  if (error) throw writeError(error)
  return (data ?? []).map((row) => ({
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
 * Uploads a cover and hands back where it went.
 *
 * Type and size are checked here as a courtesy to the writer, not as
 * security: the bucket's own policies are what actually stop anyone else
 * writing to it.
 */
export async function uploadCover(file, author) {
  requireClient()
  if (!file) throw new BlogError('Choose an image first.')

  if (!COVER_TYPES.includes(file.type)) {
    throw new BlogError('Use a JPEG, PNG, WebP or AVIF image.')
  }
  if (file.size > MAX_COVER_BYTES) {
    const mb = (MAX_COVER_BYTES / 1024 / 1024).toFixed(0)
    throw new BlogError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep covers under ${mb}MB.`)
  }

  // Filed under the author's id, and named with a fresh uuid rather than
  // the original filename: two writers uploading "cover.jpg" must not
  // collide, and a filename is not something to trust in a path.
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${author.user_id}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    // A year: the path contains a uuid, so the file at it never changes.
    cacheControl: '31536000',
    upsert: false,
  })

  if (error) {
    if (/bucket not found/i.test(error.message || '')) {
      throw new BlogError(
        'The blog-images bucket does not exist yet. Run the storage half of database/migrations/add_blog.sql, or create it in Storage.'
      )
    }
    throw new BlogError(`Could not upload the image: ${error.message}`)
  }

  return { path, url: coverUrl(path) }
}

/**
 * Creates or updates a post.
 *
 * The derived fields — slug, excerpt, reading time — are filled in here
 * rather than in the form, so a post saved from anywhere gets them the same
 * way and none of them can be left inconsistent with the body.
 */
export async function savePost(draft, author) {
  requireClient()
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

  const row = {
    slug,
    title,
    // Falls back to the opening of the post rather than making the writer
    // repeat themselves, and is trimmed at a word so it never cuts a word
    // in half on the card.
    excerpt: typedExcerpt || (body ? body.slice(0, 180).replace(/\s+\S*$/, '') : null),
    content_md: contentMd,
    cover_path: draft.coverPath || null,
    cover_alt: (draft.coverAlt || '').trim() || null,
    author_id: author.user_id,
    author_name: author.display_name,
    status: draft.status === 'published' ? 'published' : 'draft',
    reading_minutes: readingMinutes(contentMd),
  }

  if (row.status === 'published') {
    // Keep the original date when re-editing something already live, so a
    // typo fix does not move the post back to the top of the blog.
    row.published_at = draft.publishedAt || new Date().toISOString()
  } else {
    // Unpublishing clears the date, which is what the table's own check
    // constraint expects of a draft.
    row.published_at = null
  }

  const query = draft.id
    ? supabase.from('blog_posts').update(row).eq('id', draft.id).select().maybeSingle()
    : supabase.from('blog_posts').insert(row).select().maybeSingle()

  const { data, error } = await query
  if (error) throw writeError(error)
  if (!data) {
    // An update that matched no row means RLS refused it — someone else's
    // post, or an account that has since lost its author row.
    throw new BlogError('That post could not be saved. It may belong to another author.')
  }
  return data
}

export async function deletePost(id) {
  requireClient()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)
  if (error) throw writeError(error)
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
