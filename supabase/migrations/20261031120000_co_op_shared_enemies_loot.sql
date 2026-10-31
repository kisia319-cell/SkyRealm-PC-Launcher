ALTER TABLE public.co_op_world_actions DROP CONSTRAINT IF EXISTS co_op_world_actions_action_type_check;
ALTER TABLE public.co_op_world_actions ADD CONSTRAINT co_op_world_actions_action_type_check
  CHECK (action_type IN ('place_structure','farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest','mine_rock','chop_tree','damage_enemy','pickup_loot'));
CREATE OR REPLACE FUNCTION public.enqueue_co_op_world_action(
  p_user_id uuid,p_room_id uuid,p_action_id uuid,p_action_type text,p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
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
BEGIN
  IF p_user_id IS NULL OR p_room_id IS NULL OR p_action_id IS NULL
     OR p_action_type NOT IN ('place_structure','farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest','mine_rock','chop_tree','damage_enemy','pickup_loot')
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>1024 THEN
    RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
  END IF;
  IF p_action_type='damage_enemy' THEN
    IF (p_payload - ARRAY['target_kind','target_id','weapon','damage']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'target_kind') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'target_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'weapon') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'damage') IS DISTINCT FROM 'number'
       OR p_payload->>'target_kind' NOT IN ('monster','biome_boss','wolf_boss','cave_boss','dungeon_boss')
       OR length(p_payload->>'target_id')<1 OR length(p_payload->>'target_id')>64
       OR p_payload->>'target_id' !~ '^[A-Za-z0-9_-]+    IF (p_payload - ARRAY['rock_index','tool','player_class','miner_skill_level']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'rock_index') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'tool') IS DISTINCT FROM 'string'
       OR (p_payload ? 'player_class' AND (jsonb_typeof(p_payload->'player_class') IS DISTINCT FROM 'string'
         OR p_payload->>'player_class' NOT IN ('swordsman','farmer','ordinary','archer','mage','miner')))
       OR (p_payload ? 'miner_skill_level' AND (jsonb_typeof(p_payload->'miner_skill_level') IS DISTINCT FROM 'number'
         OR (p_payload->>'miner_skill_level') !~ '^(0|[1-5])$')) THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_rock_index:=(p_payload->>'rock_index')::numeric; v_tool:=p_payload->>'tool';
    IF v_rock_index<0 OR v_rock_index>64 OR v_rock_index<>trunc(v_rock_index)
       OR v_tool NOT IN ('Кирка','Улучшенная кирка','Кирка мастера') THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSIF p_action_type='chop_tree' THEN
    IF (p_payload - ARRAY['x','y','tool']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'tool') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000
       OR abs(v_x-(round((v_x-16)/32)*32+16))>1
       OR abs(v_y-(round((v_y-16)/32)*32+16))>1 OR p_payload->>'tool'<>'Топор' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSE
    v_allowed_keys:=CASE
      WHEN p_action_type='place_structure' THEN ARRAY['type','x','y']::text[]
      WHEN p_action_type='farm_plant' THEN ARRAY['x','y','crop_id']::text[]
      WHEN p_action_type='farm_harvest' THEN ARRAY['x','y','player_class','farmer_skill_level','has_sickle']::text[]
      ELSE ARRAY['x','y']::text[]
    END;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) AS provided(key) WHERE provided.key<>ALL(v_allowed_keys))
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000
       OR abs(v_x-(round((v_x-16)/32)*32+16))>1
       OR abs(v_y-(round((v_y-16)/32)*32+16))>1 THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    IF p_action_type='place_structure' THEN
      v_type:=p_payload->>'type';
      IF jsonb_typeof(p_payload->'type') IS DISTINCT FROM 'string'
         OR v_type NOT IN ('furnace','house','torch','coal','storage','farmplot') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    ELSIF p_action_type='farm_plant' THEN
      IF jsonb_typeof(p_payload->'crop_id') IS DISTINCT FROM 'string'
         OR p_payload->>'crop_id' NOT IN ('wheat','carrot','potato','tomato','corn','pumpkin','strawberry') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    ELSIF p_action_type='farm_harvest' THEN
      IF (p_payload ? 'player_class' AND (jsonb_typeof(p_payload->'player_class') IS DISTINCT FROM 'string'
            OR p_payload->>'player_class' NOT IN ('swordsman','farmer','ordinary','archer','mage','miner')))
         OR (p_payload ? 'farmer_skill_level' AND (jsonb_typeof(p_payload->'farmer_skill_level') IS DISTINCT FROM 'number'
            OR (p_payload->>'farmer_skill_level') !~ '^(0|[1-5])$'))
         OR (p_payload ? 'has_sickle' AND jsonb_typeof(p_payload->'has_sickle') IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_room FROM public.co_op_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING message='ROOM_NOT_FOUND'; END IF;
  IF v_room.status<>'running' THEN RAISE EXCEPTION USING message='ROOM_NOT_RUNNING'; END IF;
  IF v_room.owner_id=p_user_id OR NOT EXISTS(SELECT 1 FROM public.co_op_members m
    WHERE m.room_id=p_room_id AND m.user_id=p_user_id AND m.member_status='active') THEN
    RAISE EXCEPTION USING message='NOT_A_GUEST_MEMBER';
  END IF;
  SELECT * INTO v_existing FROM public.co_op_world_actions WHERE room_id=p_room_id AND action_id=p_action_id;
  IF FOUND THEN
    IF v_existing.actor_id<>p_user_id THEN RAISE EXCEPTION USING message='WORLD_ACTION_ID_CONFLICT'; END IF;
    RETURN jsonb_build_object('id',v_existing.id,'action_id',v_existing.action_id,'action_type',v_existing.action_type,
      'status',v_existing.status,'created_at',v_existing.created_at,'result',v_existing.result,'duplicate',true);
  END IF;
  INSERT INTO private.co_op_world_action_limits(user_id,window_started_at,attempts) VALUES(p_user_id,now(),1)
  ON CONFLICT(user_id) DO UPDATE SET
    attempts=CASE WHEN private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' THEN 1
      ELSE private.co_op_world_action_limits.attempts+1 END,
    window_started_at=CASE WHEN private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' THEN now()
      ELSE private.co_op_world_action_limits.window_started_at END
  RETURNING attempts INTO v_attempts;
  IF v_attempts>20 THEN RAISE EXCEPTION USING message='WORLD_ACTION_RATE_LIMITED'; END IF;
  SELECT count(*) INTO v_pending FROM public.co_op_world_actions WHERE room_id=p_room_id AND status='pending';
  IF v_pending>=100 THEN RAISE EXCEPTION USING message='WORLD_ACTION_QUEUE_FULL'; END IF;
  INSERT INTO public.co_op_world_actions(room_id,actor_id,action_id,action_type,payload)
  VALUES(p_room_id,p_user_id,p_action_id,p_action_type,p_payload) RETURNING * INTO v_inserted;
  RETURN jsonb_build_object('id',v_inserted.id,'action_id',v_inserted.action_id,'action_type',v_inserted.action_type,
    'status',v_inserted.status,'created_at',v_inserted.created_at,'duplicate',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) TO service_role;

       OR p_payload->>'weapon' NOT IN ('Деревянный меч','Железный меч','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты','Ледяной посох','Молниеносное копьё')
       OR (p_payload->>'damage') !~ '^[0-9]+    IF (p_payload - ARRAY['rock_index','tool','player_class','miner_skill_level']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'rock_index') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'tool') IS DISTINCT FROM 'string'
       OR (p_payload ? 'player_class' AND (jsonb_typeof(p_payload->'player_class') IS DISTINCT FROM 'string'
         OR p_payload->>'player_class' NOT IN ('swordsman','farmer','ordinary','archer','mage','miner')))
       OR (p_payload ? 'miner_skill_level' AND (jsonb_typeof(p_payload->'miner_skill_level') IS DISTINCT FROM 'number'
         OR (p_payload->>'miner_skill_level') !~ '^(0|[1-5])$')) THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_rock_index:=(p_payload->>'rock_index')::numeric; v_tool:=p_payload->>'tool';
    IF v_rock_index<0 OR v_rock_index>64 OR v_rock_index<>trunc(v_rock_index)
       OR v_tool NOT IN ('Кирка','Улучшенная кирка','Кирка мастера') THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSIF p_action_type='chop_tree' THEN
    IF (p_payload - ARRAY['x','y','tool']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'tool') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000
       OR abs(v_x-(round((v_x-16)/32)*32+16))>1
       OR abs(v_y-(round((v_y-16)/32)*32+16))>1 OR p_payload->>'tool'<>'Топор' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSE
    v_allowed_keys:=CASE
      WHEN p_action_type='place_structure' THEN ARRAY['type','x','y']::text[]
      WHEN p_action_type='farm_plant' THEN ARRAY['x','y','crop_id']::text[]
      WHEN p_action_type='farm_harvest' THEN ARRAY['x','y','player_class','farmer_skill_level','has_sickle']::text[]
      ELSE ARRAY['x','y']::text[]
    END;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) AS provided(key) WHERE provided.key<>ALL(v_allowed_keys))
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000
       OR abs(v_x-(round((v_x-16)/32)*32+16))>1
       OR abs(v_y-(round((v_y-16)/32)*32+16))>1 THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    IF p_action_type='place_structure' THEN
      v_type:=p_payload->>'type';
      IF jsonb_typeof(p_payload->'type') IS DISTINCT FROM 'string'
         OR v_type NOT IN ('furnace','house','torch','coal','storage','farmplot') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    ELSIF p_action_type='farm_plant' THEN
      IF jsonb_typeof(p_payload->'crop_id') IS DISTINCT FROM 'string'
         OR p_payload->>'crop_id' NOT IN ('wheat','carrot','potato','tomato','corn','pumpkin','strawberry') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    ELSIF p_action_type='farm_harvest' THEN
      IF (p_payload ? 'player_class' AND (jsonb_typeof(p_payload->'player_class') IS DISTINCT FROM 'string'
            OR p_payload->>'player_class' NOT IN ('swordsman','farmer','ordinary','archer','mage','miner')))
         OR (p_payload ? 'farmer_skill_level' AND (jsonb_typeof(p_payload->'farmer_skill_level') IS DISTINCT FROM 'number'
            OR (p_payload->>'farmer_skill_level') !~ '^(0|[1-5])$'))
         OR (p_payload ? 'has_sickle' AND jsonb_typeof(p_payload->'has_sickle') IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_room FROM public.co_op_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING message='ROOM_NOT_FOUND'; END IF;
  IF v_room.status<>'running' THEN RAISE EXCEPTION USING message='ROOM_NOT_RUNNING'; END IF;
  IF v_room.owner_id=p_user_id OR NOT EXISTS(SELECT 1 FROM public.co_op_members m
    WHERE m.room_id=p_room_id AND m.user_id=p_user_id AND m.member_status='active') THEN
    RAISE EXCEPTION USING message='NOT_A_GUEST_MEMBER';
  END IF;
  SELECT * INTO v_existing FROM public.co_op_world_actions WHERE room_id=p_room_id AND action_id=p_action_id;
  IF FOUND THEN
    IF v_existing.actor_id<>p_user_id THEN RAISE EXCEPTION USING message='WORLD_ACTION_ID_CONFLICT'; END IF;
    RETURN jsonb_build_object('id',v_existing.id,'action_id',v_existing.action_id,'action_type',v_existing.action_type,
      'status',v_existing.status,'created_at',v_existing.created_at,'result',v_existing.result,'duplicate',true);
  END IF;
  INSERT INTO private.co_op_world_action_limits(user_id,window_started_at,attempts) VALUES(p_user_id,now(),1)
  ON CONFLICT(user_id) DO UPDATE SET
    attempts=CASE WHEN private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' THEN 1
      ELSE private.co_op_world_action_limits.attempts+1 END,
    window_started_at=CASE WHEN private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' THEN now()
      ELSE private.co_op_world_action_limits.window_started_at END
  RETURNING attempts INTO v_attempts;
  IF v_attempts>20 THEN RAISE EXCEPTION USING message='WORLD_ACTION_RATE_LIMITED'; END IF;
  SELECT count(*) INTO v_pending FROM public.co_op_world_actions WHERE room_id=p_room_id AND status='pending';
  IF v_pending>=100 THEN RAISE EXCEPTION USING message='WORLD_ACTION_QUEUE_FULL'; END IF;
  INSERT INTO public.co_op_world_actions(room_id,actor_id,action_id,action_type,payload)
  VALUES(p_room_id,p_user_id,p_action_id,p_action_type,p_payload) RETURNING * INTO v_inserted;
  RETURN jsonb_build_object('id',v_inserted.id,'action_id',v_inserted.action_id,'action_type',v_inserted.action_type,
    'status',v_inserted.status,'created_at',v_inserted.created_at,'duplicate',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) TO service_role;

       OR (p_payload->>'damage')::numeric<1 OR (p_payload->>'damage')::numeric>500 THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSIF p_action_type='pickup_loot' THEN
    IF (p_payload - ARRAY['loot_id','x','y','world_mode']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'loot_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'world_mode') IS DISTINCT FROM 'string'
       OR length(p_payload->>'loot_id')<>36
       OR p_payload->>'world_mode' NOT IN ('surface','cave','dungeon') THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    BEGIN
      PERFORM (p_payload->>'loot_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000 THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSIF p_action_type='mine_rock' THEN
    IF (p_payload - ARRAY['rock_index','tool','player_class','miner_skill_level']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'rock_index') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'tool') IS DISTINCT FROM 'string'
       OR (p_payload ? 'player_class' AND (jsonb_typeof(p_payload->'player_class') IS DISTINCT FROM 'string'
         OR p_payload->>'player_class' NOT IN ('swordsman','farmer','ordinary','archer','mage','miner')))
       OR (p_payload ? 'miner_skill_level' AND (jsonb_typeof(p_payload->'miner_skill_level') IS DISTINCT FROM 'number'
         OR (p_payload->>'miner_skill_level') !~ '^(0|[1-5])$')) THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_rock_index:=(p_payload->>'rock_index')::numeric; v_tool:=p_payload->>'tool';
    IF v_rock_index<0 OR v_rock_index>64 OR v_rock_index<>trunc(v_rock_index)
       OR v_tool NOT IN ('Кирка','Улучшенная кирка','Кирка мастера') THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSIF p_action_type='chop_tree' THEN
    IF (p_payload - ARRAY['x','y','tool']::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'tool') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000
       OR abs(v_x-(round((v_x-16)/32)*32+16))>1
       OR abs(v_y-(round((v_y-16)/32)*32+16))>1 OR p_payload->>'tool'<>'Топор' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
  ELSE
    v_allowed_keys:=CASE
      WHEN p_action_type='place_structure' THEN ARRAY['type','x','y']::text[]
      WHEN p_action_type='farm_plant' THEN ARRAY['x','y','crop_id']::text[]
      WHEN p_action_type='farm_harvest' THEN ARRAY['x','y','player_class','farmer_skill_level','has_sickle']::text[]
      ELSE ARRAY['x','y']::text[]
    END;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) AS provided(key) WHERE provided.key<>ALL(v_allowed_keys))
       OR jsonb_typeof(p_payload->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'y') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
    IF v_x<0 OR v_x>12000 OR v_y<0 OR v_y>10000
       OR abs(v_x-(round((v_x-16)/32)*32+16))>1
       OR abs(v_y-(round((v_y-16)/32)*32+16))>1 THEN
      RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
    END IF;
    IF p_action_type='place_structure' THEN
      v_type:=p_payload->>'type';
      IF jsonb_typeof(p_payload->'type') IS DISTINCT FROM 'string'
         OR v_type NOT IN ('furnace','house','torch','coal','storage','farmplot') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    ELSIF p_action_type='farm_plant' THEN
      IF jsonb_typeof(p_payload->'crop_id') IS DISTINCT FROM 'string'
         OR p_payload->>'crop_id' NOT IN ('wheat','carrot','potato','tomato','corn','pumpkin','strawberry') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    ELSIF p_action_type='farm_harvest' THEN
      IF (p_payload ? 'player_class' AND (jsonb_typeof(p_payload->'player_class') IS DISTINCT FROM 'string'
            OR p_payload->>'player_class' NOT IN ('swordsman','farmer','ordinary','archer','mage','miner')))
         OR (p_payload ? 'farmer_skill_level' AND (jsonb_typeof(p_payload->'farmer_skill_level') IS DISTINCT FROM 'number'
            OR (p_payload->>'farmer_skill_level') !~ '^(0|[1-5])$'))
         OR (p_payload ? 'has_sickle' AND jsonb_typeof(p_payload->'has_sickle') IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_room FROM public.co_op_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING message='ROOM_NOT_FOUND'; END IF;
  IF v_room.status<>'running' THEN RAISE EXCEPTION USING message='ROOM_NOT_RUNNING'; END IF;
  IF v_room.owner_id=p_user_id OR NOT EXISTS(SELECT 1 FROM public.co_op_members m
    WHERE m.room_id=p_room_id AND m.user_id=p_user_id AND m.member_status='active') THEN
    RAISE EXCEPTION USING message='NOT_A_GUEST_MEMBER';
  END IF;
  SELECT * INTO v_existing FROM public.co_op_world_actions WHERE room_id=p_room_id AND action_id=p_action_id;
  IF FOUND THEN
    IF v_existing.actor_id<>p_user_id THEN RAISE EXCEPTION USING message='WORLD_ACTION_ID_CONFLICT'; END IF;
    RETURN jsonb_build_object('id',v_existing.id,'action_id',v_existing.action_id,'action_type',v_existing.action_type,
      'status',v_existing.status,'created_at',v_existing.created_at,'result',v_existing.result,'duplicate',true);
  END IF;
  INSERT INTO private.co_op_world_action_limits(user_id,window_started_at,attempts) VALUES(p_user_id,now(),1)
  ON CONFLICT(user_id) DO UPDATE SET
    attempts=CASE WHEN private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' THEN 1
      ELSE private.co_op_world_action_limits.attempts+1 END,
    window_started_at=CASE WHEN private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' THEN now()
      ELSE private.co_op_world_action_limits.window_started_at END
  RETURNING attempts INTO v_attempts;
  IF v_attempts>20 THEN RAISE EXCEPTION USING message='WORLD_ACTION_RATE_LIMITED'; END IF;
  SELECT count(*) INTO v_pending FROM public.co_op_world_actions WHERE room_id=p_room_id AND status='pending';
  IF v_pending>=100 THEN RAISE EXCEPTION USING message='WORLD_ACTION_QUEUE_FULL'; END IF;
  INSERT INTO public.co_op_world_actions(room_id,actor_id,action_id,action_type,payload)
  VALUES(p_room_id,p_user_id,p_action_id,p_action_type,p_payload) RETURNING * INTO v_inserted;
  RETURN jsonb_build_object('id',v_inserted.id,'action_id',v_inserted.action_id,'action_type',v_inserted.action_type,
    'status',v_inserted.status,'created_at',v_inserted.created_at,'duplicate',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_co_op_enemy_action(
  p_user_id uuid,
  p_room_id uuid,
  p_action_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_room public.co_op_rooms%rowtype;
  v_action public.co_op_world_actions%rowtype;
  v_version bigint;
  v_current_payload jsonb;
  v_drop jsonb;
  v_result jsonb:=coalesce(p_result,'{}'::jsonb);
  v_result_name text;
  v_result_amount integer;
  v_xp integer:=0;
  v_xp_numeric numeric;
BEGIN
  IF p_user_id IS NULL OR p_room_id IS NULL OR p_action_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version<0
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR octet_length(p_payload::text)>65536
     OR jsonb_typeof(v_result) IS DISTINCT FROM 'object'
     OR octet_length(v_result::text)>2048 THEN
    RAISE EXCEPTION USING message='INVALID_ENEMY_ACTION_COMMIT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) AS provided(key)
    WHERE provided.key<>ALL(ARRAY[
      'clearedSnowTiles','snowShovelHits','worldEarlyMonsters','mineLevel','houseLevel',
      'dungeonRoom','dungeonClearedRooms','dungeonChestOpened','dungeonEnemyHp',
      'biomeBosses','caveBossDefeated','caveBossHp','caveChestOpened','treasureChests',
      'mineTileX','mineTileY','mineRocks','tradeEntranceX','tradeEntranceY','furnaceCrafted',
      'placedStructures','lootDrops','adventureQuestProgress','farmCrops','discovered',
      'exploredCells','wolfBossActive','wolfBossHp','wolfBossX','wolfBossY','wolfBossKeyDropped',
      'wolfCageOpen','wolfDogCaged','wolfBossDefeated','wolfCompanionUnlocked','wolfCompanionHp',
      'wolfCompanionRevivals','wolfCompanionOffsetX','wolfCompanionOffsetY','dogBehavior',
      'villageQuestStage','blacksmithQuestStage','explorerQuestStage','npcQuestState',
      'villageReputation','lastVillageRaidDay','lastWorldCampDay','lastWorldHordeNight',
      'lastWorldMeteorNight','lastWorldTravelerDay','meteorPoint','meteorShowerTimer',
      'villageRaidActive','villageRaidKills','villageRaidTimer','weatherMode','weatherTimer',
      'worldEventCamp','worldEventTraveler'
    ]::text[])
  ) THEN
    RAISE EXCEPTION USING message='INVALID_SNAPSHOT_PAYLOAD';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_result) AS provided(key)
    WHERE provided.key<>ALL(ARRAY['reward_name','reward_amount','reward_xp']::text[])
  ) THEN
    RAISE EXCEPTION USING message='INVALID_ENEMY_ACTION_RESULT';
  END IF;
  IF v_result ? 'reward_xp' THEN
    IF jsonb_typeof(v_result->'reward_xp') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING message='INVALID_ENEMY_ACTION_RESULT';
    END IF;
    v_xp_numeric:=(v_result->>'reward_xp')::numeric;
    IF v_xp_numeric<0 OR v_xp_numeric>1000 OR v_xp_numeric<>trunc(v_xp_numeric) THEN
      RAISE EXCEPTION USING message='INVALID_ENEMY_ACTION_RESULT';
    END IF;
    v_xp:=v_xp_numeric::integer;
  END IF;

  SELECT * INTO v_room FROM public.co_op_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING message='ROOM_NOT_FOUND'; END IF;
  IF v_room.owner_id<>p_user_id THEN RAISE EXCEPTION USING message='OWNER_ONLY'; END IF;
  IF v_room.status<>'running' THEN RAISE EXCEPTION USING message='ROOM_NOT_RUNNING'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.co_op_members m
    WHERE m.room_id=p_room_id AND m.user_id=p_user_id AND m.member_status='active') THEN
    RAISE EXCEPTION USING message='NOT_A_MEMBER';
  END IF;

  SELECT * INTO v_action FROM public.co_op_world_actions
  WHERE room_id=p_room_id AND action_id=p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING message='WORLD_ACTION_NOT_FOUND'; END IF;
  IF v_action.status='applied' THEN
    SELECT version INTO v_version FROM public.co_op_world_snapshots WHERE room_id=p_room_id;
    RETURN jsonb_build_object('action_id',p_action_id,'status','applied','version',v_version,'result',v_action.result,'duplicate',true);
  END IF;
  IF v_action.status<>'pending' OR v_action.action_type NOT IN ('damage_enemy','pickup_loot') THEN
    RAISE EXCEPTION USING message='WORLD_ACTION_NOT_PENDING';
  END IF;

  SELECT version,payload INTO v_version,v_current_payload
  FROM public.co_op_world_snapshots WHERE room_id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING message='SNAPSHOT_NOT_FOUND'; END IF;
  IF v_version<>p_expected_version THEN RAISE EXCEPTION USING message='SNAPSHOT_VERSION_CONFLICT'; END IF;

  IF v_action.action_type='damage_enemy' THEN
    IF v_result ? 'reward_name' OR v_result ? 'reward_amount' THEN
      RAISE EXCEPTION USING message='INVALID_ENEMY_ACTION_RESULT';
    END IF;
  ELSE
    IF (v_action.payload->>'world_mode') NOT IN ('surface','cave','dungeon')
       OR jsonb_typeof(v_current_payload->'lootDrops') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'lootDrops') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING message='INVALID_SHARED_LOOT_CLAIM';
    END IF;
    SELECT item INTO v_drop
    FROM jsonb_array_elements(v_current_payload->'lootDrops') AS entries(item)
    WHERE item->>'id'=v_action.payload->>'loot_id'
      AND item->>'shared'='true'
    LIMIT 1;
    IF v_drop IS NULL THEN RAISE EXCEPTION USING message='SHARED_LOOT_ALREADY_CLAIMED'; END IF;

    IF EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_payload->'lootDrops') AS entries(item)
      WHERE item->>'id'=v_action.payload->>'loot_id'
    ) THEN
      RAISE EXCEPTION USING message='SHARED_LOOT_NOT_REMOVED';
    END IF;

    v_result_name:=v_drop->>'name';
    IF jsonb_typeof(v_drop->'count') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING message='INVALID_SHARED_LOOT_REWARD';
    END IF;
    v_xp_numeric:=(v_drop->>'count')::numeric;
    IF v_xp_numeric<1 OR v_xp_numeric>99 OR v_xp_numeric<>trunc(v_xp_numeric) THEN
      RAISE EXCEPTION USING message='INVALID_SHARED_LOOT_REWARD';
    END IF;
    v_result_amount:=v_xp_numeric::integer;
    IF v_result->>'reward_name' IS DISTINCT FROM v_result_name
       OR jsonb_typeof(v_result->'reward_amount') IS DISTINCT FROM 'number'
       OR (v_result->>'reward_amount')::numeric<>v_result_amount
       OR v_result ? 'reward_xp' THEN
      RAISE EXCEPTION USING message='INVALID_SHARED_LOOT_REWARD';
    END IF;
  END IF;

  IF jsonb_typeof(p_payload->'treasureChests')='array' THEN
    p_payload:=jsonb_set(p_payload,'{treasureChests}',(
      SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(
        SELECT 1 FROM public.co_op_world_claims c
        WHERE c.room_id=p_room_id AND c.object_kind='treasure_chest' AND c.object_id=item.chest->>'id'
      ) THEN jsonb_set(item.chest,'{opened}','true'::jsonb,true) ELSE item.chest END),'[]'::jsonb)
      FROM jsonb_array_elements(p_payload->'treasureChests') AS item(chest)
    ),true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.co_op_world_claims c WHERE c.room_id=p_room_id AND c.object_kind='cave_chest' AND c.object_id='cave') THEN
    p_payload:=jsonb_set(p_payload,'{caveChestOpened}','true'::jsonb,true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.co_op_world_claims c WHERE c.room_id=p_room_id AND c.object_kind='dungeon_chest' AND c.object_id='dungeon-5') THEN
    p_payload:=jsonb_set(p_payload,'{dungeonChestOpened}','true'::jsonb,true);
  END IF;

  UPDATE public.co_op_world_snapshots
  SET version=v_version+1,payload=p_payload,saved_by=p_user_id,updated_at=now()
  WHERE room_id=p_room_id;
  v_result:=v_result||jsonb_build_object('snapshot_version',v_version+1);
  UPDATE public.co_op_world_actions
  SET status='applied',processed_at=now(),processed_by=p_user_id,result=v_result
  WHERE id=v_action.id;
  RETURN jsonb_build_object('action_id',p_action_id,'status','applied','version',v_version+1,'result',v_result,'duplicate',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_co_op_enemy_action(uuid,uuid,uuid,bigint,jsonb,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_co_op_enemy_action(uuid,uuid,uuid,bigint,jsonb,jsonb) TO service_role;
