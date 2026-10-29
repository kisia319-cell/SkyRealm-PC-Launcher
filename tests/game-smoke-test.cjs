const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const game = fs.readFileSync('game/game.js', 'utf8');
const html = fs.readFileSync('game/index.html', 'utf8');
const version = fs.readFileSync('game/version.txt', 'utf8').trim();

new vm.Script(game, { filename: 'game/game.js' });
assert.match(version, /^\d+\.\d+\.\d+$/, 'game/version.txt must be a semantic version');
assert.ok(html.includes(version), 'game/index.html version label must match game/version.txt');

for (const feature of [
  'function generateMineStock',
  'function craftEquipment',
  'function enterDungeon',
  'function updateDungeon',
  'function updateBiomeBosses',
  'function updateWorldEvents',
  'function updateWolfAndDog',
  'function enchantWeapon',
]) {
  assert.ok(game.includes(feature), 'Missing expected gameplay feature: ' + feature);
}

const recipeMatch = game.match(/const recipes=\{([\s\S]*?)\};/);
assert.ok(recipeMatch, 'Crafting recipe table must exist');
const recipeKeys = [...recipeMatch[1].matchAll(/([A-Za-z]\w*):\{name:/g)].map(m => m[1]);
assert.equal(new Set(recipeKeys).size, recipeKeys.length, 'Crafting recipe keys must be unique');
const missingRecipes = [...html.matchAll(/data-craft="([^"]+)"/g)]
  .map(m => m[1]).filter(key => !recipeKeys.includes(key));
assert.deepEqual(missingRecipes, [], 'Every data-craft button must reference a recipe');

const expectedMapSizes = {
  easy: [180, 140],
  medium: [220, 164],
  hard: [260, 192],
  hell: [300, 220],
  impossible: [360, 260],
};
for (const [difficulty, [cols, rows]] of Object.entries(expectedMapSizes)) {
  const line = game.split('\\n').find(row => row.includes(difficulty + ":{id:'" + difficulty + "'"));
  assert.ok(line, 'Missing map size for difficulty: ' + difficulty);
  assert.ok(line.includes('cols:' + cols + ',rows:' + rows), 'Incorrect doubled map size for difficulty: ' + difficulty);
}
assert.ok(game.includes("function biomeAt(x,y){if(x>COLS*.44&&x<COLS*.60&&y<ROWS*.15)"), 'Biome regions must scale with the larger map');

const expectedMapSizes = {
  easy: [180, 140],
  medium: [220, 164],
  hard: [260, 192],
  hell: [300, 220],
  impossible: [360, 260],
};
for (const [difficulty, [cols, rows]] of Object.entries(expectedMapSizes)) {
  const line = game.split(/\\r?\\n/).find(row => row.includes(difficulty + ":{id:'" + difficulty + "'"));
  assert.ok(line, 'Missing map size for difficulty: ' + difficulty);
  assert.ok(line.includes('cols:' + cols + ',rows:' + rows), 'Incorrect doubled map size for difficulty: ' + difficulty);
}
assert.ok(game.includes("function biomeAt(x,y){if(x>COLS*.44&&x<COLS*.60&&y<ROWS*.15)"), 'Biome regions must scale with the larger map');

assert.ok(html.includes('id="anvil-enchant-weapon"'), 'Enchanting button must exist in game UI');
assert.ok(game.includes("getElementById('anvil-enchant-weapon')"), 'Enchanting button must be wired');
assert.ok(game.includes('weaponEnchantments'), 'Weapon enchantments must be persisted');

console.log('SkyRealm smoke tests passed for game ' + version + ' (' + recipeKeys.length + ' unique recipes).');
