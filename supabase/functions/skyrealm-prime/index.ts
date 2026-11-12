const SUPABASE_URL=(Deno.env.get("SUPABASE_URL")??"").replace(/\/+$/,"");
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
class ApiError extends Error{status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}}
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:CORS});}
async function readBody(req:Request,max=100_000){const raw=await req.text();if(raw.length>max)throw new ApiError(413,"BODY_TOO_LARGE","Слишком большой сетевой пакет.");try{const x=raw?JSON.parse(raw):{};if(!x||typeof x!=="object"||Array.isArray(x))throw 0;return x as Record<string,any>;}catch{throw new ApiError(400,"INVALID_JSON","Некорректный запрос.");}}
async function auth(req:Request){const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"").trim();if(!token)throw new ApiError(401,"NO_SESSION","Войди в аккаунт SkyRealm.");const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:ANON_KEY,Authorization:"Bearer "+token}});if(!r.ok)throw new ApiError(401,"INVALID_SESSION","Сессия устарела. Войди снова.");const u=await r.json();if(!u?.id||(!u.email_confirmed_at&&!u.confirmed_at))throw new ApiError(403,"EMAIL_NOT_VERIFIED","Подтверди почту в аккаунте SkyRealm.");return {id:String(u.id),token};}
async function db(path:string,init:RequestInit={}){const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}});const raw=await r.text();let data:any=null;try{data=raw?JSON.parse(raw):null;}catch{data=raw;}if(!r.ok){console.error("[Prime online DB]",r.status,data);throw new ApiError(500,"DATABASE_ERROR","Ошибка базы сетевого матча.");}return data;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function memberMatch(matchId:string,userId:string){if(!UUID.test(matchId))throw new ApiError(400,"INVALID_MATCH","Некорректный номер матча.");const rows=await db("prime_matches?select=id,user_a,user_b,status,seed,host_state,host_seq,guest_input,guest_seq,winner_id,result,created_at,started_at,updated_at,finished_at&id=eq."+matchId+"&limit=1");const m=rows?.[0];if(!m)throw new ApiError(404,"MATCH_NOT_FOUND","Матч не найден.");if(m.user_a!==userId&&m.user_b!==userId)throw new ApiError(403,"NOT_MATCH_MEMBER","Ты не участник этого матча.");return m;}
function safeInput(v:any){if(!v||typeof v!=="object"||Array.isArray(v))throw new ApiError(400,"INVALID_INPUT","Некорректное управление.");const keys=["up","down","left","right","sprint","attack"];const out:any={};for(const k of keys)out[k]=v[k]===true;const actions=Array.isArray(v.actions)?v.actions.slice(0,6):[];const allowed=["warcry","shield","volley","upgrade","train","halt","regroup","guard","build"];out.actions=actions.filter((a:any)=>a&&allowed.includes(String(a.type))).map((a:any)=>({type:String(a.type),kind:String(a.kind||"").slice(0,20),x:Number.isFinite(a.x)?Math.max(0,Math.min(3200,a.x)):undefined,y:Number.isFinite(a.y)?Math.max(0,Math.min(3200,a.y)):undefined}));return out;}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(!SUPABASE_URL||!ANON_KEY||!SERVICE_KEY)return reply({code:"SERVER_CONFIG",message:"Prime online service не настроен."},500);
 try{
  const url=new URL(req.url),route=url.searchParams.get("route")||"/health";
  if(route==="/health")return reply({status:"ok",service:"skyrealm-prime",version:"1.0.0",mode:"1v1"});
  const user=await auth(req);
  if(route==="/api/prime/queue"&&req.method==="POST"){
   const p=await readBody(req,3000),rating=Math.max(0,Math.min(100000,Math.round(Number(p.rating)||1000)));
   const result=await db("rpc/prime_join_queue",{method:"POST",body:JSON.stringify({p_user_id:user.id,p_rating:rating})});
   if(result?.status==="matched"){
    const rows=await db("prime_matches?select=id,user_a,user_b,seed,status&id=eq."+result.match_id+"&limit=1"),m=rows?.[0];
    const opponent=m?(m.user_a===user.id?m.user_b:m.user_a):result.opponent_id;
    const people=await db("profiles?select=id,username,display_name&id=eq."+opponent+"&limit=1");
    return reply({...result,opponent:people?.[0]||{username:"Игрок"},seed:m?.seed??result.seed});
   }
   return reply({status:"waiting"});
  }
  if(route==="/api/prime/queue"&&req.method==="DELETE"){
   await db("prime_match_queue?user_id=eq."+user.id,{method:"DELETE"});return reply({ok:true});
  }
  if(route==="/api/prime/stats"&&req.method==="GET"){
   await db("prime_player_stats?user_id=eq."+user.id,{method:"POST",body:JSON.stringify({user_id:user.id}),headers:{Prefer:"resolution=merge-duplicates,return=representation"}});
   const rows=await db("prime_player_stats?select=user_id,rating,matches,wins,losses&user_id=eq."+user.id+"&limit=1");
   return reply({stats:rows?.[0]||{user_id:user.id,rating:1000,matches:0,wins:0,losses:0}});
  }
  if(route==="/api/prime/leaderboard"&&req.method==="GET"){
   const stats=await db("prime_player_stats?select=user_id,rating,matches,wins,losses&order=rating.desc,matches.desc&limit=50");
   const ids=(stats||[]).map((x:any)=>x.user_id);
   const people=ids.length?await db("profiles?select=id,username,display_name&id=in.("+ids.join(",")+")"):[];
   const byId=new Map((people||[]).map((x:any)=>[x.id,x]));
   return reply({players:(stats||[]).map((x:any)=>({user_id:x.user_id,username:byId.get(x.user_id)?.display_name||byId.get(x.user_id)?.username||"Игрок",rating:x.rating,matches:x.matches,wins:x.wins,losses:x.losses}))});
  }
  if(route==="/api/prime/match"&&req.method==="GET"){
   const m=await memberMatch(url.searchParams.get("match_id")||"",user.id);
   const role=m.user_a===user.id?"host":"guest",opponentId=role==="host"?m.user_b:m.user_a;
   const people=await db("profiles?select=id,username,display_name&id=eq."+opponentId+"&limit=1");
   return reply({id:m.id,status:m.status,seed:m.seed,role,opponent:people?.[0]||{username:"Игрок"},host_state:m.host_state,host_seq:m.host_seq,guest_input:role==="host"?m.guest_input:undefined,guest_seq:role==="host"?m.guest_seq:undefined,winner_id:m.winner_id,result:m.result,updated_at:m.updated_at});
  }
  if(route==="/api/prime/state"&&req.method==="POST"){
   const p=await readBody(req),m=await memberMatch(String(p.match_id||""),user.id);
   if(m.user_a!==user.id)throw new ApiError(403,"HOST_ONLY","Только ведущий матча отправляет состояние боя.");
   if(m.status!=="active")throw new ApiError(409,"MATCH_FINISHED","Матч уже завершён.");
   if(!p.state||typeof p.state!=="object"||Array.isArray(p.state))throw new ApiError(400,"INVALID_STATE","Некорректное состояние боя.");
   const payload=JSON.stringify(p.state);if(payload.length>85000)throw new ApiError(413,"STATE_TOO_LARGE","Состояние боя слишком большое.");
   const seq=Math.max(Number(m.host_seq)+1,Math.round(Number(p.seq)||0));
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({host_state:p.state,host_seq:seq,updated_at:new Date().toISOString()})});
   return reply({ok:true,seq,guest_input:m.guest_input,guest_seq:m.guest_seq});
  }
  if(route==="/api/prime/input"&&req.method==="POST"){
   const p=await readBody(req,8000),m=await memberMatch(String(p.match_id||""),user.id);
   if(m.user_b!==user.id)throw new ApiError(403,"GUEST_ONLY","Управление соперника не принимается.");
   if(m.status!=="active")throw new ApiError(409,"MATCH_FINISHED","Матч уже завершён.");
   const input=safeInput(p.input),seq=Math.max(Number(m.guest_seq)+1,Math.round(Number(p.seq)||0));
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({guest_input:input,guest_seq:seq,updated_at:new Date().toISOString()})});
   return reply({ok:true,seq});
  }
  if(route==="/api/prime/finish"&&req.method==="POST"){
   const p=await readBody(req,3000),m=await memberMatch(String(p.match_id||""),user.id);
   if(m.user_a!==user.id)throw new ApiError(403,"HOST_ONLY","Результат подтверждает ведущий матча.");
   const winner=p.winner_id===m.user_a||p.winner_id===m.user_b?p.winner_id:null;
   const result=await db("rpc/prime_finish_match",{method:"POST",body:JSON.stringify({p_match_id:m.id,p_actor:user.id,p_winner:winner,p_reason:p.reason==="abandoned"?"abandoned":"completed"})});
   return reply({ok:true,...result});
  }
  if(route==="/api/prime/heartbeat"&&req.method==="POST"){
   const p=await readBody(req,1000),m=await memberMatch(String(p.match_id||""),user.id);
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({updated_at:new Date().toISOString()})});
   return reply({ok:true,status:m.status});
  }
  return reply({code:"NOT_FOUND",message:"Маршрут Prime online не найден."},404);
 }catch(e){const err=e as ApiError;console.error("[Prime online]",err?.code||"",err?.message||e);return reply({code:err?.code||"INTERNAL_ERROR",message:err?.message||"Ошибка Prime online."},err?.status||500);}
});