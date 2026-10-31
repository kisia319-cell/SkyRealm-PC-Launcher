const assert=require('node:assert/strict');
const fs=require('node:fs');
const m=require('../game/multiplayer-core.js');
const serverSource=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/skyrealm-coop/index.ts'),'utf8');
const serverFieldsMatch=serverSource.match(/const SHARED_SNAPSHOT_FIELDS = new Set\(\[(.*?)\]\);/);
assert.ok(serverFieldsMatch,'Supabase server must declare its shared snapshot whitelist');
const serverFields=[...serverFieldsMatch[1].matchAll(/"([^"]+)"/g)].map(match=>match[1]).sort();
assert.deepEqual([...m.SHARED_WORLD_FIELDS].sort(),serverFields,
  'Client and server shared-world snapshot whitelists must remain exactly aligned');
assert.equal(m.MAX_PLAYERS,8);
assert.equal(m.normalizeInviteCode(' abcd-2345 '),'ABCD2345');
assert.equal(m.isValidInviteCode('ABCD2345'),true);
assert.equal(m.isValidInviteCode('ABCD01I5'),false);
assert.deepEqual(m.canJoinRoom({status:'lobby',max_players:8},7),{ok:true,capacity:8,available:1});
assert.equal(m.canJoinRoom({status:'lobby',max_players:8},8).reason,'ROOM_FULL');
assert.equal(m.canJoinRoom({status:'paused',max_players:8},1).reason,'ROOM_PAUSED');
assert.equal(m.canJoinRoom({status:'closed',max_players:8},1).reason,'ROOM_CLOSED');
const room={status:'paused',owner_id:'owner-1'};
assert.equal(m.canResumeRoom(room,'owner-1'),true);
assert.equal(m.canResumeRoom(room,'member-1'),false);
assert.equal(m.canChangePvp(room,'owner-1'),true);
assert.equal(m.canChangePvp(room,'member-1'),false);
assert.equal(m.shouldPauseOnOwnerDeparture({status:'running',owner_id:'owner-1'},'owner-1'),true);
assert.equal(m.shouldPauseOnOwnerDeparture({status:'running',owner_id:'owner-1'},'member-1'),false);
assert.equal(m.shouldPauseOnOwnerDeparture({status:'lobby',owner_id:'owner-1'},'owner-1'),true);
assert.equal(m.shouldPauseOnOwnerDeparture({status:'paused',owner_id:'owner-1'},'owner-1'),false);
assert.deepEqual(m.sanitizePlayerInput({seq:4,keys:['left','hack','up','down','right']}),{seq:4,keys:['left','up','down','right']});
assert.equal(m.sanitizePlayerInput({seq:-1,keys:['up']}),null);
assert.equal(m.sanitizePlayerInput({seq:1.5,keys:['up']}),null);
assert.throws(()=>m.makeRoomTopic('bad-id'),TypeError);
assert.equal(m.makeRoomTopic('123e4567-e89b-12d3-a456-426614174000'),'skyrealm:room:123e4567-e89b-12d3-a456-426614174000');

const goodPosition={user_id:'user-1',x:320.25,y:640,face:'left',difficulty:'medium',world_mode:'surface',name:'Hero',appearance:{skin:'#e8b88c',hair:'#352d3d',armor:'#526fba',accent:'#9cb9ff'}};
assert.deepEqual(m.sanitizePlayerPosition(goodPosition),{
  ...goodPosition,x:320.3
});
assert.equal(m.sanitizePlayerPosition({...goodPosition,x:-1}),null);
assert.equal(m.sanitizePlayerPosition({...goodPosition,y:10001}),null);
assert.equal(m.sanitizePlayerPosition({...goodPosition,difficulty:'creative'}),null);
assert.equal(m.sanitizePlayerPosition({...goodPosition,world_mode:'dungeon'}).world_mode,'dungeon');
assert.equal(m.sanitizePlayerPosition({...goodPosition,world_mode:'mine'}).world_mode,'mine');
assert.equal(m.sanitizePlayerPosition({...goodPosition,world_mode:'cave'}).world_mode,'cave');
assert.equal(m.sanitizePlayerPosition({...goodPosition,world_mode:'house'}).world_mode,'house');
const safePosition=m.sanitizePlayerPosition({...goodPosition,name:'<b>Bad</b>',appearance:{skin:'url(x)',hair:'#112233'}});
assert.equal(safePosition.name,'bBad/b');
assert.equal(safePosition.appearance.skin,'#e8b88c');
assert.equal(safePosition.appearance.hair,'#112233');

assert.deepEqual(m.sanitizeWorldClock({minute_total:1234.56789,survived_nights:12,blood_moon_active:true}),{
  minute_total:1234.568,survived_nights:12,blood_moon_active:true
});
assert.deepEqual(m.sanitizeWorldClock({minute_total:0,survived_nights:0,blood_moon_active:false}),{
  minute_total:0,survived_nights:0,blood_moon_active:false
});
assert.equal(m.sanitizeWorldClock({minute_total:-1,survived_nights:1,blood_moon_active:false}),null);
assert.equal(m.sanitizeWorldClock({minute_total:1e9,survived_nights:1,blood_moon_active:false}),null);
assert.equal(m.sanitizeWorldClock({minute_total:10,survived_nights:1.5,blood_moon_active:false}),null);
assert.equal(m.sanitizeWorldClock({minute_total:10,survived_nights:1,blood_moon_active:1}),null);
assert.deepEqual(m.sanitizeWorldAction('place_structure',{type:'farmplot',x:112,y:144}),{type:'farmplot',x:112,y:144});
assert.equal(m.sanitizeWorldAction('place_structure',{type:'unknown',x:112,y:144}),null);
assert.equal(m.sanitizeWorldAction('place_structure',{type:'torch',x:114,y:144}),null);
assert.equal(m.sanitizeWorldAction('place_structure',{type:'torch',x:112,y:144,actor_id:'bad'}),null);
assert.equal(m.sanitizeWorldAction('give_gold',{amount:999}),null);
assert.deepEqual(m.sanitizeWorldAction('mine_rock',{rock_index:3,tool:'Кирка'}),{rock_index:3,tool:'Кирка'});
assert.deepEqual(m.sanitizeWorldAction('mine_rock',{rock_index:3,tool:'Кирка',player_class:'miner',miner_skill_level:2}),{rock_index:3,tool:'Кирка',player_class:'miner',miner_skill_level:2});
assert.equal(m.sanitizeWorldAction('mine_rock',{rock_index:3,tool:'Кирка',player_class:'rich'}),null);
assert.equal(m.sanitizeWorldAction('mine_rock',{rock_index:3,tool:'Кирка',miner_skill_level:6}),null);
assert.equal(m.sanitizeWorldAction('mine_rock',{rock_index:3.5,tool:'Кирка'}),null);
assert.equal(m.sanitizeWorldAction('mine_rock',{rock_index:3,tool:'Палка'}),null);
assert.deepEqual(m.sanitizeWorldAction('chop_tree',{x:144,y:177,tool:'Топор'}),{x:144,y:176,tool:'Топор'});
assert.equal(m.sanitizeWorldAction('chop_tree',{x:144,y:177,tool:'Кирка'}),null);
assert.deepEqual(m.sanitizeWorldAction('farm_plant',{x:112,y:144,crop_id:'wheat'}),{x:112,y:144,crop_id:'wheat'});
assert.deepEqual(m.sanitizeWorldAction('farm_water',{x:112,y:144}),{x:112,y:144});
assert.deepEqual(m.sanitizeWorldAction('farm_harvest',{x:112,y:144,player_class:'farmer',farmer_skill_level:3,has_sickle:true}),{x:112,y:144,player_class:'farmer',farmer_skill_level:3,has_sickle:true});
assert.equal(m.sanitizeWorldAction('farm_harvest',{x:112,y:144,player_class:'rich'}),null);
assert.equal(m.sanitizeWorldAction('farm_harvest',{x:112,y:144,farmer_skill_level:7}),null);
assert.equal(m.sanitizeWorldAction('farm_plant',{x:112,y:144,crop_id:'unknown'}),null);
assert.equal(m.sanitizeWorldAction('farm_water',{x:112,y:144,amount:999}),null);
const sharedSnapshot=m.sanitizeSharedWorldSnapshot({
  placedStructures:[{type:'house',x:20,y:40}],
  farmCrops:[{crop:'wheat',x:10,y:10}],
  x:500,hp:12,walletCents:9900,resources:[{name:'Gold',count:999}]
});
assert.deepEqual(sharedSnapshot,{placedStructures:[{type:'house',x:20,y:40}],farmCrops:[{crop:'wheat',x:10,y:10}]});
const sharedEvents = m.sanitizeSharedWorldSnapshot({
  villageRaidActive:true,villageRaidKills:2,villageRaidTimer:45,lastVillageRaidDay:4,
  weatherMode:'storm',weatherTimer:18,
  meteorPoint:{x:640,y:480},meteorShowerTimer:90,
  worldEventCamp:{x:500,y:400,life:100},
  worldEventTraveler:{x:700,y:600,life:80},
  lastWorldMeteorNight:3,lastWorldHordeNight:2,lastWorldCampDay:4,lastWorldTravelerDay:2,
  hp:1,walletCents:9000
});
assert.deepEqual(sharedEvents,{
  villageRaidActive:true,villageRaidKills:2,villageRaidTimer:45,lastVillageRaidDay:4,
  weatherMode:'storm',weatherTimer:18,
  meteorPoint:{x:640,y:480},meteorShowerTimer:90,
  worldEventCamp:{x:500,y:400,life:100},
  worldEventTraveler:{x:700,y:600,life:80},
  lastWorldMeteorNight:3,lastWorldHordeNight:2,lastWorldCampDay:4,lastWorldTravelerDay:2
},'Weather, raid and temporary world events must survive shared snapshot sanitization without leaking player-only state');
assert.deepEqual(m.sanitizeSharedWorldSnapshot({villageRaidActive:false,weatherMode:'clear',meteorPoint:null}),{
  villageRaidActive:false,weatherMode:'clear',meteorPoint:null
},'False and null world states must be preserved so guests can clear old events');
assert.deepEqual(m.sanitizeSharedWorldSnapshot({resources:[{name:'Gold',count:999}],walletCents:100}),{});
assert.equal(m.sanitizeSharedWorldSnapshot({placedStructures:'x'.repeat(61000)}),null);
assert.equal(m.sanitizeSharedWorldSnapshot(null),null);
console.log('SkyRealm multiplayer core tests passed.');
