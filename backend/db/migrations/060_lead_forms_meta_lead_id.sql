-- 060 — Meta's own ID for an Instant Form lead (Sales Daddy's Leads API field meta_lead_id, live 25 Nov 2026).
-- Kept as text (long IDs lose digits as numbers). It lets a later Conversions API event for this lead carry the
-- lead ID, so Meta matches it to the form lead instead of counting the person again.
alter table lead_forms add column if not exists meta_lead_id text;
create index if not exists lead_forms_meta_lead_id on lead_forms (meta_lead_id) where meta_lead_id is not null;
