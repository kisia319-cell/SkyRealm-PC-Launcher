'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const count = (pattern) => (source.match(pattern) || []).length;
assert.equal(count(/tier:'mob'/g), 8);
assert.equal(count(/tier:'elite'/g), 5);
assert.equal(count(/tier:'boss'/g), 8);
assert.equal(count(/tier:'god'/g), 2);
for (const event of ['meteor','horde','blood_moon','awakening','rift','storm']) {
  assert.ok(source.includes("['" + event + "'") || source.includes('["' + event + '"'), 'Missing Boss Realm event: ' + event);
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

assert.ok(source.includes('function drawBossRealmWreckage(camX,camY,time)') && source.includes('drawBossRealmWreckage(camX,camY,time);'), 'Boss Realm must render deterministic ruined-world landmarks and scattered wreckage');
assert.ok(source.includes('const crack=hash(seed,521)') && source.includes('Slow ash motes add depth'), 'Boss Realm ground must include cracked slabs, rubble and atmospheric ash');
assert.ok(source.includes('const theme=bossRealmArenaTheme(),etchColor=')&&source.includes('hash(seed,811)<=.84'), 'Boss Realm stone floor must retain deterministic theme-matched animated engravings.');
assert.ok(source.includes('const ringPulse=.5+.5*Math.sin(time/430)')&&source.includes('ctx.setLineDash([12,9,3,11])'), 'All four existing boss arenas must have layered animated perimeter engravings.');
assert.ok(source.includes('function drawBossRealmGroundTile(')&&source.includes('let bossRealmGroundCache = null;')&&source.includes('chunks:new Map()')&&source.includes('let buildBudget=4;')&&source.includes('ctx.drawImage(chunk.canvas'), 'Boss Realm stone floor must use a bounded, incrementally warmed chunk cache without removing its detailed tile artwork');
assert.ok(source.includes('function ensureBossRealmDungeonSites()')&&source.includes('if(alreadyReady)return existing;'), 'Boss Realm arena records must be reused instead of rebuilt on every update');
const perfUpdate=source.slice(bossUpdateStart,bossUpdateEnd);
assert.ok(perfUpdate.includes('const realmSites=ensureBossRealmDungeonSites();')&&perfUpdate.includes('activeRadiusSq')&&perfUpdate.includes('realmSites.find'), 'Boss Realm simulation must precompute its active window and reuse arena lookup data');
assert.ok(source.includes('const palettes={forest:')&&source.includes("const p=palettes[biome],quality=gameSettings.graphicsQuality!=='low'&&gameSettings.performanceMode!=='boost'")&&source.includes('Stable, low-cost surface grain'), 'Ordinary-world biomes must have deterministic layered ground texture without extra entities.');

const corruptionStart=source.indexOf('function drawBossRealmCreatureMuseums(camX,camY,time)');
const corruptionEnd=source.indexOf('function drawBossRealmWreckage',corruptionStart);
const corruption=source.slice(corruptionStart,corruptionEnd);
assert.ok(corruption.includes('createRadialGradient') && corruption.includes('ctx.setLineDash([12,9,3,11])'), 'Mob arenas must use natural scorched ground and broken rune marks, not giant square display cages');
assert.ok(source.includes('function showDeathScreen(context)') && source.includes('ВЫ УМЕРЛИ'), 'Death must show a full-screen YOU DIED panel');
assert.ok(source.includes('data-death-respawn') && source.includes('data-death-menu'), 'Death panel must expose respawn and main-menu choices');
assert.ok(source.includes('function completeDeathRespawn()') && source.includes('function leaveDeathToMainMenu()'), 'Death panel choices must have working handlers');
assert.ok(source.includes('Ты возродился у разломного портала') && source.includes('Ты возродился у кровати'), 'Respawn must return the player safely to the current realm or bed');

console.log('SkyRealm Boss Realm roster, ruined environment, death screen, respawn, events and abilities tests passed.');
assert.ok(source.includes('function drawWorldEventShrine(camX,camY,time)')&&source.includes('function collectWorldEventShrine()'), 'Ordinary world must include a collectible ancient shrine event');
assert.ok(source.includes('worldEventShrine:worldEventShrine?')&&source.includes('lastWorldShrineDay'), 'Ancient shrine event must persist across saves');
assert.ok(source.includes('переходит во вторую фазу и призывает подкрепление')&&source.includes('выпускает ударную волну'), 'Boss Realm bosses must gain new phase mechanics');
assert.ok(source.includes("awakened_tree:{name:'Пробуждённый древень'")&&source.includes('function awakenBossTree(tree)'), 'Chopping a Boss Realm tree must awaken a tree monster');
assert.ok(source.includes("m.realmType==='awakened_tree'")&&source.includes('Сердцевина древня'), 'Awakened tree must have a distinct model and guaranteed trophy');
assert.ok(source.includes('fruitful:hash(x + 701, y + 313) > .94')&&source.includes('Лесные ягоды'), 'Ordinary world must generate animated fruit trees with a harvest reward');
