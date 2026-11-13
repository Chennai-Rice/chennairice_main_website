-- 054 — Contact-form enquiries also go to NeoDove (its Enquiries campaign), as a new outbox lead kind 'contact'.
-- NeoDove leads now go to one campaign per source (Meta, Google Ads, WhatsApp, Add to cart, Enquiries; neodove.js).
alter table neodove_outbox drop constraint if exists neodove_outbox_campaign_check;
alter table neodove_outbox add constraint neodove_outbox_campaign_check
  check (campaign in ('signup', 'checkout_payment', 'checkout_details', 'bulk_enquiry', 'spin_wheel', 'referral', 'contact'));
