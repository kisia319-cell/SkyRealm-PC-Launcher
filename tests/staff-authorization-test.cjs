'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const game = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../game/index.html'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261103043128_skyrealm_staff_roles.sql'), 'utf8');
const edge = fs.readFileSync(path.join(__dirname, '../supabase/functions/skyrealm-staff/index.ts'), 'utf8');

assert.match(migration, /create table if not exists public\.skyrealm_staff_roles/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /force row level security/i);
assert.match(migration, /revoke all on table public\.skyrealm_staff_roles from public, anon, authenticated/i);
assert.match(migration, /grant select, insert, update, delete on table public\.skyrealm_staff_roles to service_role/i);
assert.match(migration, /lower\(username\)\s*=\s*'kisia'/i);
assert.match(migration, /v_owner_count\s*<>\s*1/i);

assert.match(edge, /\/auth\/v1\/user/);
assert.match(edge, /Authorization:\s*"Bearer "\s*\+\s*token/);
assert.match(edge, /async function currentRole/);
assert.match(edge, /await requireAdmin\(user\.id\)/);
assert.match(edge, /if \(current\?\.role === "admin"\)/);
assert.match(edge, /\/api\/staff\/moderators/);
assert.match(edge, /\/api\/staff\/players/);
assert.doesNotMatch(edge, /user_metadata\s*\./, 'Role authorization must never trust editable user metadata.');
assert.doesNotMatch(edge, /\/api\/staff\/bans|global_bans|ban_user/i, 'This feature must not add global server bans.');

const sync = game.match(/function syncAdminMenu\(\)\s*\{[\s\S]*?\n  \}/);
assert.ok(sync, 'Game must have a single staff menu visibility function.');
assert.match(sync[0], /currentStaffRole/);
assert.doesNotMatch(sync[0], /gameSettings\.(?:adminMode|moderatorMode)/,
  'Local preferences must never grant staff rights.');
assert.match(game, /async function refreshStaffRole/);
assert.match(game, /staffRequest\('\/api\/staff\/me'\)/);
assert.match(game, /function openAdminPanel\(\)\s*\{if\(currentStaffRole!=='admin'\)/);
assert.match(game, /async function openModeratorPanel/);
assert.match(game, /currentStaffRole!=='admin'&&currentStaffRole!=='moderator'/);
assert.match(game, /void refreshStaffRole\(true\)/);
assert.match(html, /id="admin-staff-select"/);
assert.match(html, /id="admin-staff-grant"/);
assert.match(html, /id="admin-staff-revoke"/);
assert.match(html, /Список блокировки ниже действует только локально/);
assert.match(html, /не блокирует сетевые аккаунты/);

console.log('SkyRealm server-backed staff authorization and privilege-boundary tests passed.');


