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
assert.ok(game.includes('gameVersion:GAME_VERSION'), 'World backups must record the currently embedded game version');
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
assert.ok(launcherHtml.includes('v1.0.2'), 'Launcher UI version must match the release');
assert.ok(gameHtml.includes('360 × 260') && !gameHtml.includes('180 × 130 · Босс 8500 HP'), 'Difficulty picker must show actual expanded map dimensions');

assert.match(version, /^\d+\.\d+\.\d+$/, 'game/version.txt must be a semantic version');
assert.ok(gameHtml.includes(version), 'game/index.html version label must match game/version.txt');

for (const feature of [
  'function findWorldEventPoint',
  'function updateWorldEvents',
  'function drawWorldEventCamp',
  'function drawWorldEventTraveler',
  'function collectWorldEventCamp',
  'function collectWorldEventTraveler',
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

assert.ok(gameHtml.includes('content="'+version+'"'), 'Game HTML version metadata must match game/version.txt');
assert.ok(gameHtml.includes('id="anvil-enchant-weapon"'), 'Enchanting button must exist in game UI');
assert.ok(game.includes("getElementById('anvil-enchant-weapon')"), 'Enchanting button must be wired');
assert.ok(game.includes('weaponEnchantments'), 'Weapon enchantments must be persisted');
assert.ok(game.includes("weatherMode==='snow'") && game.includes("weatherMode==='storm'"), 'Snow and storm weather must be rendered');
assert.ok(game.includes('const WORLD_EVENT_CHANCES') && game.includes("meteor:.12") && game.includes("nightHorde:.07") && game.includes("abandonedCamp:.10") && game.includes("traveler:.08"), 'Random world events must have distinct configured chances');
assert.ok(game.includes('lastWorldMeteorNight') && game.includes('lastWorldHordeNight') && game.includes('lastWorldCampDay') && game.includes('lastWorldTravelerDay'), 'World events must use persisted cooldown markers');
assert.ok(game.includes('worldEventCamp:worldEventCamp?') && game.includes('worldEventTraveler:worldEventTraveler?'), 'World event locations must be saved with the world');
assert.ok(game.includes('villageQuestStage') && game.includes('dogBehavior'), 'Village quest chain and dog commands must persist');
assert.ok(game.includes('function drawBlacksmith') && game.includes('function talkToBlacksmith'), 'Blacksmith NPC and multi-stage quest chain must exist');
assert.ok(game.includes('function drawExplorer') && game.includes('function talkToExplorer'), 'Explorer NPC and multi-stage quest chain must exist');
for (const feature of ['function setupVillageNpcs','function drawVillageSettlements','function talkToVillageNpc','function buyNpcItem','function updateVillageRaid']) {
  assert.ok(game.includes(feature), 'Missing village feature: ' + feature);
}
assert.ok(game.includes('function tradeVillageLayouts()') && game.includes("biome:'snow'") && game.includes("biome:'desert'") && game.includes("biome:'volcano'") && game.includes("biome:'blight'"), 'Trade villages must be distributed across distinct biomes');
assert.ok(game.includes('function drawNpcCharacter') && game.includes('NPC_VISUALS') && game.includes("ctx.fillRect(-3,-14,2,2)"), 'NPCs must use detailed character sprites with visible eyes');
assert.ok(game.includes('if(!tradeWorldMode||mineMode||inHouse||caveMode||dungeonMode)return null'), 'NPCs must only be interactable in the Trade World');
assert.ok(game.includes('function openNpcQuestDialog') && game.includes('function renderNpcQuestDialog') && game.includes('function closeNpcQuestDialog'), 'NPC tasks must open a dedicated quest board');
assert.ok(gameHtml.includes('id="npc-quest-shade"') && gameHtml.includes('id="npc-quest-items"') && gameHtml.includes('id="npc-quest-reward"'), 'Dedicated NPC quest board UI must exist');
assert.ok(game.includes("if(!tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode)return;const day="), 'Village raids must only occur in the Trade World');
assert.ok(game.includes("'Меч титана':100") && game.includes("'Меч дракона':130") && game.includes("'Меч пустоты':170"), 'Legendary sword base damage must be 100/130/170');
assert.ok(game.includes('SWORD_DIFFICULTY_MULTIPLIER'), 'Legendary sword damage must scale with difficulty');
assert.ok(game.includes('const NPC_SELL_PRICES=') && game.includes('function sellNpcItem'), 'NPC shops must support selling resources');
assert.ok(game.includes('adminSpawned=true;villageRaidKills++'), 'Village raid enemies must persist on early nights');
assert.ok(game.includes('blacksmithQuestStage'), 'Blacksmith quest progress must persist');
assert.ok(game.includes('function useCombatAbility()') && game.includes("k === 'r'"), 'R must trigger the new weapon-specific combat ability');
assert.ok(game.includes('combatAbilityCooldown'), 'Combat ability cooldown must be tracked');

console.log('SkyRealm smoke tests passed for game ' + version + ' (' + recipeKeys.length + ' unique recipes).');

assert.ok(game.includes('function updateVillageNpcs(dt)'), 'Trade-world residents must follow daily schedules');
assert.ok(game.includes("npc.activity=slot===2?'sleeping':slot===1?'working':'wandering'"), 'NPCs must have sleeping, working and wandering states');
assert.ok(game.includes('updateWorldClock(dt);updateVillageNpcs(dt);updateVillageRaid(dt);'), 'NPC schedules must update with the in-game clock');
assert.ok(game.includes('homeX:x,homeY:y,targetX:x,targetY:y'), 'NPC home positions must be retained for their daily routines');

assert.ok(game.includes("drawNpcCharacter(npc,x,y,time)") && game.includes("npc.activity==='sleeping'?'ОТДЫХАЕТ'"), 'The active village renderer must show detailed animated NPCs and their current activity');
assert.ok(!game.includes("ctx.fillRect(-22,-23,44,25)"), 'The active village renderer must not use placeholder NPC sprites');

assert.ok(game.includes("ctx.scale(1.28,1.28)"), 'Trade NPC sprites must be enlarged');
assert.ok(game.includes('drawTreasureChests(camX,camY,time); drawLootDrops(camX,camY,time); drawMonsters(camX,camY,time);'), 'Trade World must render chests, drops and monsters');
assert.ok(game.includes('Подойди к торговцу или к вывеске лавки и нажми T.'), 'T must open nearby trader or stall');

assert.ok(py.includes('allow_game_update=True') && py.includes('allow_update=allow_game_update is not False'), 'The player update choice must reach the game updater');
assert.ok(py.includes('selected = installed_version if game_ok and installed_version else bundled_version'), 'Declining an update must keep the installed game when it is usable');
assert.ok(launcherHtml.includes('id="game-update-overlay"') && launcherHtml.includes('Внимание! Вышло обновление игры') && launcherHtml.includes('id="game-update-yes"') && launcherHtml.includes('id="game-update-no"'), 'Launcher must show a Yes/No game update prompt');
assert.ok(app.includes("fetch('https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/manifest.json?check='") && app.includes("$('#game-update-yes').addEventListener('click'") && app.includes("$('#game-update-no').addEventListener('click'"), 'Update prompt must fetch manifest and wire both choices');
assert.ok(game.includes("drawTreasureChests(camX,camY,time); drawLootDrops(camX,camY,time); drawMonsters(camX,camY,time);"), 'Trade World must render treasure chests and drops');
assert.ok(game.includes("Подойди к торговцу или к вывеске лавки и нажми T."), 'T must open a nearby trader or stall');
assert.ok(game.includes("ctx.scale(1.28,1.28)"), 'Trade NPC sprites must be enlarged');

const updater = fs.readFileSync('update_helper.py', 'utf8');
const launcherVersion = fs.readFileSync('launcher_version.txt', 'utf8').trim();
assert.match(launcherVersion, /^\d+\.\d+\.\d+$/, 'launcher_version.txt must be a semantic version');
assert.ok(py.includes('def _skyrealm_startup_update():') && py.includes('if _skyrealm_startup_update():') && py.lastIndexOf('if _skyrealm_startup_update():') < py.lastIndexOf('html = Path(resource_path(\"index.html\"))'), 'Launcher must check and apply its own update before showing the UI');
assert.ok(py.includes('manifest.get("version"') && py.includes('manifest.get("download_url"') && py.includes('manifest.get("sha256"'), 'Launcher self-updater must use the published manifest and checksum');
assert.ok(py.includes('bin/SkyRealmUpdater.exe') && py.includes('os.getpid()'), 'Launcher must hand off replacement to the separate updater helper');
assert.ok(updater.includes('expected_version') && updater.includes('launcher_version.txt') && updater.includes('relaunched.poll()'), 'Updater helper must verify the package version and roll back if the new launcher fails to start');

assert.ok(game.includes("return 'snow';"), 'The default world biome must be winter');
assert.ok(!game.includes("talkToBlacksmith();return") && !game.includes("talkToVillageElder();return") && !game.includes("talkToExplorer();return"), 'Old starter-base NPC interactions must be disabled');
assert.ok(game.includes("name: 'Лопата', icon: '🪏', count: 1"), 'A shovel must be available from the start');
assert.ok(game.includes("if(hits>=3)") && game.includes("snowShovelHits") && game.includes("clearedSnowTiles"), 'Snow must take three shovel hits and persist its cleared state');
assert.ok(game.includes("selectedInventoryItem()?.name==='Лопата'") && game.includes("shovelSnowAt(screenX+camX,screenY+camY)"), 'The shovel must work with Space and clicking a snow tile');
assert.ok(game.includes("drawTree(t,camX,camY)") && game.includes("const snowy=biomeAt(t.x/TILE,t.y/TILE)==='snow'"), 'Trees in the winter biome must have snow-covered branches');

const gameVersion = version;
assert.equal(gameVersion, version, 'Game version must match the packaged version file');
assert.ok(gameHtml.includes('content="'+version+'"') && gameHtml.includes('2D SURVIVAL · '+version), 'Visible and metadata game versions must match the packaged version');
const treeFn = game.slice(game.indexOf('function drawTree'), game.indexOf('function drawRock'));
assert.ok(treeFn.indexOf("const snowy=") >= 0 && treeFn.indexOf("const snowy=") < treeFn.indexOf("ctx.fillStyle=snowy?"), 'Snowy tree state must be initialized before use');

const drawFn = game.slice(game.indexOf('function draw(dt,time)'), game.indexOf('function placeSelectedStructure'));
const worldTradeRenderStart = drawFn.indexOf('if(tradeWorldMode){', drawFn.indexOf('if(tradeWorldMode){') + 1);
const worldNormalBranchStart = drawFn.indexOf('}else{', worldTradeRenderStart);
const worldRocksStart = drawFn.indexOf('for(const rock of world.rocks)', worldNormalBranchStart);
const normalWorldDraw = drawFn.slice(worldNormalBranchStart, worldRocksStart);
assert.ok(!normalWorldDraw.includes('ЛАВКА ЛЕСНИКА') && !normalWorldDraw.includes('ЛАВКА РУДОКОПА'), 'Shops must not render in the normal world');
assert.ok(drawFn.includes("drawTradeShop(SELL_SHOP") && drawFn.includes("drawTradeShop(BUY_SHOP"), 'Both shops must render in the trade world');
assert.ok(game.includes("if(!tradeWorldMode){toast('Лавки лесника и рудокопа находятся в Мире торговли."), 'T must direct home players to the trade world');
assert.ok(!game.includes('HOME_SELL_SHOP') && !game.includes('HOME_BUY_SHOP'), 'Home shop locations must not exist');
assert.ok(game.includes("tradeWorldMode&&Math.hypot(player.x-(SELL_SHOP.x*TILE+16)"), 'E shop interaction must be trade-world-only');
assert.equal(fs.readFileSync('game/version.txt','utf8').trim(), version, 'Game version bumped');

for (const crop of ['Пшеница','Морковь','Картофель','Томат','Кукуруза','Тыква','Клубника']) assert.ok(game.includes("product:'"+crop+"'"), 'Farm crop '+crop+' must exist');
assert.ok(game.includes("farmer:[") && game.includes("Семена клубники"), 'Farmer shop has broad tool and seed catalog');
assert.ok(game.includes("selected?.name==='Лейка'") && game.includes("selected?.name==='Компост'") && game.includes("selected?.name==='Удобрение'"), 'Watering and soil-care tools work');
assert.ok(game.includes("farmCropSellPrice(name)") && game.includes("farmCropBuyPrice(name)"), 'Crop sale and purchase prices use the agreed crop balance');
assert.ok(game.includes("function interactFarmPlot") && game.includes("plot.crop=crop.id"), 'Seeds can be planted and harvested per crop');
assert.ok(game.includes("crop:FARM_CROPS.some(c=>c.id===v.crop)?v.crop:null"), 'Crop state is restored from saves');
assert.equal(fs.readFileSync('game/version.txt','utf8').trim(), version, 'Farm update version must be bumped');

assert.ok(game.includes('const FARM_CROP_TRADE_PRICES={Пшеница:{buy:30,sell:50}') && game.includes('Клубника:{buy:123,sell:200}'), 'Crop trading prices must match the agreed cents-per-item balance');
assert.ok(game.includes('function farmCropBuyPrice(name)') && game.includes('farmCropBuyPrice(name)||item.price'), 'Farmer must sell harvested crops at the agreed buy prices');
assert.ok(game.includes("Math.round(unit*(1+Math.min(.25,villageReputation*.005)))") && !game.includes("(id==='farmer'?(farmCropSellPrice(name)||unit):unit)"), 'Crop sale totals must use the correct NPC id and per-item price');


const activeTradeDraw = game.slice(game.indexOf('function draw(dt,time)'), game.indexOf('function mineRockScreenPosition'));
const tradeBranchStart = activeTradeDraw.indexOf('if(tradeWorldMode){', activeTradeDraw.indexOf('if(tradeWorldMode){') + 1);
const tradeBranchEnd = activeTradeDraw.indexOf('}else{', tradeBranchStart);
const tradeNormalEnd = activeTradeDraw.indexOf('for(const rock of world.rocks)', tradeBranchEnd);
assert.ok(tradeBranchStart >= 0 && tradeBranchEnd > tradeBranchStart && tradeNormalEnd > tradeBranchEnd, 'Main renderer must separate Trade World from the normal world');
const tradeBranch = activeTradeDraw.slice(tradeBranchStart, tradeBranchEnd);
const normalBranch = activeTradeDraw.slice(tradeBranchEnd, tradeNormalEnd);
assert.ok(tradeBranch.includes('drawTradeShop(SELL_SHOP') && tradeBranch.includes('drawTradeShop(BUY_SHOP'), 'Both market stalls must exist only in Trade World');
assert.ok(!normalBranch.includes('drawTradeShop(') && normalBranch.includes('drawCabin('), 'The normal snow world must not render either market stall');
assert.ok(game.includes('function drawTradeGround(camX,camY)') && game.includes('drawTradeGround(camX,camY)'), 'Trade World must use its own market ground renderer');
assert.ok(game.includes('if(tradeWorldMode)return false;const cx=52,cy=36'), 'The normal lake must not appear in Trade World');
assert.ok(game.includes('if(!tradeWorldMode)return;const x=shop.x*TILE+16-camX'), 'Market stalls must have an explicit Trade World-only render gate');
assert.ok(game.includes("x:Math.floor(COLS*.18),y:Math.floor(ROWS*.28)") && game.includes("houses:['merchant','farmer']"), 'Merchant and farmer must be placed beside the Trade World hub');
assert.ok(game.includes('function interactFarmPlot(plot)') && game.includes('function updateFarmPlots(dt)'), 'Planting, watering and growing farm plots must be included');

assert.ok(game.includes('const coop=window.SkyRealmCoopClient;const coopRoom=coop?.getRoomState?.();const ownsWeather=!coopRoom||coop.isRoomOwner;'),
  'Only the co-op room owner may advance weather while a room exists');
assert.ok(game.includes('if(ownsWeather&&!paused&&!inMainMenu&&!inHouse&&!mineMode){weatherTimer-=dt;'),
  'Guest clients must not independently randomize the shared weather');
assert.ok(game.includes('for(let i=monsters.length-1;i>=0;i--)if(monsters[i]&&monsters[i].villageRaid)monsters.splice(i,1);'),
  'Applying a shared snapshot must replace, not duplicate, existing raid enemies');
const snapshotSync = game.slice(game.indexOf('async function syncCoopWorldSnapshot(){'), game.indexOf('async function syncCoopWorldActions(){'));
assert.ok(snapshotSync.includes('if(!saveGame())return;'),
  'The room owner must persist live event and raid timers before publishing snapshots');

assert.ok(game.includes("if(raidRestoreKey!==lastRestoredVillageRaidKey)"),
  'Unchanged co-op snapshots must not recreate raid enemies every five seconds');

const worldClockUpdate=game.slice(game.indexOf('function updateWorldClock(dt){'),game.indexOf('function updateWorldEvents(dt){'));
assert.ok(worldClockUpdate.includes('const coopRoom=coopNetwork?.getRoomState?.();') && worldClockUpdate.includes('const remoteClockActive=!!(coopRoom&&!coopNetwork.isRoomOwner);'),
  'Guest clock authority must remain active while a room is paused');
assert.ok(worldClockUpdate.includes('wasNight=isNightTime();updateClockDisplay();return;'),
  'A guest must return before applying any local clock or hunger progression when it does not own the room');
assert.ok(!worldClockUpdate.includes('Date.now()-sharedClock.received_at'),
  'A delayed owner clock packet must not make the guest advance time locally');
const ownerGate="const coop=window.SkyRealmCoopClient;const coopRoom=coop?.getRoomState?.();if(coopRoom&&!coop.isRoomOwner)return;";
assert.ok(game.split(ownerGate).length-1>=2,
  'World events and village raids must remain owner-controlled during room pauses');
