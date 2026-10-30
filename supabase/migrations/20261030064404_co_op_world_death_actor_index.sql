create index if not exists co_op_rooms_world_death_by_idx
on public.co_op_rooms (world_death_by)
where world_death_by is not null;
