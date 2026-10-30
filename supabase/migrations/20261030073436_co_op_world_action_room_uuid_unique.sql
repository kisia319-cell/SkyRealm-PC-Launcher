-- A room action UUID is globally unique within the room, not merely per actor.
-- This keeps owner-side lookup/commit unambiguous across participants.
create unique index if not exists co_op_world_actions_room_action_uidx
on public.co_op_world_actions(room_id, action_id);
