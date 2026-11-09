'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const game=fs.readFileSync(path.join(__dirname,'../game/game.js'),'utf8');
const module=fs.readFileSync(path.join(__dirname,'../game/boss-realm-exploration.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../game/index.html'),'utf8');
for(const feature of ['drawCitadel','drawSky','drawCave','drawSea','function interact()','ПЕЧАТИ','ПАРЯЩИЕ ОСТРОВА','КРИСТАЛЬНЫЕ ПЕЩЕРЫ','ПОДЗЕМНОЕ МОРЕ','Осколок кристалла','Ядро небесного острова','Жемчужина бездны','Реликвия затонувшего храма','Печать павшей цитадели','Сердце кристальной жилы','Коралловый слиток','skyrealm_boss_exploration_v1_']) {
  assert.ok(module.includes(feature),'Missing exploration system feature: '+feature);
}
for(const feature of ['runes:[false,false,false]','nodes:[false,false,false]','valves:[false,false,false]','state.citadel.runes.every(Boolean)','state.cave.nodes.every(Boolean)','state.sea.valves.every(Boolean)','localStorage.setItem(KEY+encodeURIComponent(worldId)','function draw(ctx2,camX,camY,time,width,height)']) {
  assert.ok(module.includes(feature),'Missing exploration progression/persistence: '+feature);
}
assert.ok(game.includes('window.SkyRealmBossExploration?.draw?.(ctx,camX,camY,time,width,height);'),'Boss Realm draw pipeline must render the exploration zones.');
assert.ok(html.includes('<script src="boss-realm-exploration.js"></script>'),'Exploration module must load in the game.');
assert.ok(!module.includes('movementDirections')&&!module.includes('pressedMovementCodes')&&!module.includes('player.vx')&&!module.includes('player.vy'),'Exploration systems must not modify player movement logic.');
console.log('SkyRealm Boss Realm exploration zones, puzzles, rewards and save persistence tests passed.');
