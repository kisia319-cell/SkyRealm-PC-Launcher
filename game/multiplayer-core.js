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
    const modes=['surface','trade'];
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
  return Object.freeze({MAX_PLAYERS,ROOM_STATES,normalizeInviteCode,isValidInviteCode,canJoinRoom,canResumeRoom,canChangePvp,makeRoomTopic,shouldPauseOnOwnerDeparture,sanitizePlayerInput,sanitizePlayerPosition});
});
