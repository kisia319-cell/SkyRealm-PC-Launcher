'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const core = require('../game/multiplayer-core.js');

(async () => {
  const calls = [];
  const broadcastHandlers=[];
  const fakeChannel={
    on(type,filter,handler){if(type==='broadcast')broadcastHandlers.push(handler);return this;},
    subscribe(callback){queueMicrotask(()=>callback('SUBSCRIBED'));return this;},
    track:async()=>{},
    send:async(message)=>{calls.push({realtime:message});return 'ok';}
  };
  const fakeSupabase={createClient:()=>({realtime:{setAuth:async()=>{}},channel:()=>fakeChannel,removeChannel:async()=>{}})};
  const roomId = '123e4567-e89b-12d3-a456-426614174000';
  const sandbox = {
    Map, URL, Promise, setTimeout, clearTimeout, console,
    crypto: require('node:crypto').webcrypto,
    sessionStorage: { getItem: () => null },
    localStorage: { getItem: (key) => key === 'skyrealm_token' ? 'test-access-token' : null },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.SkyRealmMultiplayerCore = core;
  sandbox.supabase=fakeSupabase;
  sandbox.fetch = async (url, options = {}) => {
    const route = new URL(String(url)).searchParams.get('route');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ route, method: options.method || 'GET', headers: options.headers || {}, body });
    let payload;
    if (route === '/api/coop/current') {
      payload = {
        user_id: 'user-1',
        room: { id: roomId, owner_id: 'user-1', status: 'running', world_difficulty: 'medium', pvp_enabled: true }
      };
    } else if (route === '/api/coop/snapshot/get') {
      payload = { snapshot: { room_id: roomId, version: 4, payload: { placedStructures: [] } } };
    } else if (route === '/api/coop/snapshot/save') {
      payload = { snapshot: { room_id: roomId, version: 5 } };
    } else if(route==='/api/coop/actions/enqueue') payload={action:{action_id:body.action_id,status:'pending',duplicate:false}};
    else if(route==='/api/coop/actions/pending') payload={actions:[{action_id:'123e4567-e89b-42d3-a456-426614174099',action_type:'place_structure',payload:{type:'torch',x:112,y:144}}]};
    else if(route==='/api/coop/actions/status') payload={action:{action_id:body.action_id,status:'applied',result:{reward_name:'Пшеница',reward_amount:4}}};
    else if(route==='/api/coop/actions/commit') payload={result:{action_id:body.action_id,status:'applied',version:6}};
    else if(route==='/api/coop/actions/commit-farm') payload={result:{action_id:body.action_id,status:'applied',version:7,result:body.result}};
    else if(route==='/api/coop/actions/commit-mine') payload={result:{action_id:body.action_id,status:'applied',version:8,result:body.result}};
    else if(route==='/api/coop/actions/commit-tree') payload={result:{action_id:body.action_id,status:'applied',version:9,result:body.result}};
    else if(route==='/api/coop/actions/reject') payload={result:{action_id:body.action_id,status:'rejected'}};
    else if (route === '/api/coop/claim') {
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
  assert.equal(client.getRoomState().pvp_enabled,true,'Room state must expose the owner PvP toggle.');

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

  const queued=await client.enqueueWorldAction('place_structure',{type:'torch',x:112,y:144},'123e4567-e89b-42d3-a456-426614174099');
  assert.equal(queued.status,'pending');
  const mineQueued=await client.enqueueWorldAction('mine_rock',{rock_index:3,tool:'Кирка'},'123e4567-e89b-42d3-a456-426614174098');
  assert.equal(mineQueued.status,'pending','Guest mining must enter the shared action queue.');
  const treeQueued=await client.enqueueWorldAction('chop_tree',{x:144,y:177,tool:'Топор'},'123e4567-e89b-42d3-a456-426614174097');
  assert.equal(treeQueued.status,'pending','Guest tree chopping must enter the shared action queue.');
  const pending=await client.getPendingWorldActions(10);
  assert.equal(pending.length,1);
  assert.equal(pending[0].action_type,'place_structure');
  const status=await client.getWorldActionStatus('123e4567-e89b-42d3-a456-426614174099');
  assert.equal(status.status,'applied');
  assert.deepEqual(status.result,{reward_name:'Пшеница',reward_amount:4},'Guest action receipt must include the committed reward payload');
  const commit=await client.commitWorldAction('123e4567-e89b-42d3-a456-426614174099',{placedStructures:[{type:'torch',x:112,y:144}]});
  assert.equal(commit.version,6);
  const farmCommit=await client.commitFarmAction('123e4567-e89b-42d3-a456-426614174099',{farmCrops:[]},{consumed_item:'wheat_seed'});
  assert.equal(farmCommit.version,7,'Farm actions must use the dedicated backend commit route.');
  const mineCommit=await client.commitMineAction('123e4567-e89b-42d3-a456-426614174098',{mineRocks:[{x:100,y:120,ore:'Уголь',hp:0}]},{reward_name:'Уголь',reward_amount:1,bonus_name:'Камень',bonus_amount:1});
  assert.equal(mineCommit.version,8,'Mining actions must use the dedicated backend commit route.');
  const treeCommit=await client.commitTreeAction('123e4567-e89b-42d3-a456-426614174097',{adventureQuestProgress:{treeChops:[],felledTrees:[{x:144,y:177}]}},{reward_name:'Древесина',reward_amount:7,bonus_name:'Листья',bonus_amount:3,extra_name:'Палка',extra_amount:1});
  assert.equal(treeCommit.version,9,'Tree chopping must use the dedicated backend commit route.');
  const rejected=await client.rejectWorldAction('123e4567-e89b-42d3-a456-426614174099','invalid');
  assert.equal(rejected.status,'rejected');
  const actionCalls=calls.filter(call=>call.route.startsWith('/api/coop/actions/'));
  assert.deepEqual(actionCalls.map(call=>call.route),['/api/coop/actions/enqueue','/api/coop/actions/enqueue','/api/coop/actions/enqueue','/api/coop/actions/pending','/api/coop/actions/status','/api/coop/actions/commit','/api/coop/actions/commit-farm','/api/coop/actions/commit-mine','/api/coop/actions/commit-tree','/api/coop/actions/reject']);
  assert.equal(actionCalls[0].body.action_id,'123e4567-e89b-42d3-a456-426614174099');
  assert.equal(actionCalls[1].body.action_type,'mine_rock');
  assert.deepEqual(actionCalls[1].body.payload,{rock_index:3,tool:'Кирка'});
  assert.equal(actionCalls[2].body.action_type,'chop_tree');
  assert.deepEqual(actionCalls[2].body.payload,{x:144,y:176,tool:'Топор'});
  assert.equal(actionCalls[5].body.expected_version,5);
  assert.equal(actionCalls[6].body.expected_version,6);
  assert.deepEqual(actionCalls[6].body.result,{consumed_item:'wheat_seed'});
  assert.equal(actionCalls[7].body.expected_version,7);
  assert.deepEqual(JSON.parse(JSON.stringify(actionCalls[7].body.result)),{reward_name:'Уголь',reward_amount:1,bonus_name:'Камень',bonus_amount:1});
  assert.equal(actionCalls[8].body.expected_version,8);
  assert.deepEqual(JSON.parse(JSON.stringify(actionCalls[8].body.result)),{reward_name:'Древесина',reward_amount:7,bonus_name:'Листья',bonus_amount:3,extra_name:'Палка',extra_amount:1});
  assert.equal(actionCalls.every(call=>call.headers.Authorization==='Bearer test-access-token'),true);
  await client.connectRealtime(await client.current());
  assert.equal(await client.sendPosition({x:100,y:200,face:'left',difficulty:'medium',world_mode:'mine',name:'Caver'}),true,'Players must publish their position while inside the mine.');
  const positionSend=calls.find(call=>call.realtime?.payload?.kind==='player-position');
  assert.equal(positionSend.realtime.payload.world_mode,'mine');
  broadcastHandlers[0]({payload:{kind:'player-position',user_id:'user-2',x:120,y:210,face:'right',difficulty:'medium',world_mode:'cave',name:'Guest'}});
  assert.equal(client.getRemotePlayers()[0].world_mode,'cave','Remote positions from interiors must be retained.');
  assert.equal(await client.sendPvpHit('user-2',15),true,'Enabled PvP must send a hit to the private room channel.');
  const pvpSend=calls.find(call=>call.realtime?.payload?.kind==='player-hit');
  assert.deepEqual(JSON.parse(JSON.stringify(pvpSend.realtime.payload)),{kind:'player-hit',attacker_user_id:'user-1',target_user_id:'user-2',damage:15});
  broadcastHandlers[0]({payload:{kind:'player-hit',attacker_user_id:'user-2',target_user_id:'user-1',damage:15}});
  assert.deepEqual(JSON.parse(JSON.stringify(client.drainPvpHits().map(hit=>({attacker_user_id:hit.attacker_user_id,damage:hit.damage})))),[{attacker_user_id:'user-2',damage:15}]);
  await client.disconnectRealtime();

  const claim = await client.claimWorldObject('treasure_chest', 'forest');
  assert.equal(claim.claimed, true);
  for (const [kind,id] of [['cave_chest','cave'],['dungeon_chest','dungeon-5']]) {
    const extra = await client.claimWorldObject(kind,id);
    assert.equal(extra.claimed,true);
  }
  const claimCalls = calls.filter(call => call.route === '/api/coop/claim');
  assert.deepEqual(claimCalls.map(call=>call.body.object_kind),['treasure_chest','cave_chest','dungeon_chest']);
  assert.deepEqual(claimCalls.map(call=>call.body.object_id),['forest','cave','dungeon-5']);
  const claimCall = claimCalls[0];
  assert.ok(claimCall, 'Client must send the world-object claim request');
  assert.equal(claimCall.method, 'POST');
  assert.deepEqual(claimCall.body, {
    room_id: roomId, object_kind: 'treasure_chest', object_id: 'forest'
  });
  assert.equal(claimCall.headers.Authorization, 'Bearer test-access-token');

  const guestCalls = [];
  const guestSandbox = {
    Map, URL, Promise, setTimeout, clearTimeout, console,
    crypto: require('node:crypto').webcrypto,
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
