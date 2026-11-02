(() => {
  'use strict';
  const VERSION = 1;
  const KEY = () => 'skyrealm_sea_v1_' + (window.SkyRealmSeaBridge?.getWorldId?.() || 'default');
  const $ = (id) => document.getElementById(id);
  const state = {
    version: VERSION, x: 8, y: 82, boatHp: 100, weather: 'calm', weatherLeft: 150,
    wave: 0, time: 0, mapOpen: false, underwater: false, air: 60,
    helmetLevel: 0, sharks: [], monsters: [], treasures: [], opened: [],
    vaultUnlocked: false, vaultRoom: 0, vaultPath: 0, vaultBosses: { tide:false, abyss:false },
    relics: [], discovered: [], message: '', messageLeft: 0, lastSave: 0,
    chartFound: false, bossHp: 0, bossAttack: 0, stormDamageAt: 0,
    diveCooldown: 0, mapMarks: []
  };
  const DEFAULT_STATE=JSON.parse(JSON.stringify(state));
  const W = 220, H = 164, TILE = 32;
  let root, canvas, ctx, raf = 0, last = 0, keys = new Set(), active = false;
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const bridge = () => window.SkyRealmSeaBridge;
  const msg = (s) => { state.message=s; state.messageLeft=4.5; const el=$('sea-message'); if(el)el.textContent=s; };
  function save(){
    try { const snapshot={...state, sharks:state.sharks.slice(0,40), monsters:state.monsters.slice(0,40), discovered:state.discovered.slice(-5000)};localStorage.setItem(KEY(), JSON.stringify(snapshot));bridge()?.setSeaData?.(snapshot); }
    catch(e){ console.warn('Sea save failed',e); }
  }
  function load(){
    try {
      const d=bridge()?.getSeaData?.()||JSON.parse(localStorage.getItem(KEY())||'null');
      if(!d || d.version!==VERSION){Object.assign(state,JSON.parse(JSON.stringify(DEFAULT_STATE)));return;}
      Object.assign(state,d);
      state.x=clamp(Number(state.x)||8,3,W-3); state.y=clamp(Number(state.y)||82,3,H-3);
      state.sharks=Array.isArray(d.sharks)?d.sharks:[]; state.monsters=Array.isArray(d.monsters)?d.monsters:[];
      state.treasures=Array.isArray(d.treasures)?d.treasures:[]; state.opened=Array.isArray(d.opened)?d.opened:[];
      state.relics=Array.isArray(d.relics)?d.relics:[];
    } catch(e){ console.warn('Sea save load failed',e); }
  }
  function ensureWorld(){
    if(state.treasures.length) return;
    for(let i=0;i<18;i++) state.treasures.push({id:'chest-'+i,x:rand(18,W-12),y:rand(8,H-8),kind:i%6===0?'wreck':'chest'});
    state.sharks=Array.from({length:9},(_,i)=>({id:'shark-'+i,x:rand(10,W-10),y:rand(8,H-8),hp:55,angle:rand(0,6.28),speed:rand(12,22),cool:rand(0,2)}));
    state.monsters=Array.from({length:8},(_,i)=>({id:'sea-monster-'+i,x:rand(20,W-10),y:rand(8,H-8),hp:75,angle:rand(0,6.28),speed:rand(8,15),cool:rand(0,2)}));
    state.discovered=[];
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
      #sea-vault{position:absolute;inset:8% 10%;display:none;background:#10182bf5;border:1px solid #aa9cce;border-radius:14px;padding:18px;overflow:auto}
      #sea-vault.open{display:block}#sea-vault h2{margin:0 0 8px;color:#e5d6ff}#sea-vault .vault-paths{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      #sea-vault .vault-paths button{flex:1;min-width:140px}#sea-vault .vault-log{padding:12px;background:#080f1e;border-radius:8px;min-height:90px;line-height:1.7}
      @media(max-width:700px){#skyrealm-sea .sea-help{font-size:10px;max-width:90%}#skyrealm-sea .sea-top{gap:6px;padding:7px}#skyrealm-sea .sea-stat{font-size:10px}}
      </style>
      <div class="sea-top"><span class="sea-title">🌊 SKYREALM · МОРЕ</span><span class="sea-stat" id="sea-weather">Погода: штиль</span><span class="sea-stat" id="sea-boat-hp">Корабль: 100%</span><span class="sea-stat" id="sea-air">Воздух: —</span><span class="sea-stat" id="sea-coords">Координаты: 90 / 82</span><button id="sea-map-btn">🗺 Карта</button><button id="sea-dive-btn">↓ Нырнуть · E</button><button id="sea-vault-btn">🏛 Сокровищница</button><button id="sea-exit">Вернуться на берег</button></div>
      <div class="sea-stage"><canvas id="sea-canvas"></canvas><div id="sea-message">Море ждёт тебя. Найди карту сокровищ!</div>
      <div class="sea-help">WASD / стрелки — управлять кораблём · E — взаимодействовать / нырять · M — карта · Space — ускорение<br>В шторм волны повреждают корабль. Акулы преследуют лодку. Для долгого погружения нужен водяной шлем.</div>
      <div id="sea-map"><h2>🗺 Морская карта · 220 × 164</h2><p>Туман скрывает неизведанные воды. Найди обломки кораблей и карты сокровищ.</p><canvas id="sea-map-canvas"></canvas><button id="sea-map-close">Закрыть карту</button></div>
      <div id="sea-vault"><h2>🏛 Великая сокровищница глубин</h2><p>Подводный лабиринт с несколькими путями. Внутри находятся ровно два бога моря.</p><div class="vault-paths"><button data-path="0">Путь затонувших стражей</button><button data-path="1">Коралловые катакомбы</button><button data-path="2">Бездна древних</button></div><div class="vault-log" id="vault-log">Перед входом подготовь водяной шлем. В каждом пути есть монстры и ловушки.</div><div class="vault-paths"><button id="vault-enter">Войти в выбранный путь</button><button id="vault-fight" disabled>Сразиться с боссом</button><button id="vault-exit">Выйти из сокровищницы</button></div></div>
      </div>`;
    document.body.appendChild(root);const pauseLock=document.createElement('div');pauseLock.className='shade';pauseLock.id='sea-pause-lock';pauseLock.hidden=true;document.body.appendChild(pauseLock);canvas=$('sea-canvas');ctx=canvas.getContext('2d');
    $('sea-exit').onclick=leave; $('sea-map-btn').onclick=toggleMap; $('sea-map-close').onclick=toggleMap;
    $('sea-dive-btn').onclick=toggleDive; $('sea-vault-btn').onclick=()=>{ $('sea-vault').classList.add('open'); $('sea-map').classList.remove('open'); };
    $('vault-exit').onclick=()=> $('sea-vault').classList.remove('open');
    $('vault-enter').onclick=enterVault; $('vault-fight').onclick=fightVaultBoss;
    root.querySelectorAll('[data-path]').forEach(b=>b.onclick=()=>{state.vaultPath=Number(b.dataset.path);$('vault-log').textContent=['Путь затонувших стражей: тяжёлые рыцари охраняют проход.','Коралловые катакомбы: ядовитые медузы и ловушки.','Бездна древних: сильнейшие монстры и два алтаря богов.'][state.vaultPath];});
    window.addEventListener('keydown',onKey,true); window.addEventListener('keyup',onUp,true); window.addEventListener('blur',()=>keys.clear());
    window.addEventListener('resize',resize); resize();
  }
  function resize(){if(!canvas)return;const r=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(r.width*d));canvas.height=Math.max(1,Math.floor(r.height*d));ctx.setTransform(d,0,0,d,0,0);}
  function onKey(e){if(!active)return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','m','e','escape'].includes(k)){e.preventDefault();e.stopPropagation();}keys.add(k);if(k==='m')toggleMap();if(k==='e'){if(state.underwater)toggleDive();else interact();}if(k==='escape'){if($('sea-vault').classList.contains('open'))$('sea-vault').classList.remove('open');else if(state.mapOpen)toggleMap();else leave();}}
  function onUp(e){keys.delete(e.key.toLowerCase());}
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
    state.underwater=true;state.air=state.helmetLevel>=4?Infinity:(state.helmetLevel===3?480:(state.helmetLevel===2?240:60));state.airEndsAt=state.air===Infinity?Infinity:Date.now()+state.air*1000;
    msg(state.helmetLevel>=4?'Шлем четвёртого уровня: запас воздуха больше не ограничен.':'Погружение! Запас воздуха: '+state.air+' секунд.');save();
  }
  function interact(){
    if(state.underwater){const t=nearestTreasure();if(t){openTreasure(t);return;}msg('Осмотри дно рядом: здесь пока ничего нет.');return;}
    const t=nearestTreasure();if(t){openTreasure(t);return;}
    const b=bridge();if(state.x<=12&&state.boatHp<100){if((b?.getItemCount?.('Древесина')||0)<8||(b?.getItemCount?.('Железо')||0)<2){msg('Для ремонта у берега нужно 8 древесины и 2 железа.');return;}b.changeItem('Древесина',-8);b.changeItem('Железо',-2);state.boatHp=Math.min(100,state.boatHp+45);msg('Корабль отремонтирован у берега. Прочность '+state.boatHp+'%.');save();b.save?.();return;} if(state.boatHp<=0){msg('Корабль разрушен. Вернись на берег и отремонтируй его.');return;}
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
      if(state.bossHp<=0){state.bossHp=1800;$('vault-log').textContent='БОГ №1: НЕПТУН РАЗЛОМА · 1800 здоровья. Нажимай «Атаковать босса», чтобы сражаться.';msg('Пробуждается первый бог моря!');}
      else {state.bossHp=Math.max(0,state.bossHp-260);if(state.air!==Infinity)drainAir(7);$('vault-log').textContent='Нептун Разлома · здоровье: '+state.bossHp+'/1800. Бог отвечает приливным ударом.';}
      if(state.bossHp===0){state.vaultBosses.tide=true;b?.addItem?.('Сердце прилива',1,'Уникальный трофей первого бога моря. Не создаётся на верстаке.');$('vault-log').textContent='Нептун Разлома повержен! Выпало Сердце прилива. В глубине пробуждается второй бог.';msg('Первый бог моря повержен!');}
    }else if(!state.vaultBosses.abyss){
      if(state.bossHp<=0){state.bossHp=2600;$('vault-log').textContent='БОГ №2: ЛЕВИАФАН БЕЗДНЫ · 2600 здоровья. Это последний бог моря.';msg('Пробуждается второй бог моря!');}
      else {state.bossHp=Math.max(0,state.bossHp-260);if(state.air!==Infinity)drainAir(10);$('vault-log').textContent='Левиафан Бездны · здоровье: '+state.bossHp+'/2600. Удар бездны отнимает воздух.';}
      if(state.bossHp===0){state.vaultBosses.abyss=true;b?.addItem?.('Око бездны',1,'Уникальный трофей второго бога моря. Не создаётся на верстаке.');b?.addItem?.('Ключ великой сокровищницы',1);$('vault-log').textContent='Левиафан Бездны повержен! Получен Ключ великой сокровищницы.';msg('Второй и последний бог моря повержен!');}
    }else if(!state.vaultUnlocked){
      state.vaultUnlocked=true;b?.addItem?.('Корона двух морей',1,'Уникальная награда за победу над двумя богами.');b?.addItem?.('Реликвия древних глубин',1,'Нельзя создать на верстаке.');$('vault-log').textContent='Открыта главная сокровищница! Получены Корона двух морей и Реликвия древних глубин.';msg('Великая сокровищница открыта!');
    }else{$('vault-log').textContent='Оба бога повержены, главная сокровищница уже разграблена.';}
    save();b?.save?.();
  }
  function spawnShark(){if(state.sharks.length<18)state.sharks.push({id:'shark-'+Date.now(),x:clamp(state.x+rand(-18,18),3,W-3),y:clamp(state.y+rand(-18,18),3,H-3),hp:55,angle:rand(0,6.28),speed:rand(12,24),cool:1});}
  function frame(now){
    if(!active)return;const dt=Math.min(.04,(now-last)/1000);last=now;state.time+=dt;state.wave+=dt*2;
    update(dt);draw();if(state.messageLeft>0){state.messageLeft-=dt;if(state.messageLeft<=0)$('sea-message').textContent='';}
    if(now-state.lastSave>5000){state.lastSave=now;save();}
    raf=requestAnimationFrame(frame);
  }
  function update(dt){
    state.weatherLeft-=dt;if(state.weatherLeft<=0){state.weather=['calm','rain','storm'][Math.floor(Math.random()*3)];state.weatherLeft=rand(100,220);msg({calm:'Ветер стих. Море спокойно.',rain:'Начался дождь. Волны усиливаются.',storm:'ШТОРМ! Укройся или держи курс против волн.'}[state.weather]);}
    const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    const boost=keys.has(' ')?1.6:1, speed=(state.underwater?7:state.weather==='storm'?10:16)*boost;
    state.x=clamp(state.x+dx*speed*dt,2,W-2);state.y=clamp(state.y+dy*speed*dt,2,H-2);
    if(dx||dy){const cell=Math.floor(state.x)+','+Math.floor(state.y);if(!state.discovered.includes(cell)&&state.discovered.length<5000)state.discovered.push(cell);}
    state.diveCooldown=Math.max(0,state.diveCooldown-dt);
    if(state.underwater&&state.air!==Infinity){state.air=Math.max(0,((Number(state.airEndsAt)||Date.now())-Date.now())/1000);if(state.air<=0){state.underwater=false;msg('Воздух закончился! Тебя вынесло на поверхность.');}}
    if(state.weather==='storm'&&!state.underwater&&Math.random()<dt*.06){state.boatHp=Math.max(0,state.boatHp-1);if(state.boatHp<=0)msg('Шторм разбил корабль! Вернись на берег.');}
    for(const s of state.sharks){const vx=state.x-s.x,vy=state.y-s.y,d=Math.hypot(vx,vy)||1;if(d<24){s.x+=vx/d*s.speed*dt;s.y+=vy/d*s.speed*dt;s.cool-=dt;if(s.cool<=0){s.cool=2.2;state.boatHp=Math.max(0,state.boatHp-5);msg('Акула укусила корабль! Прочность '+state.boatHp+'%.');}}else{s.angle+=rand(-.6,.6)*dt;s.x+=Math.cos(s.angle)*s.speed*.25*dt;s.y+=Math.sin(s.angle)*s.speed*.25*dt;}s.x=clamp(s.x,2,W-2);s.y=clamp(s.y,2,H-2);}
    if(state.underwater){for(const m of state.monsters){const vx=state.x-m.x,vy=state.y-m.y,d=Math.hypot(vx,vy)||1;if(d<20){m.x+=vx/d*m.speed*dt;m.y+=vy/d*m.speed*dt;if(Math.random()<dt*.08){drainAir(3);msg('Подводный страж атакует!');}}}}
    if(state.weather==='storm'&&Math.random()<dt*.04)spawnShark();
    $('sea-weather').textContent='Погода: '+({calm:'штиль',rain:'дождь',storm:'ШТОРМ'}[state.weather]);
    $('sea-boat-hp').textContent='Корабль: '+state.boatHp+'%';$('sea-air').textContent=state.underwater?'Воздух: '+(state.air===Infinity?'∞':Math.ceil(state.air)+' с'):'Воздух: —';
    $('sea-coords').textContent='Координаты: '+Math.floor(state.x)+' / '+Math.floor(state.y);
    $('sea-dive-btn').textContent=state.underwater?'↑ Всплыть · E':'↓ Нырнуть · E';
  }
  function draw(){
    const w=canvas.clientWidth,h=canvas.clientHeight;const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#246b91');g.addColorStop(.55,'#0e496f');g.addColorStop(1,'#082a48');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const horizon=h*.17;ctx.fillStyle='#8ed8e9';ctx.fillRect(0,horizon,w,3);ctx.fillStyle='#c2f1ff';ctx.globalAlpha=.18;ctx.fillRect(0,horizon-36,w,36);ctx.globalAlpha=1;
    const scale=Math.min(w/(W*.7),h/(H*.7)),ox=w/2-state.x*scale,oy=h/2-state.y*scale;
    ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    ctx.fillStyle='#bca36b';ctx.fillRect(0,0,8*32,H*32);ctx.fillStyle='#d9c58d';ctx.fillRect(6*32,0,2*32,H*32);
    for(let x=Math.floor(state.x-w/scale/2)-2;x<state.x+w/scale/2+2;x+=1){for(let y=Math.floor(state.y-h/scale/2)-2;y<state.y+h/scale/2+2;y+=1){const wave=Math.sin(x*.47+state.wave)*.12+Math.cos(y*.38-state.wave*.7)*.08;ctx.fillStyle=state.weather==='storm'?'rgba(205,232,244,'+(0.04+Math.abs(wave)) +')':'rgba(150,226,245,'+(0.035+Math.abs(wave))+')';ctx.fillRect(x*32,y*32,32,32);}}
    for(const t of state.treasures){if(state.opened.includes(t.id))continue;ctx.fillStyle=t.kind==='wreck'?'#b88c54':'#e5c46b';ctx.fillRect(t.x*32-9,t.y*32-7,18,14);ctx.fillStyle='#563d2b';ctx.fillRect(t.x*32-9,t.y*32-1,18,3);ctx.fillStyle='#fff0a5';ctx.fillRect(t.x*32-2,t.y*32-7,4,4);}
    for(const s of state.sharks){ctx.fillStyle='#6e9fb4';ctx.beginPath();ctx.moveTo(s.x*32+12,s.y*32);ctx.lineTo(s.x*32-10,s.y*32-7);ctx.lineTo(s.x*32-5,s.y*32);ctx.lineTo(s.x*32-10,s.y*32+7);ctx.closePath();ctx.fill();}
    for(const m of state.monsters){ctx.fillStyle='#9b6dbb';ctx.beginPath();ctx.arc(m.x*32,m.y*32,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f3d5ff';ctx.fillRect(m.x*32-4,m.y*32-2,3,3);ctx.fillRect(m.x*32+2,m.y*32-2,3,3);}
    if(state.underwater){ctx.fillStyle='rgba(0,15,50,.38)';ctx.fillRect(state.x*32-70,state.y*32-70,140,140);}
    else{ctx.save();ctx.translate(state.x*32,state.y*32);ctx.rotate(Math.sin(state.wave)*.035);ctx.fillStyle='#593e29';ctx.beginPath();ctx.moveTo(-23,-10);ctx.lineTo(23,-10);ctx.lineTo(17,17);ctx.lineTo(-17,17);ctx.closePath();ctx.fill();ctx.fillStyle='#d2a66c';ctx.fillRect(-3,-8,6,22);ctx.fillStyle='#fff0cb';ctx.beginPath();ctx.moveTo(2,-7);ctx.lineTo(2,-38);ctx.lineTo(24,-10);ctx.closePath();ctx.fill();ctx.restore();}
    if(state.weather==='storm'){ctx.strokeStyle='rgba(220,240,255,.38)';ctx.lineWidth=1.3;for(let i=0;i<60;i++){const x=(i*79+state.time*260)%(W*32),y=(i*43+state.time*430)%(H*32);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+19);ctx.stroke();}}
    ctx.restore();
    if(!state.underwater){ctx.fillStyle='rgba(3,18,33,.7)';ctx.fillRect(12,12,220,32);ctx.fillStyle='#e7f6ff';ctx.font='bold 13px Segoe UI';ctx.fillText('ГОРИЗОНТ · МОРСКАЯ ЭКСПЕДИЦИЯ',22,33);}
    else{ctx.fillStyle='rgba(2,12,35,.7)';ctx.fillRect(12,12,250,32);ctx.fillStyle='#d8f4ff';ctx.font='bold 13px Segoe UI';ctx.fillText('ПОД ВОДОЙ · '+(state.air===Infinity?'ВОЗДУХ ∞':Math.ceil(state.air)+' С'),22,33);}
  }
  function drawMap(){
    const c=$('sea-map-canvas');if(!c)return;const r=c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);const w=r.width,h=r.height;x.fillStyle='#0b4567';x.fillRect(0,0,w,h);x.strokeStyle='rgba(190,235,255,.12)';for(let i=0;i<=22;i++){x.beginPath();x.moveTo(i*w/22,0);x.lineTo(i*w/22,h);x.stroke();}for(let i=0;i<=16;i++){x.beginPath();x.moveTo(0,i*h/16);x.lineTo(w,i*h/16);x.stroke();}x.fillStyle='#e9f5ff';for(const cell of state.discovered){const [a,b]=cell.split(',').map(Number);x.fillRect(a/220*w,b/164*h,2,2);}x.fillStyle='#ffe17c';for(const m of state.mapMarks)x.fillRect(m.x/220*w-4,m.y/164*h-4,8,8);x.fillStyle='#ff756a';x.beginPath();x.arc(state.x/220*w,state.y/164*h,5,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.font='12px Segoe UI';x.fillText('Ты',state.x/220*w+8,state.y/164*h-8);
  }
  function api(){return {open:enter,isOpen:()=>active,save};}
  window.SkyRealmSea=api();
  document.addEventListener('DOMContentLoaded',()=>{build();const b=document.createElement('button');b.type='button';b.id='open-sea-expedition';b.textContent='🌊 Морская экспедиция';b.style.cssText='position:fixed;right:16px;top:72px;z-index:40;display:none;background:#123b55;color:#eaf8ff;border:1px solid #5a9cbb;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer';b.onclick=enter;document.body.appendChild(b);setInterval(()=>{const live=!!bridge()?.getWorldId?.();b.style.display=live&&!active?'block':'none';},800);});
})();