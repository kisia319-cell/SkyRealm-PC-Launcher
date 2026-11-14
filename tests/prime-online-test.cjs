'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('game/competitive/prime-online.js','utf8');
const userId='11111111-1111-4111-8111-111111111111';
const payload=Buffer.from(JSON.stringify({sub:userId})).toString('base64url');
const jwt='header.'+payload+'.signature',calls=[],intervals=[];
const replies={
 '/api/prime/queue':{status:'waiting'},
 '/api/prime/stats':{stats:{user_id:userId,rating:1000,matches:0,wins:0,losses:0}},
 '/api/prime/leaderboard':{players:[]},
 '/api/prime/profile':{profile:{username:'Kisia'},stats:{rating:1000}},
 '/api/prime/finish':{ok:true,status:'completed'},
 '/api/prime/leave':{ok:true,status:'abandoned'},
 '/api/prime/exchange':{ok:true,status:'active',host_seq:7,host_state:{server_tick:7}}
};
const context={
 window:{pywebview:{api:{get_auth_session:async()=>({token:jwt})}}},
 localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},
 URLSearchParams,Date,JSON,Math,performance:{now:()=>10},
 atob:value=>Buffer.from(value,'base64').toString('binary'),
 setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval:()=>{},
 fetch:async(url,init)=>{const parsed=new URL(url),route=parsed.searchParams.get('route');calls.push({route,method:init.method,authorization:init.headers.Authorization,body:init.body?JSON.parse(init.body):null});return{ok:true,status:200,json:async()=>replies[route]||{ok:true}};}
};
vm.runInNewContext(source,context);
(async()=>{
 assert.equal(await context.window.PrimeOnline.init(),true,'Prime must receive the authenticated SkyRealm token through the native bridge');
 assert.equal(context.window.PrimeOnline.hasSession(),true);
 assert.equal(context.window.PrimeOnline.userId(),userId);
 assert.equal((await context.window.PrimeOnline.queue(1000)).status,'waiting');
 assert.equal((await context.window.PrimeOnline.stats()).stats.rating,1000);
 assert.equal((await context.window.PrimeOnline.leaderboard()).players.length,0);
 assert.equal((await context.window.PrimeOnline.profile()).profile.username,'Kisia');
 assert.equal(typeof context.window.PrimeOnline.updateProfile,'function');
 assert.equal(typeof context.window.PrimeOnline.register,'function');
 assert.equal(typeof context.window.PrimeOnline.verify,'function');
 assert.equal(typeof context.window.PrimeOnline.login,'function');
 await context.window.PrimeOnline.cancelQueue();
 await context.window.PrimeOnline.finish('22222222-2222-4222-8222-222222222222',userId,'completed');
 await context.window.PrimeOnline.leave('22222222-2222-4222-8222-222222222222');
 let appliedState=null;context.window.PrimeReadInput=()=>({up:true});context.window.PrimeApplyHostState=state=>{appliedState=state;};
 context.window.PrimeOnline.startTransport({role:'guest',match_id:'22222222-2222-4222-8222-222222222222'});
 assert.ok(intervals.length,'Guest transport must schedule its exchange loop');
 await intervals[intervals.length-1]();
 assert.ok(calls.some(x=>x.route==='/api/prime/exchange'&&x.method==='POST'),'Guest transport must use the single exchange endpoint');
 assert.deepEqual(appliedState,{server_tick:7},'Guest transport must apply the host state returned by exchange');
 assert.ok(!calls.some(x=>x.route==='/api/prime/match'&&x.method==='GET'),'Guest transport must not perform a second sequential state request');
 context.window.PrimeOnline.stopTransport();
 assert.ok(calls.length>=6);
 assert.ok(calls.every(x=>x.authorization==='Bearer '+jwt),'Every online request must use the verified account bearer');
 assert.ok(calls.some(x=>x.route==='/api/prime/queue'&&x.method==='POST'));
 assert.ok(calls.some(x=>x.route==='/api/prime/leave'&&x.method==='POST'));
 console.log('prime-online-test: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

const primeWorldSource=fs.readFileSync("game/competitive/prime-world.js",'utf8');
assert.ok(primeWorldSource.includes("const p=match.localEntity||match.player,camX=p.x-w/2,camY=p.y-h/2"),"Guest camera must follow its own fighter");
console.log("prime-online-test: guest-local camera assertion passed");
const profileUpdater=primeWorldSource.slice(primeWorldSource.indexOf('function updateProfile(){'),primeWorldSource.indexOf('let primeLeaderboardPromise='));
assert.ok(!profileUpdater.includes('renderLeaderboard()'),'Leaderboard must not refetch on every profile refresh');
assert.ok(primeWorldSource.includes("if(page==='rank')renderLeaderboard();"),'Leaderboard should load when the ranking page is opened');
assert.ok(primeWorldSource.includes('primeLeaderboardPromise'),'Leaderboard requests must be deduplicated');
assert.ok(primeWorldSource.includes("match.online.mode==='bots'"),'Co-op lobby mode must keep AI bots active');
assert.ok(primeWorldSource.includes("НАЧАТЬ КООПЕРАЦИЮ 2 ИГРОКА ПРОТИВ БОТОВ"),'Lobby must expose the co-op start action');
assert.ok(primeWorldSource.includes("match.allies?.find(a=>a.isRemotePlayer)"),'Co-op guest must control the allied fighter');
assert.ok(source.includes('new RTCPeerConnection')&&source.includes('prime-game'),'Realtime gameplay should attempt a direct WebRTC data channel');
assert.ok(source.includes('PrimeOnlinePingSource')&&source.includes('P2P'),'Direct RTT source must be exposed to the HUD');
assert.ok(source.includes('stun:stun.cloudflare.com:3478'),'Cloudflare global STUN must be tried for ICE discovery');
assert.ok(source.includes('maxRetransmits:0')&&source.includes('ordered:false'),'Gameplay data channel must avoid head-of-line waiting on stale packets');
assert.ok(source.includes('PrimeOnlineRelayPing')&&source.includes('server_ping'),'Relay latency must be measured separately from peer RTT');
assert.ok(source.includes('lastHostSendAt<100'),'Server fallback must be paced to avoid packet bursts');
console.log('Prime P2P/relay/co-op regression assertions passed');
