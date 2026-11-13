'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../supabase/migrations');
const expected = [
  '20261026070056_skyrealm_profiles.sql',
  '20261026070313_lock_down_profile_trigger.sql',
  '20261026070402_grant_auth_trigger_execution.sql',
  '20261030052954_co_op_rooms_phase2.sql',
  '20261030053002_co_op_rooms_phase2_objects.sql',
  '20261030053045_co_op_policy_indexes.sql',
  '20261030053443_co_op_single_active_membership.sql',
  '20261030053836_co_op_resume_previous_state.sql',
  '20261030054534_co_op_pause_owner_lobby_timeout.sql',
  '20261030055012_co_op_shared_difficulty_start.sql',
  '20261030055509_co_op_shared_world_clock.sql',
  '20261030060250_co_op_shared_death.sql',
  '20261030063839_co_op_world_snapshot_api.sql',
  '20261030064404_co_op_world_death_actor_index.sql',
  '20261030065659_co_op_world_object_claims.sql',
  '20261030070348_co_op_extended_world_chest_claims.sql',
  '20261030071818_co_op_guest_world_action_queue.sql',
  '20261030071834_co_op_guest_world_action_rls_policies.sql',
  '20261030073436_co_op_world_action_room_uuid_unique.sql',
  '20261030074001_co_op_guest_farm_actions.sql',
  '20261030075039_co_op_world_action_processed_by_idx.sql',
  '20261030080502_co_op_guest_mining_actions.sql',
  '20261030080832_co_op_guest_mining_validation_fix.sql',
  '20261030081255_co_op_guest_tree_chop_actions.sql',
  '20261030091246_co_op_guest_class_action_payloads.sql',
  '20261031120000_co_op_shared_enemies_loot.sql',
  '20261031130000_profile_social_foundation.sql',
  '20261031140000_coop_friend_invites.sql',
  '20261031150000_deny_direct_social_table_access.sql',
  '20261031170000_skyrealm_community_mods.sql',
  '20261031170500_skyrealm_community_mods_defense_effect.sql',
  '20261031171000_skyrealm_community_mods_service_policy.sql',
  '20261101060045_coop_owner_leave_constraint_fix.sql',
  '20261101120000_skyrealm_private_messages.sql',
  '20261101140643_skyrealm_cloud_saves.sql',
  '20261101140737_skyrealm_cloud_saves_deny_policy.sql',
  '20261101172558_social_presence_status.sql',
  '20261103043128_skyrealm_staff_roles.sql',
  '20261103144757_staff_role_expiry_and_public_bootstrap.sql',
  '20261103150208_staff_admin_bootstrap_claim_code.sql',
  '20261107165757_skyrealm_public_mod_catalog.sql',
  '20261107180303_skyrealm_roadmap_voting.sql',
  '20261107180626_skyrealm_roadmap_voting_user_indexes.sql',
  '20261111084224_skyrealm_custom_avatars.sql',
  '20261112130449_prime_online_1v1.sql',
  '20261112131547_prime_online_presence.sql',
  '20261112132846_prime_online_queue_keepalive.sql',
  '20261113120000_prime_friend_lobbies.sql'
];
const actual = fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
assert.deepEqual(actual, expected, 'SQL migration files must match the connected Supabase migration history');
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
assert.ok(read(expected[0]).includes('create table if not exists public.profiles'));
assert.ok(read(expected[4]).includes('create or replace function public.create_co_op_room'));
assert.ok(read(expected[10]).includes('set_co_op_world_clock'));
assert.ok(read(expected[11]).includes('record_co_op_shared_death'));
assert.ok(read(expected[12]).includes('save_co_op_world_snapshot'));
assert.ok(read(expected[13]).includes('co_op_rooms_world_death_by_idx'));
assert.ok(read(expected[14]).includes('claim_co_op_world_object'));
assert.ok(read(expected[14]).includes('co_op_world_claims'));
assert.ok(read(expected[15]).includes("'cave_chest','dungeon_chest'"));
assert.ok(read(expected[15]).includes('dungeonChestOpened'));
assert.ok(read(expected[16]).includes('enqueue_co_op_world_action'));
assert.ok(read(expected[16]).includes('commit_co_op_world_action'));
assert.ok(read(expected[17]).includes('co-op service role manages world actions'));
assert.ok(read(expected[18]).includes('co_op_world_actions_room_action_uidx'));
assert.ok(read(expected[19]).includes('commit_co_op_farm_action'));
assert.ok(read(expected[20]).includes('co_op_world_actions_processed_by_idx'));
assert.ok(read(expected[21]).includes('commit_co_op_mine_action'));
assert.ok(read(expected[21]).includes("'mine_rock'"));
assert.ok(read(expected[22]).includes("p_payload - array['rock_index','tool']::text[]"));
assert.ok(read(expected[23]).includes('commit_co_op_tree_action'));
assert.ok(read(expected[23]).includes("'chop_tree'"));
assert.ok(read(expected[24]).includes("rock_index','tool','player_class','miner_skill_level"));
assert.ok(read(expected[24]).includes("x','y','player_class','farmer_skill_level','has_sickle"));
assert.ok(read(expected[24]).includes("'farmer_skill_level'"));
assert.ok(read(expected[24]).includes("'miner_skill_level'"));
assert.ok(read(expected[25]).includes("commit_co_op_enemy_action"));
assert.ok(read(expected[25]).includes("'damage_enemy'"));
assert.ok(read(expected[25]).includes("'pickup_loot'"));
assert.ok(read(expected[25]).includes("SHARED_LOOT_ALREADY_CLAIMED"));
assert.ok(read(expected[26]).includes('create table if not exists public.skyrealm_friendships'));
assert.ok(read(expected[26]).includes('profiles_avatar_key_check'));
assert.ok(read(expected[26]).includes('revoke all on public.skyrealm_friendships from anon, authenticated'));
assert.ok(read(expected[27]).includes('create table if not exists public.skyrealm_room_invites'));
assert.ok(read(expected[27]).includes('revoke all on public.skyrealm_room_invites from anon, authenticated'));
assert.ok(read(expected[27]).includes('constraint skyrealm_room_invites_pair_unique unique (room_id, invitee_id)'));
assert.ok(read(expected[28]).includes('profiles_no_direct_client_access'));
assert.ok(read(expected[28]).includes('friendships_no_direct_client_access'));
assert.ok(read(expected[28]).includes('room_invites_no_direct_client_access'));
assert.ok(read(expected[28]).includes('skyrealm_friendships_requested_by_idx'));
assert.ok(read(expected[32]).includes('owner_transferred'));
assert.ok(read(expected[32]).includes('owner_closed_empty_room'));
assert.ok(read(expected[33]).includes('create table if not exists public.skyrealm_messages'));
assert.ok(read(expected[33]).includes('skyrealm_messages_no_direct_client_access'));
assert.ok(read(expected[34]).includes('create table if not exists public.skyrealm_cloud_saves'));
assert.ok(read(expected[34]).includes('revoke all on public.skyrealm_cloud_saves from public, anon, authenticated'));
assert.ok(read(expected[35]).includes('skyrealm_cloud_saves_no_direct_client_access'));
assert.ok(read(expected[37]).includes('create table if not exists public.skyrealm_staff_roles'));
assert.ok(read(expected[37]).includes('force row level security'));
assert.ok(read(expected[37]).includes('grant select, insert, update, delete on table public.skyrealm_staff_roles to service_role'));
assert.ok(read(expected[37]).includes("lower(username) = 'kisia'"));
assert.ok(read(expected[38]).includes('expires_at'));
assert.ok(read(expected[38]).includes('public_grants_enabled'));
assert.ok(read(expected[39]).includes('bootstrap_code_hash'));
assert.ok(read(expected[40]).includes('create table if not exists public.skyrealm_mod_releases'));
assert.ok(read(expected[40]).includes('skyrealm_mod_releases_public_read'));
assert.ok(read(expected[40]).includes('skyrealm-community-mods'));
assert.ok(read(expected[41]).includes('create table if not exists public.skyrealm_roadmap_ideas'));
assert.ok(read(expected[41]).includes('unique(idea_id,user_id)'));
assert.ok(read(expected[42]).includes('skyrealm_roadmap_submissions_user_created_idx'));
assert.ok(read(expected[42]).includes('skyrealm_roadmap_votes_user_idx'));
assert.ok(read(expected[43]).includes("'skyrealm-avatars'")&&read(expected[43]).includes('auth.uid()::text'));
assert.ok(read(expected[44]).includes('create table if not exists public.prime_match_queue'));
assert.ok(read(expected[44]).includes('prime_finish_match'));
assert.ok(read(expected[45]).includes('host_seen_at'));
assert.ok(read(expected[46]).includes("last_seen_at < now()-interval '45 seconds'"));

console.log('SkyRealm Supabase migration history tests passed.');



assert.ok(read(expected[expected.length-1]).includes('create table if not exists public.prime_lobbies'));
assert.ok(read(expected[expected.length-1]).includes('prime_lobby_one_active_per_user'));
