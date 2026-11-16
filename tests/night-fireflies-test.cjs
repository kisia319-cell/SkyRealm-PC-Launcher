'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('game/forest-ecosystem.js','utf8');
const inventory={};
const storage=new Map();
let player={x:0,y:0};
let day=1;
let night=true;
const bridge={
  getWorldId:()=> 'firefly-world-test',
  getWorldBounds:()=>({width:5000,height:3600}),
  getBiomeAt:()=> 'forest',
  getPlayerPosition:()=>({...player}),
  getChallengeSnapshot:()=>({paused:false,day}),
  getGameDay:()=>day,
  isNightTime:()=>night,
  isBossRealm:()=>false,
  isTradeWorld:()=>false,
  isCoopWorld:()=>false,
  isCaveMode:()=>false,
  isMineMode:()=>false,
  isHouseMode:()=>false,
  isDungeonMode:()=>false,
  addItem:(name,count=1)=>{inventory[name]=(inventory[name]||0)+count;},
  addGold:()=>{},
  save:()=>{},
  toast:()=>{}
};
const localStorage={
  getItem(key){return storage.has(key)?storage.get(key):null;},
  setItem(key,value){storage.set(key,String(value));}
};
function boot(){
  const window={SkyRealmSeaBridge:bridge};
  vm.runInNewContext(source,{window,localStorage,console,Math,Number,String,Object,JSON,Array,Date,performance:{now:()=>1000}});
  return window.SkyRealmForestEcosystem;
}
const api=boot();
assert.ok(api,'Forest ecosystem module boots');
api.update(.1);
let state=api.getState();
assert.equal(state.fireflies.length,5,'Five deterministic firefly swarms are generated per world');
const swarm=state.fireflies[0];
player={x:swarm.x,y:swarm.y};
assert.equal(api.interact(),true,'A nearby night swarm can be harvested');
assert.equal(inventory['Светлячковая пыльца'],2,'Harvesting grants two units of glowing pollen');
assert.equal(api.getState().fireflies[0].lastHarvestDay,1,'Harvest day is saved per swarm');
assert.equal(api.interact(),true,'The same swarm handles a repeated interaction');
assert.equal(inventory['Светлячковая пыльца'],2,'The three-day cooldown prevents duplicate harvesting');
day=4;
assert.equal(api.interact(),true,'The swarm becomes harvestable again after three game days');
assert.equal(inventory['Светлячковая пыльца'],4,'A new harvest grants pollen after cooldown');
const restarted=boot();
restarted.update(.1);
assert.equal(restarted.getState().fireflies[0].lastHarvestDay,4,'Harvest cooldown survives a world reload');
night=false;
player={x:0,y:0};
assert.equal(restarted.interact(),false,'Daytime swarms cannot be harvested');
assert.ok(source.includes('function drawFireflies(')&&source.includes('drawFireflies(ctx,cx,cy,t,w,h);'),'Firefly swarms have a dedicated animated renderer');
console.log('Night firefly tests passed: deterministic spawns, animated night rendering, harvest rewards and persistent cooldown.');
