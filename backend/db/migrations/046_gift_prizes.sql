-- Gift prizes (Spin & Win, Nov 2026): a code that gives something in the parcel instead of money off,
-- e.g. "Free 5 kg Kitchidi Ponni Slogan Bag". The order keeps the gift so the warehouse packs it.
alter table discount_codes drop constraint if exists discount_codes_kind_check;
alter table discount_codes add constraint discount_codes_kind_check check (kind in ('amount', 'percent', 'free_delivery', 'gift'));
alter table discount_codes add column if not exists gift_label text;
alter table orders add column if not exists gift_note text;
