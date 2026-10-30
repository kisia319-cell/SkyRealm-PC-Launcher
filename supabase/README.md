# Supabase migrations

The SQL files under `migrations/` are ordered to match the applied migration history of the connected SkyRealm Supabase project.

## Deployment notes

- The first three migrations establish the existing SkyRealm profile/Auth trigger baseline. The profile table deliberately has RLS enabled with no client policies; account/profile access remains through the existing server-side Auth integration.
- Co-op tables, room RPCs, private Realtime topic policies, shared clock, shared death and snapshot API are separate ordered migrations. Co-op data is not stored in the local single-player save tables.
- For the already-provisioned project, these versions are already recorded as applied. Do not manually re-run them against production; use the migration history and normal Supabase migration workflow.
- On a fresh Supabase project, confirm required Auth roles/extensions exist and apply the migrations in timestamp order before deploying `supabase/functions/skyrealm-coop`.
- Keep the service-role secret only in Edge Function secrets. The client must only use the publishable key and the signed-in user's access token.
- Before production Realtime use, verify in the Supabase Dashboard that project-wide public channel access is disabled. Room topic RLS policies alone are not a substitute for that project-level check.
- Review the Supabase Auth leaked-password-protection setting before public registration is opened.
