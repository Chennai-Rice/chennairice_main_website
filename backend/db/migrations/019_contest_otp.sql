-- 019 — Mobile OTP (MSG91) for the contest sign-up shown to ad visitors.
-- Each OTP sent is logged so one number cannot be sent endless SMS; a
-- sign-up records whether its mobile number was verified by OTP.
create table contest_otp_requests (
  id          bigint generated always as identity primary key,
  phone       text not null,
  ip          text,
  kind        text not null default 'send' check (kind in ('send', 'resend')),
  created_at  timestamptz not null default now()
);
create index contest_otp_requests_phone on contest_otp_requests (phone, created_at desc);

alter table contest_leads add column phone_verified boolean not null default false;
