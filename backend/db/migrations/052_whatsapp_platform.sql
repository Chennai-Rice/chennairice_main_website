-- WhatsApp platform, Phases 2–4 and 6 (/whatsappbot, Nov 2026).

-- Every WhatsApp contact: permission for offers (opt-in / STOP), tags, and the chat's state in the Inbox.
create table if not exists wa_contacts (
  phone          text primary key,            -- 10-digit Indian mobile, or the full number for others
  name           text,
  opted_in_at    timestamptz,                 -- said yes to offers on WhatsApp (checkout, spin form, START, import)
  opt_in_source  text,
  opted_out_at   timestamptz,                 -- replied STOP: no marketing messages
  tags           text[] not null default '{}',
  status         text not null default 'open' check (status in ('open', 'resolved')),
  assigned_to    uuid references staff_users(id) on delete set null,
  last_in_at     timestamptz,
  last_out_at    timestamptz,
  last_read_at   timestamptz,                 -- when the team last opened the chat (unread = messages after this)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists wa_contacts_last_in on wa_contacts (last_in_at desc nulls last);
create index if not exists wa_contacts_tags on wa_contacts using gin (tags);

-- Notes the team leaves on a chat (never sent to the customer).
create table if not exists wa_notes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  staff_id   uuid references staff_users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists wa_notes_phone on wa_notes (phone, created_at desc);

-- Saved answers for the Inbox ("/price" → the full text).
create table if not exists wa_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);

-- Broadcasts: one approved template to a segment of contacts, now or at a set time.
create table if not exists wa_broadcasts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  template_name text not null,
  language      text not null default 'en',
  segment       jsonb not null default '{}',
  mapping       jsonb not null default '{}',  -- where each {{n}} / button value comes from
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'done', 'cancelled')),
  scheduled_at  timestamptz,
  audience      int,
  created_by    uuid references staff_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Template messages waiting to go out: automations (spin, referral, restock…) and broadcasts.
-- ref makes each one happen once (e.g. 'spin_reminder:<spin id>').
create table if not exists wa_queue (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  template_name text not null,
  language      text not null default 'en',
  category      text,                          -- marketing / utility
  vals          jsonb not null default '{}',   -- { body: [...], buttons: { "0": "..." } }
  source        text not null,                 -- automation key, or 'broadcast'
  ref           text,
  broadcast_id  uuid references wa_broadcasts(id) on delete cascade,
  send_after    timestamptz not null default now(),
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  reason        text,
  wamid         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create unique index if not exists wa_queue_ref on wa_queue (ref) where ref is not null;
create index if not exists wa_queue_due on wa_queue (send_after) where status = 'queued';
create index if not exists wa_queue_broadcast on wa_queue (broadcast_id) where broadcast_id is not null;
create index if not exists wa_queue_phone on wa_queue (phone, sent_at desc);

-- Who sent a message from the Inbox, for the agent report.
create index if not exists wa_messages_staff on wa_messages (staff_id, created_at desc) where staff_id is not null;
