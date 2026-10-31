-- The blog writer's own email-and-password login (Oct 2026): no Firebase for writers. The password is kept
-- only as a salted scrypt hash; after repeated wrong passwords the account is locked for a while
-- (writer-login.js). Only staff with the 'blog' role can sign in this way.
alter table staff_users add column if not exists password_hash text;
alter table staff_users add column if not exists login_failures integer not null default 0;
alter table staff_users add column if not exists locked_until timestamptz;
