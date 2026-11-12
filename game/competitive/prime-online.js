(()=>{"use strict";
const URL="https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-prime";
const KEY="sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL";
function token(){return localStorage.getItem("skyrealm_token")||sessionStorage.getItem("skyrealm_token")||"";}
function userId(){try{return JSON.parse(atob(token().split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).sub||"";}catch(_){return "";}}
async function call(route,method="GET",body=null,params={}){
 const access=token();if(!access)throw new Error("Сначала войди в аккаунт SkyRealm.");
 const query=new URLSearchParams({route,...params});const response=await fetch(URL+"?"+query.toString(),{method,headers:{apikey:KEY,Authorization:"Bearer "+access,"Content-Type":"application/json"},body:body===null?undefined:JSON.stringify(body),cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||"Ошибка онлайн-сервера ("+response.status+").");
 return data;
}
let queueTimer=0,transportTimer=0,seq=0,lastInput="";
function stopQueue(){if(queueTimer)clearInterval(queueTimer);queueTimer=0;}
function stopTransport(){if(transportTimer)clearInterval(transportTimer);transportTimer=0;}
window.PrimeOnline={
 hasSession:()=>!!token(),userId,
 queue:rating=>call("/api/prime/queue","POST",{rating}),
 cancelQueue:()=>call("/api/prime/queue","DELETE"),
 status:matchId=>call("/api/prime/match","GET",null,{match_id:matchId}),
 leaderboard:()=>call("/api/prime/leaderboard"),
 stats:()=>call("/api/prime/stats"),
 startTransport(config){
  stopTransport();seq=0;let lastSent=0,lastReceived=0,lastInputSent="";
  const role=config.role,matchId=config.match_id;
  transportTimer=setInterval(async()=>{
   try{
    if(role==="host"){
     if(window.PrimeGameFinished?.())return;
     const snap=window.PrimeGameSnapshot?.();
     if(!snap)return;
     const response=await call("/api/prime/state","POST",{match_id:matchId,seq:++seq,state:snap});
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
   }catch(e){window.PrimeOnlineError?.(e.message);}
  },role==="host"?240:200);
 },
 stopQueue,stopTransport,
 finish: (matchId,winnerId,reason)=>call("/api/prime/finish","POST",{match_id:matchId,winner_id:winnerId,reason})
};
})();