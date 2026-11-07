-- Public, downloadable SkyRealm mod releases. Script packages are validated on upload and never auto-executed by the catalog.
create table if not exists public.skyrealm_mod_releases (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  creator_name text not null default 'Игрок' check (char_length(creator_name) between 1 and 24),
  mod_id text not null check (mod_id ~ '^[a-z0-9][a-z0-9._:-]{1,127}$'),
  name text not null check (char_length(name) between 1 and 48),
  description text not null check (char_length(description) between 10 and 500),
  version text not null check (char_length(version) between 1 and 40),
  game_version text not null default '0.20.50.90' check (char_length(game_version) <= 40),
  language text not null check (language in ('javascript','python')),
  category text not null default 'other' check (category in ('adventure','building','combat','interface','resources','other')),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  downloads bigint not null default 0 check (downloads >= 0),
  status text not null default 'published' check (status in ('published','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, mod_id, version)
);

create index if not exists skyrealm_mod_releases_public_idx
  on public.skyrealm_mod_releases (created_at desc) where status = 'published';
create index if not exists skyrealm_mod_releases_search_idx
  on public.skyrealm_mod_releases using gin (to_tsvector('simple', name || ' ' || description));

alter table public.skyrealm_mod_releases enable row level security;
revoke all on public.skyrealm_mod_releases from anon, authenticated;
grant select on public.skyrealm_mod_releases to anon, authenticated;
grant all on public.skyrealm_mod_releases to service_role;

drop policy if exists skyrealm_mod_releases_public_read on public.skyrealm_mod_releases;
create policy skyrealm_mod_releases_public_read on public.skyrealm_mod_releases
  for select to anon, authenticated using (status = 'published');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('skyrealm-community-mods', 'skyrealm-community-mods', true, 20971520, array['application/zip','application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
