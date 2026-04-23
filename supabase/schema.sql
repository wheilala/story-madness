create table if not exists runs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null,
  stage text not null
);

create table if not exists moderation_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run_id uuid not null references runs(id) on delete cascade,
  stage text not null,
  decision text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists moderation_events_run_id_idx on moderation_events(run_id);
