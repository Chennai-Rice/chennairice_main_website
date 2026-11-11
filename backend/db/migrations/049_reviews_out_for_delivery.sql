-- Customer reviews (Nov 2026, reviews.js): the "Order Delivered" email links to /review with a signed link for that
-- order; the customer rates it and writes a line; staff publish the ones to show on the website (/offers → Reviews).
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references orders (id) on delete cascade,
  name          text not null,
  city          text,
  rating        smallint not null check (rating between 1 and 5),
  body          text not null default '',
  products      text,
  status        text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz
);
create index if not exists reviews_status on reviews (status, published_at desc);

-- "Out for delivery" (Nov 2026): pressed in /warehouse → Deliveries; the customer gets the "Arriving today" email.
alter table shipments add column if not exists out_for_delivery_at timestamptz;
