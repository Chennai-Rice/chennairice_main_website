-- Off Supabase (Nov 2026): website visitor analytics and the contact / bulk-order enquiries now live in
-- Cloud SQL with everything else. Same columns as the Supabase tables, so /admin's reports read them as before.
-- Status and kinds are text with checks (no enums), so 'spam' needs no special step.

create table if not exists visitors (
  visitor_id    text primary key,
  visitor_no    bigint generated always as identity,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create unique index if not exists visitors_visitor_no_idx on visitors (visitor_no);

create table if not exists visitor_sessions (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     text not null,
  session_id     text not null unique,
  referrer       text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  user_agent     text,
  device_type    text,
  browser        text,
  os             text,
  screen_width   int,
  screen_height  int,
  ip_prefix      text,
  country        text,
  region         text,
  city           text,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  total_seconds  int not null default 0,
  page_count     int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists visitor_sessions_visitor_id_idx on visitor_sessions (visitor_id);
create index if not exists visitor_sessions_started_at_idx on visitor_sessions (started_at desc);

create table if not exists visitor_pageviews (
  id                 uuid primary key default gen_random_uuid(),
  session_id         text not null references visitor_sessions (session_id) on delete cascade,
  path               text not null,
  entered_at         timestamptz not null default now(),
  seconds_on_page    int not null default 0,
  max_scroll_percent int,
  created_at         timestamptz not null default now()
);
create index if not exists visitor_pageviews_session_id_idx on visitor_pageviews (session_id);
create index if not exists visitor_pageviews_path_idx on visitor_pageviews (path);
create index if not exists visitor_pageviews_entered_idx on visitor_pageviews (entered_at desc);

create table if not exists visitor_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   text not null references visitor_sessions (session_id) on delete cascade,
  visitor_id   text not null,
  event_type   text not null check (event_type in ('product_view', 'add_to_cart', 'remove_from_cart', 'begin_checkout', 'purchase')),
  product_slug text,
  variant_kg   numeric,
  quantity     int,
  value_inr    numeric(12, 2),
  order_ref    text,
  metadata     jsonb,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists visitor_events_occurred_idx on visitor_events (occurred_at desc);
create index if not exists visitor_events_session_idx on visitor_events (session_id);

create table if not exists visitor_interactions (
  id             uuid primary key default gen_random_uuid(),
  session_id     text not null references visitor_sessions (session_id) on delete cascade,
  visitor_id     text not null,
  kind           text not null check (kind in ('click', 'rage_click', 'dead_click')),
  path           text not null,
  selector       text,
  label          text,
  tag            text,
  rel_x          numeric(7, 6),
  abs_y          int,
  viewport_width int,
  doc_height     int,
  click_count    int,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists visitor_interactions_path_kind_idx on visitor_interactions (path, kind);
create index if not exists visitor_interactions_occurred_at_idx on visitor_interactions (occurred_at desc);

create table if not exists contact_enquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text not null,
  enquiry    text not null,
  status     text not null default 'new' check (status in ('new', 'contacted', 'closed', 'spam')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_enquiries_created_idx on contact_enquiries (created_at desc);

create table if not exists bulk_order_enquiries (
  id                  uuid primary key default gen_random_uuid(),
  buyer_type          text not null check (buyer_type in ('distributor', 'wholesaler', 'retailer', 'other')),
  other_type          text,
  company_or_name     text not null,
  representative_name text not null,
  email               text not null,
  phone               text not null,
  quantity_kg         text,
  message             text,
  gstin               text not null,
  status              text not null default 'new' check (status in ('new', 'contacted', 'closed', 'spam')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists bulk_order_enquiries_created_idx on bulk_order_enquiries (created_at desc);
