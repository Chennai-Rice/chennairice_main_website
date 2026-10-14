-- 017 — Where orders come from. Each order keeps the ad tags of the visit
-- it came from (utm_*, Meta fbclid, Google gclid, referring site) and the
-- source worked out from them, so sales can be split by Meta ad (Facebook /
-- Instagram), Google Ads, unpaid social or search, WhatsApp, other sites and
-- direct visits — down to the individual campaign and ad.
alter table orders
  add column attribution jsonb,
  add column traffic_source text,
  add column traffic_campaign text,
  add column traffic_ad text;
create index orders_traffic_source on orders (traffic_source, placed_at);

-- Landings from a tagged link or another site, counted per day, source,
-- campaign and ad. Only counts: no visitor, cookie or address is stored, so
-- it runs for every visitor whatever their cookie choice.
create table traffic_visits (
  day       date not null,
  source    text not null,
  campaign  text not null default '',
  ad        text not null default '',
  visits    int not null default 0,
  primary key (day, source, campaign, ad)
);
