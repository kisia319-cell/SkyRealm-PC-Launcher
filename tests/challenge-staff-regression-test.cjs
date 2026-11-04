'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const game = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../game/index.html'), 'utf8');
const challenge = fs.readFileSync(path.join(__dirname, '../game/challenge-mode.js'), 'utf8');
const staffApi = fs.readFileSync(path.join(__dirname, '../supabase/functions/skyrealm-staff/index.ts'), 'utf8');

assert.ok(game.includes("window.SkyRealmChallengeHooks?.onItemGained?.(name,delta)"));
assert.ok(game.includes("changeItem('Древесина',7)"));
assert.ok(game.includes("changeItem(target.ore,1)"));
assert.ok(html.includes('id="menu-privileges"'));
assert.ok(html.includes('id="admin-privileges-shade"'));
assert.ok(html.includes('id="admin-privileges-username"'));
assert.ok(html.includes('id="admin-public-grants-toggle"'));
assert.ok(html.includes('id="admin-bootstrap-control"'));
assert.ok(html.includes('id="admin-privileges-bootstrap-code"'));
assert.ok(game.includes('staffBootstrapAvailable=data.bootstrap_available===true'));
assert.ok(game.includes("staffRequest('/api/staff/bootstrap','POST'"));
assert.ok(staffApi.includes('/api/staff/bootstrap'));
assert.ok(staffApi.includes('BOOTSTRAP_SELF_ONLY'));
assert.ok(staffApi.includes('bootstrap_claimed_at=is.null'));
assert.ok(staffApi.includes('expires_at'));
assert.ok(game.includes("setInterval(()=>{if(!document.hidden)void refreshStaffRole(true);},30000)"));
assert.ok(challenge.includes("seconds:45"));
assert.ok(challenge.includes("seconds:75"));
assert.ok(challenge.includes("seconds:90"));
assert.ok(challenge.includes("elapsedMs:0,lastTickAt:Date.now()"));
assert.ok(!challenge.includes("gameMinuteTotal-t.startMinute"));
assert.ok(challenge.includes("state.timed.elapsedMs") && challenge.includes("Date.now()"));
assert.ok(challenge.includes("state.timed.collected[name]"));
assert.ok(challenge.includes("timedProgress(state.timed,def)"));

class FakeElement {
  constructor(id='') { this.id=id; this.hidden=false; this.listeners={}; this.children=[]; this.dataset={}; this.classList={add(){},remove(){},toggle(){}}; this.options=[]; this.selectedIndex=0; this.value=''; this.textContent=''; this._queryCache={}; }
  addEventListener(name,fn){this.listeners[name]=fn;}
  appendChild(el){this.children.push(el);if(el.id)elements[el.id]=el;return el;}
  replaceChildren(){this.children=[];}
  click(){this.listeners.click?.();}
  set innerHTML(value){this._html=value;this._queryCache={};}
  get innerHTML(){return this._html||'';}
  querySelectorAll(selector){
    if(this._queryCache[selector])return this._queryCache[selector];
    if(selector!=='[data-challenge-start]')return [];
    const ids=[...this.innerHTML.matchAll(/data-challenge-start="([^"]+)"/g)].map(m=>m[1]);
    this._queryCache[selector]=ids.map(id=>{const el=new FakeElement();el.dataset.challengeStart=id;return el;});
    return this._queryCache[selector];
  }
}
const elements={};
for(const id of ['challenge-launch','challenge-panel','challenge-content','challenge-close'])elements[id]=new FakeElement(id);
const storage=new Map();
let snapshot={worldId:'challenge-test',difficulty:'challenge',paused:false,gameMinuteTotal:0,items:{},level:1,hp:100,exploredCells:0,totalCells:100,survivedNights:0,biomeBosses:{},caveBossDefeated:false,dungeonClearedRooms:[],dungeonChestOpened:false};
const rewards={gold:0,items:{},toasts:[],saves:0};
let updateCallback=null;
const window={
  SkyRealmSeaBridge:{
    getChallengeSnapshot:()=>snapshot,
    addGold:n=>{rewards.gold+=n;},
    addItem:(name,n)=>{rewards.items[name]=(rewards.items[name]||0)+n;},
    save:()=>{rewards.saves++;},
    toast:m=>rewards.toasts.push(m)
  },
  setInterval:fn=>{updateCallback=fn;return 1;}
};
const document={
  readyState:'complete',
  head:{appendChild:el=>{}},
  body:{appendChild:el=>{if(el.id)elements[el.id]=el;}},
  createElement:()=>new FakeElement(),
  getElementById:id=>elements[id]||null,
  addEventListener:()=>{}
};
const localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value))
};
vm.runInNewContext(challenge,{window,document,localStorage,console,Date,Math,JSON,Object,Number,String,Array,Map,Set,Promise});
assert.equal(typeof updateCallback,'function');
assert.equal(elements['challenge-launch'].hidden,false);
elements['challenge-launch'].click();
let buttons=elements['challenge-content'].querySelectorAll('[data-challenge-start]');
const woodButton=buttons.find(b=>b.dataset.challengeStart==='wood');
assert.ok(woodButton,'Wood challenge start button exists');
woodButton.listeners.click();
assert.ok(window.SkyRealmChallengeHooks,'Gather hook registered');
window.SkyRealmChallengeHooks.onItemGained('Древесина',7);
window.SkyRealmChallengeHooks.onItemGained('Древесина',7);
window.SkyRealmChallengeHooks.onItemGained('Древесина',7);
let now=Date.now();
Date.now=()=>now+1000;
updateCallback();
assert.equal(rewards.gold,120000,'Wood challenge reward is paid when collected count reaches 20');
assert.equal(rewards.items['Малое зелье'],1);
assert.ok(rewards.toasts.some(x=>x.includes('Испытание выполнено')));

elements['challenge-launch'].click();
buttons=elements['challenge-content'].querySelectorAll('[data-challenge-start]');
buttons.find(b=>b.dataset.challengeStart==='iron').listeners.click();
now+=74000;
Date.now=()=>now;
updateCallback();
assert.equal(rewards.toasts.some(x=>x.includes('Время испытания истекло')),false,'74 seconds must not expire a 75-second challenge');
now+=1000;
Date.now=()=>now;
updateCallback();
assert.ok(rewards.toasts.some(x=>x.includes('Время испытания истекло')),'75 real/game minutes should expire the 75-second challenge');
console.log('SkyRealm challenge progress events, 1:1 timer, short deadlines and staff privilege UI checks passed.');
