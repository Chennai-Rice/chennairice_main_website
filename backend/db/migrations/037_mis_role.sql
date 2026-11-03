-- A staff role for the MIS dashboard (Nov 2026): signs in at /admin with an email and password and sees the
-- leads dashboard built from the MIS Google Sheet, and nothing else (staff.js, 'mis.view').
alter table staff_users drop constraint if exists staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'it', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse', 'accounts', 'cloud', 'blog', 'mis'));
