-- Cloud Centre (/admin, Oct 2026), Phase 2: uptime and website speed, checked by
-- the 10-minute job (cloud-checks.js). Both kept 90 days.

-- One check of one site or API address: up or not, the HTTP status and how long it took.
create table if not exists uptime_checks (
  id bigserial primary key,
  target text not null,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status integer,
  ms integer,
  error text
);
create index if not exists uptime_checks_target_at on uptime_checks (target, checked_at desc);

-- Google PageSpeed Insights for one page (mobile or desktop): the lab score and,
-- when Chrome has enough visits, real users' Core Web Vitals (75th percentile).
create table if not exists site_speed (
  id bigserial primary key,
  url text not null,
  strategy text not null check (strategy in ('mobile', 'desktop')),
  checked_at timestamptz not null default now(),
  score integer,              -- Lighthouse performance score, 0-100
  lab_lcp_ms integer,
  lab_tbt_ms integer,
  lab_cls numeric,
  field_category text,        -- FAST / AVERAGE / SLOW from real Chrome users
  field_lcp_ms integer,
  field_inp_ms integer,
  field_cls numeric,
  error text
);
create index if not exists site_speed_url_at on site_speed (url, strategy, checked_at desc);
