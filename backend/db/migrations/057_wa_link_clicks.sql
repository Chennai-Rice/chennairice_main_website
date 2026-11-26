-- 057 — Taps on the short links in WhatsApp template buttons (/w/<slug>), Nov 2026.
-- The page that opens records the tap, so the Spin reminder report can show who clicked (the slug carries
-- the prize code: spin-<CODE>). Nothing about the person is stored here: the code ties the tap to the spin.
create table if not exists wa_link_clicks (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  code        text,                         -- the Spin & Win code from spin-<CODE>, upper case, without hyphens
  clicked_at  timestamptz not null default now()
);
create index if not exists wa_link_clicks_code on wa_link_clicks (code, clicked_at);
create index if not exists wa_link_clicks_at on wa_link_clicks (clicked_at desc);
