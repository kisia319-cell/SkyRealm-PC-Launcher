(() => {
  const canvas = document.getElementById('world');
  function initialVsyncEnabled(){
    try{
      const params=new URLSearchParams(window.location.search),raw=params.get('settings');
      const prefs=raw?JSON.parse(raw):JSON.parse(localStorage.getItem('skyrealm_game_preferences')||'{}');
      return prefs.vsync!==false;
    }catch(_){return true;}
  }
  // Canvas desynchronization is a browser hint; requestAnimationFrame remains display-paced when VSync is enabled.
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: !initialVsyncEnabled() });
  const TILE = 32; let COLS = 220, ROWS = 164;
  // Reuse the deterministic Boss Realm floor between camera-tile changes.
  let bossRealmGroundCache = null;
  // Reuse deterministic surface-ground textures instead of rebuilding hundreds of tiny paths each frame.
  let surfaceGroundTileCache=null;
  let width = 0, height = 0, dpr = 1, last = performance.now(), paused = true;
  let adaptiveRenderScale=1,renderCostTotal=0,renderCostSamples=0,renderCostWindowAt=0;
  let inMainMenu = true;
  let settingsOpenedFromMainMenu = false;
  const keys = new Set();
  // Track movement separately from action keys so lost focus or modal transitions cannot strand the player.
  const movementDirections = new Set();
  // Track physical key codes separately from logical bindings. This keeps movement alive
  // when WebView keyboard layout, custom bindings or a lost key event desynchronizes gameKey().
  const pressedMovementCodes = new Set();
  const MOVEMENT_CODE_BY_DIRECTION = {up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight']};
  const MOVEMENT_DIRECTION_BY_ACTION = {w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
  const DEFAULT_GAME_KEY_BINDINGS = {up:'KeyW',left:'KeyA',down:'KeyS',right:'KeyD',interact:'KeyE',inventory:'KeyI',map:'KeyL',attack:'Space',dodge:'KeyQ',ability:'KeyR',heal:'KeyH',buff:'KeyJ'};
  const DEFAULT_GAME_SETTINGS = { resolution:'1280x720', windowMode:'windowed', graphicsQuality:'medium', performanceMode:'balanced', fpsLimit:0, vsync:true, musicVolume:35, sfxVolume:70, musicEnabled:false, uiSoundEnabled:true, keyBindings:{...DEFAULT_GAME_KEY_BINDINGS}, uiScale:'100', showVitals:true, showQuest:true, showControls:true, showInventory:true, showMinimap:true, earlyMonsterSpawn:false, hudLayout:'default', adminMode:false, moderatorMode:false };
  let gameSettings = readInitialSettings();
  const world = { trees: [], rocks: [], flowers: [], fireflies: [], signs: [], fences: [] };
  let treeChops=[],felledTrees=[];
  const player = { x: 21 * TILE, y: 26 * TILE, vx: 0, vy: 0, face: 'down', frame: 0, hp: 100, stamina: 84 };
  const DEFAULT_PLAYER_APPEARANCE = {skin:'#e8b88c',hair:'#352d3d',armor:'#526fba',accent:'#9cb9ff',eye:'#26334c',face:'normal',hairStyle:'short'};
  let playerAppearance = {...DEFAULT_PLAYER_APPEARANCE};
  function applyAppearanceData(source,target=playerAppearance){if(!source||typeof source!=='object')return;for(const k of ['skin','hair','armor','accent','eye'])if(/^#[0-9a-f]{6}$/i.test(source[k]||''))target[k]=source[k];if(['normal','smile','stern','visor','mask'].includes(source.face))target.face=source.face;if(['short','long','mohawk','curly','hood'].includes(source.hairStyle))target.hairStyle=source.hairStyle;}
  try { applyAppearanceData(JSON.parse(localStorage.getItem('skyrealm_character_v1')||'{}')); } catch(_) {}
  const DIFFICULTIES = {
    easy:{id:'easy',name:'Легко',rank:1,cols:180,rows:140,bossHp:500,bossDamage:30,bossInterval:1.5,bossSpeed:18,monsterHp:.72,monsterDamage:.62,monsterSpawn:1.15,shop:{buy:{Камень:300,Уголь:900,Железо:2400},sell:{wood:125,leaves:50,meat:90}},chests:{crystal:.25,potion:.28}},
    medium:{id:'medium',name:'Средняя',rank:2,cols:220,rows:164,bossHp:1000,bossDamage:45,bossInterval:1.25,bossSpeed:22,monsterHp:1,monsterDamage:1,monsterSpawn:1,shop:{buy:{Камень:450,Уголь:1200,Железо:3600},sell:{wood:175,leaves:75,meat:125}},chests:{crystal:.35,potion:.25}},
    hard:{id:'hard',name:'Сложно',rank:3,cols:260,rows:192,bossHp:2000,bossDamage:65,bossInterval:1.05,bossSpeed:28,monsterHp:1.4,monsterDamage:1.45,monsterSpawn:.82,shop:{buy:{Камень:700,Уголь:1800,Железо:5200},sell:{wood:225,leaves:100,meat:175}},chests:{crystal:.45,potion:.22}},
    hell:{id:'hell',name:'Жар',rank:4,cols:300,rows:220,bossHp:4000,bossDamage:90,bossInterval:.85,bossSpeed:34,monsterHp:1.9,monsterDamage:2,monsterSpawn:.68,shop:{buy:{Камень:1000,Уголь:2600,Железо:8000},sell:{wood:275,leaves:125,meat:225}},chests:{crystal:.55,potion:.2}},
    impossible:{id:'impossible',name:'Невозможно',rank:5,cols:360,rows:260,bossHp:8500,bossDamage:125,bossInterval:.62,bossSpeed:42,monsterHp:2.65,monsterDamage:2.8,monsterSpawn:.45,shop:{buy:{Камень:1500,Уголь:4000,Железо:12000},sell:{wood:300,leaves:140,meat:250}},chests:{crystal:.65,potion:.12}},
    challenge:{id:'challenge',name:'Челлендж',rank:6,cols:280,rows:210,bossHp:3200,bossDamage:75,bossInterval:.9,bossSpeed:32,monsterHp:1.55,monsterDamage:1.55,monsterSpawn:.8,shop:{buy:{Камень:800,Уголь:2100,Железо:6200},sell:{wood:240,leaves:110,meat:190}},chests:{crystal:.5,potion:.24}}
  };
  let currentDifficulty='medium',pendingWorldId=null,difficultyMigrationPending=false;
  let bedSpawn={x:36*TILE+40,y:15*TILE+154};
  function difficultyConfig(){return DIFFICULTIES[currentDifficulty]||DIFFICULTIES.medium;}
  function bossRealmPortalUnlocked(){return bossRealmMode||survivedNights>=3;}
  function bossRealmPortalPosition(){return {x:28*TILE+16,y:26*TILE+16};}

  let bossRealmState={kills:0,wave:1,elapsed:0,spawnTimer:0,eventTimer:65,eventName:'',eventId:'',eventRemaining:0,introSeen:false,awakenedTrees:0,defeatedBosses:[],defeatedGods:[],dungeonSites:[]};
  let deathScreenOpen=false,deathScreenContext=null;
  let bossRealmInvisibleTimer=0,bossRealmInvisibilityCooldown=0,bossRealmDamageBoostTimer=0,bossRealmAbilityCooldown=0,bossRealmSprintTimer=0,bossRealmSprintCooldown=0;
  let bossRealmHazard=null,bossRealmHazardCooldown=0,bossRealmJournalOpen=false,bossRealmWaveBannerTimer=0,bossRealmWaveBannerText='';
  const BOSS_REALM_CREATURES=Object.freeze({
    shadow_hunter:{name:'Теневой охотник',tier:'mob',hp:180,damage:13,speed:74,color:'#7652b7',eyes:'#ff5c9d',size:1.05,skill:'teleport'},
    stone_guardian:{name:'Каменный страж',tier:'mob',hp:420,damage:24,speed:28,color:'#77818c',eyes:'#f6bd64',size:1.25,skill:'slam'},
    cursed_skull:{name:'Проклятый череп',tier:'mob',hp:145,damage:15,speed:52,color:'#c9c4ad',eyes:'#b66cff',size:.9,skill:'ranged'},
    rift_wolf:{name:'Разломный волк',tier:'mob',hp:235,damage:20,speed:88,color:'#6b344d',eyes:'#ff536c',size:1.05,skill:'dash'},
    venom_beetle:{name:'Ядовитый жук',tier:'mob',hp:210,damage:17,speed:48,color:'#4e8d56',eyes:'#d5ff65',size:1.05,skill:'poison'},
    fallen_warrior:{name:'Падший воин',tier:'mob',hp:330,damage:22,speed:42,color:'#9b9b9b',eyes:'#ffcf83',size:1.15,skill:'guard'},
    rift_archer:{name:'Разломный лучник',tier:'mob',hp:170,damage:18,speed:54,color:'#5b7d9f',eyes:'#9cf4ff',size:1,skill:'volley'},
    ash_spirit:{name:'Пепельный дух',tier:'mob',hp:190,damage:19,speed:66,color:'#b65b37',eyes:'#ffe09a',size:1.1,skill:'burst'},
    abyss_general:{name:'Генерал бездны',tier:'elite',hp:1050,damage:34,speed:48,color:'#623c76',eyes:'#ff8bea',size:1.55,skill:'summon'},
    blood_berserker:{name:'Кровавый берсерк',tier:'elite',hp:920,damage:42,speed:70,color:'#a52f4d',eyes:'#fff0a6',size:1.5,skill:'rage'},
    rift_warden:{name:'Хранитель разлома',tier:'elite',hp:1250,damage:31,speed:36,color:'#347d91',eyes:'#9ef5ff',size:1.6,skill:'shield'},
    soul_devourer:{name:'Пожиратель душ',tier:'elite',hp:880,damage:29,speed:58,color:'#34304f',eyes:'#d8a6ff',size:1.45,skill:'drain'},
    abyss_king:{name:'Король Бездны',tier:'boss',hp:5200,damage:52,speed:38,color:'#593a8f',eyes:'#ff5b8d',size:2.25,skill:'king'},
    rift_dragon:{name:'Разломный дракон',tier:'boss',hp:6800,damage:61,speed:54,color:'#a44d3b',eyes:'#ffe18a',size:2.5,skill:'dragon'},
    ancient_devourer:{name:'Древний пожиратель',tier:'boss',hp:7400,damage:58,speed:25,color:'#527b42',eyes:'#c8ff72',size:2.65,skill:'roots'},
    end_knight:{name:'Рыцарь конца',tier:'boss',hp:8600,damage:72,speed:62,color:'#30394e',eyes:'#f5f2ff',size:2.2,skill:'knight'},
    astral_god:{name:'Астрал — Бог разрушения',tier:'god',hp:18500,damage:105,speed:45,color:'#6b4dcb',eyes:'#ffdf79',size:3.1,skill:'astral'},
    chronos_god:{name:'Хронос — Бог времени',tier:'god',hp:17000,damage:92,speed:52,color:'#397b9c',eyes:'#b8f4ff',size:3,skill:'chronos'}
,

    magma_behemoth:{name:"\u041f\u0435\u043f\u0435\u043b\u044c\u043d\u044b\u0439 \u0422\u0438\u0442\u0430\u043d",tier:'boss',hp:9800,damage:82,speed:32,color:'#873d26',eyes:'#ff7b35',size:2.9,skill:'slam'},
    frost_empress:{name:"\u041b\u0435\u0434\u044f\u043d\u0430\u044f \u0418\u043c\u043f\u0435\u0440\u0430\u0442\u0440\u0438\u0446\u0430",tier:'boss',hp:10200,damage:74,speed:43,color:'#5d9fb9',eyes:'#baf8ff',size:2.75,skill:'volley'},
    void_mirror:{name:"\u0417\u0435\u0440\u043a\u0430\u043b\u043e \u0411\u0435\u0437\u0434\u043d\u044b",tier:'boss',hp:11200,damage:88,speed:51,color:'#34234f',eyes:'#e9a7ff',size:2.8,skill:'teleport'},
    worldbreaker_colossus:{name:"\u041a\u043e\u043b\u043e\u0441\u0441 \u0420\u0430\u0437\u0440\u0443\u0448\u0435\u043d\u043d\u043e\u0433\u043e \u041c\u0438\u0440\u0430",tier:'boss',hp:36000,damage:112,speed:24,color:'#626d80',eyes:'#ffd36d',size:4.15,skill:'roots'},
    forest_king:{name:'Король Древнего Леса',tier:'boss',hp:52000,damage:128,speed:25,color:'#57422c',eyes:'#b5f76c',size:4.25,skill:'forest_king'},
    awakened_tree:{name:'Пробуждённый древень',tier:'elite',hp:1450,damage:38,speed:27,color:'#69462e',eyes:'#ffdc72',size:1.85,skill:'roots'},
    root_eater:{name:'Корнеед',tier:'elite',hp:2450,damage:48,speed:34,color:'#59402c',eyes:'#b9f66f',size:2.05,skill:'forest_king'}
  });
  const BOSS_REALM_EVENTS=[["meteor","\u041c\u0435\u0442\u0435\u043e\u0440\u0438\u0442\u043d\u044b\u0439 \u0434\u043e\u0436\u0434\u044c"],["horde","\u0412\u0442\u043e\u0440\u0436\u0435\u043d\u0438\u0435 \u0447\u0443\u0434\u043e\u0432\u0438\u0449"],["blood_moon","\u041a\u0440\u043e\u0432\u0430\u0432\u0430\u044f \u043b\u0443\u043d\u0430"],["awakening","\u041f\u0440\u043e\u0431\u0443\u0436\u0434\u0435\u043d\u0438\u0435 \u0434\u0440\u0435\u0432\u043d\u0435\u0433\u043e"],["rift","\u0420\u0430\u0437\u043b\u043e\u043c \u0438\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u0439"],["storm","\u0428\u0442\u043e\u0440\u043c \u0431\u043e\u0433\u043e\u0432"],["volcano","\u0418\u0437\u0432\u0435\u0440\u0436\u0435\u043d\u0438\u0435 \u043b\u0430\u0432\u043e\u0432\u043e\u0433\u043e \u0440\u0430\u0437\u043b\u043e\u043c\u0430"],["blizzard","\u041b\u0435\u0434\u044f\u043d\u0430\u044f \u0431\u0443\u0440\u044f"],["eclipse","\u0417\u0430\u0442\u043c\u0435\u043d\u0438\u0435 \u0431\u0435\u0437\u0434\u043d\u044b"],["time_rift","\u0420\u0430\u0437\u0440\u044b\u0432 \u0432\u0440\u0435\u043c\u0435\u043d\u0438"]];
  function bossRealmCreatureCount(){return monsters.filter(m=>m.bossRealmCreature&&m.hp>0).length;}
  function bossRealmArenaIdFor(type){
    if(['magma_behemoth','rift_dragon','abyss_king','end_knight','worldbreaker_colossus'].includes(type))return 'forge';
    if(type==='frost_empress')return 'glacier';
    if(['ancient_devourer','void_mirror'].includes(type))return 'temple';
    if(['astral_god','chronos_god'].includes(type))return 'astral';
    if(type==='forest_king')return 'forest';
    return 'forge';
  }
  function bossRealmMuseumPosition(x,y,exclude=null){
    const gap=19*TILE,centers=[];
    for(const mob of monsters){
      if(!mob||mob===exclude||!mob.bossRealmCreature||mob.hp<=0)continue;
      const cx=Number.isFinite(mob.territoryX)?mob.territoryX:Number(mob.x),cy=Number.isFinite(mob.territoryY)?mob.territoryY:Number(mob.y);
      if(Number.isFinite(cx)&&Number.isFinite(cy))centers.push({x:cx,y:cy});
    }
    const sites=Array.isArray(bossRealmState.dungeonSites)?bossRealmState.dungeonSites:[];
    for(const site of sites)if(Number.isFinite(site?.x)&&Number.isFinite(site?.y))centers.push({x:site.x,y:site.y});
    const minX=8*TILE,maxX=(COLS-8)*TILE,minY=8*TILE,maxY=(ROWS-8)*TILE;
    const valid=(px,py)=>centers.every(c=>Math.hypot(px-c.x,py-c.y)>=gap-1);
    let best=null,bestScore=Infinity;
    const baseX=Math.max(minX,Math.min(maxX,Number(x)||player.x)),baseY=Math.max(minY,Math.min(maxY,Number(y)||player.y));
    for(let radius=19;radius<=64;radius+=2){
      for(let i=0;i<32;i++){
        const angle=i*Math.PI/16,px=Math.max(minX,Math.min(maxX,baseX+Math.cos(angle)*radius*TILE)),py=Math.max(minY,Math.min(maxY,baseY+Math.sin(angle)*radius*TILE));
        if(!valid(px,py))continue;
        const score=Math.hypot(px-baseX,py-baseY);
        if(score<bestScore){best={x:px,y:py};bestScore=score;}
      }
      if(best&&bestScore<=(radius+1)*TILE)break;
    }
    if(best)return best;
    for(let gy=minY;gy<=maxY;gy+=gap)for(let gx=minX;gx<=maxX;gx+=gap){
      if(!valid(gx,gy))continue;
      const score=Math.hypot(gx-baseX,gy-baseY);
      if(score<bestScore){best={x:gx,y:gy};bestScore=score;}
    }
    return best||{x:baseX,y:baseY};
  }
  function spawnBossRealmCreature(type,x,y){
    const d=BOSS_REALM_CREATURES[type];
    const isMajorBoss=!!d&&['boss','god'].includes(d.tier);
    if(!bossRealmMode||!d||(!isMajorBoss&&bossRealmCreatureCount()>=12)||(isMajorBoss&&monsters.some(m=>m.bossRealmCreature&&m.hp>0&&['boss','god'].includes(BOSS_REALM_CREATURES[m.realmType]?.tier))))return false;
    const realmSites=ensureBossRealmDungeonSites();
    let arenaSite=null;
    if(isMajorBoss&&type!=='forest_king'){
      arenaSite=realmSites.find(site=>site.id===bossRealmArenaIdFor(type))||null;
      if(arenaSite){
        x=arenaSite.x;y=arenaSite.y;
        arenaSite.active=true;arenaSite.complete=false;arenaSite.remaining=0;arenaSite.bossId=type;
      }
    }
    if(!Number.isFinite(x)||!Number.isFinite(y)){const a=Math.random()*Math.PI*2,r=340+Math.random()*210;x=Math.max(64,Math.min(COLS*TILE-64,player.x+Math.cos(a)*r));y=Math.max(64,Math.min(ROWS*TILE-64,player.y+Math.sin(a)*r));}
    if(!isMajorBoss){const museum=bossRealmMuseumPosition(x,y);x=museum.x;y=museum.y;}
    const hp=Math.round(d.hp*difficultyConfig().monsterHp);
    const mob={id:newCoopEntityId(),type:'brute',realmType:type,bossRealmCreature:true,bossTitle:d.name,x,y,hp,maxHp:hp,speed:d.speed,damageScale:difficultyConfig().monsterDamage,phase:Math.random()*6.28,flash:0,attackCooldown:1,specialCooldown:3+Math.random()*3,telegraphTimer:0,telegraphActive:false,phaseStage:1,action:'idle',actionTimer:0,shield:0,rage:0,animation:Math.random()*6,raidCrystalCount:type==='worldbreaker_colossus'?3:0,territoryX:x,territoryY:y,territoryRadius:isMajorBoss?12*TILE:d.tier==='elite'?11*TILE:10*TILE,museumDamage:0,museumLayoutVersion:2};
    if(isMajorBoss&&arenaSite){mob.arenaId=arenaSite.id;mob.arenaX=arenaSite.x;mob.arenaY=arenaSite.y;mob.arenaRadius=160;mob.realmDungeonId=arenaSite.id;mob.realmDungeonFinal=true;toast('АРЕНА ПРОБУЖДЕНА: '+arenaSite.name+' · '+d.name+' ждёт тебя!');}
    monsters.push(mob);
    return true;
  }
  function ensureBossRealmPopulation(){if(!bossRealmMode)return;if(bossRealmCreatureCount())return;[['shadow_hunter',-190],['stone_guardian',-90],['cursed_skull',0],['rift_wolf',90],['venom_beetle',190]].forEach(([t,x])=>spawnBossRealmCreature(t,player.x+x,player.y-210));}
  function bossRealmHurtPlayer(amount,label,color){if(bossRealmInvisibleTimer>0)return;combatTakeDamage(amount*(bossRealmState.eventId==='blood_moon'?1.25:1),label,color);}
  function startBossRealmEvent(){const e=BOSS_REALM_EVENTS[Math.floor(Math.random()*BOSS_REALM_EVENTS.length)];bossRealmState.eventId=e[0];bossRealmState.eventName=e[1];bossRealmState.eventRemaining=32;bossRealmHazard=null;bossRealmHazardCooldown=1.2;toast('СОБЫТИЕ: '+e[1]+'!');if(['horde','rift'].includes(e[0]))['shadow_hunter','rift_wolf','ash_spirit','cursed_skull'].forEach(t=>spawnBossRealmCreature(t));if(e[0]==='awakening')spawnBossRealmCreature('ancient_devourer');if(e[0]==='storm')spawnBossRealmCreature('rift_warden');if(e[0]==='volcano')spawnBossRealmCreature('magma_behemoth');if(e[0]==='blizzard')spawnBossRealmCreature('frost_empress');if(e[0]==='time_rift')spawnBossRealmCreature('void_mirror');spawnVisualBurst(player.x,player.y,32,'spark','#b78cff');}
  function recordBossRealmDefeat(m){
    if(!bossRealmMode||!m?.bossRealmCreature||m.bossRealmDefeatRecorded)return false;
    m.bossRealmDefeatRecorded=true;
    bossRealmState.kills=Math.min(100000,Math.max(0,Math.floor(Number(bossRealmState.kills)||0))+1);
    const d=BOSS_REALM_CREATURES[m.realmType];if(!d)return true;
    handleBossRealmDungeonDefeat(m);
    const tier=d.tier;
    if(tier==='boss'||tier==='god')triggerBossVictory(d.name,m.x,m.y,d.eyes||d.color);
    if(tier==='boss'&&!bossRealmState.defeatedBosses.includes(m.realmType)){bossRealmState.defeatedBosses.push(m.realmType);toast('ГЛАВАРЬ ПОБЕЖДЁН: '+d.name+'!');}
    if(tier==='god'&&!bossRealmState.defeatedGods.includes(m.realmType)){bossRealmState.defeatedGods.push(m.realmType);toast('БОГ ПОВЕРЖЕН: '+d.name+'!');}
    const coop=isCoopWorldActive(),canReward=!coop||window.SkyRealmCoopClient?.isRoomOwner;
    if(canReward){
      const relicName=BOSS_REALM_RELIC_BY_BOSS[m.realmType];if(relicName){const relic=inventoryItems.find(item=>item.name===relicName);if(relic&&relic.count<1){changeItem(relicName,1);toast('ЛЕГЕНДАРНАЯ РЕЛИКВИЯ: '+relicName+' · пассивный эффект активирован!');}}
      const crystals=tier==='god'?6+Math.floor(Math.random()*3):tier==='boss'?3+Math.floor(Math.random()*3):tier==='elite'?1+Math.floor(Math.random()*2):Math.random()<.12?1:0;
      const gold=tier==='god'?25000:tier==='boss'?10000:tier==='elite'?2500:0;
      if(crystals>0){if(coop)spawnSharedLoot(m.x,m.y,[{name:'Кристалл',count:crystals}],'surface');else if(lootDrops.length<80)lootDrops.push({x:m.x+(Math.random()-.5)*42,y:m.y+(Math.random()-.5)*40,name:'Кристалл',count:crystals,life:240,phase:Math.random()*6.28});}
      const trophies=[];
      if(tier==='god')trophies.push({name:'Осколок пробуждения',count:4});
      else if(tier==='boss')trophies.push({name:'Осколок пробуждения',count:2});
      else if(tier==='elite'&&Math.random()<.25)trophies.push({name:'Осколок пробуждения',count:1});
      if(tier==='elite'&&Math.random()<.3)trophies.push({name:'Осколок Бездны',count:1});
      if(m.realmType==='awakened_tree')trophies.push({name:'Сердцевина древня',count:1});if(m.realmType==='root_eater')trophies.push({name:'Сердце Корнееда',count:1},{name:'Живой корень',count:3});if(m.realmType==='forest_king')trophies.push({name:'Сердце Древнего Леса',count:1},{name:'Сердцевина древня',count:5});
      if(tier==='boss'){
        trophies.push({name:'Печать главаря',count:1});
        if(m.realmType==='rift_dragon'&&Math.random()<.55)trophies.push({name:'Чешуя Разлома',count:1});
        if(Math.random()<.3)trophies.push({name:Math.random()<.5?'Меч дракона':'Меч пустоты',count:1});
      }
      if(tier==='god'){
        trophies.push({name:'Сердце Бога',count:1});
        if(Math.random()<.45)trophies.push({name:m.realmType==='astral_god'?'Меч пустоты':'Клинок бездны',count:1});
      }
      if(trophies.length){if(coop)spawnSharedLoot(m.x,m.y,trophies,'surface');else for(const item of trophies){if(lootDrops.length>=80)break;lootDrops.push({x:m.x+(Math.random()-.5)*46,y:m.y+(Math.random()-.5)*44,name:item.name,count:item.count,life:300,phase:Math.random()*6.28});}const rareWeapon=trophies.find(v=>['Меч дракона','Меч пустоты','Клинок бездны'].includes(v.name));if(rareWeapon)toast('РЕДКОЕ ОРУЖИЕ В ДОБЫЧЕ: '+rareWeapon.name+'!');}
      if(gold>0){walletCents+=gold;updateWalletHud();}
      if(tier==='god'&&equipment.armor!=='Нагрудник Бога'){equipment.armor='Нагрудник Бога';toast('Нагрудник Бога получен · защита +90%!');}
    }
    if(tier==='boss'||tier==='god')spawnVisualBurst(m.x,m.y,tier==='god'?58:42,'spark',d.eyes);
    const nextWave=Math.max(1,Math.min(100,Math.floor(bossRealmState.kills/5)+1));if(nextWave>bossRealmState.wave){bossRealmState.wave=nextWave;bossRealmWaveBannerTimer=3.6;bossRealmWaveBannerText='ВОЛНА '+nextWave;const pack=['shadow_hunter','rift_wolf','ash_spirit','venom_beetle'];for(let i=0;i<4;i++)spawnBossRealmCreature(pack[(i+nextWave)%pack.length]);if(nextWave%4===0)spawnBossRealmCreature(nextWave%8===0?'root_eater':['abyss_general','blood_berserker','rift_warden','soul_devourer'][nextWave%4]);spawnVisualBurst(player.x,player.y,32,'spark','#a88aff');toast('НАЧАЛАСЬ ВОЛНА '+nextWave+' · враги стали опаснее!');}else bossRealmState.wave=nextWave;
    saveGame();return true;
  }
  function bossRealmSpecial(m,d,dist){
    const p=d.damage*(m.rage>0?1.4:1),skill=d.skill;
    if(['teleport','astral','chronos'].includes(skill)){const a=Math.atan2(player.y-m.y,player.x-m.x);m.x=player.x-Math.cos(a)*125;m.y=player.y-Math.sin(a)*125;m.action='teleport';m.actionTimer=.6;spawnVisualBurst(m.x,m.y,25,'spark',d.eyes);if(skill==='astral'){spawnVisualBurst(player.x,player.y,48,'spark','#ffcf73');if(dist<520)bossRealmHurtPlayer(p*1.9,'Астрал · метеоритный разлом','#ffcf73');}else if(skill==='chronos'){spawnVisualBurst(player.x,player.y,34,'spark','#9deaff');if(dist<410){bossRealmHurtPlayer(p*1.35,'Хронос · остановка времени','#9deaff');player.vx*=.15;player.vy*=.15;m.hp=Math.min(m.maxHp,m.hp+Math.round(m.maxHp*.025));}}else if(dist<190)bossRealmHurtPlayer(p*1.35,d.name+' · разлом','#d6aaff');}
    else if(['dash','dragon','knight'].includes(skill)){const a=Math.atan2(player.y-m.y,player.x-m.x);m.x+=Math.cos(a)*210;m.y+=Math.sin(a)*210;m.action='dash';m.actionTimer=.5;spawnVisualBurst(m.x,m.y,20,'spark',d.eyes);if(Math.hypot(player.x-m.x,player.y-m.y)<115)bossRealmHurtPlayer(p*1.6,d.name+' · рывок',d.eyes);}
    else if(['slam','roots','king','burst','rage','forest_king'].includes(skill)){m.action='slam';m.actionTimer=.7;spawnVisualBurst(m.x,m.y,34,'spark',d.eyes);if(dist<230)bossRealmHurtPlayer(p*1.6,d.name+' · удар по земле',d.eyes);if(skill==='rage'){m.rage=10;m.speed=d.speed*1.5;}if(skill==='roots'&&dist<300){player.vx*=.1;player.vy*=.1;toast('Корни сковали тебя!');}if(skill==='forest_king'){if(dist>=230&&dist<330)bossRealmHurtPlayer(p*(m.phaseStage>=3?2.05:1.55),'Король Древнего Леса · волна корней','#b5f76c');if(dist<390){player.vx*=.22;player.vy*=.22;}}}
    else if(['ranged','volley'].includes(skill)){m.action='cast';m.actionTimer=.6;spawnVisualBurst(m.x,m.y,16,'spark',d.eyes);if(dist<460)bossRealmHurtPlayer(p*1.1,d.name+' · магический залп',d.eyes);}
    else if(['poison','drain'].includes(skill)){m.action='cast';m.actionTimer=.8;if(dist<310)bossRealmHurtPlayer(p*1.2,skill==='drain'?'Пожиратель душ высасывает жизнь':'Ядовитое облако',d.eyes);if(skill==='drain')m.hp=Math.min(m.maxHp,m.hp+Math.round(p*3));}
    else if(['guard','shield'].includes(skill)){m.shield=7;m.action='guard';m.actionTimer=1;spawnVisualBurst(m.x,m.y,20,'spark',d.eyes);}
    else if(skill==='summon'){m.action='cast';for(let i=0;i<2;i++)spawnBossRealmCreature(['shadow_hunter','cursed_skull','rift_wolf'][Math.floor(Math.random()*3)],m.x+(i?70:-70),m.y+60);toast('Генерал бездны призывает прислужников!');}
  }
  function updateBossRealmEnemies(dt){
    const realmSites=ensureBossRealmDungeonSites();
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    for(const site of realmSites){if(site.active&&site.remaining===0&&!monsters.some(m=>m.realmDungeonFinal&&m.realmDungeonId===site.id&&m.hp>0)){if(spawnBossRealmDungeonFinal(site,1.2+Math.min(.35,site.rematches*.08)))toast(site.name+' · хранитель вышел на арену!');}}
    bossRealmState.elapsed+=step;bossRealmState.spawnTimer-=step;bossRealmState.eventTimer-=step;bossRealmState.eventRemaining=Math.max(0,bossRealmState.eventRemaining-step);bossRealmWaveBannerTimer=Math.max(0,bossRealmWaveBannerTimer-step);
    if(bossRealmState.eventRemaining<=0){bossRealmState.eventName='';bossRealmState.eventId='';bossRealmHazard=null;}
    if(bossRealmState.eventTimer<=0){startBossRealmEvent();bossRealmState.eventTimer=110+Math.random()*50;}
    if(['meteor','storm','volcano'].includes(bossRealmState.eventId)){
      bossRealmHazardCooldown=Math.max(0,bossRealmHazardCooldown-step);
      if(!bossRealmHazard&&bossRealmHazardCooldown<=0&&bossRealmState.eventRemaining>1.05){const a=Math.random()*Math.PI*2,r=120+Math.random()*170;bossRealmHazard={x:Math.max(TILE,Math.min(COLS*TILE-TILE,player.x+Math.cos(a)*r)),y:Math.max(TILE,Math.min(ROWS*TILE-TILE,player.y+Math.sin(a)*r)),timer:1.05,kind:bossRealmState.eventId};bossRealmHazardCooldown=bossRealmState.eventId==='storm'?3.8:2.6;}
      if(bossRealmHazard){bossRealmHazard.timer=Math.max(0,bossRealmHazard.timer-step);if(bossRealmHazard.timer<=0){const h=bossRealmHazard;bossRealmHazard=null;spawnVisualBurst(h.x,h.y,h.kind==='storm'?38:30,'spark',h.kind==='storm'?'#83dfff':'#ff9b55');if(Math.hypot(player.x-h.x,player.y-h.y)<72)bossRealmHurtPlayer(h.kind==='storm'?46:36,h.kind==='storm'?'Молния Шторма богов':'Падающий метеорит',h.kind==='storm'?'#83dfff':'#ff9b55');}}
    }else if(bossRealmHazard){bossRealmHazard=null;bossRealmHazardCooldown=0;}
    const majorBossPresent=monsters.some(m=>m.bossRealmCreature&&['boss','god'].includes(BOSS_REALM_CREATURES[m.realmType]?.tier));
    if(bossRealmState.awakenedTrees>=5&&!bossRealmState.defeatedBosses.includes('forest_king')&&!majorBossPresent){const grove=bossRealmGrovePosition();if(spawnBossRealmCreature('forest_king',grove.x,grove.y))toast('ПРОБУЖДЁН КОРОЛЬ ДРЕВНЕГО ЛЕСА! Пять срубленных древних деревьев разбудили хозяина рощи.');}
    if(bossRealmState.kills>=8&&!majorBossPresent){
      const mainBosses=['abyss_king','rift_dragon','ancient_devourer','end_knight'];
      const secretBosses=['magma_behemoth','frost_empress','void_mirror'];
      const mainLeft=mainBosses.filter(id=>!bossRealmState.defeatedBosses.includes(id));
      const secretLeft=secretBosses.filter(id=>!bossRealmState.defeatedBosses.includes(id));
      let nextBoss=null;
      if(mainLeft.length)nextBoss=mainLeft[Math.floor(Math.random()*mainLeft.length)];
      else if(bossRealmState.kills>=18&&secretLeft.length)nextBoss=secretLeft[Math.floor(Math.random()*secretLeft.length)];
      else if(bossRealmState.kills>=26&&secretLeft.length===0){
        const gods=['astral_god','chronos_god'].filter(id=>!bossRealmState.defeatedGods.includes(id));
        if(gods.length)nextBoss=gods[Math.floor(Math.random()*gods.length)];
        else if(bossRealmState.kills>=42&&!bossRealmState.defeatedBosses.includes('worldbreaker_colossus'))nextBoss='worldbreaker_colossus';
      }
      if(nextBoss)spawnBossRealmCreature(nextBoss);
    }
    if(bossRealmState.spawnTimer<=0&&bossRealmCreatureCount()<12){const pool=['shadow_hunter','stone_guardian','cursed_skull','rift_wolf','venom_beetle','fallen_warrior','rift_archer','ash_spirit'];spawnBossRealmCreature(pool[Math.floor(Math.random()*pool.length)]);if(bossRealmState.kills>=5&&Math.random()<.3)spawnBossRealmCreature(['abyss_general','blood_berserker','rift_warden','soul_devourer'][Math.floor(Math.random()*4)]);bossRealmState.spawnTimer=10+Math.random()*5;}
    // Compute the predictive simulation window once per frame, not once per creature.
    const moveX=Number(player.vx)||0,moveY=Number(player.vy)||0,moveLen=Math.hypot(moveX,moveY);
    const faceVector=player.face==='left'?[-1,0]:player.face==='right'?[1,0]:player.face==='up'?[0,-1]:[0,1];
    const predictX=moveLen>1?moveX/moveLen:faceVector[0],predictY=moveLen>1?moveY/moveLen:faceVector[1];
    const lookAhead=TILE*3,predictedX=player.x+predictX*lookAhead,predictedY=player.y+predictY*lookAhead;
    const activeRadius=Math.hypot(width,height)*.58+lookAhead,activeRadiusSq=activeRadius*activeRadius;
    for(const m of monsters){if(!m.bossRealmCreature)continue;const d=BOSS_REALM_CREATURES[m.realmType];if(!d)continue;
      // Distant enemies remain dormant; nearby and predicted-forward enemies wake before entering view.
      const playerDx=m.x-player.x,playerDy=m.y-player.y,predictedDx=m.x-predictedX,predictedDy=m.y-predictedY;
      if(playerDx*playerDx+playerDy*playerDy>activeRadiusSq&&predictedDx*predictedDx+predictedDy*predictedDy>activeRadiusSq)continue;
      // Repair incomplete/legacy enemy records before any combat calculations.
      const baseHp=Math.max(1,Number(d.hp)||100);
      if(!Number.isFinite(m.maxHp)||m.maxHp<1)m.maxHp=Math.round(baseHp*difficultyConfig().monsterHp);
      if(!Number.isFinite(m.hp))m.hp=m.maxHp;
      m.hp=Math.max(0,Math.min(m.maxHp,m.hp));
      if(!Number.isFinite(m.speed)||m.speed<=0)m.speed=d.speed||40;
      if(!Number.isFinite(m.damageScale)||m.damageScale<=0)m.damageScale=difficultyConfig().monsterDamage||1;
      if(!Number.isFinite(m.attackCooldown))m.attackCooldown=.25;
      if(!Number.isFinite(m.specialCooldown))m.specialCooldown=1;
      if(!Number.isFinite(m.actionTimer))m.actionTimer=0;
      if(!Number.isFinite(m.rage))m.rage=0;
      if(!Number.isFinite(m.phaseStage))m.phaseStage=1;
      if(!Number.isFinite(m.telegraphTimer))m.telegraphTimer=0;
      m.telegraphActive=!!m.telegraphActive;if(!Number.isFinite(m.raidCrystalCount))m.raidCrystalCount=0;
      const isArenaBoss=['boss','god'].includes(d.tier);
      let arenaSite=null;
      if(isArenaBoss){
        arenaSite=realmSites.find(site=>site.id===bossRealmArenaIdFor(m.realmType))||null;
        if(arenaSite){
          if(m.arenaId!==arenaSite.id||!Number.isFinite(m.arenaX)||!Number.isFinite(m.arenaY)||Math.abs(m.arenaX-arenaSite.x)>1||Math.abs(m.arenaY-arenaSite.y)>1){
            m.arenaId=arenaSite.id;m.arenaX=arenaSite.x;m.arenaY=arenaSite.y;m.arenaRadius=12*TILE;
            m.realmDungeonId=arenaSite.id;m.realmDungeonFinal=true;
            m.x=arenaSite.x;m.y=arenaSite.y;
            m.telegraphActive=false;m.telegraphTimer=0;m.actionTimer=0;
          }
          m.arenaRadius=160;
          arenaSite.active=true;arenaSite.complete=false;arenaSite.remaining=0;arenaSite.bossId=m.realmType;
        }
      }
      const hasArena=!!(isArenaBoss&&arenaSite&&Number.isFinite(m.arenaX)&&Number.isFinite(m.arenaY));
      const arenaRadius=Math.max(10*TILE,Math.min(14*TILE,Number(m.arenaRadius)||12*TILE));
      if(!Number.isFinite(m.territoryX))m.territoryX=hasArena?m.arenaX:m.x;
      if(!Number.isFinite(m.territoryY))m.territoryY=hasArena?m.arenaY:m.y;
      if(m.museumLayoutVersion!==2){
        const museum=hasArena?{x:arenaSite.x,y:arenaSite.y}:bossRealmMuseumPosition(m.x,m.y,m);
        m.territoryX=museum.x;m.territoryY=museum.y;
        if(!hasArena){m.x=museum.x;m.y=museum.y;}
        m.museumLayoutVersion=2;
      }
      if(!Number.isFinite(m.territoryRadius)||m.territoryRadius<10*TILE)m.territoryRadius=12*TILE;
      m.flash=Math.max(0,(Number(m.flash)||0)-step);m.staggerTimer=Math.max(0,(Number(m.staggerTimer)||0)-step);m.attackCooldown=Math.max(0,m.attackCooldown-step);m.specialCooldown=Math.max(0,m.specialCooldown-step);m.actionTimer=Math.max(0,m.actionTimer-step);m.telegraphTimer=Math.max(0,m.telegraphTimer-step);m.rage=Math.max(0,m.rage-step);m.animation=(Number(m.animation)||0)+step*8;
      if(m.hp<=0)continue;
      let dist=Math.hypot(player.x-m.x,player.y-m.y)||1;
      const playerOutsideArena=hasArena&&Math.hypot(player.x-m.arenaX,player.y-m.arenaY)>arenaRadius+42;
      if(playerOutsideArena){
        const backX=m.arenaX-m.x,backY=m.arenaY-m.y,backDist=Math.hypot(backX,backY);
        if(backDist>8){const move=Math.min(backDist-8,m.speed*step);m.x+=backX/backDist*move;m.y+=backY/backDist*move;}
        m.telegraphActive=false;m.telegraphTimer=0;m.action='idle';dist=Math.hypot(player.x-m.x,player.y-m.y)||1;
        continue;
      }
      const ratio=m.hp/m.maxHp;
      if((['boss','god'].includes(d.tier)||m.realmType==='root_eater')&&ratio<.66&&m.phaseStage<2){m.phaseStage=2;m.speed*=1.15;spawnVisualBurst(m.x,m.y,30,'spark',d.eyes);const adds=m.realmType==='frost_empress'?['cursed_skull','rift_archer']:m.realmType==='forest_king'?['awakened_tree','venom_beetle']:m.realmType==='astral_god'?['shadow_hunter','ash_spirit']:['rift_wolf','cursed_skull'];adds.forEach((add,index)=>{if(spawnBossRealmCreature(add,m.x+(index?72:-72),m.y+54)){const summoned=monsters[monsters.length-1];summoned.x=m.x+(index?72:-72);summoned.y=m.y+54;summoned.territoryX=m.x;summoned.territoryY=m.y;summoned.territoryRadius=10*TILE;}});toast(d.name+' переходит во вторую фазу и призывает подкрепление!');}
      if((['boss','god'].includes(d.tier)||m.realmType==='root_eater')&&ratio<.32&&m.phaseStage<3){m.phaseStage=3;m.speed*=1.2;m.rage=12;m.specialCooldown=Math.min(m.specialCooldown,2.5);spawnVisualBurst(m.x,m.y,42,'spark',d.eyes);if(dist<150)bossRealmHurtPlayer((Number(d.damage)||8)*.72,d.name+' · удар ярости',d.eyes);toast(d.name+' впадает в ярость и выпускает ударную волну!');}
      if(m.staggerTimer>0){m.action='stagger';m.actionTimer=m.staggerTimer;continue;}
      if(bossRealmInvisibleTimer<=0){if(dist>48&&m.actionTimer<=0){let sp=m.speed*(m.rage>0?1.25:1)*(bossRealmState.eventId==='blood_moon'?1.2:1);if(['ranged','volley','chronos'].includes(d.skill)&&dist<200)sp*=.3;const dx=(player.x-m.x)/dist,dy=(player.y-m.y)/dist;let nx=Math.max(TILE,Math.min(COLS*TILE-TILE,m.x+dx*sp*step)),ny=Math.max(TILE,Math.min(ROWS*TILE-TILE,m.y+dy*sp*step));const zoneX=Number.isFinite(m.territoryX)?m.territoryX:(hasArena?m.arenaX:m.x),zoneY=Number.isFinite(m.territoryY)?m.territoryY:(hasArena?m.arenaY:m.y),zoneRadius=hasArena?arenaRadius:Math.max(10*TILE,Math.min(14*TILE,Number(m.territoryRadius)||12*TILE));const ox=nx-zoneX,oy=ny-zoneY,fromCenter=Math.hypot(ox,oy)||1;if(fromCenter>zoneRadius){nx=zoneX+ox/fromCenter*zoneRadius;ny=zoneY+oy/fromCenter*zoneRadius;}m.x=nx;m.y=ny;}}
      const attackDistance=Math.hypot(player.x-m.x,player.y-m.y);
      if(attackDistance<58&&m.attackCooldown<=0&&bossRealmInvisibleTimer<=0){m.attackCooldown=d.tier==='god'?1:d.tier==='boss'?1.2:1.5;bossRealmHurtPlayer((Number(d.damage)||8)*(Number(m.damageScale)||1),d.name+' · атака',d.eyes);}
      if(m.specialCooldown<=0&&bossRealmInvisibleTimer<=0){if(!m.telegraphActive){m.telegraphActive=true;m.telegraphTimer=d.tier==='god'?1.15:d.tier==='boss'?1.05:.82;m.telegraphFacing=Math.atan2(player.y-m.y,player.x-m.x);m.action='cast';m.actionTimer=m.telegraphTimer;}else if(m.telegraphTimer<=0){m.telegraphActive=false;m.specialCooldown=(d.tier==='god'?8:d.tier==='boss'?9:d.tier==='elite'?10.5:12.5)+Math.random()*(d.tier==='mob'?2:1.5);bossRealmSpecial(m,d,attackDistance);if(dodgeTimer>0&&attackDistance<360&&['boss','god'].includes(d.tier)){m.staggerTimer=1.6;m.action='stagger';m.actionTimer=1.6;spawnVisualBurst(m.x,m.y,28,'spark','#fff0a4');toast('ИДЕАЛЬНОЕ УКЛОНЕНИЕ! '+d.name+' открыт для контратаки · +50% урона!');}const cx=hasArena?m.arenaX:m.territoryX,cy=hasArena?m.arenaY:m.territoryY,limit=hasArena?arenaRadius:Math.max(10*TILE,Number(m.territoryRadius)||12*TILE),vx=m.x-cx,vy=m.y-cy,vd=Math.hypot(vx,vy)||1;if(vd>limit){m.x=cx+vx/vd*limit;m.y=cy+vy/vd*limit;}}}else if(bossRealmInvisibleTimer>0&&m.telegraphActive){m.telegraphActive=false;m.telegraphTimer=0;}
    }
    if(bossRealmState.kills>=5)bossRealmState.wave=Math.max(2,Math.floor(bossRealmState.kills/5)+1);
  }

  const BOSS_REALM_RELIC_BY_BOSS = {
    magma_behemoth:'\u0421\u0435\u0440\u0434\u0446\u0435 \u041f\u0435\u043f\u043b\u0430', frost_empress:'\u041a\u043e\u0440\u043e\u043d\u0430 \u041c\u043e\u0440\u043e\u0437\u0430', void_mirror:'\u0417\u0435\u0440\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u041f\u0440\u0438\u0437\u043c\u0430',
    rift_dragon:'\u0427\u0435\u0448\u0443\u044f \u0420\u0430\u0437\u043b\u043e\u043c\u043d\u043e\u0433\u043e \u0414\u0440\u0430\u043a\u043e\u043d\u0430', abyss_king:'\u041f\u0435\u0447\u0430\u0442\u044c \u0411\u0435\u0437\u0434\u043d\u044b',
    ancient_devourer:'\u041a\u043e\u0440\u0435\u043d\u044c \u0414\u0440\u0435\u0432\u043d\u0435\u0433\u043e \u041f\u043e\u0436\u0438\u0440\u0430\u0442\u0435\u043b\u044f', end_knight:'\u0417\u043d\u0430\u043a \u0420\u044b\u0446\u0430\u0440\u044f \u041a\u043e\u043d\u0446\u0430',
    astral_god:'\u0410\u0441\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u041e\u0440\u0435\u043e\u043b', chronos_god:'\u041f\u0435\u0441\u043e\u0447\u043d\u044b\u0435 \u0427\u0430\u0441\u044b \u0425\u0440\u043e\u043d\u043e\u0441\u0430',
    worldbreaker_colossus:'\u042f\u0434\u0440\u043e \u0420\u0430\u0437\u0440\u0443\u0448\u0438\u0442\u0435\u043b\u044f \u041c\u0438\u0440\u043e\u0432',forest_king:'Сердце Древнего Леса'
  };
  const ARTIFACT_EVOLUTION_COSTS=[{shards:2,essence:1},{shards:4,essence:2},{shards:7,essence:3}];
  function artifactEvolutionLevel(name=equipment.artifact){return Math.max(0,Math.min(3,Math.floor(Number(artifactProgression.levels?.[name])||0)));}
  function normalizeArtifactProgression(value){const names=['Око архивариуса','Печать времени','Сердце корней','Камень эха','Клык титана','Сфера жизни'];const levels={};for(const name of names)levels[name]=Math.max(0,Math.min(3,Math.floor(Number(value?.levels?.[name])||0)));const now=Date.now();return {levels,awakeningCooldownUntil:Math.max(0,Math.min(now+120000,Number(value?.awakeningCooldownUntil)||0)),wardUntil:Math.max(0,Math.min(now+15000,Number(value?.wardUntil)||0)),berserkUntil:Math.max(0,Math.min(now+15000,Number(value?.berserkUntil)||0))};}
  function upgradeEquippedArtifact(){const name=equipment.artifact;if(!name){toast('Сначала надень найденный артефакт.');return false;}const level=artifactEvolutionLevel(name);if(level>=3){toast(name+' уже достиг максимальной эволюции.');return false;}const cost=ARTIFACT_EVOLUTION_COSTS[level];if(itemCount('Осколок пробуждения')<cost.shards||itemCount('Эссенция глубин')<cost.essence){toast('Для эволюции '+name+' нужно: '+cost.shards+' осколка пробуждения и '+cost.essence+' эссенции глубин.');return false;}changeItem('Осколок пробуждения',-cost.shards);changeItem('Эссенция глубин',-cost.essence);artifactProgression.levels[name]=level+1;saveGame();renderEquipmentPanel();renderInventory();spawnVisualBurst(player.x,player.y,30,'spark','#b9a2ff');toast('ЭВОЛЮЦИЯ АРТЕФАКТА · '+name+' · уровень '+(level+1)+'/3!');return true;}
  function bossRealmRelicTotals(){
    const count=name=>Math.max(0,Number(inventoryItems.find(item=>item.name===name)?.count)||0),level=artifactEvolutionLevel(),sets=armorSetBonuses();
    const damage=count('Сердце Пепла')*.07+count('Зеркальная Призма')*.04+count('Печать Бездны')*.06+count('Знак Рыцаря Конца')*.06+count('Астральный Ореол')*.08+count('Песочные Часы Хроноса')*.04+count('Ядро Разрушителя Миров')*.12+count('Сердце Древнего Леса')*.14;
    const defense=count('Корона Мороза')*.04+count('Чешуя Разломного Дракона')*.05+count('Корень Древнего Пожирателя')*.05+count('Песочные Часы Хроноса')*.03+count('Ядро Разрушителя Миров')*.05+count('Сердце Древнего Леса')*.07;
    return {
      damage:Math.min(.65,damage+(equipment.artifact==='Око архивариуса'?.12:equipment.artifact==='Камень эха'?.08:equipment.artifact==='Клык титана'?.10:0)+(equipment.artifact==='Камень эха'&&equipment.helmet==='Корона живого корня'?.04:0)+level*.025+(Date.now()<artifactProgression.berserkUntil?.18:0)),
      defense:Math.min(.30,defense+(equipment.artifact==='Сердце корней'?.10:equipment.artifact==='Печать времени'?.05:equipment.artifact==='Сфера жизни'?.06:0)+(equipment.artifact==='Сердце корней'&&equipment.armor==='Доспехи корневого стража'?.03:0)+(equipment.artifact==='Печать времени'&&equipment.helmet==='Диадема эха'?.03:0)+level*.015),
      crit:Math.min(.16,count('Зеркальная Призма')*.04+(equipment.artifact==='Око архивариуса'?.04:equipment.artifact==='Печать времени'?.02:equipment.artifact==='Камень эха'?.06:equipment.artifact==='Клык титана'?.03:0)+(equipment.artifact==='Око архивариуса'&&equipment.armor==='Мантия архивариуса'?.03:0)+level*.01+(sets.archive?.02:0))
    };
  }
  function applyArtifactKillEffects(){
    if(player.hp<=0||immortal)return;
    let healing=equipment.artifact==='Сердце корней'?6:equipment.artifact==='Сфера жизни'?4:0;
    healing+=artifactEvolutionLevel()*2;
    if(equipment.artifact==='Сердце корней'&&equipment.armor==='Доспехи корневого стража')healing+=2;
    if(armorSetBonuses().root)healing+=3;
    if(healing>0&&player.hp<100){const before=player.hp;player.hp=Math.min(100,player.hp+healing);if(player.hp>before){updateVitals();spawnVisualBurst(player.x,player.y,12,'spark',equipment.artifact==='Сфера жизни'?'#9cecff':'#8effa4');}}
  }
  function bossRealmArenaTheme(){
    const active=monsters.find(m=>m.bossRealmCreature&&m.hp>0&&['boss','god'].includes(BOSS_REALM_CREATURES[m.realmType]?.tier));
    const id=active?.realmType||'';
    if(['magma_behemoth','rift_dragon','abyss_king','end_knight','worldbreaker_colossus'].includes(id))return 'infernal';
    if(id==='frost_empress')return 'glacier';
    if(['ancient_devourer','void_mirror'].includes(id))return 'blood';
    if(['astral_god','chronos_god'].includes(id))return 'astral';if(id==='forest_king')return 'forest';
    return ['infernal','glacier','blood','astral'][(Math.max(1,bossRealmState.wave)-1)%4];
  }
  function ensureBossRealmDungeonSites(){
    if(!bossRealmMode)return [];
    const existing=Array.isArray(bossRealmState.dungeonSites)?bossRealmState.dungeonSites:[];
    const clamp=(v,max)=>Math.max(TILE*5,Math.min(max-TILE*5,v));
    const specs=[
      {id:'forge',name:'Пепельная кузня',theme:'infernal',bossId:'magma_behemoth',dx:-16,dy:12},
      {id:'glacier',name:'Ледяной колизей',theme:'glacier',bossId:'frost_empress',dx:16,dy:12},
      {id:'temple',name:'Храм вечности',theme:'blood',bossId:'void_mirror',dx:-16,dy:-12},
      {id:'astral',name:'Астральный круг',theme:'astral',bossId:'astral_god',dx:16,dy:-12}
    ];
    const alreadyReady=existing.length===specs.length&&specs.every(spec=>{
      const site=existing.find(v=>v&&v.id===spec.id);
      return !!site&&site.layoutVersion===2&&site.name===spec.name&&site.theme===spec.theme&&
        BOSS_REALM_CREATURES[site.bossId]&&Number.isFinite(site.x)&&Number.isFinite(site.y)&&
        typeof site.active==='boolean'&&typeof site.complete==='boolean'&&
        Number.isInteger(site.remaining)&&site.remaining>=0&&site.remaining<=3&&
        Number.isInteger(site.rematches)&&site.rematches>=0&&site.rematches<=50;
    });
    if(alreadyReady)return existing;
    const oldAnchors=existing.filter(v=>Number.isFinite(v?.x)&&Number.isFinite(v?.y));
    const anchorX=Math.max(24*TILE,Math.min((COLS-24)*TILE,oldAnchors.length?oldAnchors.reduce((sum,v)=>sum+v.x,0)/oldAnchors.length:player.x));
    const anchorY=Math.max(20*TILE,Math.min((ROWS-20)*TILE,oldAnchors.length?oldAnchors.reduce((sum,v)=>sum+v.y,0)/oldAnchors.length:player.y));
    const clampSite=(v,max)=>Math.max(TILE*8,Math.min(max-TILE*8,v));
    let changed=existing.length!==specs.length;
    const sites=specs.map(spec=>{
      const old=existing.find(v=>v&&v.id===spec.id);
      const site={
        id:spec.id,name:spec.name,theme:spec.theme,bossId:old&&BOSS_REALM_CREATURES[old.bossId]?old.bossId:spec.bossId,
        x:old?.layoutVersion===2&&Number.isFinite(old.x)?clampSite(old.x,COLS*TILE):clampSite(anchorX+spec.dx*TILE,COLS*TILE),
        y:old?.layoutVersion===2&&Number.isFinite(old.y)?clampSite(old.y,ROWS*TILE):clampSite(anchorY+spec.dy*TILE,ROWS*TILE),
        layoutVersion:2,
        active:!!old?.active,complete:!!old?.complete,
        remaining:Math.max(0,Math.min(3,Math.floor(Number(old?.remaining)||0))),
        rematches:Math.max(0,Math.min(50,Math.floor(Number(old?.rematches)||0)))
      };
      if(!old||old.layoutVersion!==2||old.name!==site.name||old.theme!==site.theme||old.bossId!==site.bossId||old.x!==site.x||old.y!==site.y||!!old.active!==site.active||!!old.complete!==site.complete||Number(old.remaining)!==site.remaining||Number(old.rematches)!==site.rematches)changed=true;
      return site;
    });
    bossRealmState.dungeonSites=sites;
    if(changed)saveGame();
    return sites;
  }
  function spawnBossRealmDungeonFinal(site,multiplier=1.2){
    if(!site||!spawnBossRealmCreature(site.bossId,site.x,site.y))return false;
    const mob=monsters[monsters.length-1];mob.realmDungeonId=site.id;mob.realmDungeonFinal=true;mob.realmDungeonMultiplier=multiplier;
    mob.maxHp=Math.round(mob.maxHp*multiplier);mob.hp=mob.maxHp;mob.damageScale*=Math.min(1.5,1+(multiplier-1)*.35);return true;
  }
  function handleBossRealmDungeonDefeat(m){
    if(!m?.realmDungeonId)return;
    const site=ensureBossRealmDungeonSites().find(v=>v.id===m.realmDungeonId);if(!site)return;
    if(m.realmDungeonFinal){site.active=false;site.complete=true;site.remaining=0;toast(site.name+' \u043e\u0447\u0438\u0449\u0435\u043d\u043e! \u041d\u0430\u0436\u043c\u0438 E \u0443 \u0430\u043b\u0442\u0430\u0440\u044f \u0434\u043b\u044f \u0443\u0441\u0438\u043b\u0435\u043d\u043d\u043e\u0433\u043e \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0433\u043e \u0431\u043e\u044f.');return;}
    if(!site.active)return;
    site.remaining=Math.max(0,(Number(site.remaining)||0)-1);
    if(site.remaining===0){
      if(!spawnBossRealmDungeonFinal(site,1.2+Math.min(.35,site.rematches*.08))){site.remaining=0;}
      else toast('\u041f\u0435\u0447\u0430\u0442\u0438 \u0440\u0430\u0437\u0440\u0443\u0448\u0435\u043d\u044b. \u0412 \u0433\u043b\u0443\u0431\u0438\u043d\u0435 \u043f\u0440\u043e\u0441\u043d\u0443\u043b\u0441\u044f \u0445\u0440\u0430\u043d\u0438\u0442\u0435\u043b\u044c!');
    }
  }
  function interactBossRealmDungeonSite(){
    if(!bossRealmMode)return false;
    const site=ensureBossRealmDungeonSites().filter(v=>Math.hypot(player.x-v.x,player.y-v.y)<76).sort((a,b)=>Math.hypot(player.x-a.x,player.y-a.y)-Math.hypot(player.x-b.x,player.y-b.y))[0];
    if(!site)return false;
    if(site.active){
      const arenaBoss=monsters.find(m=>m.bossRealmCreature&&m.realmDungeonFinal&&m.realmDungeonId===site.id&&m.hp>0);
      toast(arenaBoss?(BOSS_REALM_CREATURES[arenaBoss.realmType]?.name||'Главарь')+' уже находится на арене. Войди внутрь и вступи в бой.':'Испытание уже идёт — победи всех стражей.');
      return true;
    }
    if(bossRealmCreatureCount()>8){toast('\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u043e\u0431\u0435\u0434\u0438 \u0447\u0430\u0441\u0442\u044c \u0441\u0443\u0449\u0435\u0441\u0442\u0432 \u0440\u044f\u0434\u043e\u043c, \u0447\u0442\u043e\u0431\u044b \u043e\u0441\u0432\u043e\u0431\u043e\u0434\u0438\u0442\u044c \u043c\u0435\u0441\u0442\u043e \u0434\u043b\u044f \u0438\u0441\u043f\u044b\u0442\u0430\u043d\u0438\u044f.');return true;}
    if(site.complete){
      site.rematches=Math.min(50,(site.rematches||0)+1);site.active=true;
      if(!spawnBossRealmDungeonFinal(site,Math.min(2.6,1.45+site.rematches*.18))){site.active=false;toast('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0431\u0443\u0434\u0438\u0442\u044c \u0445\u0440\u0430\u043d\u0438\u0442\u0435\u043b\u044f. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437.');}
      else toast('\u041f\u041e\u0412\u0422\u041e\u0420\u041d\u042b\u0419 \u0411\u041e\u0419 \xb7 '+site.name+' \xb7 \u0441\u0438\u043b\u0430 \u0445\u0440\u0430\u043d\u0438\u0442\u0435\u043b\u044f \xd7'+(1.45+site.rematches*.18).toFixed(2));
    }else{
      site.active=true;site.remaining=3;
      const packs={
        forge:['ash_spirit','stone_guardian','blood_berserker'],
        glacier:['cursed_skull','stone_guardian','rift_archer'],
        temple:['rift_archer','cursed_skull','rift_warden'],
        astral:['shadow_hunter','rift_wolf','ash_spirit']
      };
      const pack=packs[site.id]||packs.forge;
      for(let i=0;i<pack.length;i++)if(spawnBossRealmCreature(pack[i],site.x+(i-1)*74,site.y+45))monsters[monsters.length-1].realmDungeonId=site.id;
      toast(site.name+' \u043e\u0442\u043a\u0440\u044b\u0442\u0430! \u041f\u043e\u0431\u0435\u0434\u0438 \u0442\u0440\u0451\u0445 \u0441\u0442\u0440\u0430\u0436\u0435\u0439, \u0437\u0430\u0442\u0435\u043c \u0445\u0440\u0430\u043d\u0438\u0442\u0435\u043b\u044f.');
    }
    saveGame();return true;
  }
  function drawBossRealmAwakeningArena(camX,camY,time){
    const theme=bossRealmArenaTheme();
    const active=monsters.find(m=>m.bossRealmCreature&&m.hp>0&&['boss','god'].includes(BOSS_REALM_CREATURES[m.realmType]?.tier));
    const siteId=active?.arenaId||({infernal:'forge',glacier:'glacier',blood:'temple',astral:'astral'}[theme]||'forge');
    const arenaSite=ensureBossRealmDungeonSites().find(site=>site.id===siteId);
    const wx=arenaSite?arenaSite.x:(active?.arenaX??active?.x??player.x);
    const wy=arenaSite?arenaSite.y:(active?.arenaY??active?.y??player.y);
    const x=wx-camX,y=wy-camY;
    ctx.save();
    if(x>-360&&x<width+360&&y>-320&&y<height+320){
      if(theme==='infernal'){
        const pulse=.5+.5*Math.sin(time/260);
        ctx.translate(x,y+34);
        ctx.fillStyle='#08080d';ctx.beginPath();ctx.ellipse(0,24,190,79,.02,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#4d2020';ctx.lineWidth=15;ctx.beginPath();ctx.ellipse(0,21,176,67,-.04,0,Math.PI*2);ctx.stroke();
        const lava=ctx.createRadialGradient(-18,-8,8,0,22,164);lava.addColorStop(0,'#ffcf63');lava.addColorStop(.28,'#ff6a22');lava.addColorStop(.7,'#c52f19');lava.addColorStop(1,'#45121b');
        ctx.fillStyle=lava;ctx.beginPath();ctx.ellipse(0,23,158,52,.01,0,Math.PI*2);ctx.fill();
        for(let i=0;i<8;i++){const a=i*.785,rr=85+(i%3)*24;ctx.strokeStyle=i%2?'#ffbd50':'#ff4a20';ctx.globalAlpha=.55+.3*pulse;ctx.lineWidth=4+(i%2)*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr*.32+23);ctx.quadraticCurveTo(Math.cos(a+.18)*130,Math.sin(a+.18)*70+23,Math.cos(a+.4)*190,Math.sin(a+.4)*82+23);ctx.stroke();}
        for(let i=0;i<6;i++){const bx=Math.sin(time/450+i*2.1)*110,by=12+Math.cos(time/390+i)*17;ctx.fillStyle='#ffe8a0';ctx.globalAlpha=.6+.4*Math.sin(time/170+i);ctx.beginPath();ctx.arc(bx,by,2+(i%3),0,Math.PI*2);ctx.fill();}
        ctx.globalAlpha=1;ctx.restore();ctx.save();ctx.translate(x,y);
        for(let i=0;i<5;i++){const a=i*1.25+time/850,ex=Math.cos(a)*205,ey=Math.sin(a)*88;ctx.fillStyle='#17151e';ctx.beginPath();ctx.moveTo(ex-17,ey+24);ctx.lineTo(ex-9,ey-32-(i%2)*24);ctx.lineTo(ex+2,ey-48-(i%2)*22);ctx.lineTo(ex+12,ey-19);ctx.lineTo(ex+24,ey+24);ctx.closePath();ctx.fill();ctx.strokeStyle='#ff7936';ctx.lineWidth=2;ctx.stroke();}
      }else if(theme==='glacier'){
        ctx.translate(x,y+20);ctx.fillStyle='rgba(16,48,72,.72)';ctx.beginPath();ctx.ellipse(0,25,178,66,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8deaff';ctx.globalAlpha=.55;ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,21,165,55,0,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<11;i++){const a=i*.57+time/1900,rr=115+(i%3)*24,px=Math.cos(a)*rr,py= Math.sin(a)*rr*.34;ctx.fillStyle='#9cecff';ctx.globalAlpha=.3+.3*Math.sin(time/240+i);ctx.beginPath();ctx.moveTo(px-10,py+25);ctx.lineTo(px,py-42-(i%3)*13);ctx.lineTo(px+9,py+25);ctx.closePath();ctx.fill();}
        ctx.globalAlpha=1;
      }else if(theme==='blood'){
        ctx.translate(x,y+30);ctx.fillStyle='#100b18';ctx.beginPath();ctx.ellipse(0,19,174,62,-.03,0,Math.PI*2);ctx.fill();const blood=ctx.createRadialGradient(0,12,5,0,19,160);blood.addColorStop(0,'#b52f50');blood.addColorStop(.7,'#6e1739');blood.addColorStop(1,'#260f25');ctx.fillStyle=blood;ctx.beginPath();ctx.ellipse(0,17,151,43,-.03,0,Math.PI*2);ctx.fill();
        for(let i=0;i<6;i++){const a=i*1.047+time/1800,px=Math.cos(a)*190,py=Math.sin(a)*66;ctx.fillStyle='#28202e';ctx.fillRect(px-12,py-56,24,82);ctx.fillStyle='#9b526b';ctx.fillRect(px-16,py-58,32,7);ctx.globalAlpha=.5+.3*Math.sin(time/240+i);ctx.strokeStyle='#f16b86';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(px,py+12,18+Math.sin(time/170+i)*4,5,0,0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha=1;
      }else{
        ctx.translate(x,y+12);ctx.strokeStyle='#a9a0ff';ctx.lineWidth=4;ctx.globalAlpha=.45+.2*Math.sin(time/250);ctx.shadowColor='#9e91ff';ctx.shadowBlur=22;ctx.beginPath();ctx.ellipse(0,18,172,62,time/2200,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(0,18,125,42,-time/1900,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
        for(let i=0;i<9;i++){const a=time/900+i*Math.PI*2/9,px=Math.cos(a)*190,py=18+Math.sin(a)*68;ctx.fillStyle=i%2?'#c9c3ff':'#ffe6a6';ctx.beginPath();ctx.moveTo(px,py-15);ctx.lineTo(px+7,py);ctx.lineTo(px,py+15);ctx.lineTo(px-7,py);ctx.closePath();ctx.fill();}
        ctx.shadowBlur=0;
      }
      // Shared engraved perimeter ties the four existing arenas together without adding new structures or gameplay objects.
      const ringColor=theme==='infernal'?'#ff8b51':theme==='glacier'?'#9cecff':theme==='blood'?'#e979a6':'#b2a6ff';
      const ringPulse=.5+.5*Math.sin(time/430);
      ctx.save();ctx.translate(x,y+22);ctx.globalAlpha=.2+.11*ringPulse;ctx.strokeStyle=ringColor;ctx.lineWidth=2;
      ctx.shadowColor=ringColor;ctx.shadowBlur=5+ringPulse*5;ctx.setLineDash([12,9,3,11]);
      for(const scale of [1,.88,.73]){ctx.beginPath();ctx.ellipse(0,0,174*scale,58*scale,0,0,Math.PI*2);ctx.stroke();}
      ctx.setLineDash([]);ctx.lineWidth=1.5;
      for(let i=0;i<8;i++){const a=i*Math.PI/4+time/650,rx=Math.cos(a),ry=Math.sin(a);ctx.beginPath();ctx.moveTo(rx*132,ry*44);ctx.lineTo(rx*151,ry*50);ctx.stroke();}
      ctx.restore();
    }
    ctx.restore();
    if(theme==='glacier'){
      ctx.save();for(let i=0;i<28;i++){const px=(i*97+time*(.018+(i%4)*.004))%(width+30)-15,py=(i*53+time*(.025+(i%5)*.006))%(height+20)-10;ctx.globalAlpha=.22+.35*(i%4)/4;ctx.fillStyle='#d9f8ff';ctx.beginPath();ctx.arc(px,py,1+(i%3)*.6,0,Math.PI*2);ctx.fill();}ctx.restore();
    }else if(theme==='infernal'){
      ctx.save();for(let i=0;i<18;i++){const px=(i*83+time*(.025+(i%3)*.009))%(width+20)-10,py=(height-(i*59+time*(.04+(i%4)*.007))%(height+20));ctx.globalAlpha=.2+.35*(i%3)/3;ctx.fillStyle=i%2?'#ffb04b':'#ff5b30';ctx.beginPath();ctx.arc(px,py,1.5+(i%3),0,Math.PI*2);ctx.fill();}ctx.restore();
    }
    const sites=ensureBossRealmDungeonSites();
    for(const site of sites){
      const sx=site.x-camX,sy=site.y-camY;if(sx<-90||sx>width+90||sy<-100||sy>height+100)continue;
      const sitePhase=({forge:0,glacier:1.2,temple:2.4,astral:3.6}[site.id]||0),pulse=.5+.5*Math.sin(time/260+sitePhase),color=site.complete?'#8ce9bd':({forge:'#ff9b54',glacier:'#92eaff',temple:'#e979a6',astral:'#ad9cff'}[site.id]||'#92eaff');
      ctx.save();ctx.translate(sx,sy);ctx.fillStyle='#080b15bb';ctx.beginPath();ctx.ellipse(0,20,47,15,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#302d43';ctx.fillRect(-34,-19,12,43);ctx.fillRect(22,-19,12,43);ctx.fillRect(-39,-25,78,10);
      ctx.strokeStyle=color;ctx.lineWidth=4;ctx.shadowColor=color;ctx.shadowBlur=17+12*pulse;ctx.beginPath();ctx.ellipse(0,-3,22,34,0,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=site.active?'#3b203b':'#111b30';ctx.beginPath();ctx.ellipse(0,-3,16,27,0,0,Math.PI*2);ctx.fill();
      for(let i=0;i<4;i++){const a=time/700+i*Math.PI/2;ctx.fillStyle=color;ctx.globalAlpha=.6+.4*pulse;ctx.beginPath();ctx.arc(Math.cos(a)*29,Math.sin(a)*26-3,3,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;ctx.textAlign='center';ctx.font='900 10px Segoe UI';ctx.fillStyle='#fff';ctx.shadowBlur=5;ctx.fillText(site.name,0,-47);ctx.font='bold 9px Segoe UI';ctx.fillStyle=color;ctx.fillText(site.complete?'E \xb7 \u041f\u041e\u0412\u0422\u041e\u0420\u041d\u042b\u0419 \u0411\u041e\u0419':site.active?(site.remaining>0?'\u0418\u0421\u041f\u042b\u0422\u0410\u041d\u0418\u0415 \u0418\u0414\u0401\u0422':'\u0411\u041e\u0421\u0421 \u041d\u0410 \u0410\u0420\u0415\u041d\u0415'):'E \xb7 \u0412\u041e\u0419\u0422\u0418',0,48);ctx.restore();
    }
  }
  function drawBossRealmAwakeningCreature(m,x,y,time,d,z){
    const tier=d.tier,elite=tier!=='mob',pulse=.5+.5*Math.sin(time/170+m.phase),blink=Math.sin(time/1050+m.phase*3)>0.992?.22:1;
    ctx.save();
    if(elite){
      // Animated layered mantle, shoulder plates, engraved chest and limb joints.
      ctx.globalAlpha=.9;ctx.fillStyle='#090b19';ctx.beginPath();ctx.moveTo(-10,-5);ctx.quadraticCurveTo(-20,12,-25,35+Math.sin(time/120+m.phase)*4);ctx.lineTo(0,24);ctx.lineTo(25,35-Math.sin(time/120+m.phase)*4);ctx.quadraticCurveTo(20,12,10,-5);ctx.closePath();ctx.fill();
      ctx.globalAlpha=1;ctx.fillStyle='#b9a6d7';ctx.strokeStyle=d.eyes;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(-22,-13);ctx.lineTo(-17,-2);ctx.lineTo(-8,2);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(10,-7);ctx.lineTo(22,-13);ctx.lineTo(17,-2);ctx.lineTo(8,2);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle=d.eyes;ctx.globalAlpha=.7;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-7,1);ctx.lineTo(0,10);ctx.lineTo(7,1);ctx.moveTo(0,10);ctx.lineTo(0,19);ctx.stroke();ctx.globalAlpha=1;
    }
    // Distinct, layered eyes with iris, pupil, reflected highlights and animated blink.
    const eyeY=-19,eyeX=d.size>2?7:6,eyeR=d.size>2?5.3:3.3;
    for(const side of [-1,1]){
      ctx.save();ctx.translate(side*eyeX,eyeY);ctx.scale(1,blink);
      ctx.fillStyle='#080711';ctx.beginPath();ctx.ellipse(0,0,eyeR+2,eyeR+1.7,0,0,Math.PI*2);ctx.fill();
      ctx.shadowColor=d.eyes;ctx.shadowBlur=gameSettings.graphicsQuality==='low'?0:18;ctx.fillStyle=d.eyes;ctx.beginPath();ctx.ellipse(0,0,eyeR,eyeR*.78,0,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle='#10101b';ctx.beginPath();ctx.ellipse(.8,.2,eyeR*.32,eyeR*.65,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-eyeR*.3,-eyeR*.3,Math.max(1,eyeR*.22),0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.strokeStyle='#171322';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-13,-25);ctx.lineTo(-4,-23);ctx.moveTo(4,-23);ctx.lineTo(13,-25);ctx.stroke();
    if(m.phaseStage>=2){ctx.strokeStyle=d.eyes;ctx.globalAlpha=.45+.35*pulse;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-3,31+pulse*4,Math.PI*.08,Math.PI*.92);ctx.stroke();ctx.globalAlpha=1;}
    if(m.realmType==='abyss_king'){
      ctx.fillStyle='#27203c';ctx.strokeStyle='#d4b76f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-16,-27);ctx.lineTo(-18,-48);ctx.lineTo(-7,-38);ctx.lineTo(0,-54);ctx.lineTo(8,-38);ctx.lineTo(19,-48);ctx.lineTo(16,-27);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#ff6eae';ctx.shadowColor='#ff6eae';ctx.shadowBlur=14;ctx.beginPath();ctx.arc(0,-39,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='#a88acb';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-18+i*18,11);ctx.lineTo(-10+i*10,23);ctx.stroke();}
    }else if(m.realmType==='rift_dragon'){
      const flap=Math.sin(time/115+m.phase)*12;
      for(const side of [-1,1]){ctx.fillStyle='#3c2026';ctx.strokeStyle='#e98c58';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(side*7,-2);ctx.quadraticCurveTo(side*25,-31-flap,side*42,-37-flap);ctx.lineTo(side*31,-4);ctx.lineTo(side*13,12);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#f3a16a';ctx.beginPath();ctx.moveTo(side*14,2);ctx.lineTo(side*37,-31-flap);ctx.stroke();}
      ctx.fillStyle='#ef8f58';ctx.beginPath();ctx.ellipse(0,-9,11,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#20101a';ctx.fillRect(-4,-7,8,3);
      ctx.strokeStyle='#ffb75d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-8,-25);ctx.lineTo(-17,-40);ctx.moveTo(8,-25);ctx.lineTo(17,-40);ctx.stroke();
    }else if(m.realmType==='ancient_devourer'){
      for(let i=0;i<6;i++){const side=i%2?1:-1,yy=-2+(i%3)*8,wave=Math.sin(time/180+i+m.phase)*8;ctx.strokeStyle=i%2?'#9bd46b':'#567b3d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(side*8,yy);ctx.bezierCurveTo(side*25,yy-18+wave,side*(34+wave),yy+18,side*(42+wave),yy-7);ctx.stroke();ctx.fillStyle=d.eyes;ctx.beginPath();ctx.arc(side*(42+wave),yy-7,2.5,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#16131d';ctx.beginPath();ctx.ellipse(0,5,12,10,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c9ff76';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,5,8,0,Math.PI*2);ctx.stroke();
    }else if(m.realmType==='end_knight'){
      ctx.fillStyle='#9aa7b8';ctx.strokeStyle='#e8e2cf';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,-12);ctx.lineTo(-11,-31);ctx.lineTo(0,-38);ctx.lineTo(11,-31);ctx.lineTo(14,-12);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#171d2b';ctx.fillRect(-10,-22,20,5);ctx.fillStyle=d.eyes;ctx.fillRect(-7,-21,5,2);ctx.fillRect(2,-21,5,2);
      ctx.strokeStyle='#d8dfeb';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(19,-3);ctx.lineTo(30,22);ctx.stroke();ctx.strokeStyle='#f3d889';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(13,5);ctx.lineTo(25,-1);ctx.stroke();
    }else if(m.realmType==='astral_god'){
      ctx.strokeStyle='#ffdf92';ctx.lineWidth=2;ctx.shadowColor='#ffdf92';ctx.shadowBlur=16;ctx.beginPath();ctx.ellipse(0,-24,27,8,time/1400,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(0,-24,12,31,-time/1800,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
      for(let i=0;i<5;i++){const a=time/600+i*1.256;ctx.fillStyle=i%2?'#fff0bd':'#a9f4ff';ctx.beginPath();ctx.arc(Math.cos(a)*34,-19+Math.sin(a)*23,1.6,0,Math.PI*2);ctx.fill();}
    }else if(m.realmType==='chronos_god'){
      ctx.strokeStyle='#b9f1ff';ctx.lineWidth=2.5;ctx.shadowColor='#73dfff';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(0,-20,31,time/1200,time/1200+Math.PI*1.8);ctx.stroke();ctx.shadowBlur=0;
      ctx.strokeStyle='#f5d98c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-20,18,0,Math.PI*2);ctx.moveTo(0,-20);ctx.lineTo(Math.sin(time/700)*8,-31-Math.cos(time/700)*8);ctx.moveTo(0,-20);ctx.lineTo(9*Math.cos(time/1300),-20+9*Math.sin(time/1300));ctx.stroke();
      for(let i=0;i<4;i++){const a=-time/850+i*Math.PI/2;ctx.fillStyle='#8cecff';ctx.beginPath();ctx.moveTo(Math.cos(a)*39,Math.sin(a)*25-20);ctx.lineTo(Math.cos(a)*48,Math.sin(a)*32-20);ctx.lineTo(Math.cos(a)*39+3,Math.sin(a)*25-14);ctx.closePath();ctx.fill();}
    }else if(m.realmType==='magma_behemoth'||m.realmType==='worldbreaker_colossus'){
      ctx.fillStyle='#272532';ctx.strokeStyle='#ff8a46';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-19,-7);ctx.lineTo(-16,-31);ctx.lineTo(-7,-24);ctx.lineTo(0,-39);ctx.lineTo(8,-24);ctx.lineTo(17,-31);ctx.lineTo(20,-7);ctx.closePath();ctx.fill();ctx.stroke();
      for(let i=0;i<5;i++){const xx=-12+i*6;ctx.strokeStyle=i%2?'#ffbd59':'#ff5c2f';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(xx,0);ctx.lineTo(xx+Math.sin(time/200+i)*3,17);ctx.stroke();}
      ctx.fillStyle='#ffb65a';ctx.shadowColor='#ff6a2b';ctx.shadowBlur=13;ctx.beginPath();ctx.arc(0,4,5+Math.sin(time/130)*1.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }else if(m.realmType==='forest_king'){
       const sway=Math.sin(time/185+m.phase)*8,pulse=.5+.5*Math.sin(time/115);
       ctx.strokeStyle='#5d873f';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-13,7);ctx.bezierCurveTo(-36,-2,-38,-28,-57,-42+sway);ctx.moveTo(13,7);ctx.bezierCurveTo(36,-2,38,-28,57,-42-sway);ctx.stroke();
       ctx.strokeStyle='#b5dc79';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-20,-10);ctx.lineTo(-36,-31);ctx.lineTo(-45,-25);ctx.moveTo(-36,-31);ctx.lineTo(-34,-47);ctx.moveTo(20,-10);ctx.lineTo(37,-31);ctx.lineTo(46,-24);ctx.moveTo(37,-31);ctx.lineTo(36,-49);ctx.stroke();
       ctx.fillStyle='#382a1f';ctx.strokeStyle='#9cb65b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-24,-16);ctx.lineTo(-18,-42);ctx.lineTo(0,-54);ctx.lineTo(18,-42);ctx.lineTo(24,-16);ctx.lineTo(17,19);ctx.lineTo(-17,19);ctx.closePath();ctx.fill();ctx.stroke();
       ctx.fillStyle='#6e8444';ctx.beginPath();ctx.ellipse(0,-43,22,11,0,0,Math.PI*2);ctx.fill();
       ctx.strokeStyle='#8dbf55';ctx.lineWidth=4;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*12,8);ctx.quadraticCurveTo(side*26,18+sway,side*37,34);ctx.stroke();ctx.beginPath();ctx.moveTo(side*5,15);ctx.lineTo(side*10,37);ctx.stroke();}
       ctx.shadowColor='#b5f76c';ctx.shadowBlur=18;ctx.fillStyle='#b5f76c';ctx.globalAlpha=.7+.25*pulse;ctx.beginPath();ctx.arc(0,-20,8+pulse*2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.shadowBlur=0;
       for(let i=0;i<9;i++){const a=time/360+i*Math.PI*2/9;ctx.fillStyle=i%2?'#c8ed83':'#7cae51';ctx.beginPath();ctx.ellipse(Math.cos(a)*37,-24+Math.sin(a)*18,4,2,a,0,Math.PI*2);ctx.fill();}
     }else if(m.realmType==='frost_empress'){
      ctx.fillStyle='#d5f5ff';ctx.strokeStyle='#6fd5f1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-18,-25);ctx.lineTo(-21,-49);ctx.lineTo(-9,-39);ctx.lineTo(-2,-56);ctx.lineTo(6,-39);ctx.lineTo(20,-49);ctx.lineTo(16,-24);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle='#b7f8ff';ctx.lineWidth=3;for(let side of [-1,1]){ctx.beginPath();ctx.moveTo(side*11,-4);ctx.lineTo(side*28,9+Math.sin(time/170)*4);ctx.lineTo(side*20,24);ctx.stroke();}
      ctx.fillStyle='#e8fdff';ctx.beginPath();ctx.arc(0,-2,4,0,Math.PI*2);ctx.fill();
    }else if(m.realmType==='void_mirror'){
      ctx.fillStyle='#100d20';ctx.strokeStyle='#d59cff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,-28);ctx.lineTo(0,-43);ctx.lineTo(14,-28);ctx.lineTo(13,17);ctx.lineTo(-13,17);ctx.closePath();ctx.fill();ctx.stroke();
      for(let i=0;i<5;i++){const a=time/450+i*Math.PI*2/5;ctx.save();ctx.translate(Math.cos(a)*34,Math.sin(a)*23-10);ctx.rotate(a);ctx.fillStyle='#c89eff';ctx.globalAlpha=.55+.35*pulse;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,0);ctx.lineTo(0,7);ctx.lineTo(-5,0);ctx.closePath();ctx.fill();ctx.restore();}
      ctx.fillStyle='#fff';ctx.shadowColor=d.eyes;ctx.shadowBlur=20;ctx.fillRect(-3,-18,6,2);ctx.shadowBlur=0;
    }
    if(m.raidCrystalCount>0){
      for(let i=0;i<m.raidCrystalCount;i++){const a=time/430+i*Math.PI*2/3,px=Math.cos(a)*49,py=-13+Math.sin(a)*27;ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.fillStyle='#ffe49a';ctx.strokeStyle='#fff6cb';ctx.lineWidth=1.5;ctx.shadowColor='#ffd46c';ctx.shadowBlur=15;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,0);ctx.lineTo(0,9);ctx.lineTo(-6,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    }
    if(m.action==='cast'||m.telegraphActive){ctx.strokeStyle=d.eyes;ctx.globalAlpha=.5+.4*pulse;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,39+pulse*8,time/300,time/300+Math.PI*1.55);ctx.stroke();}
    ctx.restore();
  }

  function drawBossRealmCombatFX(m,time,d){
    const tier=d.tier,skill=d.skill,quality=gameSettings.graphicsQuality,glow=d.eyes,pulse=.5+.5*Math.sin(time/125+(m.phase||0));
    if(tier==='boss'||tier==='god'){
      ctx.save();ctx.globalAlpha=(tier==='god'?.22:.15)+pulse*.12;ctx.strokeStyle=glow;ctx.lineWidth=1.4;ctx.shadowColor=glow;ctx.shadowBlur=quality==='low'?0:10;
      for(let i=0;i<3;i++){const a=time/(tier==='god'?680:920)*(i%2?-1:1)+(m.phase||0)+i*2.1;ctx.beginPath();ctx.ellipse(0,-2,29+i*8,9+i*3,a,0,Math.PI*1.65);ctx.stroke();}
      ctx.shadowBlur=0;ctx.globalAlpha=1;
      if(m.phaseStage>=2){ctx.globalAlpha=.45+.25*pulse;ctx.lineWidth=2;for(let i=0;i<6;i++){const a=i*Math.PI/3+time/420,r=38+(i%2)*7;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.58-4);ctx.lineTo(Math.cos(a)*(r+10),Math.sin(a)*(r+10)*.58-4);ctx.stroke();}ctx.globalAlpha=1;}
      if(m.phaseStage>=3){ctx.globalAlpha=.65+.2*pulse;ctx.lineWidth=2.4;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(0,-4,47+Math.sin(time/75)*3,time/330,time/330+Math.PI*1.75);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
      ctx.restore();
    }
    if(m.telegraphActive){
      const remaining=Math.max(0,Math.min(1,m.telegraphTimer/(tier==='god'?1.15:tier==='boss'?1.05:.82))),warn=tier==='god'?'#fff0a4':glow;
      ctx.save();ctx.globalAlpha=.2+.22*Math.sin(time/42);ctx.fillStyle=warn;ctx.beginPath();ctx.ellipse(0,14,37+(1-remaining)*28,15+(1-remaining)*10,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.85;ctx.strokeStyle=warn;ctx.lineWidth=2.5;ctx.shadowColor=warn;ctx.shadowBlur=quality==='low'?0:14;ctx.beginPath();ctx.ellipse(0,14,36+(1-remaining)*30,15+(1-remaining)*11,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
      if(['dragon','knight','dash','teleport'].includes(skill)){ctx.rotate(Number(m.telegraphFacing)||0);ctx.globalAlpha=.16+.22*(1-remaining);ctx.fillStyle=warn;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,88,-.34,.34);ctx.closePath();ctx.fill();ctx.strokeStyle=warn;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(88,0);ctx.stroke();}
      else{ctx.globalAlpha=.8;ctx.strokeStyle=warn;ctx.lineWidth=1.5;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(0,14,52+(1-remaining)*42,-Math.PI*.1,Math.PI*1.1);ctx.stroke();ctx.setLineDash([]);}
      ctx.restore();
    }
    if(m.actionTimer>0){
      const duration=m.action==='slam'?.7:m.action==='dash'?.5:m.action==='teleport'?.6:m.action==='stagger'?1.6:.8,progress=1-Math.max(0,Math.min(1,m.actionTimer/duration));
      ctx.save();ctx.globalAlpha=Math.max(.12,1-progress*.78);ctx.strokeStyle=glow;ctx.fillStyle=glow;ctx.shadowColor=glow;ctx.shadowBlur=quality==='low'?0:14;ctx.lineWidth=2.2;
      if(m.action==='slam'){
        for(let ring=0;ring<3;ring++){const r=18+progress*82+ring*13;ctx.globalAlpha=(1-progress)*.65;ctx.beginPath();ctx.ellipse(0,15,r,r*.36,0,0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha=(1-progress)*.8;for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*22,15+Math.sin(a)*9);ctx.lineTo(Math.cos(a)*(44+progress*36),15+Math.sin(a)*(18+progress*13));ctx.stroke();}
      }else if(m.action==='dash'){
        for(let i=1;i<=4;i++){ctx.globalAlpha=(1-progress)*(.42-i*.07);ctx.beginPath();ctx.ellipse(-i*13,5+i*2,24+i*5,14+i*2,-.12,0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha=.8;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-25,-5);ctx.lineTo(-62,-17);ctx.moveTo(-22,7);ctx.lineTo(-58,20);ctx.stroke();
      }else if(m.action==='teleport'){
        for(let i=0;i<3;i++){ctx.globalAlpha=(1-progress)*(.65-i*.14);ctx.beginPath();ctx.ellipse(0,0,24+i*14,33+i*10,0,0,Math.PI*2);ctx.stroke();}
      }else if(m.action==='cast'){
        ctx.globalAlpha=.72;ctx.rotate(time/260);ctx.beginPath();ctx.arc(0,-8,34+progress*9,0,Math.PI*1.65);ctx.stroke();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*38,Math.sin(a)*25-8);ctx.lineTo(Math.cos(a)*49,Math.sin(a)*33-8);ctx.stroke();}
      }else if(m.action==='stagger'){
        ctx.globalAlpha=.9;ctx.strokeStyle='#fff0a4';ctx.lineWidth=2.5;for(let i=0;i<8;i++){const a=i*Math.PI/4+time/180;ctx.beginPath();ctx.moveTo(Math.cos(a)*20,Math.sin(a)*17-7);ctx.lineTo(Math.cos(a)*48,Math.sin(a)*37-7);ctx.stroke();}ctx.fillStyle='#fff5c4';ctx.beginPath();ctx.arc(0,-29,4+Math.sin(time/45)*1.5,0,Math.PI*2);ctx.fill();
      }else if(m.action==='guard'){
        ctx.globalAlpha=.75;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,-4,34,43,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*25,Math.sin(a)*32-4);ctx.lineTo(Math.cos(a)*35,Math.sin(a)*43-4);ctx.stroke();}
      }
      ctx.restore();
    }
  }
  function drawBossRealmCreature(m,x,y,time){
    const d=BOSS_REALM_CREATURES[m.realmType];if(!d)return;const z=d.size,w=Math.sin(m.animation||time/100)*3,cast=m.actionTimer>0,attackPose=m.telegraphActive?Math.sin(time/35)*2:m.action==='slam'?-8:m.action==='dash'?9:cast?-5:0;
    ctx.save();ctx.translate(x,y);ctx.scale(z,z);
    if(m.telegraphActive&&bossRealmInvisibleTimer<=0){ctx.save();ctx.globalAlpha=.5+.35*Math.sin(time/55);ctx.strokeStyle='#ff657b';ctx.lineWidth=3;ctx.shadowColor='#ff435f';ctx.shadowBlur=15;ctx.beginPath();ctx.ellipse(0,14,35+Math.sin(time/65)*4,18+Math.sin(time/65)*3,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 8px Segoe UI';ctx.textAlign='center';ctx.fillText(m.telegraphTimer.toFixed(1)+'с',0,39);ctx.restore();}
    if(m.shield>0){ctx.save();ctx.globalAlpha=.5+.18*Math.sin(time/110);ctx.strokeStyle='#8deaff';ctx.lineWidth=3;ctx.shadowColor='#8deaff';ctx.shadowBlur=13;ctx.beginPath();ctx.ellipse(0,-2,31,39,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if(['boss','god'].includes(d.tier)){ctx.shadowColor=d.eyes;ctx.shadowBlur=gameSettings.graphicsQuality==='low'?0:22;ctx.strokeStyle=d.eyes;ctx.globalAlpha=.4+.2*Math.sin(time/170);ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,-3,29,37,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    ctx.fillStyle='#080d18aa';ctx.beginPath();ctx.ellipse(0,16,20,7,0,0,Math.PI*2);ctx.fill();
    // Distinct silhouette: animated cloak, torso, articulated arms and legs, head, horns and accessories.
    ctx.fillStyle=d.color;ctx.beginPath();ctx.moveTo(-10,-5);ctx.quadraticCurveTo(-25,5,-22,24);ctx.lineTo(22,24);ctx.quadraticCurveTo(25,5,10,-5);ctx.closePath();ctx.fill();
    ctx.fillStyle=m.flash>0?'#fff':d.color;ctx.fillRect(-9,-9,18,26);
    ctx.strokeStyle='#d5c7e8';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-8,-4);ctx.quadraticCurveTo(-18,1+attackPose+w,-17,7+w+attackPose);ctx.moveTo(8,-4);ctx.quadraticCurveTo(18,1-attackPose-w,17,7-w-attackPose);ctx.stroke();
    ctx.strokeStyle='#22283a';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-5,15);ctx.lineTo(-7+Math.sin((m.animation||time/100)+Math.PI)*2,25+w);ctx.moveTo(5,15);ctx.lineTo(7+Math.sin(m.animation||time/100)*2,25-w);ctx.stroke();
    ctx.fillStyle='#d1b69b';ctx.beginPath();ctx.arc(0,-18,9,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=d.color;ctx.beginPath();ctx.moveTo(-9,-20);ctx.lineTo(-13,-34);ctx.lineTo(-3,-28);ctx.lineTo(0,-36);ctx.lineTo(4,-28);ctx.lineTo(13,-34);ctx.lineTo(9,-20);ctx.closePath();ctx.fill();
    ctx.shadowColor=d.eyes;ctx.shadowBlur=11;ctx.fillStyle=m.flash>0?'#fff':d.eyes;ctx.fillRect(-5,-20,4,3);ctx.fillRect(2,-20,4,3);ctx.shadowBlur=0;
    if(['elite','boss','god'].includes(d.tier)){ctx.strokeStyle='#e2c77f';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-13,-7);ctx.lineTo(-19,-15);ctx.moveTo(13,-7);ctx.lineTo(19,-15);ctx.stroke();ctx.fillStyle='#e6c36f';ctx.fillRect(-4,-4,8,7);}
    if(m.shield>0){ctx.strokeStyle='#8deaff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-3,26,36,0,0,Math.PI*2);ctx.stroke();}
    if(m.realmType==='rift_wolf'){ctx.fillStyle=d.color;ctx.beginPath();ctx.moveTo(-7,-23);ctx.lineTo(-14,-38);ctx.lineTo(-2,-29);ctx.moveTo(7,-23);ctx.lineTo(14,-38);ctx.lineTo(2,-29);ctx.fill();ctx.beginPath();ctx.moveTo(8,9);ctx.quadraticCurveTo(28,3,25,-12);ctx.strokeStyle=d.color;ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#fff';ctx.fillRect(5,-16,3,3);ctx.fillRect(10,-16,3,3);}
    else if(m.realmType==='cursed_skull'){ctx.fillStyle='#e2ddc9';ctx.beginPath();ctx.arc(0,-18,12,0,Math.PI*2);ctx.fill();ctx.fillStyle=d.eyes;ctx.shadowColor=d.eyes;ctx.shadowBlur=8;ctx.fillRect(-7,-21,5,5);ctx.fillRect(3,-21,5,5);ctx.fillStyle='#39313d';ctx.fillRect(-3,-12,6,3);ctx.shadowBlur=0;ctx.fillStyle='#d7d0bd';ctx.fillRect(-5,-8,10,4);}
    else if(m.realmType==='venom_beetle'){ctx.fillStyle='#243e31';ctx.beginPath();ctx.ellipse(0,2,17,14,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b9ec67';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,13);ctx.moveTo(-12,-3);ctx.lineTo(-21,-11);ctx.moveTo(12,-3);ctx.lineTo(21,-11);ctx.stroke();ctx.fillStyle=d.eyes;ctx.fillRect(-9,-9,4,3);ctx.fillRect(5,-9,4,3);}
    else if(m.realmType==='stone_guardian'){ctx.fillStyle='#9aa4aa';ctx.fillRect(-17,-8,9,12);ctx.fillRect(8,-8,9,12);ctx.fillStyle='#59636e';ctx.fillRect(-9,-5,18,19);ctx.strokeStyle='#d4dce1';ctx.lineWidth=2;ctx.strokeRect(-8,-4,16,17);}
    else if(m.realmType==='rift_archer'){ctx.strokeStyle='#d7c18a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(16,-1,15,-1.25,1.25);ctx.stroke();ctx.beginPath();ctx.moveTo(16,-15);ctx.lineTo(16,13);ctx.stroke();ctx.fillStyle='#b7c9df';ctx.fillRect(-13,-7,4,15);}
    else if(m.realmType==='fallen_warrior'||m.realmType==='end_knight'){ctx.fillStyle='#aeb9c8';ctx.fillRect(-11,-27,22,7);ctx.fillStyle='#344052';ctx.fillRect(-7,-20,14,5);ctx.strokeStyle='#dce6f0';ctx.lineWidth=3;ctx.strokeRect(-12,-7,24,15);}
    else if(m.realmType==='ash_spirit'){ctx.strokeStyle='#ffb45d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-13,10);ctx.quadraticCurveTo(-24,-4,-11,-20);ctx.moveTo(13,10);ctx.quadraticCurveTo(24,-4,11,-20);ctx.stroke();ctx.fillStyle='#ffe6a4';ctx.beginPath();ctx.arc(0,-1,4,0,Math.PI*2);ctx.fill();}
    else if(['abyss_king','astral_god','chronos_god'].includes(m.realmType)){ctx.strokeStyle=d.eyes;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-16,-29);ctx.lineTo(-12,-41);ctx.lineTo(-4,-31);ctx.lineTo(0,-44);ctx.lineTo(5,-31);ctx.lineTo(13,-41);ctx.lineTo(17,-29);ctx.stroke();ctx.fillStyle=d.eyes;ctx.beginPath();ctx.arc(0,-4,3,0,Math.PI*2);ctx.fill();}
    else if(m.realmType==='awakened_tree'){
      const sway=Math.sin(time/185+m.phase)*5,step=Math.sin(time/125+m.phase)*4;
      ctx.fillStyle='#3b2a20';ctx.beginPath();ctx.moveTo(-11,-5);ctx.lineTo(-13,17);ctx.lineTo(-8,25);ctx.lineTo(8,25);ctx.lineTo(13,17);ctx.lineTo(11,-5);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#5c3b27';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-7,18);ctx.lineTo(-12-step,29);ctx.lineTo(-18-step,31);ctx.moveTo(7,18);ctx.lineTo(12+step,29);ctx.lineTo(18+step,31);ctx.stroke();
      ctx.strokeStyle='#61402a';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-9,-2);ctx.lineTo(-22+sway,7);ctx.lineTo(-29+sway,1);ctx.moveTo(9,-2);ctx.lineTo(22-sway,7);ctx.lineTo(29-sway,1);ctx.stroke();
      ctx.fillStyle='#24553a';ctx.beginPath();ctx.arc(0,-15,17,0,Math.PI*2);ctx.arc(-13,-12,10,0,Math.PI*2);ctx.arc(13,-12,10,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#8a6038';ctx.beginPath();ctx.arc(0,-18,10,0,Math.PI*2);ctx.fill();
      ctx.shadowColor=d.eyes;ctx.shadowBlur=14;ctx.fillStyle='#ffdf76';ctx.beginPath();ctx.ellipse(-4,-19,3,4,0,0,Math.PI*2);ctx.ellipse(5,-19,3,4,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#211b17';ctx.fillRect(-1,-10,3,2);
      for(let i=0;i<4;i++){const a=time/390+i*Math.PI/2,px=Math.cos(a)*23,py=-17+Math.sin(a)*12;ctx.fillStyle=i%2?'#ffd36d':'#9be28b';ctx.globalAlpha=.6+.35*Math.sin(time/150+i);ctx.beginPath();ctx.arc(px,py,2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
      if(m.action==='slam'||m.action==='cast'){ctx.strokeStyle='#9edb80';ctx.globalAlpha=.55+.35*Math.sin(time/70);ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,12,30+Math.sin(time/60)*5,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
    else if(m.realmType==='rift_dragon'){ctx.fillStyle=d.color;ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(-34,-25);ctx.lineTo(-25,8);ctx.lineTo(-10,12);ctx.moveTo(10,-3);ctx.lineTo(34,-25);ctx.lineTo(25,8);ctx.lineTo(10,12);ctx.fill();ctx.strokeStyle='#f0a17a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-5,-23);ctx.lineTo(-13,-36);ctx.moveTo(5,-23);ctx.lineTo(13,-36);ctx.stroke();}
    if(m.action==='dash'&&m.actionTimer>0){ctx.strokeStyle=d.eyes;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-25,0);ctx.lineTo(-43,9);ctx.moveTo(25,0);ctx.lineTo(43,9);ctx.stroke();}
    drawBossRealmAwakeningCreature(m,x,y,time,d,z);
    drawBossRealmCombatFX(m,time,d);
    if(['elite','boss','god'].includes(d.tier)){
      ctx.fillStyle=m.flash>0?'#fff':d.color;ctx.strokeStyle=d.eyes;ctx.lineWidth=1.1;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*8,-5);ctx.lineTo(side*17,-1+Math.sin(time/130+m.phase)*2);ctx.lineTo(side*13,7);ctx.lineTo(side*5,5);ctx.closePath();ctx.fill();ctx.stroke();}
      ctx.strokeStyle=d.eyes;ctx.globalAlpha=.45+.25*Math.sin(time/190+m.phase);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-5,-2);ctx.lineTo(0,3);ctx.lineTo(5,-2);ctx.moveTo(-4,5);ctx.lineTo(0,9);ctx.lineTo(4,5);ctx.stroke();ctx.globalAlpha=1;
      if(m.phaseStage>=2){ctx.fillStyle=d.eyes;ctx.globalAlpha=.65;for(let i=0;i<3;i++){const a=time/360+i*Math.PI*2/3;ctx.beginPath();ctx.arc(Math.cos(a)*27,Math.sin(a)*17-6,1.8,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
    }
    ctx.restore();
    ctx.save();ctx.textAlign='center';const major=d.tier==='boss'||d.tier==='god',barW=major?(d.tier==='god'?150:126):d.tier==='elite'?76:48,barY=y-(major?54:42)*z;
    ctx.font='900 '+(d.tier==='god'?13:major?12:10)+'px Segoe UI';ctx.fillStyle=d.tier==='god'?'#ffe8a3':major?'#f5c6ff':d.tier==='elite'?'#f4d6a0':'#f4edff';ctx.shadowColor=d.eyes;ctx.shadowBlur=major?9:4;ctx.fillText(d.name,x,barY-8);ctx.shadowBlur=0;
    ctx.fillStyle='#100e1b';ctx.fillRect(x-barW/2-2,barY-2,barW+4,major?10:6);const hpGradient=ctx.createLinearGradient(x-barW/2,barY,x+barW/2,barY);hpGradient.addColorStop(0,d.color);hpGradient.addColorStop(1,d.eyes);ctx.fillStyle=hpGradient;ctx.fillRect(x-barW/2,barY,barW*Math.max(0,m.hp/m.maxHp),major?6:3);
    if(major){ctx.strokeStyle=d.eyes;ctx.globalAlpha=.8;ctx.lineWidth=1;for(const mark of [.32,.66]){ctx.beginPath();ctx.moveTo(x-barW/2+barW*mark,barY-3);ctx.lineTo(x-barW/2+barW*mark,barY+8);ctx.stroke();}ctx.globalAlpha=1;ctx.font='900 8px Segoe UI';ctx.fillStyle=m.phaseStage>=3?'#ff9b83':m.phaseStage===2?'#ffd88a':'#c9c2dc';ctx.fillText(m.phaseStage>=3?'ФАЗА III · ЯРОСТЬ':m.phaseStage===2?'ФАЗА II · ПРОБУЖДЕНИЕ':'ФАЗА I',x,barY+19);}
    ctx.restore();
  }
  function awakenBossTree(tree){
    if(!bossRealmMode||!tree||tree.awakened)return false;
    if(!spawnBossRealmCreature('awakened_tree',tree.x,tree.y)){toast('Древний лес шевельнулся, но разлом пока переполнен.');return false;}
    const mob=monsters[monsters.length-1];if(!mob)return false;
    mob.x=tree.x;mob.y=tree.y;mob.territoryX=tree.x;mob.territoryY=tree.y;mob.territoryRadius=11*TILE;mob.awakenedFromTree=true;mob.specialCooldown=1.8;mob.attackCooldown=.8;bossRealmState.awakenedTrees=Math.min(10000,(Number(bossRealmState.awakenedTrees)||0)+1);
    spawnVisualBurst(tree.x,tree.y-14,34,'leaf','#a4df7a');spawnVisualBurst(tree.x,tree.y-18,16,'spark','#ffdf76');playSound('portal');
    toast('ПРОБУЖДЁННЫЙ ДРЕВЕНЬ! Срубленное дерево ожило — уворачивайся от корней!');return true;
  }
  function bossRealmAbilityDamageMultiplier(){return bossRealmDamageBoostTimer>0?1.5:1;}
  function useBossRealmInvisibility(){if(!bossRealmMode){toast('Способность доступна в Мире боссов.');return;}if(bossRealmInvisibleTimer>0||bossRealmInvisibilityCooldown>0){toast('Невидимость перезаряжается: '+Math.ceil(bossRealmInvisibilityCooldown)+' сек.');return;}bossRealmInvisibleTimer=4.5;bossRealmInvisibilityCooldown=10;spawnVisualBurst(player.x,player.y,28,'spark','#9deaff');toast('НЕВИДИМОСТЬ · 4,5 секунды · враги теряют цель');}
  function useBossRealmDamageBoost(){if(!bossRealmMode){toast('Способность доступна в Мире боссов.');return;}if(bossRealmAbilityCooldown>0){toast('Перезарядка: '+Math.ceil(bossRealmAbilityCooldown)+' сек.');return;}bossRealmDamageBoostTimer=5;bossRealmAbilityCooldown=10;spawnVisualBurst(player.x,player.y,24,'spark','#ffd66b');toast('ЯРОСТЬ БОГА · +50% урона на 5 секунд');}
  function useBossRealmSprint(){if(!bossRealmMode){toast('Способность доступна в Мире боссов.');return;}if(bossRealmSprintCooldown>0){toast('Сверхрывок перезаряжается: '+Math.ceil(bossRealmSprintCooldown)+' сек.');return;}bossRealmSprintTimer=5.5;bossRealmSprintCooldown=20;spawnVisualBurst(player.x,player.y,30,'spark','#77f4ff');toast('СВЕРХРЫВОК · скорость ×2,5 на 5,5 секунды');}
  function drawBossRealmHud(){
    if(!bossRealmMode)return;
    ctx.save();ctx.fillStyle='rgba(13,10,30,.88)';ctx.strokeStyle='#8d72d7';ctx.beginPath();ctx.roundRect(width/2-150,15,300,bossRealmState.eventName?56:38,12);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.font='900 11px Segoe UI';ctx.fillStyle='#e7d9ff';ctx.fillText('МИР БОССОВ · ВОЛНА '+bossRealmState.wave,width/2,31);if(bossRealmState.eventName){ctx.font='bold 10px Segoe UI';ctx.fillStyle='#ffd88b';ctx.fillText(bossRealmState.eventName+' · '+Math.ceil(bossRealmState.eventRemaining)+' сек.',width/2,51);}ctx.restore();if(bossRealmWaveBannerTimer>0){ctx.save();ctx.textAlign='center';ctx.font='1000 22px Segoe UI';ctx.fillStyle='#fff0bd';ctx.shadowColor='#9c6bff';ctx.shadowBlur=22;ctx.fillText(bossRealmWaveBannerText,width/2,height*.24);ctx.font='bold 10px Segoe UI';ctx.fillStyle='#e0d6ff';ctx.fillText('ПЯТЬ ПОБЕД ДЛЯ СЛЕДУЮЩЕЙ ВОЛНЫ',width/2,height*.24+20);ctx.restore();}ctx.save();ctx.textAlign='right';ctx.font='bold 10px Segoe UI';let y=78;const line=(label,value,color)=>{ctx.fillStyle=color;ctx.fillText(label+' · '+value,width-18,y);y+=15;};
    line('V Невидимость',bossRealmInvisibleTimer>0?bossRealmInvisibleTimer.toFixed(1)+'с':bossRealmInvisibilityCooldown>0?'КД '+Math.ceil(bossRealmInvisibilityCooldown)+'с':'ГОТОВО','#a9f1ff');
    line('B +50% урона',bossRealmDamageBoostTimer>0?bossRealmDamageBoostTimer.toFixed(1)+'с':bossRealmAbilityCooldown>0?'КД '+Math.ceil(bossRealmAbilityCooldown)+'с':'ГОТОВО','#ffe08b');
    line('N Сверхрывок ×2,5',bossRealmSprintTimer>0?bossRealmSprintTimer.toFixed(1)+'с':bossRealmSprintCooldown>0?'КД '+Math.ceil(bossRealmSprintCooldown)+'с':'ГОТОВО','#83f2ff');
    line('Убийства',bossRealmState.kills,'#e8ddff');line('Древни',bossRealmState.awakenedTrees||0,'#b9ed7b');line('Главари',bossRealmState.defeatedBosses.length+'/9','#ffb6db');line('Боги',bossRealmState.defeatedGods.length+'/2','#ffe49c');line('O Журнал',bossRealmJournalOpen?'ОТКРЫТ':'ПОСМОТРЕТЬ','#9deaff');ctx.restore();
    if(bossRealmJournalOpen){
      const panelW=Math.min(360,width-32),panelH=Math.min(370,height-90),panelX=16,panelY=Math.max(72,height-panelH-18);
      ctx.save();ctx.fillStyle='rgba(8,10,25,.94)';ctx.strokeStyle='#8d72d7';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(panelX,panelY,panelW,panelH,13);ctx.fill();ctx.stroke();ctx.textAlign='left';ctx.font='900 12px Segoe UI';ctx.fillStyle='#e7d9ff';ctx.fillText('ЖУРНАЛ МИРА БОССОВ',panelX+16,panelY+23);
      ctx.font='bold 10px Segoe UI';ctx.fillStyle='#d9caff';ctx.fillText('Убийств: '+bossRealmState.kills+'   ·   Волна: '+bossRealmState.wave+'   ·   до следующей: '+(5-bossRealmState.kills%5),panelX+16,panelY+43);
      let py=panelY+66;ctx.font='900 10px Segoe UI';ctx.fillStyle='#ffb6db';ctx.fillText('ГЛАВАРИ',panelX+16,py);py+=19;
      for(const id of ['abyss_king','rift_dragon','ancient_devourer','end_knight','magma_behemoth','frost_empress','void_mirror','worldbreaker_colossus','forest_king']){const defeated=bossRealmState.defeatedBosses.includes(id);ctx.font='bold 10px Segoe UI';ctx.fillStyle=defeated?'#83e6a1':'#d5d2e6';ctx.fillText((defeated?'✓ ':'○ ')+BOSS_REALM_CREATURES[id].name,panelX+19,py);py+=17;}
      py+=5;ctx.font='900 10px Segoe UI';ctx.fillStyle='#ffe49c';ctx.fillText('БОГИ',panelX+16,py);py+=19;
      for(const id of ['astral_god','chronos_god']){const defeated=bossRealmState.defeatedGods.includes(id);ctx.font='bold 10px Segoe UI';ctx.fillStyle=defeated?'#83e6a1':'#d5d2e6';ctx.fillText((defeated?'✓ ':'○ ')+BOSS_REALM_CREATURES[id].name,panelX+19,py);py+=17;}
      ctx.textAlign='right';ctx.font='9px Segoe UI';ctx.fillStyle='#9ea7c6';ctx.fillText('Нажми O, чтобы закрыть',panelX+panelW-14,panelY+panelH-12);ctx.restore();
    }
  }
  function showBossRealmWelcome(){
    if(!bossRealmMode||bossRealmState.introSeen||document.getElementById('boss-realm-welcome'))return;
    paused=true;keys.clear();pressedMovementCodes.clear();const root=document.createElement('div');root.id='boss-realm-welcome';root.style.cssText='position:fixed;inset:0;z-index:100500;display:grid;place-items:center;padding:20px;background:rgba(4,7,17,.8);backdrop-filter:blur(7px);font-family:Segoe UI,Arial,sans-serif;color:#f1edff';
    root.innerHTML='<section style="width:min(620px,100%);padding:28px 30px;border:1px solid #9a7de8;border-radius:18px;background:linear-gradient(145deg,#21163c,#0b1124);box-shadow:0 25px 100px #000c"><div style="font-size:10px;letter-spacing:3px;color:#c5aaff;font-weight:900">SKYREALM · НОВОЕ ИЗМЕРЕНИЕ</div><h2 id="br-welcome-title" style="font-size:22px;margin:12px 0;color:#fff">МИР БОССОВ</h2><p id="br-welcome-text" style="min-height:86px;font-size:15px;line-height:1.8;color:#d8d2ee;white-space:pre-wrap"></p><div id="br-welcome-foot" style="font-size:11px;color:#9d91bd;margin-top:14px">Сообщение печатается…</div><button id="br-welcome-close" type="button" style="display:none;margin-top:20px;width:100%;padding:12px;border:1px solid #a58bf0;border-radius:9px;background:#6145a8;color:#fff;font-weight:800;cursor:pointer">Понятно, продолжить</button></section>';document.body.appendChild(root);
    const title=root.querySelector('#br-welcome-title'),body=root.querySelector('#br-welcome-text'),foot=root.querySelector('#br-welcome-foot'),close=root.querySelector('#br-welcome-close');
    const first='Привет! Ты попал в Мир боссов. Здесь очень опасно, поэтому мы не рекомендуем входить сюда, если твой уровень ниже 5, урон меча меньше 67 или у тебя нет брони.';
    const second='Внимание! Добавлены новые способности:\\n• Невидимость (V) — 4,5 секунды, перезарядка 10 секунд.\\n• Усиление урона (B) — +50% на 5 секунд, перезарядка 10 секунд.\\n• Сверхрывок (N) — скорость ×2,5 на 5,5 секунды, перезарядка 20 секунд.\\n• Нагрудник Бога — повышает защиту на 90%.';
    let timer=null,delay=null,stage=0;function type(text,done){let i=0;body.textContent='';timer=setInterval(()=>{body.textContent+=text.charAt(i++);if(i>=text.length){clearInterval(timer);timer=null;done&&done();}},19);}
    type(first,()=>{foot.textContent='Через 5 секунд появится следующее сообщение…';delay=setTimeout(()=>{stage=1;title.textContent='НОВЫЕ СПОСОБНОСТИ';foot.textContent='Прочитай изменения и нажми кнопку ниже.';type(second,()=>{foot.textContent='Нажми кнопку, чтобы начать исследование.';close.style.display='block';});},5000);});
    close.addEventListener('click',()=>{if(stage!==1)return;if(timer)clearInterval(timer);if(delay)clearTimeout(delay);root.remove();bossRealmState.introSeen=true;paused=false;last=performance.now();saveGame();});
  }

  function showBossRealmLoading(title,detail){
    let root=document.getElementById('boss-realm-loading');
    if(!root){root=document.createElement('div');root.id='boss-realm-loading';root.style.cssText='position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 42%,#243b68 0%,#10172c 48%,#050914 100%);color:#fff;font-family:Segoe UI,Arial,sans-serif;opacity:0;transition:opacity .25s ease';root.innerHTML='<div style="width:min(440px,calc(100vw - 40px));padding:30px 26px;text-align:center;border:1px solid #7698d866;border-radius:18px;background:#0b1428eF;box-shadow:0 24px 90px #000b"><div style="font-size:42px;margin-bottom:10px">✦</div><div id="boss-realm-loading-title" style="font-size:22px;font-weight:900;letter-spacing:1px">МИР БОССОВ</div><div id="boss-realm-loading-detail" style="margin:10px 0 22px;color:#b8c9e8;font-size:13px">Подготовка измерения…</div><div style="height:9px;border-radius:9px;background:#26334d;overflow:hidden"><div id="boss-realm-loading-bar" style="height:100%;width:0;background:linear-gradient(90deg,#6d7cff,#66e5e0);border-radius:9px;transition:width .18s ease"></div></div><div id="boss-realm-loading-percent" style="margin-top:10px;color:#dce8ff;font-size:12px">0%</div></div>';document.body.appendChild(root);}
    root.querySelector('#boss-realm-loading-title').textContent=title||'МИР БОССОВ';root.querySelector('#boss-realm-loading-detail').textContent=detail||'Подготовка отдельного мира…';root.querySelector('#boss-realm-loading-bar').style.width='0%';root.querySelector('#boss-realm-loading-percent').textContent='0%';requestAnimationFrame(()=>{root.style.opacity='1';});
    return {set(value,message){const n=Math.max(0,Math.min(100,Math.round(value)));root.querySelector('#boss-realm-loading-bar').style.width=n+'%';root.querySelector('#boss-realm-loading-percent').textContent=n+'%';if(message)root.querySelector('#boss-realm-loading-detail').textContent=message;},close(){root.style.opacity='0';setTimeout(()=>root.remove(),280);}};
  }
  async function enterBossRealm(){
    if(window.SkyRealmEdition&&!window.SkyRealmEdition.requirePremium('Мир боссов'))return false;
    if(!currentWorldId||!bossRealmPortalUnlocked())return false;
    const originId=currentWorldId,originX=player.x,originY=player.y;saveGame();let worlds=readWorlds();let realm=worlds.find(w=>w.bossRealm===true&&w.bossParentWorldId===originId);
    if(!realm){realm={id:makeWorldId(),name:'Мир боссов',createdAt:Date.now(),updatedAt:Date.now(),difficulty:currentDifficulty,bossRealm:true,bossParentWorldId:originId};worlds.push(realm);}
    realm.bossRealm=true;realm.bossParentWorldId=originId;realm.name='Мир боссов';realm.difficulty=DIFFICULTIES[realm.difficulty]?realm.difficulty:currentDifficulty;realm.bossReturnWorldId=originId;realm.bossReturnX=originX;realm.bossReturnY=originY;realm.updatedAt=Date.now();writeWorlds(worlds);
    const loading=showBossRealmLoading('МИР БОССОВ','Создаём отдельное измерение и загружаем его сохранение…');await new Promise(resolve=>requestAnimationFrame(resolve));loading.set(18,'Проверяем сохранение измерения…');const realmSave=localStorage.getItem(worldSaveKey(realm.id));const realmSaveKb=realmSave?Math.max(1,Math.ceil(realmSave.length/1024)):0;loading.set(34,realmSave?`Найдено сохранение (${realmSaveKb} КБ). Подготавливаем карту…`:'Сохранение ещё не создано. Создаём новый мир…');await new Promise(resolve=>requestAnimationFrame(resolve));loading.set(58,'Генерируем карту и загружаем объекты…');const loadStartedAt=performance.now();enterWorld(realm.id,null,{skipCharacterEntry:true});
    bossRealmMode=true;bossReturnWorldId=originId;bossReturnX=originX;bossReturnY=originY;ensureBossRealmPopulation();saveGame();await new Promise(resolve=>requestAnimationFrame(resolve));loading.set(100,`Мир готов · ${Math.max(1,Math.round(performance.now()-loadStartedAt))} мс`);await new Promise(resolve=>setTimeout(resolve,120));loading.close();toast('Ты вошёл в отдельный Мир боссов.');if(!bossRealmState.introSeen)showBossRealmWelcome();return true;
  }
  async function leaveBossRealm(){
    if(!bossRealmMode)return false;const worlds=readWorlds(),realm=worlds.find(w=>w.id===currentWorldId&&w.bossRealm===true);const targetId=realm?.bossReturnWorldId||bossReturnWorldId;
    if(!targetId||!worlds.some(w=>w.id===targetId)){toast('Исходный мир не найден. Вернись через меню миров.');return true;}
    const targetX=Number.isFinite(realm?.bossReturnX)?realm.bossReturnX:bossReturnX,targetY=Number.isFinite(realm?.bossReturnY)?realm.bossReturnY:bossReturnY;saveGame();const loading=showBossRealmLoading('ВОЗВРАЩЕНИЕ','Загружаем твой исходный мир…');await new Promise(resolve=>requestAnimationFrame(resolve));loading.set(28,'Проверяем сохранение исходного мира…');const originSave=localStorage.getItem(worldSaveKey(targetId));const originSaveKb=originSave?Math.max(1,Math.ceil(originSave.length/1024)):0;loading.set(52,originSave?`Найдено сохранение (${originSaveKb} КБ). Восстанавливаем мир…`:'Сохранение не найдено. Создаём исходный мир…');await new Promise(resolve=>requestAnimationFrame(resolve));loading.set(72,'Загружаем карту и состояние игрока…');const loadStartedAt=performance.now();enterWorld(targetId,null,{skipCharacterEntry:true});bossRealmMode=false;player.x=targetX;player.y=targetY;player.vx=player.vy=0;saveGame();await new Promise(resolve=>requestAnimationFrame(resolve));loading.set(100,`Исходный мир готов · ${Math.max(1,Math.round(performance.now()-loadStartedAt))} мс`);await new Promise(resolve=>setTimeout(resolve,120));loading.close();toast('Ты вернулся в исходный мир.');return true;
  }
  async function interactBossRealmPortal(){
    if(!currentWorldId||tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode)return false;const p=bossRealmPortalPosition();if(Math.hypot(player.x-p.x,player.y-p.y)>(bossRealmMode?76:112))return false;
    if(bossRealmMode){await leaveBossRealm();return true;}if(!bossRealmPortalUnlocked()){toast('Портал откроется после того, как ты переживёшь 3 ночи. Осталось: '+Math.max(0,3-survivedNights)+'.');return true;}await enterBossRealm();return true;
  }
  function bossMaxHp(){return difficultyConfig().bossHp;}
  function setWorldDifficulty(id){currentDifficulty=DIFFICULTIES[id]?id:'medium';const cfg=difficultyConfig();COLS=cfg.cols;ROWS=cfg.rows;}
  function configureTreasureChests(){treasureChests.length=0;treasureChests.push({id:'forest',x:18*TILE+16,y:28*TILE+16,opened:false},{id:'lake',x:46*TILE+16,y:48*TILE+16,opened:false},{id:'ridge',x:82*TILE+16,y:27*TILE+16,opened:false});const extra={easy:0,medium:1,hard:2,hell:4,impossible:7}[currentDifficulty]||0;for(let i=0;i<extra;i++){const tx=COLS-9-(i%2)*11,ty=ROWS-9-Math.floor(i/2)*11;treasureChests.push({id:'frontier-'+i,x:tx*TILE+16,y:ty*TILE+16,opened:false});}}
  const WORLD_LIST_KEY = 'skyrealm_worlds_v1';
  const LEGACY_SAVE_KEY = 'skyrealm_game_save_v1';
  let saveKey = LEGACY_SAVE_KEY;
  let currentWorldId = null;
  let currentWorldName = '';
  let bossRealmMode=false,bossReturnWorldId=null,bossReturnX=21*TILE+16,bossReturnY=26*TILE+16;
  let worldSessionStartedAt=0,worldSessionRecorded=false;
  let renameWorldId = null;
  let discovered = false;
  let fullMapOpen = false;
  let panelReturnToPause = false;
  let immortal = false;
  const resourceItems = [
    {name:'Дерево',icon:'🪵',count:0,description:'Материал для будущего строительства.'},
    {name:'Камень',icon:'🪨',count:0,description:'Прочный материал из лесной долины.'},
    {name:'Кристалл',icon:'💎',count:0,description:'Редкий сияющий ресурс.'},
    {name:'Зелье',icon:'🧪',count:0,description:'Зелье, выданное администратором.'},
    {name:'Монеты',icon:'🪙',count:0,description:'Монеты для будущей экономики.'},
    {name:'Уголь',icon:'⚫',count:0,description:'Руда из шахты.'},
    {name:'Железо',icon:'⛓️',count:0,description:'Руда из шахты.'},
    {name:'Лесные ягоды',icon:'🫐',count:0,description:'Редкий урожай с плодовых деревьев обычного мира.'},
    {name:'Сердцевина древня',icon:'🌳',count:0,description:'Редкий трофей пробуждённого дерева из Мира боссов.'},
    {name:'Сердце Корнееда',icon:'💚',count:0,description:'Гарантированный трофей элитного Корнееда из Мира боссов.'},
    {name:'Живой корень',icon:'🌱',count:0,description:'Редкий материал оживших деревьев и Корнееда.'},
    {name:'Кора древня',icon:'🪵',count:0,description:'Плотная кора лесного монстра.'},
    {name:'Пыльца древнего леса',icon:'✨',count:0,description:'Редкий алхимический материал для эликсиров.'},
    {name:'Трофей биомного охотника',icon:'🏆',count:0,description:'Знак победы над редким биомным мини-боссом.'},
    {name:'Ключ древнего лагеря',icon:'🗝️',count:0,description:'Одноразовая находка из сундука заброшенного лагеря.'},
    {name:'Записка разведчика',icon:'📜',count:0,description:'Записка с цепочкой поручений и подсказкой о тайных комнатах.'},
    {name:'Печать разведчика',icon:'🔰',count:0,description:'Открывает вторую тайную комнату большой пещеры.'},
    {name:'Фрагмент карты пещер',icon:'🗺️',count:0,description:'Карта двух скрытых комнат большой пещеры.'},
    {name:'Око архивариуса',icon:'👁️',count:0,description:'Артефакт только из Библиотеки древних карт. +12% урона и +4% шанса критического удара, если надет.'},
    {name:'Печать времени',icon:'⌛',count:0,description:'Артефакт только из Библиотеки древних карт. +5% защиты и +2% шанса критического удара, если надет.'},
    {name:'Сердце корней',icon:'💚',count:0,description:'Артефакт только из Зала живого корня. +10% защиты и восстанавливает 6 здоровья после убийства врага, если надет.'},
    {name:'Камень эха',icon:'🔷',count:0,description:'Артефакт только из Зала живого корня. +8% урона и +6% шанса критического удара, если надет. Комплект с Короной живого корня даёт ещё +4% урона.'},
    {name:'Клык титана',icon:'🦷',count:0,description:'Легендарный артефакт только из Библиотеки древних карт. +10% урона и +3% шанса критического удара.'},
    {name:'Сфера жизни',icon:'🔮',count:0,description:'Легендарный артефакт только из Зала живого корня. +6% защиты и восстанавливает 4 здоровья после каждого убийства.'}, 
    {name:'Мантия архивариуса',icon:'📘',count:0,description:'Уникальная броня только из Библиотеки древних карт. Снижает получаемый урон на 48%.'},
    {name:'Диадема эха',icon:'💠',count:0,description:'Уникальный шлем только из Библиотеки древних карт. Снижает получаемый урон на 10%.'},
    {name:'Доспехи корневого стража',icon:'🌳',count:0,description:'Уникальная броня только из Зала живого корня. Снижает получаемый урон на 62%.'},
    {name:'Корона живого корня',icon:'🌿',count:0,description:'Уникальный шлем только из Зала живого корня. Снижает получаемый урон на 14%.'},
    {name:'Эликсир корневой ярости',icon:'🧪',count:0,description:'На 35 секунд усиливает урон, защиту и скорость. Нажми J.'}
  ];
  let exploredCells = new Set();
  let clearedSnowTiles=new Set(),snowShovelHits={};
  let hintTimer = 0;
  let saveTimer = 0;
  let saveErrorNotified = false, lastSaveAt = 0;
  let signDialogOpen = false;
  let inventoryDialogOpen = false;
  let inventoryTab = 'items';
  let questPanelVisible = false;
  let selectedSlot = 1;
  // Game clock: two in-game minutes advance per real second; pause stops the clock.
  const GAME_TIME_SPEED=2;
  const GAME_MINUTES_PER_DAY = 24 * 60;
  const DAWN_MINUTE = 6 * 60;
  const NIGHT_MINUTE = 20 * 60;
  let gameMinuteTotal = 8 * 60;
  let totalGameMinutesPlayed = 0;
  let survivedNights = 0;
  let lastDawnMarker = Math.floor((gameMinuteTotal - DAWN_MINUTE) / GAME_MINUTES_PER_DAY);
  let lastClockMinute = -1;
  let wasNight = false;
  let monsterSpawnTimer = 0;
  let damageToastTimer = 0;
  let minimapTimer = 0;
  let hunger = 100;
  let hungerElapsedMinutes = 0;
  let skipDayRealSeconds = 300;
  let sheepSpawned = false;
  let sheepSpawnTimer = 0;
  let playerAttackCooldown = 0;
  let attackAnimTimer=0, combatAbilityCooldown=0, weatherMode='clear', weatherTimer=75, weatherFlash=0, ambientTime=0;
  // Combat Arts: separate combat state; player movement and collision logic remain unchanged.
  let combatCombo=0,combatComboTimer=0,combatEnergy=0,combatPerfectDodge=0,combatGuardTimer=0,combatParryTimer=0,combatGuardCooldown=0,combatCurrentDamage=1,combatWeaponTrail=0;
  let combatCinematic=null,combatCinematicImpactFlash=0,combatCameraShake=0,combatUltimateCooldown=0,bossVictoryCue=null;
  const COMBAT_STYLES={'Огненный меч':['#ff713d','Пламенный разрез'],'Ледяной посох':['#8beaff','Ледяной всплеск'],'Молниеносное копьё':['#ffe66d','Цепной разряд'],'Деревянный меч':['#d8c39b','Рубящий удар']};
  function combatStyle(){return COMBAT_STYLES[equipment.weapon]||['#e8f5ff','Удар оружием'];}
  function combatWeaponDamage(weapon){return weaponDamage(weapon)*combatCurrentDamage;}
  function spawnCombatBurst(x,y,count,kind,color){
    const quality=gameSettings.graphicsQuality||'medium';
    const scale=quality==='low'?.38:quality==='medium'?.68:1;
    spawnVisualBurst(x,y,Math.max(3,Math.round(count*scale)),kind,color);
  }
  function resolveCombatUltimate(){
    const style=combatStyle(),reach=weaponRange()+135;let hits=0,kills=0;
    // Co-op guests request authoritative damage instead of mutating their local enemy copies.
    if(isCoopWorldActive()&&!window.SkyRealmCoopClient?.isRoomOwner){
      const weapon=equipment.weapon||'Деревянный меч',damage=Math.round(weaponDamage(weapon)*(1+skills.warrior*.1)*2.7);
      if(dungeonMode&&!dungeonRoomCleared()&&Math.hypot(player.x-dungeonEnemyX,player.y-dungeonEnemyY)<=reach+30){queueGuestEnemyHit('dungeon_boss','room-'+String(dungeonRoom),weapon,damage);hits++;}
      else if(caveMode&&!caveBossDefeated&&Math.hypot(player.x-caveBossX,player.y-caveBossY)<=reach+30){queueGuestEnemyHit('cave_boss','stone',weapon,damage);hits++;}
      else if(!mineMode&&!inHouse&&!tradeWorldMode){
        for(const mob of monsters){if(!mob||mob.hp<=0||mob.exploding||Math.hypot(player.x-mob.x,player.y-mob.y)>reach)continue;queueGuestEnemyHit('monster',mob.id,weapon,damage);hits++;}
        for(const def of biomeBossDefs()){const boss=biomeBosses[def.id];if(!boss?.active||boss.defeated||Math.hypot(player.x-def.x,player.y-def.y)>reach)continue;queueGuestEnemyHit('biome_boss',def.id,weapon,damage);hits++;}
        if(wolfBossActive&&wolfBossHp>0&&Math.hypot(player.x-wolfBossX,player.y-wolfBossY)<=reach) {queueGuestEnemyHit('wolf_boss','wolf',weapon,damage);hits++;}
      }
      spawnCombatBurst(player.x,player.y,64,'spark',style[0]);combatCinematicImpactFlash=.3;combatCameraShake=12;playSound('hit');saveGame();
      toast('КИНОУДАР · отправлено запросов урона: '+hits+' · владелец комнаты подтвердит попадания.');return;
    }
    const targets=[...monsters].filter(m=>m&&m.hp>0&&!m.exploding&&Math.hypot(m.x-player.x,m.y-player.y)<=reach);
    for(const mob of targets){
      const distance=Math.hypot(mob.x-player.x,mob.y-player.y),falloff=distance>reach*.72?.82:1;
      const damage=Math.round(weaponDamage(equipment.weapon||'Деревянный меч')*(1+skills.warrior*.1)*2.7*falloff);
      mob.hp=Math.max(0,mob.hp-damage);mob.flash=.42;hits++;
      spawnCombatBurst(mob.x,mob.y,38,'spark',style[0]);spawnCombatBurst(mob.x,mob.y,18,'dust','#f6fbff');
      if(mob.hp<=0){if(mob.bossRealmCreature)recordBossRealmDefeat(mob);if(mob.isRebornBoss)triggerBossVictory(mob.bossTitle||monsterLabel(mob.type),mob.x,mob.y,'#ffc66d');const ix=monsters.indexOf(mob);if(ix>=0)monsters.splice(ix,1);dropMonsterLoot(mob);kills++;}
    }
    for(const def of biomeBossDefs()){
      const boss=biomeBosses[def.id];if(!boss?.active||boss.defeated||Math.hypot(player.x-def.x,player.y-def.y)>reach)continue;
      const damage=Math.round(weaponDamage(equipment.weapon||'Деревянный меч')*2.7*(boss.combatPhase===3?1.18:1));
      boss.hp=Math.max(0,boss.hp-damage);boss.flash=.48;hits++;
      spawnCombatBurst(def.x,def.y,52,'spark',style[0]);spawnCombatBurst(def.x,def.y,24,'dust','#ffffff');
      if(boss.hp<=0)defeatBiomeBoss(def,boss);
    }
    if(wolfBossActive&&wolfBossHp>0&&Math.hypot(player.x-wolfBossX,player.y-wolfBossY)<=reach){
      const damage=Math.round(weaponDamage(equipment.weapon||'Деревянный меч')*2.7);wolfBossHp=Math.max(0,wolfBossHp-damage);wolfBossFlash=.5;hits++;spawnCombatBurst(wolfBossX,wolfBossY,48,'spark',style[0]);if(wolfBossHp<=0)defeatWolfBoss();
    }
    if(caveMode&&!caveBossDefeated&&caveBossHp>0&&Math.hypot(player.x-caveBossX,player.y-caveBossY)<=reach){
      const damage=Math.round(weaponDamage(equipment.weapon||'Деревянный меч')*2.7);caveBossHp=Math.max(0,caveBossHp-damage);caveBossFlash=.5;hits++;spawnCombatBurst(caveBossX,caveBossY,48,'spark',style[0]);if(caveBossHp<=0)defeatCaveBoss();
    }
    spawnCombatBurst(player.x,player.y,76,'spark',style[0]);spawnCombatBurst(player.x,player.y,42,'dust','#ffffff');
    combatCinematicImpactFlash=.32;combatCameraShake=13;playSound('hit');saveGame();
    toast('СУПЕРУДАР · '+style[1]+' · поражено целей: '+hits+(kills?' · побеждено: '+kills:''));
  }
  function updateCombatCinematic(realDt){
    combatCinematicImpactFlash=Math.max(0,combatCinematicImpactFlash-realDt);
    combatCameraShake=Math.max(0,combatCameraShake-realDt*28);
    combatUltimateCooldown=Math.max(0,combatUltimateCooldown-realDt);
    if(!combatCinematic?.active)return;
    combatCinematic.elapsed+=realDt;
    if(!combatCinematic.hitDone&&combatCinematic.elapsed>=combatCinematic.hitAt){combatCinematic.hitDone=true;resolveCombatUltimate();}
    if(combatCinematic.elapsed>=combatCinematic.duration){combatCinematic.active=false;combatCinematic=null;}
  }

  function awardCombatEnergyForHit(damage){
    if(!Number.isFinite(damage)||damage<=0)return;
    // Energy is awarded only after enemy HP was actually reduced, never on a swing into empty space.
    combatEnergy=Math.min(100,combatEnergy+8);
    updateVitals();
  }
  function triggerBossVictory(name,x=player.x,y=player.y,color='#ffe27a'){
    bossVictoryCue={name:String(name||'Главарь'),color,started:performance.now(),duration:3600};
    spawnVisualBurst(x,y,76,'spark',color);
    spawnVisualBurst(x,y,34,'dust','#ffffff');
    combatCameraShake=Math.max(combatCameraShake,14);
    combatCinematicImpactFlash=Math.max(combatCinematicImpactFlash,.34);
  }
  function combatBeginStrike(){
    combatCombo=combatComboTimer>0?combatCombo%4+1:1;combatComboTimer=1.45;
    combatCurrentDamage=[1,1.08,1.18,1.38][combatCombo-1]*(combatPerfectDodge>0?1.65:1);
    if(combatPerfectDodge>0){combatPerfectDodge=0;toast('ИДЕАЛЬНОЕ УКЛОНЕНИЕ · КОНТРАТАКА ×1.65!');}
    combatWeaponTrail=.34;
    const style=combatStyle(),x=player.x+(player.face==='left'?-25:player.face==='right'?25:0),y=player.y+(player.face==='up'?-25:player.face==='down'?18:0);
    spawnVisualBurst(x,y,combatCombo===4?24:12,'spark',style[0]);if(combatCombo===4){spawnVisualBurst(x,y,18,'dust','#ffffff');toast('ФИНИШЕР · '+style[1]+'!');}
  }
  function combatTakeDamage(amount,label,color){
    if(immortal||dodgeTimer>0)return 0;
    if(combatParryTimer>0){combatParryTimer=0;combatGuardTimer=0;combatEnergy=Math.min(100,combatEnergy+24);updateVitals();combatPerfectDodge=.9;spawnVisualBurst(player.x,player.y,30,'spark','#ffe58a');toast('ИДЕАЛЬНОЕ ПАРИРОВАНИЕ! Контратака усилена.');return 0;}
    const guarded=combatGuardTimer>0,now=Date.now(),artifact=equipment.artifact,level=artifactEvolutionLevel();let hit=Math.max(1,Math.round(amount*(guarded?.28:1)*(1-armorReduction()))),awakened=false;
    if(now<artifactProgression.wardUntil)hit=Math.max(1,Math.round(hit*.6));
    if(artifact&&level>=1&&now>=artifactProgression.awakeningCooldownUntil&&player.hp-hit<=25){
      awakened=true;artifactProgression.awakeningCooldownUntil=now+60000;hit=Math.min(Math.round(hit*.55),Math.max(0,player.hp-1));
      if(artifact==='Печать времени')artifactProgression.wardUntil=now+6500;
      else if(artifact==='Око архивариуса')artifactProgression.wardUntil=now+5000;
      else if(artifact==='Камень эха'){artifactProgression.wardUntil=now+4000;spawnVisualBurst(player.x,player.y,34,'spark','#b58cff');}
      else if(artifact==='Клык титана')artifactProgression.berserkUntil=now+9000;
      else artifactProgression.wardUntil=now+3500;
    }
    player.hp=awakened?Math.max(1,player.hp-hit):Math.max(0,player.hp-hit);
    if(awakened&&(artifact==='Сфера жизни'||artifact==='Сердце корней'))player.hp=Math.min(100,player.hp+(artifact==='Сфера жизни'?20:16));
    spawnVisualBurst(player.x,player.y,awakened?26:guarded?15:10,'spark',awakened?'#d5b5ff':guarded?'#9bdcff':(color||'#ff6688'));updateVitals();toast((awakened?'ПРОБУЖДЕНИЕ · ':'')+label+' · −'+hit+' HP'+(guarded?' · БЛОК':'')+(awakened?' · '+artifact+' спасает тебя!':''));
    if(guarded)combatEnergy=Math.min(100,combatEnergy+5);if(player.hp<=0)respawnPlayerAfterDefeat();return hit;
  }
  function startCombatGuard(){if(paused||inMainMenu||combatGuardCooldown>0||mineMode)return;combatGuardTimer=.62;combatParryTimer=.2;combatGuardCooldown=1.05;spawnVisualBurst(player.x,player.y,10,'spark','#9bdcff');toast('БЛОК · точное нажатие C перед ударом парирует атаку.');}
  function useCombatUltimate(){
    if(combatEnergy<100){toast('Боевая энергия: '+Math.floor(combatEnergy)+'% · набирай её ударами, уклонениями и парированиями.');return;}
    if(combatUltimateCooldown>0||combatCinematic?.active)return;
    const style=combatStyle(),reach=weaponRange()+135;
    const candidates=[...monsters.filter(m=>m&&m.hp>0&&!m.exploding),...biomeBossDefs().map(d=>({x:d.x,y:d.y,hp:biomeBosses[d.id]?.hp||0,bossDef:d})).filter(m=>m.hp>0)];
    if(wolfBossActive&&wolfBossHp>0)candidates.push({x:wolfBossX,y:wolfBossY,hp:wolfBossHp});
    if(caveMode&&!caveBossDefeated&&caveBossHp>0)candidates.push({x:caveBossX,y:caveBossY,hp:caveBossHp});
    if(dungeonMode&&!dungeonRoomCleared())candidates.push({x:dungeonEnemyX,y:dungeonEnemyY,hp:dungeonEnemyHp||1});
    const target=candidates.filter(m=>Math.hypot(m.x-player.x,m.y-player.y)<=reach).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
    const forward={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[player.face]||[0,1];
    const fx=target?(player.x+target.x)*.5:player.x+forward[0]*100,fy=target?(player.y+target.y)*.5:player.y+forward[1]*100;
    combatEnergy=0;updateVitals();combatUltimateCooldown=2.8;combatCinematic={active:true,elapsed:0,duration:2.55,hitAt:1.42,hitDone:false,focusX:fx,focusY:fy,targetX:target?.x??null,targetY:target?.y??null,style:style[0],name:style[1],weapon:equipment.weapon||'Деревянный меч'};
    combatWeaponTrail=.75;attackAnimTimer=.75;spawnCombatBurst(player.x,player.y,28,'dust','#dceeff');spawnCombatBurst(player.x,player.y,18,'spark',style[0]);
    toast('КИНОУДАР · '+style[1]+' · замедление 0.5×');
  }

  const GAME_VERSION = document.querySelector('meta[name="skyrealm-game-version"]')?.content || '0.20.50.114';
  const WORLD_EVENT_CHANCES = Object.freeze({
    checkInterval:75,
    meteor:.12,
    nightHorde:.07,
    abandonedCamp:.10,
    traveler:.08,
    meteorLifetime:180,
    campLifetime:240,
    travelerLifetime:180,shrineLifetime:210
  });
  const WEATHER_CHANGE_CHANCES = Object.freeze({rain:.28,snow:.15,storm:.08});
  let strengthPotionTimer=0, wardPotionTimer=0, speedPotionTimer=0, healPotionTimer=0, healPotionRemaining=0, eventRollTimer=74, meteorShowerTimer=0, meteorPoint=null;
  let worldEventCamp=null,worldEventTraveler=null,worldEventShrine=null;
  let lastWorldMeteorNight=-1,lastWorldHordeNight=-1,lastWorldCampDay=-1,lastWorldTravelerDay=-2,lastWorldShrineDay=-1;
  const visualParticles=[];
  let sprintExhaustionToast=0;
  let inHouse = false;
  let workbenchDialogOpen = false;
  let sleeping = false;
  let sleepSeconds = 0;
  let fishingCastTimer=0,fishingOrigin=null,fishCaught=0;
  let questStage = 0;
  let villageQuestStage = 0;
  let blacksmithQuestStage = 0, explorerQuestStage = 0;
  let dogBehavior = 'follow';
  let workbenchUsed = false;
  let mineMode=false, mineLevel=1, mineDepth=1, mineRocks=[], mineSeed=0, mineTileX=62, mineTileY=43, worldEarlyMonsters=false, mineHoverIndex=-1, minePlayerX=66, minePlayerY=594, mineMaze=null, mineUndercityChestOpened=false, mineUndercityLayoutCache=null;
  // Static mine geometry is cached in small world-space chunks; only lanterns and dust remain animated.
  let mineGroundRenderCache=null;
  const mineCreaturePathCache=new WeakMap();
  let mineBarrels=[],mineCreatures=[],minePlayerAttackCooldown=0;
  let quarryProgress={mined:0,stone:0,rank:1},quarrySystemAccumulator=0,quarryAnchorCache=null;
  let caveMode=false, caveReturn={x:player.x,y:player.y}, caveChestOpened=false, caveSecretRoom=0, caveSecretRoomsOpened=[];
  let dungeonMode=false, dungeonReturn={x:player.x,y:player.y}, dungeonRoom=1, dungeonClearedRooms=[], dungeonEnemyHp=0, dungeonEnemyAttackTimer=1.35, dungeonEnemySpecialTimer=8, dungeonChestOpened=false, dungeonTrapCooldown=0, dungeonEnemyX=0, dungeonEnemyY=0;
  let biomeBosses=makeBiomeBossState();
  let caveBossDefeated=false,caveBossHp=260,caveBossX=0,caveBossY=0,caveBossAttackTimer=2.5,caveBossSpecialTimer=7,caveBossFlash=0;
  let equipment={weapon:'Деревянный меч',armor:'',helmet:'',leggings:'',boots:'',amulet:'',artifact:''};
  let artifactProgression={levels:{},awakeningCooldownUntil:0,wardUntil:0,berserkUntil:0};
  let weaponUpgrades={}, armorUpgrade=0, anvilCrafted=false, weaponEnchantments={};
  let waterHelmetLevel=0, seaWorldData=null;
  let skillPoints=0,skills={warrior:0,miner:0,scout:0,farmer:0,survivor:0,crafter:0,guardian:0,ranger:0,alchemist:0,fisherman:0,builder:0,beastmaster:0,fortune:0};
  const PLAYER_CLASSES={swordsman:{name:'Мечник',icon:'⚔️',desc:'Мечи создаются на 20% дешевле, урон мечей +10%.'},farmer:{name:'Фермер',icon:'🌾',desc:'Урожай с грядок +20%.'},ordinary:{name:'Обычный',icon:'🧭',desc:'Сбалансированный класс без штрафов и +5% к опыту.'},archer:{name:'Лучник',icon:'🏹',desc:'Урон копья +20%, скорость передвижения +5%.'},mage:{name:'Маг',icon:'🔮',desc:'Урон ледяного посоха +20%.'},miner:{name:'Шахтёр',icon:'⛏️',desc:'Кирки создаются на 15% дешевле, шанс дополнительной руды +20%.'},rich:{name:'Богач',icon:'💰',desc:'Платный класс · 150 ₽. Оплата пока не подключена.',price:150,locked:true}};
  let playerClass='ordinary';try{const savedClass=localStorage.getItem('skyrealm_player_class_v1');if(savedClass&&PLAYER_CLASSES[savedClass]&&!PLAYER_CLASSES[savedClass].locked)playerClass=savedClass;}catch(_){}
  function classHas(id){return playerClass===id;}
  function classCraftCost(name,amount){const sword=['Железный меч','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты'].includes(name);const pick=['Улучшенная кирка','Кирка мастера'].includes(name);const discount=(classHas('swordsman')&&sword)?0.8:(classHas('miner')&&pick)?0.85:1;return Math.max(1,Math.round(amount*discount));}
  let adventureQuestProgress={hunt:0,mining:0,harvest:0};
  let activeStorageStructure=null, storageDialogOpen=false, avatarEntryMode=false;
  let playerLevel=1, playerXP=0, dodgeTimer=0, dodgeCooldown=0, dodgeVX=0, dodgeVY=0, dodgeFacing='down';let profilePlaytimeSeconds=0,profilePlaytimeLastTick=Date.now(),profileStatsLastSync=0;
try{profilePlaytimeSeconds=Math.max(0,Math.floor(Number(localStorage.getItem('skyrealm_profile_playtime_seconds'))||0));}catch(_){}
function syncProfileStats(force=false){
  const now=Date.now(),delta=Math.max(0,Math.floor((now-profilePlaytimeLastTick)/1000));
  if(delta>0){profilePlaytimeSeconds=Math.min(100000000,profilePlaytimeSeconds+delta);profilePlaytimeLastTick=now;try{localStorage.setItem('skyrealm_profile_playtime_seconds',String(profilePlaytimeSeconds));}catch(_){}}
  if(!force&&now-profileStatsLastSync<60000)return;
  profileStatsLastSync=now;
  const api=window.pywebview?.api;
  if(!api?.sync_profile_stats)return;
  const payload={player_class:playerClass,level:Math.max(1,Math.floor(playerLevel)),experience:Math.max(0,Math.floor(playerXP)),playtime_seconds:profilePlaytimeSeconds};
  Promise.resolve(api.sync_profile_stats(payload)).catch(error=>console.warn('SkyRealm profile sync failed:',error));
}
setInterval(()=>syncProfileStats(true),60000);
window.addEventListener('beforeunload',()=>{syncProfileStats(true);recordAdventureHistory();});

  const treasureChests=[];
  let tradeWorldMode=false, tradeEntranceX=17, tradeEntranceY=47, footstepTimer=0, walletCents=0, shopDialogOpen=false, activeShop='sell';
  const SELL_SHOP={x:25,y:47}, BUY_SHOP={x:31,y:47}, FARMER_SHOP={x:38,y:47};
  const ORE_PRICES={Камень:15,Уголь:50,Железо:180};
  let villageNpcs=[],villageCenters=[],villageHouseDamage={},villageCaches=[],npcQuestState={},villageReputation=0,npcQuestDialogOpen=false,activeNpcQuestId=null;
  let villageRaidActive=false,villageRaidKills=0,villageRaidTimer=0,lastVillageRaidDay=-1,lastRestoredVillageRaidKey='';
  const NPC_SHOPS={
    merchant:[{name:'Меч титана',icon:'⚔️',price:45000},{name:'Меч дракона',icon:'🔥',price:80000},{name:'Меч пустоты',icon:'🌑',price:140000},{name:'Железный меч',icon:'⚔️',price:3500},{name:'Малое зелье',icon:'🧪',price:700}],
    alchemist:[{name:'Малое зелье',icon:'🧪',price:650},{name:'Зелье скорости',icon:'💨',price:2200},{name:'Настой силы',icon:'🔥',price:3500},{name:'Зелье защиты',icon:'🛡️',price:3000},{name:'Лечебная трава',icon:'🌿',price:450}],
    hunter:[{name:'Кожаная броня',icon:'🦺',price:5200},{name:'Бинт',icon:'🩹',price:500},{name:'Малое зелье',icon:'🧪',price:750}],
    farmer:[
      {name:'Лейка',icon:'🚿',price:900},{name:'Серп',icon:'🌾',price:1100},{name:'Грядка с семенами',icon:'🪴',price:450},
      {name:'Компост',icon:'🪱',price:180},{name:'Удобрение',icon:'💩',price:260},
      {name:'Семена пшеницы',icon:'🌾',price:90},{name:'Семена моркови',icon:'🥕',price:130},{name:'Семена картофеля',icon:'🥔',price:120},
      {name:'Семена томата',icon:'🍅',price:180},{name:'Семена кукурузы',icon:'🌽',price:210},{name:'Семена тыквы',icon:'🎃',price:260},{name:'Семена клубники',icon:'🍓',price:320},
      {name:'Пшеница',icon:'🌾',price:30},{name:'Морковь',icon:'🥕',price:46},{name:'Картофель',icon:'🥔',price:43},{name:'Томат',icon:'🍅',price:66},{name:'Кукуруза',icon:'🌽',price:82},{name:'Тыква',icon:'🎃',price:152},{name:'Клубника',icon:'🍓',price:123},
      {name:'Мясо',icon:'🍖',price:250},{name:'Урожай',icon:'🌾',price:180}
    ],
    miner:[{name:'Камень',icon:'🪨',price:150},{name:'Уголь',icon:'⚫',price:450},{name:'Железо',icon:'⛓️',price:1200},{name:'Медь',icon:'🟠',price:1700},{name:'Олово',icon:'⚪',price:1900}],
    builder:[{name:'Комплект дома',icon:'🏠',price:9000},{name:'Сундук-хранилище',icon:'📦',price:1800},{name:'Факел',icon:'🕯️',price:120}],
    mage:[{name:'Кристалл',icon:'💎',price:2400},{name:'Рубин',icon:'♦️',price:5200},{name:'Сапфир',icon:'🔷',price:5200},{name:'Обсидиан',icon:'⬛',price:4100},{name:'Мифрил',icon:'✨',price:9500},{name:'Меч пустоты',icon:'🌑',price:135000}],
    guard:[{name:'Броня стража',icon:'🛡️',price:18000},{name:'Шлем лесника',icon:'🪖',price:4200},{name:'Амулет стража',icon:'📿',price:8500},{name:'Малое зелье',icon:'🧪',price:800}]
  };
  const FARM_ECONOMY={easy:{buy:1,sell:1},medium:{buy:1,sell:1},hard:{buy:1,sell:1},hell:{buy:1,sell:1},impossible:{buy:1,sell:1}};
  // Prices are from the player's perspective: buying from the NPC costs more than selling to the NPC, preventing infinite buy-resell arbitrage.
  const FARM_CROP_TRADE_PRICES={Пшеница:{buy:50,sell:30},Морковь:{buy:75,sell:46},Картофель:{buy:70,sell:43},Томат:{buy:100,sell:66},Кукуруза:{buy:125,sell:82},Тыква:{buy:250,sell:152},Клубника:{buy:200,sell:123}};