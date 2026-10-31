'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('style.css','utf8');
const edge=fs.readFileSync('supabase/functions/skyrealm-social/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261031130000_profile_social_foundation.sql','utf8');
const inviteMigration=fs.readFileSync('supabase/migrations/20261031140000_coop_friend_invites.sql','utf8');
const accessMigration=fs.readFileSync('supabase/migrations/20261031150000_deny_direct_social_table_access.sql','utf8');
const coopUi=fs.readFileSync('game/multiplayer-ui.js','utf8');
const coopClient=fs.readFileSync('game/multiplayer-client.js','utf8');
const gameHtml=fs.readFileSync('game/index.html','utf8');
for(const id of ['profile-display-name','profile-avatar','profile-bio','save-profile','profile-level','profile-xp','profile-playtime','profile-class','social-panel','social-search-form','social-search-input','social-search-results','social-friends-list','social-refresh','social-message']) {
  assert.ok(html.includes('id="'+id+'"'),'Missing UI element '+id);
}
for(const route of ['/api/social/profile','/api/social/search','/api/social/friends','/api/social/request','/api/social/respond','/api/social/remove','/api/social/stats','/api/social/room-invites','/api/social/room-invites/respond']) {
  assert.ok(edge.includes('route==="'+route+'"'),'Missing API route '+route);
}
for(const feature of ['requestSocial','loadPlayerProfile','loadSocialFriends','searchSocialPlayers','socialPlayerCard']) assert.ok(app.includes(feature),'Missing client integration '+feature);
assert.ok(app.includes("u.pathname.replace('skyrealm-auth', 'skyrealm-social')"),'Social endpoint must target the dedicated Edge Function.');
assert.ok(edge.includes('await authenticate(req)'),'All social operations must authenticate users.');
assert.ok(edge.includes('SUPABASE_SERVICE_ROLE_KEY'),'Database access must remain server-side.');
assert.ok(edge.includes('INVALID_STATS')&&edge.includes('playtime_seconds'),'Profile stats must be range-validated.');
assert.ok(fs.readFileSync('game/game.js','utf8').includes('sync_profile_stats'),'Game saves must synchronize profile progress.');
assert.ok(fs.readFileSync('launcher.py','utf8').includes('def sync_profile_stats'),'Native bridge must send profile stats without exposing the token to game JavaScript.');
const launcherSource=fs.readFileSync('launcher.py','utf8');
assert.match(launcherSource,/def get_auth_session\(self\):[\\s\\S]{0,350}return \{\"token\": self\._session_token\}/,'Game auth session must remain available for repeated profile and co-op requests.');
assert.doesNotMatch(launcherSource,/def get_auth_session\(self\):[\\s\\S]{0,200}self\._session_token\s*=\s*\"\"/,'Reading the game auth session must not erase the native sync token.');
assert.ok(fs.readFileSync('launcher.py','utf8').includes('def backup_worlds')&&fs.readFileSync('launcher.py','utf8').includes('def restore_worlds'),'World backup and restore must be implemented in the native launcher.');
assert.ok(migration.includes('enable row level security')&&migration.includes('revoke all on public.skyrealm_friendships from anon, authenticated'),'Friendship table must not be directly exposed to clients.');
assert.ok(migration.includes('constraint skyrealm_friendships_pair_unique unique (user_a,user_b)'),'Friendship pairs must be unique.');
assert.ok(css.includes('.social-player')&&css.includes('.profile-stat-grid'),'Profile and social UI styles must exist.');
assert.ok(inviteMigration.includes('create table if not exists public.skyrealm_room_invites'));
assert.ok(inviteMigration.includes('enable row level security')&&inviteMigration.includes('revoke all on public.skyrealm_room_invites from anon, authenticated'));
assert.ok(accessMigration.includes('profiles_no_direct_client_access')&&accessMigration.includes('friendships_no_direct_client_access')&&accessMigration.includes('room_invites_no_direct_client_access'));
assert.ok(accessMigration.includes('skyrealm_friendships_requested_by_idx'));
assert.ok(edge.includes('OWNER_ONLY')&&edge.includes('ROOM_FULL')&&edge.includes('ROOM_INVITE_LIMIT')&&edge.includes('join_co_op_room'),'Room invites must enforce room ownership and existing join/room-capacity rules.');
for(const id of ['coop-friend-tools','coop-friend-invite-toggle','coop-friend-invite-list','coop-incoming-invites','coop-incoming-count','coop-incoming-invites-list']) assert.ok(gameHtml.includes('id=\"'+id+'\"'));
for(const feature of ['sendRoomInvite','getRoomInvites','respondRoomInvite']) assert.ok(coopClient.includes(feature));
assert.ok(coopUi.includes('refreshIncomingInvites')&&coopUi.includes('showFriendInviteChoices'));
console.log('SkyRealm profile/social integration checks passed.');
