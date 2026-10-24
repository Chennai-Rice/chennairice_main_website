-- Invoice phone number (owner, 24 Oct 2026): only 70666 46667, in place of
-- 04242555556, 8012501262, 8012501251 — for new invoices (company settings)
-- and on invoices already issued, which keep a copy of the seller details.
update company_settings set value = '70666 46667', updated_at = now()
 where key = 'seller_phone' and value = '04242555556, 8012501262, 8012501251';

update invoices set seller = jsonb_set(seller, '{phone}', '"70666 46667"')
 where seller->>'phone' = '04242555556, 8012501262, 8012501251';
