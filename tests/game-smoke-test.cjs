const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const game = fs.readFileSync('game/game.js', 'utf8');
const gameHtml = fs.readFileSync('game/index.html', 'utf8');
const launcherHtml = fs.readFileSync('index.html', 'utf8');
const version = fs.readFileSync('game/version.txt', 'utf8').trim();

new vm.Script(game, { filename: 'game/game.js' });

const launcher = fs.readFileSync('launcher.py', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const py = launcher;
assert.ok(launcher.includes('webview.start(debug=True, private_mode=False, storage_path=str(profile_dir))'),
  'Game WebView must use a persistent profile so world saves survive updates');
assert.ok(launcher.includes('"SkyRealm" / "webview-profile"'),
  'Persistent WebView profile must live outside the replaceable game install directory');
assert.ok(launcher.includes('ThreadingHTTPServer(("127.0.0.1", 48731), handler)'),
  'Game server must keep a stable origin for localStorage');
assert.ok(!launcher.includes('ThreadingHTTPServer(("127.0.0.1", 0), handler)'),
  'Game server must not silently switch to a random port and hide existing saves');
assert.ok(game.includes('function downloadWorldBackup(id)'), 'Worlds must support exporting a portable backup');
assert.ok(game.includes('function importWorldBackupFile(file)'), 'Worlds must support restoring a portable backup');
assert.ok(game.includes("backup.format!=='skyrealm-world-backup'"), 'Imported backups must be validated before use');
assert.ok(game.includes('Не удалось сохранить мир'), 'Save failures must not be silently swallowed');
assert.ok(game.includes("document.visibilityState==='hidden'&&currentWorldId"), 'Game must save when the app is backgrounded');
assert.ok(gameHtml.includes('id="import-world-button"') && gameHtml.includes('id="import-world-file"'), 'The world menu must expose backup import');
assert.ok(gameHtml.includes('id="save-world-now"'), 'Pause menu must offer manual saving');
assert.ok(launcherHtml.includes('id="check-game-files"'), 'Launcher settings must expose game file diagnostics');
assert.ok(launcherHtml.includes('id="open-update-log"'), 'Launcher settings must expose the update log');
assert.ok(launcherHtml.includes('https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest'), 'News must link to the latest real release');
assert.ok(launcherHtml.includes('Никаких скрытых покупок'), 'Shop must clearly disclose that purchases are not enabled');
assert.ok(app.includes('function runGameDiagnostics()'), 'Launcher diagnostics button must be wired');
assert.ok(py.includes('def get_diagnostics(self):') && py.includes('def open_update_log(self):'), 'Desktop launcher must provide diagnostics and log actions');
assert.ok(py.includes('installed_files_ok'), 'Play flow must repair missing or size-mismatched installed files');
assert.ok(launcherHtml.includes('v1.0.0'), 'Launcher UI version must match the release');
assert.ok(gameHtml.includes('360 × 260') && !gameHtml.includes('180 × 130 · Босс 8500 HP'), 'Difficulty picker must show actual expanded map dimensions');

assert.match(version, /^\d+\.\d+\.\d+$/, 'game/version.txt must be a semantic version');
assert.ok(gameHtml.includes(version), 'game/index.html version label must match game/version.txt');

for (const feature of [
  'function generateMineStock',
  'function craftEquipment',
  'function enterDungeon',
  'function updateDungeon',
  'function updateBiomeBosses',
  'function updateWorldEvents',
  'function updateWolfAndDog',
  'function drawVillageElder',
  'function talkToVillageElder',
  'function drawExplorer',
  'function talkToExplorer',
  'function commandDog',
  'function enchantWeapon',
]) {
  assert.ok(game.includes(feature), 'Missing expected gameplay feature: ' + feature);
}

const recipeMatch = game.match(/const recipes=\{([\s\S]*?)\};/);
assert.ok(recipeMatch, 'Crafting recipe table must exist');
const recipeKeys = [...recipeMatch[1].matchAll(/([A-Za-z]\w*):\{name:/g)].map(m => m[1]);
assert.equal(new Set(recipeKeys).size, recipeKeys.length, 'Crafting recipe keys must be unique');
const missingRecipes = [...gameHtml.matchAll(/data-craft="([^"]+)"/g)]
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
  const line = game.split(/\r?\n/).find(row => row.includes(difficulty + ":{id:'" + difficulty + "'"));
  assert.ok(line, 'Missing map size for difficulty: ' + difficulty);
  assert.ok(line.includes('cols:' + cols + ',rows:' + rows), 'Incorrect doubled map size for difficulty: ' + difficulty);
}
assert.ok(game.includes("function biomeAt(x,y){if(x>COLS*.44&&x<COLS*.60&&y<ROWS*.15)"), 'Biome regions must scale with the larger map');

assert.ok(gameHtml.includes('content="0.16.0"'), 'Game HTML version metadata must match game/version.txt');
assert.ok(gameHtml.includes('id="anvil-enchant-weapon"'), 'Enchanting button must exist in game UI');
assert.ok(game.includes("getElementById('anvil-enchant-weapon')"), 'Enchanting button must be wired');
assert.ok(game.includes('weaponEnchantments'), 'Weapon enchantments must be persisted');
assert.ok(game.includes("weatherMode==='snow'") && game.includes("weatherMode==='storm'"), 'Snow and storm weather must be rendered');
assert.ok(game.includes('villageQuestStage') && game.includes('dogBehavior'), 'Village quest chain and dog commands must persist');
assert.ok(game.includes('function drawBlacksmith') && game.includes('function talkToBlacksmith'), 'Blacksmith NPC and multi-stage quest chain must exist');
assert.ok(game.includes('function drawExplorer') && game.includes('function talkToExplorer'), 'Explorer NPC and multi-stage quest chain must exist');
assert.ok(game.includes('blacksmithQuestStage'), 'Blacksmith quest progress must persist');

console.log('SkyRealm smoke tests passed for game ' + version + ' (' + recipeKeys.length + ' unique recipes).');
