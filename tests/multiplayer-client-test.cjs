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

  console.log('SkyRealm multiplayer client snapshot tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
