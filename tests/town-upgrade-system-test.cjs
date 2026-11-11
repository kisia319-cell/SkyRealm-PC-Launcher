'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const living=fs.readFileSync(path.join(root,'game/living-world.js'),'utf8');
const expansion=fs.readFileSync(path.join(root,'game/world-expansion.js'),'utf8');
const game=fs.readFileSync(path.join(root,'game/game.js'),'utf8');

// Civic districts: new structures, legacy-safe levels, real costs and visible upgrade controls.
for(const id of ['barracks','fountain','library','walls'])assert.match(living,new RegExp('\\\\b'+id+':\\\\{'),'Missing civic district '+id);
assert.match(living,/projectLevels:\\{\\}/,'New saves must initialize civic building levels.');
assert.match(living,/s\\.projectLevels=raw\\.projectLevels/,'Legacy saves must migrate built projects to level one.');
assert.match(living,/function projectLevel\\(id\\)/,'Building levels must be clamped and read through one helper.');
assert.match(living,/function upgradeProject\\(id\\)/,'Civic buildings must support paid upgrades.');
assert.match(living,/state\\.projectLevels\\[id\\]=level\\+1/,'Upgrades must persist the new building level.');
assert.match(living,/b\\.spendGold\\?\\.\\(cost\\)/,'Upgrades must consume real gold.');
assert.match(living,/b\\.spendItem\\?\\.\\(name,count\\)/,'Upgrades must consume real materials.');
assert.match(living,/data-lw-action="upgrade:/,'The town panel must expose upgrade buttons.');
assert.match(living,/Уровень '\\+level+'\\/3/,'The panel must display building level progress.');
assert.match(living,/if\\(level>=2\\)/,'Level two buildings must gain visible structural details.');
assert.match(living,/if\\(level>=3\\)/,'Level three buildings must gain a distinct visual aura.');
assert.match(living,/projectLevel\\('walls'\\)\\*\\.025/,'Fortifications must improve defense.');
assert.match(living,/projectLevel\\('barracks'\\)\\*\\.015/,'Barracks must improve combat strength.');
assert.match(living,/projectLevel\\('library'\\)/,'Library levels must improve resident contract rewards.');
assert.match(living,/projectLevel\\('market'\\)/,'Market upgrades must improve town income.');
assert.match(living,/projectLevel\\('greenhouse'\\)/,'Greenhouse upgrades must improve supply output.');

// Daily rotating quest boards in both world modes and defensive handling of unknown village IDs.
assert.match(expansion,/ordinaryBoardContracts/);
assert.match(expansion,/bossBoardContracts/);
assert.match(expansion,/function renderBoard\\(kind,snapshot,day\\)/);
assert.match(expansion,/accept-board-ordinary/);
assert.match(expansion,/claim-board-boss/);
assert.match(expansion,/if\\(!record\\)return '<article class="we-card">/,'Unknown nearby village records must not crash the chronicles UI.');

// The movement implementation is deliberately untouched by this update.
assert.match(game,/function updatePlayer\\(/);
console.log('SkyRealm town upgrade, civic districts and daily quest board checks passed.');
