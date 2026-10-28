-- Where each paid payment landed in the bank. Razorpay pays out in batches (settlements) about two days after
-- a payment; the bank statement shows only the bank's own reference of that transfer — the "UTIB" code
-- (e.g. UTIBN62026101710660349). Razorpay gives it as `additional_utr` in the settlement reconciliation,
-- next to its own UTR (AXISCN…). Filled in when Razorpay settles (webhook, the daily check, or an upload of
-- the reconciliation file), so the Excel exports can carry it and a bank line can be matched to its orders.
alter table payments
  add column if not exists settlement_id        text,
  add column if not exists settlement_utr       text,
  add column if not exists bank_utr             text,
  add column if not exists settled_at           timestamptz,
  add column if not exists settlement_fee_paise bigint,
  add column if not exists settlement_tax_paise bigint;

create index if not exists payments_bank_utr on payments (bank_utr) where bank_utr is not null;
create index if not exists payments_settlement on payments (settlement_id) where settlement_id is not null;
