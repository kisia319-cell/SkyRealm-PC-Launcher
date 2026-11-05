(() => {
  'use strict';
  const VERSION = 1;
  const KEY = () => 'skyrealm_sea_v1_' + (window.SkyRealmSeaBridge?.getWorldId?.() || 'default');
  const $ = (id) => document.getElementById(id);
  const state = {
    version: VERSION, x: 13, y: 82, boatHp: 100, shipLevel:0, weather: 'calm', weatherLeft: 150,
    wave: 0, time: 0, mapOpen: false, underwater: false, air: 60,
    helmetLevel: 0, sharks: [], monsters: [], treasures: [], opened: [],
    vaultUnlocked: false, vaultRoom: 0, vaultPath: 0, vaultBosses: { tide:false, abyss:false },
    relics: [], discovered: [], message: '', messageLeft: 0, lastSave: 0,
    chartFound: false, bossHp: 0, bossAttack: 0, stormDamageAt: 0,
    diveCooldown: 0, mapMarks: [], cave:{room:1,cleared:[],finished:false,enemyHp:0,enemyMaxHp:0}
  };
  const DEFAULT_STATE=JSON.parse(JSON.stringify(state));
  const W = 360, H = 260, TILE = 32;
  const CAVE_ENTRANCE={x:309,y:214};
  const CAVE_ROOMS=[
    {name:'Коралловый вход',enemy:'Краб-страж',hp:240,damage:7,loot:[['Жемчуг',3],['Кристалл',2]]},
    {name:'Зал приливов',enemy:'Глубинный охотник',hp:430,damage:12,loot:[['Сапфир',3],['Мифрил',2]]},
    {name:'Грот морского титана',enemy:'Морской титан',hp:820,damage:18,loot:[['Око бездны',1],['Реликвия древних глубин',1]]}
  ];
  let caveOpen=false;
  let root, canvas, ctx, raf = 0, last = 0, keys = new Set(), active = false;
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const bridge = () => window.SkyRealmSeaBridge;
  function caveNear(){return Math.hypot(state.x-CAVE_ENTRANCE.x,state.y-CAVE_ENTRANCE.y)<=7;}
  function caveRoom(){return CAVE_ROOMS[clamp(Math.floor(Number(state.cave?.room)||1),1,3)-1];}
  function ensureCaveState(raw=state.cave){const c=raw&&typeof raw==='object'?raw:{};return {room:clamp(Math.floor(Number(c.room)||1),1,3),cleared:Array.isArray(c.cleared)?Array.from(new Set(c.cleared.filter(n=>Number.isInteger(n)&&n>=1&&n<=3))):[],finished:c.finished===true,enemyHp:Math.max(0,Number(c.enemyHp)||0),enemyMaxHp:Math.max(0,Number(c.enemyMaxHp)||0)};}

  function msg(s){ state.message=s; state.messageLeft=4.5; const el=$('sea-message'); if(el)el.textContent=s; else bridge()?.toast?.(s); }
  function save(){
    try { const snapshot={...state, sharks:state.sharks.slice(0,40), monsters:state.monsters.slice(0,40), discovered:state.discovered.slice(-5000)};localStorage.setItem(KEY(), JSON.stringify(snapshot));bridge()?.setSeaData?.(snapshot); }
    catch(e){ console.warn('Sea save failed',e); }
  }
  function boatMaxHp(){return [100,150,210,280][clamp(Math.floor(Number(state.shipLevel)||0),0,3)];}
  function load(){
    try {
      const d=bridge()?.getSeaData?.()||JSON.parse(localStorage.getItem(KEY())||'null');
      if(!d || d.version!==VERSION){Object.assign(state,JSON.parse(JSON.stringify(DEFAULT_STATE)));return;}
      Object.assign(state,d);
      state.shipLevel=clamp(Math.floor(Number(d.shipLevel)||0),0,3);
      const savedBoatHp=Number(d.boatHp);state.boatHp=clamp(Number.isFinite(savedBoatHp)?savedBoatHp:100,0,boatMaxHp());
      state.x=clamp(Number(state.x)||13,11,W-3); state.y=clamp(Number(state.y)||82,3,H-3); if(state.x<10)state.x=13;
      state.sharks=Array.isArray(d.sharks)?d.sharks:[]; state.monsters=Array.isArray(d.monsters)?d.monsters:[];
      state.treasures=Array.isArray(d.treasures)?d.treasures:[]; state.opened=Array.isArray(d.opened)?d.opened:[];
      state.relics=Array.isArray(d.relics)?d.relics:[];
      state.cave=ensureCaveState(d.cave);
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
    state.cave=ensureCaveState(state.cave);
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
      #sea-map.open{display:block}#sea-map canvas{width:100%;height:calc(100% - 50px);min-height:220px}
      #skyrealm-sea .sea-control-pad{position:absolute;right:14px;bottom:14px;z-index:5;display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px;border:1px solid #8bd3ef88;border-radius:14px;background:#061321c9;backdrop-filter:blur(5px);touch-action:none;user-select:none}#skyrealm-sea .sea-control-row{display:flex;gap:5px}#skyrealm-sea .sea-control-pad button{width:42px;height:40px;padding:0;font-size:18px;border-color:#84cce8;background:#174a66;touch-action:none;user-select:none}#skyrealm-sea .sea-control-pad button:active{background:#317e9d;transform:scale(.96)}#sea-vault{position:absolute;inset:8% 10%;display:none;background:#10182bf5;border:1px solid #aa9cce;border-radius:14px;padding:18px;overflow:auto}
      #sea-vault.open{display:block}#sea-vault h2{margin:0 0 8px;color:#e5d6ff}#sea-vault .vault-paths{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      #sea-vault .vault-paths button{flex:1;min-width:140px}#sea-vault .vault-log{padding:12px;background:#080f1e;border-radius:8px;min-height:90px;line-height:1.7}
      #sea-cave{position:absolute;inset:8% 12%;display:none;background:linear-gradient(145deg,#071b35f8,#0b2940f8);border:1px solid #73d9ef;border-radius:14px;padding:18px;overflow:auto;box-shadow:0 20px 70px #000b}
      #sea-cave.open{display:block}#sea-cave h2{margin:0 0 8px;color:#a9f0ff}#sea-cave-content{padding:13px;background:#061626;border:1px solid #2d6880;border-radius:9px;line-height:1.7;margin:12px 0}#sea-cave .cave-actions{display:flex;gap:8px;flex-wrap:wrap}#sea-cave .cave-actions button{flex:1;min-width:130px}#sea-cave .cave-hp{height:9px;background:#233d55;border-radius:9px;overflow:hidden;margin:8px 0}#sea-cave .cave-hp i{display:block;height:100%;background:linear-gradient(90deg,#36b8ce,#a4f2e7)}
      @media(max-width:700px){#skyrealm-sea .sea-help{font-size:10px;max-width:90%}#skyrealm-sea .sea-top{gap:6px;padding:7px}#skyrealm-sea .sea-stat{font-size:10px}}
      </style>
      <div class="sea-top"><span class="sea-title">🌊 SKYREALM · МОРЕ</span><span class="sea-stat" id="sea-weather">Погода: штиль</span><span class="sea-stat" id="sea-boat-hp">Корабль: 100%</span><span class="sea-stat" id="sea-air">Воздух: —</span><span class="sea-stat" id="sea-coords">Координаты: 13 / 82</span><button id="sea-map-btn">🗺 Карта</button><button id="sea-ship-upgrade">⚓ Улучшить корабль</button><button id="sea-dive-btn">↓ Нырнуть · E</button><button id="sea-vault-btn">🏛 Сокровищница</button><button id="sea-cave-btn" disabled>🪨 Подводный грот</button><button id="sea-exit">Вернуться на берег</button></div>
      <div class="sea-stage"><canvas id="sea-canvas"></canvas><div id="sea-message">Море ждёт тебя. Найди карту сокровищ!</div>
      <div class="sea-help">WASD / стрелки — управлять кораблём · E — взаимодействовать / нырять · M — карта · Space — ускорение<br>В шторм волны повреждают корабль. Акулы преследуют лодку. Для долгого погружения нужен водяной шлем.</div>
      <div class="sea-control-pad" aria-label="Управление кораблём"><button type="button" data-sea-direction="w" aria-label="Вперёд">▲</button><div class="sea-control-row"><button type="button" data-sea-direction="a" aria-label="Влево">◀</button><button type="button" data-sea-direction="s" aria-label="Назад">▼</button><button type="button" data-sea-direction="d" aria-label="Вправо">▶</button></div></div>
      <div id="sea-map"><h2>🗺 Морская карта · 360 × 260</h2><p>Туман скрывает неизведанные воды. Найди обломки кораблей и карты сокровищ.</p><canvas id="sea-map-canvas"></canvas><button id="sea-map-close">Закрыть карту</button></div>
      <div id="sea-vault"><h2>🏛 Великая сокровищница глубин</h2><p>Подводный лабиринт с несколькими путями. Внутри находятся ровно два бога моря.</p><div class="vault-paths"><button data-path="0">Путь затонувших стражей</button><button data-path="1">Коралловые катакомбы</button><button data-path="2">Бездна древних</button></div><div class="vault-log" id="vault-log">Перед входом подготовь водяной шлем. В каждом пути есть монстры и ловушки.</div><div class="vault-paths"><button id="vault-enter">Войти в выбранный путь</button><button id="vault-fight" disabled>Сразиться с боссом</button><button id="vault-exit">Выйти из сокровищницы</button></div></div>
      <div id="sea-cave"><h2>🪨 Подводный грот · экспедиция</h2><p>Три комнаты, три защитника и сокровища древнего морского титана. Воздух продолжает расходоваться во время боя.</p><div id="sea-cave-content"></div><div class="cave-actions"><button id="sea-cave-attack">⚔ Атаковать</button><button id="sea-cave-close">Выйти из грота</button></div></div>
      </div>`;
    document.body.appendChild(root);const pauseLock=document.createElement('div');pauseLock.className='shade';pauseLock.id='sea-pause-lock';pauseLock.hidden=true;document.body.appendChild(pauseLock);canvas=$('sea-canvas');ctx=canvas.getContext('2d');
    $('sea-exit').onclick=leave; $('sea-map-btn').onclick=toggleMap; $('sea-map-close').onclick=toggleMap; $('sea-ship-upgrade').onclick=upgradeShip;
    $('sea-dive-btn').onclick=toggleDive; $('sea-vault-btn').onclick=()=>{ $('sea-vault').classList.add('open'); $('sea-map').classList.remove('open'); closeCave(); }; $('sea-cave-btn').onclick=enterCave; $('sea-cave-attack').onclick=attackCave; $('sea-cave-close').onclick=closeCave;
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
  function onKey(e){if(!active)return;const k=keyToken(e);if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','m','e','escape'].includes(k))return;e.preventDefault();e.stopPropagation();const firstPress=!keys.has(k);keys.add(k);if(!firstPress)return;if(k==='m')toggleMap();if(k==='e'){if(state.underwater)toggleDive();else interact();}if(k==='escape'){if($('sea-vault').classList.contains('open'))$('sea-vault').classList.remove('open');else if(state.mapOpen)toggleMap();else leave();}}
  function onUp(e){keys.delete(keyToken(e));}
  function enter(){
    const b=bridge(); if(!b?.getWorldId?.()){msg('Сначала загрузи игровой мир.');return;}
    if(!b.hasItem('Корабль')){msg('Сначала создай корабль на второй странице верстака.');return;}
    build(); load(); ensureWorld(); active=true; state.underwater=false; state.helmetLevel=b.getWaterHelmetLevel?.()||0;
    root.hidden=false;const pauseLock=$('sea-pause-lock');if(pauseLock)pauseLock.hidden=false;b.pause?.(); resize(); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); msg('Ты вышел за горизонт. Исследуй море и ищи затонувшие сокровища.'); save();
  }
  function leave(){if(!active)return;active=false;keys.clear();closeCave();cancelAnimationFrame(raf);save();root.hidden=true;const pauseLock=$('sea-pause-lock');if(pauseLock)pauseLock.hidden=true;bridge()?.resume?.();}
  function toggleMap(){if(!active)return;state.mapOpen=!state.mapOpen;$('sea-map').classList.toggle('open',state.mapOpen);if(state.mapOpen)drawMap();}
  function drainAir(seconds){if(state.air===Infinity)return;state.air=Math.max(0,state.air-Math.max(0,seconds));state.airEndsAt=Date.now()+state.air*1000;}
  function toggleDive(){
    if(!active)return;
    if(state.underwater){state.underwater=false;closeCave();msg('Ты всплыл на поверхность.');save();return;}
    const b=bridge();state.helmetLevel=b?.getWaterHelmetLevel?.()||0;
    if(!state.helmetLevel){msg('Без водяного шлема нельзя погружаться. Создай его на верстаке.');return;}
    state.underwater=true;state.air=state.helmetLevel>=4?Infinity:(state.helmetLevel===3?480:(state.helmetLevel===2?240:60));state.airEndsAt=state.air===Infinity?Infinity:Date.now()+state.air*1000;
    msg(state.helmetLevel>=4?'Шлем четвёртого уровня: запас воздуха больше не ограничен.':'Погружение! Запас воздуха: '+state.air+' секунд.');save();
  }
  function upgradeShip(){
    if(!active)return false;
    if(state.x>24){msg('Улучшать корабль можно только у берега. Вернись к причалу.');return false;}
    if(state.shipLevel>=3){msg('Корабль уже полностью улучшен: корпус и паруса максимального уровня.');return false;}
    const plans=[
      {items:{Древесина:20,Железо:10,Медь:3},gold:40,name:'Усиленный корпус'},
      {items:{Древесина:35,Железо:20,Медь:8,Кристалл:2},gold:100,name:'Паруса дальнего плавания'},
      {items:{Древесина:50,Железо:35,Медь:15,Кристалл:6,Мифрил:2},gold:250,name:'Броня морского титана'}
    ];
    const plan=plans[state.shipLevel],b=bridge();
    if(!b||!Object.entries(plan.items).every(([name,count])=>(Number(b.getItemCount?.(name))||0)>=count)||Number(b.getGold?.()||0)<plan.gold){
      msg('Не хватает ресурсов: '+Object.entries(plan.items).map(([n,c])=>n+' ×'+c).join(', ')+' и '+plan.gold+' золота.');return false;
    }
    const spent=[];
    for(const [name,count] of Object.entries(plan.items)){
      if(!b.spendItem?.(name,count)){
        for(const [item,amount] of spent)b.addItem?.(item,amount,'Возврат ресурсов: улучшение корабля отменено');
        msg('Не удалось списать материалы. Ресурсы возвращены.');return false;
      }
      spent.push([name,count]);
    }
    if(!b.spendGold?.(plan.gold)){
      for(const [item,amount] of spent)b.addItem?.(item,amount,'Возврат ресурсов: улучшение корабля отменено');
      msg('Не удалось списать золото. Материалы возвращены.');return false;
    }
    const oldMax=boatMaxHp();state.shipLevel++;state.boatHp=clamp(state.boatHp+(boatMaxHp()-oldMax),0,boatMaxHp());
    msg('Корабль улучшен · уровень '+state.shipLevel+'/3 · '+plan.name+'. Прочность '+Math.ceil(state.boatHp)+'/'+boatMaxHp()+'.');
    save();b.save?.();updateShipButton();return true;
  }
  function updateShipButton(){
    const button=$('sea-ship-upgrade');if(!button)return;
    const names=['Плот · ур. 0/3','Усиленный корпус · ур. 1/3','Дальние паруса · ур. 2/3','Морской титан · ур. 3/3'];
    button.textContent='⚓ '+names[clamp(Math.floor(Number(state.shipLevel)||0),0,3)];
    button.title=state.shipLevel>=3?'Корабль полностью улучшен.':'Улучшение доступно у берега · нажми, чтобы посмотреть стоимость.';
    button.disabled=state.shipLevel>=3;
  }
  function renderCave(){
    const content=$('sea-cave-content');if(!content)return;
    const cave=state.cave=ensureCaveState(state.cave);
    if(cave.finished){content.innerHTML='<b>🏆 Грот очищен!</b><p>Морской титан побеждён. Все три комнаты пройдены, реликвия и Око бездны уже в инвентаре.</p><p>Прогресс сохранён в этом мире. Можешь возвращаться сюда в любое время.</p>';return;}
    const def=caveRoom();
    if(cave.enemyMaxHp<=0){cave.enemyMaxHp=def.hp;cave.enemyHp=def.hp;}
    const hp=Math.max(0,Math.min(cave.enemyMaxHp,cave.enemyHp));
    content.innerHTML='<b>Комната '+cave.room+' / 3 · '+def.name+'</b><p>Противник: <b>'+def.enemy+'</b></p><div class="cave-hp"><i style="width:'+Math.max(0,hp/cave.enemyMaxHp*100)+'%"></i></div><p>Здоровье противника: '+Math.ceil(hp)+' / '+cave.enemyMaxHp+' HP</p><p>Награда за победу: '+def.loot.map(([name,count])=>name+' ×'+count).join(', ')+'</p><p>Твои удары наносят '+Math.max(1,Math.floor(Number(bridge()?.getWeaponDamage?.())||20))+' урона. Каждый ответный удар врага снимает '+def.damage+' HP.</p>';
  }
  function enterCave(){
    if(!active)return false;
    if(!state.underwater){msg('Для входа нужен водяной шлем и погружение.');return false;}
    if(!caveNear()){msg('Подводный грот находится у координат 309 / 214. Найди светящуюся арку на дне.');return false;}
    state.cave=ensureCaveState(state.cave);caveOpen=true;
    $('sea-map').classList.remove('open');$('sea-vault').classList.remove('open');$('sea-cave').classList.add('open');
    renderCave();save();return true;
  }
  function closeCave(){caveOpen=false;const panel=$('sea-cave');if(panel)panel.classList.remove('open');}
  function attackCave(){
    if(!caveOpen||!state.underwater||!active){msg('Подводная экспедиция не активна.');return false;}
    const cave=state.cave=ensureCaveState(state.cave);if(cave.finished)return false;
    const def=caveRoom();if(cave.enemyMaxHp<=0){cave.enemyMaxHp=def.hp;cave.enemyHp=def.hp;}
    const damage=Math.max(1,Math.floor(Number(bridge()?.getWeaponDamage?.())||20));
    cave.enemyHp=Math.max(0,cave.enemyHp-damage);
    if(cave.enemyHp<=0){
      cave.cleared=Array.from(new Set(cave.cleared.concat([cave.room])));
      for(const [name,count] of def.loot)bridge()?.addItem?.(name,count,'Награда за комнату подводного грота');
      if(cave.room===3){cave.finished=true;bridge()?.addGold?.(12000);msg('Морской титан повержен! Ты забрал древнюю реликвию и Око бездны.');}
      else{msg('Побеждён '+def.enemy+'! Комната '+cave.room+' очищена.');cave.room++;cave.enemyHp=0;cave.enemyMaxHp=0;}
      bridge()?.save?.();save();renderCave();return true;
    }
    bridge()?.damagePlayer?.(def.damage);drainAir(4);bridge()?.save?.();save();renderCave();return true;
  }
  function interact(){
    if(state.underwater){if(caveNear()){enterCave();return;}const t=nearestTreasure();if(t){openTreasure(t);return;}msg('Осмотри дно рядом: здесь пока ничего нет.');return;}
    const t=nearestTreasure();if(t){openTreasure(t);return;}
    const b=bridge();if(state.x<=12&&state.boatHp<boatMaxHp()){if((b?.getItemCount?.('Древесина')||0)<8||(b?.getItemCount?.('Железо')||0)<2){msg('Для ремонта у берега нужно 8 древесины и 2 железа.');return;}b.changeItem('Древесина',-8);b.changeItem('Железо',-2);state.boatHp=Math.min(boatMaxHp(),state.boatHp+45);msg('Корабль отремонтирован у берега. Прочность '+state.boatHp+'%.');save();b.save?.();return;} if(state.boatHp<=0){msg('Корабль разрушен. Вернись на берег и отремонтируй его.');return;}
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
    const boost=keys.has(' ')?2.0:1, speed=(state.underwater?9:state.weather==='storm'?15:25)*boost*(state.underwater?1:1+state.shipLevel*.12);
    state.x=clamp(state.x+dx*speed*dt,2,W-2);state.y=clamp(state.y+dy*speed*dt,2,H-2);
    if(dx||dy){const cell=Math.floor(state.x)+','+Math.floor(state.y);if(!state.discovered.includes(cell)&&state.discovered.length<5000)state.discovered.push(cell);}
    state.diveCooldown=Math.max(0,state.diveCooldown-dt);
    if(state.underwater&&state.air!==Infinity){state.air=Math.max(0,((Number(state.airEndsAt)||Date.now())-Date.now())/1000);if(state.air<=0){state.underwater=false;closeCave();msg('Воздух закончился! Тебя вынесло на поверхность.');}}
    if(state.weather==='storm'&&!state.underwater&&Math.random()<dt*.06){state.boatHp=Math.max(0,state.boatHp-Math.max(.5,1-state.shipLevel*.18));if(state.boatHp<=0)msg('Шторм разбил корабль! Вернись на берег.');}
    for(const s of state.sharks){const vx=state.x-s.x,vy=state.y-s.y,d=Math.hypot(vx,vy)||1;if(d<24){s.x+=vx/d*s.speed*dt;s.y+=vy/d*s.speed*dt;s.cool-=dt;if(s.cool<=0){s.cool=2.2;state.boatHp=Math.max(0,state.boatHp-Math.max(1,5-state.shipLevel));msg('Акула укусила корабль! Прочность '+state.boatHp+'%.');}}else{s.angle+=rand(-.6,.6)*dt;s.x+=Math.cos(s.angle)*s.speed*.25*dt;s.y+=Math.sin(s.angle)*s.speed*.25*dt;}s.x=clamp(s.x,2,W-2);s.y=clamp(s.y,2,H-2);}
    if(state.underwater){for(const m of state.monsters){const vx=state.x-m.x,vy=state.y-m.y,d=Math.hypot(vx,vy)||1;if(d<20){m.x+=vx/d*m.speed*dt;m.y+=vy/d*m.speed*dt;if(Math.random()<dt*.08){drainAir(3);msg('Подводный страж атакует!');}}}}
    if(!state.underwater){state.sharkSpawnTimer=(state.sharkSpawnTimer||rand(85,145))-dt;if(state.sharkSpawnTimer<=0){if(state.sharks.length<3&&Math.random()<.32)spawnShark();state.sharkSpawnTimer=rand(85,165);}}
    $('sea-cave-btn').disabled=!(state.underwater&&caveNear());$('sea-cave-btn').title=state.underwater?(caveNear()?'Войти в подводный грот':'Найди светящийся вход в грот у координат 309 / 214'):'Нужно погрузиться с водяным шлемом и доплыть до координат 309 / 214.';
    $('sea-weather').textContent='Погода: '+({calm:'штиль',rain:'дождь',storm:'ШТОРМ'}[state.weather]);
    $('sea-boat-hp').textContent='Корабль: '+Math.ceil(state.boatHp)+'/'+boatMaxHp();updateShipButton();$('sea-air').textContent=state.underwater?'Воздух: '+(state.air===Infinity?'∞':Math.ceil(state.air)+' с'):'Воздух: —';
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
    // Treasure chests and shipwrecks.
    for(const t of state.treasures){if(state.opened.includes(t.id))continue;const x=t.x*TILE,y=t.y*TILE;if(t.kind==='wreck'){ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.fillStyle='#513c2b';ctx.fillRect(-29,-7,58,15);ctx.fillStyle='#986b43';ctx.fillRect(-23,-14,46,8);ctx.strokeStyle='#d0a16a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-17,-12);ctx.lineTo(-8,-28);ctx.moveTo(8,-12);ctx.lineTo(21,-22);ctx.stroke();ctx.restore();}else{ctx.fillStyle='#62452e';ctx.fillRect(x-10,y-8,20,16);ctx.fillStyle='#d8a94f';ctx.fillRect(x-10,y-8,20,5);ctx.fillStyle='#fff0a5';ctx.fillRect(x-2,y-7,4,6);}}
    // Sharks: animated bodies, tail, dorsal and pectoral fins.
    for(const s of state.sharks){const x=s.x*TILE,y=s.y*TILE,swim=Math.sin(state.time*5+(s.angle||0))*3;ctx.save();ctx.translate(x,y);ctx.scale(1.55,1.55);ctx.rotate((s.angle||0)+(Math.atan2(state.y-s.y,state.x-s.x)*.12));ctx.fillStyle='rgba(0,18,35,.24)';ctx.beginPath();ctx.ellipse(0,9,22,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#719db0';ctx.beginPath();ctx.moveTo(25,0);ctx.quadraticCurveTo(5,-14,-18,-4);ctx.quadraticCurveTo(-26,0,-18,5);ctx.quadraticCurveTo(5,14,25,0);ctx.fill();ctx.fillStyle='#456f86';ctx.beginPath();ctx.moveTo(-17,0);ctx.lineTo(-34,-12+swim);ctx.lineTo(-29,0);ctx.lineTo(-34,12+swim);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-2,-5);ctx.lineTo(4,-18);ctx.lineTo(11,-4);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(1,5);ctx.lineTo(10,14);ctx.lineTo(13,5);ctx.closePath();ctx.fill();ctx.fillStyle='#e8f5f8';ctx.fillRect(12,-3,3,3);ctx.fillStyle='#10283a';ctx.fillRect(13,-3,2,2);ctx.restore();}
    // Underwater guardians and schools of fish.
    for(const m of state.monsters){const x=m.x*TILE,y=m.y*TILE,pulse=Math.sin(state.time*4+x)*2;ctx.save();ctx.translate(x,y);ctx.fillStyle='rgba(8,19,48,.3)';ctx.beginPath();ctx.ellipse(0,9,17,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9368b4';ctx.beginPath();ctx.ellipse(0,0,12,10+pulse,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d5b5f3';ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(-18,-8);ctx.lineTo(-16,8);ctx.closePath();ctx.fill();ctx.fillStyle='#f6eaff';ctx.fillRect(-5,-3,3,3);ctx.fillRect(3,-3,3,3);ctx.restore();}
    for(let shoal=0;shoal<24;shoal++){const bx=(25+shoal*23%338)*TILE,by=(12+(shoal*31)%242)*TILE;if(bx/TILE<left-5||bx/TILE>right+5||by/TILE<top-5||by/TILE>bottom+5)continue;for(let f=0;f<5;f++){const fx=bx+Math.sin(state.time*1.5+f+shoal)*18+f*8,fy=by+Math.cos(state.time*1.7+f)*9;ctx.fillStyle='#d5eef0';ctx.beginPath();ctx.ellipse(fx,fy,5,2.5,.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7cc8cf';ctx.beginPath();ctx.moveTo(fx-4,fy);ctx.lineTo(fx-9,fy-4);ctx.lineTo(fx-9,fy+4);ctx.fill();}}
    if(state.underwater){    // A glowing stone arch marks the only entrance to the three-room underwater grotto.
    {const x=CAVE_ENTRANCE.x*TILE,y=CAVE_ENTRANCE.y*TILE,pulse=.5+.5*Math.sin(state.time*2.4);ctx.save();ctx.translate(x,y);ctx.fillStyle='#344c60';ctx.beginPath();ctx.moveTo(-35,24);ctx.lineTo(-30,-18);ctx.lineTo(-15,-37);ctx.lineTo(0,-43);ctx.lineTo(18,-34);ctx.lineTo(33,-12);ctx.lineTo(38,24);ctx.closePath();ctx.fill();ctx.fillStyle='#0a2845';ctx.beginPath();ctx.arc(0,5,22,Math.PI,0);ctx.lineTo(22,24);ctx.lineTo(-22,24);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(111,232,255,'+(.45+pulse*.5)+')';ctx.lineWidth=4;ctx.shadowColor='#62e7ff';ctx.shadowBlur=10+pulse*12;ctx.beginPath();ctx.arc(0,5,24,Math.PI,0);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#dcfbff';ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillText('ПОДВОДНЫЙ ГРОТ',0,43);ctx.restore();}
const glow=ctx.createRadialGradient(state.x*TILE,state.y*TILE,10,state.x*TILE,state.y*TILE,260);glow.addColorStop(0,'rgba(111,222,255,.3)');glow.addColorStop(1,'rgba(0,15,50,.72)');ctx.fillStyle=glow;ctx.fillRect(left*TILE,top*TILE,(right-left)*TILE,(bottom-top)*TILE);}
    else{
      // Player's ship: hull, deck, mast, animated sails, rigging, lantern and wake.
      const x=state.x*TILE,y=state.y*TILE,rock=Math.sin(state.wave*.55)*.06;ctx.save();ctx.translate(x,y+Math.sin(state.wave)*2);ctx.rotate(rock);ctx.scale(1.28+state.shipLevel*.05,1.28+state.shipLevel*.05);ctx.fillStyle='rgba(0,12,27,.38)';ctx.beginPath();ctx.ellipse(0,17,39,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=['#543622','#66513a','#66737e','#4c526d'][state.shipLevel]||'#543622';ctx.beginPath();ctx.moveTo(-38,-10);ctx.lineTo(38,-10);ctx.lineTo(27,19);ctx.lineTo(-26,19);ctx.closePath();ctx.fill();ctx.fillStyle=['#a66e3d','#b27e4c','#9baeb7','#b0a0d1'][state.shipLevel]||'#a66e3d';ctx.fillRect(-30,-9,60,8);ctx.fillStyle='#d5b17a';ctx.fillRect(-21,-2,42,13);ctx.fillStyle='#5a402d';ctx.fillRect(-3,-43,6,43);ctx.strokeStyle='#e5d2aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-38);ctx.lineTo(-25,-29);ctx.moveTo(0,-38);ctx.lineTo(27,-26);ctx.stroke();ctx.fillStyle='#fff0c9';ctx.beginPath();ctx.moveTo(-1,-39);ctx.lineTo(-1,-9);ctx.lineTo(-27,-9);ctx.closePath();ctx.fill();ctx.fillStyle='#bfeaf0';ctx.beginPath();ctx.moveTo(2,-36);ctx.lineTo(2,-10);ctx.lineTo(24,-10);ctx.closePath();ctx.fill();ctx.fillStyle='#ffdc8a';ctx.beginPath();ctx.arc(14,4,3,0,Math.PI*2);ctx.fill();
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
    const c=$('sea-map-canvas');if(!c)return;const r=c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);const w=r.width,h=r.height;x.fillStyle='#0b4567';x.fillRect(0,0,w,h);x.strokeStyle='rgba(190,235,255,.12)';for(let i=0;i<=22;i++){x.beginPath();x.moveTo(i*w/22,0);x.lineTo(i*w/22,h);x.stroke();}for(let i=0;i<=16;i++){x.beginPath();x.moveTo(0,i*h/16);x.lineTo(w,i*h/16);x.stroke();}x.fillStyle='#e9f5ff';for(const cell of state.discovered){const [a,b]=cell.split(',').map(Number);x.fillRect(a/360*w,b/260*h,2,2);}x.fillStyle='#ffe17c';for(const m of state.mapMarks)x.fillRect(m.x/360*w-4,m.y/260*h-4,8,8);x.fillStyle='#ff756a';x.beginPath();x.arc(state.x/360*w,state.y/260*h,5,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.font='12px Segoe UI';x.fillText('Ты',state.x/360*w+8,state.y/260*h-8);x.fillStyle='#7df2ff';x.beginPath();x.arc(CAVE_ENTRANCE.x/360*w,CAVE_ENTRANCE.y/260*h,6,0,Math.PI*2);x.fill();x.fillStyle='#e8fbff';x.fillText('Грот',CAVE_ENTRANCE.x/360*w+9,CAVE_ENTRANCE.y/260*h-6);
  }
  function api(){return {open:enter,isOpen:()=>active,save,upgradeShip,enterCave,attackCave,closeCave,getState:()=>JSON.parse(JSON.stringify(state))};}
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