-- Checkout journeys that stop before a purchase are followed up (journey-followup.js), 30 minutes after
-- the shopper's last step, when they gave a mobile and have not paid since:
--   NeoDove: one campaign for "Payment not completed" (pressed Pay, then cancelled / failed / left) and one
--            for "Left at details" (filled the form, never pressed Pay), apart from the sign-up campaign;
--   Sales Daddy: "Left at details" as a lead with a note (an unpaid order is already sent when it expires).

alter table checkout_journeys
  add column if not exists followed_up_at timestamptz,
  add column if not exists followup       text;          -- 'payment' | 'details' | 'skipped: …'
create index if not exists checkout_journeys_followup on checkout_journeys (updated_at) where followed_up_at is null and contact_phone is not null;

-- NeoDove leads now go to more than one campaign. A sign-up still goes once per mobile; a checkout
-- campaign may call the same mobile again after a week (journey-followup.js checks that).
alter table neodove_outbox add column if not exists campaign text not null default 'signup'
  check (campaign in ('signup', 'checkout_payment', 'checkout_details'));
alter table neodove_outbox add column if not exists journey_id uuid;
alter table neodove_outbox drop constraint if exists neodove_outbox_mobile_key;
create unique index if not exists neodove_outbox_signup_mobile on neodove_outbox (mobile) where campaign = 'signup';
create index if not exists neodove_outbox_mobile_campaign on neodove_outbox (mobile, campaign, created_at desc);

-- "Left at details" journeys go to Sales Daddy through the same outbox.
alter table crm_outbox drop constraint if exists crm_outbox_kind_check;
alter table crm_outbox add constraint crm_outbox_kind_check
  check (kind in ('contest_signup', 'contact', 'bulk_order', 'order_event', 'whatsapp_chat', 'call_result', 'expo_lead', 'journey'));
