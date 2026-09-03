-- THRU production persistence contract (PostgreSQL 15+).
create table if not exists users (
  id uuid primary key, email text not null unique, display_name text not null,
  role text not null check (role in ('user','operator','service')),
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  id uuid primary key, user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique, scopes text[] not null default '{run}', expires_at timestamptz not null, revoked_at timestamptz,
  last_used_at timestamptz
);
alter table sessions add column if not exists scopes text[] not null default '{run}';
alter table sessions add column if not exists created_at timestamptz not null default now();
alter table sessions add column if not exists last_used_at timestamptz;
create table if not exists api_keys (
  id uuid primary key, user_id uuid not null references users(id) on delete cascade,
  name text not null, hash text not null unique, scopes text[] not null default '{run}',
  created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);
alter table api_keys alter column id type text using id::text;
create table if not exists skills (
  id text primary key, owner_id uuid references users(id), visibility text not null default 'public',
  state text not null default 'draft', created_at timestamptz not null default now()
);
create table if not exists skill_versions (
  skill_id text not null references skills(id) on delete cascade, version integer not null,
  artifact jsonb not null, created_at timestamptz not null default now(),
  primary key (skill_id, version)
);
create table if not exists runs (
  id uuid primary key, skill_id text not null references skills(id), version integer not null,
  user_id uuid references users(id), state text not null, idempotency_key text,
  inputs jsonb, result jsonb, error text, created_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz, attempt_count integer not null default 0,
  unique (skill_id, idempotency_key)
);
alter table runs alter column version set default 1;
alter table runs add column if not exists lease_owner text;
alter table runs add column if not exists lease_expires_at timestamptz;
alter table runs add column if not exists heartbeat_at timestamptz;
alter table runs add column if not exists cancel_requested boolean not null default false;
alter table runs add column if not exists attempt_count integer not null default 0;
create table if not exists run_events (
  id bigserial primary key, run_id uuid not null references runs(id) on delete cascade,
  type text not null, payload jsonb, created_at timestamptz not null default now()
);
create table if not exists teaching_sessions (
  id uuid primary key, user_id uuid not null references users(id), goal_text text not null,
  start_url text not null, state text not null, actions jsonb not null default '[]',
  artifact jsonb, expires_at timestamptz not null, created_at timestamptz not null default now()
);
alter table teaching_sessions add column if not exists sample_inputs jsonb not null default '{}';
alter table teaching_sessions add column if not exists validation_error text;
alter table teaching_sessions add column if not exists replay jsonb;
alter table teaching_sessions add column if not exists events jsonb not null default '[]';
create table if not exists approvals (
  id uuid primary key, run_id uuid references runs(id) on delete cascade,
  approver_id uuid not null references users(id), decision text not null, note text, created_at timestamptz not null default now()
);
alter table approvals add column if not exists note text;
create table if not exists healing_attempts (
  id uuid primary key, run_id uuid references runs(id) on delete cascade, skill_id text not null,
  from_version integer, to_version integer, evidence jsonb not null, outcome text not null,
  created_at timestamptz not null default now()
);
create index if not exists run_events_run_idx on run_events(run_id, created_at);
create index if not exists runs_created_idx on runs(created_at desc);
alter table runs drop constraint if exists runs_skill_id_idempotency_key_key;
create unique index if not exists runs_skill_id_idempotency_user_idx on runs(skill_id, idempotency_key, user_id) where idempotency_key is not null;
