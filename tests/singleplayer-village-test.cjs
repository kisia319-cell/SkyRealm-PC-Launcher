const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const game = fs.readFileSync(path.join(__dirname, '..', 'game', 'game.js'), 'utf8');
const rendererStart = game.lastIndexOf('function drawVillageSettlements(camX,camY,time){');
const rendererEnd = game.indexOf('function updateVillageNpcs(dt){', rendererStart);
assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, 'Village renderer must exist');
const renderer = game.slice(rendererStart, rendererEnd);
const houseList = renderer.match(/\{x:-?\d+,y:-?\d+\}/g) || [];
assert.equal(houseList.length, 9, 'Every village must render nine houses');

const updateStart = rendererEnd;
const updateEnd = game.indexOf('function nearestVillageNpc()', updateStart);
assert.ok(updateEnd > updateStart, 'Village resident update function must exist');
const update = game.slice(updateStart, updateEnd);
assert.ok(!/if\s*\(\s*!tradeWorldMode/.test(update), 'Residents must move in ordinary single-player worlds, not only Trade World');
assert.ok(update.includes("npc.activity==='working'?50:72"), 'Residents must move at the increased walking speed');
assert.ok(update.includes('slot===1?48:slot===0?72:9'), 'Residents must have larger daily walking areas');
assert.ok(game.includes('updateVillageNpcs(dt);'), 'Main game loop must update residents');
assert.ok(game.includes("'Лука'"), 'Ordinary resident population must remain initialized');
console.log('SkyRealm single-player village tests passed: nine houses per village and active, faster residents.');
