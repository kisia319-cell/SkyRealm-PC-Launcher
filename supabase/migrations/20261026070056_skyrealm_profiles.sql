-- SkyRealm Auth profile baseline reconstructed from the connected project's applied schema.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-zА-Яа-яЁё0-9_]{3,20}$')
);
alter table public.profiles enable row level security;

create or replace function public.handle_skyrealm_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_username text;
begin
  v_username := new.raw_user_meta_data ->> 'username';
  if v_username is null or v_username !~ '^[A-Za-zА-Яа-яЁё0-9_]{3,20}$' then
    raise exception 'SkyRealm username must contain 3-20 letters, numbers or underscores';
  end if;
  insert into public.profiles (id, username, email)
  values (new.id, v_username, new.email);
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created_skyrealm on auth.users;
create trigger on_auth_user_created_skyrealm
after insert on auth.users
for each row execute function public.handle_skyrealm_new_user();
