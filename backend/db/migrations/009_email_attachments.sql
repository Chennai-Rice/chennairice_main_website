-- 009 — Email attachments. Attachments are described, not stored: e.g.
-- [{"kind": "invoice", "orderId": "…"}] is turned into the invoice PDF at the
-- moment the email is sent, from the invoice record itself.
alter table email_outbox add column attachments jsonb not null default '[]'::jsonb;
