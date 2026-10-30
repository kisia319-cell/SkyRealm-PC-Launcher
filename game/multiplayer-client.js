(() => {
'use strict';
const root=typeof globalThis!=='undefined'?globalThis:window;
const API_URL='https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-coop';
const PUBLIC_KEY='sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL';
let token='',tokenPromise=null,userId='',currentRoom=null,clockReceivedAt=0,clockWriteInFlight=false,snapshotVersion=0;
async function getToken(){
  if(token)return token;
  if(tokenPromise)return tokenPromise;
  tokenPromise=(async()=>{
    // Prefer the fresh launcher session passed through the desktop bridge.
    try{if(window.pywebview?.api?.get_auth_session){const session=await window.pywebview.api.get_auth_session();if(typeof session?.token==='string'&&session.token){token=session.token;return token;}}}catch(_){}
    try{token=sessionStorage.getItem('skyrealm_token')||localStorage.getItem('skyrealm_token')||'';}catch(_){}
    if(token)return token;
    if(!window.pywebview?.api?.get_auth_session){
      await Promise.race([
        new Promise(resolve=>window.addEventListener('pywebviewready',resolve,{once:true})),
        new Promise(resolve=>setTimeout(resolve,2500))
      ]);
      try{if(window.pywebview?.api?.get_auth_session){const session=await window.pywebview.api.get_auth_session();if(typeof session?.token==='string')token=session.token;}}catch(_){}
    }
    return token;
  })();
  try{return await tokenPromise;}finally{tokenPromise=null;}
}
async function request(route,method='GET',body=null){
  const accessToken=await getToken();
  if(!accessToken)throw new Error('Сначала войди в аккаунт SkyRealm в лаунчере.');
  const endpoint=new URL(API_URL);endpoint.searchParams.set('route',route);
  let response;
  try{response=await fetch(endpoint.toString(),{method,headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});}
  catch(_){throw new Error('Не удалось связаться с сервером кооператива. Проверь интернет.');}
  let data={};try{data=await response.json();}catch(_){}
  if(!response.ok){const error=new Error(data?.error?.message||'Ошибка кооператива ('+response.status+').');error.code=data?.error?.code||'';throw error;}
  if(data.user_id)userId=data.user_id;
  return data;
}

let realtimeClient=null,realtimeChannel=null,realtimeRoomId='',realtimeSdkPromise=null;
const remotePlayers=new Map();
const incomingPvpHits=[];
const safePosition=root.SkyRealmMultiplayerCore?.sanitizePlayerPosition;
const safeClock=root.SkyRealmMultiplayerCore?.sanitizeWorldClock;
const safeSharedSnapshot=root.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot;
const safeWorldAction=root.SkyRealmMultiplayerCore?.sanitizeWorldAction;
function loadRealtimeSdk(){
  if(window.supabase?.createClient)return Promise.resolve(window.supabase);
  if(realtimeSdkPromise)return realtimeSdkPromise;
  realtimeSdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
    script.async=true;
    script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Supabase Realtime SDK did not initialise.'));
    script.onerror=()=>reject(new Error('Не удалось загрузить модуль сетевого присутствия.'));
    document.head.appendChild(script);
  });
  return realtimeSdkPromise;
}
async function disconnectRealtime(){
  const oldClient=realtimeClient,oldChannel=realtimeChannel;
  realtimeClient=null;realtimeChannel=null;realtimeRoomId='';
  remotePlayers.clear();incomingPvpHits.length=0;
  if(oldClient&&oldChannel){try{await oldClient.removeChannel(oldChannel);}catch(_){}}
}
async function connectRealtime(room,handlers={}){
  if(!room?.id)throw new Error('Room ID is required.');
  if(realtimeRoomId===room.id&&realtimeChannel)return {connected:true};
  await disconnectRealtime();
  const accessToken=await getToken();
  if(!accessToken)throw new Error('Нет авторизованной сессии.');
  const sdk=await loadRealtimeSdk();
  const supabaseClient=sdk.createClient('https://jaaguprbfrzrcwuusher.supabase.co',PUBLIC_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    realtime:{params:{log_level:'error'}}
  });
  await supabaseClient.realtime.setAuth(accessToken);
  const channel=supabaseClient.channel('skyrealm:room:'+room.id,{
    config:{private:true,presence:{key:userId},broadcast:{ack:true,self:false}}
  });
  channel.on('presence',{event:'sync'},()=>handlers.onPresence?.(channel.presenceState()));
  channel.on('presence',{event:'join'},payload=>handlers.onPresenceChange?.('join',payload));
  channel.on('presence',{event:'leave'},payload=>handlers.onPresenceChange?.('leave',payload));
  channel.on('broadcast',{event:'room-event'},envelope=>{
    const payload=envelope?.payload||envelope;
    if(payload?.kind==='player-position'&&typeof safePosition==='function'){
      const position=safePosition(payload);
      if(position&&position.user_id!==userId){
        remotePlayers.set(position.user_id,{...position,room_id:room.id,received_at:Date.now()});
      }
    }else if(payload?.kind==='player-hit'){
      const attacker=typeof payload.attacker_user_id==='string'?payload.attacker_user_id:'';
      const target=typeof payload.target_user_id==='string'?payload.target_user_id:'';
      const damage=Number(payload.damage);
      if(attacker&&attacker!==userId&&target===userId&&Number.isSafeInteger(damage)&&damage>=1&&damage<=80){
        incomingPvpHits.push({attacker_user_id:attacker,damage,received_at:Date.now()});
        if(incomingPvpHits.length>16)incomingPvpHits.splice(0,incomingPvpHits.length-16);
      }
    }
    handlers.onBroadcast?.(envelope);
  });
  let joined=false;
  try{
    joined=await new Promise((resolve,reject)=>{
      let settled=false;
      channel.subscribe(async status=>{
        handlers.onStatus?.(status);
        if(status==='SUBSCRIBED'){
          try{
            await channel.track({user_id:userId,online_at:new Date().toISOString()});
            if(!settled){settled=true;resolve(true);}
          }catch(error){if(!settled){settled=true;reject(error);}}
        }else if((status==='CHANNEL_ERROR'||status==='TIMED_OUT')&&!settled){
          settled=true;reject(new Error('Не удалось подключиться к приватному каналу комнаты ('+status+').'));
        }
      });
    });
    if(joined){realtimeClient=supabaseClient;realtimeChannel=channel;realtimeRoomId=room.id;}
    else await supabaseClient.removeChannel(channel);
    if(joined){
      for(const [id,player] of remotePlayers){if(player.room_id!==room.id)remotePlayers.delete(id);}
    }
    return {connected:!!joined};
  }catch(error){
    try{await supabaseClient.removeChannel(channel);}catch(_){}
    throw error;
  }
}

window.SkyRealmCoopClient=Object.freeze({
  get userId(){return userId;},
  get isRoomOwner(){return !!currentRoom&&currentRoom.owner_id===userId;},
  connectRealtime,
  disconnectRealtime,
  async sendPosition(position){
    if(!realtimeChannel||!userId)return false;
    const safe=typeof safePosition==='function'?safePosition({...position,user_id:userId}):null;
    if(!safe)return false;
    try{
      const status=await realtimeChannel.send({type:'broadcast',event:'room-event',payload:{kind:'player-position',...safe}});
      return status==='ok';
    }catch(_){return false;}
  },
  getRemotePlayers(){
    const now=Date.now(),result=[];
    for(const [id,player] of remotePlayers){
      if(now-player.received_at>6500){remotePlayers.delete(id);continue;}
      result.push({...player});
    }
    return result;
  },
  async sendPvpHit(targetUserId,damage){
    if(!currentRoom||currentRoom.status!=='running'||currentRoom.pvp_enabled!==true||!realtimeChannel||!userId)return false;
    if(typeof targetUserId!=='string'||!targetUserId||targetUserId===userId)return false;
    const safeDamage=Math.max(1,Math.min(80,Math.round(Number(damage)||0)));
    try{
      const status=await realtimeChannel.send({type:'broadcast',event:'room-event',payload:{
        kind:'player-hit',attacker_user_id:userId,target_user_id:targetUserId,damage:safeDamage
      }});
      return status==='ok';
    }catch(_){return false;}
  },
  drainPvpHits(){return incomingPvpHits.splice(0,incomingPvpHits.length);},
  getRoomState(){return currentRoom?{id:currentRoom.id,status:currentRoom.status,owner_id:currentRoom.owner_id,paused_from_status:currentRoom.paused_from_status||null,pvp_enabled:currentRoom.pvp_enabled===true}:null;},
  getWorldSession(){if(!currentRoom||currentRoom.status!=='running')return null;return {id:currentRoom.id,world_difficulty:currentRoom.world_difficulty||'medium'};},
  getSharedDeathSequence(){return Number(currentRoom?.world_death_sequence)||0;},
  getSharedDeathEvent(){
    if(!currentRoom||!Number(currentRoom.world_death_sequence))return null;
    return {sequence:Number(currentRoom.world_death_sequence),by_user_id:currentRoom.world_death_by||null,
      occurred_at:currentRoom.world_death_at||null};
  },
  async reportSharedDeath(){
    if(!currentRoom||currentRoom.status!=='running')throw new Error('Общая сессия не запущена.');
    const data=await request('/api/coop/death','POST',{room_id:currentRoom.id});
    if(data.death&&currentRoom&&currentRoom.id===data.death.room_id){
      currentRoom.world_death_sequence=data.death.sequence;
      currentRoom.world_death_by=data.death.by_user_id;
      currentRoom.world_death_at=data.death.occurred_at;
    }
    return data.death;
  },
  getWorldClock(){
    if(!currentRoom||!Number.isFinite(Number(currentRoom.world_clock_minute)))return null;
    return {minute_total:Number(currentRoom.world_clock_minute),survived_nights:Number(currentRoom.world_survived_nights)||0,
      blood_moon_active:currentRoom.world_blood_moon_active===true,received_at:clockReceivedAt};
  },
  async setWorldClock(state){
    if(!this.isRoomOwner||!currentRoom||clockWriteInFlight)return false;
    const safe=typeof safeClock==='function'?safeClock(state):null;
    if(!safe)return false;
    clockWriteInFlight=true;
    try{
      const data=await request('/api/coop/clock','POST',{room_id:currentRoom.id,...safe});
      if(currentRoom&&currentRoom.id===data.clock.room_id){
        currentRoom.world_clock_minute=data.clock.minute_total;
        currentRoom.world_survived_nights=data.clock.survived_nights;
        currentRoom.world_blood_moon_active=data.clock.blood_moon_active;
        currentRoom.world_clock_updated_at=data.clock.updated_at;
        clockReceivedAt=Date.now();
      }
      return true;
    }finally{clockWriteInFlight=false;}
  },
  async claimWorldObject(objectKind,objectId){
    if(!currentRoom?.id)throw new Error('Нет активной комнаты.');
    const data=await request('/api/coop/claim','POST',{
      room_id:currentRoom.id,object_kind:objectKind,object_id:objectId
    });
    return data.claim||null;
  },
  async enqueueWorldAction(actionType,payload,requestedActionId=null){
    if(!currentRoom?.id||currentRoom.status!=='running')throw new Error('Комната не запущена.');
    const safe=typeof safeWorldAction==='function'?safeWorldAction(actionType,payload):null;
    if(!safe)throw new Error('Недопустимое действие общего мира.');
    const actionId=requestedActionId||window.crypto?.randomUUID?.();
    if(!actionId)throw new Error('Для отправки действия требуется безопасный генератор случайных кодов.');
    const data=await request('/api/coop/actions/enqueue','POST',{room_id:currentRoom.id,action_id:actionId,action_type:actionType,payload:safe});
    return data.action||null;
  },
  async getPendingWorldActions(limit=25){
    if(!this.isRoomOwner||!currentRoom?.id||currentRoom.status!=='running')return [];
    const data=await request('/api/coop/actions/pending','POST',{room_id:currentRoom.id,limit});
    return Array.isArray(data.actions)?data.actions:[];
  },
  async getWorldActionStatus(actionId){
    if(!currentRoom?.id)throw new Error('Нет активной комнаты.');
    const data=await request('/api/coop/actions/status','POST',{room_id:currentRoom.id,action_id:actionId});
    return data.action||null;
  },
  async commitWorldAction(actionId,payload){
    if(!this.isRoomOwner||!currentRoom||currentRoom.status!=='running')return false;
    const safe=typeof safeSharedSnapshot==='function'?safeSharedSnapshot(payload):null;
    if(!safe||!Object.keys(safe).length)return false;
    const data=await request('/api/coop/actions/commit','POST',{room_id:currentRoom.id,action_id:actionId,expected_version:snapshotVersion,payload:safe});
    if(data.result&&currentRoom)snapshotVersion=Number(data.result.version)||snapshotVersion;
    return data.result||false;
  },
  async commitFarmAction(actionId,payload,result={}){
    if(!this.isRoomOwner||!currentRoom||currentRoom.status!=='running')return false;
    const safe=typeof safeSharedSnapshot==='function'?safeSharedSnapshot(payload):null;
    if(!safe||!Object.keys(safe).length)return false;
    const data=await request('/api/coop/actions/commit-farm','POST',{
      room_id:currentRoom.id,action_id:actionId,expected_version:snapshotVersion,payload:safe,result
    });
    if(data.result&&currentRoom)snapshotVersion=Number(data.result.version)||snapshotVersion;
    return data.result||false;
  },
  async commitMineAction(actionId,payload,result={}){
    if(!this.isRoomOwner||!currentRoom||currentRoom.status!=='running')return false;
    const safe=typeof safeSharedSnapshot==='function'?safeSharedSnapshot(payload):null;
    if(!safe||!Object.keys(safe).length)return false;
    const data=await request('/api/coop/actions/commit-mine','POST',{
      room_id:currentRoom.id,action_id:actionId,expected_version:snapshotVersion,payload:safe,result
    });
    if(data.result&&currentRoom)snapshotVersion=Number(data.result.version)||snapshotVersion;
    return data.result||false;
  },
  async commitTreeAction(actionId,payload,result={}){
    if(!this.isRoomOwner||!currentRoom||currentRoom.status!=='running')return false;
    const safe=typeof safeSharedSnapshot==='function'?safeSharedSnapshot(payload):null;
    if(!safe||!Object.keys(safe).length)return false;
    const data=await request('/api/coop/actions/commit-tree','POST',{
      room_id:currentRoom.id,action_id:actionId,expected_version:snapshotVersion,payload:safe,result
    });
    if(data.result&&currentRoom)snapshotVersion=Number(data.result.version)||snapshotVersion;
    return data.result||false;
  },
  async rejectWorldAction(actionId,reason='invalid'){
    if(!this.isRoomOwner||!currentRoom?.id)return false;
    const data=await request('/api/coop/actions/reject','POST',{room_id:currentRoom.id,action_id:actionId,reason:String(reason).slice(0,120)});
    return data.result||false;
  },
  async getWorldSnapshot(){
    if(!currentRoom?.id)throw new Error('Нет активной комнаты.');
    const data=await request('/api/coop/snapshot/get','POST',{room_id:currentRoom.id});
    const snapshot=data.snapshot||null;
    if(snapshot&&currentRoom?.id===snapshot.room_id)snapshotVersion=Number(snapshot.version)||0;
    return snapshot;
  },
  async saveWorldSnapshot(payload){
    if(!this.isRoomOwner||!currentRoom||currentRoom.status!=='running')return false;
    const safe=typeof safeSharedSnapshot==='function'?safeSharedSnapshot(payload):null;
    if(!safe||!Object.keys(safe).length)return false;
    const data=await request('/api/coop/snapshot/save','POST',{
      room_id:currentRoom.id,expected_version:snapshotVersion,payload:safe
    });
    if(data.snapshot&&currentRoom)snapshotVersion=Number(data.snapshot.version)||snapshotVersion;
    return data.snapshot||false;
  },
  async current(){const previousRoomId=currentRoom?.id||'';const data=await request('/api/coop/current');currentRoom=data.room||null;if(previousRoomId!==(currentRoom?.id||''))snapshotVersion=0;clockReceivedAt=Date.now();return currentRoom;},
  async create(difficulty='medium'){const data=await request('/api/coop/create','POST',{world_difficulty:difficulty});currentRoom=data.room||null;snapshotVersion=0;return {room:currentRoom,inviteCode:data.invite_code};},
  async join(code){const data=await request('/api/coop/join','POST',{invite_code:code});currentRoom=data.room||null;snapshotVersion=0;return currentRoom;},
  async start(roomId){const data=await request('/api/coop/start','POST',{room_id:roomId});currentRoom={...(currentRoom||{}),...(data.room||{})};return currentRoom;},
  async leave(roomId){const data=await request('/api/coop/leave','POST',{room_id:roomId});currentRoom=null;snapshotVersion=0;return data;},
  async resume(roomId){const data=await request('/api/coop/resume','POST',{room_id:roomId});currentRoom={...(currentRoom||{}),...(data.room||{})};return data;},
  async setPvp(roomId,enabled){const data=await request('/api/coop/pvp','POST',{room_id:roomId,enabled});currentRoom={...(currentRoom||{}),...(data.room||{})};return data;},
  async heartbeat(roomId){return request('/api/coop/heartbeat','POST',{room_id:roomId});},
  async recoverOwner(roomId){return request('/api/coop/recover-owner','POST',{room_id:roomId});}
});
})();