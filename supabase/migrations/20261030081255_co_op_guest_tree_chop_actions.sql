alter table public.co_op_world_actions drop constraint if exists co_op_world_actions_action_type_check;
alter table public.co_op_world_actions add constraint co_op_world_actions_action_type_check
  check (action_type in ('place_structure','farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest','mine_rock','chop_tree'));

CREATE OR REPLACE FUNCTION public.enqueue_co_op_world_action(p_user_id uuid, p_room_id uuid, p_action_id uuid, p_action_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     or p_action_type not in ('place_structure','farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest','mine_rock','chop_tree')
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
  elsif p_action_type='chop_tree' then
    if (p_payload - array['x','y','tool']::text[]) <> '{}'::jsonb
       or jsonb_typeof(p_payload->'x') is distinct from 'number'
       or jsonb_typeof(p_payload->'y') is distinct from 'number'
       or jsonb_typeof(p_payload->'tool') is distinct from 'string' then
      raise exception using message='INVALID_WORLD_ACTION';
    end if;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    if v_x<0 or v_x>12000 or v_y<0 or v_y>10000
       or abs(v_x-(round((v_x-16)/32)*32+16))>1
       or abs(v_y-(round((v_y-16)/32)*32+16))>1
       or p_payload->>'tool'<>'Топор' then
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
$function$
;

CREATE OR REPLACE FUNCTION public.commit_co_op_tree_action(p_user_id uuid, p_room_id uuid, p_action_id uuid, p_expected_version bigint, p_payload jsonb, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_room public.co_op_rooms%rowtype;
  v_action public.co_op_world_actions%rowtype;
  v_version bigint;
  v_payload jsonb:=p_payload;
  v_x numeric;
  v_y numeric;
begin
  if p_user_id is null or p_room_id is null or p_action_id is null or p_expected_version is null or p_expected_version<0
     or jsonb_typeof(v_payload) is distinct from 'object' or octet_length(v_payload::text)>65536
     or jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>2048 then
    raise exception using message='INVALID_TREE_ACTION_COMMIT';
  end if;
  if exists(select 1 from jsonb_object_keys(v_payload) as provided(key) where provided.key<>all(array[
    'clearedSnowTiles','snowShovelHits','worldEarlyMonsters','mineLevel','houseLevel','dungeonRoom',
    'dungeonClearedRooms','dungeonChestOpened','dungeonEnemyHp','biomeBosses','caveBossDefeated','caveBossHp',
    'caveChestOpened','treasureChests','mineTileX','mineTileY','mineRocks','tradeEntranceX','tradeEntranceY',
    'furnaceCrafted','placedStructures','lootDrops','adventureQuestProgress','farmCrops','discovered','exploredCells',
    'wolfBossActive','wolfBossHp','wolfBossX','wolfBossY','wolfBossKeyDropped','wolfCageOpen','wolfDogCaged',
    'wolfBossDefeated','wolfCompanionUnlocked','wolfCompanionHp','wolfCompanionRevivals','wolfCompanionOffsetX',
    'wolfCompanionOffsetY','dogBehavior','villageQuestStage','blacksmithQuestStage','explorerQuestStage',
    'npcQuestState','villageReputation','lastVillageRaidDay'
  ]::text[])) then raise exception using message='INVALID_SNAPSHOT_PAYLOAD'; end if;
  if exists(select 1 from jsonb_object_keys(p_result) as provided(key)
      where provided.key<>all(array['reward_name','reward_amount','bonus_name','bonus_amount','extra_name','extra_amount']::text[]))
     or (p_result ? 'reward_name' and (jsonb_typeof(p_result->'reward_name') is distinct from 'string' or p_result->>'reward_name'<>'Древесина'))
     or (p_result ? 'bonus_name' and (jsonb_typeof(p_result->'bonus_name') is distinct from 'string' or p_result->>'bonus_name'<>'Листья'))
     or (p_result ? 'extra_name' and (jsonb_typeof(p_result->'extra_name') is distinct from 'string' or p_result->>'extra_name'<>'Палка'))
     or (p_result ? 'reward_amount' and jsonb_typeof(p_result->'reward_amount') is distinct from 'number')
     or (p_result ? 'bonus_amount' and jsonb_typeof(p_result->'bonus_amount') is distinct from 'number')
     or (p_result ? 'extra_amount' and jsonb_typeof(p_result->'extra_amount') is distinct from 'number')
     or coalesce((p_result->>'reward_amount')::numeric,0)<0 or coalesce((p_result->>'reward_amount')::numeric,0)>1000
     or coalesce((p_result->>'bonus_amount')::numeric,0)<0 or coalesce((p_result->>'bonus_amount')::numeric,0)>1000
     or coalesce((p_result->>'extra_amount')::numeric,0)<0 or coalesce((p_result->>'extra_amount')::numeric,0)>1000 then
    raise exception using message='INVALID_TREE_ACTION_RESULT';
  end if;
  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if v_room.owner_id<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
  if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
  if not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then
    raise exception using message='NOT_A_MEMBER';
  end if;
  select * into v_action from public.co_op_world_actions where room_id=p_room_id and action_id=p_action_id for update;
  if not found then raise exception using message='WORLD_ACTION_NOT_FOUND'; end if;
  if v_action.action_type<>'chop_tree' then raise exception using message='WRONG_WORLD_ACTION_TYPE'; end if;
  if v_action.status='applied' then
    select version into v_version from public.co_op_world_snapshots where room_id=p_room_id;
    return jsonb_build_object('action_id',p_action_id,'status','applied','version',v_version,'result',v_action.result,'duplicate',true);
  end if;
  if v_action.status<>'pending' then raise exception using message='WORLD_ACTION_NOT_PENDING'; end if;
  v_x:=(v_action.payload->>'x')::numeric; v_y:=(v_action.payload->>'y')::numeric;
  if jsonb_typeof(v_payload->'adventureQuestProgress') is distinct from 'object'
     or jsonb_typeof(v_payload->'adventureQuestProgress'->'treeChops') is distinct from 'array'
     or jsonb_typeof(v_payload->'adventureQuestProgress'->'felledTrees') is distinct from 'array' then
    raise exception using message='TREE_RESULT_MISSING';
  end if;
  if not exists(select 1 from jsonb_array_elements(v_payload->'adventureQuestProgress'->'treeChops') item
      where abs((item->>'x')::numeric-v_x)<=1 and abs((item->>'y')::numeric-v_y)<=1
        and (item->>'chops')::integer between 1 and 4)
     and not exists(select 1 from jsonb_array_elements(v_payload->'adventureQuestProgress'->'felledTrees') item
      where abs((item->>'x')::numeric-v_x)<=1 and abs((item->>'y')::numeric-v_y)<=1) then
    raise exception using message='TREE_RESULT_MISSING';
  end if;
  select version into v_version from public.co_op_world_snapshots where room_id=p_room_id for update;
  if not found then raise exception using message='SNAPSHOT_NOT_FOUND'; end if;
  if v_version<>p_expected_version then raise exception using message='SNAPSHOT_VERSION_CONFLICT'; end if;
  if jsonb_typeof(v_payload->'treasureChests')='array' then
    v_payload:=jsonb_set(v_payload,'{treasureChests}',(select coalesce(jsonb_agg(
      case when exists(select 1 from public.co_op_world_claims c where c.room_id=p_room_id
        and c.object_kind='treasure_chest' and c.object_id=item.chest->>'id')
      then jsonb_set(item.chest,'{opened}','true'::jsonb,true) else item.chest end
    ),'[]'::jsonb) from jsonb_array_elements(v_payload->'treasureChests') item(chest)),true);
  end if;
  if exists(select 1 from public.co_op_world_claims c where c.room_id=p_room_id and c.object_kind='cave_chest' and c.object_id='cave') then
    v_payload:=jsonb_set(v_payload,'{caveChestOpened}','true'::jsonb,true);
  end if;
  if exists(select 1 from public.co_op_world_claims c where c.room_id=p_room_id and c.object_kind='dungeon_chest' and c.object_id='dungeon-5') then
    v_payload:=jsonb_set(v_payload,'{dungeonChestOpened}','true'::jsonb,true);
  end if;
  update public.co_op_world_snapshots set version=v_version+1,payload=v_payload,saved_by=p_user_id,updated_at=now() where room_id=p_room_id;
  update public.co_op_world_actions set status='applied',processed_at=now(),processed_by=p_user_id,
    result=p_result||jsonb_build_object('snapshot_version',v_version+1) where id=v_action.id;
  return jsonb_build_object('action_id',p_action_id,'status','applied','version',v_version+1,'result',p_result,'duplicate',false);
end;
$function$
;

revoke all on function public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) to service_role;
revoke all on function public.commit_co_op_tree_action(uuid,uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_co_op_tree_action(uuid,uuid,uuid,bigint,jsonb,jsonb) to service_role;
