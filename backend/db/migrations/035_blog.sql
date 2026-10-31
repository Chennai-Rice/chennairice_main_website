-- The journal (blog), moved from Supabase to Google Cloud (Oct 2026): posts live here, pictures in a
-- Cloud Storage bucket (BLOG_BUCKET), writers sign in as staff with the new 'blog' role.
alter table staff_users drop constraint if exists staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'it', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse', 'accounts', 'cloud', 'blog'));

create table if not exists blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null,
  card_title      text,                       -- optional shorter title for the card on the journal list
  excerpt         text,
  content_md      text not null default '',
  cover_path      text,                       -- object name in the blog bucket
  cover_alt       text,
  author_name     text not null default 'Chennai Rice Industries',
  status          text not null default 'draft' check (status in ('draft', 'published')),
  reading_minutes integer,
  published_at    timestamptz,
  created_by      text,                       -- the writer's staff email
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);
create index if not exists blog_posts_published on blog_posts (published_at desc) where status = 'published';
