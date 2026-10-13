-- 013 — Price and delivery charge per pack, per delivery region.
--
-- The regional delivered-price sheets (Oct 2026) give each pack its own
-- website price and delivery charge in every region (Tamil Nadu, South,
-- North, North East). For 5 kg packs the price is the same everywhere and
-- only the delivery charge changes; for 10 kg packs the price changes too.
-- The price list script works the sheets out and writes one row per pack and
-- region; checkout looks the customer's region up from the PIN code.
--
-- product_variants.price_paise stays the price shown before a PIN code is
-- known (the Tamil Nadu price). The columns added by 012 are superseded by
-- this table and dropped by a later migration.
create table variant_region_prices (
  variant_id      uuid not null references product_variants (id) on delete cascade,
  region          text not null,
  price_paise     bigint not null check (price_paise > 0),
  delivery_paise  bigint not null check (delivery_paise >= 0),
  primary key (variant_id, region)
);
