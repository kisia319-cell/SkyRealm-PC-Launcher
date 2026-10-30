'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const core = require('../game/multiplayer-core.js');

(async () => {
  const calls = [];
  const roomId = '123e4567-e89b-12d3-a456-426614174000';
  const sandbox = {
    Map, URL, Promise, setTimeout, clearTimeout, console,
    sessionStorage: { getItem: () => null },
    localStorage: { getItem: (key) => key === 'skyrealm_token' ? 'test-access-token' : null },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.SkyRealmMultiplayerCore = core;
  sandbox.fetch = async (url, options = {}) => {
    const route = new URL(String(url)).searchParams.get('route');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ route, method: options.method || 'GET', headers: options.headers || {}, body });
    let payload;
    if (route === '/api/coop/current') {
      payload = {
        user_id: 'user-1',
        room: { id: roomId, owner_id: 'user-1', status: 'running', world_difficulty: 'medium' }
      };
    } else if (route === '/api/coop/snapshot/get') {
      payload = { snapshot: { room_id: roomId, version: 4, payload: { placedStructures: [] } } };
    } else if (route === '/api/coop/snapshot/save') {
      payload = { snapshot: { room_id: roomId, version: 5 } };
    } else if (route === '/api/coop/claim') {
      payload = { claim: { claimed: true, room_id: roomId, object_kind: 'treasure_chest', object_id: 'forest' } };
    } else {
      throw new Error('Unexpected route: ' + route);
    }
    return { ok: true, status: 200, json: async () => payload };
  };

  const clientSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../game/multiplayer-client.js'), 'utf8');
  vm.runInNewContext(clientSource, sandbox, { filename: 'game/multiplayer-client.js' });

  const client = sandbox.SkyRealmCoopClient;
  assert.ok(client, 'Co-op client must initialize');
  await client.current();
  assert.equal(client.isRoomOwner, true);

  const snapshot = await client.getWorldSnapshot();
  assert.equal(snapshot.version, 4);

  const saved = await client.saveWorldSnapshot({
    placedStructures: [{ type: 'house', x: 12, y: 20 }],
    walletCents: 987654,
    resources: [{ name: 'Gold', count: 999 }]
  });
  assert.equal(saved.version, 5);

  const saveCall = calls.find(call => call.route === '/api/coop/snapshot/save');
  assert.ok(saveCall, 'Client must send a snapshot save request');
  assert.equal(saveCall.method, 'POST');
  assert.equal(saveCall.body.room_id, roomId);
  assert.equal(saveCall.body.expected_version, 4);
  assert.deepEqual(saveCall.body.payload, {
    placedStructures: [{ type: 'house', x: 12, y: 20 }]
  });
  assert.equal(saveCall.headers.Authorization, 'Bearer test-access-token');

  const claim = await client.claimWorldObject('treasure_chest', 'forest');
  assert.equal(claim.claimed, true);
  const claimCall = calls.find(call => call.route === '/api/coop/claim');
  assert.ok(claimCall, 'Client must send the world-object claim request');
  assert.equal(claimCall.method, 'POST');
  assert.deepEqual(claimCall.body, {
    room_id: roomId, object_kind: 'treasure_chest', object_id: 'forest'
  });
  assert.equal(claimCall.headers.Authorization, 'Bearer test-access-token');

  const guestCalls = [];
  const guestSandbox = {
    Map, URL, Promise, setTimeout, clearTimeout, console,
    sessionStorage: { getItem: () => null },
    localStorage: { getItem: (key) => key === 'skyrealm_token' ? 'guest-access-token' : null },
  };
  guestSandbox.window = guestSandbox;
  guestSandbox.globalThis = guestSandbox;
  guestSandbox.SkyRealmMultiplayerCore = core;
  guestSandbox.fetch = async (url, options = {}) => {
    const route = new URL(String(url)).searchParams.get('route');
    guestCalls.push({ route, options });
    if (route !== '/api/coop/current') throw new Error('Guest must not call mutation route: ' + route);
    return {
      ok: true, status: 200,
      json: async () => ({
        user_id: 'guest-user',
        room: { id: roomId, owner_id: 'room-owner', status: 'running', world_difficulty: 'medium' }
      })
    };
  };
  vm.runInNewContext(clientSource, guestSandbox, { filename: 'game/multiplayer-client-guest.js' });
  const guestClient = guestSandbox.SkyRealmCoopClient;
  await guestClient.current();
  assert.equal(guestClient.isRoomOwner, false);
  const guestSave = await guestClient.saveWorldSnapshot({ placedStructures: [{ type: 'house', x: 1, y: 2 }] });
  assert.equal(guestSave, false, 'Non-owner must not save the canonical world snapshot');
  assert.equal(guestCalls.some(call => call.route === '/api/coop/snapshot/save'), false, 'Non-owner must not even send a snapshot write request');

  console.log('SkyRealm multiplayer client snapshot tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
