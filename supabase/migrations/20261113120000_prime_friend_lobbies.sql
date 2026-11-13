-- PrimeLauncher friend lobbies: secure, invite-only 1v1 rooms.
create table if not exists public.prime_lobbies (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'lobby' check(status in ('lobby','running','closed')),
 mode text not null default 'pvp' check(mode in ('pvp','bots')),
 max_players smallint not null default 2 check(max_players between 2 and 2),
 match_id uuid references public.prime_matches(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.prime_lobby_members (
 lobby_id uuid not null references public.prime_lobbies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'player' check(role in ('owner','player')),
 joined_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 primary key(lobby_id,user_id)
);
create unique index if not exists prime_lobby_one_active_per_user on public.prime_lobby_members(user_id);
create table if not exists public.prime_lobby_invites (
 id uuid primary key default gen_random_uuid(),
 lobby_id uuid not null references public.prime_lobbies(id) on delete cascade,
 inviter_id uuid not null references auth.users(id) on delete cascade,
 invitee_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '24 hours'),
 unique(lobby_id,invitee_id), check(inviter_id<>invitee_id)
);
create index if not exists prime_lobby_invites_inbox_idx on public.prime_lobby_invites(invitee_id,status,created_at desc);
alter table public.prime_lobbies enable row level security;
alter table public.prime_lobby_members enable row level security;
alter table public.prime_lobby_invites enable row level security;
revoke all on public.prime_lobbies,public.prime_lobby_members,public.prime_lobby_invites from public,anon,authenticated;
grant all on public.prime_lobbies,public.prime_lobby_members,public.prime_lobby_invites to service_role;