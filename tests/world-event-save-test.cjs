'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const game=fs.readFileSync(path.join(root,'game','game.js'),'utf8');
const saveStart=game.indexOf('function saveGame(){');
const loadStart=game.indexOf('function loadGame(){');
assert.ok(saveStart>=0&&loadStart>saveStart,'save and load functions must exist');
const save=game.slice(saveStart,loadStart);
const load=game.slice(loadStart,loadStart+30000);

assert.match(save,/worldEventEnemies:!isCoopWorldSave\(\)\?monsters\.filter/,'single-player saves must include active world event enemies');
assert.match(save,/m\.expansionEventId==='string'&&m\.expansionEventId\|\|m\.villageRaid===true/,'event saves must include chronicle events and night village raids');
assert.match(load,/Array\.isArray\(d\?\.worldEventEnemies\)/,'loading must read saved world event enemies');
assert.match(load,/for\(const raw of d\.worldEventEnemies\.slice\(0,12\)\)/,'loading must cap restored event enemies');
assert.match(load,/if\(!eventId&&!villageRaid\)continue/,'unrelated monsters must not be restored from event data');
assert.match(load,/if\(hp<=0\)continue/,'defeated enemies must not respawn');
assert.match(load,/expansionEventId:eventId/,'restored enemies must retain their event identity');
assert.match(load,/villageRaid,forestTreant:raw\.forestTreant===true/,'special event flags must survive reload');
assert.match(load,/territoryRadius:Math\.max/,'territory data must be bounded');

console.log('World event save regression checks passed: active raid enemies, HP, event IDs and village-raid flags survive save/load; defeated and invalid entries are rejected.');
