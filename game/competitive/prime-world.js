(() => {
'use strict';
const $=id=>document.getElementById(id), SAVE='primeLauncher.profile.v2', WORLD_SAVE='primeLauncher.world.v1';
const SIZE=190,TILE=32,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let profile={elo:0,matches:0,wins:0,history:[]};
let worldMeta={seed:20261111,size:190,lastTeam:1,lastKind:'ranked'};
try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&Number.isFinite(s.elo))profile={...profile,...s};}catch(_){}
try{const w=JSON.parse(localStorage.getItem(WORLD_SAVE)||'null');if(w&&Number.isFinite(w.seed))worldMeta={...worldMeta,...w};}catch(_){}
let teamSize=1,matchKind='ranked',scene='home',match=null,raf=0,lastFrame=0,pressed=new Set(),attackCooldown=0,searchTimer=0;
const pages=['home','rank','history','settings','menu','battle'];
function save(){localStorage.setItem(SAVE,JSON.stringify(profile));updateProfile();}
function updateProfile(){
 $('home-elo').textContent=profile.elo+' ELO';$('rank-elo').textContent=profile.elo+' ELO';$('nav-elo').textContent=profile.elo;
 $('home-matches').textContent=profile.matches;$('home-wins').textContent=profile.wins;$('battle-elo').textContent=profile.elo+' ELO';
 $('history-list').innerHTML=profile.history.length?profile.history.slice(0,20).map(m=>'<div class="bot" style="display:flex;justify-content:space-between"><b>'+m.label+'</b><span>'+m.delta+'</span><small>'+m.date+'</small></div>').join(''):'Матчей пока нет.';
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
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{matchKind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('selected',x===b));}));
function beginSearch(){
 $('find-match').disabled=true;$('search-box').classList.remove('hidden');
 const elo=profile.elo,low=Math.max(0,elo-200),high=elo+200;
 $('search-title').textContent='Поиск соперников...';
 $('search-detail').textContent=matchKind==='ranked'?'Подбираем ботов с рейтингом '+low+'–'+high+' ELO · онлайн отключён':'Подготавливаем тренировочных ботов · рейтинг не изменится';
 let ticks=0;searchTimer=window.setInterval(()=>{ticks++;$('search-title').textContent=['Поиск соперников...','Проверяем диапазон ELO...','Формируем команды...'][ticks%3];if(ticks>=3){clearInterval(searchTimer);createMatch();}},650);
}
$('find-match').addEventListener('click',beginSearch);
function createMatch(){
 $('search-box').classList.add('hidden');$('find-match').disabled=false;
 const canvas=$('arena'),w=canvas.width,h=canvas.height;
 const player={id:0,team:0,x:SIZE*TILE/2,y:SIZE*TILE/2,hp:100,maxHp:100,speed:190,alive:true,attack:0,flash:0};
 const bots=[],allies=[];
 for(let i=0;i<teamSize-1;i++){
  const offset=(i-(teamSize-2)/2)*62;
  allies.push({id:i+1,team:0,x:player.x-75+offset,y:player.y+65,hp:100,maxHp:100,speed:145,alive:true,attack:0,flash:0,name:['Страж','Искра'][i]||'Союзник '+(i+1)});
 }
 for(let i=0;i<teamSize;i++){
  const angle=-Math.PI/2+(i-(teamSize-1)/2)*.55;
  const radius=230+i*35;
  const elo=matchKind==='ranked'?Math.round(clamp(profile.elo+(Math.random()-.5)*400,0,profile.elo+200)):Math.round(100+Math.random()*300);
  bots.push({id:i+1,team:1,x:player.x+Math.cos(angle)*radius,y:player.y+Math.sin(angle)*radius,hp:100,maxHp:100,speed:125+Math.random()*22,alive:true,attack:0,flash:0,elo,name:['Рейвен','Фокс','Нокс'][i]||'Бот '+(i+1)});
 }
 worldMeta={...worldMeta,size:SIZE,lastTeam:teamSize,lastKind:matchKind};localStorage.setItem(WORLD_SAVE,JSON.stringify(worldMeta));
 match={player,bots,allies,kind:matchKind,team:teamSize,started:performance.now(),finished:false,worldSeed:worldMeta.seed};
 attackCooldown=0;pressed.clear();$('battle-title').textContent=(teamSize+' × '+teamSize)+' · '+(matchKind==='ranked'?'РЕЙТИНГ':'ТРЕНИРОВКА');
 renderBotList();$('hp-fill').style.width='100%';$('hp-label').textContent='100 / 100';show('battle');drawArena();
}
function renderBotList(){$('bot-list').innerHTML=match.bots.map(b=>'<div class="bot" id="bot-'+b.id+'"><b>'+b.name+'</b><br><span>'+b.elo+' ELO</span><div class="hpbar" style="margin-top:6px"><span id="bot-hp-'+b.id+'" style="width:100%"></span></div></div>').join('');}
function finish(win,abandoned=false){
 if(!match||match.finished)return;match.finished=true;stopLoop();pressed.clear();
 let delta=0;if(match.kind==='ranked'){delta=win?20:-14;if(abandoned)delta=-18;profile.elo=Math.max(0,profile.elo+delta);}
 profile.matches++;if(win&&!abandoned)profile.wins++;
 profile.history.unshift({label:(win?'ПОБЕДА':'ПОРАЖЕНИЕ')+' · '+match.team+'×'+match.team,delta:match.kind==='ranked'?(delta>0?'+'+delta:delta)+' ELO':'Без рейтинга',date:new Date().toLocaleDateString('ru-RU')});
 profile.history=profile.history.slice(0,30);save();
 $('result-title').textContent=win?'ПОБЕДА':'ПОРАЖЕНИЕ';
 $('result-copy').textContent=match.kind==='ranked'?'Рейтинг изменён на '+(delta>0?'+':'')+delta+' ELO. Текущий рейтинг: '+profile.elo+'.':'Тренировка завершена. Рейтинг не изменён.';
 $('result-modal').classList.remove('hidden');
}
$('result-menu').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');});
$('result-again').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');beginSearch();});
$('leave-match').addEventListener('click',()=>{if(match)finish(false,true);});
function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}
function startLoop(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(loop);}
function loop(now){
 if(scene!=='battle'||!match||match.finished){raf=0;return;}
 const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;update(dt);drawArena();raf=requestAnimationFrame(loop);
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
  const vx=p.x-b.x,vy=p.y-b.y,dist=Math.hypot(vx,vy)||1;
  if(dist>40){b.x+=vx/dist*b.speed*dt;b.y+=vy/dist*b.speed*dt;}
  else if(b.attack<=0){b.attack=1.05;p.hp=Math.max(0,p.hp-7);p.flash=.16;}
 }
 $('hp-fill').style.width=(p.hp/p.maxHp*100)+'%';$('hp-label').textContent=p.hp+' / '+p.maxHp;
 for(const b of match.bots){const el=$('bot-hp-'+b.id);if(el)el.style.width=(b.hp/b.maxHp*100)+'%';const row=$('bot-'+b.id);if(row&& !b.alive)row.style.opacity='.35';}
 if(p.hp<=0){finish(false);return;}if(match.bots.every(b=>!b.alive)){finish(true);return;}
}
function attack(){
 if(!match||match.finished||attackCooldown>0)return;attackCooldown=.42;
 const p=match.player;let target=null,best=92;
 for(const b of match.bots){if(!b.alive)continue;const d=Math.hypot(b.x-p.x,b.y-p.y);if(d<best){best=d;target=b;}}
 if(target){target.hp=Math.max(0,target.hp-34);target.flash=.18;if(target.hp<=0)target.alive=false;}
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
 function fighter(f,isPlayer,isAlly=false){
  const x=f.x-camX,y=f.y-camY;
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(x,y+13,13,5,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=f.flash>0?'#fff':isPlayer?'#252d42':isAlly?'#183b62':'#42251c';ctx.fillRect(x-9,y-4,18,19);
  ctx.fillStyle=isPlayer?'#ff7a2b':isAlly?'#54aaff':'#d95a36';ctx.fillRect(x-8,y-4,16,4);
  ctx.fillStyle='#e8bd96';ctx.beginPath();ctx.arc(x,y-13,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2a2020';ctx.fillRect(x-8,y-21,16,6);
  ctx.fillStyle='#fff';ctx.fillRect(x+2,y-14,2,2);
  ctx.fillStyle='#fff';ctx.font='11px Segoe UI';ctx.textAlign='center';ctx.fillText(isPlayer?'Kisia':f.name,x,y-29);
  if(!isPlayer){ctx.fillStyle='#1a0f0d';ctx.fillRect(x-17,y-37,34,4);ctx.fillStyle='#ff6428';ctx.fillRect(x-17,y-37,34*(f.hp/f.maxHp),4);}
 }
 match.bots.forEach(b=>{if(b.alive)fighter(b,false);});match.allies.forEach(a=>{if(a.alive)fighter(a,false,true);});fighter(p,true);
 ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(12,12,145,29);ctx.fillStyle='#fff';ctx.font='12px Segoe UI';ctx.textAlign='left';ctx.fillText('АРЕНА PRIME · 190 × 190',22,31);
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
$('arena').addEventListener('pointerdown',e=>{if(scene==='battle'){ $('arena').focus();attack();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pressed.clear();});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('beforeunload',()=>{if(searchTimer)clearInterval(searchTimer);stopLoop();});
updateProfile();
})();
