-- WebTalk AI: Initial Schema
-- Multi-tenant isolation via client_id on every row
-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- CLIENTS
-- ============================================================
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  email           text not null,
  website_url     text not null default '',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index clients_owner_user_id_idx on clients(owner_user_id);

-- ============================================================
-- API KEYS  (widget authentication)
-- ============================================================
create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  name          text not null,
  key_hash      text not null unique,
  key_prefix    text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index api_keys_client_id_idx on api_keys(client_id);
create index api_keys_key_hash_idx  on api_keys(key_hash);

-- ============================================================
-- TRAINING JOBS
-- ============================================================
create table if not exists training_jobs (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  website_url     text not null,
  max_pages       integer not null default 50,
  status          text not null default 'pending'
                    check (status in ('pending','running','completed','failed')),
  pages_crawled   integer not null default 0,
  pages_total     integer not null default 0,
  error_message   text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index training_jobs_client_id_idx on training_jobs(client_id);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  session_id  text not null,
  messages    jsonb not null default '[]',
  channel     text not null default 'text' check (channel in ('text','voice')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index conversations_client_id_idx   on conversations(client_id);
create index conversations_session_id_idx  on conversations(session_id);
create index conversations_created_at_idx  on conversations(created_at desc);

-- ============================================================
-- ANALYTICS EVENTS
-- ============================================================
create table if not exists analytics (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  session_id        text,
  event_type        text not null,
  channel           text,
  response_time_ms  integer,
  metadata          jsonb default '{}',
  created_at        timestamptz not null default now()
);

create index analytics_client_id_idx  on analytics(client_id);
create index analytics_created_at_idx on analytics(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table clients       enable row level security;
alter table api_keys      enable row level security;
alter table training_jobs enable row level security;
alter table conversations enable row level security;
alter table analytics     enable row level security;

-- Clients: owners see/edit only their own record
create policy "clients: owner access"
  on clients for all
  using (owner_user_id = auth.uid());

-- API Keys: client owner sees their keys
create policy "api_keys: client owner access"
  on api_keys for all
  using (client_id in (select id from clients where owner_user_id = auth.uid()));

-- Training jobs: scoped to client owner
create policy "training_jobs: client owner access"
  on training_jobs for all
  using (client_id in (select id from clients where owner_user_id = auth.uid()));

-- Conversations: scoped to client owner
create policy "conversations: client owner access"
  on conversations for all
  using (client_id in (select id from clients where owner_user_id = auth.uid()));

-- Analytics: scoped to client owner
create policy "analytics: client owner access"
  on analytics for all
  using (client_id in (select id from clients where owner_user_id = auth.uid()));

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at
  before update on clients
  for each row execute function update_updated_at();

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();
