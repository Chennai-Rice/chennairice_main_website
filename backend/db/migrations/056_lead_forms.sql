-- 056 — Meta Instant Form ("Lead form") leads.
-- Sales Daddy receives the form leads from Meta; every 10 minutes the website copies the new ones here
-- (lib/lead-forms.js), sets them up as sign-ups with source 'lead_form' and queues them for NeoDove's Meta campaign.
create table lead_forms (
  id            uuid primary key default gen_random_uuid(),
  sd_lead_id    text not null unique,        -- the lead's id in Sales Daddy
  mobile        text not null,               -- 10 digits
  name          text,
  email         text,
  city          text,
  state         text,
  platform      text,                        -- facebook / instagram
  form_name     text,
  facebook_page text,
  campaign_name text,
  ad_name       text,
  created_at_sd timestamptz,                 -- when the lead arrived in Sales Daddy
  saved_at      timestamptz not null default now(),
  meta_sent_at  timestamptz,                 -- the Lead event sent to Meta (Conversions API for CRM)
  meta_error    text
);
create index lead_forms_mobile on lead_forms (mobile);
create index lead_forms_saved on lead_forms (saved_at desc);

-- Where the last copy stopped (one row).
create table lead_forms_sync (
  id      int primary key default 1 check (id = 1),
  since   timestamptz not null,
  ran_at  timestamptz not null default now()
);
