(() => {
  'use strict';

  const VERSION = 1;
  const $ = id => document.getElementById(id);
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const clone = value => JSON.parse(JSON.stringify(value));
  const bridge = () => window.SkyRealmSeaBridge;
  const emptyState = () => ({
    version:VERSION,
    research:0,
    grid:{generators:0,batteries:0,turrets:0,guardposts:0,traps:0,walls:0,lamps:0,drills:0,shields:0},
    drillClock:0,
    power:0,
    fuelSeconds:0,
    fuelKind:'',
    generatorClock:0,
    turretClock:0,
    guardClock:0,
    trapClock:0,
    lastSiegeNight:-1,
    event:null,
    dungeon:{route:'flooded',room:1,active:false,entryPaid:false,cleared:[],enemyHp:0,enemyMaxHp:0,attacks:0},
    relics:[],
    equippedRelic:null,
    stats:{eventsWon:0,dungeonsCleared:0}
  });

  const state = emptyState();
  const RARITIES = [
    {name:'Обычная',weight:52,power:.035,defense:.012,color:'#c3cbd5'},
    {name:'Необычная',weight:27,power:.06,defense:.025,color:'#58c98b'},
    {name:'Редкая',weight:14,power:.095,defense:.04,color:'#58aaff'},
    {name:'Эпическая',weight:6,power:.15,defense:.065,color:'#b58aff'},
    {name:'Легендарная',weight:1,power:.24,defense:.11,color:'#f4ba56'}
  ];
  const RELIC_NAMES = ['Сердце титана','Линза древних','Печать стража','Осколок бурь','Звезда кузни','Кристалл глубин'];
  const BUILDINGS = {
    generator:{title:'Топливный генератор',icon:'⚡',cost:{Древесина:30,Камень:20,Железо:8,Медь:4},gold:15,limit:4},
    battery:{title:'Аккумулятор',icon:'🔋',cost:{Железо:8,Медь:6,Кристалл:1},gold:10,limit:12},
    lamp:{title:'Электрический фонарь',icon:'💡',cost:{Медь:3,Древесина:4},gold:2,limit:20},
    turret:{title:'Автоматическая турель',icon:'🎯',cost:{Железо:12,Медь:5,Древесина:8,Кристалл:2},gold:25,limit:8,research:1},
    guardpost:{title:'Казарма стражи · 2 наёмных защитника',icon:'🛡️',cost:{Древесина:18,Камень:12,Железо:10,Медь:3},gold:20,limit:6,research:1},
    trap:{title:'Электрическая ловушка',icon:'⚡',cost:{Камень:8,Железо:8,Медь:6,Кристалл:1},gold:15,limit:12,research:1},
    drill:{title:'Автоматический бур',icon:'⛏️',cost:{Железо:18,Медь:12,Кристалл:3,Мифрил:1},gold:60,limit:3,research:2},
    shield:{title:'Силовой защитный купол',icon:'🛡️',cost:{Железо:20,Медь:15,Кристалл:8,Мифрил:3},gold:100,limit:1,research:3},
    wall:{title:'Укреплённая стена',icon:'🧱',cost:{Камень:16,Древесина:8,Железо:2},gold:5,limit:30}
  };
  const DUNGEON_ROUTES = {
    flooded:{title:'Затопленные глубины',description:'Подводные руины, ядовитые ловушки и древние морские хранители.',rooms:[
      {name:'Затопленный вход',enemy:'Страж-пиявка',hp:180,damage:8,loot:'Кристалл'},
      {name:'Зал утопленников',enemy:'Утопший копейщик',hp:250,damage:11,loot:'Медь'},
      {name:'Коралловая галерея',enemy:'Коралловый страж',hp:350,damage:14,loot:'Железо'},
      {name:'Святилище прилива',enemy:'Жрец глубин',hp:480,damage:18,loot:'Древний осколок'},
      {name:'Бездна левиафана',enemy:'Левиафан руин',hp:940,damage:26,loot:'Сердце архонта'}
    ]},
    forge:{title:'Кузница титанов',description:'Жаркие шахты, раскалённые механизмы и тяжёлые големы.',rooms:[
      {name:'Шлаковый тоннель',enemy:'Шлаковый пёс',hp:210,damage:9,loot:'Уголь'},
      {name:'Литейный зал',enemy:'Медный голем',hp:290,damage:12,loot:'Медь'},
      {name:'Галерея кузнецов',enemy:'Железный центурион',hp:390,damage:15,loot:'Железо'},
      {name:'Сердце плавильни',enemy:'Магмовый алхимик',hp:520,damage:20,loot:'Мифрил'},
      {name:'Трон титана',enemy:'Титан-крушитель',hp:1020,damage:28,loot:'Сердце архонта'}
    ]},
    shadow:{title:'Теневой разлом',description:'Забытые коридоры, призрачные стрелки и магия пустоты.',rooms:[
      {name:'Коридор теней',enemy:'Ползучая тень',hp:190,damage:9,loot:'Теневая эссенция'},
      {name:'Костяной архив',enemy:'Костяной лучник',hp:280,damage:12,loot:'Кость'},
      {name:'Зал разлома',enemy:'Ведьма разлома',hp:400,damage:16,loot:'Кристалл'},
      {name:'Порог пустоты',enemy:'Рыцарь пустоты',hp:550,damage:21,loot:'Ядро духа'},
      {name:'Затмённый трон',enemy:'Владыка кошмаров',hp:980,damage:29,loot:'Сердце архонта'}
    ]}
  };
  function dungeonRooms(){return DUNGEON_ROUTES[state.dungeon.route]?.rooms||DUNGEON_ROUTES.flooded.rooms;}

  let root = null;
  let launchButton = null;
  let activeTab = 'power';
  let lastWorldId = '';
  let opened = false;

  function normalizeState(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return base;
    base.research = clamp(Math.floor(Number(raw.research)||0),0,3);
    for (const key of Object.keys(base.grid)) {
      base.grid[key] = clamp(Math.floor(Number(raw.grid?.[key])||0),0,key==='walls'?30:key==='lamps'?20:key==='turrets'?8:key==='guardposts'?6:key==='traps'?12:key==='batteries'?12:key==='drills'?3:key==='shields'?1:4);
    }
    base.power = clamp(Number(raw.power)||0,0,capacityFor(base));
    base.fuelSeconds = clamp(Number(raw.fuelSeconds)||0,0,3600);
    base.fuelKind = ['Уголь','Древесина'].includes(raw.fuelKind)?raw.fuelKind:'';
    base.generatorClock = clamp(Number(raw.generatorClock)||0,0,60);
    base.drillClock = clamp(Number(raw.drillClock)||0,0,120);
    base.turretClock = clamp(Number(raw.turretClock)||0,0,60);
    base.guardClock = clamp(Number(raw.guardClock)||0,0,60);
    base.trapClock = clamp(Number(raw.trapClock)||0,0,60);
    base.lastSiegeNight = Number.isInteger(raw.lastSiegeNight)?raw.lastSiegeNight:-1;
    if (raw.event && ['invasion','ancient'].includes(raw.event.kind)) {
      base.event = {
        kind:raw.event.kind,
        id:typeof raw.event.id==='string'?raw.event.id.slice(0,100):'legacy-event-'+String(raw.event.kind)+'-'+String(raw.event.day||0),
        engaged:raw.event.engaged===true,
        remaining:clamp(Math.floor(Number(raw.event.remaining)||0),0,30),
        hp:clamp(Number(raw.event.hp)||0,0,1000000),
        maxHp:clamp(Number(raw.event.maxHp)||0,0,1000000),
        x:Number.isFinite(raw.event.x)?clamp(raw.event.x,0,10000000):0,
        y:Number.isFinite(raw.event.y)?clamp(raw.event.y,0,10000000):0,
        timer:clamp(Number(raw.event.timer)||0,0,600),
        actions:clamp(Math.floor(Number(raw.event.actions)||0),0,10000),
        day:Math.max(0,Math.floor(Number(raw.event.day)||0))
      };
    }
    const dungeon = raw.dungeon && typeof raw.dungeon==='object'?raw.dungeon:{};
    base.dungeon = {
      route:['flooded','forge','shadow'].includes(dungeon.route)?dungeon.route:'flooded',
      room:clamp(Math.floor(Number(dungeon.room)||1),1,5),
      active:dungeon.active===true,
      entryPaid:dungeon.entryPaid===true,
      cleared:Array.isArray(dungeon.cleared)?Array.from(new Set(dungeon.cleared.filter(n=>Number.isInteger(n)&&n>=1&&n<=5))).slice(0,5):[],
      enemyHp:clamp(Number(dungeon.enemyHp)||0,0,1000000),
      enemyMaxHp:clamp(Number(dungeon.enemyMaxHp)||0,0,1000000),
      attacks:clamp(Math.floor(Number(dungeon.attacks)||0),0,100000)
    };
    base.relics=Array.isArray(raw.relics)?raw.relics.slice(-30).filter(v=>v&&typeof v.id==='string'&&typeof v.name==='string').map(v=>({
      id:String(v.id).slice(0,80),
      name:String(v.name).slice(0,100),
      rarity:String(v.rarity||'Обычная').slice(0,24),
      power:clamp(Number(v.power)||0,0,.3),
      defense:clamp(Number(v.defense)||0,0,.15)
    })):[];
    base.equippedRelic=base.relics.some(v=>v.id===raw.equippedRelic)?raw.equippedRelic:null;
    base.stats={
      eventsWon:clamp(Math.floor(Number(raw.stats?.eventsWon)||0),0,100000),
      dungeonsCleared:clamp(Math.floor(Number(raw.stats?.dungeonsCleared)||0),0,100000)
    };
    return base;
  }

  function capacityFor(s=state) {
    return 60 + s.grid.batteries*120 + s.research*50;
  }
  function equippedRelic() {
    return state.relics.find(v=>v.id===state.equippedRelic)||null;
  }
  function currentSnapshot() {
    try { return bridge()?.getChallengeSnapshot?.()||null; } catch (_) { return null; }
  }
  function worldId() {
    return String(bridge()?.getWorldId?.()||currentSnapshot()?.worldId||'');
  }
  function notify(message) {
    bridge()?.toast?.(String(message));
  }
  function save() {
    try { bridge()?.save?.(); } catch (error) { console.warn('[SkyRealm expansion save]',error); }
  }
  function costText(cost,gold=0) {
    const resources=Object.entries(cost||{}).map(([name,count])=>name+' ×'+count).join(', ');
    return (resources||'Без материалов')+(gold?' · '+gold+' зол.':'');
  }
  function canAfford(cost,gold=0) {
    const b=bridge();if(!b)return false;
    if(gold>0&&Number(b.getGold?.()||0)<gold)return false;
    return Object.entries(cost||{}).every(([name,count])=>Number(b.getItemCount?.(name)||0)>=count);
  }
  function spend(cost,gold=0) {
    const b=bridge();if(!canAfford(cost,gold))return false;
    const paid=[];
    const refund=()=>{for(const [name,count] of paid)b.addItem?.(name,count,'Возврат материалов после неудачной транзакции');};
    for(const [name,count] of Object.entries(cost||{})){
      if(b.spendItem?.(name,count)!==true){refund();return false;}
      paid.push([name,count]);
    }
    if(gold>0&&b.spendGold?.(gold)!==true){refund();return false;}
    return true;
  }
  function renderButton(action,label,disabled=false,secondary=false) {
    return '<button type="button" data-expansion-action="'+action+'" '+(disabled?'disabled':'')+' class="'+(secondary?'secondary':'')+'">'+label+'</button>';
  }
  function renderPower() {
    const g=state.grid,cap=capacityFor();
    let html='<div class="ex-grid-stats"><div><b>⚡ '+state.power.toFixed(0)+' / '+cap+'</b><small>Энергия в сети</small></div><div><b>'+g.generators+'</b><small>Генераторы</small></div><div><b>'+g.batteries+'</b><small>Аккумуляторы</small></div></div>';
    html+='<div class="ex-meter"><i style="width:'+Math.round(state.power/Math.max(1,cap)*100)+'%"></i></div>';
    html+='<p class="ex-muted">Генератор сжигает уголь или древесину. Аккумуляторы хранят заряд. Турели используют энергию только во время тревоги.</p>';
    html+='<div class="ex-list">';
    for(const [id,item] of Object.entries(BUILDINGS)){
      const count=g[{generator:'generators',battery:'batteries',turret:'turrets',guardpost:'guardposts',trap:'traps',drill:'drills',shield:'shields',wall:'walls',lamp:'lamps'}[id]];
      const locked=item.research&&state.research<item.research;
      const full=count>=item.limit;
      const affordable=canAfford(item.cost,item.gold);
      html+='<article class="ex-card"><div class="ex-card-head"><b>'+item.icon+' '+item.title+'</b><span>× '+count+'/'+item.limit+'</span></div><small>'+costText(item.cost,item.gold)+'</small>';
      if(locked)html+='<small class="ex-lock">Нужно исследование · уровень '+item.research+'</small>';
      html+=renderButton('build:'+id,'Построить',locked||full||!affordable);
      html+='</article>';
    }
    html+='</div>';
    const researchCost={Железо:8+state.research*6,Медь:5+state.research*3,Кристалл:2+state.research};
    html+='<article class="ex-card ex-research"><div class="ex-card-head"><b>🧠 Исследование автоматики</b><span>'+state.research+'/3</span></div><small>Новые турели, батареи и более эффективная генерация.</small><small>'+costText(researchCost,10+state.research*10)+'</small>'+renderButton('research','Исследовать',state.research>=3||!canAfford(researchCost,10+state.research*10))+'</article>';
    return html;
  }
  function renderDefense() {
    const g=state.grid,protection=Math.min(.6,g.walls*.025);
    let html='<div class="ex-grid-stats"><div><b>'+g.walls+'</b><small>Укрепления</small></div><div><b>'+g.turrets+'</b><small>Турели</small></div><div><b>'+g.guardposts+'</b><small>Казармы · стража</small></div><div><b>'+g.traps+'</b><small>Электроловушки</small></div><div><b>'+g.shields+'</b><small>Силовые купола</small></div></div>';
    html+='<p class="ex-muted">Укреплённые стены уменьшают последствия проигранной осады. Турели обстреливают разлом, а каждая казарма нанимает двух стражников. Электроловушки расходуют заряд и бьют по врагам, попавшим в зону разлома.</p>';
    html+='<div class="ex-card"><b>🏰 Схема обороны</b><small>Каждая стена повышает защиту. Максимум 30 стен и 60% снижения урона от неудачной обороны.</small></div>';
    html+='<div class="ex-card"><b>🔦 Освещение</b><small>Электрические фонари поддерживают сеть и показывают, сколько энергии вырабатывает генератор.</small><small>Фонарей: '+g.lamps+' · расход: '+(g.lamps*.035).toFixed(2)+' энергии/сек. Буров: '+g.drills+'.</small></div>';
    html+=renderButton('tab-power','Перейти к строительству',false,true);
    return html;
  }
  function renderDungeon() {
    const d=state.dungeon,rooms=dungeonRooms(),room=rooms[d.room-1];
    let html='<div class="ex-dungeon-banner"><span>🏛️ '+DUNGEON_ROUTES[d.route].title.toUpperCase()+'</span><b>Комната '+d.room+' / 5</b></div>';
    html+='<div class="ex-route-list">'+Object.entries(DUNGEON_ROUTES).map(([id,route])=>'<button type="button" data-expansion-action="dungeon-route:'+id+'" '+(d.route===id?'class="active" ':'')+((d.entryPaid||d.active||d.cleared.length)?'disabled ':'')+'><b>'+route.title+'</b><small>'+route.description+'</small></button>').join('')+'</div>';
    html+='<div class="ex-room-map">'+rooms.map((r,i)=>'<div class="ex-room '+(d.cleared.includes(i+1)?'cleared':d.room===i+1&&d.active?'active':'')+'"><b>'+(d.cleared.includes(i+1)?'✓':i+1)+'</b><small>'+r.name+'</small></div>').join('')+'</div>';
    if(d.cleared.length===5)html+='<article class="ex-card"><b>🏆 Цитадель очищена!</b><small>Ты победил всех хранителей. Награды и найденные реликвии сохранены.</small>'+renderButton('dungeon-reset','Начать новую экспедицию',false)+'</article>';
    else if(!d.active&&d.cleared.includes(d.room))html+='<article class="ex-card"><b>Комната '+d.room+' очищена</b><small>Награда получена. Можно идти дальше.</small>'+renderButton('dungeon-next','Следующая комната',d.room>=5)+'</article>';
    else if(!d.active)html+='<article class="ex-card"><b>'+room.name+'</b><small>Противник: '+room.enemy+' · здоровье '+(d.enemyHp>0?Math.ceil(d.enemyHp):room.hp)+'.</small><small>'+(d.entryPaid?'Вход уже оплачен · прогресс комнаты сохранён.':'Вход: 5 кристаллов, 10 железа и 50 золота. Исследование автоматики I.')+'</small>'+renderButton('dungeon-enter',d.entryPaid?'Продолжить экспедицию':'Войти в цитадель',state.research<1||(!d.entryPaid&&!canAfford({Кристалл:5,Железо:10},50)))+'</article>';
    else {
      html+='<article class="ex-card ex-enemy"><b>⚔️ '+room.enemy+'</b><div class="ex-meter"><i style="width:'+Math.round(d.enemyHp/Math.max(1,d.enemyMaxHp)*100)+'%"></i></div><small>Здоровье: '+Math.ceil(d.enemyHp)+' / '+d.enemyMaxHp+' · удар: '+room.damage+'</small>'+renderButton('dungeon-attack','Атаковать',false)+'</article>';
      html+='<small class="ex-muted">Каждый удар наносит ответный урон. В комнатах 2 и 4 периодически срабатывают ловушки. Можно выйти и продолжить позже.</small>'+renderButton('dungeon-leave','Отступить',false,true);
    }
    return html;
  }
  function renderRelics() {
    const active=equippedRelic();
    let html='<div class="ex-card"><b>✨ Реликвии и редкое снаряжение</b><small>Реликвии выпадают из хранителей цитадели и древних мировых событий. Они дают настоящие бонусы к урону и защите персонажа.</small><small>Надето: '+(active?active.name:'ничего')+'</small></div>';
    if(!state.relics.length)return html+'<p class="ex-muted">Пока нет реликвий. Пройди комнаты затерянной цитадели или отбей древнее пробуждение.</p>';
    return html+'<div class="ex-list">'+state.relics.map(r=>'<article class="ex-card"><div class="ex-card-head"><b>'+r.name+'</b><span style="color:'+rarityColor(r.rarity)+'">'+r.rarity+'</span></div><small>Урон +'+Math.round(r.power*100)+'% · защита +'+Math.round(r.defense*100)+'%</small>'+renderButton('equip:'+r.id,state.equippedRelic===r.id?'Надето':'Надеть',state.equippedRelic===r.id)+'</article>').join('')+'</div>';
  }
  function rarityColor(name){return RARITIES.find(v=>v.name===name)?.color||'#c3cbd5';}
  function renderEvent() {
    const e=state.event;
    if(!e)return '<article class="ex-card"><b>🌙 Глобальные события долины</b><small>После второй ночи каждые три ночи может начаться осада. Каждую седьмую ночь при исследованной автоматике пробуждается древний механизм.</small><small>Готовь генератор, стены и турели заранее.</small></article>';
    const p=bridge()?.getPlayerPosition?.()||{x:0,y:0},distance=Math.hypot((Number(p.x)||0)-e.x,(Number(p.y)||0)-e.y),location=distance<=150?'Ты рядом с маяком события. Нажми E в игровом мире или используй кнопку ниже.':'Метка события находится в '+Math.round(distance)+' пикселях. Следуй за указателем и подойди ближе.';
    if(e.kind==='ancient')return '<article class="ex-card ex-event"><b>👁️ ПРОБУЖДЕНИЕ ДРЕВНЕГО СТРАЖА</b><small>Осталось времени: '+Math.ceil(e.timer)+' сек. · действия: '+e.actions+'</small><div class="ex-meter"><i style="width:'+Math.round(e.hp/Math.max(1,e.maxHp)*100)+'%"></i></div><small>Здоровье босса: '+Math.ceil(e.hp)+' / '+e.maxHp+'</small><small>'+location+'</small>'+renderButton('event-attack','Атаковать стража',false)+'</article>';
    return '<article class="ex-card ex-event"><b>🚨 НОЧНАЯ ОСАДА</b><small>Осталось времени: '+Math.ceil(e.timer)+' сек. · осталось врагов: '+e.remaining+'</small><div class="ex-meter"><i style="width:'+Math.round(e.remaining/Math.max(1,e.remaining+e.actions)*100)+'%"></i></div><small>'+location+'</small>'+renderButton('event-attack','Отразить атаку',false)+'</article>';
  }
  function render() {
    if(!root)return;
    const b=bridge(),snap=currentSnapshot();
    const labels={power:'⚡ Энергия',defense:'🏰 Оборона',dungeon:'🏛️ Цитадель',relics:'✨ Реликвии',events:'🌙 События'};
    let content='';
    if(activeTab==='power')content=renderPower();
    else if(activeTab==='defense')content=renderDefense();
    else if(activeTab==='dungeon')content=renderDungeon();
    else if(activeTab==='relics')content=renderRelics();
    else content=renderEvent();
    root.innerHTML='<div class="ex-panel"><header class="ex-header"><div><small>SKYREALM · ТЕХНОЛОГИИ И ЭКСПЕДИЦИИ</small><h2>Мастерская прогресса</h2><p>Мир '+(snap?.day??0)+' · '+(snap?.difficulty||'обычная')+' · уровень '+(b?.getStats?.().level||1)+'</p></div><button type="button" data-expansion-action="close" aria-label="Закрыть">✕</button></header><nav class="ex-tabs">'+Object.entries(labels).map(([id,label])=>'<button type="button" data-expansion-action="tab:'+id+'" class="'+(activeTab===id?'active':'')+'">'+label+'</button>').join('')+'</nav><div class="ex-content">'+content+'</div><footer>Сохранение привязано к выбранному миру · версия системы '+VERSION+'</footer></div>';
  }
  function ensureUI() {
    if(root)return;
    const style=document.createElement('style');
    style.textContent='#expansion-launch{position:fixed;right:18px;top:218px;z-index:35;border:1px solid #78b8d4;border-radius:11px;padding:10px 13px;background:linear-gradient(135deg,#173f54,#17273f);color:#e8f8ff;font:800 12px Segoe UI;cursor:pointer;box-shadow:0 8px 25px #0007}#expansion-launch[hidden],#skyrealm-expansion[hidden]{display:none!important}#skyrealm-expansion{position:fixed;inset:0;z-index:99980;display:flex;align-items:center;justify-content:center;padding:18px;background:#020914b8;color:#edf5ff;font:13px Segoe UI,Arial}#skyrealm-expansion .ex-panel{width:min(760px,100%);max-height:min(88vh,900px);overflow:auto;border:1px solid #436783;border-radius:18px;background:linear-gradient(150deg,#132a40,#091522 75%);box-shadow:0 25px 90px #000c;padding:18px}#skyrealm-expansion .ex-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}#skyrealm-expansion .ex-header small{color:#8ed2ef;letter-spacing:1px;font-weight:800}#skyrealm-expansion h2{font-size:22px;margin:5px 0;color:#e6f5ff}#skyrealm-expansion p{margin:5px 0 12px;color:#9eb6cc}#skyrealm-expansion button{border:1px solid #4f7691;border-radius:8px;background:#1b4662;color:#effaff;padding:8px 11px;font-weight:800;cursor:pointer}#skyrealm-expansion button:disabled{opacity:.35;cursor:not-allowed}#skyrealm-expansion button.secondary{background:#17283b}#skyrealm-expansion .ex-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}#skyrealm-expansion .ex-tabs button{background:#10233a;font-size:11px}#skyrealm-expansion .ex-tabs button.active{border-color:#95dfff;background:#20516a}#skyrealm-expansion .ex-content{max-height:60vh;overflow:auto;padding-right:3px}#skyrealm-expansion .ex-card{border:1px solid #2f4d68;border-radius:11px;padding:12px;margin:9px 0;background:#0d1c2c}#skyrealm-expansion .ex-card b{display:block;color:#edf5ff;margin-bottom:5px}#skyrealm-expansion .ex-card small{display:block;color:#a8bfd3;line-height:1.55;margin:4px 0}#skyrealm-expansion .ex-card-head{display:flex;justify-content:space-between;gap:8px;align-items:center}#skyrealm-expansion .ex-card-head span{font-size:11px;color:#95b2ca}#skyrealm-expansion .ex-card button{margin-top:8px}#skyrealm-expansion .ex-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px}#skyrealm-expansion .ex-grid-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}#skyrealm-expansion .ex-grid-stats>div{padding:11px;border:1px solid #31506a;border-radius:10px;background:#0c1c2d}#skyrealm-expansion .ex-grid-stats b{display:block;font-size:19px;color:#a9e8ff}#skyrealm-expansion .ex-grid-stats small{display:block;color:#9ab1c8;margin-top:4px}#skyrealm-expansion .ex-meter{height:8px;background:#263c51;border-radius:8px;overflow:hidden;margin:9px 0}#skyrealm-expansion .ex-meter i{display:block;height:100%;background:linear-gradient(90deg,#47a9ce,#9de5b1)}#skyrealm-expansion .ex-muted{display:block;color:#9ab0c7;line-height:1.55;margin:10px 0}#skyrealm-expansion .ex-lock{color:#f0bd74!important} #skyrealm-expansion .ex-route-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin:10px 0}#skyrealm-expansion .ex-route-list button{text-align:left;background:#0e2032}#skyrealm-expansion .ex-route-list button.active{border-color:#a7e2ff;background:#1d4157}#skyrealm-expansion .ex-route-list button b{display:block;margin-bottom:4px}#skyrealm-expansion .ex-route-list button small{display:block;color:#a9bfd0;font-size:10px;line-height:1.4}#skyrealm-expansion .ex-room-map{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:12px 0}#skyrealm-expansion .ex-room{padding:8px 5px;text-align:center;border:1px solid #39536a;border-radius:8px;background:#0b1929}#skyrealm-expansion .ex-room b{display:block;color:#9ddfff}#skyrealm-expansion .ex-room small{display:block;font-size:9px;color:#a5b9cd;line-height:1.25}#skyrealm-expansion .ex-room.cleared{border-color:#62b98b;background:#123425}#skyrealm-expansion .ex-room.active{border-color:#d0ad66;background:#44371c}#skyrealm-expansion .ex-dungeon-banner{display:flex;justify-content:space-between;padding:12px;border:1px solid #4b4a6e;border-radius:10px;background:linear-gradient(90deg,#211e3d,#11283d);color:#d6c5ff;font-weight:900}#skyrealm-expansion footer{margin-top:14px;padding-top:10px;border-top:1px solid #2b455c;color:#7995ae;font-size:10px}@media(max-width:620px){#expansion-launch{top:205px;right:8px;padding:8px 10px}#skyrealm-expansion{padding:8px}#skyrealm-expansion .ex-panel{padding:12px;max-height:94vh}#skyrealm-expansion .ex-content{max-height:65vh}#skyrealm-expansion .ex-room-map{grid-template-columns:repeat(5,1fr)}#skyrealm-expansion .ex-room small{font-size:8px}}';
    document.head.appendChild(style);
    launchButton=document.createElement('button');launchButton.id='expansion-launch';launchButton.type='button';launchButton.textContent='⚡ Технологии';launchButton.hidden=true;launchButton.addEventListener('click',openPanel);document.body.appendChild(launchButton);
    root=document.createElement('section');root.id='skyrealm-expansion';root.hidden=true;document.body.appendChild(root);
    root.addEventListener('click',event=>{
      const target=event.target?.closest?.('[data-expansion-action]');if(!target)return;
      const action=target.dataset.expansionAction||'';
      if(action==='close'){closePanel();return;}
      if(action.startsWith('tab:')){activeTab=action.slice(4);render();return;}
      if(action.startsWith('build:')){build(action.slice(6));return;}
      if(action==='research'){research();return;}
      if(action==='event-attack'){attackEvent();return;}
      if(action==='dungeon-enter'){startDungeon();return;}
      if(action.startsWith('dungeon-route:')){selectDungeonRoute(action.slice(14));return;}
      if(action==='dungeon-attack'){attackDungeon();return;}
      if(action==='dungeon-leave'){leaveDungeon();return;}
      if(action==='dungeon-next'){nextDungeonRoom();return;}
      if(action==='dungeon-reset'){state.dungeon={route:state.dungeon.route,room:1,active:false,entryPaid:false,cleared:[],enemyHp:0,enemyMaxHp:0,attacks:0};save();render();return;}
      if(action.startsWith('equip:')){equipRelic(action.slice(6));return;}
    });
  }
  function openPanel() {
    const snap=currentSnapshot();if(!snap?.worldId)return;if(bridge()?.isCoopWorld?.()){notify('Технологическая система пока доступна только в одиночном мире.');return;}
    ensureUI();opened=true;root.hidden=false;launchButton.hidden=true;bridge()?.pause?.();render();
  }
  function closePanel() {
    if(!opened)return;opened=false;if(root)root.hidden=true;
    bridge()?.resume?.();if(launchButton)launchButton.hidden=!worldId();
  }
  function build(id) {
    const item=BUILDINGS[id];if(!item)return false;
    const key={generator:'generators',battery:'batteries',turret:'turrets',guardpost:'guardposts',trap:'traps',drill:'drills',shield:'shields',wall:'walls',lamp:'lamps'}[id];
    if(bridge()?.isCoopWorld?.()){notify('Технологические постройки пока доступны только в одиночных мирах.');return false;}
    if(state.grid[key]>=item.limit){notify('Достигнут предел постройки: '+item.title+'.');return false;}
    if(item.research&&state.research<item.research){notify('Сначала исследуй автоматику.');return false;}
    const b=bridge();
    if(typeof b?.placeExpansionStructure!=='function'){notify('Не удалось подключить строительство к игровому миру.');return false;}
    if(!spend(item.cost,item.gold)){notify('Не хватает материалов или золота.');return false;}
    if(b.placeExpansionStructure(id)!==true){
      for(const [name,count] of Object.entries(item.cost||{}))b.addItem?.(name,count,'Возврат ресурсов: место для постройки не найдено');
      if(item.gold)b.addGold?.(item.gold*100);
      notify('Постройка не размещена. Все потраченные материалы возвращены.');
      return false;
    }
    state.grid[key]++;
    if(id==='battery')state.power=Math.min(capacityFor(),state.power+30);
    save();notify('Построено на карте: '+item.title+'.');render();return true;
  }
  function research() {
    if(state.research>=3)return false;
    const cost={Железо:8+state.research*6,Медь:5+state.research*3,Кристалл:2+state.research};
    const gold=10+state.research*10;
    if(!spend(cost,gold)){notify('Не хватает ресурсов для исследования.');return false;}
    state.research++;state.power=Math.min(capacityFor(),state.power+15);
    save();notify('Автоматика исследована: уровень '+state.research+'/3.');render();return true;
  }
  function refillGenerator(dt) {
    if(state.grid.generators<=0)return;
    state.fuelSeconds-=dt;
    state.generatorClock+=dt;
    if(state.fuelSeconds<=0){
      const b=bridge();
      if(Number(b?.getItemCount?.('Уголь')||0)>0&&b?.spendItem?.('Уголь',1)){
        state.fuelKind='Уголь';state.fuelSeconds=45;
      }else if(Number(b?.getItemCount?.('Древесина')||0)>=2&&b?.spendItem?.('Древесина',2)){
        state.fuelKind='Древесина';state.fuelSeconds=20;
      }else{
        state.fuelSeconds=0;state.fuelKind='';return;
      }
    }
    const output=(state.fuelKind==='Уголь'?1.1:.55)*state.grid.generators*(1+state.research*.15);
    state.power=clamp(state.power+output*dt,0,capacityFor());
    if(state.grid.lamps>0)state.power=Math.max(0,state.power-state.grid.lamps*.035*dt);
  }
  function runDrills(dt) {
    if(state.grid.drills<=0)return;
    state.drillClock+=dt;
    if(state.drillClock<25||state.power<5)return;
    state.drillClock=0;state.power=Math.max(0,state.power-5);
    const b=bridge();
    b?.addItem?.('Камень',3*state.grid.drills,'Автоматический бур');
    const ores=['Железо','Медь','Уголь','Кристалл','Серебро'];
    const ore=ores[Math.floor(Math.random()*ores.length)];
    b?.addItem?.(ore,1,'Автоматический бур');
    notify('Бур добыл: Камень ×'+(3*state.grid.drills)+' и '+ore+' ×1.');
    save();
  }
  function startEvent(kind,day=0) {
    const b=bridge();if(state.event)return false;
    if(b?.isCoopWorld?.()){notify('Глобальные осады пока отключены в совместных мирах.');return false;}
    const point=b?.getWorldEventSpawnPoint?.()||b?.getPlayerPosition?.()||{x:0,y:0};
    const location={x:Math.max(0,Number(point.x)||0),y:Math.max(0,Number(point.y)||0)};
    const id='expedition-'+String(worldId()||'world')+'-'+String(day)+'-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e6);
    if(kind==='ancient')state.event={id,kind:'ancient',remaining:0,hp:1500*difficultyScale(),maxHp:1500*difficultyScale(),timer:180,actions:0,day,engaged:false,...location};
    else{
      const requested=6+Math.round((difficultyScale()-1)*3);
      const spawned=Math.max(0,Number(b?.spawnEventEnemies?.(id,location.x,location.y,requested))||0);
      if(!spawned){notify('Не удалось открыть разлом: сейчас нет безопасного места для осады.');return false;}
      state.event={id,kind:'invasion',remaining:spawned,hp:0,maxHp:0,timer:110,actions:0,day,engaged:false,...location};
    }
    notify(kind==='ancient'?'ПРОБУЖДЕНИЕ ДРЕВНЕГО СТРАЖА! Ищи светящийся маяк в мире.':'НОЧНАЯ ОСАДА! Монстры вышли из красного разлома. Найди его и защити долину.');
    save();render();return true;
  }
  function difficultyScale() {
    const d=bridge()?.getDifficulty?.()||'medium';
    return ({easy:.8,medium:1,hard:1.25,hell:1.55,impossible:1.9,challenge:2.1}[d]||1);
  }
  function updateEvent(dt) {
    const e=state.event;if(!e)return;
    e.timer=Math.max(0,e.timer-dt);
    state.turretClock+=dt;
    state.guardClock+=dt;state.trapClock+=dt;
    if(e.kind==='invasion'&&state.grid.guardposts>0&&state.guardClock>=1.8){
      state.guardClock=0;
      const alive=Number(bridge()?.getEventEnemyCount?.(e.id)||0);
      if(alive>0)bridge()?.damageEventEnemy?.(e.id,state.grid.guardposts*20);
    }
    if(e.kind==='invasion'&&state.grid.traps>0&&state.power>=state.grid.traps*.25&&state.trapClock>=1.5){
      state.trapClock=0;state.power=Math.max(0,state.power-state.grid.traps*.25);
      if(Number(bridge()?.getEventEnemyCount?.(e.id)||0)>0)bridge()?.damageEventEnemy?.(e.id,state.grid.traps*12);
    }
    if(state.grid.turrets>0&&state.power>=state.grid.turrets*.5&&state.turretClock>=2.5){
      state.turretClock=0;state.power=Math.max(0,state.power-state.grid.turrets*.5);
      if(e.kind==='ancient')e.hp=Math.max(0,e.hp-state.grid.turrets*24);
      else bridge()?.damageEventEnemy?.(e.id,state.grid.turrets*42);
    }
    if(e.kind==='ancient'&&e.hp<=0){finishEvent(true);return;}
    if(e.kind==='invasion'&&e.remaining<=0){finishEvent(true);return;}
    if(e.timer<=0)finishEvent(false);
  }
  function finishEvent(won) {
    const e=state.event;if(!e)return;
    state.event=null;
    if(!won&&e.kind==='invasion')bridge()?.clearEventEnemies?.(e.id);
    if(won){
      state.stats.eventsWon++;
      bridge()?.addGold?.(e.kind==='ancient'?12000:4500);
      bridge()?.addItem?.(e.kind==='ancient'?'Сердце архонта':'Древний осколок',e.kind==='ancient'?2:1,'Награда за глобальное событие');
      if(e.kind==='ancient')dropRelic(true);
      notify(e.kind==='ancient'?'ДРЕВНИЙ СТРАЖ ПОВЕРЖЕН! Получена реликвия и редкие материалы.':'ОСАДА ОТБИТА! Награда добавлена в инвентарь.');
    }else{
      const shielded=state.grid.shields>0&&state.power>=20;
      if(shielded)state.power-=20;
      const defense=Math.min(.8,state.grid.walls*.025+state.grid.guardposts*.04);
      const damage=(e.kind==='ancient'?38:12+e.remaining*4)*(1-defense)*(shielded?.2:1);
      bridge()?.damagePlayer?.(damage);
      notify('Оборона прорвана. Стены смягчили удар, но поселение потеряло ресурсы.');
    }
    save();render();
  }
  function eventInReach() {
    const e=state.event,p=bridge()?.getPlayerPosition?.();
    return !!e&&!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-e.x,p.y-e.y)<=150;
  }
  function attackEvent() {
    const e=state.event;if(!e)return false;
    if(!eventInReach()){notify('Подойди к светящемуся маяку события ближе, чтобы атаковать.');return false;}
    e.actions++;e.engaged=true;
    if(e.kind==='invasion'){notify('Разлом активирован! Победи всех монстров осады — '+e.remaining+' осталось.');save();render();return true;}
    const stats=bridge()?.getStats?.()||{};
    e.hp=Math.max(0,e.hp-Math.max(1,Number(stats.weaponDamage)||30)*damageMultiplier());
    if(e.actions%3===0)bridge()?.damagePlayer?.(Math.max(3,12*(1-Math.min(.5,state.grid.walls*.01))));
    if(e.hp<=0)finishEvent(true);else{save();render();}
    return true;
  }
  function onMonsterDefeated(eventId) {
    const e=state.event;if(!e||e.kind!=='invasion'||String(e.id)!==String(eventId))return false;
    e.remaining=Math.max(0,e.remaining-1);e.actions++;
    if(e.remaining<=0)finishEvent(true);else{save();render();}
    return true;
  }
  function damageMultiplier() {
    const relic=equippedRelic();return 1+(relic?.power||0);
  }
  function defenseBonus() {
    const relic=equippedRelic();return relic?.defense||0;
  }
  function createRelic(forceRare=false) {
    let roll=Math.random()*100,chosen=RARITIES[RARITIES.length-1];
    if(forceRare)roll=93+Math.random()*7;
    for(const r of RARITIES){if(roll<r.weight){chosen=r;break;}roll-=r.weight;}
    const base=RELIC_NAMES[Math.floor(Math.random()*RELIC_NAMES.length)];
    const item={
      id:'relic-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e8).toString(36),
      name:base+' · '+chosen.name.toLowerCase(),
      rarity:chosen.name,
      power:chosen.power,
      defense:chosen.defense
    };
    state.relics.push(item);state.relics=state.relics.slice(-30);
    bridge()?.addItem?.(item.name,1,'Реликвия редкости '+item.rarity+' · урон +'+Math.round(item.power*100)+'% · защита +'+Math.round(item.defense*100)+'%');
    notify('НАЙДЕНА РЕЛИКВИЯ: '+item.name+'!');
    return item;
  }
  function dropRelic(forceRare=false) {
    const item=createRelic(forceRare);if(!state.equippedRelic||item.power> (equippedRelic()?.power||0))state.equippedRelic=item.id;
    return item;
  }
  function equipRelic(id) {
    if(!state.relics.some(v=>v.id===id))return false;
    state.equippedRelic=id;save();notify('Реликвия экипирована: '+equippedRelic().name+'.');render();return true;
  }
  function selectDungeonRoute(route) {
    const d=state.dungeon;
    if(!Object.prototype.hasOwnProperty.call(DUNGEON_ROUTES,route))return false;
    if(d.active||d.entryPaid||d.cleared.length){notify('Маршрут уже выбран для этой экспедиции. Заверши или сбрось её, чтобы сменить путь.');return false;}
    d.route=route;d.room=1;d.enemyHp=0;d.enemyMaxHp=0;d.attacks=0;
    save();notify('Выбран маршрут: '+DUNGEON_ROUTES[route].title+'.');render();return true;
  }
  function startDungeon() {
    const d=state.dungeon;
    if(d.cleared.length===5){notify('Цитадель уже очищена. Начни новую экспедицию.');return false;}
    if(state.research<1){notify('Для поиска цитадели требуется исследование автоматики I.');return false;}
    if(!d.entryPaid){
      if(!spend({Кристалл:5,Железо:10},50)){notify('Для входа нужно 5 кристаллов, 10 железа и 50 золота.');return false;}
      d.entryPaid=true;
    }
    const room=d.room||1,def=dungeonRooms()[room-1],max=Math.round(def.hp*difficultyScale());
    d.active=true;
    if(!(d.enemyHp>0&&d.enemyMaxHp>0)){d.enemyMaxHp=max;d.enemyHp=max;d.attacks=0;}
    save();notify('Ты вошёл в цитадель: '+def.name+'. Прогресс комнаты сохранён.');render();return true;
  }
  function attackDungeon() {
    const d=state.dungeon;if(!d.active||d.cleared.includes(d.room))return false;
    const stats=bridge()?.getStats?.()||{};
    d.attacks++;
    d.enemyHp=Math.max(0,d.enemyHp-Math.max(1,Number(stats.weaponDamage)||30)*damageMultiplier());
    if(d.enemyHp<=0){
      d.active=false;d.cleared.push(d.room);
      bridge()?.addItem?.(dungeonRooms()[d.room-1].loot,1,'Награда за комнату '+d.room+' маршрута '+DUNGEON_ROUTES[d.route].title);
      if(d.room===5){
        state.stats.dungeonsCleared++;
        bridge()?.addGold?.(20000);
        bridge()?.addItem?.('Ключ великой сокровищницы',1,'Главная награда затерянной цитадели');
        dropRelic(true);
        notify('ЦИТАДЕЛЬ ПРОЙДЕНА! Архонт побеждён, легендарная экспедиционная награда получена.');
      }else{
        if(Math.random()<.25)dropRelic(false);
        notify('Комната очищена: '+dungeonRooms()[d.room-1].name+'. Награды добавлены.');
      }
    }else{
      const def=dungeonRooms()[d.room-1];
      let damage=def.damage*difficultyScale()*(1-defenseBonus());
      if([2,4].includes(d.room)&&d.attacks%3===0)damage+=12;
      bridge()?.damagePlayer?.(damage);
    }
    save();render();return true;
  }
  function leaveDungeon() {
    if(!state.dungeon.active)return false;
    state.dungeon.active=false;save();notify('Ты отступил из цитадели. Здоровье стража и оплата входа сохранены.');render();return true;
  }
  function nextDungeonRoom() {
    const d=state.dungeon;
    if(d.active||!d.cleared.includes(d.room)||d.room>=5)return false;
    d.room++;const def=dungeonRooms()[d.room-1],max=Math.round(def.hp*difficultyScale());
    d.active=true;d.enemyMaxHp=max;d.enemyHp=max;d.attacks=0;
    save();notify('Следующая комната: '+def.name+'.');render();return true;
  }
  function maybeStartNightEvent() {
    const b=bridge(),minutes=Number(b?.getGameMinuteTotal?.());
    if(b?.isCoopWorld?.()||!Number.isFinite(minutes)||!b?.isNightTime?.()||state.event)return;
    const day=Math.floor(minutes/1440),minute=minutes%1440,nightKey=minute<360?day-1:day;
    if(nightKey<2||state.lastSiegeNight>=nightKey||state.lastSiegeNight>=0&&nightKey-state.lastSiegeNight<3)return;
    if((nightKey+1)%7===0&&state.research>=1)startEvent('ancient',nightKey);
    else startEvent('invasion',nightKey);
    state.lastSiegeNight=nightKey;save();
  }
  function drawWorldEvent(ctx,camX,camY,time,screenWidth,screenHeight) {
    const e=state.event;if(!e||!ctx||!Number.isFinite(e.x)||!Number.isFinite(e.y))return;
    const sx=e.x-camX,sy=e.y-camY,onScreen=sx>35&&sx<screenWidth-35&&sy>45&&sy<screenHeight-40;
    const x=clamp(sx,36,screenWidth-36),y=clamp(sy,45,screenHeight-40);
    ctx.save();ctx.translate(x,y);
    if(!onScreen){
      const angle=Math.atan2(sy-y,sx-x);ctx.rotate(angle);ctx.fillStyle=e.kind==='ancient'?'#e3acff':'#ff8c76';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=13;
      ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(-10,-10);ctx.lineTo(-5,0);ctx.lineTo(-10,10);ctx.closePath();ctx.fill();ctx.rotate(-angle);
      ctx.fillStyle='#fff4dc';ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.fillText(e.kind==='ancient'?'ДРЕВНИЙ СТРАЖ':'ОСАДА',0,24);ctx.restore();return;
    }
    const pulse=1+Math.sin(time/180)*.08;
    ctx.globalAlpha=.24;ctx.fillStyle=e.kind==='ancient'?'#bd82ff':'#ff735e';ctx.beginPath();ctx.arc(0,0,47*pulse,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle='#101827bb';ctx.beginPath();ctx.ellipse(0,18,31,12,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=e.kind==='ancient'?'#dfb5ff':'#ff9475';ctx.lineWidth=4;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=16;ctx.beginPath();ctx.ellipse(0,-4,25*pulse,35*pulse,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
    if(e.kind==='ancient'){
      ctx.fillStyle='#4c366f';ctx.beginPath();ctx.moveTo(-19,10);ctx.lineTo(-17,-15);ctx.lineTo(-9,-29);ctx.lineTo(-2,-17);ctx.lineTo(4,-37);ctx.lineTo(12,-17);ctx.lineTo(20,-28);ctx.lineTo(23,10);ctx.closePath();ctx.fill();
      ctx.fillStyle='#d4a5ff';ctx.fillRect(-12,-11,6,4);ctx.fillRect(7,-11,6,4);ctx.fillStyle='#f4d7ff';ctx.fillRect(-5,1,10,3);
      ctx.fillStyle='#f2e5ff';ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ДРЕВНИЙ СТРАЖ',0,-52);
      ctx.fillStyle='#241b35';ctx.fillRect(-30,-45,60,5);ctx.fillStyle='#d7a4ff';ctx.fillRect(-30,-45,60*clamp(e.hp/Math.max(1,e.maxHp),0,1),5);
    }else{
      for(let i=0;i<3;i++){const ox=Math.cos(i*Math.PI*2/3)*29,oy=Math.sin(i*Math.PI*2/3)*17;ctx.fillStyle='#512c35';ctx.beginPath();ctx.arc(ox,oy,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffb09b';ctx.fillRect(ox-3,oy-2,6,3);}
      ctx.fillStyle='#ffdfc7';ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.fillText('РАЗЛОМ ОСАДЫ',0,-52);
    }
    ctx.restore();
  }
  function update(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    const snap=currentSnapshot();if(!snap?.worldId||snap.paused||bridge()?.isCoopWorld?.())return;
    if(worldId()!==lastWorldId){lastWorldId=worldId();state.event=null;state.fuelSeconds=0;}
    if(state.event&&state.event.x===0&&state.event.y===0){const point=bridge()?.getWorldEventSpawnPoint?.()||bridge()?.getPlayerPosition?.();if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y)){state.event.x=Math.max(0,point.x);state.event.y=Math.max(0,point.y);save();}}
    if(state.event?.kind==='invasion'&&Number(bridge()?.getEventEnemyCount?.(state.event.id))===0&&state.event.remaining>0){const spawned=Number(bridge()?.spawnEventEnemies?.(state.event.id,state.event.x,state.event.y,state.event.remaining))||0;if(spawned>0)state.event.remaining=spawned;else finishEvent(false);}
    refillGenerator(Math.min(1,dt));
    runDrills(Math.min(1,dt));
    maybeStartNightEvent();
    updateEvent(Math.min(1,dt));
    if(state.grid.batteries===0)state.power=Math.min(state.power,60);
  }
  function reset() {
    const fresh=emptyState();
    for(const key of Object.keys(state))delete state[key];
    Object.assign(state,fresh);lastWorldId=worldId();save();
  }
  function exportState() { return clone(state); }
  function importState(raw) {
    const fresh=normalizeState(raw);
    for(const key of Object.keys(state))delete state[key];
    Object.assign(state,fresh);lastWorldId=worldId();
  }

  function boot() {
    ensureUI();
    const updateButton=()=>{
      const snap=currentSnapshot();
      if(launchButton)launchButton.hidden=!snap?.worldId||snap.paused||opened||bridge()?.isCoopWorld?.();
    };
    updateButton();window.setInterval(updateButton,500);
  }

  window.SkyRealmExpansionSystems = {
    VERSION,
    update,
    reset,
    exportState,
    importState,
    damageMultiplier,
    defenseBonus,
    build,
    research,
    startEvent,
    attackEvent,
    startDungeon,
    selectDungeonRoute,
    attackDungeon,
    nextDungeonRoom,
    leaveDungeon,
    equipRelic,
    getState:()=>clone(state),
    drawWorldEvent,
    onMonsterDefeated,
    interactWorldEvent:()=>eventInReach()?attackEvent():false,
    open:openPanel,
    close:closePanel
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();