-- Invitations from accepted SkyRealm friends into an existing co-op room.
create table if not exists public.skyrealm_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.co_op_rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint skyrealm_room_invites_no_self check (inviter_id <> invitee_id),
  constraint skyrealm_room_invites_pair_unique unique (room_id, invitee_id)
);
create index if not exists skyrealm_room_invites_inbox_idx
  on public.skyrealm_room_invites(invitee_id, status, created_at desc);
create index if not exists skyrealm_room_invites_outbox_idx
  on public.skyrealm_room_invites(inviter_id, status, created_at desc);
alter table public.skyrealm_room_invites enable row level security;
revoke all on public.skyrealm_room_invites from anon, authenticated;
grant all on public.skyrealm_room_invites to service_role;
