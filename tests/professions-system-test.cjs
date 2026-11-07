'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const jobs=fs.readFileSync('game/jobs-system.js','utf8');
const game=fs.readFileSync('game/game.js','utf8');
const html=fs.readFileSync('game/index.html','utf8');
assert.ok(html.includes('<script src="jobs-system.js"></script>'),'Profession system must load in the game');
assert.ok(html.includes('id="menu-jobs"')&&html.includes('id="pause-jobs"'),'Profession panel must be reachable from menu and pause');
assert.ok(game.includes("SkyRealmJobs?.record?.('lumberjack',1)"),'Felling a tree must advance the lumberjack');
for(const id of ['miner','farmer','fisherman','hunter','builder','crafter','blacksmith','alchemist','cook','explorer'])
  assert.ok(game.includes("SkyRealmJobs?.record?.('"+id+"'"),'Missing real gameplay event for profession '+id);
assert.ok(game.includes("recordProfession:(id,amount=1)=>window.SkyRealmJobs?.record?.(String(id||''),amount)===true"),'Technology system must advance technologist profession');

const store={skyrealm_professions_v1:JSON.stringify({
  lumberjack:{accepted:false,level:1,xp:0,progress:0,completed:0,total:0},
  miner:{accepted:false,level:2,xp:23,progress:2,completed:1,total:12}
})};
const localStorage={getItem:key=>store[key]??null,setItem:(key,value)=>{store[key]=value;}};
const events=[];
class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail||{};}}
const document={readyState:'loading',addEventListener(){}};
const window={dispatchEvent:event=>{events.push(event);return true;}};
vm.runInNewContext(jobs,{window,document,localStorage,CustomEvent,console,Math,Date,JSON,String,Number,Object,Array,Set});
const api=window.SkyRealmJobs;
assert.ok(api,'Profession API must initialize');
assert.equal(api.VERSION,2);
assert.equal(api.getCatalog().length,12,'There must be 12 active professions');
assert.equal(api.getState().miner.level,2,'Legacy profession level must survive migration');
assert.equal(api.getState().miner.progress,2,'Legacy contract progress must survive migration');
assert.equal(api.getState().miner.total,12,'Legacy total actions must survive migration');
assert.equal(api.getState().lumberjack.accepted,true,'Legacy closed/empty jobs must no longer block automatic progress');

for(let i=0;i<4;i++)api.record('lumberjack',1);
let lumber=api.getState().lumberjack;
assert.equal(lumber.total,4,'Four felled trees must count as four actions');
assert.equal(lumber.completed,1,'Four trees must complete the first contract');
assert.equal(lumber.progress,0);
for(let i=0;i<8;i++)api.record('lumberjack',1);
lumber=api.getState().lumberjack;
assert.equal(lumber.total,12,'Further trees must continue to count after the first order');
assert.equal(lumber.completed,3,'The contract tracker must complete repeat orders without requiring a manual re-accept');
assert.ok(lumber.level>=2,'Repeated work must increase profession level');

const minerBefore=api.getState().miner.total;
api.record('miner',3);
assert.equal(api.getState().miner.total,minerBefore+3,'Mining actions must be counted on top of migrated progress');
api.record('farmer',2);
api.record('fisherman',2);
api.record('hunter',2);
api.record('builder',2);
api.record('crafter',2);
api.record('blacksmith',2);
api.record('alchemist',2);
api.record('cook',2);
api.record('explorer',2);
for(const id of ['farmer','fisherman','hunter','builder','crafter','blacksmith','alchemist','cook','explorer'])
  assert.equal(api.getState()[id].total,2,'Each profession must keep an independent action count: '+id);
assert.equal(api.getState().miner.total,minerBefore+5,'Miner must retain its migrated progress plus each new action');

const before=api.getState().farmer;
api.record('farmer',1);
assert.equal(api.getState().farmer.total,before.total+1);
const rewardEvents=events.filter(event=>event.type==='skyrealm:job-reward');
assert.ok(rewardEvents.length>=3,'Completing orders must issue rewards');
assert.ok(events.some(event=>event.type==='skyrealm:job-progress'),'Profession progress event must be emitted');
assert.ok(store.skyrealm_professions_v1,'Progress must be persisted in localStorage');

console.log('PASS profession system: 12 careers, old-save migration, 4+8 lumberjack actions, repeat contracts, independent profession counters, XP and rewards.');
