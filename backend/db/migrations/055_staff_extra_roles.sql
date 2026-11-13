-- 055 — A team member can have more than one role: the main role plus extra roles (Warehouse → Team).
-- They may do whatever any of their roles allows (staff.js can()).
alter table staff_users add column if not exists extra_roles text[] not null default '{}';
