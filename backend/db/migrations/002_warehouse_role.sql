-- 002 — a "warehouse" staff role: the people at the mill who confirm and pack
-- orders from the /warehouse page. Same access as everyone else to view, plus
-- the confirm and pack steps (see PERMISSIONS in lib/sales/staff.js).
alter table staff_users drop constraint staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse'));
