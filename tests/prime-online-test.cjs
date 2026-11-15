'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('game/competitive/prime-online.js','utf8');
const worldSource=fs.readFileSync('game/competitive/prime-world.js','utf8');
const primeApi=fs.readFileSync('supabase/functions/skyrealm-prime/index.ts','utf8');
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
assert.ok(source.includes('prime-moscow-turn-auth.skyrealm.workers.dev/ice'),'Prime client must request authenticated Cloudflare TURN credentials');
assert.ok(source.includes('await iceConfigPromise')&&source.includes('new RTCPeerConnection({iceServers,'),'ICE setup must wait for optional Cloudflare TURN configuration before peer creation');
assert.ok(source.includes('TURN · Cloudflare'),'Selected relay candidates must be identified as Cloudflare TURN');
assert.ok(source.includes('EDGE_REGION_CODES')&&source.includes('x-region'),'Selected supported regions must route Supabase Edge Function requests');
assert.ok(primeApi.includes('const RECONNECT_GRACE_MS=120_000')&&primeApi.includes('Date.now()-Date.parse(otherSeen)<RECONNECT_GRACE_MS'),'Prime matches must remain resumable for a two-minute reconnect window.');
assert.ok(source.includes('captureEdgeRegion')&&source.includes('x-sb-edge-region'),'The actual Edge Function region must be captured for diagnostics');
assert.ok(source.includes('saopaulo:"sa-east-1"')&&source.includes('mumbai:"ap-south-1"'),'The selectable region map must cover Asia and South America');
console.log('Prime P2P/region/relay/co-op regression assertions passed');


// Regression: guest clients render host-authoritative state but still need attack cooldown ticks.
assert.ok(primeWorldSource.includes("if(match.online?.role==='guest'){attackCooldown=Math.max(0,attackCooldown-dt);drawArena();}"),'Guest attack cooldown must advance');
assert.ok(primeWorldSource.includes("selfName:window.PrimeCurrentDisplayName||'Игрок'"),'Online match must retain authenticated local display name');
assert.ok(primeWorldSource.includes("match.online?.selfName||window.PrimeCurrentDisplayName||'Игрок'"),'Fighter name must come from authenticated account');
assert.ok(primeWorldSource.includes("window.PrimeCurrentDisplayName=String(p.username||p.display_name||'Игрок').slice(0,24)"),'Matchmaking must resolve current account display name');

assert.ok(worldSource.includes('window.PrimeInputSent')&&!worldSource.includes('match.online.attackPulse=false;return v;'),'Guest attack pulses must remain latched until a network send succeeds');
assert.ok(worldSource.includes('match.online.selfName')&&worldSource.includes('window.PrimeCurrentDisplayName'),'Player identity must come from the authenticated profile, not a hardcoded nickname');
console.log('Prime attack delivery and dynamic identity regression assertions passed');

const pcHtml=fs.readFileSync('game/competitive/index.html','utf8');
assert.ok(primeWorldSource.includes("const pages=['home','rank','history','profile','friends','registration','settings','menu','battle']"),'PC page router must include friends so the Friends/Lobby page is actually shown');
assert.ok(pcHtml.includes('id="friends-page"'),'PC launcher must include the friends/lobby content section');
assert.ok(!pcHtml.includes(String.fromCharCode(92)+'n'),'PC launcher HTML must not render escaped newline tokens');
console.log('PC Prime friends-page routing and markup cleanup assertions passed');

// Regression: accepted friends must always get an actionable invite control.
assert.ok(primeWorldSource.includes('if(rel.status==="accepted"){')&&primeWorldSource.includes('const created=await PrimeOnline.createLobby(mode,selectedTeamSize);')&&primeWorldSource.includes('await PrimeOnline.inviteLobbyFriend(primeCurrentLobby.id,person.id);'),'PC invite action must create an owned lobby when needed, then send the invite');
console.log('PC Prime invite auto-create regression assertions passed');

// online build/balance and co-op teammate recovery regression checks

assert.ok(primeWorldSource.includes('processRemoteBuildRequest()')&&primeWorldSource.includes('buildRequest:match.online.buildRequest||null'),'PC online guests must send build requests to the host');
assert.ok(primeWorldSource.includes('commitBuildPlacement(kind,placement)')&&primeWorldSource.includes('window.PrimeInputSent'),'PC host must commit authoritative guest building requests');
assert.ok(primeWorldSource.includes('coins=Math.floor(localTeam===1?(localBot?.coins||0):m.playerCoins)')&&primeWorldSource.includes("q('hud-balance-value').textContent=coins===null"),'PC guests must see their authoritative team balance in the HUD');
assert.ok(primeWorldSource.includes('target.respawnAt=match.elapsed+12')&&primeWorldSource.includes('target.isRemotePlayer&&match.online?.mode===\'bots\'&&target.team===0'),'PC co-op teammate death must schedule a 12-second respawn');
assert.ok(primeWorldSource.includes('!ally.alive&&ally.isRemotePlayer&&match.online?.role===\'host\'&&match.online?.mode===\'bots\'&&ally.respawnAt&&match.elapsed>=ally.respawnAt')&&primeWorldSource.includes('ally.alive=true;ally.respawnAt=0'),'PC host must restore the allied player after the respawn timer');
assert.ok(!primeWorldSource.includes("ctx.fillRect(-13,-23,26,42)"),'PC fighter hit effect must not draw a white rectangle over dead players');
assert.ok(!pcHtml.includes('body.online-match .battle-tools #build-toggle'),'PC online mode must not hide the build button');
assert.ok(pcHtml.includes('class="tool-btn" id="balance-toggle"'),'PC online mode must expose the balance button without the hidden class');
console.log('PC online build/balance/co-op respawn regression assertions passed');


// Ranked result integrity: the API accepts authenticated participants, not just the host,
// and the database waits for two matching reports before changing either rating.
assert.ok(!primeApi.includes('if(m.user_a!==user.id)throw new ApiError(403,"HOST_ONLY"'), 'A guest must be allowed to confirm the reported result');
assert.ok(primeApi.includes('p_actor:user.id,p_winner:winner'), 'Each ranked report must be attributed to the currently authenticated participant');
assert.ok(primeApi.includes('const disconnectedUser=m.user_a===connectedUser?m.user_b:m.user_a'), 'Reconnect expiry must attribute a forfeit to the participant who actually timed out');
assert.ok(primeWorldSource.includes("state.status==='awaiting_confirmation'")&&primeWorldSource.includes("PrimeOnline.finish(online.match_id,winner,'completed')"), 'The second participant must confirm a proposed result before ELO changes');
assert.ok(primeWorldSource.includes("result.status==='disputed'")&&primeWorldSource.includes('ELO не изменён'), 'Disputed results must not be presented as rated wins');
assert.ok(primeWorldSource.includes('const rankedOnline=!!online&&online.mode!==\'bots\';if(!rankedOnline){profile.matches++;'), 'Ranked counters must come from the server after confirmation');
console.log('Prime dual-player result confirmation and ELO guard assertions passed');
