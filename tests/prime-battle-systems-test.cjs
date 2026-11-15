'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),js=fs.readFileSync(path.join(root,'game/competitive/prime-world.js'),'utf8'),html=fs.readFileSync(path.join(root,'game/competitive/index.html'),'utf8');
function extractFunction(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'Missing '+name);const open=source.indexOf('{',start);let depth=0,quote='',escaped=false,line=false,block=false;for(let i=open;i<source.length;i++){const c=source[i],n=source[i+1];if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);}throw Error('Unclosed '+name);}
for(const id of ['hud-outposts','hud-weather','ability-warcry','ability-shield','ability-volley','hire-mercenaries','bot-difficulty-details'])assert.ok(html.includes('id="'+id+'"'),'Missing UI '+id);
for(const n of ['updateBattleWeather','updateBattleObjectives','castCommanderAbility','hireMercenaries','updateBattleSystemsHud','drawBattleObjectives','getBotDifficulty','applyEnemyDifficulty','chooseEnemyOutpostTarget'])assert.ok(js.includes('function '+n+'('),'Missing '+n);
const objective=extractFunction(js,'updateBattleObjectives'),point={id:1,x:0,y:0,owner:-1,captureTeam:null,progress:0},m={elapsed:0,player:{x:0,y:0,alive:true,hp:100},allies:[],units:[],bots:[],outposts:[point],supplyCaches:[],playerCoins:0};
vm.runInNewContext(objective+'\nfor(let i=0;i<12;i++){match.elapsed++;updateBattleObjectives(1);}',{match:m,addCombatFeed:()=>{},getBotDifficulty:()=>({capture:1,income:1,heroDamage:1}),chooseNearestTarget:()=>null,applyCombatDamage:()=>{}});assert.equal(point.owner,0);assert.ok(m.playerCoins>=4);
const cache={x:0,y:0,active:true,respawnAt:0};m.supplyCaches=[cache];m.elapsed=20;m.playerCoins=0;vm.runInNewContext(objective+'\nupdateBattleObjectives(1);',{match:m,addCombatFeed:()=>{},getBotDifficulty:()=>({capture:1,income:1,heroDamage:1}),chooseNearestTarget:()=>null,applyCombatDamage:()=>{}});assert.equal(cache.active,false);assert.equal(m.playerCoins,182.2);assert.ok(cache.respawnAt>20);
const weather=extractFunction(js,'updateBattleWeather'),wm={elapsed:80,weather:{type:'clear',until:0,nextAt:75}};vm.runInNewContext(weather+'\nupdateBattleWeather(1);',{match:wm,Math:Object.assign(Object.create(Math),{random:()=>0}),addCombatFeed:()=>{}});assert.equal(wm.weather.type,'rain');assert.equal(wm.weather.until,108);
const ability=extractFunction(js,'castCommanderAbility'),am={elapsed:10,finished:false,player:{x:0,y:0},allies:[],units:[],bots:[],towers:[],walls:[],barracks:[],supportBuildings:[],tracers:[],commander:{warCryUntil:0,shieldUntil:0,cooldowns:{warcry:0,shield:0,volley:0}}};const ac={match:am,$:()=>({textContent:''}),addCombatFeed:()=>{},updateBattleSystemsHud:()=>{},chooseNearestTarget:()=>null,applyCombatDamage:()=>{}};vm.runInNewContext(ability+'\ncastCommanderAbility("warcry");castCommanderAbility("shield");',ac);assert.equal(am.commander.warCryUntil,22);assert.equal(am.commander.shieldUntil,19);assert.ok(am.commander.cooldowns.warcry>10&&am.commander.cooldowns.shield>10);
const hire=extractFunction(js,'hireMercenaries'),hm={elapsed:5,finished:false,player:{x:0,y:0},mercenaryCamp:{x:0,y:0},mercenaryCooldownUntil:0,barracks:[{team:0,hp:500,unitCapacity:8}],units:[],playerCoins:500};const hc={match:hm,$:()=>({textContent:''}),spawnUnit:(team,x,y)=>{const u={team,alive:true};hm.units.push(u);return u;},addCombatFeed:()=>{},updateHud:()=>{}};vm.runInNewContext(hire+'\nhireMercenaries();',hc);assert.equal(hm.units.length,3);assert.ok(hm.units.every(u=>u.kind==='mercenary'&&u.damage===32));assert.equal(hm.playerCoins,140);assert.ok(hm.mercenaryCooldownUntil>5);
const damage=extractFunction(js,'applyCombatDamage'),attacker={team:0},target={team:1,x:0,y:0,hp:200,alive:true},dm={player:attacker,allies:[],units:[],weather:{type:'clear'},commander:{warCryUntil:20,shieldUntil:0},elapsed:5,tracers:[],damageTexts:[]};vm.runInNewContext(damage+'\napplyCombatDamage(target,100,attacker);',{match:dm,target,attacker,addDamageNumber:()=>{},addCombatFeed:()=>{}});assert.equal(target.hp,75);
const protectedTarget={team:0,x:0,y:0,hp:200,alive:true},enemy={team:1},sm={player:{},allies:[],units:[],weather:{type:'clear'},commander:{warCryUntil:0,shieldUntil:20},elapsed:5,tracers:[],damageTexts:[]};vm.runInNewContext(damage+'\napplyCombatDamage(target,100,enemy);',{match:sm,target:protectedTarget,enemy,addDamageNumber:()=>{},addCombatFeed:()=>{}});assert.equal(protectedTarget.hp,132);

const outpostShot=extractFunction(js,'updateBattleObjectives');
const neutral={id:2,x:0,y:0,owner:-1,captureTeam:null,progress:0,fireTimer:0},victim={x:30,y:0,hp:100,maxHp:100,team:0,alive:true};
const shotMatch={elapsed:0,player:victim,allies:[],units:[],bots:[],outposts:[neutral],supplyCaches:[],playerCoins:0};
const objectiveContext={match:shotMatch,getBotDifficulty:()=>({capture:1,income:1,heroDamage:1}),chooseNearestTarget:(source,list,max)=>{let best=null,d=max;for(const x of list){const n=Math.hypot(x.x-source.x,x.y-source.y);if(n<d){d=n;best={target:x,distance:n};}}return best;},applyCombatDamage:(target,amount)=>{target.hp-=amount;},addCombatFeed:()=>{}};
vm.runInNewContext(outpostShot+'\nupdateBattleObjectives(0.1);',objectiveContext);assert.equal(victim.hp,100,'neutral outposts must not attack');
neutral.owner=1;neutral.fireTimer=0;vm.runInNewContext(outpostShot+'\nupdateBattleObjectives(0.1);',objectiveContext);assert.equal(victim.hp,84,'enemy outpost must attack player');
const enemyStats={team:1,hp:100,maxHp:100,damage:20,speed:180,attackInterval:.72};
vm.runInNewContext(extractFunction(js,'applyEnemyDifficulty')+'\napplyEnemyDifficulty(unit);',{unit:enemyStats,getBotDifficulty:()=>({unitHp:1.2,unitDamage:1.2,speed:1.15,attackSpeed:1.22})});
assert.equal(enemyStats.hp,120);assert.equal(enemyStats.damage,24);assert.ok(Math.abs(enemyStats.speed-207)<1e-9,'Enemy speed multiplier should be applied');assert.ok(enemyStats.attackInterval<.72);


const captureTarget=extractFunction(js,'chooseEnemyOutpostTarget');
const captureContext={entity:{id:1,x:0,y:0},outposts:[{id:1,x:200,y:0,owner:1,captureTeam:null},{id:2,x:40,y:0,owner:-1,captureTeam:null},{id:3,x:90,y:0,owner:0,captureTeam:0}]};
vm.runInNewContext(captureTarget+';globalThis.nearest=chooseEnemyOutpostTarget(entity,outposts);globalThis.distributed=chooseEnemyOutpostTarget({id:2,x:0,y:0},outposts,true);globalThis.none=chooseEnemyOutpostTarget({id:1,x:0,y:0},[{x:0,y:0,owner:1,captureTeam:null}]);',captureContext);
assert.equal(captureContext.nearest.target.id,2,'Bot chooses nearest neutral/player-owned outpost');
assert.equal(captureContext.distributed.target.id,3,'Additional bots spread to another available outpost');
assert.equal(captureContext.none,null,'Bot does not target its already-owned outposts');
const friendlyPoint={id:4,x:0,y:0,owner:0,captureTeam:null,progress:0,fireTimer:0};
const enemyHero={x:25,y:0,hp:100,maxHp:100,team:1,alive:true};
const recoveringAlly={x:12,y:0,hp:50,maxHp:100,team:0,alive:true};
const friendlyDefenseMatch={elapsed:0,player:{x:900,y:900,hp:100,maxHp:100,team:0,alive:true},allies:[recoveringAlly],units:[],bots:[enemyHero],outposts:[friendlyPoint],supplyCaches:[],playerCoins:0};
const friendlyDefenseContext={match:friendlyDefenseMatch,getBotDifficulty:()=>({capture:1,income:1,heroDamage:1}),chooseNearestTarget:(source,list,max)=>{let best=null,d=max;for(const candidate of list){const distance=Math.hypot(candidate.x-source.x,candidate.y-source.y);if(distance<d){d=distance;best={target:candidate,distance};}}return best;},applyCombatDamage:(target,amount)=>{target.hp-=amount;},addCombatFeed:()=>{}};
vm.runInNewContext(outpostShot+';updateBattleObjectives(1);',friendlyDefenseContext);
assert.equal(enemyHero.hp,84,'Player-owned outpost attacks enemy bots');
assert.ok(Math.abs(recoveringAlly.hp-52.4)<1e-9,'Friendly troops beside their outpost recover health');

console.log('Prime battle systems: all tests passed.');


const riftFunction=extractFunction(js,'updateEnergyRift');
const riftMatch={elapsed:85,energyRift:{x:0,y:0,active:false,nextAt:85,expiresAt:0,captureTeam:null,progress:0},player:{x:0,y:0,team:0,alive:true},allies:[],units:[],bots:[],playerCoins:0};
vm.runInNewContext(riftFunction+'\nupdateEnergyRift(4);',{match:riftMatch,addCombatFeed:()=>{},getBotDifficulty:()=>({income:1})});
assert.equal(riftMatch.playerCoins,260,'Capturing the energy rift rewards the team with 260 coins');
assert.equal(riftMatch.riftBuffTeam,0,'Captured rift grants the buff to the capturing team');
assert.equal(riftMatch.riftBuffUntil,107,'Rift damage buff lasts 22 seconds');
assert.equal(riftMatch.energyRift.active,false,'Captured rift closes after capture');
const riftDamage=extractFunction(js,'applyCombatDamage'),riftTarget={team:1,x:0,y:0,hp:200,alive:true},riftAttacker={team:0};
const riftDamageMatch={player:riftAttacker,allies:[],units:[],weather:{type:'clear'},commander:{warCryUntil:0,shieldUntil:0},elapsed:5,riftBuffTeam:0,riftBuffUntil:25,tracers:[],damageTexts:[]};
vm.runInNewContext(riftDamage+'\napplyCombatDamage(target,100,attacker);',{match:riftDamageMatch,target:riftTarget,attacker:riftAttacker,addDamageNumber:()=>{},addCombatFeed:()=>{}});
assert.equal(riftTarget.hp,80,'Energy rift increases capturing team damage by 20 percent');
assert.ok(js.includes('bot.damage=48;'),'Enemy bot heroes must use identical damage independent of bot difficulty; unit upgrades remain separate');
const respawnTarget={team:1,profile:{},isRemotePlayer:true,x:1,y:1,hp:100,maxHp:100,alive:true},respawnMatch={player:{},allies:[],units:[],weather:{type:'clear'},commander:{warCryUntil:0,shieldUntil:0},elapsed:5,tracers:[],damageTexts:[]};
vm.runInNewContext(riftDamage+'\napplyCombatDamage(target,100,attacker);',{match:respawnMatch,target:respawnTarget,attacker:riftAttacker,addDamageNumber:()=>{},addCombatFeed:()=>{}});
assert.equal(respawnTarget.alive,false,'A defeated remote fighter must enter the respawn state');
assert.equal(respawnTarget.respawnAt,17,'A defeated remote fighter returns after 12 seconds');
const loopSource=extractFunction(js,'loop');
assert.ok(!loopSource.includes('match.bots.every')&&!loopSource.includes('rival&&!rival.alive')&&!loopSource.includes('match.player.hp<=0'),'Online kills and player deaths must not finish the match');
assert.ok(js.includes("if(match.towers.filter(t=>t.team===1).every(t=>t.hp<=0)){finish(true);return;}"),'Victory is checked only after all enemy towers are destroyed');
assert.ok(js.includes("if(ownTower&&ownTower.hp<=0){finish(false);return;}"),'Defeat is checked when the home tower is destroyed');
assert.ok(js.includes("match.online?.mode==='pvp'&&bot.respawnAt&&match.elapsed>=bot.respawnAt"),'Online PvP opponents must respawn after the delay');
assert.ok(html.includes('id="hud-rift"'),'The energy rift objective must have a HUD indicator');
console.log('Prime online match rules and energy rift regression assertions passed');
