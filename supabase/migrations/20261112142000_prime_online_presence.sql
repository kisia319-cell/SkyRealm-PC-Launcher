-- Track each side independently so abandoned ranked duels can be resolved safely.
alter table public.prime_matches
  add column if not exists host_seen_at timestamptz not null default now(),
  add column if not exists guest_seen_at timestamptz not null default now();
create index if not exists prime_matches_active_seen_idx
  on public.prime_matches(status,host_seen_at,guest_seen_at);
