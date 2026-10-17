-- 022 — WhatsApp messages waiting to be sent through AskEva (the "order placed"
-- thank-you). Written when an order is paid, sent straight away, and retried by
-- the 10-minute job, so a customer is not missed if AskEva is unreachable.
-- One message per order and kind.
create table whatsapp_outbox (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  kind         text not null check (kind in ('order_placed')),
  to_phone     text not null,
  params       jsonb not null,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  next_try_at  timestamptz not null default now(),
  unique (order_id, kind)
);
create index whatsapp_outbox_queued on whatsapp_outbox (next_try_at) where status = 'queued';
