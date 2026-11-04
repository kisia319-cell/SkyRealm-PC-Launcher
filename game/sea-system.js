(() => {
  'use strict';
  const VERSION = 1;
  const KEY = () => 'skyrealm_sea_v1_' + (window.SkyRealmSeaBridge?.getWorldId?.() || 'default');
  const $ = (id) => document.getElementById(id);
  const state = {
    version: VERSION, x: 13, y: 82, boatHp: 100, weather: 'calm', weatherLeft: 150,
    wave: 0, time: 0, mapOpen: false, underwater: false, air: 60,
    helmetLevel: 0, sharks: [], monsters: [], treasures: [], opened: [],
    vaultUnlocked: false, vaultRoom: 0, vaultPath: 0, vaultBosses: { tide:false, abyss:false },
    relics: [], discovered: [], message: '', messageLeft: 0, lastSave: 0,
    chartFound: false, bossHp: 0, bossAttack: 0, stormDamageAt: 0,
    diveCooldown: 0, mapMarks: [],
    upgrades:{sails:0,hull:0,oxygen:0,harpoon:0},
    harpoonCooldown:0, harpoonTrace:null, krakenSpawnTimer:170,
    city:{x:312,y:216,discovered:false,guardianHp:1250,guardianMaxHp:1250,cleared:false,rewardClaimed:false},
    caves:[
      {id:'coral',x:116,y:102,active:false,hp:420,maxHp:420,cleared:false},
      {id:'abyss',x:238,y:174,active:false,hp:780,maxHp:780,cleared:false}
    ]
  };
  const DEFAULT_STATE=JSON.parse(JSON.stringify(state));
  const W = 360, H = 260, TILE = 32;
  let root, canvas, ctx, raf = 0, last = 0, keys = new Set(), active = false;
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const bridge = () => window.SkyRealmSeaBridge;
  function msg(s){ state.message=s; state.messageLeft=4.5; const el=$('sea-message'); if(el)el.textContent=s; else bridge()?.toast?.(s); }
  const SHIP_UPGRADES={
    sails:{title:'Паруса',icon:'⛵',description:'Увеличивают скорость корабля на 16% за уровень.',cost:[{Древесина:12,Железо:3},{Древесина:20,Железо:7,Медь:2},{Древесина:28,Железо:12,Медь:5}],gold:[15,35,70]},
    hull:{title:'Усиленный корпус',icon:'🛶',description:'Добавляет 25 максимальной прочности за уровень.',cost:[{Древесина:16,Железо:8},{Древесина:24,Железо:14,Медь:3},{Древесина:32,Железо:20,Медь:7}],gold:[20,45,85]},
    oxygen:{title:'Кислородная система',icon:'🫧',description:'Увеличивает запас воздуха под водой на 40% за уровень.',cost:[{Железо:8,Медь:6,Кристалл:2},{Железо:14,Медь:10,Кристалл:4},{Железо:20,Медь:15,Кристалл:7}],gold:[25,55,100]},
    harpoon:{title:'Гарпун',icon:'🪝',description:'Открывает атаку клавишей F. Каждый уровень усиливает гарпун.',cost:[{Железо:10,Медь:5,Кристалл:3},{Железо:16,Медь:9,Кристалл:6},{Железо:24,Медь:14,Кристалл:10}],gold:[30,65,120]}
  };
  function boatMaxHp(){return 100+Math.max(0,Math.min(3,Number(state.upgrades?.hull)||0))*25;}
  function normalizeUpgrades(){
    const raw=state.upgrades&&typeof state.upgrades==='object'?state.upgrades:{};
    state.upgrades={sails:clamp(Math.floor(Number(raw.sails)||0),0,3),hull:clamp(Math.floor(Number(raw.hull)||0),0,3),oxygen:clamp(Math.floor(Number(raw.oxygen)||0),0,3),harpoon:clamp(Math.floor(Number(raw.harpoon)||0),0,3)};
    state.harpoonCooldown=Math.max(0,Number(state.harpoonCooldown)||0);
    if(!state.city||typeof state.city!=='object')state.city=JSON.parse(JSON.stringify(DEFAULT_STATE.city));
    state.city={...DEFAULT_STATE.city,...state.city,x:clamp(Number(state.city.x)||312,0,W-2),y:clamp(Number(state.city.y)||216,0,H-2),guardianMaxHp:clamp(Number(state.city.guardianMaxHp)||1250,1,50000),guardianHp:clamp(Number(state.city.guardianHp)||1250,0,50000),discovered:state.city.discovered===true,cleared:state.city.cleared===true,rewardClaimed:state.city.rewardClaimed===true};
    const saved=Array.isArray(state.caves)?state.caves:[];
    state.caves=DEFAULT_STATE.caves.map(base=>{const old=saved.find(v=>v?.id===base.id)||{};return {...base,...old,active:old.active===true,cleared:old.cleared===true,maxHp:clamp(Number(old.maxHp)||base.maxHp,1,50000),hp:clamp(Number(old.hp)||base.hp,0,50000)};});
    state.krakenSpawnTimer=clamp(Number(state.krakenSpawnTimer)||170,0,1000);
    state.boatHp=clamp(Number(state.boatHp)||100,0,boatMaxHp());
  }
  function canPayShipCost(cost,gold){const b=bridge();return !!b&&Object.entries(cost).every(([n,q])=>Number(b.getItemCount?.(n)||0)>=q)&&Number(b.getGold?.()||0)>=gold;}
  function upgradeShip(kind){
    const spec=SHIP_UPGRADES[kind],b=bridge();if(!spec||!b?.getWorldId?.())return false;
    if(state.x>20){msg('Модернизировать корабль можно только у причала. Вернись к берегу.');return false;}
    const level=state.upgrades[kind]||0;if(level>=3){msg('Улучшение «'+spec.title+'» уже максимального уровня.');return false;}
    const cost=spec.cost[level],gold=spec.gold[level];if(!canPayShipCost(cost,gold)){msg('Не хватает материалов или золота для улучшения.');return false;}
    const paid=[];for(const [name,count] of Object.entries(cost)){if(!b.spendItem?.(name,count)){for(const [n,q] of paid)b.addItem?.(n,q,'Возврат ресурсов после неудачной модернизации');msg('Не удалось списать материалы. Ресурсы возвращены.');return false;}paid.push([name,count]);}
    if(!b.spendGold?.(gold)){for(const [n,q] of paid)b.addItem?.(n,q,'Возврат ресурсов после неудачной модернизации');msg('Не удалось списать золото. Материалы возвращены.');return false;}
    state.upgrades[kind]++;
    if(kind==='hull')state.boatHp=Math.min(boatMaxHp(),state.boatHp+25);
    save();b.save?.();msg(spec.icon+' '+spec.title+' улучшены до '+state.upgrades[kind]+'/3.');renderShipyard();return true;
  }
  function renderShipyard(){
    const panel=$('sea-shipyard');if(!panel)return;
    const docked=state.x<=20;
    panel.innerHTML='<h2>⚓ Верфь кораблей</h2><p>Улучшения сохраняются отдельно для каждого мира. Для покупки вернись к причалу.</p>'+Object.entries(SHIP_UPGRADES).map(([id,v])=>{const level=state.upgrades[id],cost=v.cost[level]||{},gold=v.gold[level]||0,goods=Object.entries(cost).map(([n,q])=>n+' ×'+q).join(' · ');return '<article class="sea-upgrade"><b>'+v.icon+' '+v.title+' · '+level+'/3</b><small>'+v.description+'</small><small>'+(level>=3?'Максимальный уровень':goods+' · '+gold+' золота')+'</small><button type="button" data-sea-upgrade="'+id+'" '+(level>=3||!docked||!canPayShipCost(cost,gold)?'disabled':'')+'>'+(level>=3?'Улучшено':'Улучшить')+'</button></article>';}).join('')+'<button id="sea-shipyard-close" type="button">Закрыть верфь</button>';
    panel.querySelectorAll('[data-sea-upgrade]').forEach(button=>button.addEventListener('click',()=>upgradeShip(button.dataset.seaUpgrade)));
    $('sea-shipyard-close').onclick=toggleShipyard;
  }
  function toggleShipyard(){const panel=$('sea-shipyard');if(!panel)return;const opened=!panel.classList.contains('open');panel.classList.toggle('open',opened);$('sea-map').classList.remove('open');$('sea-vault').classList.remove('open');if(opened)renderShipyard();}
  function save(){
    try { const snapshot={...state, sharks:state.sharks.slice(0,40), monsters:state.monsters.slice(0,40), discovered:state.discovered.slice(-5000)};localStorage.setItem(KEY(), JSON.stringify(snapshot));bridge()?.setSeaData?.(snapshot); }
    catch(e){ console.warn('Sea save failed',e); }
  }
  function load(){
    try {
      const d=bridge()?.getSeaData?.()||JSON.parse(localStorage.getItem(KEY())||'null');
      if(!d || d.version!==VERSION){Object.assign(state,JSON.parse(JSON.stringify(DEFAULT_STATE)));return;}
      Object.assign(state,d);
      normalizeUpgrades();
      state.x=clamp(Number(state.x)||13,11,W-3); state.y=clamp(Number(state.y)||82,3,H-3); if(state.x<10)state.x=13;
      state.sharks=Array.isArray(d.sharks)?d.sharks:[]; state.monsters=Array.isArray(d.monsters)?d.monsters:[];
      state.treasures=Array.isArray(d.treasures)?d.treasures:[]; state.opened=Array.isArray(d.opened)?d.opened:[];
      state.relics=Array.isArray(d.relics)?d.relics:[];
    } catch(e){ console.warn('Sea save load failed',e); }
  }
  function ensureWorld(){
    // Repair each population independently: older saves could contain chests but no fauna.
    if(!Array.isArray(state.treasures))state.treasures=[];
    if(!Array.isArray(state.sharks))state.sharks=[];
    if(!Array.isArray(state.monsters))state.monsters=[];
    if(!state.treasures.length)for(let i=0;i<22;i++)state.treasures.push({id:'chest-'+i,x:rand(18,W-12),y:rand(8,H-8),kind:i%5===0?'wreck':'chest'});
    if(!state.sharks.length)state.sharks=Array.from({length:2},(_,i)=>({id:'shark-'+i,x:rand(42,W-18),y:rand(12,H-12),hp:65,angle:rand(0,6.28),speed:rand(10,16),cool:rand(0,2)}));else state.sharks=state.sharks.filter(Boolean).slice(0,3);
    if(!state.monsters.length)state.monsters=Array.from({length:10},(_,i)=>({id:'sea-monster-'+i,x:rand(24,W-10),y:rand(8,H-8),hp:85,angle:rand(0,6.28),speed:rand(8,15),cool:rand(0,2)}));
    if(!Array.isArray(state.discovered))state.discovered=[];
    normalizeUpgrades();
    state.monsters.forEach((m,i)=>{if(!m.kind)m.kind=i%11===0?'angler':i%5===0?'ray':'jelly';});
  }
  function build(){
    if(root)return;
    root=document.createElement('section'); root.id='skyrealm-sea'; root.hidden=true;
    root.innerHTML=`
      <style>
      #skyrealm-sea{position:fixed;inset:0;z-index:99990;background:#071b2c;color:#e9f5ff;font:14px Segoe UI,Arial;display:flex;flex-direction:column}
      #skyrealm-sea[hidden]{display:none}#skyrealm-sea .sea-top{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#061321eF;border-bottom:1px solid #31556d;flex-wrap:wrap}
      #skyrealm-sea .sea-title{font-weight:900;letter-spacing:1px;color:#aee7ff}#skyrealm-sea .sea-stat{padding:6px 9px;border:1px solid #35556d;border-radius:8px;background:#102b40;font-size:12px}
      #skyrealm-sea button{border:1px solid #547a91;background:#173b53;color:#eaf8ff;border-radius:8px;padding:7px 11px;font-weight:700;cursor:pointer}
      #skyrealm-sea button:hover{background:#245b78}#skyrealm-sea .sea-stage{position:relative;flex:1;min-height:0;overflow:hidden}
      #sea-canvas{width:100%;height:100%;display:block}#skyrealm-sea .sea-help{position:absolute;left:12px;bottom:12px;background:#061321d9;padding:9px 12px;border:1px solid #31556d;border-radius:9px;font-size:12px;line-height:1.6}
      #sea-message{position:absolute;top:14px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:10px;background:#09263beF;border:1px solid #69b8dc;font-weight:800;max-width:90%;text-align:center}
      #sea-map{position:absolute;inset:7% 12%;background:#061321f5;border:1px solid #9bdfff;border-radius:14px;padding:18px;display:none;overflow:auto}
       #sea-map.open{display:block}#sea-map canvas{width:100%;height:calc(100% - 50px);min-height:220px}#sea-shipyard{position:absolute;inset:8% 10%;display:none;background:#081a2af5;border:1px solid #80cce8;border-radius:14px;padding:18px;overflow:auto;z-index:8}#sea-shipyard.open{display:block}#sea-shipyard h2{margin:0 0 8px;color:#b8ecff}#sea-shipyard>p{color:#a9c5d8;line-height:1.5}#sea-shipyard .sea-upgrade{padding:10px;margin:8px 0;background:#102b40;border:1px solid #355d77;border-radius:9px}#sea-shipyard .sea-upgrade b,#sea-shipyard .sea-upgrade small{display:block;margin:4px 0}#sea-shipyard .sea-upgrade small{color:#a8c3d7}
      #skyrealm-sea .sea-control-pad{position:absolute;right:14px;bottom:14px;z-index:5;display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px;border:1px solid #8bd3ef88;border-radius:14px;background:#061321c9;backdrop-filter:blur(5px);touch-action:none;user-select:none}#skyrealm-sea .sea-control-row{display:flex;gap:5px}#skyrealm-sea .sea-control-pad button{width:42px;height:40px;padding:0;font-size:18px;border-color:#84cce8;background:#174a66;touch-action:none;user-select:none}#skyrealm-sea .sea-control-pad button:active{background:#317e9d;transform:scale(.96)}#sea-vault{position:absolute;inset:8% 10%;display:none;background:#10182bf5;border:1px solid #aa9cce;border-radius:14px;padding:18px;overflow:auto}
      #sea-vault.open{display:block}#sea-vault h2{margin:0 0 8px;color:#e5d6ff}#sea-vault .vault-paths{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      #sea-vault .vault-paths button{flex:1;min-width:140px}#sea-vault .vault-log{padding:12px;background:#080f1e;border-radius:8px;min-height:90px;line-height:1.7}
      @media(max-width:700px){#skyrealm-sea .sea-help{font-size:10px;max-width:90%}#skyrealm-sea .sea-top{gap:6px;padding:7px}#skyrealm-sea .sea-stat{font-size:10px}}
      </style>
      <div class="sea-top"><span class="sea-title">🌊 SKYREALM · МОРЕ</span><span class="sea-stat" id="sea-weather">Погода: штиль</span><span class="sea-stat" id="sea-boat-hp">Корабль: 100%</span><span class="sea-stat" id="sea-air">Воздух: —</span><span class="sea-stat" id="sea-coords">Координаты: 13 / 82</span><button id="sea-map-btn">🗺 Карта</button><button id="sea-dive-btn">↓ Нырнуть · E</button><button id="sea-vault-btn">🏛 Сокровищница</button><button id="sea-shipyard-btn">⚓ Верфь</button><button id="sea-exit">Вернуться на берег</button></div>
      <div class="sea-stage"><canvas id="sea-canvas"></canvas><div id="sea-message">Море ждёт тебя. Найди карту сокровищ!</div>
      <div class="sea-help">WASD / стрелки — управлять кораблём · E — взаимодействовать / нырять · M — карта · Space — ускорение<br>В шторм волны повреждают корабль. Акулы преследуют лодку. Для долгого погружения нужен водяной шлем.</div>
      <div class="sea-control-pad" aria-label="Управление кораблём"><button type="button" data-sea-direction="w" aria-label="Вперёд">▲</button><div class="sea-control-row"><button type="button" data-sea-direction="a" aria-label="Влево">◀</button><button type="button" data-sea-direction="s" aria-label="Назад">▼</button><button type="button" data-sea-direction="d" aria-label="Вправо">▶</button></div></div>
      <div id="sea-shipyard"></div>
      <div id="sea-map"><h2>🗺 Морская карта · 360 × 260</h2><p>Туман скрывает неизведанные воды. Найди обломки кораблей и карты сокровищ.</p><canvas id="sea-map-canvas"></canvas><button id="sea-map-close">Закрыть карту</button></div>
      <div id="sea-vault"><h2>🏛 Великая сокровищница глубин</h2><p>Подводный лабиринт с несколькими путями. Внутри находятся ровно два бога моря.</p><div class="vault-paths"><button data-path="0">Путь затонувших стражей</button><button data-path="1">Коралловые катакомбы</button><button data-path="2">Бездна древних</button></div><div class="vault-log" id="vault-log">Перед входом подготовь водяной шлем. В каждом пути есть монстры и ловушки.</div><div class="vault-paths"><button id="vault-enter">Войти в выбранный путь</button><button id="vault-fight" disabled>Сразиться с боссом</button><button id="vault-exit">Выйти из сокровищницы</button></div></div>
      </div>`;
    document.body.appendChild(root);const pauseLock=document.createElement('div');pauseLock.className='shade';pauseLock.id='sea-pause-lock';pauseLock.hidden=true;document.body.appendChild(pauseLock);canvas=$('sea-canvas');ctx=canvas.getContext('2d');
    $('sea-exit').onclick=leave; $('sea-map-btn').onclick=toggleMap; $('sea-map-close').onclick=toggleMap;
    $('sea-dive-btn').onclick=toggleDive; $('sea-vault-btn').onclick=()=>{ $('sea-vault').classList.add('open'); $('sea-map').classList.remove('open'); $('sea-shipyard').classList.remove('open'); };$('sea-shipyard-btn').onclick=toggleShipyard;
    $('vault-exit').onclick=()=> $('sea-vault').classList.remove('open');
    $('vault-enter').onclick=enterVault; $('vault-fight').onclick=fightVaultBoss;
    root.querySelectorAll('[data-path]').forEach(b=>b.onclick=()=>{state.vaultPath=Number(b.dataset.path);$('vault-log').textContent=['Путь затонувших стражей: тяжёлые рыцари охраняют проход.','Коралловые катакомбы: ядовитые медузы и ловушки.','Бездна древних: сильнейшие монстры и два алтаря богов.'][state.vaultPath];});
    root.querySelectorAll('[data-sea-direction]').forEach(button=>{
      const direction=button.dataset.seaDirection;
      const press=event=>{if(!active)return;event.preventDefault();keys.add(direction);try{button.setPointerCapture?.(event.pointerId);}catch(_){}};
      const release=()=>keys.delete(direction);
      button.addEventListener('pointerdown',press);
      button.addEventListener('pointerup',release);
      button.addEventListener('pointercancel',release);
      button.addEventListener('lostpointercapture',release);
      button.addEventListener('contextmenu',event=>event.preventDefault());
    });
    window.addEventListener('keydown',onKey,true); window.addEventListener('keyup',onUp,true); window.addEventListener('blur',()=>keys.clear()); window.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
    window.addEventListener('resize',resize); resize();
  }
  function resize(){if(!canvas)return;const r=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(r.width*d));canvas.height=Math.max(1,Math.floor(r.height*d));ctx.setTransform(d,0,0,d,0,0);}
  function keyToken(e){const code=String(e.code||'');if(code.startsWith('Key')&&code.length===4)return code.slice(3).toLowerCase();if(code==='Space')return ' ';return String(e.key||'').toLowerCase();}
  function onKey(e){if(!active)return;const k=keyToken(e);if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','m','e','f','escape'].includes(k))return;e.preventDefault();e.stopPropagation();const firstPress=!keys.has(k);keys.add(k);if(!firstPress)return;if(k==='m')toggleMap();if(k==='e'){if(state.underwater)toggleDive();else interact();}if(k==='f')fireHarpoon();if(k==='escape'){if($('sea-vault').classList.contains('open'))$('sea-vault').classList.remove('open');else if(state.mapOpen)toggleMap();else leave();}}
  function onUp(e){keys.delete(keyToken(e));}
  function enter(){
    const b=bridge(); if(!b?.getWorldId?.()){msg('Сначала загрузи игровой мир.');return;}
    if(!b.hasItem('Корабль')){msg('Сначала создай корабль на второй странице верстака.');return;}
    build(); load(); ensureWorld(); active=true; state.underwater=false; state.helmetLevel=b.getWaterHelmetLevel?.()||0;
    root.hidden=false;const pauseLock=$('sea-pause-lock');if(pauseLock)pauseLock.hidden=false;b.pause?.(); resize(); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); msg('Ты вышел за горизонт. Исследуй море и ищи затонувшие сокровища.'); save();
  }
  function leave(){if(!active)return;active=false;keys.clear();cancelAnimationFrame(raf);save();root.hidden=true;const pauseLock=$('sea-pause-lock');if(pauseLock)pauseLock.hidden=true;bridge()?.resume?.();}
  function toggleMap(){if(!active)return;state.mapOpen=!state.mapOpen;$('sea-map').classList.toggle('open',state.mapOpen);if(state.mapOpen)drawMap();}
  function drainAir(seconds){if(state.air===Infinity)return;state.air=Math.max(0,state.air-Math.max(0,seconds));state.airEndsAt=Date.now()+state.air*1000;}
  function toggleDive(){
    if(!active)return;
    if(state.underwater){state.underwater=false;msg('Ты всплыл на поверхность.');save();return;}
    const b=bridge();state.helmetLevel=b?.getWaterHelmetLevel?.()||0;
    if(!state.helmetLevel){msg('Без водяного шлема нельзя погружаться. Создай его на верстаке.');return;}
    state.underwater=true;const oxygenMultiplier=1+(state.upgrades.oxygen||0)*.4;state.air=state.helmetLevel>=4?Infinity:Math.round((state.helmetLevel===3?480:(state.helmetLevel===2?240:60))*oxygenMultiplier);state.airEndsAt=state.air===Infinity?Infinity:Date.now()+state.air*1000;
    msg(state.helmetLevel>=4?'Шлем четвёртого уровня: запас воздуха больше не ограничен.':'Погружение! Запас воздуха: '+state.air+' секунд. Улучшения кислорода: '+(state.upgrades.oxygen||0)+'/3.');save();
  }
  function fireHarpoon(){
    if((state.upgrades.harpoon||0)<1){msg('Нужен установленный гарпун. Улучши его на верфи у причала.');return false;}
    if(state.harpoonCooldown>0)return false;
    const power=80+(state.upgrades.harpoon||0)*48,player={x:state.x,y:state.y};let target=null,kind='';
    if(state.underwater){
      if(!state.city.cleared&&Math.hypot(state.city.x-player.x,state.city.y-player.y)<18){target=state.city;kind='city';}
      if(!target){const cave=state.caves.filter(v=>!v.cleared&&Math.hypot(v.x-player.x,v.y-player.y)<13).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];if(cave){cave.active=true;target=cave;kind='cave';}}
      if(!target){target=state.monsters.filter(v=>Math.hypot(v.x-player.x,v.y-player.y)<15).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]||null;kind='monster';}
    }else{
      target=state.sharks.filter(v=>Math.hypot(v.x-player.x,v.y-player.y)<18).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]||null;kind='shark';
    }
    if(!target){msg('Нет цели в радиусе гарпуна. Подойди ближе.');return false;}
    state.harpoonCooldown=Math.max(.55,1.55-(state.upgrades.harpoon||0)*.22);
    state.harpoonTrace={x1:player.x,y1:player.y,x2:target.x,y2:target.y,life:.22};
    target.hp=Math.max(0,(Number(target.hp)||Number(target.guardianHp)||0)-power);
    if(kind==='city'){
      state.city.guardianHp=target.hp;
      if(target.hp<=0){state.city.cleared=true;msg('СТРАЖ ЗАТОНУВШЕГО ГОРОДА ПОВЕРЖЕН! Найди главный храм и нажми E.');}
      else{bridge()?.damagePlayer?.(22);msg('Городской страж: '+Math.ceil(target.hp)+' HP. Он отвечает древней волной!');}
    }else if(kind==='cave'){
      if(target.hp<=0){target.cleared=true;target.active=false;bridge()?.addItem?.('Кристалл',3,'Награда за подводную пещеру');bridge()?.addItem?.('Серебро',2,'Руда из подводной пещеры');bridge()?.addItem?.('Глубинная жемчужина',1,'Редкая находка из пещерного логова');msg('ПЕЩЕРА ОЧИЩЕНА! Получены кристаллы, серебро и глубинная жемчужина.');}
      else{bridge()?.damagePlayer?.(14);msg('Пещерный страж: '+Math.ceil(target.hp)+' HP. Ударил в ответ!');}
    }else if(kind==='monster'){
      if(target.hp<=0){const i=state.monsters.indexOf(target);if(i>=0)state.monsters.splice(i,1);const loot=target.kind==='kraken'?'Сердце кракена':target.kind==='angler'?'Светящийся усик':target.kind==='ray'?'Перо штормового ската':'Глубинная жемчужина';bridge()?.addItem?.(loot,1,'Добыча с морского существа');if(target.kind==='kraken')bridge()?.addItem?.('Кристалл',4,'Трофей редкого кракена');msg('Морское существо побеждено! Получено: '+loot+'.');}
      else msg('Попадание гарпуном! Осталось '+Math.ceil(target.hp)+' HP.');
    }else if(kind==='shark'){
      if(target.hp<=0){const i=state.sharks.indexOf(target);if(i>=0)state.sharks.splice(i,1);bridge()?.addItem?.('Акулья чешуя',2,'Трофей морской охоты');bridge()?.addItem?.('Мясо',1,'Добыча после морской охоты');msg('Акула побеждена! Получена акулья чешуя и мясо.');}
      else msg('Акула ранена! Осталось '+Math.ceil(target.hp)+' HP.');
    }
    save();return true;
  }
  function interact(){
    if(state.underwater){
      const treasure=nearestTreasure();if(treasure){openTreasure(treasure);return;}
      const cave=state.caves.find(v=>!v.cleared&&Math.hypot(v.x-state.x,v.y-state.y)<8);
      if(cave){if(!cave.active){cave.active=true;msg('Ты нашёл подводную пещеру! В глубине проснулся древний страж. Используй F и гарпун.');save();}else msg('Пещерный страж рядом. Атакуй гарпуном клавишей F.');return;}
      if(Math.hypot(state.city.x-state.x,state.city.y-state.y)<18){state.city.discovered=true;if(!state.city.cleared){msg('НАЙДЕН ЗАТОНУВШИЙ ГОРОД! Главный храм защищает древний страж.');}else if(!state.city.rewardClaimed){state.city.rewardClaimed=true;bridge()?.addItem?.('Корона двух морей',1,'Реликвия из главного храма затонувшего города');bridge()?.addItem?.('Реликвия древних глубин',1,'Сокровище затонувшего города');bridge()?.addGold?.(50000);msg('ГЛАВНЫЙ ХРАМ ОТКРЫТ! Получены две реликвии и 500 золота.');}else msg('Затонувший город уже исследован.');save();return;}
      msg('Осмотри дно рядом: здесь пока ничего нет. Нажми M, чтобы проверить карту.');return;
    }
    const t=nearestTreasure();if(t){openTreasure(t);return;}
    const b=bridge();if(state.x<=20&&state.boatHp<boatMaxHp()){if((b?.getItemCount?.('Древесина')||0)<8||(b?.getItemCount?.('Железо')||0)<2){msg('Для ремонта у берега нужно 8 древесины и 2 железа.');return;}b.changeItem('Древесина',-8);b.changeItem('Железо',-2);state.boatHp=Math.min(boatMaxHp(),state.boatHp+45);msg('Корабль отремонтирован у берега. Прочность '+Math.round(state.boatHp/boatMaxHp()*100)+'%.');save();b.save?.();return;} if(state.boatHp<=0){msg('Корабль разрушен. Вернись на берег и отремонтируй его.');return;}
    msg('Волны несут корабль вперёд. Ищи обломки, метки на карте и вход в сокровищницу.'); 
  }
  function nearestTreasure(){return state.treasures.find(t=>!state.opened.includes(t.id)&&Math.hypot(t.x-state.x,t.y-state.y)<4.5);}
  const UNIQUE_LOOT=[
    ['Компас приливов','🧭','Показывает ближайший неоткрытый морской сундук.'],
    ['Плащ морского странника','🧥','Редкий косметический плащ, который нельзя создать.'],
    ['Кольцо глубин','💍','Уникальный артефакт сокровищницы.'],
    ['Коралловая корона','👑','Реликвия древних морских правителей.'],
    ['Сфера прилива','🔵','Необычный артефакт, найденный только в море.'],
    ['Сапоги волн','🥾','Редкая экипировка из затонувших сундуков.'],
    ['Перо штормового ската','🪶','Трофей морского существа, не имеет рецепта крафта.'],
    ['Морской талисман','🔱','Уникальный талисман из древних тайников.']
  ];
  function openTreasure(t){
    if(state.underwater&&state.air<=0){msg('Нельзя открывать сундук без воздуха!');return;}
    state.opened.push(t.id);const b=bridge();const roll=Math.random();
    if(t.kind==='wreck'&&roll<.38){const chart={name:'Карта сокровищ',icon:'🗺️',description:'Отмечает один тайник с редкой добычей в море.'};b?.addItem?.(chart.name,1,chart.description);state.chartFound=true;const mark={x:rand(12,W-12),y:rand(8,H-8)};state.mapMarks.push(mark);state.treasures.push({id:'charted-'+Date.now(),x:mark.x,y:mark.y,kind:'chest'});msg('Найдена карта сокровищ! На карте отмечен настоящий сундук с редкой добычей.');}
    else if(roll<.25){b?.addItem?.('Кристалл',2);b?.addGold?.(18000);msg('В сундуке кристаллы и 180 золотых.');}
    else {const q=UNIQUE_LOOT[Math.floor(Math.random()*UNIQUE_LOOT.length)];b?.addItem?.(q[0],1,q[2]);state.relics.push(q[0]);msg('Редкая находка: '+q[1]+' '+q[0]+'! Этот предмет нельзя создать на верстаке.');}
    if(state.underwater)drainAir(5);save();b?.save?.();
  }
  function enterVault(){
    if(!state.underwater){msg('Вход в сокровищницу находится под водой. Сначала нырни.');return;}
    if(state.helmetLevel<1){msg('Нужен водяной шлем.');return;}
    state.vaultRoom=1;state.bossHp=0;$('vault-log').textContent='Ты вошёл в лабиринт. Впереди пять залов стражей, затем в последнем пути ждут ровно два бога моря.';
    $('vault-fight').disabled=false;$('vault-fight').textContent='Атаковать стража';msg('Ты вошёл в древнюю сокровищницу.');save();
  }
  function fightVaultBoss(){
    if(!state.vaultRoom){msg('Сначала пройди один из глубоких путей.');return;}
    const b=bridge();
    if(state.vaultRoom<=5){
      if(state.bossHp<=0)state.bossHp=180+state.vaultRoom*45;
      state.bossHp=Math.max(0,state.bossHp-95);
      if(state.air!==Infinity)drainAir(3);
      if(state.bossHp<=0){
        state.vaultRoom++;
        if(state.vaultRoom>5){
          if(state.vaultPath===2){$('vault-log').textContent='Все пять залов бездны очищены. За древними вратами пробуждаются два бога моря.';msg('Ты дошёл до зала двух богов!');}
          else{$('vault-log').textContent='Путь очищен! Ты победил всех стражей и нашёл тайный сундук с уникальной реликвией.';b?.addItem?.('Кольцо глубин',1,'Не создаётся на верстаке.');}
        }else{$('vault-log').textContent='Страж побеждён. В следующем зале появился новый монстр. Зал '+state.vaultRoom+'/5.';state.bossHp=0;}
      }else $('vault-log').textContent='Страж глубин · осталось здоровья: '+state.bossHp+'. Он наносит ответный удар и отнимает воздух.';
      save();b?.save?.();return;
    }
    if(state.vaultPath!==2){$('vault-log').textContent='Этот маршрут пройден. Выбери другой глубокий путь или открой путь Безды.';return;}
    if(!state.vaultBosses.tide){
      const diff=b?.getDifficulty?.()||'medium',scale={easy:.65,medium:1,hard:1.45,hell:2,impossible:2.8}[diff]||1,maxHp=Math.round(5400*scale),damage={easy:8,medium:13,hard:19,hell:27,impossible:38}[diff]||13;
      if(state.bossHp<=0){state.bossHp=maxHp;state.bossAttack=0;$('vault-log').textContent='БОГ №1: НЕПТУН РАЗЛОМА · '+maxHp+' здоровья · сложность '+diff+'. Используй морское оружие!';msg('Нептун Разлома пробудился!');}
      const hit=Math.max(1,Math.round(b?.getWeaponDamage?.()||20));state.bossHp=Math.max(0,state.bossHp-hit);state.bossAttack=(state.bossAttack||0)+1;if(state.air!==Infinity)drainAir(4);
      if(state.bossHp>0){const special=state.bossAttack%3===0,incoming=damage*(special?2.8:1);if(special)msg('НЕПТУН · ВЕЛИКИЙ ПРИЛИВ! Уклоняйся от волны бога!');b?.damagePlayer?.(incoming);$('vault-log').textContent='Нептун Разлома · '+state.bossHp+'/'+maxHp+' HP. '+(special?'ВЕЛИКИЙ ПРИЛИВ':'Приливный удар')+': −'+incoming+' HP.';}
      if(state.bossHp===0){state.vaultBosses.tide=true;state.godRebirths=state.godRebirths||{};state.godRebirths.tide={dueDay:(b?.getGameDay?.()||0)+1,multiplier:1.7};b?.scheduleGodRebirth?.('Нептун Разлома','neptune',1.7);state.bossHp=0;b?.addItem?.('Сердце прилива',1,'Уникальный трофей первого бога моря. Не создаётся на верстаке.');$('vault-log').textContent='Нептун Разлома повержен! Выпало Сердце прилива. В глубине пробуждается второй бог.';msg('Первый бог моря повержен!');}
    }else if(!state.vaultBosses.abyss){
      const diff=b?.getDifficulty?.()||'medium',scale={easy:.65,medium:1,hard:1.45,hell:2,impossible:2.8}[diff]||1,maxHp=Math.round(7800*scale),damage={easy:12,medium:18,hard:27,hell:38,impossible:52}[diff]||18;
      if(state.bossHp<=0){state.bossHp=maxHp;state.bossAttack=0;$('vault-log').textContent='БОГ №2: ЛЕВИАФАН БЕЗДНЫ · '+maxHp+' здоровья · сложность '+diff+'. Это последний бог моря.';msg('Пробуждается Левиафан Бездны!');}
      const hit=Math.max(1,Math.round(b?.getWeaponDamage?.()||20));state.bossHp=Math.max(0,state.bossHp-hit);state.bossAttack=(state.bossAttack||0)+1;if(state.air!==Infinity)drainAir(6);
      if(state.bossHp>0){const special=state.bossAttack%3===0,incoming=damage*(special?3:1);if(special)msg('ЛЕВИАФАН · РАЗЛОМ БЕЗДНЫ! Удар древнего чудовища!');b?.damagePlayer?.(incoming);$('vault-log').textContent='Левиафан Бездны · '+state.bossHp+'/'+maxHp+' HP. '+(special?'РАЗЛОМ БЕЗДНЫ':'Удар бездны')+': −'+incoming+' HP.';}
      if(state.bossHp===0){state.vaultBosses.abyss=true;state.godRebirths=state.godRebirths||{};state.godRebirths.abyss={dueDay:(b?.getGameDay?.()||0)+1,multiplier:1.7};b?.scheduleGodRebirth?.('Левиафан Бездны','leviathan',1.7);state.bossHp=0;b?.addItem?.('Око бездны',1,'Трофей второго бога моря. Не создаётся на верстаке.');b?.addItem?.('Ключ великой сокровищницы',1);$('vault-log').textContent='Левиафан Бездны повержен! Получен Ключ великой сокровищницы.';msg('Второй и последний бог моря повержен!');}
    }else if(!state.vaultUnlocked){
      state.vaultUnlocked=true;b?.addItem?.('Корона двух морей',1,'Уникальная награда за победу над двумя богами.');b?.addItem?.('Реликвия древних глубин',1,'Нельзя создать на верстаке.');$('vault-log').textContent='Открыта главная сокровищница! Получены Корона двух морей и Реликвия древних глубин.';msg('Великая сокровищница открыта!');
    }else{$('vault-log').textContent='Оба бога повержены, главная сокровищница уже разграблена.';}
    save();b?.save?.();
  }
  function spawnShark(){if(!Array.isArray(state.sharks))state.sharks=[];if(state.sharks.length>=3)return false;const shark={id:'shark-'+Date.now()+'-'+Math.floor(Math.random()*1e6),x:clamp(state.x+rand(-28,28),3,W-3),y:clamp(state.y+rand(-28,28),3,H-3),hp:55,angle:rand(0,6.28),speed:rand(12,20),cool:rand(.5,2)};state.sharks.push(shark);return true;}
  function frame(now){
    if(!active)return;const dt=Math.min(.04,(now-last)/1000);last=now;state.time+=dt;state.wave+=dt*2;
    update(dt);draw();if(state.messageLeft>0){state.messageLeft-=dt;if(state.messageLeft<=0)$('sea-message').textContent='';}
    if(now-state.lastSave>5000){state.lastSave=now;save();}
    raf=requestAnimationFrame(frame);
  }
  function update(dt){
    const bridgeNow=bridge(),gameDay=bridgeNow?.getGameDay?.(),nightNow=bridgeNow?.isNightTime?.();
    if(Number.isFinite(gameDay)&&nightNow&&state.godRebirths){for(const [god,entry] of Object.entries(state.godRebirths)){if(entry&&Number(entry.dueDay)<=gameDay){if(god==='tide')state.vaultBosses.tide=false;else if(god==='abyss')state.vaultBosses.abyss=false;entry.dueDay=gameDay+999999;state.bossHp=0;msg((god==='tide'?'НЕПТУН РАЗЛОМА':'ЛЕВИАФАН БЕЗДНЫ')+' вернулся в океан и стал в 1,7 раза сильнее!');$('vault-log').textContent='Бог возродился. Его повторное поражение снова даст трофей.';save();}}}
    state.weatherLeft-=dt;if(state.weatherLeft<=0){state.weather=['calm','rain','storm'][Math.floor(Math.random()*3)];state.weatherLeft=rand(100,220);msg({calm:'Ветер стих. Море спокойно.',rain:'Начался дождь. Волны усиливаются.',storm:'ШТОРМ! Укройся или держи курс против волн.'}[state.weather]);}
    const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    const boost=keys.has(' ')?2.0:1, speed=(state.underwater?9:state.weather==='storm'?15:25)*(state.underwater?1:1+(state.upgrades.sails||0)*.16)*boost;
    state.x=clamp(state.x+dx*speed*dt,2,W-2);state.y=clamp(state.y+dy*speed*dt,2,H-2);
    if(dx||dy){const cell=Math.floor(state.x)+','+Math.floor(state.y);if(!state.discovered.includes(cell)&&state.discovered.length<5000)state.discovered.push(cell);}
    state.diveCooldown=Math.max(0,state.diveCooldown-dt);
    if(state.underwater&&state.air!==Infinity){state.air=Math.max(0,((Number(state.airEndsAt)||Date.now())-Date.now())/1000);if(state.air<=0){state.underwater=false;msg('Воздух закончился! Тебя вынесло на поверхность.');}}
    if(state.weather==='storm'&&!state.underwater&&Math.random()<dt*(.06/(1+(state.upgrades.hull||0)*.45))){state.boatHp=Math.max(0,state.boatHp-1);if(state.boatHp<=0)msg('Шторм разбил корабль! Вернись на берег.');}
    state.harpoonCooldown=Math.max(0,(state.harpoonCooldown||0)-dt);if(state.harpoonTrace){state.harpoonTrace.life-=dt;if(state.harpoonTrace.life<=0)state.harpoonTrace=null;}
    if(state.underwater){
      if(Math.hypot(state.city.x-state.x,state.city.y-state.y)<28&&!state.city.discovered){state.city.discovered=true;msg('На глубине показались башни затонувшего города. Найди главный храм!');save();}
      for(const cave of state.caves){if(!cave.cleared&&!cave.active&&Math.hypot(cave.x-state.x,cave.y-state.y)<9){cave.active=true;msg('Ты приблизился к подводной пещере. Страж пробудился! Гарпун — F.');save();}}
      state.krakenSpawnTimer=Math.max(0,(Number(state.krakenSpawnTimer)||170)-dt);
      if(state.krakenSpawnTimer<=0){if(!state.monsters.some(m=>m.kind==='kraken')&&Math.random()<.24){const angle=Math.random()*Math.PI*2;state.monsters.push({id:'kraken-'+Date.now(),kind:'kraken',x:clamp(state.x+Math.cos(angle)*rand(20,34),5,W-5),y:clamp(state.y+Math.sin(angle)*rand(20,34),5,H-5),hp:980,maxHp:980,angle:rand(0,6.28),speed:5,cool:2});msg('КРАКЕН! Редкое древнее чудовище заметило тебя в глубине!');}state.krakenSpawnTimer=rand(150,260);}
    }
    for(const s of state.sharks){const vx=state.x-s.x,vy=state.y-s.y,d=Math.hypot(vx,vy)||1;if(d<24){s.x+=vx/d*s.speed*dt;s.y+=vy/d*s.speed*dt;s.cool-=dt;if(s.cool<=0){s.cool=2.2;state.boatHp=Math.max(0,state.boatHp-Math.max(2,5-(state.upgrades.hull||0)));msg('Акула укусила корабль! Прочность '+Math.round(state.boatHp/boatMaxHp()*100)+'%.');}}else{s.angle+=rand(-.6,.6)*dt;s.x+=Math.cos(s.angle)*s.speed*.25*dt;s.y+=Math.sin(s.angle)*s.speed*.25*dt;}s.x=clamp(s.x,2,W-2);s.y=clamp(s.y,2,H-2);}
    if(state.underwater){for(const m of state.monsters){const vx=state.x-m.x,vy=state.y-m.y,d=Math.hypot(vx,vy)||1;if(d<20){m.x+=vx/d*m.speed*dt;m.y+=vy/d*m.speed*dt;if(Math.random()<dt*(m.kind==='kraken'?.18:.08)){drainAir(m.kind==='kraken'?7:3);bridge()?.damagePlayer?.(m.kind==='kraken'?8:2);msg(m.kind==='kraken'?'Кракен обвил тебя щупальцами!':'Подводный страж атакует!');}}}}
    if(!state.underwater){state.sharkSpawnTimer=(state.sharkSpawnTimer||rand(85,145))-dt;if(state.sharkSpawnTimer<=0){if(state.sharks.length<3&&Math.random()<.32)spawnShark();state.sharkSpawnTimer=rand(85,165);}}
    $('sea-weather').textContent='Погода: '+({calm:'штиль',rain:'дождь',storm:'ШТОРМ'}[state.weather]);
    $('sea-boat-hp').textContent='Корабль: '+Math.round(state.boatHp/boatMaxHp()*100)+'%';$('sea-air').textContent=state.underwater?'Воздух: '+(state.air===Infinity?'∞':Math.ceil(state.air)+' с'):'Воздух: —';
    $('sea-coords').textContent='Координаты: '+Math.floor(state.x)+' / '+Math.floor(state.y);
    $('sea-dive-btn').textContent=state.underwater?'↑ Всплыть · E':'↓ Нырнуть · E';
  }
  function draw(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    const sea=ctx.createLinearGradient(0,0,0,h);sea.addColorStop(0,'#6fc5d7');sea.addColorStop(.16,'#2386a8');sea.addColorStop(.52,'#0b557d');sea.addColorStop(1,'#062b50');ctx.fillStyle=sea;ctx.fillRect(0,0,w,h);
    // Distant horizon, sky glow and moving cloud bands.
    const horizon=h*.16;const sky=ctx.createLinearGradient(0,0,0,horizon+24);sky.addColorStop(0,'#9bd9e8');sky.addColorStop(1,'#d5f0e9');ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon+24);
    ctx.fillStyle='rgba(255,244,196,.34)';ctx.beginPath();ctx.arc(w*.78,h*.09,Math.max(22,h*.045),0,Math.PI*2);ctx.fill();
    for(let i=0;i<15;i++){const cx=((i*241+state.time*5)%(w+300))-150,cy=24+(i%5)*22;ctx.fillStyle='rgba(255,255,255,.20)';ctx.beginPath();ctx.ellipse(cx,cy,65,12,0,0,Math.PI*2);ctx.ellipse(cx+34,cy-5,38,13,0,0,Math.PI*2);ctx.fill();}
    const scale=Math.min(w/(W*TILE*.22),h/(H*TILE*.22)),ox=w/2-state.x*TILE*scale,oy=h/2-state.y*TILE*scale;
    const left=state.x-w/(2*TILE*scale)-2,right=state.x+w/(2*TILE*scale)+2,top=state.y-h/(2*TILE*scale)-2,bottom=state.y+h/(2*TILE*scale)+2;
    ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    // Pale shallows, deep-water floor and sand gradients.
    const floor=ctx.createLinearGradient(0,0,0,H*TILE);floor.addColorStop(0,'#d5c18a');floor.addColorStop(.13,'#9a9d72');floor.addColorStop(.2,'#286f79');floor.addColorStop(1,'#073b62');ctx.fillStyle=floor;ctx.fillRect(0,0,W*TILE,H*TILE);
    // Beach and foam shoreline.
    ctx.fillStyle='#e9d49a';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(8*TILE,0);for(let y=0;y<=H*TILE;y+=20)ctx.lineTo((7.2+Math.sin(y*.012)*.45+Math.sin(y*.037)*.18)*TILE,y);ctx.lineTo(0,H*TILE);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,255,224,.9)';ctx.lineWidth=5;ctx.beginPath();for(let y=0;y<=H*TILE;y+=12){const x=(7.15+Math.sin(y*.012)*.45+Math.sin(y*.037)*.18)*TILE;if(y===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    // Sandy bars, reefs, rocks and kelp beds are deterministic, so they persist visually.
    for(let i=0;i<210;i++){const x=(17+i*47%338)*TILE,y=(9+i*83%242)*TILE;if(x/TILE<left-3||x/TILE>right+3||y/TILE<top-3||y/TILE>bottom+3)continue;const n=Math.sin(i*91.7)*.5+.5;ctx.fillStyle=n>.55?'rgba(31,118,112,.34)':'rgba(219,196,129,.20)';ctx.beginPath();ctx.ellipse(x,y,18+n*28,8+n*13,Math.sin(i)*.6,0,Math.PI*2);ctx.fill();if(i%3===0){ctx.fillStyle='#527e69';ctx.beginPath();ctx.ellipse(x+5,y-3,7,12,.4,0,Math.PI*2);ctx.fill();}}
    for(let i=0;i<170;i++){const x=(21+i*61%338)*TILE,y=(12+i*37%242)*TILE;if(x/TILE<left-2||x/TILE>right+2||y/TILE<top-2||y/TILE>bottom+2)continue;ctx.fillStyle=i%2?'#e47d6a':'#e7b66e';ctx.beginPath();ctx.arc(x,y,3+(i%4)*1.4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(38,119,110,.9)';ctx.lineWidth=2;for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-8+k*7,y-9,x-7+k*7,y-19-(i%3)*3);ctx.stroke();}}
    // Layered animated wave crests across the visible ocean.
    for(let layer=0;layer<5;layer++){ctx.beginPath();for(let x=Math.floor(left*32/8)*8;x<right*32;x+=8){const y=(top*32)+layer*47+Math.sin(x*.018+state.wave*(.55+layer*.13))*7+Math.sin(x*.043-state.wave*.8)*3;if(x===Math.floor(left*32/8)*8)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=['rgba(211,250,255,.26)','rgba(146,231,244,.22)','rgba(255,255,255,.12)','rgba(94,197,225,.22)','rgba(220,249,255,.16)'][layer];ctx.lineWidth=layer===0?4:2;ctx.stroke();}
    // Floating foam flecks and bubbles.
    for(let i=0;i<475;i++){const x=((i*97+state.time*(12+i%5)*8)%(W*TILE)),y=(i*53+Math.sin(state.time+i)*14)%(H*TILE);if(x/TILE<left||x/TILE>right||y/TILE<top||y/TILE>bottom)continue;ctx.fillStyle='rgba(226,252,255,'+(.12+(i%4)*.07)+')';ctx.beginPath();ctx.ellipse(x,y,2+i%3,1.2,Math.sin(state.time+i),0,Math.PI*2);ctx.fill();}
    // Small distant islands and jagged rocks.
    for(let i=0;i<28;i++){const x=(31+i*29%338)*TILE,y=(17+(i*41)%242)*TILE;if(x/TILE<left-8||x/TILE>right+8||y/TILE<top-8||y/TILE>bottom+8)continue;ctx.fillStyle='#344d45';ctx.beginPath();ctx.ellipse(x,y,28,17,.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b4a36e';ctx.beginPath();ctx.ellipse(x-4,y-5,25,13,.1,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3f8660';ctx.beginPath();ctx.arc(x,y-13,10,0,Math.PI*2);ctx.fill();ctx.fillRect(x-2,y-26,4,17);}
    // Hidden reef caves and the ruins of the sunken city are visible from underwater.
    if(state.underwater){
      for(const cave of state.caves){const x=cave.x*TILE,y=cave.y*TILE;ctx.save();ctx.translate(x,y);ctx.fillStyle='#132e45';ctx.beginPath();ctx.ellipse(0,8,42,27,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#536f79';for(let k=0;k<7;k++){const px=-34+k*11,ph=18+(k%3)*8;ctx.beginPath();ctx.moveTo(px-6,-4);ctx.lineTo(px,-ph);ctx.lineTo(px+7,-4);ctx.closePath();ctx.fill();}ctx.fillStyle='#020c21';ctx.beginPath();ctx.ellipse(0,2,22,19,0,Math.PI,Math.PI*2);ctx.fill();if(cave.active&&!cave.cleared){ctx.strokeStyle='#9e78df';ctx.lineWidth=3;ctx.shadowColor='#a77be8';ctx.shadowBlur=17;ctx.beginPath();ctx.ellipse(0,3,26,22,0,Math.PI,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}ctx.fillStyle='#e1e4c4';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText(cave.cleared?'ОЧИЩЕНО':'ПЕЩЕРА',0,43);ctx.restore();}
      const city=state.city,x=city.x*TILE,y=city.y*TILE;ctx.save();ctx.translate(x,y);ctx.globalAlpha=city.discovered?.96:.42;ctx.fillStyle='#395f70';for(let k=0;k<5;k++){const bx=-66+k*31,bh=42+(k%3)*15;ctx.fillRect(bx,-bh,22,bh+24);ctx.fillStyle='#6b9ba2';ctx.fillRect(bx+4,-bh+8,14,5);ctx.fillStyle='#395f70';}ctx.fillStyle='#627f91';ctx.fillRect(-16,-65,32,68);ctx.fillRect(-57,-34,19,36);ctx.fillRect(38,-38,19,40);ctx.beginPath();ctx.moveTo(-24,-64);ctx.lineTo(0,-91);ctx.lineTo(24,-64);ctx.closePath();ctx.fill();ctx.fillStyle='#b8e7e8';for(const px of [-9,3])ctx.fillRect(px,-49,6,8);ctx.fillStyle='#e9d39a';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillText(city.discovered?'ЗАТОНУВШИЙ ГОРОД':'ДРЕВНИЕ РУИНЫ',0,37);if(city.discovered&&!city.cleared){ctx.strokeStyle='#e2a8ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-34,36+Math.sin(state.time*3)*3,0,Math.PI*2);ctx.stroke();}ctx.restore();
    }
    // Treasure chests and shipwrecks.
    for(const t of state.treasures){if(state.opened.includes(t.id))continue;const x=t.x*TILE,y=t.y*TILE;if(t.kind==='wreck'){ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.fillStyle='#513c2b';ctx.fillRect(-29,-7,58,15);ctx.fillStyle='#986b43';ctx.fillRect(-23,-14,46,8);ctx.strokeStyle='#d0a16a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-17,-12);ctx.lineTo(-8,-28);ctx.moveTo(8,-12);ctx.lineTo(21,-22);ctx.stroke();ctx.restore();}else{ctx.fillStyle='#62452e';ctx.fillRect(x-10,y-8,20,16);ctx.fillStyle='#d8a94f';ctx.fillRect(x-10,y-8,20,5);ctx.fillStyle='#fff0a5';ctx.fillRect(x-2,y-7,4,6);}}
    // Sharks: animated bodies, tail, dorsal and pectoral fins.
    for(const s of state.sharks){const x=s.x*TILE,y=s.y*TILE,swim=Math.sin(state.time*5+(s.angle||0))*3;ctx.save();ctx.translate(x,y);ctx.scale(1.55,1.55);ctx.rotate((s.angle||0)+(Math.atan2(state.y-s.y,state.x-s.x)*.12));ctx.fillStyle='rgba(0,18,35,.24)';ctx.beginPath();ctx.ellipse(0,9,22,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#719db0';ctx.beginPath();ctx.moveTo(25,0);ctx.quadraticCurveTo(5,-14,-18,-4);ctx.quadraticCurveTo(-26,0,-18,5);ctx.quadraticCurveTo(5,14,25,0);ctx.fill();ctx.fillStyle='#456f86';ctx.beginPath();ctx.moveTo(-17,0);ctx.lineTo(-34,-12+swim);ctx.lineTo(-29,0);ctx.lineTo(-34,12+swim);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-2,-5);ctx.lineTo(4,-18);ctx.lineTo(11,-4);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(1,5);ctx.lineTo(10,14);ctx.lineTo(13,5);ctx.closePath();ctx.fill();ctx.fillStyle='#e8f5f8';ctx.fillRect(12,-3,3,3);ctx.fillStyle='#10283a';ctx.fillRect(13,-3,2,2);ctx.restore();}
    // Underwater guardians and schools of fish.
    for(const m of state.monsters){const x=m.x*TILE,y=m.y*TILE,pulse=Math.sin(state.time*4+x)*2;ctx.save();ctx.translate(x,y);
      if(m.kind==='kraken'){ctx.fillStyle='rgba(6,14,35,.36)';ctx.beginPath();ctx.ellipse(0,14,35,11,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#7950a1';ctx.lineWidth=8;for(let a=0;a<8;a++){const angle=a*Math.PI/4+Math.sin(state.time*2+a)*.18;ctx.beginPath();ctx.moveTo(Math.cos(angle)*12,Math.sin(angle)*8+3);ctx.quadraticCurveTo(Math.cos(angle)*30,Math.sin(angle)*24,Math.cos(angle)*38,Math.sin(angle)*16+Math.sin(state.time*5+a)*5);ctx.stroke();}ctx.fillStyle='#643e91';ctx.beginPath();ctx.ellipse(0,0,21,18+pulse,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f4d7ff';ctx.beginPath();ctx.arc(-7,-4,5,0,Math.PI*2);ctx.arc(7,-4,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff516c';ctx.fillRect(-8,-5,3,4);ctx.fillRect(6,-5,3,4);ctx.fillStyle='#e3b4f5';ctx.fillRect(-5,7,10,3);}
      else if(m.kind==='ray'){ctx.fillStyle='#4c9b9d';ctx.beginPath();ctx.moveTo(0,-12);ctx.quadraticCurveTo(13,-6,22,7);ctx.lineTo(2,3);ctx.lineTo(0,18);ctx.lineTo(-2,3);ctx.lineTo(-22,7);ctx.quadraticCurveTo(-13,-6,0,-12);ctx.fill();ctx.fillStyle='#ddfbf1';ctx.fillRect(-5,-4,3,3);ctx.fillRect(2,-4,3,3);ctx.strokeStyle='#88d5cf';ctx.beginPath();ctx.moveTo(0,15);ctx.lineTo(0,26);ctx.stroke();}
      else if(m.kind==='angler'){ctx.fillStyle='#5a536d';ctx.beginPath();ctx.ellipse(0,0,17,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c7bddb';ctx.beginPath();ctx.arc(13,-4,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#9b91aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(9,-9);ctx.quadraticCurveTo(14,-21,5,-22);ctx.stroke();ctx.fillStyle='#ffe88b';ctx.beginPath();ctx.arc(5,-22,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff516c';ctx.fillRect(-5,-4,3,3);ctx.fillRect(3,-4,3,3);}
      else{ctx.fillStyle='rgba(8,19,48,.3)';ctx.beginPath();ctx.ellipse(0,9,17,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9368b4';ctx.beginPath();ctx.ellipse(0,0,12,10+pulse,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d5b5f3';ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(-18,-8);ctx.lineTo(-16,8);ctx.closePath();ctx.fill();ctx.fillStyle='#f6eaff';ctx.fillRect(-5,-3,3,3);ctx.fillRect(3,-3,3,3);}
      if(Number(m.maxHp)>0&&m.kind==='kraken'){ctx.fillStyle='#230e36';ctx.fillRect(-30,-34,60,5);ctx.fillStyle='#de91ff';ctx.fillRect(-30,-34,60*clamp(m.hp/m.maxHp,0,1),5);}ctx.restore();}
    for(let shoal=0;shoal<24;shoal++){const bx=(25+shoal*23%338)*TILE,by=(12+(shoal*31)%242)*TILE;if(bx/TILE<left-5||bx/TILE>right+5||by/TILE<top-5||by/TILE>bottom+5)continue;for(let f=0;f<5;f++){const fx=bx+Math.sin(state.time*1.5+f+shoal)*18+f*8,fy=by+Math.cos(state.time*1.7+f)*9;ctx.fillStyle='#d5eef0';ctx.beginPath();ctx.ellipse(fx,fy,5,2.5,.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7cc8cf';ctx.beginPath();ctx.moveTo(fx-4,fy);ctx.lineTo(fx-9,fy-4);ctx.lineTo(fx-9,fy+4);ctx.fill();}}
    if(state.harpoonTrace){ctx.save();ctx.globalAlpha=Math.min(1,state.harpoonTrace.life/.22);ctx.strokeStyle='#d6f7ff';ctx.lineWidth=3;ctx.shadowColor='#75d9ff';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(state.harpoonTrace.x1*TILE,state.harpoonTrace.y1*TILE);ctx.lineTo(state.harpoonTrace.x2*TILE,state.harpoonTrace.y2*TILE);ctx.stroke();ctx.restore();}
    if(state.underwater){const glow=ctx.createRadialGradient(state.x*TILE,state.y*TILE,10,state.x*TILE,state.y*TILE,260);glow.addColorStop(0,'rgba(111,222,255,.3)');glow.addColorStop(1,'rgba(0,15,50,.72)');ctx.fillStyle=glow;ctx.fillRect(left*TILE,top*TILE,(right-left)*TILE,(bottom-top)*TILE);}
    else{
      // Player's ship: hull, deck, mast, animated sails, rigging, lantern and wake.
      const x=state.x*TILE,y=state.y*TILE,rock=Math.sin(state.wave*.55)*.06;ctx.save();ctx.translate(x,y+Math.sin(state.wave)*2);ctx.rotate(rock);ctx.scale(1.28,1.28);ctx.fillStyle='rgba(0,12,27,.38)';ctx.beginPath();ctx.ellipse(0,17,39,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#543622';ctx.beginPath();ctx.moveTo(-38,-10);ctx.lineTo(38,-10);ctx.lineTo(27,19);ctx.lineTo(-26,19);ctx.closePath();ctx.fill();ctx.fillStyle='#a66e3d';ctx.fillRect(-30,-9,60,8);ctx.fillStyle='#d5b17a';ctx.fillRect(-21,-2,42,13);ctx.fillStyle='#5a402d';ctx.fillRect(-3,-43,6,43);ctx.strokeStyle='#e5d2aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-38);ctx.lineTo(-25,-29);ctx.moveTo(0,-38);ctx.lineTo(27,-26);ctx.stroke();ctx.fillStyle='#fff0c9';ctx.beginPath();ctx.moveTo(-1,-39);ctx.lineTo(-1,-9);ctx.lineTo(-27,-9);ctx.closePath();ctx.fill();ctx.fillStyle='#bfeaf0';ctx.beginPath();ctx.moveTo(2,-36);ctx.lineTo(2,-10);ctx.lineTo(24,-10);ctx.closePath();ctx.fill();ctx.fillStyle='#ffdc8a';ctx.beginPath();ctx.arc(14,4,3,0,Math.PI*2);ctx.fill();
      // A clearly visible sailor avatar standing on deck.
      const walk=Math.sin(state.time*7)*1.5;ctx.save();ctx.scale(1.7,1.7);ctx.fillStyle='#e0b48a';ctx.beginPath();ctx.arc(0,-10+walk,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f4d2ad';ctx.beginPath();ctx.arc(0,-10+walk,5.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#26364a';ctx.fillRect(-2.8,-11+walk,1.5,1.8);ctx.fillRect(1.3,-11+walk,1.5,1.8);ctx.strokeStyle='#8d4d3d';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-8.5+walk,2.2,.15,Math.PI-.15);ctx.stroke();ctx.fillStyle='#31506c';ctx.fillRect(-7,-3+walk,14,13);ctx.fillStyle='#d9e8ed';ctx.fillRect(-5,-1+walk,10,3);ctx.strokeStyle='#f1d7b1';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-6,0+walk);ctx.lineTo(-12,8+walk);ctx.moveTo(6,0+walk);ctx.lineTo(12,8+walk);ctx.stroke();ctx.fillStyle='#273b4e';ctx.fillRect(-6,9+walk,5,7);ctx.fillRect(1,9+walk,5,7);ctx.fillStyle='#d7c59b';ctx.fillRect(-8,-19+walk,16,4);ctx.restore();ctx.restore();
    }
    if(state.weather==='rain'||state.weather==='storm'){ctx.strokeStyle=state.weather==='storm'?'rgba(225,245,255,.5)':'rgba(225,245,255,.28)';ctx.lineWidth=1.4;for(let i=0;i<(state.weather==='storm'?100:55);i++){const x=(i*79+state.time*260)%(w+50),y=(i*43+state.time*430)%(h+30);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y+15);ctx.stroke();}}
    ctx.restore();
    // Wave highlights remain in screen space so the ocean visibly moves at every zoom.
    ctx.save();for(let layer=0;layer<6;layer++){ctx.beginPath();for(let x=0;x<w;x+=12){const y=h*.23+layer*h*.12+Math.sin(x*.012+state.wave*(.8+layer*.13))*5+Math.sin(x*.027-state.wave)*2;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle='rgba(207,247,255,'+(.12+layer*.018)+')';ctx.lineWidth=layer===0?3:1.5;ctx.stroke();}ctx.restore();
    ctx.fillStyle='rgba(3,18,33,.68)';ctx.fillRect(12,12,260,34);ctx.fillStyle='#e7f6ff';ctx.font='bold 13px Segoe UI';ctx.fillText(state.underwater?'ПОД ВОДОЙ · '+(state.air===Infinity?'ВОЗДУХ ∞':Math.ceil(state.air)+' С'):'ГОРИЗОНТ · МОРСКАЯ ЭКСПЕДИЦИЯ',22,34);
    if(state.weather==='storm'){ctx.fillStyle='rgba(8,22,43,.58)';ctx.fillRect(w-168,12,156,30);ctx.fillStyle='#d7edff';ctx.font='bold 12px Segoe UI';ctx.fillText('⚡ ШТОРМ',w-151,32);}
  }
  function drawMap(){
    const c=$('sea-map-canvas');if(!c)return;const r=c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);const w=r.width,h=r.height;x.fillStyle='#0b4567';x.fillRect(0,0,w,h);x.strokeStyle='rgba(190,235,255,.12)';for(let i=0;i<=22;i++){x.beginPath();x.moveTo(i*w/22,0);x.lineTo(i*w/22,h);x.stroke();}for(let i=0;i<=16;i++){x.beginPath();x.moveTo(0,i*h/16);x.lineTo(w,i*h/16);x.stroke();}x.fillStyle='#e9f5ff';for(const cell of state.discovered){const [a,b]=cell.split(',').map(Number);x.fillRect(a/360*w,b/260*h,2,2);}x.fillStyle='#ffe17c';for(const m of state.mapMarks)x.fillRect(m.x/360*w-4,m.y/260*h-4,8,8);if(state.city.discovered){x.fillStyle='#d7a7ff';x.fillRect(state.city.x/360*w-5,state.city.y/260*h-5,10,10);}for(const cave of state.caves)if(cave.active||cave.cleared){x.fillStyle=cave.cleared?'#88e0b1':'#bba1ff';x.beginPath();x.arc(cave.x/360*w,cave.y/260*h,4,0,Math.PI*2);x.fill();}x.fillStyle='#ff756a';x.beginPath();x.arc(state.x/360*w,state.y/260*h,5,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.font='12px Segoe UI';x.fillText('Ты',state.x/360*w+8,state.y/260*h-8);
  }
  function api(){return {open:enter,isOpen:()=>active,save,getState:()=>JSON.parse(JSON.stringify(state)),upgradeShip,fireHarpoon,boatMaxHp};}
  window.SkyRealmSea=api();
  function installExpeditionButton(){
    if($('open-sea-expedition'))return;
    const button=document.createElement('button');
    button.type='button';button.id='open-sea-expedition';button.textContent='🌊 Морская экспедиция';
    button.style.cssText='position:fixed;right:16px;top:72px;z-index:40;display:none;background:#123b55;color:#eaf8ff;border:1px solid #5a9cbb;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer';
    button.addEventListener('click',()=>{
      try{enter();}
      catch(error){console.error('SkyRealm sea expedition failed to open:',error);bridge()?.toast?.('Не удалось открыть морскую экспедицию. Попробуй ещё раз.');}
    });
    document.body.appendChild(button);
    const refresh=()=>{
      const live=!!bridge()?.getWorldId?.(),visible=live&&!active;
      button.style.display=visible?'block':'none';button.disabled=!visible;
      button.title=!live?'Сначала выбери или создай мир.':bridge()?.hasItem?.('Корабль')?'Открыть морскую экспедицию':'Сначала создай корабль на второй странице верстака.';
    };
    refresh();window.setInterval(refresh,800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installExpeditionButton,{once:true});
  else installExpeditionButton();
})();