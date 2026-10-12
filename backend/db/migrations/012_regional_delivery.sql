-- 012 — Delivery by region, from the customer's PIN code. Replaces the single
-- per-pack charge of 011 (never filled) with the regional sheet's method:
--   delivery per pack = the region's delivery cost for one pack
--                       − the part of it already absorbed into that pack's price
-- rounded to the rupee. The region comes from the PIN code (lib/sales/regions.js).
alter table product_variants drop column delivery_paise;
alter table product_variants
  add column delivery_absorbed_paise bigint check (delivery_absorbed_paise is null or delivery_absorbed_paise >= 0);
alter table shipping_zones
  add column pack_delivery_cost_paise bigint check (pack_delivery_cost_paise is null or pack_delivery_cost_paise >= 0);
