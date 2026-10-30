drop index if exists public.co_op_one_active_room_per_user;
create unique index co_op_one_active_room_per_user on public.co_op_members(user_id) where member_status in ('active','offline');
