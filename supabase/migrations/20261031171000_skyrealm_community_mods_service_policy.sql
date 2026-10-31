drop policy if exists "service_role_manage_community_mods" on public.skyrealm_community_mods;
create policy "service_role_manage_community_mods" on public.skyrealm_community_mods for all to service_role using (true) with check (true);
