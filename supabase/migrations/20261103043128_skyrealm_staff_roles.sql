-- SkyRealm staff roles: server-only authorization source.
-- No client (anon/authenticated) can read or change this table.
create table if not exists public.skyrealm_staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skyrealm_staff_roles_active_role_idx
  on public.skyrealm_staff_roles(role, is_active);

alter table public.skyrealm_staff_roles enable row level security;
alter table public.skyrealm_staff_roles force row level security;

revoke all on table public.skyrealm_staff_roles from public, anon, authenticated;
grant select, insert, update, delete on table public.skyrealm_staff_roles to service_role;

comment on table public.skyrealm_staff_roles is
  'Private staff authorization records. Access only through the skyrealm-staff Edge Function using the service role.';

-- Bootstrap the original project-owner profile as the initial administrator.
-- The migration fails closed if the expected profile is missing or ambiguous.
do $bootstrap$
declare
  v_owner_id uuid;
  v_owner_count integer;
begin
  select count(*), min(id::text)::uuid
    into v_owner_count, v_owner_id
    from public.profiles
   where lower(username) = 'kisia';

  if v_owner_count <> 1 or v_owner_id is null then
    raise exception 'Expected exactly one original SkyRealm owner profile named kisia; found %', v_owner_count;
  end if;

  insert into public.skyrealm_staff_roles (user_id, role, is_active, granted_by)
  values (v_owner_id, 'admin', true, v_owner_id)
  on conflict (user_id) do update
    set role = 'admin',
        is_active = true,
        granted_by = excluded.granted_by,
        updated_at = now();
end
$bootstrap$;

[executed on device: DESKTOP-J3FNV3N (393b286a-047d-423b-ad40-4dc164e17a6c)]