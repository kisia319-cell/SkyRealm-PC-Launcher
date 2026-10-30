create or replace function public.enqueue_co_op_world_action(
  p_user_id uuid,p_room_id uuid,p_action_id uuid,p_action_type text,p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_room public.co_op_rooms%rowtype;
  v_existing public.co_op_world_actions%rowtype;
  v_attempts integer;
  v_pending integer;
  v_type text;
  v_x numeric;
  v_y numeric;
  v_allowed_keys text[];
  v_rock_index numeric;
  v_tool text;
  v_inserted public.co_op_world_actions%rowtype;
begin
  if p_user_id is null or p_room_id is null or p_action_id is null
     or p_action_type not in ('place_structure','farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest','mine_rock')
     or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>1024 then
    raise exception using message='INVALID_WORLD_ACTION';
  end if;

  if p_action_type='mine_rock' then
    if (p_payload - array['rock_index','tool']::text[]) <> '{}'::jsonb
       or jsonb_typeof(p_payload->'rock_index') is distinct from 'number'
       or jsonb_typeof(p_payload->'tool') is distinct from 'string' then
      raise exception using message='INVALID_WORLD_ACTION';
    end if;
    v_rock_index:=(p_payload->>'rock_index')::numeric;
    v_tool:=p_payload->>'tool';
    if v_rock_index<0 or v_rock_index>64 or v_rock_index<>trunc(v_rock_index)
       or v_tool not in ('Кирка','Улучшенная кирка','Кирка мастера') then
      raise exception using message='INVALID_WORLD_ACTION';
    end if;
  else
    v_allowed_keys:=case when p_action_type='place_structure' then array['type','x','y']::text[]
      when p_action_type='farm_plant' then array['x','y','crop_id']::text[] else array['x','y']::text[] end;
    if exists(select 1 from jsonb_object_keys(p_payload) as provided(key) where provided.key<>all(v_allowed_keys))
       or jsonb_typeof(p_payload->'x') is distinct from 'number'
       or jsonb_typeof(p_payload->'y') is distinct from 'number' then
      raise exception using message='INVALID_WORLD_ACTION';
    end if;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    if v_x<0 or v_x>12000 or v_y<0 or v_y>10000
       or abs(v_x-(round((v_x-16)/32)*32+16))>1
       or abs(v_y-(round((v_y-16)/32)*32+16))>1 then
      raise exception using message='INVALID_WORLD_ACTION';
    end if;
    if p_action_type='place_structure' then
      v_type:=p_payload->>'type';
      if jsonb_typeof(p_payload->'type') is distinct from 'string'
         or v_type not in ('furnace','house','torch','coal','storage','farmplot') then
        raise exception using message='INVALID_WORLD_ACTION';
      end if;
    elsif p_action_type='farm_plant' then
      if jsonb_typeof(p_payload->'crop_id') is distinct from 'string'
         or p_payload->>'crop_id' not in ('wheat','carrot','potato','tomato','corn','pumpkin','strawberry') then
        raise exception using message='INVALID_WORLD_ACTION';
      end if;
    end if;
  end if;

  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
  if v_room.owner_id=p_user_id or not exists(select 1 from public.co_op_members m
    where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then
    raise exception using message='NOT_A_GUEST_MEMBER';
  end if;
  select * into v_existing from public.co_op_world_actions where room_id=p_room_id and action_id=p_action_id;
  if found then
    if v_existing.actor_id<>p_user_id then raise exception using message='WORLD_ACTION_ID_CONFLICT'; end if;
    return jsonb_build_object('id',v_existing.id,'action_id',v_existing.action_id,'action_type',v_existing.action_type,
      'status',v_existing.status,'created_at',v_existing.created_at,'result',v_existing.result,'duplicate',true);
  end if;
  insert into private.co_op_world_action_limits(user_id,window_started_at,attempts) values(p_user_id,now(),1)
  on conflict(user_id) do update set
    attempts=case when private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' then 1
      else private.co_op_world_action_limits.attempts+1 end,
    window_started_at=case when private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' then now()
      else private.co_op_world_action_limits.window_started_at end
  returning attempts into v_attempts;
  if v_attempts>20 then raise exception using message='WORLD_ACTION_RATE_LIMITED'; end if;
  select count(*) into v_pending from public.co_op_world_actions where room_id=p_room_id and status='pending';
  if v_pending>=100 then raise exception using message='WORLD_ACTION_QUEUE_FULL'; end if;
  insert into public.co_op_world_actions(room_id,actor_id,action_id,action_type,payload)
  values(p_room_id,p_user_id,p_action_id,p_action_type,p_payload) returning * into v_inserted;
  return jsonb_build_object('id',v_inserted.id,'action_id',v_inserted.action_id,'action_type',v_inserted.action_type,
    'status',v_inserted.status,'created_at',v_inserted.created_at,'duplicate',false);
end;
$function$;

revoke all on function public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) to service_role;
