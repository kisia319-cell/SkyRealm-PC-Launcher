create table if not exists public.skyrealm_cloud_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.skyrealm_cloud_saves enable row level security;
revoke all on public.skyrealm_cloud_saves from public, anon, authenticated;
grant all on public.skyrealm_cloud_saves to service_role;
