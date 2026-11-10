'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','game','world-expansion.js'),'utf8');
const game=fs.readFileSync(path.join(__dirname,'..','game','game.js'),'utf8');
class Element{
  constructor(){this.hidden=false;this.listeners={};this.attributes={};this.children=[];this.style={};this.innerHTML='';this.textContent='';}
  addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}
  appendChild(node){this.children.push(node);return node;}
  querySelector(){return new Element();}
  querySelectorAll(){return [];}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name]||null;}
}
const created=[],timers=[],stored=new Map(),spent=[];
let activeWorld='relations-world-a',day=4,damageCount=2;
const centers=[{id:'forest',x:100,y:100},{id:'snow',x:900,y:900},{id:'desert',x:1700,y:1400}];
const legacy={version:1,worldId:activeWorld,ordinary:{day:3,accepted:{id:'timber',day:3,baseline:{'Древесина':0}},claimedDay:2,raid:null,expedition:null,assault:{id:'legacy-assault',day:3,villageId:'forest',villageName:'Лесная деревня',active:true,claimed:false}},boss:{day:3,accepted:null,claimedDay:-1,wardenDay:-1}};
stored.set('skyrealm_world_expansion_v1_'+encodeURIComponent(activeWorld),JSON.stringify(legacy));
const snapshot={worldId:activeWorld,paused:false,day,items:{'Древесина':100,'Камень':100,'Железо':20}};
const bridge={
  getChallengeSnapshot:()=>({...snapshot,worldId:activeWorld,day}),
  isBossRealm:()=>false,isCoopWorld:()=>false,isSpecialWorldMode:()=>false,
  getVillageCenters:()=>centers,getPlayerPosition:()=>({x:110,y:110}),
  getItemCount:()=>100,spendItem:(name,count)=>{spent.push([name,count]);return true;},
  spendGold:amount=>{spent.push(['золото',amount]);return true;},
  getVillageDamageCount:()=>damageCount,repairVillageDamage:()=>{const n=damageCount;damageCount=0;return n;},
  addGold:()=>{},addItem:()=>{},save:()=>{},pause:()=>{},resume:()=>{},toast:()=>{},
  getWorldEventSpawnPoint:()=>({x:500,y:500})
};
const document={readyState:'complete',head:new Element(),body:new Element(),createElement:()=>{const e=new Element();created.push(e);return e;},addEventListener:()=>{}};
const window={SkyRealmSeaBridge:bridge,setInterval:fn=>{timers.push(fn);return timers.length;}};
const localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
vm.runInNewContext(source,{window,document,localStorage,console,Math,Number,String,Object,JSON,Array,Date});
const api=window.SkyRealmWorldExpansion;
assert.ok(api,'settlement relations API initializes');
assert.equal(api.getState().ordinary.day,3,'v1 chronicle must migrate');
assert.equal(api.getState().ordinary.assault.id,'legacy-assault','migration must preserve active assaults');
assert.equal(api.getVillageRelation('forest').trust,0);
assert.equal(api.getTradePriceFactor('buy'),1);

api.recordVillageCrime('forest','assault');
assert.equal(api.getVillageRelation('forest').trust,-34);
assert.equal(api.getVillageRelation('forest').wanted,65);
assert.ok(api.getTradePriceFactor('buy')>1);
assert.ok(api.getTradePriceFactor('sell')<1);
api.recordVillageCrime('forest','theft');
api.recordVillageCrime('forest','destruction');
assert.equal(api.canTrade(),false,'severe crime must close trade');
assert.equal(api.getVillageRelation('snow').trust,0,'relations must be per village');
assert.ok(api.payVillageFine('forest'));
assert.equal(api.canTrade(),true,'fine payment must reopen trade');
assert.ok(api.repairVillage('forest'));
assert.equal(damageCount,0);
assert.ok(api.getVillageRelation('forest').trust>-59);
assert.ok(api.donateVillage('forest'));
assert.ok(api.getVillageRelation('forest').trust>-45);

const originalTrust=api.getVillageRelation('forest').trust;
activeWorld='relations-world-b';timers[0]();
assert.equal(api.getVillageRelation('forest').trust,0,'new world must have independent reputation');
activeWorld='relations-world-a';timers[0]();
assert.equal(api.getVillageRelation('forest').trust,originalTrust,'reputation must persist across world switching');

assert.ok(game.includes("recordVillageCrime?.(String(house.key).split(':')[0]"),'attacking houses must count as a crime');
assert.ok(game.includes("recordVillageCrime?.(String(cache.id),'theft')"),'opening a village cache must count as theft');
assert.ok(game.includes("getVillageDamageCount:(villageId)=>"),'game bridge must expose repairable village damage');
assert.ok(game.includes("repairVillageDamage:(villageId)=>"),'game bridge must restore damaged structures');
assert.ok(game.includes("getTradePriceFactor?.('buy')"),'NPC purchase prices must use settlement relations');
assert.ok(game.includes("getTradePriceFactor?.('sell')"),'NPC sale prices must use settlement relations');
console.log('Settlement relations tests passed: migration, crimes, fines, repair, donations, independent reputation, save persistence and trade consequences.');
