(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SkyRealmMultiplayerCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_PLAYERS=8;
  const ROOM_STATES=Object.freeze(['lobby','running','paused','closed']);
  const INVITE_CODE_PATTERN=/^[A-HJ-NP-Z2-9]{8}$/;
  function normalizeInviteCode(value){return typeof value==='string'?value.trim().toUpperCase().replace(/[-\s]/g,''):'';}
  function isValidInviteCode(value){return INVITE_CODE_PATTERN.test(normalizeInviteCode(value));}
  function canJoinRoom(room,memberCount){
    if(!room||!ROOM_STATES.includes(room.status))return {ok:false,reason:'ROOM_NOT_FOUND'};
    if(room.status==='closed')return {ok:false,reason:'ROOM_CLOSED'};
    if(room.status==='paused')return {ok:false,reason:'ROOM_PAUSED'};
    const cap=Math.min(MAX_PLAYERS,Math.max(1,Number(room.max_players)||MAX_PLAYERS));
    if(!Number.isInteger(memberCount)||memberCount<0)return {ok:false,reason:'INVALID_MEMBER_COUNT'};
    if(memberCount>=cap)return {ok:false,reason:'ROOM_FULL'};
    return {ok:true,capacity:cap,available:cap-memberCount};
  }
  function canResumeRoom(room,userId){
    if(!room||room.status!=='paused')return false;
    return typeof userId==='string'&&userId.length>0&&room.owner_id===userId;
  }
  function canChangePvp(room,userId){
    return !!room&&typeof userId==='string'&&userId.length>0&&room.owner_id===userId;
  }
  function makeRoomTopic(roomId){
    if(typeof roomId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(roomId))throw new TypeError('Invalid room id');
    return 'skyrealm:room:'+roomId;
  }
  function shouldPauseOnOwnerDeparture(room,departingUserId){
    return !!room&&['lobby','running'].includes(room.status)&&room.owner_id===departingUserId;
  }
  function sanitizePlayerInput(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const allowed=['up','down','left','right'];
    const keys=Array.isArray(input.keys)?input.keys.filter(k=>allowed.includes(k)).slice(0,4):[];
    const seq=Number(input.seq);
    if(!Number.isSafeInteger(seq)||seq<0)return null;
    return {seq,keys};
  }
  function sanitizePlayerPosition(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const id=typeof input.user_id==='string'?input.user_id.slice(0,64):'';
    const x=Number(input.x),y=Number(input.y);
    if(!id||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>12000||y<0||y>10000)return null;
    const difficulties=['easy','medium','hard','hell','impossible'];
    const modes=['surface','trade','mine','cave','dungeon','house'];
    if(!difficulties.includes(input.difficulty)||!modes.includes(input.world_mode))return null;
    const faces=['up','down','left','right'];
    const safeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:null;
    const raw=input.appearance&&typeof input.appearance==='object'?input.appearance:{};
    const appearance={
      skin:safeColor(raw.skin)||'#e8b88c',
      hair:safeColor(raw.hair)||'#352d3d',
      armor:safeColor(raw.armor)||'#526fba',
      accent:safeColor(raw.accent)||'#9cb9ff'
    };
    const name=typeof input.name==='string'?input.name.replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,20):'';
    return {
      user_id:id,x:Math.round(x*10)/10,y:Math.round(y*10)/10,
      face:faces.includes(input.face)?input.face:'down',
      difficulty:input.difficulty,world_mode:input.world_mode,
      name,appearance
    };
  }

  function sanitizeWorldAction(actionType,input){
    if(typeof actionType!=='string'||!input||typeof input!=='object'||Array.isArray(input))return null;
    const keys=Object.keys(input);
    if(actionType==='mine_rock'){
      if(keys.length!==2||keys.some(key=>!['rock_index','tool'].includes(key)))return null;
      const rockIndex=Number(input.rock_index),tool=input.tool;
      if(!Number.isSafeInteger(rockIndex)||rockIndex<0||rockIndex>64||
         !['Кирка','Улучшенная кирка','Кирка мастера'].includes(tool))return null;
      return {rock_index:rockIndex,tool};
    }
    if(actionType==='chop_tree'){
      if(keys.length!==3||keys.some(key=>!['x','y','tool'].includes(key))||input.tool!=='Топор')return null;
      const x=Number(input.x),y=Number(input.y);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>12000||y<0||y>10000)return null;
      const gx=Math.round((x-16)/32)*32+16,gy=Math.round((y-16)/32)*32+16;
      if(Math.abs(x-gx)>1||Math.abs(y-gy)>1)return null;
      return {x:gx,y:gy,tool:'Топор'};
    }
    let allowed=[];
    if(actionType==='place_structure')allowed=['type','x','y'];
    else if(actionType==='farm_plant')allowed=['x','y','crop_id'];
    else if(['farm_water','farm_compost','farm_fertilize','farm_harvest'].includes(actionType))allowed=['x','y'];
    else return null;
    if(keys.some(key=>!allowed.includes(key))||keys.length!==allowed.length)return null;
    const x=Number(input.x),y=Number(input.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>12000||y<0||y>10000)return null;
    const gx=Math.round((x-16)/32)*32+16,gy=Math.round((y-16)/32)*32+16;
    if(Math.abs(x-gx)>1||Math.abs(y-gy)>1)return null;
    if(actionType==='place_structure'){
      const types=['furnace','house','torch','coal','storage','farmplot'];
      if(!types.includes(input.type))return null;
      return {type:input.type,x:gx,y:gy};
    }
    if(actionType==='farm_plant'){
      const crops=['wheat','carrot','potato','tomato','corn','pumpkin','strawberry'];
      if(!crops.includes(input.crop_id))return null;
      return {x:gx,y:gy,crop_id:input.crop_id};
    }
    return {x:gx,y:gy};
  }

  function sanitizeWorldClock(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const minute=input.minute_total,nights=input.survived_nights;
    if(typeof minute!=='number'||!Number.isFinite(minute)||minute<0||minute>100000000)return null;
    if(typeof nights!=='number'||!Number.isSafeInteger(nights)||nights<0||nights>1000000)return null;
    if(typeof input.blood_moon_active!=='boolean')return null;
    return {minute_total:Math.round(minute*1000)/1000,survived_nights:nights,blood_moon_active:input.blood_moon_active};
  }
  const SHARED_WORLD_FIELDS=Object.freeze(["clearedSnowTiles","snowShovelHits","worldEarlyMonsters","mineLevel","houseLevel","dungeonRoom","dungeonClearedRooms","dungeonChestOpened","dungeonEnemyHp","biomeBosses","caveBossDefeated","caveBossHp","caveChestOpened","treasureChests","mineTileX","mineTileY","mineRocks","treeChops","felledTrees","tradeEntranceX","tradeEntranceY","furnaceCrafted","placedStructures","lootDrops","adventureQuestProgress","farmCrops","discovered","exploredCells","wolfBossActive","wolfBossHp","wolfBossX","wolfBossY","wolfBossKeyDropped","wolfCageOpen","wolfDogCaged","wolfBossDefeated","wolfCompanionUnlocked","wolfCompanionHp","wolfCompanionRevivals","wolfCompanionOffsetX","wolfCompanionOffsetY","dogBehavior","villageQuestStage","blacksmithQuestStage","explorerQuestStage","npcQuestState","villageReputation","lastVillageRaidDay"]);
  function sanitizeSharedWorldSnapshot(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const output={};
    for(const key of SHARED_WORLD_FIELDS){
      if(Object.prototype.hasOwnProperty.call(input,key))output[key]=input[key];
    }
    try{
      const serialized=JSON.stringify(output);
      if(serialized.length>60000)return null;
      return JSON.parse(serialized);
    }catch(_){return null;}
  }
  return Object.freeze({MAX_PLAYERS,ROOM_STATES,normalizeInviteCode,isValidInviteCode,canJoinRoom,canResumeRoom,canChangePvp,makeRoomTopic,shouldPauseOnOwnerDeparture,sanitizePlayerInput,sanitizePlayerPosition,sanitizeWorldAction,sanitizeWorldClock,sanitizeSharedWorldSnapshot,SHARED_WORLD_FIELDS});
});
