
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

// High-density canvas, player-world appearance, and cursor-following ghost placement.
assert.match(js,/function resizeArenaCanvas\(\)/);
assert.match(js,/ctx\.setTransform\(dpr,0,0,dpr,0,0\)/);
assert.match(js,/function drawPrimeFighter\(/);
assert.match(js,/SKYREALM_DEFAULT_LOOK/);
assert.match(js,/requestFullscreen/);
assert.match(js,/toggle_fullscreen\(\)/);
assert.match(js,/depth=Math\.max/);
assert.match(js,/function buildPlacementAtWorld\(/);
assert.match(js,/function buildPlacementFromPointer\(/);
assert.match(js,/function drawBuildPreview\(/);
assert.match(js,/pointermove/);
assert.match(html,/id="hud-base-distance"/);
assert.match(html,/body\.prime-building #arena\{cursor:crosshair\}/);

// Player and enemy bases begin exactly forty world tiles apart.
assert.match(js,/const playerBaseX=SIZE\*TILE\/2-20\*TILE/);
assert.match(js,/const enemyBaseX=player\.x\+ENEMY_BASE_DISTANCE_BLOCKS\*TILE/);
assert.doesNotMatch(js,/perimeter\(player\.x/);
assert.match(js,/const walls=\[\]/);
const TILE=32,SIZE=100,ENEMY_BASE_DISTANCE_BLOCKS=40,playerBaseX=SIZE*TILE/2-20*TILE,enemyBaseX=playerBaseX+ENEMY_BASE_DISTANCE_BLOCKS*TILE;
assert.equal((enemyBaseX-playerBaseX)/TILE,40);

// Placement snaps to tile centers and rejects unsafe or occupied locations.
const placementFunction=extractFunction(js,'buildPlacementAtWorld');
const occupancyFunction=extractFunction(js,'canEntityOccupy');
const placementContext={
 TILE,SIZE,WATER_BORDER:15,buildRotation:0,buildMode:'wall',
 match:{player:{x:1200,y:1200},playerCoins:900,walls:[],barracks:[],towers:[]}
};
vm.runInNewContext(occupancyFunction+'\n'+placementFunction+'\nglobalThis.result=buildPlacementAtWorld(1400,1400);',placementContext);
assert.equal(placementContext.result.x,Math.floor(1400/TILE)*TILE+TILE/2);
assert.equal(placementContext.result.y,Math.floor(1400/TILE)*TILE+TILE/2);
assert.equal(placementContext.result.valid,true);
vm.runInNewContext('globalThis.tooNear=buildPlacementAtWorld(1200,1200);',placementContext);
assert.equal(placementContext.tooNear.valid,false);
placementContext.match.walls.push({x:1456,y:1456});
vm.runInNewContext('globalThis.occupied=buildPlacementAtWorld(1456,1456);',placementContext);
assert.equal(placementContext.occupied.valid,false);
placementContext.buildMode='tower';placementContext.match.playerCoins=50;
vm.runInNewContext('globalThis.noFunds=buildPlacementAtWorld(1600,1600);',placementContext);
assert.equal(placementContext.noFunds.valid,false);

// A player death cancels enemy pressure and orders living enemy units to retreat.
const retreatFunction=extractFunction(js,'retreatEnemyToBases');
const retreatContext={match:{
 elapsed:42,enemyAggroUntil:80,enemyAssaultUntil:90,enemyCounterQueued:true,enemyNoticeUntil:0,enemyState:'АТАКУЕТ',
 bots:[{retreating:false,attack:0},{retreating:false,attack:1}],
 units:[{team:1,alive:true,retreating:false,attack:1},{team:0,alive:true,retreating:false}]
}};
vm.runInNewContext(retreatFunction+'\nretreatEnemyToBases();',retreatContext);
assert.equal(retreatContext.match.enemyAggroUntil,42);
assert.equal(retreatContext.match.enemyAssaultUntil,42);
assert.equal(retreatContext.match.enemyCounterQueued,false);
assert.equal(retreatContext.match.enemyState,'ВОЗВРАЩАЮТСЯ НА БАЗУ');
assert.ok(retreatContext.match.bots.every(b=>b.retreating));
assert.equal(retreatContext.match.units[0].retreating,true);
assert.equal(retreatContext.match.units[1].retreating,false);
assert.match(js,/if\(p\.hp<=0\)\{[\s\S]*?retreatEnemyToBases\(\)/);

// WASD movement handler remains present and unchanged in its movement calculation.
assert.match(js,/let dx=\(pressed\.has\('KeyD'\).*pressed\.has\('KeyA'/);
assert.match(js,/let dy=\(pressed\.has\('KeyS'\).*pressed\.has\('KeyW'/);

// Arena walls and the sea are solid, including rotated walls.
const occupancy=extractFunction(js,'canEntityOccupy'),movement=extractFunction(js,'moveEntity');
const collisionContext={TILE,SIZE,WATER_BORDER:15,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),match:{walls:[{x:1456,y:1456,hp:260,rotation:0}],towers:[],barracks:[]}};
vm.runInNewContext(occupancy+'\n'+movement+'\nglobalThis.blocked=canEntityOccupy(1456,1456,12);globalThis.seaBlocked=canEntityOccupy(200,1000,12);globalThis.walker={x:1456,y:1400};moveEntity(walker,0,56,12);',collisionContext);
assert.equal(collisionContext.blocked,false,'A wall must block a fighter.');
assert.equal(collisionContext.seaBlocked,false,'The ocean must block land movement.');
assert.equal(collisionContext.walker.y,1400,'Movement must stop at a wall instead of passing through it.');
collisionContext.match.walls[0].rotation=Math.PI/2;
vm.runInNewContext('globalThis.rotatedBlocked=canEntityOccupy(1470,1456,12);',collisionContext);
assert.equal(collisionContext.rotatedBlocked,false,'Rotated walls must keep their collision box aligned.');

// Player attack must hit enemy soldiers, not just the bot hero.
const damageFunction=extractFunction(js,'applyCombatDamage');
const nearestFunction=extractFunction(js,'chooseNearestTarget');
const attackFunction=extractFunction(js,'attack');
const unit={team:1,x:70,y:50,hp:120,maxHp:120,alive:true,name:'Вражеский воин'};
const combatContext={
 match:{finished:false,elapsed:3,player:{x:50,y:50,team:0},bots:[],units:[unit],towers:[],walls:[],barracks:[],tracers:[],damageTexts:[],combatFeed:[]},
 attackCooldown:0,Math,Number,addDamageNumber:()=>{},addCombatFeed:()=>{},alertEnemyBase:()=>{combatContext.alerted=true;}
};
vm.runInNewContext(nearestFunction+'\n'+damageFunction+'\n'+attackFunction+'\nglobalThis.performAttack=attack;performAttack();',combatContext);
assert.equal(unit.hp,72,'A direct attack must damage an enemy warrior.');
assert.equal(combatContext.alerted,true,'Hitting an enemy warrior must alert its base.');

// A defeated enemy bot respawns at its home base after twelve seconds while its towers remain.
const deadBot={id:1,name:'Тестовый бот',team:1,x:950,y:500,homeX:900,homeY:500,alive:false,hp:0,maxHp:255,respawnAt:12,profile:{name:'TestBot'},retreating:false};
const respawnFunction=extractFunction(js,'respawnDefeatedBots');
const respawnContext={match:{elapsed:13,bots:[deadBot],towers:[{team:1,owner:deadBot.profile,hp:100}],combatFeed:[]},addCombatFeed:()=>{}};
vm.runInNewContext(respawnFunction+'\nrespawnDefeatedBots();',respawnContext);
assert.equal(deadBot.alive,true,'Defeated bots must respawn.');
assert.equal(deadBot.hp,deadBot.maxHp,'Respawn must restore health.');
assert.equal(deadBot.x,deadBot.homeX,'Respawn must place the bot on its base.');
assert.equal(deadBot.respawnAt,0,'Respawn timer must reset.');

// Soldiers must leave the barracks collision volume immediately after recruitment.
const spawnFunction=extractFunction(js,'spawnUnit');
const spawnContext={match:{unitCounter:0,units:[],bots:[],walls:[],towers:[],barracks:[{team:0,x:500,y:500,hp:500}]}};
vm.runInNewContext(spawnFunction+'\nglobalThis.spawned=spawnUnit(0,500,500);',spawnContext);
assert.ok(Math.hypot(spawnContext.spawned.x-500,spawnContext.spawned.y-500)>40,'A newly recruited unit must spawn outside the barracks collision volume.');

// Building orientation is captured in the ghost and in the placed object.
placementContext.buildRotation=Math.PI/2;
vm.runInNewContext('globalThis.rotatedPlacement=buildPlacementAtWorld(1400,1400);',placementContext);
assert.equal(placementContext.rotatedPlacement.rotation,Math.PI/2);

// Seven bonus systems: minimap, stamina, hit numbers, shot tracers, combat feed,
// timed bot respawn, and richer tower health/upgrade progression.
for(const pattern of [/function drawMiniMap\(/,/sprintStamina/,/function addDamageNumber\(/,/match\.tracers\.push/,/battle-feed/,/function respawnDefeatedBots\(/,/t\.maxHp=760\+t\.level\*240/])assert.match(js,pattern);
assert.match(js,/playerSupportTower/);
