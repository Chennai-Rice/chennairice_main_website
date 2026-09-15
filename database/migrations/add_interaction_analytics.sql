-- ============================================================
-- Interaction analytics: click heatmaps, rage clicks, dead clicks
-- and scroll depth.
--
-- Additive on top of add_admin_dashboard.sql. Run it in the Supabase SQL
-- editor against the same database. Nothing the public site already does
-- changes; this only adds a new table, one nullable column, and read
-- policies for the dashboard.
--
-- Why a separate table rather than more visitor_event_type values:
-- clicks arrive at a completely different order of magnitude to cart
-- events. A single browsing session produces perhaps two cart events and
-- easily a hundred clicks, so mixing them would make visitor_events
-- expensive to scan for the questions it exists to answer, and would tie
-- the two to one retention policy when they want different ones.
--
-- Wrapped in a transaction, so a failure part-way leaves the database
-- exactly as it was.
-- ============================================================

begin;

-- 'click'      — every recorded click. This is the heatmap layer.
-- 'rage_click' — one summary row per burst of rapid repeat clicks in the
--                same spot. The individual clicks are still stored as
--                'click' rows, so the heatmap is not distorted by them.
-- 'dead_click' — a click on something that looked clickable and did
--                nothing. See src/services/interactions.js for the test.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'interaction_kind') then
    create type interaction_kind as enum ('click', 'rage_click', 'dead_click');
  end if;
end
$$;

create table if not exists visitor_interactions (
  id             uuid primary key default gen_random_uuid(),
  session_id     text not null references visitor_sessions (session_id) on delete cascade,
  visitor_id     text not null,
  kind           interaction_kind not null,
  -- The route the click happened on, matching visitor_pageviews.path.
  path           text not null,

  -- What was clicked. `selector` is a short, deliberately stable CSS path
  -- (state classes such as is-active are stripped before it is built) so
  -- counts for one element survive a redesign that moves it. `label` is
  -- the visible text or aria-label, which is what makes a row readable.
  selector       text,
  label          text,
  tag            text,

  -- Where it was clicked.
  --
  -- rel_x is a fraction of document width, because the horizontal layout
  -- is fluid and an absolute x would be meaningless on another screen.
  -- abs_y is document pixels from the top, NOT a fraction: page height
  -- changes whenever content is added, and a fraction of a taller page
  -- silently drags every old point downwards. Pixels from the top stay
  -- correct for everything above the change.
  rel_x          numeric(7,6),
  abs_y          int,
  -- Kept so the dashboard can separate mobile clicks from desktop ones.
  -- Drawing both on one layout would place mobile clicks at coordinates
  -- that layout never had.
  viewport_width int,
  doc_height     int,

  -- Only set on 'rage_click': how many clicks the burst contained.
  click_count    int,

  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists visitor_interactions_path_kind_idx on visitor_interactions (path, kind);
create index if not exists visitor_interactions_kind_idx on visitor_interactions (kind);
create index if not exists visitor_interactions_session_idx on visitor_interactions (session_id);
create index if not exists visitor_interactions_selector_idx on visitor_interactions (selector);
create index if not exists visitor_interactions_occurred_at_idx on visitor_interactions (occurred_at desc);

alter table visitor_interactions enable row level security;

drop policy if exists visitor_interactions_admin_read on visitor_interactions;
create policy visitor_interactions_admin_read on visitor_interactions
  for select to authenticated using (is_admin());

-- ---------- scroll depth ----------
-- A property of one page view, so it belongs on that row rather than in a
-- table of its own.
--
-- Nullable with no default on purpose: rows written before this column
-- existed have no measurement, and defaulting them to 0 would claim those
-- visitors never scrolled, which is a finding the data cannot support.
alter table visitor_pageviews
  add column if not exists max_scroll_percent int;

comment on column visitor_pageviews.max_scroll_percent is
  'Furthest point reached on the page, 0-100. Null means not measured.';

-- ---------- aggregates for the dashboard ----------
-- Clicks are the highest-volume thing this site records, so the dashboard
-- must not pull them all into the browser to count them. These functions
-- do the grouping in Postgres and return a handful of rows instead.
--
-- Deliberately NOT security definer: they run as the caller, so the RLS
-- policy above still decides what is visible. A signed-in account that is
-- not in admin_users gets zero rows from them, exactly as it would from a
-- direct select. Execute is granted to authenticated only, so the public
-- anon key cannot even call them.

-- Clicks, rage clicks and dead clicks per page.
create or replace function interaction_page_summary(p_from timestamptz default null)
returns table (
  path        text,
  clicks      bigint,
  rage_clicks bigint,
  dead_clicks bigint,
  visitors    bigint,
  last_at     timestamptz
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select i.path,
         count(*) filter (where i.kind = 'click')      as clicks,
         count(*) filter (where i.kind = 'rage_click') as rage_clicks,
         count(*) filter (where i.kind = 'dead_click') as dead_clicks,
         count(distinct i.visitor_id)                  as visitors,
         max(i.occurred_at)                            as last_at
    from visitor_interactions i
   where p_from is null or i.occurred_at >= p_from
   group by i.path
   order by clicks desc;
$$;

-- One row per element, for a given kind. This is the half of a heatmap
-- that survives a redesign: an element keeps its selector when it moves,
-- whereas a pixel position does not.
create or replace function interaction_element_summary(
  p_kind interaction_kind,
  p_from timestamptz default null,
  p_path text default null,
  p_limit int default 200
)
returns table (
  path        text,
  selector    text,
  label       text,
  tag         text,
  hits        bigint,
  visitors    bigint,
  total_burst bigint,
  last_at     timestamptz
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select i.path,
         i.selector,
         -- The most common label rather than an arbitrary one: the same
         -- element can carry different text between visits (a cart count,
         -- a translated string), and picking the usual one is honest.
         mode() within group (order by i.label) as label,
         mode() within group (order by i.tag)   as tag,
         count(*)                               as hits,
         count(distinct i.visitor_id)           as visitors,
         coalesce(sum(i.click_count), 0)        as total_burst,
         max(i.occurred_at)                     as last_at
    from visitor_interactions i
   where i.kind = p_kind
     and (p_from is null or i.occurred_at >= p_from)
     and (p_path is null or i.path = p_path)
   group by i.path, i.selector
   order by hits desc
   limit least(coalesce(p_limit, 200), 1000);
$$;

-- How far down each page visitors actually read.
create or replace function scroll_depth_summary(p_from timestamptz default null)
returns table (
  path        text,
  views       bigint,
  measured    bigint,
  avg_depth   numeric,
  median_depth numeric,
  reached_50  bigint,
  reached_90  bigint
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select v.path,
         count(*)                       as views,
         -- Rows written before max_scroll_percent existed are null. They
         -- are counted separately so the averages below can be reported
         -- against the number they were actually computed from, rather
         -- than implying every view was measured.
         count(v.max_scroll_percent)    as measured,
         round(avg(v.max_scroll_percent), 1) as avg_depth,
         percentile_cont(0.5) within group (order by v.max_scroll_percent) as median_depth,
         count(*) filter (where v.max_scroll_percent >= 50) as reached_50,
         count(*) filter (where v.max_scroll_percent >= 90) as reached_90
    from visitor_pageviews v
   where p_from is null or v.entered_at >= p_from
   group by v.path
   order by views desc;
$$;

-- Raw click positions for one page, narrowed to one viewport band.
--
-- The band matters: the site is responsive, so a click recorded at 390px
-- wide happened on a layout that does not exist at 1280px. Drawing both on
-- one screenshot would put points where nothing ever was.
create or replace function heatmap_points(
  p_path      text,
  p_from      timestamptz default null,
  p_min_width int default null,
  p_max_width int default null,
  p_limit     int default 5000
)
returns table (
  rel_x numeric,
  abs_y int,
  kind  interaction_kind
)
language sql
stable
set search_path = pg_catalog, public
as $$
  select i.rel_x, i.abs_y, i.kind
    from visitor_interactions i
   where i.path = p_path
     and i.rel_x is not null
     and i.abs_y is not null
     and (p_from is null or i.occurred_at >= p_from)
     and (p_min_width is null or i.viewport_width >= p_min_width)
     and (p_max_width is null or i.viewport_width <= p_max_width)
   order by i.occurred_at desc
   limit least(coalesce(p_limit, 5000), 20000);
$$;

-- SECURITY INVOKER functions are granted to PUBLIC by default. RLS would
-- already return nothing to a non-admin, but removing the grant means the
-- anon key cannot reach them at all.
revoke execute on function interaction_page_summary(timestamptz) from public, anon;
revoke execute on function interaction_element_summary(interaction_kind, timestamptz, text, int) from public, anon;
revoke execute on function scroll_depth_summary(timestamptz) from public, anon;
revoke execute on function heatmap_points(text, timestamptz, int, int, int) from public, anon;

grant execute on function interaction_page_summary(timestamptz) to authenticated;
grant execute on function interaction_element_summary(interaction_kind, timestamptz, text, int) to authenticated;
grant execute on function scroll_depth_summary(timestamptz) to authenticated;
grant execute on function heatmap_points(text, timestamptz, int, int, int) to authenticated;

commit;

-- ------------------------------------------------------------------
-- Retention note (not run here — deliberately a manual decision):
--
-- Click rows accumulate far faster than sessions. When the table grows
-- past what is useful, trim it with the occurred_at index:
--
--   delete from visitor_interactions where occurred_at < now() - interval '180 days';
--
-- Rage and dead clicks are worth keeping longer than plain clicks:
--
--   delete from visitor_interactions
--    where kind = 'click' and occurred_at < now() - interval '90 days';
-- ------------------------------------------------------------------
