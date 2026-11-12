'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const launcherHtml=read('index.html'),app=read('app.js'),launcherPy=read('launcher.py'),build=read('build_exe.bat'),primeOnline=read('game/competitive/prime-online.js'),primeApi=read('supabase/functions/skyrealm-prime/index.ts'),primeMigration=read('supabase/migrations/20261112130449_prime_online_1v1.sql');
const primeHtml=read('game/competitive/index.html'),primeJs=read('game/competitive/prime-world.js'),workflow=read('.github/workflows/build-release.yml');
assert.match(launcherHtml,/data-page="competitive"/);assert.match(launcherHtml,/id="page-competitive"/);assert.match(launcherHtml,/id="play-competitive"/);
assert.match(app,/launch_competitive_game/);assert.match(app,/game\/competitive\/index\.html/);
assert.match(launcherPy,/def launch_competitive_game\(self, session_token=None\)/);assert.match(launcherPy,/SKYREALM_SESSION_TOKEN/);assert.match(launcherPy,/def get_auth_session\(self\)/);assert.match(launcherPy,/def get_competitive_launcher_status\(self\)/);assert.match(launcherPy,/--prime-competitive/);
const primeShortcutStart=launcherPy.indexOf('if len(sys.argv) >= 2 and sys.argv[1] == "--open-prime":');
const primeShortcutEnd=launcherPy.indexOf('if len(sys.argv) >= 3',primeShortcutStart);
assert.ok(primeShortcutStart>=0&&primeShortcutEnd>primeShortcutStart,'Prime desktop shortcut entrypoint must exist.');
assert.doesNotMatch(launcherPy.slice(primeShortcutStart,primeShortcutEnd),/_skyrealm_startup_game_update\(\)/,'Prime shortcut must not wait on the separate single-player update prompt.');assert.match(launcherPy,/127\.0\.0\.1", 48732/);assert.match(launcherPy,/PrimeLauncher.*webview-profile/s);
assert.match(build,/--name PrimeLauncher/);assert.match(build,/prime_launcher_dist\\PrimeLauncher\.exe;bin/);assert.match(build,/%CD%\\game\\competitive;game\\competitive/);assert.match(workflow,/Build PrimeLauncher runtime/);assert.match(workflow,/prime_launcher_dist\/PrimeLauncher\.exe;bin/);assert.match(workflow,/game\/competitive\/prime-world\.js/);
assert.match(primeHtml,/PRIME DIVISION/);assert.match(primeHtml,/prime-online\.js/);assert.match(primeOnline,/skyrealm-prime/);assert.match(primeOnline,/PrimeReadInput/);assert.match(primeApi,/prime_join_queue/);assert.match(primeApi,/prime_finish_match/);assert.match(primeMigration,/prime_match_queue/);assert.match(primeMigration,/prime_matches/);for(const n of [1,2,3])assert.match(primeHtml,new RegExp('data-team="'+n+'"'));
assert.match(primeHtml,/data-kind="online"/);assert.match(primeHtml,/data-kind="training"/);assert.match(primeHtml,/id="leaderboard"/);assert.match(primeHtml,/id="performance-hud"/);
for(const id of ['home-coins','rank-coins','battle-coins','nav-coins','top-coins','upgrade-tower','enemy-towers'])assert.ok(primeHtml.includes('id="'+id+'"'),'missing '+id);
assert.match(primeJs,/primeLauncher\.profile\.v2/);assert.match(primeJs,/primeLauncher\.bots\.v1/);assert.match(primeJs,/COINS_PER_SECOND=10/);assert.match(primeJs,/match\.playerCoins\+=count\*COINS_PER_SECOND/);assert.match(primeJs,/profile\.coins\+=count\*COINS_PER_SECOND/);assert.match(primeJs,/profile\.history\.unshift/);assert.match(primeJs,/20\+Math\.floor\(Math\.random\(\)\*11\)/);assert.match(primeJs,/20\+Math\.floor\(Math\.random\(\)\*16\)/);assert.match(primeJs,/primeLauncher\.language\.v1/);
assert.match(primeJs,/UPGRADE_COST=500/);assert.match(primeJs,/owner\.team===0\?0:1/);assert.match(primeJs,/allies\.push\(ally\);/);assert.doesNotMatch(primeJs,/allies\.push\(ally\);towers\.push\(createTower/);assert.match(primeJs,/match\.playerTowerLevel\+\+/);assert.match(primeJs,/playerCoins:0,playerTowerLevel:1/);assert.doesNotMatch(primeJs,/profile\.coins\+\+/);assert.doesNotMatch(primeJs,/profile\.towerLevel\+\+/);assert.match(primeJs,/PrimeOnline\.leaderboard\(\)/,'Leaderboard must load real online players from the server.');assert.match(primeJs,/b\.towerLevel<20&&b\.coins>=upgradeCost\(b\.towerLevel\)/);assert.match(primeJs,/b\.elo\+=8/);
assert.match(primeJs,/beginOnlineQueue\(\)/,'Online mode must start real matchmaking.');assert.match(primeJs,/startOnlineMatch\(data\)/,'A matched player must enter the networked arena.');assert.match(primeJs,/PrimeOnline\.queue/,'Matchmaking must use the online service.');assert.match(primeJs,/PrimeApplyRemoteInput/,'Host must apply remote player input.');assert.match(primeJs,/PrimeGameSnapshot/,'Host must synchronize authoritative match state.');assert.match(primeJs,/matchKind==='online'/);
assert.match(primeJs,/renderLeaderboard/);assert.match(primeJs,/drawTower/);assert.match(primeJs,/performance-hud/);assert.match(primeJs,/Ping /);
assert.match(primeJs,/match\.allies\.forEach/);assert.match(primeJs,/pressed\.has\('KeyW'\)/);assert.match(primeJs,/window\.addEventListener\('keydown'/);assert.match(primeJs,/window\.addEventListener\('keyup'/);
assert.match(primeJs,/finish\(true\)/);assert.match(primeJs,/WORLD_SAVE/);assert.doesNotMatch(primeJs,/game\.js|multiplayer-core|boss-realm/);

for(const id of ['build-toggle','balance-toggle','upgrade-tower','train-unit','bot-info-toggle','balance-value','hud-bot-state','hud-attack-timer'])assert.ok(primeHtml.includes('id="'+id+'"'),'battle HUD control is missing: '+id);
assert.match(primeHtml,/body\.battle-active \.nav[^}]*display:none!important/,'Prime battle must hide launcher side navigation.');
assert.match(primeHtml,/body\.battle-active \.main[^}]*width:100vw!important/,'Prime battle must occupy the full viewport.');
assert.match(primeJs,/nextEnemyAttackAt:300/,'The first bot assault must be scheduled after five real-time minutes.');
assert.match(primeJs,/function alertEnemyBase\(\)/,'Player attacks must trigger a defensive response.');
assert.match(primeJs,/Math\.random\(\)<\.35/,'The counterattack must have the specified 35% chance.');
assert.match(primeJs,/function upgradeBotTower\(bot\)/,'Bots must have a real tower-upgrade routine.');assert.match(primeJs,/if\(bot\.id!==1\)return false/,'Only the shared enemy team base tower is upgraded.');
assert.match(primeJs,/function enemyDirector\(dt\)/,'Bots must have an active construction and economy director.');
assert.match(primeJs,/if\(!aggro&&!assault&&playerDistance>360\)/,'Bots must patrol until the player enters their 360-unit defensive radius.');
assert.match(primeJs,/const targets=tower\.team===0\?/,'Both sides towers must acquire opposing fighters in range.');
assert.match(primeJs,/nextBarracksAt/);assert.match(primeJs,/nextWallAt/);assert.match(primeJs,/nextUpgradeAt/);

function extractFunction(source,name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'Missing function '+name);
 const open=source.indexOf('{',start);let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
 for(let i=open;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(lineComment){if(c==='\\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
  if(quote){if(escaped){escaped=false;continue;}if(c==='\\\\'){escaped=true;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
  if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
  if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
 }
 throw new Error('Unclosed function '+name);
}
// Exercise the bot director: it builds and upgrades before the five-minute wave, then attacks on schedule.
const aiFunctions=['upgradeBotTower','enemyDirector','alertEnemyBase'].map(name=>extractFunction(primeJs,name));
const botProfile={name:'TestBot',coins:2200,towerLevel:1,elo:100};
const aiContext={
 Math:Object.assign(Object.create(Math),{random:()=>0.2}),
 TILE:32,SIZE:100,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
 upgradeCost:level=>500*level,renderTowerList:()=>{},updateHud:()=>{},
 createTower:(x,y,owner)=>({x,y,owner,team:1,level:owner.towerLevel,hp:1000,maxHp:1000,range:222,damage:11,fire:0,isTower:true}),
 spawnUnit:(team,x,y)=>{const unit={team,x,y,hp:100,alive:true};aiContext.match.units.push(unit);return unit;},
 match:{
  elapsed:130,nextEnemyAttackAt:300,enemyAssaultUntil:0,enemyAggroUntil:0,enemyDefenseBoostUntil:0,
  enemyCounterAt:0,enemyCounterQueued:false,nextCounterRollAt:1000,enemyNoticeUntil:0,enemyState:'',
  player:{x:3000,y:3000},team:1,units:[],walls:[],barracks:[],towers:[],
  bots:[{id:1,name:'TestBot',alive:true,x:900,y:500,profile:botProfile,ai:{nextUpgradeAt:35,nextBuildAt:25,nextBarracksAt:80,nextWallAt:110}}]
 }
};
aiContext.match.towers.push({x:800,y:400,owner:botProfile,team:1,level:1,hp:1000,maxHp:1000,range:222,damage:11,isTower:true});
vm.runInNewContext(aiFunctions.join('\n')+'\nglobalThis.aiDirector=enemyDirector;globalThis.aiAlert=alertEnemyBase;',aiContext);
aiContext.aiDirector(1);
assert.equal(botProfile.towerLevel,2,'Bot tower must upgrade from earned coins.');
assert.equal(aiContext.match.towers[0].level,2,'The visible bot tower must receive its upgrade.');
assert.equal(aiContext.match.towers.filter(t=>!t.kind).length,1,'The entire enemy team must have exactly one shared base tower.');
assert.ok(aiContext.match.towers.some(t=>t.kind==='archer'),'Bot should be able to build a separate rotated archer tower.');
assert.ok((aiContext.match.towers.find(t=>t.kind==='archer')?.rotation||0)% (Math.PI/2)===0,'Bot tower rotation must be snapped to 90 degrees.');
assert.equal(aiContext.match.barracks.length,1,'Bot must build a barracks.');
assert.equal(aiContext.match.walls.length,1,'Bot must reinforce its base.');
assert.equal(aiContext.match.units.length,0,'Bot must not attack immediately during the development phase.');
assert.equal(aiContext.match.enemyAssaultUntil,0,'No assault may occur before five minutes.');
aiContext.match.elapsed=299;aiContext.aiDirector(1);
assert.equal(aiContext.match.units.length,0,'The bot must still wait at 4:59.');
aiContext.match.elapsed=300;aiContext.aiDirector(1);
assert.ok(aiContext.match.units.some(u=>u.team===1),'The first scheduled five-minute wave must spawn troops.');
assert.equal(aiContext.match.nextEnemyAttackAt,600,'The next scheduled attack must be five minutes later.');
aiContext.match.elapsed=20;aiContext.match.nextCounterRollAt=0;aiContext.aiAlert();
assert.equal(aiContext.match.enemyAggroUntil,58,'Attacking the bot must trigger a defensive response.');
assert.equal(aiContext.match.enemyDefenseBoostUntil,60,'An early attack must strengthen the bot during the first minute.');
assert.equal(aiContext.match.enemyCounterQueued,true,'A bot with troops must perform the configured 35% counterattack roll.');
aiContext.match.elapsed=23;aiContext.aiDirector(1);
assert.ok(aiContext.match.units.filter(u=>u.team===1).length>=2,'A successful counterattack roll must release reserve troops.');

console.log('competitive-mode-test: all assertions passed');
