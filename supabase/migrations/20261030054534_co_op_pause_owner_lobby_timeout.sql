-- Pause a room on owner timeout even when the owner left before the world started.
create or replace function public.recover_stale_co_op_owner(p_user_id uuid,p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.co_op_rooms%rowtype;
  v_owner_seen timestamptz;
begin
  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if not exists(
    select 1 from public.co_op_members m
    where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active'
  ) then raise exception using message='NOT_A_MEMBER'; end if;

  if v_room.status not in ('lobby','running') then
    return jsonb_build_object('id',p_room_id,'status',v_room.status,'paused_now',false);
  end if;

  select last_seen_at into v_owner_seen
  from public.co_op_members
  where room_id=p_room_id and user_id=v_room.owner_id
  for update;

  if v_owner_seen is not null and v_owner_seen < now()-interval '30 seconds' then
    update public.co_op_members set member_status='offline'
      where room_id=p_room_id and user_id=v_room.owner_id;
    update public.co_op_rooms
      set status='paused',paused_from_status=v_room.status,
          pause_reason='owner_timeout',updated_at=now()
      where id=p_room_id;
    insert into public.co_op_audit_events(room_id,actor_id,event_type)
      values(p_room_id,p_user_id,'owner_timeout_paused');
    return jsonb_build_object(
      'id',p_room_id,'status','paused','reason','owner_timeout',
      'paused_from_status',v_room.status,'paused_now',true
    );
  end if;
  return jsonb_build_object('id',p_room_id,'status',v_room.status,'paused_now',false);
end;
$$;
