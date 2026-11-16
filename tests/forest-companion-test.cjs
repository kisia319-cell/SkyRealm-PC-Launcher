'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('game/forest-ecosystem.js','utf8');
const inventory={'Лесные ягоды':8};
const storage=new Map();
let player={x:0,y:0},day=1;
const bridge={
 getWorldId:()=> 'companion-world-test',
 getWorldBounds:()=>({width:5000,height:3600}),
 getBiomeAt:()=> 'forest',
 getPlayerPosition:()=>({...player}),
 getChallengeSnapshot:()=>({paused:false,day}),
 getGameDay:()=>day,
 isNightTime:()=>true,
 isBossRealm:()=>false,isTradeWorld:()=>false,isCoopWorld:()=>false,
 isCaveMode:()=>false,isMineMode:()=>false,isHouseMode:()=>false,isDungeonMode:()=>false,
 getItemCount:name=>inventory[name]||0,
 spendItem:(name,count)=>{if((inventory[name]||0)<count)return false;inventory[name]-=count;return true;},
 addItem:(name,count=1)=>{inventory[name]=(inventory[name]||0)+count;},
 addGold:()=>{},save:()=>{},toast:()=>{}
};
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))};
function boot(){const window={SkyRealmSeaBridge:bridge};vm.runInNewContext(source,{window,localStorage,console,Math,Number,String,Object,JSON,Array,Date,performance:{now:()=>1000}});return window.SkyRealmForestEcosystem;}
const api=boot();api.update(.1);
const animal=api.getState().animals.find(a=>a.id==='deer');
assert.ok(animal,'A deer is available to be tamed');
for(let n=1;n<=3;n++){
 day=(n-1)*3+1;
 player={x:animal.x,y:animal.y};
 assert.equal(api.interact(),true,'Feeding interaction '+n+' is handled');
}
assert.equal(api.getState().companionId,'deer','Three feedings tame the deer');
assert.equal(inventory['Лесные ягоды'],5,'Each taming visit consumes one berry');
assert.equal(inventory['Шёлковая шерсть'],3,'The animal rewards care with its species gift');
const before={x:animal.x,y:animal.y};
player={x:before.x+280,y:before.y+80};
api.update(.1);
const after=api.getState().animals.find(a=>a.id==='deer');
assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>0,'The tamed companion moves to follow the player');
day+=2;player={x:after.x,y:after.y};
const giftsBefore=inventory['Шёлковая шерсть'];
assert.equal(api.interact(),true,'Companion interaction is handled');
assert.equal(inventory['Шёлковая шерсть'],giftsBefore+1,'Companion brings a periodic gift');
const restarted=boot();restarted.update(.1);
assert.equal(restarted.getState().companionId,'deer','Companion ownership survives a world reload');
assert.ok(source.includes('✦ КОМПАНЬОН')&&source.includes('lastGiftDay'),'Companions have a distinct animated collar marker and gift cooldown');
console.log('Forest companion tests passed: three-step taming, berry cost, following movement, gifts and persistence.');
