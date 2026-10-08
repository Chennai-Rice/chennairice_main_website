-- 005 — the ID register: every Order ID and Shipment ID ever issued.
--
-- An ID is claimed here FIRST, by inserting it; the primary key makes that
-- claim atomic, so two checkouts running at the same instant can never be
-- handed the same ID (the loser simply draws another). Rows are never
-- deleted, so an ID from an abandoned or cancelled order is never reused,
-- and one table answers "which order is this ID?" for any ID a customer or
-- the warehouse reads out. Order IDs and shipment IDs share the one key, so
-- the same text can never mean both.
create table issued_ids (
  value      text primary key,
  kind       text not null check (kind in ('order', 'shipment')),
  order_id   uuid references orders (id) on delete set null,
  issued_at  timestamptz not null default now()
);
create index issued_ids_order on issued_ids (order_id);
create index issued_ids_kind_time on issued_ids (kind, issued_at desc);

-- Register everything already issued.
insert into issued_ids (value, kind, order_id, issued_at)
select order_number, 'order', id, created_at from orders;

insert into issued_ids (value, kind, order_id, issued_at)
select shipment_id, 'shipment', id, coalesce(placed_at, created_at) from orders
 where shipment_id is not null
on conflict (value) do nothing;

-- Shipment numbers of second and later shipments (ID-2, ID-3) too.
insert into issued_ids (value, kind, order_id, issued_at)
select shipment_number, 'shipment', order_id, created_at from shipments
on conflict (value) do nothing;
