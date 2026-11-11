(() => {
'use strict';
const $=id=>document.getElementById(id), SAVE='primeLauncher.profile.v2', WORLD_SAVE='primeLauncher.world.v1', BOT_SAVE='primeLauncher.bots.v1';
const SIZE=190,TILE=32,UPGRADE_COST=500,upgradeCost=level=>UPGRADE_COST*level,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const botNames=['Рейвен','Фокс','Нокс','Вега','Шторм','Мира','Дрейк','Сайфер'];
let profile={elo:0,matches:0,wins:0,history:[]};
let botsProfile=botNames.map((name,i)=>({name,elo:120+i*85,coins:0,towerLevel:1,wins:0}));
let worldMeta={seed:20261111,size:190,lastTeam:1,lastKind:'training'};
try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&Number.isFinite(s.elo))profile={...profile,...s};}catch(_){}
try{const b=JSON.parse(localStorage.getItem(BOT_SAVE)||'null');if(Array.isArray(b))botsProfile=botsProfile.map((x,i)=>({...x,...(b[i]||{})}));}catch(_){}
try{const w=JSON.parse(localStorage.getItem(WORLD_SAVE)||'null');if(w&&Number.isFinite(w.seed))worldMeta={...worldMeta,...w};}catch(_){}
profile.history=Array.isArray(profile.history)?profile.history:[];
let teamSize=1,matchKind='training',scene='home',match=null,raf=0,lastFrame=0,pressed=new Set(),attackCooldown=0,searchTimer=0,fpsFrames=0,fpsElapsed=0,currentFps=0,buildMode=null;
const pages=['home','rank','history','settings','menu','battle'];
function save(){localStorage.setItem(SAVE,JSON.stringify({elo:profile.elo,matches:profile.matches,wins:profile.wins,history:profile.history}));localStorage.setItem(BOT_SAVE,JSON.stringify(botsProfile));updateProfile();}
function updateProfile(){
 const coins=match?Math.floor(match.playerCoins):0;
 ['home-coins','rank-coins','battle-coins','nav-coins','top-coins'].forEach(id=>{const el=$(id);if(el)el.textContent=id==='nav-coins'?coins.toLocaleString('ru-RU'):coins.toLocaleString('ru-RU')+' ◆';});
 $('home-elo').textContent=profile.elo+' ELO';$('rank-elo').textContent=profile.elo+' ELO';$('nav-elo').textContent=profile.elo;
 $('home-tower').textContent='Уровень '+match.playerTowerLevel;$('rank-tower').textContent='Уровень '+match.playerTowerLevel;
 $('home-matches').textContent=profile.matches+' матчей';$('home-wins').textContent=profile.wins;
 $('battle-elo').textContent=profile.elo+' ELO';$('battle-tower').textContent='Уровень '+match.playerTowerLevel+' · '+(match.playerTowerLevel>=20?'MAX':upgradeCost(match.playerTowerLevel)+' ◆');
 const up=$('upgrade-tower');if(up){up.disabled=!match||match.playerCoins<upgradeCost(match.playerTowerLevel)||match.playerTowerLevel>=20;up.textContent=!match?'УЛУЧШЕНИЕ ТОЛЬКО В БОЮ':match.playerTowerLevel>=20?'БАШНЯ МАКСИМАЛЬНОГО УРОВНЯ':'УЛУЧШИТЬ БАШНЮ · '+upgradeCost(match.playerTowerLevel)+' ◆';}
 renderLeaderboard();
}
function renderLeaderboard(){
 const root=$('leaderboard');if(!root)return;
 const rows=[{name:'Вы',elo:profile.elo,isPlayer:true}];
 root.innerHTML=rows.map((b,i)=>'<div class="bot" style="display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:12px"><b style="color:'+(i<3?'#ff9b62':'#aaa')+'">#'+(i+1)+'</b><span><b>'+b.name+(b.isPlayer?' · ВЫ':'')+'</b><br><small style="color:#999">Башня ур. '+b.towerLevel+'</small></span><strong>'+b.elo+' ELO</strong></div>').join('');
}
function show(page){
 scene=page;document.body.classList.toggle('battle-active',page==='battle');pages.forEach(p=>$(p+'-page').classList.toggle('hidden',p!==page));
 document.querySelectorAll('.nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 if(page==='battle'){$('arena').focus();startLoop();}else stopLoop();
}
document.querySelectorAll('.nav button[data-page]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.page)));
$('enter-prime').addEventListener('click',()=>show('menu'));
$('back-home').addEventListener('click',()=>show('home'));
document.querySelectorAll('[data-team]').forEach(b=>b.addEventListener('click',()=>{teamSize=Number(b.dataset.team);document.querySelectorAll('[data-team]').forEach(x=>x.classList.toggle('selected',x===b));}));
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{
 matchKind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('selected',x===b));
 if(matchKind==='online'){$('search-box').classList.remove('hidden');$('search-title').textContent='Онлайн-режим в доработке';$('search-detail').textContent='Зайдите в тренировку. Сетевой подбор игроков пока недоступен.';}
 else $('search-box').classList.add('hidden');
}));
function beginSearch(){
 if(matchKind==='online'){$('search-box').classList.remove('hidden');$('search-title').textContent='Онлайн-режим в доработке';$('search-detail').textContent='Зайдите в тренировку. Онлайн-матчи пока недоступны.';return;}
 $('find-match').disabled=true;$('search-box').classList.remove('hidden');
 $('search-title').textContent='Подготовка тренировочной арены...';$('search-detail').textContent='Подбираем ботов · ELO не меняется · +5 монет каждую секунду';
 let ticks=0;searchTimer=window.setInterval(()=>{ticks++;$('search-title').textContent=['Подготовка арены...','Расстановка башен...','Формируем команды...'][ticks%3];if(ticks>=3){clearInterval(searchTimer);createMatch();}},550);
}
$('find-match').addEventListener('click',beginSearch);
function createTower(x,y,owner,isPlayer=false){
 const level=isPlayer?(match?.playerTowerLevel||1):owner.towerLevel;
 return {x,y,owner,isPlayer,team:isPlayer?0:(owner.team===0?0:1),level,hp:560+level*180,maxHp:560+level*180,range:210+level*12,damage:8+level*3,fire:0};
}
function createMatch(){
 $('search-box').classList.add('hidden');$('find-match').disabled=false;
 const player={id:0,team:0,x:SIZE*TILE/2,y:SIZE*TILE/2,hp:130,maxHp:130,speed:190,alive:true,attack:0,flash:0};
 const allies=[],bots=[],towers=[];
 towers.push(createTower(player.x-230,player.y+155,profile,true));
 for(let i=0;i<teamSize-1;i++){
  const offset=(i-(teamSize-2)/2)*62;
  const ally={id:i+1,team:0,x:player.x-75+offset,y:player.y+65,hp:120,maxHp:120,speed:145,alive:true,attack:0,flash:0,name:['Страж','Искра'][i]||'Союзник '+(i+1)};
  allies.push(ally);towers.push(createTower(clamp(ally.x-72,TILE*2,SIZE*TILE-TILE*2),clamp(ally.y+80,TILE*2,SIZE*TILE-TILE*2),ally,false));
 }
 for(let i=0;i<teamSize;i++){
  const angle=-Math.PI/2+(i-(teamSize-1)/2)*.55,radius=230+i*35;
  const bp=botsProfile[i%botsProfile.length];bp.coins=Math.max(650,Number(bp.coins)||0);const x=player.x+Math.cos(angle)*radius,y=player.y+Math.sin(angle)*radius;
  const bot={id:i+1,team:1,x,y,hp:190+bp.towerLevel*20,maxHp:190+bp.towerLevel*20,speed:145+Math.random()*18,alive:true,attack:0,flash:0,elo:bp.elo,name:bp.name,profile:bp,ai:{nextUpgradeAt:38+Math.random()*18,nextBuildAt:24+Math.random()*18,nextBarracksAt:82+Math.random()*24,nextWallAt:118+Math.random()*32}};
  bots.push(bot);
  const tx=clamp(x+Math.cos(angle)*125,TILE*2,SIZE*TILE-TILE*2),ty=clamp(y+Math.sin(angle)*125,TILE*2,SIZE*TILE-TILE*2);
  towers.push(createTower(tx,ty,bp,false));
 }
 worldMeta={...worldMeta,size:SIZE,lastTeam:teamSize,lastKind:matchKind};localStorage.setItem(WORLD_SAVE,JSON.stringify(worldMeta));
 match={player,bots,allies,towers,walls:[],barracks:[],units:[],playerCoins:0,playerTowerLevel:1,kind:'training',team:teamSize,started:performance.now(),finished:false,worldSeed:worldMeta.seed,botCoinTick:0,elapsed:0,nextEnemyAttackAt:300,enemyAssaultUntil:0,enemyAggroUntil:0,enemyDefenseBoostUntil:0,playerHasEngaged:false,enemyCounterAt:0,enemyCounterQueued:false,nextCounterRollAt:0,enemyNoticeUntil:0,playerBaseLevel:1,unitCounter:0,enemyState:'РАЗВИВАЕТ БАЗУ'};
 attackCooldown=0;pressed.clear();$('battle-title').textContent=(teamSize+' × '+teamSize)+' · ТРЕНИРОВКА';
 renderBotList();renderTowerList();$('hp-fill').style.width='100%';$('hp-label').textContent=player.hp+' / '+player.maxHp;updateProfile();updateHud();show('battle');drawArena();
}
function renderBotList(){$('bot-list').innerHTML=match.bots.map(b=>'<div class="bot" id="bot-'+b.id+'"><b>'+b.name+'</b><br><span>Башня ур. '+b.profile.towerLevel+' · '+b.profile.coins+' ◆ · '+b.elo+' ELO</span><div class="hpbar" style="margin-top:6px"><span id="bot-hp-'+b.id+'" style="width:100%"></span></div></div>').join('');}
function renderTowerList(){
 $('enemy-towers').innerHTML='<small style="color:#ff9b62">БАШНИ СОПЕРНИКОВ</small>'+match.towers.filter(t=>t.team===1).map((t,i)=>'<div class="bot" id="tower-row-'+i+'">'+t.owner.name+' · ур. '+t.level+'<div class="hpbar" style="margin-top:6px"><span id="tower-hp-'+i+'" style="width:100%"></span></div></div>').join('');
}
function finish(win,abandoned=false){
 if(!match||match.finished)return;match.finished=true;stopLoop();pressed.clear();
 profile.matches++;if(win&&!abandoned)profile.wins++;const eloDelta=abandoned?0:(win?20+Math.floor(Math.random()*11):-(20+Math.floor(Math.random()*16)));profile.elo=Math.max(0,profile.elo+eloDelta);profile.history.unshift({label:(win?'ПОБЕДА':abandoned?'ВЫХОД':'ПОРАЖЕНИЕ')+' · '+match.team+'×'+match.team,delta:abandoned?'Без изменения ELO':(eloDelta>0?'+'+eloDelta+' ELO':eloDelta+' ELO'),eloDelta,date:new Date().toLocaleString('ru-RU'),opponents:match.bots.map(b=>b.name)});profile.history=profile.history.slice(0,100);match.playerCoins=0;save();
 $('result-title').textContent=win?'ПОБЕДА':'ПОРАЖЕНИЕ';
 $('result-copy').textContent='Матч завершён. Монеты обнулены. ELO: '+(eloDelta>0?'+'+eloDelta:eloDelta)+';
 $('result-modal').classList.remove('hidden');
}
$('result-menu').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');});
$('result-again').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');beginSearch();});
$('leave-match').addEventListener('click',()=>{if(match)finish(false,true);});
$('upgrade-tower').addEventListener('click',()=>{
 if(!match||match.finished){$('tower-feedback').textContent='Улучшать башни можно только во время боя.';return;}if(match.playerTowerLevel>=20){$('tower-feedback').textContent='Башня уже максимального уровня.';return;}
 const cost=upgradeCost(match.playerTowerLevel);if(match.playerCoins<cost){$('tower-feedback').textContent='Не хватает '+Math.ceil(cost-match.playerCoins)+' монет.';return;}
 match.playerCoins-=cost;match.playerTowerLevel++;
 if(match){const t=match.towers.find(x=>x.isPlayer);if(t){t.level=match.playerTowerLevel;t.maxHp=560+t.level*180;t.hp=Math.min(t.maxHp,t.hp+180);t.range=210+t.level*12;t.damage=8+t.level*3;}}
 $('tower-feedback').textContent='Башня улучшена до уровня '+match.playerTowerLevel+'!';renderTowerList();drawArena();
});
function formatMatchTime(seconds){
 const total=Math.max(0,Math.ceil(Number(seconds)||0));
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function updateHud(){
 if(!match)return;
 const q=id=>document.getElementById(id),m=match,coins=Math.floor(m.playerCoins),upgrade=upgradeCost(m.playerTowerLevel);
 q('hud-hp').textContent=Math.ceil(m.player.hp)+' / '+m.player.maxHp;
 q('hud-coins').textContent=coins.toLocaleString('ru-RU');
 q('hud-army').textContent=m.units.filter(u=>u.team===0&&u.alive).length;
 q('hud-base').textContent='БАЗА '+m.playerBaseLevel;
 q('hud-tower').textContent='БАШНЯ ур. '+match.playerTowerLevel;
 q('hud-elo').textContent=profile.elo+' ELO';
 const assault=m.enemyAssaultUntil>m.elapsed,defending=m.enemyAggroUntil>m.elapsed;
 const state=assault?'АТАКУЕТ ВОЛНОЙ':defending?(m.elapsed<60?'УСИЛЕННАЯ ОБОРОНА':'ОБОРОНЯЕТСЯ'):(m.elapsed<m.enemyNoticeUntil?m.enemyState:'РАЗВИВАЕТ БАЗУ');
 q('hud-bot-state').textContent='БОТ: '+state;
 q('hud-attack-timer').textContent=assault?'ВОЛНА · '+formatMatchTime(m.enemyAssaultUntil-m.elapsed):'АТАКА ЧЕРЕЗ '+formatMatchTime(m.nextEnemyAttackAt-m.elapsed);
 q('balance-value').textContent=coins.toLocaleString('ru-RU')+' ◆';
 q('balance-income').textContent='+5 ◆ / сек (только в этом бою)';
 q('balance-tower').textContent='Башня ур. '+match.playerTowerLevel;
 q('balance-next-upgrade').textContent=match.playerTowerLevel>=20?'Максимальный уровень':'Следующее улучшение: '+upgrade.toLocaleString('ru-RU')+' ◆';
 q('balance-troops').textContent=m.units.filter(u=>u.team===0&&u.alive).length+' воинов';
 q('balance-enemy').textContent=state+' · атака через '+formatMatchTime(m.nextEnemyAttackAt-m.elapsed);
 const upgradeButton=q('upgrade-tower');
 if(upgradeButton){upgradeButton.disabled=match.playerTowerLevel>=20||match.playerCoins<upgrade;upgradeButton.textContent=match.playerTowerLevel>=20?'Башня MAX':'Улучшить башню · '+upgrade+' ◆';}
 document.querySelectorAll('[data-build]').forEach(button=>{
  const cost={wall:150,tower:300,barracks:450}[button.dataset.build]||0;
  button.disabled=match.playerCoins<cost;
 });
}
function upgradeStructureAt(x,y){
 const m=match,items=[...m.walls,...m.barracks,...m.towers.filter(t=>t.team===0&&!t.isPlayer)];
 const o=items.find(v=>Math.hypot(v.x-x,v.y-y)<55);
 if(!o)return false;
 const cost=100*(o.level||1);
 if(match.playerCoins<cost){$('tower-feedback').textContent='Не хватает '+(cost-Math.floor(match.playerCoins))+' ◆ для улучшения.';return true;}
 match.playerCoins-=cost;o.level=(o.level||1)+1;o.maxHp=(o.maxHp||260)+120;o.hp=Math.min(o.maxHp,o.hp+120);
 if(o.damage)o.damage+=5;if(o.range)o.range+=22;
 $('tower-feedback').textContent='Постройка улучшена до уровня '+o.level+'.';
 save();updateHud();return true;
}
function spawnUnit(team,x,y){
 const u={team,x,y,hp:100,maxHp:100,damage:team===0?5:5/1.2,range:team===0?48:40,speed:team===0?125:125/1.2,attack:0,flash:0,alive:true,name:'Воин'};
 match.units.push(u);return u;
}
function alertEnemyBase(){
 const m=match;if(!m)return;
 m.playerHasEngaged=true;
 m.enemyAggroUntil=Math.max(m.enemyAggroUntil,m.elapsed+38);
 if(m.elapsed<60)m.enemyDefenseBoostUntil=Math.max(m.enemyDefenseBoostUntil,60);
 m.enemyState='ОБОРОНЯЕТСЯ';m.enemyNoticeUntil=m.elapsed+5;
 if(m.elapsed>=m.nextCounterRollAt){
  m.nextCounterRollAt=m.elapsed+45;
  const hasTroops=m.units.some(u=>u.team===1&&u.alive)||m.barracks.some(br=>br.team===1)||m.bots.some(b=>b.profile.coins>=100);
  m.enemyCounterQueued=hasTroops&&Math.random()<.35;
  m.enemyCounterAt=m.elapsed+3;
 }
}
function upgradeBotTower(bot){
 const b=bot.profile;
 if(!(b.towerLevel<20&&b.coins>=upgradeCost(b.towerLevel)))return false;
 b.coins-=upgradeCost(b.towerLevel);b.towerLevel++;b.elo+=8;
 match.towers.filter(t=>t.owner===b).forEach(t=>{
  t.level=b.towerLevel;t.maxHp=560+t.level*180;t.hp=Math.min(t.maxHp,t.hp+180);
  t.range=210+t.level*12;t.damage=8+t.level*3;
 });
 match.enemyState=bot.name+' улучшает башню';match.enemyNoticeUntil=match.elapsed+7;
 renderTowerList();return true;
}
function enemyDirector(dt){
 const m=match;if(!m)return;
 for(const bot of m.bots){
  const b=bot.profile,ai=bot.ai;
  if(!bot.alive)continue;
  if(m.elapsed>=ai.nextUpgradeAt){
   if(upgradeBotTower(bot))ai.nextUpgradeAt=m.elapsed+48+Math.random()*24;
   else ai.nextUpgradeAt=m.elapsed+8;
  }
  if(m.elapsed>=ai.nextBuildAt){
   const owned=m.towers.filter(t=>t.owner===b).length;
   if(b.coins>=300&&owned<2){
    b.coins-=300;const angle=Math.atan2(bot.y-m.player.y,bot.x-m.player.x);
    const x=clamp(bot.x+Math.cos(angle)*115,TILE*2,SIZE*TILE-TILE*2);
    const y=clamp(bot.y+Math.sin(angle)*115,TILE*2,SIZE*TILE-TILE*2);
    m.towers.push(createTower(x,y,b,false));ai.nextBuildAt=m.elapsed+92+Math.random()*28;
    m.enemyState=bot.name+' строит башню';m.enemyNoticeUntil=m.elapsed+7;renderTowerList();
   }else ai.nextBuildAt=m.elapsed+8;
  }
  if(m.elapsed>=ai.nextBarracksAt){
   const ownsBarracks=m.barracks.some(br=>br.team===1&&br.owner===b);
   if(b.coins>=450&&!ownsBarracks){
    b.coins-=450;const x=clamp(bot.x+76,TILE*2,SIZE*TILE-TILE*2),y=clamp(bot.y+60,TILE*2,SIZE*TILE-TILE*2);
    m.barracks.push({x,y,team:1,owner:b,level:1,hp:500,maxHp:500,timer:0});
    ai.nextBarracksAt=m.elapsed+240;m.enemyState=bot.name+' строит казарму';m.enemyNoticeUntil=m.elapsed+7;
   }else ai.nextBarracksAt=m.elapsed+10;
  }
  if(m.elapsed>=ai.nextWallAt){
   const ownWalls=m.walls.filter(w=>w.team===1&&w.owner===b).length;
   if(b.coins>=150&&ownWalls<3){
    b.coins-=150;m.walls.push({x:clamp(bot.x+Math.random()*100-50,TILE*2,SIZE*TILE-TILE*2),y:clamp(bot.y+Math.random()*100-50,TILE*2,SIZE*TILE-TILE*2),team:1,owner:b,level:1,hp:260,maxHp:260});
    ai.nextWallAt=m.elapsed+70+Math.random()*30;m.enemyState=bot.name+' укрепляет базу';m.enemyNoticeUntil=m.elapsed+6;
   }else ai.nextWallAt=m.elapsed+10;
  }
 }
 if(m.enemyCounterQueued&&m.elapsed>=m.enemyCounterAt){
  m.enemyCounterQueued=false;let spawned=0;
  for(const bot of m.bots.filter(b=>b.alive)){
   const barracks=m.barracks.find(br=>br.team===1&&br.owner===bot.profile);
   if(barracks){spawnUnit(1,barracks.x,barracks.y);spawned++;}
   else if(bot.profile.coins>=100){bot.profile.coins-=100;spawnUnit(1,bot.x,bot.y+35);spawned++;}
   if(spawned>=Math.max(1,m.team))break;
  }
  if(spawned){m.enemyAssaultUntil=Math.max(m.enemyAssaultUntil,m.elapsed+34);m.enemyState='КОНТРАТАКА';m.enemyNoticeUntil=m.elapsed+8;}
 }
 if(m.elapsed>=m.nextEnemyAttackAt){
  m.enemyAssaultUntil=m.elapsed+48;m.nextEnemyAttackAt=Math.max(m.nextEnemyAttackAt+300,m.elapsed+300);
  m.enemyState='АТАКА СОПЕРНИКА';m.enemyNoticeUntil=m.elapsed+8;
  for(const bot of m.bots.filter(b=>b.alive)){
   const waveSize=Math.min(3,1+Math.floor(bot.match.playerTowerLevel/5));
   for(let i=0;i<waveSize;i++){
    const cost=100;
    if(bot.profile.coins>=cost){bot.profile.coins-=cost;spawnUnit(1,bot.x+(i-1)*22,bot.y+42);}
   }
  }
 }
 const aggro=m.enemyAggroUntil>m.elapsed,assault=m.enemyAssaultUntil>m.elapsed;
 for(const br of m.barracks){
  if(br.team===0||aggro||assault){
   br.timer=(br.timer||0)+dt;
   if(br.timer>18){br.timer=0;spawnUnit(br.team,br.x,br.y);}
  }
 }
 if(!aggro&&!assault&&m.elapsed>=m.enemyNoticeUntil)m.enemyState='РАЗВИВАЕТ БАЗУ';
 updateHud();
}
function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}
function startLoop(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(loop);}
function loop(now){
 if(scene!=='battle'||!match||match.finished){raf=0;return;}
 const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;fpsFrames++;fpsElapsed+=dt;
 if(fpsElapsed>=1){currentFps=Math.round(fpsFrames/fpsElapsed);fpsFrames=0;fpsElapsed=0;$('performance-hud').innerHTML='fps= '+currentFps+'<br>ping= офлайн';}
 update(dt);drawArena();raf=requestAnimationFrame(loop);
}
function update(dt){
 const p=match.player;match.elapsed+=dt;match.botCoinTick+=dt;if(match.botCoinTick>=1){const n=Math.floor(match.botCoinTick);match.botCoinTick-=n;match.playerCoins+=n*5;for(const b of match.bots)b.profile.coins+=n*5;}enemyDirector(dt);attackCooldown=Math.max(0,attackCooldown-dt);
 let dx=(pressed.has('KeyD')||pressed.has('ArrowRight')?1:0)-(pressed.has('KeyA')||pressed.has('ArrowLeft')?1:0);
 let dy=(pressed.has('KeyS')||pressed.has('ArrowDown')?1:0)-(pressed.has('KeyW')||pressed.has('ArrowUp')?1:0);
 if(dx||dy){const len=Math.hypot(dx,dy);p.x=clamp(p.x+dx/len*p.speed*dt,TILE,SIZE*TILE-TILE);p.y=clamp(p.y+dy/len*p.speed*dt,TILE,SIZE*TILE-TILE);}
 p.flash=Math.max(0,p.flash-dt);
 for(const ally of match.allies){
  if(!ally.alive)continue;ally.attack=Math.max(0,ally.attack-dt);ally.flash=Math.max(0,ally.flash-dt);
  if(!match.playerHasEngaged&&match.enemyAssaultUntil<=match.elapsed){const dx=p.x-ally.x,dy=p.y-ally.y,dist=Math.hypot(dx,dy)||1;if(dist>78){ally.x+=dx/dist*ally.speed*.78*dt;ally.y+=dy/dist*ally.speed*.78*dt;}continue;}
  const target=match.bots.filter(b=>b.alive).sort((a,b)=>Math.hypot(a.x-ally.x,a.y-ally.y)-Math.hypot(b.x-ally.x,b.y-ally.y))[0];
  if(target){const vx=target.x-ally.x,vy=target.y-ally.y,dist=Math.hypot(vx,vy)||1;if(dist>58){ally.x+=vx/dist*ally.speed*dt;ally.y+=vy/dist*ally.speed*dt;}else if(ally.attack<=0){ally.attack=.9;alertEnemyBase();target.hp=Math.max(0,target.hp-19);target.flash=.14;if(target.hp<=0)target.alive=false;}}
 }
 for(const b of match.bots){
  if(!b.alive)continue;
  const aggro=match.enemyAggroUntil>match.elapsed,assault=match.enemyAssaultUntil>match.elapsed;
  if(!aggro&&!assault)continue;
  b.attack=Math.max(0,b.attack-dt);b.flash=Math.max(0,b.flash-dt);
  const playerTower=match.towers.find(t=>t.isPlayer),toTower=playerTower?Math.hypot(playerTower.x-b.x,playerTower.y-b.y):Infinity,toPlayer=Math.hypot(p.x-b.x,p.y-b.y),targetTower=playerTower&&playerTower.hp>0&&toTower<toPlayer+75;
  const tx=targetTower?playerTower.x:p.x,ty=targetTower?playerTower.y:p.y,vx=tx-b.x,vy=ty-b.y,dist=Math.hypot(vx,vy)||1;
  const earlyBoost=match.elapsed<60&&match.enemyDefenseBoostUntil>match.elapsed?1.2:1;
  if(dist>(targetTower?48:40)){b.x=clamp(b.x+vx/dist*b.speed*earlyBoost*dt,TILE,SIZE*TILE-TILE);b.y=clamp(b.y+vy/dist*b.speed*earlyBoost*dt,TILE,SIZE*TILE-TILE);}
  else if(b.attack<=0){b.attack=.88;if(targetTower)playerTower.hp=Math.max(0,playerTower.hp-(15+b.profile.towerLevel*2)*earlyBoost);else{p.hp=Math.max(0,p.hp-(12+b.profile.towerLevel*2)*earlyBoost);p.flash=.16;}}
 }
 for(const u of match.units){if(!u.alive)continue;u.attack=Math.max(0,u.attack-dt);const foes=u.team===0?[...match.bots.filter(b=>b.alive),...match.units.filter(v=>v.team===1&&v.alive)]:[p,...match.allies.filter(a=>a.alive),...match.units.filter(v=>v.team===0&&v.alive)];let foe=null,near=Infinity;for(const f of foes){const d=Math.hypot(f.x-u.x,f.y-u.y);if(d<near){near=d;foe=f;}}if(foe){if(near>u.range){u.x+=(foe.x-u.x)/near*u.speed*dt;u.y+=(foe.y-u.y)/near*u.speed*dt;}else if(u.attack<=0){u.attack=1.1;foe.hp=Math.max(0,foe.hp-u.damage);foe.flash=.14;if(foe.hp<=0)foe.alive=false;}}}
 for(const t of match.towers){
  if(t.hp<=0)continue;
  if(t.team===1&&match.enemyAggroUntil<=match.elapsed&&match.enemyAssaultUntil<=match.elapsed)continue;
  t.fire-=dt;if(t.fire>0)continue;
  const targets=t.team===0?match.bots.filter(b=>b.alive):[p,...match.allies.filter(a=>a.alive),...match.units.filter(u=>u.team===0&&u.alive)];
  let target=null,best=t.range;for(const f of targets){const d=Math.hypot(f.x-t.x,f.y-t.y);if(d<best){best=d;target=f;}}
  if(target){t.fire=Math.max(.55,1.45-t.level*.035);if(target===p){p.hp=Math.max(0,p.hp-t.damage);p.flash=.12;}else{if(t.team===0&&target.team===1)alertEnemyBase();target.hp=Math.max(0,target.hp-t.damage);target.flash=.12;if(target.hp<=0)target.alive=false;}}
 }
 $('hp-fill').style.width=(p.hp/p.maxHp*100)+'%';$('hp-label').textContent=Math.ceil(p.hp)+' / '+p.maxHp;
 $('battle-coins').textContent=Math.floor(match.playerCoins)+' ◆';$('battle-tower').textContent='Уровень '+match.playerTowerLevel+' · '+(match.playerTowerLevel>=20?'MAX':upgradeCost(match.playerTowerLevel)+' ◆');
 for(const b of match.bots){const el=$('bot-hp-'+b.id);if(el)el.style.width=(b.hp/b.maxHp*100)+'%';const row=$('bot-'+b.id);if(row&&!b.alive)row.style.opacity='.35';}
 match.towers.filter(t=>t.team===1).forEach((t,i)=>{const el=$('tower-hp-'+i);if(el)el.style.width=(t.hp/t.maxHp*100)+'%';});
 const ownTower=match.towers.find(t=>t.isPlayer);if(p.hp<=0||(ownTower&&ownTower.hp<=0)){finish(false);return;}if(match.bots.every(b=>!b.alive)||match.towers.filter(t=>t.team===1).every(t=>t.hp<=0)){finish(true);return;}
}
function attack(){
 if(!match||match.finished||attackCooldown>0)return;attackCooldown=.42;
 const p=match.player;let target=null,best=92;
 for(const b of match.bots){if(!b.alive)continue;const d=Math.hypot(b.x-p.x,b.y-p.y);if(d<best){best=d;target=b;}}
 if(target){alertEnemyBase();target.hp=Math.max(0,target.hp-34);target.flash=.18;if(target.hp<=0)target.alive=false;return;}
 for(const t of match.towers.filter(t=>t.team===1&&t.hp>0)){const d=Math.hypot(t.x-p.x,t.y-p.y);if(d<best){best=d;target=t;}}
 if(target&&target.isPlayer===false){alertEnemyBase();target.hp=Math.max(0,target.hp-48);}
}
function drawTower(ctx,t,camX,camY){
 const x=t.x-camX,y=t.y-camY,l=t.level,scale=1+Math.min(8,l-1)*.055;
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,25,43,13,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#25282d';ctx.beginPath();ctx.moveTo(-35,20);ctx.lineTo(-29,-7);ctx.lineTo(-23,-24);ctx.lineTo(23,-24);ctx.lineTo(29,-7);ctx.lineTo(35,20);ctx.closePath();ctx.fill();
 ctx.fillStyle='#62666b';ctx.fillRect(-29,-9,58,28);ctx.fillStyle='#85878a';ctx.fillRect(-24,-15,48,8);ctx.fillStyle='#3c4148';ctx.fillRect(-19,-39,38,27);
 ctx.fillStyle='#9a9b9c';for(let i=-2;i<=2;i++)ctx.fillRect(i*11-3,-45,6,8);
 ctx.fillStyle='#171a20';ctx.fillRect(-9,-31,18,22);ctx.fillStyle=t.team===0?'#ff762b':'#cf4935';ctx.fillRect(-4,-26,8,13);
 ctx.fillStyle='#bfc1c4';ctx.fillRect(-39,-2,9,23);ctx.fillRect(30,-2,9,23);ctx.fillRect(-15,-53,30,8);
 ctx.fillStyle=t.team===0?'#ff8a36':'#e45b42';ctx.beginPath();ctx.moveTo(0,-75);ctx.lineTo(0,-53);ctx.lineTo(19,-59);ctx.lineTo(0,-65);ctx.fill();
 ctx.fillStyle='#111';ctx.fillRect(-29,31,58,5);ctx.fillStyle='#ff6435';ctx.fillRect(-29,31,58*Math.max(0,t.hp/t.maxHp),5);
 ctx.fillStyle='#fff';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText((t.isPlayer?'ТВОЯ БАШНЯ':t.team===0?'СОЮЗНАЯ БАШНЯ':t.owner.name)+' · ур.'+l,0,-83);
 ctx.restore();
}
function drawArena(){
 const c=$('arena'),ctx=c.getContext('2d'),w=c.width,h=c.height;if(!ctx)return;
 const p=match.player,camX=p.x-w/2,camY=p.y-h/2;
 ctx.fillStyle='#315c38';ctx.fillRect(0,0,w,h);
 const x0=Math.max(0,Math.floor(camX/TILE)),y0=Math.max(0,Math.floor(camY/TILE)),x1=Math.min(SIZE,Math.ceil((camX+w)/TILE)+1),y1=Math.min(SIZE,Math.ceil((camY+h)/TILE)+1);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const n=(x*17+y*31+(x*y)%23+match.worldSeed)%9;
  ctx.fillStyle=['#568d4b','#5b934f','#609853','#548849','#639b55','#5a914d','#5d9551','#568c49','#629651'][n];
  const sx=x*TILE-camX,sy=y*TILE-camY;ctx.fillRect(sx,sy,TILE+1,TILE+1);
  ctx.fillStyle='rgba(255,255,255,.055)';ctx.fillRect(sx+3,sy+3,7,2);ctx.fillRect(sx+20,sy+19,5,2);
  ctx.fillStyle='rgba(21,54,35,.18)';ctx.strokeRect(sx+.5,sy+.5,TILE,TILE);
  if((x*13+y*7+match.worldSeed)%47===0){ctx.fillStyle='#b9c77a';ctx.fillRect(sx+14,sy+12,3,3);}
 }
 match.walls.forEach(w=>{const x=w.x-camX,y=w.y-camY;ctx.fillStyle='#252a31';ctx.fillRect(x-25,y-10,50,22);ctx.fillStyle='#8b929b';ctx.fillRect(x-23,y-14,46,6);ctx.fillStyle=w.team===0?'#ff873d':'#d65b4a';ctx.fillRect(x-25,y+14,50*Math.max(0,w.hp/w.maxHp),4);ctx.fillStyle='#fff';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText('СТЕНА ур.'+w.level,x,y-20);});match.barracks.forEach(b=>{const x=b.x-camX,y=b.y-camY;ctx.fillStyle='#49372b';ctx.fillRect(x-22,y-20,44,38);ctx.fillStyle='#9a6a43';ctx.beginPath();ctx.moveTo(x-27,y-20);ctx.lineTo(x,y-42);ctx.lineTo(x+27,y-20);ctx.fill();ctx.fillStyle='#ff9b62';ctx.fillRect(x-5,y-8,10,26);ctx.fillStyle='#fff';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText('КАЗАРМА ур.'+b.level,x,y-47);});match.towers.forEach(t=>drawTower(ctx,t,camX,camY));
 function fighter(f,isPlayer,isAlly=false){
  const x=f.x-camX,y=f.y-camY;
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(x,y+13,13,5,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=f.flash>0?'#fff':isPlayer?'#252d42':isAlly?'#183b62':'#42251c';ctx.fillRect(x-9,y-4,18,19);
  ctx.fillStyle=isPlayer?'#ff7a2b':isAlly?'#54aaff':'#d95a36';ctx.fillRect(x-8,y-4,16,4);
  ctx.fillStyle='#e8bd96';ctx.beginPath();ctx.arc(x,y-13,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2a2020';ctx.fillRect(x-8,y-21,16,6);ctx.fillStyle='#fff';ctx.fillRect(x-3,y-15,2,2);ctx.fillRect(x+3,y-15,2,2);ctx.fillStyle='#39221c';ctx.fillRect(x-2,y-8,4,1);
  ctx.fillStyle='#fff';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText(isPlayer?'Kisia':f.name,x,y-29);
  if(!isPlayer){ctx.fillStyle='#1a0f0d';ctx.fillRect(x-17,y-37,34,4);ctx.fillStyle='#ff6428';ctx.fillRect(x-17,y-37,34*(f.hp/f.maxHp),4);}
 }
 match.bots.forEach(b=>{if(b.alive)fighter(b,false);});match.allies.forEach(a=>{if(a.alive)fighter(a,false,true);});match.units.forEach(u=>{if(u.alive){fighter(u,false,u.team===0);}});fighter(p,true);
 ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(12,12,175,29);ctx.fillStyle='#fff';ctx.font='12px Segoe UI';ctx.textAlign='left';ctx.fillText('АРЕНА PRIME · 190 × 190',22,31);
}
function keyDirection(code){return ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code);}
window.addEventListener('keydown',e=>{
 if(scene!=='battle')return;
 if(keyDirection(e.code)){pressed.add(e.code);e.preventDefault();e.stopPropagation();}
 else if(e.code==='Space'){e.preventDefault();attack();}
 else if(e.code==='Escape'){e.preventDefault();finish(false,true);}
},true);
window.addEventListener('keyup',e=>{pressed.delete(e.code);},true);
window.addEventListener('blur',()=>pressed.clear());
$('arena').addEventListener('pointerdown',e=>{
 if(scene!=='battle'||!match)return;
 const rect=$('arena').getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*$('arena').width,y=(e.clientY-rect.top)/rect.height*$('arena').height;
 const wx=x+match.player.x-$('arena').width/2,wy=y+match.player.y-$('arena').height/2;
 if(buildMode){
  const costs={wall:150,tower:300,barracks:450},cost=costs[buildMode]||0;
  if(wx<TILE*2||wy<TILE*2||wx>SIZE*TILE-TILE*2||wy>SIZE*TILE-TILE*2){$('tower-feedback').textContent='Слишком близко к краю карты. Выбери место внутри арены.';}
  else if(match.playerCoins<cost){$('tower-feedback').textContent='Не хватает '+(cost-Math.floor(match.playerCoins))+' ◆ для постройки.';}
  else if(Math.hypot(wx-match.player.x,wy-match.player.y)<85||[...match.walls,...match.barracks,...match.towers].some(o=>Math.hypot(o.x-wx,o.y-wy)<75)){$('tower-feedback').textContent='Это место занято. Выбери свободную площадку.';}
  else{
   match.playerCoins-=cost;
   if(buildMode==='wall')match.walls.push({x:wx,y:wy,team:0,level:1,hp:260,maxHp:260});
   if(buildMode==='tower')match.towers.push({...createTower(wx,wy,profile,true),team:0,kind:'archer'});
   if(buildMode==='barracks')match.barracks.push({x:wx,y:wy,team:0,level:1,hp:500,maxHp:500,timer:0});
   $('tower-feedback').textContent=(buildMode==='wall'?'Стена':buildMode==='tower'?'Башня лучника':'Казарма')+' построена.';
   save();renderTowerList();
  }
  buildMode=null;$('build-panel').classList.add('hidden');
 }else if(!upgradeStructureAt(wx,wy))attack();
 updateHud();$('arena').focus();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pressed.clear();});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('beforeunload',()=>{if(searchTimer)clearInterval(searchTimer);stopLoop();});
$('build-toggle').addEventListener('click',()=>{$('balance-panel').classList.add('hidden');$('bot-info-panel').classList.add('hidden');$('build-panel').classList.toggle('hidden');});
$('balance-toggle').addEventListener('click',()=>{$('build-panel').classList.add('hidden');$('bot-info-panel').classList.add('hidden');$('balance-panel').classList.toggle('hidden');updateHud();});
$('bot-info-toggle').addEventListener('click',()=>{$('build-panel').classList.add('hidden');$('balance-panel').classList.add('hidden');$('bot-info-panel').classList.toggle('hidden');});
$('build-cancel').addEventListener('click',()=>{buildMode=null;$('build-panel').classList.add('hidden');$('tower-feedback').textContent='Выбор постройки отменён.';});
document.querySelectorAll('[data-build]').forEach(b=>b.addEventListener('click',()=>{buildMode=b.dataset.build;$('build-panel').classList.add('hidden');$('tower-feedback').textContent='Выбрано строительство. Нажми на свободное место арены.';}));
$('train-unit').addEventListener('click',()=>{if(!match)return;const br=match.barracks.find(x=>x.team===0);if(!br){buildMode='barracks';$('build-panel').classList.remove('hidden');$('tower-feedback').textContent='Сначала построй казарму: выбери «Дом воинов» и место на арене.';return;}if(match.playerCoins<100){$('tower-feedback').textContent='Для найма воина нужно 100 ◆.';return;}match.playerCoins-=100;spawnUnit(0,br.x,br.y);updateHud();});
updateProfile();
// Economy accrues outside battles.
window.setInterval(()=>{if(!match||match.finished){match.playerCoins+=5;for(const b of botsProfile)b.coins+=5;}if(match&&!match.finished){match.bots.forEach(b=>{b.elo=b.profile.elo;const row=$('bot-'+b.id);if(row)row.querySelector('span').textContent='Башня ур. '+b.profile.towerLevel+' · '+b.profile.coins+' ◆ · '+b.elo+' ELO';});updateHud();}save();},1000);
})();