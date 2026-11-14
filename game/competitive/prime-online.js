// Prime online transport: global Realtime WebSocket with safe HTTP polling fallback.
(()=>{"use strict";
const URL="https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-prime";
const SUPABASE_URL="https://jaaguprbfrzrcwuusher.supabase.co";
const KEY="sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL";
const AUTH_URL=URL.replace("skyrealm-prime","skyrealm-auth");
let bridgeToken="",realtimeClient=null,realtimeChannel=null,peerConnection=null,peerDataChannel=null;
let queueTimer=0,transportTimer=0,realtimeTimer=0,heartbeatTimer=0,peerStatsTimer=0,peerReadyTimer=0,seq=0,pingSamples=[],relayPingSamples=[];
const REGION_KEY="primeLauncher.region.v1";
function getRegion(){try{const v=localStorage.getItem(REGION_KEY);return ["auto","stockholm","moscow","frankfurt","warsaw","helsinki","singapore","tokyo","virginia"].includes(v)?v:"auto";}catch(_){return "auto";}}
function setRegion(value){const v=["auto","stockholm","moscow","frankfurt","warsaw","helsinki","singapore","tokyo","virginia"].includes(value)?value:"auto";try{localStorage.setItem(REGION_KEY,v);}catch(_){}return v;}
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
 if(peerStatsTimer)clearInterval(peerStatsTimer);peerStatsTimer=0;
 if(peerReadyTimer)clearInterval(peerReadyTimer);peerReadyTimer=0;
 try{peerDataChannel?.close();}catch(_){}peerDataChannel=null;
 try{peerConnection?.close();}catch(_){}peerConnection=null;
 const old=realtimeChannel;realtimeChannel=null;
 if(old&&realtimeClient)realtimeClient.removeChannel(old).catch(()=>{});
 window.PrimeOnlineTransport="OFFLINE";window.PrimeOnlinePath="—";window.PrimeOnlinePingSource="OFFLINE";window.PrimeOnlineRelayPing=0;window.PrimeOnlineRelayJitter=0;
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
function recordPing(ms,source="Realtime"){
 if(window.PrimeOnlinePingSource!==source)pingSamples=[];
 pingSamples.push(Math.max(0,Math.round(ms)));if(pingSamples.length>9)pingSamples.shift();
 const sorted=[...pingSamples].sort((a,b)=>a-b);
 window.PrimeOnlinePing=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
 let jitter=0;for(let i=1;i<pingSamples.length;i++)jitter+=Math.abs(pingSamples[i]-pingSamples[i-1]);
 window.PrimeOnlineJitter=pingSamples.length>1?Math.round(jitter/(pingSamples.length-1)):0;
 window.PrimeOnlinePingSource=source;
}
function recordRelayPing(ms){
 relayPingSamples.push(Math.max(0,Math.round(ms)));if(relayPingSamples.length>7)relayPingSamples.shift();
 const sorted=[...relayPingSamples].sort((a,b)=>a-b);
 window.PrimeOnlineRelayPing=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
 let jitter=0;for(let i=1;i<relayPingSamples.length;i++)jitter+=Math.abs(relayPingSamples[i]-relayPingSamples[i-1]);
 window.PrimeOnlineRelayJitter=relayPingSamples.length>1?Math.round(jitter/(relayPingSamples.length-1)):0;
}
window.PrimeOnline={
 hasSession:()=>!!token(),init,userId,region:getRegion,setRegion,
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
  stopTransport();seq=0;pingSamples=[];relayPingSamples=[];window.PrimeOnlinePing=0;window.PrimeOnlineJitter=0;window.PrimeOnlineRelayPing=0;window.PrimeOnlineRelayJitter=0;window.PrimeOnlinePacketLoss=0;window.PrimeOnlinePingSource="—";window.PrimeOnlinePath="Подключение";
  let lastReceived=0,lastGuestSeq=0,busy=false,rtBusy=false,heartbeatBusy=false,wsReady=false;
  let lastHostState=null,lastHostSeq=0,forceFull=true,lastPingAt=0,lastRelayPingAt=0,pingNonce=0,relayPingNonce=0,lastGuestInputJson="",lastGuestInputAt=0,lastHostSendAt=0,offerStarted=false,lastSendPath="Realtime";
  const pendingPings=new Map(),pendingRelayPings=new Map(),pendingCandidates=[],role=config.role,matchId=config.match_id,uid=userId();
  let channel=null;
  window.PrimeOnlineTransport="HTTP fallback";
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
   finally{recordPing(performance.now()-started,"HTTP server");busy=false;}
  };
  const startPolling=()=>{if(!transportTimer&&!wsReady){window.PrimeOnlineTransport="HTTP fallback";transportTimer=setInterval(fallbackTick,role==="host"?160:140);}};
  const stopPolling=()=>{if(transportTimer)clearInterval(transportTimer);transportTimer=0;};
  const sendRealtime=async(event,payload)=>{
   if(!channel||!wsReady)return "not-ready";
   return channel.send({type:"broadcast",event,payload});
  };
  const send=async(event,payload)=>{
   const dc=peerDataChannel;
   if(dc&&dc.readyState==="open"){
    const raw=JSON.stringify({event,payload});
    if(raw.length<48000&&dc.bufferedAmount<262144){try{dc.send(raw);lastSendPath="P2P";return "ok";}catch(_){}}
   }
   lastSendPath="Realtime";return sendRealtime(event,payload);
  };
  const handlePacket=(event,p)=>{
   if(event==="host_state"){
    if(role!=="guest"||!p||!Number.isFinite(Number(p.seq))||Number(p.seq)<=lastReceived)return;
    if(p.full===true&&p.state){if(lastReceived&&Number(p.seq)>lastReceived+1)window.PrimeOnlinePacketLoss=(window.PrimeOnlinePacketLoss||0)+Number(p.seq)-lastReceived-1;lastHostState=p.state;lastReceived=Number(p.seq);window.PrimeApplyHostState?.(lastHostState);return;}
    if(p.full===false&&p.base_seq===lastReceived&&lastHostState&&p.patch){lastHostState=applyDelta(lastHostState,p.patch);lastReceived=Number(p.seq);window.PrimeApplyHostState?.(lastHostState);return;}
    window.PrimeOnlinePacketLoss=(window.PrimeOnlinePacketLoss||0)+1;send("request_full",{from:uid});
   }else if(event==="guest_input"){
    if(role!=="host"||!p||!Number.isFinite(Number(p.seq))||Number(p.seq)<=lastGuestSeq)return;
    if(lastGuestSeq&&Number(p.seq)>lastGuestSeq+1)window.PrimeOnlinePacketLoss=(window.PrimeOnlinePacketLoss||0)+Number(p.seq)-lastGuestSeq-1;
    lastGuestSeq=Number(p.seq);window.PrimeApplyRemoteInput?.(p.input||{});
   }else if(event==="request_full"){
    if(role==="host"&&p?.from!==uid)forceFull=true;
   }else if(event==="ping"){
    if(!p||p.from===uid||!p.nonce)return;
    send("pong",{to:p.from,from:uid,nonce:p.nonce}).catch(()=>{});
   }else if(event==="pong"){
    if(!p||p.to!==uid||!pendingPings.has(p.nonce))return;
    const started=pendingPings.get(p.nonce);pendingPings.delete(p.nonce);recordPing(performance.now()-started.at,started.source);
   }else if(event==="server_ping"){
    if(!p||p.from===uid||!p.nonce)return;
    sendRealtime("server_pong",{to:p.from,from:uid,nonce:p.nonce}).catch(()=>{});
   }else if(event==="server_pong"){
    if(!p||p.to!==uid||!pendingRelayPings.has(p.nonce))return;
    const started=pendingRelayPings.get(p.nonce);pendingRelayPings.delete(p.nonce);recordRelayPing(performance.now()-started);
   }
  };
  const sendSignal=payload=>sendRealtime("webrtc_signal",{...payload,from:uid});
  const flushCandidates=async()=>{
   if(!peerConnection?.remoteDescription)return;
   while(pendingCandidates.length){const candidate=pendingCandidates.shift();try{await peerConnection.addIceCandidate(candidate);}catch(e){console.warn("[Prime P2P ICE]",e);}}
  };
  const attachDataChannel=dc=>{
   peerDataChannel=dc;
   dc.onmessage=e=>{try{const p=JSON.parse(typeof e.data==="string"?e.data:"");if(p?.event)handlePacket(p.event,p.payload);}catch(err){console.warn("[Prime P2P packet]",err);}};
   dc.onopen=()=>{
    if(peerReadyTimer)clearInterval(peerReadyTimer);peerReadyTimer=0;
    pingSamples=[];window.PrimeOnlinePing=0;window.PrimeOnlineJitter=0;window.PrimeOnlinePingSource="P2P";
    window.PrimeOnlineTransport="WebRTC P2P";window.PrimeOnlinePath="P2P · проверка маршрута";
    if(peerStatsTimer)clearInterval(peerStatsTimer);
    const inspect=async()=>{
     try{
      const pc=peerConnection;if(!pc||pc.connectionState==="closed")return;
      const stats=await pc.getStats();let pair=null;
      stats.forEach(s=>{if(s.type==="candidate-pair"&&(s.selected===true||(s.nominated===true&&s.state==="succeeded")))pair=s;});
      if(!pair){let transport=null;stats.forEach(s=>{if(s.type==="transport"&&s.selectedCandidatePairId)transport=stats.get(s.selectedCandidatePairId);});pair=transport||null;}
      if(pair){const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId),types=[local?.candidateType,remote?.candidateType];window.PrimeOnlinePath=types.every(x=>x==="host")?"LAN · локальная сеть":types.includes("relay")?"P2P · relay": "P2P · интернет";}
     }catch(_){}
    };
    inspect();peerStatsTimer=setInterval(inspect,5000);
   };
   dc.onclose=()=>{
    if(peerDataChannel===dc){peerDataChannel=null;window.PrimeOnlinePath="Серверный канал";window.PrimeOnlineTransport=wsReady?"WebSocket · global Realtime":"HTTP fallback";pingSamples=[];window.PrimeOnlinePingSource=wsReady?"Realtime":"HTTP server";}
   };
   dc.onerror=()=>{if(peerDataChannel===dc){window.PrimeOnlineTransport=wsReady?"WebSocket · global Realtime":"HTTP fallback";}};
  };
  const ensurePeer=()=>{
   if(peerConnection)return peerConnection;
   if(typeof RTCPeerConnection!=="function")return null;
   try{
    const pc=new RTCPeerConnection({iceServers:[{urls:["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}],iceCandidatePoolSize:4,iceTransportPolicy:"all"});
    peerConnection=pc;
    pc.onicecandidate=e=>{if(e.candidate)sendSignal({type:"candidate",candidate:e.candidate.toJSON?.()||e.candidate}).catch(()=>{});};
    pc.ondatachannel=e=>attachDataChannel(e.channel);
    pc.onconnectionstatechange=()=>{
     if(pc.connectionState==="failed"||pc.connectionState==="closed"){
      if(peerDataChannel){try{peerDataChannel.close();}catch(_){}}
      if(peerConnection===pc)peerConnection=null;
      window.PrimeOnlineTransport=wsReady?"WebSocket · global Realtime":"HTTP fallback";window.PrimeOnlinePath="P2P недоступен";
     }
    };
    return pc;
   }catch(e){window.PrimeOnlineError?.("P2P: "+(e?.message||e));return null;}
  };
  const startHostPeer=async()=>{
   if(role!=="host"||offerStarted||peerDataChannel?.readyState==="open")return;
   const pc=ensurePeer();if(!pc)return;
   offerStarted=true;
   const dc=pc.createDataChannel("prime-game",{ordered:false,maxRetransmits:0,protocol:"prime-fast-v1"});attachDataChannel(dc);
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);
   await sendSignal({type:"offer",description:pc.localDescription?.toJSON?.()||{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
  };
  const handleSignal=async s=>{
   if(!s||s.from===uid)return;
   if(s.type==="ready"&&role==="host"){try{await startHostPeer();}catch(e){offerStarted=false;window.PrimeOnlineError?.("P2P offer: "+e.message);}return;}
   if(s.type==="offer"&&role==="guest"){
    const pc=ensurePeer();if(!pc)return;
    await pc.setRemoteDescription(s.description);await flushCandidates();
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await sendSignal({type:"answer",description:pc.localDescription?.toJSON?.()||{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
    return;
   }
   if(s.type==="answer"&&role==="host"&&peerConnection){
    await peerConnection.setRemoteDescription(s.description);await flushCandidates();return;
   }
   if(s.type==="candidate"&&s.candidate){
    if(!peerConnection||!peerConnection.remoteDescription){pendingCandidates.push(s.candidate);return;}
    try{await peerConnection.addIceCandidate(s.candidate);}catch(e){console.warn("[Prime P2P candidate]",e);}
   }
  };
  startPolling();
  (async()=>{
   const loaded=await loadRealtimeSdk();if(!loaded)return;
   const access=token()||(await init(),token());if(!access)return;
   if(!realtimeClient)realtimeClient=window.supabase.createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:30}}});
   realtimeClient.realtime.setAuth(access);
   channel=realtimeClient.channel("prime:"+matchId,{config:{private:true,broadcast:{self:false,ack:false}}});
   realtimeChannel=channel;
   channel.on("broadcast",{event:"host_state"},message=>handlePacket("host_state",message?.payload));
   channel.on("broadcast",{event:"guest_input"},message=>handlePacket("guest_input",message?.payload));
   channel.on("broadcast",{event:"request_full"},message=>handlePacket("request_full",message?.payload));
   channel.on("broadcast",{event:"ping"},message=>handlePacket("ping",message?.payload));
   channel.on("broadcast",{event:"pong"},message=>handlePacket("pong",message?.payload));
   channel.on("broadcast",{event:"server_ping"},message=>handlePacket("server_ping",message?.payload));
   channel.on("broadcast",{event:"server_pong"},message=>handlePacket("server_pong",message?.payload));
   channel.on("broadcast",{event:"webrtc_signal"},message=>{handleSignal(message?.payload).catch(e=>window.PrimeOnlineError?.("P2P signal: "+e.message));});
   channel.subscribe(status=>{
    if(status==="SUBSCRIBED"){
     wsReady=true;stopPolling();window.PrimeOnlineTransport=peerDataChannel?.readyState==="open"?"WebRTC P2P":"WebSocket · global Realtime";
     lastReceived=0;lastHostState=null;lastHostSeq=0;forceFull=true;
     if(role==="guest"&&typeof RTCPeerConnection==="function"){
      sendSignal({type:"ready"}).catch(()=>{});
      if(peerReadyTimer)clearInterval(peerReadyTimer);
      peerReadyTimer=setInterval(()=>{if(peerDataChannel?.readyState==="open"){clearInterval(peerReadyTimer);peerReadyTimer=0;return;}sendSignal({type:"ready"}).catch(()=>{});},2500);
     }
     if(realtimeTimer)clearInterval(realtimeTimer);
     realtimeTimer=setInterval(async()=>{
      if(!wsReady||rtBusy)return;rtBusy=true;
      try{
       const now=performance.now();
       if(now-lastPingAt>2000){lastPingAt=now;const nonce=++pingNonce;pendingPings.set(nonce,{at:now,source:"pending"});while(pendingPings.size>4)pendingPings.delete(pendingPings.keys().next().value);await send("ping",{from:uid,nonce});const pending=pendingPings.get(nonce);if(pending)pending.source=lastSendPath;}
       if(peerDataChannel?.readyState==="open"&&now-lastRelayPingAt>8000){lastRelayPingAt=now;const nonce=++relayPingNonce;pendingRelayPings.set(nonce,now);while(pendingRelayPings.size>3)pendingRelayPings.delete(pendingRelayPings.keys().next().value);await sendRealtime("server_ping",{from:uid,nonce});}
       if(role==="host"){
        if(peerDataChannel?.readyState!=="open"&&now-lastHostSendAt<100)return;
        lastHostSendAt=now;
        if(window.PrimeGameFinished?.())return;
        const snap=window.PrimeGameSnapshot?.();if(!snap)return;
        const nextSeq=seq+1,fullText=JSON.stringify(snap);
        const patch=lastHostState?makeDelta(lastHostState,snap):null,patchText=patch?JSON.stringify(patch):"";
        const full=forceFull||!lastHostState||nextSeq%20===0||!patch||patchText.length>=fullText.length*.82;
        if(!full&&!Object.keys(patch).length)return;
        const packet=full?{seq:nextSeq,full:true,state:snap}:{seq:nextSeq,full:false,base_seq:lastHostSeq,patch};
        const sent=await send("host_state",packet);if(sent!=="ok")throw new Error("Realtime/P2P state send failed: "+sent);
        seq=nextSeq;lastHostState=snap;lastHostSeq=nextSeq;forceFull=false;
       }else{
        const input=window.PrimeReadInput?.()||{},inputJson=JSON.stringify(input),p2p=peerDataChannel?.readyState==="open";
        if(inputJson===lastGuestInputJson&&now-lastGuestInputAt<(p2p?350:700))return;
        if(!p2p&&inputJson!==lastGuestInputJson&&now-lastGuestInputAt<100)return;
        lastGuestInputJson=inputJson;lastGuestInputAt=now;
        const nextSeq=++seq,sent=await send("guest_input",{seq:nextSeq,input});if(sent!=="ok")throw new Error("Realtime/P2P input send failed: "+sent);
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
 createLobby:mode=>call("/api/prime/lobby","POST",{mode:mode==="bots"?"bots":"pvp"}),
 inviteLobbyFriend:(lobby_id,friend_id)=>call("/api/prime/lobby/invite","POST",{lobby_id,friend_id}),
 respondLobbyInvite:(invite_id,decision)=>call("/api/prime/lobby/respond","POST",{invite_id,decision}),
 startLobby:lobby_id=>call("/api/prime/lobby/start","POST",{lobby_id}),
 leaveLobby:lobby_id=>call("/api/prime/lobby/leave","POST",{lobby_id}),
 stopQueue,stopTransport,
 finish:(matchId,winnerId,reason,mode,outcome)=>call("/api/prime/finish","POST",{match_id:matchId,winner_id:winnerId,reason,mode,outcome}),
 leave:matchId=>call("/api/prime/leave","POST",{match_id:matchId})
};
})();