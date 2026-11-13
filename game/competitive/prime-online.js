(()=>{"use strict";
const URL="https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-prime";
const KEY="sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL";
const AUTH_URL=URL.replace("skyrealm-prime","skyrealm-auth");
let bridgeToken="";
function token(){return localStorage.getItem("skyrealm_token")||sessionStorage.getItem("skyrealm_token")||bridgeToken||"";}
async function init(){if(token())return true;try{const s=await window.pywebview?.api?.get_auth_session?.();bridgeToken=String(s?.token||"");}catch(_){}return !!token();}
function userId(){try{return JSON.parse(atob(token().split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).sub||"";}catch(_){return "";}}
async function call(route,method="GET",body=null,params={}){
 const access=token()||(await init(),token());if(!access)throw new Error("Сначала войди в аккаунт SkyRealm.");
 const query=new URLSearchParams({route,...params});const response=await fetch(URL+"?"+query.toString(),{method,headers:{apikey:KEY,Authorization:"Bearer "+access,"Content-Type":"application/json"},body:body===null?undefined:JSON.stringify(body),cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||"Ошибка онлайн-сервера ("+response.status+").");
 return data;
}
let queueTimer=0,transportTimer=0,seq=0,lastInput="";
async function authCall(route,body){const r=await fetch(AUTH_URL+"?route="+encodeURIComponent(route),{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Ошибка аккаунта ("+r.status+").");return d;}
function stopQueue(){if(queueTimer)clearInterval(queueTimer);queueTimer=0;}
function stopTransport(){if(transportTimer)clearInterval(transportTimer);transportTimer=0;}
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
  stopTransport();seq=0;let lastSent=0,lastReceived=0,lastInputSent="",busy=false;
  const role=config.role,matchId=config.match_id;
  transportTimer=setInterval(async()=>{
   if(busy)return;busy=true;const started=performance.now();
   try{
    if(role==="host"){
     if(window.PrimeGameFinished?.())return;
     const snap=window.PrimeGameSnapshot?.();
     if(!snap)return;
     const response=await call("/api/prime/state","POST",{match_id:matchId,seq:++seq,state:snap});
     if(response.status&&response.status!=="active"){window.PrimeOnlineFinished?.(response);return;}
     if(response.guest_seq>lastReceived){lastReceived=response.guest_seq;window.PrimeApplyRemoteInput?.(response.guest_input||{});}
    }else{
     const current=window.PrimeReadInput?.()||{};
     const packed=JSON.stringify(current);
     if(packed!==lastInputSent||Date.now()-lastSent>900){
      await call("/api/prime/input","POST",{match_id:matchId,seq:++seq,input:current});lastInputSent=packed;lastSent=Date.now();
     }
     const state=await call("/api/prime/match","GET",null,{match_id:matchId});
     if(state.status==="active"&&state.host_seq>lastReceived&&state.host_state){
      lastReceived=state.host_seq;window.PrimeApplyHostState?.(state.host_state);
     }
     if(state.status!=="active"&&state.result)window.PrimeOnlineFinished?.(state);
    }
   }catch(e){window.PrimeOnlineError?.(e.message);}finally{window.PrimeOnlinePing=Math.round(performance.now()-started);busy=false;}
  },role==="host"?240:200);
 },
 stopQueue,stopTransport,
 finish: (matchId,winnerId,reason)=>call("/api/prime/finish","POST",{match_id:matchId,winner_id:winnerId,reason}),
 leave: matchId=>call("/api/prime/leave","POST",{match_id:matchId})
};
})();