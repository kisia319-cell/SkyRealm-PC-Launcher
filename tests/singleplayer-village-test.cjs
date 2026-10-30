const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const game = fs.readFileSync(path.join(__dirname, '..', 'game', 'game.js'), 'utf8');
const rendererStart = game.lastIndexOf('function drawVillageSettlements(camX,camY,time){');
const rendererEnd = game.indexOf('function updateVillageNpcs(dt){', rendererStart);
assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, 'Village renderer must exist');
const renderer = game.slice(rendererStart, rendererEnd);
assert.ok(renderer.includes('i<6') && renderer.includes('i<12'), 'Each village must use two staggered house rings');
assert.ok(renderer.includes('r=124') && renderer.includes('r=222'), 'Houses must be spread around the village without excessive separation');
assert.ok(renderer.includes("const roofs=['#2865bd','#b83d32"), 'Houses must have varied roof colors');
assert.ok(renderer.includes('Large pitched roof') && renderer.includes('Windows, shutters'), 'Houses must have detailed roofs, windows and facades');
assert.ok(renderer.includes('Math.cos(angle)*r') && renderer.includes('Math.sin(angle)*r*.82'), 'House positions must use staggered, spaced radial coordinates');

const updateStart = rendererEnd;
const updateEnd = game.indexOf('function nearestVillageNpc()', updateStart);
assert.ok(updateEnd > updateStart, 'Village resident update function must exist');
const update = game.slice(updateStart, updateEnd);
assert.ok(!/if\s*\(\s*!tradeWorldMode/.test(update), 'Residents must move in ordinary single-player worlds, not only Trade World');
assert.ok(update.includes("npc.activity==='working'?50:72"), 'Residents must move at the increased walking speed');
assert.ok(update.includes('slot===1?48:slot===0?72:9'), 'Residents must have larger daily walking areas');
assert.ok(game.includes('updateVillageNpcs(dt);'), 'Main game loop must update residents');
assert.ok(game.includes("'Лука'"), 'Ordinary resident population must remain initialized');
console.log('SkyRealm single-player village tests passed: 18 varied, oriented houses per village and active, faster residents.');
