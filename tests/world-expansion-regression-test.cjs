'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const moduleSource = fs.readFileSync(path.join(root, 'game/world-expansion.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'game/game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'game/index.html'), 'utf8');
assert.match(html, /<script src="world-expansion\.js"><\/script>/);
assert.match(gameSource, /getBossRealmSnapshot:\(\)=>/);
assert.match(gameSource, /isSpecialWorldMode:\(\)=>/);
assert.match(gameSource, /spawnBossRealmCreature:\(type,x,y\)=>/);
assert.match(moduleSource, /skyrealm_world_expansion_v1_/);
assert.match(moduleSource, /chronicle-village-/);
assert.match(moduleSource, /chronicle-expedition-/);
assert.match(moduleSource, /Призыв Стража Разлома/);
assert.match(moduleSource, /Покоритель арен/);

class FakeElement {
  constructor(tag) { this.tagName = tag; this.listeners = {}; this.hidden = false; this.children = []; this.attributes = {}; this.innerHTML = ''; this.textContent = ''; this.style = {}; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, event = {}) { for (const callback of this.listeners[name] || []) callback(event); }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(selector) { this._queries ||= {}; return this._queries[selector] ||= new FakeElement('query'); }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] || null; }
}
function bootWorld(isBossRealm) {
  const created = [];
  const snapshot = {worldId:isBossRealm?'boss-test-world':'ordinary-test-world',paused:false,day:0,difficulty:'medium',items:{'Древесина':2,'Камень':1},exploredCells:10,totalCells:100};
  const bridge = {
    getChallengeSnapshot:()=>snapshot,
    isBossRealm:()=>isBossRealm,
    isTradeWorld:()=>false,
    isCoopWorld:()=>false,
    isSpecialWorldMode:()=>false,
    getBossRealmSnapshot:()=>({kills:14,wave:3,awakenedTrees:2,defeatedBosses:2,defeatedGods:1,defeatedBossNames:['Король Бездны','Древний Пожиратель'],defeatedGodNames:['Астральный бог']}),
    getVillageCenters:()=>[{id:'village-1',x:600,y:500}],
    getWorldEventSpawnPoint:()=>({x:800,y:700}),
    getEventEnemyCount:()=>3,
    spawnEventEnemies:()=>6,
    getPlayerPosition:()=>({x:100,y:100}),
    spawnBossRealmCreature:(type)=>type==='rift_warden',
    addGold:()=>{},
    addItem:()=>{},
    save:()=>{},
    pause:()=>{},
    resume:()=>{},
    toast:()=>{}
  };
  const document = {
    readyState:'complete',
    head:new FakeElement('head'),
    body:new FakeElement('body'),
    createElement(tag){const element=new FakeElement(tag);created.push(element);return element;},
    addEventListener(){}
  };
  const window = {SkyRealmSeaBridge:bridge,setInterval:()=>1};
  const localStorage = {getItem:()=>null,setItem:()=>{}};
  vm.runInNewContext(moduleSource,{window,document,localStorage,console,Math,Number,String,Object,JSON,Array,Date});
  const api=window.SkyRealmWorldExpansion;
  assert.ok(api);
  assert.equal(api.getMode(),isBossRealm?'boss':'ordinary');
  const button=created.find(el=>el.id==='world-expansion-launch');
  assert.ok(button);
  assert.equal(button.hidden,false);
  button.dispatch('click');
  const panel=created.find(el=>el.id==='world-expansion-panel');
  assert.ok(panel);
  const content=panel.querySelector('#we-content');
  if(isBossRealm){
    assert.match(content.innerHTML,/Пробуждение|Охотник на разломы|Покоритель арен/);
    assert.match(content.innerHTML,/Стража Разлома/);
    assert.match(content.innerHTML,/Король Бездны/);
  } else {
    assert.match(content.innerHTML,/Запасы для поселения/);
    assert.match(content.innerHTML,/Оборона поселения/);
    assert.match(content.innerHTML,/Экспедиция древних троп/);
  }
}
bootWorld(false);
bootWorld(true);
console.log('World expansion regression checks passed.');
