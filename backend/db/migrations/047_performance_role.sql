-- A staff role for the performance / marketing person (Nov 2026): /admin → Analyst, Business Advisor,
-- Checkout journeys, Reports and Ad campaigns (staff.js 'analyst.view' and 'money.view'). No orders, stock,
-- settings or team.
alter table staff_users drop constraint if exists staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('owner', 'admin', 'it', 'sales', 'inventory', 'plant', 'dispatch', 'warehouse', 'accounts', 'cloud', 'blog', 'mis', 'performance'));
