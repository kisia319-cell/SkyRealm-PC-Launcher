-- Persist the team format selected when a private online lobby is created.
alter table public.prime_lobbies
  add column if not exists team_size smallint not null default 1
  check (team_size between 1 and 3);
