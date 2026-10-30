-- Shared world clock: only the room owner may advance the canonical clock.
alter table public.co_op_rooms
  add column if not exists world_clock_minute numeric not null default 480,
  add column if not exists world_survived_nights integer not null default 0,
  add column if not exists world_blood_moon_active boolean not null default false,
  add column if not exists world_clock_updated_at timestamptz not null default now();

create or replace function public.set_co_op_world_clock(
  p_user_id uuid,
  p_room_id uuid,
  p_minute_total numeric,
  p_survived_nights integer,
  p_blood_moon_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.co_op_rooms%rowtype;
begin
  select * into v_room from public.co_op_rooms where id=p_room_id for update;
  if not found then raise exception using message='ROOM_NOT_FOUND'; end if;
  if v_room.owner_id<>p_user_id then raise exception using message='OWNER_ONLY'; end if;
  if v_room.status<>'running' then raise exception using message='ROOM_NOT_RUNNING'; end if;
  if p_minute_total is null or p_minute_total<0 or p_minute_total>100000000 then
    raise exception using message='INVALID_WORLD_CLOCK';
  end if;
  if p_survived_nights is null or p_survived_nights<0 or p_survived_nights>1000000 then
    raise exception using message='INVALID_WORLD_CLOCK';
  end if;
  if p_blood_moon_active is null then raise exception using message='INVALID_WORLD_CLOCK'; end if;
  update public.co_op_rooms
  set world_clock_minute=round(p_minute_total,3),
      world_survived_nights=p_survived_nights,
      world_blood_moon_active=p_blood_moon_active,
      world_clock_updated_at=now(),
      updated_at=now()
  where id=p_room_id;
  return jsonb_build_object(
    'room_id',p_room_id,
    'minute_total',round(p_minute_total,3),
    'survived_nights',p_survived_nights,
    'blood_moon_active',p_blood_moon_active,
    'updated_at',now()
  );
end;
$function$;

revoke all on function public.set_co_op_world_clock(uuid,uuid,numeric,integer,boolean) from public, anon, authenticated;
grant execute on function public.set_co_op_world_clock(uuid,uuid,numeric,integer,boolean) to service_role;
