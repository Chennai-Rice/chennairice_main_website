-- 010 — Delayed emails. An order dispatched with the one-tap switch has no
-- courier or AWB yet; its "shipped" email waits (send_after) so the tracking
-- from the courier's sheet can be added to it before it goes out.
alter table email_outbox add column send_after timestamptz;
