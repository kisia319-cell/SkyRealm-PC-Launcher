(()=>{"use strict";
const URL="https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-prime";
const SUPABASE_URL="https://jaaguprbfrzrcwuusher.supabase.co";
const KEY="sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL";
const AUTH_URL=URL.replace("skyrealm-prime","skyrealm-auth");
let bridgeToken="",realtimeClient=null,realtimeChannel=null;
let queueTimer=0,transportTimer=0,realtimeTimer=0,heartbeatTimer=0,seq=0,pingSamples=[];
function token(){return localStorage.getItem("skyrealm_token")||sessionStorage.getItem("skyrealm_token")||bridgeToken||"";}
async function init(){if(token())return true;try{const s=await window.pywebview?.api?.get_auth_session?.();bridgeToken=String(s?.token||"");}catch(_){}return !!token();}
function userId(){try{return JSON.parse(atob(token().split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).sub||"";}catch(_){return "";}}
async function call(route,method="GET",body=null,params={}){
 const access=token()||(await init(),token());if(!access)throw new Error("Сначала войди в аккаунт SkyRealm.");
 const query=new URLSearchParams({route,...params});const response=await fetch(URL+"?"+query.toString(),{method,headers:{apikey:KEY,Authorization:"Bearer "+access,"Content-Type":"application/json"},body:body===null?undefined:JSON.stringify(body),cache:"no-store"});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Ошибка онлайн-сервера ("+response.status+").");return data;
}
const SOCIAL_URL=URL.replace("skyrealm-prime","skyrealm-social");
async function social(route,method="GET",body=null,params={}){
 const access=token()||(await init(),token());if(!access)throw new Error("Сначала войди в аккаунт SkyRealm.");
 const query=new URLSearchParams({route,...params});const response=await fetch(SOCIAL_URL+"?"+query.toString(),{method,headers:{apikey:KEY,Authorization:"Bearer "+access,"Content-Type":"application/json"},body:body===null?undefined:JSON.stringify(body),cache:"no-store"});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Ошибка друзей ("+response.status+").");return data;
}
async function authCall(route,body){const r=await fetch(AUTH_URL+"?route="+encodeURIComponent(route),{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Ошибка аккаунта ("+r.status+").");return d;}
function stopQueue(){if(queueTimer)clearInterval(queueTimer);queueTimer=0;}
function stopTransport(){
 if(transportTimer)clearInterval(transportTimer);transportTimer=0;
 if(realtimeTimer)clearInterval(realtimeTimer);realtimeTimer=0;
 if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=0;
 const old=realtimeChannel;realtimeChannel=null;
 if(old&&realtimeClient)realtimeClient.removeChannel(old).catch(()=>{});
 window.PrimeOnlineTransport="OFFLINE";
}
function loadRealtimeSdk(){
 if(window.supabase?.createClient)return Promise.resolve(true);
 if(window.__primeRealtimeSdkPromise)return window.__primeRealtimeSdkPromise;
 if(typeof document==="undefined")return Promise.resolve(false);
 window.__primeRealtimeSdkPromise=new Promise(resolve=>{
  const script=document.createElement("script");let settled=false;
  const finish=ok=>{if(settled)return;settled=true;resolve(!!ok);};
  script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0";
  script.async=true;script.onload=()=>finish(!!window.supabase?.createClient);script.onerror=()=>finish(false);
  document.head.appendChild(script);setTimeout(()=>finish(!!window.supabase?.createClient),9000);
 });
 return window.__primeRealtimeSdkPromise;
}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function makeDelta(previous,next){
 if(!isObject(previous)||!isObject(next))return next;
 const patch={};
 for(const key of Object.keys(previous))if(!Object.prototype.hasOwnProperty.call(next,key))patch[key]={__primeDelete:true};
 for(const key of Object.keys(next)){
  if(!Object.prototype.hasOwnProperty.call(previous,key)){patch[key]=next[key];continue;}
  const a=previous[key],b=next[key];
  if(isObject(a)&&isObject(b)){const child=makeDelta(a,b);if(Object.keys(child).length)patch[key]=child;}
  else if(JSON.stringify(a)!==JSON.stringify(b))patch[key]=b;
 }
 return patch;
}
function applyDelta(previous,patch){
 if(!isObject(patch))return patch;
 const next=isObject(previous)?{...previous}:{};
 for(const key of Object.keys(patch)){
  const value=patch[key];
  if(isObject(value)&&value.__primeDelete===true)delete next[key];
  else if(isObject(value)&&isObject(next[key]))next[key]=applyDelta(next[key],value);
  else next[key]=value;
 }
 return next;
}
function recordPing(ms){
 pingSamples.push(Math.max(0,Math.round(ms)));if(pingSamples.length>7)pingSamples.shift();
 const sorted=[...pingSamples].sort((a,b)=>a-b);
 window.PrimeOnlinePing=sorted[Math.floor(sorted.length/2)]||0;
 let jitter=0;for(let i=1;i<pingSamples.length;i++)jitter+=Math.abs(pingSamples[i]-pingSamples[i-1]);
 window.PrimeOnlineJitter=pingSamples.length>1?Math.round(jitter/(pingSamples.length-1)):0;
}
window.PrimeOnline={
 hasSession:()=>!!token(),init,userId,
 register:(username,email,password)=>authCall("/api/auth/register",{username,email,password}),
 verify:(email,code)=>authCall("/api/auth/verify",{email,code}).then(d=>{localStorage.setItem("skyrealm_token",d.access_token);if(d.refresh_token)localStorage.setItem("skyrealm_refresh_token",d.refresh_token);bridgeToken=d.access_token;return d;}),
 login:(identifier,password)=>authCall("/api/auth/login",{identifier,password}).then(d=>{localStorage.setItem("skyrealm_token",d.access_token);if(d.refresh_token)localStorage.setItem("skyrealm_refresh_token",d.refresh_token);bridgeToken=d.access_token;return d;}),
 queue:rating=>call("/api/prime/queue","POST",{rating}),
 cancelQueue:()=>call("/api/prime/queue","DELETE"),
 status:matchId=>call("/api/prime/match","GET",null,{match_id:matchId}),
 leaderboard:()=>call("/api/prime/leaderboard"),
 stats:()=>call("/api/prime/stats"),
 profile:()=>call("/api/prime/profile"),
 updateProfile:patch=>call("/api/prime/profile","PATCH",patch),
 startTransport(config){
  stopTransport();seq=0;pingSamples=[];window.PrimeOnlinePing=0;window.PrimeOnlineJitter=0;window.PrimeOnlinePacketLoss=0;
  let lastReceived=0,lastGuestSeq=0,busy=false,rtBusy=false,heartbeatBusy=false,wsReady=false;
  let lastHostState=null,lastHostSeq=0,forceFull=true,lastPingAt=0,pingNonce=0,lastGuestInputJson="",lastGuestInputAt=0;
  const pendingPings=new Map(),role=config.role,matchId=config.match_id,uid=userId();
  window.PrimeOnlineTransport="HTTP";
  const fallbackTick=async()=>{
   if(busy)return;busy=true;const started=performance.now();
   try{
    if(role==="host"){
     if(window.PrimeGameFinished?.())return;
     const snap=window.PrimeGameSnapshot?.();if(!snap)return;
     const response=await call("/api/prime/state","POST",{match_id:matchId,seq:++seq,state:snap});
     if(response.status&&response.status!=="active"){window.PrimeOnlineFinished?.(response);return;}
     if(response.guest_seq>lastReceived){lastReceived=response.guest_seq;window.PrimeApplyRemoteInput?.(response.guest_input||{});}
    }else{
     const current=window.PrimeReadInput?.()||{};
     const state=await call("/api/prime/exchange","POST",{match_id:matchId,seq:++seq,input:current});
     if(state.status==="active"&&state.host_seq>lastReceived&&state.host_state){lastReceived=state.host_seq;window.PrimeApplyHostState?.(state.host_state);}
     if(state.status!=="active"&&state.result)window.PrimeOnlineFinished?.(state);
    }
   }catch(e){window.PrimeOnlineError?.(e.message);}
   finally{recordPing(performance.now()-started);busy=false;}
  };
  const startPolling=()=>{if(!transportTimer&&!wsReady){window.PrimeOnlineTransport="HTTP fallback";transportTimer=setInterval(fallbackTick,role==="host"?160:140);}};
  const stopPolling=()=>{if(transportTimer)clearInterval(transportTimer);transportTimer=0;};
  startPolling();
  (async()=>{
   const loaded=await loadRealtimeSdk();if(!loaded)return;
   const access=token()||(await init(),token());if(!access)return;
   if(!realtimeClient)realtimeClient=window.supabase.createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:30}}});
   realtimeClient.realtime.setAuth(access);
   const channel=realtimeClient.channel("prime:"+matchId,{config:{private:true,broadcast:{self:false,ack:false}}});
   realtimeChannel=channel;
   const send=async(event,payload)=>{if(!realtimeChannel||!wsReady)return;return channel.send({type:"broadcast",event,payload});};
   channel.on("broadcast",{event:"host_state"},message=>{
    if(role!=="guest")return;const p=message?.payload;if(!p||!Number.isFinite(Number(p.seq))||Number(p.seq)<=lastReceived)return;
    if(p.full===true&&p.state){if(lastReceived&&Number(p.seq)>lastReceived+1)window.PrimeOnlinePacketLoss=(window.PrimeOnlinePacketLoss||0)+Number(p.seq)-lastReceived-1;lastHostState=p.state;lastReceived=Number(p.seq);window.PrimeApplyHostState?.(lastHostState);return;}
    if(p.full===false&&p.base_seq===lastReceived&&lastHostState&&p.patch){lastHostState=applyDelta(lastHostState,p.patch);lastReceived=Number(p.seq);window.PrimeApplyHostState?.(lastHostState);return;}
    window.PrimeOnlinePacketLoss=(window.PrimeOnlinePacketLoss||0)+1;send("request_full",{from:uid});
   });
   channel.on("broadcast",{event:"guest_input"},message=>{
    if(role!=="host")return;const p=message?.payload;if(!p||!Number.isFinite(Number(p.seq))||Number(p.seq)<=lastGuestSeq)return;
    if(lastGuestSeq&&Number(p.seq)>lastGuestSeq+1)window.PrimeOnlinePacketLoss=(window.PrimeOnlinePacketLoss||0)+Number(p.seq)-lastGuestSeq-1;
    lastGuestSeq=Number(p.seq);window.PrimeApplyRemoteInput?.(p.input||{});
   });
   channel.on("broadcast",{event:"request_full"},message=>{if(role==="host"&&message?.payload?.from!==uid)forceFull=true;});
   channel.on("broadcast",{event:"ping"},message=>{
    const p=message?.payload;if(!p||p.from===uid||!p.nonce)return;
    send("pong",{to:p.from,from:uid,nonce:p.nonce});
   });
   channel.on("broadcast",{event:"pong"},message=>{
    const p=message?.payload;if(!p||p.to!==uid||!pendingPings.has(p.nonce))return;
    const started=pendingPings.get(p.nonce);pendingPings.delete(p.nonce);recordPing(performance.now()-started);
   });
   channel.subscribe(status=>{
    if(status==="SUBSCRIBED"){
     wsReady=true;stopPolling();window.PrimeOnlineTransport="WebSocket · global Realtime";
     lastReceived=0;lastHostState=null;lastHostSeq=0;forceFull=true;
     if(realtimeTimer)clearInterval(realtimeTimer);
     realtimeTimer=setInterval(async()=>{
      if(!wsReady||rtBusy)return;rtBusy=true;
      try{
       const now=performance.now();
       if(now-lastPingAt>3000){lastPingAt=now;const nonce=++pingNonce;pendingPings.set(nonce,now);while(pendingPings.size>4)pendingPings.delete(pendingPings.keys().next().value);await send("ping",{from:uid,nonce});}
       if(role==="host"){
        if(window.PrimeGameFinished?.())return;
        const snap=window.PrimeGameSnapshot?.();if(!snap)return;
        const nextSeq=seq+1,fullText=JSON.stringify(snap);
        const patch=lastHostState?makeDelta(lastHostState,snap):null,patchText=patch?JSON.stringify(patch):"";
        const full=forceFull||!lastHostState||nextSeq%20===0||!patch||patchText.length>=fullText.length*.82;
        if(!full&&!Object.keys(patch).length)return;
        const packet=full?{seq:nextSeq,full:true,state:snap}:{seq:nextSeq,full:false,base_seq:lastHostSeq,patch};
        const sent=await send("host_state",packet);if(sent!=="ok")throw new Error("Realtime state send failed: "+sent);
        seq=nextSeq;lastHostState=snap;lastHostSeq=nextSeq;forceFull=false;
       }else{
        const input=window.PrimeReadInput?.()||{},inputJson=JSON.stringify(input);
        if(inputJson===lastGuestInputJson&&now-lastGuestInputAt<100)return;
        lastGuestInputJson=inputJson;lastGuestInputAt=now;
        const nextSeq=++seq,sent=await send("guest_input",{seq:nextSeq,input});if(sent!=="ok")throw new Error("Realtime input send failed: "+sent);
       }
      }catch(e){
       window.PrimeOnlineError?.(e.message);wsReady=false;window.PrimeOnlineTransport="HTTP fallback";
       if(realtimeTimer)clearInterval(realtimeTimer);realtimeTimer=0;startPolling();
      }finally{rtBusy=false;}
     },50);
     if(heartbeatTimer)clearInterval(heartbeatTimer);
     heartbeatTimer=setInterval(async()=>{
      if(heartbeatBusy)return;heartbeatBusy=true;
      try{const state=await call("/api/prime/match","GET",null,{match_id:matchId});if(state.status&&state.status!=="active")window.PrimeOnlineFinished?.(state);}
      catch(e){window.PrimeOnlineError?.(e.message);}
      finally{heartbeatBusy=false;}
     },10000);
    }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
     wsReady=false;window.PrimeOnlineTransport="HTTP fallback";
     if(realtimeTimer)clearInterval(realtimeTimer);realtimeTimer=0;startPolling();
    }
   });
  })().catch(e=>{window.PrimeOnlineError?.(e.message);startPolling();});
 },
 friends:()=>social("/api/social/friends"),
 searchPlayers:q=>social("/api/social/search","GET",null,{q}),
 addFriend:username=>social("/api/social/request","POST",{username}),
 respondFriend:(id,decision)=>social("/api/social/respond","POST",{id,decision}),
 lobby:()=>call("/api/prime/lobby"),
 createLobby:()=>call("/api/prime/lobby","POST",{}),
 inviteLobbyFriend:(lobby_id,friend_id)=>call("/api/prime/lobby/invite","POST",{lobby_id,friend_id}),
 respondLobbyInvite:(invite_id,decision)=>call("/api/prime/lobby/respond","POST",{invite_id,decision}),
 startLobby:lobby_id=>call("/api/prime/lobby/start","POST",{lobby_id}),
 leaveLobby:lobby_id=>call("/api/prime/lobby/leave","POST",{lobby_id}),
 stopQueue,stopTransport,
 finish:(matchId,winnerId,reason)=>call("/api/prime/finish","POST",{match_id:matchId,winner_id:winnerId,reason}),
 leave:matchId=>call("/api/prime/leave","POST",{match_id:matchId})
};
})();