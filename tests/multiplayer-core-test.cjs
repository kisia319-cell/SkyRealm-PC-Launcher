const assert=require('node:assert/strict');
const m=require('../game/multiplayer-core.js');
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
assert.equal(m.sanitizeWorldAction('mine_rock',{rock_index:3.5,tool:'Кирка'}),null);
assert.equal(m.sanitizeWorldAction('mine_rock',{rock_index:3,tool:'Палка'}),null);
assert.deepEqual(m.sanitizeWorldAction('farm_plant',{x:112,y:144,crop_id:'wheat'}),{x:112,y:144,crop_id:'wheat'});
assert.deepEqual(m.sanitizeWorldAction('farm_water',{x:112,y:144}),{x:112,y:144});
assert.equal(m.sanitizeWorldAction('farm_plant',{x:112,y:144,crop_id:'unknown'}),null);
assert.equal(m.sanitizeWorldAction('farm_water',{x:112,y:144,amount:999}),null);
const sharedSnapshot=m.sanitizeSharedWorldSnapshot({
  placedStructures:[{type:'house',x:20,y:40}],
  farmCrops:[{crop:'wheat',x:10,y:10}],
  x:500,hp:12,walletCents:9900,resources:[{name:'Gold',count:999}]
});
assert.deepEqual(sharedSnapshot,{placedStructures:[{type:'house',x:20,y:40}],farmCrops:[{crop:'wheat',x:10,y:10}]});
assert.deepEqual(m.sanitizeSharedWorldSnapshot({resources:[{name:'Gold',count:999}],walletCents:100}),{});
assert.equal(m.sanitizeSharedWorldSnapshot({placedStructures:'x'.repeat(61000)}),null);
assert.equal(m.sanitizeSharedWorldSnapshot(null),null);
console.log('SkyRealm multiplayer core tests passed.');
