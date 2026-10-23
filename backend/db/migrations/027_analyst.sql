-- Analyst dashboard (Sales Dashboard KPIs, Oct 2026).
--
-- 1. Every product gets a rice type, so sales split Raw / Idli / Boiled.
--    Special Idly Rice starts as Idli and the rest as Boiled; the owner and
--    IT team correct any that are wrong from the Analyst page.
-- 2. Ad spend is entered by hand (date, platform, campaign, ad, amount), so
--    cost per lead, cost per order, ROAS and the best/worst ads can be worked
--    out against the website's own leads and orders.
-- 3. The monthly kg target lives in company_settings (analyst_monthly_kg_target).

alter table products
  add column if not exists rice_type text not null default 'boiled'
    check (rice_type in ('raw', 'idli', 'boiled'));

update products set rice_type = 'idli' where slug = 'special-idly-rice';

create table if not exists ad_spend (
  id            uuid primary key default gen_random_uuid(),
  spent_on      date not null,
  platform      text not null default 'meta' check (platform in ('meta', 'google', 'other')),
  campaign      text not null,
  ad            text not null default '',
  amount_paise  bigint not null check (amount_paise > 0),
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists ad_spend_day on ad_spend (spent_on);
