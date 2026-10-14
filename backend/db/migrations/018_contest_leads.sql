-- 018 — Super Slogan Contest sign-ups from the popup form that visitors who
-- arrive from a Meta or Google ad see (name, mobile, email), with the ad they
-- came from. One row per mobile number: a second sign-up updates it.
create table contest_leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null unique,
  email        text not null,
  source       text not null default 'direct',
  campaign     text not null default '',
  ad           text not null default '',
  landing      text,
  attribution  jsonb,
  submissions  int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index contest_leads_created on contest_leads (created_at desc);
