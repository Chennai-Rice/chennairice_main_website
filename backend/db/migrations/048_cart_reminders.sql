-- Abandoned cart reminder emails (Nov 2026, cart-recovery.js). A checkout journey that stopped after the details
-- step (so we have an email) gets email 1 an hour later and, still unpaid, email 2 a day after that with a
-- free-delivery code. The token is the "Complete my order" link (refills the cart) and the unsubscribe link.
create table if not exists cart_reminders (
  id            uuid primary key default gen_random_uuid(),
  journey_id    uuid not null references checkout_journeys (id) on delete cascade,
  step          smallint not null check (step in (1, 2)),
  email         text not null,
  phone         text,
  token         text not null unique,
  value_paise   bigint,
  discount_code_id uuid references discount_codes (id) on delete set null,
  sent_at       timestamptz not null default now(),
  clicked_at    timestamptz,
  unique (journey_id, step)
);
create index if not exists cart_reminders_email on cart_reminders (lower(email), sent_at desc);

-- People who asked for no more reminders (the link in every reminder). Kept for good.
create table if not exists email_optouts (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- The email-2 code is stored with the other codes, marked as a cart reminder.
alter table discount_codes drop constraint if exists discount_codes_source_check;
alter table discount_codes add constraint discount_codes_source_check
  check (source in ('manual', 'spin', 'referral', 'reward', 'cart'));
