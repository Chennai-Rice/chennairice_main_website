-- 062 — Sales Daddy's Meta lead update of 27 Nov 2026 (Leads API: adset_name, platform, meta_lead_ids).
--   adset_name     the ad set behind the form lead (campaign_name and ad_name were already kept)
--   platform       now Sales Daddy's own field: facebook / instagram / audience_network / messenger
--   meta_lead_ids  every Meta lead ID for the person (a repeat form submission adds one), first one first; text,
--                  as long IDs lose digits as numbers. meta_lead_id stays the first one.
-- Ad details that Sales Daddy fills in later ("Fill in missing ad details", after the Facebook reconnect) are copied
-- onto rows already saved by a periodic re-read (lead-forms.js), so lead_forms_sync remembers when that last ran.
alter table lead_forms add column if not exists adset_name text;
alter table lead_forms add column if not exists meta_lead_ids text[] not null default '{}';
update lead_forms set meta_lead_ids = array[meta_lead_id] where meta_lead_id is not null and meta_lead_ids = '{}';
alter table lead_forms_sync add column if not exists refreshed_at timestamptz;
