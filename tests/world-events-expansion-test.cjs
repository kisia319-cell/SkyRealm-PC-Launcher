'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('game/world-events.js','utf8');
const gameSource=fs.readFileSync('game/game.js','utf8');
assert.ok(gameSource.includes('Печать разведчика')&&gameSource.includes('Фрагмент карты пещер')&&gameSource.includes('caveSecretRoomsOpened'),'Two secret cave rooms and their persistent rewards must be implemented in the game runtime.');

const rewards={items:{},gold:0,damage:0,toasts:[]};
const inventory={'Древесина':20,'Железо':10,'Листья':8};
const events=new Map();
let snapshot={worldId:'world-events-test',paused:false,day:0};
let player={x:1200,y:900};
const bridge={
 getWorldId:()=>snapshot.worldId,getWorldBounds:()=>({width:6000,height:4200}),getBiomeAt:()=> 'forest',
 isBossRealm:()=>false,isTradeWorld:()=>false,isCoopWorld:()=>false,isSpecialWorldMode:()=>false,isCaveMode:()=>false,isMineMode:()=>false,isHouseMode:()=>false,isDungeonMode:()=>false,
 getChallengeSnapshot:()=>({...snapshot}),getPlayerPosition:()=>({...player}),
 spawnForestTreeMonster:(id,x,y)=>{events.set(id,{count:1,x,y,hp:260,maxHp:260,phase:1});return true;},
 spawnForestMiniBoss:(type,id,x,y)=>{events.set(id,{count:1,x,y,hp:780,maxHp:780,phase:1,type});return true;},
 getEventEnemyCount:id=>events.get(id)?.count||0,
 getEventEnemySnapshot:id=>{const e=events.get(id);return e?{...e}:null;},
 addItem:(name,count=1)=>{inventory[name]=(inventory[name]||0)+count;rewards.items[name]=(rewards.items[name]||0)+count;},
 addGold:cents=>{rewards.gold+=cents;},damagePlayer:n=>{rewards.damage+=n;},
 getItemCount:name=>inventory[name]||0,
 spendItem:(name,count=1)=>{if((inventory[name]||0)<count)return false;inventory[name]-=count;return true;},
 save:()=>{},toast:m=>rewards.toasts.push(String(m))
};
const localStorage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,String(v));}};
const window={SkyRealmSeaBridge:bridge};
vm.runInNewContext(source,{window,localStorage,console,Math,Number,String,Object,JSON,Array,Date});
const api=window.SkyRealmWorldEvents;
assert.ok(api,'World events module boots');
api.update(.1);
let state=api.getState();
assert.equal(state.camps.length,2,'Two deterministic abandoned camps are generated');
const camp=state.camps[0];
player={x:camp.x-36,y:camp.y+15};
assert.equal(api.interact(),true,'Camp trap can be interacted with');
assert.equal(api.getState().camps[0].trapTriggered,true,'Trap state persists');
player={x:camp.x+36,y:camp.y+10};
assert.equal(api.interact(),true,'Camp chest can be opened');
assert.equal(api.getState().camps[0].chestOpened,true,'Camp chest is permanently marked opened');
assert.equal(inventory['Ключ древнего лагеря'],1,'Camp grants its rare key');
player={x:camp.x-10,y:camp.y-55};
assert.equal(api.interact(),true,'Camp note can be read');
assert.equal(inventory['Записка разведчика'],1,'Camp note is stored in inventory');
snapshot.day=2;api.update(.1);
assert.ok(api.getState().caravan,'Traveling merchant appears on the scheduled market day');
player={x:api.getState().caravan.x,y:api.getState().caravan.y};
assert.equal(api.interact(),true,'Caravan trade succeeds');
assert.equal(inventory['Эликсир корневой ярости'],1,'Caravan grants the new elixir');
assert.equal(api.getState().caravan.traded,true,'Caravan trade is limited to once per visit');
let treeSpawned=false;
for(let i=0;i<100&&!treeSpawned;i++)treeSpawned=api.onTreeChopped({x:500+i*31,y:1200+i*17});
assert.equal(treeSpawned,true,'A felled ordinary-world tree can awaken a treant');
const treeId=api.getState().activeTreeId;
assert.ok(treeId&&events.get(treeId)?.count===1,'Awakened treant is a real tracked enemy');
events.get(treeId).count=0;api.update(.1);
assert.equal(api.getState().activeTreeId,'','Treant encounter clears after the enemy is defeated');
assert.equal(inventory['Живой корень'],1,'Treant victory grants a rare crafting material');
assert.equal(inventory['Сердцевина древня'],1,'Treant victory grants a trophy material');
let mini=false;
for(let day=3;day<100&&!mini;day++){snapshot.day=day;api.update(.1);mini=!!api.getState().activeMiniBossId;}
assert.equal(mini,true,'A rare biome miniboss eventually spawns');
const miniId=api.getState().activeMiniBossId;assert.ok(events.get(miniId)?.count===1,'Miniboss is tracked as a real enemy');
events.get(miniId).count=0;api.update(.1);
assert.equal(api.getState().activeMiniBossId,'','Miniboss encounter clears on victory');
assert.ok(inventory['Трофей биомного охотника']>=1,'Miniboss grants its trophy');
assert.ok(rewards.gold>=18000,'Miniboss grants a gold reward');
assert.equal(api.getExpeditionStage(),1,'Reading the scout note starts a persistent expedition quest');
player={x:camp.x,y:camp.y};
assert.equal(api.interact(),true,'Returning to the camp completes the scout expedition');
assert.equal(api.getExpeditionStage(),2,'Scout expedition advances to its completed state');
assert.equal(inventory['Печать разведчика'],1,'Scout expedition grants the cave seal');
assert.equal(inventory['Фрагмент карты пещер'],1,'Scout expedition grants the cave map fragment');

// A process restart must not award loot for a missing in-progress enemy.
localStorage.setItem('skyrealm_world_events_v1_world-events-test',JSON.stringify({camps:api.getState().camps,activeTreeId:'stale-tree',activeMiniBossId:'stale-mini',lastMiniBossDay:snapshot.day,caravan:null}));
const restartedWindow={SkyRealmSeaBridge:bridge};
vm.runInNewContext(source,{window:restartedWindow,localStorage,console,Math,Number,String,Object,JSON,Array,Date});
restartedWindow.SkyRealmWorldEvents.update(.1);
assert.equal(restartedWindow.SkyRealmWorldEvents.getState().activeTreeId,'','Stale tree encounter is cleared after restart');
assert.equal(restartedWindow.SkyRealmWorldEvents.getState().activeMiniBossId,'','Stale miniboss encounter is cleared after restart');
assert.equal(inventory['Сердцевина древня'],1,'Restarting an unfinished fight must not duplicate its trophy');
console.log('World events expansion tests passed: camps, one-time loot, caravan, awakened trees and biome minibosses.');
