-- 011 — Delivery charge per pack. The regional delivered-price sheet (Oct 2026)
-- gives every pack its own delivery charge to show the customer: the total
-- delivery cost less the part already absorbed into the website price. An
-- order's delivery charge is the sum over its packs. NULL = no per-pack charge
-- set; the shipping zone's own rate applies then.
alter table product_variants
  add column delivery_paise bigint check (delivery_paise is null or delivery_paise >= 0);
