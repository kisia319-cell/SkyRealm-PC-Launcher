-- PrimeLauncher 1v1 matchmaking and authoritative match transport.
-- Existing SkyRealm profiles, saves, and co-op tables are untouched.
create table if not exists public.prime_match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1000 check (rating between 0 and 100000),
  queued_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists prime_match_queue_waiting_idx on public.prime_match_queue(queued_at, rating);

create table if not exists public.prime_player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1000 check (rating between 0 and 100000),
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.prime_matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete restrict,
  user_b uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','completed','cancelled','abandoned')),
  seed bigint not null,
  host_state jsonb not null default '{}'::jsonb,
  host_seq bigint not null default 0,
  guest_input jsonb not null default '{}'::jsonb,
  guest_seq bigint not null default 0,
  winner_id uuid references auth.users(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint prime_match_no_self check (user_a <> user_b)
);
create index if not exists prime_matches_user_a_active_idx on public.prime_matches(user_a,status);
create index if not exists prime_matches_user_b_active_idx on public.prime_matches(user_b,status);
create unique index if not exists prime_one_active_match_a on public.prime_matches(user_a) where status='active';
create unique index if not exists prime_one_active_match_b on public.prime_matches(user_b) where status='active';

alter table public.prime_match_queue enable row level security;
alter table public.prime_player_stats enable row level security;
alter table public.prime_matches enable row level security;
revoke all on public.prime_match_queue,public.prime_player_stats,public.prime_matches from public,anon,authenticated;
grant all on public.prime_match_queue,public.prime_player_stats,public.prime_matches to service_role;

create or replace function public.prime_join_queue(p_user_id uuid,p_rating integer default 1000)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_existing public.prime_matches%rowtype; v_opponent public.prime_match_queue%rowtype; v_id uuid; v_seed bigint;
begin
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('prime-1v1-global-queue'));
  select * into v_existing from public.prime_matches m where m.status='active' and (m.user_a=p_user_id or m.user_b=p_user_id) limit 1;
  if found then return jsonb_build_object('status','matched','match_id',v_existing.id,'role',case when v_existing.user_a=p_user_id then 'host' else 'guest' end,'opponent_id',case when v_existing.user_a=p_user_id then v_existing.user_b else v_existing.user_a end,'seed',v_existing.seed); end if;
  delete from public.prime_match_queue q where q.queued_at < now()-interval '3 minutes';
  insert into public.prime_player_stats(user_id) values(p_user_id) on conflict(user_id) do nothing;
  insert into public.prime_match_queue(user_id,rating,queued_at,last_seen_at)
  values(p_user_id,greatest(0,least(100000,coalesce(p_rating,1000))),now(),now())
  on conflict(user_id) do update set rating=excluded.rating,last_seen_at=now();
  select * into v_opponent from public.prime_match_queue q
    where q.user_id<>p_user_id
      and abs(q.rating-greatest(0,least(100000,coalesce(p_rating,1000)))) <= 250
    order by q.queued_at asc
    for update skip locked limit 1;
  if not found then return jsonb_build_object('status','waiting'); end if;
  delete from public.prime_match_queue where user_id in (p_user_id,v_opponent.user_id);
  v_seed:=floor(extract(epoch from clock_timestamp())*1000)::bigint + (random()*1000000)::bigint;
  insert into public.prime_matches(user_a,user_b,seed,started_at)
    values(v_opponent.user_id,p_user_id,v_seed,now()) returning id into v_id;
  return jsonb_build_object('status','matched','match_id',v_id,'role','guest','opponent_id',v_opponent.user_id,'seed',v_seed);
end $$;
revoke all on function public.prime_join_queue(uuid,integer) from public,anon,authenticated;
grant execute on function public.prime_join_queue(uuid,integer) to service_role;

create or replace function public.prime_finish_match(p_match_id uuid,p_actor uuid,p_winner uuid,p_reason text default 'completed')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare m public.prime_matches%rowtype; a public.prime_player_stats%rowtype; b public.prime_player_stats%rowtype; ea numeric; eb numeric; da integer; db integer;
begin
  select * into m from public.prime_matches where id=p_match_id for update;
  if not found or m.user_a<>p_actor then raise exception 'NOT_MATCH_HOST'; end if;
  if m.status<>'active' then return jsonb_build_object('status',m.status,'result',m.result); end if;
  if p_winner is not null and p_winner not in (m.user_a,m.user_b) then raise exception 'INVALID_WINNER'; end if;
  insert into public.prime_player_stats(user_id) values(m.user_a),(m.user_b) on conflict(user_id) do nothing;
  select * into a from public.prime_player_stats where user_id=m.user_a for update;
  select * into b from public.prime_player_stats where user_id=m.user_b for update;
  ea:=1/(1+power(10::numeric,(b.rating-a.rating)/400.0));
  eb:=1-ea;
  da:=case when p_winner is null then 0 else round(32*((case when p_winner=m.user_a then 1 else 0 end)-ea))::integer end;
  db:=-da;
  update public.prime_player_stats set rating=greatest(0,rating+da),matches=matches+1,wins=wins+(case when p_winner=m.user_a then 1 else 0 end),losses=losses+(case when p_winner=m.user_b then 1 else 0 end),updated_at=now() where user_id=m.user_a;
  update public.prime_player_stats set rating=greatest(0,rating+db),matches=matches+1,wins=wins+(case when p_winner=m.user_b then 1 else 0 end),losses=losses+(case when p_winner=m.user_a then 1 else 0 end),updated_at=now() where user_id=m.user_b;
  update public.prime_matches set status=case when p_reason='abandoned' then 'abandoned' else 'completed' end,winner_id=p_winner,result=jsonb_build_object('winner_id',p_winner,'rating_delta_a',da,'rating_delta_b',db,'reason',p_reason),finished_at=now(),updated_at=now() where id=p_match_id;
  return jsonb_build_object('status','completed','rating_delta_a',da,'rating_delta_b',db);
end $$;
revoke all on function public.prime_finish_match(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prime_finish_match(uuid,uuid,uuid,text) to service_role;
