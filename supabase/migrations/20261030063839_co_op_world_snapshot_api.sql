create or replace function public.save_co_op_world_snapshot(
  p_user_id uuid, p_room_id uuid, p_expected_version bigint, p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.co_op_rooms%rowtype;
  v_version bigint;
begin
  if p_user_id is null or p_room_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception using message = 'INVALID_SNAPSHOT_REQUEST';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 65536 then
    raise exception using message = 'INVALID_SNAPSHOT_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as provided(key)
    where provided.key <> all (array['clearedSnowTiles','snowShovelHits','worldEarlyMonsters','mineLevel','houseLevel','dungeonRoom','dungeonClearedRooms','dungeonChestOpened','dungeonEnemyHp','biomeBosses','caveBossDefeated','caveBossHp','caveChestOpened','treasureChests','mineTileX','mineTileY','mineRocks','tradeEntranceX','tradeEntranceY','furnaceCrafted','placedStructures','lootDrops','adventureQuestProgress','farmCrops','discovered','exploredCells','wolfBossActive','wolfBossHp','wolfBossX','wolfBossY','wolfBossKeyDropped','wolfCageOpen','wolfDogCaged','wolfBossDefeated','wolfCompanionUnlocked','wolfCompanionHp','wolfCompanionRevivals','wolfCompanionOffsetX','wolfCompanionOffsetY','dogBehavior','villageQuestStage','blacksmithQuestStage','explorerQuestStage','npcQuestState','villageReputation','lastVillageRaidDay']::text[])
  ) then raise exception using message = 'INVALID_SNAPSHOT_PAYLOAD'; end if;

  select * into v_room from public.co_op_rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.owner_id <> p_user_id then raise exception using message = 'OWNER_ONLY'; end if;
  if v_room.status <> 'running' then raise exception using message = 'ROOM_NOT_RUNNING'; end if;

  select version into v_version from public.co_op_world_snapshots where room_id = p_room_id for update;
  if not found then raise exception using message = 'SNAPSHOT_NOT_FOUND'; end if;
  if v_version <> p_expected_version then raise exception using message = 'SNAPSHOT_VERSION_CONFLICT'; end if;

  update public.co_op_world_snapshots
  set version = v_version + 1, payload = p_payload, saved_by = p_user_id, updated_at = now()
  where room_id = p_room_id;
  return jsonb_build_object('room_id',p_room_id,'version',v_version+1,'updated_at',now());
end;
$function$;

create or replace function public.get_co_op_world_snapshot(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.co_op_rooms%rowtype;
  v_snapshot public.co_op_world_snapshots%rowtype;
begin
  if p_user_id is null or p_room_id is null then raise exception using message = 'INVALID_SNAPSHOT_REQUEST'; end if;
  select * into v_room from public.co_op_rooms where id = p_room_id;
  if not found or v_room.status = 'closed' then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.co_op_members m
    where m.room_id = p_room_id and m.user_id = p_user_id and m.member_status in ('active','offline')
  ) then raise exception using message = 'NOT_A_MEMBER'; end if;
  select * into v_snapshot from public.co_op_world_snapshots where room_id = p_room_id;
  if not found then return jsonb_build_object('room_id',p_room_id,'version',0,'payload','{}'::jsonb,'updated_at',null); end if;
  return jsonb_build_object('room_id',p_room_id,'version',v_snapshot.version,'payload',v_snapshot.payload,'updated_at',v_snapshot.updated_at);
end;
$function$;

revoke all on function public.save_co_op_world_snapshot(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.get_co_op_world_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.save_co_op_world_snapshot(uuid,uuid,bigint,jsonb) to service_role;
grant execute on function public.get_co_op_world_snapshot(uuid,uuid) to service_role;
