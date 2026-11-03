alter table public.skyrealm_staff_roles
  add column if not exists expires_at timestamptz;

create index if not exists skyrealm_staff_roles_active_expiry_idx
  on public.skyrealm_staff_roles (is_active, expires_at);

create table if not exists public.skyrealm_staff_settings (
  id boolean primary key default true check (id = true),
  public_grants_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.skyrealm_staff_settings enable row level security;
revoke all on table public.skyrealm_staff_settings from anon, authenticated;
revoke all on table public.skyrealm_staff_roles from anon, authenticated;

insert into public.skyrealm_staff_settings (id, public_grants_enabled)
values (true, true)
on conflict (id) do nothing;
