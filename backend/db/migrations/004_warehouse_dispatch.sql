-- 004 — one-switch dispatch from the warehouse page.
--
-- The warehouse marks an order "Dispatched" with a single switch, before
-- anyone has typed in a vehicle or courier. So:
--   * a shipment's method may be left empty until those details are added
--     (the per-method rules on shipments already let a NULL method through);
--   * a dispatch switched back off is kept as a 'cancelled' shipment rather
--     than deleted, because its stock movements point at it;
--   * that undo puts the packs back with its own ledger entry type.
alter table shipments alter column method drop not null;
alter table shipments drop constraint shipments_method_check;
alter table shipments add constraint shipments_method_check
  check (method is null or method in ('own_vehicle', 'courier', 'transport', 'pickup'));

alter table shipments drop constraint shipments_status_check;
alter table shipments add constraint shipments_status_check
  check (status in ('shipped', 'delivered', 'returned', 'cancelled'));

alter table stock_movements drop constraint stock_movements_type_check;
alter table stock_movements add constraint stock_movements_type_check
  check (type in (
    'production_in', 'reserve', 'release', 'dispatch', 'dispatch_reversal',
    'return_in', 'damage', 'adjustment', 'transfer_out', 'transfer_in'
  ));
