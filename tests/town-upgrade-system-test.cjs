'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const living=fs.readFileSync(path.join(root,'game/living-world.js'),'utf8');
const expansion=fs.readFileSync(path.join(root,'game/world-expansion.js'),'utf8');

// Civic districts: new structures, legacy-safe levels, real costs and visible upgrade controls.
for(const id of ['barracks','fountain','library','walls'])assert.ok(living.includes(id+':{'),'Missing civic district '+id);
for(const snippet of [
 'projectLevels:{}',
 'lastFountainDay:-1',
 's.lastFountainDay=Number.isInteger(raw.lastFountainDay)',
 'state.town.happiness+elapsed*projectLevel(\'fountain\')*2',
 's.projectLevels=raw.projectLevels',
 'function projectLevel(id)',
 'function upgradeProject(id)',
 'state.projectLevels[id]=level+1',
 'b.spendGold?.(cost)',
 'b.spendItem?.(name,count)',
 'data-lw-action="upgrade:',
 "Уровень '+level+'/3",
 'if(level>=2)',
 'if(level>=3)',
 "projectLevel('walls')*.025",
 "projectLevel('barracks')*.015",
 "projectLevel('library')",
 "projectLevel('market')",
 "projectLevel('greenhouse')"
])assert.ok(living.includes(snippet),'Missing town upgrade behavior: '+snippet);

// Daily rotating quest boards in both world modes and defensive handling of unknown village IDs.
for(const snippet of [
 'ordinaryBoardContracts','bossBoardContracts','function renderBoard(kind,snapshot,day)',
 'accept-board-ordinary','claim-board-boss',
 'if(!record)return \'<article class="we-card">','board:{day:-1,accepted:[],claimed:[]}'
])assert.ok(expansion.includes(snippet),'Missing chronicles feature: '+snippet);

// Population, specialist hiring and guarded caravans are persistent per-world town systems.
for(const snippet of [
 'TOWN_SPECIALISTS={','function townHousingCapacity()','function townStaffSlots()','function hireTownSpecialist(id)',
 'function updateTownGrowth(day)','function updateTownCaravan(day)','function startTownCaravan()','function claimTownCaravan()',
 'nextCaravanDay:3','population:15','town.population<capacity','town.staff.steward','town.staff.scout',
 'town.staff.merchant?150:0','state.town.staff?.engineer ? 0.9 : 1','function startTownCaravan()','function claimTownCaravan()',
 'town-hire:','town-caravan-claim','drawTownCaravan(ctx,centers,camX,camY,time)',
 'status===\'complete\'','b?.addItem?.(item,amount'
])assert.ok(living.includes(snippet),'Missing settlement expansion behavior: '+snippet);

console.log('SkyRealm town upgrade, civic districts and daily quest board checks passed.');
