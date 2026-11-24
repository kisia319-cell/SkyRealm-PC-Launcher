'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),game=fs.readFileSync(path.join(root,'game/game.js'),'utf8'),html=fs.readFileSync(path.join(root,'game/index.html'),'utf8'),scene=fs.readFileSync(path.join(root,'game/apocalypse-cinematic.js'),'utf8'),consent=fs.readFileSync(path.join(root,'game/apocalypse-3d-consent.js'),'utf8'),spawn=fs.readFileSync(path.join(root,'game/spawn-settlement.js'),'utf8');
const items=['Бинт','Полевая аптечка','Энергетик','Консервы','Чистая вода','Сигнальная ракета','Дымовая шашка','Осколочная граната','Радиомаяк'];
for(const name of items){assert.ok(game.includes("name:'"+name+"'"),'missing supply '+name);assert.ok(game.includes("item.name==='"+name+"'"),'supply has no use effect '+name);}
assert.match(game,/k\s*===\s*'u'[\s\S]*useApocalypseSupplyItem/,'U key must activate selected supply');
assert.match(game,/crateDrop:true[\s\S]*pickupDelay/,'crate rewards should eject before pickup');
assert.match(game,/SUPPLY/,'field crates should have readable markings');
assert.match(game,/ЯЩИК С ПРИПАСАМИ/,'crate hint must not show the E prefix');
assert.match(scene,/const shots=\[/,'opening cinematic needs multiple camera shots');
assert.match(consent,/Включить 3D[\s\S]*Продолжить в 2D/,'first-run 3D consent dialog missing');
assert.match(html,/apocalypse-3d-consent\.js'><\/script><script src="apocalypse-cinematic\.js"/,'consent must load before cinematic');
console.log('Apocalypse crates, supplies, camera and 3D consent checks passed.');
