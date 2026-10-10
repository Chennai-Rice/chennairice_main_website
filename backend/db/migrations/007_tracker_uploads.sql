-- 007 — Product tracker uploads: the courier's spreadsheet of order IDs,
-- tracking links / AWB numbers and delivery partner names. Each upload that
-- is applied is recorded with what it changed, so the team can see who
-- uploaded what and when.
create table tracker_uploads (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null,
  rows_total   int not null,
  dispatched   int not null default 0,   -- orders marked dispatched by this upload
  updated      int not null default 0,   -- shipments whose courier / tracking changed
  unchanged    int not null default 0,
  skipped      int not null default 0,   -- rows that could not be applied
  partners     text[] not null default '{}',
  staff_id     uuid references staff_users (id),
  created_at   timestamptz not null default now()
);
create index tracker_uploads_created on tracker_uploads (created_at desc);
