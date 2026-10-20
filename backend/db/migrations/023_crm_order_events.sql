-- 023 — Shop orders and warehouse steps also go to the Sales Daddy CRM:
-- a paid order, an abandoned checkout, and each step after it (confirmed,
-- packed, shipped, delivered, cancelled, returned) lands as a note on the
-- customer's lead. Same outbox and retries as the enquiry leads (021).
alter table crm_outbox drop constraint if exists crm_outbox_kind_check;
alter table crm_outbox add constraint crm_outbox_kind_check
  check (kind in ('contest_signup', 'contact', 'bulk_order', 'order_event'));
