-- 061 — The WhatsApp bot's language per chat (owner, 26 Nov 2026): 'en' or 'ta', chosen on the first message.
-- Null = not chosen yet (the bot asks English / தமிழ் first).
alter table wa_bot_state add column if not exists lang text;
