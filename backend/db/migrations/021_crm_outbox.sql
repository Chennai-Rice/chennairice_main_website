-- 021 — Leads waiting to be sent to the Sales Daddy CRM (salesdaddy.in):
-- contest sign-ups, contact and bulk-order enquiries. Written with the lead,
-- sent straight away, and retried by the 10-minute job if Sales Daddy was
-- unreachable, so no lead is lost.
create table crm_outbox (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('contest_signup', 'contact', 'bulk_order')),
  payload      jsonb not null,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts     int not null default 0,
  last_error   text,
  crm_lead_id  text,
  duplicate    boolean,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  next_try_at  timestamptz not null default now()
);
create index crm_outbox_queued on crm_outbox (next_try_at) where status = 'queued';
