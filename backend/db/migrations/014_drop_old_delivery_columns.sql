-- 014 — The single per-pack delivery figures of 012 were replaced by
-- variant_region_prices (013), which holds each pack's price and delivery
-- charge per region. Nothing reads these columns any more.
alter table product_variants drop column delivery_absorbed_paise;
alter table shipping_zones drop column pack_delivery_cost_paise;
