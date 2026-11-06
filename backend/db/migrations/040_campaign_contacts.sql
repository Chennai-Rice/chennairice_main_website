-- 040 — The numbers a WhatsApp campaign was sent to (for example the Diwali retailer campaign, Nov 2026).
-- Their WhatsApp replies are kept in our database (whatsapp_contacts) but are not sent on to Sales Daddy as
-- customer leads while the campaign is on (askeva-inbound.js, 30 days from the upload).
-- Filled by db/import-campaign-contacts.js from the campaign's Excel.
create table if not exists campaign_contacts (
  mobile     text not null,                 -- 10-digit Indian mobile
  campaign   text not null,                 -- e.g. 'diwali_retailers'
  created_at timestamptz not null default now(),
  primary key (mobile, campaign)
);
