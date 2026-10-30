-- Co-op phase 2 follow-up: cover foreign keys and make backend-only RLS intent explicit.
create index if not exists co_op_audit_actor_id_idx
  on public.co_op_audit_events(actor_id);
create index if not exists co_op_world_snapshots_saved_by_idx
  on public.co_op_world_snapshots(saved_by);

drop policy if exists "co-op service role manages rooms" on public.co_op_rooms;
drop policy if exists "co-op service role manages members" on public.co_op_members;
drop policy if exists "co-op service role manages snapshots" on public.co_op_world_snapshots;
drop policy if exists "co-op service role manages audit" on public.co_op_audit_events;
drop policy if exists "co-op service role manages rate limits" on private.co_op_join_limits;

create policy "co-op service role manages rooms"
  on public.co_op_rooms for all to service_role
  using (true) with check (true);
create policy "co-op service role manages members"
  on public.co_op_members for all to service_role
  using (true) with check (true);
create policy "co-op service role manages snapshots"
  on public.co_op_world_snapshots for all to service_role
  using (true) with check (true);
create policy "co-op service role manages audit"
  on public.co_op_audit_events for all to service_role
  using (true) with check (true);
create policy "co-op service role manages rate limits"
  on private.co_op_join_limits for all to service_role
  using (true) with check (true);
