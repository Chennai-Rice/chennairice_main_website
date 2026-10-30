-- Cloud Centre (/admin, Oct 2026), Phase 1: what the Google APIs cannot tell us.
--
-- api_usage: calls to the website's API per route and hour (India time), counted
-- by the server itself (api-usage.js), so there are no logs to keep. Kept 90 days.
create table if not exists api_usage (
  day date not null,
  hour smallint not null,
  route text not null,
  method text not null,
  calls integer not null default 0,
  errors integer not null default 0,     -- 5xx answers
  rejected integer not null default 0,   -- 4xx answers (bad input, not signed in, rate limits)
  total_ms bigint not null default 0,
  max_ms integer not null default 0,
  primary key (day, hour, route, method)
);

-- job_runs: every run of the 10-minute background job (salesJobs) with what it
-- did, or the error it stopped on. Kept 90 days.
create table if not exists job_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  ms integer,
  ok boolean not null default false,
  result jsonb,
  error text
);
create index if not exists job_runs_job_started on job_runs (job, started_at desc);
