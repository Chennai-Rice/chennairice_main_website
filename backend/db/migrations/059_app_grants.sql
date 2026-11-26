-- 059 — The website's own login (chennairice_app) can use every table and sequence, whoever created them
-- (Nov 2026: migrations run as an admin user, since the app login may not create tables). Safe to run again;
-- does nothing where that login does not exist (local and test databases).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'chennairice_app') then
    grant usage on schema public to chennairice_app;
    grant select, insert, update, delete on all tables in schema public to chennairice_app;
    grant usage, select, update on all sequences in schema public to chennairice_app;
    alter default privileges in schema public grant select, insert, update, delete on tables to chennairice_app;
    alter default privileges in schema public grant usage, select, update on sequences to chennairice_app;
  end if;
end $$;
