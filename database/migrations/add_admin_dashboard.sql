-- ============================================================
-- Analyst dashboard: admin accounts, stable visitor numbers, and
-- product/cart events.
--
-- Run this in the Supabase SQL editor (or as a tracked migration) against
-- the "chennai rice project" database. It is additive — it creates new
-- objects and adds SELECT policies to the existing visitor_* tables, and
-- changes nothing that the public site already depends on.
--
-- Security model, in short:
--   * Nothing here is readable by an anonymous browser. Every policy below
--     requires a logged-in user who is listed in admin_users.
--   * The public site keeps writing visitor data through the server-side
--     Vercel functions using the service role key (which bypasses RLS), so
--     tracking is unaffected by these policies.
--
-- Wrapped in a transaction: Postgres DDL is transactional, so if any
-- statement below fails the whole migration rolls back and the database is
-- left exactly as it was, rather than half-applied.
-- ============================================================

begin;

-- ---------- admin_users : who may open the dashboard ----------
-- Rows are keyed to Supabase Auth accounts. Creating an auth user does NOT
-- grant dashboard access on its own — the user_id must also be inserted
-- here, so access is an explicit, revocable act.
create table if not exists admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  -- 'analyst' can read. 'admin' is reserved for future write/export rights,
  -- so the column exists before it is needed rather than being retrofitted.
  role       text not null default 'analyst',
  created_at timestamptz not null default now(),
  constraint admin_users_role_check check (role in ('analyst', 'admin'))
);

alter table admin_users enable row level security;

-- SECURITY DEFINER so the function can read admin_users while RLS is on.
-- Without this, a policy that calls it while protecting the same table
-- recurses infinitely. search_path is pinned for the same reason as
-- set_updated_at() above: the function must not be reroutable by a
-- session-local search_path.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- An admin may see their own row (so the dashboard can show who is logged
-- in), but not the rest of the admin list.
-- CREATE POLICY has no IF NOT EXISTS, so every policy below is dropped
-- first to keep this file safe to re-run.
drop policy if exists admin_users_read_self on admin_users;
create policy admin_users_read_self on admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- ---------- visitors : one row per browser, with a stable display number ----------
-- visitor_sessions.visitor_id already identifies a browser, but it is a
-- random 32-char id — unusable as something a human refers to. This table
-- assigns each one a permanent sequential number so the dashboard can show
-- "0001", "0002". The number is STORED, not computed at query time, so it
-- never shifts when rows are deleted or re-sorted.
create table if not exists visitors (
  visitor_id    text primary key,
  visitor_no    bigint generated always as identity,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create unique index if not exists visitors_visitor_no_idx on visitors (visitor_no);

alter table visitors enable row level security;

-- Called by the session endpoint on every visit. Returns the existing row
-- when the browser has been seen before, so a returning visitor keeps the
-- same number for life. Written as select-then-insert rather than a bare
-- upsert because a failed INSERT ... ON CONFLICT still consumes an identity
-- value, which would leave visible gaps in the numbering.
create or replace function ensure_visitor(p_visitor_id text)
returns visitors
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v visitors;
begin
  update visitors
     set last_seen_at = now()
   where visitor_id = p_visitor_id
  returning * into v;

  if found then
    return v;
  end if;

  insert into visitors (visitor_id)
  values (p_visitor_id)
  on conflict (visitor_id) do update set last_seen_at = now()
  returning * into v;

  return v;
end;
$$;

-- SECURITY DEFINER functions are granted to PUBLIC by default. This one
-- writes rows and hands back the next visitor number, so it is locked to
-- the service role — the only caller is api/track/session.js. Without this
-- revoke, anyone holding the public anon key could mint visitor rows.
revoke execute on function ensure_visitor(text) from public;
revoke execute on function ensure_visitor(text) from anon, authenticated;
grant execute on function ensure_visitor(text) to service_role;

-- ---------- visitor_events : product interest, cart, and (later) payment ----------
-- Page views already tell us which product pages were opened and for how
-- long (visitor_pageviews.path is /products/<slug>), so this table is only
-- for things a URL cannot express.
--
-- 'begin_checkout' and 'purchase' are defined now, before any payment
-- gateway exists, specifically so that wiring one up later is an insert —
-- not a migration on a table that by then holds live data.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'visitor_event_type') then
    create type visitor_event_type as enum (
      'product_view',
      'add_to_cart',
      'remove_from_cart',
      'begin_checkout',
      'purchase'
    );
  end if;
end
$$;

create table if not exists visitor_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   text not null references visitor_sessions (session_id) on delete cascade,
  visitor_id   text not null,
  event_type   visitor_event_type not null,
  product_slug text,
  variant_kg   numeric,
  quantity     int,
  -- Rupee value of the event. Null until a real amount exists; filled for
  -- add_to_cart and, in future, purchase.
  value_inr    numeric(12, 2),
  -- Payment/order reference, for reconciling a purchase against the
  -- gateway once one is added.
  order_ref    text,
  metadata     jsonb,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists visitor_events_visitor_id_idx on visitor_events (visitor_id);
create index if not exists visitor_events_session_id_idx on visitor_events (session_id);
create index if not exists visitor_events_type_idx on visitor_events (event_type);
create index if not exists visitor_events_product_idx on visitor_events (product_slug);
create index if not exists visitor_events_occurred_at_idx on visitor_events (occurred_at desc);

alter table visitor_events enable row level security;

-- ---------- admin_audit_log : who looked at visitor data ----------
-- This dashboard exposes personal data (approximate location, device, and
-- an individual's browsing history). Recording who opened it is what makes
-- access accountable rather than anonymous.
create table if not exists admin_audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  email      text,
  action     text not null,   -- e.g. 'view_dashboard', 'view_visitor'
  target     text,            -- e.g. the visitor_no or visitor_id inspected
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;

-- Admins may write their own audit entries. Deliberately no SELECT policy:
-- the log is not readable through the dashboard, so it cannot be reviewed
-- or quietly cleaned up by the same account it records.
drop policy if exists admin_audit_insert on admin_audit_log;
create policy admin_audit_insert on admin_audit_log
  for insert to authenticated
  with check (is_admin() and user_id = auth.uid());

-- ---------- Read policies for the dashboard ----------
-- These are the only way visitor data becomes readable from a browser, and
-- they all require is_admin(). An anonymous visitor still cannot read a
-- single row from any of these tables.
drop policy if exists visitor_sessions_admin_read on visitor_sessions;
create policy visitor_sessions_admin_read on visitor_sessions
  for select to authenticated using (is_admin());

drop policy if exists visitor_pageviews_admin_read on visitor_pageviews;
create policy visitor_pageviews_admin_read on visitor_pageviews
  for select to authenticated using (is_admin());

drop policy if exists visitors_admin_read on visitors;
create policy visitors_admin_read on visitors
  for select to authenticated using (is_admin());

drop policy if exists visitor_events_admin_read on visitor_events;
create policy visitor_events_admin_read on visitor_events
  for select to authenticated using (is_admin());

commit;
