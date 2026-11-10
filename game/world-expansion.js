(() => {
  'use strict';

  const VERSION = 1;
  const KEY_PREFIX = 'skyrealm_world_expansion_v1_';
  const bridge = () => window.SkyRealmSeaBridge;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const ordinaryContracts = [
    {id:'timber',title:'Запасы для поселения',description:'Собери древесину и камень для укрепления домов.',items:{'Древесина':18,'Камень':8},gold:5200,item:'Прочный строительный набор',amount:1},
    {id:'ore',title:'Работа для кузницы',description:'Принеси железо и уголь для поселковой кузницы.',items:{'Железо':6,'Уголь':4},gold:6800,item:'Слиток закалённого железа',amount:2},
    {id:'herbs',title:'Припасы лекаря',description:'Собери лечебные травы и кристаллы для лекаря.',items:{'Лечебная трава':4,'Кристалл':3},gold:7400,item:'Настойка лесного лекаря',amount:2}
  ];
  const bossContracts = [
    {id:'rift_hunter',title:'Охотник на разломы',description:'Победи 8 существ в мире боссов.',metric:'kills',target:8,gold:16000,item:'Осколок разлома',amount:3},
    {id:'root_awakening',title:'Пробуждение корней',description:'Пробуди 3 древних дерева в мире боссов.',metric:'awakenedTrees',target:3,gold:21000,item:'Сердцевина древнего леса',amount:2},
    {id:'arena_master',title:'Покоритель арен',description:'Победи ещё одного главного босса или бога.',metric:'majorDefeats',target:1,gold:30000,item:'Печать победителя арен',amount:1}
  ];

  const fresh = () => ({
    version:VERSION, worldId:'', ordinary:{day:-1,accepted:null,claimedDay:-1,raid:null,expedition:null,assault:null},
    boss:{day:-1,accepted:null,claimedDay:-1,wardenDay:-1}
  });
  let state=fresh(), activeWorld='', opened=false, uiReady=false, lastSnapshot=null;
  let button=null, panel=null, refreshClock=0;

  function worldId(){return String(bridge()?.getChallengeSnapshot?.()?.worldId||bridge()?.getWorldId?.()||'');}
  function storageKey(id){return KEY_PREFIX+encodeURIComponent(String(id||'default'));}
  function save(){
    if(!activeWorld)return;
    try{state.worldId=activeWorld;localStorage.setItem(storageKey(activeWorld),JSON.stringify(state));bridge()?.save?.();}
    catch(error){console.warn('[SkyRealm world expansion save]',error);}
  }
  function load(id){
    activeWorld=id;state=fresh();
    try{
      const raw=JSON.parse(localStorage.getItem(storageKey(id))||'null');
      if(raw&&typeof raw==='object'&&raw.version===VERSION){
        state.ordinary={...state.ordinary,...(raw.ordinary&&typeof raw.ordinary==='object'?raw.ordinary:{})};
        const assault=state.ordinary.assault;
        state.ordinary.assault=assault&&typeof assault==='object'&&typeof assault.id==='string'&&typeof assault.villageId==='string'?{id:assault.id.slice(0,160),day:Math.max(0,Math.floor(Number(assault.day)||0)),villageId:assault.villageId.slice(0,40),villageName:typeof assault.villageName==='string'?assault.villageName.slice(0,80):'Поселение',active:assault.active===true,claimed:assault.claimed===true}:null;
        state.boss={...state.boss,...(raw.boss&&typeof raw.boss==='object'?raw.boss:{})};
        state.worldId=id;
      }
    }catch(error){console.warn('[SkyRealm world expansion load]',error);}
  }
  function notify(message){bridge()?.toast?.(String(message||''));}
  function reward(goldCents,item,amount=1,description='Награда хроник SkyRealm'){
    bridge()?.addGold?.(goldCents);
    if(item)bridge()?.addItem?.(item,amount,description);
    bridge()?.save?.();
  }
  function mode(){
    const b=bridge();
    if(b?.isBossRealm?.())return 'boss';
    if(b?.isCoopWorld?.()||b?.isSpecialWorldMode?.())return 'hidden';
    return 'ordinary';
  }
  function ensureUI(){
    if(uiReady)return;
    const style=document.createElement('style');
    style.textContent =
      '#world-expansion-launch{position:fixed;left:16px;top:126px;z-index:42;border:1px solid #9d83cb;border-radius:11px;padding:9px 13px;background:linear-gradient(135deg,#38275f,#14253d);color:#f0e9ff;font:900 11px Segoe UI;cursor:pointer;box-shadow:0 8px 25px #0008}' +
      '#world-expansion-launch[hidden],#world-expansion-panel[hidden]{display:none!important}' +
      '#world-expansion-panel{position:fixed;inset:0;z-index:99980;display:flex;align-items:center;justify-content:center;padding:14px;background:#020713d9;color:#edf4ff;font:13px Segoe UI,Arial}' +
      '#world-expansion-panel .we-window{width:min(760px,100%);max-height:90vh;overflow:auto;border:1px solid #7966a3;border-radius:17px;padding:18px;background:linear-gradient(145deg,#17263d,#091321 78%);box-shadow:0 26px 90px #000d}' +
      '#world-expansion-panel header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}' +
      '#world-expansion-panel h2{margin:0;color:#f2eaff;font-size:22px}' +
      '#world-expansion-panel p{color:#aebbd2;line-height:1.55;margin:7px 0 13px}' +
      '#world-expansion-panel .we-kicker{font-size:9px;font-weight:900;letter-spacing:1.8px;color:#c1a9ef}' +
      '#world-expansion-panel .we-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px}' +
      '#world-expansion-panel .we-card{padding:12px;border:1px solid #3a4b69;border-radius:11px;background:#0d1b2c}' +
      '#world-expansion-panel .we-card h3{margin:0 0 6px;color:#f0e8ff;font-size:14px}' +
      '#world-expansion-panel .we-card small{display:block;color:#a9bad1;line-height:1.5}' +
      '#world-expansion-panel .we-meta{margin-top:8px;color:#cbb8ef;font-size:11px;font-weight:800}' +
      '#world-expansion-panel .we-meter{height:7px;margin:9px 0;border-radius:8px;background:#25344c;overflow:hidden}' +
      '#world-expansion-panel .we-meter i{display:block;height:100%;background:linear-gradient(90deg,#8d71ca,#b7e3cf)}' +
      '#world-expansion-panel button{border:1px solid #65568a;border-radius:8px;padding:8px 11px;background:#263756;color:#f4efff;font:800 11px Segoe UI;cursor:pointer}' +
      '#world-expansion-panel button:disabled{opacity:.42;cursor:default}' +
      '#world-expansion-panel .we-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}' +
      '#world-expansion-panel .we-close{background:#17283d;border-color:#445671}' +
      '#world-expansion-panel .we-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:7px;margin:12px 0}' +
      '#world-expansion-panel .we-stat{padding:9px;border:1px solid #354968;border-radius:9px;background:#102037}' +
      '#world-expansion-panel .we-stat b{display:block;font-size:20px;color:#ddcef9}' +
      '#world-expansion-panel .we-stat small{color:#9dafc8}' +
      '#world-expansion-panel .we-note{margin:10px 0;padding:10px;border:1px solid #3d536c;border-radius:9px;background:#101f31;color:#aebfd4;line-height:1.5}' +
      '@media(max-width:560px){#world-expansion-launch{left:8px;top:122px;padding:8px 10px}#world-expansion-panel{padding:6px}#world-expansion-panel .we-window{max-height:95vh;padding:12px}#world-expansion-panel h2{font-size:19px}}';
    document.head.appendChild(style);
    button=document.createElement('button');
    button.id='world-expansion-launch';button.type='button';button.textContent='✦ Хроники мира';button.hidden=true;
    button.addEventListener('click',openPanel);document.body.appendChild(button);
    panel=document.createElement('section');panel.id='world-expansion-panel';panel.hidden=true;
    panel.innerHTML='<div class="we-window"><header><div><div class="we-kicker">SKYREALM · WORLD CHRONICLES</div><h2>✦ Хроники мира</h2></div><button class="we-close" id="we-close" type="button">Закрыть</button></header><p id="we-subtitle"></p><div id="we-content"></div></div>';
    document.body.appendChild(panel);
    panel.querySelector('#we-close').addEventListener('click',closePanel);
    panel.addEventListener('click',event=>{if(event.target===panel)closePanel();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened)closePanel();});
    uiReady=true;
  }
  function openPanel(){opened=true;if(panel)panel.hidden=false;if(button)button.hidden=true;bridge()?.pause?.();render();}
  function closePanel(){if(!opened)return;opened=false;if(panel)panel.hidden=true;bridge()?.resume?.();if(button)button.hidden=mode()==='hidden'||!activeWorld;}
  function itemCount(snapshot,name){return Math.max(0,Number(snapshot?.items?.[name])||0);}
  function contractForDay(day){return ordinaryContracts[((Math.max(0,day)%ordinaryContracts.length)+ordinaryContracts.length)%ordinaryContracts.length];}
  function bossContractForDay(day){return bossContracts[((Math.max(0,day)%bossContracts.length)+bossContracts.length)%bossContracts.length];}
  function progressForContract(contract,baseline,snapshot){
    if(!contract||!baseline||!snapshot)return 0;
    return Object.entries(contract.items).reduce((sum,[name,target])=>sum+Math.min(target,Math.max(0,itemCount(snapshot,name)-Math.max(0,Number(baseline[name])||0))),0);
  }
  function targetForContract(contract){return Object.values(contract.items).reduce((sum,n)=>sum+n,0);}
  function bossMetric(snapshot,key){
    if(key==='majorDefeats')return (Number(snapshot?.defeatedBosses)||0)+(Number(snapshot?.defeatedGods)||0);
    return Math.max(0,Number(snapshot?.[key])||0);
  }
  function acceptOrdinary(contract,snapshot,day){
    state.ordinary.accepted={id:contract.id,day,baseline:Object.fromEntries(Object.keys(contract.items).map(n=>[n,itemCount(snapshot,n)]))};
    save();render();
    notify('Заказ принят: '+contract.title+'. Приноси припасы!');
  }
  function claimOrdinary(contract,snapshot,day){
    const accepted=state.ordinary.accepted;
    if(!accepted||accepted.id!==contract.id||accepted.day!==day||progressForContract(contract,accepted.baseline,snapshot)<targetForContract(contract))return;
    reward(contract.gold,contract.item,contract.amount,'Награда жителям за выполненный заказ.');
    state.ordinary.claimedDay=day;state.ordinary.accepted=null;save();render();
    notify('Заказ выполнен! Получена награда: '+contract.item+'.');
  }
  function startVillageRaid(day){
    const b=bridge(),centers=b?.getVillageCenters?.()||[],fallback=b?.getWorldEventSpawnPoint?.();
    const point=centers.length?centers[day%centers.length]:fallback;
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)){notify('Не удалось найти безопасное место для обороны поселения.');return;}
    const id='chronicle-village-'+activeWorld+'-'+day;
    const count=b?.spawnEventEnemies?.(id,point.x,point.y,6)||0;
    if(!count){notify('Поблизости слишком много врагов. Освободи место и повтори попытку.');return;}
    state.ordinary.raid={id,day,active:true,claimed:false};
    save();render();notify('ТРЕВОГА В ПОСЕЛЕНИИ! Отбей нападение шести налётчиков.');
  }
  function startVillageAssault(day){
    const b=bridge();
    if(state.ordinary.assault?.active){notify('Налёт уже начался. Сначала разберись с защитниками.');return;}
    const previous=state.ordinary.assault;
    if(previous&&previous.day>=day-2){notify('Это поселение уже подвергалось налёту. Подожди ещё '+Math.max(1,3-(day-previous.day))+' игровой день.');return;}
    const centers=b?.getVillageCenters?.()||[],player=b?.getPlayerPosition?.();
    const names={forest:'Лесная деревня',snow:'Снежная деревня',desert:'Пустынный посёлок',volcano:'Вулканическое поселение',blight:'Заражённая деревня'};
    const point=centers.length?centers.slice().sort((a,c)=>Math.hypot((a.x||0)-(player?.x||0),(a.y||0)-(player?.y||0))-Math.hypot((c.x||0)-(player?.x||0),(c.y||0)-(player?.y||0)))[0]:b?.getWorldEventSpawnPoint?.();
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)){notify('Не удалось найти деревню для нападения.');return;}
    const villageId=String(point.id||'village').slice(0,40),villageName=names[villageId]||'Ближайшее поселение';
    const id='chronicle-assault-'+activeWorld+'-'+villageId+'-'+day;
    const guardian=b?.spawnVillageGuardian?.(id,point.x,point.y)===true;
    if(!guardian){notify('Не удалось призвать Великого стража. Освободи место возле деревни и попробуй снова.');return;}
    const count=b?.spawnEventEnemies?.(id,point.x,point.y,8)||0;
    if(count!==8){b?.clearEventEnemies?.(id);notify('Для нападения нужно свободное место для Великого стража и восьми защитников. Очисти окрестности деревни и попробуй снова.');return;}
    state.ordinary.assault={id,day,villageId,villageName,active:true,claimed:false};
    save();render();notify('НАПАДЕНИЕ НА ДЕРЕВНЮ: '+villageName+'! Победи восьмерых защитников и Великого стража деревни.');
  }
  function buildNearestVillage(kind){
    const b=bridge(),centers=b?.getVillageCenters?.()||[],player=b?.getPlayerPosition?.();
    const nearest=centers.slice().sort((a,c)=>Math.hypot(a.x-(player?.x||0),a.y-(player?.y||0))-Math.hypot(c.x-(player?.x||0),c.y-(player?.y||0)))[0];
    if(!nearest){notify('В этом мире пока нет доступного поселения для строительства.');return;}
    if(b?.buildVillageStructure?.(nearest.id,kind))render();
  }
  function startExpedition(day){
    const b=bridge(),point=b?.getWorldEventSpawnPoint?.();
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)){notify('Не удалось найти место для экспедиции.');return;}
    const id='chronicle-expedition-'+activeWorld+'-'+day;
    const count=b?.spawnEventEnemies?.(id,point.x,point.y,5)||0;
    if(!count){notify('Экспедиция пока невозможна: рядом слишком много врагов.');return;}
    state.ordinary.expedition={id,day,active:true,claimed:false};
    save();render();notify('ЭКСПЕДИЦИЯ НАЧАЛАСЬ! Победи пять существ у древнего ориентира.');
  }
  function updateOrdinaryEvents(){
    const b=bridge(),day=Math.max(0,Number(lastSnapshot?.day)||0);
    for(const kind of ['raid','expedition','assault']){
      const event=state.ordinary[kind];
      if(!event?.active||event.claimed)continue;
      const remaining=b?.getEventEnemyCount?.(event.id);
      if(remaining===0){
        event.active=false;event.claimed=true;
        if(kind==='raid')reward(12500,'Знак защитника поселения',1,'Трофей за защиту деревни от налётчиков.');
        else if(kind==='assault'){reward(18000,'Знак налётчика',1,'Трофей за успешное нападение на деревню.');b?.addItem?.('Слиток закалённого железа',2,'Добыча из разграбленного деревенского хранилища.');}
        else reward(9500,'Фрагмент карты древних троп',1,'Находка из экспедиции древних троп.');
        save();notify(kind==='raid'?'ПОСЕЛЕНИЕ СПАСЕНО! Получено 125 золота и знак защитника.':kind==='assault'?'ДЕРЕВНЯ РАЗГРАБЛЕНА! Получено 180 золота, знак налётчика и 2 слитка железа.':'ЭКСПЕДИЦИЯ ЗАВЕРШЕНА! Получено 95 золота и фрагмент карты.');
        if(opened)render();
      }
    }
    if(state.ordinary.raid&&state.ordinary.raid.day<day-2&&!state.ordinary.raid.active)state.ordinary.raid=null;
    if(state.ordinary.expedition&&state.ordinary.expedition.day<day-2&&!state.ordinary.expedition.active)state.ordinary.expedition=null;
  }
  function acceptBoss(contract,snapshot,day){
    state.boss.accepted={id:contract.id,day,baseline:{kills:bossMetric(snapshot,'kills'),awakenedTrees:bossMetric(snapshot,'awakenedTrees'),majorDefeats:bossMetric(snapshot,'majorDefeats')}};
    save();render();notify('Испытание принято: '+contract.title+'.');
  }
  function claimBoss(contract,snapshot,day){
    const accepted=state.boss.accepted;
    if(!accepted||accepted.id!==contract.id||accepted.day!==day)return;
    const current=bossMetric(snapshot,contract.metric),start=Number(accepted.baseline?.[contract.metric])||0;
    if(current-start<contract.target)return;
    reward(contract.gold,contract.item,contract.amount,'Трофей за испытание мира боссов.');
    state.boss.claimedDay=day;state.boss.accepted=null;save();render();
    notify('ИСПЫТАНИЕ ПРОЙДЕНО! Получен редкий трофей: '+contract.item+'.');
  }
  function summonWarden(day){
    if(state.boss.wardenDay===day){notify('Страж Разлома уже был вызван сегодня.');return;}
    const b=bridge(),p=b?.getPlayerPosition?.();
    if(!p){notify('Не удалось определить место игрока.');return;}
    if(typeof b?.spawnBossRealmCreature!=='function'){notify('В этой сборке призыв Стража Разлома недоступен.');return;}
    const ok=b.spawnBossRealmCreature('rift_warden',p.x+190,p.y+40);
    if(!ok){notify('Разлом ещё не готов принять нового стража. Сначала заверши текущую битву.');return;}
    state.boss.wardenDay=day;save();render();notify('СТРАЖ РАЗЛОМА ПРОБУЖДЁН! Подготовься к элитной битве.');
  }
  function renderOrdinary(snapshot){
    const day=Math.max(0,Number(snapshot.day)||0),contract=contractForDay(day),accepted=state.ordinary.accepted;
    const isAccepted=accepted?.id===contract.id&&accepted?.day===day;
    const done=isAccepted&&progressForContract(contract,accepted.baseline,snapshot)>=targetForContract(contract);
    const progress=isAccepted?progressForContract(contract,accepted.baseline,snapshot):0;
    const total=targetForContract(contract);
    const raid=state.ordinary.raid,expedition=state.ordinary.expedition,assault=state.ordinary.assault;
    const raidReady=!raid||raid.day<day-2;
    const expeditionReady=!expedition||expedition.day<day-2;
    const assaultReady=!assault||(!assault.active&&assault.day<day-2);
    const centers=bridge()?.getVillageCenters?.()||[],player=bridge()?.getPlayerPosition?.();
    const nearest=centers.length?centers.slice().sort((a,c)=>Math.hypot((a.x||0)-(player?.x||0),(a.y||0)-(player?.y||0))-Math.hypot((c.x||0)-(player?.x||0),(c.y||0)-(player?.y||0)))[0]:null;
    const villageNames={forest:'Лесная деревня',snow:'Снежная деревня',desert:'Пустынный посёлок',volcano:'Вулканическое поселение',blight:'Заражённая деревня'};
    const targetName=nearest?(villageNames[String(nearest.id)]||'Ближайшее поселение'):'Ближайшее поселение';
    return '<div class="we-note">Поселения просят о помощи. Заказы обновляются каждый игровой день. Оборона поселения и экспедиции создают настоящие группы противников в текущем мире.</div>'+
      '<div class="we-grid">'+
      '<article class="we-card"><h3>📦 '+esc(contract.title)+'</h3><small>'+esc(contract.description)+'</small><div class="we-meta">'+(isAccepted?progress+'/'+total+' ресурсов':'Награда: '+Math.floor(contract.gold/100)+' золота и '+esc(contract.item))+'</div><div class="we-meter"><i style="width:'+(isAccepted?Math.round(progress/total*100):0)+'%"></i></div><div class="we-actions">'+
      (!isAccepted&&!done&&state.ordinary.claimedDay!==day?'<button data-action="accept-contract">Взять заказ</button>':'')+
      (isAccepted&&done?'<button data-action="claim-contract">Сдать заказ</button>':'')+
      (state.ordinary.claimedDay===day?'<button disabled>Заказ выполнен сегодня</button>':'')+
      (isAccepted&&!done?'<button disabled>Продолжай собирать ресурсы</button>':'')+'</div></article>'+
      '<article class="we-card"><h3>🛡️ Оборона поселения</h3><small>Шесть налётчиков атакуют ближайшее поселение. Победа приносит знак защитника и 125 золота.</small><div class="we-meta">'+(raid?.active?'Врагов осталось: '+(bridge()?.getEventEnemyCount?.(raid.id)??'—'):raid?.claimed?'Оборона завершена':'Доступно раз в три игровых дня')+'</div><div class="we-actions"><button data-action="village-raid" '+(raidReady?'':'disabled')+'>'+(raid?.active?'Нападение идёт':'Защитить поселение')+'</button></div></article>'+
      '<article class="we-card"><h3>⚔️ Нападение на деревню</h3><small>Цель: '+esc(assault?.active?assault.villageName:targetName)+'. Ворота охраняют восемь защитников и Великий страж деревни (250 HP, 19 урона). Победи всех девятерых, чтобы забрать деревенские припасы и трофей налётчика. Новый налёт доступен раз в три игровых дня.</small><div class="we-meta">'+(assault?.active?'Нападение идёт · врагов осталось: '+(bridge()?.getEventEnemyCount?.(assault.id)??'—'):assault?.claimed&&assault.day===day?'Налёт завершён сегодня':'Награда: 180 золота, знак налётчика и 2 слитка железа')+'</div><div class="we-actions"><button data-action="village-assault" '+(assaultReady?'':'disabled')+'>'+(assault?.active?'Идёт нападение':assaultReady?'Напасть на деревню':'Деревня восстанавливается')+'</button></div></article>'+
      '<article class="we-card"><h3>🏘️ Развитие деревни и оборона</h3><small>Сторожевая башня автоматически обнаруживает налётчиков и врагов хроник, поворачивает баллисту, выпускает самонаводящиеся болты и наносит настоящий урон. Враги могут атаковать и разрушить башню. Три уровня усиливают дальность, урон, скорострельность и прочность.</small><div class="we-meta">Построено: '+(()=>{const c=bridge()?.getVillageStructureCounts?.(nearest?.id)||{},levels=c.watchtowerLevels||[],health=c.watchtowerHealth||[];return (c.houses||0)+' домов · '+(c.storages||0)+' хранилищ · '+(c.watchtowers||0)+' башен · уровни: '+(levels.length?levels.map(v=>'Ур.'+v).join(', '):'—')+' · здоровье: '+(health.length?health.map(v=>Math.round(v.hp)+'/'+v.maxHp).join(', '):'—')+' · уничтожено врагов: '+(c.watchtowerKills||0);})()+'</div><div class="we-actions"><button data-action="build-village-house" '+(nearest?'':'disabled')+'>Дом · 24 дерева · 12 камня</button><button data-action="build-village-storage" '+(nearest?'':'disabled')+'>Хранилище · 12 дерева · 8 камня</button><button data-action="build-village-watchtower" '+(nearest?'':'disabled')+'>Башня · 30 дерева · 20 камня · 8 железа</button><button data-action="upgrade-village-watchtower" '+(nearest?'':'disabled')+'>Улучшить I→II: 40 дерева · 30 камня · 12 железа / ремонт: 20 дерева · 12 камня · 5 железа</button></div></article>'+
      '<article class="we-card"><h3>🧭 Экспедиция древних троп</h3><small>Пять существ охраняют древний ориентир. Очисти место и забери фрагмент старой карты.</small><div class="we-meta">'+(expedition?.active?'Врагов осталось: '+(bridge()?.getEventEnemyCount?.(expedition.id)??'—'):expedition?.claimed?'Экспедиция завершена':'Доступно раз в три игровых дня')+'</div><div class="we-actions"><button data-action="expedition" '+(expeditionReady?'':'disabled')+'>'+(expedition?.active?'Экспедиция идёт':'Начать экспедицию')+'</button></div></article>'+
      '</div>';
  }
  function renderBoss(snapshot,boss){
    const day=Math.max(0,Number(snapshot.day)||0),contract=bossContractForDay(day),accepted=state.boss.accepted;
    const isAccepted=accepted?.id===contract.id&&accepted?.day===day;
    const value=bossMetric(boss,contract.metric),start=isAccepted?Number(accepted.baseline?.[contract.metric])||0:value;
    const progress=isAccepted?clamp(value-start,0,contract.target):0,done=isAccepted&&progress>=contract.target;
    const defeated=(boss.defeatedBossNames||[]).map(esc).join(' · ')||'Пока нет побед над главными боссами';
    const gods=(boss.defeatedGodNames||[]).map(esc).join(' · ')||'Боги ещё не повержены';
    const wardenReady=state.boss.wardenDay!==day;
    return '<div class="we-stats">'+
      '<div class="we-stat"><b>'+Math.floor(Number(boss.kills)||0)+'</b><small>Побед над существами</small></div>'+
      '<div class="we-stat"><b>'+Math.floor(Number(boss.awakenedTrees)||0)+'</b><small>Пробуждений деревьев</small></div>'+
      '<div class="we-stat"><b>'+Math.floor(Number(boss.defeatedBosses)||0)+'/9</b><small>Главные боссы</small></div>'+
      '<div class="we-stat"><b>'+Math.floor(Number(boss.defeatedGods)||0)+'/2</b><small>Побеждённые боги</small></div>'+
      '<div class="we-stat"><b>'+Math.floor(Number(boss.wave)||1)+'</b><small>Текущая волна</small></div></div>'+
      '<div class="we-note"><b>Побеждённые боссы:</b> '+defeated+'<br><b>Поверженные боги:</b> '+gods+'</div>'+
      '<div class="we-grid"><article class="we-card"><h3>⚔️ '+esc(contract.title)+'</h3><small>'+esc(contract.description)+'</small><div class="we-meta">'+(isAccepted?progress+'/'+contract.target+' · прогресс испытания':'Награда: '+Math.floor(contract.gold/100)+' золота и '+esc(contract.item))+'</div><div class="we-meter"><i style="width:'+(progress/contract.target*100)+'%"></i></div><div class="we-actions">'+
      (!isAccepted&&state.boss.claimedDay!==day?'<button data-action="accept-boss">Принять испытание</button>':'')+
      (isAccepted&&done?'<button data-action="claim-boss">Забрать награду</button>':'')+
      (state.boss.claimedDay===day?'<button disabled>Испытание завершено сегодня</button>':'')+
      (isAccepted&&!done?'<button disabled>Продолжай испытание</button>':'')+'</div></article>'+
      '<article class="we-card"><h3>🌀 Призыв Стража Разлома</h3><small>Вызови дополнительного элитного противника. Его победа учитывается в хронике и в общей статистике мира боссов.</small><div class="we-meta">'+(wardenReady?'Один призыв за игровой день':'Страж уже призывался сегодня')+'</div><div class="we-actions"><button data-action="summon-warden" '+(wardenReady?'':'disabled')+'>Пробудить стража</button></div></article></div>';
  }
  function render(){
    const content=panel?.querySelector?.('#we-content'),subtitle=panel?.querySelector?.('#we-subtitle');
    if(!content||!lastSnapshot)return;
    const b=bridge(),m=mode();
    if(m==='boss'){
      const boss=b?.getBossRealmSnapshot?.()||{};
      subtitle.textContent='Мир боссов · испытания, элитная охота и хроника побед.';
      content.innerHTML=renderBoss(lastSnapshot,boss);
    }else{
      subtitle.textContent='Обычный мир · поручения жителей, оборона поселений и экспедиции.';
      content.innerHTML=renderOrdinary(lastSnapshot);
    }
    content.querySelectorAll('[data-action]').forEach(control=>control.addEventListener('click',()=>{
      const action=control.getAttribute('data-action');
      const day=Math.max(0,Number(lastSnapshot?.day)||0);
      if(action==='accept-contract')acceptOrdinary(contractForDay(day),lastSnapshot,day);
      else if(action==='claim-contract')claimOrdinary(contractForDay(day),lastSnapshot,day);
      else if(action==='village-raid')startVillageRaid(day);
      else if(action==='village-assault')startVillageAssault(day);
      else if(action==='build-village-house')buildNearestVillage('house');
      else if(action==='build-village-storage')buildNearestVillage('storage');
      else if(action==='build-village-watchtower')buildNearestVillage('watchtower');
      else if(action==='upgrade-village-watchtower'){const centers=bridge()?.getVillageCenters?.()||[],player=bridge()?.getPlayerPosition?.(),nearest=centers.slice().sort((a,c)=>Math.hypot((a.x||0)-(player?.x||0),(a.y||0)-(player?.y||0))-Math.hypot((c.x||0)-(player?.x||0),(c.y||0)-(player?.y||0)))[0];if(nearest)bridge()?.upgradeNearestVillageWatchtower?.(nearest.id);render();}
      else if(action==='expedition')startExpedition(day);
      else if(action==='accept-boss')acceptBoss(bossContractForDay(day),b?.getBossRealmSnapshot?.()||{},day);
      else if(action==='claim-boss')claimBoss(bossContractForDay(day),b?.getBossRealmSnapshot?.()||{},day);
      else if(action==='summon-warden')summonWarden(day);
    }));
  }
  function update(){
    const b=bridge(),snapshot=b?.getChallengeSnapshot?.(),id=String(snapshot?.worldId||'');
    if(!id){if(button)button.hidden=true;if(opened)closePanel();lastSnapshot=null;return;}
    if(id!==activeWorld)load(id);
    lastSnapshot=snapshot;
    const m=mode();
    ensureUI();
    if(button)button.hidden=m==='hidden'||!!snapshot?.paused||opened;
    if(!snapshot||snapshot.paused||m==='hidden')return;
    if(m==='ordinary')updateOrdinaryEvents();
    if(opened&&refreshClock++%2===0)render();
  }
  function boot(){ensureUI();update();window.setInterval(update,500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.SkyRealmWorldExpansion=Object.freeze({
    getState:()=>JSON.parse(JSON.stringify(state)),
    getMode:mode,
    refresh:update
  });
})();