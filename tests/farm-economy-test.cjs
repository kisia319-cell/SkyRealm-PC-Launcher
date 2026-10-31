const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game/game.js', 'utf8');
const match = source.match(/const FARM_CROP_TRADE_PRICES=\{([^;]+)\};/);
assert.ok(match, 'Farm crop trade prices must be defined');
const prices = Function('return ({' + match[1] + '})')();
assert.equal(Object.keys(prices).length, 7, 'All seven crops must have trade prices');
for (const [crop, price] of Object.entries(prices)) {
  assert.ok(Number.isFinite(price.buy) && Number.isFinite(price.sell), crop + ' prices must be numeric');
  assert.ok(price.buy > price.sell, crop + ': buying from the NPC must cost more than selling back');
}
assert.ok(source.includes('farmCropBuyPrice(name)'), 'Farmer shop purchases must use the buy price');
assert.ok(source.includes('farmCropSellPrice(name)'), 'Farmer shop sales must use the sell price');
assert.ok(source.includes("npcId==='farmer'?Math.max(.9,1-villageReputation*.001)"), 'Maximum reputation discount must stay capped for crop purchases');
assert.ok(source.includes("npcId==='farmer'?1+Math.min(.05,villageReputation*.0005)"), 'Maximum reputation sale bonus must stay capped for crop sales');
console.log('SkyRealm farm economy checks passed.');
