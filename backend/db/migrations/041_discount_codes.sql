-- Discount codes at checkout (Nov 2026): codes the team makes in Warehouse → Settings, and later the
-- codes Spin & Win and Refer a friend hand out (source). The server checks a code when it is typed and
-- again when the order is placed (lib/sales/discounts.js); orders.discount_paise already exists and the
-- invoice prints it as "Less : Discount".
create table if not exists discount_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[A-Z0-9-]{3,24}$'),
  kind              text not null check (kind in ('amount', 'percent', 'free_delivery')),
  amount_paise      bigint not null default 0 check (amount_paise >= 0),   -- kind 'amount'
  percent_bp        integer not null default 0 check (percent_bp between 0 and 10000), -- kind 'percent' (1000 = 10%)
  max_off_paise     bigint check (max_off_paise is null or max_off_paise >= 0), -- cap for a percent code
  min_order_paise   bigint not null default 0 check (min_order_paise >= 0), -- on the rice subtotal
  region            text check (region is null or region in ('TN', 'SOUTH', 'NORTH', 'NE')),
  -- Only this mobile number (last ten digits) may use it: spin prizes and referral rewards.
  locked_phone      text check (locked_phone is null or locked_phone ~ '^\d{10}$'),
  -- The customer who shares it (a referral code): they cannot use it themselves.
  owner_phone       text check (owner_phone is null or owner_phone ~ '^\d{10}$'),
  first_order_only  boolean not null default false,
  max_uses          integer check (max_uses is null or max_uses > 0),       -- in all (null = no limit)
  uses_per_phone    integer not null default 1 check (uses_per_phone > 0),
  starts_at         timestamptz,
  expires_at        timestamptz,
  source            text not null default 'manual' check (source in ('manual', 'spin', 'referral', 'reward')),
  note              text,
  is_active         boolean not null default true,
  created_by        uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists discount_codes_locked_phone on discount_codes (locked_phone) where locked_phone is not null;
create index if not exists discount_codes_owner_phone on discount_codes (owner_phone) where owner_phone is not null;

alter table orders add column if not exists discount_code_id uuid references discount_codes(id) on delete set null;
alter table orders add column if not exists discount_code text;
create index if not exists orders_discount_code_id on orders (discount_code_id) where discount_code_id is not null;
