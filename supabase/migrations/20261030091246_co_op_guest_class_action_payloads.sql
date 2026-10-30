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
     OR p_action_type NOT IN ('place_structure','farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest','mine_rock','chop_tree')
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>1024 THEN
    RAISE EXCEPTION USING message='INVALID_WORLD_ACTION';
  END IF;
  IF p_action_type='mine_rock' THEN
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
