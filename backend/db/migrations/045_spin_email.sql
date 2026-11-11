-- Spin & Win form (Nov 2026 design): email and mobile number; the name is optional.
alter table spins add column if not exists email text;
alter table spins alter column name drop not null;
