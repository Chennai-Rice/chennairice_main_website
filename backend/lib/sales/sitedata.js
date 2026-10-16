// What used to be read straight from Supabase by the browser: the /admin
// visitor analytics, the blog and its cover images, and the website
// enquiries. Now in Cloud SQL (migration 018) behind the staff sign-in, so
// who may read what is decided by staff roles (see PERMISSIONS in staff.js).
import { query } from '../db.js'
import { httpError, str } from './util.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = (what) => httpError('Not found', { status: 404, publicMessage: what })
const NO_POST = 'That post could not be found. It may have been deleted.'

// ---------------------------------------------------------------- analytics

/** Rows per table sent to the dashboard, which aggregates in the browser. */
export const ROW_LIMIT = 5000

/** Visitors, sessions, pageviews and events, newest first (visitors oldest first). */
export async function analyticsRaw() {
  const [visitors, sessions, pageviews, events] = await Promise.all([
    query('select visitor_id, visitor_no::int as visitor_no, first_seen_at, last_seen_at from visitors order by visitor_no asc limit $1', [ROW_LIMIT]),
    query('select * from visitor_sessions order by started_at desc limit $1', [ROW_LIMIT]),
    query('select * from visitor_pageviews order by entered_at desc limit $1', [ROW_LIMIT]),
    query(
      `select id, session_id, visitor_id, event_type, product_slug, variant_kg::float8 as variant_kg, quantity,
              value_inr::float8 as value_inr, order_ref, metadata, occurred_at, created_at
         from visitor_events order by occurred_at desc limit $1`,
      [ROW_LIMIT]
    ),
  ])
  return {
    visitors: visitors.rows,
    sessions: sessions.rows,
    pageviews: pageviews.rows,
    events: events.rows,
    truncated: [visitors, sessions, pageviews].some((r) => r.rows.length >= ROW_LIMIT),
  }
}

/** An ISO date from the query string, or null for "all time". */
function since(value) {
  if (!value) return null
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) throw httpError('Bad from date')
  return d.toISOString()
}

async function elementSummary(kind, from, limit) {
  const { rows } = await query(
    `select i.path, i.selector,
            mode() within group (order by i.label) as label,
            mode() within group (order by i.tag)   as tag,
            count(*)                               as hits,
            count(distinct i.visitor_id)           as visitors,
            coalesce(sum(i.click_count), 0)        as total_burst,
            max(i.occurred_at)                     as last_at
       from visitor_interactions i
      where i.kind = $1 and ($2::timestamptz is null or i.occurred_at >= $2)
      group by i.path, i.selector
      order by hits desc
      limit $3`,
    [kind, from, limit]
  )
  return rows
}

/** Clicks, rage and dead clicks per page and element, and scroll depth. */
export async function behaviour(params) {
  const from = since(params?.from)
  const [pages, rage, dead, elements, scroll] = await Promise.all([
    query(
      `select i.path,
              count(*) filter (where i.kind = 'click')      as clicks,
              count(*) filter (where i.kind = 'rage_click') as rage_clicks,
              count(*) filter (where i.kind = 'dead_click') as dead_clicks,
              count(distinct i.visitor_id)                  as visitors,
              max(i.occurred_at)                            as last_at
         from visitor_interactions i
        where $1::timestamptz is null or i.occurred_at >= $1
        group by i.path
        order by clicks desc`,
      [from]
    ).then((r) => r.rows),
    elementSummary('rage_click', from, 100),
    elementSummary('dead_click', from, 100),
    elementSummary('click', from, 200),
    query(
      `select v.path,
              count(*)                            as views,
              count(v.max_scroll_percent)         as measured,
              round(avg(v.max_scroll_percent), 1) as avg_depth,
              percentile_cont(0.5) within group (order by v.max_scroll_percent) as median_depth,
              count(*) filter (where v.max_scroll_percent >= 50) as reached_50,
              count(*) filter (where v.max_scroll_percent >= 90) as reached_90
         from visitor_pageviews v
        where $1::timestamptz is null or v.entered_at >= $1
        group by v.path
        order by views desc`,
      [from]
    ).then((r) => r.rows),
  ])
  return { pages, rage, dead, elements, scroll }
}

const intOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number.parseInt(v, 10))

/** Click positions on one page, within one screen-width band. */
export async function heatmapPoints(params) {
  const path = str(params?.path)
  if (!path) throw httpError('A page path is required.')
  const limit = Math.min(Math.max(intOrNull(params?.limit) || 5000, 1), 20000)
  const { rows } = await query(
    `select i.rel_x, i.abs_y, i.kind
       from visitor_interactions i
      where i.path = $1 and i.rel_x is not null and i.abs_y is not null
        and ($2::timestamptz is null or i.occurred_at >= $2)
        and ($3::int is null or i.viewport_width >= $3)
        and ($4::int is null or i.viewport_width <= $4)
      order by i.occurred_at desc
      limit $5`,
    [path, since(params?.from), intOrNull(params?.minWidth), intOrNull(params?.maxWidth), limit]
  )
  return rows
}

// --------------------------------------------------------------------- blog

export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
export const MAX_COVER_BYTES = 5 * 1024 * 1024

const CARD = 'id, slug, title, excerpt, cover_path, cover_alt, author_name, published_at, reading_minutes'

/** Published posts, newest first, without their bodies. */
export async function publishedPosts() {
  const { rows } = await query(
    `select ${CARD} from blog_posts
      where status = 'published' and published_at <= now()
      order by published_at desc`
  )
  return rows
}

/** One published post by its web address, or null. */
export async function publishedPost(slug) {
  const { rows: [row] } = await query(
    `select * from blog_posts where slug = $1 and status = 'published' and published_at <= now()`,
    [str(slug)]
  )
  return row || null
}

/** Every post, drafts included, for the writing tool. */
export async function allPosts() {
  const { rows } = await query(
    `select id, slug, title, status, published_at, updated_at, cover_path, cover_alt, author_name
       from blog_posts order by updated_at desc`
  )
  return rows
}

export async function postById(id) {
  if (!UUID.test(String(id))) throw notFound(NO_POST)
  const { rows: [row] } = await query('select * from blog_posts where id = $1', [id])
  if (!row) throw notFound(NO_POST)
  return row
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Creates (no id) or updates a post. The browser works out slug, excerpt and reading time. */
export async function savePost(staff, id, body) {
  if (id && !UUID.test(String(id))) throw notFound(NO_POST)
  const title = str(body?.title)
  const slug = str(body?.slug)
  if (!title) throw httpError('Give the post a title.')
  if (!SLUG.test(slug)) throw httpError('The web address may only contain lowercase letters, numbers and hyphens.')
  const status = body?.status === 'published' ? 'published' : 'draft'
  const coverPath = str(body?.coverPath) || null
  if (coverPath && !/^img\/[0-9a-f-]{36}$/.test(coverPath)) throw httpError('Upload the cover image again.')
  const values = [
    slug, title, str(body?.excerpt) || null, String(body?.contentMd ?? ''), coverPath, str(body?.coverAlt) || null,
    status,
    // Keeps the first publish date when a live post is edited; a draft has none.
    status === 'published' ? (body?.publishedAt ? new Date(body.publishedAt) : new Date()) : null,
    Number.isInteger(body?.readingMinutes) ? body.readingMinutes : null,
  ]
  try {
    if (id) {
      const { rows: [row] } = await query(
        `update blog_posts set slug = $2, title = $3, excerpt = $4, content_md = $5, cover_path = $6, cover_alt = $7,
                status = $8, published_at = $9, reading_minutes = $10, updated_at = now()
          where id = $1 returning *`,
        [id, ...values]
      )
      if (!row) throw notFound(NO_POST)
      return row
    }
    const { rows: [row] } = await query(
      `insert into blog_posts (slug, title, excerpt, content_md, cover_path, cover_alt, status, published_at, reading_minutes,
                               author_email, author_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [...values, staff.email, staff.full_name || staff.email]
    )
    return row
  } catch (err) {
    if (err.code === '23505') throw httpError('Slug taken', { status: 409, publicMessage: 'That web address is already used by another post. Change the link and try again.' })
    throw err
  }
}

export async function deletePost(id) {
  if (!UUID.test(String(id))) throw notFound(NO_POST)
  const { rows: [row] } = await query('delete from blog_posts where id = $1 returning cover_path', [id])
  if (!row) throw notFound(NO_POST)
  // The cover goes too, unless another post still uses it.
  if (row.cover_path) {
    await query(
      `delete from blog_images where id::text = $1 and not exists (select 1 from blog_posts where cover_path = $2)`,
      [row.cover_path.slice(4), row.cover_path]
    )
  }
}

/** Stores an uploaded cover. Returns its cover_path ('img/<id>'). */
export async function saveImage(contentType, data) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (!COVER_TYPES.includes(type)) throw httpError('Use a JPEG, PNG, WebP or AVIF image.')
  if (!Buffer.isBuffer(data) || !data.length) throw httpError('Choose an image first.')
  if (data.length > MAX_COVER_BYTES) throw httpError('Keep covers under 5MB.', { status: 413 })
  const { rows: [row] } = await query('insert into blog_images (content_type, data) values ($1, $2) returning id', [type, data])
  return 'img/' + row.id
}

export async function getImage(id) {
  if (!UUID.test(String(id))) return null
  const { rows: [row] } = await query('select content_type, data from blog_images where id = $1', [id])
  return row || null
}

// ---------------------------------------------------------------- enquiries

/** The latest contact and bulk-order enquiries from the website forms. */
export async function listEnquiries() {
  const [contact, bulk] = await Promise.all([
    query('select * from contact_enquiries order by created_at desc limit 300'),
    query('select * from bulk_order_enquiries order by created_at desc limit 300'),
  ])
  return { contact: contact.rows, bulk: bulk.rows }
}

export async function setEnquiryStatus(kind, id, status) {
  const table = kind === 'bulk' ? 'bulk_order_enquiries' : kind === 'contact' ? 'contact_enquiries' : null
  if (!table) throw httpError('Unknown enquiry type.')
  if (!UUID.test(String(id))) throw notFound('That enquiry could not be found.')
  if (!['new', 'contacted', 'closed'].includes(status)) throw httpError('Status must be new, contacted or closed.')
  const { rows: [row] } = await query(`update ${table} set status = $2, updated_at = now() where id = $1 returning *`, [id, status])
  if (!row) throw notFound('That enquiry could not be found.')
  return row
}
