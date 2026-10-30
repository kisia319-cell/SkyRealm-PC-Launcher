(() => {
'use strict';
const API_URL='https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-coop';
const PUBLIC_KEY='sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL';
let token='',tokenPromise=null,userId='';
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
const safePosition=root.SkyRealmMultiplayerCore?.sanitizePlayerPosition;
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
  remotePlayers.clear();
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
  async current(){const data=await request('/api/coop/current');return data.room||null;},
  async create(){const data=await request('/api/coop/create','POST',{});return {room:data.room,inviteCode:data.invite_code};},
  async join(code){const data=await request('/api/coop/join','POST',{invite_code:code});return data.room;},
  async leave(roomId){return request('/api/coop/leave','POST',{room_id:roomId});},
  async resume(roomId){return request('/api/coop/resume','POST',{room_id:roomId});},
  async setPvp(roomId,enabled){return request('/api/coop/pvp','POST',{room_id:roomId,enabled});},
  async heartbeat(roomId){return request('/api/coop/heartbeat','POST',{room_id:roomId});},
  async recoverOwner(roomId){return request('/api/coop/recover-owner','POST',{room_id:roomId});}
});
})();