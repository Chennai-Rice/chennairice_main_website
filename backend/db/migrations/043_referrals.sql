-- Refer a friend (Nov 2026), on the website only (lib/sales/referrals.js).
-- Every paying customer gets one referral code (discount_codes.source = 'referral', owner_phone = theirs).
-- A friend types the code, or the customer's mobile number, at checkout: ₹ off their first order.
-- When the friend's order is delivered, the customer gets a reward code (source = 'reward') locked to
-- their mobile number and email, used automatically at their next checkout.
create table if not exists referrers (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique check (phone ~ '^\d{10}$'),
  email       text not null,
  name        text not null,
  code_id     uuid not null references discount_codes(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists referral_rewards (
  id               uuid primary key default gen_random_uuid(),
  referrer_id      uuid not null references referrers(id) on delete cascade,
  friend_order_id  uuid not null unique references orders(id) on delete cascade,
  code_id          uuid references discount_codes(id) on delete set null,
  status           text not null check (status in ('issued', 'over_limit', 'cancelled')),
  created_at       timestamptz not null default now()
);
create index if not exists referral_rewards_referrer on referral_rewards (referrer_id, created_at desc);

-- A reward works only with the customer's mobile number AND email.
alter table discount_codes add column if not exists locked_email text;

alter table orders add column if not exists referrer_id uuid references referrers(id) on delete set null;
