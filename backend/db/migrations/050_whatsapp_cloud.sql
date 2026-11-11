-- WhatsApp dashboard (/whatsapp, Nov 2026): our own WhatsApp platform on Meta's WhatsApp Cloud API,
-- in place of AskEva. Phase 1: templates (drafts, submitted, Meta's verdict), every message we send or
-- receive with its delivery status, and every webhook call from Meta.

-- Message templates: our drafts and everything in the WhatsApp Business Account (synced from Meta).
create table if not exists wa_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                 -- lowercase_with_underscores, as Meta wants
  language        text not null default 'en',
  category        text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  kind            text not null default 'standard' check (kind in ('standard', 'coupon')),
  components      jsonb not null,                -- Meta's components array (header, body, footer, buttons) with examples
  status          text not null default 'DRAFT', -- DRAFT, PENDING, APPROVED, REJECTED, PAUSED, DISABLED, IN_APPEAL…
  meta_id         text,                          -- Meta's template id once submitted
  rejected_reason text,
  quality         text,                          -- GREEN / YELLOW / RED / UNKNOWN
  purpose         text,                          -- what it is for, shown in the list ("Spin & Win: code right after the spin")
  submitted_at    timestamptz,
  synced_at       timestamptz,
  created_by      uuid references staff_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (name, language)
);

-- Every message through the Cloud API, both ways.
create table if not exists wa_messages (
  id            uuid primary key default gen_random_uuid(),
  wamid         text unique,                     -- Meta's message id
  direction     text not null check (direction in ('in', 'out')),
  phone         text not null,                   -- the customer: 10-digit Indian mobile, or the full number
  kind          text not null default 'text',    -- text, template, image, document, button, interactive…
  template_name text,
  category      text,                            -- marketing / utility / service (from Meta's pricing info)
  body          text,                            -- a readable copy of what was said
  payload       jsonb,
  status        text not null default 'sent',    -- out: queued, sent, delivered, read, failed; in: received
  error         text,
  billable      boolean,
  source        text,                            -- what sent it: order_placed, test, dashboard, spin_code…
  staff_id      uuid references staff_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  status_at     timestamptz not null default now()
);
create index if not exists wa_messages_phone on wa_messages (phone, created_at desc);
create index if not exists wa_messages_created on wa_messages (created_at desc);

-- Every webhook call from Meta as it came (kept 90 days), for checking and replaying.
create table if not exists wa_events (
  id          bigserial primary key,
  field       text,
  payload     jsonb not null,
  handled     boolean not null default false,
  error       text,
  received_at timestamptz not null default now()
);
create index if not exists wa_events_received on wa_events (received_at desc);

-- The order-placed message can now go through either AskEva or the Cloud API (whatsapp_outbox.via).
alter table whatsapp_outbox add column if not exists via text;
alter table whatsapp_outbox add column if not exists wamid text;
