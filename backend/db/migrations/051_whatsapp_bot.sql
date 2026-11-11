-- WhatsApp bot (/whatsappbot → Bot, Nov 2026): what the bot is waiting for in each chat (an order number,
-- a PIN code) and when a person has taken the chat over (the bot stays quiet until paused_until).
-- The bot's own settings (welcome menu, menu items, keywords, replies) are one JSON in company_settings ('wa_bot').
create table if not exists wa_bot_state (
  phone         text primary key,
  awaiting      text,                 -- 'order_number' | 'pincode' | null
  awaiting_at   timestamptz,
  paused_until  timestamptz,          -- "talk to a person": no bot replies until then
  last_reply_at timestamptz,
  replies_today int not null default 0,
  day           date,
  updated_at    timestamptz not null default now()
);
