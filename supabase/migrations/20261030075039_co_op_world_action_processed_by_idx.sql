-- Cover the processed_by foreign key for efficient user deletion and lookup.
create index if not exists co_op_world_actions_processed_by_idx
  on public.co_op_world_actions(processed_by)
  where processed_by is not null;
