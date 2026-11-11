-- 040 — How an order is delivered (Nov 2026): by courier (the regional charge per pack), or by Chennai Rice's
-- own delivery team (a flat charge per order where it delivers; delivery.js). Earlier orders were all courier.
alter table orders add column if not exists delivery_method text not null default 'courier';
alter table orders drop constraint if exists orders_delivery_method_check;
alter table orders add constraint orders_delivery_method_check check (delivery_method in ('courier', 'in_house'));
