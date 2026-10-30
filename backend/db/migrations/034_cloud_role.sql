-- A staff role for the Cloud Centre only (/cloud, Oct 2026): signs in with an email and
-- password and can open the Cloud Centre, nothing else (staff.js, 'cloud.view').
alter table staff_users drop constraint if exists staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'it', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse', 'accounts', 'cloud'));
