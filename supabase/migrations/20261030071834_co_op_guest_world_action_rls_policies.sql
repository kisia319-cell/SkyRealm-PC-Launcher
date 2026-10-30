-- Explicit service-role policies. Browser roles remain unable to access either table.
create policy "co-op service role manages world actions"
on public.co_op_world_actions for all to service_role using (true) with check (true);
create policy "co-op service role manages world action limits"
on private.co_op_world_action_limits for all to service_role using (true) with check (true);
