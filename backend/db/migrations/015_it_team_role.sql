-- 015 — "IT Team" staff role: the website's technical team. Same access as
-- Admin plus company settings; adding or removing owners stays with owners.
alter table staff_users drop constraint staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'it', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse'));
