-- Owner-mediated guest world actions. Only Edge Functions may call mutation RPCs.
create table if not exists public.co_op_world_actions (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.co_op_rooms(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 action_id uuid not null,
 action_type text not null check(action_type in ('place_structure')),
 payload jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','applied','rejected')),
 result jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 processed_at timestamptz,
 processed_by uuid references auth.users(id),
 constraint co_op_world_actions_payload_object check(jsonb_typeof(payload)='object'),
 constraint co_op_world_actions_result_object check(jsonb_typeof(result)='object'),
 constraint co_op_world_actions_request_unique unique(room_id,actor_id,action_id)
);
alter table public.co_op_world_actions enable row level security;
revoke all on table public.co_op_world_actions from public,anon,authenticated;
grant all on table public.co_op_world_actions to service_role;
create index if not exists co_op_world_actions_pending_idx on public.co_op_world_actions(room_id,id) where status='pending';
create index if not exists co_op_world_actions_actor_idx on public.co_op_world_actions(actor_id,created_at desc);
create table if not exists private.co_op_world_action_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null default now(),
 attempts smallint not null default 0 check(attempts>=0)
);
alter table private.co_op_world_action_limits enable row level security;
revoke all on table private.co_op_world_action_limits from public,anon,authenticated;
grant all on table private.co_op_world_action_limits to service_role;

create or replace function public.enqueue_co_op_world_action(p_user_id uuid,p_room_id uuid,p_action_id uuid,p_action_type text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_room public.co_op_rooms%rowtype; v_existing public.co_op_world_actions%rowtype; v_attempts integer; v_pending integer; v_type text; v_x numeric; v_y numeric; v_inserted public.co_op_world_actions%rowtype;
begin
 if p_user_id is null or p_room_id is null or p_action_id is null or p_action_type<>'place_structure'
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>1024
  or p_payload-array['type','x','y']::text[]<>'{}'::jsonb
  or jsonb_typeof(p_payload->'type') is distinct from 'string'
  or jsonb_typeof(p_payload->'x') is distinct from 'number'
  or jsonb_typeof(p_payload->'y') is distinct from 'number' then raise exception using message='INVALID_WORLD_ACTION'; end if;
 v_type:=p_payload->>'type'; v_x:=(p_payload->>'x')::numeric; v_y:=(p_payload->>'y')::numeric;
 if v_type not in ('furnace','house','torch','coal','storage','farmplot') or v_x<0 or v_x>12000 or v_y<0 or v_y>10000 then raise exception using message='INVALID_WORLD_ACTION'; end if;
 select * into v_room from public.co_op_rooms where id=p_room_id for update;
 if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
 if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
 if v_room.owner_id=p_user_id or not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then raise exception using message='NOT_A_GUEST_MEMBER'; end if;
 select * into v_existing from public.co_op_world_actions where room_id=p_room_id and actor_id=p_user_id and action_id=p_action_id;
 if found then return jsonb_build_object('id',v_existing.id,'action_id',v_existing.action_id,'action_type',v_existing.action_type,'status',v_existing.status,'created_at',v_existing.created_at,'result',v_existing.result,'duplicate',true); end if;
 insert into private.co_op_world_action_limits(user_id,window_started_at,attempts) values(p_user_id,now(),1)
 on conflict(user_id) do update set
 attempts=case when private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' then 1 else private.co_op_world_action_limits.attempts+1 end,
 window_started_at=case when private.co_op_world_action_limits.window_started_at<now()-interval '1 minute' then now() else private.co_op_world_action_limits.window_started_at end
 returning attempts into v_attempts;
 if v_attempts>20 then raise exception using message='WORLD_ACTION_RATE_LIMITED'; end if;
 select count(*) into v_pending from public.co_op_world_actions where room_id=p_room_id and status='pending';
 if v_pending>=100 then raise exception using message='WORLD_ACTION_QUEUE_FULL'; end if;
 insert into public.co_op_world_actions(room_id,actor_id,action_id,action_type,payload) values(p_room_id,p_user_id,p_action_id,p_action_type,p_payload) returning * into v_inserted;
 return jsonb_build_object('id',v_inserted.id,'action_id',v_inserted.action_id,'action_type',v_inserted.action_type,'status',v_inserted.status,'created_at',v_inserted.created_at,'duplicate',false);
end;$function$;

create or replace function public.get_pending_co_op_world_actions(p_user_id uuid,p_room_id uuid,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_owner uuid; v_status text; v_result jsonb;
begin
 select owner_id,status into v_owner,v_status from public.co_op_rooms where id=p_room_id;
 if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
 if v_owner<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
 if v_status<>'running' then return '[]'::jsonb; end if;
 if not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then raise exception using message='NOT_A_MEMBER'; end if;
 select coalesce(jsonb_agg(q.item order by q.id),'[]'::jsonb) into v_result from (
  select a.id,jsonb_build_object('id',a.id,'action_id',a.action_id,'actor_id',a.actor_id,'action_type',a.action_type,'payload',a.payload,'created_at',a.created_at) as item
  from public.co_op_world_actions a where a.room_id=p_room_id and a.status='pending' order by a.id
  limit least(greatest(coalesce(p_limit,25),1),50)
 ) q;
 return v_result;
end;$function$;

create or replace function public.get_co_op_world_action_status(p_user_id uuid,p_room_id uuid,p_action_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_action public.co_op_world_actions%rowtype;
begin
 select * into v_action from public.co_op_world_actions where room_id=p_room_id and actor_id=p_user_id and action_id=p_action_id;
 if not found then raise exception using message='WORLD_ACTION_NOT_FOUND'; end if;
 return jsonb_build_object('action_id',v_action.action_id,'status',v_action.status,'result',v_action.result,'created_at',v_action.created_at,'processed_at',v_action.processed_at);
end;$function$;

create or replace function public.commit_co_op_world_action(p_user_id uuid,p_room_id uuid,p_action_id uuid,p_expected_version bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_room public.co_op_rooms%rowtype; v_action public.co_op_world_actions%rowtype; v_version bigint; v_payload jsonb:=p_payload;
begin
 if p_user_id is null or p_room_id is null or p_action_id is null or p_expected_version is null or p_expected_version<0
  or jsonb_typeof(v_payload) is distinct from 'object' or octet_length(v_payload::text)>65536 then raise exception using message='INVALID_WORLD_ACTION_COMMIT'; end if;
 if exists(select 1 from jsonb_object_keys(v_payload) as provided(key) where provided.key<>all(array[
 'clearedSnowTiles','snowShovelHits','worldEarlyMonsters','mineLevel','houseLevel','dungeonRoom','dungeonClearedRooms','dungeonChestOpened','dungeonEnemyHp','biomeBosses','caveBossDefeated','caveBossHp','caveChestOpened','treasureChests','mineTileX','mineTileY','mineRocks','tradeEntranceX','tradeEntranceY','furnaceCrafted','placedStructures','lootDrops','adventureQuestProgress','farmCrops','discovered','exploredCells','wolfBossActive','wolfBossHp','wolfBossX','wolfBossY','wolfBossKeyDropped','wolfCageOpen','wolfDogCaged','wolfBossDefeated','wolfCompanionUnlocked','wolfCompanionHp','wolfCompanionRevivals','wolfCompanionOffsetX','wolfCompanionOffsetY','dogBehavior','villageQuestStage','blacksmithQuestStage','explorerQuestStage','npcQuestState','villageReputation','lastVillageRaidDay'
 ]::text[])) then raise exception using message='INVALID_SNAPSHOT_PAYLOAD'; end if;
 select * into v_room from public.co_op_rooms where id=p_room_id for update;
 if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
 if v_room.owner_id<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
 if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
 if not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then raise exception using message='NOT_A_MEMBER'; end if;
 select * into v_action from public.co_op_world_actions where room_id=p_room_id and action_id=p_action_id for update;
 if not found then raise exception using message='WORLD_ACTION_NOT_FOUND'; end if;
 if v_action.status='applied' then select version into v_version from public.co_op_world_snapshots where room_id=p_room_id; return jsonb_build_object('action_id',p_action_id,'status','applied','version',v_version,'duplicate',true); end if;
 if v_action.status<>'pending' then raise exception using message='WORLD_ACTION_NOT_PENDING'; end if;
 if jsonb_typeof(p_payload->'placedStructures') is distinct from 'array'
  or not (p_payload->'placedStructures' @> jsonb_build_array(jsonb_build_object('type',v_action.payload->>'type','x',v_action.payload->'x','y',v_action.payload->'y'))) then raise exception using message='WORLD_ACTION_RESULT_MISSING'; end if;
 select version into v_version from public.co_op_world_snapshots where room_id=p_room_id for update;
 if not found then raise exception using message='SNAPSHOT_NOT_FOUND'; end if;
 if v_version<>p_expected_version then raise exception using message='SNAPSHOT_VERSION_CONFLICT'; end if;
 if jsonb_typeof(v_payload->'treasureChests')='array' then
  v_payload:=jsonb_set(v_payload,'{treasureChests}',(select coalesce(jsonb_agg(case when exists(
   select 1 from public.co_op_world_claims c where c.room_id=p_room_id and c.object_kind='treasure_chest' and c.object_id=item.chest->>'id'
  ) then jsonb_set(item.chest,'{opened}','true'::jsonb,true) else item.chest end),'[]'::jsonb) from jsonb_array_elements(v_payload->'treasureChests') as item(chest)),true);
 end if;
 if exists(select 1 from public.co_op_world_claims c where c.room_id=p_room_id and c.object_kind='cave_chest' and c.object_id='cave') then v_payload:=jsonb_set(v_payload,'{caveChestOpened}','true'::jsonb,true); end if;
 if exists(select 1 from public.co_op_world_claims c where c.room_id=p_room_id and c.object_kind='dungeon_chest' and c.object_id='dungeon-5') then v_payload:=jsonb_set(v_payload,'{dungeonChestOpened}','true'::jsonb,true); end if;
 update public.co_op_world_snapshots set version=v_version+1,payload=v_payload,saved_by=p_user_id,updated_at=now() where room_id=p_room_id;
 update public.co_op_world_actions set status='applied',processed_at=now(),processed_by=p_user_id,result=jsonb_build_object('snapshot_version',v_version+1) where id=v_action.id;
 return jsonb_build_object('action_id',p_action_id,'status','applied','version',v_version+1,'duplicate',false);
end;$function$;

create or replace function public.reject_co_op_world_action(p_user_id uuid,p_room_id uuid,p_action_id uuid,p_reason text default 'rejected')
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_owner uuid; v_action public.co_op_world_actions%rowtype;
begin
 select owner_id into v_owner from public.co_op_rooms where id=p_room_id for update;
 if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
 if v_owner<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
 select * into v_action from public.co_op_world_actions where room_id=p_room_id and action_id=p_action_id for update;
 if not found then raise exception using message='WORLD_ACTION_NOT_FOUND'; end if;
 if v_action.status<>'pending' then return jsonb_build_object('action_id',p_action_id,'status',v_action.status,'duplicate',true); end if;
 update public.co_op_world_actions set status='rejected',processed_at=now(),processed_by=p_user_id,result=jsonb_build_object('reason',left(coalesce(p_reason,'rejected'),120)) where id=v_action.id;
 return jsonb_build_object('action_id',p_action_id,'status','rejected','duplicate',false);
end;$function$;

revoke all on function public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_co_op_world_action(uuid,uuid,uuid,text,jsonb) to service_role;
revoke all on function public.get_pending_co_op_world_actions(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_pending_co_op_world_actions(uuid,uuid,integer) to service_role;
revoke all on function public.get_co_op_world_action_status(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_co_op_world_action_status(uuid,uuid,uuid) to service_role;
revoke all on function public.commit_co_op_world_action(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_co_op_world_action(uuid,uuid,uuid,bigint,jsonb) to service_role;
revoke all on function public.reject_co_op_world_action(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reject_co_op_world_action(uuid,uuid,uuid,text) to service_role;
