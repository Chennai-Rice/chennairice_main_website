-- 020 — "Accounts" staff role: the accounts team. Sees invoices, payments,
-- refunds and the GST totals in the staff panel; changes nothing.
alter table staff_users drop constraint staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'it', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse', 'accounts'));
