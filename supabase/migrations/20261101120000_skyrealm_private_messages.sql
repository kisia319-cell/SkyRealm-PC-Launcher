create table if not exists public.skyrealm_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint skyrealm_messages_no_self check (sender_id <> recipient_id)
);
create index if not exists skyrealm_messages_thread_idx
  on public.skyrealm_messages (sender_id, recipient_id, created_at desc);
create index if not exists skyrealm_messages_inbox_idx
  on public.skyrealm_messages (recipient_id, created_at desc);
alter table public.skyrealm_messages enable row level security;
revoke all on public.skyrealm_messages from anon, authenticated;
grant all on public.skyrealm_messages to service_role;
drop policy if exists skyrealm_messages_no_direct_client_access on public.skyrealm_messages;
create policy skyrealm_messages_no_direct_client_access on public.skyrealm_messages
  for all to anon, authenticated using (false) with check (false);