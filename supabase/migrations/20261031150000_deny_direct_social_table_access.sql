-- Defense in depth: only trusted Edge Functions may read or mutate private account/social rows.
create policy profiles_no_direct_client_access
  on public.profiles for all to anon, authenticated
  using (false) with check (false);
create policy friendships_no_direct_client_access
  on public.skyrealm_friendships for all to anon, authenticated
  using (false) with check (false);
create policy room_invites_no_direct_client_access
  on public.skyrealm_room_invites for all to anon, authenticated
  using (false) with check (false);

create index if not exists skyrealm_friendships_requested_by_idx
  on public.skyrealm_friendships(requested_by);
