-- ============================================================================
-- 001 — Sales database: catalog, inventory, plant, customers, orders,
--       payments, refunds, shipments, GST invoices, staff, email queue.
--
-- Conventions used throughout:
--   * Money is stored in PAISE as bigint. Never floats, never decimal rupees:
--     no rounding drift, and it is what Razorpay itself uses.
--   * Prices are GST-INCLUSIVE (what the customer pays, as on the pack). Tax
--     is worked backwards from them and stored per line for the invoice.
--   * Allowed values are enforced by CHECK constraints rather than enum types,
--     so adding a status later is a one-line migration instead of a type swap.
--   * Every order line snapshots name, SKU, HSN, tax rate and price at the
--     moment of sale. Later catalog edits never rewrite a past order.
--   * Stock is never edited directly: every change is a row in
--     stock_movements, and stock_levels is the running total of those rows.
-- ============================================================================

create extension if not exists citext;

-- Keeps updated_at honest without relying on application code to set it.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Company settings (seller details printed on invoices, etc.)
-- ----------------------------------------------------------------------------
create table company_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Staff — who may operate the admin side, and in which role.
-- Sign-in itself is Firebase Auth; this table decides what a signed-in person
-- is allowed to do.
-- ----------------------------------------------------------------------------
create table staff_users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  firebase_uid  text unique,
  full_name     text not null,
  role          text not null check (role in ('owner', 'admin', 'sales', 'inventory', 'plant', 'dispatch')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger staff_users_updated before update on staff_users
  for each row execute function set_updated_at();

create table staff_audit_log (
  id           bigint generated always as identity primary key,
  staff_id     uuid references staff_users (id),
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index staff_audit_log_entity on staff_audit_log (entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- Catalog
-- ----------------------------------------------------------------------------
create table products (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  tag            text,
  description    text,
  image_url      text,
  is_active      boolean not null default true,
  display_order  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger products_updated before update on products
  for each row execute function set_updated_at();

create table product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products (id) on delete restrict,
  sku            text not null unique,
  pack_kg        numeric(6, 2) not null check (pack_kg > 0),
  -- GST-inclusive selling price. NULL means "not priced yet": such a pack is
  -- listed but can never be put in an order.
  price_paise    bigint check (price_paise is null or price_paise > 0),
  mrp_paise      bigint check (mrp_paise is null or mrp_paise > 0),
  hsn_code       text not null default '1006',
  -- Basis points: 500 = 5%.
  tax_rate_bp    int not null default 500 check (tax_rate_bp between 0 and 2800),
  -- Stock at or below this prompts the plant to produce more.
  reorder_level  int not null default 0 check (reorder_level >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, pack_kg)
);
create trigger product_variants_updated before update on product_variants
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Inventory
-- ----------------------------------------------------------------------------
create table stock_locations (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  address        text,
  -- The location online orders are reserved and dispatched from.
  is_fulfilment  boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
-- Exactly one fulfilment location at a time.
create unique index stock_locations_one_fulfilment on stock_locations ((true)) where is_fulfilment;

create table stock_levels (
  location_id  uuid not null references stock_locations (id),
  variant_id   uuid not null references product_variants (id),
  on_hand      int not null default 0 check (on_hand >= 0),   -- sellable packs physically present
  reserved     int not null default 0 check (reserved >= 0),  -- held for unpaid/undispatched orders
  damaged      int not null default 0 check (damaged >= 0),   -- present but not sellable
  updated_at   timestamptz not null default now(),
  primary key (location_id, variant_id),
  -- Can never promise more than is on the shelf.
  check (reserved <= on_hand)
);
create trigger stock_levels_updated before update on stock_levels
  for each row execute function set_updated_at();

-- Plant output. Each batch adds stock and is the unit of traceability.
create table production_batches (
  id           uuid primary key default gen_random_uuid(),
  batch_no     text not null unique,
  variant_id   uuid not null references product_variants (id),
  location_id  uuid not null references stock_locations (id),
  quantity     int not null check (quantity > 0),
  packed_on    date not null,
  best_before  date,
  notes        text,
  created_by   uuid references staff_users (id),
  created_at   timestamptz not null default now(),
  check (best_before is null or best_before > packed_on)
);
create index production_batches_variant on production_batches (variant_id, packed_on desc);

-- ----------------------------------------------------------------------------
-- Customers (guest checkout: identified by email, no login needed)
-- ----------------------------------------------------------------------------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  name        text not null,
  phone       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger customers_updated before update on customers
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Delivery charges by zone. Seeded at zero (free delivery) until the business
-- sets real rates.
-- ----------------------------------------------------------------------------
create table shipping_zones (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  states             text[] not null default '{}',
  is_default         boolean not null default false,
  rate_per_kg_paise  bigint not null default 0 check (rate_per_kg_paise >= 0),
  min_fee_paise      bigint not null default 0 check (min_fee_paise >= 0),
  -- Orders at or above this value ship free. NULL = never free.
  free_above_paise   bigint check (free_above_paise is null or free_above_paise >= 0),
  is_active          boolean not null default true
);
create unique index shipping_zones_one_default on shipping_zones ((true)) where is_default;

-- ----------------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------------
create table orders (
  id                       uuid primary key default gen_random_uuid(),
  order_number             text not null unique,
  customer_id              uuid not null references customers (id),
  -- Contact and address as given for THIS order.
  contact_name             text not null,
  contact_email            citext not null,
  contact_phone            text not null,
  shipping_address         jsonb not null,
  ship_state               text not null,                    -- GST place of supply
  fulfilment_location_id   uuid not null references stock_locations (id),

  status text not null default 'pending_payment' check (status in (
    'pending_payment',  -- created, stock held, waiting for the customer to pay
    'placed',           -- paid, waiting for sales to confirm
    'confirmed',        -- sales confirmed, waiting to be packed
    'packed',           -- packed, waiting for dispatch
    'shipped',          -- every item has left the building
    'delivered',
    'cancelled',
    'returned'
  )),
  payment_status text not null default 'pending' check (payment_status in (
    'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
  )),

  subtotal_paise           bigint not null check (subtotal_paise >= 0),   -- items, GST-inclusive
  shipping_paise           bigint not null default 0 check (shipping_paise >= 0),
  discount_paise           bigint not null default 0 check (discount_paise >= 0),
  total_paise              bigint not null check (total_paise > 0),
  tax_paise                bigint not null default 0 check (tax_paise >= 0), -- GST contained in the total
  shipping_tax_rate_bp     int not null default 0,

  -- While pending_payment: stock is held until this moment.
  reservation_expires_at   timestamptz,
  -- Set when a paid order needs a person to look at it (e.g. paid after its
  -- stock hold lapsed and the stock had gone).
  needs_attention          text,

  placed_at                timestamptz,
  confirmed_at             timestamptz,
  packed_at                timestamptz,
  shipped_at               timestamptz,
  delivered_at             timestamptz,
  cancelled_at             timestamptz,
  cancel_reason            text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (total_paise = subtotal_paise + shipping_paise - discount_paise)
);
create trigger orders_updated before update on orders
  for each row execute function set_updated_at();
create index orders_status_created on orders (status, created_at desc);
create index orders_customer on orders (customer_id);
create index orders_phone on orders (contact_phone);
create index orders_pending_expiry on orders (reservation_expires_at) where status = 'pending_payment';

create table order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders (id) on delete cascade,
  variant_id         uuid not null references product_variants (id),
  -- Snapshot at the time of sale:
  product_name       text not null,
  sku                text not null,
  pack_kg            numeric(6, 2) not null,
  hsn_code           text not null,
  tax_rate_bp        int not null,
  unit_price_paise   bigint not null check (unit_price_paise > 0),
  quantity           int not null check (quantity > 0),
  line_total_paise   bigint not null check (line_total_paise > 0),
  taxable_paise      bigint not null,
  cgst_paise         bigint not null default 0,
  sgst_paise         bigint not null default 0,
  igst_paise         bigint not null default 0,
  check (line_total_paise = unit_price_paise * quantity),
  check (taxable_paise + cgst_paise + sgst_paise + igst_paise = line_total_paise)
);
create index order_items_order on order_items (order_id);

create table order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references orders (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor        text not null check (actor in ('system', 'customer', 'staff', 'gateway')),
  staff_id     uuid references staff_users (id),
  reason       text,
  created_at   timestamptz not null default now()
);
create index order_status_history_order on order_status_history (order_id, created_at);

-- Internal notes (call outcomes, special instructions). Never shown to customers.
create table order_notes (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references orders (id) on delete cascade,
  staff_id    uuid references staff_users (id),
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index order_notes_order on order_notes (order_id, created_at);

-- ----------------------------------------------------------------------------
-- Payments
-- ----------------------------------------------------------------------------
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id),
  gateway             text not null check (gateway in ('razorpay', 'zoho_payments')),
  -- The gateway's order/session id this attempt pays against. Written by us
  -- when the attempt starts, so the browser can never choose what its payment
  -- is checked against.
  gateway_order_ref   text not null,
  gateway_payment_id  text,
  amount_paise        bigint not null check (amount_paise > 0),
  currency            text not null default 'INR',
  status              text not null default 'created' check (status in ('created', 'paid', 'failed', 'superseded')),
  method              text,
  card_last4          text,
  failure_reason      text,
  raw                 jsonb,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (gateway, gateway_order_ref)
);
create trigger payments_updated before update on payments
  for each row execute function set_updated_at();
create index payments_order on payments (order_id);
create unique index payments_gateway_payment_id on payments (gateway, gateway_payment_id) where gateway_payment_id is not null;
-- An order can never be paid twice.
create unique index payments_one_paid_per_order on payments (order_id) where status = 'paid';

create table refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments (id),
  order_id           uuid not null references orders (id),
  amount_paise       bigint not null check (amount_paise > 0),
  reason             text not null,
  status             text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'manual')),
  gateway_refund_id  text unique,
  raw                jsonb,
  staff_id           uuid references staff_users (id),
  created_at         timestamptz not null default now(),
  processed_at       timestamptz
);
create index refunds_order on refunds (order_id);

-- Every webhook delivery recorded once. A gateway re-sending the same event
-- hits the primary key and is skipped, so nothing is ever applied twice.
create table payment_webhook_events (
  event_id      text primary key,
  gateway       text not null,
  event_type    text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);

-- ----------------------------------------------------------------------------
-- Shipments (entered by hand by the dispatch team)
-- ----------------------------------------------------------------------------
create table shipments (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references orders (id),
  shipment_number        text not null unique,
  location_id            uuid not null references stock_locations (id),
  method                 text not null check (method in ('own_vehicle', 'courier', 'transport', 'pickup')),
  carrier_name           text,          -- courier or transport company
  tracking_number        text,          -- courier AWB / docket
  lr_number              text,          -- lorry receipt, for transport
  tracking_url           text,
  vehicle_number         text,
  driver_name            text,
  driver_phone           text,
  status                 text not null default 'shipped' check (status in ('shipped', 'delivered', 'returned')),
  expected_delivery      date,
  shipped_at             timestamptz not null default now(),
  delivered_at           timestamptz,
  proof_of_delivery_path text,          -- photo in the site-files bucket
  notes                  text,
  dispatched_by          uuid references staff_users (id),
  delivered_by           uuid references staff_users (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Each method needs the details that make it traceable.
  check (method <> 'courier'      or (carrier_name is not null and tracking_number is not null)),
  check (method <> 'transport'    or (carrier_name is not null and lr_number is not null)),
  check (method <> 'own_vehicle'  or vehicle_number is not null)
);
create trigger shipments_updated before update on shipments
  for each row execute function set_updated_at();
create index shipments_order on shipments (order_id);

create table shipment_items (
  id             uuid primary key default gen_random_uuid(),
  shipment_id    uuid not null references shipments (id) on delete cascade,
  order_item_id  uuid not null references order_items (id),
  quantity       int not null check (quantity > 0),
  batch_id       uuid references production_batches (id)
);
create index shipment_items_shipment on shipment_items (shipment_id);
create index shipment_items_order_item on shipment_items (order_item_id);

create table shipment_status_history (
  id           bigint generated always as identity primary key,
  shipment_id  uuid not null references shipments (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  staff_id     uuid references staff_users (id),
  note         text,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Stock movements — the ledger. stock_levels is always the sum of these.
-- ----------------------------------------------------------------------------
create table stock_movements (
  id              bigint generated always as identity primary key,
  location_id     uuid not null references stock_locations (id),
  variant_id      uuid not null references product_variants (id),
  type            text not null check (type in (
    'production_in', 'reserve', 'release', 'dispatch',
    'return_in', 'damage', 'adjustment', 'transfer_out', 'transfer_in'
  )),
  on_hand_delta   int not null default 0,
  reserved_delta  int not null default 0,
  damaged_delta   int not null default 0,
  batch_id        uuid references production_batches (id),
  order_id        uuid references orders (id),
  shipment_id     uuid references shipments (id),
  reason          text,
  staff_id        uuid references staff_users (id),
  created_at      timestamptz not null default now(),
  check (on_hand_delta <> 0 or reserved_delta <> 0 or damaged_delta <> 0)
);
create index stock_movements_variant on stock_movements (variant_id, created_at desc);
create index stock_movements_order on stock_movements (order_id) where order_id is not null;

-- ----------------------------------------------------------------------------
-- GST tax invoices — one per order, numbered per financial year.
-- ----------------------------------------------------------------------------
create table invoice_counters (
  financial_year  text primary key,          -- e.g. 2026-27
  last_number     int not null default 0
);

create table invoices (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null unique references orders (id),
  invoice_number    text not null unique,
  financial_year    text not null,
  issued_at         timestamptz not null default now(),
  seller            jsonb not null,
  buyer             jsonb not null,
  place_of_supply   text not null,
  taxable_paise     bigint not null,
  cgst_paise        bigint not null default 0,
  sgst_paise        bigint not null default 0,
  igst_paise        bigint not null default 0,
  total_paise       bigint not null
);

-- ----------------------------------------------------------------------------
-- Email queue. Written inside the same transaction as the change it reports,
-- so an email is never sent for something that rolled back, and never lost
-- because the mail provider was down at that moment.
-- ----------------------------------------------------------------------------
create table email_outbox (
  id           uuid primary key default gen_random_uuid(),
  to_email     citext not null,
  subject      text not null,
  body_text    text not null,
  body_html    text,
  template     text not null,
  order_id     uuid references orders (id),
  -- Stops repeat reminders: the same key is only ever queued once.
  dedupe_key   text unique,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index email_outbox_queued on email_outbox (created_at) where status = 'queued';
