-- Expire abandoned queue entries by heartbeat, not total waiting time.
create or replace function public.prime_join_queue(p_user_id uuid,p_rating integer default 1000)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_existing public.prime_matches%rowtype; v_opponent public.prime_match_queue%rowtype; v_id uuid; v_seed bigint;
begin
 if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtext('prime-1v1-global-queue'));
 select * into v_existing from public.prime_matches m where m.status='active' and (m.user_a=p_user_id or m.user_b=p_user_id) limit 1;
 if found then return jsonb_build_object('status','matched','match_id',v_existing.id,'role',case when v_existing.user_a=p_user_id then 'host' else 'guest' end,'opponent_id',case when v_existing.user_a=p_user_id then v_existing.user_b else v_existing.user_a end,'seed',v_existing.seed); end if;
 delete from public.prime_match_queue q where q.last_seen_at < now()-interval '45 seconds';
 insert into public.prime_player_stats(user_id) values(p_user_id) on conflict(user_id) do nothing;
 insert into public.prime_match_queue(user_id,rating,queued_at,last_seen_at) values(p_user_id,greatest(0,least(100000,coalesce(p_rating,1000))),now(),now()) on conflict(user_id) do update set rating=excluded.rating,last_seen_at=now();
 select * into v_opponent from public.prime_match_queue q where q.user_id<>p_user_id and abs(q.rating-greatest(0,least(100000,coalesce(p_rating,1000))))<=250 order by q.queued_at asc for update skip locked limit 1;
 if not found then return jsonb_build_object('status','waiting'); end if;
 delete from public.prime_match_queue where user_id in (p_user_id,v_opponent.user_id);
 v_seed:=floor(extract(epoch from clock_timestamp())*1000)::bigint+(random()*1000000)::bigint;
 insert into public.prime_matches(user_a,user_b,seed,started_at) values(v_opponent.user_id,p_user_id,v_seed,now()) returning id into v_id;
 return jsonb_build_object('status','matched','match_id',v_id,'role','guest','opponent_id',v_opponent.user_id,'seed',v_seed);
end $$;
revoke all on function public.prime_join_queue(uuid,integer) from public,anon,authenticated;
grant execute on function public.prime_join_queue(uuid,integer) to service_role;
