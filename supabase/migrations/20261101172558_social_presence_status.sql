-- Player-selectable social presence, separate from last_seen_at activity tracking.
alter table public.profiles
  add column if not exists presence_status text not null default 'online';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_presence_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_presence_status_check
      check (presence_status in ('online','away','dnd'));
  end if;
end $$;

comment on column public.profiles.presence_status is
  'Player-selected social presence: online, away, or dnd. Active co-op membership is displayed as in-game.';
