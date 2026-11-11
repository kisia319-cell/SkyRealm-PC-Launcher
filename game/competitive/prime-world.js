(() => {
'use strict';
const $=id=>document.getElementById(id), SAVE='primeLauncher.profile.v2', WORLD_SAVE='primeLauncher.world.v1', BOT_SAVE='primeLauncher.bots.v1';
const SIZE=190,TILE=32,UPGRADE_COST=500,upgradeCost=level=>UPGRADE_COST*level,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const botNames=['Рейвен','Фокс','Нокс','Вега','Шторм','Мира','Дрейк','Сайфер'];
let profile={elo:0,matches:0,wins:0,coins:0,towerLevel:1,history:[]};
let botsProfile=botNames.map((name,i)=>({name,elo:120+i*85,coins:0,towerLevel:1,wins:0}));
let worldMeta={seed:20261111,size:190,lastTeam:1,lastKind:'training'};
try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&Number.isFinite(s.elo))profile={...profile,...s};}catch(_){}
try{const b=JSON.parse(localStorage.getItem(BOT_SAVE)||'null');if(Array.isArray(b))botsProfile=botsProfile.map((x,i)=>({...x,...(b[i]||{})}));}catch(_){}
try{const w=JSON.parse(localStorage.getItem(WORLD_SAVE)||'null');if(w&&Number.isFinite(w.seed))worldMeta={...worldMeta,...w};}catch(_){}
profile.coins=Math.max(0,Number(profile.coins)||0);profile.towerLevel=Math.max(1,Number(profile.towerLevel)||1);
let teamSize=1,matchKind='training',scene='home',match=null,raf=0,lastFrame=0,pressed=new Set(),attackCooldown=0,searchTimer=0,fpsFrames=0,fpsElapsed=0,currentFps=0;
const pages=['home','rank','history','settings','menu','battle'];
function save(){localStorage.setItem(SAVE,JSON.stringify(profile));localStorage.setItem(BOT_SAVE,JSON.stringify(botsProfile));updateProfile();}
function updateProfile(){
 const coins=Math.floor(profile.coins);
 ['home-coins','rank-coins','battle-coins','nav-coins','top-coins'].forEach(id=>{const el=$(id);if(el)el.textContent=id==='nav-coins'?coins.toLocaleString('ru-RU'):coins.toLocaleString('ru-RU')+' ◆';});
 $('home-elo').textContent=profile.elo+' ELO';$('rank-elo').textContent=profile.elo+' ELO';$('nav-elo').textContent=profile.elo;
 $('home-tower').textContent='Уровень '+profile.towerLevel;$('rank-tower').textContent='Уровень '+profile.towerLevel;
 $('home-matches').textContent=profile.matches+' матчей';$('home-wins').textContent=profile.wins;
 $('battle-elo').textContent=profile.elo+' ELO';$('battle-tower').textContent='Уровень '+profile.towerLevel+' · '+(profile.towerLevel>=20?'MAX':upgradeCost(profile.towerLevel)+' ◆');
 const up=$('upgrade-tower');if(up){up.disabled=profile.coins<upgradeCost(profile.towerLevel)||profile.towerLevel>=20;up.textContent=profile.towerLevel>=20?'БАШНЯ МАКСИМАЛЬНОГО УРОВНЯ':'УЛУЧШИТЬ БАШНЮ · '+upgradeCost(profile.towerLevel)+' ◆';}
 renderLeaderboard();
}
function renderLeaderboard(){
 const root=$('leaderboard');if(!root)return;
 const rows=[{name:'Kisia',elo:profile.elo,towerLevel:profile.towerLevel,isPlayer:true},...botsProfile.map(b=>({...b,isPlayer:false}))].sort((a,b)=>b.elo-a.elo);
 root.innerHTML=rows.map((b,i)=>'<div class="bot" style="display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:12px"><b style="color:'+(i<3?'#ff9b62':'#aaa')+'">#'+(i+1)+'</b><span><b>'+b.name+(b.isPlayer?' · ВЫ':'')+'</b><br><small style="color:#999">Башня ур. '+b.towerLevel+'</small></span><strong>'+b.elo+' ELO</strong></div>').join('');
}
function show(page){
 scene=page;pages.forEach(p=>$(p+'-page').classList.toggle('hidden',p!==page));
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
 const level=isPlayer?profile.towerLevel:owner.towerLevel;
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
  const bp=botsProfile[i%botsProfile.length],x=player.x+Math.cos(angle)*radius,y=player.y+Math.sin(angle)*radius;
  const bot={id:i+1,team:1,x,y,hp:120+bp.towerLevel*12,maxHp:120+bp.towerLevel*12,speed:125+Math.random()*22,alive:true,attack:0,flash:0,elo:bp.elo,name:bp.name,profile:bp};
  bots.push(bot);
  const tx=clamp(x+Math.cos(angle)*125,TILE*2,SIZE*TILE-TILE*2),ty=clamp(y+Math.sin(angle)*125,TILE*2,SIZE*TILE-TILE*2);
  towers.push(createTower(tx,ty,bp,false));
 }
 worldMeta={...worldMeta,size:SIZE,lastTeam:teamSize,lastKind:matchKind};localStorage.setItem(WORLD_SAVE,JSON.stringify(worldMeta));
 match={player,bots,allies,towers,kind:'training',team:teamSize,started:performance.now(),finished:false,worldSeed:worldMeta.seed,botCoinTick:0};
 attackCooldown=0;pressed.clear();$('battle-title').textContent=(teamSize+' × '+teamSize)+' · ТРЕНИРОВКА';
 renderBotList();renderTowerList();$('hp-fill').style.width='100%';$('hp-label').textContent=player.hp+' / '+player.maxHp;updateProfile();show('battle');drawArena();
}
function renderBotList(){$('bot-list').innerHTML=match.bots.map(b=>'<div class="bot" id="bot-'+b.id+'"><b>'+b.name+'</b><br><span>'+b.elo+' ELO · '+b.profile.coins+' ◆</span><div class="hpbar" style="margin-top:6px"><span id="bot-hp-'+b.id+'" style="width:100%"></span></div></div>').join('');}
function renderTowerList(){
 $('enemy-towers').innerHTML='<small style="color:#ff9b62">БАШНИ СОПЕРНИКОВ</small>'+match.towers.filter(t=>t.team===1).map((t,i)=>'<div class="bot" id="tower-row-'+i+'">'+t.owner.name+' · ур. '+t.level+'<div class="hpbar" style="margin-top:6px"><span id="tower-hp-'+i+'" style="width:100%"></span></div></div>').join('');
}
function finish(win,abandoned=false){
 if(!match||match.finished)return;match.finished=true;stopLoop();pressed.clear();
 profile.matches++;if(win&&!abandoned)profile.wins++;
 profile.history.unshift({label:(win?'ПОБЕДА':'ПОРАЖЕНИЕ')+' · '+match.team+'×'+match.team,delta:'Тренировка · без изменения ELO',date:new Date().toLocaleDateString('ru-RU')});
 profile.history=profile.history.slice(0,30);save();
 $('result-title').textContent=win?'ПОБЕДА':'ПОРАЖЕНИЕ';
 $('result-copy').textContent='Тренировка завершена. ELO не изменён. Баланс: '+Math.floor(profile.coins)+' монет. Башня: уровень '+profile.towerLevel+'.';
 $('result-modal').classList.remove('hidden');
}
$('result-menu').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');});
$('result-again').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');beginSearch();});
$('leave-match').addEventListener('click',()=>{if(match)finish(false,true);});
$('upgrade-tower').addEventListener('click',()=>{
 if(profile.towerLevel>=20){$('tower-feedback').textContent='Башня уже максимального уровня.';return;}
 const cost=upgradeCost(profile.towerLevel);if(profile.coins<cost){$('tower-feedback').textContent='Не хватает '+Math.ceil(cost-profile.coins)+' монет.';return;}
 profile.coins-=cost;profile.towerLevel++;save();
 if(match){const t=match.towers.find(x=>x.isPlayer);if(t){t.level=profile.towerLevel;t.maxHp=560+t.level*180;t.hp=Math.min(t.maxHp,t.hp+180);t.range=210+t.level*12;t.damage=8+t.level*3;}}
 $('tower-feedback').textContent='Башня улучшена до уровня '+profile.towerLevel+'!';renderTowerList();drawArena();
});
function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}
function startLoop(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(loop);}
function loop(now){
 if(scene!=='battle'||!match||match.finished){raf=0;return;}
 const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;fpsFrames++;fpsElapsed+=dt;
 if(fpsElapsed>=1){currentFps=Math.round(fpsFrames/fpsElapsed);fpsFrames=0;fpsElapsed=0;$('performance-hud').innerHTML='fps= '+currentFps+'<br>ping= офлайн';}
 update(dt);drawArena();raf=requestAnimationFrame(loop);
}
function update(dt){
 const p=match.player;attackCooldown=Math.max(0,attackCooldown-dt);
 let dx=(pressed.has('KeyD')||pressed.has('ArrowRight')?1:0)-(pressed.has('KeyA')||pressed.has('ArrowLeft')?1:0);
 let dy=(pressed.has('KeyS')||pressed.has('ArrowDown')?1:0)-(pressed.has('KeyW')||pressed.has('ArrowUp')?1:0);
 if(dx||dy){const len=Math.hypot(dx,dy);p.x=clamp(p.x+dx/len*p.speed*dt,TILE,SIZE*TILE-TILE);p.y=clamp(p.y+dy/len*p.speed*dt,TILE,SIZE*TILE-TILE);}
 p.flash=Math.max(0,p.flash-dt);
 for(const ally of match.allies){
  if(!ally.alive)continue;ally.attack=Math.max(0,ally.attack-dt);ally.flash=Math.max(0,ally.flash-dt);
  const target=match.bots.filter(b=>b.alive).sort((a,b)=>Math.hypot(a.x-ally.x,a.y-ally.y)-Math.hypot(b.x-ally.x,b.y-ally.y))[0];
  if(target){const vx=target.x-ally.x,vy=target.y-ally.y,dist=Math.hypot(vx,vy)||1;if(dist>58){ally.x+=vx/dist*ally.speed*dt;ally.y+=vy/dist*ally.speed*dt;}else if(ally.attack<=0){ally.attack=.9;target.hp=Math.max(0,target.hp-19);target.flash=.14;if(target.hp<=0)target.alive=false;}}
 }
 for(const b of match.bots){
  if(!b.alive)continue;b.attack=Math.max(0,b.attack-dt);b.flash=Math.max(0,b.flash-dt);
  const playerTower=match.towers.find(t=>t.isPlayer),toTower=playerTower?Math.hypot(playerTower.x-b.x,playerTower.y-b.y):Infinity,toPlayer=Math.hypot(p.x-b.x,p.y-b.y),targetTower=playerTower&&playerTower.hp>0&&toTower<toPlayer+75;
  const tx=targetTower?playerTower.x:p.x,ty=targetTower?playerTower.y:p.y,vx=tx-b.x,vy=ty-b.y,dist=Math.hypot(vx,vy)||1;
  if(dist>(targetTower?48:40)){b.x+=vx/dist*b.speed*dt;b.y+=vy/dist*b.speed*dt;}
  else if(b.attack<=0){b.attack=1.05;if(targetTower)playerTower.hp=Math.max(0,playerTower.hp-(12+b.profile.towerLevel*2));else{p.hp=Math.max(0,p.hp-(7+b.profile.towerLevel));p.flash=.16;}}
 }
 for(const t of match.towers){
  if(t.hp<=0)continue;t.fire-=dt;if(t.fire>0)continue;
  const targets=t.team===0?match.bots.filter(b=>b.alive):[p,...match.allies.filter(a=>a.alive)];
  let target=null,best=t.range;for(const f of targets){const d=Math.hypot(f.x-t.x,f.y-t.y);if(d<best){best=d;target=f;}}
  if(target){t.fire=Math.max(.55,1.45-t.level*.035);if(target===p){p.hp=Math.max(0,p.hp-t.damage);p.flash=.12;}else{target.hp=Math.max(0,target.hp-t.damage);target.flash=.12;if(target.hp<=0)target.alive=false;}}
 }
 $('hp-fill').style.width=(p.hp/p.maxHp*100)+'%';$('hp-label').textContent=Math.ceil(p.hp)+' / '+p.maxHp;
 $('battle-coins').textContent=Math.floor(profile.coins)+' ◆';$('battle-tower').textContent='Уровень '+profile.towerLevel+' · '+(profile.towerLevel>=20?'MAX':upgradeCost(profile.towerLevel)+' ◆');
 for(const b of match.bots){const el=$('bot-hp-'+b.id);if(el)el.style.width=(b.hp/b.maxHp*100)+'%';const row=$('bot-'+b.id);if(row&&!b.alive)row.style.opacity='.35';}
 match.towers.filter(t=>t.team===1).forEach((t,i)=>{const el=$('tower-hp-'+i);if(el)el.style.width=(t.hp/t.maxHp*100)+'%';});
 const ownTower=match.towers.find(t=>t.isPlayer);if(p.hp<=0||(ownTower&&ownTower.hp<=0)){finish(false);return;}if(match.bots.every(b=>!b.alive)||match.towers.filter(t=>t.team===1).every(t=>t.hp<=0)){finish(true);return;}
}
function attack(){
 if(!match||match.finished||attackCooldown>0)return;attackCooldown=.42;
 const p=match.player;let target=null,best=92;
 for(const b of match.bots){if(!b.alive)continue;const d=Math.hypot(b.x-p.x,b.y-p.y);if(d<best){best=d;target=b;}}
 if(target){target.hp=Math.max(0,target.hp-34);target.flash=.18;if(target.hp<=0)target.alive=false;return;}
 for(const t of match.towers.filter(t=>t.team===1&&t.hp>0)){const d=Math.hypot(t.x-p.x,t.y-p.y);if(d<best){best=d;target=t;}}
 if(target&&target.isPlayer===false){target.hp=Math.max(0,target.hp-48);}
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
 match.towers.forEach(t=>drawTower(ctx,t,camX,camY));
 function fighter(f,isPlayer,isAlly=false){
  const x=f.x-camX,y=f.y-camY;
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(x,y+13,13,5,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=f.flash>0?'#fff':isPlayer?'#252d42':isAlly?'#183b62':'#42251c';ctx.fillRect(x-9,y-4,18,19);
  ctx.fillStyle=isPlayer?'#ff7a2b':isAlly?'#54aaff':'#d95a36';ctx.fillRect(x-8,y-4,16,4);
  ctx.fillStyle='#e8bd96';ctx.beginPath();ctx.arc(x,y-13,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2a2020';ctx.fillRect(x-8,y-21,16,6);ctx.fillStyle='#fff';ctx.fillRect(x+2,y-14,2,2);
  ctx.fillStyle='#fff';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText(isPlayer?'Kisia':f.name,x,y-29);
  if(!isPlayer){ctx.fillStyle='#1a0f0d';ctx.fillRect(x-17,y-37,34,4);ctx.fillStyle='#ff6428';ctx.fillRect(x-17,y-37,34*(f.hp/f.maxHp),4);}
 }
 match.bots.forEach(b=>{if(b.alive)fighter(b,false);});match.allies.forEach(a=>{if(a.alive)fighter(a,false,true);});fighter(p,true);
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
$('arena').addEventListener('pointerdown',e=>{if(scene==='battle'){$('arena').focus();attack();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pressed.clear();});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('beforeunload',()=>{if(searchTimer)clearInterval(searchTimer);stopLoop();});
updateProfile();
// Prime's local economy runs while the launcher is open, not only during a match.
window.setInterval(()=>{profile.coins+=5;for(const b of botsProfile){b.coins+=5;if(b.towerLevel<20&&b.coins>=upgradeCost(b.towerLevel)){b.coins-=upgradeCost(b.towerLevel);b.towerLevel++;b.elo+=8;}}if(match&&!match.finished){match.bots.forEach(b=>{b.elo=b.profile.elo;const t=match.towers.find(x=>x.owner===b.profile);if(t&&t.level!==b.profile.towerLevel){t.level=b.profile.towerLevel;t.maxHp=560+t.level*180;t.hp=Math.min(t.maxHp,t.hp+180);t.range=210+t.level*12;t.damage=8+t.level*3;}const row=$('bot-'+b.id);if(row)row.querySelector('span').textContent=b.elo+' ELO · '+b.profile.coins+' ◆';});}save();},1000);
})();