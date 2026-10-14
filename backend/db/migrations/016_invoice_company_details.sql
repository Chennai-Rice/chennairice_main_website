-- 016 — Company details printed on invoices, as on the company's own Tax
-- Invoice / Bill of Supply (Oct 2026). Editable later in company_settings.
insert into company_settings (key, value) values
  ('seller_legal_name', 'CHENNAI RICE INDUSTRIES INDIA (P) LTD.,'),
  ('seller_former_name', 'Chennai Gate Rice Industries (P) Ltd.'),
  ('seller_address', '116/1/2,4B, N.Thayirpalayam Village, Chittode Via, Gangapuram Post, Erode-638102.'),
  ('seller_fssai', '12415007000253'),
  ('seller_gstin', '33AAFCC1691K1ZM'),
  ('seller_state', 'Tamil Nadu'),
  ('seller_state_code', '33'),
  ('seller_phone', '04242555556, 8012501262, 8012501251'),
  ('seller_email', 'cgriceindustries@gmail.com'),
  ('bank_name', 'Bank of Maharashtra, CC A/c'),
  ('bank_account', '60440715045'),
  ('bank_branch_ifsc', 'Tirupur & MAHB0002448')
on conflict (key) do update set value = excluded.value, updated_at = now();
