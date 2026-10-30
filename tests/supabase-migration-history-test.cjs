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
  '20261030065000_co_op_world_object_claims.sql'
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
console.log('SkyRealm Supabase migration history tests passed.');
