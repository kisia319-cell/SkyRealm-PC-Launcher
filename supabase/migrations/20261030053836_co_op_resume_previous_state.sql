-- Preserve the lifecycle state before owner departure so a lobby resumes as a lobby.
alter table public.co_op_rooms
  add column if not exists paused_from_status text
  check (paused_from_status is null or paused_from_status in ('lobby','running'));

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
    if v_room.status <> 'closed' then
      update public.co_op_rooms
        set paused_from_status = case when status in ('lobby','running') then status else 'lobby' end,
            status = 'paused', pause_reason = 'owner_left', updated_at = now()
        where id = p_room_id;
    end if;
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
  v_resume_status text;
begin
  select * into v_room from public.co_op_rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.owner_id <> p_user_id then raise exception using message = 'OWNER_ONLY'; end if;
  if v_room.status <> 'paused' then raise exception using message = 'ROOM_NOT_PAUSED'; end if;
  if exists (
    select 1 from public.co_op_members m
    where m.user_id = p_user_id and m.member_status = 'active' and m.room_id <> p_room_id
  ) then raise exception using message = 'ALREADY_IN_ROOM'; end if;

  v_resume_status := coalesce(v_room.paused_from_status,'running');
  update public.co_op_rooms
    set status = v_resume_status, paused_from_status = null,
        pause_reason = null, updated_at = now()
    where id = p_room_id;
  update public.co_op_members
    set member_status = 'active', last_seen_at = now()
    where room_id = p_room_id and user_id = p_user_id;
  insert into public.co_op_audit_events(room_id,actor_id,event_type)
    values (p_room_id,p_user_id,'owner_resumed');
  return jsonb_build_object('id',p_room_id,'status',v_resume_status);
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
  ) then raise exception using message = 'NOT_A_MEMBER'; end if;
  if v_room.status <> 'running' then
    return jsonb_build_object('id',p_room_id,'status',v_room.status,'paused_now',false);
  end if;

  select last_seen_at into v_owner_seen
  from public.co_op_members
  where room_id = p_room_id and user_id = v_room.owner_id
  for update;

  if v_owner_seen is not null and v_owner_seen < now() - interval '30 seconds' then
    update public.co_op_members set member_status = 'offline'
      where room_id = p_room_id and user_id = v_room.owner_id;
    update public.co_op_rooms
      set status = 'paused', paused_from_status = 'running',
          pause_reason = 'owner_timeout', updated_at = now()
      where id = p_room_id;
    insert into public.co_op_audit_events(room_id,actor_id,event_type)
      values (p_room_id,p_user_id,'owner_timeout_paused');
    return jsonb_build_object('id',p_room_id,'status','paused','reason','owner_timeout','paused_now',true);
  end if;
  return jsonb_build_object('id',p_room_id,'status',v_room.status,'paused_now',false);
end;
$$;
