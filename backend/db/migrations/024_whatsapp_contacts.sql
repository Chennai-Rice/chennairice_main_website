-- 024 — WhatsApp contacts from AskEva (the business number's chats), kept in
-- our own database first and then sent on to the Sales Daddy CRM:
--   AskEva → POST /api/askeva/webhook → whatsapp_contacts → crm_outbox → Sales Daddy
-- Also filled once from AskEva's UI-Contacts export (scripts/import-askeva-contacts.mjs).
create table whatsapp_contacts (
  phone            text primary key,             -- 10-digit Indian mobile, or the full number for others
  name             text,
  first_message    text,
  first_message_at timestamptz,
  last_message     text,
  last_message_at  timestamptz,
  messages         int not null default 0,
  source           text not null default 'webhook' check (source in ('webhook', 'import')),
  crm_noted_at     timestamptz,                   -- last time a note went to Sales Daddy (at most one a day)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index whatsapp_contacts_last on whatsapp_contacts (last_message_at desc);

-- Every webhook call as AskEva sent it, for checking and replaying (kept 90 days by the job).
create table askeva_events (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  payload     jsonb not null,
  handled     boolean not null default false,
  error       text
);
create index askeva_events_received on askeva_events (received_at desc);

alter table crm_outbox drop constraint if exists crm_outbox_kind_check;
alter table crm_outbox add constraint crm_outbox_kind_check
  check (kind in ('contest_signup', 'contact', 'bulk_order', 'order_event', 'whatsapp_chat'));
