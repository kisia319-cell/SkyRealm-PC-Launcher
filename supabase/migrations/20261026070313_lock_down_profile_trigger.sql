-- Keep the Auth trigger function out of the public client API surface.
revoke all on function public.handle_skyrealm_new_user() from public, anon, authenticated;
