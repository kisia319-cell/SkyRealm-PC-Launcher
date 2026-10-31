-- SkyRealm profile and social foundation. No existing player data is removed.
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_key text not null default 'wanderer',
  add column if not exists bio text not null default '',
  add column if not exists player_class text not null default 'ordinary',
  add column if not exists level integer not null default 1,
  add column if not exists experience bigint not null default 0,
  add column if not exists playtime_seconds bigint not null default 0,
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_avatar_key_check,
  add constraint profiles_avatar_key_check check (avatar_key in ('wanderer','warrior','mage','ranger','miner','farmer')),
  drop constraint if exists profiles_player_class_check,
  add constraint profiles_player_class_check check (player_class in ('swordsman','farmer','ordinary','archer','mage','miner','rich')),
  drop constraint if exists profiles_level_check,
  add constraint profiles_level_check check (level between 1 and 10000),
  drop constraint if exists profiles_experience_check,
  add constraint profiles_experience_check check (experience >= 0),
  drop constraint if exists profiles_playtime_check,
  add constraint profiles_playtime_check check (playtime_seconds >= 0),
  drop constraint if exists profiles_bio_check,
  add constraint profiles_bio_check check (char_length(bio) <= 160);

create table if not exists public.skyrealm_friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skyrealm_friendships_no_self check (user_a <> user_b),
  constraint skyrealm_friendships_order check (user_a < user_b),
  constraint skyrealm_friendships_pair_unique unique (user_a,user_b)
);
create index if not exists skyrealm_friendships_user_a_idx on public.skyrealm_friendships(user_a,status);
create index if not exists skyrealm_friendships_user_b_idx on public.skyrealm_friendships(user_b,status);
alter table public.skyrealm_friendships enable row level security;
revoke all on public.skyrealm_friendships from anon, authenticated;
grant all on public.skyrealm_friendships to service_role;

-- Keep profile data private by default; the social Edge Function is the only public API.
alter table public.profiles enable row level security;
