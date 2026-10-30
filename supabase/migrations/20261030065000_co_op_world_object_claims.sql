-- Atomic one-time claims for shared treasure chests.
create table if not exists public.co_op_world_claims (
  room_id uuid not null references public.co_op_rooms(id) on delete cascade,
  object_kind text not null check (object_kind in ('treasure_chest')),
  object_id text not null check (object_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz not null default now(),
  primary key (room_id, object_kind, object_id)
);
create index if not exists co_op_world_claims_claimed_by_idx on public.co_op_world_claims(claimed_by);
alter table public.co_op_world_claims enable row level security;
revoke all on public.co_op_world_claims from public, anon, authenticated;
grant all on public.co_op_world_claims to service_role;
drop policy if exists "co-op service role manages world claims" on public.co_op_world_claims;
create policy "co-op service role manages world claims"
  on public.co_op_world_claims for all to service_role using (true) with check (true);

create or replace function public.claim_co_op_world_object(p_user_id uuid,p_room_id uuid,p_object_kind text,p_object_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_room public.co_op_rooms%rowtype; v_rows integer;
begin
  if p_user_id is null or p_room_id is null or p_object_kind is distinct from 'treasure_chest'
     or coalesce(p_object_id,'') !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
    raise exception using message='INVALID_WORLD_OBJECT';
  end if;
  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
  if not exists(select 1 from public.co_op_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.member_status='active') then
    raise exception using message='NOT_A_MEMBER';
  end if;

  insert into public.co_op_world_claims(room_id,object_kind,object_id,claimed_by)
  values(p_room_id,p_object_kind,p_object_id,p_user_id)
  on conflict(room_id,object_kind,object_id) do nothing;
  get diagnostics v_rows=row_count;
  if v_rows=0 then
    return jsonb_build_object('claimed',false,'room_id',p_room_id,'object_kind',p_object_kind,'object_id',p_object_id);
  end if;

  update public.co_op_world_snapshots s
  set version=s.version+1,
      payload=jsonb_set(coalesce(s.payload,'{}'::jsonb),'{treasureChests}',
        case when jsonb_typeof(s.payload->'treasureChests')='array' then (
          select coalesce(jsonb_agg(
            case when item.chest->>'id'=p_object_id then jsonb_set(item.chest,'{opened}','true'::jsonb,true)
            else item.chest end
          ),'[]'::jsonb)
          from jsonb_array_elements(s.payload->'treasureChests') as item(chest)
        ) else '[]'::jsonb end,true),
      saved_by=p_user_id,updated_at=now()
  where s.room_id=p_room_id;
  if not found then raise exception using message='SNAPSHOT_NOT_FOUND'; end if;
  return jsonb_build_object('claimed',true,'room_id',p_room_id,'object_kind',p_object_kind,'object_id',p_object_id);
end;
$function$;

create or replace function public.save_co_op_world_snapshot(p_user_id uuid,p_room_id uuid,p_expected_version bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_room public.co_op_rooms%rowtype; v_version bigint; v_payload jsonb:=p_payload;
begin
  if p_user_id is null or p_room_id is null or p_expected_version is null or p_expected_version<0 then
    raise exception using message='INVALID_SNAPSHOT_REQUEST';
  end if;
  if jsonb_typeof(v_payload) is distinct from 'object' or octet_length(v_payload::text)>65536 then
    raise exception using message='INVALID_SNAPSHOT_PAYLOAD';
  end if;
  if exists(select 1 from jsonb_object_keys(v_payload) as provided(key)
    where provided.key<>all(array[
      'clearedSnowTiles','snowShovelHits','worldEarlyMonsters','mineLevel','houseLevel','dungeonRoom',
      'dungeonClearedRooms','dungeonChestOpened','dungeonEnemyHp','biomeBosses','caveBossDefeated','caveBossHp',
      'caveChestOpened','treasureChests','mineTileX','mineTileY','mineRocks','tradeEntranceX','tradeEntranceY',
      'furnaceCrafted','placedStructures','lootDrops','adventureQuestProgress','farmCrops','discovered','exploredCells',
      'wolfBossActive','wolfBossHp','wolfBossX','wolfBossY','wolfBossKeyDropped','wolfCageOpen','wolfDogCaged',
      'wolfBossDefeated','wolfCompanionUnlocked','wolfCompanionHp','wolfCompanionRevivals','wolfCompanionOffsetX',
      'wolfCompanionOffsetY','dogBehavior','villageQuestStage','blacksmithQuestStage','explorerQuestStage',
      'npcQuestState','villageReputation','lastVillageRaidDay'
    ]::text[])) then raise exception using message='INVALID_SNAPSHOT_PAYLOAD'; end if;

  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if v_room.owner_id<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
  if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
  select version into v_version from public.co_op_world_snapshots where room_id=p_room_id for update;
  if not found then raise exception using message='SNAPSHOT_NOT_FOUND'; end if;
  if v_version<>p_expected_version then raise exception using message='SNAPSHOT_VERSION_CONFLICT'; end if;

  if jsonb_typeof(v_payload->'treasureChests')='array' then
    v_payload:=jsonb_set(v_payload,'{treasureChests}',(
      select coalesce(jsonb_agg(
        case when exists(select 1 from public.co_op_world_claims c
          where c.room_id=p_room_id and c.object_kind='treasure_chest' and c.object_id=item.chest->>'id')
          then jsonb_set(item.chest,'{opened}','true'::jsonb,true)
          else item.chest end
      ),'[]'::jsonb)
      from jsonb_array_elements(v_payload->'treasureChests') as item(chest)
    ),true);
  end if;
  update public.co_op_world_snapshots set version=v_version+1,payload=v_payload,saved_by=p_user_id,updated_at=now()
  where room_id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'version',v_version+1,'updated_at',now());
end;
$function$;

revoke all on function public.claim_co_op_world_object(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_co_op_world_object(uuid,uuid,text,text) to service_role;
revoke all on function public.save_co_op_world_snapshot(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_co_op_world_snapshot(uuid,uuid,bigint,jsonb) to service_role;
