'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'game', 'world-expansion.js'), 'utf8');
class FakeElement {
  constructor(tag) { this.tagName=tag; this.listeners={}; this.hidden=false; this.children=[]; this.attributes={}; this.innerHTML=''; this.textContent=''; this.style={}; }
  addEventListener(name,callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name,event={}) { for(const callback of this.listeners[name]||[]) callback(event); }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(selector) { this._queries ||= {}; return this._queries[selector] ||= new FakeElement('query'); }
  querySelectorAll(selector) {
    if(selector!=='[data-action]') return [];
    if(!this._actionControls){
      this._actionControls=Array.from(this.innerHTML.matchAll(/data-action="([^"]+)"/g),match=>{
        const control=new FakeElement('button');
        control.attributes['data-action']=match[1];
        control.getAttribute=name=>control.attributes[name]||null;
        return control;
      });
    }
    return this._actionControls;
  }
  setAttribute(name,value) { this.attributes[name]=value; }
  getAttribute(name) { return this.attributes[name]||null; }
}

const created=[];
const timers=[];
const enemyCounts=new Map();
const spawned=[];
const rewards={gold:0,items:[]};
const messages=[];
const stored=new Map();
const snapshot={worldId:'village-assault-regression',paused:false,day:6,difficulty:'medium',items:{'Древесина':0,'Камень':0},exploredCells:5,totalCells:100};
const bridge={
  getChallengeSnapshot:()=>snapshot,
  isBossRealm:()=>false,isTradeWorld:()=>false,isCoopWorld:()=>false,isSpecialWorldMode:()=>false,
  getVillageCenters:()=>[{id:'forest',x:320,y:420},{id:'snow',x:1100,y:900}],
  getPlayerPosition:()=>({x:300,y:400}),
  getWorldEventSpawnPoint:()=>({x:700,y:700}),
  spawnEventEnemies:(id,x,y,count)=>{spawned.push({id,x,y,count});enemyCounts.set(id,count);return count;},
  getEventEnemyCount:id=>enemyCounts.get(id)||0,
  addGold:cents=>{rewards.gold+=cents;},
  addItem:(name,count)=>rewards.items.push({name,count}),
  save:()=>{},pause:()=>{},resume:()=>{},toast:message=>messages.push(String(message))
};
const document={
  readyState:'complete',head:new FakeElement('head'),body:new FakeElement('body'),
  createElement:tag=>{const element=new FakeElement(tag);created.push(element);return element;},
  addEventListener:()=>{}
};
const window={SkyRealmSeaBridge:bridge,setInterval:callback=>{timers.push(callback);return timers.length;}};
const localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
vm.runInNewContext(source,{window,document,localStorage,console,Math,Number,String,Object,JSON,Array,Date});
const api=window.SkyRealmWorldExpansion;
assert.ok(api,'world expansion API must initialize');
assert.equal(api.getMode(),'ordinary');
const launch=created.find(element=>element.id==='world-expansion-launch');
assert.ok(launch,'chronicles launch button must exist');
launch.dispatch('click');
const panel=created.find(element=>element.id==='world-expansion-panel');
assert.ok(panel,'chronicles panel must open');
const content=panel.querySelector('#we-content');
assert.match(content.innerHTML,/Нападение на деревню/,'ordinary chronicles must show the village assault');
const action=content.querySelectorAll('[data-action]').find(control=>control.getAttribute('data-action')==='village-assault');
assert.ok(action,'village assault action must be available');
action.dispatch('click');
const active=api.getState().ordinary.assault;
assert.ok(active&&active.active,'starting the assault must persist an active event');
assert.equal(active.villageId,'forest','the nearest village must be selected');
assert.equal(spawned.length,1);
assert.equal(spawned[0].count,8,'an assault must spawn eight defenders');
const savedState=Array.from(stored.values()).map(value=>JSON.parse(value)).find(value=>value?.ordinary?.assault?.id===active.id);
assert.ok(savedState?.ordinary?.assault?.active,'the active assault must be written to the world save');
assert.match(messages.join(' '),/НАПАДЕНИЕ НА ДЕРЕВНЮ/);
enemyCounts.set(active.id,0);
assert.ok(timers.length>0,'world update loop must be registered');
timers[0]();
const completed=api.getState().ordinary.assault;
assert.equal(completed.active,false,'the assault must end after all defenders are defeated');
assert.equal(completed.claimed,true,'the reward must be claimed exactly once');
assert.equal(rewards.gold,18000,'the raid must grant 180 gold');
assert.deepEqual(rewards.items.map(item=>[item.name,item.count]),[['Знак налётчика',1],['Слиток закалённого железа',2]]);
timers[0]();
assert.equal(rewards.gold,18000,'repeated updates must not duplicate the reward');
console.log('Village assault regression checks passed: nearest settlement selection, eight defenders, persistent event state, and one-time loot.');
