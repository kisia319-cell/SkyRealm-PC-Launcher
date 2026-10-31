const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};
class ApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}
function reply(data: unknown, status=200) { return new Response(JSON.stringify(data), {status,headers:CORS}); }
function fail(error: unknown) {
  const e=error as ApiError;
  return reply({message:e?.message || "Ошибка социального сервиса.",code:e?.code || "INTERNAL_ERROR"},e?.status || 500);
}
async function body(req: Request) {
  const raw=await req.text();
  if(raw.length>8000) throw new ApiError(413,"BODY_TOO_LARGE","Слишком большой запрос.");
  try { const v=raw?JSON.parse(raw):{}; if(!v||typeof v!=="object"||Array.isArray(v)) throw 0; return v as Record<string,unknown>; }
  catch { throw new ApiError(400,"INVALID_JSON","Некорректный запрос."); }
}
async function authenticate(req: Request) {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) throw new ApiError(401,"NO_SESSION","Войди в аккаунт SkyRealm.");
  const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:ANON_KEY,Authorization:"Bearer "+token}});
  if(!r.ok) throw new ApiError(401,"INVALID_SESSION","Сессия устарела. Войди снова.");
  const user=await r.json();
  if(!user?.id || (!user.email_confirmed_at && !user.confirmed_at)) throw new ApiError(403,"EMAIL_NOT_VERIFIED","Сначала подтверди почту.");
  return {id:String(user.id),email:String(user.email||"")};
}
async function db(path: string, init: RequestInit={}) {
  const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{
    ...init,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}
  });
  const raw=await r.text(); let data: any=null;
  try { data=raw?JSON.parse(raw):null; } catch { data=raw; }
  if(!r.ok) { console.error("[SkyRealm Social DB]",r.status,data); throw new ApiError(500,"DATABASE_ERROR","Не удалось выполнить запрос к социальному сервису."); }
  return data;
}
function orderedPair(a:string,b:string) { return a<b?{user_a:a,user_b:b}:{user_a:b,user_b:a}; }
const profileFields="id,username,display_name,avatar_key,bio,player_class,level,experience,playtime_seconds,last_seen_at,created_at";
async function profiles(ids:string[]) {
  if(!ids.length) return [];
  return await db("profiles?select="+profileFields+"&id=in.("+ids.join(",")+")") || [];
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  if(!SUPABASE_URL||!ANON_KEY||!SERVICE_KEY) return reply({message:"Social service is not configured.",code:"SERVER_CONFIG"},500);
  try {
    const url=new URL(req.url);
    const route=url.searchParams.get("route")||"/";
    const user=await authenticate(req);
    if(route==="/api/social/profile" && req.method==="GET") {
      await db("profiles?id=eq."+user.id,{method:"PATCH",body:JSON.stringify({last_seen_at:new Date().toISOString()})});
      const rows=await db("profiles?select="+profileFields+"&id=eq."+user.id);
      if(!rows?.length) throw new ApiError(404,"PROFILE_NOT_FOUND","Профиль не найден.");
      return reply({profile:rows[0]});
    }
    if(route==="/api/social/profile" && req.method==="PATCH") {
      const p=await body(req), update:Record<string,unknown>={};
      if(p.display_name!==undefined) {
        if(typeof p.display_name!=="string"||p.display_name.trim().length>24) throw new ApiError(400,"INVALID_DISPLAY_NAME","Имя должно быть не длиннее 24 символов.");
        update.display_name=p.display_name.trim();
      }
      if(p.avatar_key!==undefined) {
        if(!["wanderer","warrior","mage","ranger","miner","farmer"].includes(String(p.avatar_key))) throw new ApiError(400,"INVALID_AVATAR","Неизвестный аватар.");
        update.avatar_key=p.avatar_key;
      }
      if(p.bio!==undefined) {
        if(typeof p.bio!=="string"||p.bio.length>160) throw new ApiError(400,"INVALID_BIO","Описание должно быть не длиннее 160 символов.");
        update.bio=p.bio.trim();
      }
      if(p.player_class!==undefined) {
        if(!["swordsman","farmer","ordinary","archer","mage","miner","rich"].includes(String(p.player_class))) throw new ApiError(400,"INVALID_CLASS","Неизвестный класс.");
        update.player_class=p.player_class;
      }
      if(!Object.keys(update).length) throw new ApiError(400,"EMPTY_UPDATE","Нет данных для сохранения.");
      const rows=await db("profiles?id=eq."+user.id,{method:"PATCH",body:JSON.stringify(update)});
      return reply({profile:rows?.[0]||null});
    }
    if(route==="/api/social/stats" && req.method==="POST") {
      const p=await body(req), cls=String(p.player_class||"ordinary");
      const level=Number(p.level), experience=Number(p.experience), playtime=Number(p.playtime_seconds);
      if(!["swordsman","farmer","ordinary","archer","mage","miner","rich"].includes(cls) ||
         !Number.isSafeInteger(level)||level<1||level>10000 ||
         !Number.isSafeInteger(experience)||experience<0||experience>10000000 ||
         !Number.isSafeInteger(playtime)||playtime<0||playtime>100000000) {
        throw new ApiError(400,"INVALID_STATS","Игровая статистика имеет недопустимые значения.");
      }
      const rows=await db("profiles?id=eq."+user.id,{method:"PATCH",body:JSON.stringify({
        player_class:cls,level,experience,playtime_seconds:playtime,last_seen_at:new Date().toISOString()
      })});
      return reply({ok:true,profile:rows?.[0]||null});
    }
    if(route==="/api/social/search" && req.method==="GET") {
      const q=(url.searchParams.get("q")||"").trim();
      if(!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(q)) throw new ApiError(400,"INVALID_QUERY","Введи ник: от 3 до 20 букв, цифр или _.");
      const rows=await db("profiles?select=id,username,display_name,avatar_key,player_class,level,last_seen_at&username=ilike."+encodeURIComponent(q)+"&id=neq."+user.id+"&limit=10");
      return reply({players:rows||[]});
    }
    if(route==="/api/social/friends" && req.method==="GET") {
      const rel=await db("skyrealm_friendships?select=id,user_a,user_b,requested_by,status,created_at&or=(user_a.eq."+user.id+",user_b.eq."+user.id+")&order=updated_at.desc");
      const ids=[...new Set((rel||[]).map((x:any)=>x.user_a===user.id?x.user_b:x.user_a))];
      const people=await profiles(ids), byId=new Map(people.map((p:any)=>[p.id,p]));
      return reply({relationships:(rel||[]).map((x:any)=>({id:x.id,status:x.status,direction:x.requested_by===user.id?"outgoing":"incoming",player:byId.get(x.user_a===user.id?x.user_b:x.user_a)||null,created_at:x.created_at}))});
    }
    if(route==="/api/social/request" && req.method==="POST") {
      const p=await body(req), target=String(p.username||"").trim();
      if(!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(target)) throw new ApiError(400,"INVALID_USERNAME","Проверь ник игрока.");
      const found=await db("profiles?select=id,username&username=ilike."+encodeURIComponent(target)+"&limit=1");
      if(!found?.length) throw new ApiError(404,"PLAYER_NOT_FOUND","Игрок не найден.");
      const other=String(found[0].id);
      if(other===user.id) throw new ApiError(400,"SELF_REQUEST","Нельзя добавить самого себя.");
      const pair=orderedPair(user.id,other);
      const existing=await db("skyrealm_friendships?select=id,status,requested_by&user_a=eq."+pair.user_a+"&user_b=eq."+pair.user_b);
      if(existing?.length) {
        const rel=existing[0];
        if(rel.status==="accepted") throw new ApiError(409,"ALREADY_FRIENDS","Этот игрок уже в друзьях.");
        if(rel.status==="pending" && rel.requested_by===other) {
          const accepted=await db("skyrealm_friendships?id=eq."+rel.id,{method:"PATCH",body:JSON.stringify({status:"accepted",updated_at:new Date().toISOString()})});
          return reply({relationship:accepted?.[0],message:"Встречная заявка принята. Теперь вы друзья."});
        }
        if(rel.status==="rejected") {
          const resent=await db("skyrealm_friendships?id=eq."+rel.id,{method:"PATCH",body:JSON.stringify({status:"pending",requested_by:user.id,updated_at:new Date().toISOString()})});
          return reply({relationship:resent?.[0],message:"Заявка отправлена повторно."},201);
        }
        throw new ApiError(409,"REQUEST_EXISTS","Заявка уже отправлена или ожидает ответа.");
      }
      const created=await db("skyrealm_friendships",{method:"POST",body:JSON.stringify({...pair,requested_by:user.id,status:"pending"})});
      return reply({relationship:created?.[0],message:"Заявка в друзья отправлена."},201);
    }
    if(route==="/api/social/respond" && req.method==="POST") {
      const p=await body(req), id=String(p.id||""), decision=String(p.decision||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)||!["accept","reject"].includes(decision)) throw new ApiError(400,"INVALID_REQUEST","Некорректный ответ на заявку.");
      const rows=await db("skyrealm_friendships?id=eq."+id+"&or=(user_a.eq."+user.id+",user_b.eq."+user.id+")");
      const rel=rows?.[0];
      if(!rel||rel.status!=="pending"||rel.requested_by===user.id) throw new ApiError(404,"REQUEST_NOT_FOUND","Входящая заявка не найдена.");
      const updated=await db("skyrealm_friendships?id=eq."+id,{method:"PATCH",body:JSON.stringify({status:decision==="accept"?"accepted":"rejected",updated_at:new Date().toISOString()})});
      return reply({relationship:updated?.[0]||null});
    }
    if(route==="/api/social/remove" && req.method==="POST") {
      const p=await body(req), id=String(p.id||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400,"INVALID_REQUEST","Некорректная связь.");
      const rows=await db("skyrealm_friendships?id=eq."+id+"&or=(user_a.eq."+user.id+",user_b.eq."+user.id+")&status=eq.accepted");
      if(!rows?.length) throw new ApiError(404,"FRIEND_NOT_FOUND","Друг не найден.");
      await db("skyrealm_friendships?id=eq."+id,{method:"DELETE"});
      return reply({ok:true});
    }
    return reply({message:"Маршрут не найден.",code:"NOT_FOUND"},404);
  } catch(error) { return fail(error); }
});
