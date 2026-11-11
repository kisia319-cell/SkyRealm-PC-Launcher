'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const living=fs.readFileSync(path.join(root,'game/living-world.js'),'utf8');
const sea=fs.readFileSync(path.join(root,'game/sea-system.js'),'utf8');
const game=fs.readFileSync(path.join(root,'game/game.js'),'utf8');
const version=fs.readFileSync(path.join(root,'game/version.txt'),'utf8').trim();
const parts=version.split('.').map(Number);
assert.ok(parts.length>=4&&parts[0]===0&&parts[1]===20&&parts[2]===50&&parts[3]>=107,'Settlement and archipelago expansion must ship in a bumped game version');

// Civic building system and persistent town progression.
for(const id of ['infirmary','school','smithy','watch_bell','greenhouse']){
  assert.match(living,new RegExp('\\b'+id+':\\{'),'Missing new civic building: '+id);
}
assert.match(living,/town:\{renown:0,happiness:55,lastIncomeDay:-1,patrolCooldownDay:0,patrol:null,population:15,lastPopulationDay:-1/,'Town progression must have safe legacy defaults for growth and caravans');
assert.match(living,/const town=raw\.town&&typeof raw\.town==='object'/,'Old living-world saves must migrate town progression');
assert.match(living,/s\.town=\{renown:clamp/,'Town reputation, happiness and patrol state must be bounded during save migration');
assert.match(living,/b\.spendItem\?\.\(name,count\)/,'Civic buildings must consume real resources, not display-only requirements');
assert.match(living,/b\.spendGold\?\.\(item\.price\)/,'Civic building construction must spend real gold');
assert.match(living,/state\.town\.renown=clamp\(state\.town\.renown\+35/,'Building projects must improve city reputation');
assert.match(living,/state\.projects\.school\?1\.1:1/,'Craft school must improve residents contract rewards');
assert.match(living,/state\.projects\.smithy\?\.08:0/,'Royal smithy must increase outgoing combat damage');
assert.match(living,/state\.projects\.infirmary\?\.02:0/,'Infirmary must improve combat defense');
assert.match(living,/state\.projects\.watch_bell\?\.015:0/,'Signal bell must improve combat defense');
assert.match(living,/state\.projects\.watch_bell\?1:2/,'Signal bell must reduce patrol cooldown');
assert.match(living,/function townRank\(\)/,'Town rank progression must be derived from reputation');
assert.match(living,/function startTownPatrol\(\)/,'Town defense must be startable from the living-world panel');
assert.match(living,/b\.spawnEventEnemies\?\.\(eventId,center\.x,center\.y,6\)/,'Town patrol must spawn real enemies around a real settlement');
assert.match(living,/function updateTownPatrol\(\)/,'Town defense must track the live spawned-enemy count');
assert.match(living,/getEventEnemyCount\?\.\(patrol\.id\)/,'Town patrol rewards must wait until its enemies are defeated');
assert.match(living,/Знак защитника города/,'Completed town patrol must award its persistent inventory trophy');
assert.match(living,/data-lw-action="town-patrol"/,'Living-world UI must expose the patrol action');
assert.match(living,/getTownState:\(\)=>JSON\.parse\(JSON\.stringify\(state\.town\)\)/,'Town progress must be inspectable for regression and UI state');
assert.match(living,/PROJECTS\[item\.id\]\?\.name/,'Built civic structures must draw their real project names in the world');
assert.match(game,/getVillageCenters:\(\)=>Array\.isArray\(villageCenters\)/,'Town defense must use actual existing village locations');
assert.match(game,/spawnEventEnemies:\(eventId,x,y,count=6\)/,'Town defenses must use the real world encounter spawner');
assert.match(game,/getEventEnemyCount:eventId=>monsters\.filter/,'Town defense must monitor live encounter mobs');

// Named islands, one-time rewards, old-save migration and a multi-phase sea boss.
assert.match(sea,/const ARCHIPELAGO=\[/,'The sea must have a deterministic named island chain');
for(const id of ['coral_atoll','storm_lighthouse','shipbreaker_cove'])assert.ok(sea.includes(id),'Missing archipelago destination '+id);
assert.match(sea,/islandsDiscovered:\[\]/,'Island discovery must be stored in each sea save');
assert.match(sea,/state\.islandsDiscovered=Array\.isArray\(d\.islandsDiscovered\)/,'Old sea saves must migrate island-discovery progress');
assert.match(sea,/function visitNearestIsland\(\)/,'Players must be able to visit a nearby island');
assert.match(sea,/state\.islandsDiscovered\.push\(island\.id\)/,'Each island must be persistently discovered');
assert.match(sea,/b\?\.addItem\?\.\(island\.reward,island\.amount/,'Island visits must grant real inventory rewards');
assert.match(sea,/b\?\.addGold\?\.\(island\.gold\)/,'Island visits must grant real gold');
assert.match(sea,/id="sea-island-btn"/,'Sea UI must provide the nearby island action');
assert.match(sea,/const KRAKEN_LAIR=/,'The archipelago must mark the Kraken lair on the sea map');
assert.match(sea,/function krakenUnlocked\(\)/,'Kraken challenge must have an explicit progression gate');
assert.match(sea,/state\.islandsDiscovered\.length>=2&&state\.shipLevel>=1/,'Kraken must require two explored islands and a ship upgrade');
assert.match(sea,/function startKrakenFight\(\)/,'Players must be able to begin the sea boss encounter');
assert.match(sea,/function attackKraken\(\)/,'Sea boss combat must be playable');
assert.match(sea,/function guardKraken\(\)/,'Players must be able to guard against the Kraken');
assert.match(sea,/k\.phase=ratio>\.66\?1:ratio>\.32\?2:3/,'Kraken must have three health-driven combat phases');
assert.match(sea,/state\.boatHp=Math\.max\(0,state\.boatHp-hullDamage\)/,'Kraken attacks must damage the actual ship hull');
assert.match(sea,/k\.defeated=true/,'Kraken defeat must be persistent');
for(const item of ['Сердце кракена','Панцирь кракена','Гарпун бури','Ключ архипелага'])assert.ok(sea.includes(item),'Kraken victory reward missing: '+item);
assert.match(sea,/id="sea-kraken"/,'Sea boss must have its own battle panel');
assert.match(sea,/id="sea-kraken-attack"/,'Sea boss panel must expose attack');
assert.match(sea,/id="sea-kraken-guard"/,'Sea boss panel must expose guard');
assert.match(sea,/function api\(\)\{return \{open:enter,isOpen:\(\)=>active,save,upgradeShip,enterCave,attackCave,closeCave,visitNearestIsland,startKrakenFight,attackKraken,guardKraken,closeKraken/,'Sea public API must expose island and boss gameplay hooks');
console.log('Settlement and archipelago expansion regression checks passed.');
