-- 039 — NeoDove leads are shared equally between the telecallers' three campaigns (Gayathri, Ramya, Lavanya).
-- Every lead that goes to NeoDove (sign-up, checkout not paid, bulk enquiry) is given to the telecaller with the
-- fewest leads in the last 14 days (neodove.js); `agent` records who got it. Bulk enquiries are a new source.
alter table neodove_outbox add column if not exists agent text;
alter table neodove_outbox drop constraint if exists neodove_outbox_campaign_check;
alter table neodove_outbox add constraint neodove_outbox_campaign_check
  check (campaign in ('signup', 'checkout_payment', 'checkout_details', 'bulk_enquiry'));
create index if not exists neodove_outbox_agent_recent on neodove_outbox (agent, created_at desc) where agent is not null;
