-- Keep room-state constraints aligned with the values written by leave_co_op_room.
-- Owner exit transfers ownership and pauses the room; an empty room is closed.
alter table public.co_op_rooms
  drop constraint if exists co_op_rooms_pause_reason_check;
alter table public.co_op_rooms
  add constraint co_op_rooms_pause_reason_check
  check (pause_reason is null or pause_reason in (
    'owner_left','owner_timeout','manual','owner_transferred','owner_left_empty'
  ));

alter table public.co_op_audit_events
  drop constraint if exists co_op_audit_events_event_type_check;
alter table public.co_op_audit_events
  add constraint co_op_audit_events_event_type_check
  check (event_type in (
    'room_created','room_started','member_joined','member_left',
    'owner_paused','owner_resumed','pvp_changed','owner_timeout_paused',
    'shared_death','owner_transferred','owner_closed_empty_room'
  ));
