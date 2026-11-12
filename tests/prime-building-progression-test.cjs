'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'game/competitive/prime-world.js'),'utf8');
const html=fs.readFileSync(path.join(root,'game/competitive/index.html'),'utf8');
function extractFunction(source,name){
 const start=source.indexOf('function '+name+'(');
 assert.ok(start>=0,'Missing function '+name);
 const open=source.indexOf('{',start);
 let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
 for(let i=open;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
  if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
  if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
  if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
  if(c==='{')depth++;
  else if(c==='}'&&--depth===0)return source.slice(start,i+1);
 }
 throw new Error('Unclosed function '+name);
}

// Standard buildings are capped at level five; each upgrade changes actual stats.
const upgradeFn=extractFunction(js,'upgradeStructureAt');
const wall={x:500,y:500,team:0,kind:'wall',level:1,hp:50,maxHp:100};
const upgradeMatch={walls:[wall],barracks:[],supportBuildings:[],towers:[],playerCoins:1000};
const upgradeContext={match:upgradeMatch,$:()=>({}),save:()=>{},updateHud:()=>{},drawArena:()=>{}};
vm.runInNewContext(upgradeFn+'\nupgradeStructureAt(500,500);',upgradeContext);
assert.equal(wall.level,2);
assert.equal(wall.maxHp,142);
assert.equal(upgradeMatch.playerCoins,900);
const maxedWall={x:500,y:500,team:0,kind:'wall',level:5,hp:500,maxHp:500};
const maxContext={match:{walls:[maxedWall],barracks:[],supportBuildings:[],towers:[],playerCoins:1000},$:()=>({}),save:()=>{},updateHud:()=>{},drawArena:()=>{}};
vm.runInNewContext(upgradeFn+'\nupgradeStructureAt(500,500);',maxContext);
assert.equal(maxContext.match.playerCoins,1000,'Level five must be a hard cap.');

const supportFn=extractFunction(js,'updateSupportBuildings');
// Market: real match currency is generated every second.
const marketMatch={supportBuildings:[{team:0,kind:'market',x:500,y:500,level:2,hp:700,maxHp:700,incomeRate:5}],playerCoins:0,bots:[],allies:[],units:[]};
vm.runInNewContext(supportFn+'\nupdateSupportBuildings(2);',{match:marketMatch});
assert.equal(marketMatch.playerCoins,10);

// Stables train actual cavalry with higher health, damage and movement speed.
const cavalryMatch={supportBuildings:[{team:0,kind:'stable',x:500,y:500,level:1,hp:760,maxHp:760,trainTimer:33,trainInterval:34,unitCapacity:2}],playerCoins:500,bots:[],allies:[],units:[],player:{x:0,y:0,hp:100,maxHp:100}};
const cavalry={team:0,alive:true,hp:130,maxHp:130,damage:48};
const cavalryContext={match:cavalryMatch,spawnUnit:()=>{cavalryMatch.units.push(cavalry);return cavalry;},addCombatFeed:()=>{}};
vm.runInNewContext(supportFn+'\nupdateSupportBuildings(2);',cavalryContext);
assert.equal(cavalry.kind,'cavalry');
assert.equal(cavalry.speed,245);
assert.equal(cavalryMatch.playerCoins,310);

// Siege workshop produces a durable structure killer.
const siegeMatch={supportBuildings:[{team:0,kind:'siege',x:500,y:500,level:1,hp:880,maxHp:880,trainTimer:53,trainInterval:54,unitCapacity:1}],playerCoins:500,bots:[],allies:[],units:[],player:{x:0,y:0,hp:100,maxHp:100}};
const catapult={team:0,alive:true,hp:130,maxHp:130,damage:48};
const siegeContext={match:siegeMatch,spawnUnit:()=>{siegeMatch.units.push(catapult);return catapult;},addCombatFeed:()=>{}};
vm.runInNewContext(supportFn+'\nupdateSupportBuildings(2);',siegeContext);
assert.equal(catapult.kind,'siege');
assert.ok(catapult.damage>=155&&catapult.range>=190);

// Mage tower hits multiple enemies in an area of effect.
const mageTargets=[{team:1,x:520,y:500,hp:100,alive:true},{team:1,x:550,y:500,hp:100,alive:true}];
const mageMatch={supportBuildings:[{team:0,kind:'mage',x:500,y:500,level:1,hp:820,maxHp:820,fire:0,damage:36,range:250,fireInterval:1.7}],playerCoins:0,bots:mageTargets,allies:[],units:[],player:{x:0,y:0,hp:100,maxHp:100},tracers:[]};
const mageHits=[];
const mageContext={match:mageMatch,chooseNearestTarget:()=>({target:mageTargets[0],distance:20}),applyCombatDamage:(target,damage)=>mageHits.push({target,damage}),addCombatFeed:()=>{}};
vm.runInNewContext(supportFn+'\nupdateSupportBuildings(1);',mageContext);
assert.equal(mageHits.length,2);
assert.ok(mageHits.every(hit=>hit.damage===36));

// Barracks capacity prevents unlimited recruitment.
const cappedSoldier={team:0,alive:true};
const cappedMatch={unitCounter:1,units:[cappedSoldier],bots:[],walls:[],towers:[],barracks:[{team:0,x:500,y:500,level:1,hp:500,unitCapacity:1}]};
const cappedSpawnContext={match:cappedMatch};
vm.runInNewContext(extractFunction(js,'spawnUnit')+'\nglobalThis.recruitResult=spawnUnit(0,500,500);',cappedSpawnContext);
assert.equal(cappedSpawnContext.recruitResult,null);
assert.equal(cappedMatch.units.length,1);

// New structure choices are visible and wired to the battlefield.
for(const id of ['data-build="stable"','data-build="siege"','data-build="mage"','data-build="market"'])assert.ok(html.includes(id),'Missing Prime structure option '+id);
assert.match(js,/spikeDamage/);
assert.match(js,/const kind=o\.kind==='archer'\?'tower'/);
console.log('Prime building progression: all assertions passed');

// Tavern/barracks upgrade must improve recruitment and soldiers; enemy buildings are never upgradeable.
const upgradedBarracks={x:700,y:700,team:0,level:1,hp:400,maxHp:500,timer:0};
const barracksMatch={walls:[],barracks:[upgradedBarracks],supportBuildings:[],towers:[],playerCoins:1000};
const barracksContext={match:barracksMatch,$:()=>({}),save:()=>{},updateHud:()=>{},drawArena:()=>{}};
vm.runInNewContext(upgradeFn+'\nupgradeStructureAt(700,700);',barracksContext);
assert.equal(upgradedBarracks.level,2);
assert.equal(upgradedBarracks.unitCapacity,11,'Tavern must increase army capacity.');
assert.ok(upgradedBarracks.spawnInterval<18,'Tavern must train soldiers faster.');
const barracksSpawnMatch={unitCounter:0,units:[],bots:[],walls:[],towers:[],barracks:[upgradedBarracks]};
const upgradedSoldierContext={match:barracksSpawnMatch};
vm.runInNewContext(extractFunction(js,'spawnUnit')+'\nglobalThis.upgradedSoldier=spawnUnit(0,700,700);',upgradedSoldierContext);
assert.equal(upgradedSoldierContext.upgradedSoldier.hp,162,'Tavern level must improve recruited soldier health.');
assert.equal(upgradedSoldierContext.upgradedSoldier.damage,58,'Tavern level must improve recruited soldier damage.');

const enemyWall={x:800,y:800,team:1,level:1,hp:260,maxHp:260};
const enemyMatch={walls:[enemyWall],barracks:[],supportBuildings:[],towers:[],playerCoins:1000};
const enemyContext={match:enemyMatch,$:()=>({}),save:()=>{},updateHud:()=>{},drawArena:()=>{}};
vm.runInNewContext(upgradeFn+'\nglobalThis.enemyUpgrade=upgradeStructureAt(800,800);',enemyContext);
assert.equal(enemyContext.enemyUpgrade,false,'Enemy walls must not be selectable for player upgrades.');
assert.equal(enemyWall.level,1);
assert.equal(enemyMatch.playerCoins,1000);

// Allied units may pass their own walls and own archer towers, but not enemy walls.
const occupancyFn=extractFunction(js,'canEntityOccupy');
const ally={team:0},enemy={team:1};
const occupancyContext={match:{player:{},playerBase:{x:500,y:500},walls:[{x:600,y:600,team:0,hp:260,rotation:0},{x:700,y:600,team:1,hp:260,rotation:0}],towers:[{x:600,y:600,team:0,kind:'archer',hp:500}],barracks:[],supportBuildings:[]},TILE:32,WATER_BORDER:15,SIZE:100,ally:{team:0},enemy:{team:1}};
vm.runInNewContext(occupancyFn+'\nglobalThis.allyWall=canEntityOccupy(600,600,12,globalThis.ally);globalThis.allyTower=canEntityOccupy(600,600,12,globalThis.ally);globalThis.enemyWall=canEntityOccupy(700,600,12,globalThis.ally);',occupancyContext);
assert.equal(occupancyContext.allyWall,true);
assert.equal(occupancyContext.allyTower,true);
assert.equal(occupancyContext.enemyWall,false);

// Russian UI integrity: build controls, pause/leave dialogs and both locale dictionaries.
assert.equal((html.match(/\?{3,}/g)||[]).length,0,'Prime HTML must not contain question-mark replacement labels.');
assert.equal((js.match(/'\?{3,}/g)||[]).length,0,'Prime script must not contain question-mark replacement strings.');
for(const text of [
 '\u{1F3D7} \u0421\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e',
 '\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u043e\u0438\u043d\u043e\u0432',
 '\u0421\u043e\u0431\u0440\u0430\u0442\u044c \u0432\u043e\u0439\u0441\u043a\u0430',
 '\u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u041a\u041b',
 '\u0422\u043e\u0447\u043a\u0430 \u0441\u0431\u043e\u0440\u0430',
 '\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043c\u0430\u0442\u0447\u0430',
 '\u041f\u0430\u0443\u0437\u0430',
 '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0431\u043e\u0439',
 '\u0414\u0430, \u0432\u044b\u0439\u0442\u0438',
 '\u041e\u0442\u043c\u0435\u043d\u0430 \u2014 \u043e\u0441\u0442\u0430\u0442\u044c\u0441\u044f \u0432 \u0431\u043e\u044e'
])assert.ok(html.includes(text),'Missing readable Russian Prime UI label: '+text);
for(const text of ['Base defense: ON','Resume battle','Leave the match?','Tavern / Barracks','Cannot build outside the arena.'])assert.ok(js.includes(text),'Missing English Prime UI translation: '+text);
assert.ok(js.includes('\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043c\u043e\u043d\u0435\u0442: '),'Build affordability feedback must be readable.');

// Evaluate the actual Prime English map to catch escaped keys that render literally.
const dictStart=js.indexOf('const PRIME_EN=')+'const PRIME_EN='.length;
const dictEnd=js.indexOf('\n};',dictStart)+2;
assert.ok(dictStart>0&&dictEnd>dictStart,'Prime English dictionary must be available.');
const primeEnglish=vm.runInNewContext('('+js.slice(dictStart,dictEnd)+')');
assert.equal(primeEnglish['\u{1F3D7} \u0421\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e'],'\u{1F3D7} Build');
assert.equal(primeEnglish['\u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u041a\u041b'],'Base defense: ON');
assert.equal(primeEnglish['\u041f\u0430\u0443\u0437\u0430'],'Paused');
assert.equal(primeEnglish['\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043c\u0430\u0442\u0447\u0430?'],'Leave the match?');
assert.equal(primeEnglish['\u2694 \u0414\u043e\u043c \u0432\u043e\u0438\u043d\u043e\u0432 \u00b7 450 \u25c6'],'\u2694 Tavern / Barracks \u00b7 450 \u25c6');