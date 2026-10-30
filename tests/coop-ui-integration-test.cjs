'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync('game/index.html','utf8');
const ui = fs.readFileSync('game/multiplayer-ui.js','utf8');
const client = fs.readFileSync('game/multiplayer-client.js','utf8');
const game = fs.readFileSync('game/game.js','utf8');
const edge = fs.readFileSync('supabase/functions/skyrealm-coop/index.ts','utf8');
const core = require('../game/multiplayer-core.js');

const requiredIds = [
  'menu-coop','coop-shade','coop-title','coop-message','coop-no-room',
  'coop-difficulty','coop-create','coop-code','coop-join','coop-has-room',
  'coop-room-status','coop-room-id','coop-invite-row','coop-invite-code',
  'coop-copy','coop-members','coop-pvp-row','coop-pvp','coop-start',
  'coop-resume','coop-refresh','coop-leave','coop-close'
];
for (const id of requiredIds) {
  assert.ok(html.includes('id="' + id + '"') || html.includes("id='" + id + "'"), 'Missing UI element: ' + id);
}
for (const selector of requiredIds.filter(id => id !== 'menu-coop')) {
  if (ui.includes("$('" + selector + "')")) {
    assert.ok(html.includes('id="' + selector + '"') || html.includes("id='" + selector + "'"), 'UI selector has no markup: ' + selector);
  }
}
const coreAt = html.indexOf('<script src="multiplayer-core.js">');
const clientAt = html.indexOf('<script src="multiplayer-client.js">');
const uiAt = html.indexOf('<script src="multiplayer-ui.js">');
assert.ok(coreAt >= 0 && clientAt > coreAt && uiAt > clientAt, 'Co-op scripts must load core -> client -> UI');
assert.ok(html.indexOf('<script src="game.js">') < coreAt, 'Game engine should load before optional co-op adapters');
assert.match(ui,/coop-start/);
assert.match(ui,/coop-difficulty/);
assert.match(client,/getWorldSession\(\)/);
assert.match(client,/getRoomState\(\)/);
assert.match(game,/coopRoomPaused/);
assert.match(client,/sendPosition/);
assert.match(game,/skyrealm_coop_save_v1_/);
assert.match(game,/drawRemotePlayers\(camX,camY\)/);
assert.match(game,/updateCoopPosition\(dt\)/);
assert.match(game,/saveKey=coopSession\?\([^)]*\):worldSaveKey\(record\.id\)/);
assert.match(client,/reportSharedDeath/);
assert.match(client,/setWorldClock/);
assert.match(game,/syncCoopSharedDeath/);
assert.match(ui,/refresh\(true\);/);

const coopRoutes = ['create','join','start','current','leave','resume','pvp','heartbeat','recover-owner','clock','death','snapshot/get','snapshot/save','claim','actions/enqueue','actions/pending','actions/status','actions/commit','actions/commit-farm','actions/commit-mine','actions/commit-tree','actions/reject'];
for (const route of coopRoutes) {
  assert.ok(client.includes("'/api/coop/" + route + "'"), 'Client calls an unrecognised route: ' + route);
  assert.ok(edge.includes('route === "/api/coop/' + route + '"'), 'Edge Function is missing route: ' + route);
}
assert.ok(edge.includes('route === "/api/coop/clock"'));
assert.ok(edge.includes('route === "/api/coop/death"'));
assert.ok(client.includes('reportSharedDeath'));
assert.ok(client.includes('setWorldClock'));
assert.ok(client.includes('getWorldSnapshot') && client.includes('saveWorldSnapshot'));
assert.ok(client.includes('commitFarmAction') && edge.includes('commit_co_op_farm_action'),'Farm commits must be wired from the client to the server RPC.');
assert.ok(client.includes('commitMineAction') && edge.includes('commit_co_op_mine_action'),'Mining commits must be wired from the client to the server RPC.');
assert.ok(client.includes('commitTreeAction') && edge.includes('commit_co_op_tree_action'),'Tree chopping commits must be wired from the client to the server RPC.');
assert.ok(edge.includes('actionType === "chop_tree"') && game.includes('queueGuestTreeChop') && game.includes('network.commitTreeAction'),'Guest tree chopping must be owner-mediated.');
assert.ok(game.includes('treeChops') && game.includes('felledTrees') && game.includes('markTreeFelled'),'Tree damage and felling must persist in the shared world state.');
assert.ok(game.includes("actor.world_mode!=='surface'") && game.includes("Math.hypot(tree.x-Number(actor.x),tree.y-Number(actor.y))>86"),'The owner must validate the lumberjack position and reach.');
assert.ok(edge.includes('actionType === "mine_rock"'),'Edge Function must validate guest mining requests.');
assert.ok(game.includes('queueGuestMineAction') && game.includes('network.commitMineAction'),'Guest mine clicks must be processed by the room owner.');
assert.ok(game.includes('saveKey.startsWith(\'skyrealm_coop_save_v1_\')&&network?.isRoomOwner') && game.includes('network.pauseRoom()'),'Returning from a co-op world as owner must pause only that shared room.');
assert.ok(edge.includes('actionType === "farm_plant"') && edge.includes('"farm_water","farm_compost","farm_fertilize","farm_harvest"'),'Edge Function must validate all supported guest farm actions.');
assert.ok(client.includes('sendPvpHit') && game.includes('drainPvpHits') && game.includes('pvp_enabled'),'PvP toggle must gate room combat events.');
assert.ok(core.sanitizePlayerPosition({user_id:'x',x:100,y:100,face:'down',difficulty:'medium',world_mode:'mine'}),'Mine presence must be accepted.');
assert.ok(game.includes('coopLocalWorldMode') && game.includes('drawRemotePlayers(0,0)'),'Remote avatars must render inside cave, mine, dungeon and house interiors.');
assert.ok(game.includes('sanitizeSharedWorldSnapshot') && game.includes('syncCoopWorldSnapshot'));
assert.ok(game.includes('syncCoopSharedDeath'));
assert.ok(game.includes("claimCoopChest('treasure_chest'"), 'Outdoor chests must use server claims');
assert.ok(game.includes("claimCoopChest('cave_chest','cave')"), 'Cave chest must use server claims');
assert.ok(game.includes("claimCoopChest('dungeon_chest','dungeon-5')"), 'Dungeon chest must use server claims');
assert.ok(edge.includes('objectKind === "cave_chest"') && edge.includes('objectKind === "dungeon_chest"'));
assert.ok(game.includes('if(!network?.getWorldSession?.())'), 'Paused rooms must not award local chest loot');
assert.ok(ui.includes('startMonitors();') && ui.includes('window.addEventListener'));


assert.ok(client.includes("const root=typeof globalThis!=='undefined'?globalThis:window;"), 'Client adapter must define its global root');
assert.ok(client.includes('const safeClock=root.SkyRealmMultiplayerCore?.sanitizeWorldClock;'), 'Client must bind the world-clock sanitizer');
const sandbox = { Map, URL, Promise, setTimeout, clearTimeout, console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.SkyRealmMultiplayerCore = core;
vm.runInNewContext(client, sandbox, { filename: 'game/multiplayer-client.js' });
assert.ok(sandbox.SkyRealmCoopClient, 'Client adapter must initialize at runtime');
assert.equal(typeof sandbox.SkyRealmCoopClient.setWorldClock, 'function');
assert.equal(typeof sandbox.SkyRealmCoopClient.enqueueWorldAction, 'function');
assert.equal(typeof sandbox.SkyRealmCoopClient.getPendingWorldActions, 'function');
assert.equal(typeof sandbox.SkyRealmCoopClient.commitWorldAction, 'function');
assert.match(game,/syncCoopWorldActions/);
assert.match(game,/queueGuestStructurePlacement/);
console.log('SkyRealm co-op UI integration checks passed.');
