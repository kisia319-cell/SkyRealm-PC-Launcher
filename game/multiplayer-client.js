(() => {
'use strict';
const API_URL='https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-coop';
const PUBLIC_KEY='sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL';
let token='',tokenPromise=null,userId='';
async function getToken(){
  if(token)return token;
  try{token=sessionStorage.getItem('skyrealm_token')||localStorage.getItem('skyrealm_token')||'';}catch(_){}
  if(token)return token;
  if(tokenPromise)return tokenPromise;
  tokenPromise=(async()=>{
    if(!window.pywebview?.api?.get_auth_session){
      await Promise.race([
        new Promise(resolve=>window.addEventListener('pywebviewready',resolve,{once:true})),
        new Promise(resolve=>setTimeout(resolve,2500))
      ]);
    }
    try{if(window.pywebview?.api?.get_auth_session){const session=await window.pywebview.api.get_auth_session();if(typeof session?.token==='string')token=session.token;}}catch(_){}
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
window.SkyRealmCoopClient=Object.freeze({
  get userId(){return userId;},
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