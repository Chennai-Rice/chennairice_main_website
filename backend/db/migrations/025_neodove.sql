-- 025 — NeoDove (telecalling) with our database in the middle:
--   ad / WhatsApp sign-up, not a buyer ─▶ lead_status 'not_converted' ─▶ neodove_outbox ─▶ NeoDove campaign
--   NeoDove call result (webhook) ─▶ neodove_events ─▶ lead_status 'qualified' / 'not_qualified' ─▶ Sales Daddy
--   paid order (same mobile) ─▶ lead_status 'converted'
-- One row per mobile number; the latest call result is kept on the row, every one in neodove_events.
create table lead_status (
  mobile           text primary key,             -- 10-digit Indian mobile
  name             text,
  email            text,
  source           text,                          -- attribution source key (meta_ads_instagram, whatsapp…)
  campaign         text,
  status           text not null default 'not_converted'
                   check (status in ('not_converted', 'qualified', 'not_qualified', 'converted')),
  signed_up_at     timestamptz,
  neodove_sent_at  timestamptz,
  last_disposition text,
  last_remark      text,
  last_agent       text,
  last_called_at   timestamptz,
  calls            int not null default 0,
  converted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index lead_status_status on lead_status (status, updated_at desc);

-- Leads waiting to go to NeoDove (same design as crm_outbox): sent at once, retried by the 10-minute job.
create table neodove_outbox (
  id           uuid primary key default gen_random_uuid(),
  mobile       text not null unique,                -- each mobile goes to NeoDove once
  payload      jsonb not null,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  next_try_at  timestamptz not null default now()
);
create index neodove_outbox_queued on neodove_outbox (next_try_at) where status = 'queued';

-- Every webhook call from NeoDove as it came (kept 90 days by the job).
create table neodove_events (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  payload     jsonb not null,
  handled     boolean not null default false,
  result      text,
  error       text
);
create index neodove_events_received on neodove_events (received_at desc);

-- Call results go on to Sales Daddy through the same outbox.
alter table crm_outbox drop constraint if exists crm_outbox_kind_check;
alter table crm_outbox add constraint crm_outbox_kind_check
  check (kind in ('contest_signup', 'contact', 'bulk_order', 'order_event', 'whatsapp_chat', 'call_result'));
