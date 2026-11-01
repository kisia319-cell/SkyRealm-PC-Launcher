drop policy if exists skyrealm_cloud_saves_no_direct_client_access on public.skyrealm_cloud_saves;
create policy skyrealm_cloud_saves_no_direct_client_access on public.skyrealm_cloud_saves
  for all to anon, authenticated using (false) with check (false);
