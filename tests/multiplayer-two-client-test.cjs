'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../game/multiplayer-core.js');
const source = fs.readFileSync(path.join(__dirname,'../game/multiplayer-client.js'),'utf8');

const roomId='123e4567-e89b-12d3-a456-426614174000';
const room={id:roomId,owner_id:'user-host',status:'running',world_difficulty:'medium',pvp_enabled:true};
const rooms=new Map();
const broadcastEvents=[];
const channelList=[];
function fakeSupabaseFor(userId){
  const client={
    realtime:{setAuth:async()=>{}},
    channel(topic,options){
      const channel={
        topic,options,handlers:[],tracked:null,
        on(type,filter,handler){if(type==='broadcast'||type==='presence')this.handlers.push({type,filter,handler});return this;},
        subscribe(callback){queueMicrotask(()=>callback('SUBSCRIBED'));return this;},
        async track(payload){this.tracked=payload;return 'ok';},
        presenceState(){return Object.fromEntries(channelList.filter(x=>x.topic===topic&&x.tracked).map(x=>[x.tracked.user_id,[x.tracked]]));},
        async send(message){
          broadcastEvents.push({sender:userId,message});
          for(const peer of channelList){
            if(peer===this||peer.topic!==topic)continue;
            for(const handler of peer.handlers){
              if(handler.type==='broadcast'&&handler.filter?.event===message.event){
                handler.handler({payload:message.payload});
              }
            }
          }
          return 'ok';
        }
      };
      channelList.push(channel);return channel;
    },
    async removeChannel(channel){
      const at=channelList.indexOf(channel);if(at>=0)channelList.splice(at,1);return 'ok';
    }
  };
  return {createClient:()=>client};
}
function createClient(userId,token){
  const sandbox={
    Map,URL,Promise,Date,Math,JSON,Number,String,Array,Object,Set,
    setTimeout,clearTimeout,queueMicrotask,console,
    crypto:require('node:crypto').webcrypto,
    sessionStorage:{getItem:()=>null},
    localStorage:{getItem:key=>key==='skyrealm_token'?token:null},
    supabase:fakeSupabaseFor(userId),
  };
  sandbox.window=sandbox;sandbox.globalThis=sandbox;sandbox.SkyRealmMultiplayerCore=core;
  sandbox.fetch=async(url,options={})=>{
    const route=new URL(String(url)).searchParams.get('route');
    const body=options.body?JSON.parse(options.body):null;
    if(route==='/api/coop/create'){
      rooms.set(roomId,{...room,owner_id:userId});
      return {ok:true,status:200,json:async()=>({user_id:userId,room:rooms.get(roomId),invite_code:'ABCD2345'})};
    }
    if(route==='/api/coop/join'){
      if(!rooms.has(roomId))throw new Error('Host room has not been created.');
      return {ok:true,status:200,json:async()=>({user_id:userId,room:rooms.get(roomId)})};
    }
    if(route==='/api/coop/current'){
      return {ok:true,status:200,json:async()=>({user_id:userId,room:rooms.get(roomId)||null})};
    }
    if(route==='/api/coop/snapshot/save'){
      return {ok:true,status:200,json:async()=>({user_id:userId,snapshot:{room_id:roomId,version:6,payload:body.payload}})};
    }
    throw new Error('Unexpected two-client route: '+route);
  };
  vm.runInNewContext(source,sandbox,{filename:'multiplayer-client-two-client.js'});
  return sandbox.SkyRealmCoopClient;
}

(async()=>{
  const host=createClient('user-host','host-access-token');
  const guest=createClient('user-guest','guest-access-token');
  const created=await host.create('medium');
  assert.equal(created.room.owner_id,'user-host');
  assert.equal(host.isRoomOwner,true);
  const joined=await guest.join('ABCD2345');
  assert.equal(joined.id,roomId);
  assert.equal(guest.isRoomOwner,false);
  await host.connectRealtime(created.room,{});
  await guest.connectRealtime(joined,{});
  const hostChannel=channelList.find(c=>c.options?.config?.presence?.key==='user-host');
  const guestChannel=channelList.find(c=>c.options?.config?.presence?.key==='user-guest');
  assert.ok(hostChannel&&guestChannel,'Host and guest must occupy independent realtime channels.');
  assert.notEqual(hostChannel,guestChannel);

  assert.equal(await host.sendPosition({x:320,y:640,face:'right',difficulty:'medium',world_mode:'surface'}),true);
  const remoteAtGuest=guest.getRemotePlayers();
  assert.equal(remoteAtGuest.length,1);
  assert.deepEqual({user_id:remoteAtGuest[0].user_id,x:remoteAtGuest[0].x,y:remoteAtGuest[0].y,face:remoteAtGuest[0].face},
    {user_id:'user-host',x:320,y:640,face:'right'});
  assert.equal(await guest.sendPosition({x:420,y:740,face:'left',difficulty:'medium',world_mode:'surface'}),true);
  const remoteAtHost=host.getRemotePlayers();
  assert.equal(remoteAtHost.length,1);
  assert.deepEqual({user_id:remoteAtHost[0].user_id,x:remoteAtHost[0].x,y:remoteAtHost[0].y,face:remoteAtHost[0].face},
    {user_id:'user-guest',x:420,y:740,face:'left'});

  assert.equal(await guest.sendPvpHit('user-host',15),true);
  const incoming=host.drainPvpHits();
  assert.deepEqual(JSON.parse(JSON.stringify(incoming.map(hit=>({attacker_user_id:hit.attacker_user_id,damage:hit.damage})))),
    [{attacker_user_id:'user-guest',damage:15}]);
  assert.equal(await host.sendPvpHit('user-host',15),false,'A client cannot target itself with a PvP hit.');

  assert.equal(await guest.saveWorldSnapshot({placedStructures:[{type:'house',x:1,y:2}]}),false,
    'A guest must never become the canonical shared-world writer.');
  assert.ok(await host.saveWorldSnapshot({placedStructures:[{type:'house',x:1,y:2}]}),
    'The room owner can persist the shared snapshot.');
  assert.ok(broadcastEvents.length>=3,'Both clients must exchange position and PvP events over the shared channel.');

  await guest.disconnectRealtime();
  await host.disconnectRealtime();
  console.log('SkyRealm two-client room, realtime position, PvP and owner snapshot tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});




