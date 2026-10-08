-- 003 — Shipment IDs of their own.
--
-- The shipment ID used to be the order number with "SH-" in front, so anyone
-- holding one could work out the other. It is now a separate random code
-- (SHP-K7M4-Q9X2), given to the order when it is paid and used as the number
-- of its first shipment (a second shipment of the same order adds -2).
alter table orders add column shipment_id text unique;

-- Orders already paid get one now. md5 of random() is only used for this
-- one-off backfill; new IDs come from newShipmentId() in lib/sales/util.js.
update orders
   set shipment_id = 'SHP-' || upper(substr(md5(random()::text || id::text), 1, 4))
                    || '-' || upper(substr(md5(id::text || random()::text), 1, 4))
 where status <> 'pending_payment';

-- Shipments already made take their order's new ID.
update shipments s
   set shipment_number = o.shipment_id
          || case when s.shipment_number ~ '-1$' then '' else '-' || substring(s.shipment_number from '-(\d+)$') end
  from orders o
 where o.id = s.order_id and o.shipment_id is not null;
