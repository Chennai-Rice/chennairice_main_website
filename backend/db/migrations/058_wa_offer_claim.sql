-- 058 — One WhatsApp offer a day per person, enforced in one step (Nov 2026).
-- Two broadcasts sending at the same moment both counted "nothing sent today" and both sent, so one customer
-- got the same spin reminder twice. Before a marketing message goes out the queue now claims the person here
-- (only if their last offer was over 20 hours ago); a second sender at the same moment finds the claim taken.
alter table wa_contacts add column if not exists last_offer_at timestamptz;
update wa_contacts c set last_offer_at = q.at
  from (select phone, max(sent_at) as at from wa_queue where status = 'sent' and category = 'marketing' group by phone) q
 where q.phone = c.phone and c.last_offer_at is null;
