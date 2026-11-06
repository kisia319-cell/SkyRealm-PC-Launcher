'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const count = (pattern) => (source.match(pattern) || []).length;
assert.equal(count(/tier:'mob'/g), 8);
assert.equal(count(/tier:'elite'/g), 4);
assert.equal(count(/tier:'boss'/g), 8);
assert.equal(count(/tier:'god'/g), 2);
for (const event of ['meteor','horde','blood_moon','awakening','rift','storm']) {
  assert.ok(source.includes("['" + event + "'"), 'Missing Boss Realm event: ' + event);
}
for (const type of ['shadow_hunter','stone_guardian','cursed_skull','rift_wolf','venom_beetle','fallen_warrior','rift_archer','ash_spirit','abyss_general','blood_berserker','rift_warden','soul_devourer','abyss_king','rift_dragon','ancient_devourer','end_knight','astral_god','chronos_god','magma_behemoth','frost_empress','void_mirror','worldbreaker_colossus']) {
  assert.ok(source.includes(type), 'Missing creature: ' + type);
}
for (const required of ['function updateBossRealmEnemies(dt)','function drawBossRealmCreature(m,x,y,time)','bossRealmInvisibleTimer=4.5','bossRealmDamageBoostTimer=5;bossRealmAbilityCooldown=10',"equipment.armor==='Нагрудник Бога'?.90",'урон меча меньше 67','bossRealmCreatures:bossRealmMode?',"document.getElementById('boss-realm-welcome')"]) {
  assert.ok(source.includes(required), 'Missing Boss Realm feature: ' + required);
}
assert.ok(source.includes("if(k==='v'") && source.includes('useBossRealmInvisibility'));
assert.ok(source.includes("if(k==='b'") && source.includes('useBossRealmDamageBoost'));
assert.ok(source.includes('m.phaseStage=2') && source.includes('m.phaseStage=3'));
const mobUpdateStart=source.indexOf('function updateMonsters(dt){');
const bossDispatch=source.indexOf('if(bossRealmMode){updateBossRealmEnemies(dt);return;}',mobUpdateStart);
const surfaceGuard=source.indexOf('if(tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode){return;}',mobUpdateStart);
assert.ok(mobUpdateStart>=0&&bossDispatch>mobUpdateStart&&surfaceGuard>bossDispatch,'Boss Realm combat must update before surface-world mode guards');
const bossUpdateStart=source.indexOf('function updateBossRealmEnemies(dt){');
const bossUpdateEnd=source.indexOf('function drawBossRealmCreature',bossUpdateStart);
const bossUpdate=source.slice(bossUpdateStart,bossUpdateEnd);
assert.ok(bossUpdate.includes('if(!Number.isFinite(m.maxHp)||m.maxHp<1)'), 'Repair missing boss mob max HP');
assert.ok(bossUpdate.includes('if(!Number.isFinite(m.hp))m.hp=m.maxHp'), 'Repair missing boss mob HP');
assert.ok(bossUpdate.includes('if(attackDistance<58&&m.attackCooldown<=0'), 'Boss Realm mobs must have a working melee attack');
assert.ok(bossUpdate.includes('bossRealmSpecial(m,d,attackDistance)'), 'Boss Realm mobs must use their special attacks');
assert.ok(bossUpdate.includes('m.x=nx;m.y=ny'), 'Boss Realm mobs must be able to move toward the player in the arena');
console.log('SkyRealm Boss Realm roster, events, abilities, visuals and onboarding tests passed.');
