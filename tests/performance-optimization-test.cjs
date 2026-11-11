'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const game = fs.readFileSync('game/game.js', 'utf8');

assert.equal((game.match(/function drawMineGroundTile\(/g) || []).length, 1,
  'mine static tile renderer should have one definition');
assert.match(game, /let mineGroundRenderCache=null/);
assert.match(game, /let surfaceGroundTileCache=null/);
assert.match(game, /function drawGrassTexture\(target,x,y,sx,sy,h,biome,quality\)/);
assert.match(game, /new Array\(4096\)/);
assert.match(game, /ctx\.drawImage\(cache\.canvas/);
assert.match(game, /const chunkTiles=4,cacheKey=\[mineSeed,mineDepth,mineLevel,dpr/);
assert.match(game, /const maxChunks=32;let buildBudget=2/);
assert.match(game, /cache\.chunks\.set\(key,chunk\)/);
assert.match(game, /lanterns\}\;/);
assert.match(game, /for\(const lantern of cache\.lanterns\)/);
assert.match(game, /const mineCreaturePathCache=new WeakMap\(\)/);
assert.match(game, /refresh:\.28/);
assert.match(game, /pathState\.fromKey!==fromKey\|\|pathState\.goalKey!==goalKey/);
assert.match(game, /function sampleRenderCost\(costMs,now\)/);
assert.match(game, /adaptiveRenderScale=Math\.max\(\.72,adaptiveRenderScale-\.08\)/);
assert.match(game, /adaptiveRenderScale=Math\.min\(1,adaptiveRenderScale\+\.04\)/);
assert.match(game, /bossRealmGroundCache=null;mineGroundRenderCache=null/);

// Protect the user's explicit constraint: player movement helpers stay separate from
// the performance work. The mine player movement function must not be removed or renamed.
const moveStart = game.indexOf('  function mineMovePlayer(');
const moveEnd = game.indexOf('  function mineNextStepTowardPlayer(', moveStart);
assert.ok(moveStart >= 0 && moveEnd > moveStart, 'mine movement function remains present');
assert.match(game.slice(moveStart, moveEnd), /function mineMovePlayer\(mx,my,speed,dt\)/);
console.log('performance-optimization-test: all assertions passed');
