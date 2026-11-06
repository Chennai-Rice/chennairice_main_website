-- In-house delivery per bag (pricing sheets, Nov 2026): 5 kg ₹49 (Kitchidi ₹60), 10 kg ₹100, 26 kg ₹200.
-- Set by the price list (db/apply-price-list.js); an order's in-house charge is the sum over its bags.
-- Null = not set for that pack: the flat charge in Warehouse → Settings is used instead.
alter table product_variants add column if not exists in_house_paise bigint check (in_house_paise is null or in_house_paise >= 0);
