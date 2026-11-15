'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'game/competitive/prime-world.js'),'utf8');
const html=fs.readFileSync(path.join(root,'game/competitive/index.html'),'utf8');
assert.ok(js.includes('match.mine={x:mineX,y:mineY'), 'Match must create a central mine objective');
assert.ok(js.includes('guardCount:4')&&js.includes('team:2')&&js.includes('mineGuard:true'), 'The mine must spawn four neutral guards');
assert.ok(js.includes('if(guards.length){mine.captureTeam=null;mine.progress=0;}'), 'Mine capture must be blocked until guards are defeated');
assert.ok(js.includes('if(mine.progress>=12){mine.owner=team;'), 'Mine capture must complete after a capture timer');
assert.ok(js.includes('incomePerMinute:200')&&js.includes('(mine.incomePerMinute/60)*dt'), 'Mine must generate 200 gold per minute');
assert.ok(js.includes('defenderCost:900')&&js.includes('defenderLimit:2'), 'Mine defenders must cost 900 and be capped at two');
assert.ok(js.includes('function spawnMineDefenders(team,owner=null,automatic=false)')&&js.includes('if(spawned>=mine.defenderLimit)return false'), 'Mine defender purchase must enforce the cap');
assert.ok(js.includes('function buildEnemySupportStructure(bot,kind)'), 'Enemy bots must construct support buildings');
assert.ok(js.includes('function buildPlacementAtWorld(rawX,rawY,team=0,owner=null)'), 'Build placement must support either team');
assert.ok(js.includes('home=team===1?m.enemyBase:(m.playerBase||m.player)'), 'Each team must build around its own base');
assert.ok(js.includes('function commitBuildPlacement(kind,placement,team=placement?.team??0,owner=placement?.owner??null)'), 'Structure placement must accept the building team');
assert.ok(js.includes("const team=m.online.mode==='bots'?0:1,owner="), 'Online remote construction must be assigned to the correct side');
assert.ok(js.includes('processRemoteMineGuardRequest()'), 'Remote co-op/PvP mine-guard purchases must be processed by the host');
assert.ok(js.includes('mineGuardRequest:match.online.mineGuardRequest||null'), 'Mobile/remote clients must send mine-guard requests');
assert.ok(js.includes('other.team===2')&&js.includes('unit.team===2'), 'Neutral mine guards must enter combat logic');
assert.ok(html.includes('id="hud-mine"')&&html.includes('id="mine-guards"'), 'Mine status and defender purchase controls must be visible');

const vm=require('node:vm');
function extractPrimeFunction(source,name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'Missing '+name+' implementation');
 const open=source.indexOf('{',start);let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
 for(let i=open;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(lineComment){if(c==='\\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
  if(quote){if(escaped){escaped=false;continue;}if(c==='\\\\'){escaped=true;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
  if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
  if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
 }
 throw new Error('Unclosed '+name);
}
const enemyProfile={coins:0};
const mineRuntime={
 match:{
  player:{x:100,y:100},allies:[],bots:[{alive:true,x:900,y:900,profile:enemyProfile}],
  units:Array.from({length:4},(_,i)=>({id:i+1,team:2,mineGuard:true,alive:true})),
  outposts:[],supplyCaches:[],playerCoins:0,unitCounter:4,elapsed:0,
  mine:{x:100,y:100,owner:-1,captureTeam:null,progress:0,incomePerMinute:200,guardsRemaining:4,defenderCost:900,defenderLimit:2,defendersSpawned:{0:0,1:0},ownerProfile:null}
 },
 Math,getBotDifficulty:()=>({capture:1,income:1,heroDamage:1}),
 chooseNearestTarget:()=>null,applyCombatDamage:()=>{},addCombatFeed:()=>{},
 updateHud:()=>{},applyEnemyDifficulty:()=>{}
};
const mineFns=['updateBattleObjectives','spawnMineDefenders'].map(name=>extractPrimeFunction(js,name));
vm.runInNewContext(mineFns.join(String.fromCharCode(10))+String.fromCharCode(10)+'globalThis.stepMine=updateBattleObjectives;globalThis.buyMineGuard=spawnMineDefenders;',mineRuntime);
mineRuntime.stepMine(12);
assert.equal(mineRuntime.match.mine.owner,-1,'Living neutral guards must block capture');
assert.equal(mineRuntime.match.mine.progress,0,'Blocked mine must not accumulate capture progress');
for(const guard of mineRuntime.match.units)guard.alive=false;
mineRuntime.stepMine(12);
assert.equal(mineRuntime.match.mine.owner,0,'Player must capture the mine after guards are defeated and 12 seconds pass');
const playerGoldAfterCapture=mineRuntime.match.playerCoins;
mineRuntime.stepMine(60);
assert.equal(mineRuntime.match.playerCoins-playerGoldAfterCapture,200,'Owned mine must add exactly 200 gold per minute');
mineRuntime.match.player.x=900;mineRuntime.match.player.y=900;
mineRuntime.match.bots[0].x=100;mineRuntime.match.bots[0].y=100;
mineRuntime.stepMine(12);
assert.equal(mineRuntime.match.mine.owner,1,'Enemy must be able to recapture the mine');
const enemyGoldAfterCapture=enemyProfile.coins;
mineRuntime.stepMine(60);
assert.equal(enemyProfile.coins-enemyGoldAfterCapture,200,'Enemy owner must also receive 200 gold per minute');
mineRuntime.match.player.x=100;mineRuntime.match.player.y=100;
const contestedEnemyGold=enemyProfile.coins;
mineRuntime.stepMine(60);
assert.equal(enemyProfile.coins,contestedEnemyGold,'Contested mine must stop generating passive gold');
mineRuntime.match.mine.owner=0;mineRuntime.match.mine.defendersSpawned={0:0,1:0};mineRuntime.match.playerCoins=1800;
assert.equal(mineRuntime.buyMineGuard(0),true,'Mine owner must be able to buy first defender');
assert.equal(mineRuntime.buyMineGuard(0),true,'Mine owner must be able to buy second defender');
assert.equal(mineRuntime.buyMineGuard(0),false,'Mine may not exceed two defenders per team');
assert.equal(mineRuntime.match.playerCoins,0,'Each player defender must deduct 900 gold');
assert.equal(mineRuntime.match.units.filter(u=>u.mineDefender&&u.team===0).length,2,'Exactly two player defenders must spawn');
mineRuntime.match.mine.owner=1;enemyProfile.coins=1800;
assert.equal(mineRuntime.buyMineGuard(1,enemyProfile),true,'Enemy owner must be able to buy first defender');
assert.equal(mineRuntime.buyMineGuard(1,enemyProfile),true,'Enemy owner must be able to buy second defender');
assert.equal(mineRuntime.buyMineGuard(1,enemyProfile),false,'Enemy may not exceed two defenders');
assert.equal(enemyProfile.coins,0,'Each enemy defender must deduct 900 gold');
assert.equal(mineRuntime.match.units.filter(u=>u.mineDefender&&u.team===1).length,2,'Exactly two enemy defenders must spawn');
console.log('Mine runtime simulation passed: neutral guards, capture, recapture, 200 gold/min, contested shutdown, and 2-defender caps for both teams.');

console.log('Prime mine, team construction, enemy AI, online request and defender-cap regression checks passed');