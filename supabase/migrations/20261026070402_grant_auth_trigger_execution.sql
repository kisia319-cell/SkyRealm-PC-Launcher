-- The Supabase Auth database role and the server-side backend need trigger execution.
grant execute on function public.handle_skyrealm_new_user() to service_role, supabase_auth_admin;
