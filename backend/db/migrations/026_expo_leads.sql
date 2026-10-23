-- 026 — Expo QR leads: the form shown to visitors who scan the QR code at an expo
-- (name, mobile, optional email, location, what they are, what rice they need).
-- One row per mobile number: a second submission updates it.
create table expo_leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null unique,
  email         text,
  location      text not null,
  buyer_type    text not null check (buyer_type in ('distributor', 'horeca', 'retailer', 'consumer')),
  requirements  text[] not null,
  campaign      text not null default 'expo',
  submissions   int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index expo_leads_created on expo_leads (created_at desc);

-- Expo leads go on to Sales Daddy through the same outbox.
alter table crm_outbox drop constraint if exists crm_outbox_kind_check;
alter table crm_outbox add constraint crm_outbox_kind_check
  check (kind in ('contest_signup', 'contact', 'bulk_order', 'order_event', 'whatsapp_chat', 'call_result', 'expo_lead'));
