-- Two-party confirmation for ranked match results.
alter table public.prime_matches drop constraint if exists prime_matches_status_check;
alter table public.prime_matches add constraint prime_matches_status_check
  check (status in ('active','awaiting_confirmation','completed','cancelled','abandoned','disputed'));

create table if not exists public.prime_match_result_reports (
  match_id uuid not null references public.prime_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  winner_id uuid references auth.users(id) on delete set null,
  reason text not null default 'completed' check (reason in ('completed','abandoned')),
  created_at timestamptz not null default now(),
  primary key (match_id,user_id)
);
alter table public.prime_match_result_reports enable row level security;
revoke all on public.prime_match_result_reports from public,anon,authenticated;
grant all on public.prime_match_result_reports to service_role;
create index if not exists prime_result_reports_match_idx on public.prime_match_result_reports(match_id,created_at);

create or replace function public.prime_finish_match(
  p_match_id uuid,p_actor uuid,p_winner uuid,p_reason text default 'completed'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.prime_matches%rowtype;
  a public.prime_player_stats%rowtype;
  b public.prime_player_stats%rowtype;
  v_count integer;
  v_agree boolean;
  v_winner uuid;
  ea numeric;
  da integer;
  db integer;
begin
  select * into m from public.prime_matches where id=p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if p_actor is null or (p_actor<>m.user_a and p_actor<>m.user_b) then
    raise exception 'NOT_MATCH_MEMBER';
  end if;
  if m.status in ('completed','abandoned','disputed','cancelled') then
    return jsonb_build_object('status',m.status,'winner_id',m.winner_id,'result',m.result);
  end if;
  if p_winner is not null and p_winner not in (m.user_a,m.user_b) then
    raise exception 'INVALID_WINNER';
  end if;

  if p_reason='abandoned' then
    if (p_actor=m.user_a and p_winner is distinct from m.user_b)
       or (p_actor=m.user_b and p_winner is distinct from m.user_a) then
      raise exception 'INVALID_FORFEIT_WINNER';
    end if;
    insert into public.prime_player_stats(user_id) values(m.user_a),(m.user_b) on conflict(user_id) do nothing;
    select * into a from public.prime_player_stats where user_id=m.user_a for update;
    select * into b from public.prime_player_stats where user_id=m.user_b for update;
    ea:=1/(1+power(10::numeric,(b.rating-a.rating)/400.0));
    da:=round(32*((case when p_winner=m.user_a then 1 else 0 end)-ea))::integer;
    db:=-da;
    update public.prime_player_stats set rating=greatest(0,rating+da),matches=matches+1,
      wins=wins+(case when p_winner=m.user_a then 1 else 0 end),
      losses=losses+(case when p_winner=m.user_b then 1 else 0 end),updated_at=now()
      where user_id=m.user_a;
    update public.prime_player_stats set rating=greatest(0,rating+db),matches=matches+1,
      wins=wins+(case when p_winner=m.user_b then 1 else 0 end),
      losses=losses+(case when p_winner=m.user_a then 1 else 0 end),updated_at=now()
      where user_id=m.user_b;
    update public.prime_matches set status='abandoned',winner_id=p_winner,
      result=jsonb_build_object('winner_id',p_winner,'rating_delta_a',da,'rating_delta_b',db,'reason','abandoned','confirmed_by',p_actor),
      finished_at=now(),updated_at=now() where id=p_match_id;
    return jsonb_build_object('status','abandoned','winner_id',p_winner,'rating_delta_a',da,'rating_delta_b',db);
  end if;

  insert into public.prime_match_result_reports(match_id,user_id,winner_id,reason)
    values(p_match_id,p_actor,p_winner,'completed')
    on conflict(match_id,user_id) do nothing;

  select winner_id into v_winner
    from public.prime_match_result_reports
    where match_id=p_match_id order by created_at,user_id limit 1;
  select count(*),bool_and(r.winner_id is not distinct from v_winner)
    into v_count,v_agree from public.prime_match_result_reports r
    where r.match_id=p_match_id;

  if v_count<2 then
    update public.prime_matches set status='awaiting_confirmation',winner_id=v_winner,
      result=jsonb_build_object('status','awaiting_confirmation','proposed_winner',v_winner,'reason','completed'),
      updated_at=now() where id=p_match_id;
    return jsonb_build_object('status','awaiting_confirmation','winner_id',v_winner,'confirmed_reports',v_count);
  end if;

  if not coalesce(v_agree,false) then
    update public.prime_matches set status='disputed',winner_id=null,
      result=jsonb_build_object('status','disputed','reason','players_disagree','elo_changed',false),
      finished_at=now(),updated_at=now() where id=p_match_id;
    return jsonb_build_object('status','disputed','winner_id',null,'elo_changed',false);
  end if;

  insert into public.prime_player_stats(user_id) values(m.user_a),(m.user_b) on conflict(user_id) do nothing;
  select * into a from public.prime_player_stats where user_id=m.user_a for update;
  select * into b from public.prime_player_stats where user_id=m.user_b for update;
  ea:=1/(1+power(10::numeric,(b.rating-a.rating)/400.0));
  da:=case when v_winner is null then 0 else round(32*((case when v_winner=m.user_a then 1 else 0 end)-ea))::integer end;
  db:=-da;
  update public.prime_player_stats set rating=greatest(0,rating+da),matches=matches+1,
    wins=wins+(case when v_winner=m.user_a then 1 else 0 end),
    losses=losses+(case when v_winner=m.user_b then 1 else 0 end),updated_at=now()
    where user_id=m.user_a;
  update public.prime_player_stats set rating=greatest(0,rating+db),matches=matches+1,
    wins=wins+(case when v_winner=m.user_b then 1 else 0 end),
    losses=losses+(case when v_winner=m.user_a then 1 else 0 end),updated_at=now()
    where user_id=m.user_b;
  update public.prime_matches set status='completed',winner_id=v_winner,
    result=jsonb_build_object('winner_id',v_winner,'rating_delta_a',da,'rating_delta_b',db,'reason','completed','confirmed_reports',2),
    finished_at=now(),updated_at=now() where id=p_match_id;
  return jsonb_build_object('status','completed','winner_id',v_winner,'rating_delta_a',da,'rating_delta_b',db,'confirmed_reports',2);
end;
$$;
revoke all on function public.prime_finish_match(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prime_finish_match(uuid,uuid,uuid,text) to service_role;
