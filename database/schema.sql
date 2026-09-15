-- ============================================================
-- Chennai Rice — CRM + visitor analytics schema
--
-- Reference copy of what is live on the "chennai rice project" Supabase
-- project — already applied there via tracked migrations
-- (add_bulk_order_enquiries, pin_search_path_set_updated_at,
-- add_visitor_analytics, fix_visitor_sessions_trigger). Kept here so the
-- schema is reviewable in the repo; running it again is only needed when
-- setting up a new environment from scratch.
-- ============================================================

-- Shared lead-status enum, reused by both tables so the dashboard filters
-- behave the same way on each.
create type lead_status as enum ('new', 'contacted', 'closed');

-- ---------- contact_enquiries : from /contact ----------
create table contact_enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text not null,
  enquiry     text not null,
  status      lead_status not null default 'new',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contact_enquiries_status_idx on contact_enquiries (status);
create index contact_enquiries_created_at_idx on contact_enquiries (created_at desc);

-- ---------- bulk_order_enquiries : from /bulk-order ----------
create type buyer_type as enum ('distributor', 'wholesaler', 'retailer', 'other');

create table bulk_order_enquiries (
  id                   uuid primary key default gen_random_uuid(),
  buyer_type           buyer_type not null,
  other_type           text,              -- only set when buyer_type = 'other'
  company_or_name      text not null,     -- "Company / Business Name"
  representative_name  text not null,     -- "Representative Name"
  email                text not null,
  phone                text not null,
  quantity_kg          text,              -- kept as text: visitors type "500" or "1 tonne" etc, not strictly numeric. Only collected for buyer_type = 'other'.
  message              text,
  gstin                text not null,     -- required for every buyer_type
  status               lead_status not null default 'new',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index bulk_order_enquiries_status_idx on bulk_order_enquiries (status);
create index bulk_order_enquiries_buyer_type_idx on bulk_order_enquiries (buyer_type);
create index bulk_order_enquiries_created_at_idx on bulk_order_enquiries (created_at desc);

-- ---------- keep updated_at current on every edit ----------
create function set_updated_at()
returns trigger
language plpgsql
-- Pinned so the function cannot be tricked by a session-local search_path
-- into resolving pg_catalog names to something else.
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contact_enquiries_set_updated_at
  before update on contact_enquiries
  for each row execute function set_updated_at();

create trigger bulk_order_enquiries_set_updated_at
  before update on bulk_order_enquiries
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------
-- Enabled with NO policies for the anon/public role, so the browser can
-- never read or write these tables directly. Only the server-side Vercel
-- functions (using the service-role key, which bypasses RLS entirely)
-- can insert or read rows. This is what keeps the enquiry list private
-- and un-spammable from the client.
alter table contact_enquiries enable row level security;
alter table bulk_order_enquiries enable row level security;

-- ============================================================
-- Visitor analytics — populated only for visitors who accepted the
-- "analytics" cookie-consent category. See api/_lib/analytics.js and
-- src/hooks/useVisitorTracking.jsx.
-- ============================================================

-- ---------- visitor_sessions : one row per browser session ----------
create table visitor_sessions (
  id               uuid primary key default gen_random_uuid(),
  visitor_id       text not null,       -- persistent per-browser id (localStorage), stable across sessions
  session_id       text not null unique, -- per-tab-open id, stable for one visit
  referrer         text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  user_agent       text,
  device_type      text,                -- 'mobile' | 'tablet' | 'desktop', derived from user_agent
  browser          text,
  os               text,
  screen_width     int,
  screen_height    int,
  ip_prefix        text,                -- truncated IP, same anonymisation as consent records
  country          text,                -- resolved from IP at write time
  region           text,
  city             text,
  started_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  total_seconds    int not null default 0,
  page_count       int not null default 0,
  created_at       timestamptz not null default now()
);

create index visitor_sessions_visitor_id_idx on visitor_sessions (visitor_id);
create index visitor_sessions_started_at_idx on visitor_sessions (started_at desc);

-- ---------- visitor_pageviews : one row per page viewed in a session ----------
create table visitor_pageviews (
  id               uuid primary key default gen_random_uuid(),
  session_id       text not null references visitor_sessions (session_id) on delete cascade,
  path             text not null,
  entered_at       timestamptz not null default now(),
  seconds_on_page  int not null default 0,
  created_at       timestamptz not null default now()
);

create index visitor_pageviews_session_id_idx on visitor_pageviews (session_id);
create index visitor_pageviews_path_idx on visitor_pageviews (path);

-- Note: no updated_at trigger here — visitor_sessions has no updated_at
-- column, and last_seen_at is set explicitly by the app on every heartbeat.

alter table visitor_sessions enable row level security;
alter table visitor_pageviews enable row level security;
