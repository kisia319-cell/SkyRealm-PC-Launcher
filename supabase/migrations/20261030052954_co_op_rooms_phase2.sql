-- SkyRealm co-op phase 2: isolated room metadata and secure room operations.
-- Solo-game tables and local saves are intentionally untouched.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table if not exists public.co_op_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  invite_code_hash text not null unique check (invite_code_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'lobby' check (status in ('lobby','running','paused','closed')),
  max_players smallint not null default 8 check (max_players between 2 and 8),
  death_mode text not null default 'shared' check (death_mode = 'shared'),
  pvp_enabled boolean not null default false,
  pause_reason text check (pause_reason is null or pause_reason in ('owner_left','owner_timeout','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.co_op_members (
  room_id uuid not null references public.co_op_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','player')),
  member_status text not null default 'active' check (member_status in ('active','offline','left')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create unique index if not exists co_op_one_active_room_per_user
  on public.co_op_members(user_id)
  where member_status = 'active';
create index if not exists co_op_members_room_status_idx
  on public.co_op_members(room_id,member_status);
create index if not exists co_op_rooms_owner_status_idx
  on public.co_op_rooms(owner_id,status);

create table if not exists public.co_op_world_snapshots (
  room_id uuid primary key references public.co_op_rooms(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  payload jsonb not null default '{}'::jsonb,
  saved_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.co_op_audit_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.co_op_rooms(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('room_created','member_joined','member_left','owner_paused','owner_resumed','pvp_changed','owner_timeout_paused')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists co_op_audit_room_created_idx
  on public.co_op_audit_events(room_id,created_at desc);

create table if not exists private.co_op_join_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

alter table public.co_op_rooms enable row level security;
alter table public.co_op_members enable row level security;
alter table public.co_op_world_snapshots enable row level security;
alter table public.co_op_audit_events enable row level security;
alter table private.co_op_join_limits enable row level security;

-- All authoritative room/world mutations are performed by the dedicated Edge Function.
revoke all on public.co_op_rooms, public.co_op_members, public.co_op_world_snapshots, public.co_op_audit_events from public, anon, authenticated;
revoke all on private.co_op_join_limits from public, anon, authenticated;
grant all on public.co_op_rooms, public.co_op_members, public.co_op_world_snapshots, public.co_op_audit_events to service_role;
grant all on private.co_op_join_limits to service_role;
grant usage, select on sequence public.co_op_audit_events_id_seq to service_role;
