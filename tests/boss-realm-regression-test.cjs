'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const count = (pattern) => (source.match(pattern) || []).length;
assert.equal(count(/tier:'mob'/g), 8);
assert.equal(count(/tier:'elite'/g), 4);
assert.equal(count(/tier:'boss'/g), 4);
assert.equal(count(/tier:'god'/g), 2);
for (const event of ['meteor','horde','blood_moon','awakening','rift','storm']) {
  assert.ok(source.includes("['" + event + "'"), 'Missing Boss Realm event: ' + event);
}
for (const type of ['shadow_hunter','stone_guardian','cursed_skull','rift_wolf','venom_beetle','fallen_warrior','rift_archer','ash_spirit','abyss_general','blood_berserker','rift_warden','soul_devourer','abyss_king','rift_dragon','ancient_devourer','end_knight','astral_god','chronos_god']) {
  assert.ok(source.includes(type), 'Missing creature: ' + type);
}
for (const required of ['function updateBossRealmEnemies(dt)','function drawBossRealmCreature(m,x,y,time)','bossRealmInvisibleTimer=4.5','bossRealmDamageBoostTimer=5;bossRealmAbilityCooldown=10',"equipment.armor==='Нагрудник Бога'?.90",'урон меча меньше 67','bossRealmCreatures:bossRealmMode?',"document.getElementById('boss-realm-welcome')"]) {
  assert.ok(source.includes(required), 'Missing Boss Realm feature: ' + required);
}
assert.ok(source.includes("if(k==='v'") && source.includes('useBossRealmInvisibility'));
assert.ok(source.includes("if(k==='b'") && source.includes('useBossRealmDamageBoost'));
assert.ok(source.includes('m.phaseStage=2') && source.includes('m.phaseStage=3'));
console.log('SkyRealm Boss Realm roster, events, abilities, visuals and onboarding tests passed.');
