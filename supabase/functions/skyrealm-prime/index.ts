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
async function memberMatch(matchId:string,userId:string){if(!UUID.test(matchId))throw new ApiError(400,"INVALID_MATCH","Некорректный номер матча.");const rows=await db("prime_matches?select=id,user_a,user_b,status,seed,host_state,host_seq,guest_input,guest_seq,winner_id,result,created_at,started_at,updated_at,finished_at,host_seen_at,guest_seen_at&id=eq."+matchId+"&limit=1");const m=rows?.[0];if(!m)throw new ApiError(404,"MATCH_NOT_FOUND","Матч не найден.");if(m.user_a!==userId&&m.user_b!==userId)throw new ApiError(403,"NOT_MATCH_MEMBER","Ты не участник этого матча.");return m;}
async function resolveDisconnect(m:any,connectedUser:string){
 const otherSeen=m.user_a===connectedUser?m.guest_seen_at:m.host_seen_at;
 if(m.status!=="active"||!otherSeen||Date.now()-Date.parse(otherSeen)<45_000)return null;
 const result=await db("rpc/prime_finish_match",{method:"POST",body:JSON.stringify({p_match_id:m.id,p_actor:m.user_a,p_winner:connectedUser,p_reason:"abandoned"})});
 return {status:"abandoned",winner_id:connectedUser,result,reason:"opponent_disconnected"};
}
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
  if(route==="/api/prime/profile"&&req.method==="GET"){
   const users=await db("profiles?select=id,username,display_name,avatar_key,avatar_url,player_class,playtime_seconds,last_seen_at,presence_status&id=eq."+user.id+"&limit=1");
   let p=users?.[0];
   if(!p){
    const authUser=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:ANON_KEY,Authorization:"Bearer "+user.token}}).then(r=>r.json());
    const username=String(authUser.user_metadata?.username||authUser.user_metadata?.display_name||authUser.email?.split("@")[0]||"Игрок").slice(0,24);
    const made=await db("profiles",{method:"POST",body:JSON.stringify({id:user.id,username,display_name:username,player_class:"Воин",playtime_seconds:0,presence_status:"online",last_seen_at:new Date().toISOString()}),headers:{Prefer:"resolution=merge-duplicates,return=representation"}});
    p=made?.[0]||{id:user.id,username,display_name:username,player_class:"Воин",playtime_seconds:0};
   }
   const now=new Date(),previous=p?.last_seen_at?Date.parse(p.last_seen_at):now.getTime(),elapsed=Math.max(0,Math.min(90,Math.floor((now.getTime()-previous)/1000)));
   await db("profiles?id=eq."+user.id,{method:"PATCH",body:JSON.stringify({last_seen_at:now.toISOString(),presence_status:"online",playtime_seconds:(Number(p?.playtime_seconds)||0)+elapsed})});
   const matches=await db("prime_matches?select=status,winner_id,result,finished_at,created_at&or=(user_a.eq."+user.id+",user_b.eq."+user.id+")&order=finished_at.desc.nullslast&limit=1");
   const stats=await db("prime_player_stats?select=rating,matches,wins,losses&user_id=eq."+user.id+"&limit=1");
   return reply({profile:{...p,playtime_seconds:(Number(p?.playtime_seconds)||0)+elapsed},last_match:matches?.[0]||null,stats:stats?.[0]||{rating:1000,matches:0,wins:0,losses:0}});
  }
  if(route==="/api/prime/profile"&&req.method==="PATCH"){
   const p=await readBody(req,5000),patch:any={};
   if(typeof p.display_name==="string"&&p.display_name.trim().length>=3&&p.display_name.trim().length<=24)patch.display_name=p.display_name.trim();
   if(typeof p.player_class==="string"&&["Воин","Страж","Следопыт","Маг"].includes(p.player_class))patch.player_class=p.player_class;
   if(typeof p.avatar_key==="string"&&/^[a-z0-9_-]{1,32}$/i.test(p.avatar_key))patch.avatar_key=p.avatar_key;
   if(typeof p.avatar_url==="string"&&(p.avatar_url===""||/^https:\/\//i.test(p.avatar_url))&&p.avatar_url.length<=500)patch.avatar_url=p.avatar_url;
   if(!Object.keys(patch).length)throw new ApiError(400,"EMPTY_PROFILE","Нет допустимых изменений профиля.");
   const rows=await db("profiles?id=eq."+user.id,{method:"PATCH",body:JSON.stringify(patch)});
   return reply({ok:true});
  }
  if(route==="/api/prime/stats"&&req.method==="GET"){
   await db("prime_player_stats?user_id=eq."+user.id,{method:"POST",body:JSON.stringify({user_id:user.id}),headers:{Prefer:"resolution=merge-duplicates,return=representation"}});
   const rows=await db("prime_player_stats?select=user_id,rating,matches,wins,losses&user_id=eq."+user.id+"&limit=1");
   return reply({stats:rows?.[0]||{user_id:user.id,rating:1000,matches:0,wins:0,losses:0}});
  }
  if(route==="/api/prime/leaderboard"&&req.method==="GET"){
   const people=await db("profiles?select=id,username,display_name,avatar_key,avatar_url,player_class,playtime_seconds,presence_status,last_seen_at&order=created_at.asc&limit=500");
   const ids=(people||[]).map((x:any)=>x.id);
   const stats=ids.length?await db("prime_player_stats?select=user_id,rating,matches,wins,losses&user_id=in.("+ids.join(",")+")&order=rating.desc,matches.desc&limit=500"):[];
   const byId=new Map((stats||[]).map((x:any)=>[x.user_id,x]));
   return reply({players:(people||[]).map((p:any)=>{const x=byId.get(p.id)||{};return {user_id:p.id,username:p.display_name||p.username||"Игрок",rating:x.rating??1000,matches:x.matches??0,wins:x.wins??0,losses:x.losses??0,avatar_url:p.avatar_url||"",avatar_key:p.avatar_key||"default",player_class:p.player_class||"Воин",playtime_seconds:p.playtime_seconds||0,presence_status:p.last_seen_at&&Date.now()-Date.parse(p.last_seen_at)<120000?"online":"offline"};}).sort((a:any,b:any)=>b.rating-a.rating||b.matches-a.matches).slice(0,50)});
  }
  if(route==="/api/prime/match"&&req.method==="GET"){
   const m=await memberMatch(url.searchParams.get("match_id")||"",user.id);
   const disconnected=await resolveDisconnect(m,user.id);if(disconnected)return reply({id:m.id,...disconnected});
   const role=m.user_a===user.id?"host":"guest",opponentId=role==="host"?m.user_b:m.user_a;
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({[role==="host"?"host_seen_at":"guest_seen_at"]:new Date().toISOString()})});
   const people=await db("profiles?select=id,username,display_name&id=eq."+opponentId+"&limit=1");
   return reply({id:m.id,status:m.status,seed:m.seed,role,opponent:people?.[0]||{username:"Игрок"},host_state:m.host_state,host_seq:m.host_seq,guest_input:role==="host"?m.guest_input:undefined,guest_seq:role==="host"?m.guest_seq:undefined,winner_id:m.winner_id,result:m.result,updated_at:m.updated_at});
  }
  if(route==="/api/prime/exchange"&&req.method==="POST"){
   const p=await readBody(req,8000),m=await memberMatch(String(p.match_id||""),user.id);
   if(m.user_b!==user.id)throw new ApiError(403,"GUEST_ONLY","Обмен состояния доступен только второму участнику матча.");
   if(m.status!=="active")return reply({status:m.status,winner_id:m.winner_id,result:m.result,host_seq:m.host_seq});
   const disconnected=await resolveDisconnect(m,user.id);if(disconnected)return reply({status:disconnected.status,winner_id:disconnected.winner_id,result:disconnected.result,reason:disconnected.reason,host_seq:m.host_seq});
   const input=safeInput(p.input),seq=Math.max(Number(m.guest_seq)+1,Math.round(Number(p.seq)||0));
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({guest_input:input,guest_seq:seq,guest_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
   return reply({ok:true,status:m.status,host_state:m.host_state,host_seq:m.host_seq,guest_seq:seq,winner_id:m.winner_id,result:m.result,updated_at:m.updated_at});
  }
  if(route==="/api/prime/state"&&req.method==="POST"){
   const p=await readBody(req),m=await memberMatch(String(p.match_id||""),user.id);
   if(m.user_a!==user.id)throw new ApiError(403,"HOST_ONLY","Только ведущий матча отправляет состояние боя.");
   if(m.status!=="active")return reply({status:m.status,winner_id:m.winner_id,result:m.result});
   const disconnected=await resolveDisconnect(m,user.id);if(disconnected)return reply({ok:true,...disconnected});
   if(!p.state||typeof p.state!=="object"||Array.isArray(p.state))throw new ApiError(400,"INVALID_STATE","Некорректное состояние боя.");
   const payload=JSON.stringify(p.state);if(payload.length>85000)throw new ApiError(413,"STATE_TOO_LARGE","Состояние боя слишком большое.");
   const seq=Math.max(Number(m.host_seq)+1,Math.round(Number(p.seq)||0));
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({host_state:p.state,host_seq:seq,host_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
   return reply({ok:true,seq,guest_input:m.guest_input,guest_seq:m.guest_seq});
  }
  if(route==="/api/prime/input"&&req.method==="POST"){
   const p=await readBody(req,8000),m=await memberMatch(String(p.match_id||""),user.id);
   if(m.user_b!==user.id)throw new ApiError(403,"GUEST_ONLY","Управление соперника не принимается.");
   if(m.status!=="active")throw new ApiError(409,"MATCH_FINISHED","Матч уже завершён.");
   const disconnected=await resolveDisconnect(m,user.id);if(disconnected)return reply({ok:true,...disconnected});
   const input=safeInput(p.input),seq=Math.max(Number(m.guest_seq)+1,Math.round(Number(p.seq)||0));
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({guest_input:input,guest_seq:seq,guest_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
   return reply({ok:true,seq});
  }
  if(route==="/api/prime/leave"&&req.method==="POST"){
   const p=await readBody(req,3000),m=await memberMatch(String(p.match_id||""),user.id);
   const winner=m.user_a===user.id?m.user_b:m.user_a;
   const result=await db("rpc/prime_finish_match",{method:"POST",body:JSON.stringify({p_match_id:m.id,p_actor:m.user_a,p_winner:winner,p_reason:"abandoned"})});
   return reply({ok:true,...result});
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
   await db("prime_matches?id=eq."+m.id,{method:"PATCH",body:JSON.stringify({[m.user_a===user.id?"host_seen_at":"guest_seen_at"]:new Date().toISOString(),updated_at:new Date().toISOString()})});
   return reply({ok:true,status:m.status});
  }

  if(route==="/api/prime/lobby"&&req.method==="GET"){
   const memberships=await db("prime_lobby_members?select=lobby_id,role,last_seen_at&user_id=eq."+user.id+"&limit=1");
   const membership=memberships?.[0];let lobby=null;
   if(membership){
    const rooms=await db("prime_lobbies?select=id,owner_id,status,mode,match_id,created_at,updated_at&id=eq."+membership.lobby_id+"&limit=1");
    const room=rooms?.[0];
    if(!room||room.status==="closed"){await db("prime_lobby_members?lobby_id=eq."+membership.lobby_id,{method:"DELETE"});}
    if(room&&room.status!=="closed"){
     await db("prime_lobby_members?lobby_id=eq."+room.id+"&user_id=eq."+user.id,{method:"PATCH",body:JSON.stringify({last_seen_at:new Date().toISOString()})});
     const members=await db("prime_lobby_members?select=user_id,role,joined_at,last_seen_at&lobby_id=eq."+room.id+"&order=joined_at.asc");
     const ids=(members||[]).map((x:any)=>x.user_id);
     const people=ids.length?await db("profiles?select=id,username,display_name,avatar_url&id=in.("+ids.join(",")+")"):[];
     const byId=new Map((people||[]).map((x:any)=>[x.id,x]));
     lobby={...room,role:membership.role,members:(members||[]).map((x:any)=>({...x,profile:byId.get(x.user_id)||{username:"Игрок"}}))};
    }
   }
   const invites=await db("prime_lobby_invites?select=id,lobby_id,inviter_id,created_at,expires_at&invitee_id=eq."+user.id+"&status=eq.pending&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=created_at.desc&limit=20");
   const inviterIds=[...new Set((invites||[]).map((x:any)=>x.inviter_id))];
   const inviters=inviterIds.length?await db("profiles?select=id,username,display_name&id=in.("+inviterIds.join(",")+")"):[];
   const inviterMap=new Map((inviters||[]).map((x:any)=>[x.id,x]));
   return reply({lobby,invites:(invites||[]).map((x:any)=>({...x,inviter:inviterMap.get(x.inviter_id)||{username:"Игрок"}}))});
  }
  if(route==="/api/prime/lobby"&&req.method==="POST"){
   const existing=await db("prime_lobby_members?select=lobby_id&user_id=eq."+user.id+"&limit=1");
   if(existing?.length)throw new ApiError(409,"ALREADY_IN_LOBBY","Сначала выйди из текущего лобби.");
   const created=await db("prime_lobbies",{method:"POST",body:JSON.stringify({owner_id:user.id,status:"lobby",mode:"pvp"})});
   const room=created?.[0];if(!room)throw new ApiError(500,"LOBBY_CREATE_FAILED","Не удалось создать лобби.");
   await db("prime_lobby_members",{method:"POST",body:JSON.stringify({lobby_id:room.id,user_id:user.id,role:"owner"})});
   return reply({lobby:{...room,role:"owner",members:[{user_id:user.id,role:"owner"}]}},201);
  }
  if(route==="/api/prime/lobby/invite"&&req.method==="POST"){
   const p=await readBody(req,3000),lobbyId=String(p.lobby_id||""),friendId=String(p.friend_id||"");
   if(!UUID.test(lobbyId)||!UUID.test(friendId)||friendId===user.id)throw new ApiError(400,"INVALID_INVITE","Некорректное приглашение.");
   const rooms=await db("prime_lobbies?select=id,owner_id,status&id=eq."+lobbyId+"&limit=1"),room=rooms?.[0];
   if(!room||room.status!=="lobby")throw new ApiError(404,"LOBBY_NOT_FOUND","Лобби уже закрыто.");
   if(room.owner_id!==user.id)throw new ApiError(403,"OWNER_ONLY","Приглашать друзей может только создатель лобби.");
   const pair=user.id<friendId?{user_a:user.id,user_b:friendId}:{user_a:friendId,user_b:user.id};
   const friends=await db("skyrealm_friendships?select=id,status&user_a=eq."+pair.user_a+"&user_b=eq."+pair.user_b+"&limit=1");
   if(!friends?.length||friends[0].status!=="accepted")throw new ApiError(403,"NOT_FRIENDS","Приглашать в Prime-лобби можно только друзей.");
   const active=await db("prime_lobby_members?select=user_id&user_id=eq."+friendId+"&limit=1");
   if(active?.length)throw new ApiError(409,"FRIEND_BUSY","Друг уже находится в другом лобби.");
   const old=await db("prime_lobby_invites?select=id,status,expires_at&lobby_id=eq."+lobbyId+"&invitee_id=eq."+friendId+"&limit=1");
   const now=new Date().toISOString(),expires=new Date(Date.now()+24*60*60*1000).toISOString();
   let invite;
   if(old?.length)invite=(await db("prime_lobby_invites?id=eq."+old[0].id,{method:"PATCH",body:JSON.stringify({inviter_id:user.id,status:"pending",created_at:now,expires_at:expires})}))?.[0];
   else invite=(await db("prime_lobby_invites",{method:"POST",body:JSON.stringify({lobby_id:lobbyId,inviter_id:user.id,invitee_id:friendId,status:"pending",expires_at:expires})}))?.[0];
   return reply({ok:true,invite},201);
  }
  if(route==="/api/prime/lobby/respond"&&req.method==="POST"){
   const p=await readBody(req,2000),id=String(p.invite_id||""),decision=String(p.decision||"");
   if(!UUID.test(id)||!["accept","reject"].includes(decision))throw new ApiError(400,"INVALID_INVITE_RESPONSE","Некорректный ответ.");
   const rows=await db("prime_lobby_invites?select=id,lobby_id,inviter_id,invitee_id,status,expires_at&id=eq."+id+"&invitee_id=eq."+user.id+"&limit=1");
   const invite=rows?.[0];if(!invite||invite.status!=="pending"||Date.parse(invite.expires_at)<=Date.now())throw new ApiError(404,"INVITE_EXPIRED","Приглашение не найдено или истекло.");
   if(decision==="reject"){await db("prime_lobby_invites?id=eq."+id,{method:"PATCH",body:JSON.stringify({status:"rejected"})});return reply({ok:true,status:"rejected"});}
   const rooms=await db("prime_lobbies?select=id,status&id=eq."+invite.lobby_id+"&limit=1");
   if(!rooms?.[0]||rooms[0].status!=="lobby")throw new ApiError(409,"LOBBY_CLOSED","Лобби уже закрыто.");
   const existing=await db("prime_lobby_members?select=lobby_id&user_id=eq."+user.id+"&limit=1");
   if(existing?.length)throw new ApiError(409,"ALREADY_IN_LOBBY","Сначала выйди из текущего лобби.");
   const members=await db("prime_lobby_members?select=user_id&lobby_id=eq."+invite.lobby_id);
   if((members||[]).length>=2)throw new ApiError(409,"LOBBY_FULL","В лобби уже два игрока.");
   await db("prime_lobby_members",{method:"POST",body:JSON.stringify({lobby_id:invite.lobby_id,user_id:user.id,role:"player"})});
   await db("prime_lobby_invites?id=eq."+id,{method:"PATCH",body:JSON.stringify({status:"accepted"})});
   return reply({ok:true,status:"accepted",lobby_id:invite.lobby_id});
  }
  if(route==="/api/prime/lobby/start"&&req.method==="POST"){
   const p=await readBody(req,2000),lobbyId=String(p.lobby_id||"");
   if(!UUID.test(lobbyId))throw new ApiError(400,"INVALID_LOBBY","Некорректное лобби.");
   const rooms=await db("prime_lobbies?select=id,owner_id,status,mode&id=eq."+lobbyId+"&limit=1"),room=rooms?.[0];
   if(!room||room.status!=="lobby")throw new ApiError(409,"LOBBY_NOT_READY","Лобби не готово к запуску.");
   if(room.owner_id!==user.id)throw new ApiError(403,"OWNER_ONLY","Запустить матч может только создатель.");
   const members=await db("prime_lobby_members?select=user_id,role&lobby_id=eq."+lobbyId+"&order=joined_at.asc");
   if((members||[]).length!==2)throw new ApiError(409,"NEED_TWO_PLAYERS","Пригласи друга и дождись его входа в лобби.");
   const opponent=members.find((x:any)=>x.user_id!==user.id);
   const pair=user.id<opponent.user_id?{user_a:user.id,user_b:opponent.user_id}:{user_a:opponent.user_id,user_b:user.id};
   const friends=await db("skyrealm_friendships?select=id,status&user_a=eq."+pair.user_a+"&user_b=eq."+pair.user_b+"&limit=1");
   if(!friends?.length||friends[0].status!=="accepted")throw new ApiError(403,"NOT_FRIENDS","Матч доступен только между друзьями.");
   const active=await db("prime_matches?select=id&status=eq.active&or=(user_a.in.("+user.id+","+opponent.user_id+"),user_b.in.("+user.id+","+opponent.user_id+"))&limit=1");
   if(active?.length)throw new ApiError(409,"ACTIVE_MATCH","У одного из игроков уже идёт другой матч.");
   const seed=Date.now()+Math.floor(Math.random()*1000000);
   const made=await db("prime_matches",{method:"POST",body:JSON.stringify({user_a:user.id,user_b:opponent.user_id,status:"active",seed,started_at:new Date().toISOString()})});
   const match=made?.[0];if(!match)throw new ApiError(500,"MATCH_CREATE_FAILED","Не удалось создать матч.");
   await db("prime_lobbies?id=eq."+lobbyId,{method:"PATCH",body:JSON.stringify({status:"running",match_id:match.id,updated_at:new Date().toISOString()})});
   const people=await db("profiles?select=id,username,display_name&id=eq."+opponent.user_id+"&limit=1");
   return reply({status:"matched",match_id:match.id,role:"host",seed,opponent_id:opponent.user_id,opponent:people?.[0]||{username:"Друг"},lobby_id:lobbyId});
  }
  if(route==="/api/prime/lobby/leave"&&req.method==="POST"){
   const p=await readBody(req,2000),lobbyId=String(p.lobby_id||"");
   if(!UUID.test(lobbyId))throw new ApiError(400,"INVALID_LOBBY","Некорректное лобби.");
   const rooms=await db("prime_lobbies?select=id,owner_id,status,match_id&id=eq."+lobbyId+"&limit=1"),room=rooms?.[0];
   if(!room)throw new ApiError(404,"LOBBY_NOT_FOUND","Лобби не найдено.");
   await db("prime_lobby_members?lobby_id=eq."+lobbyId+"&user_id=eq."+user.id,{method:"DELETE"});
   if(room.owner_id===user.id){
    await db("prime_lobbies?id=eq."+lobbyId,{method:"PATCH",body:JSON.stringify({status:"closed",updated_at:new Date().toISOString()})});
    await db("prime_lobby_members?lobby_id=eq."+lobbyId,{method:"DELETE"});
    await db("prime_lobby_invites?lobby_id=eq."+lobbyId+"&status=eq.pending",{method:"PATCH",body:JSON.stringify({status:"expired"})});
    if(room.match_id){try{const m=await memberMatch(room.match_id,user.id);if(m.status==="active")await db("rpc/prime_finish_match",{method:"POST",body:JSON.stringify({p_match_id:m.id,p_actor:m.user_a,p_winner:m.user_b,p_reason:"abandoned"})});}catch(_){}}
   }
   return reply({ok:true});
  }
  return reply({code:"NOT_FOUND",message:"Маршрут Prime online не найден."},404);
 }catch(e){const err=e as ApiError;console.error("[Prime online]",err?.code||"",err?.message||e);return reply({code:err?.code||"INTERNAL_ERROR",message:err?.message||"Ошибка Prime online."},err?.status||500);}
});