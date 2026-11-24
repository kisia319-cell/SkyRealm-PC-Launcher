'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const game=fs.readFileSync('game/game.js','utf8');
const labs=fs.readFileSync('game/apocalypse-laboratories.js','utf8');
const cloud=fs.readFileSync('game/cloud-save-ui.js','utf8');
const auth=fs.readFileSync('supabase/functions/skyrealm-auth/index.ts','utf8');
const html=fs.readFileSync('game/index.html','utf8');

const saveStart=game.indexOf('function saveGame(){');
const loadStart=game.indexOf('function loadGame(){');
assert.ok(saveStart>=0&&loadStart>saveStart);
const save=game.slice(saveStart,loadStart);
const load=game.slice(loadStart,loadStart+5000);
assert.match(save,/apocalypseLabs:IS_APOCALYPSE_MODE\?/,'Apocalypse snapshot must include laboratory state');
assert.match(load,/SkyRealmApocalypseLabs\?\.importProgress/,'world load must restore saved laboratory progress');
assert.match(game,/SkyRealmApocalypseLabs\?\.loadWorld/,'entering a world must select that world\'s lab save');

assert.match(labs,/const SAVE_KEY=\(\)=>LEGACY_SAVE_KEY\+/,'laboratory saves must be keyed by world');
assert.match(labs,/skyrealm_apocalypse_labs_legacy_migrated_v1/,'old global lab progress must migrate only once');
assert.match(labs,/localStorage\.setItem\(SAVE_KEY\(\),JSON\.stringify\(progress\)\)/);
assert.match(labs,/importProgress\(raw\)/);

for(const key of ['skyrealm_apocalypse_worlds_v1','skyrealm_apocalypse_game_save_v1','skyrealm_apocalypse_laboratories_v1_']){
 assert.ok(cloud.includes(key),'cloud UI must include '+key);
 assert.ok(auth.includes(key),'cloud API must allow '+key);
}
assert.match(cloud,/living_world\|world_events\|world_expansion/);
assert.match(auth,/living_world\|world_events\|world_expansion/);
assert.match(cloud,/forest_ecosystem_v2_/);assert.match(auth,/forest_ecosystem_v2_/);
assert.match(cloud,/challenge_v1_/);assert.match(auth,/challenge_v1_/);
assert.match(cloud,/WORLD_LIST_KEYS/,'cloud restore must merge both normal and Apocalypse world lists');
assert.match(auth,/worldListKeys/,'cloud API must validate both world-list formats');
assert.ok(html.includes('name="skyrealm-game-version" content="' + fs.readFileSync('game/version.txt', 'utf8').trim() + '"'), 'Apocalypse save screen metadata must match the current packaged version.');
console.log('Apocalypse complete save regression checks passed.');
