'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const seaSource=fs.readFileSync('game/sea-system.js','utf8');
const html=fs.readFileSync('game/index.html','utf8');
assert.ok(html.includes('<script src="sea-system.js"></script>'),'Sea gameplay module must be loaded by the game');
assert.match(seaSource,/function upgradeShip\(kind\)/,'Shipyard must upgrade real ship systems');
assert.match(seaSource,/function fireHarpoon\(\)/,'Harpoon must be implemented as a real attack');
assert.match(seaSource,/function renderShipyard\(\)/,'Ship upgrades must have an in-game shipyard UI');
assert.match(seaSource,/state\.krakenSpawnTimer/,'The Kraken must appear only through a rare underwater spawn timer');
assert.match(seaSource,/function normalizeUpgrades\(\)/,'Old sea saves must migrate to new ship and exploration fields');
assert.match(seaSource,/state\.city\.guardianHp/,'The sunken city guardian must keep persistent health');
assert.match(seaSource,/state\.caves/,'Underwater caves must persist independently');
assert.match(seaSource,/state\.harpoonTrace/,'Harpoon attacks must render a projectile trace');

class FakeElement {
  constructor(){this.id='';this.hidden=false;this.disabled=false;this.listeners={};this.children=[];this.dataset={};this.style={};this.title='';this.textContent='';}
  addEventListener(name,fn){this.listeners[name]=fn;}
}
const elements={};
const document={
  readyState:'complete',
  getElementById(id){return elements[id]||null;},
  createElement(){return new FakeElement();},
  body:{appendChild(el){if(el.id)elements[el.id]=el;return el;}},
  addEventListener(){}
};
const inventory={Древесина:500,Железо:500,Медь:500,Кристалл:100,Серебро:100};
const rewards={gold:100000,items:{},saves:0,toasts:[]};
let seaData=null,failGold=false;
const bridge={
  getWorldId:()=> 'sea-gameplay-test',
  getSeaData:()=>seaData,
  setSeaData:data=>{seaData=JSON.parse(JSON.stringify(data));},
  getItemCount:name=>inventory[name]||0,
  getGold:()=>Math.floor(rewards.gold/100),
  spendItem:(name,count)=>{if((inventory[name]||0)<count)return false;inventory[name]-=count;return true;},
  spendGold:amount=>{if(failGold||rewards.gold<amount*100)return false;rewards.gold-=amount*100;return true;},
  addItem:(name,count=1)=>{inventory[name]=(inventory[name]||0)+count;rewards.items[name]=(rewards.items[name]||0)+count;return inventory[name];},
  addGold:amount=>{rewards.gold+=amount;},
  hasItem:()=>false,
  save:()=>{rewards.saves++;},
  toast:message=>rewards.toasts.push(String(message))
};
const window={SkyRealmSeaBridge:bridge,setInterval:()=>1};
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
vm.runInNewContext(seaSource,{window,document,localStorage,console,Date,Math,JSON,Object,Number,String,Array,Map,Set,Promise,devicePixelRatio:1});
const api=window.SkyRealmSea;
assert.ok(api,'Sea API should initialize without opening a canvas');
assert.equal(api.upgradeShip('sails'),true,'Sails can be upgraded at the starting dock');
assert.equal(api.getState().upgrades.sails,1);
assert.equal(api.upgradeShip('hull'),true,'Hull can be upgraded with real inventory materials');
assert.equal(api.boatMaxHp(),125,'One hull upgrade must add 25 maximum durability');
assert.equal(api.getState().boatHp,125,'A hull upgrade repairs the newly added durability');
const beforeIron=inventory.Железо,beforeWood=inventory.Древесина;
failGold=true;
assert.equal(api.upgradeShip('oxygen'),false,'A failed gold charge must cancel an oxygen upgrade');
assert.equal(inventory.Железо,beforeIron,'Materials must be refunded if gold payment fails');
assert.equal(inventory.Древесина,beforeWood,'Unrelated materials must remain unchanged');
failGold=false;
assert.equal(api.upgradeShip('oxygen'),true,'The oxygen system can be installed');
assert.equal(api.upgradeShip('harpoon'),true,'The harpoon can be installed');
assert.equal(api.getState().upgrades.harpoon,1);
assert.ok(seaData&&seaData.upgrades.harpoon===1,'Ship upgrades must persist to the world sea save');

const saved=api.getState();
seaData={...saved,version:1,boatHp:0,x:13,y:82,underwater:false,harpoonCooldown:0,sharks:[{id:'test-shark',x:14,y:82,hp:55,speed:1,angle:0,cool:10}],monsters:[],treasures:[],opened:[],discovered:[]};
api.load();
api.ensureWorld();
assert.equal(api.getState().boatHp,0,'A destroyed ship must remain destroyed after loading an existing sea save');
assert.equal(api.boatMaxHp(),125,'Old sea saves must retain upgraded hull durability');
assert.equal(api.fireHarpoon(),true,'The upgraded harpoon must hit a nearby shark');
assert.equal(api.getState().sharks.length,0,'A defeated shark must be removed from the living population');
assert.equal(inventory['Акулья чешуя'],2,'A defeated shark must grant real inventory loot');

const afterShark=api.getState();
seaData={...afterShark,underwater:true,x:116,y:102,harpoonCooldown:0,sharks:[],monsters:[],treasures:[],opened:[],caves:[{id:'coral',x:116,y:102,active:false,hp:420,maxHp:420,cleared:false},{id:'abyss',x:238,y:174,active:false,hp:780,maxHp:780,cleared:false}]};
api.load();
api.ensureWorld();
assert.equal(api.fireHarpoon(),true,'The harpoon must damage the guardian of an underwater cave');
assert.ok(api.getState().caves.find(v=>v.id==='coral').hp<420,'Cave guardian health must decrease on a real harpoon hit');
assert.ok(rewards.saves>=6,'Successful upgrades and attacks must save progress');
console.log('Sea gameplay passed: ship upgrades, transactional refunds, persistent hull damage, harpoon combat, real shark loot, underwater cave guardians and save migration.');
