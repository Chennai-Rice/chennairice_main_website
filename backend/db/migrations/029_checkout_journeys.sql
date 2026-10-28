-- Customer checkout journeys (Oct 2026): one row per shopper's way through
-- the shop — Add to cart → Proceed to checkout → Details filled → Continue to
-- payment → Payment cancelled / failed, or Purchased — so the owner can see
-- where people stop and follow up with those who filled their details but
-- did not pay.
--
-- The journey id is a random id the shopper's browser keeps until the order
-- is paid. Cart and checkout steps carry no personal data; the name, mobile,
-- email, city and PIN code are stored from the "details filled" step, when
-- the shopper submits the checkout form (the same details a pending order
-- already keeps).

create table if not exists checkout_journeys (
  id              uuid primary key,
  -- The furthest step reached, and how it ended.
  stage           text not null default 'cart'
                    check (stage in ('cart', 'checkout', 'details', 'payment', 'cancelled', 'failed', 'purchased')),
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- When each step was first reached: { "cart": "…", "checkout": "…", … }
  steps           jsonb not null default '{}'::jsonb,
  -- Cart at the latest step: [{ id, name, qty, price }]
  items           jsonb not null default '[]'::jsonb,
  value_paise     bigint,
  -- From the checkout form (details step) or the order.
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  city            text,
  pincode         text,
  state           text,
  order_id        uuid references orders (id) on delete set null,
  order_number    text,
  -- Why payment did not go through (cancelled by the shopper, or the gateway's message).
  last_error      text,
  -- How many times the payment window was opened.
  payment_attempts int not null default 0,
  traffic_source  text,
  user_agent      text
);

create index if not exists checkout_journeys_started on checkout_journeys (started_at desc);
create index if not exists checkout_journeys_stage on checkout_journeys (stage);
create index if not exists checkout_journeys_phone on checkout_journeys (contact_phone) where contact_phone is not null;
