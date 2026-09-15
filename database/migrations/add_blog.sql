-- ============================================================
-- Blog: author accounts, posts, and an image bucket.
--
-- Run this in the Supabase SQL editor. It is additive — nothing the public
-- site already does changes.
--
-- Author accounts are deliberately separate from admin_users. Reading
-- visitor analytics and writing a blog post are different jobs, and someone
-- brought in to write should not inherit access to individual visitors'
-- browsing history just because both happen to sit behind a login.
--
-- Wrapped in a transaction, so a failure part-way leaves the database
-- exactly as it was.
-- ============================================================

begin;

-- ---------- blog_authors : who may write ----------
-- Keyed to Supabase Auth accounts. Creating an auth user does NOT grant
-- writing access on its own — the user_id must also be inserted here, so
-- access is an explicit, revocable act.
create table if not exists blog_authors (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  -- Shown as the byline. Required, because a post with no author reads as
  -- though nobody stands behind it.
  display_name text not null,
  -- 'author' writes and publishes their own posts. 'editor' may also edit
  -- and unpublish anyone's — which is what you need the first time someone
  -- leaves and their posts are still on the site.
  role         text not null default 'author',
  created_at   timestamptz not null default now(),
  constraint blog_authors_role_check check (role in ('author', 'editor'))
);

alter table blog_authors enable row level security;

-- SECURITY DEFINER so these can read blog_authors while RLS is on. Without
-- it, a policy that calls one while protecting the same table recurses
-- forever. search_path is pinned so the function cannot be rerouted by a
-- session-local search_path.
create or replace function is_blog_author()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from blog_authors where user_id = auth.uid());
$$;

create or replace function is_blog_editor()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from blog_authors where user_id = auth.uid() and role = 'editor'
  );
$$;

-- An author may see their own row, so the studio can greet them by name.
-- Deliberately not the whole list: another writer's email address is not
-- something a colleague needs.
drop policy if exists blog_authors_read_self on blog_authors;
create policy blog_authors_read_self on blog_authors
  for select to authenticated
  using (user_id = auth.uid());

-- ---------- blog_posts ----------
create table if not exists blog_posts (
  id              uuid primary key default gen_random_uuid(),
  -- The URL: /blog/<slug>. Unique, and constrained to the shape a URL can
  -- carry, so a typed title can never produce a broken link.
  slug            text not null unique,
  title           text not null,
  -- Shown on the listing card. Optional: falls back to the opening of the
  -- post rather than forcing the writer to repeat themselves.
  excerpt         text,
  -- Markdown source, rendered at display time. Stored as written so a post
  -- stays readable and portable rather than being locked into one editor's
  -- HTML.
  content_md      text not null default '',

  -- Cover image: the object path inside the blog-images bucket, plus its
  -- alt text. Alt is a separate column rather than being pulled from the
  -- filename, because "IMG_2841.jpg" describes nothing to a screen reader.
  cover_path      text,
  cover_alt       text,

  author_id       uuid references auth.users (id) on delete set null,
  -- Copied rather than joined. blog_authors is not publicly readable (an
  -- author's email is not public information), and a byline should survive
  -- the account being closed.
  author_name     text not null,

  status          text not null default 'draft',
  -- When it goes live. A future date is a scheduled post: the public policy
  -- below only exposes rows whose date has arrived.
  published_at    timestamptz,
  reading_minutes int,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint blog_posts_status_check check (status in ('draft', 'published')),
  -- A published post must carry a date, because the public read policy
  -- filters on it — without this, publishing without one would silently
  -- hide the post instead of showing it.
  constraint blog_posts_published_date_check
    check (status <> 'published' or published_at is not null),
  constraint blog_posts_slug_format_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists blog_posts_slug_idx on blog_posts (slug);
create index if not exists blog_posts_live_idx on blog_posts (status, published_at desc);
create index if not exists blog_posts_author_idx on blog_posts (author_id);

drop trigger if exists blog_posts_set_updated_at on blog_posts;
create trigger blog_posts_set_updated_at
  before update on blog_posts
  for each row execute function set_updated_at();

alter table blog_posts enable row level security;

-- Anyone may read a published post whose date has arrived. This is the only
-- policy an anonymous visitor matches, so drafts and scheduled posts are
-- invisible to the public site — not merely filtered out by the query, but
-- unreachable.
drop policy if exists blog_posts_public_read on blog_posts;
create policy blog_posts_public_read on blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at <= now());

-- Authors additionally see their own drafts; editors see everyone's.
-- SELECT policies are OR'd, so this widens what a signed-in author can
-- read without loosening anything for the public.
drop policy if exists blog_posts_author_read on blog_posts;
create policy blog_posts_author_read on blog_posts
  for select to authenticated
  using (is_blog_author() and (author_id = auth.uid() or is_blog_editor()));

-- A new post is always stamped with the account that created it. An author
-- cannot file a post under someone else's name.
drop policy if exists blog_posts_author_insert on blog_posts;
create policy blog_posts_author_insert on blog_posts
  for insert to authenticated
  with check (is_blog_author() and author_id = auth.uid());

drop policy if exists blog_posts_author_update on blog_posts;
create policy blog_posts_author_update on blog_posts
  for update to authenticated
  using (is_blog_author() and (author_id = auth.uid() or is_blog_editor()))
  with check (is_blog_author() and (author_id = auth.uid() or is_blog_editor()));

drop policy if exists blog_posts_author_delete on blog_posts;
create policy blog_posts_author_delete on blog_posts
  for delete to authenticated
  using (is_blog_author() and (author_id = auth.uid() or is_blog_editor()));

commit;

-- ============================================================
-- Storage: the blog-images bucket.
--
-- Separate from the transaction above because these statements touch the
-- storage schema, which a project owner can write but a restricted role
-- cannot. If this half fails with "must be owner of table objects", create
-- the bucket by hand instead — Storage -> New bucket -> name it
-- blog-images and tick Public — and skip to the policies, which the
-- dashboard can also add. The migration above will already have applied.
-- ============================================================

-- Public so a cover image can be served straight from its URL on the live
-- site without a signed link on every page load. Public applies to reading
-- an object by its path only; who may WRITE is still decided by the
-- policies below.
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

drop policy if exists blog_images_public_read on storage.objects;
create policy blog_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'blog-images');

drop policy if exists blog_images_author_insert on storage.objects;
create policy blog_images_author_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-images' and is_blog_author());

drop policy if exists blog_images_author_update on storage.objects;
create policy blog_images_author_update on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-images' and is_blog_author());

-- Delete is limited to editors. An author replacing their own cover leaves
-- one orphaned file behind, which costs a few kilobytes; an author able to
-- delete any object in the bucket can remove the cover from every post on
-- the site, which is not recoverable.
drop policy if exists blog_images_editor_delete on storage.objects;
create policy blog_images_editor_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-images' and is_blog_editor());

-- ------------------------------------------------------------------
-- Creating the first author (run once, after signing the account up):
--
--   insert into blog_authors (user_id, email, display_name, role)
--   select id, email, 'Your Name', 'editor'
--     from auth.users
--    where email = 'you@chennairiceindustries.com';
--
-- Make the first one an 'editor' — otherwise nobody can tidy up a post
-- once its author's account is gone.
-- ------------------------------------------------------------------
