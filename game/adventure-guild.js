(() => {
  'use strict';
  const VERSION = 2;
  const KEY = 'skyrealm-adventure-expansion-v1:';
  const $ = id => document.getElementById(id);
  const bridge = () => window.SkyRealmSeaBridge;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fresh = () => ({
    version: VERSION, day: -1, contracts: [], contractClaims: [], tokens: 0,
    expedition: null, treasure: null, camp: {hearth:0,workshop:0,observatory:0,infirmary:0},
    relics: [], stats: {contracts:0,expeditions:0,treasures:0}, lastExplore:0
  });
  let state = fresh(), worldId = '', opened = false, root = null, tickHandle = 0, lastTick = 0, houseCache = null;
  let originalRecordProfession = null;
  const CONTRACTS = [
    {id:'hunter',name:'Охота на нечисть',profession:'hunter',goal:5,desc:'Победи врагов и получи опыт охотника.',gold:95,xp:55},
    {id:'miner',name:'Глубокая добыча',profession:'miner',goal:7,desc:'Добудь руду и камень.',gold:85,xp:50},
    {id:'lumberjack',name:'Лесные запасы',profession:'lumberjack',goal:6,desc:'Заготовь древесину.',gold:75,xp:45},
    {id:'builder',name:'Новые постройки',profession:'builder',goal:3,desc:'Построй или размести объекты.',gold:100,xp:60},
    {id:'fisherman',name:'Дары вод',profession:'fisherman',goal:4,desc:'Поймай рыбу.',gold:90,xp:55},
    {id:'explorer',name:'Картограф',profession:'explorer',goal:8,desc:'Исследуй новые участки мира.',gold:110,xp:65}
  ];
  const ROUTES = {
    ruins:{name:'Забытые руины',waves:2,enemies:3,reward:130,token:2,relic:'Печать руин',desc:'Два боя с отрядами скелетов и стражей.'},
    frost:{name:'Ледяной перевал',waves:3,enemies:4,reward:220,token:3,relic:'Сердце инея',desc:'Три волны усиленных противников.'},
    rift:{name:'Разлом бездны',waves:3,enemies:5,reward:360,token:5,relic:'Око разлома',desc:'Самый опасный маршрут с повышенной наградой.'}
  };
  const CAMP = {
    hearth:{name:'Очаг',icon:'🔥',desc:'+5% золота за контракты за уровень.',cost:[{Древесина:25,Камень:15},{Древесина:45,Камень:30,Железо:5},{Древесина:70,Камень:45,Железо:12}]},
    workshop:{name:'Мастерская',icon:'⚒️',desc:'Дополнительные материалы за экспедиции.',cost:[{Древесина:30,Камень:20,Железо:8},{Древесина:55,Камень:35,Железо:16},{Древесина:80,Камень:55,Железо:25}]},
    observatory:{name:'Обсерватория',icon:'🔭',desc:'Больше жетонов сезонного события.',cost:[{Древесина:20,Камень:25,Кристалл:2},{Древесина:40,Камень:40,Кристалл:5,Медь:8},{Древесина:65,Камень:60,Кристалл:9,Мифрил:2}]},
    infirmary:{name:'Лазарет',icon:'✚',desc:'Восстановление здоровья и бонус после экспедиции.',cost:[{Древесина:25,Камень:20,Ткань:5},{Древесина:45,Камень:35,Ткань:10,Железо:5},{Древесина:65,Камень:50,Ткань:16,Железо:12}]}
  };
  const RELICS = ['Печать руин','Сердце инея','Око разлома','Компас первопроходца','Клык хранителя','Лунный осколок'];
  function snapshot(){ return bridge()?.getChallengeSnapshot?.() || null; }
  function save(){ try { if(worldId) localStorage.setItem(KEY+worldId, JSON.stringify(state)); bridge()?.save?.(); } catch(e){ console.warn('[SkyRealm adventure save]',e); } }
  function load(){
    const snap=snapshot(), id=String(snap?.worldId||'');
    if(!id || id===worldId) return;
    worldId=id; state=fresh();
    try {
      const raw=JSON.parse(localStorage.getItem(KEY+id)||'null');
      if(raw && Number(raw.version)>=1 && Number(raw.version)<=VERSION){
        const clean=fresh();
        clean.day=Math.max(-1,Math.floor(Number(raw.day)||-1));
        clean.contracts=Array.isArray(raw.contracts)?raw.contracts.filter(x=>CONTRACTS.some(c=>c.id===x.id)).map(x=>({id:x.id,progress:clamp(Math.floor(Number(x.progress)||0),0,99),claimed:!!x.claimed,accepted:x.accepted!==false})): [];
        clean.contractClaims=Array.isArray(raw.contractClaims)?raw.contractClaims.filter(x=>typeof x==='string').slice(-60):[];
        clean.tokens=clamp(Math.floor(Number(raw.tokens)||0),0,99999);
        clean.expedition=raw.expedition&&ROUTES[raw.expedition.route]?{route:raw.expedition.route,wave:clamp(Math.floor(Number(raw.expedition.wave)||1),1,3),eventId:String(raw.expedition.eventId||'').slice(0,120),startedAt:Math.max(0,Number(raw.expedition.startedAt)||0)}:null;
        clean.treasure=raw.treasure&&Number.isFinite(Number(raw.treasure.x))&&Number.isFinite(Number(raw.treasure.y))?{x:Math.max(0,Number(raw.treasure.x)),y:Math.max(0,Number(raw.treasure.y)),claimed:!!raw.treasure.claimed}:null;
        for(const id of Object.keys(clean.camp)) clean.camp[id]=clamp(Math.floor(Number(raw.camp?.[id])||0),0,3);
        clean.relics=Array.isArray(raw.relics)?Array.from(new Set(raw.relics.filter(x=>RELICS.includes(x)))):[];
        clean.stats={contracts:Math.max(0,Number(raw.stats?.contracts)||0),expeditions:Math.max(0,Number(raw.stats?.expeditions)||0),treasures:Math.max(0,Number(raw.stats?.treasures)||0)};
        clean.lastExplore=Math.max(0,Number(raw.lastExplore)||0);
        state=clean;
      }
    } catch(e){ console.warn('[SkyRealm adventure load]',e); }
    rotateContracts(); save();
  }
  function rotateContracts(){
    const day=Math.max(0,Math.floor(Number(bridge()?.getGameDay?.())||0));
    if(state.day===day && state.contracts.length) return;
    const pool=CONTRACTS.slice();
    const seed=(day*9301+49297)%233280;
    let n=seed;
    for(let i=pool.length-1;i>0;i--){n=(n*9301+49297)%233280;const j=n%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
    if(state.expedition) bridge()?.clearEventEnemies?.(state.expedition.eventId);
    state.day=day;state.contracts=pool.slice(0,4).map(c=>({id:c.id,progress:0,claimed:false,accepted:false}));
    state.expedition=null;
    save();
  }
  function notify(message){ bridge()?.toast?.(message); }
  function itemCount(name){ return Math.max(0,Number(bridge()?.getItemCount?.(name))||0); }
  function canPay(cost){ return Object.entries(cost).every(([name,count])=>itemCount(name)>=count); }
  function pay(cost){ if(!canPay(cost))return false; for(const [name,count] of Object.entries(cost)) if(!bridge()?.spendItem?.(name,count)) return false; return true; }
  function rewardGold(amount){ const campBonus=1+(state.camp.hearth||0)*.05, relicBonus=1+state.relics.length*.02;bridge()?.addGold?.(Math.round(amount*campBonus*relicBonus)*100); }
  function addToken(amount){ state.tokens=clamp(state.tokens+Math.max(0,Math.floor(amount)),0,99999); }
  function progressContract(id,amount=1){
    const contract=state.contracts.find(x=>x.id===id&&!x.claimed&&x.accepted);if(!contract)return;
    contract.progress=clamp(contract.progress+Math.max(0,Math.floor(Number(amount)||0)),0,99);save();
  }
  function wrapProfession(){
    const b=bridge();if(!b||typeof b.recordProfession!=='function'||b.recordProfession.__adventureWrapped)return;
    originalRecordProfession=b.recordProfession;
    const wrapped=function(id,amount=1){
      const result=originalRecordProfession.call(this,id,amount);
      if(result!==false){
        const key=String(id||'').toLowerCase();
        if(['hunter','miner','lumberjack','builder','fisherman','explorer'].includes(key))progressContract(key,amount);
      }
      return result;
    };
    wrapped.__adventureWrapped=true;b.recordProfession=wrapped;
  }
  function acceptContract(id){const entry=state.contracts.find(x=>x.id===id&&!x.claimed);if(!entry)return;entry.accepted=true;save();notify('Поручение принято. Прогресс будет записываться по мере игры.');render();}
  function claimContract(id){
    const entry=state.contracts.find(x=>x.id===id),def=CONTRACTS.find(x=>x.id===id);
    if(!entry||!def||!entry.accepted||entry.claimed||entry.progress<def.goal){notify('Сначала возьми и выполни поручение.');return;}
    entry.claimed=true;state.stats.contracts++;rewardGold(def.gold);addToken(1+(state.camp.observatory||0));
    bridge()?.addItem?.('Опыт гильдии',def.xp,'Награда за контракт гильдии');
    save();notify('Контракт выполнен: '+def.name+'! Награда получена.');render();
  }
  function startExpedition(route){
    const def=ROUTES[route];if(!def||state.expedition){notify('Сначала заверши текущую экспедицию.');return;}
    const b=bridge(),pos=b?.getWorldEventSpawnPoint?.()||b?.getPlayerPosition?.();
    if(!pos||b?.isCoopWorld?.()||b?.isSpecialWorldMode?.()){notify('Экспедиции доступны в обычном одиночном мире.');return;}
    const eventId='guild-expedition-'+worldId+'-'+Date.now();
    const spawned=b?.spawnEventEnemies?.(eventId,pos.x,pos.y,def.enemies);
    if(!spawned){notify('Не удалось начать бой: рядом слишком много врагов или нет места.');return;}
    state.expedition={route,wave:1,eventId,startedAt:Date.now()};save();render();
    notify('Экспедиция началась: '+def.name+'. Победи всех противников!');
  }
  function attackExpedition(){
    const e=state.expedition;if(!e)return;
    const b=bridge(),def=ROUTES[e.route],damage=Math.max(1,Math.round((Number(b?.getWeaponDamage?.())||12)*(1+(state.camp.workshop||0)*.04)*(1+state.relics.length*.03)));
    const hit=b?.damageEventEnemy?.(e.eventId,damage);
    if(!hit){notify('Противник не найден. Проверь, не завершился ли бой.');return;}
    const remaining=Number(b?.getEventEnemyCount?.(e.eventId))||0;
    if(remaining===0){
      if(e.wave<def.waves){
        e.wave++;
        const pos=b?.getWorldEventSpawnPoint?.()||b?.getPlayerPosition?.();
        const spawned=b?.spawnEventEnemies?.(e.eventId+'-wave-'+e.wave,pos.x,pos.y,def.enemies);
        if(spawned){e.eventId=e.eventId+'-wave-'+e.wave;save();notify('Волна '+e.wave+' из '+def.waves+'!');}
        else{finishExpedition(false);notify('Следующая волна не смогла появиться. Экспедиция завершена без награды за неё.');}
      }else finishExpedition(true);
    }else{
      const now=Date.now();if(now-lastTick>2500){lastTick=now;const incoming=Math.max(1,Math.round(5+e.wave*3-(state.camp.infirmary||0)*1.2));b?.damagePlayer?.(incoming);}
    }
    save();render();
  }
  function reconcileExpedition(){
    const e=state.expedition;if(!e)return;
    const remaining=Number(bridge()?.getEventEnemyCount?.(e.eventId));
    if(!Number.isFinite(remaining)||remaining>0)return;
    const def=ROUTES[e.route];
    if(e.wave<def.waves){
      const pos=bridge()?.getWorldEventSpawnPoint?.()||bridge()?.getPlayerPosition?.();
      const nextId=e.eventId+'-wave-'+(e.wave+1);
      const spawned=bridge()?.spawnEventEnemies?.(nextId,pos.x,pos.y,def.enemies);
      if(spawned){e.wave++;e.eventId=nextId;save();notify('Экспедиция продолжена после загрузки мира.');}
      else{state.expedition=null;save();notify('Незавершённая экспедиция отменена: не удалось восстановить следующую волну.');}
    }else finishExpedition(true);
  }
  function finishExpedition(won){
    const e=state.expedition;if(!e)return;
    const def=ROUTES[e.route],b=bridge();
    b?.clearEventEnemies?.(e.eventId);
    if(won){
      state.stats.expeditions++;rewardGold(def.reward);addToken(def.token+(state.camp.observatory||0));
      b?.addItem?.('Кристалл',1+(state.camp.workshop||0),'Награда экспедиции');
      b?.addItem?.('Опыт гильдии',80+def.token*20,'Награда экспедиции');
      const relic=def.relic;if(!state.relics.includes(relic)){state.relics.push(relic);b?.addItem?.(relic,1,'Реликвия гильдии');}
      if(state.camp.infirmary>0)b?.restoreHealth?.();
      notify('Экспедиция пройдена! Награды добавлены в инвентарь.');
    }
    state.expedition=null;save();render();
  }
  function createTreasure(){
    if(state.treasure&&!state.treasure.claimed){notify('Сначала найди уже отмеченный клад.');return;}
    const b=bridge(),bounds=b?.getWorldBounds?.(),pos=b?.getPlayerPosition?.();
    if(!bounds||!pos||b?.isCoopWorld?.()||b?.isSpecialWorldMode?.()){notify('Карту сокровищ можно использовать в обычном одиночном мире.');return;}
    const margin=160;let x=pos.x,y=pos.y,attempts=0;
    do{
      x=clamp(Math.round(margin+Math.random()*Math.max(1,bounds.width-margin*2)),margin,bounds.width-margin);
      y=clamp(Math.round(margin+Math.random()*Math.max(1,bounds.height-margin*2)),margin,bounds.height);
      attempts++;
    }while(attempts<32&&/water|ocean|sea/i.test(String(b?.getBiomeAt?.(x,y)||'')));
    state.treasure={x,y,claimed:false};save();notify('Клад отмечен на карте. Найди его по координатам и расстоянию в журнале.');render();
  }
  function claimTreasure(){
    const t=state.treasure,pos=bridge()?.getPlayerPosition?.();if(!t||t.claimed||!pos)return;
    const distance=Math.hypot(t.x-pos.x,t.y-pos.y);
    if(distance>95){notify('Ты ещё далеко от клада: '+Math.round(distance)+' м.');return;}
    t.claimed=true;state.stats.treasures++;rewardGold(180+Math.floor(Math.random()*121));
    bridge()?.addItem?.('Кристалл',2,'Сокровище');bridge()?.addItem?.('Жемчуг',1,'Сокровище');
    const relic=RELICS.find(name=>!state.relics.includes(name));if(relic){state.relics.push(relic);bridge()?.addItem?.(relic,1,'Редкая реликвия из клада');}
    addToken(2);save();notify('Сокровище найдено! Получены золото, кристаллы и сезонные жетоны.');render();
  }
  function upgradeCamp(id){
    const def=CAMP[id],level=state.camp[id]||0;if(!def||level>=3)return;
    const cost=def.cost[level];if(!pay(cost)){notify('Не хватает материалов для улучшения.');return;}
    state.camp[id]=level+1;save();notify(def.name+' улучшен до уровня '+(level+1)+'.');render();
  }
  function exchangeTokens(kind){
    const offers={potion:{cost:3,items:[['Большое зелье',1]]},crystal:{cost:5,items:[['Кристалл',4]]},gear:{cost:9,items:[['Мифрил',2],['Кристалл',3]]}};
    const offer=offers[kind];if(!offer||state.tokens<offer.cost){notify('Не хватает сезонных жетонов.');return;}
    state.tokens-=offer.cost;for(const [name,count] of offer.items)bridge()?.addItem?.(name,count,'Награда сезонного фестиваля');
    save();notify('Обмен выполнен!');render();
  }
  function render(){
    if(!root||root.hidden)return;
    const day=state.day, contracts=state.contracts.map(entry=>{
      const def=CONTRACTS.find(c=>c.id===entry.id);if(!def)return '';
      const done=entry.progress>=def.goal;
      return '<article class="adv-card"><div class="adv-card-head"><b>'+esc(def.name)+'</b><span>'+entry.progress+'/'+def.goal+'</span></div><p>'+esc(def.desc)+'</p><div class="adv-progress"><i style="width:'+Math.round(entry.progress/def.goal*100)+'%"></i></div><button data-adv="'+(entry.accepted?'claim':'accept')+'" data-id="'+def.id+'" '+(entry.claimed||(entry.accepted&&!done)?'disabled':'')+'>'+(entry.claimed?'Получено':!entry.accepted?'Взять поручение':done?'Забрать награду':'Выполняется')+'</button></article>';
    }).join('');
    const routes=Object.entries(ROUTES).map(([id,r])=>'<article class="adv-card"><b>'+esc(r.name)+'</b><p>'+esc(r.desc)+'</p><small>'+r.waves+' волны · до '+r.enemies+' врагов · '+r.reward+' золота</small><button data-adv="route" data-id="'+id+'" '+(state.expedition?'disabled':'')+'>Начать экспедицию</button></article>').join('');
    const camp=Object.entries(CAMP).map(([id,c])=>{const level=state.camp[id]||0;return '<article class="adv-card"><div class="adv-card-head"><b>'+c.icon+' '+esc(c.name)+'</b><span>Ур. '+level+'/3</span></div><p>'+esc(c.desc)+'</p><button data-adv="camp" data-id="'+id+'" '+(level>=3?'disabled':'')+'>Улучшить · '+(level>=3?'максимум':Object.entries(c.cost[level]).map(x=>esc(x[0])+' ×'+x[1]).join(', '))+'</button></article>';}).join('');
    const expedition=state.expedition?'<section class="adv-section"><h3>⚔️ Текущая экспедиция</h3><p>'+esc(ROUTES[state.expedition.route].name)+' · волна '+state.expedition.wave+'/'+ROUTES[state.expedition.route].waves+' · врагов: '+(Number(bridge()?.getEventEnemyCount?.(state.expedition.eventId))||0)+'</p><button data-adv="attack">Атаковать оружием ('+Math.max(1,Math.round(Number(bridge()?.getWeaponDamage?.())||12))+' урона)</button><button class="secondary" data-adv="abandon">Отступить</button></section>':'';
    const treasure=state.treasure&&!state.treasure.claimed?(()=>{const pos=bridge()?.getPlayerPosition?.()||{x:0,y:0},dist=Math.round(Math.hypot(state.treasure.x-pos.x,state.treasure.y-pos.y));return '<section class="adv-section"><h3>🗺️ Карта сокровищ</h3><p>Координаты: X '+Math.round(state.treasure.x)+', Y '+Math.round(state.treasure.y)+' · осталось '+dist+' м.</p><button data-adv="treasure-claim" '+(dist>95?'disabled':'')+'>Открыть клад</button></section>';})():'';
    const relics=RELICS.map(name=>'<span class="adv-relic '+(state.relics.includes(name)?'found':'')+'">'+(state.relics.includes(name)?'✦ ':'◇ ')+esc(name)+'</span>').join('');
    const hallNpc=tab==='contracts'?'mentor':['expeditions','treasure','relics'].includes(tab)?'scout':'quartermaster';
    const hallText=hallNpc==='mentor'?'Приветствую, искатель. Выбери поручение и подтверди его принятие — после этого твои действия начнут засчитываться.':hallNpc==='scout'?'Я отмечаю опасные маршруты и старые тайники. Выбирай экспедицию или отправляйся за картой сокровищ.':'Здесь хранятся припасы и реликвии. Улучшай лагерь, обменивай жетоны и готовься к дальним походам.';
    const hallMarkup='<section class="adv-hall"><div class="adv-hall-scene"><div class="adv-hall-sign">✦ ЗАЛ ИСКАТЕЛЕЙ ✦</div><div class="adv-hall-shelf shelf-left">📚<br>📜<br>🗝️</div><div class="adv-hall-map">🗺️<span>КАРТА КОРОЛЕВСТВА</span></div><div class="adv-hall-fire">🔥</div><div class="adv-hall-shelf shelf-right">⚔️<br>🏆<br>💎</div></div><div class="adv-npc-row"><button class="adv-npc '+(hallNpc==='mentor'?'selected':'')+'" data-adv="npc" data-id="mentor"><span class="adv-portrait portrait-mentor"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="jewel"></i></span><b>Эйрин</b><small>Наставник гильдии</small></button><button class="adv-npc '+(hallNpc==='scout'?'selected':'')+'" data-adv="npc" data-id="scout"><span class="adv-portrait portrait-scout"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="jewel"></i></span><b>Мира</b><small>Следопыт и картограф</small></button><button class="adv-npc '+(hallNpc==='quartermaster'?'selected':'')+'" data-adv="npc" data-id="quartermaster"><span class="adv-portrait portrait-quartermaster"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="jewel"></i></span><b>Тор</b><small>Хранитель припасов</small></button></div><div class="adv-dialogue"><b>'+(hallNpc==='mentor'?'ЭЙРИН · НАСТАВНИК':hallNpc==='scout'?'МИРА · СЛЕДОПЫТ':'ТОР · ХРАНИТЕЛЬ')+'</b><span>'+hallText+'</span></div></section>';
    root.innerHTML='<div class="adv-backdrop"><section class="adv-dialog" role="dialog" aria-modal="true" aria-label="Гильдия искателей">'+hallMarkup+'<header><div><small>SKYREALM · ADVENTURE GUILD</small><h2>Гильдия искателей</h2><p>День '+(day+1)+' · жетоны фестиваля: <b>'+state.tokens+'</b></p></div><button data-adv="close" class="adv-close" aria-label="Закрыть">×</button></header><nav><button data-adv="tab" data-id="contracts" class="'+(tab==='contracts'?'active':'')+'">Контракты</button><button data-adv="tab" data-id="expeditions" class="'+(tab==='expeditions'?'active':'')+'">Экспедиции</button><button data-adv="tab" data-id="camp" class="'+(tab==='camp'?'active':'')+'">Лагерь</button><button data-adv="tab" data-id="treasure" class="'+(tab==='treasure'?'active':'')+'">Сокровища</button><button data-adv="tab" data-id="relics" class="'+(tab==='relics'?'active':'')+'">Реликвии</button><button data-adv="tab" data-id="festival" class="'+(tab==='festival'?'active':'')+'">Фестиваль</button></nav><main>'+(tab==='contracts'?'<section class="adv-section"><h3>📜 Ежедневные поручения</h3><p>Задания обновляются каждый игровой день. Награда: золото, опыт гильдии и жетоны.</p><div class="adv-grid">'+contracts+'</div></section>':tab==='expeditions'?'<section class="adv-section"><h3>🧭 Походы за пределы поселения</h3><p>Побеждай волны врагов. Урон зависит от текущего оружия. В одиночном обычном мире.</p><div class="adv-grid">'+routes+'</div></section>':tab==='camp'?'<section class="adv-section"><h3>🏕️ Развитие лагеря</h3><p>Четыре постройки дают постоянные бонусы в этом мире.</p><div class="adv-grid">'+camp+'</div></section>':tab==='treasure'?'<section class="adv-section"><h3>🗺️ Охота за сокровищами</h3><p>Карта создаёт клад в случайной точке мира. Подойди ближе 95 метров, чтобы забрать награду.</p><button data-adv="treasure-create" '+(state.treasure&&!state.treasure.claimed?'disabled':'')+'>Составить карту · 35 золота</button>'+treasure+'</section>':tab==='relics'?'<section class="adv-section"><h3>💎 Коллекция древних реликвий</h3><p>Собирай уникальные трофеи за экспедиции и особые достижения.</p><div class="adv-relics">'+relics+'</div><p>Найдено: '+state.relics.length+'/'+RELICS.length+'</p></section>':'<section class="adv-section"><h3>🎪 Сезонный фестиваль</h3><p>Жетоны выдаются за контракты, экспедиции и найденные сокровища. Сезон соответствует текущему игровому времени.</p><div class="adv-grid"><article class="adv-card"><b>Большое зелье</b><p>3 жетона</p><button data-adv="exchange" data-id="potion">Обменять</button></article><article class="adv-card"><b>Кристаллы ×4</b><p>5 жетонов</p><button data-adv="exchange" data-id="crystal">Обменять</button></article><article class="adv-card"><b>Мифрил ×2 и кристаллы ×3</b><p>9 жетонов</p><button data-adv="exchange" data-id="gear">Обменять</button></article></div></section>')+expedition+ '</main><footer><span>Контракты: '+state.stats.contracts+' · экспедиции: '+state.stats.expeditions+' · клады: '+state.stats.treasures+'</span><button data-adv="close">Вернуться в мир</button></footer></section></div>';
  }
  let tab='contracts';
  function open(){
    const snap=snapshot();if(!snap?.worldId){notify('Сначала загрузи игровой мир.');return;}
    if(bridge()?.isCoopWorld?.()||bridge()?.isBossRealm?.()||bridge()?.isSpecialWorldMode?.()||bridge()?.isTradeWorld?.()){notify('Дом гильдии доступен в обычном одиночном мире.');return;}
    load();wrapProfession();reconcileExpedition();opened=true;root.hidden=false;bridge()?.pause?.();render();
  }
  function close(){
    if(!opened)return;opened=false;root.hidden=true;bridge()?.resume?.();
  }
  function click(event){
    const el=event.target?.closest?.('[data-adv]');if(!el)return;
    const action=el.dataset.adv,id=el.dataset.id||'';
    if(action==='close'){close();return;}
    if(action==='accept'){acceptContract(id);return;}
    if(action==='npc'){tab=id==='mentor'?'contracts':id==='scout'?'expeditions':'camp';render();return;}
    if(action==='tab'){tab=id;render();return;}
    if(action==='claim')claimContract(id);
    else if(action==='route')startExpedition(id);
    else if(action==='attack')attackExpedition();
    else if(action==='abandon'){if(state.expedition){bridge()?.clearEventEnemies?.(state.expedition.eventId);state.expedition=null;save();notify('Экспедиция отменена.');}}
    else if(action==='camp')upgradeCamp(id);
    else if(action==='treasure-create'){const b=bridge();if(!b?.getWorldBounds?.()||!b?.getPlayerPosition?.()||b?.isCoopWorld?.()||b?.isSpecialWorldMode?.())notify('Карту можно использовать в обычном одиночном мире.');else if((Number(b?.getGold?.())||0)<35||!b?.spendGold?.(35))notify('Для карты нужно 35 золота.');else createTreasure();}
    else if(action==='treasure-claim')claimTreasure();
    else if(action==='exchange')exchangeTokens(id);
    render();
  }
  function ensureUI(){
    if($('skyrealm-adventure-guild'))return;
    const style=document.createElement('style');
    style.textContent='#skyrealm-adventure-guild{position:fixed;inset:0;z-index:10040}#skyrealm-adventure-guild[hidden]{display:none}.adv-backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:18px;background:#030916d9;backdrop-filter:blur(8px)}.adv-dialog{width:min(980px,100%);max-height:min(88vh,850px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #6687bd88;border-radius:18px;background:linear-gradient(145deg,#142842,#091525);box-shadow:0 25px 90px #000b;color:#edf4ff;font:14px Segoe UI,Arial,sans-serif}.adv-dialog header,.adv-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 21px;background:#09182a;border-bottom:1px solid #ffffff18}.adv-hall{position:relative;padding:14px 18px 12px;background:linear-gradient(180deg,#2c2630,#171d2a 60%,#0d1a2a);border-bottom:1px solid #8f754a66;overflow:hidden}.adv-hall:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 76px,#e0bd7b0a 77px 80px),linear-gradient(180deg,#9a70401a,transparent 70%);pointer-events:none}.adv-hall-scene{height:86px;position:relative;border:1px solid #92734d66;border-radius:10px;background:linear-gradient(180deg,#503d3a,#2c2930 55%,#4b382c);box-shadow:inset 0 0 32px #0008;display:flex;align-items:center;justify-content:center}.adv-hall-sign{position:absolute;top:7px;padding:5px 18px;border:1px solid #d3b779;border-radius:5px;background:linear-gradient(90deg,#3d302b,#74543b,#3d302b);color:#f4d99a;font-size:10px;font-weight:950;letter-spacing:2px;text-shadow:0 2px 5px #000}.adv-hall-shelf{position:absolute;top:27px;width:42px;height:53px;border:4px solid #60412e;border-bottom-width:7px;background:#241f25;color:#f4d99a;text-align:center;line-height:15px;font-size:13px;box-shadow:inset 0 0 0 1px #b98a53}.shelf-left{left:12px}.shelf-right{right:12px}.adv-hall-map{position:absolute;top:30px;width:104px;height:43px;border:5px solid #68472f;background:#c4a875;color:#4d3b2c;text-align:center;font-size:18px;box-shadow:0 2px 7px #0008}.adv-hall-map span{display:block;font-size:6px;font-weight:900;letter-spacing:1px}.adv-hall-fire{position:absolute;bottom:3px;right:65px;font-size:18px;filter:drop-shadow(0 0 7px #ff9c44)}.adv-npc-row{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.adv-npc{display:grid;justify-items:center;gap:4px;padding:8px 5px;border:1px solid #554a49;border-radius:10px;background:linear-gradient(145deg,#263347,#172233);color:#f1e5d1;cursor:pointer}.adv-npc.selected{border-color:#e2bd73;background:linear-gradient(145deg,#51402e,#263247);box-shadow:0 0 0 1px #e2bd7355,0 0 18px #e0b86b20}.adv-npc b{font-size:11px}.adv-npc small{font-size:8px;color:#b8c3d2}.adv-portrait{position:relative;display:block;width:46px;height:48px;overflow:hidden;border-radius:13px 13px 9px 9px;background:linear-gradient(145deg,#52677f,#25344b);box-shadow:inset 0 0 0 1px #ffffff38,0 4px 10px #0006}.adv-portrait i{position:absolute;display:block}.adv-portrait{animation:advNpcIdle 3.4s ease-in-out infinite}.adv-npc:nth-child(2) .adv-portrait{animation-delay:-1.1s}.adv-npc:nth-child(3) .adv-portrait{animation-delay:-2.2s}.adv-portrait:before{content:'';position:absolute;z-index:4;left:8px;top:7px;width:30px;height:5px;border-radius:8px;background:linear-gradient(90deg,#b58b51,#f1d18b,#b58b51);box-shadow:0 1px 3px #0008}.adv-portrait:after{content:'';position:absolute;z-index:4;left:12px;top:28px;width:22px;height:2px;background:#f0d6aa;box-shadow:0 3px 0 #ffffff55}.portrait-scout:before{background:linear-gradient(90deg,#8a5739,#e0b36a,#8a5739)}.portrait-quartermaster:before{background:linear-gradient(90deg,#8b5d35,#f2c15d,#8b5d35)}@keyframes advNpcIdle{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}.adv-portrait .body{left:6px;bottom:-9px;width:34px;height:28px;border-radius:15px 15px 4px 4px;background:linear-gradient(90deg,#314e70,#7893a7,#273d5a);border:1px solid #d0b987}.adv-portrait .face{left:14px;top:12px;width:19px;height:21px;border-radius:8px 8px 9px 9px;background:#d9ad8c;box-shadow:inset 0 -3px #a87562}.adv-portrait .hair{left:11px;top:5px;width:26px;height:15px;border-radius:12px 12px 5px 5px;background:#463445;z-index:2}.adv-portrait .jewel{z-index:3;left:21px;top:23px;width:4px;height:4px;border-radius:50%;background:#f5d276;box-shadow:0 0 7px #f5d276}.portrait-mentor{background:linear-gradient(145deg,#735d78,#28334d)}.portrait-mentor .hair{background:#d2c2ad;height:19px}.portrait-mentor .body{background:linear-gradient(90deg,#4b4776,#a5a4c4,#4b4776)}.portrait-mentor .jewel{background:#8de7ff;box-shadow:0 0 8px #8de7ff}.portrait-scout{background:linear-gradient(145deg,#597b68,#233e43)}.portrait-scout .hair{background:#b16d43}.portrait-scout .body{background:linear-gradient(90deg,#315e4c,#85a27b,#315e4c)}.portrait-scout .jewel{background:#e7ca74}.portrait-quartermaster{background:linear-gradient(145deg,#826044,#283347)}.portrait-quartermaster .hair{background:#46342b;width:29px;left:9px}.portrait-quartermaster .face{background:#c99571}.portrait-quartermaster .body{background:linear-gradient(90deg,#67432f,#a77c4b,#67432f)}.portrait-quartermaster .jewel{background:#ffb35d;box-shadow:0 0 8px #ff9b4a}.adv-dialogue{position:relative;display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding:9px 12px;border:1px solid #9a805055;border-radius:9px;background:#0b1726;color:#c6d5e8;font-size:10px;line-height:1.5}.adv-dialogue b{flex:0 0 auto;color:#e9c983;font-size:8px;letter-spacing:.8px}.adv-dialogue span{min-width:0}@media(max-width:600px){.adv-hall{padding:10px}.adv-hall-scene{height:72px}.adv-npc-row{gap:5px}.adv-npc{padding:6px 2px}.adv-dialogue{flex-direction:column;gap:3px}}.adv-dialog header small{color:#9cb9e9;letter-spacing:2px;font-size:9px}.adv-dialog h2{margin:4px 0;font-size:23px}.adv-dialog header p,.adv-dialog p{color:#a9bdd8;line-height:1.5}.adv-close{font-size:25px!important;padding:5px 13px!important}.adv-dialog button{border:1px solid #7599d1;border-radius:8px;padding:9px 13px;background:linear-gradient(110deg,#527ac5,#86a9e9);color:#081529;font-weight:800;cursor:pointer}.adv-dialog button:disabled{opacity:.38;cursor:not-allowed}.adv-dialog button.secondary{background:#263b56;color:#dbe8ff}.adv-dialog nav{display:flex;gap:7px;padding:12px 18px;overflow-x:auto;border-bottom:1px solid #ffffff18}.adv-dialog nav button{white-space:nowrap;background:#1b304b;color:#dbe8ff}.adv-dialog nav button.active{background:#8eb4f3;color:#071426}.adv-dialog main{padding:18px 20px;overflow:auto;min-height:180px}.adv-section h3{margin:0 0 7px;font-size:17px}.adv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:11px;margin-top:14px}.adv-card{padding:14px;border:1px solid #385579;border-radius:12px;background:#0b1b30}.adv-card p{min-height:36px;margin:7px 0;font-size:12px}.adv-card small{display:block;color:#b6c8e1;margin:8px 0}.adv-card button{margin-top:8px;width:100%}.adv-card button:disabled{opacity:.45}.adv-card-head{display:flex;justify-content:space-between;gap:10px}.adv-card-head span{color:#b6c8e1;font-variant-numeric:tabular-nums}.adv-progress{height:6px;border-radius:8px;background:#263d5c;overflow:hidden}.adv-progress i{display:block;height:100%;background:linear-gradient(90deg,#53c9a6,#a8e8c9)}.adv-section>button{margin:10px 8px 0 0}.adv-relics{display:flex;flex-wrap:wrap;gap:9px;margin:18px 0}.adv-relic{padding:11px 14px;border:1px solid #354a65;border-radius:9px;background:#0c1a2b;color:#8092ab}.adv-relic.found{border-color:#bd9d58;color:#ffdf9a;background:#342d20}.adv-dialog footer{border-top:1px solid #ffffff18;border-bottom:0;color:#9fb2ce;font-size:11px}.adv-dialog footer button{white-space:nowrap}@media(max-width:600px){.adv-backdrop{padding:5px}.adv-dialog{max-height:96vh}.adv-dialog header,.adv-dialog footer{padding:12px}.adv-dialog main{padding:13px}.adv-dialog h2{font-size:19px}.adv-dialog footer{align-items:flex-start;flex-direction:column}}';
    document.head.appendChild(style);
    document.getElementById('skyrealm-adventure-guild-button')?.remove();
    root=document.createElement('div');root.id='skyrealm-adventure-guild';root.hidden=true;root.addEventListener('click',click);document.body.appendChild(root);
  }
  function boot(){
    ensureUI();
    const refresh=()=>{const snap=snapshot();if(snap?.worldId&&snap.worldId!==worldId)load();if(snap?.worldId)rotateContracts();};
    refresh();tickHandle=window.setInterval(refresh,1000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
    window.addEventListener('beforeunload',save);
  }

  function housePosition(){
    const id=String(bridge()?.getWorldId?.()||'');if(!id)return null;
    if(houseCache?.id===id)return houseCache;
    const bounds=bridge()?.getWorldBounds?.()||{width:7040,height:5248};
    const width=Math.max(1800,Number(bounds.width)||7040),height=Math.max(1500,Number(bounds.height)||5248);
    const seed=[...id].reduce((n,ch)=>(Math.imul(n^ch.charCodeAt(0),16777619)>>>0),2166136261);
    const baseX=Math.min(width-260,1152+(seed%7-3)*38),baseY=Math.min(height-230,1088+((seed>>>4)%7-3)*34);
    for(let ring=0;ring<9;ring++)for(let i=0;i<16;i++){
      const a=i*Math.PI/8,x=Math.max(180,Math.min(width-180,baseX+Math.cos(a)*ring*74)),y=Math.max(180,Math.min(height-180,baseY+Math.sin(a)*ring*64));
      const biome=String(bridge()?.getBiomeAt?.(x,y)||'forest').toLowerCase();
      if(!/water|ocean|sea/.test(biome)){houseCache={id,x,y};return houseCache;}
    }
    houseCache={id,x:baseX,y:baseY};return houseCache;
  }
  function draw(ctx,camX=0,camY=0,time=0){
    const snap=snapshot(),b=bridge();if(!snap?.worldId||b?.isCoopWorld?.()||b?.isBossRealm?.()||b?.isSpecialWorldMode?.()||b?.isTradeWorld?.())return;
    const p=housePosition();if(!p)return;
    const x=p.x-camX,y=p.y-camY;if(x<-190||x>innerWidth+190||y<-210||y>innerHeight+80)return;
    const glow=.65+.22*Math.sin(time/360);
    ctx.save();ctx.translate(Math.round(x),Math.round(y));
    ctx.fillStyle='rgba(0,0,0,.30)';ctx.beginPath();ctx.ellipse(0,13,105,26,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8d8b83';ctx.beginPath();ctx.moveTo(-91,5);ctx.lineTo(-82,-45);ctx.lineTo(82,-45);ctx.lineTo(94,5);ctx.closePath();ctx.fill();
    for(let i=-84;i<90;i+=16){ctx.fillStyle=i%32?'#aaa79a':'#c0b9a7';ctx.fillRect(i,0,12,7);}
    const wall=ctx.createLinearGradient(-70,-70,70,8);wall.addColorStop(0,'#b77c4b');wall.addColorStop(.5,'#8d5737');wall.addColorStop(1,'#68402f');ctx.fillStyle=wall;ctx.fillRect(-76,-82,152,86);
    ctx.fillStyle='#4b342e';ctx.fillRect(-81,-88,162,12);
    ctx.fillStyle='#3b2b39';ctx.beginPath();ctx.moveTo(-94,-82);ctx.lineTo(-58,-145);ctx.lineTo(0,-169);ctx.lineTo(58,-145);ctx.lineTo(94,-82);ctx.closePath();ctx.fill();
    const roof=ctx.createLinearGradient(0,-170,0,-80);roof.addColorStop(0,'#6f3d56');roof.addColorStop(.55,'#a34e57');roof.addColorStop(1,'#59394b');ctx.fillStyle=roof;ctx.beginPath();ctx.moveTo(-88,-83);ctx.lineTo(-56,-142);ctx.lineTo(0,-164);ctx.lineTo(56,-142);ctx.lineTo(88,-83);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#e0b77b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-84,-84);ctx.lineTo(-55,-140);ctx.lineTo(0,-161);ctx.lineTo(55,-140);ctx.lineTo(84,-84);ctx.stroke();
    for(let i=-64;i<=64;i+=18){ctx.strokeStyle='rgba(255,215,160,.24)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(i,-94);ctx.lineTo(i*.66,-145+Math.abs(i)*.08);ctx.stroke();}
    ctx.fillStyle='#d9b879';ctx.fillRect(-13,-62,26,65);ctx.fillStyle='#56382d';ctx.fillRect(-9,-57,18,58);ctx.fillStyle='#f4d18b';ctx.beginPath();ctx.arc(7,-28,2.5,0,Math.PI*2);ctx.fill();
    for(const wx of [-52,52]){ctx.fillStyle='#553c35';ctx.fillRect(wx-13,-60,26,27);ctx.fillStyle='#9ed8e6';ctx.fillRect(wx-9,-56,18,19);ctx.strokeStyle='#e9c88d';ctx.lineWidth=3;ctx.strokeRect(wx-13,-60,26,27);ctx.beginPath();ctx.moveTo(wx,-56);ctx.lineTo(wx,-37);ctx.moveTo(wx-9,-47);ctx.lineTo(wx+9,-47);ctx.stroke();}
    ctx.fillStyle='#d6bd83';ctx.fillRect(-31,-101,62,22);ctx.fillStyle='#5a3b31';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ГИЛЬДИЯ',0,-87);
    ctx.fillStyle='#d7bd83';ctx.fillRect(-2,-197,4,32);ctx.fillStyle='#3b72a7';ctx.beginPath();ctx.moveTo(2,-194);ctx.lineTo(38,-184);ctx.lineTo(2,-173);ctx.closePath();ctx.fill();ctx.fillStyle='#e7c36f';ctx.beginPath();ctx.arc(0,-199,5,0,Math.PI*2);ctx.fill();
    for(const lx of [-91,91]){ctx.fillStyle='#4d3b2f';ctx.fillRect(lx-3,-48,6,24);ctx.fillStyle='#f5c76f';ctx.shadowColor='#ffc86b';ctx.shadowBlur=13*glow;ctx.beginPath();ctx.arc(lx,-52,7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    ctx.fillStyle='#80664a';ctx.fillRect(-20,5,40,15);ctx.fillStyle='#c1a477';ctx.fillRect(-15,5,30,7);
    ctx.fillStyle='#e9d5a5';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillText('E · ВОЙТИ В ГИЛЬДИЮ',0,38);
    ctx.restore();
  }
  function interact(){
    const snap=snapshot(),p=housePosition(),pos=bridge()?.getPlayerPosition?.();if(!snap?.worldId||!p||!pos)return false;
    if(bridge()?.isCoopWorld?.()||bridge()?.isBossRealm?.()||bridge()?.isSpecialWorldMode?.()||bridge()?.isTradeWorld?.())return false;
    if(Math.hypot(pos.x-p.x,pos.y-p.y)>128)return false;
    open();return true;
  }
  window.SkyRealmAdventureGuild=Object.freeze({VERSION,open,close,draw,interact,getHousePosition:housePosition,getState:()=>JSON.parse(JSON.stringify(state)),progressContract,acceptContract,claimContract,startExpedition,attackExpedition,createTreasure,upgradeCamp});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();