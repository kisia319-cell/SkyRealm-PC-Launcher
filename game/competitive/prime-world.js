(() => {
'use strict';
const $=id=>document.getElementById(id), SAVE='primeLauncher.profile.v2', WORLD_SAVE='primeLauncher.world.v1', BOT_SAVE='primeLauncher.bots.v1';
const SIZE=100,TILE=32,WATER_BORDER=15,ENEMY_BASE_DISTANCE_BLOCKS=40,UPGRADE_COST=500,COINS_PER_SECOND=10,SPRINT_MULTIPLIER=1.65,upgradeCost=level=>UPGRADE_COST*level,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SKYREALM_DEFAULT_LOOK={skin:'#e8b88c',hair:'#352d3d',armor:'#526fba',accent:'#9cb9ff',eye:'#26334c',face:'normal',hairStyle:'short'};
const botNames=['Рейвен','Фокс','Нокс','Вега','Шторм','Мира','Дрейк','Сайфер'];
let profile={elo:0,matches:0,wins:0,history:[]};
let botsProfile=botNames.map((name,i)=>({name,elo:120+i*85,coins:0,towerLevel:1,wins:0}));
let worldMeta={seed:20261111,size:100,lastTeam:1,lastKind:'training'};
try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&Number.isFinite(s.elo))profile={...profile,...s};}catch(_){}
try{const b=JSON.parse(localStorage.getItem(BOT_SAVE)||'null');if(Array.isArray(b))botsProfile=botsProfile.map((x,i)=>({...x,...(b[i]||{})}));}catch(_){}
try{const w=JSON.parse(localStorage.getItem(WORLD_SAVE)||'null');if(w&&Number.isFinite(w.seed))worldMeta={...worldMeta,...w};}catch(_){}
profile.history=Array.isArray(profile.history)?profile.history:[];
let teamSize=1,matchKind='training',scene='home',match=null,raf=0,lastFrame=0,pressed=new Set(),attackCooldown=0,searchTimer=0,fpsFrames=0,fpsElapsed=0,currentFps=0,buildMode=null,buildRotation=0;
const pages=['home','rank','history','settings','menu','battle'];
function save(){localStorage.setItem(SAVE,JSON.stringify({elo:profile.elo,matches:profile.matches,wins:profile.wins,history:profile.history}));localStorage.setItem(BOT_SAVE,JSON.stringify(botsProfile));updateProfile();}
function updateProfile(){
 const coins=match?Math.floor(match.playerCoins):0;
 ['home-coins','rank-coins','battle-coins','nav-coins','top-coins'].forEach(id=>{const el=$(id);if(el)el.textContent=id==='nav-coins'?coins.toLocaleString('ru-RU'):coins.toLocaleString('ru-RU')+' ◆';});
 $('home-elo').textContent=profile.elo+' ELO';$('rank-elo').textContent=profile.elo+' ELO';$('nav-elo').textContent=profile.elo;
 $('home-tower').textContent='Только в бою';$('rank-tower').textContent='Только в бою';
 $('home-matches').textContent=profile.matches+' матчей';$('home-wins').textContent=profile.wins;
 $('battle-elo').textContent=profile.elo+' ELO';$('battle-tower').textContent='Уровень '+(match?.playerTowerLevel||1);
 const up=$('upgrade-tower');if(up){up.disabled=!match||match.playerCoins<upgradeCost(match.playerTowerLevel)||match.playerTowerLevel>=20;up.textContent=!match?'УЛУЧШЕНИЕ ТОЛЬКО В БОЮ':match.playerTowerLevel>=20?'БАШНЯ МАКСИМАЛЬНОГО УРОВНЯ':'УЛУЧШИТЬ БАШНЮ · '+upgradeCost(match.playerTowerLevel)+' ◆ · +300 HP';}
 renderLeaderboard();
}
function renderLeaderboard(){
 const root=$('leaderboard');if(!root)return;
 const rows=[{name:'Вы',elo:profile.elo,isPlayer:true}];
 root.innerHTML=rows.map((b,i)=>'<div class="bot" style="display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:12px"><b>#'+(i+1)+'</b><span><b>'+b.name+' · ВЫ</b><br><small>Личный рейтинг</small></span><strong>'+b.elo+' ELO</strong></div>').join('');
}
function renderHistory(){const root=$('history-list');if(!root)return;if(!profile.history.length){root.textContent='Матчей пока нет.';return;}root.innerHTML=profile.history.map((h,i)=>'<div class="bot" style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px;margin:8px 0"><span><b>'+(h.label||'Матч')+'</b><br><small>'+String(h.date||'')+'</small><br><small>Соперники: '+(Array.isArray(h.opponents)?h.opponents.join(', '):'—')+'</small></span><strong>'+String(h.delta||'')+'</strong></div>').join('');}

const PRIME_LANG_KEY='primeLauncher.language.v1';
const PRIME_EN={
'Главная':'Home','Топ рейтинга':'Leaderboard','История матчей':'Match history','Настройки':'Settings',
'Войти в Prime':'Enter Prime','Настройки Prime':'Prime settings','Язык интерфейса':'Interface language',
'Русский':'Russian','Матчей пока нет.':'No matches yet.','Последние 100 результатов с датой и изменением ELO.':'Last 100 results with date and ELO change.',
'Здесь отображаются только игроки. Тренировочные боты не участвуют в рейтинге. Онлайн-таблица появится после запуска серверного подбора.':'Only players appear here. Training bots are excluded. Online rankings require server matchmaking.',
'Экономика матча: +10 монет в секунду только во время боя. Монеты и уровни построек сбрасываются после матча. Улучшения доступны только на арене.':'Match economy: +10 coins per second during battle only. Coins and structure levels reset after each match. Upgrades are available only in battle.',
'Победа':'Victory','Поражение':'Defeat','В бой':'Battle','В меню':'Menu','Строительство':'Build','Баланс':'Balance','Улучшить башню':'Upgrade tower',
'Монеты действуют только в текущем бою':'Coins are valid only in the current match','Матчевый уровень':'Match level',
'Управление: WASD или стрелки · Бег: Shift · Атака: пробел / левая кнопка мыши · Поворот постройки: R · Выход: Esc · Полный экран: F11.':'Controls: WASD or arrows · Sprint: Shift · Attack: Space / left mouse button · Rotate building: R · Leave: Esc · Fullscreen: F11.',
'Онлайн-режим временно недоступен: при выборе он покажет сообщение о доработке. Играть сейчас можно только в тренировке с ботами.':'Online mode is not available yet. You can currently play training matches against bots.',
'ТВОЙ РЕЙТИНГ':'YOUR RATING','БАЛАНС':'BALANCE','ТВОЯ БАШНЯ':'YOUR TOWER','ПРОГРЕСС':'PROGRESS','ПОБЕДЫ':'WINS','МАТЧ ЗАВЕРШЁН':'MATCH FINISHED',
'В МЕНЮ PRIME':'BACK TO PRIME MENU','ЕЩЁ МАТЧ':'PLAY AGAIN','ТРЕНИРОВКА':'TRAINING','ВЫХОД':'EXIT',
'Войди в Prime.':'Enter Prime.','Отдельный мир, тактические матчи и рейтинг ELO. Начни с тренировок против ботов или проверь себя в локальном рейтинговом режиме.':'A separate world, tactical matches and ELO rating. Train against bots or test yourself in local ranked play.',
'▶ ЗАПУСТИТЬ PRIME':'▶ LAUNCH PRIME','Соревновательная платформа':'Competitive platform','СЕЗОН 01 · ЛОКАЛЬНЫЙ РЕЖИМ':'SEASON 01 · LOCAL MODE',
'НОВАЯ ЭРА СРАЖЕНИЙ':'A NEW ERA OF BATTLES','ТВОИ МОНЕТЫ':'YOUR COINS','ТВОЯ БАШНЯ':'YOUR TOWER',
'Уровень 1':'Level 1','Только в бою':'In battle only','0 матчей':'0 matches','побед · тренировки против ботов не меняют ELO':'wins · bot training does not change ELO',
'Профиль игрока':'Player profile','монет':'coins','Войди в Prime.':'Enter Prime.',
'Отображаются только игроки.':'Only players are shown.','Онлайн-режим временно недоступен: при выборе он покажет сообщение о доработке. Играть сейчас можно только в тренировке с ботами.':'Online mode is temporarily unavailable. You can currently play training matches against bots.',
'Выбери сражение':'Choose a battle','Твой персонаж готовится к бою среди звёзд.':'Your character is preparing for battle among the stars.',
'ФОРМАТ КОМАНДЫ':'TEAM FORMAT','ТИП МАТЧА':'MATCH TYPE','★ Онлайн-рейтинг':'★ Online ranked','⚔ Тренировка с ботами':'⚔ Bot training',
'НАЙТИ МАТЧ':'FIND MATCH','НАЗАД':'BACK','Поиск соперников...':'Searching for opponents...',
'БАЗА 1':'BASE 1','БАШНЯ ур. 1':'TOWER Lv. 1','ТРЕНИРОВКА':'TRAINING',
'Строительство базы':'Base construction','🧱 Стена · 150 ◆':'🧱 Wall · 150 ◆','🏹 Башня лучника · 300 ◆':'🏹 Archer tower · 300 ◆',
'⚔ Дом воинов · 450 ◆':'⚔ Barracks · 450 ◆','Наведи мышь на место установки — зелёный призрак покажет результат. R — повернуть на 90°. Нажми мышью, чтобы построить. Щелчок по башне улучшает её.':'Move the cursor over the arena to see the green placement ghost. Press R to rotate 90 degrees, then click to build.',
'Отмена':'Cancel','Баланс и развитие':'Balance and upgrades','Монеты':'Coins','Доход':'Income','Твоя башня':'Your tower',
'Улучшение':'Upgrade','Армия':'Army','Соперник':'Opponent','База соперника':'Opponent base',
'Соперник сначала строит и улучшает защиту. Плановая атака — раз в 5 минут. При нападении игрока может ответить раньше.':'The opponent builds and upgrades defenses first. Scheduled attacks occur every 5 minutes; it can retaliate if attacked.',
'Управление: WASD или стрелки · Атака: пробел / левая кнопка мыши · Выход из матча: Esc · Полный экран: F11.':'Controls: WASD or arrows · Attack: Space / left mouse button · Leave match: Esc · Fullscreen: F11.',
'Матч завершён. Монеты обнулены. ':'Match finished. Coins reset. ','Изменение ELO: ':'ELO change: ',
'Не хватает ':'Not enough ',' монет.':' coins.','Башня уже максимального уровня.':'The tower is already at max level.',
'Башня улучшена до уровня ':'Tower upgraded to level ','!':'!','Слишком близко к краю карты. Выбери место внутри арены.':'Too close to the map edge. Choose a spot inside the arena.',
'Это место занято. Выбери свободную площадку.':'This spot is occupied. Choose an empty area.',
'Стена построена.':'Wall built.','Башня лучника построена.':'Archer tower built.','Казарма построена.':'Barracks built.',
'Выбор постройки отменён.':'Build selection cancelled.','Выбрано строительство. Нажми на свободное место арены.':'Build selected. Click an empty spot in the arena.',
'Сначала построй казарму: выбери «Дом воинов» и место на арене.':'Build a barracks first: choose Barracks and a place in the arena.',
'Для найма воина нужно 100 ◆.':'Recruiting a soldier costs 100 ◆.',
'Подготовка тренировочной арены...':'Preparing training arena...','Подбираем ботов · ELO не меняется · +10 монет каждую секунду':'Finding bots · ELO unchanged · +10 coins per second',
'Подготовка арены...':'Preparing arena...','Расстановка башен...':'Placing towers...','Формируем команды...':'Forming teams...',
'Онлайн-режим в доработке':'Online mode under development','Зайдите в тренировку. Сетевой подбор игроков пока недоступен.':'Try training mode. Online matchmaking is not available yet.',
'Зайдите в тренировку. Онлайн-матчи пока недоступны.':'Try training mode. Online matches are not available yet.',
'ПОБЕДА':'VICTORY','ПОРАЖЕНИЕ':'DEFEAT','ВЫХОД':'EXIT',
'БАЛАНС · ':'BALANCE · ','БАШНЯ ур. ':'TOWER Lv. ','БАЗА ':'BASE ',
'Онлайн-рейтинг появится после запуска сетевой игры':'Online rating will appear when online play launches',
'+10 монет каждую секунду':'+10 coins every second','Улучшение: 500 монет':'Upgrade: 500 coins',
'Профиль игрока':'Player profile','Тренировки против ботов не меняют ELO':'Bot training does not change ELO',
'Соперники: ':'Opponents: ','БАШНИ СОПЕРНИКОВ':'ENEMY TOWERS','ур. ':'Lv. ',
'Доход начисляется каждую секунду. Башня усиливает урон, дальность и прочность.':'Income is added every second. Towers increase damage, range and durability.',
'+10 ◆ / сек (только в этом бою)':'+10 ◆ / sec (this match only)',
'FPS -- · офлайн':'FPS -- · offline',' · офлайн':' · offline',
'РАЗВИВАЕТ БАЗУ':'DEVELOPING BASE','АТАКА СОПЕРНИКА':'ENEMY ATTACK',
'КОНТРАТАКА':'COUNTERATTACK','ОБОРОНЯЕТСЯ':'DEFENDING','АТАКУЕТ ВОЛНОЙ':'WAVE ATTACK',
'Выбери постройку':'Choose a structure','Постройка улучшена до уровня ':'Structure upgraded to level ',
'Не хватает ':'Not enough ',' ◆ для постройки.':' ◆ to build.',' ◆ для улучшения.':' ◆ to upgrade.',
'Башня улучшена до уровня ':'Tower upgraded to level ','Казарма':'Barracks','Башня лучника':'Archer tower'
};
function applyPrimeLanguage(lang){
 const chosen=lang==='en'?'en':'ru';localStorage.setItem(PRIME_LANG_KEY,chosen);document.documentElement.lang=chosen;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){if(node.__primeRendered!==undefined&&node.nodeValue!==node.__primeRendered)node.__primeOriginal=node.nodeValue;if(node.__primeOriginal===undefined)node.__primeOriginal=node.nodeValue;const original=node.__primeOriginal,trim=original.trim();if(!trim)continue;let translated=trim;if(chosen==='en'){translated=PRIME_EN[trim]||trim;if(translated===trim){const keys=Object.keys(PRIME_EN).filter(k=>k.length>2&&trim.startsWith(k)).sort((a,b)=>b.length-a.length);if(keys.length)translated=PRIME_EN[keys[0]]+trim.slice(keys[0].length);}}node.__primeRendered=original.replace(trim,translated);if(node.nodeValue!==node.__primeRendered)node.nodeValue=node.__primeRendered;}
 const select=$('prime-language');if(select&&select.value!==chosen)select.value=chosen;
}

const primeLanguageObserver=new MutationObserver(()=>{const lang=localStorage.getItem(PRIME_LANG_KEY)||'ru';if(lang==='en')applyPrimeLanguage(lang);});primeLanguageObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
function show(page){
 scene=page;document.body.classList.toggle('battle-active',page==='battle');pages.forEach(p=>$(p+'-page').classList.toggle('hidden',p!==page));
 document.querySelectorAll('.nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 if(page==='battle'){$('arena').focus();startLoop();}else stopLoop();if(page==='history')renderHistory();
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
const languageSelect=$('prime-language');if(languageSelect){languageSelect.value=localStorage.getItem(PRIME_LANG_KEY)||'ru';languageSelect.addEventListener('change',()=>applyPrimeLanguage(languageSelect.value));}applyPrimeLanguage(localStorage.getItem(PRIME_LANG_KEY)||'ru');
function resizeArenaCanvas(){
 const c=$('arena');if(!c)return;
 const rect=c.getBoundingClientRect(),dpr=Math.min(1.5,Math.max(1,window.devicePixelRatio||1));
 const width=Math.max(1,Math.round((rect.width||window.innerWidth)*dpr)),height=Math.max(1,Math.round((rect.height||window.innerHeight)*dpr));
 if(c.width!==width)c.width=width;if(c.height!==height)c.height=height;c.dataset.dpr=String(dpr);
 if(match&&scene==='battle')drawArena();
}
window.addEventListener('resize',resizeArenaCanvas,{passive:true});
function createTower(x,y,owner,isPlayer=false){
 const level=isPlayer?(match?.playerTowerLevel||1):owner.towerLevel,health=760+level*240;
 return {x,y,owner,isPlayer,isTower:true,team:isPlayer?0:(owner.team===0?0:1),displayName:isPlayer?'\u0421\u0442\u0440\u0430\u0436 \u0420\u0430\u0441\u0441\u0432\u0435\u0442\u0430':'\u0426\u0438\u0442\u0430\u0434\u0435\u043b\u044c '+(owner.name||'\u041a\u043e\u043c\u0430\u043d\u0434\u044b'),level,hp:health,maxHp:health,range:210+level*12,damage:8+level*3,fire:0,rotation:buildRotation||0};
}
function createMatch(){
 $('search-box').classList.add('hidden');$('find-match').disabled=false;
 const playerBaseX=SIZE*TILE/2-20*TILE,playerBaseY=SIZE*TILE/2;
 const player={id:0,team:0,x:playerBaseX,y:playerBaseY,hp:130,maxHp:130,speed:190,sprintStamina:100,maxSprintStamina:100,alive:true,attack:0,flash:0};
 const allies=[],bots=[],towers=[];
 towers.push(createTower(player.x-230,player.y+155,profile,true));

 for(let i=0;i<teamSize-1;i++){
  const offset=(i-(teamSize-2)/2)*62;
  const ally={id:i+1,team:0,x:player.x-75+offset,y:player.y+65,hp:130,maxHp:130,speed:190,attackRange:112,damage:48,alive:true,attack:0,flash:0,name:['Страж','Искра'][i]||'Союзник '+(i+1)};
  allies.push(ally);
 }
 for(let i=0;i<teamSize;i++){
  const angle=-Math.PI/2+(i-(teamSize-1)/2)*.55;
  const bp=botsProfile[i%botsProfile.length];bp.coins=650;bp.towerLevel=1;
  const enemyBaseX=player.x+ENEMY_BASE_DISTANCE_BLOCKS*TILE,formationY=[0,-64,64][i]||0,x=enemyBaseX+(i===0?0:16),y=player.y+formationY;
  const bot={id:i+1,team:1,x,y,homeX:x,homeY:y,retreating:false,respawnAt:0,deaths:0,hp:220+bp.towerLevel*35,maxHp:220+bp.towerLevel*35,speed:190,attackRange:112,damage:48,alive:true,attack:0,flash:0,elo:bp.elo,name:bp.name,profile:bp,ai:{nextUpgradeAt:38+Math.random()*18,nextBuildAt:24+Math.random()*18,nextBarracksAt:82+Math.random()*24,nextWallAt:118+Math.random()*32}};
  bots.push(bot);

 }
 if(bots.length){const enemyBaseTower=createTower(bots[0].homeX+125,bots[0].homeY-95,bots[0].profile,false);enemyBaseTower.team=1;enemyBaseTower.displayName='\u0426\u0438\u0442\u0430\u0434\u0435\u043b\u044c '+bots[0].name;towers.push(enemyBaseTower);}
 worldMeta={...worldMeta,size:SIZE,lastTeam:teamSize,lastKind:matchKind};localStorage.setItem(WORLD_SAVE,JSON.stringify(worldMeta));
 const walls=[];
 match={player,bots,allies,towers,walls,barracks:[],units:[],tracers:[],damageTexts:[],combatFeed:[],buildPreview:null,playerBase:{x:player.x,y:player.y},enemyBase:{x:player.x+ENEMY_BASE_DISTANCE_BLOCKS*TILE,y:player.y},playerCoins:0,playerTowerLevel:1,kind:'training',team:teamSize,started:performance.now(),finished:false,worldSeed:worldMeta.seed,terrainCanvas:null,uiTick:0,troopsHalted:false,guardMode:true,regroupOrder:false,rallyUntil:0,botCoinTick:0,elapsed:0,nextEnemyAttackAt:300,enemyAssaultUntil:0,enemyAggroUntil:0,enemyDefenseBoostUntil:0,playerHasEngaged:false,enemyCounterAt:0,enemyCounterQueued:false,nextCounterRollAt:0,enemyNoticeUntil:0,playerBaseLevel:1,unitCounter:0,enemyState:'РАЗВИВАЕТ БАЗУ'};
 attackCooldown=0;pressed.clear();$('troops-halt').textContent='? \u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u043e\u0438\u043d\u043e\u0432';$('regroup-troops').textContent='? \u0421\u043e\u0431\u0440\u0430\u0442\u044c \u0441\u044f';$('guard-mode').textContent='?? \u041e\u0431\u043e\u0440\u043e\u043d\u0430: \u0412\u041a\u041b';$('rally-troops').textContent='? \u0422\u043e\u0447\u043a\u0430 \u0441\u0431\u043e\u0440\u0430';$('battle-title').textContent=(teamSize+' × '+teamSize)+' · ТРЕНИРОВКА';
 $('battle-feed').innerHTML='';
 renderBotList();renderTowerList();$('hp-fill').style.width='100%';$('hp-label').textContent=player.hp+' / '+player.maxHp;updateProfile();updateHud();show('battle');resizeArenaCanvas();drawArena();
}
function renderBotList(){$('bot-list').innerHTML=match.bots.map(b=>'<div class="bot" id="bot-'+b.id+'"><b>'+b.name+'</b><br><span>Башня ур. '+b.profile.towerLevel+' · '+b.profile.coins+' ◆ · '+b.elo+' ELO</span><div class="hpbar" style="margin-top:6px"><span id="bot-hp-'+b.id+'" style="width:100%"></span></div></div>').join('');}
function renderTowerList(){
 $('enemy-towers').innerHTML='<small style="color:#ff9b62">БАШНИ СОПЕРНИКОВ</small>'+match.towers.filter(t=>t.team===1).map((t,i)=>'<div class="bot" id="tower-row-'+i+'">'+t.owner.name+' · ур. '+t.level+'<div class="hpbar" style="margin-top:6px"><span id="tower-hp-'+i+'" style="width:100%"></span></div></div>').join('');
}
function finish(win,abandoned=false){
 if(!match||match.finished)return;match.finished=true;stopLoop();pressed.clear();
 profile.matches++;if(win&&!abandoned)profile.wins++;const eloDelta=abandoned?0:(win?20+Math.floor(Math.random()*11):-(20+Math.floor(Math.random()*16)));profile.elo=Math.max(0,profile.elo+eloDelta);profile.history.unshift({label:(win?'ПОБЕДА':abandoned?'ВЫХОД':'ПОРАЖЕНИЕ')+' · '+match.team+'×'+match.team,delta:abandoned?'Без изменения ELO':(eloDelta>0?'+'+eloDelta+' ELO':eloDelta+' ELO'),eloDelta,date:new Date().toLocaleString('ru-RU'),opponents:match.bots.map(b=>b.name)});profile.history=profile.history.slice(0,100);match.playerCoins=0;save();renderHistory();
 $('result-title').textContent=win?'ПОБЕДА':'ПОРАЖЕНИЕ';
 $('result-copy').textContent='Матч завершён. Монеты обнулены. '+(abandoned?'ELO без изменений.':'Изменение ELO: '+(eloDelta>0?'+':'')+eloDelta);
 $('result-modal').classList.remove('hidden');
}
$('result-menu').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');});
$('result-again').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');beginSearch();});
$('leave-match').addEventListener('click',()=>{if(match)finish(false,true);});
$('upgrade-tower').addEventListener('click',()=>{
 if(!match||match.finished){$('tower-feedback').textContent='Улучшать башни можно только во время боя.';return;}if(match.playerTowerLevel>=20){$('tower-feedback').textContent='Башня уже максимального уровня.';return;}
 const cost=upgradeCost(match.playerTowerLevel);if(match.playerCoins<cost){$('tower-feedback').textContent='Не хватает '+Math.ceil(cost-match.playerCoins)+' монет.';return;}
 match.playerCoins-=cost;match.playerTowerLevel++;
 if(match){for(const t of match.towers.filter(x=>x.team===0&&x.owner===profile)){t.level=match.playerTowerLevel;t.maxHp=760+t.level*240;t.hp=Math.min(t.maxHp,t.hp+300);t.range=210+t.level*12;t.damage=8+t.level*3;}}
 $('tower-feedback').textContent='Башня улучшена до уровня '+match.playerTowerLevel+' · +300 HP!';renderTowerList();drawArena();
});
function formatMatchTime(seconds){
 const total=Math.max(0,Math.ceil(Number(seconds)||0));
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function updateHud(){
 if(!match)return;
 const q=id=>document.getElementById(id),m=match,coins=Math.floor(m.playerCoins),upgrade=upgradeCost(m.playerTowerLevel);
 q('hud-hp').textContent=Math.ceil(m.player.hp)+' / '+m.player.maxHp;
 q('hud-coins').textContent=coins.toLocaleString('ru-RU');q('hud-balance-value').textContent=coins.toLocaleString('ru-RU')+' ◆';
 q('hud-army').textContent=m.units.filter(u=>u.team===0&&u.alive).length;
 q('hud-base').textContent='БАЗА '+m.playerBaseLevel;
 const baseDistance=m.enemyBase?Math.round(Math.hypot(m.enemyBase.x-m.player.x,m.enemyBase.y-m.player.y)/TILE):40;
 q('hud-base-distance').textContent='БАЗА СОПЕРНИКА · '+baseDistance+' БЛОКОВ';
 q('hud-tower').textContent='БАШНЯ ур. '+match.playerTowerLevel;
 q('hud-elo').textContent=profile.elo+' ELO';
 const assault=m.enemyAssaultUntil>m.elapsed,defending=m.enemyAggroUntil>m.elapsed;
 const state=assault?'АТАКУЕТ ВОЛНОЙ':defending?(m.elapsed<60?'УСИЛЕННАЯ ОБОРОНА':'ОБОРОНЯЕТСЯ'):(m.elapsed<m.enemyNoticeUntil?m.enemyState:'РАЗВИВАЕТ БАЗУ');
 q('hud-bot-state').textContent='БОТ: '+state;
 q('hud-attack-timer').textContent=assault?'ВОЛНА · '+formatMatchTime(m.enemyAssaultUntil-m.elapsed):'АТАКА ЧЕРЕЗ '+formatMatchTime(m.nextEnemyAttackAt-m.elapsed);
 q('balance-value').textContent=coins.toLocaleString('ru-RU')+' ◆';
 q('balance-income').textContent='+10 ◆ / сек (только в этом бою)';
 q('balance-tower').textContent='Башня ур. '+match.playerTowerLevel;
 q('balance-next-upgrade').textContent=match.playerTowerLevel>=20?'Максимальный уровень':'Следующее улучшение: '+upgrade.toLocaleString('ru-RU')+' ◆';
 q('balance-troops').textContent=m.units.filter(u=>u.team===0&&u.alive).length+' воинов';
 q('balance-enemy').textContent=state+' · атака через '+formatMatchTime(m.nextEnemyAttackAt-m.elapsed);
 const upgradeButton=q('upgrade-tower');
 if(upgradeButton){upgradeButton.disabled=match.playerTowerLevel>=20||match.playerCoins<upgrade;upgradeButton.textContent=match.playerTowerLevel>=20?'Башня MAX':'Улучшить башню · '+upgrade+' ◆ · +300 HP';}
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
 const sourceBarracks=match.barracks.find(br=>br.team===team&&Math.hypot(br.x-x,br.y-y)<4);
 const spawnX=sourceBarracks?x+(team===0?44:-44):x,spawnY=sourceBarracks?y+8:y;
 const homeBot=team===1&&match?.bots?.length?match.bots.reduce((best,b)=>!best||Math.hypot(b.x-spawnX,b.y-spawnY)<Math.hypot(best.x-spawnX,best.y-spawnY)?b:best,null):null;
 const u={id:++match.unitCounter,team,x:spawnX,y:spawnY,homeX:homeBot?.homeX??spawnX,homeY:homeBot?.homeY??spawnY,ownerBot:homeBot?.id??null,retreating:false,hp:130,maxHp:130,damage:48,range:112,speed:190,attack:0,flash:0,alive:true,name:team===0?'Воин союзника':'Вражеский воин'};
 match.units.push(u);return u;
}
function alertEnemyBase(){
 const m=match;if(!m)return;
 m.playerHasEngaged=true;
 m.enemyAggroUntil=Math.max(m.enemyAggroUntil,m.elapsed+38);
 for(const bot of m.bots){if(bot.alive){bot.retreating=false;bot.retreatUntil=0;}}
 for(const unit of m.units){if(unit.team===1&&unit.alive)unit.retreating=false;}
 if(m.elapsed<60)m.enemyDefenseBoostUntil=Math.max(m.enemyDefenseBoostUntil,60);
 m.enemyState='ОБОРОНЯЕТСЯ';m.enemyNoticeUntil=m.elapsed+5;
 if(m.elapsed>=m.nextCounterRollAt){
  m.nextCounterRollAt=m.elapsed+45;
  const hasTroops=m.units.some(u=>u.team===1&&u.alive)||m.barracks.some(br=>br.team===1)||m.bots.some(b=>b.profile.coins>=100);
  m.enemyCounterQueued=hasTroops&&Math.random()<.35;
  m.enemyCounterAt=m.elapsed+3;
 }
}
function addCombatFeed(message){
 if(!match)return;match.combatFeed.unshift({text:String(message),time:match.elapsed});
 match.combatFeed=match.combatFeed.slice(0,4);
 const feed=$('battle-feed');if(feed)feed.innerHTML=match.combatFeed.map((item,i)=>'<div class="feed-line '+(i===0?'latest':'')+'">'+item.text+'</div>').join('');
}
function addDamageNumber(target,amount,team){
 if(!match)return;
 match.damageTexts.push({x:target.x,y:target.y-25,value:Math.max(1,Math.round(amount)),life:.85,maxLife:.85,team:team??target.team??1});
}
function applyCombatDamage(target,amount,attacker){
 if(!match||!target||target.hp<=0||target.alive===false)return false;
 const damage=Math.max(1,Math.round(Number(amount)||0)),wasAlive=target.alive!==false;
 target.hp=Math.max(0,target.hp-damage);target.flash=.24;addDamageNumber(target,damage,attacker?.team??0);
 if(target.hp<=0&&wasAlive&&target!==match.player){
  if(target.team===1&&target.profile&&!target.isPlayer&&!target.isTower){
   target.alive=false;target.retreating=false;target.respawnAt=match.elapsed+12;target.deaths=(target.deaths||0)+1;
   addCombatFeed(target.name+' выбит · возвращение через 12 сек');
  }else{
   target.alive=false;target.respawnAt=0;
   if(target.team===1)addCombatFeed((target.name||'Вражеский воин')+' повержен');
  }
 }
 return true;
}
function canEntityOccupy(x,y,radius=12){
 const m=match;if(!m)return true;
 const min=TILE*(WATER_BORDER+1)+radius,max=SIZE*TILE-min;
 if(x<min||y<min||x>max||y>max)return false;
 for(const wall of m.walls){
  if(wall.hp<=0)continue;
  const dx=x-wall.x,dy=y-wall.y,angle=wall.rotation||0,c=Math.cos(angle),s=Math.sin(angle);
  const lx=dx*c+dy*s,ly=-dx*s+dy*c;
  if(Math.abs(lx)<25+radius&&Math.abs(ly)<11+radius)return false;
 }
 for(const structure of [...m.towers,...m.barracks]){
  if(structure.hp<=0)continue;
  const size=structure.isTower?36:30;
  if(Math.hypot(x-structure.x,y-structure.y)<size+radius)return false;
 }
 return true;
}
function moveEntity(entity,dx,dy,radius=12){
 if(!match||!entity)return false;
 let moved=false;
 const nx=clamp(entity.x+dx,TILE*(WATER_BORDER+1),SIZE*TILE-TILE*(WATER_BORDER+1));
 const ny=clamp(entity.y+dy,TILE*(WATER_BORDER+1),SIZE*TILE-TILE*(WATER_BORDER+1));
 if(canEntityOccupy(nx,entity.y,radius)){entity.x=nx;moved=moved||Math.abs(dx)>.001;}
 if(canEntityOccupy(entity.x,ny,radius)){entity.y=ny;moved=moved||Math.abs(dy)>.001;}
 return moved;
}
function respawnDefeatedBots(){
 const m=match;if(!m)return;
 for(const bot of m.bots){
  if(bot.alive||!bot.respawnAt||m.elapsed<bot.respawnAt)continue;
  if(!m.towers.some(t=>t.team===1&&t.owner===bot.profile&&t.hp>0))continue;
  bot.x=bot.homeX;bot.y=bot.homeY;bot.hp=bot.maxHp;bot.alive=true;bot.retreating=false;bot.attack=0;bot.flash=.35;bot.respawnAt=0;
  addCombatFeed(bot.name+' вернулся на базу');
 }
}
function chooseNearestTarget(source,candidates,maxDistance=Infinity){
 let target=null,best=maxDistance;
 for(const item of candidates){if(!item||item.alive===false||item.hp<=0)continue;const distance=Math.hypot(item.x-source.x,item.y-source.y);if(distance<best){best=distance;target=item;}}
 return target?{target,distance:best}:null;
}
function upgradeBotTower(bot){
 if(bot.id!==1)return false;
 const b=bot.profile;
 if(!(b.towerLevel<20&&b.coins>=upgradeCost(b.towerLevel)))return false;
 b.coins-=upgradeCost(b.towerLevel);b.towerLevel++;b.elo+=8;
 match.towers.filter(t=>t.team===1).forEach(t=>{
  t.level=b.towerLevel;t.maxHp=760+t.level*240;t.hp=Math.min(t.maxHp,t.hp+300);
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
   const owned=m.towers.filter(t=>t.team===1).length;
   if(b.coins>=300&&owned<1){
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
   const waveSize=Math.min(3,1+Math.floor(bot.profile.towerLevel/5));
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
}
function retreatEnemyToBases(){
 const m=match;if(!m)return;
 m.enemyAggroUntil=m.elapsed;m.enemyAssaultUntil=m.elapsed;m.enemyCounterQueued=false;
 m.enemyNoticeUntil=m.elapsed+7;m.enemyState='ВОЗВРАЩАЮТСЯ НА БАЗУ';
 for(const bot of m.bots){bot.retreating=true;bot.retreatUntil=m.elapsed+22;bot.attack=0;}
 for(const unit of m.units){if(unit.team===1&&unit.alive){unit.retreating=true;unit.attack=0;}}
}
function setTroopsHalted(value){if(!match)return;match.troopsHalted=value??!match.troopsHalted;const b=$('troops-halt');if(b)b.textContent=match.troopsHalted?'? \u0412\u043e\u0438\u043d\u044b: \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c':'? \u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u043e\u0438\u043d\u043e\u0432';$('tower-feedback').textContent=match.troopsHalted?'\u0412\u043e\u0438\u043d\u044b \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u044b \u0438 \u043d\u0435 \u0430\u0442\u0430\u043a\u0443\u044e\u0442.':'\u0412\u043e\u0438\u043d\u044b \u0441\u043d\u043e\u0432\u0430 \u0432 \u0431\u043e\u044e.';}
function regroupTroops(){if(!match)return;match.regroupOrder=true;match.rallyUntil=match.elapsed+99999;match.troopsHalted=false;for(const u of match.units){if(u.team===0&&u.alive){u.attack=0;u.rallyTarget={x:match.playerBase.x+80,y:match.playerBase.y};}}$('tower-feedback').textContent='\u0412\u043e\u0438\u043d\u044b \u0441\u043e\u0431\u0438\u0440\u0430\u044e\u0442\u0441\u044f \u0443 \u0432\u0430\u0448\u0435\u0439 \u0431\u0430\u0437\u044b.';}
function toggleGuardMode(){if(!match)return;match.guardMode=!match.guardMode;const b=$('guard-mode');if(b)b.textContent=match.guardMode?'?? \u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u041a\u041b':'?? \u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u042b\u041a\u041b';$('tower-feedback').textContent=match.guardMode?'\u0421\u043e\u044e\u0437\u043d\u0438\u043a\u0438 \u0437\u0430\u0449\u0438\u0449\u0430\u044e\u0442 \u0431\u0430\u0437\u0443.':'\u0421\u043e\u044e\u0437\u043d\u0438\u043a\u0438 \u0430\u0442\u0430\u043a\u0443\u044e\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u043b\u0438\u0437\u043a\u0438\u0445 \u0432\u0440\u0430\u0433\u043e\u0432.';}
function rallyTroops(){if(!match)return;match.rallyUntil=match.elapsed+30;match.regroupOrder=false;match.troopsHalted=false;for(const u of match.units){if(u.team===0&&u.alive)u.rallyTarget={x:match.enemyBase.x-170,y:match.enemyBase.y};}$('tower-feedback').textContent='\u0422\u043e\u0447\u043a\u0430 \u0441\u0431\u043e\u0440\u0430 \u0443 \u0432\u0440\u0430\u0436\u0435\u0441\u043a\u043e\u0439 \u0431\u0430\u0437\u044b \u043d\u0430 30 \u0441\u0435\u043a\u0443\u043d\u0434.';}
function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}
function startLoop(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(loop);}
function loop(now){
 if(scene!=='battle'||!match||match.finished){raf=0;return;}
 const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;fpsFrames++;fpsElapsed+=dt;
 if(fpsElapsed>=1){currentFps=Math.round(fpsFrames/fpsElapsed);fpsFrames=0;fpsElapsed=0;$('performance-hud').innerHTML='fps= '+currentFps+'<br>ping= офлайн';}
 update(dt);drawArena();raf=requestAnimationFrame(loop);
}
function update(dt){
 const p=match.player;
 match.elapsed+=dt;match.botCoinTick+=dt;
 if(match.botCoinTick>=1){const count=Math.floor(match.botCoinTick);match.botCoinTick-=count;match.playerCoins+=count*COINS_PER_SECOND;for(const bot of match.bots)bot.profile.coins+=count*COINS_PER_SECOND;}
 enemyDirector(dt);respawnDefeatedBots();attackCooldown=Math.max(0,attackCooldown-dt);match.uiTick-=dt;
 for(const tracer of match.tracers)tracer.life-=dt;match.tracers=match.tracers.filter(t=>t.life>0);
 for(const item of match.damageTexts){item.life-=dt;item.y-=dt*24;}match.damageTexts=match.damageTexts.filter(item=>item.life>0);
 let dx=(pressed.has('KeyD')||pressed.has('ArrowRight')?1:0)-(pressed.has('KeyA')||pressed.has('ArrowLeft')?1:0);
 let dy=(pressed.has('KeyS')||pressed.has('ArrowDown')?1:0)-(pressed.has('KeyW')||pressed.has('ArrowUp')?1:0);
 const sprintKey=pressed.has('ShiftLeft')||pressed.has('ShiftRight'),sprinting=!!(sprintKey&&(dx||dy)&&p.sprintStamina>0);
 if(sprinting)p.sprintStamina=Math.max(0,p.sprintStamina-30*dt);else p.sprintStamina=Math.min(p.maxSprintStamina,p.sprintStamina+19*dt);
 let playerMoved=false;
 if(dx||dy){const length=Math.hypot(dx,dy),speed=p.speed*(sprinting?SPRINT_MULTIPLIER:1);playerMoved=moveEntity(p,dx/length*speed*dt,dy/length*speed*dt,12);}
 p.flash=Math.max(0,p.flash-dt);p.walkPhase=(p.walkPhase||0)+(playerMoved?dt*(sprinting?17:10):0);
 for(const ally of match.allies){
  if(!ally.alive)continue;
  ally.walkPhase=(ally.walkPhase||0)+dt*8;ally.attack=Math.max(0,ally.attack-dt);ally.flash=Math.max(0,ally.flash-dt);
  if(match.troopsHalted)continue;
  const guardX=match.playerBase.x,guardY=match.playerBase.y;
  const candidates=[...match.bots.filter(b=>b.alive),...match.units.filter(u=>u.team===1&&u.alive)];
  let found=chooseNearestTarget(ally,candidates,match.guardMode?460:300);
  if(found&&Math.hypot(found.target.x-guardX,found.target.y-guardY)>560)found=null;
  if(found){if(found.distance>ally.attackRange)moveEntity(ally,(found.target.x-ally.x)/found.distance*ally.speed*dt,(found.target.y-ally.y)/found.distance*ally.speed*dt,12);else if(ally.attack<=0){ally.attack=.42;alertEnemyBase();applyCombatDamage(found.target,ally.damage,ally);}}
  else if(match.regroupOrder){const vx=guardX-ally.x,vy=guardY-ally.y,distance=Math.hypot(vx,vy)||1;if(distance>62)moveEntity(ally,vx/distance*ally.speed*dt,vy/distance*ally.speed*dt,12);}
 }
 for(const bot of match.bots){
  if(!bot.alive)continue;
  bot.walkPhase=(bot.walkPhase||0)+dt*8;bot.attack=Math.max(0,bot.attack-dt);bot.flash=Math.max(0,bot.flash-dt);
  if(bot.retreating){
   const hx=bot.homeX??bot.x,hy=bot.homeY??bot.y,vx=hx-bot.x,vy=hy-bot.y,distance=Math.hypot(vx,vy)||1;
   if(distance>24){moveEntity(bot,vx/distance*bot.speed*dt,vy/distance*bot.speed*dt,13);}
   else{bot.x=hx;bot.y=hy;bot.retreating=false;bot.attack=0;}
   continue;
  }
  let aggro=match.enemyAggroUntil>match.elapsed,assault=match.enemyAssaultUntil>match.elapsed;
  const playerDistance=Math.hypot(p.x-bot.x,p.y-bot.y);
  if(!aggro&&!assault&&playerDistance>360){
   const phase=match.elapsed*.42+bot.id*2.1,px=bot.x+Math.cos(phase)*42,py=bot.y+Math.sin(phase*.83)*34,patrolDistance=Math.hypot(px-bot.x,py-bot.y)||1;
   moveEntity(bot,(px-bot.x)/patrolDistance*bot.speed*.22*dt,(py-bot.y)/patrolDistance*bot.speed*.22*dt,13);
   continue;
  }
  if(!aggro&&!assault)alertEnemyBase();
  const fighters=[p,...match.allies.filter(a=>a.alive),...match.units.filter(u=>u.team===0&&u.alive)];
  const nearestFighter=chooseNearestTarget(bot,fighters);
  const ownStructures=match.towers.filter(t=>t.team===0&&t.hp>0).concat(match.barracks.filter(b=>b.team===0&&b.hp>0));
  const nearestStructure=chooseNearestTarget(bot,ownStructures);
  const target=nearestStructure&&(!nearestFighter||nearestStructure.distance<nearestFighter.distance+55)?nearestStructure.target:nearestFighter?.target;
  if(!target)continue;
  const vx=target.x-bot.x,vy=target.y-bot.y,distance=Math.hypot(vx,vy)||1;
  if(distance>bot.attackRange){
   const moved=moveEntity(bot,vx/distance*bot.speed*dt,vy/distance*bot.speed*dt,13);
   if(!moved)moveEntity(bot,-vy/distance*bot.speed*.75*dt,vx/distance*bot.speed*.75*dt,13);
  }else if(bot.attack<=0){
   bot.attack=.42;applyCombatDamage(target,bot.damage,bot);
  }
 }
 for(const unit of match.units){
  if(!unit.alive)continue;
  if(unit.team===0&&match.troopsHalted)continue;
  unit.walkPhase=(unit.walkPhase||0)+dt*9;unit.attack=Math.max(0,unit.attack-dt);unit.flash=Math.max(0,unit.flash-dt);
  if(unit.team===1&&unit.retreating){
   const vx=unit.homeX-unit.x,vy=unit.homeY-unit.y,distance=Math.hypot(vx,vy)||1;
   if(distance>18)moveEntity(unit,vx/distance*unit.speed*dt,vy/distance*unit.speed*dt,10);else unit.retreating=false;
   continue;
  }
  if(unit.team===0&&unit.rallyTarget&&match.elapsed<match.rallyUntil){const rx=unit.rallyTarget.x-unit.x,ry=unit.rallyTarget.y-unit.y,rd=Math.hypot(rx,ry)||1;if(rd>28){moveEntity(unit,rx/rd*unit.speed*dt,ry/rd*unit.speed*dt,10);continue;}unit.rallyTarget=null;}
  const foes=unit.team===0?[...match.bots.filter(b=>b.alive),...match.units.filter(other=>other.team===1&&other.alive)]:[p,...match.allies.filter(a=>a.alive),...match.units.filter(other=>other.team===0&&other.alive)];
  const found=chooseNearestTarget(unit,foes);
  if(!found)continue;
  if(found.distance>unit.range){
   const moved=moveEntity(unit,(found.target.x-unit.x)/found.distance*unit.speed*dt,(found.target.y-unit.y)/found.distance*unit.speed*dt,10);
   if(!moved)moveEntity(unit,Math.cos(match.elapsed+unit.id)*unit.speed*.65*dt,Math.sin(match.elapsed+unit.id)*unit.speed*.65*dt,10);
  }else if(unit.attack<=0){
   unit.attack=.42;
   if(unit.team===1)alertEnemyBase();
   applyCombatDamage(found.target,unit.damage,unit);
  }
 }
 for(const tower of match.towers){
  if(tower.hp<=0)continue;
  tower.fire-=dt;if(tower.fire>0)continue;
  const targets=tower.team===0?[...match.bots.filter(b=>b.alive),...match.units.filter(u=>u.team===1&&u.alive)]:[p,...match.allies.filter(a=>a.alive),...match.units.filter(u=>u.team===0&&u.alive)];
  const found=chooseNearestTarget(tower,targets,tower.range);
  if(found){
   tower.fire=Math.max(.48,1.25-tower.level*.035);
   match.tracers.push({x1:tower.x,y1:tower.y-28,x2:found.target.x,y2:found.target.y-12,life:.16,maxLife:.16,team:tower.team});
   if(tower.team===0&&found.target.team===1)alertEnemyBase();
   applyCombatDamage(found.target,tower.damage,tower);
  }
 }
 if(p.hp<=0){
  retreatEnemyToBases();addCombatFeed('Ты возвращён на свою базу');
  p.hp=p.maxHp;p.flash=1;p.x=match.playerBase?.x??SIZE*TILE/2-20*TILE;p.y=match.playerBase?.y??SIZE*TILE/2;pressed.clear();
 }
 if(match.uiTick<=0){match.uiTick=.12;$('hp-fill').style.width=(p.hp/p.maxHp*100)+'%';$('hp-label').textContent=Math.ceil(p.hp)+' / '+p.maxHp;
 const sprintHud=$('hud-sprint');if(sprintHud)sprintHud.innerHTML='БЕГ · '+Math.round(p.sprintStamina)+'% <span class="sprint-track"><i style="width:'+p.sprintStamina+'%"></i></span>';
 $('battle-coins').textContent=Math.floor(match.playerCoins)+' ◆';$('battle-tower').textContent='Уровень '+match.playerTowerLevel+' · '+(match.playerTowerLevel>=20?'MAX':upgradeCost(match.playerTowerLevel)+' ◆');
 for(const bot of match.bots){const bar=$('bot-hp-'+bot.id);if(bar)bar.style.width=(bot.hp/bot.maxHp*100)+'%';const row=$('bot-'+bot.id);if(row)row.style.opacity=bot.alive?'1':'.35';}
 match.towers.filter(t=>t.team===1).forEach((tower,i)=>{const bar=$('tower-hp-'+i);if(bar)bar.style.width=(tower.hp/tower.maxHp*100)+'%';});
 const ownTower=match.towers.find(t=>t.isPlayer);if(ownTower&&ownTower.hp<=0){finish(false);return;}
 if(match.towers.filter(t=>t.team===1).every(t=>t.hp<=0)){finish(true);return;}
 drawMiniMap();}
}
function attack(){
 if(!match||match.finished||attackCooldown>0)return;
 attackCooldown=.42;
 const player=match.player,opponents=[...match.bots.filter(bot=>bot.alive),...match.units.filter(unit=>unit.team===1&&unit.alive)];
 const found=chooseNearestTarget(player,opponents,112);
 if(found){alertEnemyBase();applyCombatDamage(found.target,found.target.profile?42:48,player);return;}
 const structures=[...match.towers.filter(t=>t.team===1&&t.hp>0),...match.walls.filter(w=>w.team===1&&w.hp>0),...match.barracks.filter(b=>b.team===1&&b.hp>0)];
 const structure=chooseNearestTarget(player,structures,112);
 if(structure){alertEnemyBase();applyCombatDamage(structure.target,structure.target.isTower?54:42,player);return;}
 match.tracers.push({x1:player.x,y1:player.y-10,x2:player.x+Math.cos(match.elapsed*7)*34,y2:player.y-18+Math.sin(match.elapsed*7)*22,life:.10,maxLife:.10,team:0});
}
function drawTower(ctx,t,camX,camY){
 const x=t.x-camX,y=t.y-camY,l=t.level,scale=1+Math.min(8,l-1)*.055;
 ctx.save();ctx.translate(x,y);ctx.rotate(t.rotation||0);ctx.scale(scale,scale);
 ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,25,43,13,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#25282d';ctx.beginPath();ctx.moveTo(-35,20);ctx.lineTo(-29,-7);ctx.lineTo(-23,-24);ctx.lineTo(23,-24);ctx.lineTo(29,-7);ctx.lineTo(35,20);ctx.closePath();ctx.fill();
 ctx.fillStyle='#62666b';ctx.fillRect(-29,-9,58,28);ctx.fillStyle='#85878a';ctx.fillRect(-24,-15,48,8);ctx.fillStyle='#3c4148';ctx.fillRect(-19,-39,38,27);
 ctx.fillStyle='#9a9b9c';for(let i=-2;i<=2;i++)ctx.fillRect(i*11-3,-45,6,8);
 ctx.fillStyle='#171a20';ctx.fillRect(-9,-31,18,22);ctx.fillStyle=t.team===0?'#ff762b':'#cf4935';ctx.fillRect(-4,-26,8,13);
 ctx.fillStyle='#bfc1c4';ctx.fillRect(-39,-2,9,23);ctx.fillRect(30,-2,9,23);ctx.fillRect(-15,-53,30,8);
 ctx.fillStyle=t.team===0?'#ff8a36':'#e45b42';ctx.beginPath();ctx.moveTo(0,-75);ctx.lineTo(0,-53);ctx.lineTo(19,-59);ctx.lineTo(0,-65);ctx.fill();
 ctx.fillStyle='#111';ctx.fillRect(-29,31,58,5);ctx.fillStyle='#ff6435';ctx.fillRect(-29,31,58*Math.max(0,t.hp/t.maxHp),5);
 ctx.fillStyle='#fff';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText((t.displayName||t.owner.name)+' ? ??. '+l,0,-83);
 ctx.restore();
}
function buildPlacementAtWorld(rawX,rawY){
 const m=match;if(!m||!buildMode)return {valid:false,reason:'Выбери постройку.'};
 const x=Math.floor(rawX/TILE)*TILE+TILE/2,y=Math.floor(rawY/TILE)*TILE+TILE/2;
 const cost={wall:150,tower:300,barracks:450}[buildMode]||0;
 const min=TILE*(WATER_BORDER+1)+20,max=SIZE*TILE-min;
 const bounds=x>=min&&y>=min&&x<=max&&y<=max&&canEntityOccupy(x,y,12);
 const tooNear=Math.hypot(x-m.player.x,y-m.player.y)<85;
 const occupied=[...m.walls,...m.barracks,...m.towers].some(o=>Math.hypot(o.x-x,o.y-y)<75);
 const reason=!bounds?'Слишком близко к краю карты.':tooNear?'Слишком близко к персонажу.':occupied?'Это место занято.':m.playerCoins<cost?'Не хватает '+(cost-Math.floor(m.playerCoins))+' ◆.':'';
 return {x,y,cost,valid:!reason,reason,kind:buildMode,rotation:buildRotation};
}
function buildPlacementFromPointer(clientX,clientY){
 const rect=$('arena').getBoundingClientRect();
 return buildPlacementAtWorld(clientX-rect.left+match.player.x-rect.width/2,clientY-rect.top+match.player.y-rect.height/2);
}
function drawBuildPreview(ctx,camX,camY){
 const p=match.buildPreview;if(!p||!buildMode)return;
 const x=p.x-camX,y=p.y-camY,good=p.valid,color=good?'#69ff8b':'#ff6c68';
 ctx.save();ctx.translate(x,y);ctx.rotate(p.rotation||buildRotation);ctx.translate(-x,-y);ctx.globalAlpha=.30;ctx.shadowColor=color;ctx.shadowBlur=22;ctx.fillStyle=color;
 ctx.beginPath();ctx.ellipse(x,y+11,39,18,0,0,Math.PI*2);ctx.fill();
 if(buildMode==='wall'){ctx.fillRect(x-27,y-12,54,24);ctx.fillStyle=good?'#b9ffd0':'#ffd1cf';ctx.fillRect(x-24,y-15,48,5);}
 else if(buildMode==='tower'){
  ctx.beginPath();ctx.moveTo(x-23,y+15);ctx.lineTo(x-18,y-7);ctx.lineTo(x-12,y-21);ctx.lineTo(x+12,y-21);ctx.lineTo(x+18,y-7);ctx.lineTo(x+23,y+15);ctx.closePath();ctx.fill();
  ctx.fillRect(x-8,y-36,16,18);ctx.fillRect(x-5,y-43,10,8);
 }else{
  ctx.fillRect(x-23,y-18,46,36);ctx.beginPath();ctx.moveTo(x-28,y-18);ctx.lineTo(x,y-42);ctx.lineTo(x+28,y-18);ctx.closePath();ctx.fill();
 }
 ctx.globalAlpha=.95;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([6,4]);
 ctx.strokeRect(x-37,y-37,74,74);ctx.setLineDash([]);
 ctx.fillStyle=good?'#eaffee':'#ffe4e2';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.shadowBlur=8;
 ctx.fillText(good?'МЕСТО ПОСТРОЙКИ':'НЕДОСТУПНО',x,y-48);
 ctx.restore();
}
function drawPrimeFighter(ctx,f,camX,camY,isPlayer,isAlly=false){
 const x=f.x-camX,y=f.y-camY,phase=(f.walkPhase||performance.now()/105)+(f.id||0),step=Math.sin(phase)*2.2;
 const look=isPlayer?SKYREALM_DEFAULT_LOOK:{...SKYREALM_DEFAULT_LOOK,armor:isAlly?'#287ca0':'#874d46',accent:isAlly?'#83dcf2':'#e6a078',hair:isAlly?'#26364a':'#35282c',skin:isAlly?'#d9ad86':'#d4a07d'};
 const armor=look.armor,accent=look.accent,skin=look.skin;
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(1.22,1.22);
 ctx.fillStyle='rgba(16,24,28,.40)';ctx.beginPath();ctx.ellipse(0,13,13,7,0,0,Math.PI*2);ctx.fill();
 // Same compact pixel-proportioned body, armor panels, face and equipment layout as the main SkyRealm player.
 ctx.fillStyle=armor;ctx.fillRect(-9,-3,18,15);ctx.fillStyle=accent;ctx.fillRect(-7,-2,14,13);
 ctx.fillStyle='#394b89';ctx.beginPath();ctx.moveTo(-9,-3);ctx.lineTo(0,7);ctx.lineTo(9,-3);ctx.lineTo(7,10);ctx.lineTo(0,15);ctx.lineTo(-7,10);ctx.closePath();ctx.fill();
 ctx.fillStyle='#c5d6ef';ctx.fillRect(-2,-1,4,12);
 ctx.fillStyle='#3b2837';ctx.fillRect(-7,7+step,5,8);ctx.fillRect(2,7-step,5,8);
 ctx.fillStyle='#d5b887';ctx.fillRect(-8,13+step,7,4);ctx.fillRect(1,13-step,7,4);
 ctx.fillStyle=skin;ctx.fillRect(-6,-17,12,13);
 ctx.fillStyle=look.hair;ctx.fillRect(-7,-20,14,5);ctx.fillRect(-9,-16,4,7);ctx.fillRect(5,-16,4,7);
 if(isPlayer){ctx.fillStyle=look.eye;ctx.fillRect(-4,-12,2,2);ctx.fillRect(3,-12,2,2);}
 else{ctx.fillStyle=look.eye;ctx.fillRect(-4,-12,2,2);ctx.fillRect(3,-12,2,2);ctx.fillStyle='#5a3b32';ctx.fillRect(-2,-8,4,1);}
 // Equipment silhouette follows the main game's helmet and chestplate proportions.
 if(f.helmet){ctx.fillStyle='#d7dfe8';ctx.fillRect(-9,-20,18,5);ctx.fillRect(-11,-16,22,3);}
 if(f.armorTier>0){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.strokeRect(-10,-4,20,16);ctx.fillStyle=accent;ctx.fillRect(-3,-2,6,7);}
 ctx.fillStyle=accent;ctx.fillRect(-10,-4,4,5);ctx.fillRect(6,-4,4,5);
 ctx.strokeStyle=skin;ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(-10,-1);ctx.lineTo(-13-step*.3,7);ctx.moveTo(10,-1);ctx.lineTo(13+step*.3,7);ctx.stroke();
 const swing=f.attack>0?Math.sin(performance.now()/45)*.5:Math.sin(phase*.7)*.06;
 ctx.save();ctx.translate(10,1);ctx.rotate(-.22+swing);ctx.strokeStyle='#8d6944';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-2,1);ctx.lineTo(4,4);ctx.stroke();ctx.strokeStyle='#d4b878';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-1,-1);ctx.lineTo(6,5);ctx.stroke();ctx.strokeStyle='#dbe8f5';ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(4,2);ctx.lineTo(8,-16);ctx.stroke();ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.shadowColor=accent;ctx.shadowBlur=7;ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(9,-15);ctx.stroke();ctx.restore();
 if(f.flash>0){ctx.globalAlpha=.5;ctx.fillStyle='#fff';ctx.fillRect(-13,-23,26,42);ctx.globalAlpha=1;}
 ctx.restore();
 ctx.fillStyle='#fff';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(isPlayer?'Kisia':(f.name||'Воин'),x,y-35);ctx.shadowBlur=0;
 if(!isPlayer){ctx.fillStyle='#140d0b';ctx.fillRect(x-18,y-42,36,4);ctx.fillStyle=f.team===0?'#70d8ff':'#ff765f';ctx.fillRect(x-18,y-42,36*Math.max(0,f.hp/f.maxHp),4);}
}
function buildTerrainCache(seed){const c=document.createElement('canvas');c.width=SIZE*TILE;c.height=SIZE*TILE;const g=c.getContext('2d',{alpha:false});for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const edge=Math.min(x,y,SIZE-1-x,SIZE-1-y),n=(x*17+y*31+(x*y)%23+seed)%9,hash=(x*73856093^y*19349663^seed)>>>0,sx=x*TILE,sy=y*TILE;if(edge<WATER_BORDER){g.fillStyle=['#167b9c','#11688f','#0d527d'][n%3];g.fillRect(sx,sy,TILE,TILE);}else if(edge<WATER_BORDER+3){g.fillStyle=['#b9a16c','#c1a875','#ae9868'][n%3];g.fillRect(sx,sy,TILE,TILE);g.fillStyle='rgba(255,255,255,.12)';g.fillRect(sx+((hash>>>2)%23),sy+((hash>>>7)%21),5,2);}else{g.fillStyle=['#568d4b','#5b934f','#609853','#548849','#639b55','#5a914d','#5d9551','#568c49','#629651'][n];g.fillRect(sx,sy,TILE,TILE);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(sx+((hash>>>2)%25),sy+((hash>>>7)%25),2+(hash%4),2);g.fillStyle='rgba(20,48,28,.24)';g.fillRect(sx+((hash>>>11)%27),sy+((hash>>>16)%27),3,2);}}return c;}
function drawArena(){
 const c=$('arena'),ctx=c.getContext('2d');if(!ctx)return;
 const rect=c.getBoundingClientRect(),w=rect.width||window.innerWidth,h=rect.height||window.innerHeight,dpr=Number(c.dataset.dpr)||Math.min(1.5,window.devicePixelRatio||1);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
 const p=match.player,camX=p.x-w/2,camY=p.y-h/2;
 if(!match.terrainCanvas)match.terrainCanvas=buildTerrainCache(match.worldSeed);ctx.drawImage(match.terrainCanvas,camX,camY,w,h,0,0,w,h);
 const x0=Math.max(0,Math.floor(camX/TILE)),y0=Math.max(0,Math.floor(camY/TILE)),x1=Math.min(SIZE,Math.ceil((camX+w)/TILE)+1),y1=Math.min(SIZE,Math.ceil((camY+h)/TILE)+1);
 const waveTime=performance.now()/720;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const edge=Math.min(x,y,SIZE-1-x,SIZE-1-y);if(edge>=WATER_BORDER)continue;const sx=x*TILE-camX,sy=y*TILE-camY,seed=(x*73856093^y*19349663^match.worldSeed)>>>0,shimmer=.5+.5*Math.sin(waveTime*1.4+x*.31-y*.22);ctx.save();ctx.globalAlpha=.10+shimmer*.08;ctx.fillStyle='#b6f5ff';ctx.beginPath();ctx.ellipse(sx+8+((seed>>>3)%18),sy+8+((seed>>>9)%17),5+shimmer*5,1.4,Math.sin(waveTime+x*.2)*.18,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.22;ctx.strokeStyle='#b9f5ff';ctx.lineWidth=1.2;const wy=sy+8+Math.sin(waveTime+x*.65+y*.24)*4;ctx.beginPath();ctx.moveTo(sx-2,wy);ctx.quadraticCurveTo(sx+8,wy-3,sx+17,wy+1);ctx.quadraticCurveTo(sx+25,wy+4,sx+34,wy-1);ctx.stroke();ctx.restore();}
 match.walls.forEach(w=>{const x=w.x-camX,y=w.y-camY;ctx.save();ctx.translate(x,y);ctx.rotate(w.rotation||0);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-27,-7,54,22);ctx.fillStyle='#252a31';ctx.fillRect(-25,-11,50,22);ctx.fillStyle='#8b929b';ctx.fillRect(-23,-15,46,6);ctx.fillStyle=w.team===0?'#ff873d':'#d65b4a';ctx.fillRect(-25,13,50*Math.max(0,w.hp/w.maxHp),4);ctx.strokeStyle='#b8c5cf';ctx.lineWidth=1.5;ctx.strokeRect(-25,-11,50,22);ctx.restore();ctx.fillStyle='#fff';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText((localStorage.getItem(PRIME_LANG_KEY)==='en'?'WALL Lv. ':'СТЕНА ур.')+w.level,x,y-20);});match.barracks.forEach(b=>{const x=b.x-camX,y=b.y-camY;ctx.save();ctx.translate(x,y);ctx.rotate(b.rotation||0);ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(-24,-18,48,42);ctx.fillStyle='#49372b';ctx.fillRect(-22,-20,44,38);ctx.fillStyle='#9a6a43';ctx.beginPath();ctx.moveTo(-27,-20);ctx.lineTo(0,-42);ctx.lineTo(27,-20);ctx.fill();ctx.fillStyle='#c5a57a';ctx.fillRect(-18,-17,36,5);ctx.fillStyle='#ff9b62';ctx.fillRect(-5,-8,10,26);ctx.fillStyle='#f5d8ad';ctx.fillRect(-2,-5,4,15);ctx.restore();ctx.fillStyle='#fff';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText((localStorage.getItem(PRIME_LANG_KEY)==='en'?'BARRACKS Lv. ':'КАЗАРМА ур.')+b.level,x,y-47);});match.towers.forEach(t=>drawTower(ctx,t,camX,camY));
 if(buildMode&&match.buildPreview)drawBuildPreview(ctx,camX,camY);
 function fighter(f,isPlayer,isAlly=false){
  const x=f.x-camX,y=f.y-camY,phase=(f.walkPhase||performance.now()/190)+(f.id||0),step=Math.sin(phase)*3.2;
  const skin=isPlayer?'#e8bd98':isAlly?'#d9ad86':'#d4a07d',cloth=isPlayer?'#263d59':isAlly?'#17618b':'#5b3027',trim=isPlayer?'#ff8a36':isAlly?'#63c8ff':'#e36a42';
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='rgba(0,0,0,.34)';ctx.beginPath();ctx.ellipse(0,15,15,5,0,0,Math.PI*2);ctx.fill();
  // articulated boots and legs
  ctx.strokeStyle='#20242b';ctx.lineWidth=6;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-4,7);ctx.lineTo(-5+step,18);ctx.moveTo(4,7);ctx.lineTo(5-step,18);ctx.stroke();
  ctx.fillStyle='#15191f';ctx.fillRect(-10+step,16,9,4);ctx.fillRect(2-step,16,9,4);
  // torso with layered armor and shoulders
  const body=ctx.createLinearGradient(-10,-5,10,10);body.addColorStop(0,'#aab5c3');body.addColorStop(.18,cloth);body.addColorStop(.75,'#202a37');body.addColorStop(1,'#111820');
  ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-8,-7);ctx.lineTo(-12,-1);ctx.lineTo(-9,9);ctx.lineTo(9,9);ctx.lineTo(12,-1);ctx.lineTo(8,-7);ctx.closePath();ctx.fill();
  ctx.fillStyle=trim;ctx.fillRect(-2,-5,4,13);ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(-7,-5,3,9);
  ctx.fillStyle=cloth;ctx.beginPath();ctx.arc(-10,-3,4,0,Math.PI*2);ctx.arc(10,-3,4,0,Math.PI*2);ctx.fill();
  // arms swing while walking
  ctx.strokeStyle=skin;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-10,-1);ctx.lineTo(-13-step*.45,7);ctx.moveTo(10,-1);ctx.lineTo(13+step*.45,7);ctx.stroke();
  // neck and head with hair/helmet silhouette
  ctx.fillStyle=skin;ctx.fillRect(-3,-12,6,6);
  const head=ctx.createRadialGradient(-3,-22,1,0,-19,11);head.addColorStop(0,'#ffe0bd');head.addColorStop(.7,skin);head.addColorStop(1,'#9b624d');
  ctx.fillStyle=head;ctx.beginPath();ctx.ellipse(0,-19,8,10,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=isPlayer?'#202b3a':isAlly?'#142c43':'#30201e';ctx.beginPath();ctx.moveTo(-9,-20);ctx.quadraticCurveTo(-10,-32,0,-30);ctx.quadraticCurveTo(10,-31,9,-19);ctx.lineTo(5,-23);ctx.lineTo(-5,-24);ctx.closePath();ctx.fill();
  ctx.fillStyle='#f4eee4';ctx.beginPath();ctx.ellipse(-3,-19,2.1,1.6,0,0,Math.PI*2);ctx.ellipse(3,-19,2.1,1.6,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#263d50';ctx.beginPath();ctx.arc(-2.7,-19,1,0,Math.PI*2);ctx.arc(3.3,-19,1,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#754638';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-2,-13);ctx.quadraticCurveTo(0,-12,2,-13);ctx.stroke();
  if(f.flash>0){ctx.globalAlpha=.65;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(0,-10,14,21,0,0,Math.PI*2);ctx.fill();}
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(isPlayer?'Kisia':(f.name||'Воин'),x,y-36);ctx.shadowBlur=0;
  if(!isPlayer){ctx.fillStyle='#140d0b';ctx.fillRect(x-18,y-43,36,4);ctx.fillStyle=trim;ctx.fillRect(x-18,y-43,36*Math.max(0,f.hp/f.maxHp),4);}
 }
 match.bots.forEach(b=>{if(b.alive)drawPrimeFighter(ctx,b,camX,camY,false,false);});match.allies.forEach(a=>{if(a.alive)drawPrimeFighter(ctx,a,camX,camY,false,true);});match.units.forEach(u=>{if(u.alive)drawPrimeFighter(ctx,u,camX,camY,false,u.team===0);});drawPrimeFighter(ctx,p,camX,camY,true,false);
 for(const tracer of match.tracers){
  const alpha=Math.max(0,tracer.life/tracer.maxLife);ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=tracer.team===0?'#8be9ff':'#ff9b75';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.lineWidth=tracer.team===0?3:2.5;ctx.beginPath();ctx.moveTo(tracer.x1-camX,tracer.y1-camY);ctx.lineTo(tracer.x2-camX,tracer.y2-camY);ctx.stroke();ctx.restore();
 }
 for(const item of match.damageTexts){
  const alpha=Math.max(0,item.life/item.maxLife),tx=item.x-camX,ty=item.y-camY;ctx.save();ctx.globalAlpha=alpha;ctx.font='900 16px Segoe UI';ctx.textAlign='center';ctx.fillStyle=item.team===0?'#93eaff':'#ff9a81';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText('-'+item.value,tx,ty);ctx.restore();
 }
 drawMiniMap();
 // Arena title removed.
}
function drawMiniMap(){
 const c=$('arena-minimap');if(!c||!match)return;
 const ctx=c.getContext('2d'),w=c.width,h=c.height;if(!ctx)return;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#175775';ctx.fillRect(0,0,w,h);
 const pad=8,scaleX=(w-pad*2)/(SIZE*TILE),scaleY=(h-pad*2)/(SIZE*TILE);
 const sx=x=>pad+x*scaleX,sy=y=>pad+y*scaleY;
 ctx.fillStyle='#b7a06b';ctx.fillRect(sx(WATER_BORDER*TILE),sy(WATER_BORDER*TILE),(SIZE-WATER_BORDER*2)*TILE*scaleX,(SIZE-WATER_BORDER*2)*TILE*scaleY);
 ctx.fillStyle='#54894b';ctx.fillRect(sx((WATER_BORDER+3)*TILE),sy((WATER_BORDER+3)*TILE),(SIZE-(WATER_BORDER+3)*2)*TILE*scaleX,(SIZE-(WATER_BORDER+3)*2)*TILE*scaleY);
 ctx.strokeStyle='#d5f6fc';ctx.lineWidth=1;ctx.strokeRect(sx(WATER_BORDER*TILE),sy(WATER_BORDER*TILE),(SIZE-WATER_BORDER*2)*TILE*scaleX,(SIZE-WATER_BORDER*2)*TILE*scaleY);
 for(const wall of match.walls){ctx.fillStyle=wall.team===0?'#ffb16d':'#ff6868';ctx.fillRect(sx(wall.x)-2,sy(wall.y)-1,4,2);}
 for(const tower of match.towers){if(tower.hp<=0)continue;ctx.fillStyle=tower.team===0?'#e6f3ff':'#ff8576';ctx.fillRect(sx(tower.x)-2,sy(tower.y)-2,4,4);}
 for(const br of match.barracks){ctx.fillStyle=br.team===0?'#96dcff':'#ff9a8c';ctx.fillRect(sx(br.x)-2,sy(br.y)-2,4,4);}
 for(const bot of match.bots){if(!bot.alive)continue;ctx.fillStyle='#ff504d';ctx.beginPath();ctx.arc(sx(bot.x),sy(bot.y),3.2,0,Math.PI*2);ctx.fill();}
 for(const ally of match.allies){if(!ally.alive)continue;ctx.fillStyle='#a1e9ff';ctx.beginPath();ctx.arc(sx(ally.x),sy(ally.y),2.8,0,Math.PI*2);ctx.fill();}
 for(const unit of match.units){if(!unit.alive)continue;ctx.fillStyle=unit.team===0?'#9be8ff':'#ff8a73';ctx.fillRect(sx(unit.x)-1,sy(unit.y)-1,3,3);}
 ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(sx(match.player.x),sy(match.player.y),4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#09121b';ctx.lineWidth=1.5;ctx.stroke();
 ctx.font='bold 9px Segoe UI';ctx.textAlign='left';ctx.fillStyle='#f7f7f7';ctx.shadowColor='#000';ctx.shadowBlur=3;ctx.fillText('КАРТА',8,10);ctx.shadowBlur=0;
}
function keyDirection(code){return ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code);}
window.addEventListener('keydown',e=>{
 if(e.code==='F11'){e.preventDefault();e.stopPropagation();if(window.pywebview?.api?.toggle_fullscreen){window.pywebview.api.toggle_fullscreen().then(r=>{if(r?.ok===false)throw new Error(r.message||'fullscreen failed');}).catch(()=>{});}else if(document.fullscreenElement){document.exitFullscreen?.().catch?.(()=>{});}else{document.documentElement.requestFullscreen?.().catch(()=>{});}return;}
 if(scene!=='battle')return;
 if(buildMode&&e.code==='KeyR'){buildRotation=(buildRotation+Math.PI/2)%(Math.PI*2);if(match){match.buildPreview=match.buildPreview?{...match.buildPreview,rotation:buildRotation}:buildPlacementFromPointer(window.innerWidth/2,window.innerHeight/2);}$('tower-feedback').textContent='Поворот постройки: '+Math.round(buildRotation*180/Math.PI)+'°';e.preventDefault();e.stopPropagation();return;}
 if(e.code==='ShiftLeft'||e.code==='ShiftRight'){pressed.add(e.code);e.preventDefault();return;}
 if(keyDirection(e.code)){pressed.add(e.code);e.preventDefault();e.stopPropagation();}
 else if(e.code==='Space'){e.preventDefault();attack();}
 else if(e.code==='Escape'){e.preventDefault();finish(false,true);}
},true);
window.addEventListener('keyup',e=>{pressed.delete(e.code);},true);
window.addEventListener('blur',()=>pressed.clear());
$('arena').addEventListener('pointermove',e=>{
 if(scene!=='battle'||!match||!buildMode)return;
 match.buildPreview=buildPlacementFromPointer(e.clientX,e.clientY);
});
$('arena').addEventListener('pointerleave',()=>{if(match&&buildMode)match.buildPreview=null;});
$('arena').addEventListener('pointerdown',e=>{
 if(scene!=='battle'||!match||e.button!==0)return;
 const rect=$('arena').getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
 const wx=sx+match.player.x-rect.width/2,wy=sy+match.player.y-rect.height/2;
 if(buildMode){
  const placement=buildPlacementAtWorld(wx,wy);
  match.buildPreview=placement;
  if(!placement.valid){$('tower-feedback').textContent=placement.reason+' Наведи курсор на зелёную площадку.';updateHud();return;}
  const px=placement.x,py=placement.y,cost=placement.cost,kind=buildMode;
  match.playerCoins-=cost;
  if(kind==='wall')match.walls.push({x:px,y:py,team:0,level:1,hp:260,maxHp:260,rotation:placement.rotation||0});
  if(kind==='tower'){const count=match.towers.filter(t=>t.team===0&&!t.isPlayer).length+1;const built=createTower(px,py,profile,true);built.isPlayer=false;built.team=0;built.kind='archer';built.displayName='\u0411\u0430\u0448\u043d\u044f \u043b\u0443\u0447\u043d\u0438\u043a\u0430 \u2116'+count;built.rotation=placement.rotation||0;match.towers.push(built);}
  if(kind==='barracks')match.barracks.push({x:px,y:py,team:0,level:1,hp:500,maxHp:500,timer:0,rotation:placement.rotation||0});
  $('tower-feedback').textContent=(kind==='wall'?'Стена':kind==='tower'?'Башня лучника':'Казарма')+' построена.';
  buildMode=null;buildRotation=0;match.buildPreview=null;document.body.classList.remove('prime-building');$('build-panel').classList.add('hidden');
  save();renderTowerList();
 }else if(!upgradeStructureAt(wx,wy))attack();
 updateHud();$('arena').focus();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pressed.clear();});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('beforeunload',()=>{if(searchTimer)clearInterval(searchTimer);stopLoop();});
$('build-toggle').addEventListener('click',()=>{$('balance-panel').classList.add('hidden');$('bot-info-panel').classList.add('hidden');$('build-panel').classList.toggle('hidden');});
$('balance-toggle').addEventListener('click',()=>{$('build-panel').classList.add('hidden');$('bot-info-panel').classList.add('hidden');$('balance-panel').classList.toggle('hidden');updateHud();});
$('bot-info-toggle').addEventListener('click',()=>{$('build-panel').classList.add('hidden');$('balance-panel').classList.add('hidden');$('bot-info-panel').classList.toggle('hidden');});
$('build-cancel').addEventListener('click',()=>{buildMode=null;buildRotation=0;if(match)match.buildPreview=null;document.body.classList.remove('prime-building');$('build-panel').classList.add('hidden');$('tower-feedback').textContent='Выбор постройки отменён.';});
document.querySelectorAll('[data-build]').forEach(b=>b.addEventListener('click',()=>{buildMode=b.dataset.build;buildRotation=0;document.body.classList.add('prime-building');$('build-panel').classList.add('hidden');$('tower-feedback').textContent='Зелёный призрак следует за курсором. Щёлкни, чтобы поставить постройку.';if(match)match.buildPreview=buildPlacementFromPointer(window.innerWidth/2,window.innerHeight/2);}));
$('troops-halt').addEventListener('click',()=>setTroopsHalted());$('regroup-troops').addEventListener('click',regroupTroops);$('guard-mode').addEventListener('click',toggleGuardMode);$('rally-troops').addEventListener('click',rallyTroops);
$('train-unit').addEventListener('click',()=>{if(!match)return;const br=match.barracks.find(x=>x.team===0);if(!br){buildMode='barracks';document.body.classList.add('prime-building');$('build-panel').classList.remove('hidden');$('tower-feedback').textContent='Сначала построй казарму: выбери «Дом воинов», затем наведи мышь на место установки.';if(match)match.buildPreview=buildPlacementFromPointer(window.innerWidth/2,window.innerHeight/2);return;}if(match.playerCoins<100){$('tower-feedback').textContent='Для найма воина нужно 100 ◆.';return;}match.playerCoins-=100;spawnUnit(0,br.x,br.y);updateHud();});
updateProfile();
// Economy accrues outside battles.
window.setInterval(()=>{if(match&&!match.finished){match.bots.forEach(b=>{b.elo=b.profile.elo;const row=$('bot-'+b.id);if(row)row.querySelector('span').textContent='Башня ур. '+b.profile.towerLevel+' · '+b.profile.coins+' ◆ · '+b.elo+' ELO';});updateHud();save();}},1000);
})();
