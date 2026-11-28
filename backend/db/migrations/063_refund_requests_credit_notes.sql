-- 063 — Refund requests and GST credit notes (owner, 28 Nov 2026).
--
-- A refund now starts as a request (order, amount, reason, remark). The accounts team approves it or does not
-- approve it in /warehouse → Accounts → Refunds. On approval the money goes back (Razorpay, as before) and a
-- GST credit note is issued against the order's invoice, numbered per financial year: CRI/CN/2026-27/000001.

create table credit_note_counters (
  financial_year  text primary key,
  last_number     int not null default 0
);

create table refund_requests (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders (id),
  amount_paise    bigint not null check (amount_paise > 0),
  reason          text not null,
  remark          text,
  -- Cancel the order too (stock back on the shelf) when it is approved: for an order that has not left.
  cancel_order    boolean not null default false,
  status          text not null default 'requested' check (status in ('requested', 'approved', 'not_approved')),
  requested_by    uuid references staff_users (id),
  requested_at    timestamptz not null default now(),
  decided_by      uuid references staff_users (id),
  decided_at      timestamptz,
  decision_note   text,
  -- The last attempt's error (e.g. Razorpay refused); the request stays open to try again.
  last_error      text,
  refund_id       uuid references refunds (id)
);
create index refund_requests_order on refund_requests (order_id);
create index refund_requests_status on refund_requests (status, requested_at desc);
-- One open request per order at a time.
create unique index refund_requests_one_open on refund_requests (order_id) where status = 'requested';

create table credit_notes (
  id                  uuid primary key default gen_random_uuid(),
  credit_note_number  text not null unique,
  financial_year      text not null,
  order_id            uuid not null references orders (id),
  invoice_id          uuid not null references invoices (id),
  refund_request_id   uuid references refund_requests (id),
  refund_id           uuid references refunds (id),
  issued_at           timestamptz not null default now(),
  reason              text not null,
  remark              text,
  seller              jsonb not null,
  buyer               jsonb not null,
  place_of_supply     text not null,
  taxable_paise       bigint not null,
  cgst_paise          bigint not null default 0,
  sgst_paise          bigint not null default 0,
  igst_paise          bigint not null default 0,
  total_paise         bigint not null check (total_paise > 0)
);
create index credit_notes_order on credit_notes (order_id);

-- The website's login can use the new tables (as 059).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'chennairice_app') then
    grant select, insert, update, delete on refund_requests, credit_notes, credit_note_counters to chennairice_app;
  end if;
end $$;
