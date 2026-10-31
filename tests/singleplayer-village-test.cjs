const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const game = fs.readFileSync(path.join(__dirname, '..', 'game', 'game.js'), 'utf8');
const rendererStart = game.lastIndexOf('function drawVillageSettlements(camX,camY,time){');
const rendererEnd = game.indexOf('function updateVillageNpcs(dt){', rendererStart);
assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, 'Village renderer must exist');
const renderer = game.slice(rendererStart, rendererEnd);
assert.ok(renderer.includes('rowY=[-255,20,270]') && renderer.includes('xOffsets=[-500,-300,-100,100,300,500]'), 'Trade World houses must use a 3-by-6 rectangular street plan');
assert.ok(renderer.includes('laneY=[-185,95,340]'), 'Each house row must connect to its own parallel street');
assert.ok(renderer.includes('ctx.rotate(0)'), 'All house facades must keep a consistent, non-random orientation');
assert.ok(!renderer.includes('Math.cos(angle)') && !renderer.includes('Math.sin(angle)'), 'House placement must not use circular/radial coordinates');
assert.ok(renderer.includes("const roofs=['#2865bd','#b83d32"), 'Houses must retain varied roof colors');
assert.ok(renderer.includes('Large pitched roof') || renderer.includes('Windows, shutters') || renderer.includes('Recessed door') || renderer.includes('ctx.fillRect(-11,bodyH-34,22,34)'), 'Houses must retain detailed roofs, windows and facades');
assert.ok(renderer.includes('Six homes per street, three streets per village'), 'Village layout must be documented as a rectangular street plan');

const xs=[-500,-300,-100,100,300,500],ys=[-255,20,270],positions=[];
for(let row=0;row<3;row++)for(let col=0;col<6;col++)positions.push({x:xs[col]+(row===1?28:row===2?-24:0),y:ys[row]});
const footprintHalfWidth=122*1.18/2,footprintHalfHeight=80*1.18/2;
let minCenterSpacing=Infinity;
for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)minCenterSpacing=Math.min(minCenterSpacing,Math.hypot(positions[i].x-positions[j].x,positions[i].y-positions[j].y));
assert.ok(minCenterSpacing>footprintHalfWidth*2, 'House footprints must not overlap; minimum center spacing was '+minCenterSpacing.toFixed(1)+'px');
assert.equal(positions.length,18,'Each village must retain 18 homes');

const setupStart=game.indexOf('function setupVillageNpcs(){');
const setupEnd=game.indexOf('function drawNpcCharacter(',setupStart);
const setup=game.slice(setupStart,setupEnd);
assert.ok(setup.includes('xOffsets=[-500,-300,-100,100,300,500]') && setup.includes('rowY=[-255,20,270]'), 'Profession NPC homes must use the same orderly house grid');
assert.ok(setup.includes('streetY=[-185,95,340]'), 'Citizens must be placed along streets, not in a circular ring');
assert.ok(!setup.includes('Math.cos(angle)') && !setup.includes('Math.sin(angle)'), 'NPC homes and citizen positions must not use circular placement');
assert.ok(game.includes("'Лука'"), 'Ordinary resident population must remain initialized');
const updateStart=rendererEnd,updateEnd=game.indexOf('function nearestVillageNpc()',updateStart);
assert.ok(updateEnd>updateStart,'Village resident update function must exist');
const update=game.slice(updateStart,updateEnd);
assert.ok(update.includes("npc.activity==='working'?50:72"),'Residents must retain the increased walking speed');
assert.ok(game.includes('updateVillageNpcs(dt);'),'Main game loop must update residents');
console.log('SkyRealm Trade World village tests passed: 18 houses in spaced rectangular rows, consistent orientation, and street-aligned residents.');
