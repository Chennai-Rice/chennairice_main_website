-- 008 — Email sending claim. The sender (right after payment, and the
-- scheduled job) can run at the same moment; each claims the messages it
-- sends for a short while so no customer gets the same email twice.
alter table email_outbox add column locked_until timestamptz;
