create table if not exists public.skyrealm_community_mods (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  description text not null check (char_length(description) between 10 and 180),
  category text not null check (category in ('Выживание','Бой','Исследование','Фермерство','Добыча')),
  icon text not null check (icon in ('🧩','⚔️','🛡️','⛏️','🌱','🍀','🔥','🎣')),
  effect_key text not null check (effect_key in ('damage','defense','speed','hunger','mining','farming')),
  effect_strength integer not null check (effect_strength between 1 and 10),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists skyrealm_community_mods_published_created_idx on public.skyrealm_community_mods(status, created_at desc);
create index if not exists skyrealm_community_mods_creator_created_idx on public.skyrealm_community_mods(creator_id, created_at desc);
alter table public.skyrealm_community_mods enable row level security;
revoke all on public.skyrealm_community_mods from anon, authenticated;
grant all on public.skyrealm_community_mods to service_role;
