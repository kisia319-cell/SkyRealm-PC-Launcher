const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const game = fs.readFileSync(path.join(__dirname, '..', 'game', 'game.js'), 'utf8');
const rendererStart = game.lastIndexOf('function drawVillageSettlements(camX,camY,time){');
const rendererEnd = game.indexOf('function updateVillageNpcs(dt){', rendererStart);
assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, 'Village renderer must exist');
const renderer = game.slice(rendererStart, rendererEnd);
assert.ok(renderer.includes('i<6') && renderer.includes('i<12'), 'Each village must use two staggered house rings');
assert.ok(renderer.includes('r=228') && renderer.includes('r=430'), 'Houses must have separate, clearly spaced inner and outer rings');
assert.ok(renderer.includes("const roofs=['#2865bd','#b83d32"), 'Houses must have varied roof colors');
assert.ok(renderer.includes('Large pitched roof') && renderer.includes('Windows, shutters'), 'Houses must have detailed roofs, windows and facades');
assert.ok(renderer.includes('Math.cos(angle)*r') && renderer.includes('Math.sin(angle)*r*.82'), 'House positions must use staggered, spaced radial coordinates');
assert.ok(renderer.includes('ctx.scale(1.18,1.18)'), 'Large village homes must remain readable without overlapping');

const villageHousePositions=[];
for(let i=0;i<6;i++){const angle=Math.PI*2*i/6,r=228+(i%2)*24;villageHousePositions.push({x:Math.cos(angle)*r,y:Math.sin(angle)*r*.82});}
for(let i=0;i<12;i++){const angle=Math.PI*2*i/12+Math.PI/12,r=430+(i%3)*35;villageHousePositions.push({x:Math.cos(angle)*r,y:Math.sin(angle)*r*.82});}
const houseDiagonal=Math.hypot(102,63)*1.18;
let minHouseSpacing=Infinity;
for(let i=0;i<villageHousePositions.length;i++)for(let j=i+1;j<villageHousePositions.length;j++){const a=villageHousePositions[i],b=villageHousePositions[j];minHouseSpacing=Math.min(minHouseSpacing,Math.hypot(a.x-b.x,a.y-b.y));}
assert.ok(minHouseSpacing>houseDiagonal, 'All 18 houses must have non-overlapping footprints; minimum spacing was '+minHouseSpacing.toFixed(1)+'px');

const updateStart = rendererEnd;
const updateEnd = game.indexOf('function nearestVillageNpc()', updateStart);
assert.ok(updateEnd > updateStart, 'Village resident update function must exist');
const update = game.slice(updateStart, updateEnd);
assert.ok(!/if\s*\(\s*!tradeWorldMode/.test(update), 'Residents must move in ordinary single-player worlds, not only Trade World');
assert.ok(update.includes("npc.activity==='working'?50:72"), 'Residents must move at the increased walking speed');
assert.ok(update.includes('slot===1?48:slot===0?72:9'), 'Residents must have larger daily walking areas');
assert.ok(game.includes('updateVillageNpcs(dt);'), 'Main game loop must update residents');
const setupStart=game.indexOf('function setupVillageNpcs(){');
const setupEnd=game.indexOf('function drawNpcCharacter(',setupStart);
const setup=game.slice(setupStart,setupEnd);
assert.ok(setup.includes('r=228+(i%2)*24') && setup.includes('Math.cos(angle)*(r-76)'), 'Profession NPCs must live beside their matching village houses');
assert.ok(setup.includes('radius=300+(i%3)*34'), 'Citizens must wander through the village streets between the house rings');
assert.ok(game.includes("'Лука'"), 'Ordinary resident population must remain initialized');
console.log('SkyRealm single-player village tests passed: 18 varied, oriented houses per village and active, faster residents.');
