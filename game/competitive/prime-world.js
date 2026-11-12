(() => {
'use strict';
const $=id=>document.getElementById(id), SAVE='primeLauncher.profile.v2', WORLD_SAVE='primeLauncher.world.v1', BOT_SAVE='primeLauncher.bots.v1';
const SIZE=100,TILE=32,WATER_BORDER=15,ENEMY_BASE_DISTANCE_BLOCKS=40,UPGRADE_COST=500,COINS_PER_SECOND=10,SPRINT_MULTIPLIER=1.65,upgradeCost=level=>UPGRADE_COST*level,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SKYREALM_DEFAULT_LOOK={skin:'#e8b88c',hair:'#352d3d',armor:'#526fba',accent:'#9cb9ff',eye:'#26334c',face:'normal',hairStyle:'short'};
const botNames=['Рейвен','Фокс','Нокс','Вега','Шторм','Мира','Дрейк','Сайфер'];
let profile={elo:0,botElo:0,matches:0,wins:0,history:[]};
let botsProfile=botNames.map((name,i)=>({name,elo:120+i*85,coins:0,towerLevel:1,wins:0}));
let worldMeta={seed:20261111,size:100,lastTeam:1,lastKind:'training'};
try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&Number.isFinite(s.elo))profile={...profile,...s};}catch(_){}
try{const b=JSON.parse(localStorage.getItem(BOT_SAVE)||'null');if(Array.isArray(b))botsProfile=botsProfile.map((x,i)=>({...x,...(b[i]||{})}));}catch(_){}
try{const w=JSON.parse(localStorage.getItem(WORLD_SAVE)||'null');if(w&&Number.isFinite(w.seed))worldMeta={...worldMeta,...w};}catch(_){}
profile.history=Array.isArray(profile.history)?profile.history:[];
let teamSize=1,matchKind='training',scene='home',match=null,raf=0,lastFrame=0,pressed=new Set(),attackCooldown=0,searchTimer=0,fpsFrames=0,fpsElapsed=0,currentFps=0,buildMode=null,buildRotation=0;
const pages=['home','rank','history','settings','menu','battle'];
function save(){localStorage.setItem(SAVE,JSON.stringify({elo:profile.elo,botElo:profile.botElo||0,matches:profile.matches,wins:profile.wins,history:profile.history}));localStorage.setItem(BOT_SAVE,JSON.stringify(botsProfile));updateProfile();}
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
'⚔ Таверна / Дом воинов · 450 ◆':'⚔ Tavern / Barracks · 450 ◆','Наведи мышь на место установки — зелёный призрак покажет результат. R — повернуть на 90°. Нажми мышью, чтобы построить. Щелчок по башне улучшает её.':'Move the cursor over the arena to see the green placement ghost. Press R to rotate 90 degrees, then click to build.',
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
'Башня улучшена до уровня ':'Tower upgraded to level ','Казарма':'Barracks','Башня лучника':'Archer tower','🔥 Кузница · 650 ◆':'🔥 Forge · 650 ◆','✚ Лазарет · 600 ◆':'✚ Infirmary · 600 ◆','🏹 Стрельбище · 700 ◆':'🏹 Archery Range · 700 ◆','Кузница усиливает воинов рядом, лазарет лечит союзников, стрельбище автоматически обучает лучников. Постройки можно улучшать щелчком по ним. R — поворот, Q — отмена.':'The forge boosts nearby warriors, the infirmary heals allies, and the archery range trains archers automatically. Click a building to upgrade it. R rotates, Q cancels.','🐎 Конюшня · 800 ◆':'🐎 Stable · 800 ◆','🛠 Осадная мастерская · 950 ◆':'🛠 Siege Workshop · 950 ◆','✨ Башня магов · 900 ◆':'✨ Mage Tower · 900 ◆','⚖ Рынок · 550 ◆':'⚖ Market · 550 ◆',
'ТАВЕРНА ур. ':'TAVERN Lv. ','КУЗНИЦА':'FORGE','ЛАЗАРЕТ':'INFIRMARY','СТРЕЛЬБИЩЕ':'ARCHERY RANGE','КОНЮШНЯ':'STABLE','ОСАДНАЯ МАСТЕРСКАЯ':'SIEGE WORKSHOP','БАШНЯ МАГОВ':'MAGE TOWER','РЫНОК':'MARKET',
'Кузница усиливает воинов, лазарет лечит, стрельбище обучает лучников, конюшня — кавалерию, осадная мастерская — катапульты, башня магов бьёт группы врагов, рынок приносит монеты. Щёлкни по зданию для улучшения до 5 уровня. R — поворот, Q — отмена.':'The forge boosts warriors, the infirmary heals, the archery range trains archers, the stable trains cavalry, the siege workshop trains catapults, the mage tower damages groups, and the market generates coins. Click a building to upgrade it to level 5. R rotates, Q cancels.',
'\u{1F3D7} \u0421\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e':'\u{1F3D7} Build',
'|| \u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u043e\u0438\u043d\u043e\u0432':'|| Hold troops',
'> \u0412\u043e\u0438\u043d\u044b: \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c':'> Resume troops',
'\u0421\u043e\u0431\u0440\u0430\u0442\u044c \u0432\u043e\u0439\u0441\u043a\u0430':'Regroup troops',
'\u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u041a\u041b':'Base defense: ON',
'\u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u042b\u041a\u041b':'Base defense: OFF',
'\u0422\u043e\u0447\u043a\u0430 \u0441\u0431\u043e\u0440\u0430':'Rally point',
'\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043c\u0430\u0442\u0447\u0430':'Leave match',
'\u041f\u0430\u0443\u0437\u0430':'Paused',
'\u041c\u0430\u0442\u0447 \u043f\u0440\u0438\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. \u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0438\u0433\u0440\u0443 \u0438\u043b\u0438 \u0432\u044b\u0439\u0442\u0438 \u0432 \u043c\u0435\u043d\u044e.':'The match is paused. Continue or return to the menu.',
'\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0431\u043e\u0439':'Resume battle',
'\u0412\u044b\u0439\u0442\u0438 \u0432 \u043c\u0435\u043d\u044e':'Return to menu',
'\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043c\u0430\u0442\u0447\u0430?':'Leave the match?',
'\u041f\u043e\u0441\u043b\u0435 \u0432\u044b\u0445\u043e\u0434\u0430 \u043c\u0430\u0442\u0447 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0441\u044f, \u0430 \u043d\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d\u043d\u044b\u0439 \u0431\u043e\u0439 \u043d\u0435 \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u0441\u0447\u0438\u0442\u0430\u043d. \u0412\u044b \u0443\u0432\u0435\u0440\u0435\u043d\u044b?':'Leaving ends this match. An unfinished match will not count. Are you sure?',
'\u0414\u0430, \u0432\u044b\u0439\u0442\u0438':'Yes, leave',
'\u041e\u0442\u043c\u0435\u043d\u0430 \u2014 \u043e\u0441\u0442\u0430\u0442\u044c\u0441\u044f \u0432 \u0431\u043e\u044e':'Cancel \u2014 stay in match',
'\u041d\u0435\u043b\u044c\u0437\u044f \u0441\u0442\u0440\u043e\u0438\u0442\u044c \u0437\u0430 \u043f\u0440\u0435\u0434\u0435\u043b\u0430\u043c\u0438 \u0430\u0440\u0435\u043d\u044b.':'Cannot build outside the arena.',
'\u041f\u043e\u0441\u0442\u0440\u043e\u0439\u043a\u0443 \u043d\u0435\u043b\u044c\u0437\u044f \u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043b\u0438\u0437\u043a\u043e \u043a \u0431\u0430\u0437\u0435.':'A structure cannot be placed too close to your base.',
'\u041f\u043e\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u043d\u0430\u0445\u043e\u0434\u0438\u0442\u044c\u0441\u044f \u043d\u0435 \u0434\u0430\u043b\u044c\u0448\u0435 20 \u0431\u043b\u043e\u043a\u043e\u0432 \u043e\u0442 \u0441\u0432\u043e\u0435\u0439 \u0431\u0430\u0437\u044b.':'Structures must be within 20 blocks of your base.',
'\u042d\u0442\u043e \u043c\u0435\u0441\u0442\u043e \u0437\u0430\u043d\u044f\u0442\u043e.':'This spot is occupied.',
'\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043c\u043e\u043d\u0435\u0442: ':'Not enough coins: ',
'\u0412\u0440\u0430\u0436\u0435\u0441\u043a\u0430\u044f \u0431\u0430\u0448\u043d\u044f ':'Enemy archer tower ',
'\u0412\u044b\u0431\u043e\u0440 \u043f\u043e\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043e\u0442\u043c\u0435\u043d\u0451\u043d.':'Build selection cancelled.',
'\u2694 \u0414\u043e\u043c \u0432\u043e\u0438\u043d\u043e\u0432 \xb7 450 \u25c6':'\u2694 Tavern / Barracks \xb7 450 \u25c6',
'\u041a\u0443\u0437\u043d\u0438\u0446\u0430 \u0443\u0441\u0438\u043b\u0438\u0432\u0430\u0435\u0442 \u0432\u043e\u0438\u043d\u043e\u0432, \u043b\u0430\u0437\u0430\u0440\u0435\u0442 \u043b\u0435\u0447\u0438\u0442, \u0441\u0442\u0440\u0435\u043b\u044c\u0431\u0438\u0449\u0435 \u043e\u0431\u0443\u0447\u0430\u0435\u0442 \u043b\u0443\u0447\u043d\u0438\u043a\u043e\u0432, \u043a\u043e\u043d\u044e\u0448\u043d\u044f \u2014 \u043a\u0430\u0432\u0430\u043b\u0435\u0440\u0438\u044e, \u043e\u0441\u0430\u0434\u043d\u0430\u044f \u043c\u0430\u0441\u0442\u0435\u0440\u0441\u043a\u0430\u044f \u2014 \u043a\u0430\u0442\u0430\u043f\u0443\u043b\u044c\u0442\u044b, \u0431\u0430\u0448\u043d\u044f \u043c\u0430\u0433\u043e\u0432 \u0431\u044c\u0451\u0442 \u0433\u0440\u0443\u043f\u043f\u044b \u0432\u0440\u0430\u0433\u043e\u0432, \u0440\u044b\u043d\u043e\u043a \u043f\u0440\u0438\u043d\u043e\u0441\u0438\u0442 \u043c\u043e\u043d\u0435\u0442\u044b. \u0429\u0451\u043b\u043a\u043d\u0438 \u043f\u043e \u0437\u0434\u0430\u043d\u0438\u044e \u0434\u043b\u044f \u0443\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u044f \u0434\u043e 5 \u0443\u0440\u043e\u0432\u043d\u044f. R \u2014 \u043f\u043e\u0432\u043e\u0440\u043e\u0442, Q \u2014 \u043e\u0442\u043c\u0435\u043d\u0430.':'The forge boosts warriors, the infirmary heals, the archery range trains archers, the stable trains cavalry, the siege workshop trains catapults, the mage tower damages groups, and the market generates coins. Click a building to upgrade it to level 5. R rotates, Q cancels.'

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
 const player={id:0,team:0,x:playerBaseX+110,y:playerBaseY+45,hp:130,maxHp:130,speed:190,sprintStamina:100,maxSprintStamina:100,alive:true,attack:0,flash:0};
 const allies=[],bots=[],towers=[];
 towers.push(createTower(player.x-230,player.y+155,profile,true));

 for(let i=0;i<teamSize-1;i++){
  const offset=(i-(teamSize-2)/2)*62;
  const ally={id:i+1,team:0,x:player.x+45+offset,y:player.y+20,hp:130,maxHp:130,speed:190,attackRange:112,damage:48,alive:true,attack:0,flash:0,name:['Страж','Искра'][i]||'Союзник '+(i+1)};
  allies.push(ally);
 }
 for(let i=0;i<teamSize;i++){
  const angle=-Math.PI/2+(i-(teamSize-1)/2)*.55;
  const bp=botsProfile[i%botsProfile.length];bp.coins=650;bp.towerLevel=1;
  const enemyBaseX=player.x+ENEMY_BASE_DISTANCE_BLOCKS*TILE,formationY=[0,-64,64][i]||0,x=enemyBaseX+(i===0?0:16),y=player.y+formationY;
  const bot={id:i+1,team:1,x,y,homeX:x,homeY:y,retreating:false,respawnAt:0,deaths:0,hp:220+bp.towerLevel*35,maxHp:220+bp.towerLevel*35,speed:190,attackRange:112,damage:48,alive:true,attack:0,flash:0,elo:bp.elo,name:bp.name,profile:bp,ai:{nextUpgradeAt:38+Math.random()*18,nextBuildAt:24+Math.random()*18,nextBarracksAt:82+Math.random()*24,nextWallAt:118+Math.random()*32,nextStableAt:155+Math.random()*35}};
  bots.push(bot);

 }
 if(bots.length){const enemyBaseTower=createTower(bots[0].homeX+125,bots[0].homeY-95,bots[0].profile,false);enemyBaseTower.team=1;enemyBaseTower.displayName='\u0426\u0438\u0442\u0430\u0434\u0435\u043b\u044c '+bots[0].name;towers.push(enemyBaseTower);}
 worldMeta={...worldMeta,size:SIZE,lastTeam:teamSize,lastKind:matchKind};localStorage.setItem(WORLD_SAVE,JSON.stringify(worldMeta));
 const walls=[];
 match={player,bots,allies,towers,walls,barracks:[],supportBuildings:[],units:[],tracers:[],damageTexts:[],combatFeed:[],buildPreview:null,playerBase:{x:playerBaseX,y:playerBaseY},enemyBase:{x:player.x+ENEMY_BASE_DISTANCE_BLOCKS*TILE,y:player.y},playerCoins:0,playerTowerLevel:1,kind:'training',team:teamSize,started:performance.now(),finished:false,worldSeed:worldMeta.seed,terrainCanvas:null,uiTick:0,troopsHalted:false,guardMode:true,regroupOrder:false,rallyUntil:0,botCoinTick:0,elapsed:0,nextEnemyAttackAt:300,enemyAssaultUntil:0,enemyAggroUntil:0,enemyDefenseBoostUntil:0,playerHasEngaged:false,enemyCounterAt:0,enemyCounterQueued:false,nextCounterRollAt:0,enemyNoticeUntil:0,playerBaseLevel:1,unitCounter:0,enemyState:'РАЗВИВАЕТ БАЗУ'};
 attackCooldown=0;pressed.clear();$('troops-halt').textContent='|| \u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u043e\u0438\u043d\u043e\u0432';$('regroup-troops').textContent='\u0421\u043e\u0431\u0440\u0430\u0442\u044c\u0441\u044f';$('guard-mode').textContent='\u041e\u0431\u043e\u0440\u043e\u043d\u0430: \u0412\u041a\u041b';$('rally-troops').textContent='\u0422\u043e\u0447\u043a\u0430 \u0441\u0431\u043e\u0440\u0430';$('battle-title').textContent=(teamSize+' × '+teamSize)+' · ТРЕНИРОВКА';
 $('battle-feed').innerHTML='';
 renderBotList();renderTowerList();$('hp-fill').style.width='100%';$('hp-label').textContent=player.hp+' / '+player.maxHp;updateProfile();updateHud();show('battle');resizeArenaCanvas();drawArena();
}
function renderBotList(){$('bot-list').innerHTML=match.bots.map(b=>'<div class="bot" id="bot-'+b.id+'"><b>'+b.name+'</b><br><span>Башня ур. '+b.profile.towerLevel+' · '+b.profile.coins+' ◆ · '+b.elo+' ELO</span><div class="hpbar" style="margin-top:6px"><span id="bot-hp-'+b.id+'" style="width:100%"></span></div></div>').join('');}
function renderTowerList(){
 $('enemy-towers').innerHTML='<small style="color:#ff9b62">БАШНИ СОПЕРНИКОВ</small>'+match.towers.filter(t=>t.team===1).map((t,i)=>'<div class="bot" id="tower-row-'+i+'">'+(t.displayName||t.owner.name)+' | Lv. '+t.level+'<div class="hpbar" style="margin-top:6px"><span id="tower-hp-'+i+'" style="width:100%"></span></div></div>').join('');
}
function finish(win,abandoned=false){
 if(!match||match.finished)return;match.finished=true;stopLoop();pressed.clear();
 profile.matches++;if(win&&!abandoned)profile.wins++;const eloDelta=abandoned?0:(win?20+Math.floor(Math.random()*11):-(20+Math.floor(Math.random()*16)));if(match.kind==='training')profile.botElo=Math.max(0,(profile.botElo||0)+eloDelta);else profile.elo=Math.max(0,profile.elo+eloDelta);profile.history.unshift({mode:match.kind==='training'?'BOT':'PLAYER',label:(win?'ПОБЕДА':abandoned?'ВЫХОД':'ПОРАЖЕНИЕ')+' · '+match.team+'×'+match.team,delta:abandoned?'Без изменения ELO':(eloDelta>0?'+'+eloDelta+' ELO':eloDelta+' ELO'),eloDelta,date:new Date().toLocaleString('ru-RU'),opponents:match.bots.map(b=>b.name)});profile.history=profile.history.slice(0,100);match.playerCoins=0;save();renderHistory();
 $('result-title').textContent=win?'ПОБЕДА':'ПОРАЖЕНИЕ';
 $('result-copy').textContent='Матч завершён. Монеты обнулены. '+(abandoned?'ELO без изменений.':'Изменение ELO: '+(eloDelta>0?'+':'')+eloDelta);
 $('result-modal').classList.remove('hidden');
}
$('result-menu').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');});
$('result-again').addEventListener('click',()=>{$('result-modal').classList.add('hidden');match=null;show('menu');beginSearch();});
$('leave-match').addEventListener('click',requestLeaveMatch);
$('pause-resume').addEventListener('click',resumeMatch);$('pause-leave').addEventListener('click',requestLeaveMatch);$('leave-confirm-cancel').addEventListener('click',cancelLeaveMatch);$('leave-confirm-yes').addEventListener('click',confirmLeaveMatch);
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
 q('hud-elo').textContent=(m.kind==='training'?'BOT ELO '+(profile.botElo||0):profile.elo+' ELO');
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
  const cost={wall:150,tower:300,barracks:450,forge:650,infirmary:600,archery:700,stable:800,siege:950,mage:900,market:550}[button.dataset.build]||0;
  button.disabled=match.playerCoins<cost;
 });
}
function upgradeStructureAt(x,y){
 const m=match,items=[...m.walls.filter(w=>w.team===0),...m.barracks.filter(b=>b.team===0),...(m.supportBuildings||[]).filter(b=>b.team===0),...m.towers.filter(t=>t.team===0&&!t.isPlayer)];
 const o=items.find(v=>Math.hypot(v.x-x,v.y-y)<58);
 if(!o)return false;
 const level=o.level||1;
 if(level>=5){$('tower-feedback').textContent='Максимальный уровень постройки: 5/5.';return true;}
 const baseCost={wall:100,tower:200,barracks:180,forge:240,infirmary:220,archery:260,stable:300,siege:340,mage:320,market:180};
 const kind=o.kind==='archer'?'tower':(o.kind||(m.barracks.includes(o)?'barracks':(o.isTower?'tower':'wall'))),cost=(baseCost[kind]||180)*level;
 if(m.playerCoins<cost){$('tower-feedback').textContent='Не хватает '+(cost-Math.floor(m.playerCoins))+' ◆. Для уровня '+(level+1)+' нужно '+cost+' ◆.';return true;}
 m.playerCoins-=cost;o.level=level+1;
 const previousMax=o.maxHp||260,healthFactor=kind==='wall'?1.42:1.34;
 o.maxHp=Math.round(previousMax*healthFactor);o.hp=Math.min(o.maxHp,o.hp+Math.round(previousMax*(healthFactor-1)));
 if(kind==='tower'){o.damage=Math.round((o.damage||18)*1.26);o.range=Math.round((o.range||210)*1.08);o.fire=Math.max(0,(o.fire||0)-.09);}
 if(kind==='wall'&&o.level>=3)o.spikeDamage=10+(o.level-2)*6;
 if(kind==='barracks'){o.spawnInterval=Math.max(8,18-(o.level-1)*2.2);o.unitCapacity=8+(o.level-1)*3;}
 if(kind==='forge')o.bonus=.18+(o.level-1)*.08;
 if(kind==='infirmary')o.healRate=10+(o.level-1)*4;
 if(kind==='archery')o.trainInterval=Math.max(12,26-(o.level-1)*3);
 if(kind==='stable'){o.trainInterval=Math.max(14,34-(o.level-1)*4);o.unitCapacity=2+(o.level-1);}
 if(kind==='siege'){o.trainInterval=Math.max(27,54-(o.level-1)*7);o.unitCapacity=1+Math.floor((o.level-1)/2);}
 if(kind==='mage'){o.damage=36+(o.level-1)*14;o.range=250+(o.level-1)*28;o.fireInterval=Math.max(.85,1.7-(o.level-1)*.18);}
 if(kind==='market')o.incomeRate=3+(o.level-1)*2;
 $('tower-feedback').textContent=(o.displayName||({wall:'Стена',tower:'Башня лучника',barracks:'Казарма',forge:'Кузница',infirmary:'Лазарет',archery:'Стрельбище',stable:'Конюшня',siege:'Осадная мастерская',mage:'Башня магов',market:'Рынок'}[kind]||'Постройка'))+' улучшена до уровня '+o.level+'/5. ХП, функции и модель усилены.';
 save();updateHud();drawArena();return true;
}
function spawnUnit(team,x,y){
 const sourceBarracks=match.barracks.find(br=>br.team===team&&Math.hypot(br.x-x,br.y-y)<4);
 const teamBarracks=match.barracks.find(br=>br.team===team&&br.hp>0);
 const barracksLevel=sourceBarracks?.level||teamBarracks?.level||1;
 const capacity=teamBarracks?.unitCapacity||(8+(barracksLevel-1)*3);
 const current=match.units.filter(u=>u.team===team&&u.alive).length;
 if(current>=capacity)return null;
 const spawnX=sourceBarracks?x+(team===0?44:-44):x,spawnY=sourceBarracks?y+8:y;
 const homeBot=team===1&&match?.bots?.length?match.bots.reduce((best,b)=>!best||Math.hypot(b.x-spawnX,b.y-spawnY)<Math.hypot(best.x-spawnX,b.y-spawnY)?b:best,null):null;
 const hp=130+(barracksLevel-1)*32,damage=48+(barracksLevel-1)*10;
 const u={id:++match.unitCounter,team,x:spawnX,y:spawnY,homeX:homeBot?.homeX??spawnX,homeY:homeBot?.homeY??spawnY,ownerBot:homeBot?.id??null,retreating:false,hp,maxHp:hp,damage,range:112+(barracksLevel-1)*5,speed:190,attack:0,attackInterval:.42,flash:0,alive:true,name:team===0?'Воин союзника':'Вражеский воин'};
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
 let damage=Math.max(1,Math.round(Number(amount)||0));const isWarrior=!!attacker&&attacker!==match.player&&(match.allies.includes(attacker)||match.units.includes(attacker));if(isWarrior&&attacker.team===0){const forge=(match.supportBuildings||[]).find(b=>b.team===0&&b.kind==='forge'&&b.hp>0&&Math.hypot(b.x-attacker.x,b.y-attacker.y)<(210+(b.level||1)*28));if(forge)damage=Math.round(damage*(1+(forge.bonus||.18)));}const wasAlive=target.alive!==false;
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
function canEntityOccupy(x,y,radius=12,mover=null){
 const m=match;if(!m)return true;
 if(mover&&mover===m.player&&m.playerBase){const bx=x-m.playerBase.x,by=y-m.playerBase.y;if(Math.abs(bx)<65+radius&&Math.abs(by)<27+radius)return false;}
 const min=TILE*(WATER_BORDER+1)+radius,max=SIZE*TILE-min;
 if(x<min||y<min||x>max||y>max)return false;
 for(const wall of m.walls){
  if(wall.hp<=0)continue;
  if(mover&&mover.team===0&&wall.team===0)continue;
  const dx=x-wall.x,dy=y-wall.y,angle=wall.rotation||0,c=Math.cos(angle),s=Math.sin(angle);
  const lx=dx*c+dy*s,ly=-dx*s+dy*c;
  if(Math.abs(lx)<25+radius&&Math.abs(ly)<11+radius){if(mover&&mover.team!==wall.team&&wall.spikeDamage&&m.elapsed>=(wall.spikeNextAt||0)){wall.spikeNextAt=m.elapsed+1;applyCombatDamage(mover,wall.spikeDamage,wall);}return false;}
 }
 for(const structure of [...m.towers,...m.barracks,...(m.supportBuildings||[])]){
  if(structure.hp<=0)continue;
  if(mover&&mover.team===0&&structure.team===0&&(structure.kind==='archer'||structure.isPlayer))continue;
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
 if(canEntityOccupy(nx,entity.y,radius,entity)){entity.x=nx;moved=moved||Math.abs(dx)>.001;}
 if(canEntityOccupy(entity.x,ny,radius,entity)){entity.y=ny;moved=moved||Math.abs(dy)>.001;}
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
function updateSupportBuildings(dt){
 const m=match;if(!m)return;
 for(const building of (m.supportBuildings||[])){
  if(building.hp<=0)continue;
  const team=building.team||0,level=building.level||1,bots=m.bots||[],allies=m.allies||[],units=m.units||[];
  const ownerBot=team===1?bots.find(bot=>bot.profile===building.owner):null;
  const getCoins=()=>team===0?m.playerCoins:(ownerBot?.profile.coins||0);
  const spend=amount=>{if(team===0)m.playerCoins-=amount;else if(ownerBot)ownerBot.profile.coins-=amount;};
  const friendly=team===0?[...(m.player?[m.player]:[]),...allies.filter(a=>a.alive),...units.filter(u=>u.team===0&&u.alive)]:[...bots.filter(b=>b.alive),...units.filter(u=>u.team===1&&u.alive)];
  const enemies=team===0?[...bots.filter(b=>b.alive),...units.filter(u=>u.team===1&&u.alive)]:[...(m.player?[m.player]:[]),...allies.filter(a=>a.alive),...units.filter(u=>u.team===0&&u.alive)];
  if(building.kind==='market'&&team===0){m.playerCoins+=(building.incomeRate||3)*dt;continue;}
  if(building.kind==='infirmary'){
   const radius=190+level*24,rate=building.healRate||10;
   for(const patient of friendly){if(patient.hp>0&&patient.hp<patient.maxHp&&Math.hypot(patient.x-building.x,patient.y-building.y)<=radius)patient.hp=Math.min(patient.maxHp,patient.hp+rate*dt);}
  }
  if(building.kind==='archery'||building.kind==='stable'||building.kind==='siege'){
   building.trainTimer=(building.trainTimer||0)+dt;
   const kind=building.kind==='archery'?'archer':building.kind==='stable'?'cavalry':'siege';
   const alive=m.units.filter(u=>u.team===team&&u.alive&&u.kind===kind).length;
   const cap=building.unitCapacity||(kind==='archer'?4:kind==='cavalry'?2:1);
   const cost=kind==='archer'?Math.max(100,140-(level-1)*10):kind==='cavalry'?190:250;
   const interval=building.trainInterval||(kind==='archer'?26:kind==='cavalry'?34:54);
   if(building.trainTimer>=interval&&alive<cap&&getCoins()>=cost){
    const unit=spawnUnit(team,building.x+34,building.y+18);
    if(!unit)continue;
    building.trainTimer=0;spend(cost);
    if(kind==='archer'){
     unit.kind='archer';unit.name=team===0?'Лучник':'Вражеский лучник';unit.hp=105+(level-1)*20;unit.maxHp=unit.hp;
     unit.damage=28+(level-1)*8;unit.range=220+(level-1)*14;unit.speed=165;unit.attackInterval=.95;
    }else if(kind==='cavalry'){
     unit.kind='cavalry';unit.name=team===0?'Кавалерист':'Вражеский всадник';unit.hp=220+(level-1)*38;unit.maxHp=unit.hp;
     unit.damage=62+(level-1)*11;unit.range=128+(level-1)*5;unit.speed=245+(level-1)*8;unit.attackInterval=.58;
    }else{
     unit.kind='siege';unit.name=team===0?'Катапульта':'Вражеская катапульта';unit.hp=320+(level-1)*55;unit.maxHp=unit.hp;
     unit.damage=155+(level-1)*32;unit.range=190+(level-1)*14;unit.speed=92;unit.attackInterval=2.2;
    }
    if(team===0)addCombatFeed(({archer:'Стрельбище подготовило лучника',cavalry:'Конюшня подготовила кавалериста',siege:'Осадная мастерская подготовила катапульту'})[kind]);
   }
  }
  if(building.kind==='mage'){
   building.fire=(building.fire||0)-dt;
   if(building.fire<=0){
    const range=building.range||250+(level-1)*28,found=chooseNearestTarget(building,enemies,range);
    if(found){
     building.fire=building.fireInterval||Math.max(.85,1.7-(level-1)*.18);
     const damage=building.damage||36+(level-1)*14,radius=48+level*5;
     m.tracers.push({x1:building.x,y1:building.y-25,x2:found.target.x,y2:found.target.y-10,life:.28,maxLife:.28,team});
     for(const enemy of enemies){if(Math.hypot(enemy.x-found.target.x,enemy.y-found.target.y)<=radius)applyCombatDamage(enemy,damage,building);}
     if(team===0)addCombatFeed('Башня магов ударила по группе врагов');
    }
   }
  }
 }
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
   const owned=m.towers.filter(t=>t.team===1&&t.kind==='archer').length;
   if(b.coins>=300&&owned<1){
    const angle=(bot.id%2?Math.PI/2:0),rotation=Math.round(Math.random()*3)*Math.PI/2;
    const x=clamp(bot.homeX+Math.cos(angle)*9*TILE,TILE*4,SIZE*TILE-TILE*4);
    const y=clamp(bot.homeY+Math.sin(angle)*9*TILE,TILE*4,SIZE*TILE-TILE*4);
    const clear=!m.walls.some(o=>Math.hypot(o.x-x,o.y-y)<90)&&!m.barracks.some(o=>Math.hypot(o.x-x,o.y-y)<100)&&!m.towers.some(o=>Math.hypot(o.x-x,o.y-y)<90)&&!(m.supportBuildings||[]).some(o=>Math.hypot(o.x-x,o.y-y)<105);
    if(!clear){ai.nextBuildAt=m.elapsed+8;continue;}
    b.coins-=300;const built=createTower(x,y,b,false);built.kind='archer';built.rotation=rotation;built.displayName='Вражеская башня '+bot.name;m.towers.push(built);ai.nextBuildAt=m.elapsed+92+Math.random()*28;
    m.enemyState=bot.name+' строит башню';m.enemyNoticeUntil=m.elapsed+7;renderTowerList();
   }else ai.nextBuildAt=m.elapsed+8;
  }
  if(m.elapsed>=ai.nextBarracksAt){
   const ownsBarracks=m.barracks.some(br=>br.team===1&&br.owner===b);
   if(b.coins>=450&&!ownsBarracks){
    b.coins-=450;const x=clamp(bot.homeX-8*TILE,TILE*4,SIZE*TILE-TILE*4),y=clamp(bot.homeY+8*TILE,TILE*4,SIZE*TILE-TILE*4);
    const clear=!m.walls.some(o=>Math.hypot(o.x-x,o.y-y)<90)&&!m.towers.some(o=>Math.hypot(o.x-x,o.y-y)<95)&&!m.barracks.some(o=>Math.hypot(o.x-x,o.y-y)<95)&&!(m.supportBuildings||[]).some(o=>Math.hypot(o.x-x,o.y-y)<105);
    if(!clear){ai.nextBarracksAt=m.elapsed+12;continue;}m.barracks.push({x,y,team:1,owner:b,level:1,hp:500,maxHp:500,timer:0,rotation:Math.PI/2});
    ai.nextBarracksAt=m.elapsed+240;m.enemyState=bot.name+' строит казарму';m.enemyNoticeUntil=m.elapsed+7;
   }else ai.nextBarracksAt=m.elapsed+10;
  }
  if(m.elapsed>=ai.nextStableAt){
   const hasStable=(m.supportBuildings||[]).some(building=>building.team===1&&building.kind==='stable'&&building.owner===b);
   if(!hasStable&&b.coins>=800){
    const x=clamp(bot.homeX-11*TILE,TILE*4,SIZE*TILE-TILE*4),y=clamp(bot.homeY-5*TILE,TILE*4,SIZE*TILE-TILE*4);
    const clear=!m.walls.some(o=>Math.hypot(o.x-x,o.y-y)<100)&&!m.barracks.some(o=>Math.hypot(o.x-x,o.y-y)<105)&&!m.towers.some(o=>Math.hypot(o.x-x,o.y-y)<105)&&!(m.supportBuildings||[]).some(o=>Math.hypot(o.x-x,o.y-y)<110);
    if(clear){b.coins-=800;(m.supportBuildings||(m.supportBuildings=[])).push({x,y,team:1,owner:b,kind:'stable',level:1,hp:760,maxHp:760,trainTimer:0,trainInterval:34,unitCapacity:2});m.enemyState=bot.name+' строит конюшню';m.enemyNoticeUntil=m.elapsed+7;ai.nextStableAt=m.elapsed+9999;}
    else ai.nextStableAt=m.elapsed+18;
   }else ai.nextStableAt=m.elapsed+24;
  }
  if(m.elapsed>=ai.nextWallAt){
   const ownWalls=m.walls.filter(w=>w.team===1&&w.owner===b).length;
   if(b.coins>=150&&ownWalls<3){
    const angle=(Math.floor(Math.random()*4))*Math.PI/2,side=8+Math.floor(Math.random()*4),x=clamp(bot.homeX+Math.cos(angle)*side*TILE,TILE*4,SIZE*TILE-TILE*4),y=clamp(bot.homeY+Math.sin(angle)*side*TILE,TILE*4,SIZE*TILE-TILE*4);
    const clear=!m.walls.some(o=>Math.hypot(o.x-x,o.y-y)<86)&&!m.barracks.some(o=>Math.hypot(o.x-x,o.y-y)<90)&&!m.towers.some(o=>Math.hypot(o.x-x,o.y-y)<90);
    if(!clear){ai.nextWallAt=m.elapsed+10;continue;}b.coins-=150;m.walls.push({x,y,team:1,owner:b,level:1,hp:260,maxHp:260,rotation:angle});
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
   const current=match.units.filter(u=>u.team===br.team&&u.alive).length,capacity=br.unitCapacity||(8+((br.level||1)-1)*3),interval=br.spawnInterval||Math.max(8,18-((br.level||1)-1)*2.2);if(br.timer>interval&&current<capacity){br.timer=0;spawnUnit(br.team,br.x,br.y);}
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
function setTroopsHalted(value){if(!match)return;match.troopsHalted=value??!match.troopsHalted;const b=$('troops-halt');if(b)b.textContent=match.troopsHalted?' > \u0412\u043e\u0438\u043d\u044b: \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c':'|| \u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0432\u043e\u0438\u043d\u043e\u0432';$('tower-feedback').textContent=match.troopsHalted?'\u0412\u043e\u0438\u043d\u044b \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u044b \u0438 \u043d\u0435 \u0430\u0442\u0430\u043a\u0443\u044e\u0442.':'\u0412\u043e\u0438\u043d\u044b \u0441\u043d\u043e\u0432\u0430 \u0432 \u0431\u043e\u044e.';}
function regroupTroops(){if(!match)return;match.regroupOrder=true;match.rallyUntil=match.elapsed+99999;match.troopsHalted=false;for(const u of match.units){if(u.team===0&&u.alive){u.attack=0;u.rallyTarget={x:match.playerBase.x+80,y:match.playerBase.y};}}$('tower-feedback').textContent='\u0412\u043e\u0438\u043d\u044b \u0441\u043e\u0431\u0438\u0440\u0430\u044e\u0442\u0441\u044f \u0443 \u0432\u0430\u0448\u0435\u0439 \u0431\u0430\u0437\u044b.';}
function toggleGuardMode(){if(!match)return;match.guardMode=!match.guardMode;const b=$('guard-mode');if(b)b.textContent=match.guardMode?'\u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u041a\u041b':'\u041e\u0431\u043e\u0440\u043e\u043d\u0430 \u0431\u0430\u0437\u044b: \u0412\u042b\u041a\u041b';$('tower-feedback').textContent=match.guardMode?'\u0421\u043e\u044e\u0437\u043d\u0438\u043a\u0438 \u0437\u0430\u0449\u0438\u0449\u0430\u044e\u0442 \u0431\u0430\u0437\u0443.':'\u0421\u043e\u044e\u0437\u043d\u0438\u043a\u0438 \u0430\u0442\u0430\u043a\u0443\u044e\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u043b\u0438\u0437\u043a\u0438\u0445 \u0432\u0440\u0430\u0433\u043e\u0432.';}
function rallyTroops(){if(!match)return;match.rallyUntil=match.elapsed+30;match.regroupOrder=false;match.troopsHalted=false;for(const u of match.units){if(u.team===0&&u.alive)u.rallyTarget={x:match.enemyBase.x-170,y:match.enemyBase.y};}$('tower-feedback').textContent='\u0422\u043e\u0447\u043a\u0430 \u0441\u0431\u043e\u0440\u0430 \u0443 \u0432\u0440\u0430\u0436\u0435\u0441\u043a\u043e\u0439 \u0431\u0430\u0437\u044b \u043d\u0430 30 \u0441\u0435\u043a\u0443\u043d\u0434.';}

function pauseMatch(){if(!match||match.finished||match.paused)return;match.paused=true;pressed.clear();$('pause-overlay').classList.remove('hidden');}
function resumeMatch(){if(!match||!match.paused)return;match.paused=false;$('pause-overlay').classList.add('hidden');lastFrame=performance.now();}
function requestLeaveMatch(){if(!match)return;$('leave-confirm').classList.remove('hidden');}
function cancelLeaveMatch(){$('leave-confirm').classList.add('hidden');}
function confirmLeaveMatch(){if(!match)return;$('leave-confirm').classList.add('hidden');$('pause-overlay').classList.add('hidden');finish(false,true);}
function findDraggableAt(x,y){const m=match;if(!m)return null;const structures=[...m.towers.filter(t=>t.team===0&&!t.isPlayer),...m.walls.filter(w=>w.team===0),...m.barracks.filter(b=>b.team===0),...(m.supportBuildings||[]).filter(b=>b.team===0)];for(const object of structures){if(Math.hypot(object.x-x,object.y-y)<48)return {type:'structure',object};}if(Math.hypot(m.playerBase.x-x,m.playerBase.y-y)<82)return {type:'base',object:m.playerBase};return null;}
function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;}
function startLoop(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(loop);}
function loop(now){
 if(scene!=='battle'||!match||match.finished){raf=0;return;}
 if(match.paused){lastFrame=now;drawArena();raf=requestAnimationFrame(loop);return;}
 const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;fpsFrames++;fpsElapsed+=dt;
 if(fpsElapsed>=1){currentFps=Math.round(fpsFrames/fpsElapsed);fpsFrames=0;fpsElapsed=0;$('performance-hud').innerHTML='fps= '+currentFps+'<br>ping= офлайн';}
 update(dt);drawArena();raf=requestAnimationFrame(loop);
}
function update(dt){
 const p=match.player;
 match.elapsed+=dt;match.botCoinTick+=dt;
 if(match.botCoinTick>=1){const count=Math.floor(match.botCoinTick);match.botCoinTick-=count;match.playerCoins+=count*COINS_PER_SECOND;for(const bot of match.bots)bot.profile.coins+=count*COINS_PER_SECOND;}
 enemyDirector(dt);updateSupportBuildings(dt);respawnDefeatedBots();attackCooldown=Math.max(0,attackCooldown-dt);match.uiTick-=dt;
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
  const ownStructures=match.towers.filter(t=>t.team===0&&t.hp>0).concat(match.barracks.filter(b=>b.team===0&&b.hp>0),(match.supportBuildings||[]).filter(b=>b.team===0&&b.hp>0));
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
  let found=chooseNearestTarget(unit,foes);
  if(unit.kind==='siege'){const enemyStructures=[...match.towers.filter(t=>t.team!==unit.team&&t.hp>0),...match.barracks.filter(b=>b.team!==unit.team&&b.hp>0),...match.walls.filter(w=>w.team!==unit.team&&w.hp>0),...(match.supportBuildings||[]).filter(b=>b.team!==unit.team&&b.hp>0)];const priority=chooseNearestTarget(unit,enemyStructures);if(priority)found=priority;}
  if(!found&&unit.team===0){const base=match.towers.find(t=>t.team===1&&t.hp>0)||match.barracks.find(b=>b.team===1&&b.hp>0)||match.supportBuildings.find(b=>b.team===1&&b.hp>0)||match.walls.find(w=>w.team===1&&w.hp>0);if(base){const distance=Math.hypot(base.x-unit.x,base.y-unit.y);if(distance>unit.range)moveEntity(unit,(base.x-unit.x)/(distance||1)*unit.speed*dt,(base.y-unit.y)/(distance||1)*unit.speed*dt,10);else if(unit.attack<=0){unit.attack=.42;applyCombatDamage(base,unit.damage,unit);}continue;}}
  if(!found)continue;
  if(found.distance>unit.range){
   const moved=moveEntity(unit,(found.target.x-unit.x)/found.distance*unit.speed*dt,(found.target.y-unit.y)/found.distance*unit.speed*dt,10);
   if(!moved)moveEntity(unit,Math.cos(match.elapsed+unit.id)*unit.speed*.65*dt,Math.sin(match.elapsed+unit.id)*unit.speed*.65*dt,10);
  }else if(unit.attack<=0){
   unit.attack=unit.attackInterval||.42;
   if(unit.team===1)alertEnemyBase();
   if(unit.kind==='archer'||unit.kind==='siege')match.tracers.push({x1:unit.x,y1:unit.y-15,x2:found.target.x,y2:found.target.y-12,life:unit.kind==='siege'?.42:.22,maxLife:unit.kind==='siege'?.42:.22,team:unit.team});
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
  p.hp=p.maxHp;p.flash=1;p.x=(match.playerBase?.x??SIZE*TILE/2-20*TILE)+110;p.y=(match.playerBase?.y??SIZE*TILE/2)+45;pressed.clear();
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
 const structures=[...match.towers.filter(t=>t.team===1&&t.hp>0),...match.walls.filter(w=>w.team===1&&w.hp>0),...match.barracks.filter(b=>b.team===1&&b.hp>0),...(match.supportBuildings||[]).filter(b=>b.team===1&&b.hp>0)];
 const structure=chooseNearestTarget(player,structures,112);
 if(structure){alertEnemyBase();applyCombatDamage(structure.target,structure.target.isTower?54:42,player);return;}
 match.tracers.push({x1:player.x,y1:player.y-10,x2:player.x+Math.cos(match.elapsed*7)*34,y2:player.y-18+Math.sin(match.elapsed*7)*22,life:.10,maxLife:.10,team:0});
}
function drawPrimeWorldDecor(ctx,camX,camY,w,h){
 const seed=match.worldSeed||1, left=Math.max(0,Math.floor((camX+camX%TILE)/TILE)-1),top=Math.max(0,Math.floor((camY+camY%TILE)/TILE)-1);
 const right=Math.min(SIZE,Math.ceil((camX+w)/TILE)+1),bottom=Math.min(SIZE,Math.ceil((camY+h)/TILE)+1);
 for(let ty=top;ty<bottom;ty++)for(let tx=left;tx<right;tx++){
  const edge=Math.min(tx,ty,SIZE-1-tx,SIZE-1-ty);if(edge<WATER_BORDER+4)continue;
  const hash=(tx*73856093^ty*19349663^seed)>>>0,kind=hash%37,x=tx*TILE+((hash>>>7)%20)+6-camX,y=ty*TILE+((hash>>>15)%20)+6-camY;
  if(kind===0||kind===1){ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(x,y+4,7,3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=kind===0?'#66705a':'#8b8974';ctx.beginPath();ctx.moveTo(x-6,y+2);ctx.lineTo(x-3,y-3);ctx.lineTo(x+3,y-5);ctx.lineTo(x+7,y+1);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(235,229,196,.32)';ctx.fillRect(x-2,y-3,4,1);}
  else if(kind===2){ctx.strokeStyle='#285b32';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+5);ctx.lineTo(x-2,y-5);ctx.moveTo(x,y+2);ctx.lineTo(x+5,y-4);ctx.moveTo(x-1,y);ctx.lineTo(x-6,y-3);ctx.stroke();ctx.fillStyle='#a9c96b';ctx.fillRect(x+2,y-5,2,2);}
  else if(kind===3){ctx.fillStyle='#34402e';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#527c45';ctx.beginPath();ctx.arc(x-3,y-4,5,0,Math.PI*2);ctx.arc(x+3,y-2,5,0,Math.PI*2);ctx.fill();}
  else if(kind===4){ctx.fillStyle='#60472f';ctx.fillRect(x-5,y-4,10,9);ctx.fillStyle='#9b7448';ctx.fillRect(x-6,y-6,12,3);ctx.strokeStyle='#d3b17a';ctx.lineWidth=1;ctx.strokeRect(x-5,y-4,10,9);}
 }
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
 // Carved masonry, corner stones, arrow slit and a real timber fighting platform.
 ctx.fillStyle='#9ba7ae';for(let row=0;row<3;row++)for(let col=0;col<4;col++){ctx.globalAlpha=.42;ctx.fillRect(-25+col*13+(row%2)*4,-8+row*9,7,2);}ctx.globalAlpha=1;
 ctx.fillStyle='#242c34';ctx.fillRect(-5,-34,10,12);ctx.fillStyle='#d5e0e7';ctx.fillRect(-3,-32,2,8);
 ctx.strokeStyle='#b78a58';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-31,3);ctx.lineTo(31,3);ctx.moveTo(-31,10);ctx.lineTo(31,10);ctx.stroke();
 ctx.fillStyle='#d7e0e4';ctx.fillRect(-37,-10,5,24);ctx.fillRect(32,-10,5,24);
 ctx.fillStyle=t.team===0?'#62c9ed':'#e86d5a';ctx.beginPath();ctx.moveTo(0,-77);ctx.lineTo(0,-57);ctx.quadraticCurveTo(13,-62,19,-57);ctx.lineTo(14,-50);ctx.lineTo(0,-55);ctx.closePath();ctx.fill();
 ctx.fillStyle='#111';ctx.fillRect(-29,31,58,5);ctx.fillStyle='#ff6435';ctx.fillRect(-29,31,58*Math.max(0,t.hp/t.maxHp),5);
 ctx.fillStyle='#fff';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText((t.displayName||t.owner.name)+' | Lv. '+l,0,-83);
 ctx.restore();
}
function buildPlacementAtWorld(rawX,rawY){
 const m=match;if(!m||!buildMode)return {valid:false,reason:'Выбери постройку.'};
 const x=Math.floor(rawX/TILE)*TILE+TILE/2,y=Math.floor(rawY/TILE)*TILE+TILE/2;
 const cost={wall:150,tower:300,barracks:450,forge:650,infirmary:600,archery:700,stable:800,siege:950,mage:900,market:550}[buildMode]||0;
 const min=TILE*(WATER_BORDER+1)+20,max=SIZE*TILE-min;
 const bounds=x>=min&&y>=min&&x<=max&&y<=max&&canEntityOccupy(x,y,12);
 const home=m.playerBase||m.player;const baseDistance=Math.hypot(x-home.x,y-home.y);const territory=baseDistance<=20*TILE;
 const tooNear=baseDistance<110,tooFar=!territory;
 const occupied=m.walls.some(o=>Math.hypot(o.x-x,o.y-y)<86)||m.barracks.some(o=>Math.hypot(o.x-x,o.y-y)<92)||(m.supportBuildings||[]).some(o=>Math.hypot(o.x-x,o.y-y)<108)||m.towers.some(o=>Math.hypot(o.x-x,o.y-y)<86);
 const reason=!bounds?'Нельзя строить за пределами арены.':tooNear?'Постройку нельзя ставить слишком близко к базе.':tooFar?'Постройка должна находиться не дальше 20 блоков от своей базы.':occupied?'Это место занято.':m.playerCoins<cost?'Недостаточно монет: '+(cost-Math.floor(m.playerCoins))+' ◆.':'';
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
 }else if(buildMode==='stable'||buildMode==='siege'||buildMode==='mage'||buildMode==='market'){
  ctx.fillRect(x-25,y-18,50,36);ctx.beginPath();ctx.moveTo(x-30,y-18);ctx.lineTo(x,y-45);ctx.lineTo(x+30,y-18);ctx.closePath();ctx.fill();
  if(buildMode==='mage'){ctx.fillStyle='#e9d7ff';ctx.beginPath();ctx.arc(x,y-25,7,0,Math.PI*2);ctx.fill();}
  if(buildMode==='siege'){ctx.fillStyle='#d9c394';ctx.fillRect(x-5,y-38,10,14);}
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
 if(f.kind==='archer'){ctx.save();ctx.translate(11,0);ctx.strokeStyle='#d7bd82';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-1,0,10,-1.15,1.15);ctx.stroke();ctx.strokeStyle='#ead9ad';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-2,-9);ctx.lineTo(5,9);ctx.moveTo(-1,0);ctx.lineTo(12,-4);ctx.stroke();ctx.restore();}
 else{ctx.save();ctx.translate(10,1);ctx.rotate(-.22+swing);ctx.strokeStyle='#8d6944';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-2,1);ctx.lineTo(4,4);ctx.stroke();ctx.strokeStyle='#d4b878';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-1,-1);ctx.lineTo(6,5);ctx.stroke();ctx.strokeStyle='#dbe8f5';ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(4,2);ctx.lineTo(8,-16);ctx.stroke();ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.shadowColor=accent;ctx.shadowBlur=7;ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(9,-15);ctx.stroke();ctx.restore();}
 // Cloth mantle, shoulder plates, rivets and tiered helmet silhouette.
 ctx.fillStyle=isAlly?'#185e79':(f.team===1?'#71372f':'#243d59');ctx.beginPath();ctx.moveTo(-8,-4);ctx.quadraticCurveTo(-15,5,-13,16);ctx.lineTo(-5,12);ctx.lineTo(-4,1);ctx.fill();
 ctx.fillStyle=accent;ctx.fillRect(-10,-5,5,5);ctx.fillRect(5,-5,5,5);ctx.fillStyle='rgba(255,255,255,.32)';ctx.fillRect(-6,-3,2,7);ctx.fillRect(4,-3,2,7);
 if(f.helmet||f.armorTier>0){ctx.fillStyle='#c6d1dc';ctx.beginPath();ctx.moveTo(-9,-18);ctx.lineTo(-7,-25);ctx.lineTo(0,-29);ctx.lineTo(7,-25);ctx.lineTo(9,-18);ctx.closePath();ctx.fill();ctx.fillStyle='#596a7c';ctx.fillRect(-8,-19,16,3);ctx.fillStyle=accent;ctx.fillRect(-2,-25,4,4);}
 ctx.strokeStyle='#d6c08e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(7,0);ctx.moveTo(-6,5);ctx.lineTo(6,5);ctx.stroke();
 if(f.flash>0){ctx.globalAlpha=.5;ctx.fillStyle='#fff';ctx.fillRect(-13,-23,26,42);ctx.globalAlpha=1;}
 ctx.restore();
 ctx.fillStyle='#fff';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(isPlayer?'Kisia':(f.name||'Воин'),x,y-35);ctx.shadowBlur=0;
 if(!isPlayer){ctx.fillStyle='#140d0b';ctx.fillRect(x-18,y-42,36,4);ctx.fillStyle=f.team===0?'#70d8ff':'#ff765f';ctx.fillRect(x-18,y-42,36*Math.max(0,f.hp/f.maxHp),4);}
}
function buildTerrainCache(seed){
 const c=document.createElement('canvas');c.width=SIZE*TILE;c.height=SIZE*TILE;const g=c.getContext('2d',{alpha:false});
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const edge=Math.min(x,y,SIZE-1-x,SIZE-1-y),n=(x*17+y*31+(x*y)%23+seed)%9,hash=(x*73856093^y*19349663^seed)>>>0,sx=x*TILE,sy=y*TILE;
  if(edge<WATER_BORDER){
   g.fillStyle=['#116b8d','#0d5d82','#155f83','#0d5278'][n%4];g.fillRect(sx,sy,TILE,TILE);
   g.strokeStyle='rgba(177,238,246,.12)';g.lineWidth=1;g.beginPath();g.moveTo(sx+((hash>>>4)%14),sy+8+((hash>>>8)%18));g.quadraticCurveTo(sx+15,sy+((hash>>>12)%25),sx+30,sy+8+((hash>>>16)%18));g.stroke();
  }else if(edge<WATER_BORDER+3){
   g.fillStyle=['#c9b27b','#bda36d','#d0b985'][n%3];g.fillRect(sx,sy,TILE,TILE);
   g.fillStyle='rgba(255,255,255,.19)';g.fillRect(sx+((hash>>>2)%23),sy+((hash>>>7)%21),5,2);
   g.fillStyle='rgba(105,78,44,.16)';g.fillRect(sx+((hash>>>13)%22),sy+((hash>>>18)%20),7,3);
  }else{
   g.fillStyle=['#568d4b','#5b934f','#609853','#548849','#639b55','#5a914d','#5d9551','#568c49','#629651'][n];g.fillRect(sx,sy,TILE,TILE);
   const variant=(hash>>>5)%5;
   for(let k=0;k<3;k++){const gx=sx+((hash>>>(k*6+2))%28),gy=sy+((hash>>>(k*5+11))%28);g.fillStyle=k===0?'rgba(224,239,164,.30)':'rgba(24,54,29,.24)';g.fillRect(gx,gy,2+(hash%4),2);}
   if(variant===0){g.fillStyle='rgba(83,75,60,.52)';g.beginPath();g.ellipse(sx+8+(hash%18),sy+9+((hash>>>8)%15),3+(hash%3),2,0,0,Math.PI*2);g.fill();g.fillStyle='rgba(205,193,158,.35)';g.fillRect(sx+7+(hash%18),sy+8+((hash>>>8)%15),3,1);}
   if(variant===1){g.strokeStyle='rgba(31,75,37,.55)';g.lineWidth=1.5;g.beginPath();g.moveTo(sx+7,sy+23);g.lineTo(sx+9,sy+17);g.moveTo(sx+9,sy+22);g.lineTo(sx+14,sy+16);g.moveTo(sx+9,sy+22);g.lineTo(sx+5,sy+18);g.stroke();}
   if(variant===2){g.fillStyle='rgba(255,215,132,.22)';g.beginPath();g.arc(sx+22,sy+7,2,0,Math.PI*2);g.fill();}
  }
 }
 return c;
}
function drawSupportBuildings(ctx,camX,camY){
 const m=match;if(!m)return;
 for(const b of (m.supportBuildings||[])){
  const x=b.x-camX,y=b.y-camY,l=b.level||1,s=1+Math.min(5,l-1)*.09;
  ctx.save();ctx.translate(x,y);ctx.rotate(b.rotation||0);ctx.scale(s,s);
  ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(0,18,44,17,0,0,Math.PI*2);ctx.fill();
  if(b.kind==='forge'){
   ctx.fillStyle='#3a3335';ctx.fillRect(-34,-20,68,38);ctx.fillStyle='#65545a';ctx.fillRect(-29,-25,58,10);ctx.fillStyle='#25252a';ctx.fillRect(-19,-34,38,18);ctx.fillStyle='#a94b32';ctx.fillRect(-14,-29,28,18);ctx.fillStyle='#ff9b43';ctx.shadowColor='#ff7a32';ctx.shadowBlur=15+Math.sin(performance.now()/180)*4;ctx.fillRect(-9,-23,18,10);ctx.shadowBlur=0;ctx.fillStyle='#d1a66c';ctx.fillRect(-37,-5,12,19);ctx.fillRect(25,-5,12,19);ctx.fillStyle='#f4c27a';ctx.fillRect(-5,-39,10,7);
  }else if(b.kind==='infirmary'){
   ctx.fillStyle='#d8d7cc';ctx.fillRect(-31,-17,62,35);ctx.fillStyle='#668b83';ctx.fillRect(-34,-22,68,9);ctx.fillStyle='#b7d4c9';ctx.beginPath();ctx.moveTo(-38,-22);ctx.lineTo(0,-49);ctx.lineTo(38,-22);ctx.closePath();ctx.fill();ctx.fillStyle='#f1eee1';ctx.fillRect(-7,-13,14,27);ctx.fillRect(-19,-7,38,12);ctx.fillStyle='#bb493e';ctx.fillRect(-4,-10,8,18);ctx.fillRect(-12,-5,24,8);ctx.fillStyle='#e9d5a5';ctx.fillRect(-27,4,8,10);ctx.fillRect(19,4,8,10);
  }else if(b.kind==='archery'){
   ctx.fillStyle='#4a4035';ctx.fillRect(-35,-17,70,35);ctx.fillStyle='#a37b4e';ctx.beginPath();ctx.moveTo(-40,-17);ctx.lineTo(0,-48);ctx.lineTo(40,-17);ctx.closePath();ctx.fill();ctx.fillStyle='#d2b17a';ctx.fillRect(-27,-13,54,7);ctx.fillStyle='#302a25';ctx.fillRect(-21,-5,42,22);ctx.strokeStyle='#c8a56b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-16,-4);ctx.lineTo(17,14);ctx.moveTo(16,-4);ctx.lineTo(-17,14);ctx.stroke();ctx.fillStyle='#e8d3aa';ctx.fillRect(-4,-30,8,12);ctx.fillStyle='#795d3e';ctx.fillRect(-32,18,64,5);
  }else if(b.kind==='stable'){
   ctx.fillStyle='#57402d';ctx.fillRect(-36,-17,72,37);ctx.fillStyle='#b48751';ctx.beginPath();ctx.moveTo(-42,-17);ctx.lineTo(0,-50);ctx.lineTo(42,-17);ctx.closePath();ctx.fill();ctx.fillStyle='#2a2523';ctx.fillRect(-18,-12,36,30);ctx.fillStyle='#d7b579';ctx.fillRect(-27,-21,54,5);ctx.fillStyle='#b9a17c';ctx.fillRect(-33,15,66,5);ctx.fillStyle='#f4d08a';ctx.fillRect(-4,-39,8,12);
  }else if(b.kind==='siege'){
   ctx.fillStyle='#494b50';ctx.fillRect(-38,-18,76,38);ctx.fillStyle='#747d86';ctx.fillRect(-32,-25,64,10);ctx.fillStyle='#332c28';ctx.fillRect(-25,-8,50,25);ctx.strokeStyle='#bd9a67';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-24,-18);ctx.lineTo(20,14);ctx.moveTo(24,-18);ctx.lineTo(-20,14);ctx.stroke();ctx.fillStyle='#d8c39a';ctx.fillRect(-7,-39,14,14);ctx.fillStyle='#7e5435';ctx.fillRect(-39,18,78,6);
  }else if(b.kind==='mage'){
   ctx.fillStyle='#40354e';ctx.fillRect(-31,-18,62,38);ctx.fillStyle='#76639c';ctx.beginPath();ctx.moveTo(-37,-18);ctx.lineTo(0,-54);ctx.lineTo(37,-18);ctx.closePath();ctx.fill();ctx.fillStyle='#c4a8ff';ctx.shadowColor='#a779ff';ctx.shadowBlur=17;ctx.beginPath();ctx.arc(0,-28,9+Math.sin(performance.now()/170)*2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#e2d3ff';ctx.fillRect(-5,1,10,19);ctx.fillRect(-18,5,36,6);
  }else if(b.kind==='market'){
   ctx.fillStyle='#604630';ctx.fillRect(-37,-16,74,36);ctx.fillStyle='#d7b16e';ctx.fillRect(-40,-23,80,9);ctx.fillStyle='#a94c2e';ctx.fillRect(-31,-39,20,16);ctx.fillStyle='#6d9f6c';ctx.fillRect(-5,-39,20,16);ctx.fillStyle='#e8ce9c';ctx.fillRect(19,-39,15,16);ctx.fillStyle='#eec36c';ctx.fillRect(-8,-5,16,25);ctx.fillStyle='#2b241e';ctx.fillRect(-3,0,6,20);
  }
  // Upgrade tiers physically add masonry courses, timber braces, lit windows and a faction banner.
  if(l>=2){ctx.strokeStyle='#d6c39b';ctx.lineWidth=2;ctx.strokeRect(-31,-18,62,36);ctx.fillStyle='#d5c6a7';for(let q=-2;q<=2;q++)ctx.fillRect(q*12-4,12,8,3);}
  if(l>=3){ctx.fillStyle='#d5b06c';ctx.fillRect(-39,-20,78,4);ctx.fillRect(-35,18,70,4);ctx.fillStyle='#26343a';ctx.fillRect(-25,-12,9,10);ctx.fillRect(16,-12,9,10);ctx.fillStyle='#f5d88f';ctx.fillRect(-24,-11,7,8);ctx.fillRect(17,-11,7,8);}
  if(l>=4){ctx.fillStyle='#687780';ctx.fillRect(-42,-22,84,5);ctx.fillRect(-36,20,72,5);ctx.strokeStyle='#d9e2e5';ctx.lineWidth=2;ctx.strokeRect(-39,-24,78,47);}
  if(l>=5){ctx.fillStyle=b.team===0?'#45a6cb':'#bd5147';ctx.fillRect(-2,-62,3,24);ctx.beginPath();ctx.moveTo(1,-61);ctx.lineTo(21,-56);ctx.lineTo(1,-49);ctx.fill();ctx.fillStyle='#e6c778';ctx.fillRect(-45,-27,90,4);ctx.fillRect(-45,22,90,4);}
  // Animated forge chimney smoke and warm windows.
  if(b.kind==='forge'||b.kind==='market'||b.kind==='stable'){const pulse=(performance.now()/430+b.x*.03)%1;ctx.save();ctx.globalAlpha=.22*(1-pulse);ctx.fillStyle='#d5d0c7';ctx.beginPath();ctx.arc(23,-42-pulse*23,3+pulse*5,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.restore();
  const aura=b.kind==='forge'?210+l*28:b.kind==='infirmary'?190+l*24:0;
  if(aura){ctx.save();ctx.globalAlpha=.10;ctx.fillStyle=b.kind==='forge'?'#ff9a45':'#83e4c3';ctx.beginPath();ctx.arc(x,y,aura,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.52;ctx.strokeStyle=b.kind==='forge'?'#ffb36a':'#9ef3d8';ctx.setLineDash([7,7]);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,aura,0,Math.PI*2);ctx.stroke();ctx.restore();}
  const title={forge:'КУЗНИЦА',infirmary:'ЛАЗАРЕТ',archery:'СТРЕЛЬБИЩЕ',stable:'КОНЮШНЯ',siege:'ОСАДНАЯ МАСТЕРСКАЯ',mage:'БАШНЯ МАГОВ',market:'РЫНОК'}[b.kind]||'ПОСТРОЙКА';
  ctx.fillStyle='#fff';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(title+' · ур. '+l+'/5',x,y-58);ctx.shadowBlur=0;
  ctx.fillStyle='#160f0c';ctx.fillRect(x-30,y+29,60,5);ctx.fillStyle=b.team===0?'#70d8ff':'#ff765f';ctx.fillRect(x-30,y+29,60*Math.max(0,b.hp/b.maxHp),5);
  if(b.kind==='market'){ctx.fillStyle='#ffe1a0';ctx.font='bold 9px Segoe UI';ctx.fillText('+'+(b.incomeRate||3)+'/сек',x,y+47);}
 }
}
function drawArena(){
 const c=$('arena'),ctx=c.getContext('2d');if(!ctx)return;
 const rect=c.getBoundingClientRect(),w=rect.width||window.innerWidth,h=rect.height||window.innerHeight,dpr=Number(c.dataset.dpr)||Math.min(1.5,window.devicePixelRatio||1);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
 const p=match.player,camX=p.x-w/2,camY=p.y-h/2;
 if(!match.terrainCanvas)match.terrainCanvas=buildTerrainCache(match.worldSeed);ctx.drawImage(match.terrainCanvas,camX,camY,w,h,0,0,w,h);drawPrimeWorldDecor(ctx,camX,camY,w,h);
 const x0=Math.max(0,Math.floor(camX/TILE)),y0=Math.max(0,Math.floor(camY/TILE)),x1=Math.min(SIZE,Math.ceil((camX+w)/TILE)+1),y1=Math.min(SIZE,Math.ceil((camY+h)/TILE)+1);
 const waveTime=performance.now()/720;
 const base=match.playerBase;ctx.save();ctx.translate(base.x-camX,base.y-camY);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,20,82,24,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#343d48';ctx.fillRect(-65,-22,130,48);ctx.fillStyle='#68798a';ctx.fillRect(-58,-30,116,12);ctx.fillStyle='#b4c4d3';for(let k=-2;k<=2;k++)ctx.fillRect(k*24-7,-39,14,10);ctx.fillStyle='#ff9a4d';ctx.fillRect(-8,-18,16,38);ctx.fillStyle='#f8d08a';ctx.fillRect(-3,-14,6,22);ctx.strokeStyle='#ffbf78';ctx.lineWidth=3;ctx.strokeRect(-65,-22,130,48);ctx.restore();
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const edge=Math.min(x,y,SIZE-1-x,SIZE-1-y);if(edge>=WATER_BORDER)continue;const sx=x*TILE-camX,sy=y*TILE-camY,seed=(x*73856093^y*19349663^match.worldSeed)>>>0,shimmer=.5+.5*Math.sin(waveTime*1.4+x*.31-y*.22);ctx.save();ctx.globalAlpha=.10+shimmer*.08;ctx.fillStyle='#b6f5ff';ctx.beginPath();ctx.ellipse(sx+8+((seed>>>3)%18),sy+8+((seed>>>9)%17),5+shimmer*5,1.4,Math.sin(waveTime+x*.2)*.18,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.22;ctx.strokeStyle='#b9f5ff';ctx.lineWidth=1.2;const wy=sy+8+Math.sin(waveTime+x*.65+y*.24)*4;ctx.beginPath();ctx.moveTo(sx-2,wy);ctx.quadraticCurveTo(sx+8,wy-3,sx+17,wy+1);ctx.quadraticCurveTo(sx+25,wy+4,sx+34,wy-1);ctx.stroke();ctx.restore();}
 match.walls.forEach(w=>{const x=w.x-camX,y=w.y-camY;ctx.save();ctx.translate(x,y);ctx.rotate(w.rotation||0);const ws=1+Math.min(6,(w.level||1)-1)*.055;ctx.scale(ws,ws);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-27,-7,54,22);ctx.fillStyle=(w.level||1)>=4?'#596d7b':(w.level||1)>=2?'#3b4651':'#252a31';ctx.fillRect(-25,-11,50,22);ctx.fillStyle=(w.level||1)>=4?'#c9d7df':'#8b929b';ctx.fillRect(-23,-15,46,6);if((w.level||1)>=2){ctx.fillStyle='#b5c4ce';for(let k=-2;k<=2;k++){ctx.fillRect(k*9-2,-18,4,7);ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillRect(k*9-1,-17,1,4);ctx.fillStyle='#b5c4ce';}}if((w.level||1)>=3){ctx.fillStyle='#9daeb9';for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(k*9-2,-18);ctx.lineTo(k*9,-25);ctx.lineTo(k*9+2,-18);ctx.fill();}}if((w.level||1)>=5){ctx.strokeStyle='#e4c77c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,-7);ctx.lineTo(24,-7);ctx.stroke();}ctx.fillStyle=w.team===0?'#ff873d':'#d65b4a';ctx.fillRect(-25,13,50*Math.max(0,w.hp/w.maxHp),4);ctx.strokeStyle='#b8c5cf';ctx.lineWidth=1.5;ctx.strokeRect(-25,-11,50,22);ctx.restore();ctx.fillStyle='#fff';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText((localStorage.getItem(PRIME_LANG_KEY)==='en'?'WALL Lv. ':'СТЕНА ур.')+w.level,x,y-20);});drawSupportBuildings(ctx,camX,camY);match.barracks.forEach(b=>{const x=b.x-camX,y=b.y-camY;ctx.save();ctx.translate(x,y);ctx.rotate(b.rotation||0);const bs=1+Math.min(8,(b.level||1)-1)*.075;ctx.scale(bs,bs);ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(-24,-18,48,42);ctx.fillStyle=(b.level||1)>=4?'#6b5740':(b.level||1)>=2?'#594333':'#49372b';ctx.fillRect(-22,-20,44,38);ctx.fillStyle='#9a6a43';ctx.beginPath();ctx.moveTo(-27,-20);ctx.lineTo(0,-42);ctx.lineTo(27,-20);ctx.fill();ctx.fillStyle=(b.level||1)>=4?'#e6c36d':'#c5a57a';ctx.fillRect(-18,-17,36,5);ctx.fillStyle='#8b9ba6';if((b.level||1)>=2){ctx.fillRect(-28,-8,6,22);ctx.fillRect(22,-8,6,22);}if((b.level||1)>=3){ctx.fillStyle='#c8d4df';ctx.fillRect(-26,-15,5,18);ctx.fillRect(21,-15,5,18);}if((b.level||1)>=4){ctx.fillStyle='#f2cf75';ctx.fillRect(-3,-47,6,10);}if((b.level||1)>=5){ctx.strokeStyle='#ffe18a';ctx.lineWidth=2;ctx.strokeRect(-31,-28,62,48);ctx.fillStyle='#e7c879';ctx.fillRect(-31,-31,62,4);} 
 // Timber framing, lit windows and a changing heraldic pennant make every tier distinct.
 ctx.fillStyle='#2b2522';ctx.fillRect(-17,-10,8,10);ctx.fillRect(9,-10,8,10);ctx.fillStyle=(b.level||1)>=3?'#f5d58a':'#9fc5ce';ctx.fillRect(-16,-9,6,8);ctx.fillRect(10,-9,6,8);
 ctx.strokeStyle='#d5b17a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-21,-18);ctx.lineTo(-21,15);ctx.moveTo(21,-18);ctx.lineTo(21,15);ctx.moveTo(-20,2);ctx.lineTo(20,2);ctx.stroke();
 ctx.fillStyle=b.team===0?'#4aa9cf':'#c85b48';ctx.fillRect(0,-51,2,13);ctx.beginPath();ctx.moveTo(2,-50);ctx.lineTo(15,-47);ctx.lineTo(2,-42);ctx.fill();
 if((b.level||1)>=4){ctx.fillStyle='#51463b';ctx.fillRect(17,-42,8,17);ctx.fillStyle='#a8b6bf';ctx.fillRect(18,-43,6,3);}
 ctx.fillStyle='#ff9b62';ctx.fillRect(-5,-8,10,26);ctx.fillStyle='#f5d8ad';ctx.fillRect(-2,-5,4,15);ctx.restore();ctx.fillStyle='#fff';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText((localStorage.getItem(PRIME_LANG_KEY)==='en'?'TAVERN Lv. ':'ТАВЕРНА ур.')+b.level+'/5',x,y-47);});match.towers.forEach(t=>drawTower(ctx,t,camX,camY));
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
 // Lightweight world ambience: drifting dust, ember motes near structures and soft screen-edge light.
 const ambientSeed=match.worldSeed||1;ctx.save();ctx.globalCompositeOperation='lighter';
 for(let i=0;i<22;i++){const seed=(ambientSeed+i*7919)>>>0,px=((seed%997)/997*w+(performance.now()*.006*(i%3+1)))%(w+20)-10,py=((Math.floor(seed/997)%991)/991*h+Math.sin(performance.now()/900+i)*7)%(h+20)-10;ctx.globalAlpha=.10+(i%4)*.035;ctx.fillStyle=i%5===0?'#ffd18b':'#d8e9c4';ctx.beginPath();ctx.arc(px,py,i%5===0?1.7:1,0,Math.PI*2);ctx.fill();}
 ctx.restore();
 const vignette=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.25,w/2,h/2,Math.max(w,h)*.72);vignette.addColorStop(.65,'rgba(5,12,10,0)');vignette.addColorStop(1,'rgba(5,12,10,.22)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
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
 for(const br of match.barracks){ctx.fillStyle=br.team===0?'#96dcff':'#ff9a8c';ctx.fillRect(sx(br.x)-2,sy(br.y)-2,4,4);}for(const b of (match.supportBuildings||[])){ctx.fillStyle=b.kind==='forge'?'#ffad62':b.kind==='infirmary'?'#7ce1bf':b.kind==='mage'?'#c39aff':b.kind==='market'?'#f4d27e':b.kind==='stable'?'#c58a55':b.kind==='siege'?'#aab7c5':'#e4c18b';ctx.fillRect(sx(b.x)-3,sy(b.y)-3,6,6);}
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
 if(match?.paused&&e.code!=='Escape'){e.preventDefault();return;}
 if(buildMode&&e.code==='KeyQ'){buildMode=null;buildRotation=0;if(match)match.buildPreview=null;document.body.classList.remove('prime-building');$('build-panel').classList.add('hidden');$('tower-feedback').textContent='Выбор постройки отменён.';e.preventDefault();return;}
 if(buildMode&&e.code==='KeyR'){buildRotation=(buildRotation+Math.PI/2)%(Math.PI*2);if(match){match.buildPreview=match.buildPreview?{...match.buildPreview,rotation:buildRotation}:buildPlacementFromPointer(window.innerWidth/2,window.innerHeight/2);}$('tower-feedback').textContent='Поворот постройки: '+Math.round(buildRotation*180/Math.PI)+'°';e.preventDefault();e.stopPropagation();return;}
 if(e.code==='ShiftLeft'||e.code==='ShiftRight'){pressed.add(e.code);e.preventDefault();return;}
 if(keyDirection(e.code)){pressed.add(e.code);e.preventDefault();e.stopPropagation();}
 else if(e.code==='Space'){e.preventDefault();attack();}
 else if(e.code==='Escape'){e.preventDefault();if(match.paused)resumeMatch();else pauseMatch();}
},true);
window.addEventListener('keyup',e=>{pressed.delete(e.code);},true);
window.addEventListener('blur',()=>pressed.clear());
$('arena').addEventListener('pointermove',e=>{
 if(scene!=='battle'||!match)return;
 if(match.dragging){const rect=$('arena').getBoundingClientRect(),wx=e.clientX-rect.left+match.player.x-rect.width/2,wy=e.clientY-rect.top+match.player.y-rect.height/2;const d=match.dragging;if(Math.hypot(wx-d.startX,wy-d.startY)>8)d.moved=true;if(d.moved){const safeX=clamp(wx,TILE*(WATER_BORDER+4),SIZE*TILE-TILE*(WATER_BORDER+4)),safeY=clamp(wy,TILE*(WATER_BORDER+4),SIZE*TILE-TILE*(WATER_BORDER+4));d.object.x=safeX;d.object.y=safeY;if(d.type==='base'){match.playerBase.x=safeX;match.playerBase.y=safeY;}}drawArena();return;}
 if(!buildMode)return;
 match.buildPreview=buildPlacementFromPointer(e.clientX,e.clientY);
});
$('arena').addEventListener('pointerleave',()=>{if(match&&buildMode)match.buildPreview=null;});
$('arena').addEventListener('pointerup',()=>{if(match&&match.dragging){const d=match.dragging;match.dragging=null;if(!d.moved&&d.type==='structure')upgradeStructureAt(d.startX,d.startY);save();updateHud();drawArena();}});$('arena').addEventListener('pointercancel',()=>{if(match)match.dragging=null;});
$('arena').addEventListener('pointerdown',e=>{
 if(scene!=='battle'||!match||e.button!==0)return;
 const rect=$('arena').getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
 const wx=sx+match.player.x-rect.width/2,wy=sy+match.player.y-rect.height/2;
 if(!buildMode){const drag=findDraggableAt(wx,wy);if(drag){match.dragging={...drag,startX:wx,startY:wy,moved:false};try{$('arena').setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return;}}
 if(buildMode){
  const placement=buildPlacementAtWorld(wx,wy);
  match.buildPreview=placement;
  if(!placement.valid){$('tower-feedback').textContent=placement.reason+' Наведи курсор на зелёную площадку.';updateHud();return;}
  const px=placement.x,py=placement.y,cost=placement.cost,kind=buildMode;
  match.playerCoins-=cost;
  if(kind==='wall')match.walls.push({x:px,y:py,team:0,level:1,hp:260,maxHp:260,rotation:placement.rotation||0});
  if(kind==='tower'){const count=match.towers.filter(t=>t.team===0&&!t.isPlayer).length+1;const built=createTower(px,py,profile,true);built.isPlayer=false;built.team=0;built.kind='archer';built.displayName='\u0411\u0430\u0448\u043d\u044f \u043b\u0443\u0447\u043d\u0438\u043a\u0430 \u2116'+count;built.rotation=placement.rotation||0;match.towers.push(built);}
  if(kind==='barracks')match.barracks.push({x:px,y:py,team:0,level:1,hp:500,maxHp:500,timer:0,rotation:placement.rotation||0});
  if(kind==='forge')match.supportBuildings.push({x:px,y:py,team:0,kind:'forge',level:1,hp:680,maxHp:680,bonus:.18,rotation:placement.rotation||0});
  if(kind==='infirmary')match.supportBuildings.push({x:px,y:py,team:0,kind:'infirmary',level:1,hp:620,maxHp:620,healRate:10,rotation:placement.rotation||0});
  if(kind==='archery')match.supportBuildings.push({x:px,y:py,team:0,kind:'archery',level:1,hp:650,maxHp:650,trainTimer:0,trainInterval:26,rotation:placement.rotation||0});
  if(kind==='stable')match.supportBuildings.push({x:px,y:py,team:0,kind:'stable',level:1,hp:760,maxHp:760,trainTimer:0,trainInterval:34,unitCapacity:2,rotation:placement.rotation||0});
  if(kind==='siege')match.supportBuildings.push({x:px,y:py,team:0,kind:'siege',level:1,hp:880,maxHp:880,trainTimer:0,trainInterval:54,unitCapacity:1,rotation:placement.rotation||0});
  if(kind==='mage')match.supportBuildings.push({x:px,y:py,team:0,kind:'mage',level:1,hp:820,maxHp:820,fire:0,damage:36,range:250,fireInterval:1.7,rotation:placement.rotation||0});
  if(kind==='market')match.supportBuildings.push({x:px,y:py,team:0,kind:'market',level:1,hp:600,maxHp:600,incomeRate:3,rotation:placement.rotation||0});
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
$('train-unit').addEventListener('click',()=>{if(!match)return;const br=match.barracks.find(x=>x.team===0);if(!br){buildMode='barracks';document.body.classList.add('prime-building');$('build-panel').classList.remove('hidden');$('tower-feedback').textContent='Сначала построй казарму: выбери «Дом воинов», затем наведи мышь на место установки.';if(match)match.buildPreview=buildPlacementFromPointer(window.innerWidth/2,window.innerHeight/2);return;}const cap=br.unitCapacity||(8+((br.level||1)-1)*3),army=match.units.filter(u=>u.team===0&&u.alive).length;if(army>=cap){$('tower-feedback').textContent='Казарма достигла вместимости '+army+'/'+cap+'. Улучши казарму до следующего уровня.';return;}if(match.playerCoins<100){$('tower-feedback').textContent='Для найма воина нужно 100 ◆.';return;}match.playerCoins-=100;spawnUnit(0,br.x,br.y);updateHud();});
updateProfile();
// Economy accrues outside battles.
window.setInterval(()=>{if(match&&!match.finished){match.bots.forEach(b=>{b.elo=b.profile.elo;const row=$('bot-'+b.id);if(row)row.querySelector('span').textContent='Башня ур. '+b.profile.towerLevel+' · '+b.profile.coins+' ◆ · '+b.elo+' ELO';});updateHud();save();}},1000);
})();