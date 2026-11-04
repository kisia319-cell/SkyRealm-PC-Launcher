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
  'Древесина':500,'Камень':500,'Железо':500,'Медь':500,'Кристалл':100,'Уголь':100
};
const rewards={gold:100000,items:{},damage:0,saves:0,toasts:[]};
let snapshot={worldId:'expansion-test-world',difficulty:'medium',paused:false,day:4};
let gameMinuteTotal=3*1440+12*60;
let night=false;
const bridge={
  getWorldId:()=>snapshot.worldId,
  getChallengeSnapshot:()=>({...snapshot,items:{...inventory},level:20,hp:100}),
  getGameMinuteTotal:()=>gameMinuteTotal,
  getDifficulty:()=>snapshot.difficulty,
  isNightTime:()=>night,
  getStats:()=>({level:20,hp:100,weaponDamage:2500,gold:Math.floor(rewards.gold/100),difficulty:snapshot.difficulty}),
  getItemCount:name=>inventory[name]||0,
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

assert.equal(api.build('generator'),true,'Generator can be built from real resources');
assert.equal(api.getState().grid.generators,1);
assert.equal(api.build('turret'),false,'Turret must remain locked until research I');
assert.equal(api.research(),true,'First technology research should unlock automation');
assert.equal(api.build('battery'),true,'Battery can be built');
assert.equal(api.build('turret'),true,'Research I unlocks the defensive turret');
assert.equal(api.build('wall'),true,'Settlement wall can be built');
assert.ok(api.getState().grid.walls===1);
api.update(30);
assert.ok(api.getState().power>0,'Fueled generator must produce electricity');
assert.ok(inventory['Уголь']<100,'Generator must consume actual fuel');

assert.equal(api.startEvent('invasion',3),true,'A night siege event can start');
const beforeEventGold=rewards.gold;
for(let i=0;i<10&&api.getState().event;i++)api.attackEvent();
assert.equal(api.getState().event,null,'Manual defence must be able to defeat a siege');
assert.equal(api.getState().stats.eventsWon,1);
assert.ok(rewards.gold>beforeEventGold,'Successful defence must award gold');
assert.ok(inventory['Древний осколок']>=1,'Successful defence must grant a real inventory item');
night=true;gameMinuteTotal=3*1440+21*60;api.update(1);
assert.ok(api.getState().event,'An automatic night siege should start after the second night');
for(let i=0;i<10&&api.getState().event;i++)api.attackEvent();
night=false;

assert.equal(api.startDungeon(),true,'Automation research unlocks the citadel expedition');
for(let room=1;room<=5;room++){
  assert.equal(api.getState().dungeon.active,true,'Room '+room+' must become active');
  assert.equal(api.attackDungeon(),true,'Player can attack room '+room);
  assert.ok(api.getState().dungeon.cleared.includes(room),'Room '+room+' must be marked cleared');
  if(room<5)assert.equal(api.nextDungeonRoom(),true,'The next room must open without paying the entry fee again');
}
assert.equal(api.getState().stats.dungeonsCleared,1,'Final boss defeat must record one completed citadel');
assert.ok(api.getState().relics.length>=1,'Final citadel boss must drop a guaranteed rare relic');
const relic=api.getState().relics[0];
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

const beforePaused=api.getState().power;
snapshot.paused=true;
api.update(20);
assert.equal(api.getState().power,beforePaused,'Generator and event simulation must pause with the world');
snapshot.paused=false;
console.log('SkyRealm expansion systems passed: real inventory crafting, generator power, tech unlocks, settlement defense, event rewards, five-room citadel, guaranteed rare relics, save/load and pause handling.');
