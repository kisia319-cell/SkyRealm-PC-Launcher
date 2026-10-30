'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('game/index.html','utf8');
const ui = fs.readFileSync('game/multiplayer-ui.js','utf8');
const client = fs.readFileSync('game/multiplayer-client.js','utf8');
const game = fs.readFileSync('game/game.js','utf8');

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
console.log('SkyRealm co-op UI integration checks passed.');
