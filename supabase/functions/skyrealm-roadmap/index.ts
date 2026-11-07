import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SUPABASE_URL=(Deno.env.get("SUPABASE_URL")??"").replace(/\/+$/,"");
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
class ApiError extends Error{status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}}
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:CORS});}
function fail(error:unknown){const e=error as ApiError;return reply({message:e?.message||"Ошибка голосования.",code:e?.code||"INTERNAL_ERROR"},e?.status||500);}
async function body(req:Request){const raw=await req.text();if(raw.length>4000)throw new ApiError(413,"BODY_TOO_LARGE","Слишком большой запрос.");try{const v=raw?JSON.parse(raw):{};if(!v||typeof v!=="object"||Array.isArray(v))throw 0;return v as Record<string,unknown>;}catch{throw new ApiError(400,"INVALID_JSON","Некорректный запрос.");}}
async function authenticate(req:Request){const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)throw new ApiError(401,"NO_SESSION","Войди в аккаунт SkyRealm, чтобы голосовать.");const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:ANON_KEY,Authorization:"Bearer "+token}});if(!r.ok)throw new ApiError(401,"INVALID_SESSION","Сессия устарела. Войди снова.");const u=await r.json();if(!u?.id||(!u.email_confirmed_at&&!u.confirmed_at))throw new ApiError(403,"EMAIL_NOT_VERIFIED","Сначала подтверди почту.");return {id:String(u.id)};}
async function db(path:string,init:RequestInit={}){const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}});const raw=await r.text();let data:any=null;try{data=raw?JSON.parse(raw):null;}catch{data=raw;}if(!r.ok){console.error("[SkyRealm Roadmap DB]",r.status,data);throw new ApiError(r.status===409?409:500,"DATABASE_ERROR","Не удалось сохранить данные голосования.");}return data;}
function normalize(value:string){return value.toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");}
function similarity(a:string,b:string){const stop=new Set(["это","для","чтобы","когда","игра","игре","добавить","сделать","новый","новая","новые","больше","улучшить","система"]);const words=(s:string)=>new Set(s.split(" ").filter(x=>x.length>2&&!stop.has(x)));const A=words(a),B=words(b);if(!A.size||!B.size)return a===b?1:0;let same=0;for(const x of A)if(B.has(x))same++;return same/(A.size+B.size-same);}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(!SUPABASE_URL||!ANON_KEY||!SERVICE_KEY)return reply({message:"Сервис не настроен.",code:"SERVER_CONFIG"},500);try{
 const url=new URL(req.url),route=url.searchParams.get("route")||"/";if(route==="/health"&&req.method==="GET")return reply({status:"ok",service:"skyrealm-roadmap",version:"1.0.0"});
 const user=await authenticate(req);
 if(route==="/api/roadmap"&&req.method==="GET"){
  const [ideas,votes]=await Promise.all([db("skyrealm_roadmap_ideas?select=id,title,description,status,source_count,created_at&status=in.(voting,planned,in_progress,done)&order=status.asc,created_at.desc&limit=60"),db("skyrealm_roadmap_votes?select=idea_id&user_id=eq."+user.id)]);
  const voteSet=new Set((votes||[]).map((x:any)=>x.idea_id));
  const items=await Promise.all((ideas||[]).map(async(i:any)=>{const count=await db("skyrealm_roadmap_votes?select=id&idea_id=eq."+i.id);return {...i,votes:(count||[]).length,voted:voteSet.has(i.id)};}));
  return reply({items});
 }
 if(route==="/api/roadmap/vote"&&req.method==="POST"){
  const p=await body(req),id=String(p.idea_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))throw new ApiError(400,"INVALID_ID","Неизвестное голосование.");
  const idea=await db("skyrealm_roadmap_ideas?select=id,status&id=eq."+id+"&limit=1");if(!idea?.length||idea[0].status!=="voting")throw new ApiError(404,"VOTE_CLOSED","Это голосование уже закрыто.");
  const created=await db("skyrealm_roadmap_votes",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({idea_id:id,user_id:user.id})});
  const count=await db("skyrealm_roadmap_votes?select=id&idea_id=eq."+id);
  return reply({ok:true,already_voted:!created?.length,votes:(count||[]).length});
 }
 if(route==="/api/roadmap/suggest"&&req.method==="POST"){
  const p=await body(req),title=typeof p.title==="string"?p.title.trim():"",description=typeof p.description==="string"?p.description.trim():"";
  if(title.length<5||title.length>72||description.length>500)throw new ApiError(400,"INVALID_IDEA","Название идеи должно быть от 5 до 72 символов, описание — до 500.");
  const recent=await db("skyrealm_roadmap_submissions?select=id&user_id=eq."+user.id+"&created_at=gte."+encodeURIComponent(new Date(Date.now()-86400000).toISOString()));
  if((recent||[]).length>=5)throw new ApiError(429,"IDEA_DAILY_LIMIT","Можно отправить не более пяти идей за 24 часа.");
  const key=normalize(title);const candidates=await db("skyrealm_roadmap_ideas?select=id,title,description,status,source_count&status=in.(collecting,voting)&order=created_at.desc&limit=120");
  let match=(candidates||[]).map((x:any)=>({...x,score:Math.max(similarity(key,normalize(x.title)),similarity(key,normalize(x.title+" "+x.description))*0.85)})).filter((x:any)=>x.score>=0.52).sort((a:any,b:any)=>b.score-a.score)[0];
  if(!match){const rows=await db("skyrealm_roadmap_ideas",{method:"POST",body:JSON.stringify({title,description,normalized_key:key,status:"collecting",source_count:0})});match=rows?.[0];}
  if(!match)throw new ApiError(500,"IDEA_SAVE_FAILED","Не удалось сохранить идею.");
  const submitted=await db("skyrealm_roadmap_submissions",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({idea_id:match.id,user_id:user.id})});
  if(submitted?.length){const updated=await db("skyrealm_roadmap_ideas?id=eq."+match.id,{method:"PATCH",body:JSON.stringify({source_count:Number(match.source_count||0)+1,updated_at:new Date().toISOString(),status:Number(match.source_count||0)+1>=3?"voting":match.status})});match=updated?.[0]||match;}
  return reply({ok:true,merged:match.title!==title||!submitted?.length,idea:{id:match.id,title:match.title,status:match.status,source_count:match.source_count},message:match.status==="voting"?"Идея совпала с другими предложениями и добавлена в голосование.":"Идея сохранена. Если похожую идею предложат ещё игроки, она попадёт в голосование."},201);
 }
 return reply({message:"Маршрут не найден.",code:"NOT_FOUND"},404);
 }catch(error){return fail(error);}});
