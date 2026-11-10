'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const game=fs.readFileSync(path.join(__dirname,'..','game','game.js'),'utf8');
const expansion=fs.readFileSync(path.join(__dirname,'..','game','world-expansion.js'),'utf8');
assert.match(game,/getVillageStructureCounts:\(villageId\)=>/,'game bridge must expose village structure counts');
assert.match(game,/buildVillageStructure:\(villageId,kind\)=>/,'game bridge must expose village construction');
assert.match(game,/'Древесина':24,'Камень':12/,'house must consume real wood and stone');
assert.match(game,/'Древесина':12,'Камень':8/,'storage must consume real wood and stone');
assert.match(game,/'Древесина':30,'Камень':20,'Железо':8/,'watchtower must consume real materials');
assert.match(game,/village-watchtower/,'watchtower must have a dedicated visual type');
assert.match(game,/villageId:String\(villageId\)/,'new structures must be linked to and saved with their village');
assert.match(expansion,/Развитие деревни/,'world chronicles must show village development');
assert.match(expansion,/build-village-house/,'world chronicles must expose house construction');
assert.match(expansion,/build-village-storage/,'world chronicles must expose storage construction');
assert.match(expansion,/build-village-watchtower/,'world chronicles must expose watchtower construction');
class Element {
  constructor(){this.listeners={};this.hidden=false;this.innerHTML='';this.textContent='';this.attributes={};}
  addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
  dispatch(name,event={}){for(const fn of this.listeners[name]||[])fn(event);}
  appendChild(child){return child;}
  querySelector(selector){this.queries ||= {};return this.queries[selector] ||= new Element();}
  querySelectorAll(selector){
    if(selector!=='[data-action]')return [];
    return [...this.innerHTML.matchAll(/data-action="([^"]+)"/g)].map(m=>{const e=new Element();e.attributes['data-action']=m[1];e.getAttribute=k=>e.attributes[k]||null;return e;});
  }
}
const made=[],calls=[],timers=[];
const snapshot={worldId:'village-build-test',paused:false,day:3,items:{'Древесина':80,'Камень':60,'Железо':20}};
const bridge={
  getChallengeSnapshot:()=>snapshot,isBossRealm:()=>false,isTradeWorld:()=>false,isCoopWorld:()=>false,isSpecialWorldMode:()=>false,
  getVillageCenters:()=>[{id:'forest',x:100,y:100}],getPlayerPosition:()=>({x:110,y:105}),
  getVillageStructureCounts:()=>({houses:0,storages:0,watchtowers:0}),
  buildVillageStructure:(id,kind)=>{calls.push({id,kind});return true;},
  pause:()=>{},resume:()=>{},save:()=>{},toast:()=>{},addGold:()=>{},addItem:()=>{}
};
const document={readyState:'complete',head:new Element(),body:new Element(),createElement:()=>{const e=new Element();made.push(e);return e;},addEventListener:()=>{}};
const window={SkyRealmSeaBridge:bridge,setInterval:fn=>{timers.push(fn);return timers.length;}};
const localStorage={getItem:()=>null,setItem:()=>{}};
vm.runInNewContext(expansion,{window,document,localStorage,console,Math,Number,String,Object,JSON,Array,Date});
const launch=made.find(e=>e.id==='world-expansion-launch');assert.ok(launch);
launch.dispatch('click');
const panel=made.find(e=>e.id==='world-expansion-panel');assert.ok(panel);
const content=panel.querySelector('#we-content');
const controls=content.querySelectorAll('[data-action]');
for(const kind of ['house','storage','watchtower']){
  const control=controls.find(e=>e.getAttribute('data-action')==='build-village-'+kind);
  assert.ok(control,'build control should exist for '+kind);
  control.dispatch('click');
}
assert.deepEqual(calls,[{id:'forest',kind:'house'},{id:'forest',kind:'storage'},{id:'forest',kind:'watchtower'}]);
console.log('Village building regression checks passed: real material costs, saved village-linked structures, watchtower rendering and chronicles controls.');
