-- One shared death event is recorded per room; all active members apply their existing difficulty penalties.
alter table public.co_op_rooms
  add column if not exists world_death_sequence bigint not null default 0 check (world_death_sequence >= 0),
  add column if not exists world_death_by uuid references auth.users(id) on delete set null,
  add column if not exists world_death_at timestamptz;

alter table public.co_op_audit_events drop constraint if exists co_op_audit_events_event_type_check;
alter table public.co_op_audit_events add constraint co_op_audit_events_event_type_check
  check (event_type in ('room_created','room_started','member_joined','member_left','owner_paused','owner_resumed','pvp_changed','owner_timeout_paused','shared_death'));

create or replace function public.record_co_op_shared_death(p_user_id uuid,p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.co_op_rooms%rowtype;
begin
  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
  if not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then
    raise exception using message='NOT_A_MEMBER';
  end if;
  if v_room.world_death_at is not null and v_room.world_death_at>now()-interval '4 seconds' then
    return jsonb_build_object('room_id',p_room_id,'sequence',v_room.world_death_sequence,
      'by_user_id',v_room.world_death_by,'occurred_at',v_room.world_death_at,'deduplicated',true);
  end if;
  update public.co_op_rooms set world_death_sequence=world_death_sequence+1,
    world_death_by=p_user_id,world_death_at=now(),updated_at=now()
    where id=p_room_id
    returning world_death_sequence,world_death_at into v_room.world_death_sequence,v_room.world_death_at;
  v_room.world_death_by:=p_user_id;
  insert into public.co_op_audit_events(room_id,actor_id,event_type,details)
    values(p_room_id,p_user_id,'shared_death',jsonb_build_object('sequence',v_room.world_death_sequence));
  return jsonb_build_object('room_id',p_room_id,'sequence',v_room.world_death_sequence,
    'by_user_id',p_user_id,'occurred_at',v_room.world_death_at,'deduplicated',false);
end;$$;

create or replace function public.get_my_co_op_room(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room_id uuid; v_result jsonb;
begin
  select room_id into v_room_id from public.co_op_members
    where user_id=p_user_id and member_status in ('active','offline')
    order by joined_at desc limit 1;
  if v_room_id is null then return null; end if;
  select jsonb_build_object(
    'id',r.id,'owner_id',r.owner_id,'status',r.status,'max_players',r.max_players,
    'death_mode',r.death_mode,'pvp_enabled',r.pvp_enabled,'world_difficulty',r.world_difficulty,
    'pause_reason',r.pause_reason,'paused_from_status',r.paused_from_status,
    'world_clock_minute',r.world_clock_minute,'world_survived_nights',r.world_survived_nights,
    'world_blood_moon_active',r.world_blood_moon_active,'world_clock_updated_at',r.world_clock_updated_at,
    'world_death_sequence',r.world_death_sequence,'world_death_by',r.world_death_by,'world_death_at',r.world_death_at,
    'created_at',r.created_at,
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'username',p.username,
      'role',m.role,'status',m.member_status,'last_seen_at',m.last_seen_at) order by m.joined_at)
      from public.co_op_members m left join public.profiles p on p.id=m.user_id
      where m.room_id=r.id and m.member_status in ('active','offline')),'[]'::jsonb)
  ) into v_result from public.co_op_rooms r where r.id=v_room_id;
  return v_result;
end;$$;

revoke all on function public.record_co_op_shared_death(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_my_co_op_room(uuid) from public,anon,authenticated;
grant execute on function public.record_co_op_shared_death(uuid,uuid) to service_role;
grant execute on function public.get_my_co_op_room(uuid) to service_role;
