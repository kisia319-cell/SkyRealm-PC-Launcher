'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('style.css','utf8');
const edge=fs.readFileSync('supabase/functions/skyrealm-social/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261031130000_profile_social_foundation.sql','utf8');
for(const id of ['profile-display-name','profile-avatar','profile-bio','save-profile','profile-level','profile-xp','profile-playtime','profile-class','social-panel','social-search-form','social-search-input','social-search-results','social-friends-list','social-refresh','social-message']) {
  assert.ok(html.includes('id="'+id+'"'),'Missing UI element '+id);
}
for(const route of ['/api/social/profile','/api/social/search','/api/social/friends','/api/social/request','/api/social/respond','/api/social/remove','/api/social/stats']) {
  assert.ok(edge.includes('route==="'+route+'"'),'Missing API route '+route);
}
for(const feature of ['requestSocial','loadPlayerProfile','loadSocialFriends','searchSocialPlayers','socialPlayerCard']) assert.ok(app.includes(feature),'Missing client integration '+feature);
assert.ok(app.includes("u.pathname.replace('skyrealm-auth', 'skyrealm-social')"),'Social endpoint must target the dedicated Edge Function.');
assert.ok(edge.includes('await authenticate(req)'),'All social operations must authenticate users.');
assert.ok(edge.includes('SUPABASE_SERVICE_ROLE_KEY'),'Database access must remain server-side.');
assert.ok(edge.includes('INVALID_STATS')&&edge.includes('playtime_seconds'),'Profile stats must be range-validated.');
assert.ok(fs.readFileSync('game/game.js','utf8').includes('sync_profile_stats'),'Game saves must synchronize profile progress.');
assert.ok(fs.readFileSync('launcher.py','utf8').includes('def sync_profile_stats'),'Native bridge must send profile stats without exposing the token to game JavaScript.');
assert.ok(fs.readFileSync('launcher.py','utf8').includes('def backup_worlds')&&fs.readFileSync('launcher.py','utf8').includes('def restore_worlds'),'World backup and restore must be implemented in the native launcher.');
assert.ok(migration.includes('enable row level security')&&migration.includes('revoke all on public.skyrealm_friendships from anon, authenticated'),'Friendship table must not be directly exposed to clients.');
assert.ok(migration.includes('constraint skyrealm_friendships_pair_unique unique (user_a,user_b)'),'Friendship pairs must be unique.');
assert.ok(css.includes('.social-player')&&css.includes('.profile-stat-grid'),'Profile and social UI styles must exist.');
console.log('SkyRealm profile/social integration checks passed.');
