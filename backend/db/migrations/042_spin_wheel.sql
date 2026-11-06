-- Spin & Win (Nov 2026): one spin per mobile number; the prize is a discount code locked to that
-- number (discount_codes.source = 'spin'). The prizes, their chances and the monthly budget are in
-- company_settings (spin_*), edited in Warehouse → Settings → Spin & Win (lib/sales/spin.js).
create table if not exists spins (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique check (phone ~ '^[6-9]\d{9}$'),
  name        text,
  prize_key   text not null,
  prize_label text not null,
  code_id     uuid references discount_codes(id) on delete set null,
  device_id   text,
  ip          text,
  attribution jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists spins_device on spins (device_id) where device_id is not null;
create index if not exists spins_created on spins (created_at desc);

-- The spin's lead goes to Sales Daddy and to the telecallers in NeoDove, like the other website leads.
alter table crm_outbox drop constraint if exists crm_outbox_kind_check;
alter table crm_outbox add constraint crm_outbox_kind_check
  check (kind in ('contest_signup', 'contact', 'bulk_order', 'order_event', 'whatsapp_chat', 'call_result', 'expo_lead', 'journey',
                  'spin_wheel', 'referral'));
alter table neodove_outbox drop constraint if exists neodove_outbox_campaign_check;
alter table neodove_outbox add constraint neodove_outbox_campaign_check
  check (campaign in ('signup', 'checkout_payment', 'checkout_details', 'bulk_enquiry', 'spin_wheel', 'referral'));
