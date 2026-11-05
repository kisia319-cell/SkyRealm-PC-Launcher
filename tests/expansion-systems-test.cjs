'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const moduleSource=fs.readFileSync('game/expansion-systems.js','utf8');
const game=fs.readFileSync('game/game.js','utf8');
const html=fs.readFileSync('game/index.html','utf8');

assert.ok(html.includes('<script src="expansion-systems.js"></script>'),'Expansion module must be loaded by the game');
assert.ok(game.includes('expansionSystems:window.SkyRealmExpansionSystems?.exportState?.()||null'),'Expansion state must be included in normal world saves');
assert.ok(game.includes('window.SkyRealmExpansionSystems?.importState?.(d?.expansionSystems||null)'),'Existing worlds must load expansion state safely');
assert.ok(game.includes('window.SkyRealmExpansionSystems?.update?.(dt)'),'Expansion systems must update with the game world');
assert.ok(game.includes('window.SkyRealmExpansionSystems?.damageMultiplier?.()||1'),'Equipped relics must affect player weapon damage');
assert.ok(game.includes('window.SkyRealmExpansionSystems?.defenseBonus?.()||0'),'Equipped relics must affect player defense');
assert.ok(game.includes("'tech-generator','tech-battery','tech-lamp','tech-turret','tech-drill','tech-shield','tech-wall','tech-guardpost','tech-trap'"),'Technology structures must load from world saves');
assert.ok(game.includes("s.type==='tech-generator'"),'Placed technology buildings must be drawn in the world');
assert.ok(game.includes('placeExpansionStructure:type=>'),'Technology placement API must be connected to the game world');
assert.ok(game.includes("'guardpost','trap','drill'"),'Guard barracks and electric traps must be accepted as real world structures');
assert.ok(moduleSource.includes("if(action==='dungeon-enter'){startDungeon();return;}"),'Citadel entry button must call the implemented dungeon entry function');
assert.ok(moduleSource.includes('const DUNGEON_ROUTES = {'),'Citadel must offer multiple expedition routes');
assert.ok(moduleSource.includes("enemy:'Титан-крушитель'")&&moduleSource.includes("enemy:'Рыцарь пустоты'"),'Each route must define distinct monster types');
assert.ok(game.includes('function notifyExpansionEnemyDefeated(mob)'),'Siege enemy deaths must notify the event system exactly once');
assert.ok(game.includes('spawnEventEnemies:(eventId,x,y,count=6)'),'Night sieges must spawn real world monsters');
assert.ok(game.includes('mob.expansionEventId=String(eventId)'),'Siege monsters must be tracked to their event');
assert.ok(game.includes('notifyExpansionEnemyDefeated(target)'),'Normal attacks must count defeated siege monsters');

class FakeElement {
  constructor(){this.hidden=false;this.listeners={};this.children=[];this.dataset={};this.style={};this._html='';this.textContent='';this.id='';}
  addEventListener(name,fn){this.listeners[name]=fn;}
  appendChild(el){this.children.push(el);return el;}
  set innerHTML(value){this._html=String(value);}
  get innerHTML(){return this._html;}
  click(){this.listeners.click?.({target:this});}
}
const elements={};
const document={
  readyState:'complete',
  head:{appendChild(el){return el;}},
  body:{appendChild(el){if(el.id)elements[el.id]=el;return el;}},
  createElement(){return new FakeElement();},
  getElementById(id){return elements[id]||null;},
  addEventListener(){}
};
const inventory={
  'Древесина':500,'Камень':500,'Железо':500,'Медь':500,'Кристалл':100,'Уголь':100,'Мифрил':50,'Серебро':100
};
const rewards={gold:100000,items:{},damage:0,saves:0,toasts:[]};
const worldStructures=[];
let allowPlacement=true;
let snapshot={worldId:'expansion-test-world',difficulty:'medium',paused:false,day:4};
let gameMinuteTotal=3*1440+12*60;
let night=false;
let playerPosition={x:100,y:100};
let activeEventEnemies=0;
const bridge={
  getWorldId:()=>snapshot.worldId,
  isCoopWorld:()=>false,
  getPlayerPosition:()=>({...playerPosition}),
  getWorldEventSpawnPoint:()=>({x:100,y:100}),
  spawnEventEnemies:(eventId,x,y,count)=>{activeEventEnemies=count;return count;},
  getEventEnemyCount:()=>activeEventEnemies,
  damageEventEnemy:(eventId,damage)=>{if(activeEventEnemies>0){activeEventEnemies--;window.SkyRealmExpansionSystems?.onMonsterDefeated?.(eventId);return true;}return false;},
  clearEventEnemies:()=>{activeEventEnemies=0;},
  getChallengeSnapshot:()=>({...snapshot,items:{...inventory},level:20,hp:100}),
  getGameMinuteTotal:()=>gameMinuteTotal,
  getDifficulty:()=>snapshot.difficulty,
  isNightTime:()=>night,
  getStats:()=>({level:20,hp:100,weaponDamage:2500,gold:Math.floor(rewards.gold/100),difficulty:snapshot.difficulty}),
  getItemCount:name=>inventory[name]||0,
  placeExpansionStructure:type=>{if(!allowPlacement)return false;worldStructures.push(type);return true;},
  spendItem:(name,count)=>{if((inventory[name]||0)<count)return false;inventory[name]-=count;return true;},
  getGold:()=>Math.floor(rewards.gold/100),
  spendGold:amount=>{const cost=amount*100;if(rewards.gold<cost)return false;rewards.gold-=cost;return true;},
  addGold:amount=>{rewards.gold+=amount;},
  addItem:(name,count=1)=>{rewards.items[name]=(rewards.items[name]||0)+count;inventory[name]=(inventory[name]||0)+count;return inventory[name];},
  damagePlayer:amount=>{rewards.damage+=amount;return Math.max(0,100-rewards.damage);},
  save:()=>{rewards.saves++;},
  toast:message=>rewards.toasts.push(String(message)),
  pause:()=>{snapshot.paused=true;},
  resume:()=>{snapshot.paused=false;}
};
const window={SkyRealmSeaBridge:bridge,setInterval:()=>1};
vm.runInNewContext(moduleSource,{window,document,console,Date,Math,JSON,Object,Number,String,Array,Map,Set});
const api=window.SkyRealmExpansionSystems;
assert.ok(api,'Expansion API should boot');
assert.ok(elements['expansion-launch'],'Technology button should be created');
assert.ok(elements['skyrealm-expansion'],'Expansion panel should be created');

assert.equal(api.build('generator'),true,'Generator can be built from real resources and placed in the world');
assert.equal(api.getState().grid.generators,1);
assert.deepEqual(worldStructures,['generator'],'Technology building must create a real world structure');
const oreBeforeFailedPlacement=inventory['Медь'];allowPlacement=false;
assert.equal(api.build('lamp'),false,'No-space placement must fail safely');
assert.equal(inventory['Медь'],oreBeforeFailedPlacement,'Failed placement must refund all spent resources');
assert.equal(api.getState().grid.lamps,0,'Failed placement must not increase the building count');
allowPlacement=true;
assert.equal(api.build('turret'),false,'Turret must remain locked until research I');
assert.equal(api.research(),true,'First technology research should unlock automation');
assert.equal(api.build('battery'),true,'Battery can be built');
assert.equal(api.build('turret'),true,'Research I unlocks the defensive turret');
assert.equal(api.build('wall'),true,'Settlement wall can be built');
assert.ok(api.getState().grid.walls===1);
assert.equal(api.build('guardpost'),true,'Guard barracks hire two settlement defenders');
assert.equal(api.getState().grid.guardposts,1);
assert.ok(worldStructures.includes('guardpost'),'Guard barracks must be placed as a real world structure');
assert.equal(api.build('trap'),true,'Electric traps can be built with research I');
assert.equal(api.getState().grid.traps,1);
assert.ok(worldStructures.includes('trap'),'Electric traps must be placed as real world structures');
assert.equal(api.research(),true,'Second technology research unlocks industrial mining');
assert.equal(api.build('drill'),true,'Research II unlocks the automatic mining drill');
assert.equal(api.research(),true,'Third technology research unlocks energy shields');
assert.equal(api.build('shield'),true,'Research III unlocks the settlement power shield');
api.update(30);
assert.ok(api.getState().power>0,'Fueled generator must produce electricity');
assert.ok(inventory['Уголь']<100,'Generator must consume actual fuel');
const stoneBeforeDrill=inventory['Камень'];
for(let i=0;i<30;i++)api.update(1);
assert.ok(inventory['Камень']>stoneBeforeDrill,'Powered mining drill must add real stone to inventory');

assert.equal(api.startEvent('invasion',3),true,'A night siege event can start');
assert.equal(api.getState().event.x,100,'World event must store a physical location');
assert.equal(api.getState().event.y,100,'World event must store a physical location');
assert.equal(typeof api.drawWorldEvent,'function','World event must expose a canvas renderer');
const fakeContext={save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},ellipse(){},fillRect(){},fillText(){}};
api.drawWorldEvent(fakeContext,0,0,1,800,600);
const beforeEventGold=rewards.gold;
playerPosition={x:900,y:900};
assert.equal(api.attackEvent(),false,'Player cannot attack a world event from across the map');
playerPosition={x:100,y:100};
assert.equal(activeEventEnemies,6,'Night siege must spawn actual enemy units');
const remainingBeforeEngage=api.getState().event.remaining;
assert.equal(api.interactWorldEvent(),true,'Player can activate the beacon using the world interaction key');
assert.equal(api.getState().event.remaining,remainingBeforeEngage,'Activating the beacon must not instantly kill enemies');
const firstEventId=api.getState().event.id;
api.update(1.8);api.update(1.8);
assert.ok(activeEventEnemies<6,'Hired guards must attack real siege monsters');
assert.equal(api.getState().event.remaining,activeEventEnemies,'Guard kills must update the live event counter');
for(let i=0;i<6&&api.getState().event;i++){activeEventEnemies--;api.onMonsterDefeated(firstEventId);}
assert.equal(api.getState().event,null,'Defeating all real siege monsters must complete the event');
assert.equal(api.getState().stats.eventsWon,1);
assert.ok(rewards.gold>beforeEventGold,'Successful defence must award gold');
assert.ok(inventory['Древний осколок']>=1,'Successful defence must grant a real inventory item');
const trapState=api.exportState();trapState.grid.guardposts=0;trapState.grid.turrets=0;trapState.grid.traps=1;trapState.power=100;api.importState(trapState);
api.startEvent('invasion',4);const beforeTrap=activeEventEnemies;api.update(1);api.update(1);assert.ok(activeEventEnemies<beforeTrap,'Powered electric traps must damage real invaders');
while(api.getState().event){activeEventEnemies--;api.onMonsterDefeated(api.getState().event.id);}
const shieldState=api.exportState();shieldState.grid.guardposts=0;shieldState.grid.traps=0;shieldState.grid.turrets=0;shieldState.power=100;shieldState.fuelSeconds=0;api.importState(shieldState);
api.startEvent('invasion',4);const damageBeforeShield=rewards.damage;
for(let i=0;i<120&&api.getState().event;i++)api.update(1);
assert.equal(api.getState().event,null,'An unattended siege must resolve when its timer expires');
assert.ok(rewards.damage-damageBeforeShield<15,'Powered shield and walls must reduce failure damage');
night=true;gameMinuteTotal=3*1440+21*60;shieldState.grid.turrets=1;shieldState.power=100;api.importState(shieldState);api.update(1);
assert.ok(api.getState().event,'An automatic night siege should start after the second night');
const automaticEventId=api.getState().event.id;
const automaticRemaining=api.getState().event.remaining;
for(let i=0;i<3;i++)api.update(1);
assert.ok(api.getState().event.remaining<automaticRemaining,'Powered turrets must damage real siege monsters');
while(api.getState().event){activeEventEnemies--;api.onMonsterDefeated(automaticEventId);}
night=false;

assert.equal(api.selectDungeonRoute('forge'),true,'Player can select the Titan Forge route before paying the entry fee');
assert.equal(api.getState().dungeon.route,'forge');
api.open();
const expansionPanel=elements['skyrealm-expansion'];
expansionPanel.listeners.click({target:{closest:()=>({dataset:{expansionAction:'tab:dungeon'}})}});
assert.match(expansionPanel.innerHTML,/data-expansion-action="dungeon-enter"/,'Citadel entry action must be shown in the panel');
expansionPanel.listeners.click({target:{closest:()=>({dataset:{expansionAction:'dungeon-enter'}})}});
assert.equal(api.getState().dungeon.active,true,'The citadel panel entry button must start the room instead of throwing');
assert.equal(api.getState().dungeon.route,'forge','Selected expedition route must be retained when entering');
assert.equal(api.selectDungeonRoute('shadow'),false,'Route cannot be changed after entry has been paid');
api.close();
const goldAfterEntry=rewards.gold,ironAfterEntry=inventory['Железо'];
assert.equal(api.leaveDungeon(),true,'Player can retreat without losing room progress');
assert.equal(api.startDungeon(),true,'Player can resume an already-paid expedition');
assert.equal(rewards.gold,goldAfterEntry,'Resuming must not charge the entry fee again');
assert.equal(inventory['Железо'],ironAfterEntry,'Resuming must not consume entry materials again');
for(let room=1;room<=5;room++){
  assert.equal(api.getState().dungeon.active,true,'Room '+room+' must become active');
  assert.equal(api.attackDungeon(),true,'Player can attack room '+room);
  assert.ok(api.getState().dungeon.cleared.includes(room),'Room '+room+' must be marked cleared');
  if(room<5)assert.equal(api.nextDungeonRoom(),true,'The next room must open without paying the entry fee again');
}
assert.equal(api.getState().stats.dungeonsCleared,1,'Final boss defeat must record one completed citadel');
assert.ok(api.getState().relics.length>=1,'Final citadel boss must drop a guaranteed rare relic');
const relic=api.getState().relics.at(-1);
assert.ok(['Эпическая','Легендарная'].includes(relic.rarity),'Final guaranteed relic must be epic or legendary');
assert.equal(api.equipRelic(relic.id),true);
assert.ok(api.damageMultiplier()>1,'Equipped relic must increase attack damage');
assert.ok(api.defenseBonus()>0,'Equipped relic must increase defense');

const saved=api.exportState();
api.importState(null);
assert.equal(api.getState().grid.generators,0,'A new world without expansion save must not inherit another world');
api.importState(saved);
assert.equal(api.getState().stats.dungeonsCleared,1,'Expansion progress must survive save/load');
assert.equal(api.getState().equippedRelic,relic.id,'Equipped relic must survive save/load');
assert.equal(api.getState().dungeon.route,'forge','Expedition route must survive save/load');

const beforePaused=api.getState().power;
snapshot.paused=true;
api.update(20);
assert.equal(api.getState().power,beforePaused,'Generator and event simulation must pause with the world');
snapshot.paused=false;
console.log('SkyRealm expansion systems passed: real inventory crafting, generator power, tech unlocks, settlement defense, event rewards, five-room citadel, guaranteed rare relics, save/load and pause handling.');
