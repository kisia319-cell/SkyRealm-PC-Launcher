-- Single-roundtrip authoritative Prime match transport.
-- Only the skyrealm-prime Edge Function's service_role may invoke these RPCs.
create or replace function public.prime_host_publish(
  p_match_id uuid,
  p_user_id uuid,
  p_seq bigint,
  p_state jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.prime_matches%rowtype;
  finish_result jsonb;
  next_seq bigint;
begin
  select * into m from public.prime_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.user_a <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if m.status <> 'active' then
    return jsonb_build_object('status',m.status,'winner_id',m.winner_id,'result',m.result);
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'INVALID_STATE';
  end if;
  if m.guest_seen_at is not null and now()-m.guest_seen_at > interval '45 seconds' then
    finish_result := public.prime_finish_match(m.id,m.user_a,m.user_a,'abandoned');
    return jsonb_build_object('ok',true,'status','abandoned','winner_id',m.user_a,'result',finish_result);
  end if;
  next_seq := greatest(m.host_seq + 1, coalesce(p_seq,0));
  update public.prime_matches
     set host_state=p_state,host_seq=next_seq,host_seen_at=now(),updated_at=now()
   where id=m.id;
  return jsonb_build_object('ok',true,'status','active','seq',next_seq,
    'guest_input',m.guest_input,'guest_seq',m.guest_seq);
end;
$$;

create or replace function public.prime_guest_exchange(
  p_match_id uuid,
  p_user_id uuid,
  p_seq bigint,
  p_input jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.prime_matches%rowtype;
  finish_result jsonb;
  next_seq bigint;
begin
  select * into m from public.prime_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.user_b <> p_user_id then raise exception 'GUEST_ONLY'; end if;
  if m.status <> 'active' then
    return jsonb_build_object('status',m.status,'winner_id',m.winner_id,'result',m.result,'host_seq',m.host_seq);
  end if;
  if m.host_seen_at is not null and now()-m.host_seen_at > interval '45 seconds' then
    finish_result := public.prime_finish_match(m.id,m.user_a,m.user_b,'abandoned');
    return jsonb_build_object('status','abandoned','winner_id',m.user_b,'result',finish_result,'host_seq',m.host_seq);
  end if;
  next_seq := greatest(m.guest_seq + 1, coalesce(p_seq,0));
  update public.prime_matches
     set guest_input=p_input,guest_seq=next_seq,guest_seen_at=now(),updated_at=now()
   where id=m.id;
  return jsonb_build_object('ok',true,'status','active','host_state',m.host_state,
    'host_seq',m.host_seq,'guest_seq',next_seq,'winner_id',m.winner_id,'result',m.result,'updated_at',m.updated_at);
end;
$$;

revoke all on function public.prime_host_publish(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.prime_guest_exchange(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.prime_host_publish(uuid,uuid,bigint,jsonb) to service_role;
grant execute on function public.prime_guest_exchange(uuid,uuid,bigint,jsonb) to service_role;
