create or replace function public.create_co_op_room(p_owner_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.co_op_rooms%rowtype;
begin
  if p_owner_id is null or coalesce(p_code_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'INVALID_ROOM_REQUEST';
  end if;
  if exists (
    select 1 from public.co_op_members m
    where m.user_id = p_owner_id and m.member_status in ('active','offline')
  ) then
    raise exception using message = 'ALREADY_IN_ROOM';
  end if;

  insert into public.co_op_rooms(owner_id,invite_code_hash,max_players,death_mode,pvp_enabled)
  values (p_owner_id,p_code_hash,8,'shared',false)
  returning * into v_room;

  insert into public.co_op_members(room_id,user_id,role,member_status)
  values (v_room.id,p_owner_id,'owner','active');

  insert into public.co_op_world_snapshots(room_id,version,payload,saved_by)
  values (v_room.id,0,'{}'::jsonb,p_owner_id);

  insert into public.co_op_audit_events(room_id,actor_id,event_type)
  values (v_room.id,p_owner_id,'room_created');

  return jsonb_build_object(
    'id',v_room.id,'owner_id',v_room.owner_id,'status',v_room.status,
    'max_players',v_room.max_players,'death_mode',v_room.death_mode,
    'pvp_enabled',v_room.pvp_enabled,'created_at',v_room.created_at
  );
end;
$$;

create or replace function public.join_co_op_room(p_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.co_op_rooms%rowtype;
  v_attempts integer;
  v_count integer;
  v_existing_status text;
begin
  if p_user_id is null or coalesce(p_code_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'INVALID_INVITE_CODE';
  end if;

  insert into private.co_op_join_limits(user_id,window_started_at,attempts)
  values (p_user_id,now(),1)
  on conflict (user_id) do update
    set attempts = case
          when private.co_op_join_limits.window_started_at < now() - interval '15 minutes' then 1
          else private.co_op_join_limits.attempts + 1
        end,
        window_started_at = case
          when private.co_op_join_limits.window_started_at < now() - interval '15 minutes' then now()
          else private.co_op_join_limits.window_started_at
        end
  returning attempts into v_attempts;

  if v_attempts > 8 then
    raise exception using message = 'JOIN_RATE_LIMITED';
  end if;

  select * into v_room
  from public.co_op_rooms
  where invite_code_hash = p_code_hash
  for update;

  if not found then
    raise exception using message = 'INVALID_INVITE_CODE';
  end if;
  if v_room.status in ('paused','closed') then
    raise exception using message = 'ROOM_NOT_JOINABLE';
  end if;

  select m.member_status into v_existing_status
  from public.co_op_members m
  where m.room_id = v_room.id and m.user_id = p_user_id;

  if v_existing_status = 'active' then
    return jsonb_build_object(
      'id',v_room.id,'owner_id',v_room.owner_id,'status',v_room.status,
      'max_players',v_room.max_players,'death_mode',v_room.death_mode,
      'pvp_enabled',v_room.pvp_enabled,'already_member',true
    );
  end if;

  if exists (
    select 1 from public.co_op_members m
    where m.user_id = p_user_id and m.member_status in ('active','offline')
      and m.room_id <> v_room.id
  ) then
    raise exception using message = 'ALREADY_IN_ROOM';
  end if;

  select count(*) into v_count
  from public.co_op_members m
  where m.room_id = v_room.id and m.member_status in ('active','offline');

  if v_count >= v_room.max_players then
    raise exception using message = 'ROOM_FULL';
  end if;

  insert into public.co_op_members(room_id,user_id,role,member_status,joined_at,last_seen_at)
  values (v_room.id,p_user_id,case when p_user_id = v_room.owner_id then 'owner' else 'player' end,'active',now(),now())
  on conflict (room_id,user_id) do update
    set member_status = 'active', last_seen_at = now();

  insert into public.co_op_audit_events(room_id,actor_id,event_type)
  values (v_room.id,p_user_id,'member_joined');

  return jsonb_build_object(
    'id',v_room.id,'owner_id',v_room.owner_id,'status',v_room.status,
    'max_players',v_room.max_players,'death_mode',v_room.death_mode,
    'pvp_enabled',v_room.pvp_enabled,'already_member',false
  );
end;
$$;

create or replace function public.leave_co_op_room(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.co_op_rooms%rowtype;
begin
  select * into v_room from public.co_op_rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.co_op_members m
    where m.room_id = p_room_id and m.user_id = p_user_id
      and m.member_status in ('active','offline')
  ) then
    raise exception using message = 'NOT_A_MEMBER';
  end if;

  if v_room.owner_id = p_user_id then
    update public.co_op_rooms
      set status = 'paused', pause_reason = 'owner_left', updated_at = now()
      where id = p_room_id and status <> 'closed';
    update public.co_op_members
      set member_status = 'offline', last_seen_at = now()
      where room_id = p_room_id and user_id = p_user_id;
    insert into public.co_op_audit_events(room_id,actor_id,event_type)
      values (p_room_id,p_user_id,'owner_paused');
    return jsonb_build_object('id',p_room_id,'status','paused','reason','owner_left');
  end if;

  update public.co_op_members
    set member_status = 'left', last_seen_at = now()
    where room_id = p_room_id and user_id = p_user_id;
  insert into public.co_op_audit_events(room_id,actor_id,event_type)
    values (p_room_id,p_user_id,'member_left');
  return jsonb_build_object('id',p_room_id,'status',v_room.status,'left',true);
end;
$$;

create or replace function public.resume_co_op_room(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.co_op_rooms%rowtype;
begin
  select * into v_room from public.co_op_rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.owner_id <> p_user_id then raise exception using message = 'OWNER_ONLY'; end if;
  if v_room.status <> 'paused' then raise exception using message = 'ROOM_NOT_PAUSED'; end if;
  if exists (
    select 1 from public.co_op_members m
    where m.user_id = p_user_id and m.member_status = 'active' and m.room_id <> p_room_id
  ) then
    raise exception using message = 'ALREADY_IN_ROOM';
  end if;

  update public.co_op_rooms
    set status = 'running', pause_reason = null, updated_at = now()
    where id = p_room_id;
  update public.co_op_members
    set member_status = 'active', last_seen_at = now()
    where room_id = p_room_id and user_id = p_user_id;
  insert into public.co_op_audit_events(room_id,actor_id,event_type)
    values (p_room_id,p_user_id,'owner_resumed');
  return jsonb_build_object('id',p_room_id,'status','running');
end;
$$;

create or replace function public.set_co_op_pvp(p_user_id uuid, p_room_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.co_op_rooms%rowtype;
begin
  select * into v_room from public.co_op_rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.owner_id <> p_user_id then raise exception using message = 'OWNER_ONLY'; end if;
  if v_room.status = 'closed' then raise exception using message = 'ROOM_NOT_FOUND'; end if;

  update public.co_op_rooms
    set pvp_enabled = p_enabled, updated_at = now()
    where id = p_room_id;
  insert into public.co_op_audit_events(room_id,actor_id,event_type,details)
    values (p_room_id,p_user_id,'pvp_changed',jsonb_build_object('enabled',p_enabled));
  return jsonb_build_object('id',p_room_id,'pvp_enabled',p_enabled);
end;
$$;

create or replace function public.touch_co_op_heartbeat(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.co_op_members
    set last_seen_at = now()
    where room_id = p_room_id and user_id = p_user_id
      and member_status = 'active';
  if not found then raise exception using message = 'NOT_A_MEMBER'; end if;
  return jsonb_build_object('id',p_room_id,'heartbeat_at',now());
end;
$$;

create or replace function public.recover_stale_co_op_owner(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.co_op_rooms%rowtype;
  v_owner_seen timestamptz;
begin
  select * into v_room from public.co_op_rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.co_op_members m
    where m.room_id = p_room_id and m.user_id = p_user_id and m.member_status = 'active'
  ) then
    raise exception using message = 'NOT_A_MEMBER';
  end if;
  if v_room.status <> 'running' then
    return jsonb_build_object('id',p_room_id,'status',v_room.status,'paused_now',false);
  end if;

  select last_seen_at into v_owner_seen
  from public.co_op_members
  where room_id = p_room_id and user_id = v_room.owner_id
  for update;

  if v_owner_seen is not null and v_owner_seen < now() - interval '30 seconds' then
    update public.co_op_members
      set member_status = 'offline'
      where room_id = p_room_id and user_id = v_room.owner_id;
    update public.co_op_rooms
      set status = 'paused', pause_reason = 'owner_timeout', updated_at = now()
      where id = p_room_id;
    insert into public.co_op_audit_events(room_id,actor_id,event_type)
      values (p_room_id,p_user_id,'owner_timeout_paused');
    return jsonb_build_object('id',p_room_id,'status','paused','reason','owner_timeout','paused_now',true);
  end if;

  return jsonb_build_object('id',p_room_id,'status',v_room.status,'paused_now',false);
end;
$$;

create or replace function public.get_my_co_op_room(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_result jsonb;
begin
  select room_id into v_room_id
  from public.co_op_members
  where user_id = p_user_id and member_status in ('active','offline')
  order by joined_at desc limit 1;
  if v_room_id is null then return null; end if;

  select jsonb_build_object(
    'id',r.id,'owner_id',r.owner_id,'status',r.status,'max_players',r.max_players,
    'death_mode',r.death_mode,'pvp_enabled',r.pvp_enabled,'pause_reason',r.pause_reason,
    'created_at',r.created_at,
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,'username',p.username,'role',m.role,
        'status',m.member_status,'last_seen_at',m.last_seen_at
      ) order by m.joined_at)
      from public.co_op_members m
      left join public.profiles p on p.id = m.user_id
      where m.room_id = r.id and m.member_status in ('active','offline')
    ),'[]'::jsonb)
  ) into v_result
  from public.co_op_rooms r where r.id = v_room_id;
  return v_result;
end;
$$;

create or replace function private.is_co_op_member_for_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_topic like 'skyrealm:room:%'
    and exists (
      select 1
      from public.co_op_members m
      join public.co_op_rooms r on r.id = m.room_id
      where m.user_id = (select auth.uid())
        and m.member_status in ('active','offline')
        and m.room_id::text = substring(p_topic from 15)
        and r.status <> 'closed'
    ),
    false
  );
$$;

create or replace function private.is_co_op_active_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_topic like 'skyrealm:room:%'
    and exists (
      select 1
      from public.co_op_members m
      join public.co_op_rooms r on r.id = m.room_id
      where m.user_id = (select auth.uid())
        and m.member_status = 'active'
        and m.room_id::text = substring(p_topic from 15)
        and r.status in ('lobby','running')
    ),
    false
  );
$$;

revoke all on function public.create_co_op_room(uuid,text) from public, anon, authenticated;
revoke all on function public.join_co_op_room(uuid,text) from public, anon, authenticated;
revoke all on function public.leave_co_op_room(uuid,uuid) from public, anon, authenticated;
revoke all on function public.resume_co_op_room(uuid,uuid) from public, anon, authenticated;
revoke all on function public.set_co_op_pvp(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.touch_co_op_heartbeat(uuid,uuid) from public, anon, authenticated;
revoke all on function public.recover_stale_co_op_owner(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_my_co_op_room(uuid) from public, anon, authenticated;
grant execute on function public.create_co_op_room(uuid,text) to service_role;
grant execute on function public.join_co_op_room(uuid,text) to service_role;
grant execute on function public.leave_co_op_room(uuid,uuid) to service_role;
grant execute on function public.resume_co_op_room(uuid,uuid) to service_role;
grant execute on function public.set_co_op_pvp(uuid,uuid,boolean) to service_role;
grant execute on function public.touch_co_op_heartbeat(uuid,uuid) to service_role;
grant execute on function public.recover_stale_co_op_owner(uuid,uuid) to service_role;
grant execute on function public.get_my_co_op_room(uuid) to service_role;

revoke all on function private.is_co_op_member_for_topic(text) from public, anon;
revoke all on function private.is_co_op_active_topic(text) from public, anon;
grant execute on function private.is_co_op_member_for_topic(text) to authenticated;
grant execute on function private.is_co_op_active_topic(text) to authenticated;

drop policy if exists "SkyRealm co-op members read room channels" on realtime.messages;
drop policy if exists "SkyRealm co-op members send room channels" on realtime.messages;
create policy "SkyRealm co-op members read room channels"
  on realtime.messages for select to authenticated
  using (
    extension in ('broadcast','presence')
    and (select private.is_co_op_member_for_topic((select realtime.topic())))
  );
create policy "SkyRealm co-op members send room channels"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('broadcast','presence')
    and (select private.is_co_op_active_topic((select realtime.topic())))
  );
