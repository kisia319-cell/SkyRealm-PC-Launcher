'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('game/adventure-guild.js', 'utf8');
const html = fs.readFileSync('game/index.html', 'utf8');
assert.match(html, /<script src="adventure-guild\.js"><\/script>/);
assert.match(source, /Ежедневные поручения/);
assert.match(source, /Забытые руины/);
assert.match(source, /Карта сокровищ/);
assert.match(source, /Развитие лагеря/);
assert.match(source, /Сезонный фестиваль/);
assert.match(source, /Коллекция древних реликвий/);
assert.doesNotMatch(source, /movementDirections|pressedMovementCodes|MOVEMENT_CODE_BY_DIRECTION/);
const nodes = new Map();
function element(tag) {
  return {tag, id:'', hidden:false, style:{}, dataset:{}, children:[], listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn;},
    appendChild(child){this.children.push(child);if(child.id)nodes.set(child.id,child);},
    setAttribute(){}, closest(){return null;}, classList:{add(){},remove(){},toggle(){}},
    textContent:'', innerHTML:'', type:'', disabled:false };
}
const inventory = {'Древесина':100,'Камень':100,'Железо':50,'Кристалл':20,'Медь':20,'Мифрил':10,'Ткань':20};
let paused=false, enemyCount=0, damaged=0;
const bridge = {
  getChallengeSnapshot:()=>({worldId:'test-world',paused,day:0}),
  getGameDay:()=>0, getPlayerPosition:()=>({x:100,y:100}),
  getWorldEventSpawnPoint:()=>({x:140,y:140}),getWorldBounds:()=>({width:5000,height:4000}),getBiomeAt:()=> 'forest',isTradeWorld:()=>false,isBossRealm:()=>false,
  getWeaponDamage:()=>20,isCoopWorld:()=>false,isSpecialWorldMode:()=>false,
  getItemCount:n=>inventory[n]||0,spendItem(n,c){if((inventory[n]||0)<c)return false;inventory[n]-=c;return true;},
  addGold(){},spendGold(){return true;},addItem(){},save(){},
  pause(){paused=true;},resume(){paused=false;},toast(){},recordProfession(){return true;},
  spawnEventEnemies(){enemyCount=3;return 3;},getEventEnemyCount(){return enemyCount;},
  damageEventEnemy(){enemyCount=Math.max(0,enemyCount-1);return true;},
  damagePlayer(n){damaged+=n;},clearEventEnemies(){enemyCount=0;},
  restoreHealth(){},getGold(){return 100;},getSeasonInfo(){return {season:'spring'};}
};
const document = {
  readyState:'complete',head:element('head'),body:element('body'),
  getElementById:id=>nodes.get(id)||null,
  createElement:element,addEventListener(){}, 
};
const storage = new Map();
const window = {SkyRealmSeaBridge:bridge,setInterval:()=>1,addEventListener(){},};
const context = {window,document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  console,Date,Math,JSON,Number,String,Array,Object,Set,Map,Promise};
vm.runInNewContext(source,context,{filename:'adventure-guild.js'});
assert.ok(window.SkyRealmAdventureGuild);
window.SkyRealmAdventureGuild.open();
let state=window.SkyRealmAdventureGuild.getState();
assert.equal(state.contracts.length,4);
assert.equal(paused,true);
const contract=state.contracts[0];
window.SkyRealmAdventureGuild.progressContract(contract.id,2);
assert.equal(window.SkyRealmAdventureGuild.getState().contracts[0].progress,0);
window.SkyRealmAdventureGuild.acceptContract(contract.id);
window.SkyRealmAdventureGuild.progressContract(contract.id,2);
assert.equal(window.SkyRealmAdventureGuild.getState().contracts[0].progress,2);
window.SkyRealmAdventureGuild.startExpedition('ruins');
assert.equal(window.SkyRealmAdventureGuild.getState().expedition.route,'ruins');
window.SkyRealmAdventureGuild.attackExpedition();
assert.equal(enemyCount,2);
assert.ok(damaged>0);
window.SkyRealmAdventureGuild.upgradeCamp('hearth');
assert.equal(window.SkyRealmAdventureGuild.getState().camp.hearth,1);
window.SkyRealmAdventureGuild.close();
assert.equal(paused,false);
assert.equal(typeof window.SkyRealmAdventureGuild.draw,'function');
assert.equal(typeof window.SkyRealmAdventureGuild.interact,'function');
assert.ok(window.SkyRealmAdventureGuild.getHousePosition());
assert.ok(source.includes('Эйрин') && source.includes('Мира') && source.includes('Тор'));
assert.ok(source.includes('E · ВОЙТИ В ГИЛЬДИЮ'));
assert.ok(!source.includes("button.textContent='🧭 Гильдия'"));
console.log('SkyRealm adventure guild regression checks passed');
