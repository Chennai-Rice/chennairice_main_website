-- 006 — Returns & Issues: problems reported on an order (damaged bags, wrong
-- quantity, a return request, a failed delivery...), logged by staff from a
-- call or a visit, and worked through to a resolution.
create table order_issues (
  id            uuid primary key default gen_random_uuid(),
  issue_no      bigint generated always as identity unique,   -- shown as ISS-000123
  order_id      uuid not null references orders (id),
  type          text not null check (type in (
                  'damaged', 'incorrect_quantity', 'wrong_product', 'return_request',
                  'delivery_failed', 'quality', 'other')),
  description   text not null check (length(description) between 1 and 2000),
  status        text not null default 'open' check (status in ('open', 'under_review', 'resolved')),
  resolution    text,
  created_by    uuid references staff_users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create trigger order_issues_updated before update on order_issues
  for each row execute function set_updated_at();
create index order_issues_status on order_issues (status, created_at desc);
create index order_issues_order on order_issues (order_id);

-- Every change to an issue, with who made it: the issue's history.
create table issue_events (
  id           bigint generated always as identity primary key,
  issue_id     uuid not null references order_issues (id) on delete cascade,
  from_status  text,
  to_status    text,
  note         text,
  staff_id     uuid references staff_users (id),
  created_at   timestamptz not null default now()
);
create index issue_events_issue on issue_events (issue_id, created_at);

-- Deliveries page: shipments by status and expected date ("delayed").
create index shipments_status_expected on shipments (status, expected_delivery);
