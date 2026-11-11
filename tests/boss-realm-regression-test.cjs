'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const count = (pattern) => (source.match(pattern) || []).length;
assert.equal(count(/tier:'mob'/g), 8);
assert.equal(count(/tier:'elite'/g), 6);
assert.equal(count(/tier:'boss'/g), 9);
assert.equal(count(/tier:'god'/g), 2);
for (const name of ['Око архивариуса','Печать времени','Сердце корней','Камень эха','Клык титана','Сфера жизни','Мантия архивариуса','Диадема эха','Доспехи корневого стража','Корона живого корня']) assert.ok(source.includes(name), 'Missing cave exclusive item: '+name);
for (const effect of ["equipment.artifact==='Око архивариуса'","equipment.artifact==='Сердце корней'","equipment.artifact==='Клык титана'","equipment.artifact==='Сфера жизни'","applyArtifactKillEffects()","player.hp+healing","equipment.artifact==='Камень эха'"]) assert.ok(source.includes(effect), 'Missing equipped artifact effect: '+effect);
assert.ok(source.includes("changeItem('Око архивариуса',1)") && source.includes("changeItem('Доспехи корневого стража',1)"), 'Secret room chests must grant exclusive artifacts and armor.');
assert.ok(source.includes("changeItem('Клык титана',1)") && source.includes("changeItem('Сфера жизни',1)"), 'Both one-time secret chests must grant their new exclusive artifacts.');
assert.equal((source.match(/applyArtifactKillEffects\(\);/g)||[]).length,2,'Player and companion kills must both trigger equipped artifact healing.');
assert.ok(source.includes("equipment.artifact==='Око архивариуса'&&equipment.armor==='Мантия архивариуса'")&&source.includes("equipment.artifact==='Камень эха'&&equipment.helmet==='Корона живого корня'"), 'Matching relic armor must activate artifact set bonuses.');
for (const feature of ['ARTIFACT_EVOLUTION_COSTS','function artifactEvolutionLevel','function upgradeEquippedArtifact','Осколок пробуждения','artifactProgression,','normalizeArtifactProgression(d.artifactProgression)','artifactProgression.awakeningCooldownUntil','artifactProgression.wardUntil','artifactProgression.berserkUntil','ЭВОЛЮЦИЯ АРТЕФАКТА','ПРОБУЖДЕНИЕ ·','set.archive','set.root','set.echo']) assert.ok(source.includes(feature),'Missing artifact progression feature: '+feature);
assert.ok(source.includes("trophies.push({name:'Осколок пробуждения',count:4})")&&source.includes("trophies.push({name:'Осколок пробуждения',count:2})"),'Bosses and gods must drop artifact evolution materials.');
assert.ok(source.includes('player.hp=awakened?Math.max(1,player.hp-hit):Math.max(0,player.hp-hit)'),'Without an evolved artifact awakening, ordinary lethal damage must still kill the player.');
assert.ok(/function loadGame\(\)\{\r?\n\s*artifactProgression=\{levels:\{\},awakeningCooldownUntil:0,wardUntil:0,berserkUntil:0\};/.test(source),'Each world load must reset artifact progression before restoring that world save.');
for (const event of ['meteor','horde','blood_moon','awakening','rift','storm']) {
  assert.ok(source.includes("['" + event + "'") || source.includes('["' + event + '"'), 'Missing Boss Realm event: ' + event);
}
for (const type of ['shadow_hunter','stone_guardian','cursed_skull','rift_wolf','venom_beetle','fallen_warrior','rift_archer','ash_spirit','abyss_general','blood_berserker','rift_warden','soul_devourer','abyss_king','rift_dragon','ancient_devourer','end_knight','astral_god','chronos_god','magma_behemoth','frost_empress','void_mirror','worldbreaker_colossus','forest_king','root_eater']) {
  assert.ok(source.includes(type), 'Missing creature: ' + type);
}
for (const feature of ['m.staggerTimer=1.6','m.actionTimer=m.staggerTimer','m.action=\'stagger\'','counterWindow=!!(target.bossRealmCreature&&target.staggerTimer>0)','(counterWindow?1.5:1)','ИДЕАЛЬНОЕ УКЛОНЕНИЕ','КОНТРАТАКА ПО ОТКРЫТОМУ БОССУ']) assert.ok(source.includes(feature),'Missing perfect-dodge counterattack feature: '+feature);
for (const feature of ['function drawBossRealmCombatFX(m,time,d)','m.telegraphFacing=Math.atan2(player.y-m.y,player.x-m.x)','ФАЗА III · ЯРОСТЬ','ФАЗА II · ПРОБУЖДЕНИЕ','drawBossRealmCombatFX(m,time,d)','m.phaseStage>=3','bossRealmSpecial(m,d,attackDistance)']) assert.ok(source.includes(feature),'Missing boss visual/combat upgrade: '+feature);
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
assert.ok(source.includes('function drawGrassTexture(target,x,y,sx,sy,h,biome,quality)')&&source.includes('const palettes={forest:')&&source.includes("const quality=gameSettings.graphicsQuality!=='low'&&gameSettings.performanceMode!=='boost'")&&source.includes('Stable, low-cost surface grain is generated once per world tile'), 'Ordinary-world biomes must retain deterministic layered ground textures through the bounded tile atlas.');

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
assert.ok(source.includes('fruitful: hash(x + 701, y + 313) > .94')&&source.includes('Лесные ягоды'), 'Ordinary world must generate animated fruit trees with a harvest reward');

assert.ok(source.includes("root_eater:{name:'Корнеед'")&&source.includes("m.realmType==='root_eater'")&&source.includes("m.realmType==='root_eater')&&ratio<.66") ,'Root Eater must be a three-phase elite with a guaranteed trophy.');
assert.ok(source.includes("forest_king:{name:'Король Древнего Леса'")&&source.includes('bossRealmState.awakenedTrees>=5'),'Five awakened trees must unlock the Forest King.');
assert.ok(source.includes('function ensureBossRealmForest()')&&source.includes('function startBossRealmForestTrial()'),'Ancient Forest and Root Crypt must be present in Boss Realm.');
assert.ok(source.includes('function updateTreeRegrowth()')&&source.includes('regrowAt'),'Felled trees must regrow after a world-time cooldown.');
assert.ok(source.includes('SkyRealmForestEcosystem?.update?.(dt)')&&source.includes('SkyRealmLivingWorld?.update?.(dt)'),'Forest and living-world systems must be updated by the simulation.');

const forestModule = fs.readFileSync(path.join(__dirname, '../game/forest-ecosystem.js'), 'utf8');
assert.ok(forestModule.includes('Лесной олень')&&forestModule.includes('Рыжая лиса')&&forestModule.includes('Дикий кабан')&&forestModule.includes('Ночная сова')&&forestModule.includes('Снежный заяц'),'Forest wildlife roster must be present.');
assert.ok(forestModule.includes('ЗАБРОШЕННОЕ ПОСЕЛЕНИЕ')&&forestModule.includes('НОЧНОЙ НАЛЁТ')&&forestModule.includes('СКЛЕП КОРНЕЙ'),'Forest settlement, bandit and crypt events must be present.');
assert.ok(forestModule.includes('function interact()')&&forestModule.includes('Лесные ягоды')&&forestModule.includes('Артефакт древнего селения'),'Wildlife feeding and ruin reward interactions must be implemented.');
assert.ok(forestModule.includes('window.SkyRealmForestEcosystem=Object.freeze({update,draw,interact'),'Forest ecosystem module must export update, draw and interaction hooks.');

assert.ok(forestModule.includes('ПЕЩЕРА ШЁПОТА')&&forestModule.includes('Сердце Пещеры Шёпота'),'The hidden Whispering Cave encounter and reward must be implemented.');
assert.ok(forestModule.includes('function drawSecretCave')&&forestModule.includes('function startCave'),'The secret cave must have a visible entrance and enemy encounter.');