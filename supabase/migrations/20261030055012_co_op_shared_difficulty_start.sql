-- Shared co-op map difficulty and explicit owner start transition.
alter table public.co_op_rooms add column if not exists world_difficulty text not null default 'medium'
  check (world_difficulty in ('easy','medium','hard','hell','impossible'));
alter table public.co_op_audit_events drop constraint if exists co_op_audit_events_event_type_check;
alter table public.co_op_audit_events add constraint co_op_audit_events_event_type_check
  check (event_type in ('room_created','room_started','member_joined','member_left','owner_paused','owner_resumed','pvp_changed','owner_timeout_paused'));

create or replace function public.create_co_op_room_with_settings(p_owner_id uuid,p_code_hash text,p_world_difficulty text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.co_op_rooms%rowtype;
begin
 if p_owner_id is null or coalesce(p_code_hash,'') !~ '^[0-9a-f]{64}$' then raise exception using message='INVALID_ROOM_REQUEST'; end if;
 if p_world_difficulty not in ('easy','medium','hard','hell','impossible') then raise exception using message='INVALID_WORLD_DIFFICULTY'; end if;
 if exists(select 1 from public.co_op_members m where m.user_id=p_owner_id and m.member_status in ('active','offline')) then raise exception using message='ALREADY_IN_ROOM'; end if;
 insert into public.co_op_rooms(owner_id,invite_code_hash,max_players,death_mode,pvp_enabled,world_difficulty)
  values(p_owner_id,p_code_hash,8,'shared',false,p_world_difficulty) returning * into v_room;
 insert into public.co_op_members(room_id,user_id,role,member_status) values(v_room.id,p_owner_id,'owner','active');
 insert into public.co_op_world_snapshots(room_id,version,payload,saved_by) values(v_room.id,0,'{}'::jsonb,p_owner_id);
 insert into public.co_op_audit_events(room_id,actor_id,event_type) values(v_room.id,p_owner_id,'room_created');
 return jsonb_build_object('id',v_room.id,'owner_id',v_room.owner_id,'status',v_room.status,
  'max_players',v_room.max_players,'death_mode',v_room.death_mode,'pvp_enabled',v_room.pvp_enabled,
  'world_difficulty',v_room.world_difficulty,'created_at',v_room.created_at);
end;$$;

create or replace function public.start_co_op_room(p_user_id uuid,p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.co_op_rooms%rowtype;
begin
 select * into v_room from public.co_op_rooms where id=p_room_id for update;
 if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
 if v_room.owner_id<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
 if v_room.status<>'lobby' then raise exception using message='ROOM_NOT_IN_LOBBY'; end if;
 if not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then raise exception using message='NOT_A_MEMBER'; end if;
 update public.co_op_rooms set status='running',updated_at=now() where id=p_room_id;
 insert into public.co_op_audit_events(room_id,actor_id,event_type) values(p_room_id,p_user_id,'room_started');
 return jsonb_build_object('id',p_room_id,'status','running','world_difficulty',v_room.world_difficulty,
  'max_players',v_room.max_players,'death_mode',v_room.death_mode,'pvp_enabled',v_room.pvp_enabled);
end;$$;

create or replace function public.get_my_co_op_room(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room_id uuid; v_result jsonb;
begin
 select room_id into v_room_id from public.co_op_members
 where user_id=p_user_id and member_status in ('active','offline') order by joined_at desc limit 1;
 if v_room_id is null then return null; end if;
 select jsonb_build_object(
  'id',r.id,'owner_id',r.owner_id,'status',r.status,'max_players',r.max_players,
  'death_mode',r.death_mode,'pvp_enabled',r.pvp_enabled,'world_difficulty',r.world_difficulty,
  'pause_reason',r.pause_reason,'paused_from_status',r.paused_from_status,'created_at',r.created_at,
  'members',coalesce((
   select jsonb_agg(jsonb_build_object('user_id',m.user_id,'username',p.username,'role',m.role,
    'status',m.member_status,'last_seen_at',m.last_seen_at) order by m.joined_at)
   from public.co_op_members m left join public.profiles p on p.id=m.user_id
   where m.room_id=r.id and m.member_status in ('active','offline')
  ),'[]'::jsonb)
 ) into v_result from public.co_op_rooms r where r.id=v_room_id;
 return v_result;
end;$$;

revoke all on function public.create_co_op_room_with_settings(uuid,text,text) from public,anon,authenticated;
revoke all on function public.start_co_op_room(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_my_co_op_room(uuid) from public,anon,authenticated;
grant execute on function public.create_co_op_room_with_settings(uuid,text,text) to service_role;
grant execute on function public.start_co_op_room(uuid,uuid) to service_role;
grant execute on function public.get_my_co_op_room(uuid) to service_role;
