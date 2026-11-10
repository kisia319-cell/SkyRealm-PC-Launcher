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
  let width = 0, height = 0, dpr = 1, last = performance.now(), paused = true;
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
  const FARM_CROPS=[{id:'wheat',seed:'Семена пшеницы',product:'Пшеница',growth:55,yield:4,sell:95},{id:'carrot',seed:'Семена моркови',product:'Морковь',growth:65,yield:3,sell:145},{id:'potato',seed:'Семена картофеля',product:'Картофель',growth:70,yield:4,sell:135},{id:'tomato',seed:'Семена томата',product:'Томат',growth:85,yield:5,sell:210},{id:'corn',seed:'Семена кукурузы',product:'Кукуруза',growth:95,yield:4,sell:260},{id:'pumpkin',seed:'Семена тыквы',product:'Тыква',growth:115,yield:2,sell:480},{id:'strawberry',seed:'Семена клубники',product:'Клубника',growth:100,yield:6,sell:390}];
  function farmCropById(id){return FARM_CROPS.find(c=>c.id===id)||null;}
  function farmEconomy(){return FARM_ECONOMY[currentDifficulty]||FARM_ECONOMY.medium;}
  function farmCropSellPrice(name){const price=FARM_CROP_TRADE_PRICES[name];return price?price.sell:0;}
  function farmCropBuyPrice(name){const price=FARM_CROP_TRADE_PRICES[name];return price?price.buy:0;}
  const NPC_SELL_PRICES={
    merchant:{'Древесина':55,'Листья':20,'Мясо':40},
    alchemist:{'Лечебная трава':300,'Кристалл':1300,'Сердце джунглей':2100},
    hunter:{'Кость':120,'Череп':250,'Мясо':35,'Рыба':70,'Жемчуг':650},
    farmer:{'Урожай':100,'Мясо':60},
    miner:{'Камень':60,'Уголь':180,'Железо':550,'Медь':800,'Олово':900},
    builder:{'Древесина':50,'Камень':50},
    mage:{'Кристалл':1300,'Рубин':2800,'Сапфир':2800,'Обсидиан':2200,'Мифрил':5000},
    guard:{'Теневая эссенция':1400,'Ядро духа':2200,'Кость':120}
  };
  const NPC_QUESTS={
    merchant:{title:'Помощь торговцу',desc:'Принеси 5 древесины и 3 камня',items:{'Древесина':5,'Камень':3},gold:1800,xp:60},
    alchemist:{title:'Редкие ингредиенты',desc:'Принеси 3 лечебные травы и 2 кристалла',items:{'Лечебная трава':3,'Кристалл':2},gold:4200,xp:120,rewardItems:{'Малое зелье':2}},
    hunter:{title:'Опасная добыча',desc:'Принеси 5 костей и 1 череп',items:{'Кость':5,'Череп':1},gold:6200,xp:180},
    farmer:{title:'Большой урожай',desc:'Принеси 6 единиц урожая',items:{'Урожай':6},gold:2800,xp:90,rewardItems:{'Мясо':3}},
    miner:{title:'Заказ рудокопа',desc:'Принеси 6 железа и 4 угля',items:{'Железо':6,'Уголь':4},gold:5200,xp:150},
    builder:{title:'Материалы для домов',desc:'Принеси 10 древесины и 8 камня',items:{'Древесина':10,'Камень':8},gold:5800,xp:160},
    mage:{title:'Сила древних рун',desc:'Принеси 2 рубина, 2 сапфира и 1 обсидиан',items:{'Рубин':2,'Сапфир':2,'Обсидиан':1},gold:12500,xp:320,rewardItems:{'Кристалл':3}},
    guard:{title:'Защита заставы',desc:'Принеси 4 теневые эссенции и 2 ядра духа',items:{'Теневая эссенция':4,'Ядро духа':2},gold:9000,xp:260,rewardItems:{'Малое зелье':3}}
  };
  const NPC_LABELS={merchant:'ТОРГОВЕЦ',alchemist:'АЛХИМИК',hunter:'ОХОТНИК',farmer:'ФЕРМЕР',miner:'ШАХТЁР',builder:'СТРОИТЕЛЬ',mage:'ТАЙНЫЙ ТОРГОВЕЦ',guard:'СТРАЖ'};
  const NPC_NAMES={merchant:'Борис',alchemist:'Лира',hunter:'Рен',farmer:'Мира',miner:'Торн',builder:'Оскар',mage:'Элиан',guard:'Кай'};
  const NPC_COLORS={merchant:'#c18b4d',alchemist:'#8d70b8',hunter:'#63865a',farmer:'#bd8b58',miner:'#74899a',builder:'#a8754c',mage:'#6b77bd',guard:'#667c91'};
  NPC_SELL_PRICES.quarry={'Камень':180,'Уголь':260,'Железо':720,'Медь':900,'Кристалл':1550};
NPC_SHOPS.quarry=[{name:'Улучшенная кирка',icon:'⛏️',price:8500},{name:'Кирка мастера',icon:'⚒️',price:24000}];
NPC_QUESTS.quarry={title:'Заказ каменоломни',desc:'Добудь и доставь 25 камня',items:{'Камень':25},gold:5200,xp:180,rewardItems:{'Уголь':3}};
NPC_LABELS.quarry='КАМЕНЩИК';NPC_NAMES.quarry='Бран';NPC_COLORS.quarry='#8a8f83';
let audioContext=null;
  function playSound(kind='tap'){if(kind==='tap'&&gameSettings.uiSoundEnabled===false)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioContext)audioContext=new AC();if(audioContext.state==='suspended')audioContext.resume();const now=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();const presets={wood:[150,85,'triangle',.12],stone:[280,115,'square',.09],iron:[620,240,'triangle',.14],coal:[190,130,'square',.1],step:[105,70,'sine',.045],hit:[230,95,'sawtooth',.07],sheep:[500,380,'sine',.1],craft:[390,780,'triangle',.18],coin:[900,1250,'sine',.12],portal:[180,660,'sine',.32],water:[520,340,'sine',.16],tap:[350,240,'sine',.06]};const q=presets[kind]||presets.tap;osc.type=q[2];osc.frequency.setValueAtTime(q[0],now);osc.frequency.exponentialRampToValueAtTime(Math.max(40,q[1]),now+q[3]);gain.gain.setValueAtTime(.0001,now);const volume=Math.max(0,Math.min(100,Number(gameSettings.sfxVolume??70)))/100;if(volume<=0)return;gain.gain.exponentialRampToValueAtTime(.07*volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+q[3]);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now);osc.stop(now+q[3]+.02);}catch(_){}}
  // Original procedural sound effects are kept. Add optional original ambient music using Web Audio.
  let skyMusic=null;
  let skyMusicEnabled=false;
  function setSkyMusic(enabled){
    skyMusicEnabled=!!enabled;
    gameSettings.musicEnabled=skyMusicEnabled;
    try{localStorage.setItem('skyrealm_game_preferences',JSON.stringify(gameSettings));}catch(_){}
    const button=document.getElementById('menu-music-toggle');
    if(button){button.setAttribute('aria-pressed',String(skyMusicEnabled));button.innerHTML=skyMusicEnabled?'♫ <span>Музыка: вкл.</span>':'♫ <span>Музыка: выкл.</span>';}
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      if(!audioContext)audioContext=new AC();
      if(audioContext.state==='suspended')audioContext.resume();
      if(skyMusicEnabled&&!skyMusic){
        const master=audioContext.createGain();master.gain.value=.0001;master.connect(audioContext.destination);
        const notes=[110,164.81,220,261.63];
        const voices=notes.map((freq,index)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=index===0?'sine':'triangle';osc.frequency.value=freq;gain.gain.value=index===0?.10:.035;osc.connect(gain);gain.connect(master);osc.start();return osc;});
        const now=audioContext.currentTime,volume=Math.max(0,Math.min(100,Number(gameSettings.musicVolume??35)))/100;master.gain.setTargetAtTime(Math.max(.0001,.18*volume),now,.9);
        skyMusic={master,voices};
      }else if(!skyMusicEnabled&&skyMusic){
        const current=skyMusic;skyMusic=null;current.master.gain.setTargetAtTime(.0001,audioContext.currentTime,.12);
        window.setTimeout(()=>{try{current.voices.forEach(v=>v.stop());current.master.disconnect();}catch(_){}},900);
      }
    }catch(_){}
  }
  document.addEventListener('pointerdown',()=>{if(gameSettings.musicEnabled&&!skyMusicEnabled)setSkyMusic(true);},{once:true,capture:true});
  function playUiSound(kind='tap'){if(skyMusicEnabled||kind==='tap')playSound(kind);}
  let furnaceCrafted=false;
  let houseLevel=1;
  let placedStructures=[];
  const villageTowerProjectiles=[];
  let farmCrops=[];
  const lootDrops=[];
  let mineUpgradeToastTimer=0;
  let enteredPlacedHouse=null;
  let tutorialStep = 0;
  const tutorialSteps = [
    {title:'Шаг 1 из 5 · Движение',key:'W A S D',text:'Зажми W, A, S или D, чтобы пройтись по долине.',done:()=>tutorialMoveSeen},
    {title:'Шаг 2 из 5 · Действие',key:'E',text:'Подойди к дорожному знаку и нажми E.',done:()=>discovered},
    {title:'Шаг 3 из 5 · Инвентарь',key:'I',text:'Открой инвентарь и посмотри предметы.',done:()=>tutorialInventorySeen},
    {title:'Шаг 4 из 5 · Задания',key:'I → Задания',text:'В инвентаре открой вкладку «Задания».',done:()=>tutorialQuestSeen},
    {title:'Шаг 5 из 5 · Исследование',key:'Space / L',text:'Пробел — атака, H — лечебное зелье, L — карта. Исследуй мир!',done:()=>tutorialCombatSeen}
  ];
  let tutorialMoveSeen=false, tutorialInventorySeen=false, tutorialQuestSeen=false, tutorialCombatSeen=false;
  const sheep = [];
  const monsters = [];
  // Defeated enemies return during the following night as persistent, empowered nemeses.
  let nemesisEvents=[];
  let lastNemesisRaidDay=-1;
  const MAX_NEMESIS_EVENTS=36;
  const coopGuestMobAttackCooldowns=new Map();let coopGuestWolfAttackCooldown=0,coopWorldEntry=null;
  function autoResumeCoopRoomOnInput(){
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(!room||room.status!=='paused'||!network.isRoomOwner||typeof network.resume!=='function')return false;
    if(coopAutoResumePromise)return true;
    const roomId=room.id;
    coopAutoResumePromise=network.resume(roomId).then(result=>{
      const current=network.getRoomState?.();
      if(current?.id===roomId&&current.status==='running')toast('Общий мир автоматически возобновлён.');
      return true;
    }).catch(error=>{
      toast(error?.message||'Не удалось автоматически возобновить общий мир.');
      return false;
    }).finally(()=>{coopAutoResumePromise=null;});
    return true;
  }
    function isCoopWorldSave(){return typeof saveKey==='string'&&saveKey.startsWith('skyrealm_coop_save_v1_');}
  function isCoopWorldActive(){const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();return isCoopWorldSave()&&room?.status==='running';}
  function newCoopEntityId(){
    try{if(window.crypto?.randomUUID)return window.crypto.randomUUID();}catch(_){}
    const bytes=new Uint8Array(16);try{window.crypto.getRandomValues(bytes);}catch(_){for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);}
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }
  function spawnSharedLoot(x,y,items,worldMode=null){
    const network=window.SkyRealmCoopClient;
    if(!isCoopWorldActive()||!network?.isRoomOwner||!Array.isArray(items))return false;
    const mode=worldMode||coopLocalWorldMode();
    if(!['surface','cave','dungeon'].includes(mode))return false;
    for(const item of items){
      if(!item||typeof item.name!=='string'||!Number.isSafeInteger(item.count)||item.count<1||item.count>99)continue;
      lootDrops.push({id:newCoopEntityId(),shared:true,x:Number(x)+(Math.random()-.5)*28,y:Number(y)+(Math.random()-.5)*24,
        name:item.name,count:item.count,life:240,phase:Math.random()*6.28,world_mode:mode});
    }
    if(lootDrops.length>100)lootDrops.splice(0,lootDrops.length-100);
    saveGame();return true;
  }
  function grantLootToPersonalInventory(name,count){
    const amount=Math.max(1,Math.min(99,Math.floor(Number(count)||0)));
    if(name==='Золото'){walletCents=Math.min(999999999,walletCents+amount*100);updateWalletHud();return;}
    changeItem(name,amount);renderInventory();
  }
  function queueGuestCoopAction(actionType,payload,successText){
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(!isCoopWorldSave()||!room||room.status!=='running'||network?.isRoomOwner)return false;
    const actionId=newCoopEntityId(),key=saveKey+'_coop_pending_world_actions';let pending=[];
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))pending=value;}catch(_){}
    if(pending.length>=20){toast('Сначала дождись обработки предыдущих действий.');return true;}
    pending.push({action_id:actionId,action_type:actionType,reserved_item:null});
    try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){toast('Не удалось сохранить сетевое действие.');return true;}
    network.enqueueWorldAction(actionType,payload,actionId).then(action=>{
      if(!action?.action_id)throw new Error('Сервер не подтвердил запрос.');
      if(successText)toast(successText);
    }).catch(error=>{
      if(error?.code&&!['INTERNAL_ERROR','COOP_BACKEND_ERROR'].includes(error.code)){
        try{localStorage.setItem(key,JSON.stringify(pending.filter(v=>v.action_id!==actionId)));}catch(_){}
      }
      toast(error?.message||'Не удалось отправить действие. Проверяю его статус.');
    });
    return true;
  }
  function queueGuestEnemyHit(kind,id,weapon,damage){
    return queueGuestCoopAction('damage_enemy',{target_kind:kind,target_id:String(id),weapon,damage:Math.max(1,Math.min(500,Math.round(damage)))},
      'Удар отправлен в общий мир. Враг получит урон после проверки владельцем комнаты.');
  }
  function queueGuestLootPickup(drop){
    if(!drop?.shared||!drop.id)return false;
    return queueGuestCoopAction('pickup_loot',{loot_id:drop.id,x:player.x,y:player.y,world_mode:coopLocalWorldMode()},
      'Запрос на подбор общей добычи отправлен.');
  }
  let bloodMoonActive=false,bloodMoonRewardPending=false,lastBloodMoonNight=-1;
  let wolfBossActive=false,wolfBossHp=0,wolfBossKeyDropped=false,wolfCageOpen=false,wolfDogCaged=true,wolfBossFlash=0,wolfBossAttackTimer=1.2,wolfBossSpecialTimer=7,wolfBossX=0,wolfBossY=0,wolfBossDefeated=false;
  let wolfCompanionUnlocked=false,wolfCompanionHp=300,wolfCompanionAttackTimer=.5,wolfCompanionRevivals=0,wolfDogDeathHandled=false,wolfCompanionOffsetX=20,wolfCompanionOffsetY=24;
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  // Only items the character currently owns are shown. Resources with count 0 stay hidden.
  const inventoryItems = [
    { name: 'Корабль', icon: '⛵', count: 0, description: 'Парусный корабль для выхода за горизонт и исследования моря.' },
    { name: 'Водяной шлем', icon: '🤿', count: 0, description: 'Уровень 1 — 1 минута, 2 — 4 минуты, 3 — 8 минут, 4 — без ограничения. Не даёт защиты.' },
    { name: 'Карта сокровищ', icon: '🗺️', count: 0, description: 'Карта с координатами настоящего затонувшего сундука.' },
    { name: 'Компас приливов', icon: '🧭', count: 0, description: 'Редкий морской артефакт. Нельзя создать на верстаке.' },
    { name: 'Плащ морского странника', icon: '🧥', count: 0, description: 'Уникальный плащ из морских сокровищ. Нельзя создать на верстаке.' },
    { name: 'Кольцо глубин', icon: '💍', count: 0, description: 'Редкая реликвия подводных путей. Нельзя создать на верстаке.' },
    { name: 'Коралловая корона', icon: '👑', count: 0, description: 'Корона древнего морского народа. Нельзя создать на верстаке.' },
    { name: 'Сфера прилива', icon: '🔵', count: 0, description: 'Необычный артефакт, найденный только в морских сундуках.' },
    { name: 'Сапоги волн', icon: '🥾', count: 0, description: 'Редкая экипировка из затонувшего сундука. Нельзя создать на верстаке.' },
    { name: 'Перо штормового ската', icon: '🪶', count: 0, description: 'Редкий трофей морского существа. Нельзя создать на верстаке.' },
    { name: 'Морской талисман', icon: '🔱', count: 0, description: 'Уникальный талисман из тайников глубин.' },
    { name: 'Сердце прилива', icon: '❤️', count: 0, description: 'Трофей первого бога моря. Нельзя создать на верстаке.' },
    { name: 'Око бездны', icon: '👁️', count: 0, description: 'Трофей второго бога моря. Нельзя создать на верстаке.' },
    { name: 'Ключ великой сокровищницы', icon: '🗝️', count: 0, description: 'Ключ от главного зала сокровищницы.' },
    { name: 'Корона двух морей', icon: '👑', count: 0, description: 'Награда за победу над обоими богами моря.' },
    { name: 'Реликвия древних глубин', icon: '🔱', count: 0, description: 'Древняя реликвия из главного зала. Нельзя создать на верстаке.' },
    { name: 'Осколок Бездны', icon: '🌑', count: 0, description: 'Редкий материал элитных существ Мира боссов. Нельзя создать на верстаке.' },
    { name: 'Печать главаря', icon: '🔰', count: 0, description: 'Трофей за победу над главарём Мира боссов. Нельзя создать на верстаке.' },
    { name: 'Чешуя Разлома', icon: '🐉', count: 0, description: 'Редкий трофей Разломного дракона. Нельзя создать на верстаке.' },
    { name: 'Сердце Бога', icon: '💠', count: 0, description: 'Уникальный трофей за победу над богом Мира боссов. Нельзя создать на верстаке.' },
    { name: 'Деревянный меч', icon: '🗡️', count: 1, description: 'Простое оружие. Наносит 20 урона.' },
    { name: 'Железный меч', icon: '⚔️', count: 0, description: 'Улучшенное оружие. Наносит 35 урона монстрам.' },
    { name: 'Огненный меч', icon: '🔥', count: 0, description: 'Редкое оружие кузницы. Наносит 50 базового урона и оставляет огненные искры.' },
    { name: 'Стальной меч', icon: '⚔️', count: 0, description: 'Крепкий меч. Наносит 62 базового урона.' },
    { name: 'Меч титана', icon: '⚔️', count: 0, description: 'Легендарный меч. Наносит 100 базового урона; сила растёт со сложностью.' },
    { name: 'Меч дракона', icon: '🔥', count: 0, description: 'Легендарный меч. Наносит 130 базового урона; сила растёт со сложностью.' },
    { name: 'Меч пустоты', icon: '🌑', count: 0, description: 'Легендарный меч. Наносит 170 базового урона; сила растёт со сложностью.' },
    { name: 'Ледяной посох', icon: '🪄', count: 0, description: 'Магическое оружие: атакует монстров на расстоянии до 230 пикселей.' },
    { name: 'Молниеносное копьё', icon: '🔱', count: 0, description: 'Редкое оружие с дальностью 125 и высоким уроном.' },
    { name: 'Трезубец прилива', icon: '🔱', count: 0, description: 'Морское легендарное оружие. 210 базового урона, усиливается на высоких сложностях.' },
    { name: 'Гарпун бури', icon: '⚡', count: 0, description: 'Мощное морское оружие. 280 базового урона, особенно эффективно против морских боссов.' },
    { name: 'Клинок бездны', icon: '🌊', count: 0, description: 'Легендарное оружие глубин. 360 базового урона, усиливается на высоких сложностях.' },
    { name: 'Клинок живого корня', icon: '🌿', count: 0, description: 'Реликтовый клинок Корнееда. 245 базового урона; усиливается со сложностью.' },
    { name: 'Кирка мастера', icon: '⛏️', count: 0, description: 'Продвинутая кирка. Разрушает залежи одним ударом.' },
    { name: 'Кожаная броня', icon: '🦺', count: 0, description: 'Снижает урон от монстров на 40%, пока надета.' },
    { name: 'Броня стража', icon: '🛡️', count: 0, description: 'Тяжёлая броня: снижает получаемый урон на 52%.' },
    { name: 'Доспехи древнего корня', icon: '🌳', count: 0, description: 'Реликтовый нагрудник: снижает получаемый урон на 58%.' },
    { name: 'Шлем Бога', icon: '👑', count: 0, description: 'Божественный шлем. Снижает получаемый урон на 18%.' },
    { name: 'Поножи Бога', icon: '🦵', count: 0, description: 'Божественные поножи. Снижают получаемый урон на 12%.' },
    { name: 'Сапоги Бога', icon: '🥾', count: 0, description: 'Божественные сапоги. Снижают получаемый урон на 8%.' },
    { name: 'Амулет Бога', icon: '💠', count: 0, description: 'Божественный амулет. Снижает получаемый урон на 12%.' },
    { name: 'Мантия мага', icon: '🥋', count: 0, description: 'Мантия: снижает урон на 25% и усиливает посох.' },
    { name: 'Шлем стража', icon: '🛡️', count: 0, description: 'Тяжёлый шлем: снижает урон на 16%. Часть комплекта Стража.' },
    { name: 'Сапоги стража', icon: '🥾', count: 0, description: 'Тяжёлые сапоги для комплекта Стража.' },
    { name: 'Корона мага', icon: '👑', count: 0, description: 'Руническая корона. Часть комплекта Мага.' },
    { name: 'Сапоги мага', icon: '✨', count: 0, description: 'Сапоги с рунами. Часть комплекта Мага.' },
    { name: 'Амулет мага', icon: '🔮', count: 0, description: 'Фокусирует силу ледяного посоха. Часть комплекта Мага.' },
    { name: 'Наковальня', icon: '⚒️', count: 0, description: 'Создай наковальню, чтобы разблокировать улучшение оружия и брони.' },
    { name: 'Топор', icon: '🪓', count: 1, description: 'Ударь дерево 5 раз, чтобы получить древесину, листья и палку.' },
    { name: 'Кирка', icon: '⛏️', count: 1, description: 'Выбери кирку, войди в шахту и нажми по залежи левой кнопкой мыши 2 раза.' },
    { name: 'Лопата', icon: '🪏', count: 1, description: 'Выбери лопату и нажми левой кнопкой по снежной клетке. Нужно 3 удара, чтобы убрать снег.' },
    { name: 'Удочка', icon: '🎣', count: 0, description: 'Выбери удочку, подойди к берегу озера и нажми E. Не двигайся, пока ждёшь поклёвку.' },
    { name: 'Древесина', icon: '🪵', count: 0, description: '7 штук выпадает при рубке дерева.' },
    { name: 'Листья', icon: '🍃', count: 0, description: '3 листка выпадает при рубке дерева.' },
    { name: 'Палка', icon: '🪵', count: 0, description: 'Одна палка выпадает при рубке дерева.' },
    { name: 'Малое зелье', icon: '🧪', count: 2, description: 'Лечебное зелье: восстанавливает до 60 HP постепенно за 5 секунд. Нажми H.' },
    { name: 'Лечебная трава', icon: '🌿', count: 1, description: 'Ароматная трава, которую можно будет использовать позже.' },
    { name: 'Старая записка', icon: '📜', count: 1, description: 'Записка, найденная перед началом путешествия.' },
    { name: 'Кость', icon: '🦴', count: 0, description: 'Выпадает со скелетов и тяжёлых монстров.' },
    { name: 'Череп', icon: '💀', count: 0, description: 'Редкая добыча со скелетов.' },
    { name: 'Теневая эссенция', icon: '🌑', count: 0, description: 'Сгусток энергии теневого монстра.' },
    { name: 'Ядро духа', icon: '🔷', count: 0, description: 'Светящееся ядро болотного духа.' },
    { name: 'Осколок бомбы', icon: '💣', count: 0, description: 'Нестабильный фрагмент взрывного монстра.' },
    { name: 'Мясо', icon: '🍖', count: 0, description: 'Обычное мясо. Восстанавливает 10 голода.' },
    { name: 'Сырое мясо', icon: '🥩', count: 0, description: 'Свежее мясо овцы. Восстанавливает 10 голода. Можно пожарить у печи.' },
    { name: 'Жареное мясо', icon: '🍗', count: 0, description: 'Приготовленное мясо. Восстанавливает 15 голода.' },
    { name: 'Печь', icon: '🔥', count: 0, description: 'Выбери печь в нижнем инвентаре и щёлкни по свободному месту, чтобы поставить её.' },
    { name: 'Комплект дома', icon: '🏠', count: 0, description: 'Выбери комплект дома и щёлкни по свободному месту, чтобы построить дополнительный дом.' },
    { name: 'Факел', icon: '🕯️', count: 0, description: 'Декоративный факел для размещения на земле.' },
    { name: 'Бинт', icon: '🩹', count: 0, description: 'Используй бинт клавишей B, чтобы восстановить 20 здоровья.' },
    { name: 'Улучшенная кирка', icon: '⛏️', count: 0, description: 'Добывает руду за один удар. Создаётся из железа и древесины.' },
    { name: 'Угольный блок', icon: '🪨', count: 0, description: 'Декоративный блок для размещения на земле.' },
    { name: 'Шлем лесника', icon: '🪖', count: 0, description: 'Снижает получаемый урон на 15%, если надет.' },
    { name: 'Сапоги странника', icon: '🥾', count: 0, description: 'Повышают скорость бега, если надеты.' },
    { name: 'Амулет стража', icon: '📿', count: 0, description: 'Уменьшает получаемый урон ещё на 10%, если надет.' },
    { name: 'Сундук-хранилище', icon: '📦', count: 0, description: 'Можно разместить на земле и складывать в него вещи.' },
    { name: 'Грядка с семенами', icon: '🌱', count: 0, description: 'Размести на земле. Через некоторое время вырастет урожай.' },
    { name: 'Урожай', icon: '🌾', count: 0, description: 'Собранный урожай для продажи или будущих рецептов.' },
    { name: 'Лейка', icon: '🚿', count: 0, description: 'Выбери и нажми E у грядки, чтобы полить.' },
    { name: 'Серп', icon: '🌾', count: 0, description: 'Добавляет единицу к собранному урожаю.' },
    { name: 'Компост', icon: '🪱', count: 0, description: 'Ускоряет рост культуры.' },
    { name: 'Удобрение', icon: '💩', count: 0, description: 'Увеличивает количество урожая.' },
    { name: 'Семена пшеницы', icon: '🌾', count: 0, description: 'Семена пшеницы.' },
    { name: 'Семена моркови', icon: '🥕', count: 0, description: 'Семена моркови.' },
    { name: 'Семена картофеля', icon: '🥔', count: 0, description: 'Семена картофеля.' },
    { name: 'Семена томата', icon: '🍅', count: 0, description: 'Семена томата.' },
    { name: 'Семена кукурузы', icon: '🌽', count: 0, description: 'Семена кукурузы.' },
    { name: 'Семена тыквы', icon: '🎃', count: 0, description: 'Семена тыквы.' },
    { name: 'Семена клубники', icon: '🍓', count: 0, description: 'Семена клубники.' },
    { name: 'Пшеница', icon: '🌾', count: 0, description: 'Урожай пшеницы.' },
    { name: 'Морковь', icon: '🥕', count: 0, description: 'Урожай моркови.' },
    { name: 'Картофель', icon: '🥔', count: 0, description: 'Урожай картофеля.' },
    { name: 'Томат', icon: '🍅', count: 0, description: 'Урожай томатов.' },
    { name: 'Кукуруза', icon: '🌽', count: 0, description: 'Урожай кукурузы.' },
    { name: 'Тыква', icon: '🎃', count: 0, description: 'Урожай тыквы.' },
    { name: 'Клубника', icon: '🍓', count: 0, description: 'Урожай клубники.' },
    { name: 'Пустынный хитин', icon: '🦂', count: 0, description: 'Плотный панцирь пустынного скорпиона.' },
    { name: 'Медь', icon: '🟠', count: 0, description: 'Мягкая руда шахты 2 уровня. Нужна для ранних улучшений.' },
    { name: 'Олово', icon: '⚪', count: 0, description: 'Светлая руда шахты 2 уровня.' },
    { name: 'Серебро', icon: '🥈', count: 0, description: 'Редкая руда шахты 3 уровня.' },
    { name: 'Золото', icon: '🥇', count: 0, description: 'Драгоценная руда шахты 3 уровня.' },
    { name: 'Рубин', icon: '🔴', count: 0, description: 'Красный самоцвет шахты 4 уровня.' },
    { name: 'Сапфир', icon: '🔵', count: 0, description: 'Синий самоцвет шахты 4 уровня.' },
    { name: 'Обсидиан', icon: '⬛', count: 0, description: 'Вулканическая руда шахты 4 уровня.' },
    { name: 'Мифрил', icon: '🩵', count: 0, description: 'Легендарная руда шахты 5 уровня.' },
    { name: 'Уран', icon: '☢️', count: 0, description: 'Редкая светящаяся руда шахты 5 уровня.' },
    { name: 'Алмаз', icon: '💠', count: 0, description: 'Самый редкий самоцвет шахты 5 уровня.' },
    { name: 'Зелье скорости', icon: '💨', count: 0, description: 'На 30 секунд повышает скорость передвижения. Нажми J.' },
    { name: 'Настой силы', icon: '🧪', count: 0, description: 'На 30 секунд повышает урон на 30%. Нажми J.' },
    { name: 'Зелье защиты', icon: '🛡️', count: 0, description: 'На 30 секунд добавляет сопротивление урону. Нажми J.' },
    { name: 'Сердце ледника', icon: '❄️', count: 0, description: 'Трофей Ледяного титана.' },
    { name: 'Жало короля', icon: '🦂', count: 0, description: 'Трофей Короля скорпионов.' },
    { name: 'Сердце порчи', icon: '💚', count: 0, description: 'Трофей Стража порчи.' },
    { name: 'Сердце джунглей', icon: '🌿', count: 0, description: 'Трофей Хранителя лиан из Затерянных джунглей.' },
    { name: 'Метеоритный осколок', icon: '☄️', count: 0, description: 'Редкий материал с метеоритного дождя.' },
    { name: 'Реликвия руин', icon: '🏺', count: 0, description: 'Древняя реликвия из последней комнаты подземелья.' },
    { name: 'Эссенция глубин', icon: '🔮', count: 0, description: 'Добыча стражей подземелья.' },
    { name: 'Осколок пробуждения', icon: '✨', count: 0, description: 'Материал эволюции легендарных артефактов. Выпадает с элитных врагов, боссов и богов Мира боссов.' },
    { name: 'Рыба', icon: '🐟', count: 0, description: 'Свежая рыба с озера. Можно продать охотнику или съесть, чтобы восстановить 12 голода.' },
    { name: 'Жемчуг', icon: '🦪', count: 0, description: 'Редкая находка во время рыбалки. Хорошо ценится охотником.' },
    ...resourceItems];
  // Boss Realm: ten persistent legendary passive relics.
  const BOSS_REALM_RELICS = [
    {name:"\u0421\u0435\u0440\u0434\u0446\u0435 \u041f\u0435\u043f\u043b\u0430",icon:"\ud83d\udd25",count:0,description:"\u0423\u0440\u043e\u043d \u043e\u0440\u0443\u0436\u0438\u044f +7%. \u0420\u0435\u043b\u0438\u043a\u0432\u0438\u044f \u041f\u0435\u043f\u0435\u043b\u044c\u043d\u043e\u0433\u043e \u0422\u0438\u0442\u0430\u043d\u0430."},
    {name:"\u041a\u043e\u0440\u043e\u043d\u0430 \u041c\u043e\u0440\u043e\u0437\u0430",icon:"\ud83d\udc51",count:0,description:"\u0417\u0430\u0449\u0438\u0442\u0430 +4%. \u0420\u0435\u043b\u0438\u043a\u0432\u0438\u044f \u041b\u0435\u0434\u044f\u043d\u043e\u0439 \u0418\u043c\u043f\u0435\u0440\u0430\u0442\u0440\u0438\u0446\u044b."},
    {name:"\u0417\u0435\u0440\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u041f\u0440\u0438\u0437\u043c\u0430",icon:"\ud83d\udca0",count:0,description:"\u0423\u0440\u043e\u043d +4%, \u0448\u0430\u043d\u0441 \u043a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0443\u0434\u0430\u0440\u0430 +4%."},
    {name:"\u0427\u0435\u0448\u0443\u044f \u0420\u0430\u0437\u043b\u043e\u043c\u043d\u043e\u0433\u043e \u0414\u0440\u0430\u043a\u043e\u043d\u0430",icon:"\ud83d\udc09",count:0,description:"\u0417\u0430\u0449\u0438\u0442\u0430 +5%."},
    {name:"\u041f\u0435\u0447\u0430\u0442\u044c \u0411\u0435\u0437\u0434\u043d\u044b",icon:"\ud83c\udf11",count:0,description:"\u0423\u0440\u043e\u043d \u043e\u0440\u0443\u0436\u0438\u044f +6%."},
    {name:"\u041a\u043e\u0440\u0435\u043d\u044c \u0414\u0440\u0435\u0432\u043d\u0435\u0433\u043e \u041f\u043e\u0436\u0438\u0440\u0430\u0442\u0435\u043b\u044f",icon:"\ud83c\udf3f",count:0,description:"\u0417\u0430\u0449\u0438\u0442\u0430 +5%."},
    {name:"\u0417\u043d\u0430\u043a \u0420\u044b\u0446\u0430\u0440\u044f \u041a\u043e\u043d\u0446\u0430",icon:"\u2694\ufe0f",count:0,description:"\u0423\u0440\u043e\u043d \u043e\u0440\u0443\u0436\u0438\u044f +6%."},
    {name:"\u0410\u0441\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u041e\u0440\u0435\u043e\u043b",icon:"\u2728",count:0,description:"\u0423\u0440\u043e\u043d \u043e\u0440\u0443\u0436\u0438\u044f +8%."},
    {name:"\u041f\u0435\u0441\u043e\u0447\u043d\u044b\u0435 \u0427\u0430\u0441\u044b \u0425\u0440\u043e\u043d\u043e\u0441\u0430",icon:"\u231b",count:0,description:"\u0423\u0440\u043e\u043d +4%, \u0437\u0430\u0449\u0438\u0442\u0430 +3%."},
    {name:"\u042f\u0434\u0440\u043e \u0420\u0430\u0437\u0440\u0443\u0448\u0438\u0442\u0435\u043b\u044f \u041c\u0438\u0440\u043e\u0432",icon:"\ud83d\udc8e",count:0,description:"\u0423\u0440\u043e\u043d +12%, \u0437\u0430\u0449\u0438\u0442\u0430 +5%."},
    {name:'Сердце Древнего Леса',icon:'🌳',count:0,description:'Урон +14%, защита +7%. Реликвия Короля Древнего Леса.'}
  ];
  for (const relic of BOSS_REALM_RELICS) if (!inventoryItems.some(item => item.name === relic.name)) inventoryItems.push({...relic});

  const starterItemCounts = inventoryItems.map(item => ({name:item.name,count:item.count}));

  function normalizeGameSettings(value = {}) {
    const s = {...DEFAULT_GAME_SETTINGS, ...(value && typeof value === 'object' ? value : {})};
    if (!['1280x720','1600x900','1920x1080','1280x960','1440x900'].includes(s.resolution)) s.resolution = DEFAULT_GAME_SETTINGS.resolution;
    if (!['windowed','fullscreen'].includes(s.windowMode)) s.windowMode = DEFAULT_GAME_SETTINGS.windowMode;
    if (!['low','medium','high'].includes(s.graphicsQuality)) s.graphicsQuality = DEFAULT_GAME_SETTINGS.graphicsQuality;
    if (!['balanced','boost'].includes(s.performanceMode)) s.performanceMode = DEFAULT_GAME_SETTINGS.performanceMode;
    if (![0,30,60,120,144].includes(Number(s.fpsLimit))) s.fpsLimit = 0; else s.fpsLimit = Number(s.fpsLimit);
    s.vsync = s.vsync !== false;
    for (const key of ['musicVolume','sfxVolume']) s[key] = Math.max(0,Math.min(100,Math.round(Number(s[key])||0)));
    s.musicEnabled = s.musicEnabled === true;
    const rawBindings=s.keyBindings&&typeof s.keyBindings==='object'?s.keyBindings:{};
    const validBinding=code=>/^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Space|Digit[0-9])$/.test(String(code||''));
    const bindings={};Object.keys(DEFAULT_GAME_KEY_BINDINGS).forEach(action=>{bindings[action]=validBinding(rawBindings[action])?String(rawBindings[action]):DEFAULT_GAME_KEY_BINDINGS[action];});
    if(new Set(Object.values(bindings)).size!==Object.keys(DEFAULT_GAME_KEY_BINDINGS).length)s.keyBindings={...DEFAULT_GAME_KEY_BINDINGS};else s.keyBindings=bindings;
    if (!['85','100','115'].includes(String(s.uiScale))) s.uiScale = '100'; else s.uiScale = String(s.uiScale);
    ['showVitals','showQuest','showControls','showInventory','showMinimap'].forEach(k => s[k] = s[k] !== false);
    s.adminMode = s.adminMode === true;
    s.moderatorMode = s.moderatorMode === true;
    return s;
  }
  function readInitialSettings() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('settings');
      if (fromUrl) return normalizeGameSettings(JSON.parse(fromUrl));
      return normalizeGameSettings(JSON.parse(localStorage.getItem('skyrealm_game_preferences') || '{}'));
    } catch (_) { return {...DEFAULT_GAME_SETTINGS}; }
  }
  function hash(x, y) { let n = x * 374761393 + y * 668265263 + 1442695041; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
  function setupWorld() {
    // Rebuild deterministic local geometry for the selected world size.
    world.ancientForestSeeded=false;world.trees.length=0;world.rocks.length=0;world.flowers.length=0;world.fireflies.length=0;world.signs.length=0;world.fences.length=0;quarryAnchorCache=null;
    for (let y = 2; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) {
      const h = hash(x, y);
      if (h > (biomeAt(x,y)==='jungle'?.988:.995) && !nearPath(x, y) && !nearVillage(x, y)) world.trees.push({ x: x * TILE + 16, y: y * TILE + 17, size: 0.85 + hash(y, x) * .42, tint: Math.floor(hash(x + 44, y) * 3), fruitful: hash(x + 701, y + 313) > .94 });
      if (h < .013 && !nearPath(x, y) && !nearVillage(x,y)) { const rockSize=0.7+hash(y,x+4)*0.65, vein=hash(x+107,y+811); const ore=vein<.028?'Кристалл':vein<.09?'Железо':vein<.145?'Уголь':vein<.205?'Медь':'Камень'; const hits=Math.max(2,Math.min(4,Math.round(rockSize*2.4)+1)); world.rocks.push({x:x*TILE+16,y:y*TILE+21,s:rockSize,ore,quality:1+Math.floor(hash(x+19,y+83)*3),hp:hits,maxHp:hits,regrowAt:0,hitFlash:0}); }
      if (h > .53 && h < .552) world.flowers.push({x:x*TILE+hash(x,y+10)*25+3,y:y*TILE+hash(x+3,y)*26+3,c:Math.floor(hash(y+7,x)*4)});
      if (h > .79 && h < .792) world.fireflies.push({x:x*TILE+hash(x+19,y)*TILE,y:y*TILE+hash(x,y+19)*TILE,phase:hash(x+1,y+3)*6.28});
    }
    for(let fy=Math.max(ROWS-26,3);fy<ROWS-3;fy+=6)for(let fx=Math.max(COLS-31,3);fx<COLS-3;fx+=6){if(!nearPath(fx,fy)&&!waterAt(fx+.5,fy+.5)&&Math.abs(fy-(ROWS-13))>2&&Math.hypot(fx-(COLS-14),fy-(ROWS-13))>5&&hash(fx+401,fy+809)>.82)world.trees.push({x:fx*TILE+16,y:fy*TILE+17,size:.85+hash(fy+90,fx+70)*.35,tint:Math.floor(hash(fx+44,fy+99)*3),fruitful:hash(fx+701,fy+313)>.94});}
    setupVillageNpcs();
    world.signs.push({ x: 34*TILE+16, y: 22*TILE+12 });
    // A tiny village fence around a cabin.
    for (let x=34;x<=39;x++) { world.fences.push({x:x*TILE+16,y:17*TILE+16}); world.fences.push({x:x*TILE+16,y:21*TILE+16}); }
    for (let y=18;y<=20;y++) { if(y!==20) world.fences.push({x:34*TILE+16,y:y*TILE+16}); world.fences.push({x:39*TILE+16,y:y*TILE+16}); }
  }
  function isForestTile(x,y){return x>=COLS-32&&x<=COLS-3&&y>=ROWS-27&&y<=ROWS-3;}
  function inForest(x,y){return isForestTile(Math.floor(x/TILE),Math.floor(y/TILE));}
  function wolfDenPosition(){return {x:(COLS-14)*TILE+16,y:(ROWS-13)*TILE+16};}
  function wolfCagePosition(){return {x:wolfDenPosition().x+104,y:wolfDenPosition().y+4};}
  function playWolfSound(kind='growl'){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioContext)audioContext=new AC();if(audioContext.state==='suspended')audioContext.resume();const now=audioContext.currentTime;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=kind==='howl'?'sawtooth':'triangle';osc.frequency.setValueAtTime(kind==='howl'?260:105,now);osc.frequency.exponentialRampToValueAtTime(kind==='howl'?72:48,now+.65);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(kind==='howl'?.15:.10,now+.06);gain.gain.exponentialRampToValueAtTime(.0001,now+.75);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now);osc.stop(now+.78);}catch(_){}}
  function drawWolfCage(camX,camY,time=0){const p=wolfCagePosition(),x=p.x-camX,y=p.y-camY;if(x<-90||x>width+90||y<-90||y>height+90)return;ctx.save();ctx.fillStyle='#342b25';ctx.fillRect(x-28,y+11,58,7);ctx.fillStyle='#4b515c';ctx.fillRect(x-27,y-24,5,39);ctx.fillRect(x+22,y-24,5,39);ctx.fillRect(x-27,y-24,54,5);ctx.fillRect(x-27,y+8,54,4);for(let i=-17;i<=17;i+=11){ctx.fillStyle='#8994a1';ctx.fillRect(x+i-2,y-20,4,29);}if(!wolfCageOpen){ctx.fillStyle='#9a7542';ctx.fillRect(x-8,y-22,5,30);ctx.fillStyle='#f6d06e';ctx.beginPath();ctx.arc(x+1,y-5,4,0,Math.PI*2);ctx.fill();}if(wolfDogCaged){const bob=Math.sin(time/180)*2;ctx.fillStyle='#aab9c9';ctx.beginPath();ctx.ellipse(x,y+3+bob,12,7,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+8,y-3+bob,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#71839c';ctx.beginPath();ctx.moveTo(x+5,y-7+bob);ctx.lineTo(x+4,y-15+bob);ctx.lineTo(x+10,y-9+bob);ctx.moveTo(x+11,y-7+bob);ctx.lineTo(x+16,y-13+bob);ctx.lineTo(x+15,y-4+bob);ctx.fill();ctx.fillStyle='#ffdf8c';ctx.fillRect(x+10,y-4+bob,2,2);}ctx.fillStyle='#fff';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText(wolfCageOpen?(wolfDogCaged?'E — освободить собаку':'Клетка открыта'):'Клетка · нужен ключ',x,y-34);ctx.restore();}
  function wolfCompanionX(){return player.x+wolfCompanionOffsetX;}
  function wolfCompanionY(){return player.y+wolfCompanionOffsetY;}
  function nearPath(x,y){return (y>24&&y<28&&x>3&&x<38)||(Math.abs((x+y)-48)<2&&x>27&&x<38&&y>13&&y<25)||(x>34&&x<41&&y>15&&y<22);}
  let tradeLayoutsCache=null,tradeLayoutsCols=0,tradeLayoutsRows=0;
  function tradeVillageLayouts(){if(tradeLayoutsCache&&tradeLayoutsCols===COLS&&tradeLayoutsRows===ROWS)return tradeLayoutsCache;tradeLayoutsCols=COLS;tradeLayoutsRows=ROWS;return tradeLayoutsCache=[{id:'forest',x:Math.floor(COLS*.18),y:Math.floor(ROWS*.28),name:'ЛЕСНОЙ ПРИЧАЛ',biome:'forest',houses:['merchant','farmer']},{id:'snow',x:Math.floor(COLS*.75),y:Math.floor(ROWS*.10),name:'СНЕЖНАЯ СТОЯНКА',biome:'snow',houses:['hunter','guard']},{id:'desert',x:Math.floor(COLS*.08),y:Math.floor(ROWS*.78),name:'ПЕСЧАНЫЙ БАЗАР',biome:'desert',houses:['builder']},{id:'volcano',x:Math.floor(COLS*.52),y:Math.floor(ROWS*.08),name:'УГОЛЬНАЯ КРЕПОСТЬ',biome:'volcano',houses:['miner','mage']},{id:'blight',x:Math.floor(COLS*.78),y:Math.floor(ROWS*.76),name:'ЗАРОСШАЯ ЗАСТАВА',biome:'blight',houses:['alchemist']}];}
  function nearVillage(x,y){const x2=Math.floor(COLS*.62),y2=Math.floor(ROWS*.58);return (x>29&&x<48&&y>13&&y<36)||(x>x2-8&&x<x2+9&&y>y2-8&&y<y2+9)||tradeVillageLayouts().some(v=>Math.hypot(x-v.x,y-v.y)<19);}
  function resize(){const r=canvas.getBoundingClientRect();const deviceDpr=window.devicePixelRatio||1;const quality=gameSettings.graphicsQuality;dpr=gameSettings.performanceMode==='boost'?Math.max(.72,Math.min(deviceDpr,1)*.82):quality==='low'?Math.max(.65,Math.min(deviceDpr,1)*.72):quality==='high'?Math.min(2,deviceDpr*1.45):Math.min(deviceDpr,1.15);width=r.width;height=r.height;canvas.width=Math.max(1,Math.floor(width*dpr));canvas.height=Math.max(1,Math.floor(height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=quality!=='low';}
  function roundedRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
  function waterAt(x,y){if(tradeWorldMode)return false;const cx=52,cy=36,dx=(x-cx)/6.5,dy=(y-cy)/4.3;return dx*dx+dy*dy<1;}
  function pathAt(x,y){if(tradeWorldMode){const sx=tradeEntranceX,sy=tradeEntranceY;if(x>=sx-3&&x<=FARMER_SHOP.x+4&&Math.abs(y-sy)<=2.1)return true;for(const v of tradeVillageLayouts()){const dx=v.x-sx,dy=v.y-sy,t=dx?(x-sx)/dx:0;if(t>=0&&t<=1&&Math.abs(y-(sy+dy*t))<=1.6)return true;}return false;}if(y>=25&&y<=26&&x>=3&&x<=36)return true;let t=x+y;if(x>=27&&x<=37&&y>=14&&y<=24&&Math.abs(t-49)<=1.2)return true;if(x>=35&&x<=40&&y>=17&&y<=21)return true;const vx=Math.max(70,Math.min(COLS-16,Math.floor(COLS*.62))),vy=Math.max(48,Math.min(ROWS-16,Math.floor(ROWS*.58)));if((y>=25&&y<=27&&x>=34&&x<=48)||(Math.abs(y-31)<=1&&x>=44&&x<=vx)||(Math.abs(x-vx)<=1&&y>=31&&y<=vy+3))return true;return false;}
  function biomeAt(x,y){if(x>COLS*.44&&x<COLS*.60&&y<ROWS*.15)return 'volcano';if(x<COLS*.155&&y>ROWS*.60)return 'desert';if(x>COLS*.62&&y>ROWS*.55)return 'blight';if(x>COLS*.18&&x<COLS*.40&&y>ROWS*.36&&y<ROWS*.64)return 'jungle';return 'snow';}
  function biomeNameAt(x,y){return ({forest:'Лесная долина',snow:'Снежный рубеж',desert:'Песчаная пустошь',blight:'Заражённые земли',volcano:'Вулканические земли',jungle:'Затерянные джунгли'})[biomeAt(x,y)]||'Лесная долина';}
  function drawGrass(x,y,sx,sy){
    const h=hash(x,y),biome=clearedSnowTiles.has(tileKey(x,y))?'forest':biomeAt(x,y);
    const palettes={forest:['#285b43','#2a6047','#285840','#397451','#306849','#4d8254'],snow:['#b9cbd0','#a7bdc7','#c3d4d8','#d9e7e9','#afc8d1','#f0f6f6'],desert:['#b99a58','#c4a767','#ad8d4d','#d3b875','#b89a5d','#e2c981'],blight:['#3d493c','#354438','#46503a','#52603f','#43523b','#7f8a48'],jungle:['#164d35','#1c603d','#14502f','#2e8a4e','#267544','#8bcf62'],volcano:['#43352f','#594039','#332c31','#a64b2f','#7d6650','#ff9d4f']};
    const p=palettes[biome],quality=gameSettings.graphicsQuality!=='low'&&gameSettings.performanceMode!=='boost';
    ctx.fillStyle=h>.5?p[0]:h>.2?p[1]:p[2];ctx.fillRect(sx,sy,TILE,TILE);
    // Soft bevels make the existing terrain read as continuous ground instead of flat color blocks.
    ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(sx,sy,TILE,1);ctx.fillRect(sx,sy,1,TILE);
    ctx.fillStyle='rgba(0,0,0,.075)';ctx.fillRect(sx,sy+TILE-2,TILE,2);ctx.fillRect(sx+TILE-2,sy,2,TILE);
    if(quality){
      // Stable, low-cost surface grain; coordinates are world-seeded so the pattern never flickers.
      for(let i=0;i<3;i++){
        const gx=sx+3+hash(x*17+i*13,y*19+i*7)*(TILE-7),gy=sy+3+hash(x*23+i*5,y*11+i*17)*(TILE-7);
        ctx.fillStyle=i===0?'rgba(10,18,20,.12)':'rgba(235,232,205,.10)';
        ctx.fillRect(gx,gy,1+(i%2),1);
      }
      if(biome==='forest'||biome==='jungle'){
        const tuft=hash(x+41,y+73);
        if(tuft>.42){const gx=sx+5+tuft*13,gy=sy+9+hash(x+91,y+17)*15;ctx.strokeStyle=biome==='jungle'?'rgba(151,215,111,.42)':'rgba(145,190,126,.32)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(gx-2,gy+3);ctx.lineTo(gx,gy);ctx.lineTo(gx+2,gy+3);ctx.stroke();}
      }else if(biome==='snow'){
        const glint=hash(x+63,y+29);if(glint>.38){ctx.fillStyle='rgba(255,255,255,.38)';ctx.fillRect(sx+4+glint*16,sy+5+hash(x+12,y+81)*18,2,1);}
      }else if(biome==='desert'){
        ctx.strokeStyle='rgba(255,229,166,.16)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx+4,sy+8+hash(x+7,y+9)*16);ctx.lineTo(sx+13,sy+7+hash(x+3,y+31)*16);ctx.stroke();
      }else if(biome==='blight'||biome==='volcano'){
        const fissure=hash(x+27,y+59);if(fissure>.76){ctx.strokeStyle=biome==='volcano'?'rgba(255,126,65,.25)':'rgba(157,180,91,.22)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx+7,sy+8);ctx.lineTo(sx+10,sy+12);ctx.lineTo(sx+8,sy+17);ctx.stroke();}
      }
      if(h>.68){ctx.fillStyle=p[5];ctx.fillRect(sx+21,sy+19,2,5);}
      if(biome==='jungle'&&h>.32){ctx.fillStyle='#9fe07a';ctx.fillRect(sx+5+(h*13|0),sy+15,5,3);ctx.fillStyle='#0d3828';ctx.fillRect(sx+20,sy+5+(h*7|0),3,8);}
      else if(biome==='snow'&&h>.35){ctx.fillStyle='#f5fbff99';ctx.fillRect(sx+5+(h*16|0),sy+7+(h*11|0),3,2);}
      else if(biome==='desert'&&h>.55){ctx.fillStyle='#e9d49a';ctx.fillRect(sx+6,sy+23,7,2);}
      else if(biome==='blight'&&h>.72){ctx.fillStyle='#a3bf55';ctx.fillRect(sx+19,sy+8,3,3);}
    }
  }
    function drawGround(camX,camY){const x0=Math.max(0,Math.floor(camX/TILE)-1),x1=Math.min(COLS,Math.ceil((camX+width)/TILE)+1),y0=Math.max(0,Math.floor(camY/TILE)-1),y1=Math.min(ROWS,Math.ceil((camY+height)/TILE)+1);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const sx=Math.floor(x*TILE-camX),sy=Math.floor(y*TILE-camY);drawGrass(x,y,sx,sy);if(isForestTile(x,y)&&biomeAt(x,y)!=='snow'){ctx.fillStyle=(hash(x+81,y+39)>.55?'rgba(8,43,27,.44)':'rgba(10,54,32,.32)');ctx.fillRect(sx,sy,TILE,TILE);}if(pathAt(x,y)){ctx.fillStyle='#967c54';ctx.fillRect(sx,sy,TILE,TILE);ctx.fillStyle='#b0996d';const h=hash(x,y);ctx.fillRect(sx+4,sy+4,4,2);if(h>.3)ctx.fillRect(sx+20,sy+22,5,2);ctx.fillStyle='#806845';ctx.fillRect(sx+14,sy+12,2,2);}if(waterAt(x+.5,y+.5)){ctx.fillStyle='#246786';ctx.fillRect(sx,sy,TILE,TILE);ctx.fillStyle='#398ca0';let w=hash(x,y);if(w>.25)ctx.fillRect(sx+3,sy+7+Math.floor(w*11),10+Math.floor(w*9),2);if(w>.7)ctx.fillRect(sx+17,sy+23,8,2);}}}
  function drawTradeGround(camX,camY){
    const x0=Math.max(0,Math.floor(camX/TILE)-1),x1=Math.min(COLS,Math.ceil((camX+width)/TILE)+1);
    const y0=Math.max(0,Math.floor(camY/TILE)-1),y1=Math.min(ROWS,Math.ceil((camY+height)/TILE)+1);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const sx=Math.floor(x*TILE-camX),sy=Math.floor(y*TILE-camY),h=hash(x+1701,y+2917);
      const plaza=x>=SELL_SHOP.x-4&&x<=FARMER_SHOP.x+4&&Math.abs(y-tradeEntranceY)<=4;
      ctx.fillStyle=plaza?(h>.5?'#78818a':'#6d7782'):(h>.5?'#536170':'#485665');
      ctx.fillRect(sx,sy,TILE,TILE);
      ctx.strokeStyle='rgba(198,215,226,.12)';ctx.lineWidth=1;ctx.strokeRect(sx+.5,sy+.5,TILE-1,TILE-1);
      if(pathAt(x+.5,y+.5)){
        ctx.fillStyle=plaza?'#a28c69':'#8c8068';ctx.fillRect(sx,sy,TILE,TILE);
        ctx.fillStyle='rgba(244,224,180,.18)';ctx.fillRect(sx+5,sy+5,5,3);ctx.fillRect(sx+22,sy+22,4,3);
      }else if(h>.94){
        ctx.fillStyle='rgba(216,226,230,.16)';ctx.fillRect(sx+8,sy+10,3,3);
      }
    }
  }
  function drawPond(camX,camY){const px=52*TILE-camX,py=36*TILE-camY;const grad=ctx.createRadialGradient(px,py,30,px,py,260);grad.addColorStop(0,'#246b85');grad.addColorStop(.75,'#1a4f70');grad.addColorStop(1,'#153c5b');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(px,py,210,138,-.18,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#71bac0';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(px-8,py-5,209,135,-.18,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;if(gameSettings.graphicsQuality!=='low')for(let i=0;i<(gameSettings.graphicsQuality==='high'?30:18);i++){const x=px-140+hash(i,2)*280,y=py-95+hash(4,i)*190;if((x-px)**2/39000+(y-py)**2/19000<.72){ctx.strokeStyle='#69b6c5aa';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+12+hash(i,1)*18,y);ctx.stroke();}}}
  function drawTree(t,camX,camY){
    const x=t.x-camX,y=t.y-camY,s=t.size;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(ambientTime/1250+t.x*.013+t.y*.009)*.012);ctx.scale(s,s);
    const snowy=biomeAt(t.x/TILE,t.y/TILE)==='snow';
    ctx.fillStyle=snowy?'#756b61':'#61462f';ctx.fillRect(-5,-3,10,24);
    ctx.fillStyle=snowy?'#a9a39a':'#7b5937';ctx.fillRect(-2,1,3,15);
    const colors=snowy?[['#536f7b','#a9c5d0','#edf7fa'],['#617d89','#b9d0d8','#f5fbff'],['#4c6877','#9fbcc9','#e3f2f7']][t.tint]:[['#174536','#20583f','#2c704c'],['#23503b','#2b6645','#438050'],['#1d493b','#28664d','#367e5a']][t.tint];
    ctx.fillStyle=colors[0];ctx.beginPath();ctx.moveTo(0,-39);ctx.lineTo(-23,-2);ctx.lineTo(-15,2);ctx.lineTo(-28,12);ctx.lineTo(27,12);ctx.lineTo(15,-1);ctx.lineTo(23,-6);ctx.closePath();ctx.fill();
    ctx.fillStyle=colors[1];ctx.beginPath();ctx.moveTo(0,-35);ctx.lineTo(-17,-4);ctx.lineTo(-7,-4);ctx.lineTo(-17,6);ctx.lineTo(17,6);ctx.lineTo(7,-7);ctx.closePath();ctx.fill();
    ctx.fillStyle=colors[2];ctx.beginPath();ctx.moveTo(0,-29);ctx.lineTo(-7,-6);ctx.lineTo(3,-8);ctx.lineTo(12,0);ctx.lineTo(5,-16);ctx.closePath();ctx.fill();
    if(t.fruitful){ctx.shadowColor='#ffcf70';ctx.shadowBlur=5;for(const [fx,fy] of [[-12,-12],[10,-20],[5,2]]){ctx.fillStyle='#f3a64e';ctx.beginPath();ctx.arc(fx,fy+Math.sin(ambientTime/260+t.x+fx)*1.2,2.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b8e18a';ctx.fillRect(fx,fy-4,2,2);}ctx.shadowBlur=0;}if(t.ancient){ctx.strokeStyle='#a8d66f';ctx.globalAlpha=.65+.2*Math.sin(ambientTime/190+t.x);ctx.lineWidth=1.8;ctx.shadowColor='#9bdf62';ctx.shadowBlur=8;ctx.beginPath();ctx.moveTo(-14,-10);ctx.lineTo(-7,-18);ctx.lineTo(0,-12);ctx.lineTo(8,-20);ctx.lineTo(14,-12);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle='#b5f76c';ctx.beginPath();ctx.arc(0,-18,2,0,6.28);ctx.fill();}

    // Bark grain, roots, branch knots and layered leaf highlights.
    ctx.strokeStyle=snowy?'rgba(224,239,244,.55)':'rgba(39,24,17,.62)';ctx.lineWidth=1.35;ctx.beginPath();ctx.moveTo(-2,1);ctx.lineTo(-3,17);ctx.moveTo(2,4);ctx.lineTo(3,20);ctx.moveTo(-4,7);ctx.lineTo(-8,11);ctx.moveTo(4,9);ctx.lineTo(8,13);ctx.stroke();
    ctx.fillStyle=snowy?'#b8c8ce':'#4a3325';ctx.beginPath();ctx.ellipse(-2,8,1.5,2.5,-.2,0,Math.PI*2);ctx.ellipse(3,15,1.2,2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=snowy?'#c7dce5':'#553c2a';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-4,5);ctx.quadraticCurveTo(-15,-1,-19,-10);ctx.moveTo(4,7);ctx.quadraticCurveTo(15,0,19,-8);ctx.stroke();
    for(let layer=0;layer<3;layer++){const yy=-25+layer*12;for(let j=0;j<5;j++){const lx=-16+j*8+(layer%2)*3,ly=yy+Math.sin(j*2.1+layer)*3;ctx.fillStyle=colors[(j+layer)%3];ctx.globalAlpha=.28+.12*((j+layer)%3);ctx.beginPath();ctx.ellipse(lx,ly,3.2,1.8,-.4,0,Math.PI*2);ctx.fill();} }ctx.globalAlpha=1;
    if(gameSettings.graphicsQuality!=='low'){ctx.fillStyle=snowy?'rgba(242,251,255,.7)':'rgba(183,231,151,.6)';for(let i=0;i<4;i++){const px=Math.sin(t.x*.1+i*8)*17,py=-29+i*9;ctx.beginPath();ctx.arc(px,py,1.1,0,Math.PI*2);ctx.fill();}}
    ctx.restore();
  }
  function bossRealmGrovePosition(){return {x:Math.min(COLS*TILE-12*TILE,38*TILE+16),y:Math.min(ROWS*TILE-12*TILE,38*TILE+16)};}
  function ensureBossRealmForest(){if(!bossRealmMode||world.ancientForestSeeded)return;world.ancientForestSeeded=true;const cx=38,cy=38;for(let gy=-9;gy<=9;gy+=2)for(let gx=-9;gx<=9;gx+=2){const tx=cx+gx,ty=cy+gy;if(tx<4||ty<4||tx>=COLS-4||ty>=ROWS-4||Math.hypot(gx,gy)<6.5||hash(tx+181,ty+991)<.26)continue;if(waterAt(tx+.5,ty+.5)||pathAt(tx+.5,ty+.5))continue;const x=tx*TILE+16,y=ty*TILE+17;if(felledTrees.some(v=>v.x===Math.round(x)&&v.y===Math.round(y))||world.trees.some(v=>Math.hypot(v.x-x,v.y-y)<24))continue;world.trees.push({x,y,size:1.28+hash(tx+71,ty+33)*.78,tint:Math.floor(hash(tx+44,ty+99)*3),fruitful:false,ancient:true});}for(let i=0;i<18;i++){const tx=cx-10+Math.floor(hash(i+71,123)*21),ty=cy-10+Math.floor(hash(i+83,321)*21),x=tx*TILE+16,y=ty*TILE+21;if(Math.hypot(tx-cx,ty-cy)<7||waterAt(tx+.5,ty+.5)||world.rocks.some(r=>Math.hypot(r.x-x,r.y-y)<30))continue;const hits=2+Math.floor(hash(i+13,45)*2);world.rocks.push({x,y,s:.82+hash(i+23,52)*.65,ore:hash(i+34,67)>.76?'Кристалл':'Камень',quality:2,hp:hits,maxHp:hits,regrowAt:0,hitFlash:0,ancient:true});}}
  function drawBossRealmForest(camX,camY,time){ensureBossRealmForest();for(const rock of world.rocks){const x=rock.x-camX,y=rock.y-camY;if(x>-35&&x<width+35&&y>-35&&y<height+35)drawRock(rock,camX,camY,time);}for(const tree of world.trees){const x=tree.x-camX,y=tree.y-camY;if(x>-65&&x<width+65&&y>-75&&y<height+45)drawTree(tree,camX,camY);}drawForestStumps(camX,camY,time);}
  function drawForestStumps(camX,camY,time){for(const stump of felledTrees){if(!(Number(stump.regrowAt)>gameMinuteTotal))continue;const x=stump.x-camX,y=stump.y-camY;if(x<-30||x>width+30||y<-30||y>height+30)continue;ctx.save();ctx.fillStyle='#4a3426';ctx.beginPath();ctx.ellipse(x,y+4,9,4,0,0,6.28);ctx.fill();ctx.fillStyle='#8b6240';ctx.fillRect(x-6,y-7,12,11);ctx.strokeStyle='#d3b17d';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y-7,6,2,0,0,6.28);ctx.stroke();ctx.fillStyle='#a9da70';ctx.globalAlpha=.5+.3*Math.sin(time/140+x);ctx.beginPath();ctx.arc(x-7,y-12,2,0,6.28);ctx.arc(x+7,y-14,1.5,0,6.28);ctx.fill();ctx.restore();}}
  function updateTreeRegrowth(){if(isCoopWorldSave()||tradeWorldMode||inHouse||caveMode||mineMode||dungeonMode||!felledTrees.length)return;let grown=0;for(let i=felledTrees.length-1;i>=0;i--){const stump=felledTrees[i];if(!(Number(stump.regrowAt)>0&&gameMinuteTotal>=stump.regrowAt))continue;if(world.trees.some(t=>Math.round(t.x)===stump.x&&Math.round(t.y)===stump.y)){felledTrees.splice(i,1);continue;}const tx=Math.floor(stump.x/TILE),ty=Math.floor(stump.y/TILE);if(waterAt(tx+.5,ty+.5))continue;world.trees.push({x:stump.x,y:stump.y,size:Math.max(.8,Math.min(2,Number(stump.size)||1)),tint:Math.max(0,Math.min(2,Math.floor(Number(stump.tint)||0))),fruitful:stump.fruitful===true,ancient:stump.ancient===true});felledTrees.splice(i,1);grown++;if(Math.hypot(player.x-stump.x,player.y-stump.y)<230)spawnVisualBurst(stump.x,stump.y-15,12,'leaf',stump.ancient?'#a8e66f':'#86c975');}if(grown){saveGame();toast(grown===1?'В лесу выросло новое дерево.':'Лес восстановился: выросло деревьев — '+grown+'.');}}
  function mineBossRealmRock(){if(!bossRealmMode)return false;let target=null,best=92;for(const rock of world.rocks){if(rock.hp<=0)continue;const d=Math.hypot(player.x-rock.x,player.y-rock.y);if(d<best){best=d;target=rock;}}if(!target)return false;const tool=selectedInventoryItem()?.name||'';if(!['Кирка','Улучшенная кирка','Кирка мастера'].includes(tool)){toast('В древнем лесу нужна кирка.');return true;}const damage=tool==='Кирка мастера'?3:tool==='Улучшенная кирка'?2:1;target.hp=Math.max(0,target.hp-damage);target.hitFlash=.18;spawnVisualBurst(target.x,target.y,7,'spark',target.ore==='Кристалл'?'#9beaff':'#c6d2c7');if(target.hp<=0){changeItem('Камень',1+Math.floor(Math.random()*2));if(target.ore==='Кристалл')changeItem('Кристалл',1);else if(Math.random()<.28)changeItem('Железо',1);awardXP(12,'добыча древнего камня');toast('Древняя порода разрушена! Ресурсы добавлены в инвентарь.');}else toast('Удар киркой · осталось прочности: '+target.hp+'.');renderInventory();saveGame();return true;}
  function startBossRealmForestTrial(){if(!bossRealmMode)return 0;const active=monsters.filter(m=>m.forestTrialId==='root-crypt'&&m.hp>0).length;if(active)return active;const p=bossRealmGrovePosition(),types=['awakened_tree','venom_beetle','awakened_tree'];let spawned=0;for(let i=0;i<types.length;i++)if(spawnBossRealmCreature(types[i],p.x+(i-1)*76,p.y+140)){const mob=monsters[monsters.length-1];if(mob){mob.x=p.x+(i-1)*76;mob.y=p.y+140;mob.territoryX=p.x;mob.territoryY=p.y;mob.forestTrialId='root-crypt';mob.territoryRadius=13*TILE;spawned++;}}if(spawned)saveGame();return spawned;}
  function countBossRealmForestTrial(){return monsters.filter(m=>m.forestTrialId==='root-crypt'&&m.hp>0).length;}

  function drawRock(r,camX,camY,time=ambientTime){
    const depleted=r.hp===0,shake=r.hitFlash>0?Math.sin(time/18+r.x)*r.hitFlash*2.1:0,x=r.x-camX+shake,y=r.y-camY,s=r.s;
    ctx.save();
    if(depleted){
      ctx.fillStyle='#172d3470';ctx.beginPath();ctx.ellipse(x,y+8,11*s,4*s,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#53646a';ctx.beginPath();ctx.moveTo(x-10*s,y+4*s);ctx.lineTo(x-4*s,y-2*s);ctx.lineTo(x+1*s,y+3*s);ctx.lineTo(x+7*s,y-1*s);ctx.lineTo(x+11*s,y+5*s);ctx.closePath();ctx.fill();
      ctx.fillStyle='#89989a';ctx.fillRect(x-5*s,y,4*s,2*s);ctx.fillRect(x+3*s,y+2*s,3*s,2*s);
      ctx.restore();return;
    }
    ctx.fillStyle='#132e3766';ctx.beginPath();ctx.ellipse(x,y+8,14*s,7*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=r.ore==='Кристалл'?'#526e85':r.ore==='Железо'?'#67757e':r.ore==='Уголь'?'#424a51':r.ore==='Медь'?'#82614d':'#657777';
    ctx.beginPath();ctx.moveTo(x-12*s,y+5*s);ctx.lineTo(x-10*s,y-5*s);ctx.lineTo(x-2*s,y-13*s);ctx.lineTo(x+8*s,y-10*s);ctx.lineTo(x+14*s,y+3*s);ctx.closePath();ctx.fill();
    ctx.fillStyle=r.ore==='Кристалл'?'#9de5ff':r.ore==='Железо'?'#a9c4cc':r.ore==='Медь'?'#d99a69':'#98aaa0';
    ctx.beginPath();ctx.moveTo(x-9*s,y-4*s);ctx.lineTo(x-1*s,y-11*s);ctx.lineTo(x+4*s,y-6*s);ctx.lineTo(x-1*s,y+1*s);ctx.closePath();ctx.fill();
    if(r.ore&&r.ore!=='Камень'){
      const veinColor=r.ore==='Кристалл'?'#a9efff':r.ore==='Железо'?'#d8e4e8':r.ore==='Медь'?'#e9aa73':'#9ca8b2';
      ctx.strokeStyle=veinColor;ctx.lineWidth=1.6;ctx.globalAlpha=.7+.18*Math.sin(time/420+r.x);
      ctx.beginPath();ctx.moveTo(x-7*s,y+3*s);ctx.lineTo(x-2*s,y-2*s);ctx.lineTo(x+2*s,y+1*s);ctx.lineTo(x+8*s,y-5*s);ctx.stroke();
      if(r.ore==='Кристалл'&&gameSettings.graphicsQuality!=='low'){ctx.fillStyle=veinColor;ctx.shadowColor=veinColor;ctx.shadowBlur=8;ctx.fillRect(x+5*s,y-5*s,2,2);}
      ctx.globalAlpha=1;
    }
    if(r.hp<r.maxHp){
      ctx.strokeStyle='rgba(31,42,48,.9)';ctx.lineWidth=1.4;ctx.beginPath();
      ctx.moveTo(x-3*s,y-6*s);ctx.lineTo(x-1*s,y-2*s);ctx.lineTo(x-5*s,y+2*s);
      if(r.hp<=1){ctx.moveTo(x+3*s,y-4*s);ctx.lineTo(x+1*s,y);ctx.lineTo(x+6*s,y+4*s);}
      ctx.stroke();
    }
    if(r.hitFlash>0){ctx.globalAlpha=Math.min(.42,r.hitFlash*1.5);ctx.fillStyle='#e7f4f5';ctx.beginPath();ctx.ellipse(x,y-2*s,12*s,10*s,0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  function quarryPosition(){
    if(quarryAnchorCache&&quarryAnchorCache.cols===COLS&&quarryAnchorCache.rows===ROWS)return quarryAnchorCache;
    const cx=Math.max(8,Math.min(COLS-9,Math.floor(COLS*.40))),cy=Math.max(8,Math.min(ROWS-9,Math.floor(ROWS*.40)));
    const avoid=[[36,15,9],[74,18,8],[28,26,8],[tradeEntranceX,tradeEntranceY,7],[mineTileX,mineTileY,7]];
    let chosen=null;
    for(let radius=0;radius<=18&&!chosen;radius++){
      for(let dy=-radius;dy<=radius&&!chosen;dy++)for(let dx=-radius;dx<=radius;dx++){
        if(radius&&Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
        const tx=cx+dx,ty=cy+dy;if(tx<5||ty<5||tx>=COLS-5||ty>=ROWS-5)continue;
        if(waterAt(tx+.5,ty+.5)||pathAt(tx+.5,ty+.5)||nearVillage(tx,ty))continue;
        if(avoid.some(([x,y,r])=>Math.hypot(tx-x,ty-y)<r))continue;
        const px=tx*TILE+16,py=ty*TILE+16;
        if(world.trees.some(t=>Math.hypot(t.x-px,t.y-py)<92))continue;
        if(world.rocks.some(r=>Math.hypot(r.x-px,r.y-py)<62))continue;
        chosen={x:px,y:py,cols:COLS,rows:ROWS};break;
      }
    }
    if(!chosen)chosen={x:cx*TILE+16,y:cy*TILE+16,cols:COLS,rows:ROWS};
    quarryAnchorCache=chosen;return chosen;
  }
  function quarryBrokerPosition(){const p=quarryPosition();return {x:p.x+78,y:p.y+35};}
  function tryMineWorldRock(){
    if(tradeWorldMode||bossRealmMode||inHouse||mineMode||caveMode||dungeonMode)return false;
    let target=null,best=92;
    for(const rock of world.rocks){const d=Math.hypot(player.x-rock.x,player.y-rock.y);if(d<best){best=d;target=rock;}}
    if(!target)return false;
    const tool=selectedInventoryItem()?.name||'';
    const damage=tool==='Кирка мастера'?4:tool==='Улучшенная кирка'?2:tool==='Кирка'?1:0;
    if(!damage){toast('Выбери кирку и нажми E рядом с каменным валуном.');return true;}
    if(target.hp<=0){
      const hours=Math.max(1,Math.ceil((target.regrowAt-gameMinuteTotal)/60));
      toast('Эта жила уже добыта. Камень восстановится примерно через '+hours+' игровых ч.');return true;
    }
    target.hp=Math.max(0,target.hp-damage);target.hitFlash=.24;
    spawnVisualBurst(target.x,target.y-5,target.hp===0?13:6,'dust',target.ore==='Кристалл'?'#9ceaff':'#bac4c5');
    playSound(target.ore==='Железо'?'iron':target.ore==='Уголь'?'coal':target.ore==='Кристалл'?'iron':'stone');
    if(target.hp>0){toast('Удар киркой · '+(target.maxHp-target.hp)+'/'+target.maxHp+' · '+(target.ore==='Камень'?'Каменная жила':target.ore));saveGame();return true;}
    const stoneGain=3+(target.quality||1)+((target.s||1)>1.12?2:0);
    changeItem('Камень',stoneGain);
    let oreText='';
    if(target.ore&&target.ore!=='Камень'){
      const extra=target.quality>=3&&Math.random()<.22?1:0;
      changeItem(target.ore,1+extra);oreText=' · '+target.ore+' × '+(1+extra);
    }
    const bonusChance=Math.min(.78,.10+skillBonus('miner')*.025+(classHas('miner')?.12:0)+(isModInstalled('miners_luck')?.12:0)+(isModInstalled('geology_scanner')?.10:0));
    const bonus=Math.random()<bonusChance;
    if(bonus){changeItem('Камень',1);oreText+=' · бонус +1 камень';}
    quarryProgress.mined=Math.min(100000,(quarryProgress.mined||0)+1);
    quarryProgress.stone=Math.min(1000000,(quarryProgress.stone||0)+stoneGain+(bonus?1:0));
    const oldRank=quarryProgress.rank||1;
    quarryProgress.rank=Math.min(10,1+Math.floor(quarryProgress.mined/10));
    target.regrowAt=gameMinuteTotal+480+(target.quality||1)*60;
    window.SkyRealmJobs?.record?.('miner',1);
    awardXP(18+(target.quality||1)*7,'добыча камня');
    renderInventory();saveGame();
    const rankText=quarryProgress.rank>oldRank?' · ранг каменщика повышен до '+quarryProgress.rank:'';
    toast('Жила добыта! Камень × '+stoneGain+oreText+' · +'+(18+(target.quality||1)*7)+' XP · восстановление через '+Math.ceil((target.regrowAt-gameMinuteTotal)/60)+' игровых ч.'+rankText);
    return true;
  }
  function updateQuarrySystem(dt){
    if(!Number.isFinite(dt)||dt<=0||tradeWorldMode||bossRealmMode||inHouse||mineMode||caveMode||dungeonMode||paused||inMainMenu)return;
    quarrySystemAccumulator+=Math.min(dt,.5);if(quarrySystemAccumulator<.3)return;
    quarrySystemAccumulator=0;let respawned=0;
    for(const rock of world.rocks){
      if(rock.hitFlash>0)rock.hitFlash=Math.max(0,rock.hitFlash-.3);
      if(rock.hp===0&&Number(rock.regrowAt)>0&&gameMinuteTotal>=rock.regrowAt){
        rock.hp=Math.max(1,Number(rock.maxHp)||3);rock.regrowAt=0;rock.hitFlash=.18;respawned++;
        if(Math.hypot(player.x-rock.x,player.y-rock.y)<150)spawnVisualBurst(rock.x,rock.y,5,'spark','#c7e5ef');
      }
    }
    if(respawned){saveGame();if(respawned===1)toast('Каменная жила восстановилась.');}
  }
  function drawQuarryOutpost(camX,camY,time){
    if(tradeWorldMode||bossRealmMode||inHouse||mineMode||caveMode||dungeonMode)return;
    const site=quarryPosition(),x=site.x-camX,y=site.y-camY;
    if(x<-150||x>width+150||y<-130||y>height+130)return;
    ctx.save();
    ctx.fillStyle='rgba(5,13,16,.40)';ctx.beginPath();ctx.ellipse(x+28,y+42,112,22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#563d2c';ctx.fillRect(x-60,y-9,118,57);
    ctx.fillStyle='#8d6340';ctx.fillRect(x-54,y-5,106,47);
    ctx.fillStyle='#49372c';ctx.beginPath();ctx.moveTo(x-72,y-10);ctx.lineTo(x-13,y-49);ctx.lineTo(x+67,y-10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ad8050';ctx.beginPath();ctx.moveTo(x-60,y-12);ctx.lineTo(x-13,y-43);ctx.lineTo(x+55,y-12);ctx.closePath();ctx.fill();
    ctx.fillStyle='#d7b27b';ctx.fillRect(x-57,y-12,112,4);
    ctx.fillStyle='#6b4a31';ctx.fillRect(x-43,y-3,6,47);ctx.fillRect(x+38,y-3,6,47);
    ctx.fillStyle='#b18a5c';ctx.fillRect(x-47,y+15,94,7);ctx.fillStyle='#d7bc8c';ctx.fillRect(x-44,y+15,88,3);
    for(let i=0;i<4;i++){const rx=x-34+i*15,ry=y+11-(i%2)*5;ctx.fillStyle=['#6e7c7e','#899393','#53666b'][i%3];ctx.beginPath();ctx.moveTo(rx-7,ry+4);ctx.lineTo(rx-5,ry-5);ctx.lineTo(rx+1,ry-9);ctx.lineTo(rx+8,ry-2);ctx.lineTo(rx+6,ry+5);ctx.closePath();ctx.fill();ctx.fillStyle='#c1ceca';ctx.fillRect(rx-3,ry-4,4,2);}
    ctx.strokeStyle='#65462f';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+49,y-12);ctx.lineTo(x+67,y-47);ctx.stroke();
    // Ore sacks, tool rack, timber bracing and a hand-painted quarry sign.
    ctx.fillStyle='#4b3526';ctx.fillRect(x-77,y+4,9,37);ctx.fillRect(x-77,y+4,34,4);ctx.fillStyle='#b88a55';ctx.fillRect(x-76,y+9,30,3);
    ctx.strokeStyle='#6d4a2e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-72,y+10);ctx.lineTo(x-53,y-8);ctx.moveTo(x-53,y-8);ctx.lineTo(x-45,y+10);ctx.stroke();
    ctx.fillStyle='#a27a4e';ctx.beginPath();ctx.ellipse(x-64,y+30,11,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d1b17c';ctx.fillRect(x-70,y+23,13,3);
    ctx.fillStyle='#6d5138';ctx.fillRect(x-33,y+31,25,15);ctx.fillStyle='#bb8a54';ctx.fillRect(x-31,y+28,21,5);ctx.strokeStyle='#593b27';ctx.lineWidth=1;ctx.strokeRect(x-33,y+31,25,15);
    ctx.fillStyle='#c2aa7e';ctx.beginPath();ctx.ellipse(x+3,y+42,12,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8a6d4c';ctx.fillRect(x-9,y+37,24,7);
    ctx.fillStyle='#5a3e2a';ctx.fillRect(x+47,y-58,42,18);ctx.fillStyle='#d7b27b';ctx.fillRect(x+50,y-55,36,12);ctx.fillStyle='#61432d';ctx.font='bold 8px Segoe UI';ctx.textAlign='center';ctx.fillText('РУДА',x+68,y-46);
    ctx.strokeStyle='#c4a16d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+66,y-46);ctx.lineTo(x+66,y-8);ctx.stroke();
    ctx.fillStyle='#d2b47c';ctx.fillRect(x+58,y-50,17,7);
    ctx.globalAlpha=.55+.35*Math.sin(time/360);ctx.fillStyle='#ffd889';ctx.shadowColor='#ffbd63';ctx.shadowBlur=13;ctx.beginPath();ctx.arc(x-50,y-8,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
    drawNpcCharacter({id:'quarry',phase:2.2},x+80,y+31,time);
    ctx.textAlign='center';ctx.font='900 12px Segoe UI';ctx.fillStyle='#fff0c8';ctx.shadowColor='#151d24';ctx.shadowBlur=5;ctx.fillText('КАМЕНОЛОМНЯ',x+8,y-61);
    ctx.font='800 9px Segoe UI';ctx.fillStyle='#d9e6e8';ctx.fillText('E · ЗАКАЗЫ',x+80,y+58);ctx.fillText('T · ПРОДАЖА КАМНЯ',x+80,y+70);
    ctx.restore();
  }
  function drawFlowers(camX,camY,t){for(const f of world.flowers){const x=f.x-camX,y=f.y-camY;if(x<-20||x>width+20||y<-20||y>height+20)continue;const sway=Math.sin(t/620+f.x*.07+f.y*.03)*.16;ctx.save();ctx.translate(x,y);ctx.rotate(sway);ctx.fillStyle='#22523a';ctx.fillRect(-1,0,2,6);ctx.fillStyle=['#f4d77a','#d9b9ff','#f7d4d6','#a8e1ff'][f.c];ctx.fillRect(-2,-2,4,4);ctx.fillStyle='#fff5d5';ctx.fillRect(0,-1,1,1);ctx.restore();}}
  function drawCabin(camX,camY,time=performance.now()){
    const x=36*TILE-120-camX,y=15*TILE-120-camY;
    ctx.fillStyle='#102d2b88';ctx.beginPath();ctx.ellipse(x+160,y+300,168,28,0,0,Math.PI*2);ctx.fill();
    // Foundation and walls
    ctx.fillStyle=houseLevel>=3?'#746553':'#846044';ctx.fillRect(x,y+35,320,270);
    ctx.fillStyle=houseLevel>=2?'#bb8957':'#a57a51';ctx.fillRect(x+12,y+48,296,244);
    // Stone plinth, exposed timber frame and hand-cut wall boards.
    ctx.fillStyle='#55483c';ctx.fillRect(x+7,y+270,306,28);ctx.fillStyle='#8b8171';ctx.fillRect(x+11,y+273,298,20);
    ctx.strokeStyle='rgba(41,42,39,.65)';ctx.lineWidth=1;for(let row=0;row<2;row++){const yy=y+280+row*9;ctx.beginPath();ctx.moveTo(x+12,yy);ctx.lineTo(x+308,yy);ctx.stroke();for(let bx=x+28+(row%2)*17;bx<x+300;bx+=36){ctx.beginPath();ctx.moveTo(bx,yy-7);ctx.lineTo(bx,yy);ctx.stroke();}}
    ctx.fillStyle='#69452f';ctx.fillRect(x+18,y+52,9,215);ctx.fillRect(x+293,y+52,9,215);ctx.fillRect(x+24,y+52,272,7);ctx.fillRect(x+24,y+259,272,7);
    ctx.fillStyle='rgba(240,204,145,.17)';for(let row=0;row<7;row++){const yy=y+65+row*26;ctx.fillRect(x+31,yy,255,2);}
    // Roof gets reinforcement at each house tier
    ctx.fillStyle=houseLevel>=3?'#563b48':'#5f3a34';ctx.beginPath();ctx.moveTo(x-14,y+42);ctx.lineTo(x+160,y-35);ctx.lineTo(x+334,y+42);ctx.closePath();ctx.fill();
    ctx.fillStyle=houseLevel>=2?'#a76150':'#92534a';ctx.beginPath();ctx.moveTo(x+3,y+36);ctx.lineTo(x+160,y-25);ctx.lineTo(x+317,y+36);ctx.lineTo(x+305,y+48);ctx.lineTo(x+160,y-10);ctx.lineTo(x+15,y+48);ctx.closePath();ctx.fill();
    // Layered shingles with alternating seams, ridge cap and bright eaves.
    for(let row=0;row<5;row++){const yy=y-12+row*13,half=24+row*25;ctx.strokeStyle='rgba(43,28,31,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+160-half,yy);ctx.lineTo(x+160+half,yy);ctx.stroke();ctx.strokeStyle='rgba(227,170,126,.28)';ctx.lineWidth=1;for(let col=-3;col<=3;col++){const px=x+160+col*(14+row*4);if(Math.abs(px-(x+160))>half)continue;ctx.beginPath();ctx.moveTo(px,yy-7);ctx.lineTo(px+(col%2?3:-3),yy+1);ctx.stroke();}}
    ctx.fillStyle='#d0a477';ctx.fillRect(x+7,y+35,306,4);ctx.fillStyle='#4b3030';ctx.fillRect(x+154,y-27,12,5);
    ctx.fillStyle='#382e32';ctx.fillRect(x+137,y+244,46,61);ctx.fillStyle='#d2ab67';ctx.fillRect(x+171,y+274,5,5);
    // Bright framed windows
    ctx.fillStyle='#d5e6d8';ctx.fillRect(x+35,y+95,48,42);ctx.fillRect(x+237,y+95,48,42);
    ctx.fillStyle='#5c3e2d';ctx.fillRect(x+30,y+90,58,5);ctx.fillRect(x+232,y+90,58,5);
    ctx.fillStyle='#d4b681';ctx.fillRect(x+32,y+139,54,5);ctx.fillRect(x+234,y+139,54,5);
    ctx.fillStyle='rgba(255,214,137,.14)';ctx.fillRect(x+43,y+103,14,25);ctx.fillRect(x+245,y+103,14,25);
    ctx.fillStyle=houseLevel>=2?'#f5d58b':'#426a67';ctx.fillRect(x+41,y+101,36,30);ctx.fillRect(x+243,y+101,36,30);
    ctx.fillStyle='#654331';ctx.fillRect(x+31,y+90,56,6);ctx.fillRect(x+233,y+90,56,6);
    if(houseLevel>=2){
      // Porch, railings and a chimney mark the reinforced house.
      ctx.fillStyle='#63452d';ctx.fillRect(x+105,y+300,110,8);ctx.fillRect(x+112,y+308,7,12);ctx.fillRect(x+201,y+308,7,12);
      ctx.fillStyle='#c9a06a';ctx.fillRect(x+104,y+298,112,4);ctx.fillRect(x+112,y+302,4,14);ctx.fillRect(x+204,y+302,4,14);
      ctx.fillStyle='#705049';ctx.fillRect(x+258,y-7,24,50);ctx.fillStyle='#95665a';ctx.fillRect(x+254,y-15,32,9);
      ctx.fillStyle='#f7d18c';ctx.fillRect(x+53,y+111,12,3);ctx.fillRect(x+255,y+111,12,3);
    }
    // Porch lantern, firewood, flower pots and animated chimney smoke.
    ctx.fillStyle='#4a3024';ctx.fillRect(x+93,y+300,5,10);ctx.fillRect(x+224,y+300,5,10);ctx.fillStyle='#d7b77f';ctx.fillRect(x+91,y+298,9,3);ctx.fillRect(x+222,y+298,9,3);
    ctx.fillStyle='#513a2b';ctx.fillRect(x+22,y+303,41,13);for(let i=0;i<3;i++){ctx.fillStyle=i%2?'#b27d4b':'#8c5c38';ctx.fillRect(x+25+i*12,y+296+(i%2)*4,12,5);}
    ctx.fillStyle='#6d4b32';ctx.fillRect(x+287,y+38,8,22);ctx.fillStyle='#dbb477';ctx.fillRect(x+285,y+35,12,4);
    ctx.globalAlpha=.2+.08*Math.sin(time/340);ctx.fillStyle='#b9c4c0';for(let i=0;i<3;i++){const drift=Math.sin(time/420+i)*4;ctx.beginPath();ctx.arc(x+291+drift,y+26-i*11,3+i*1.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    ctx.fillStyle='#d49b55';ctx.fillRect(x+18,y+178,5,16);ctx.fillStyle='#ffe1a1';ctx.shadowColor='#ffc36d';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(x+20,y+176,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    for(const side of [0,1]){const px=x+(side?286:28),py=y+294;ctx.fillStyle='#754b33';ctx.fillRect(px-7,py-3,14,8);ctx.fillStyle=side?'#a45c48':'#ad7454';ctx.beginPath();ctx.arc(px,py-7,6,Math.PI,0);ctx.fill();ctx.fillStyle='#78a45c';ctx.fillRect(px-1,py-15,2,9);}
    if(houseLevel>=3){
      // A dormer and stone trim are added at the highest tier.
      ctx.fillStyle='#7b4b42';ctx.fillRect(x+130,y+9,60,38);ctx.fillStyle='#57363a';ctx.beginPath();ctx.moveTo(x+122,y+11);ctx.lineTo(x+160,y-10);ctx.lineTo(x+198,y+11);ctx.closePath();ctx.fill();
      ctx.fillStyle='#d7e6d8';ctx.fillRect(x+148,y+17,24,22);ctx.fillStyle='#4e7b83';ctx.fillRect(x+152,y+21,16,14);
      ctx.fillStyle='#cdb17e';ctx.fillRect(x+7,y+287,306,5);ctx.fillRect(x+7,y+294,306,4);
    }
    ctx.fillStyle='#d5b982';ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillText('ДОМ · УРОВЕНЬ '+houseLevel,x+160,y+190);ctx.textAlign='left';
  }
  function drawFences(camX,camY){
    const positions=new Set(world.fences.map(f=>Math.round(f.x)+':'+Math.round(f.y)));
    for(const f of world.fences){
      const x=f.x-camX,y=f.y-camY;if(x<-40||x>width+40||y<-40||y>height+40)continue;
      const px=Math.round(f.x),py=Math.round(f.y),left=positions.has((px-TILE)+':'+py),right=positions.has((px+TILE)+':'+py),up=positions.has(px+':'+(py-TILE)),down=positions.has(px+':'+(py+TILE));
      ctx.save();ctx.fillStyle='rgba(15,20,18,.22)';ctx.beginPath();ctx.ellipse(x,y+8,16,5,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#3e2c20';ctx.fillRect(x-5,y-13,10,29);ctx.fillStyle='#805735';ctx.fillRect(x-4,y-13,7,25);ctx.fillStyle='#c3965e';ctx.fillRect(x-4,y-13,2,23);
      if(left||right){
        ctx.fillStyle='#4c3423';ctx.fillRect(x-16,y-9,32,5);ctx.fillRect(x-16,y+2,32,5);
        ctx.fillStyle='#946941';ctx.fillRect(x-15,y-10,30,3);ctx.fillRect(x-15,y+1,30,3);
        ctx.strokeStyle='rgba(225,190,132,.42)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-12,y-8);ctx.lineTo(x+12,y-8);ctx.moveTo(x-12,y+3);ctx.lineTo(x+12,y+3);ctx.stroke();
      }
      if(up||down){ctx.fillStyle='#4c3423';ctx.fillRect(x-8,y-16,5,32);ctx.fillRect(x+3,y-16,5,32);ctx.fillStyle='#946941';ctx.fillRect(x-9,y-15,3,30);ctx.fillRect(x+2,y-15,3,30);}
      ctx.fillStyle='#d4b27c';for(const nx of [-2,2]){ctx.beginPath();ctx.arc(x+nx,y-6,1.15,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+nx,y+5,1.15,0,Math.PI*2);ctx.fill();}
      ctx.strokeStyle='rgba(39,27,19,.8)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+1,y-11);ctx.lineTo(x-1,y-4);ctx.lineTo(x+1,y+1);ctx.stroke();ctx.restore();
    }
  }
  function drawSign(s,camX,camY){const x=s.x-camX,y=s.y-camY;if(x<-24||x>width+24||y<-30||y>height+30)return;ctx.fillStyle='#533c2b';ctx.fillRect(x-3,y-4,6,25);ctx.fillStyle='#9d7547';ctx.fillRect(x-15,y-13,30,15);ctx.fillStyle='#dec08b';ctx.fillRect(x-12,y-10,24,9);ctx.fillStyle='#806447';ctx.fillRect(x-7,y-7,13,2);ctx.fillRect(x-4,y-3,8,2);}
  function xpForNextLevel(level=playerLevel){return 100+Math.max(0,level-1)*75;}
  function skillBonus(key){return Math.max(0,Math.min(10,Number(skills[key])||0));}
  function communityModBonus(key){return (communityMods||[]).filter(m=>installedCommunityMods.has(m.id)&&m.effect_key===key).reduce((sum,m)=>sum+Math.max(1,Math.min(10,Number(m.effect_strength)||1)),0);}
  function awardXP(amount,reason=''){
    const bountyBonus=isModInstalled('bounty_hunter')&&/монстр|побед/i.test(String(reason))?1.2:1;
    const gained=Math.max(0,Math.floor((Number(amount)||0)*(1+skills.crafter*.04+(classHas('ordinary')?0.05:0))*bountyBonus*(isModInstalled('scholar')?1.12:1)));if(!gained)return;playerXP+=gained;let leveled=false;
    while(playerXP>=xpForNextLevel()){playerXP-=xpForNextLevel();playerLevel++;skillPoints++;leveled=true;player.hp=Math.min(100,player.hp+8);player.stamina=Math.min(100,player.stamina+12);}
    updateProgressHud();if(leveled){updateVitals();spawnVisualBurst(player.x,player.y,24,'spark','#8be9ff');playSound('craft');toast('НОВЫЙ УРОВЕНЬ '+playerLevel+'! +8 здоровья и +12 выносливости.');}else if(reason)toast('+'+gained+' опыта · '+reason);saveGame();
  }
  function updateProgressHud(){const el=document.getElementById('progress-hud');if(el)el.textContent='УРОВЕНЬ '+playerLevel+' · '+(PLAYER_CLASSES[playerClass]?.name||'Обычный')+' · XP '+playerXP+'/'+xpForNextLevel()+' · ✦ '+skillPoints;}
  async function claimCoopChest(objectKind,objectId){
    const network=window.SkyRealmCoopClient,roomState=network?.getRoomState?.();
    if(!roomState)return {coop:false,claimed:true};
    if(!network?.getWorldSession?.()){toast('Комната на паузе или ещё не запущена. Возобнови её перед открытием сундука.');return {coop:true,claimed:false,error:true};}
    if(typeof network.claimWorldObject!=='function'){toast('Сервис общих сундуков недоступен.');return {coop:true,claimed:false,error:true};}
    try{
      const claim=await network.claimWorldObject(objectKind,objectId);
      if(claim?.claimed)return {coop:true,claimed:true};
      toast('Этот сундук уже забрал другой участник комнаты.');
      return {coop:true,claimed:false,error:false};
    }catch(error){toast(error?.message||'Не удалось подтвердить сундук на сервере.');return {coop:true,claimed:false,error:true};}
  }
  async function openTreasureChest(chest){
    if(!chest||chest.opened||chest.claimPending)return;
    chest.claimPending=true;
    let claim;
    try{claim=await claimCoopChest('treasure_chest',String(chest.id||''));}
    finally{chest.claimPending=false;}
    if(claim.coop&&!claim.claimed){if(!claim.error){chest.opened=true;saveGame();drawMinimap();}return;}
    chest.opened=true;
    window.SkyRealmJobs?.record?.('explorer',1);
    const cfg=difficultyConfig(),gold=5+Math.floor(Math.random()*11);
    const rewards=[{name:'Золото',count:gold},{name:'Кристалл',count:1},{name:'Малое зелье',count:1}];
    const chosen=rewards.filter((r,i)=>i===0||(i===1?Math.random()<cfg.chests.crystal:Math.random()<cfg.chests.potion));
    if(isModInstalled('treasure_hunter')&&Math.random()<.30)chosen.push({name:'Кристалл',count:1});
    for(const r of chosen){if(r.name==='Золото')walletCents+=Math.round(r.count*100*(isModInstalled('ancient_civs')?1.25:1));else changeItem(r.name,r.count);}
    spawnVisualBurst(chest.x,chest.y,22,'spark','#ffd86b');playSound('coin');renderInventory();saveGame();drawMinimap();awardXP(45,'найден сундук');
    toast('Сундук открыт! Золота: '+gold+'; '+chosen.filter(r=>r.name!=='Золото').map(r=>r.name+' ×'+r.count).join(', '));
  }
  function startDodge(){if(paused||inMainMenu||workbenchDialogOpen||inventoryDialogOpen||signDialogOpen||dodgeCooldown>0||player.stamina<18||mineMode)return;let dx=0,dy=0;const f=player.face;if(f==='left')dx=-1;else if(f==='right')dx=1;else if(f==='up')dy=-1;else dy=1;dodgeVX=dx;dodgeVY=dy;dodgeFacing=f;dodgeTimer=.24;dodgeCooldown=1.15;player.stamina=Math.max(0,player.stamina-18);combatPerfectDodge=.24;combatEnergy=Math.min(100,combatEnergy+7);updateVitals();spawnVisualBurst(player.x,player.y,18,'dust','#a8d9ff');spawnVisualBurst(player.x,player.y,8,'spark','#d9f4ff');toast('Перекат! Точное уклонение усилит следующую атаку.');}
  function spawnVisualBurst(x,y,count=8,kind='spark',color='#ffe29a'){
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,sp=kind==='dust'?18+Math.random()*30:35+Math.random()*115;visualParticles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-12,life:.35+Math.random()*.55,maxLife:.9,size:kind==='spark'?2+Math.random()*3:2+Math.random()*4,kind,color,rot:Math.random()*6.28});}
    if(visualParticles.length>180)visualParticles.splice(0,visualParticles.length-180);
  }
  function updateVisualEffects(dt){
    attackAnimTimer=Math.max(0,attackAnimTimer-dt);combatComboTimer=Math.max(0,combatComboTimer-dt);if(combatComboTimer<=0)combatCombo=0;combatPerfectDodge=Math.max(0,combatPerfectDodge-dt);combatGuardTimer=Math.max(0,combatGuardTimer-dt);combatParryTimer=Math.max(0,combatParryTimer-dt);combatGuardCooldown=Math.max(0,combatGuardCooldown-dt);combatWeaponTrail=Math.max(0,combatWeaponTrail-dt);weatherFlash=Math.max(0,weatherFlash-dt);if(weatherMode==='storm'&&Math.random()<dt*.18)weatherFlash=.18+Math.random()*.16;
    const canCullParticles=!caveMode&&!dungeonMode&&!mineMode&&!inHouse;
    const particleCamX=canCullParticles?Math.max(0,Math.min(COLS*TILE-width,player.x-width/2)):0;
    const particleCamY=canCullParticles?Math.max(0,Math.min(ROWS*TILE-height,player.y-height/2)):0;
    for(let i=visualParticles.length-1;i>=0;i--){const p=visualParticles[i];if(canCullParticles){const sx=p.x-particleCamX,sy=p.y-particleCamY;if(sx<-48||sx>width+48||sy<-48||sy>height+48){visualParticles.splice(i,1);continue;}}p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.kind==='dust'?12:42;p.vx*=Math.max(0,1-dt*1.4);if(p.life<=0)visualParticles.splice(i,1);}
    const coop=window.SkyRealmCoopClient;const coopRoom=coop?.getRoomState?.();const ownsWeather=!coopRoom||(coopRoom.status==='running'&&coop.isRoomOwner);if(ownsWeather&&!paused&&!inMainMenu&&!inHouse&&!mineMode){weatherTimer-=dt;if(weatherTimer<=0){const roll=Math.random();weatherMode=weatherMode==='clear'?(roll<WEATHER_CHANGE_CHANCES.rain?'rain':roll<WEATHER_CHANGE_CHANCES.rain+WEATHER_CHANGE_CHANCES.snow?'snow':roll<WEATHER_CHANGE_CHANCES.rain+WEATHER_CHANGE_CHANCES.snow+WEATHER_CHANGE_CHANCES.storm?'storm':'clear'):'clear';weatherTimer=weatherMode==='clear'?65+Math.random()*100:35+Math.random()*45;if(weatherMode==='rain')toast('Погода изменилась: начинается дождь.');else if(weatherMode==='snow')toast('Начался снегопад. Снег укрывает долину.');else if(weatherMode==='storm')toast('ГРОЗА! Молнии освещают небо.');else toast('Погода прояснилась.');}}
  }
  function drawVisualEffects(camX,camY,time){
    for(const p of visualParticles){const x=p.x-camX,y=p.y-camY;if(x<-20||x>width+20||y<-20||y>height+20)continue;ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,p.life/Math.min(.35,p.maxLife)));ctx.translate(x,y);if(p.kind==='leaf'){ctx.rotate(p.rot+time/250);ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,0,p.size*1.6,p.size*.7,.4,0,Math.PI*2);ctx.fill();}else if(p.kind==='dust'){ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,0,p.size*(.5+p.life),0,Math.PI*2);ctx.fill();}else{ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=7;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);}ctx.restore();}
    if(attackAnimTimer>0){const x=player.x-camX,y=player.y-camY;const progress=1-attackAnimTimer/.24;ctx.save();ctx.translate(x,y-2);ctx.rotate((player.face==='left'?Math.PI:player.face==='up'?-Math.PI/2:player.face==='down'?Math.PI/2:0)+(progress-.5)*1.2);ctx.globalAlpha=Math.min(1,attackAnimTimer/.12);ctx.strokeStyle='#d9f2ff';ctx.lineWidth=4;ctx.shadowColor='#9acbff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(18,0,30,-1.1+progress*.4,1.1+progress*.4);ctx.stroke();ctx.strokeStyle='#fff3c4';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(18,0,25,-1+progress*.4,.8+progress*.4);ctx.stroke();ctx.restore();}
    if(gameSettings.graphicsQuality!=='low'&&weatherMode==='rain'){ctx.save();ctx.strokeStyle='rgba(155,202,239,.34)';ctx.lineWidth=1;for(let i=0;i<Math.min(90,Math.floor(width/10));i++){const x=(hash(i,Math.floor(time/95))*width+time*.12)%width,y=(hash(i+17,Math.floor(time/80))*height+time*.42)%height;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+12);ctx.stroke();}ctx.restore();}
    if(gameSettings.graphicsQuality!=='low'&&weatherMode==='snow'){ctx.save();ctx.fillStyle='rgba(238,247,255,.72)';for(let i=0;i<Math.min(100,Math.floor(width/8));i++){const x=(hash(i+201,Math.floor(time/160))*width+Math.sin(time/900+i)*18)%width,y=(hash(i+217,Math.floor(time/190))*height+time*.025*(15+hash(i,8)*20))%height;ctx.beginPath();ctx.arc((x+width)%width,y,1+hash(i,9)*2,0,Math.PI*2);ctx.fill();}ctx.restore();}
    if(weatherMode==='storm'&&weatherFlash>0){ctx.save();ctx.fillStyle='rgba(204,225,255,'+Math.min(.22,weatherFlash*.8)+')';ctx.fillRect(0,0,width,height);ctx.restore();}
    // Occasional shooting star at night: a small ambient world event, not a gameplay requirement.
    if(isNightTime()){const cycle=(time%19000)/19000;if(cycle<.035){const x=width*(.22+cycle*13),y=30+cycle*900;ctx.save();ctx.globalAlpha=1-cycle/.035;ctx.strokeStyle='#dceeff';ctx.lineWidth=2;ctx.shadowColor='#b5d8ff';ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-38,y-18);ctx.stroke();ctx.restore();}}
    if(!inMainMenu&&!paused){
      const barW=154,bx=Math.max(12,width-barW-22),by=height-28,ratio=Math.max(0,Math.min(1,combatEnergy/100));
      ctx.save();ctx.globalAlpha=.92;ctx.fillStyle='#07111dcc';ctx.fillRect(bx-8,by-16,barW+16,34);
      ctx.fillStyle='#28384b';ctx.fillRect(bx,by,barW,7);ctx.fillStyle=ratio>=1?'#ffe27a':'#68d8ef';ctx.shadowColor=ratio>=1?'#ffe27a':'#68d8ef';ctx.shadowBlur=ratio>=1?14:6;ctx.fillRect(bx,by,barW*ratio,7);ctx.shadowBlur=0;
      ctx.font='700 10px Segoe UI';ctx.textAlign='left';ctx.fillStyle='#eaf6ff';ctx.fillText('БОЕВАЯ ЭНЕРГИЯ '+Math.floor(combatEnergy)+'%',bx,by-4);
      if(combatEnergy>=100){ctx.fillStyle='#ffe27a';ctx.textAlign='right';ctx.fillText('X · СУПЕРУДАР',bx+barW,by+20);}
      else if(combatCombo>0){ctx.fillStyle='#d8edff';ctx.textAlign='right';ctx.fillText('КОМБО '+combatCombo+'/4',bx+barW,by+20);}
      ctx.restore();
    }
  }
  function drawExplorer(camX,camY,time){
    const x=41*TILE+16-camX,y=21*TILE+16-camY;
    if(x<-40||x>width+40||y<-55||y>height+40)return;
    ctx.save();ctx.translate(Math.round(x),Math.round(y)+Math.sin(time/410+2)*1.1);
    ctx.fillStyle='#07101c77';ctx.beginPath();ctx.ellipse(0,12,14,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#38654d';ctx.fillRect(-9,-2,18,15);ctx.fillStyle='#c8a16e';ctx.fillRect(-7,-16,14,14);
    ctx.fillStyle='#5b4938';ctx.fillRect(-9,-22,18,7);ctx.fillStyle='#202a26';ctx.fillRect(-11,-18,4,13);ctx.fillRect(7,-18,4,13);
    ctx.fillStyle='#f1d6aa';ctx.fillRect(-4,-11,2,2);ctx.fillRect(3,-11,2,2);
    ctx.fillStyle='#d7f0b3';ctx.font='900 9px Segoe UI';ctx.textAlign='center';ctx.fillText('РАЗВЕДЧИК',0,-30);
    ctx.fillStyle='#b7d2ff';ctx.font='bold 9px Segoe UI';ctx.fillText('E · ЗАДАНИЕ',0,29);ctx.restore();
  }
  function talkToExplorer(){
    const crystal=itemCount('Кристалл'),wood=itemCount('Дерево'),stone=itemCount('Камень'),iron=itemCount('Железо');
    if(explorerQuestStage===0){
      if(crystal>=4){changeItem('Кристалл',-4);walletCents+=4000;awardXP(130,'исследование древних рун');explorerQuestStage=1;toast('Разведчик: Руны изучены! Награда — 40 золота. Теперь принеси 8 дерева и 6 камня для лагеря.');}
      else toast('Разведчик: Принеси 4 кристалла для изучения древних рун. Сейчас: '+crystal+'/4.');
    }else if(explorerQuestStage===1){
      if(wood>=8&&stone>=6){changeItem('Дерево',-8);changeItem('Камень',-6);walletCents+=6500;changeItem('Кристалл',2);awardXP(240,'лагерь исследователей');explorerQuestStage=2;toast('Разведчик: Лагерь готов! Награда — 65 золота и 2 кристалла.');}
      else toast('Разведчик: Для лагеря нужны 8 дерева и 6 камня. Сейчас: '+wood+'/8 дерева, '+stone+'/6 камня.');
    }else if(explorerQuestStage===2){
      if(iron>=5&&crystal>=2){changeItem('Железо',-5);changeItem('Кристалл',-2);walletCents+=12000;changeItem('Метеоритный осколок',1);awardXP(350,'карта дальних земель');explorerQuestStage=3;toast('Разведчик: Карта дальних земель готова! Награда — 120 золота и метеоритный осколок.');}
      else toast('Разведчик: Последний заказ — 5 железа и 2 кристалла. Сейчас: '+iron+'/5 железа, '+crystal+'/2 кристалла.');
    }else toast('Разведчик: Исследуй мир и возвращайся с новыми открытиями.');
    renderInventory();saveGame();
  }
  function drawBlacksmith(camX,camY,time){
    const x=35*TILE+16-camX,y=21*TILE+16-camY;
    if(x<-40||x>width+40||y<-55||y>height+40)return;
    ctx.save();ctx.translate(Math.round(x),Math.round(y)+Math.sin(time/390+1)*1.1);
    ctx.fillStyle='#07101c77';ctx.beginPath();ctx.ellipse(0,12,14,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#4a5666';ctx.fillRect(-9,-2,18,15);ctx.fillStyle='#d2a77a';ctx.fillRect(-7,-16,14,14);
    ctx.fillStyle='#b7c2ce';ctx.fillRect(-9,-22,18,7);ctx.fillStyle='#303b49';ctx.fillRect(-11,-24,22,4);
    ctx.fillStyle='#f1d6aa';ctx.fillRect(-4,-11,2,2);ctx.fillRect(3,-11,2,2);
    ctx.fillStyle='#f3d18b';ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.fillText('КУЗНЕЦ',0,-30);
    ctx.fillStyle='#b7d2ff';ctx.font='bold 9px Segoe UI';ctx.fillText('E · ЗАДАНИЕ',0,29);ctx.restore();
  }
  function talkToBlacksmith(){
    const iron=itemCount('Железо'),coal=itemCount('Уголь'),crystal=itemCount('Кристалл'),obsidian=itemCount('Обсидиан'),shards=itemCount('Метеоритный осколок'),mithril=itemCount('Мифрил');
    if(blacksmithQuestStage===0){
      if(iron>=4&&coal>=3){changeItem('Железо',-4);changeItem('Уголь',-3);walletCents+=2200;awardXP(90,'заказ кузнеца');blacksmithQuestStage=1;toast('Кузнец: Отлично! Вот 22 золота. Теперь найди 2 кристалла и 2 обсидиана для редкого сплава.');}
      else toast('Кузнец: Нужны 4 железа и 3 угля для новой наковальни. Сейчас: '+iron+'/4 железа, '+coal+'/3 угля.');
    }else if(blacksmithQuestStage===1){
      if(crystal>=2&&obsidian>=2){changeItem('Кристалл',-2);changeItem('Обсидиан',-2);walletCents+=5000;changeItem('Малое зелье',2);awardXP(180,'редкий сплав');blacksmithQuestStage=2;toast('Кузнец: Сплав готов! Награда — 50 золота и 2 зелья. Последний заказ: 3 метеоритных осколка и 2 мифрила.');}
      else toast('Кузнец: Нужны 2 кристалла и 2 обсидиана. Сейчас: '+crystal+'/2 кристалла, '+obsidian+'/2 обсидиана.');
    }else if(blacksmithQuestStage===2){
      if(shards>=3&&mithril>=2){changeItem('Метеоритный осколок',-3);changeItem('Мифрил',-2);walletCents+=10000;changeItem('Кристалл',3);awardXP(350,'легендарный заказ кузнеца');blacksmithQuestStage=3;toast('Кузнец: Невероятно! Вот 100 золота и 3 кристалла. Ты помог создать легендарный сплав!');}
      else toast('Кузнец: Нужны 3 метеоритных осколка и 2 мифрила. Сейчас: '+shards+'/3 осколка, '+mithril+'/2 мифрила.');
    }else toast('Кузнец: Мастерская снова работает. Новые заказы появятся в будущих обновлениях.');
    renderInventory();saveGame();
  }
  const NPC_VISUALS={merchant:{skin:'#efc49a',hair:'#5b3826',coat:'#a85d32',trim:'#f4c56d',pants:'#35465e',beard:'#6a4128',hat:'#bd873d',prop:'coin'},alchemist:{skin:'#e9bdad',hair:'#a95c85',coat:'#7052a5',trim:'#e6a9e4',pants:'#3e3457',hood:'#8b68bc',prop:'potion'},hunter:{skin:'#d9a77e',hair:'#44332c',coat:'#4e7654',trim:'#b7c77b',pants:'#354a3b',scarf:'#a23f38',prop:'bow'},farmer:{skin:'#f0c9a0',hair:'#8a542e',coat:'#c48a45',trim:'#f3d88c',pants:'#536a46',hat:'#d7ad62',prop:'wheat'},miner:{skin:'#c99470',hair:'#3b3030',coat:'#596b7a',trim:'#e0b85e',pants:'#38414c',beard:'#423332',helmet:'#b8a36c',prop:'pickaxe'},builder:{skin:'#e3b38d',hair:'#65402b',coat:'#a86e48',trim:'#f0c68b',pants:'#46576b',cap:'#b9783e',prop:'hammer'},mage:{skin:'#dfb5d7',hair:'#c9b4e9',coat:'#3d3d82',trim:'#8fe7ff',pants:'#29294f',hood:'#5655a7',prop:'staff'},guard:{skin:'#d4a27d',hair:'#342d35',coat:'#52677d',trim:'#d8b66f',pants:'#354254',helmet:'#8299b4',prop:'spear'}};
  NPC_VISUALS.quarry={skin:'#c99b77',hair:'#37343a',coat:'#626e73',trim:'#e1c17a',pants:'#38414c',beard:'#493b35',helmet:'#aeb9a9',prop:'pickaxe'};
function setupVillageNpcs(){
    villageCenters=tradeVillageLayouts().map(v=>({...v}));
    villageCaches=villageCenters.map(v=>({id:v.id,x:v.x*TILE+16,y:v.y*TILE+666,opened:!!villageCaches.find(c=>c.id===v.id)?.opened}));
    const specs=[],seedByVillage={forest:0,snow:1,desert:2,volcano:3,blight:4};
    for(const v of villageCenters){
      const seed=seedByVillage[v.id]||0;
      v.houses.forEach((id,i)=>{
        const slot=(seed*3+i*4+1)%18,row=Math.floor(slot/6),col=slot%6;
        const xOffsets=[-500,-300,-100,100,300,500],rowY=[-255,20,270];
        const x=v.x*TILE+16+xOffsets[col]+(row===1?28:row===2?-24:0);
        const y=v.y*TILE+16+rowY[row]+72;
        specs.push({id,x,y,homeX:x,homeY:y,targetX:x,targetY:y,phase:specs.length*1.37,color:NPC_COLORS[id],villageId:v.id,activity:'home',scheduleSlot:-1,moveTimer:0,walkPhase:0});
      });
    }
    const farmer=specs.find(n=>n.id==='farmer');
    if(farmer){farmer.x=farmer.homeX=farmer.targetX=FARMER_SHOP.x*TILE+16;farmer.y=farmer.homeY=farmer.targetY=(FARMER_SHOP.y-3)*TILE+16;farmer.activity='at market';farmer.moveTimer=0;}
    const names=['Артём','Ника','Марк','Лея','Тимур','Соня','Егор','Мила','Роман','Ася','Даня','Вера','Илья','Зоя','Лука'];
    const xOffsets=[-420,-210,0,210,420],streetY=[-185,95,340];
    for(let i=0;i<names.length;i++){
      const v=villageCenters[i%villageCenters.length],row=i%3,col=Math.floor(i/3)%5;
      const x=v.x*TILE+16+xOffsets[col]+(row===1?34:-26),y=v.y*TILE+streetY[row]+22;
      specs.push({id:'citizen',name:names[i],x,y,homeX:x,homeY:y,targetX:x,targetY:y,phase:i*1.91,color:'#9ab6a2',villageId:v.id,activity:'wandering',scheduleSlot:-1,moveTimer:0,walkPhase:0});
    }
    villageNpcs=specs;
  }
  function drawNpcCharacter(npc,x,y,time){const v=NPC_VISUALS[npc.id]||NPC_VISUALS.merchant,step=Math.sin(time/105+npc.phase)*1.3;ctx.save();if(bossRealmInvisibleTimer>0)ctx.globalAlpha=.28;ctx.translate(Math.round(x),Math.round(y));ctx.scale(1.28,1.28);ctx.fillStyle='rgba(4,10,18,.38)';ctx.beginPath();ctx.ellipse(0,14,12,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=v.pants;ctx.fillRect(-7,5+step,6,10);ctx.fillRect(1,5-step,6,10);ctx.fillStyle='#302d35';ctx.fillRect(-8,14+step,7,3);ctx.fillRect(1,14-step,7,3);ctx.fillStyle=v.coat;ctx.beginPath();ctx.roundRect(-10,-5,20,15,4);ctx.fill();ctx.fillStyle=v.trim;ctx.fillRect(-8,-3,3,7);ctx.fillRect(5,-3,3,7);ctx.fillStyle=v.trim;ctx.fillRect(-2,-4,4,12);ctx.fillRect(-8,0,3,5);ctx.fillRect(5,0,3,5);ctx.fillStyle=v.skin;ctx.fillRect(-12,-3,4,10);ctx.fillRect(8,-3,4,10);ctx.fillStyle=v.coat;ctx.fillRect(-12,4,4,4);ctx.fillRect(8,4,4,4);ctx.fillStyle=v.skin;ctx.beginPath();ctx.roundRect(-6,-20,12,13,3);ctx.fill();ctx.fillStyle=v.hair;ctx.fillRect(-7,-22,14,5);ctx.fillRect(-8,-18,3,5);ctx.fillRect(5,-18,3,5);ctx.fillStyle='#263247';ctx.fillRect(-3,-14,2,2);ctx.fillRect(2,-14,2,2);ctx.fillStyle='#fff';ctx.fillRect(-3,-15,1,1);ctx.fillRect(2,-15,1,1);ctx.fillStyle='#9b5e54';ctx.fillRect(-1,-9,3,1);ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillRect(-5,-19,3,2);if(v.beard){ctx.fillStyle=v.beard;ctx.fillRect(-4,-9,8,4);}const hat=v.hat||v.helmet||v.hood||v.cap;if(hat){ctx.fillStyle=hat;ctx.fillRect(-9,-25,18,5);ctx.fillRect(-7,-28,14,5);}if(v.scarf){ctx.fillStyle=v.scarf;ctx.fillRect(-8,-7,16,4);}if(v.prop==='coin'){ctx.fillStyle='#ffd35a';ctx.beginPath();ctx.arc(12,-2,3,0,Math.PI*2);ctx.fill();}if(v.prop==='potion'){ctx.fillStyle='#8fe7ff';ctx.fillRect(11,-4,4,7);}if(['pickaxe','hammer','spear','staff','bow'].includes(v.prop)){ctx.strokeStyle=v.prop==='staff'?'#9beaff':'#9b774d';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(12,10);ctx.lineTo(14,-22);ctx.stroke();if(v.prop==='pickaxe'){ctx.strokeStyle='#c8d4df';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,-18);ctx.lineTo(19,-22);ctx.stroke();}if(v.prop==='hammer'){ctx.fillStyle='#b7c4d1';ctx.fillRect(10,-22,9,5);}if(v.prop==='spear'){ctx.fillStyle='#dce7f2';ctx.fillRect(12,-27,4,7);}if(v.prop==='staff'){ctx.fillStyle='#7deaff';ctx.shadowColor='#65dfff';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(14,-23,4,0,Math.PI*2);ctx.fill();}if(v.prop==='bow'){ctx.strokeStyle='#c89b55';ctx.beginPath();ctx.arc(14,-8,8,-1.2,1.2);ctx.stroke();}}ctx.restore();}
  function drawVillageCaravan(x,y,time,variant='forest'){
    const cloth={forest:'#a34f43',snow:'#527c91',desert:'#9b753f',volcano:'#647c52',blight:'#765b91'}[variant]||'#a34f43';
    ctx.save();ctx.translate(x,y);ctx.fillStyle='rgba(8,14,17,.35)';ctx.beginPath();ctx.ellipse(0,17,47,11,0,0,Math.PI*2);ctx.fill();
    // Merchant wagon: reinforced bed, loaded crates, cloth canopy and spoked wheels.
    ctx.fillStyle='#4b3022';ctx.fillRect(-36,-5,72,17);ctx.fillStyle='#9a6b3f';ctx.fillRect(-32,-8,64,13);
    ctx.fillStyle='#d0a06a';ctx.fillRect(-28,-7,4,12);ctx.fillRect(24,-7,4,12);
    ctx.fillStyle='#68462c';ctx.fillRect(-28,-21,18,14);ctx.fillRect(-7,-25,19,18);ctx.fillStyle='#bd8a50';ctx.fillRect(-26,-19,14,10);ctx.fillRect(-5,-23,15,14);
    ctx.strokeStyle='#e0bd7b';ctx.lineWidth=1;ctx.strokeRect(-26,-19,14,10);ctx.strokeRect(-5,-23,15,14);
    ctx.fillStyle=cloth;ctx.beginPath();ctx.moveTo(-32,-23);ctx.quadraticCurveTo(-27,-43,0,-43);ctx.quadraticCurveTo(28,-43,33,-23);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(247,224,182,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-28,-24);ctx.quadraticCurveTo(-24,-39,0,-39);ctx.quadraticCurveTo(24,-39,29,-24);ctx.stroke();
    ctx.fillStyle='#e5c78b';ctx.fillRect(-32,-24,65,3);ctx.fillRect(-31,-22,3,7);ctx.fillRect(28,-22,3,7);
    for(const wx of [-24,24]){ctx.fillStyle='#39271e';ctx.beginPath();ctx.arc(wx,13,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a77a4d';ctx.beginPath();ctx.arc(wx,13,6,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(wx,13);ctx.rotate(time/380);ctx.strokeStyle='#51351f';ctx.lineWidth=1.5;for(let spoke=0;spoke<8;spoke++){ctx.rotate(Math.PI/4);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,7);ctx.stroke();}ctx.restore();ctx.fillStyle='#e0c28b';ctx.beginPath();ctx.arc(wx,13,2,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#b78b55';ctx.fillRect(33,-1,18,3);ctx.fillStyle='#d6b47a';ctx.fillRect(45,-3,5,7);ctx.fillStyle='#fff0ca';ctx.font='800 8px Segoe UI';ctx.textAlign='center';ctx.fillText('ТОРГОВЫЙ ОБОЗ',0,31);ctx.restore();
  }
  function drawVillageSettlements(camX,camY,time){
    // Trade World settlements use a clear rectangular street plan, not circular rings.
    // Six homes per street, three streets per village; every facade faces the same road.
    const roofs=['#2865bd','#b83d32','#7d4930','#477b50','#7860a9','#bd7938','#a94b48','#547e9b','#a45b36'];
    const walls=['#c79a64','#d5b27c','#a87951','#c8c0a0','#b88969','#d4c18d','#b6aa8c','#b6aa8c','#d0a36e'];
    const darks=['#543b31','#49332d','#604332','#3f4838','#43364d','#65442d','#563c37','#3b4d57','#64422f'];
    const xOffsets=[-500,-300,-100,100,300,500],rowY=[-255,20,270],laneY=[-185,95,340];
    for(const c of villageCenters){
      const housePositions=[];
      for(let row=0;row<3;row++)for(let col=0;col<6;col++){
        const x=xOffsets[col]+(row===1?28:row===2?-24:0),y=rowY[row];
        housePositions.push({x,y,style:row*6+col,row,col,rotation:0,laneY:laneY[row]});
      }
      const x=c.x*TILE+16-camX,y=c.y*TILE+16-camY;
      if(x<-1000||x>width+1000||y<-1000||y>height+1000)continue;
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      // Three straight, parallel main streets with short perpendicular front paths.
      for(let row=0;row<3;row++){
        const ly=y+laneY[row];
        ctx.strokeStyle='#806747';ctx.lineWidth=34;ctx.beginPath();ctx.moveTo(x-650,ly);ctx.lineTo(x+650,ly);ctx.stroke();
        ctx.strokeStyle='#a1845b';ctx.lineWidth=22;ctx.stroke();
      }
      const villageLift=c.id==='forest'?12*TILE:0;
      for(const h of housePositions){
        if((Number(villageHouseDamage[c.id+':'+h.style]??160))<=0)continue;
        const doorX=x+h.x,doorY=y+h.y+74-villageLift,joinY=y+h.laneY;
        ctx.strokeStyle='#8b704c';ctx.lineWidth=17;ctx.beginPath();ctx.moveTo(doorX,doorY);ctx.lineTo(doorX,joinY);ctx.stroke();
        ctx.strokeStyle='#b19367';ctx.lineWidth=9;ctx.stroke();
      }
      // Six compact gardens sit in the gaps beside the first street, away from house footprints.
      for(let gi=0;gi<6;gi++){
        const h=housePositions[gi],gx=x+h.x+(gi%2?91:-91),gy=y+h.y+115;
        ctx.fillStyle='#5c4933';ctx.fillRect(gx-34,gy-22,68,44);
        ctx.fillStyle='#6f5132';ctx.fillRect(gx-31,gy-19,62,38);
        ctx.strokeStyle='#c09b64';ctx.lineWidth=2;ctx.strokeRect(gx-34,gy-22,68,44);
        for(let row=0;row<2;row++)for(let col=0;col<4;col++){
          const px=gx-23+col*15,py=gy-11+row*15;
          ctx.fillStyle='#4b6e36';ctx.fillRect(px,py,4,9);
          ctx.fillStyle=(gi+row+col)%3===0?'#e1bd54':'#8aa64b';ctx.fillRect(px-2,py-3,8,4);
        }
      }
      const treeSpots=[[-650,-390],[-260,-470],[180,-470],[650,-390],[-680,170],[-650,470],[-180,570],[260,580],[680,470],[-720,0],[720,0]];
      for(let ti=0;ti<treeSpots.length;ti++){
        const tx=x+treeSpots[ti][0],ty=y+treeSpots[ti][1];
        if(tx<-70||tx>width+70||ty<-80||ty>height+80)continue;
        drawTree({x:tx+camX,y:ty+camY,size:1.12+(ti%3)*.12,tint:ti%3},camX,camY);
      }
      for(const [lx,row] of [[-300,0],[0,1],[310,2],[-80,0],[120,2]]){
        const px=x+lx,py=y+laneY[row];
        ctx.fillStyle='#493b2b';ctx.fillRect(px-3,py-5,6,22);ctx.fillStyle='#c6a16b';ctx.fillRect(px-6,py-13,12,10);ctx.fillStyle='#ffe19a';ctx.fillRect(px-3,py-11,6,6);
        const glow=ctx.createRadialGradient(px,py-8,2,px,py-8,42);glow.addColorStop(0,'rgba(255,198,94,.2)');glow.addColorStop(1,'rgba(255,198,94,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(px,py-8,42,0,Math.PI*2);ctx.fill();
      }
      for(const h of housePositions){
        const houseKey=c.id+':'+h.style,houseHp=Number(villageHouseDamage[houseKey]??160);if(houseHp<=0)continue;
        const hx=x+h.x,hy=y+h.y,variant=h.style%roofs.length,roof=roofs[variant],wall=walls[variant],dark=darks[variant];
        const w=92+(h.style%3)*5,bodyH=58+(h.style%2)*5;
        const forestLift=c.id==='forest'?12*TILE:0;
        ctx.save();ctx.translate(hx,hy-forestLift);ctx.rotate(0);ctx.scale(1.18,1.18);
        ctx.fillStyle='#665744';ctx.fillRect(-w/2-5,5,w+10,bodyH+12);
        ctx.fillStyle='#8d7152';ctx.beginPath();ctx.moveTo(w/2,5);ctx.lineTo(w/2+13,0);ctx.lineTo(w/2+13,bodyH+5);ctx.lineTo(w/2,bodyH+17);ctx.closePath();ctx.fill();
        ctx.fillStyle=wall;ctx.fillRect(-w/2,0,w,bodyH);ctx.fillStyle=dark;ctx.fillRect(-w/2,0,w,6);ctx.fillRect(-w/2,bodyH-6,w,6);ctx.fillRect(-w/2+8,5,5,bodyH-10);ctx.fillRect(w/2-13,5,5,bodyH-10);
        ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(-w/2-15,9);ctx.lineTo(0,-43-(h.style%3)*3);ctx.lineTo(w/2+15,9);ctx.lineTo(w/2+9,25);ctx.lineTo(-w/2-9,25);ctx.closePath();ctx.fill();
        ctx.fillStyle=roof;ctx.beginPath();ctx.moveTo(-w/2-11,6);ctx.lineTo(0,-39-(h.style%3)*3);ctx.lineTo(w/2+11,6);ctx.lineTo(w/2+4,18);ctx.lineTo(-w/2-4,18);ctx.closePath();ctx.fill();
        ctx.strokeStyle='rgba(255,220,160,.38)';ctx.lineWidth=2;for(let row=0;row<4;row++){const yy=-17+row*9,half=(w*.43)*(1-row*.13);ctx.beginPath();ctx.moveTo(-half,yy);ctx.lineTo(half,yy);ctx.stroke();}
        ctx.strokeStyle='rgba(20,25,35,.3)';ctx.lineWidth=1;for(let col=-4;col<=4;col++){ctx.beginPath();ctx.moveTo(col*11,-22);ctx.lineTo(col*11,17);ctx.stroke();}
         // Roof tiles, carved fascia, wall grain and bright window reflections.
         ctx.strokeStyle='rgba(38,28,26,.58)';ctx.lineWidth=1.4;
         for(let rr=0;rr<4;rr++){const yy=-29+rr*10,half=w*.42*(1-rr*.12);ctx.beginPath();ctx.moveTo(-half,yy);ctx.lineTo(half,yy);ctx.stroke();for(let cc=-4;cc<=4;cc++){const px=cc*11+(rr%2?5:0);if(Math.abs(px)>half)continue;ctx.strokeStyle='rgba(238,190,139,.26)';ctx.beginPath();ctx.moveTo(px,yy-4);ctx.lineTo(px+2,yy+1);ctx.stroke();ctx.strokeStyle='rgba(38,28,26,.58)';}}
         ctx.fillStyle='rgba(247,222,175,.18)';for(let board=0;board<6;board++){const bx=-w*.42+board*14;ctx.fillRect(bx,8,1,bodyH-18);}
         ctx.fillStyle='#5b3929';ctx.fillRect(-w/2-4,bodyH-4,w+8,5);ctx.fillStyle='#d2b180';ctx.fillRect(-w/2-5,bodyH+1,w+10,3);
         ctx.strokeStyle='rgba(241,206,145,.55)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-w/2-7,8);ctx.lineTo(-w/2-7,bodyH+3);ctx.moveTo(w/2+7,8);ctx.lineTo(w/2+7,bodyH+3);ctx.stroke();
         // Carved shutters and a painted sign beside the entry.
         for(const wx of [-w*.31,w*.31]){ctx.fillStyle='#69432e';ctx.fillRect(wx-14,15,4,28);ctx.fillRect(wx+10,15,4,28);ctx.fillStyle='#b17b4c';ctx.fillRect(wx-13,18,2,22);ctx.fillRect(wx+11,18,2,22);ctx.fillStyle='rgba(255,225,162,.32)';ctx.fillRect(wx-5,21,3,11);ctx.fillStyle='#59402d';ctx.fillRect(wx-14,43,28,3);}
         ctx.fillStyle='#e0c28b';ctx.beginPath();ctx.arc(0,-42-(h.style%3)*3,2.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#392c29';ctx.fillRect(-11,bodyH-34,22,34);ctx.fillStyle='#8e6543';ctx.fillRect(-8,bodyH-31,16,31);ctx.fillStyle='#d9b879';ctx.fillRect(-8,bodyH-31,16,3);ctx.fillStyle='#f0cb70';ctx.beginPath();ctx.arc(5,bodyH-16,2,0,Math.PI*2);ctx.fill();
        for(const wx of [-w*.31,w*.31]){ctx.fillStyle='#4b342b';ctx.fillRect(wx-10,17,20,23);ctx.fillStyle=(h.style%4===0)?'#f4c96e':'#80b8ca';ctx.fillRect(wx-7,20,14,17);ctx.fillStyle='#f0d49a';ctx.fillRect(wx-1,20,2,17);ctx.fillRect(wx-7,27,14,2);ctx.fillStyle=dark;ctx.fillRect(wx-13,15,4,27);ctx.fillRect(wx+9,15,4,27);ctx.fillStyle=wall;ctx.fillRect(wx-15,14,4,29);ctx.fillRect(wx+11,14,4,29);}
        ctx.fillStyle='#63452d';ctx.fillRect(-23,bodyH+1,46,6);ctx.fillStyle='#c9a06a';ctx.fillRect(-25,bodyH-1,50,4);ctx.fillStyle='#735238';ctx.fillRect(-20,bodyH+7,5,8);ctx.fillRect(15,bodyH+7,5,8);
        if(h.style%3===1){ctx.fillStyle='#8c5740';ctx.fillRect(w*.22,-39,12,25);ctx.fillStyle='#bd8060';ctx.fillRect(w*.22-2,-41,16,4);}
        if(h.style%4===0){ctx.fillStyle='#e8dfc8';ctx.fillRect(-25,8,50,10);for(let stripe=0;stripe<5;stripe++){ctx.fillStyle=stripe%2?'#e8e1ce':'#4f91c4';ctx.fillRect(-25+stripe*10,8,10,10);}}
        else if(h.style%4===2){ctx.fillStyle='#e8d19a';ctx.fillRect(w/2+1,12,17,17);ctx.fillStyle='#62412e';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillText('✦',w/2+9,25);}
        if(houseHp<160){ctx.fillStyle='#21151a';ctx.fillRect(-27,-63,54,5);ctx.fillStyle='#ef765f';ctx.fillRect(-27,-63,54*Math.max(0,houseHp/160),5);ctx.strokeStyle='rgba(35,20,18,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-25,8);ctx.lineTo(-7,24);ctx.lineTo(1,13);ctx.stroke();}
        ctx.restore();
      }
      for(const cache of villageCaches){
        const cx=cache.x-camX,cy=cache.y-camY;if(cx<-38||cx>width+38||cy<-38||cy>height+38)continue;
        ctx.save();ctx.translate(cx,cy);const pulse=.5+.5*Math.sin(time/190+cx*.02);
        ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,13,22,8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=cache.opened?'#4e493f':'#4a3022';ctx.fillRect(-18,-6,36,22);
        ctx.fillStyle=cache.opened?'#756b5d':'#9b6234';ctx.fillRect(-16,-10,32,13);ctx.fillStyle=cache.opened?'#9c9280':'#c18b4e';ctx.fillRect(-15,-12,30,4);
        ctx.fillStyle='#5c3f2b';for(const bx of [-11,-3,5,12])ctx.fillRect(bx,-4,2,15);
        ctx.strokeStyle='#e2c47f';ctx.lineWidth=2;ctx.strokeRect(-17,-8,34,18);ctx.fillStyle='#d6b66d';ctx.fillRect(-4,-6,8,17);ctx.fillStyle='#fff0b0';ctx.beginPath();ctx.arc(0,1,2,0,Math.PI*2);ctx.fill();
        if(!cache.opened){ctx.shadowColor='#ffdb7c';ctx.shadowBlur=10+pulse*7;ctx.fillStyle='rgba(255,231,160,.7)';ctx.beginPath();ctx.arc(0,-10,3+pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
        else{ctx.save();ctx.translate(0,-10);ctx.rotate(-.5);ctx.fillStyle='#70523a';ctx.fillRect(-17,-6,34,6);ctx.fillStyle='#bd9663';ctx.fillRect(-15,-5,30,3);ctx.restore();}
        ctx.fillStyle='#fff0c7';ctx.font='bold 8px Segoe UI';ctx.textAlign='center';ctx.fillText(cache.opened?'ПУСТО':'ТАЙНИК · E',0,31);ctx.restore();
      }
      ctx.fillStyle='#f2e4c2';ctx.font='900 14px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#101820';ctx.shadowBlur=6;drawVillageCaravan(x+555,y+laneY[1]+28,time,c.id);ctx.fillText(c.name,x,y-560);ctx.restore();
    }
    for(const npc of villageNpcs){const x=npc.x-camX,y=npc.y-camY+Math.sin(time/105+npc.phase)*.8;if(x<-75||x>width+75||y<-100||y>height+80)continue;drawNpcCharacter(npc,x,y,time);ctx.save();ctx.textAlign='center';ctx.font='900 10px Segoe UI';ctx.fillStyle='#fff1cf';ctx.shadowColor='#07111d';ctx.shadowBlur=5;ctx.fillText(npc.name||NPC_NAMES[npc.id]||'Житель',x,y-27);ctx.font='800 8px Segoe UI';ctx.fillStyle='#d8e8dc';ctx.fillText(npc.activity==='sleeping'?'ОТДЫХАЕТ':npc.activity==='working'?'РАБОТАЕТ':npc.activity==='at market'?'ТОРГУЕТ':'ГУЛЯЕТ',x,y-39);ctx.restore();}
  }
  function updateVillageNpcs(dt){
    if(inHouse||mineMode||caveMode||dungeonMode)return;
    updateVillageNpcs._accumulator=(updateVillageNpcs._accumulator||0)+dt;
    if(updateVillageNpcs._accumulator<.2)return;
    dt=Math.min(.4,updateVillageNpcs._accumulator);updateVillageNpcs._accumulator=0;
    const minute=minuteOfDay(),night=minute>=21*60||minute<6*60,working=minute>=8*60&&minute<18*60;
    for(const npc of villageNpcs){
      const slot=night?2:working?1:0;
      if(npc.scheduleSlot!==slot||npc.moveTimer<=0){
        npc.scheduleSlot=slot;
        const radius=slot===1?48:slot===0?72:9;
        const angle=(npc.phase+(slot===1?1.2:slot===0?2.7:0))% (Math.PI*2);
        const distance=slot===2?0:radius*(.35+Math.random()*.65);
        npc.targetX=npc.homeX+Math.cos(angle)*distance;
        npc.targetY=npc.homeY+Math.sin(angle)*distance;
        npc.activity=slot===2?'sleeping':slot===1?'working':'wandering';
        npc.moveTimer=slot===1?5+Math.random()*7:4+Math.random()*8;
      }
      npc.moveTimer-=dt;
      const dx=npc.targetX-npc.x,dy=npc.targetY-npc.y,distance=Math.hypot(dx,dy);
      if(distance>2){
        const step=Math.min(distance,dt*(npc.activity==='working'?50:72));
        const nx=npc.x+dx/distance*step,ny=npc.y+dy/distance*step;
        if(!blocked(nx,ny)){npc.x=nx;npc.y=ny;}
        else {npc.targetX=npc.homeX+(Math.random()-.5)*12;npc.targetY=npc.homeY+(Math.random()-.5)*12;npc.moveTimer=0;}
        npc.walkPhase+=dt*8;
      }
    }
  }
  function nearestVillageNpc(){if(!tradeWorldMode||mineMode||inHouse||caveMode||dungeonMode)return null;let nearest=null,best=112;for(const npc of villageNpcs){if(npc.id==='citizen')continue;const d=Math.hypot(player.x-npc.x,player.y-npc.y);if(d<best){best=d;nearest=npc;}}return nearest;}
  function npcQuestStatus(id){const day=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY),state=npcQuestState[id]||{status:0,day};if(state.status===2&&state.day!==day)return {status:0,day};return state;}
  function openNpcQuestDialog(npc){if(!npc||!NPC_QUESTS[npc.id])return;activeNpcQuestId=npc.id;npcQuestDialogOpen=true;paused=true;keys.clear();pressedMovementCodes.clear();const shade=document.getElementById('npc-quest-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');renderNpcQuestDialog();}
  function closeNpcQuestDialog(){npcQuestDialogOpen=false;activeNpcQuestId=null;const shade=document.getElementById('npc-quest-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');paused=false;canvas.focus();saveGame();}
  function renderNpcQuestDialog(){const id=activeNpcQuestId,quest=NPC_QUESTS[id];if(!quest)return;const state=npcQuestStatus(id),items=document.getElementById('npc-quest-items'),status=document.getElementById('npc-quest-status'),reward=document.getElementById('npc-quest-reward'),action=document.getElementById('npc-quest-action');document.getElementById('npc-quest-title').textContent=quest.title;document.getElementById('npc-quest-person').textContent=NPC_NAMES[id]+' · '+NPC_LABELS[id]+' · '+(id==='quarry'?'КАМЕНОЛОМНЯ · ОБЫЧНЫЙ МИР':'МИР ТОРГОВЛИ');document.getElementById('npc-quest-description').textContent=quest.desc;items.innerHTML=Object.entries(quest.items).map(([n,c])=>{const have=itemCount(n);return '<div class="npc-quest-item '+(have>=c?'ready':'')+'"><span>'+n+'</span><b>'+have+' / '+c+'</b></div>';}).join('');reward.textContent=(quest.gold/100)+' золота · '+quest.xp+' опыта'+(quest.rewardItems?' · '+Object.entries(quest.rewardItems).map(([n,c])=>n+' × '+c).join(', '):'');action.disabled=false;action.onclick=()=>{if(state.status===0){npcQuestState[id]={status:1,day:Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY)};playSound('tap');saveGame();renderNpcQuestDialog();}else if(state.status===1){const missing=Object.entries(quest.items).filter(([n,c])=>itemCount(n)<c);if(missing.length){status.textContent='Пока не хватает: '+missing.map(([n,c])=>n+' '+itemCount(n)+'/'+c).join(', ');return;}Object.entries(quest.items).forEach(([n,c])=>changeItem(n,-c));walletCents+=Math.round(quest.gold*(isModInstalled('settlement_builder')?1.2:1));villageReputation=Math.min(100,villageReputation+(isModInstalled('settlement_builder')?2:1));if(quest.rewardItems)Object.entries(quest.rewardItems).forEach(([n,c])=>changeItem(n,c));npcQuestState[id]={status:2,day:Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY)};awardXP(quest.xp,'поручение '+quest.title);playSound('coin');renderInventory();updateWalletHud();saveGame();renderNpcQuestDialog();}};if(state.status===0){status.textContent='Новое поручение от жителя. Прими его, чтобы начать.';action.textContent='Принять задание';}else if(state.status===1){const missing=Object.entries(quest.items).filter(([n,c])=>itemCount(n)<c);status.textContent=missing.length?'Собери все материалы и вернись сюда.':'Все материалы собраны! Можно сдавать.';action.textContent='Сдать материалы и получить награду';action.disabled=missing.length>0;}else{status.textContent='Ты уже выполнил поручение сегодня. Новое появится после следующего игрового дня.';action.textContent='Задание выполнено';action.disabled=true;}}
  function talkToVillageNpc(npc){openNpcQuestDialog(npc);}
  function interactNpcShop(){if(!tradeWorldMode&&!bossRealmMode&&!inHouse&&!mineMode&&!caveMode&&!dungeonMode){const q=quarryBrokerPosition();if(Math.hypot(player.x-q.x,player.y-q.y)<118){openShop('npc:quarry');return;}}if(!tradeWorldMode){toast('Лавки лесника и рудокопа находятся в Мире торговли. Перейди туда через портал.');return;}const npc=nearestVillageNpc();if(npc){openShop('npc:'+npc.id);return;}if(Math.hypot(player.x-(FARMER_SHOP.x*TILE+16),player.y-(FARMER_SHOP.y*TILE+16))<112){openShop('npc:farmer');return;}if(Math.hypot(player.x-(SELL_SHOP.x*TILE+16),player.y-(SELL_SHOP.y*TILE+16))<112){openShop('sell');return;}if(Math.hypot(player.x-(BUY_SHOP.x*TILE+16),player.y-(BUY_SHOP.y*TILE+16))<112){openShop('buy');return;}toast('Подойди к торговцу или к вывеске лавки и нажми T.');}
  function buyNpcItem(npcId,name){
    const item=(NPC_SHOPS[npcId]||[]).find(v=>v.name===name);if(!item){toast('Этот товар сейчас недоступен.');return;}
    const basePrice=npcId==='farmer'?(farmCropBuyPrice(name)||item.price):item.price;const reputationPriceFactor=npcId==='farmer'?Math.max(.9,1-villageReputation*.001):Math.max(.65,1-villageReputation*.02);const price=Math.max(1,Math.round(basePrice*(npcId==='farmer'?farmEconomy().buy:1)*reputationPriceFactor*(isModInstalled('trade_caravans')?.9:1)));if(walletCents<price){toast('Не хватает золота. Нужно '+formatMoney(price)+'.');return;}
    if(!changeItem(name,1)){toast('Предмет пока отсутствует в каталоге инвентаря.');return;}
    walletCents-=price;if(WEAPON_BASE_DAMAGE[name]&&(!equipment.weapon||equipment.weapon==='Деревянный меч'))equipment.weapon=name;
    playSound('coin');renderInventory();renderEquipmentPanel();updateWalletHud();renderShop();saveGame();toast('Куплено: '+name+'. Цена с учётом репутации: '+formatMoney(price)+'.');
  }
  function sellNpcItem(npcId,name){
    const unit=(npcId==='farmer'?farmCropSellPrice(name):0)||((NPC_SELL_PRICES[npcId]||{})[name]),count=itemCount(name);if(!unit||count<=0){toast('У тебя нет этого товара для продажи.');return;}
    const reputationSaleFactor=npcId==='farmer'?1+Math.min(.05,villageReputation*.0005):1+Math.min(.25,villageReputation*.005);const guildBonus=isModInstalled('merchant_guild')?1.10:1;const total=Math.max(1,Math.round(unit*reputationSaleFactor*guildBonus))*count;
    changeItem(name,-count);walletCents+=total;playSound('coin');renderInventory();updateWalletHud();renderShop();saveGame();
    toast('Продано: '+name+' × '+count+' за '+formatMoney(total)+'.');
  }
  function updateVillageWatchtowers(dt){
    if(!tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode)return;
    const coop=window.SkyRealmCoopClient,room=coop?.getRoomState?.();if(room&&(!coop?.isRoomOwner||room.status!=='running'))return;
    for(const tower of placedStructures){if(tower.type!=='village-watchtower')continue;const level=Math.max(1,Math.min(3,Math.floor(Number(tower.watchtowerLevel)||1)));tower.watchtowerLevel=level;tower.maxHp=Math.max(1,Number(tower.maxHp)||360+(level-1)*120);tower.hp=Math.max(0,Math.min(tower.maxHp,Number.isFinite(tower.hp)?tower.hp:tower.maxHp));tower.watchtowerCooldown=Math.max(0,(Number(tower.watchtowerCooldown)||0)-dt);tower.watchtowerFlash=Math.max(0,(Number(tower.watchtowerFlash)||0)-dt);if(tower.hp<=0)continue;
      const radius=900+(level-1)*150,targets=monsters.filter(m=>m&&m.hp>0&&!m.exploding&&!m.villageGuardian&&(m.villageRaid===true||!!m.expansionEventId)&&Math.hypot(m.x-tower.x,m.y-tower.y)<=radius).sort((a,b)=>Math.hypot(a.x-tower.x,a.y-tower.y)-Math.hypot(b.x-tower.x,b.y-tower.y));const target=targets[0];if(!target)continue;tower.watchtowerAngle=Math.atan2(target.y-tower.y,target.x-tower.x);
      if(tower.watchtowerCooldown<=0&&villageTowerProjectiles.length<48){const damage=[0,24,39,58][level],speed=620+(level-1)*65,angle=tower.watchtowerAngle;villageTowerProjectiles.push({towerX:tower.x,towerY:tower.y,targetId:String(target.id||''),x:tower.x,y:tower.y-38,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,angle,damage,speed,life:2.2,color:level===3?'#b8eaff':level===2?'#ffe09a':'#e6c68a'});tower.watchtowerCooldown=[0,1.12,.88,.68][level];tower.watchtowerFlash=.16;}
    }
    for(let i=villageTowerProjectiles.length-1;i>=0;i--){const shot=villageTowerProjectiles[i];shot.life-=dt;const target=monsters.find(m=>m&&String(m.id||'')===shot.targetId&&m.hp>0&&!m.exploding);if(!target||shot.life<=0){villageTowerProjectiles.splice(i,1);continue;}const dx=target.x-shot.x,dy=target.y-shot.y,distance=Math.hypot(dx,dy)||1,projectileSpeed=Math.max(300,Number(shot.speed)||700),step=projectileSpeed*dt;if(distance<=Math.max(15,step+7)){shot.x=target.x;shot.y=target.y;target.hp=Math.max(0,target.hp-shot.damage);target.flash=.18;spawnVisualBurst(target.x,target.y,7,'spark',shot.color||'#f1ce83');villageTowerProjectiles.splice(i,1);if(target.hp<=0){const ownerTower=placedStructures.find(v=>v.type==='village-watchtower'&&Math.hypot(v.x-shot.towerX,v.y-shot.towerY)<2);if(ownerTower)ownerTower.watchtowerKills=Math.max(0,Number(ownerTower.watchtowerKills)||0)+1;const index=monsters.indexOf(target);if(index>=0)monsters.splice(index,1);notifyExpansionEnemyDefeated(target);dropMonsterLoot(target);awardXP(18,'сторожевая башня');trackAdventureQuest('hunt',1,false);if(target.villageRaid){villageRaidKills=Math.max(0,villageRaidKills-1);if(villageRaidActive&&villageRaidKills===0){villageRaidActive=false;villageRaidTimer=0;walletCents+=3500;changeItem('Знак защитника поселения',1);toast('БАШНИ ОТБИЛИ НАПАДЕНИЕ! Жители спасены · награда 35 золота.');renderInventory();updateWalletHud();}}saveGame();}continue;}shot.vx=dx/distance*projectileSpeed;shot.vy=dy/distance*projectileSpeed;shot.angle=Math.atan2(shot.vy,shot.vx);shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;}
    for(const mob of monsters){if(!mob||mob.hp<=0||mob.exploding||mob.villageGuardian||!(mob.villageRaid===true||mob.expansionEventId))continue;const tower=placedStructures.filter(v=>v.type==='village-watchtower'&&v.hp>0&&String(v.villageId||'')===String(mob.villageId||villageCenters.find(c=>Math.hypot(c.x*TILE+16-mob.x,c.y*TILE+16-mob.y)<900)?.id||'')).sort((a,b)=>Math.hypot(a.x-mob.x,a.y-mob.y)-Math.hypot(b.x-mob.x,b.y-mob.y))[0];if(!tower)continue;const dx=tower.x-mob.x,dy=tower.y-mob.y,distance=Math.hypot(dx,dy)||1;mob.villageTowerAttackCooldown=Math.max(0,(Number(mob.villageTowerAttackCooldown)||0)-dt);if(distance>42){const speed=Math.max(24,Math.min(58,Number(mob.speed)||42)),nx=mob.x+dx/distance*speed*dt,ny=mob.y+dy/distance*speed*dt;if(!blocked(nx,mob.y))mob.x=nx;if(!blocked(mob.x,ny))mob.y=ny;}else if(mob.villageTowerAttackCooldown<=0){tower.hp=Math.max(0,tower.hp-12);tower.watchtowerFlash=.24;mob.villageTowerAttackCooldown=1.35;spawnVisualBurst(tower.x,tower.y,8,'dust','#b88a5a');if(tower.hp<=0)toast('СТОРОЖЕВАЯ БАШНЯ РАЗРУШЕНА! Её нужно отремонтировать в Хрониках мира.');saveGame();}}
  }
  function updateVillageRaid(dt){
    const coop=window.SkyRealmCoopClient;const coopRoom=coop?.getRoomState?.();if(coopRoom&&(!coop.isRoomOwner||coopRoom.status!=='running'))return;
    if(!tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode)return;const day=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY);
    if(villageRaidActive){villageRaidTimer-=dt;if(villageRaidTimer<=0){for(let i=monsters.length-1;i>=0;i--)if(monsters[i].villageRaid)monsters.splice(i,1);villageRaidActive=false;villageRaidKills=0;toast('Нападение на деревню отбито не полностью. Жители укрылись до рассвета.');}return;}
    if(!isNightTime()||day<1||lastVillageRaidDay===day)return;
    const center=villageCenters.map(c=>({x:c.x*TILE+16,y:c.y*TILE+16})).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
    if(!center||Math.hypot(center.x-player.x,center.y-player.y)>620)return;
    lastVillageRaidDay=day;villageRaidActive=true;villageRaidTimer=95;villageRaidKills=0;
    for(let i=0;i<3;i++)if(spawnMonster(i===2?'brute':null)){const mob=monsters[monsters.length-1],angle=i*Math.PI*2/3+.35,radius=155+i*28;mob.x=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,center.x+Math.cos(angle)*radius));mob.y=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,center.y+Math.sin(angle)*radius));mob.villageRaid=true;mob.adminSpawned=true;villageRaidKills++;}
    if(villageRaidKills===0){villageRaidActive=false;return;}lastRestoredVillageRaidKey=String(currentWorldId||'')+':'+day+':'+String(villageRaidKills);
    toast('ТРЕВОГА! На деревню напали монстры. Победи '+villageRaidKills+' врагов, чтобы получить награду!');
    const warning=document.getElementById('night-warning');if(warning){warning.hidden=false;const label=document.getElementById('night-warning-text');if(label)label.textContent='НАПАДЕНИЕ НА ДЕРЕВНЮ · ЗАЩИТИ ЖИТЕЛЕЙ';}
  }
  function drawVillageElder(camX,camY,time){
    const x=38*TILE+16-camX,y=21*TILE+16-camY;
    if(x<-40||x>width+40||y<-55||y>height+40)return;
    ctx.save();ctx.translate(Math.round(x),Math.round(y)+Math.sin(time/420)*1.2);
    ctx.fillStyle='#07101c77';ctx.beginPath();ctx.ellipse(0,12,13,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8d704f';ctx.fillRect(-8,-2,16,14);ctx.fillStyle='#c8a779';ctx.fillRect(-7,-16,14,14);
    ctx.fillStyle='#d9d4c6';ctx.fillRect(-8,-20,16,5);ctx.fillStyle='#65503b';ctx.fillRect(-9,-22,18,4);
    ctx.fillStyle='#302d34';ctx.fillRect(-4,-11,2,2);ctx.fillRect(3,-11,2,2);
    ctx.fillStyle='#f3d18b';ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.fillText('СТАРОСТА',0,-29);
    ctx.fillStyle='#b7d2ff';ctx.font='bold 9px Segoe UI';ctx.fillText('E · ПОГОВОРИТЬ',0,29);ctx.restore();
  }
  function talkToVillageElder(){
    const wood=itemCount('Дерево'),stone=itemCount('Камень'),iron=itemCount('Железо'),crystal=itemCount('Кристалл');
    if(villageQuestStage===0){
      if(wood>=5&&stone>=3){changeItem('Дерево',-5);changeItem('Камень',-3);walletCents+=1500;awardXP(60,'помощь деревне');villageQuestStage=1;toast('Староста: Отличная работа! Вот 15 золота. Теперь принеси 3 железа и 1 кристалл.');}
      else toast('Староста: Помоги восстановить деревню — принеси 5 дерева и 3 камня. Сейчас: '+wood+'/5 дерева, '+stone+'/3 камня.');
    }else if(villageQuestStage===1){
      if(iron>=3&&crystal>=1){changeItem('Железо',-3);changeItem('Кристалл',-1);walletCents+=3500;awardXP(140,'редкие материалы для деревни');villageQuestStage=2;toast('Староста: Материалы получены! Награда — 35 золота. Теперь переживи 3 ночи и возвращайся.');}
      else toast('Староста: Нужны 3 железа и 1 кристалл. Сейчас: '+iron+'/3 железа, '+crystal+'/1 кристалл.');
    }else if(villageQuestStage===2){
      if(survivedNights>=3){walletCents+=7500;changeItem('Малое зелье',2);awardXP(220,'защита деревни');villageQuestStage=3;toast('Староста: Ты настоящий защитник! Получи 75 золота и 2 малых зелья. Цепочка заданий завершена.');}
      else toast('Староста: Защити долину и переживи 3 ночи. Прожито: '+survivedNights+'/3.');
    }else toast('Староста: Деревня благодарна тебе. Благодаря твоей помощи у нас есть шанс выстоять.');
    renderInventory();saveGame();
  }
  function commandDog(){
    if(itemCount('Мясо')>0&&wolfCompanionHp<300){changeItem('Мясо',-1);wolfCompanionHp=Math.min(300,wolfCompanionHp+100);renderInventory();saveGame();toast('Собака съела мясо и восстановила здоровье: '+Math.ceil(wolfCompanionHp)+'/300.');return;}
    const modes=['follow','guard','hunt'],labels={follow:'Следуй за мной',guard:'Охраняй меня',hunt:'Охоться на монстров'};
    dogBehavior=modes[(modes.indexOf(dogBehavior)+1)%modes.length];
    toast('Приказ собаке: '+labels[dogBehavior]+'. Нажми E рядом, чтобы сменить приказ.');
    saveGame();
  }
  function drawPlayer(camX,camY,dt){
    const x=player.x-camX,y=player.y-camY;player.frame += dt*(Math.abs(player.vx)+Math.abs(player.vy)>.01?11:3);const step=Math.sin(player.frame)*2.2;
    ctx.save();ctx.translate(Math.round(x),Math.round(y));
    if(combatCinematic?.active){
      const cp=Math.max(0,Math.min(1,combatCinematic.elapsed/combatCinematic.duration));
      const charge=Math.sin(Math.min(1,cp/.58)*Math.PI)*11;
      const strike=Math.max(0,Math.min(1,(cp-.30)/.24));
      const recover=Math.max(0,Math.min(1,(cp-.70)/.30));
      const dir={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[player.face]||[0,1];
      ctx.translate(dir[0]*(charge+strike*5),dir[1]*(charge+strike*5));
      ctx.rotate(Math.sin(cp*Math.PI*2)*.10-strike*.075+recover*.08);
      ctx.scale(1+charge*.004+strike*.025,1-charge*.003+strike*.012);
    }
    if(bossRealmMode&&bossRealmInvisibleTimer>0)ctx.globalAlpha=.32;
    const moving=Math.hypot(player.vx,player.vy)>2,bodyBob=moving?Math.abs(Math.sin(player.frame*1.7))*1.7:Math.sin(player.frame*.7)*.35;
    ctx.translate(0,bodyBob);
    if(combatGuardTimer>0){const pulse=.5+.5*Math.sin(performance.now()/35);ctx.save();ctx.globalAlpha=.35+pulse*.3;ctx.strokeStyle='#9bdcff';ctx.shadowColor='#78dfff';ctx.shadowBlur=18;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,0,20+pulse*3,26+pulse*3,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if(combatWeaponTrail>0){const style=combatStyle(),progress=1-combatWeaponTrail/.34,angle=player.face==='left'?Math.PI:player.face==='up'?-Math.PI/2:player.face==='down'?Math.PI/2:0;ctx.save();ctx.rotate(angle);ctx.globalAlpha=Math.max(0,combatWeaponTrail/.34);ctx.strokeStyle=style[0];ctx.shadowColor=style[0];ctx.shadowBlur=18;ctx.lineWidth=combatCombo===4?7:4;ctx.beginPath();ctx.arc(5,-2,27+progress*13,-1.25,1.25);ctx.stroke();if(combatCombo===4){ctx.lineWidth=2;ctx.beginPath();ctx.arc(5,-2,38+progress*15,-1.15,1.15);ctx.stroke();}ctx.restore();}
    if(combatCombo>0&&combatComboTimer>0){ctx.save();ctx.globalAlpha=Math.min(1,combatComboTimer*2);ctx.textAlign='center';ctx.font='900 11px Segoe UI';ctx.fillStyle=combatStyle()[0];ctx.shadowColor=combatStyle()[0];ctx.shadowBlur=9;ctx.fillText('COMBO '+combatCombo,0,-36);ctx.restore();}
    if(attackAnimTimer>0){const progress=1-attackAnimTimer/.24,angle=player.face==='left'?Math.PI:player.face==='up'?-Math.PI/2:player.face==='down'?Math.PI/2:0;ctx.save();ctx.rotate(angle);ctx.globalAlpha=Math.max(0,1-progress);ctx.strokeStyle=equipment.weapon==='Огненный меч'?'#ff9a42':equipment.weapon==='Ледяной посох'?'#8be9ff':'#e8f5ff';ctx.lineWidth=3+progress*2;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(7,-3,22+progress*5,-1.15,1.15);ctx.stroke();ctx.restore();}
    ctx.fillStyle='#102a2a66';ctx.beginPath();ctx.ellipse(0,13,13,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=equipment.armor?'#7a899b':(playerAppearance.armor||'#526fba');ctx.fillRect(-9,-3,18,15);ctx.fillStyle=playerAppearance.accent||'#9cb9ff';ctx.fillRect(-7,-2,14,13);
    ctx.fillStyle='#394b89';ctx.beginPath();ctx.moveTo(-9,-3);ctx.lineTo(0,7);ctx.lineTo(9,-3);ctx.lineTo(7,10);ctx.lineTo(0,15);ctx.lineTo(-7,10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#c5d6ef';ctx.fillRect(-2,-1,4,12);ctx.fillStyle=equipment.leggings==='Поножи Бога'?'#c99d39':'#3b2837';ctx.fillRect(-7,7+step,5,8);ctx.fillRect(2,7-step,5,8);if(equipment.leggings==='Поножи Бога'){ctx.fillStyle='#ffe28a';ctx.fillRect(-7,8+step,5,2);ctx.fillRect(2,8-step,5,2);}ctx.fillStyle=equipment.boots==='Сапоги Бога'?'#e5bd57':equipment.boots==='Сапоги стража'?'#8398a7':equipment.boots==='Сапоги мага'?'#8d79b8':equipment.boots?'#8d6c45':'#d5b887';ctx.fillRect(-8,13+step,7,4);ctx.fillRect(1,13-step,7,4);if(equipment.boots==='Сапоги стража'||equipment.boots==='Сапоги мага'){ctx.fillStyle=equipment.boots==='Сапоги мага'?'#9beaff':'#f1d38c';ctx.fillRect(-8,13+step,7,1);ctx.fillRect(1,13-step,7,1);}
    const look=playerAppearance,faceStyle=look.face||'normal',hairStyle=look.hairStyle||'short';if(hairStyle==='hood'){ctx.fillStyle=look.accent||'#9cb9ff';ctx.fillRect(-9,-20,18,18);ctx.fillStyle=look.skin||'#e8b88c';ctx.fillRect(-6,-16,12,12);}else{ctx.fillStyle=look.skin||'#e8b88c';ctx.fillRect(-6,-17,12,13);}ctx.fillStyle=look.hair||'#352d3d';if(hairStyle==='mohawk'){ctx.fillRect(-2,-21,4,11);ctx.fillRect(-5,-13,10,3);}else if(hairStyle==='curly'){for(const [hx,hy] of [[-6,-19],[0,-21],[6,-19],[-8,-15],[8,-15]]){ctx.beginPath();ctx.arc(hx,hy,3,0,Math.PI*2);ctx.fill();}}else if(hairStyle!=='hood'){ctx.fillRect(-7,-20,14,5);ctx.fillRect(-9,-16,4,hairStyle==='long'?12:7);ctx.fillRect(5,-16,4,hairStyle==='long'?12:7);if(hairStyle==='long')ctx.fillRect(-7,-12,14,7);}if(faceStyle==='visor'){ctx.fillStyle=look.accent||'#9cb9ff';ctx.fillRect(-7,-13,14,5);ctx.fillStyle=look.eye||'#26334c';ctx.fillRect(-4,-12,3,2);ctx.fillRect(2,-12,3,2);}else{ctx.fillStyle=look.eye||'#26334c';ctx.fillRect(-4,-12,2,2);ctx.fillRect(3,-12,2,2);if(faceStyle==='stern'){ctx.fillRect(-5,-14,4,1);ctx.fillRect(2,-14,4,1);}if(faceStyle==='smile'){ctx.fillStyle='#7c4135';ctx.fillRect(-2,-7,5,1);ctx.fillRect(2,-8,1,1);}else if(faceStyle==='mask'){ctx.fillStyle='#d5dce6';ctx.fillRect(-5,-9,10,5);ctx.fillStyle='#7e8ba0';ctx.fillRect(-3,-7,2,1);ctx.fillRect(1,-7,2,1);}}
    if(player.face==='left'||player.face==='right'){ctx.fillStyle=playerAppearance.skin||'#e8b88c';ctx.fillRect(player.face==='left'?-9:6,-8,3,6);}
    ctx.fillStyle=equipment.helmet?'#d7dfe8':playerAppearance.accent||'#9cb9ff';if(equipment.helmet){ctx.fillRect(-9,-20,18,5);ctx.fillRect(-11,-16,22,3);if(equipment.helmet==='Шлем стража'){ctx.fillStyle='#536e84';ctx.fillRect(-10,-21,20,6);ctx.fillStyle='#b9d0df';ctx.fillRect(-12,-17,24,3);ctx.fillStyle='#e6bd6b';ctx.fillRect(-2,-19,4,5);}else if(equipment.helmet==='Корона мага'){ctx.fillStyle='#6a4c91';ctx.fillRect(-10,-21,20,4);ctx.fillStyle='#d7c3ff';ctx.beginPath();ctx.moveTo(-9,-20);ctx.lineTo(-7,-28);ctx.lineTo(-2,-22);ctx.lineTo(0,-31);ctx.lineTo(3,-22);ctx.lineTo(8,-28);ctx.lineTo(10,-20);ctx.closePath();ctx.fill();ctx.fillStyle='#8ce8ff';ctx.fillRect(-2,-25,4,4);}else if(equipment.helmet==='Шлем Бога'){ctx.fillStyle='#9b7024';ctx.fillRect(-10,-22,20,7);ctx.fillStyle='#ffe28a';ctx.fillRect(-12,-18,24,3);ctx.beginPath();ctx.moveTo(-8,-21);ctx.lineTo(-13,-28);ctx.lineTo(-3,-23);ctx.lineTo(0,-31);ctx.lineTo(3,-23);ctx.lineTo(13,-28);ctx.lineTo(8,-21);ctx.closePath();ctx.fill();ctx.fillStyle='#fff4c2';ctx.fillRect(-2,-25,4,4);}}
    if(equipment.armor==='Нагрудник Бога'){ctx.strokeStyle='#ffe18a';ctx.lineWidth=2;ctx.shadowColor='#ffd66b';ctx.shadowBlur=10;ctx.strokeRect(-10,-4,20,17);ctx.fillStyle='#f0c75d';ctx.fillRect(-3,-2,6,9);ctx.shadowBlur=0;}if(bossRealmMode&&bossRealmInvisibleTimer>0){ctx.globalAlpha=1;ctx.strokeStyle='#9deaff';ctx.lineWidth=2;ctx.shadowColor='#9deaff';ctx.shadowBlur=12;ctx.strokeRect(-13,-22,26,43);ctx.shadowBlur=0;ctx.globalAlpha=.32;}if(equipment.amulet){ctx.fillStyle='#ffe27c';ctx.beginPath();ctx.arc(0,2,3,0,Math.PI*2);ctx.fill();}
    if(['Огненный меч','Железный меч','Стальной меч','Молниеносное копьё','Меч титана','Меч дракона','Меч пустоты','Трезубец прилива','Гарпун бури','Клинок бездны'].includes(equipment.weapon)){ctx.strokeStyle=equipment.weapon==='Огненный меч'?'#ff9a42':equipment.weapon==='Молниеносное копьё'?'#cba4ff':'#dbe8f5';ctx.lineWidth=equipment.weapon==='Молниеносное копьё'?4:3;ctx.beginPath();ctx.moveTo(9,-5);ctx.lineTo(14,-18);ctx.stroke();}else if(equipment.weapon==='Ледяной посох'){ctx.strokeStyle='#8be9ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(10,-2);ctx.lineTo(14,-22);ctx.stroke();ctx.fillStyle='#b8f4ff';ctx.beginPath();ctx.arc(14,-23,4,0,Math.PI*2);ctx.fill();}
    if(combatCinematic?.active){
      const cp=Math.max(0,Math.min(1,combatCinematic.elapsed/combatCinematic.duration));
      const wind=cp<.34?cp/.34:cp<.58?1-(cp-.34)/.24:Math.max(0,1-(cp-.58)/.42);
      const slash=Math.max(0,Math.min(1,(cp-.34)/.24));
      const facingAngle=player.face==='left'?-Math.PI/2:player.face==='right'?Math.PI/2:player.face==='up'?0:Math.PI;
      const lunge=Math.sin(Math.min(1,cp/.58)*Math.PI)*10;
      ctx.save();ctx.translate(0,-lunge);ctx.rotate((player.face==='left'?.05:player.face==='right'?-.05:0));
      ctx.globalAlpha=.98;ctx.lineCap='round';ctx.lineJoin='round';
      const weaponColor=combatCinematic.style,bladeLen=combatCinematic.weapon==='Молниеносное копьё'?61:combatCinematic.weapon==='Ледяной посох'?48:55;
      ctx.save();ctx.translate(7,0);ctx.rotate(facingAngle+(wind*.95)-(slash*1.85));
      ctx.strokeStyle='#bdc9d9';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(0,-bladeLen*.35);ctx.stroke();
      ctx.shadowColor=weaponColor;ctx.shadowBlur=gameSettings.graphicsQuality==='low'?2:18;
      ctx.strokeStyle=weaponColor;ctx.lineWidth=combatCinematic.weapon==='Молниеносное копьё'?5:3.5;
      ctx.beginPath();ctx.moveTo(0,-bladeLen*.25);ctx.lineTo(0,-bladeLen);ctx.stroke();
      ctx.fillStyle='#eaf5ff';ctx.beginPath();ctx.moveTo(0,-bladeLen-9);ctx.lineTo(-5,-bladeLen+3);ctx.lineTo(5,-bladeLen+3);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.strokeStyle='#f4d58b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.stroke();
      ctx.fillStyle='#6b4b37';ctx.fillRect(-2,2,4,12);ctx.restore();
      if(slash>.05){
        ctx.save();ctx.rotate(facingAngle+wind*.95-slash*1.85);
        ctx.globalAlpha=(1-slash)*.8+.12;ctx.strokeStyle=weaponColor;ctx.shadowColor=weaponColor;ctx.shadowBlur=gameSettings.graphicsQuality==='low'?7:25;ctx.lineCap='round';
        // Layered elliptical blade trails create depth and a visible, directional weapon sweep.
        ctx.lineWidth=5+slash*6;ctx.beginPath();ctx.ellipse(0,0,bladeLen*.88,bladeLen*.48,-.18,-1.22,1.22);ctx.stroke();
        ctx.globalAlpha*=.62;ctx.lineWidth=2.2;ctx.beginPath();ctx.ellipse(0,0,bladeLen*1.04,bladeLen*.34,-.18,-1.12,1.12);ctx.stroke();
        ctx.restore();
      }
      ctx.restore();ctx.restore();
    }
    ctx.restore();
  }
  function drawFireflies(camX,camY,time){for(const f of world.fireflies){const x=f.x-camX,y=f.y-camY;if(x<-15||x>width+15||y<-15||y>height+15)continue;const a=.25+.65*(.5+.5*Math.sin(time/500+f.phase));ctx.fillStyle='rgba(255,231,136,'+a+')';ctx.beginPath();ctx.arc(x,y,1.5+a,0,Math.PI*2);ctx.fill();}}
  function drawEmergencyWorld(){
    // Recovery renderer: if a decorative drawing routine fails, keep the playable world visible.
    ctx.save();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#285b43';ctx.fillRect(0,0,width,height);
    const camX=Math.max(0,Math.min(COLS*TILE-width,player.x-width/2));
    const camY=Math.max(0,Math.min(ROWS*TILE-height,player.y-height/2));
    let cinematicZoom=1,cinematicShakeX=0,cinematicShakeY=0;
    if(combatCinematic?.active){
      const p=Math.max(0,Math.min(1,combatCinematic.elapsed/combatCinematic.duration));
      cinematicZoom=1+Math.sin(Math.PI*p)*.52;
      const focusWorldX=combatCinematic.targetX==null?combatCinematic.focusX:player.x*.36+combatCinematic.targetX*.64;
      const focusWorldY=combatCinematic.targetY==null?combatCinematic.focusY:player.y*.36+combatCinematic.targetY*.64;
      const focusX=focusWorldX-camX,focusY=focusWorldY-camY;
      const shake=combatCinematicImpactFlash>0?combatCameraShake:1.8;
      cinematicShakeX=(Math.random()-.5)*shake;cinematicShakeY=(Math.random()-.5)*shake;
      ctx.save();ctx.translate(width/2+cinematicShakeX,height/2+cinematicShakeY);ctx.scale(cinematicZoom,cinematicZoom);ctx.translate(-focusX,-focusY);
    }else ctx.save();

    const x0=Math.max(0,Math.floor(camX/TILE)),x1=Math.min(COLS,Math.ceil((camX+width)/TILE));
    const y0=Math.max(0,Math.floor(camY/TILE)),y1=Math.min(ROWS,Math.ceil((camY+height)/TILE));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const sx=Math.floor(x*TILE-camX),sy=Math.floor(y*TILE-camY),h=hash(x,y);
      ctx.fillStyle=h>.5?'#285b43':h>.2?'#2a6047':'#285840';ctx.fillRect(sx,sy,TILE,TILE);
      if(pathAt(x,y)){ctx.fillStyle='#967c54';ctx.fillRect(sx,sy,TILE,TILE);}
      if(waterAt(x+.5,y+.5)){ctx.fillStyle='#246786';ctx.fillRect(sx,sy,TILE,TILE);}
    }
    const px=player.x-camX,py=player.y-camY;
    ctx.fillStyle='#e8b88c';ctx.fillRect(px-6,py-17,12,13);
    ctx.fillStyle='#526fba';ctx.fillRect(px-9,py-4,18,18);
    ctx.fillStyle='#2c3447';ctx.fillRect(px-7,py+14,5,8);ctx.fillRect(px+2,py+14,5,8);
    ctx.restore();
  }
  function drawTreasureChests(camX,camY,time){
    for(const chest of treasureChests){
      const x=chest.x-camX,y=chest.y-camY;if(x<-44||x>width+44||y<-44||y>height+44)continue;
      ctx.save();ctx.translate(x,y);const pulse=.5+.5*Math.sin(time/180+(chest.x||0)*.01);
      ctx.fillStyle='rgba(5,13,18,.38)';ctx.beginPath();ctx.ellipse(0,12,22,8,0,0,Math.PI*2);ctx.fill();
      // Thick plank body, iron straps, corner caps and a hand-forged lock.
      ctx.fillStyle='#3a2924';ctx.fillRect(-18,-7,36,22);ctx.fillStyle=chest.opened?'#65594a':'#81502c';ctx.fillRect(-16,-6,32,18);
      ctx.fillStyle=chest.opened?'#8e806b':'#b17a42';ctx.fillRect(-16,-6,32,4);ctx.fillRect(-16,8,32,4);
      ctx.fillStyle='#533722';for(const bx of [-13,-4,5,12])ctx.fillRect(bx,-3,2,9);
      ctx.strokeStyle='#dfba72';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-17,-4);ctx.lineTo(-17,12);ctx.moveTo(17,-4);ctx.lineTo(17,12);ctx.stroke();
      ctx.fillStyle='#d9b76d';ctx.fillRect(-3,-6,6,18);ctx.fillStyle='#f7e3aa';ctx.beginPath();ctx.arc(0,1,2.2,0,Math.PI*2);ctx.fill();
      if(chest.opened){
        ctx.save();ctx.translate(0,-7);ctx.rotate(-.55);ctx.fillStyle='#503526';ctx.fillRect(-17,-9,34,8);ctx.fillStyle='#987047';ctx.fillRect(-15,-8,30,5);ctx.strokeStyle='#d2ae72';ctx.lineWidth=1;ctx.strokeRect(-16,-9,32,7);ctx.restore();
        ctx.fillStyle='#756957';ctx.fillRect(-10,-1,20,4);
      }else{
        ctx.fillStyle='#3b2a22';ctx.fillRect(-16,-13,32,9);ctx.fillStyle='#b67c43';ctx.fillRect(-15,-14,30,7);
        ctx.strokeStyle='rgba(255,220,150,.62)';ctx.lineWidth=1;for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(k*6,-14);ctx.lineTo(k*6,-8);ctx.stroke();}
        ctx.fillStyle='#e6c77b';ctx.fillRect(-17,-7,34,3);
        ctx.shadowColor='#ffd86b';ctx.shadowBlur=8+pulse*7;ctx.fillStyle='rgba(255,225,137,'+(.22+pulse*.2)+')';ctx.beginPath();ctx.arc(0,-11,3+pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
        for(let i=0;i<3;i++){const a=time/440+i*2.1;ctx.globalAlpha=.3+.4*pulse;ctx.fillStyle='#fff0b4';ctx.fillRect(Math.cos(a)*22-1,-10+Math.sin(a)*7,2,2);}ctx.globalAlpha=1;
      }
      ctx.restore();
    }
  }
  function drawCaveBoss(){if(caveBossDefeated)return;const maxHp=bossMaxHp(),x=caveBossX,y=caveBossY;ctx.save();ctx.translate(x,y);ctx.fillStyle='#090d16aa';ctx.beginPath();ctx.ellipse(0,22,36,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=caveBossFlash>0?'#ffffff':'#626f7d';ctx.fillRect(-25,-20,50,39);ctx.fillStyle='#8798a6';ctx.fillRect(-20,-30,40,19);ctx.fillStyle='#3c4656';ctx.beginPath();ctx.moveTo(-22,-24);ctx.lineTo(-31,-41);ctx.lineTo(-12,-33);ctx.lineTo(0,-40);ctx.lineTo(14,-32);ctx.lineTo(30,-43);ctx.lineTo(22,-22);ctx.closePath();ctx.fill();ctx.fillStyle='#e85c69';ctx.shadowColor='#ff495b';ctx.shadowBlur=10;ctx.fillRect(-14,-23,8,5);ctx.fillRect(6,-23,8,5);ctx.shadowBlur=0;ctx.fillStyle='#404a56';ctx.fillRect(-35,-8,12,29);ctx.fillRect(23,-8,12,29);ctx.fillStyle='#a9b8c4';ctx.fillRect(-18,18,12,13);ctx.fillRect(6,18,12,13);ctx.restore();ctx.fillStyle='#211b28';ctx.fillRect(x-48,y-53,96,7);ctx.fillStyle='#ff6578';ctx.fillRect(x-48,y-53,96*Math.max(0,caveBossHp/maxHp),7);ctx.fillStyle='#f4f1e7';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillText('КАМЕННЫЙ СТРАЖ · '+Math.ceil(caveBossHp)+'/'+maxHp+' HP · '+difficultyConfig().name,x,y-60);ctx.textAlign='left';}
  function defeatCaveBoss(){
    if(caveBossDefeated)return;
    scheduleNemesis('boss','cave','Каменный страж','brute',1.7);
    caveBossDefeated=true;caveBossHp=0;triggerBossVictory('Каменный страж',caveBossX,caveBossY,'#8ef5ff');
    if(isCoopWorldActive()&&window.SkyRealmCoopClient?.isRoomOwner){
      spawnSharedLoot(caveBossX,caveBossY,[{name:'Кристалл',count:5},{name:'Железо',count:8},{name:'Малое зелье',count:3},{name:'Золото',count:100}],'cave');
    }else{
      walletCents+=10000;changeItem('Кристалл',5);changeItem('Железо',8);changeItem('Малое зелье',3);renderInventory();updateWalletHud();
    }
    spawnVisualBurst(caveBossX,caveBossY,36,'spark','#8ef5ff');
    playSound('portal');awardXP(240,'победа над Каменным стражем');
    toast('Каменный страж побеждён! Награда появилась в общей добыче пещеры.');
    saveGame();
  }
  function updateCaveBoss(dt){if(!caveMode||caveBossDefeated||caveSecretRoom>0)return;const cfg=difficultyConfig();caveBossFlash=Math.max(0,caveBossFlash-dt);const dx=player.x-caveBossX,dy=player.y-caveBossY,dist=Math.hypot(dx,dy)||1;if(dist>62){caveBossX+=dx/dist*cfg.bossSpeed*dt;caveBossY+=dy/dist*cfg.bossSpeed*dt;}caveBossAttackTimer-=dt;caveBossSpecialTimer=Math.max(0,caveBossSpecialTimer-dt);if(caveBossSpecialTimer<=0){caveBossSpecialTimer=8;if(dist<180&&!immortal&&dodgeTimer<=0){const special=Math.max(1,Math.round(cfg.bossDamage*1.8*(1-armorReduction())));player.hp=Math.max(0,player.hp-special);updateVitals();spawnVisualBurst(player.x,player.y,24,'spark','#8ef5ff');toast('КАМЕННЫЙ СТРАЖ · СЕЙСМИЧЕСКИЙ РАЗЛОМ: −'+special+' HP!');if(player.hp<=0)respawnPlayerAfterDefeat();}}if(caveBossAttackTimer<=0){caveBossAttackTimer=cfg.bossInterval;if(dist<102&&dodgeTimer<=0&&!immortal){const reduction=armorReduction();const hit=Math.max(1,Math.round(cfg.bossDamage*(1-reduction)));player.hp=Math.max(0,player.hp-hit);updateVitals();spawnVisualBurst(player.x,player.y,12,'spark','#fb6876');toast('Каменный страж ударил: −'+hit+' HP!');if(player.hp<=0)respawnPlayerAfterDefeat();}} }
  function drawCaveSecretRoom(time){
    const t=Number.isFinite(time)?time:performance.now(),room=caveSecretRoom;
    const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,room===1?'#343c4a':'#263c31');bg.addColorStop(1,'#10151d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    ctx.fillStyle=room===1?'#5a6270':'#385d42';ctx.beginPath();ctx.ellipse(width*.5,height*.52,width*.39,height*.34,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=room===1?'#9ba9c1':'#91c879';ctx.lineWidth=12;ctx.beginPath();ctx.ellipse(width*.5,height*.52,width*.39,height*.34,0,Math.PI,Math.PI*2);ctx.stroke();
    for(let i=0;i<9;i++){const x=width*(.13+i*.092),y=height*(.18+(i%3)*.08);ctx.fillStyle=room===1?'#9cb4c9':'#83b86b';ctx.globalAlpha=.24+.12*Math.sin(t/300+i);ctx.beginPath();ctx.arc(x,y,5+i%3*2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    const cx=width*.72,cy=height*.52,opened=caveSecretRoomsOpened.includes(room);ctx.save();for(let i=0;i<2;i++){const px=width*(room===1?.29:.31)+i*width*.16,py=height*.54;ctx.fillStyle=room===1?'#657b9b':'#547a49';ctx.fillRect(px-17,py-7,34,22);ctx.fillStyle=room===1?'#a9d7ff':'#9bff9b';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(px,py-17+Math.sin(t/260+i)*3,7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#f0e7c9';ctx.font='10px Segoe UI';ctx.fillText(room===1?(i?'ПЕЧАТЬ':'ОКО'):(i?'КАМЕНЬ':'СЕРДЦЕ'),px,py+31);}ctx.restore();
    ctx.fillStyle='#0b1015';ctx.fillRect(cx-31,cy-8,62,33);ctx.fillStyle=opened?'#594b3d':'#a77a3c';ctx.fillRect(cx-28,cy-16,56,16);ctx.fillStyle='#f7d56e';ctx.fillRect(cx-4,cy-7,8,20);
    if(!opened){ctx.shadowColor=room===1?'#a9d7ff':'#8eff9a';ctx.shadowBlur=20;ctx.fillStyle='#fff0a5';ctx.beginPath();ctx.arc(cx,cy-18,4+Math.sin(t/180)*1.5,0,6.28);ctx.fill();ctx.shadowBlur=0;}
    ctx.fillStyle='#eaf0f6';ctx.font='900 17px Segoe UI';ctx.textAlign='center';ctx.fillText(room===1?'ТАЙНАЯ БИБЛИОТЕКА':'ЗАЛ ЖИВОГО КОРНЯ',width*.5,38);
    ctx.font='12px Segoe UI';ctx.fillStyle='#c6d4e1';ctx.fillText(opened?'Сундук уже исследован':'Подойди к сундуку и нажми E',width*.5,60);
    ctx.fillStyle='#17232d';ctx.beginPath();ctx.ellipse(player.x,player.y+12,17,7,0,0,6.28);ctx.fill();ctx.fillStyle=playerAppearance.armor||'#526fba';ctx.fillRect(player.x-9,player.y-4,18,18);ctx.fillStyle=playerAppearance.skin||'#e8b88c';ctx.fillRect(player.x-6,player.y-18,12,13);ctx.fillStyle='#352d3d';ctx.fillRect(player.x-7,player.y-22,14,5);
    ctx.fillStyle='#f4d69d';ctx.font='bold 12px Segoe UI';ctx.fillText('ВЫХОД · E',width*.16,height*.82);
  }
  function drawCaveInterior(dt,time){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(caveSecretRoom){drawCaveSecretRoom(time);return;}
    const t=Number.isFinite(time)?time:performance.now();
    // A broad natural cavern: one open central chamber with roomy side galleries, never a maze.
    const base=ctx.createLinearGradient(0,0,0,height);
    base.addColorStop(0,'#303a3d');base.addColorStop(.48,'#202a2c');base.addColorStop(1,'#101719');
    ctx.fillStyle=base;ctx.fillRect(0,0,width,height);
    const ambient=ctx.createRadialGradient(width*.48,height*.48,Math.min(width,height)*.08,width*.48,height*.48,Math.max(width,height)*.78);
    ambient.addColorStop(0,'rgba(115,139,126,.23)');ambient.addColorStop(.62,'rgba(57,77,74,.12)');ambient.addColorStop(1,'rgba(0,0,0,.68)');
    ctx.fillStyle=ambient;ctx.fillRect(0,0,width,height);
    // Major visual pass: layered volumetric shafts reveal the height and scale of the existing cavern.
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<7;i++){
      const sx=width*(.09+i*.137),sway=Math.sin(t/1500+i*1.9)*width*.012;
      const topWidth=width*(.012+(i%3)*.003),bottomWidth=width*(.055+(i%2)*.014);
      const shaft=ctx.createLinearGradient(sx+sway,0,sx-sway,height*.78);
      shaft.addColorStop(0,'rgba(190,211,190,0)');
      shaft.addColorStop(.18,'rgba(180,210,190,'+(.025+(i%3)*.009)+')');
      shaft.addColorStop(.68,'rgba(166,197,181,'+(.012+(i%2)*.008)+')');
      shaft.addColorStop(1,'rgba(166,197,181,0)');
      ctx.fillStyle=shaft;ctx.beginPath();ctx.moveTo(sx-topWidth,0);ctx.lineTo(sx+topWidth,0);
      ctx.lineTo(sx+sway+bottomWidth,height*.78);ctx.lineTo(sx+sway-bottomWidth,height*.78);ctx.closePath();ctx.fill();
    }
    // Soft reflected pools connect the existing lanterns to the cave floor.
    for(let i=0;i<6;i++){
      const lx=width*(.12+i*.152),ly=height*(i%2?.22:.77),pulse=.78+.22*Math.sin(t/360+i*1.4);
      const pool=ctx.createRadialGradient(lx,ly+24,2,lx,ly+24,92);
      pool.addColorStop(0,'rgba(255,193,117,'+(.105*pulse)+')');pool.addColorStop(.38,'rgba(216,166,108,'+(.045*pulse)+')');pool.addColorStop(1,'rgba(216,166,108,0)');
      ctx.fillStyle=pool;ctx.fillRect(lx-96,ly-68,192,192);
    }
    ctx.restore();
    // Irregular rock ceiling and walls frame a single large, connected floor.
    ctx.fillStyle='#111a1c';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(width,0);
    for(let i=16;i>=0;i--){const x=width*i/16;ctx.lineTo(x,18+hash(i,41)*height*.105+Math.sin(i*1.7+t*.00025)*5);}
    ctx.closePath();ctx.fill();
    ctx.fillStyle='#111a1c';ctx.beginPath();ctx.moveTo(0,height);ctx.lineTo(width,height);
    for(let i=0;i<=16;i++){const x=width*i/16;ctx.lineTo(x,height-(16+hash(i+27,13)*height*.11+Math.sin(i*1.4+t*.0002)*5));}
    ctx.closePath();ctx.fill();
    // Wide, gently curving floor bands and broad side alcoves.
    ctx.fillStyle='#343a35';ctx.beginPath();ctx.moveTo(width*.04,height*.19);
    ctx.bezierCurveTo(width*.2,height*.08,width*.8,height*.1,width*.96,height*.25);
    ctx.lineTo(width*.98,height*.78);ctx.bezierCurveTo(width*.76,height*.91,width*.22,height*.92,width*.03,height*.76);ctx.closePath();ctx.fill();
    ctx.fillStyle='#514d42';ctx.beginPath();ctx.ellipse(width*.5,height*.51,width*.44,height*.35,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#62594a';ctx.beginPath();ctx.ellipse(width*.5,height*.49,width*.405,height*.315,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(23,30,28,.42)';ctx.beginPath();ctx.ellipse(width*.5,height*.51,width*.39,height*.29,0,0,Math.PI*2);ctx.fill();
    // Broad side galleries are open visual spaces, not narrow winding corridors.
    for(const side of [-1,1]){
      const x=width*(side<0?.16:.84),y=height*.49;
      ctx.fillStyle='#353b37';ctx.beginPath();ctx.ellipse(x,y,width*.105,height*.235,side*.08,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#5b5548';ctx.beginPath();ctx.ellipse(x,y,width*.082,height*.195,side*.08,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(15,22,21,.65)';ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(x,y,width*.105,height*.235,side*.08,0,Math.PI*2);ctx.stroke();
    }
    // Stone plates, cracks and scattered rubble add a mine-like floor texture.
    for(let i=0;i<34;i++){
      const x=width*(.08+hash(i+4,17)*.84),y=height*(.16+hash(i+21,8)*.68),r=5+hash(i+9,33)*15;
      ctx.fillStyle=i%3?'rgba(24,31,29,.22)':'rgba(177,157,119,.12)';
      ctx.beginPath();ctx.ellipse(x,y,r*1.7,r*.62,hash(i,3)*.8,0,Math.PI*2);ctx.fill();
      if(i%4===0){ctx.strokeStyle='rgba(12,19,18,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-r,y-r*.2);ctx.lineTo(x-r*.2,y+r*.25);ctx.lineTo(x+r*.7,y+r*.1);ctx.stroke();}
    }
    // Crystals glow from the rock edges, leaving the central route unobstructed.
    for(let i=0;i<13;i++){
      const side=i%2===0?-1:1,x=width*(side<0?.08+hash(i,4)*.13:.79+hash(i,4)*.13),y=height*(.18+hash(i+8,9)*.64),h=12+hash(i+3,5)*27;
      ctx.save();ctx.translate(x,y);
      const glow=ctx.createRadialGradient(0,0,2,0,0,h*2.5);glow.addColorStop(0,'rgba(89,205,220,.24)');glow.addColorStop(1,'rgba(89,205,220,0)');
      ctx.fillStyle=glow;ctx.fillRect(-h*2.5,-h*2.5,h*5,h*5);
      ctx.fillStyle=i%3===0?'#6ab6bd':i%3===1?'#4e879c':'#6c9a87';
      ctx.beginPath();ctx.moveTo(-h*.32,h*.45);ctx.lineTo(-h*.18,-h*.38);ctx.lineTo(0,-h);ctx.lineTo(h*.25,-h*.28);ctx.lineTo(h*.36,h*.45);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(225,250,235,.55)';ctx.beginPath();ctx.moveTo(-h*.1,h*.2);ctx.lineTo(0,-h*.76);ctx.lineTo(h*.08,h*.18);ctx.closePath();ctx.fill();ctx.restore();
    }
    // Ceiling stalactites and floor stalagmites sit along the perimeter.
    for(let i=0;i<17;i++){
      const x=width*(.035+hash(i+5,22)*.93),top=20+hash(i,18)*height*.12,bottom=height-(18+hash(i+15,7)*height*.12),w=7+hash(i+3,11)*12;
      ctx.fillStyle='#1a2424';ctx.beginPath();ctx.moveTo(x-w,0);ctx.lineTo(x+w,0);ctx.lineTo(x+w*.25,top);ctx.lineTo(x-w*.18,top*.78);ctx.closePath();ctx.fill();
      if(i%2===0){ctx.fillStyle='#343c36';ctx.beginPath();ctx.moveTo(x-w,bottom+24);ctx.lineTo(x,bottom-3);ctx.lineTo(x+w,bottom+24);ctx.closePath();ctx.fill();}
    }
    // Wooden support frames and warm lamps are placed around the outer galleries.
    for(let i=0;i<6;i++){
      const x=width*(.12+i*.152),y=height*(i%2?.22:.77);
      ctx.save();ctx.translate(x,y);
      ctx.fillStyle='#49301f';ctx.fillRect(-15,-22,5,44);ctx.fillRect(10,-22,5,44);ctx.fillRect(-18,-25,36,5);
      ctx.fillStyle='#9a7048';ctx.fillRect(-13,-20,2,39);ctx.fillRect(12,-20,2,39);
      const pulse=.82+.18*Math.sin(t/210+i);
      const lamp=ctx.createRadialGradient(0,-17,1,0,-17,34);lamp.addColorStop(0,'rgba(255,198,112,'+(.32*pulse)+')');lamp.addColorStop(1,'rgba(255,164,74,0)');
      ctx.fillStyle=lamp;ctx.fillRect(-35,-52,70,70);ctx.fillStyle='#ffd18a';ctx.beginPath();ctx.arc(0,-17,3,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    // Fine drifting dust in the lantern beams.
    for(let i=0;i<22;i++){
      const phase=t*.00012+i*2.31,x=(hash(i,29)*width+Math.sin(phase)*12)%width,y=(hash(i+9,31)*height+(t*.009+i*19)%(height+20))%(height+20);
      ctx.fillStyle='rgba(231,220,190,'+(.12+.18*(.5+.5*Math.sin(phase*2)))+')';
      ctx.beginPath();ctx.arc(x,y,1+(i%3)*.35,0,Math.PI*2);ctx.fill();
    }
    // Two concealed doors lead to optional one-time treasure rooms.
    for(const [id,x,y,unlocked,label] of [[1,width*.25,height*.28,caveBossDefeated,'АРХИВ'],[2,width*.48,height*.78,inventoryItems.find(i=>i.name==='Печать разведчика')?.count>0,'КОРНЕВОЙ ЗАЛ']]){
      ctx.save();ctx.translate(x,y);ctx.fillStyle='#101719';ctx.beginPath();ctx.ellipse(0,10,43,17,0,0,6.28);ctx.fill();ctx.fillStyle=unlocked?'#8abf91':'#59616a';ctx.beginPath();ctx.arc(0,0,28,Math.PI,0);ctx.lineTo(28,12);ctx.lineTo(-28,12);ctx.closePath();ctx.fill();ctx.fillStyle=unlocked?'#d4f2a4':'#9ba2a8';ctx.font='900 9px Segoe UI';ctx.textAlign='center';ctx.fillText(unlocked?label+' · E':'ЗАПЕЧАТАНО',0,-35);ctx.restore();
    }
    // The guardian and treasure occupy the far side of the same spacious chamber.
    drawCaveBoss();
    const cx=width*.73,cy=height*.48;
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(cx,cy+15,31,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=caveChestOpened?'#5c5142':'#8c562e';ctx.fillRect(cx-20,cy-5,40,25);
    ctx.fillStyle=caveChestOpened?'#827463':'#c18a45';ctx.fillRect(cx-20,cy-14,40,12);
    ctx.fillStyle='#f7d56e';ctx.fillRect(cx-3,cy-6,6,15);
    if(!caveChestOpened){ctx.shadowColor='#ffcf62';ctx.shadowBlur=20;ctx.fillStyle='#ffdf81';ctx.beginPath();ctx.arc(cx,cy-14,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    const px=player.x,py=player.y;
    ctx.fillStyle='#102a2a99';ctx.beginPath();ctx.ellipse(px,py+13,16,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3b2837';ctx.fillRect(px-7,py+6,5,9);ctx.fillRect(px+2,py+6,5,9);
    ctx.fillStyle=playerAppearance.armor||'#526fba';ctx.fillRect(px-9,py-4,18,15);
    const caveLook=playerAppearance,caveHair=caveLook.hairStyle||'short',caveFace=caveLook.face||'normal';
    if(caveHair==='hood'){ctx.fillStyle=caveLook.accent||'#9cb9ff';ctx.fillRect(px-9,py-22,18,19);}
    ctx.fillStyle=caveLook.skin||'#e8b88c';ctx.fillRect(px-6,py-18,12,13);ctx.fillStyle=caveLook.hair||'#352d3d';
    if(caveHair==='mohawk')ctx.fillRect(px-2,py-23,4,10);
    else if(caveHair==='curly'){for(const [hx,hy] of [[-6,-20],[0,-22],[6,-20]]){ctx.beginPath();ctx.arc(px+hx,py+hy,3,0,Math.PI*2);ctx.fill();}}
    else if(caveHair!=='hood'){ctx.fillRect(px-7,py-21,14,5);if(caveHair==='long')ctx.fillRect(px-8,py-17,3,12);}
    if(caveFace==='visor'){ctx.fillStyle=caveLook.accent||'#9cb9ff';ctx.fillRect(px-7,py-14,14,5);ctx.fillStyle=caveLook.eye||'#26334c';ctx.fillRect(px-4,py-13,3,2);ctx.fillRect(px+2,py-13,3,2);}
    else{ctx.fillStyle=caveLook.eye||'#26334c';ctx.fillRect(px-4,py-13,2,2);ctx.fillRect(px+3,py-13,2,2);if(caveFace==='stern'){ctx.fillRect(px-5,py-15,4,1);ctx.fillRect(px+2,py-15,4,1);}if(caveFace==='smile'){ctx.fillStyle='#7c4135';ctx.fillRect(px-2,py-8,5,1);}else if(caveFace==='mask'){ctx.fillStyle='#d5dce6';ctx.fillRect(px-5,py-10,10,5);ctx.fillStyle='#7e8ba0';ctx.fillRect(px-3,py-8,2,1);ctx.fillRect(px+1,py-8,2,1);}}
    if(equipment.helmet){ctx.fillStyle='#d7dfe8';ctx.fillRect(px-9,py-22,18,5);}
    ctx.fillStyle='#182b38';ctx.beginPath();ctx.ellipse(width*.16,height*.8,42,28,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#7bd7e7';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle='#f0d28b';ctx.font='bold 15px Segoe UI';ctx.textAlign='center';ctx.fillText('БОЛЬШАЯ ПЕЩЕРА · ОТКРЫТЫЙ ЗАЛ',width/2,35);
    ctx.fillStyle='#a6bddb';ctx.font='12px Segoe UI';ctx.fillText(caveChestOpened?'Сундук открыт · E у выхода — вернуться':'Просторная пещера · победи Каменного стража и открой сундук',width/2,58);
    if(dodgeTimer>0){ctx.strokeStyle='#a8d9ff';ctx.lineWidth=4;ctx.globalAlpha=dodgeTimer/.24;ctx.beginPath();ctx.arc(px,py,30,0,Math.PI*1.6);ctx.stroke();ctx.globalAlpha=1;}
    drawRemotePlayers(0,0);
  }
  function drawForestLabel(camX,camY){const x=(COLS-18)*TILE-camX,y=(ROWS-26)*TILE-camY;if(x<-220||x>width+220||y<-40||y>height+40)return;ctx.save();ctx.textAlign='center';ctx.font='900 12px Segoe UI';ctx.fillStyle='#d4f5b4';ctx.shadowColor='#143a1d';ctx.shadowBlur=8;ctx.fillText('ЛЕС · ЛОГОВО ОБОРОТНЯ',x,y);ctx.restore();}
  function drawWolfBoss(camX,camY,time=0){
    if(!wolfBossActive)return;
    const x=wolfBossX-camX,y=wolfBossY-camY;
    if(x<-120||x>width+120||y<-120||y>height+120)return;
    const run=Math.sin(time/85),breath=1+Math.sin(time/230)*.025;
    ctx.save();ctx.translate(x,y);ctx.scale(breath,breath);
    // Ground shadow and tail: the boss is a full four-legged beast, not a head icon.
    ctx.fillStyle='rgba(0,0,0,.48)';ctx.beginPath();ctx.ellipse(-1,24,48,13,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#303b48';ctx.lineWidth=9;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-31,-1);ctx.quadraticCurveTo(-52,-15,-48,-29+run*2);ctx.stroke();
    ctx.strokeStyle='#7e8d9b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-48,-29+run*2);ctx.lineTo(-56,-34+run*2);ctx.stroke();
    // Four articulated legs with paws and claws.
    for(const leg of [{x:-27,y:7,p:-34,a:run},{x:-10,y:9,p:-13,a:-run},{x:20,y:8,p:25,a:-run},{x:35,y:4,p:39,a:run}]){
      ctx.strokeStyle='#35414f';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(leg.x,leg.y);ctx.lineTo(leg.x+leg.a*2,leg.p);ctx.lineTo(leg.x+leg.a*3,22);ctx.stroke();
      ctx.fillStyle='#202a35';ctx.beginPath();ctx.ellipse(leg.x+leg.a*3+3,22,8,4,.1,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c1cbd2';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(leg.x+leg.a*3+4,23);ctx.lineTo(leg.x+leg.a*3+7,25);ctx.stroke();
    }
    // Long muscular torso, belly and layered fur.
    ctx.fillStyle='#202a35';ctx.beginPath();ctx.ellipse(-1,1,39,21,-.05,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#4b5a69';ctx.beginPath();ctx.ellipse(-2,-3,35,19,-.08,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#718293';ctx.beginPath();ctx.ellipse(-8,-9,25,10,-.12,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle='#303d4a';ctx.beginPath();ctx.moveTo(-26,-6);ctx.lineTo(-18,-17);ctx.lineTo(-11,-9);ctx.lineTo(-3,-20);ctx.lineTo(5,-9);ctx.lineTo(14,-17);ctx.lineTo(21,-5);ctx.lineTo(12,8);ctx.lineTo(-18,10);ctx.closePath();ctx.fill();
    // Shoulders, thick neck and shaggy mane.
    ctx.fillStyle='#596b7b';ctx.beginPath();ctx.moveTo(13,-14);ctx.lineTo(29,-22);ctx.lineTo(43,-13);ctx.lineTo(42,6);ctx.lineTo(25,14);ctx.lineTo(12,4);ctx.closePath();ctx.fill();
    ctx.fillStyle='#293542';ctx.beginPath();ctx.moveTo(12,-13);ctx.lineTo(21,-24);ctx.lineTo(24,-13);ctx.lineTo(33,-28);ctx.lineTo(35,-13);ctx.lineTo(45,-21);ctx.lineTo(43,-3);ctx.lineTo(33,10);ctx.lineTo(20,5);ctx.closePath();ctx.fill();
    // Head, ears, muzzle and nose.
    ctx.fillStyle='#718394';ctx.beginPath();ctx.ellipse(39,-13,16,13,-.2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#394756';ctx.beginPath();ctx.moveTo(28,-20);ctx.lineTo(27,-39);ctx.lineTo(39,-27);ctx.closePath();ctx.fill();
    ctx.fillStyle='#394756';ctx.beginPath();ctx.moveTo(42,-22);ctx.lineTo(53,-37);ctx.lineTo(53,-17);ctx.closePath();ctx.fill();
    ctx.fillStyle='#c68a91';ctx.beginPath();ctx.moveTo(30,-24);ctx.lineTo(30,-33);ctx.lineTo(36,-26);ctx.closePath();ctx.fill();
    ctx.fillStyle='#c68a91';ctx.beginPath();ctx.moveTo(46,-24);ctx.lineTo(51,-31);ctx.lineTo(50,-22);ctx.closePath();ctx.fill();
    ctx.fillStyle='#8d9eac';ctx.beginPath();ctx.moveTo(43,-11);ctx.lineTo(61,-5);ctx.lineTo(52,3);ctx.lineTo(37,0);ctx.closePath();ctx.fill();
    ctx.fillStyle='#151c24';ctx.beginPath();ctx.ellipse(60,-5,4,3,0,0,Math.PI*2);ctx.fill();
    // Eyes, brow, mouth and visible fangs.
    ctx.fillStyle='#161c25';ctx.beginPath();ctx.ellipse(43,-16,6,4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff263f';ctx.shadowColor='#ff1938';ctx.shadowBlur=14;ctx.beginPath();ctx.ellipse(44,-16,3.2,2.3,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#202a35';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(37,-21);ctx.lineTo(49,-20);ctx.stroke();
    ctx.fillStyle='#f3f0e8';ctx.beginPath();ctx.moveTo(47,0);ctx.lineTo(50,7);ctx.lineTo(52,1);ctx.fill();ctx.beginPath();ctx.moveTo(54,-1);ctx.lineTo(57,4);ctx.lineTo(58,-2);ctx.fill();
    // Fur highlights and a pulsing red danger aura.
    ctx.strokeStyle='#a0afbb';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-21,-12);ctx.lineTo(-15,-7);ctx.moveTo(-8,-15);ctx.lineTo(-3,-9);ctx.moveTo(5,-14);ctx.lineTo(10,-8);ctx.moveTo(22,-15);ctx.lineTo(27,-9);ctx.stroke();
    ctx.globalAlpha=.16+Math.sin(time/110)*.07;ctx.strokeStyle='#ff304a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,1,52+Math.sin(time/130)*2,34,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.restore();
    ctx.save();ctx.textAlign='center';ctx.font='900 13px Segoe UI';ctx.fillStyle='#fff';ctx.shadowColor='#080c13';ctx.shadowBlur=5;ctx.fillText('ОБОРОТЕН',x,y-55);ctx.fillStyle='#25121a';ctx.fillRect(x-44,y-46,88,7);ctx.fillStyle='#fa4661';ctx.fillRect(x-44,y-46,88*Math.max(0,wolfBossHp/(1000+difficultyConfig().rank*500)),7);ctx.restore();
  }
  function drawWolfCompanion(camX,camY,time){if(!wolfCompanionUnlocked||wolfCompanionHp<=0)return;const x=wolfCompanionX()-camX,y=wolfCompanionY()-camY;if(x<-50||x>width+50||y<-50||y>height+50)return;ctx.save();ctx.translate(x,y+Math.sin(time/180));ctx.fillStyle='#b8c4d5';ctx.beginPath();ctx.ellipse(0,0,13,9,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(10,-5,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#71839c';ctx.beginPath();ctx.moveTo(5,-10);ctx.lineTo(3,-20);ctx.lineTo(11,-13);ctx.moveTo(14,-11);ctx.lineTo(21,-18);ctx.lineTo(19,-7);ctx.fill();ctx.fillStyle='#f4c6cc';ctx.fillRect(12,-6,2,2);ctx.fillStyle='#fff';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('🐕 '+Math.ceil(wolfCompanionHp)+'/300',0,-25);ctx.restore();}

  function makeBiomeBossState(){const make=(attackTimer,specialTimer)=>({active:false,defeated:false,hp:0,attackTimer,specialTimer,flash:0,rebirthMultiplier:1,rebirthCount:0,attackWindup:0,attackVisual:0,attackHit:false,attackTargetX:0,attackTargetY:0,attackPhase:0,teleportFade:0,teleportCooldown:0});return {frost:make(1.35,7),sand:make(1.5,8),blight:make(1.7,9),jungle:make(1.6,7.5)};}
  function biomeBossDefs(){const rank=difficultyConfig().rank;return [{id:'frost',name:'Ледяной титан',x:(COLS-10)*TILE+16,y:9*TILE+16,color:'#83e9ff',reward:'Сердце ледника',maxHp:850+rank*330,damage:10+rank*6},{id:'sand',name:'Король скорпионов',x:9*TILE+16,y:(ROWS-12)*TILE+16,color:'#ffb24a',reward:'Жало короля',maxHp:780+rank*300,damage:9+rank*5},{id:'blight',name:'Страж порчи',x:(COLS-9)*TILE+16,y:Math.max(46,ROWS-24)*TILE+16,color:'#b7ed6e',reward:'Сердце порчи',maxHp:1000+rank*360,damage:12+rank*6},{id:'jungle',name:'Хранитель лиан',x:Math.floor(COLS*.29)*TILE+16,y:Math.floor(ROWS*.49)*TILE+16,color:'#73d45b',reward:'Сердце джунглей',maxHp:1050+rank*390,damage:12+rank*6}];}
  function bossHpMax(def){const state=biomeBosses?.[def.id];return Math.round(def.maxHp*Math.max(1,Math.min(8.35,Number(state?.rebirthMultiplier)||1)));}
  function normalizeBiomeBossState(saved){
    const out=makeBiomeBossState();
    if(!saved||typeof saved!=='object')return out;
    for(const def of biomeBossDefs()){
      const v=saved[def.id];
      if(!v||typeof v!=='object')continue;
      const rawMultiplier=Number(v.rebirthMultiplier);
      const multiplier=Number.isFinite(rawMultiplier)?Math.max(1,Math.min(8.35,rawMultiplier)):1;
      const maxHp=Math.round(def.maxHp*multiplier);
      const rawHp=Number(v.hp),rawAttackTimer=Number(v.attackTimer),rawSpecialTimer=Number(v.specialTimer);
      const defeated=v.defeated===true;
      out[def.id]={
        active:v.active===true&&!defeated,
        defeated,
        hp:defeated?0:(Number.isFinite(rawHp)?Math.max(0,Math.min(maxHp,rawHp)):maxHp),
        attackTimer:Number.isFinite(rawAttackTimer)?Math.max(0,Math.min(5,rawAttackTimer)):1.3,
        specialTimer:Number.isFinite(rawSpecialTimer)?Math.max(0,Math.min(20,rawSpecialTimer)):7,
        flash:0,rebirthMultiplier:multiplier,
        rebirthCount:Math.max(0,Math.min(4,Math.floor(Number(v.rebirthCount)||0))),
        attackWindup:Math.max(0,Math.min(2,Number(v.attackWindup)||0)),attackVisual:Math.max(0,Math.min(2,Number(v.attackVisual)||0)),attackHit:v.attackHit===true,
        attackTargetX:Number.isFinite(Number(v.attackTargetX))?Number(v.attackTargetX):0,attackTargetY:Number.isFinite(Number(v.attackTargetY))?Number(v.attackTargetY):0,
        attackPhase:Number(v.attackPhase)||0,teleportFade:Math.max(0,Math.min(1,Number(v.teleportFade)||0)),teleportCooldown:Math.max(0,Math.min(30,Number(v.teleportCooldown)||0))
      };
      if(!defeated&&out[def.id].hp<=0)out[def.id].hp=maxHp;
    }
    return out;
  }
  function updateBiomeBosses(dt){
    if(dungeonMode||caveMode||mineMode||inHouse||tradeWorldMode||bossRealmMode)return;
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    for(const def of biomeBossDefs()){
      const b=biomeBosses[def.id];if(!b||b.defeated)continue;
      if(!Number.isFinite(b.rebirthMultiplier)||b.rebirthMultiplier<1)b.rebirthMultiplier=1;
      const maxHp=bossHpMax(def);if(!Number.isFinite(b.hp))b.hp=maxHp;else b.hp=Math.max(0,Math.min(maxHp,b.hp));
      if(!Number.isFinite(b.attackTimer))b.attackTimer=.35;if(!Number.isFinite(b.specialTimer))b.specialTimer=.5;
      b.flash=Math.max(0,(b.flash||0)-step);b.attackVisual=Math.max(0,(b.attackVisual||0)-step);b.teleportCooldown=Math.max(0,(b.teleportCooldown||0)-step);
      b.teleportFade=Math.max(0,(b.teleportFade||0)-step*2.4);
      const d=Math.hypot(player.x-def.x,player.y-def.y);if(!Number.isFinite(d))continue;
      if(!b.active&&d<440){b.active=true;b.hp=b.hp>0?Math.min(b.hp,maxHp):maxHp;b.attackTimer=1.3;b.specialTimer=Math.max(2,b.specialTimer||7);toast('ОПАСНОСТЬ: '+def.name+' заметил тебя!');playSound('portal');saveGame();}
      if(!b.active)continue;
      const power=Math.max(1,Math.min(8.35,b.rebirthMultiplier));
      const hpRatio=b.hp/Math.max(1,maxHp),nextPhase=hpRatio<=.25?3:hpRatio<=.6?2:1;
      if(b.combatPhase!==nextPhase){const previous=b.combatPhase||1;b.combatPhase=nextPhase;if(nextPhase>previous){spawnVisualBurst(def.x,def.y,32,'spark',nextPhase===3?'#ff5a68':def.color);toast(def.name+' · ФАЗА '+nextPhase+(nextPhase===2?' · ярость пробуждается!':' · предельная ярость!'));b.specialTimer=Math.min(b.specialTimer,1.1);}}

      b.attackTimer=Math.max(0,b.attackTimer-step);b.specialTimer=Math.max(0,b.specialTimer-step);
      const windupWasActive=(b.attackWindup||0)>0;if(windupWasActive)b.attackWindup=Math.max(0,b.attackWindup-step);
      const canBossHit=!immortal&&(!Number.isFinite(dodgeTimer)||dodgeTimer<=0);
      const meleeRange=def.id==='jungle'?138:108;
      if(d<=meleeRange&&b.attackTimer<=0&&canBossHit){
        b.attackTimer=Math.max(.65,1.65-difficultyConfig().rank*.13);
        const hit=Math.max(1,Math.round(def.damage*power*(b.combatPhase===3?1.55:b.combatPhase===2?1.2:1)*(isModInstalled('elemental_lords')?1.25:1)*(combatGuardTimer>0?.28:1)*(1-armorReduction())));if(combatParryTimer>0){combatTakeDamage(def.damage*power,def.name,def.color);b.attackTimer=.85;continue;}
        player.hp=Math.max(0,player.hp-hit);spawnVisualBurst(player.x,player.y,9,'spark',def.color);updateVitals();toast(def.name+' атакует: −'+hit+' HP');
        if(player.hp<=0)respawnPlayerAfterDefeat();
      }
      if(b.specialTimer<=0&&b.attackWindup<=0&&b.attackVisual<=0){
        b.attackWindup=.92;b.attackHit=false;b.attackTargetX=player.x;b.attackTargetY=player.y;b.attackPhase=0;
        b.specialTimer=Math.max(4.2,(9-difficultyConfig().rank*.45)*(b.combatPhase===3?.62:b.combatPhase===2?.8:1));
        const warning={frost:'ЛЕДЯНОЙ РАЗЛОМ',sand:'ПЕСЧАНАЯ ЗАСАДА',blight:'СПОРОВЫЙ ВЗРЫВ',jungle:'ПРОБУЖДЕНИЕ КОРНЕЙ'}[def.id];
        toast(def.name+' готовит атаку: '+warning+' — уклоняйся!');
      }
      if(windupWasActive){
        b.attackPhase+=step*8;
        if(b.attackWindup<=0&&!b.attackHit){
          b.attackHit=true;b.attackVisual=1.35;
          const tx=b.attackTargetX,ty=b.attackTargetY;
          const radius={frost:92,sand:78,blight:112,jungle:96}[def.id]||90;
          const hitDistance=Math.hypot(player.x-tx,player.y-ty);
          if(hitDistance<=radius&&canBossHit){
            const special=Math.max(1,Math.round(def.damage*power*1.55*(1-armorReduction())));
            player.hp=Math.max(0,player.hp-special);updateVitals();
            const move={frost:'ЛЕДЯНЫЕ ШИПЫ',sand:'УДАР ИЗ ПЕСКА',blight:'ЯДОВИТЫЕ СПОРЫ',jungle:'ПОДЗЕМНЫЕ ЩУПАЛЬЦА'}[def.id];
            toast(def.name+' · '+move+': −'+special+' HP!');
            if(player.hp<=0)respawnPlayerAfterDefeat();
          }else spawnVisualBurst(tx,ty,12,'spark',def.color);
          if(def.id==='jungle'&&b.teleportCooldown<=0){
            b.teleportCooldown=8;b.teleportFade=.8;
            b.attackTargetX=player.x;b.attackTargetY=player.y;
          }
        }
      }
    }
  }
  function defeatBiomeBoss(def,b){if(!def||!b||b.defeated)return;scheduleNemesis('boss',def.id,def.name,'brute',Math.min(8.35,(b.rebirthMultiplier||1)*1.7));b.defeated=true;triggerBossVictory(def.name,def.x,def.y,def.color);if(isModInstalled('elemental_lords')){walletCents+=5000;changeItem('Кристалл',2);updateWalletHud();toast('Повелитель стихий: дополнительная награда +50 золота и 2 кристалла!');}b.active=false;b.hp=0;
    if(isCoopWorldActive()&&window.SkyRealmCoopClient?.isRoomOwner){
      spawnSharedLoot(def.x,def.y,[{name:def.reward,count:1},{name:'Кристалл',count:3},{name:'Малое зелье',count:2},{name:'Золото',count:75}],'surface');
    }else{walletCents+=7500;changeItem(def.reward,1);changeItem('Кристалл',3);changeItem('Малое зелье',2);renderInventory();}
    spawnVisualBurst(def.x,def.y,32,'spark',def.color);playSound('portal');awardXP(220,'победа: '+def.name);saveGame();toast(def.name+' повержен! Награда появилась в мире.');}
  function drawBiomeBosses(camX,camY,time){
    for(const def of biomeBossDefs()){
      const b=biomeBosses[def.id];if(!b||b.defeated)continue;
      const dist=Math.hypot(player.x-def.x,player.y-def.y);if(!b.active&&dist>560)continue;
      const x=def.x-camX,y=def.y-camY;if(x<-180||x>width+180||y<-180||y>height+180)continue;
      const wind=b.attackWindup>0,visual=b.attackVisual>0,phase=b.attackPhase||time/100;
      if(wind||visual){
        ctx.save();ctx.translate((b.attackTargetX||def.x)-camX,(b.attackTargetY||def.y)-camY);
        const pulse=.5+.5*Math.sin(time/55);
        ctx.globalAlpha=wind?.25+.45*pulse:Math.max(0,b.attackVisual/1.35);
        ctx.strokeStyle=def.color;ctx.fillStyle=def.color;ctx.shadowColor=def.color;ctx.shadowBlur=18;ctx.lineWidth=4;
        if(def.id==='jungle'){
          for(let i=0;i<5;i++){const a=i*Math.PI*2/5+phase*.18,len=48+Math.sin(phase+i)*15;ctx.beginPath();ctx.moveTo(Math.cos(a)*len,Math.sin(a)*len+25);ctx.bezierCurveTo(Math.cos(a+1)*24,Math.sin(a+1)*24,Math.cos(a-1)*35,Math.sin(a-1)*35,-Math.cos(a)*14,-Math.sin(a)*14);ctx.stroke();ctx.beginPath();ctx.arc(Math.cos(a)*len,Math.sin(a)*len+25,5+Math.sin(phase+i)*2,0,Math.PI*2);ctx.fill();}
          ctx.beginPath();ctx.arc(0,8,32+pulse*12,0,Math.PI*2);ctx.stroke();
        }else if(def.id==='frost'){
          for(let i=0;i<8;i++){const a=i*Math.PI/4+phase*.08;ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-8,-38-pulse*14);ctx.lineTo(0,-58-pulse*18);ctx.lineTo(8,-38-pulse*14);ctx.closePath();ctx.fill();ctx.restore();}
        }else if(def.id==='sand'){
          ctx.beginPath();ctx.ellipse(0,12,28+pulse*46,12+pulse*20,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<7;i++){const a=i*Math.PI*2/7+phase*.2;ctx.beginPath();ctx.arc(Math.cos(a)*48,Math.sin(a)*22,4+pulse*3,0,Math.PI*2);ctx.fill();}
        }else{
          for(let i=0;i<12;i++){const a=i*Math.PI/6+phase*.1;ctx.beginPath();ctx.arc(Math.cos(a)*(24+pulse*38),Math.sin(a)*(16+pulse*28),4+pulse*3,0,Math.PI*2);ctx.fill();}
          ctx.beginPath();ctx.arc(0,0,42+pulse*18,0,Math.PI*2);ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();ctx.translate(x,y);const fade=1-Math.max(0,Math.min(1,(b.teleportFade||0)/.8));
      ctx.globalAlpha=fade;ctx.translate(0,Math.sin(time/160)*2);ctx.scale(1+Math.sin(time/170)*.035,1+Math.sin(time/170)*.035);
      ctx.fillStyle='#08101ba8';ctx.beginPath();ctx.ellipse(0,17,35,11,0,0,Math.PI*2);ctx.fill();
      ctx.shadowColor=def.color;ctx.shadowBlur=20;ctx.fillStyle=b.flash>0?'#fff':def.color;
      if(def.id==='frost'){ctx.beginPath();ctx.moveTo(-24,17);ctx.lineTo(-20,-12);ctx.lineTo(-11,-25);ctx.lineTo(-4,-13);ctx.lineTo(3,-33);ctx.lineTo(12,-14);ctx.lineTo(23,-22);ctx.lineTo(26,14);ctx.closePath();ctx.fill();}
      else if(def.id==='sand'){ctx.beginPath();ctx.ellipse(0,1,24,19,0,0,Math.PI*2);ctx.fill();ctx.fillRect(-28,-10,9,7);ctx.fillRect(19,-10,9,7);ctx.strokeStyle=def.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(3,-12,24,Math.PI,Math.PI*1.8);ctx.stroke();}
      else if(def.id==='jungle'){ctx.fillStyle='#6a432d';ctx.fillRect(-8,-5,16,26);ctx.fillStyle=b.flash>0?'#fff':'#73d45b';ctx.beginPath();ctx.ellipse(0,-14,23,18,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-16,-22);ctx.lineTo(-30,-35);ctx.lineTo(-13,-31);ctx.moveTo(16,-22);ctx.lineTo(30,-35);ctx.lineTo(13,-31);ctx.strokeStyle=def.color;ctx.lineWidth=6;ctx.stroke();ctx.fillStyle='#fff3b0';ctx.fillRect(-9,-17,5,4);ctx.fillRect(4,-17,5,4);ctx.fillStyle='#284b25';ctx.fillRect(-5,-6,10,3);}
      else{ctx.beginPath();ctx.moveTo(-25,15);ctx.lineTo(-23,-10);ctx.lineTo(-9,-20);ctx.lineTo(0,-14);ctx.lineTo(12,-28);ctx.lineTo(24,-8);ctx.lineTo(28,15);ctx.closePath();ctx.fill();}
      ctx.shadowBlur=0;ctx.restore();
      // Exposed weak-point sigils pulse brighter as the boss loses health.
      const hpRatio=Math.max(0,b.hp/bossHpMax(def)),weakPulse=.5+.5*Math.sin(time/105);
      ctx.save();ctx.translate(x,y);ctx.globalAlpha=.48+weakPulse*.38;ctx.strokeStyle=def.id==='frost'?'#b9f6ff':def.id==='sand'?'#ffd17a':def.id==='jungle'?'#b8ff78':'#df9cff';ctx.fillStyle=ctx.strokeStyle;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;
      const weakX=def.id==='jungle'?0:def.id==='sand'?0:4,weakY=def.id==='frost'?-5:-9;
      ctx.beginPath();ctx.arc(weakX,weakY,4+weakPulse*2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(weakX,weakY,9+weakPulse*4,0,Math.PI*2);ctx.stroke();
      if(hpRatio<=.6){ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,34+weakPulse*5,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
      if(def.id==='jungle'&&b.teleportFade>0){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,b.teleportFade/.8));ctx.translate((b.attackTargetX||player.x)-camX,(b.attackTargetY||player.y)-camY);ctx.shadowColor='#8dff62';ctx.shadowBlur=24;ctx.fillStyle='#6a432d';ctx.fillRect(-7,-3,14,23);ctx.fillStyle='#73d45b';ctx.beginPath();ctx.ellipse(0,-13,22,17,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#9cff67';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-13,-20);ctx.lineTo(-26,-34);ctx.moveTo(13,-20);ctx.lineTo(26,-34);ctx.stroke();ctx.fillStyle='#fff3b0';ctx.fillRect(-8,-16,4,4);ctx.fillRect(4,-16,4,4);ctx.restore();}
      ctx.save();ctx.textAlign='center';ctx.font='900 12px Segoe UI';ctx.fillStyle='#fff';ctx.fillText(def.name,x,y-40);ctx.fillStyle='#241a27';ctx.fillRect(x-39,y-32,78,6);ctx.fillStyle=def.color;ctx.fillRect(x-39,y-32,78*Math.max(0,(b.active?b.hp:bossHpMax(def))/bossHpMax(def)),6);ctx.restore();
    }
  }
  function dungeonGatePosition(){return {x:(COLS-15)*TILE+16,y:25*TILE+16};}
  function drawDungeonGate(camX,camY,time){const p=dungeonGatePosition(),x=p.x-camX,y=p.y-camY;if(x<-90||x>width+90||y<-100||y>height+100)return;ctx.save();ctx.translate(x,y);ctx.fillStyle='#11192599';ctx.beginPath();ctx.ellipse(0,14,42,16,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#716a73';ctx.fillRect(-28,-16,10,38);ctx.fillRect(18,-16,10,38);ctx.fillRect(-30,-20,60,8);ctx.fillStyle='#262b3a';ctx.beginPath();ctx.arc(0,-5,19,Math.PI,Math.PI*2);ctx.lineTo(19,19);ctx.lineTo(-19,19);ctx.closePath();ctx.fill();ctx.strokeStyle='#b99cff';ctx.lineWidth=3;ctx.shadowColor='#a77bff';ctx.shadowBlur=12+Math.sin(time/200)*4;ctx.beginPath();ctx.arc(0,-4,15,Math.PI,Math.PI*2);ctx.stroke();ctx.fillStyle='#f3eaff';ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.fillText('РУИНЫ',0,34);ctx.fillText('E · ВОЙТИ',0,46);ctx.restore();}
  function dungeonEnemyMaxHp(room=dungeonRoom){return Math.round((room===5?620:90+room*42)*(.65+difficultyConfig().rank*.28)*(isModInstalled('lost_dungeons')?1.35:1));}
  function dungeonRoomCleared(room=dungeonRoom){return dungeonClearedRooms.includes(room);}
  function enterDungeon(){dungeonReturn={x:player.x,y:player.y};dungeonMode=true;dungeonRoom=[1,2,3,4,5].find(n=>!dungeonRoomCleared(n))||5;if(!dungeonRoomCleared(dungeonRoom)&&(!Number.isFinite(dungeonEnemyHp)||dungeonEnemyHp<=0))dungeonEnemyHp=dungeonEnemyMaxHp(dungeonRoom);dungeonEnemyX=width*.65;dungeonEnemyY=height*.47;dungeonEnemyAttackTimer=1.35;dungeonTrapCooldown=0;player.x=width*.18;player.y=height*.52;player.vx=player.vy=0;keys.clear();pressedMovementCodes.clear();playSound('portal');toast('Древние руины: пройди 5 комнат, победи Архонта и забери реликвию.');saveGame();}
  function leaveDungeon(){dungeonMode=false;player.x=dungeonReturn.x;player.y=dungeonReturn.y;player.vx=player.vy=0;keys.clear();pressedMovementCodes.clear();saveGame();drawMinimap();toast('Ты вышел из Древних руин. Прогресс сохранён.');}
  function updateDungeon(dt){
    if(!dungeonMode||dungeonRoomCleared())return;
    dungeonTrapCooldown=Math.max(0,dungeonTrapCooldown-dt);
    if(!Number.isFinite(dungeonEnemyX)||dungeonEnemyX<=0)dungeonEnemyX=width*.65;
    if(!Number.isFinite(dungeonEnemyY)||dungeonEnemyY<=0)dungeonEnemyY=height*.47;
    const dx=player.x-dungeonEnemyX,dy=player.y-dungeonEnemyY,dist=Math.hypot(dx,dy)||1;
    if(dist>42){const speed=dungeonRoom===5?29:38;dungeonEnemyX+=dx/dist*speed*dt;dungeonEnemyY+=dy/dist*speed*dt;}
    dungeonEnemyAttackTimer-=dt;dungeonEnemySpecialTimer=Math.max(0,dungeonEnemySpecialTimer-dt);
    if(dungeonEnemySpecialTimer<=0){dungeonEnemySpecialTimer=8.5;if(dist<168&&!immortal&&dodgeTimer<=0){const special=Math.max(1,Math.round((dungeonRoom===5?34:13+dungeonRoom*3)*difficultyConfig().monsterDamage*(1-armorReduction())));player.hp=Math.max(0,player.hp-special);updateVitals();spawnVisualBurst(player.x,player.y,22,'spark','#b98aff');toast((dungeonRoom===5?'АРХОНТ':'СТРАЖ РУИН')+' · РАЗРЫВ ПЕЧАТИ: −'+special+' HP!');if(player.hp<=0)respawnPlayerAfterDefeat();}}
    if(dist<74&&dungeonEnemyAttackTimer<=0&&!immortal&&dodgeTimer<=0){
      dungeonEnemyAttackTimer=dungeonRoom===5?.95:1.45;
      const hit=Math.max(1,Math.round((dungeonRoom===5?24:8+dungeonRoom*3)*difficultyConfig().monsterDamage*(1-armorReduction())));
      player.hp=Math.max(0,player.hp-hit);updateVitals();spawnVisualBurst(player.x,player.y,7,'spark',dungeonRoom===5?'#dc86ff':'#a8a1cf');
      toast((dungeonRoom===5?'Архонт руин':'Страж комнаты')+' наносит '+hit+' урона.');
      if(player.hp<=0)respawnPlayerAfterDefeat();
    }
    if(dungeonRoom===3){
      const tx=width*.43,ty=height*.5;
      if(Math.hypot(player.x-tx,player.y-ty)<42&&dungeonTrapCooldown<=0&&!immortal){
        dungeonTrapCooldown=2.2;const hit=Math.max(1,Math.round(9*(1-armorReduction())));
        player.hp=Math.max(0,player.hp-hit);updateVitals();spawnVisualBurst(player.x,player.y,10,'spark','#ff9a68');
        toast('Ловушка в полу! −'+hit+' HP.');if(player.hp<=0)respawnPlayerAfterDefeat();
      }
    }
  }
  function attackDungeonEnemy(){if(playerAttackCooldown>0)return;playerAttackCooldown=.58;attackAnimTimer=.2;playSound('hit');if(dungeonRoomCleared()){toast(dungeonRoom===5?'Страж побеждён. Найди сундук справа.':'Комната очищена. Иди к двери справа.');return;}const ex=dungeonEnemyX>0?dungeonEnemyX:width*.65,ey=dungeonEnemyY>0?dungeonEnemyY:height*.47;if(Math.hypot(player.x-ex,player.y-ey)>Math.max(145,weaponRange()+30)){toast('Подойди к стражу комнаты ближе.');return;}const weapon=equipment.weapon||'Деревянный меч',damage=Math.round(weaponDamage(weapon)*(1+skills.warrior*.1)*(Math.random()<.14?2:1));dungeonEnemyHp=Math.max(0,dungeonEnemyHp-damage);awardCombatEnergyForHit(damage);spawnVisualBurst(ex,ey,10,'spark',dungeonRoom===5?'#dca4ff':'#a9b5d7');toast((dungeonRoom===5?'Архонт':'Страж')+' получил '+damage+' урона · '+Math.ceil(dungeonEnemyHp)+' HP');if(dungeonEnemyHp<=0){scheduleNemesis('boss','dungeon-'+dungeonRoom,dungeonRoom===5?'Архонт руин':'Страж руин '+dungeonRoom,'shadow',1.7);dungeonClearedRooms=Array.from(new Set(dungeonClearedRooms.concat([dungeonRoom])));triggerBossVictory(dungeonRoom===5?'Архонт руин':'Страж руин '+dungeonRoom,ex,ey,'#b99cff');if(dungeonRoom<5){changeItem('Эссенция глубин',1);if(Math.random()<.6)changeItem('Кристалл',1);toast('Комната '+dungeonRoom+' очищена!');}else{changeItem('Эссенция глубин',4);walletCents+=15000;toast('Архонт руин повержен! Сундук открыт.');}spawnVisualBurst(ex,ey,30,'spark','#b99cff');awardXP(dungeonRoom===5?300:70,'зачистка комнаты руин');renderInventory();saveGame();}else saveGame();}
  async function interactDungeon(){
    const exitX=width*.12,midY=height*.52;
    if(Math.hypot(player.x-exitX,player.y-midY)<95){leaveDungeon();return;}
    if(dungeonRoom===5&&dungeonRoomCleared(5)&&Math.hypot(player.x-width*.82,player.y-height*.48)<105){
      if(!dungeonChestOpened){
        const claim=await claimCoopChest('dungeon_chest','dungeon-5');
        if(claim.coop&&!claim.claimed){if(!claim.error){dungeonChestOpened=true;saveGame();}return;}
        dungeonChestOpened=true;
        changeItem('Реликвия руин',1);changeItem('Алмаз',2);changeItem('Мифрил',3);
        walletCents+=25000;awardXP(180,'сокровище Архонта');
        spawnVisualBurst(player.x,player.y,28,'spark','#ffdb7a');renderInventory();saveGame();
        toast('Реликвия, 2 алмаза, 3 мифрила и 250 золота!');
      }else toast('Сундук пуст. Найди выход слева.');
      return;
    }
    if(Math.hypot(player.x-width*.88,player.y-midY)<90){
      if(!dungeonRoomCleared()){toast('Сначала победи стража.');return;}
      if(dungeonRoom<5){
        dungeonRoom++;if(!dungeonRoomCleared())dungeonEnemyHp=dungeonEnemyMaxHp();
        dungeonEnemyX=width*.65;dungeonEnemyY=height*.47;dungeonEnemyAttackTimer=1.35;
        saveGame();playSound('portal');
        toast('Комната '+dungeonRoom+'/5. '+(dungeonRoom===5?'Впереди Архонт!':'Новый страж впереди.'));
      }else if(!dungeonChestOpened)toast('Сначала забери награду из сундука справа.');
      else leaveDungeon();
      return;
    }
    toast('E у двери слева — выйти, справа — продолжить, у сундука — награда.');
  }
  function drawDungeonInterior(dt,time){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#090c18';ctx.fillRect(0,0,width,height);const g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,'#2a263c');g.addColorStop(1,'#111522');ctx.fillStyle=g;ctx.fillRect(18,18,width-36,height-36);ctx.strokeStyle='#716783';ctx.lineWidth=12;ctx.strokeRect(26,26,width-52,height-52);for(let y=42;y<height-42;y+=43)for(let x=42;x<width-42;x+=43){ctx.strokeStyle='#4d4a5e66';ctx.strokeRect(x,y,40,40);}for(let i=0;i<9;i++){const x=width*(.16+i*.085),y=height*(.18+(i%3)*.27);ctx.fillStyle='#666176';ctx.fillRect(x-6,y-12,12,32);ctx.fillStyle='#9992a9';ctx.fillRect(x-8,y-16,16,5);}const left=width*.12,mid=height*.52,right=width*.88;ctx.fillStyle='#12101b';ctx.fillRect(left-18,mid-42,36,84);ctx.strokeStyle='#c2a1ef';ctx.lineWidth=3;ctx.strokeRect(left-18,mid-42,36,84);ctx.fillStyle=dungeonRoomCleared()?'#3f7c71':'#6d4a72';ctx.fillRect(right-18,mid-42,36,84);ctx.strokeStyle='#d0b4ff';ctx.strokeRect(right-18,mid-42,36,84);ctx.fillStyle='#fff0bd';ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillText('ВЫХОД',left,mid-55);ctx.fillText('КОМНАТА '+dungeonRoom+'/5',width/2,48);ctx.fillText(dungeonRoom===5?'АРХОНТ РУИН':'СТРАЖ '+dungeonRoom,right,mid-55);if(dungeonRoom===3){const tx=width*.43,ty=height*.5;ctx.fillStyle='#8b362c';ctx.fillRect(tx-32,ty-24,64,48);ctx.strokeStyle='#ffb06e';ctx.lineWidth=2;ctx.strokeRect(tx-32,ty-24,64,48);ctx.fillStyle='#ffcf9b';ctx.font='bold 10px Segoe UI';ctx.fillText('ЛОВУШКА',tx,ty+4);}if(dungeonRoom===5){ctx.fillStyle=dungeonRoomCleared(5)?'#b88737':'#533d63';ctx.fillRect(width*.82-22,height*.48-8,44,27);ctx.fillStyle='#f7d36f';ctx.fillRect(width*.82-22,height*.48-15,44,10);}if(!dungeonRoomCleared()){const x=dungeonEnemyX||width*.65,y=dungeonEnemyY||height*.47;ctx.save();ctx.translate(x,y);ctx.fillStyle='#11101b99';ctx.beginPath();ctx.ellipse(0,16,28,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=dungeonRoom===5?'#bd75d8':'#8c91ac';ctx.fillRect(-20,-17,40,32);ctx.fillRect(-15,-28,30,16);ctx.fillStyle=dungeonRoom===5?'#ffb3ec':'#ff6f9f';ctx.fillRect(-12,-20,6,4);ctx.fillRect(6,-20,6,4);ctx.restore();ctx.fillStyle='#251d32';ctx.fillRect(width*.5-74,70,148,7);ctx.fillStyle=dungeonRoom===5?'#da7ced':'#aabce8';ctx.fillRect(width*.5-74,70,148*Math.max(0,dungeonEnemyHp/dungeonEnemyMaxHp()),7);ctx.fillStyle='#fff';ctx.font='bold 11px Segoe UI';ctx.fillText((dungeonRoom===5?'АРХОНТ':'СТРАЖ')+' · '+Math.ceil(dungeonEnemyHp)+' HP',width*.5,65);}else{ctx.fillStyle='#a4f1d3';ctx.font='bold 13px Segoe UI';ctx.fillText(dungeonRoom===5?'Победа! E у сундука справа.':'Комната очищена · E у двери справа.',width/2,height-42);}const px=player.x,py=player.y;ctx.fillStyle='#10101a99';ctx.beginPath();ctx.ellipse(px,py+12,15,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=playerAppearance.armor||'#526fba';ctx.fillRect(px-9,py-4,18,17);ctx.fillStyle=playerAppearance.skin||'#e8b88c';ctx.fillRect(px-6,py-19,12,14);ctx.fillStyle=playerAppearance.hair||'#352d3d';ctx.fillRect(px-7,py-23,14,6);ctx.fillStyle='#e9efff';ctx.font='bold 11px Segoe UI';ctx.fillText('WASD · Space атака · E взаимодействие',width/2,height-20);ctx.textAlign='left';drawRemotePlayers(0,0);}
  function useBuffPotion(){const choices=[{name:'Настой силы',timer:'strengthPotionTimer',label:'урон +30%'},{name:'Зелье защиты',timer:'wardPotionTimer',label:'защита +20%'},{name:'Зелье скорости',timer:'speedPotionTimer',label:'скорость +25%'},{name:'Эликсир корневой ярости',timer:'rootRage',label:'урон +30%, защита +20%, скорость +25%'}];const pick=choices.find(v=>itemCount(v.name)>0);if(!pick){toast('Нет боевых настоев. Создай их на верстаке.');return;}changeItem(pick.name,-1);const duration=pick.timer==='rootRage'?35:30;if(pick.timer==='strengthPotionTimer')strengthPotionTimer=duration*(1+skillBonus('alchemist')*.08);else if(pick.timer==='wardPotionTimer')wardPotionTimer=duration*(1+skillBonus('alchemist')*.08);else if(pick.timer==='rootRage'){strengthPotionTimer=Math.max(strengthPotionTimer,duration);wardPotionTimer=Math.max(wardPotionTimer,duration);speedPotionTimer=Math.max(speedPotionTimer,duration);}else speedPotionTimer=duration*(1+skillBonus('alchemist')*.08);playSound('craft');renderInventory();saveGame();toast(pick.name+' действует '+duration+' секунд: '+pick.label+'.');}
  function findWorldEventPoint(minDistance=280,maxDistance=520){
    for(let attempt=0;attempt<36;attempt++){
      const angle=Math.random()*Math.PI*2,distance=minDistance+Math.random()*(maxDistance-minDistance);
      const x=Math.max(TILE*3,Math.min(COLS*TILE-TILE*3,player.x+Math.cos(angle)*distance));
      const y=Math.max(TILE*3,Math.min(ROWS*TILE-TILE*3,player.y+Math.sin(angle)*distance));
      if(!Number.isFinite(x)||!Number.isFinite(y)||waterAt(x/TILE,y/TILE)||blocked(x,y))continue;
      return {x,y};
    }
    return null;
  }
  function updateWorldEvents(dt){
    const coop=window.SkyRealmCoopClient;const coopRoom=coop?.getRoomState?.();if(coopRoom&&(!coop.isRoomOwner||coopRoom.status!=='running'))return;
    if(dungeonMode||caveMode||mineMode||inHouse||tradeWorldMode||paused||inMainMenu)return;
    if(!Number.isFinite(dt)||dt<=0)return;
    try{window.SkyRealmExpansionSystems?.update?.(dt);}catch(error){console.warn('[SkyRealm expansion update]',error);}
    try{
      if(worldEventCamp){worldEventCamp.life=Math.max(0,(Number(worldEventCamp.life)||0)-dt);if(worldEventCamp.life<=0)worldEventCamp=null;}
      if(worldEventTraveler){worldEventTraveler.life=Math.max(0,(Number(worldEventTraveler.life)||0)-dt);if(worldEventTraveler.life<=0)worldEventTraveler=null;}if(worldEventShrine){worldEventShrine.life=Math.max(0,(Number(worldEventShrine.life)||0)-dt);if(worldEventShrine.life<=0)worldEventShrine=null;}
      if(meteorPoint){
        meteorShowerTimer=Math.max(0,meteorShowerTimer-dt);
        if(meteorShowerTimer<=0)meteorPoint=null;
      }
      eventRollTimer+=Math.min(dt,1);
      if(eventRollTimer<WORLD_EVENT_CHANCES.checkInterval)return;
      eventRollTimer=0;
      const day=Math.max(0,Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));
      const minute=minuteOfDay();
      const nightKey=minute<6*60?day-1:day;
      const roll=Math.random();
      // Probabilities are per 75-second check, not per frame.
      if(isNightTime()){
        if(roll<WORLD_EVENT_CHANCES.meteor){
          if(!meteorPoint&&lastWorldMeteorNight!==nightKey){
            const point=findWorldEventPoint();
            if(point){
              meteorPoint=point;meteorShowerTimer=WORLD_EVENT_CHANCES.meteorLifetime;
              lastWorldMeteorNight=nightKey;
              toast('МЕТЕОРИТНЫЙ ДОЖДЬ! Найди светящийся кратер и нажми E рядом.');
              playSound('portal');saveGame();
            }
          }
          return;
        }
        if(roll<WORLD_EVENT_CHANCES.meteor+WORLD_EVENT_CHANCES.nightHorde&&lastWorldHordeNight!==nightKey){
          const targetCount=Math.min(6,3+Math.max(0,(difficultyConfig().rank||2)-2));
          let spawned=0;
          for(let i=0;i<targetCount;i++){
            if(spawnMonster()){
              const mob=monsters[monsters.length-1];
              if(mob)mob.worldEventHorde=true;
              spawned++;
            }
          }
          if(spawned>0){
            lastWorldHordeNight=nightKey;
            toast('НОЧНАЯ ОРДА! '+spawned+' монстров приближаются. Защити себя и деревню!');
            playSound('portal');saveGame();
          }
        }
        return;
      }
      if(!worldEventCamp&&lastWorldCampDay!==day&&roll<WORLD_EVENT_CHANCES.abandonedCamp){
        const point=findWorldEventPoint();
        if(point){
          worldEventCamp={x:point.x,y:point.y,life:WORLD_EVENT_CHANCES.campLifetime};
          lastWorldCampDay=day;
          toast('РАЗВЕДЧИКИ ПРОШЛИ ЗДЕСЬ! На карте появился заброшенный лагерь. Осмотри его.');
          playSound('tap');saveGame();
        }
        return;
      }
      if(!worldEventTraveler&&day-lastWorldTravelerDay>=2&&roll>=WORLD_EVENT_CHANCES.abandonedCamp&&roll<WORLD_EVENT_CHANCES.abandonedCamp+WORLD_EVENT_CHANCES.traveler){
        const point=findWorldEventPoint(230,430);
        if(point){
          worldEventTraveler={x:point.x,y:point.y,life:WORLD_EVENT_CHANCES.travelerLifetime};
          lastWorldTravelerDay=day;
          toast('ПУТНИК ПОЯВИЛСЯ В ДОЛИНЕ! Найди его, пока он не ушёл.');
          playSound('tap');saveGame();
        }
        return;
      }
      if(!worldEventShrine&&day-lastWorldShrineDay>=2&&roll>=WORLD_EVENT_CHANCES.abandonedCamp+WORLD_EVENT_CHANCES.traveler&&roll<WORLD_EVENT_CHANCES.abandonedCamp+WORLD_EVENT_CHANCES.traveler+.08){
        const point=findWorldEventPoint(180,360);
        if(point){worldEventShrine={x:point.x,y:point.y,life:WORLD_EVENT_CHANCES.shrineLifetime};lastWorldShrineDay=day;toast('ДРЕВНЕЕ СВЯТИЛИЩЕ ПРОСНУЛОСЬ! Найди его и выбери благословение.');playSound('portal');saveGame();}
      }
    }catch(error){
      console.warn('[SkyRealm world event]',error);
      eventRollTimer=0;
    }
  }
  function drawMeteorPoint(camX,camY,time){
    if(!meteorPoint||!Number.isFinite(meteorPoint.x)||!Number.isFinite(meteorPoint.y))return;
    const x=meteorPoint.x-camX,y=meteorPoint.y-camY;if(x<-45||x>width+45||y<-45||y>height+45)return;
    ctx.save();ctx.fillStyle='#1d1725aa';ctx.beginPath();ctx.ellipse(x,y+8,27,14,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ff9b52';ctx.lineWidth=3;ctx.shadowColor='#ff6c43';ctx.shadowBlur=18+Math.sin(time/75)*8;
    ctx.beginPath();ctx.arc(x,y,18+Math.sin(time/110)*2,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ffbd72';ctx.beginPath();ctx.moveTo(x-6,y+4);ctx.lineTo(x-2,y-11);ctx.lineTo(x+5,y-4);ctx.lineTo(x+9,y+6);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff1c0';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('МЕТЕОРИТ · E',x,y-28);ctx.restore();
  }
  function drawWorldEventCamp(camX,camY,time){
    if(!worldEventCamp||!Number.isFinite(worldEventCamp.x)||!Number.isFinite(worldEventCamp.y))return;
    const x=worldEventCamp.x-camX,y=worldEventCamp.y-camY;if(x<-55||x>width+55||y<-65||y>height+55)return;
    const alpha=Math.max(.35,Math.min(1,(Number(worldEventCamp.life)||0)/WORLD_EVENT_CHANCES.campLifetime));
    ctx.save();ctx.globalAlpha=alpha;
    ctx.fillStyle='#111a21aa';ctx.beginPath();ctx.ellipse(x,y+12,29,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#9a6846';ctx.beginPath();ctx.moveTo(x-22,y+8);ctx.lineTo(x-3,y-24);ctx.lineTo(x+18,y+8);ctx.closePath();ctx.fill();
    ctx.fillStyle='#d5a36c';ctx.beginPath();ctx.moveTo(x-8,y+8);ctx.lineTo(x-3,y-12);ctx.lineTo(x+10,y+8);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#ff9b54';ctx.lineWidth=3;ctx.shadowColor='#ff793d';ctx.shadowBlur=12;
    ctx.beginPath();ctx.moveTo(x+22,y+7);ctx.lineTo(x+26,y-2-Math.sin(time/90)*3);ctx.lineTo(x+30,y+7);ctx.stroke();

    // Camp details: stitched seams, guy ropes, bedroll, supply crate and embers.
    ctx.strokeStyle='#513a2c';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x-3,y-23);ctx.lineTo(x-3,y+7);ctx.moveTo(x-20,y+7);ctx.lineTo(x-29,y+13);ctx.moveTo(x+16,y+7);ctx.lineTo(x+28,y+13);ctx.stroke();
    ctx.strokeStyle='#e0b982';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-15,y-1);ctx.lineTo(x-7,y-12);ctx.lineTo(x+2,y+2);ctx.stroke();
    ctx.fillStyle='#5b4030';ctx.fillRect(x-29,y+8,13,8);ctx.fillStyle='#b47b43';ctx.fillRect(x-28,y+9,11,6);ctx.strokeStyle='#e3bc78';ctx.strokeRect(x-28,y+9,11,6);
    ctx.fillStyle='#4d3829';ctx.fillRect(x+13,y+5,13,10);ctx.fillStyle='#b88a52';ctx.fillRect(x+14,y+6,11,3);ctx.fillStyle='#d6bd87';ctx.fillRect(x+18,y+7,3,7);
    for(let i=0;i<5;i++){const ex=x+Math.sin(time/110+i*2)*7,ey=y+11+Math.cos(time/130+i)*2;ctx.fillStyle=i%2?'#ffb64d':'#ff7138';ctx.globalAlpha=.55+.35*Math.sin(time/80+i);ctx.beginPath();ctx.arc(ex,ey,1.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=alpha;
    ctx.fillStyle='#fff0be';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ЗАБРОШЕННЫЙ ЛАГЕРЬ · E',x,y-35);
    ctx.restore();
  }
  function drawWorldEventTraveler(camX,camY,time){
    if(!worldEventTraveler||!Number.isFinite(worldEventTraveler.x)||!Number.isFinite(worldEventTraveler.y))return;
    const x=worldEventTraveler.x-camX,y=worldEventTraveler.y-camY;if(x<-45||x>width+45||y<-65||y>height+55)return;
    const alpha=Math.max(.4,Math.min(1,(Number(worldEventTraveler.life)||0)/WORLD_EVENT_CHANCES.travelerLifetime));
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(Math.round(x),Math.round(y+Math.sin(time/260)*1.5));
    ctx.fillStyle='#121a27aa';ctx.beginPath();ctx.ellipse(0,13,16,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#865a42';ctx.fillRect(-9,-5,18,18);ctx.fillStyle='#c68a5e';ctx.beginPath();ctx.arc(0,-14,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#344b68';ctx.fillRect(-7,0,14,14);ctx.fillStyle='#c99b57';ctx.fillRect(7,-1,7,11);
    ctx.strokeStyle='#d9bd8b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-8,13);ctx.lineTo(-11,20);ctx.moveTo(7,13);ctx.lineTo(10,20);ctx.stroke();

    // Merchant's layered travel cloak, satchel buckles and walking staff.
    ctx.fillStyle='#24364b';ctx.beginPath();ctx.moveTo(-9,-2);ctx.lineTo(-13,12);ctx.lineTo(-7,17);ctx.lineTo(9,17);ctx.lineTo(13,12);ctx.lineTo(8,-2);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#c69b60';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(0,13);ctx.lineTo(7,0);ctx.stroke();
    ctx.fillStyle='#a87948';ctx.fillRect(8,-2,9,12);ctx.fillStyle='#e0c17d';ctx.fillRect(10,1,5,2);ctx.fillRect(11,6,3,2);
    ctx.strokeStyle='#806044';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-13,-17);ctx.lineTo(-16,21);ctx.stroke();ctx.fillStyle='#d2b27c';ctx.beginPath();ctx.arc(-13,-18,2.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e9c58a';ctx.beginPath();ctx.arc(0,-14,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff0be';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ПУТНИК · E',0,-31);
    ctx.restore();
  }
  function collectMeteor(){
    if(!meteorPoint||!Number.isFinite(meteorPoint.x)||!Number.isFinite(meteorPoint.y)||Math.hypot(player.x-meteorPoint.x,player.y-meteorPoint.y)>105)return false;
    const count=1+Math.floor(Math.random()*3);
    changeItem('Метеоритный осколок',count);
    if(Math.random()<.18)changeItem('Мифрил',1);
    if(Math.random()<.34)changeItem('Уран',1);
    spawnVisualBurst(meteorPoint.x,meteorPoint.y,25,'spark','#ff9b52');
    meteorPoint=null;meteorShowerTimer=0;renderInventory();saveGame();
    toast('Метеорит собран! Получено осколков: '+count+'.');return true;
  }
  function collectWorldEventCamp(){
    if(!worldEventCamp||mineMode||caveMode||dungeonMode||inHouse||tradeWorldMode||Math.hypot(player.x-worldEventCamp.x,player.y-worldEventCamp.y)>112)return false;
    const camp=worldEventCamp;worldEventCamp=null;
    const wood=2+Math.floor(Math.random()*4);changeItem('Древесина',wood);
    const extras=[];
    if(Math.random()<.30){changeItem('Малое зелье',1);extras.push('малое зелье');}
    if(Math.random()<.22){changeItem('Железо',1);extras.push('железо');}
    if(Math.random()<.06){changeItem('Кристалл',1);extras.push('кристалл');}
    spawnVisualBurst(camp.x,camp.y,18,'spark','#d9a86b');
    renderInventory();awardXP(45,'найден заброшенный лагерь');saveGame();
    toast('В лагере найдено: древесина ×'+wood+(extras.length?' и '+extras.join(', '):'')+'.');
    return true;
  }
  function collectWorldEventTraveler(){
    if(!worldEventTraveler||mineMode||caveMode||dungeonMode||inHouse||tradeWorldMode||Math.hypot(player.x-worldEventTraveler.x,player.y-worldEventTraveler.y)>112)return false;
    const traveler=worldEventTraveler;worldEventTraveler=null;
    const roll=Math.random(),reward=roll<.42?'Лечебная трава':roll<.72?'Малое зелье':roll<.94?'Железо':'Кристалл';
    changeItem(reward,1);spawnVisualBurst(traveler.x,traveler.y,14,'spark','#e6cb96');
    renderInventory();awardXP(25,'встреча с путником');saveGame();
    toast('Путник поблагодарил тебя и подарил: '+reward+'.');return true;
  }
  function drawWorldEventShrine(camX,camY,time){
    if(!worldEventShrine||!Number.isFinite(worldEventShrine.x)||!Number.isFinite(worldEventShrine.y))return;
    const x=worldEventShrine.x-camX,y=worldEventShrine.y-camY;if(x<-60||x>width+60||y<-70||y>height+60)return;
    const pulse=.5+.5*Math.sin(time/240),alpha=Math.max(.35,Math.min(1,(Number(worldEventShrine.life)||0)/WORLD_EVENT_CHANCES.shrineLifetime));
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='rgba(9,18,28,.55)';ctx.beginPath();ctx.ellipse(x,y+16,31,10,0,0,Math.PI*2);ctx.fill();
    ctx.shadowColor='#82e9ff';ctx.shadowBlur=12+pulse*14;ctx.fillStyle='#304b5a';ctx.beginPath();ctx.moveTo(x-22,y+12);ctx.lineTo(x-17,y-17);ctx.lineTo(x,y-30);ctx.lineTo(x+18,y-17);ctx.lineTo(x+23,y+12);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle='#9cecff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#d8fbff';ctx.globalAlpha=alpha*(.55+pulse*.45);ctx.beginPath();ctx.arc(x,y-7,5+pulse*2,0,Math.PI*2);ctx.fill();
    for(let i=0;i<3;i++){const a=time/900+i*Math.PI*2/3,px=x+Math.cos(a)*31,py=y-8+Math.sin(a)*13;ctx.fillStyle=['#9cecff','#ffe29a','#c8a5ff'][i];ctx.globalAlpha=alpha*(.45+.4*pulse);ctx.beginPath();ctx.arc(px,py,2.5,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=alpha;ctx.fillStyle='#fff4c9';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('СВЯТИЛИЩЕ · E',x,y-43);ctx.restore();
  }
  function collectWorldEventShrine(){
    if(!worldEventShrine||bossRealmMode||mineMode||caveMode||dungeonMode||inHouse||tradeWorldMode||Math.hypot(player.x-worldEventShrine.x,player.y-worldEventShrine.y)>112)return false;
    const shrine=worldEventShrine;worldEventShrine=null;const blessing=Math.floor(Math.random()*3);let message='';
    if(blessing===0){const healed=Math.min(55,100-player.hp);player.hp=Math.min(100,player.hp+55);hunger=Math.min(100,hunger+20);updateVitals();message='БЛАГОСЛОВЕНИЕ ЖИЗНИ · восстановлено '+Math.max(0,healed)+' HP и 20 сытости';}
    else if(blessing===1){changeItem('Кристалл',3);changeItem('Малое зелье',1);message='БЛАГОСЛОВЕНИЕ ИЗОБИЛИЯ · кристаллы ×3 и малое зелье';}
    else{player.stamina=Math.min(100,player.stamina+60);combatEnergy=Math.min(100,combatEnergy+50);changeItem('Метеоритный осколок',1);updateVitals();message='БЛАГОСЛОВЕНИЕ СИЛЫ · восстановлена выносливость и получен метеоритный осколок';}
    spawnVisualBurst(shrine.x,shrine.y,34,'spark','#9cecff');renderInventory();awardXP(80,'древнее святилище');saveGame();toast(message);return true;
  }


  function drawRemotePlayers(camX,camY){
    const network=window.SkyRealmCoopClient;
    if(!network||typeof network.getRemotePlayers!=='function'||inMainMenu||paused)return;
    const localMode=coopLocalWorldMode();
    const remote=network.getRemotePlayers();
    for(const other of remote){
      if(other.difficulty!==currentDifficulty||other.world_mode!==localMode)continue;
      const worldX=mineMode?other.x*width:other.x,worldY=mineMode?other.y*height:other.y;
      const x=worldX-camX,y=worldY-camY;
      if(x<-40||x>width+40||y<-55||y>height+55)continue;
      const look=other.appearance||{};
      ctx.save();ctx.translate(Math.round(x),Math.round(y));
      ctx.fillStyle='rgba(5,12,20,.32)';ctx.beginPath();ctx.ellipse(0,13,13,7,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=look.armor||'#526fba';ctx.fillRect(-9,-3,18,15);
      ctx.fillStyle=look.accent||'#9cb9ff';ctx.fillRect(-7,-2,14,13);
      ctx.fillStyle='#c5d6ef';ctx.fillRect(-2,-1,4,12);
      ctx.fillStyle='#3b2837';ctx.fillRect(-7,7,5,8);ctx.fillRect(2,7,5,8);
      ctx.fillStyle=look.skin||'#e8b88c';ctx.fillRect(-6,-17,12,13);
      ctx.fillStyle=look.hair||'#352d3d';ctx.fillRect(-7,-20,14,5);ctx.fillRect(-9,-16,4,7);ctx.fillRect(5,-16,4,7);
      ctx.fillStyle='#eef5ff';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';
      ctx.fillText((other.name||('Игрок '+other.user_id.slice(0,5))).slice(0,20),0,-27);
      ctx.strokeStyle='#a8ceff';ctx.lineWidth=2;ctx.beginPath();
      const facing=other.face||'down';
      if(facing==='up'){ctx.moveTo(0,-10);ctx.lineTo(0,-17);}
      else if(facing==='down'){ctx.moveTo(0,10);ctx.lineTo(0,17);}
      else if(facing==='left'){ctx.moveTo(-8,0);ctx.lineTo(-15,0);}
      else{ctx.moveTo(8,0);ctx.lineTo(15,0);}
      ctx.stroke();ctx.restore();
    }
  }
  function drawFishingCast(camX,camY,time){
    if(fishingCastTimer<=0||!fishingOrigin||tradeWorldMode||mineMode||caveMode||dungeonMode||inHouse)return;
    const lakeX=52*TILE, lakeY=36*TILE, dx=lakeX-player.x, dy=lakeY-player.y, distance=Math.hypot(dx,dy)||1;
    const ux=dx/distance, uy=dy/distance, px=player.x-camX, py=player.y-camY;
    const handX=px+ux*9, handY=py-5+uy*8, tipX=px+ux*24, tipY=py-12+uy*22;
    const bobberDistance=Math.max(34,Math.min(96,distance*.48));
    const bobX=px+ux*bobberDistance, bobY=py+uy*bobberDistance+Math.sin(time/170)*2;
    ctx.save();
    ctx.lineCap='round';
    ctx.strokeStyle='#a97845';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(handX,handY);ctx.lineTo(tipX,tipY);ctx.stroke();
    ctx.strokeStyle='rgba(232,244,255,.88)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(bobX,bobY);ctx.stroke();
    ctx.strokeStyle='rgba(139,225,246,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(bobX,bobY+5,7+Math.sin(time/210)*2,2.5,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ff6f70';ctx.shadowColor='#9ce8ff';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(bobX,bobY,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(bobX-1,bobY-1,1.2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function drawBossRealmPortal(camX,camY,time){
    if(!bossRealmPortalUnlocked()||tradeWorldMode)return;const p=bossRealmPortalPosition(),x=p.x-camX,y=p.y-camY;if(x<-100||x>width+100||y<-110||y>height+110)return;
    const pulse=.5+.5*Math.sin(time/420);ctx.save();ctx.translate(x,y);ctx.fillStyle='rgba(4,8,24,.52)';ctx.beginPath();ctx.ellipse(0,18,43,17,0,0,Math.PI*2);ctx.fill();ctx.shadowColor=bossRealmMode?'#6be9ff':'#9a68ff';ctx.shadowBlur=22+pulse*12;ctx.strokeStyle=bossRealmMode?'#8cecff':'#b48cff';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,-7,27,39,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#10152b';ctx.beginPath();ctx.ellipse(0,-7,21,33,0,0,Math.PI*2);ctx.fill();const grad=ctx.createLinearGradient(-17,-35,18,25);grad.addColorStop(0,'rgba(104,118,255,.35)');grad.addColorStop(.5,'rgba(80,218,232,.55)');grad.addColorStop(1,'rgba(142,85,225,.28)');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(0,-7,18,29,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0c5';ctx.font='900 11px Segoe UI';ctx.textAlign='center';ctx.fillText(bossRealmMode?'ВОЗВРАТ':'МИР БОССОВ',0,-58);ctx.font='bold 10px Segoe UI';ctx.fillStyle='#e5eaff';ctx.fillText('E · '+(bossRealmMode?'ВЫЙТИ':'ВОЙТИ'),0,51);ctx.restore();
  }
  function drawBossRealmGroundTile(target,tx,ty,time,left,top){
    const x=(tx-left)*TILE,y=(ty-top)*TILE,seed=tx*71+ty*19,r=hash(seed,113),edge=2+hash(seed,317)*3;
    const slabs=['#292832','#302d35','#25252f','#37303a','#292b34','#322b34'];
    const tone=slabs[Math.min(slabs.length-1,Math.floor(r*slabs.length))],bx=edge,by=edge*.7,w=TILE-edge*1.3,h=TILE-edge*1.2;
    target.fillStyle='#11121a';target.fillRect(x,y,TILE,TILE);
    target.fillStyle=tone;target.beginPath();
    target.moveTo(x+bx,y+by+hash(seed,411)*3);
    target.lineTo(x+w+bx*.25,y+by+hash(seed,412)*2);
    target.lineTo(x+w+bx,y+h+by*.15);
    target.lineTo(x+bx*.45,y+h+by);
    target.closePath();target.fill();
    target.strokeStyle='rgba(111,106,123,.22)';target.lineWidth=1;target.stroke();
    target.strokeStyle='rgba(6,8,14,.62)';target.lineWidth=2;
    target.beginPath();target.moveTo(x+bx+3,y+by+5);target.lineTo(x+TILE-bx-4,y+by+5);target.stroke();
    const crack=hash(seed,521);
    if(crack>.37){
      const cx=x+8+hash(seed,522)*(TILE-16),cy=y+7+hash(seed,523)*(TILE-14);
      target.strokeStyle='rgba(8,7,14,.86)';target.lineWidth=2.3;target.beginPath();
      target.moveTo(cx,cy);target.lineTo(cx-4,cy+7);target.lineTo(cx+3,cy+13);target.lineTo(cx-2,cy+20);target.stroke();
      target.strokeStyle=crack>.91?'rgba(206,85,104,.72)':'rgba(120,102,130,.46)';target.lineWidth=1;
      target.beginPath();target.moveTo(cx,cy+1);target.lineTo(cx-3,cy+7);target.lineTo(cx+3,cy+13);target.stroke();
      if(crack>.91){target.shadowColor='#d94b65';target.shadowBlur=8;target.strokeStyle='rgba(255,103,119,.55)';target.beginPath();target.moveTo(cx+3,cy+13);target.lineTo(cx+9,cy+17);target.lineTo(cx+7,cy+24);target.stroke();target.shadowBlur=0;}
    }
    const rubble=hash(seed,631);
    if(rubble>.68){
      target.fillStyle=rubble>.9?'#65606a':'#4b4852';target.beginPath();
      target.moveTo(x+6+hash(seed,632)*16,y+TILE-5);target.lineTo(x+10+hash(seed,633)*18,y+TILE-13-hash(seed,634)*5);target.lineTo(x+18+hash(seed,635)*12,y+TILE-6);target.closePath();target.fill();
      target.strokeStyle='rgba(8,8,13,.65)';target.lineWidth=1;target.stroke();
    }
    if(r>.935){
      const sx=x+5+hash(seed,701)*(TILE-10),sy=y+5+hash(seed,702)*(TILE-10);
      target.fillStyle='rgba(0,0,0,.35)';target.beginPath();target.ellipse(sx,sy,8,4,.3,0,Math.PI*2);target.fill();
      target.fillStyle=r>.985?'#a84d5f':'#675060';target.beginPath();target.moveTo(sx-5,sy+2);target.lineTo(sx-2,sy-5);target.lineTo(sx+1,sy-2);target.lineTo(sx+5,sy-7);target.lineTo(sx+6,sy+3);target.closePath();target.fill();
      if(r>.985){target.fillStyle='rgba(246,91,111,.5)';target.fillRect(sx-1,sy-2,2,4);}
    }
    if(r>.78){target.fillStyle='rgba(183,162,171,.18)';target.fillRect(x+4+hash(seed,733)*21,y+5+hash(seed,734)*19,1.5,1.5);}
  }
  function drawBossRealmGround(camX,camY,time){
    const ground=ctx.createLinearGradient(0,0,width,height);
    ground.addColorStop(0,'#11131d');ground.addColorStop(.48,'#1b1722');ground.addColorStop(1,'#100f19');
    ctx.fillStyle=ground;ctx.fillRect(0,0,width,height);
    const left=Math.max(0,Math.floor(camX/TILE)-1),top=Math.max(0,Math.floor(camY/TILE)-1);
    const right=Math.min(COLS,Math.ceil((camX+width)/TILE)+1),bottom=Math.min(ROWS,Math.ceil((camY+height)/TILE)+1);
    const theme=bossRealmArenaTheme(),etchColor=theme==='glacier'?'#8deaff':theme==='infernal'?'#ff8750':theme==='blood'?'#d96a91':'#a99aff';
    const cacheDpr=Math.max(1,Number(dpr)||1),quality=gameSettings.graphicsQuality;
    const chunkTiles=cacheDpr>=2.5?4:cacheDpr>=1.5?6:8,chunkPixels=chunkTiles*TILE;
    if(!bossRealmGroundCache||bossRealmGroundCache.dpr!==cacheDpr||bossRealmGroundCache.theme!==theme||
       bossRealmGroundCache.quality!==quality||bossRealmGroundCache.worldCols!==COLS||bossRealmGroundCache.worldRows!==ROWS||
       bossRealmGroundCache.chunkTiles!==chunkTiles){
      bossRealmGroundCache={chunks:new Map(),dpr:cacheDpr,theme,quality,worldCols:COLS,worldRows:ROWS,chunkTiles};
    }
    const cache=bossRealmGroundCache;
    const firstChunkX=Math.floor(left/chunkTiles),lastChunkX=Math.floor(Math.max(left,right-1)/chunkTiles);
    const firstChunkY=Math.floor(top/chunkTiles),lastChunkY=Math.floor(Math.max(top,bottom-1)/chunkTiles);
    const visibleChunks=(lastChunkX-firstChunkX+1)*(lastChunkY-firstChunkY+1);
    const maxChunks=Math.max(visibleChunks+8,Math.min(128,Math.floor((96*1024*1024)/(chunkPixels*chunkPixels*4*cacheDpr*cacheDpr))));
    let buildBudget=4;
    for(let cy=firstChunkY;cy<=lastChunkY;cy++)for(let cx=firstChunkX;cx<=lastChunkX;cx++){
      const key=cx+':'+cy,chunkLeft=cx*chunkTiles,chunkTop=cy*chunkTiles;
      let chunk=cache.chunks.get(key);
      if(chunk){
        cache.chunks.delete(key);cache.chunks.set(key,chunk);
      }else if(buildBudget>0&&chunkLeft<COLS&&chunkTop<ROWS){
        const tileCols=Math.min(chunkTiles,COLS-chunkLeft),tileRows=Math.min(chunkTiles,ROWS-chunkTop);
        const chunkCanvas=document.createElement('canvas'),logicalWidth=tileCols*TILE,logicalHeight=tileRows*TILE;
        chunkCanvas.width=Math.max(1,Math.ceil(logicalWidth*cacheDpr));chunkCanvas.height=Math.max(1,Math.ceil(logicalHeight*cacheDpr));
        const chunkContext=chunkCanvas.getContext('2d');chunkContext.setTransform(cacheDpr,0,0,cacheDpr,0,0);
        for(let ty=chunkTop;ty<chunkTop+tileRows;ty++)for(let tx=chunkLeft;tx<chunkLeft+tileCols;tx++)drawBossRealmGroundTile(chunkContext,tx,ty,time,chunkLeft,chunkTop);
        chunk={canvas:chunkCanvas,width:logicalWidth,height:logicalHeight,left:chunkLeft,top:chunkTop};
        cache.chunks.set(key,chunk);buildBudget--;
        while(cache.chunks.size>maxChunks)cache.chunks.delete(cache.chunks.keys().next().value);
      }
      if(chunk){
        ctx.drawImage(chunk.canvas,chunk.left*TILE-camX,chunk.top*TILE-camY,chunk.width,chunk.height);
      }else{
        // Until a chunk is cached, draw its visible tiles normally; this spreads cache warm-up across frames.
        const drawLeft=Math.max(left,chunkLeft),drawTop=Math.max(top,chunkTop);
        const drawRight=Math.min(right,chunkLeft+chunkTiles),drawBottom=Math.min(bottom,chunkTop+chunkTiles);
        ctx.save();ctx.translate(chunkLeft*TILE-camX,chunkTop*TILE-camY);
        for(let ty=drawTop;ty<drawBottom;ty++)for(let tx=drawLeft;tx<drawRight;tx++)drawBossRealmGroundTile(ctx,tx,ty,time,chunkLeft,chunkTop);
        ctx.restore();
      }
    }
    // Keep the fine engraved runes animated even while the underlying stone chunks stay cached.
    if(quality!=='low'){
      for(let ty=top;ty<bottom;ty++)for(let tx=left;tx<right;tx++){
        const seed=tx*71+ty*19;if(hash(seed,811)<=.84)continue;
        const x=tx*TILE-camX+7+hash(seed,812)*(TILE-14),y=ty*TILE-camY+7+hash(seed,813)*(TILE-14);
        ctx.save();ctx.globalAlpha=.12+.08*(.5+.5*Math.sin(time/530+seed));ctx.strokeStyle=etchColor;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x-4,y-3);ctx.lineTo(x+1,y-1);ctx.lineTo(x+4,y+3);ctx.moveTo(x-2,y+4);ctx.lineTo(x+2,y+1);ctx.stroke();ctx.restore();
      }
    }
    // Atmospheric haze and fog remain live; the detailed stone artwork is reused from cached chunks.
    ctx.save();
    const haze=ctx.createRadialGradient(width*.48,height*.43,Math.min(width,height)*.08,width*.48,height*.43,Math.max(width,height)*.82);
    haze.addColorStop(0,'rgba(126,65,86,.10)');haze.addColorStop(.48,'rgba(80,57,79,.07)');haze.addColorStop(1,'rgba(5,7,13,.5)');
    ctx.fillStyle=haze;ctx.fillRect(0,0,width,height);
    const fog=ctx.createLinearGradient(0,height*.52,0,height);
    fog.addColorStop(0,'rgba(96,73,91,0)');fog.addColorStop(1,'rgba(9,10,17,.22)');
    ctx.fillStyle=fog;ctx.fillRect(0,height*.5,width,height*.5);
    ctx.restore();
  }
  function drawBossRealmCreatureMuseums(camX,camY,time){
    if(!bossRealmMode)return;
    const themes={shadow_hunter:['#302044','#ad72e8','#e56cae'],stone_guardian:['#414b58','#a9b7c7','#f3c878'],cursed_skull:['#4a4054','#c8b8d8','#b98cff'],rift_wolf:['#402333','#bd5974','#ff8292'],venom_beetle:['#243d2d','#79b77b','#d8ff76'],fallen_warrior:['#3d3c3a','#b5a78e','#f4d6a0'],rift_archer:['#263e50','#75b8d5','#a8f4ff'],ash_spirit:['#4c2d25','#c46b45','#ffd08a'],abyss_general:['#34233e','#9a6bc2','#ff9bea'],blood_berserker:['#49212d','#bd4964','#ff9aaf'],rift_warden:['#203c48','#5bb1c5','#9ef5ff'],soul_devourer:['#29243f','#8d78bd','#d5b6ff'],magma_behemoth:['#40231f','#d76b42','#ffb16d'],frost_empress:['#29485b','#8ed8ee','#d7fbff'],void_mirror:['#282039','#9876c9','#f0c2ff'],abyss_king:['#302044','#8c65c5','#ff7caf'],rift_dragon:['#432820','#c66b4c','#ffe18a'],ancient_devourer:['#2b3a27','#789d56','#d1f58b'],end_knight:['#303744','#8c9aaa','#f5f2ff'],astral_god:['#30265c','#9b83ef','#ffe18a'],chronos_god:['#203b4c','#70b9d4','#c3f7ff'],worldbreaker_colossus:['#343b46','#aab5c5','#ffd36d']};
    for(const m of monsters){
      if(!m?.bossRealmCreature||m.hp<=0)continue;
      const x=m.x-camX,y=m.y-camY,d=BOSS_REALM_CREATURES[m.realmType],tier=d?.tier||'mob';
      if(x<-210||x>width+210||y<-190||y>height+190)continue;
      const [stone,trim,glow]=themes[m.realmType]||themes.shadow_hunter;
      const radius=tier==='god'?112:tier==='boss'?88:tier==='elite'?64:43;
      const pulse=.5+.5*Math.sin(time/360+(m.phase||0)),damage=1-Math.max(0,Math.min(1,Number(m.hp)/Math.max(1,Number(m.maxHp)||1)));
      ctx.save();ctx.translate(x,y);
      const scorch=ctx.createRadialGradient(0,8,5,0,8,radius*1.42);
      scorch.addColorStop(0,'rgba(8,7,13,.48)');scorch.addColorStop(.62,'rgba(16,12,22,.35)');scorch.addColorStop(1,'rgba(13,10,19,0)');
      ctx.fillStyle=scorch;ctx.beginPath();ctx.ellipse(0,8,radius*1.42,radius*.72,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=stone;ctx.globalAlpha=.38;ctx.lineWidth=tier==='boss'||tier==='god'?3:1.7;ctx.setLineDash([12,9,3,11]);
      ctx.beginPath();ctx.ellipse(0,8,radius,radius*.48,Math.sin(m.phase||0)*.08,.08,Math.PI*1.94);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=.55+.18*pulse;ctx.strokeStyle=glow;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(0,8,radius*.68,radius*.31,-.08,Math.PI*.08,Math.PI*1.12);ctx.stroke();
      for(let k=0;k<7;k++){
        const a=k*Math.PI*2/7+(m.phase||0)*.13,inner=radius*.42,outer=radius*(.72+(k%3)*.09),sx=Math.cos(a)*inner,sy=8+Math.sin(a)*inner*.5,ex=Math.cos(a)*outer,ey=8+Math.sin(a)*outer*.5;
        ctx.strokeStyle='rgba(6,5,12,.95)';ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo((sx+ex)*.5+Math.sin(k*9)*4,(sy+ey)*.5+Math.cos(k*5)*4);ctx.lineTo(ex,ey);ctx.stroke();
        if(k%2===0){ctx.fillStyle=stone;ctx.beginPath();ctx.moveTo(ex-5,ey+3);ctx.lineTo(ex-2,ey-8);ctx.lineTo(ex+4,ey-2);ctx.lineTo(ex+8,ey+5);ctx.closePath();ctx.fill();}
      }
      for(let k=0;k<4;k++){
        const a=k*Math.PI/2+(m.phase||0),sx=Math.cos(a)*radius*.82,sy=8+Math.sin(a)*radius*.37;
        ctx.save();ctx.translate(sx,sy);ctx.rotate(a+.5);
        ctx.fillStyle='#191821';ctx.beginPath();ctx.moveTo(-10,4);ctx.lineTo(-5,-7);ctx.lineTo(2,-12);ctx.lineTo(11,-1);ctx.lineTo(7,7);ctx.closePath();ctx.fill();
        ctx.fillStyle=stone;ctx.globalAlpha=.72;ctx.fillRect(-4,-3,10,5);ctx.globalAlpha=1;ctx.restore();
      }
      if(damage>.12){
        for(let n=0;n<Math.min(8,Math.ceil(damage*8));n++){
          const a=n*2.399+(m.phase||0),rr=radius*(.35+(n%3)*.16),sx=Math.cos(a)*rr,sy=8+Math.sin(a)*rr*.46;
          ctx.strokeStyle='rgba(5,4,10,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+7,sy+6);ctx.lineTo(sx+4,sy+13);ctx.stroke();
        }
      }
      if(tier==='boss'||tier==='god'){
        ctx.globalAlpha=.25+.23*pulse;ctx.strokeStyle=glow;ctx.shadowColor=glow;ctx.shadowBlur=12;ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,8,radius*.56,time/1100,time/1100+Math.PI*.7);ctx.stroke();ctx.shadowBlur=0;
      }
      ctx.restore();
    }
  }

  function drawBossRealmWreckage(camX,camY,time){
    const worldW=COLS*TILE,worldH=ROWS*TILE;
    for(let i=0;i<148;i++){
      const wx=hash(i+741,1701)*worldW,wy=hash(i+741,1911)*worldH,x=wx-camX,y=wy-camY;
      const size=.62+hash(i+17,1331)*.82,kind=i%6;
      if(x<-115||x>width+115||y<-110||y>height+110)continue;
      const pulse=.5+.5*Math.sin(time/550+i*1.7),stone=i%3===0?'#49434d':i%3===1?'#353541':'#5a5057';
      ctx.save();ctx.translate(x,y);ctx.rotate((hash(i+9,333)-.5)*.7);ctx.scale(size,size);
      ctx.fillStyle='rgba(0,0,0,.34)';ctx.beginPath();ctx.ellipse(0,8,38,12,0,0,Math.PI*2);ctx.fill();
      if(kind===0){
        // Fallen, fractured columns with broken stone rings.
        ctx.rotate(-.35+hash(i,55)*.7);ctx.fillStyle='#25242d';ctx.fillRect(-43,-7,86,18);
        ctx.fillStyle=stone;ctx.beginPath();ctx.moveTo(-42,-7);ctx.lineTo(27,-11);ctx.lineTo(42,-5);ctx.lineTo(37,8);ctx.lineTo(-36,10);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#79717c';ctx.lineWidth=3;for(let k=0;k<4;k++){const px=-28+k*18;ctx.beginPath();ctx.moveTo(px,-8);ctx.lineTo(px+2,8);ctx.stroke();}
        ctx.fillStyle='#1c1c25';ctx.beginPath();ctx.moveTo(38,-6);ctx.lineTo(52,-11);ctx.lineTo(48,7);ctx.lineTo(35,9);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#a36c7a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(36,-3);ctx.lineTo(44,1);ctx.lineTo(40,7);ctx.stroke();
      }else if(kind===1){
        // Dead, wind-torn trees; asymmetrical branches keep the silhouette natural.
        ctx.strokeStyle='#211b22';ctx.lineCap='round';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(-4,-18);ctx.lineTo(-1,-39);ctx.lineTo(-12,-55);ctx.stroke();
        ctx.strokeStyle='#514047';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-3,-17);ctx.lineTo(-24,-31);ctx.lineTo(-33,-48);ctx.moveTo(-4,-26);ctx.lineTo(16,-38);ctx.lineTo(24,-54);ctx.moveTo(-10,-37);ctx.lineTo(-20,-43);ctx.moveTo(12,-35);ctx.lineTo(31,-37);ctx.stroke();
        ctx.strokeStyle='#90606a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-2,-19);ctx.lineTo(-5,-37);ctx.lineTo(-12,-54);ctx.moveTo(-4,-26);ctx.lineTo(14,-38);ctx.stroke();
        ctx.fillStyle='#1b1720';ctx.beginPath();ctx.ellipse(0,13,23,6,0,0,Math.PI*2);ctx.fill();
      }else if(kind===2){
        // Collapsed gate: broken side piers and a fractured overhead arch.
        ctx.fillStyle='#25242c';ctx.fillRect(-34,-28,13,48);ctx.fillRect(22,-17,13,38);
        ctx.fillStyle=stone;ctx.fillRect(-31,-32,8,48);ctx.fillRect(25,-21,8,40);
        ctx.fillStyle='#746b75';ctx.fillRect(-36,-34,17,6);ctx.fillRect(20,-23,17,6);
        ctx.strokeStyle='#504653';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-26,-29);ctx.quadraticCurveTo(-17,-65,3,-63);ctx.quadraticCurveTo(21,-64,28,-40);ctx.stroke();
        ctx.strokeStyle='#1b1822';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(4,-63);ctx.lineTo(11,-49);ctx.lineTo(4,-42);ctx.stroke();
        ctx.fillStyle='#17151d';ctx.fillRect(-8,-4,16,25);
        ctx.strokeStyle='#d15c70';ctx.globalAlpha=.42+.25*pulse;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-2,1);ctx.lineTo(3,10);ctx.lineTo(-1,18);ctx.stroke();
      }else if(kind===3){
        // Broken statue and fallen head.
        ctx.fillStyle='#26232d';ctx.fillRect(-15,-29,30,45);ctx.fillStyle=stone;ctx.fillRect(-12,-26,24,39);
        ctx.fillStyle='#48414a';ctx.beginPath();ctx.moveTo(-17,-27);ctx.lineTo(-10,-44);ctx.lineTo(3,-48);ctx.lineTo(17,-39);ctx.lineTo(13,-23);ctx.closePath();ctx.fill();
        ctx.fillStyle='#17151e';ctx.fillRect(-9,-34,6,3);ctx.fillRect(4,-34,6,3);
        ctx.strokeStyle='#b55d70';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-2,-22);ctx.lineTo(2,-14);ctx.stroke();
        ctx.fillStyle='#5b535d';ctx.beginPath();ctx.arc(28,12,9,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#17151d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(22,8);ctx.lineTo(32,15);ctx.stroke();
      }else if(kind===4){
        // Scattered barricade, splintered spears and broken shield.
        ctx.fillStyle='#25202a';ctx.fillRect(-34,-4,67,9);ctx.fillStyle='#63535b';ctx.fillRect(-33,-8,64,5);
        for(let k=0;k<4;k++){ctx.save();ctx.translate(-24+k*16,-4);ctx.rotate(-.5+k*.31);ctx.fillStyle='#3e3034';ctx.fillRect(-2,-29,4,30);ctx.fillStyle='#9b7d76';ctx.beginPath();ctx.moveTo(-4,-28);ctx.lineTo(0,-39);ctx.lineTo(4,-28);ctx.closePath();ctx.fill();ctx.restore();}
        ctx.strokeStyle='#a66b78';ctx.lineWidth=2;ctx.beginPath();ctx.arc(25,5,13,-.6,2.9);ctx.stroke();
      }else{
        // Small rubble field and a few dimly glowing mineral splinters.
        for(let k=0;k<7;k++){const rx=(hash(i*9+k,21)-.5)*55,ry=(hash(i*9+k,22)-.5)*24;
          ctx.fillStyle=k%2?'#4c4652':'#302b36';ctx.beginPath();ctx.moveTo(rx-7,ry+4);ctx.lineTo(rx-2,ry-6-hash(i+k,23)*5);ctx.lineTo(rx+7,ry-2);ctx.lineTo(rx+8,ry+5);ctx.closePath();ctx.fill();}
        if(i%4===0){ctx.globalAlpha=.35+.35*pulse;ctx.shadowColor='#b85c78';ctx.shadowBlur=10;ctx.fillStyle='#aa6579';ctx.beginPath();ctx.moveTo(-7,1);ctx.lineTo(-2,-16);ctx.lineTo(2,-5);ctx.lineTo(7,-19);ctx.lineTo(8,2);ctx.closePath();ctx.fill();ctx.shadowBlur=0;}
      }
      ctx.restore();
    }
    // Slow ash motes add depth without turning the scene into a particle storm.
    ctx.save();for(let i=0;i<35;i++){const px=(hash(i+87,177)*width+time*(.006+(i%5)*.002))%(width+8)-4,py=(hash(i+87,277)*height+Math.sin(time/1600+i)*7)%(height+8)-4;ctx.globalAlpha=.12+.2*(i%4)/4;ctx.fillStyle=i%6===0?'#ef9b9a':'#d7cbd4';ctx.fillRect(px,py,1.5,1.5);}ctx.restore();
  }
  function drawBossRealmEnvironment(camX,camY,time){
    drawBossRealmWreckage(camX,camY,time);
    // Visible ancient structures replace the legacy valley-house collision remnants in Boss Realm.
    if(bossRealmMode){
      const sites=ensureBossRealmDungeonSites();
      for(const site of sites){
        const sx=site.x-camX,sy=site.y-camY;
        if(sx<-240||sx>width+240||sy<-220||sy>height+220)continue;
        const theme=site.theme;
        const stone=theme==='glacier'?'#8fd5e8':theme==='infernal'?'#80505a':theme==='blood'?'#79536f':'#7062a9';
        const light=theme==='glacier'?'#c7f7ff':theme==='infernal'?'#ff9a55':theme==='blood'?'#e77a9e':'#bca8ff';
        const dark=theme==='glacier'?'#294c67':theme==='infernal'?'#261b2b':theme==='blood'?'#2b1b36':'#211a43';
        ctx.save();ctx.translate(sx,sy);
        ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,34,112,34,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=stone;ctx.globalAlpha=.75;ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(0,12,94,29,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
        ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(0,10,82,24,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=light;ctx.globalAlpha=.55;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,10,70,18,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
        for(let i=0;i<6;i++){
          const a=i*Math.PI/3,px=Math.cos(a)*92,py=Math.sin(a)*27;
          ctx.save();ctx.translate(px,py);
          ctx.fillStyle=dark;ctx.fillRect(-10,-5,20,42);
          ctx.fillStyle=stone;ctx.fillRect(-13,-12,26,10);ctx.fillRect(-8,-2,16,30);
          ctx.fillStyle=light;ctx.globalAlpha=.72;ctx.fillRect(-3,-7,3,29);ctx.globalAlpha=1;
          ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(-15,-12);ctx.lineTo(0,-25);ctx.lineTo(15,-12);ctx.closePath();ctx.fill();
          ctx.strokeStyle=light;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-8,7);ctx.lineTo(0,0);ctx.lineTo(8,7);ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle=stone;ctx.fillRect(-34,-8,68,12);ctx.fillStyle=dark;ctx.fillRect(-27,-18,54,10);
        ctx.fillStyle=light;ctx.globalAlpha=.8;ctx.shadowColor=light;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(0,-30+Math.sin(time/260)*2,7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
        ctx.strokeStyle=light;ctx.globalAlpha=.65;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-30,17+Math.sin(time/210)*2,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
        for(let i=0;i<4;i++){const a=time/500+i*Math.PI/2;ctx.fillStyle=light;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(Math.cos(a)*42,-22+Math.sin(a)*8,2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
        ctx.restore();
      }
    }
    if(bossRealmState.eventId==='blood_moon'||bossRealmState.eventId==='storm'){
      ctx.save();ctx.globalAlpha=.12+.05*Math.sin(time/180);ctx.fillStyle=bossRealmState.eventId==='blood_moon'?'#b92f55':'#477bb2';ctx.fillRect(0,0,width,height);ctx.restore();
    }
    if(bossRealmState.eventId==='meteor'){
      for(let i=0;i<7;i++){const x=hash(i+Math.floor(time/90),127)*width,y=hash(i+Math.floor(time/90),239)*height;ctx.strokeStyle='#ffb36b';ctx.lineWidth=2;ctx.globalAlpha=.65;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-18,y+25);ctx.stroke();}ctx.globalAlpha=1;
    }
    if(bossRealmHazard){const hx=bossRealmHazard.x-camX,hy=bossRealmHazard.y-camY;if(hx>-90&&hx<width+90&&hy>-90&&hy<height+90){const pulse=.5+.5*Math.sin(time/75);ctx.save();ctx.globalAlpha=.65+.25*pulse;ctx.strokeStyle=bossRealmHazard.kind==='storm'?'#8ce8ff':'#ff9b55';ctx.fillStyle=bossRealmHazard.kind==='storm'?'rgba(65,180,255,.13)':'rgba(255,105,55,.13)';ctx.lineWidth=3;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(hx,hy,34+pulse*5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(hx,hy,44+Math.sin(time/55)*3,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.textAlign='center';ctx.font='900 10px Segoe UI';ctx.fillStyle='#fff';ctx.fillText('УДАР '+bossRealmHazard.timer.toFixed(1)+'с',hx,hy-52);ctx.restore();}}
    if(['eclipse','time_rift'].includes(bossRealmState.eventId)){ctx.save();ctx.globalAlpha=.16+.07*Math.sin(time/220);ctx.fillStyle=bossRealmState.eventId==='eclipse'?'#190b34':'#073b55';ctx.fillRect(0,0,width,height);ctx.restore();}
    if(bossRealmState.eventId==='blizzard'){ctx.save();for(let i=0;i<42;i++){const sx=(i*79+time*(.03+(i%5)*.006))%(width+20)-10,sy=(i*43+time*(.07+(i%4)*.01))%(height+20)-10;ctx.globalAlpha=.24+.28*(i%3)/3;ctx.strokeStyle='#d9faff';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-4,sy+8);ctx.stroke();}ctx.restore();}
    drawBossRealmCreatureMuseums(camX,camY,time);
    drawBossRealmAwakeningArena(camX,camY,time);
    // Major visual pass: the active encounter now lights the ruined landscape around it.
    const activeBoss=monsters.find(m=>m.bossRealmCreature&&m.hp>0&&['boss','god'].includes(BOSS_REALM_CREATURES[m.realmType]?.tier));
    if(activeBoss){
      const bx=activeBoss.x-camX,by=activeBoss.y-camY;
      if(bx>-420&&bx<width+420&&by>-360&&by<height+360){
        const theme=bossRealmArenaTheme();
        const aura=theme==='infernal'?'255,104,49':theme==='glacier'?'105,218,255':theme==='blood'?'226,77,123':'166,139,255';
        const pulse=.5+.5*Math.sin(time/230+(activeBoss.phaseStage||0));
        ctx.save();
        const radius=Math.max(220,Math.min(width,height)*.72);
        const bossGlow=ctx.createRadialGradient(bx,by-8,10,bx,by,radius);
        bossGlow.addColorStop(0,'rgba('+aura+','+(.16+.08*pulse)+')');
        bossGlow.addColorStop(.24,'rgba('+aura+','+(.075+.035*pulse)+')');
        bossGlow.addColorStop(1,'rgba('+aura+',0)');
        ctx.fillStyle=bossGlow;ctx.fillRect(0,0,width,height);
        // Long, slow shafts make the boss silhouette readable through the existing ash haze.
        ctx.globalCompositeOperation='screen';
        for(let i=0;i<5;i++){
          const drift=Math.sin(time/900+i*1.7)*24,spread=24+i*18;
          const beam=ctx.createLinearGradient(bx+(i-2)*spread+drift,by-190,bx+(i-2)*spread-drift+30,by+210);
          beam.addColorStop(0,'rgba('+aura+',0)');beam.addColorStop(.48,'rgba('+aura+','+(.025+.018*pulse)+')');beam.addColorStop(1,'rgba('+aura+',0)');
          ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(bx+(i-2)*spread-7,by-190);ctx.lineTo(bx+(i-2)*spread+12,by-190);ctx.lineTo(bx+(i-2)*spread+spread+32,by+210);ctx.lineTo(bx+(i-2)*spread-spread+8,by+210);ctx.closePath();ctx.fill();
        }
        // Deterministic drifting embers/ice motes add depth without spawning gameplay entities.
        for(let i=0;i<22;i++){
          const phase=(time*.000035+i*.173)%1,orbit=42+(i%6)*17,angle=i*2.399+time*.00018*(i%2?1:-1);
          const px=bx+Math.cos(angle)*orbit+(phase-.5)*36,py=by+Math.sin(angle)*orbit*.48-30+phase*84;
          ctx.globalAlpha=.12+.22*(.5+.5*Math.sin(time/190+i));
          ctx.fillStyle=theme==='glacier'?'#c9f6ff':theme==='infernal'?'#ffb16a':theme==='blood'?'#ff9bb8':'#d5caff';
          ctx.beginPath();ctx.arc(px,py,1+(i%3)*.55,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  function beginCombatInteriorCamera(time){
    if(!combatCinematic?.active)return false;
    const p=Math.max(0,Math.min(1,combatCinematic.elapsed/combatCinematic.duration));
    const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
    const strike=smooth((p-.30)/.24),recover=smooth((p-.70)/.30);
    const impact=Math.max(0,1-Math.abs(p-(combatCinematic.hitAt/combatCinematic.duration))/.19);
    const quality=gameSettings.graphicsQuality==='low'?.3:gameSettings.graphicsQuality==='medium'?.65:1;
    const zoom=1+Math.sin(Math.PI*p)*.68+impact*.08;
    const roll=(player.face==='left'||player.face==='up'?-1:1)*(.07+strike*.08-recover*.12);
    const panX=Math.sin(p*Math.PI*2)*12+strike*10;
    const panY=Math.cos(p*Math.PI*2)*8-strike*8;
    ctx.save();
    ctx.translate(width/2+Math.sin(time*.07)*impact*3*quality,height/2+Math.cos(time*.08)*impact*2*quality);
    ctx.rotate(roll);ctx.scale(zoom,zoom);
    ctx.transform(1,Math.sin(p*Math.PI)*.055,Math.sin(p*Math.PI)*-.035,1,0,0);
    ctx.translate(-width/2+panX,-height/2+panY);
    return true;
  }
  function draw(dt,time){
    if(dungeonMode){const cinematic=beginCombatInteriorCamera(time);drawDungeonInterior(dt,time);if(cinematic)ctx.restore();updateObjective();return;}
    if(caveMode){const cinematic=beginCombatInteriorCamera(time);drawCaveInterior(dt,time);if(cinematic)ctx.restore();updateObjective();return;}
    if(mineMode){const cinematic=beginCombatInteriorCamera(time);drawMineInterior(dt,time);if(cinematic)ctx.restore();return;}
    if(inHouse){const cinematic=beginCombatInteriorCamera(time);drawHouseInterior(dt,time);if(cinematic)ctx.restore();updateObjective();return;}
    const camX=Math.max(0,Math.min(COLS*TILE-width,player.x-width/2));
    const camY=Math.max(0,Math.min(ROWS*TILE-height,player.y-height/2));
    ctx.save();
    if(combatCinematic?.active){
      const p=Math.max(0,Math.min(1,combatCinematic.elapsed/combatCinematic.duration));
      const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
      const wind=smooth(p/.34),strike=smooth((p-.30)/.24),recover=smooth((p-.70)/.30);
      const impact=Math.max(0,1-Math.abs(p-(combatCinematic.hitAt/combatCinematic.duration))/.19);
      const zoom=1+Math.sin(Math.PI*p)*.86+impact*.10;
      const faceAngle=player.face==='left'?Math.PI:player.face==='up'?-Math.PI/2:player.face==='down'?Math.PI/2:0;
      const rollDir=player.face==='left'||player.face==='up'?-1:1;
      const roll=rollDir*((wind*(.095)+strike*(.15)-recover*(.19))+Math.sin(p*Math.PI)*.035);
      const focusX=combatCinematic.focusX-camX,focusY=combatCinematic.focusY-camY;
      const orbit=Math.sin(p*Math.PI*2);
      const panX=Math.cos(faceAngle)*(-18*wind+26*strike-8*recover)+Math.sin(faceAngle)*orbit*15;
      const panY=Math.sin(faceAngle)*(-18*wind+28*strike-8*recover)-Math.cos(faceAngle)*orbit*12;
      const qualityScale=gameSettings.graphicsQuality==='low'?.32:gameSettings.graphicsQuality==='medium'?.68:1;
      const shake=(combatCinematic.hitDone?combatCameraShake:1.2)*qualityScale+impact*7*qualityScale;
      const sx=Math.sin(time*.071)*shake+Math.sin(p*37)*impact*3*qualityScale;
      const sy=Math.cos(time*.083)*shake*.65+Math.cos(p*31)*impact*2.5*qualityScale;
      ctx.translate(width/2+sx,height/2+sy);
      ctx.rotate(roll);
      ctx.scale(zoom,zoom*(1+Math.sin(p*Math.PI)*.055));
      // A moving oblique projection gives the 2D scene a punchy 2.5D camera tilt.
      ctx.transform(1,Math.sin(p*Math.PI)*.075,Math.sin(p*Math.PI)*-.045,1,0,0);
      ctx.translate(-focusX+panX,-focusY+panY);
    }
    if(tradeWorldMode){drawTradeGround(camX,camY);}else if(bossRealmMode){drawBossRealmGround(camX,camY,time);drawBossRealmEnvironment(camX,camY,time);drawBossRealmForest(camX,camY,time);window.SkyRealmBossExploration?.draw?.(ctx,camX,camY,time,width,height);window.SkyRealmBossRealmHub?.draw?.(ctx,camX,camY,time,width,height);}else{drawGround(camX,camY);drawPond(camX,camY);drawPlacedStructures(camX,camY);}
    if(bossRealmMode){drawMonsters(camX,camY,time);drawLootDrops(camX,camY,time);drawBossRealmPortal(camX,camY,time);}
    else if(tradeWorldMode){
      drawPlacedStructures(camX,camY);drawTradeEntrance(camX,camY); drawVillageSettlements(camX,camY,time); drawTreasureChests(camX,camY,time); drawLootDrops(camX,camY,time); drawMonsters(camX,camY,time);
      drawTradeShop(SELL_SHOP,camX,camY,'ЛАВКА ЛЕСНИКА','T · ОТКРЫТЬ ЛАВКУ','#d7a52c');
      drawTradeShop(BUY_SHOP,camX,camY,'ЛАВКА РУДОКОПА','T · ОТКРЫТЬ ЛАВКУ','#70818d');
       drawTradeShop(FARMER_SHOP,camX,camY,'ЛАВКА ФЕРМЕРА','T · СЕМЕНА И УРОЖАЙ','#6b9b4e');
    }else{
      if(gameSettings.graphicsQuality!=='low') drawFlowers(camX,camY,time);
      drawCabin(camX,camY); drawQuarryOutpost(camX,camY,time); drawFences(camX,camY); drawMineEntrance(camX,camY); drawTradeEntrance(camX,camY);
      for(const rock of world.rocks){const x=rock.x-camX,y=rock.y-camY;if(x>-30&&x<width+30&&y>-30&&y<height+30)drawRock(rock,camX,camY);}
      for(const tree of world.trees){const x=tree.x-camX,y=tree.y-camY;if(x>-60&&x<width+60&&y>-70&&y<height+40)drawTree(tree,camX,camY);}drawForestStumps(camX,camY,time);
      world.signs.forEach(s=>drawSign(s,camX,camY));drawSheep(camX,camY,time);drawTreasureChests(camX,camY,time);drawLootDrops(camX,camY,time);drawMonsters(camX,camY,time);drawForestLabel(camX,camY);drawDungeonGate(camX,camY,time);drawMeteorPoint(camX,camY,time);drawWorldEventCamp(camX,camY,time);drawWorldEventTraveler(camX,camY,time);drawWorldEventShrine(camX,camY,time);window.SkyRealmExpansionSystems?.drawWorldEvent?.(ctx,camX,camY,time,width,height);drawWolfCage(camX,camY,time);if(!bossRealmMode){drawWolfBoss(camX,camY,time);drawBiomeBosses(camX,camY,time);}drawWolfCompanion(camX,camY,time);drawBossRealmPortal(camX,camY,time);if(bossRealmMode){ctx.fillStyle='rgba(31,20,78,.20)';ctx.fillRect(0,0,width,height);}const cx=74*TILE+16-camX,cy=18*TILE+16-camY;ctx.save();ctx.fillStyle='#151a23';ctx.beginPath();ctx.ellipse(cx,cy,34,24,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#6c7d8c';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#6fe1f4';ctx.shadowColor='#55d7f2';ctx.shadowBlur=12;ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ПЕЩЕРА',cx,cy-30);ctx.restore();
    }
    window.SkyRealmLivingWorld?.draw?.(ctx,camX,camY,time,width,height);window.SkyRealmForestEcosystem?.draw?.(ctx,camX,camY,time,width,height);
    if(gameSettings.graphicsQuality==='high'){
      const px=player.x-camX,py=player.y-camY;
      const aura=ctx.createRadialGradient(px,py,4,px,py,36);
      aura.addColorStop(0,'rgba(151,188,255,.12)'); aura.addColorStop(1,'rgba(151,188,255,0)');
      ctx.fillStyle=aura;ctx.beginPath();ctx.arc(px,py,36,0,Math.PI*2);ctx.fill();
    }
    drawPlayer(camX,camY,dt);
    drawBossRealmHud();
    drawFishingCast(camX,camY,time);
    drawRemotePlayers(camX,camY);
    drawVisualEffects(camX,camY,time);
    if(gameSettings.graphicsQuality!=='low') drawFireflies(camX,camY,time);
    drawDayNightOverlay(camX,camY);
    updateObjective();
    ctx.restore();
    ctx.restore();
  }
  function drawCombatCinematicOverlay(time){
    if(!combatCinematic?.active&&!combatCinematicImpactFlash&&!bossVictoryCue)return;
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    const p=combatCinematic?Math.max(0,Math.min(1,combatCinematic.elapsed/combatCinematic.duration)):1;
    const intensity=combatCinematic?Math.sin(Math.PI*p):0;
    if(combatCinematic){
      const bar=Math.min(height*.12,34+intensity*24);
      ctx.fillStyle='rgba(2,5,12,'+(0.68+intensity*.2)+')';ctx.fillRect(0,0,width,bar);ctx.fillRect(0,height-bar,width,bar);
      const cx=width*.5,cy=height*.5,edge=ctx.createRadialGradient(cx,cy,Math.min(width,height)*.2,cx,cy,Math.max(width,height)*.72);
      edge.addColorStop(0,'rgba(0,0,0,0)');edge.addColorStop(1,'rgba(0,0,0,'+(.12+intensity*.28)+')');ctx.fillStyle=edge;ctx.fillRect(0,0,width,height);
      if(intensity>.15&&gameSettings.graphicsQuality!=='low'){ctx.save();ctx.globalAlpha=intensity*(gameSettings.graphicsQuality==='high'?.26:.13);ctx.strokeStyle=combatCinematic.style;ctx.lineWidth=2;const rays=gameSettings.graphicsQuality==='high'?22:12;for(let n=0;n<rays;n++){const a=n*Math.PI*2/rays+time*.0002,r=Math.max(width,height)*(.35+(n%3)*.1);ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r*.18,cy+Math.sin(a)*r*.18);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();}ctx.restore();}
      // A foreground weapon sweep sells the close, over-the-shoulder impact shot.
      if(intensity>.2){ctx.save();const swing=(1-p)*1.9-.55;ctx.translate(width*.78,height*.86);ctx.rotate(swing);ctx.globalAlpha=Math.min(.95,intensity*1.15);ctx.strokeStyle=combatCinematic.style;ctx.fillStyle='#c8d5e6';ctx.shadowColor=combatCinematic.style;ctx.shadowBlur=gameSettings.graphicsQuality==='low'?2:16;ctx.lineWidth=combatCinematic.weapon==='Молниеносное копьё'?11:7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,48);ctx.lineTo(-10,-72);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#526174';ctx.beginPath();ctx.moveTo(-17,52);ctx.lineTo(17,52);ctx.lineTo(11,37);ctx.lineTo(-11,37);ctx.closePath();ctx.fill();ctx.strokeStyle='#f4f8ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-5,-62);ctx.lineTo(-9,25);ctx.stroke();ctx.restore();}
      ctx.textAlign='center';ctx.font='900 12px Segoe UI';ctx.fillStyle='#ffffff';ctx.shadowColor=combatCinematic.style;ctx.shadowBlur=14;ctx.fillText(combatCinematic.hitDone?'УДАР!':combatCinematic.name.toUpperCase(),width/2,height-Math.min(height*.12,34+intensity*24)+22);ctx.shadowBlur=0;
    }
    if(combatCinematic?.hitDone){
      const pulse=Math.max(0,1-(combatCinematic.elapsed-combatCinematic.hitAt)/.72),cx=width*.5,cy=height*.5;
      ctx.save();ctx.globalAlpha=pulse*.78;ctx.strokeStyle=combatCinematic.style;ctx.fillStyle=combatCinematic.style;ctx.shadowColor=combatCinematic.style;ctx.shadowBlur=gameSettings.graphicsQuality==='low'?0:18;ctx.lineWidth=3;
      if(combatCinematic.weapon==='Огненный меч'){
        for(let ring=0;ring<3;ring++){ctx.beginPath();ctx.ellipse(cx,cy,55+ring*32+pulse*22,22+ring*16+pulse*13,-.18,0,Math.PI*2);ctx.stroke();}
        for(let n=0;n<8;n++){const a=n*Math.PI/4+time*.004;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*24,cy+Math.sin(a)*16);ctx.lineTo(cx+Math.cos(a)*90,cy+Math.sin(a)*65);ctx.stroke();}
      }else if(combatCinematic.weapon==='Ледяной посох'){
        for(let ring=0;ring<2;ring++){const r=54+ring*36+pulse*18;ctx.beginPath();for(let n=0;n<=6;n++){const a=n*Math.PI/3-Math.PI/2;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.62;if(n===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();}
        for(let n=0;n<8;n++){const a=n*Math.PI/4;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*38,cy+Math.sin(a)*26);ctx.lineTo(cx+Math.cos(a)*115,cy+Math.sin(a)*76);ctx.stroke();}
      }else if(combatCinematic.weapon==='Молниеносное копьё'){
        for(let n=0;n<5;n++){const x=cx-105+n*52;ctx.beginPath();ctx.moveTo(x,cy-95);ctx.lineTo(x+((n%2)?18:-16),cy-38);ctx.lineTo(x-10,cy+4);ctx.lineTo(x+22,cy+55);ctx.lineTo(x+7,cy+94);ctx.stroke();}
      }else{
        for(let ring=0;ring<3;ring++){ctx.beginPath();ctx.ellipse(cx,cy,42+ring*38+pulse*24,22+ring*18+pulse*14,0,0,Math.PI*2);ctx.stroke();}
      }
      ctx.restore();
    }
    if(combatCinematicImpactFlash>0){ctx.fillStyle='rgba(255,255,255,'+Math.min(.42,combatCinematicImpactFlash*1.25)+')';ctx.fillRect(0,0,width,height);}
    if(bossVictoryCue){
      const age=Math.max(0,performance.now()-bossVictoryCue.started);
      if(age>=bossVictoryCue.duration)bossVictoryCue=null;
      else{
        const life=age/bossVictoryCue.duration,fade=Math.min(1,age/220,(bossVictoryCue.duration-age)/680);
        const panelW=Math.min(width-28,680),panelH=106,panelX=(width-panelW)/2;
        const panelY=Math.max(42,height*.22-Math.sin(Math.min(1,age/280)*Math.PI)*12);
        ctx.save();ctx.globalAlpha=Math.max(0,fade);
        const gradient=ctx.createLinearGradient(panelX,panelY,panelX+panelW,panelY+panelH);
        gradient.addColorStop(0,'rgba(8,16,30,.94)');gradient.addColorStop(.5,'rgba(26,30,46,.96)');gradient.addColorStop(1,'rgba(8,16,30,.94)');
        ctx.fillStyle=gradient;ctx.fillRect(panelX,panelY,panelW,panelH);
        ctx.strokeStyle=bossVictoryCue.color;ctx.lineWidth=2;ctx.shadowColor=bossVictoryCue.color;ctx.shadowBlur=18;ctx.strokeRect(panelX,panelY,panelW,panelH);
        ctx.shadowBlur=0;ctx.textAlign='center';ctx.fillStyle='#ffe79a';ctx.font='900 13px Segoe UI';ctx.fillText('БОСС ПОВЕРЖЕН',width/2,panelY+26);
        ctx.fillStyle='#ffffff';ctx.shadowColor=bossVictoryCue.color;ctx.shadowBlur=10;ctx.font='900 '+Math.max(17,Math.min(27,26-(panelW<430?6:0)))+'px Segoe UI';
        const title= bossVictoryCue.name.length>48?bossVictoryCue.name.slice(0,45)+'…':bossVictoryCue.name;
        ctx.fillText(title,width/2,panelY+59);
        ctx.shadowBlur=0;ctx.fillStyle='#cbd8e8';ctx.font='700 11px Segoe UI';ctx.fillText('ПОБЕДА ЗАПИСАНА · ПРОТИВНИК БОЛЬШЕ НЕ АКТИВЕН',width/2,panelY+82);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  const MINE_MAZE_COLS=21,MINE_MAZE_ROWS=15,MINE_CELL_SIZE=44;
  function generateMineMaze(){
    const grid=Array.from({length:MINE_MAZE_ROWS},()=>Array(MINE_MAZE_COLS).fill(0));
    const start={x:1,y:MINE_MAZE_ROWS-2},stack=[start];grid[start.y][start.x]=1;
    while(stack.length){
      const cur=stack[stack.length-1],dirs=[[0,-2],[2,0],[0,2],[-2,0]];
      dirs.sort((a,b)=>hash(cur.x+a[0]+mineSeed,cur.y+a[1]+mineDepth*31)-hash(cur.x+b[0]+mineSeed,cur.y+b[1]+mineDepth*31));
      let next=null;
      for(const [dx,dy] of dirs){const x=cur.x+dx,y=cur.y+dy;if(x>0&&x<MINE_MAZE_COLS-1&&y>0&&y<MINE_MAZE_ROWS-1&&grid[y][x]===0){next={x,y,dx,dy};break;}}
      if(!next){stack.pop();continue;}
      grid[cur.y+next.dy/2][cur.x+next.dx/2]=1;grid[next.y][next.x]=1;stack.push({x:next.x,y:next.y});
    }
    // A small number of extra links keep the labyrinth from feeling like a single corridor.
    for(let y=1;y<MINE_MAZE_ROWS-1;y++)for(let x=1;x<MINE_MAZE_COLS-1;x++){
      if(grid[y][x])continue;
      const horizontal=grid[y][x-1]&&grid[y][x+1],vertical=grid[y-1][x]&&grid[y+1][x];
      if((horizontal||vertical)&&hash(x+mineSeed*3,y+mineDepth*17)>.91)grid[y][x]=1;
    }
    mineMaze=grid;return grid;
  }
  function ensureMineMaze(){if(!mineMaze||mineMaze.length!==MINE_MAZE_ROWS)generateMineMaze();return mineMaze;}
  function mineCellWalkable(col,row){const g=ensureMineMaze();return row>=0&&row<MINE_MAZE_ROWS&&col>=0&&col<MINE_MAZE_COLS&&g[row][col]===1;}
  function mineCellFromWorld(x,y){return {x:Math.max(0,Math.min(MINE_MAZE_COLS-1,Math.floor(x/MINE_CELL_SIZE))),y:Math.max(0,Math.min(MINE_MAZE_ROWS-1,Math.floor(y/MINE_CELL_SIZE)))};}
  function mineNearestFloorCell(col,row){
    const g=ensureMineMaze();let best=null,bestD=Infinity;
    for(let y=1;y<MINE_MAZE_ROWS-1;y++)for(let x=1;x<MINE_MAZE_COLS-1;x++)if(g[y][x]){
      const d=Math.abs(x-col)+Math.abs(y-row);if(d<bestD){best={x,y};bestD=d;}
    }
    return best||{x:1,y:MINE_MAZE_ROWS-2};
  }
  function mineFeatureWorldPosition(o){
    const col=Math.max(1,Math.min(MINE_MAZE_COLS-2,Math.round((Number(o.x)||0)/330*(MINE_MAZE_COLS-1))));
    const row=Math.max(1,Math.min(MINE_MAZE_ROWS-2,Math.round((Number(o.y)||0)/255*(MINE_MAZE_ROWS-1))));
    const cell=mineCellWalkable(col,row)?{x:col,y:row}:mineNearestFloorCell(col,row);
    return {x:(cell.x+.5)*MINE_CELL_SIZE,y:(cell.y+.5)*MINE_CELL_SIZE,cell};
  }
  function mineFeaturePoint(index,seed,offset=0){
    const cells=[];for(let y=1;y<MINE_MAZE_ROWS-1;y++)for(let x=1;x<MINE_MAZE_COLS-1;x++)if(mineCellWalkable(x,y)&&!(x===1&&y===MINE_MAZE_ROWS-2)&&!(x===MINE_MAZE_COLS-2&&y===1))cells.push({x,y});
    cells.sort((a,b)=>hash(a.x+seed+offset,a.y+offset*7)-hash(b.x+seed+offset,b.y+offset*7));
    const c=cells[index%Math.max(1,cells.length)]||{x:3,y:3};
    return {x:c.x/(MINE_MAZE_COLS-1)*330,y:c.y/(MINE_MAZE_ROWS-1)*255};
  }
  function mineWorldToScreen(x,y){
    const zoom=Math.max(1.35,Math.min(1.78,Math.min(width/470,height/350)));
    return {x:width/2+(x-minePlayerX)*zoom,y:height/2+(y-minePlayerY)*zoom,zoom};
  }
  function mineRockScreenPosition(r){const p=mineFeatureWorldPosition(r);return mineWorldToScreen(p.x,p.y);}
  function mineCreatureScreenPosition(m){const p=mineFeatureWorldPosition(m);return mineWorldToScreen(p.x,p.y);}
  function mineMovePlayer(mx,my,speed,dt){
    if(mx&&my){mx*=.7071;my*=.7071;}
    const totalX=mx*speed*dt,totalY=my*speed*dt,r=10,steps=Math.max(1,Math.ceil(Math.max(Math.abs(totalX),Math.abs(totalY))/6)),stepX=totalX/steps,stepY=totalY/steps;
    const can=(x,y)=>{
      const a=mineCellFromWorld(x-r,y-r),b=mineCellFromWorld(x+r,y-r),c=mineCellFromWorld(x-r,y+r),d=mineCellFromWorld(x+r,y+r);
      if(!mineCellWalkable(a.x,a.y)||!mineCellWalkable(b.x,b.y)||!mineCellWalkable(c.x,c.y)||!mineCellWalkable(d.x,d.y))return false;
      // Ore deposits are solid obstacles. The player must walk around a live vein.
      if(typeof mineRocks!=='undefined'&&Array.isArray(mineRocks)){
        for(const rock of mineRocks){if(!rock||rock.hp<=0)continue;const point=mineFeatureWorldPosition(rock);if(Math.hypot(x-point.x,y-point.y)<r+10)return false;}
      }
      return true;
    };
    for(let i=0;i<steps;i++){
      if(stepX&&can(minePlayerX+stepX,minePlayerY))minePlayerX+=stepX;
      if(stepY&&can(minePlayerX,minePlayerY+stepY))minePlayerY+=stepY;
    }
  }
  function mineNextStepTowardPlayer(from){
    const goal=mineCellFromWorld(minePlayerX,minePlayerY),key=(x,y)=>y*MINE_MAZE_COLS+x;
    const queue=[{x:from.x,y:from.y,first:null}],seen=new Set([key(from.x,from.y)]);
    for(let i=0;i<queue.length;i++){
      const cur=queue[i];if(cur.x===goal.x&&cur.y===goal.y)return cur.first;
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
        const x=cur.x+dx,y=cur.y+dy,k=key(x,y);if(!mineCellWalkable(x,y)||seen.has(k))continue;
        seen.add(k);queue.push({x,y,first:cur.first||{x,y}});
      }
    }
    return null;
  }
  function drawMineBackdrop(time=performance.now()){
    // Full-screen cave rock remains visible behind the maze, instead of leaving empty black gaps.
    const base=ctx.createLinearGradient(0,0,0,height);
    base.addColorStop(0,'#29343a');base.addColorStop(.34,'#1a252b');base.addColorStop(.72,'#11191f');base.addColorStop(1,'#080d12');
    ctx.fillStyle=base;ctx.fillRect(0,0,width,height);
    const ambient=ctx.createRadialGradient(width*.5,height*.43,Math.min(width,height)*.08,width*.5,height*.43,Math.max(width,height)*.78);
    ambient.addColorStop(0,'rgba(91,103,99,.16)');ambient.addColorStop(.55,'rgba(42,54,58,.08)');ambient.addColorStop(1,'rgba(0,0,0,.48)');
    ctx.fillStyle=ambient;ctx.fillRect(0,0,width,height);
    // Uneven rock strata along the cave perimeter create a visible backdrop around the walkable tunnels.
    for(let layer=0;layer<7;layer++){
      const y=height*(.08+layer*.145)+Math.sin(time*.00012+layer)*5;
      ctx.beginPath();ctx.moveTo(0,y);
      for(let x=0;x<=width+40;x+=40){
        const wave=Math.sin(x*.014+layer*1.7)*8+Math.sin(x*.037-layer)*3;
        ctx.lineTo(x,y+wave);
      }
      ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();
      ctx.fillStyle=layer%2?'rgba(9,15,19,.075)':'rgba(128,137,129,.045)';ctx.fill();
    }
    // Large, irregular silhouettes at the upper and lower edges make the ceiling and floor read as rock.
    for(let i=0;i<15;i++){
      const x=(i+.5)*width/15,seed=hash(i+mineSeed*2,mineDepth+17),w=width/15*(.55+seed*.55);
      const h=18+seed*58;
      ctx.fillStyle=i%2?'#111a20':'#202a2e';
      ctx.beginPath();ctx.moveTo(x-w*.6,0);ctx.lineTo(x+w*.6,0);ctx.lineTo(x+w*.35,h*.42);ctx.lineTo(x+Math.sin(i*4)*w*.12,h);ctx.lineTo(x-w*.28,h*.48);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(142,151,143,.12)';ctx.beginPath();ctx.moveTo(x-w*.35,2);ctx.lineTo(x-w*.12,h*.35);ctx.lineTo(x-w*.18,h*.55);ctx.closePath();ctx.fill();
      const bottom=height-(12+seed*32);
      ctx.fillStyle='#0c1318';ctx.beginPath();ctx.moveTo(x-w*.65,height);ctx.lineTo(x+w*.65,height);ctx.lineTo(x+w*.3,bottom);ctx.lineTo(x-w*.25,bottom+10);ctx.closePath();ctx.fill();
    }
    // A few dim mineral seams and reflective fragments add depth without obscuring gameplay.
    for(let i=0;i<11;i++){
      const seed=hash(i+mineSeed*9,mineDepth*13),x=seed*width,y=(.16+hash(i+31,mineSeed)*.7)*height;
      ctx.strokeStyle=i%3===0?'rgba(105,177,183,.22)':'rgba(151,137,111,.13)';ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(x-12,y-8);ctx.lineTo(x-3,y);ctx.lineTo(x+4,y-3);ctx.lineTo(x+14,y+7);ctx.stroke();
      if(i%3===0){ctx.fillStyle='rgba(112,204,211,.25)';ctx.beginPath();ctx.arc(x,y,2.2+Math.sin(time/420+i)*.5,0,Math.PI*2);ctx.fill();}
    }
  }
  function drawMinePassages(){
    const g=ensureMineMaze(),cell=MINE_CELL_SIZE,time=performance.now();
    drawMineBackdrop(time);
    // Every corridor is a layered stone floor; blocked cells become raised rock walls.
    for(let row=0;row<MINE_MAZE_ROWS;row++)for(let col=0;col<MINE_MAZE_COLS;col++){
      const p=mineWorldToScreen((col+.5)*cell,(row+.5)*cell),size=cell*p.zoom,half=size/2;
      if(p.x+half<-8||p.x-half>width+8||p.y+half<-8||p.y-half>height+8)continue;
      const seed=hash(col+mineSeed*1.7,row+mineDepth*23),tone=Math.floor(seed*5);
      if(g[row][col]){
        const floorTones=['#665d50','#5d554a','#716655','#62594e','#585247'];
        ctx.fillStyle=floorTones[tone];ctx.fillRect(p.x-half,p.y-half,size,size);
        // Soft directional light and a narrow bevel make each existing floor plate feel raised.
        const floorLight=ctx.createLinearGradient(p.x-half,p.y-half,p.x+half,p.y+half);
        floorLight.addColorStop(0,'rgba(239,218,177,.13)');floorLight.addColorStop(.48,'rgba(184,163,132,.025)');floorLight.addColorStop(1,'rgba(5,7,8,.22)');
        ctx.fillStyle=floorLight;ctx.fillRect(p.x-half,p.y-half,size,size);
        ctx.strokeStyle='rgba(224,204,169,.16)';ctx.lineWidth=Math.max(.7,p.zoom*.55);
        ctx.beginPath();ctx.moveTo(p.x-half+size*.08,p.y-half+size*.1);ctx.lineTo(p.x+half-size*.12,p.y-half+size*.08);ctx.stroke();
        ctx.fillStyle='rgba(20,17,14,.22)';ctx.fillRect(p.x-half,p.y+half-size*.12,size,size*.12);
        ctx.strokeStyle='rgba(27,24,21,.45)';ctx.lineWidth=Math.max(1,p.zoom*.8);ctx.strokeRect(p.x-half,p.y-half,size,size);
        // Irregular floor plates, chips and thin mineral seams.
        ctx.fillStyle='rgba(190,169,137,.13)';ctx.beginPath();ctx.moveTo(p.x-size*.39,p.y-size*.27);ctx.lineTo(p.x-size*.12,p.y-size*.34);ctx.lineTo(p.x+size*.31,p.y-size*.18);ctx.lineTo(p.x+size*.22,p.y-size*.08);ctx.lineTo(p.x-size*.2,p.y-size*.12);ctx.closePath();ctx.fill();
        ctx.strokeStyle='rgba(28,25,23,.42)';ctx.lineWidth=1;ctx.beginPath();
        if(seed>.34){ctx.moveTo(p.x-size*.32,p.y+size*.16);ctx.lineTo(p.x-size*.08,p.y+size*.04);ctx.lineTo(p.x+size*.02,p.y+size*.22);ctx.lineTo(p.x+size*.28,p.y+size*.12);}
        else{ctx.moveTo(p.x-size*.2,p.y-size*.27);ctx.lineTo(p.x-size*.03,p.y-size*.06);ctx.lineTo(p.x+size*.2,p.y-size*.02);}
        ctx.stroke();
        for(let k=0;k<3;k++){const pebble=hash(col*7+mineSeed+k*11,row*13+mineLevel+k*5);const px=p.x+(pebble-.5)*size*.72,py=p.y+(hash(col+k*19,row+k*31)-.5)*size*.7;ctx.fillStyle=k===0?'rgba(211,194,163,.38)':'rgba(25,24,23,.34)';ctx.beginPath();ctx.ellipse(px,py,Math.max(1,size*(.018+k*.006)),Math.max(1,size*.012),pebble*3,0,Math.PI*2);ctx.fill();}
        if(seed>.82){ctx.strokeStyle='rgba(157,130,97,.55)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(p.x-size*.3,p.y-size*.2);ctx.lineTo(p.x-size*.12,p.y-size*.03);ctx.lineTo(p.x-size*.17,p.y+size*.15);ctx.stroke();}
      }else{
        // Deep, layered rock wall with a raised top lip and dark lower face.
        ctx.fillStyle='#111a22';ctx.fillRect(p.x-half,p.y-half,size,size);
        const wallShade=ctx.createLinearGradient(p.x-half,p.y-half,p.x+half,p.y+half);
        wallShade.addColorStop(0,['#485258','#505b60','#465257','#596064','#424c51'][tone]);
        wallShade.addColorStop(.55,['#303a40','#394247','#333d42','#41484a','#2e383d'][tone]);
        wallShade.addColorStop(1,'#151e24');ctx.fillStyle=wallShade;ctx.beginPath();
        ctx.moveTo(p.x-half,p.y-half+size*.12);ctx.lineTo(p.x-half+size*.12,p.y-half+size*.02);ctx.lineTo(p.x-half+size*.35,p.y-half+size*.07);ctx.lineTo(p.x+half-size*.1,p.y-half+size*.03);ctx.lineTo(p.x+half,p.y-half+size*.16);ctx.lineTo(p.x+half,p.y+half-size*.08);ctx.lineTo(p.x+half-size*.18,p.y+half);ctx.lineTo(p.x-half+size*.08,p.y+half-size*.02);ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(125,139,139,.24)';ctx.beginPath();ctx.moveTo(p.x-half+size*.08,p.y-half+size*.1);ctx.lineTo(p.x-half+size*.32,p.y-half+size*.06);ctx.lineTo(p.x+size*.08,p.y-half+size*.14);ctx.lineTo(p.x-size*.06,p.y-half+size*.22);ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(p.x-half,p.y+half-size*.18,size,size*.18);
        ctx.strokeStyle='#151d22';ctx.lineWidth=1.5;ctx.strokeRect(p.x-half,p.y-half,size,size);
        // Faceted boulders and cracks on exposed wall faces.
        for(let k=0;k<2;k++){const v=hash(col*17+k*9+mineSeed,row*23+k*7+mineLevel);const bx=p.x+(v-.5)*size*.48,by=p.y+(hash(row*11+k,col*29+mineSeed)-.5)*size*.36,r=size*(.12+v*.1);ctx.fillStyle=k?'rgba(10,15,19,.36)':'rgba(119,128,126,.22)';ctx.beginPath();ctx.moveTo(bx-r,by);ctx.lineTo(bx-r*.35,by-r*.8);ctx.lineTo(bx+r*.65,by-r*.45);ctx.lineTo(bx+r,by+r*.2);ctx.lineTo(bx-r*.25,by+r*.65);ctx.closePath();ctx.fill();}
        if(seed>.48){ctx.strokeStyle='rgba(8,13,17,.72)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(p.x-size*.22,p.y-size*.22);ctx.lineTo(p.x-size*.08,p.y-size*.03);ctx.lineTo(p.x-size*.17,p.y+size*.1);ctx.lineTo(p.x+size*.02,p.y+size*.28);ctx.stroke();}
        if(seed>.63){
          const seamY=p.y-size*(.12+hash(col+mineDepth,row+mineSeed)*.34);
          ctx.strokeStyle='rgba(165,180,174,.15)';ctx.lineWidth=Math.max(.7,p.zoom*.45);
          ctx.beginPath();ctx.moveTo(p.x-half+size*.16,seamY);ctx.lineTo(p.x-size*.08,seamY-size*.035);ctx.lineTo(p.x+half-size*.2,seamY+size*.02);ctx.stroke();
        }
        // Occasional ceiling stalactites hang over the dark rock.
        if(seed>.88){ctx.fillStyle='#1b252b';ctx.beginPath();ctx.moveTo(p.x-size*.16,p.y-half);ctx.lineTo(p.x+size*.12,p.y-half);ctx.lineTo(p.x+size*.02,p.y-half+size*.34);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(142,151,143,.32)';ctx.beginPath();ctx.moveTo(p.x-size*.11,p.y-half+2);ctx.lineTo(p.x-size*.01,p.y-half+size*.17);ctx.lineTo(p.x-size*.02,p.y-half+2);ctx.fill();}
      }
    }
    // Wooden pit props appear at selected corridor bends, with iron bolts and warm lantern light.
    for(let row=1;row<MINE_MAZE_ROWS-1;row++)for(let col=1;col<MINE_MAZE_COLS-1;col++){
      if(!g[row][col]||hash(col+mineSeed*5,row+mineDepth*37)<.965)continue;
      const p=mineWorldToScreen((col+.5)*cell,(row+.5)*cell),z=p.zoom;if(p.x<-70||p.x>width+70||p.y<-70||p.y>height+70)continue;
      ctx.save();ctx.translate(p.x,p.y);ctx.scale(z,z);
      ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-19,8,38,5);
      ctx.fillStyle='#3a261b';ctx.fillRect(-17,-17,5,29);ctx.fillRect(12,-17,5,29);ctx.fillRect(-20,-20,40,5);
      ctx.fillStyle='#91633d';ctx.fillRect(-15,-16,2,25);ctx.fillRect(14,-16,2,25);ctx.fillRect(-17,-18,34,2);
      ctx.fillStyle='#b9a078';for(const [bx,by] of [[-14,-14],[14,-14],[-14,8],[14,8]]){ctx.beginPath();ctx.arc(bx,by,1.5,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
    // A handful of animated lantern pools and drifting dust motes give the mine depth.
    for(let row=1;row<MINE_MAZE_ROWS-1;row++)for(let col=1;col<MINE_MAZE_COLS-1;col++){
      if(!g[row][col]||hash(col+mineSeed*11,row+mineDepth*41)<.985)continue;
      const p=mineWorldToScreen((col+.5)*cell,(row+.5)*cell),z=p.zoom;if(p.x<-120||p.x>width+120||p.y<-120||p.y>height+120)continue;
      const pulse=.78+.22*Math.sin(time/180+col*2+row);
      // Existing lanterns now cast layered amber light with a softer outer falloff.
      const outerGlow=ctx.createRadialGradient(p.x,p.y,3,p.x,p.y,92*z);
      outerGlow.addColorStop(0,'rgba(255,177,91,'+(.12*pulse)+')');outerGlow.addColorStop(.42,'rgba(235,142,70,'+(.055*pulse)+')');outerGlow.addColorStop(1,'rgba(255,150,55,0)');
      ctx.fillStyle=outerGlow;ctx.fillRect(p.x-94*z,p.y-94*z,188*z,188*z);
      const glow=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,48*z);
      glow.addColorStop(0,'rgba(255,221,151,'+(.27*pulse)+')');glow.addColorStop(.32,'rgba(255,185,91,'+(.16*pulse)+')');glow.addColorStop(1,'rgba(255,150,55,0)');
      ctx.fillStyle=glow;ctx.fillRect(p.x-50*z,p.y-50*z,100*z,100*z);
      ctx.fillStyle='#ffc66f';ctx.shadowColor='#ffad50';ctx.shadowBlur=10*z;ctx.beginPath();ctx.arc(p.x,p.y,2.7*z,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    for(let i=0;i<9;i++){const phase=time*.00018+i*1.73,dx=Math.sin(phase)*width*.42,dy=((time*.012+i*71)%(height+30))-15;const a=.12+.18*(.5+.5*Math.sin(phase*2));ctx.fillStyle='rgba(220,211,190,'+a+')';ctx.beginPath();ctx.arc(width/2+dx,dy,1+(i%3)*.45,0,Math.PI*2);ctx.fill();}
    const entrance=mineWorldToScreen(1.5*cell,(MINE_MAZE_ROWS-1.5)*cell),exit=mineWorldToScreen((MINE_MAZE_COLS-1.5)*cell,1.5*cell);
    ctx.save();ctx.translate(entrance.x,entrance.y);ctx.fillStyle='#182a30';ctx.strokeStyle='#7bc4a4';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,cell*.34*entrance.zoom,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#c4f0d7';ctx.font='bold '+Math.max(9,10*entrance.zoom)+'px Segoe UI';ctx.textAlign='center';ctx.fillText('ВЫХОД',0,cell*.55*entrance.zoom);ctx.restore();
    ctx.save();ctx.translate(exit.x,exit.y);ctx.fillStyle='#352b20';ctx.strokeStyle='#f3c16b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,cell*.34*exit.zoom,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe2a0';ctx.font='bold '+Math.max(9,10*exit.zoom)+'px Segoe UI';ctx.textAlign='center';ctx.fillText(mineDepth<8?'НИЖЕ':'СОКРОВИЩЕ',0,cell*.55*exit.zoom);ctx.restore();
  }
  function drawMineBarrels(){
    // Barrels are intentionally drawn without floating names or text labels.
    for(const b of mineBarrels){if(b.hp<=0)continue;const p=mineRockScreenPosition(b);ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.zoom,p.zoom);
      ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(0,13,19,7,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#4a2d20';ctx.beginPath();ctx.moveTo(-12,-16);ctx.quadraticCurveTo(-19,-3,-13,13);ctx.quadraticCurveTo(0,20,13,13);ctx.quadraticCurveTo(19,-3,12,-16);ctx.closePath();ctx.fill();
      ctx.fillStyle='#986037';ctx.beginPath();ctx.moveTo(-10,-14);ctx.quadraticCurveTo(-15,0,-10,12);ctx.quadraticCurveTo(0,16,10,12);ctx.quadraticCurveTo(15,0,10,-14);ctx.closePath();ctx.fill();
      ctx.fillStyle='#b67b45';ctx.fillRect(-12,-13,24,4);ctx.fillRect(-14,1,28,5);ctx.fillStyle='#6b452c';ctx.fillRect(-5,-12,3,24);ctx.fillRect(4,-11,3,23);
      ctx.fillStyle='#c7955d';ctx.beginPath();ctx.ellipse(0,-14,11,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#593b2a';ctx.beginPath();ctx.ellipse(0,-14,7,2,0,0,Math.PI*2);ctx.fill();
      if(b.hp<b.maxHp){ctx.strokeStyle='#ffe09a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    }
  }
  function drawMineCreatures(time=performance.now()){
    for(const m of mineCreatures){if(m.hp<=0)continue;const p=mineCreatureScreenPosition(m),x=p.x,y=p.y,bob=Math.sin(time/230+m.phase)*2.4;ctx.save();ctx.translate(x,y+bob);ctx.scale(p.zoom,p.zoom);
      ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(0,13,19,7,0,0,Math.PI*2);ctx.fill();
      if(m.kind==='bat'){const wing=Math.sin(time/95+m.phase)*8;ctx.fillStyle=m.flash>0?'#fff0dc':'#40364f';ctx.beginPath();ctx.moveTo(-4,-1);ctx.quadraticCurveTo(-18,-20-wing,-29,-8);ctx.quadraticCurveTo(-24,8,-8,7);ctx.lineTo(0,3);ctx.lineTo(8,7);ctx.quadraticCurveTo(24,8,29,-8);ctx.quadraticCurveTo(18,-20+wing,4,-1);ctx.closePath();ctx.fill();ctx.fillStyle='#a59ab5';ctx.beginPath();ctx.arc(0,-3,10,0,Math.PI*2);ctx.fill();}
      else if(m.kind==='golem'){ctx.fillStyle=m.flash>0?'#fff0dc':'#626b70';ctx.beginPath();ctx.moveTo(-18,11);ctx.lineTo(-16,-11);ctx.lineTo(-8,-19);ctx.lineTo(10,-17);ctx.lineTo(20,-5);ctx.lineTo(17,13);ctx.lineTo(-12,16);ctx.closePath();ctx.fill();ctx.fillStyle='#929b9a';ctx.fillRect(-11,-12,22,9);ctx.fillStyle='#ff9c62';ctx.fillRect(-9,-5,5,4);ctx.fillRect(5,-5,5,4);ctx.fillStyle='#3d4549';ctx.fillRect(-13,12,8,9);ctx.fillRect(6,12,8,9);}
      else if(m.kind==='spider'){ctx.strokeStyle='#8c70a8';ctx.lineWidth=3;for(let leg=0;leg<4;leg++){const side=leg<2?-1:1,dy=leg%2?8:-7;ctx.beginPath();ctx.moveTo(side*7,2);ctx.lineTo(side*(17+leg*2),dy-5);ctx.lineTo(side*(23+leg*2),dy+5);ctx.stroke();}ctx.fillStyle=m.flash>0?'#fff0dc':'#51405f';ctx.beginPath();ctx.ellipse(0,3,13,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9ef3ff';ctx.fillRect(-6,-2,4,3);ctx.fillRect(3,-2,4,3);}
      else{ctx.fillStyle=m.flash>0?'#fff0dc':'#59483c';ctx.beginPath();ctx.ellipse(0,2,19,13,-.08,0,Math.PI*2);ctx.fill();ctx.fillStyle='#76634f';ctx.beginPath();ctx.arc(-10,-8,7,0,Math.PI*2);ctx.arc(9,-8,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#42352e';ctx.fillRect(-13,8,5,8);ctx.fillRect(8,8,5,8);}
      ctx.fillStyle=m.kind==='bat'?'#ff8d69':'#ffbd65';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(-5,-3,2.5,0,Math.PI*2);ctx.arc(5,-3,2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.restore();
      if(m.hp<m.maxHp){ctx.fillStyle='#171b24';ctx.fillRect(x-17,y-27,34,4);ctx.fillStyle='#e46b59';ctx.fillRect(x-17,y-27,34*Math.max(0,m.hp/m.maxHp),4);}
      ctx.fillStyle='#f0dfc7';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText(m.name||'Пещерный монстр',x,y-31);ctx.textAlign='left';
    }
  }
  function strikeMineCreature(target,damage){
    if(!mineMode||!target||target.hp<=0)return false;target.hp=Math.max(0,target.hp-Math.max(1,Math.floor(Number(damage)||1)));target.flash=.2;
    const p=mineCreatureScreenPosition(target);spawnVisualBurst(p.x,p.y,8,'spark',target.kind==='bat'?'#ff9875':'#d4b38c');playSound('hit');
    if(target.hp<=0){const coal=1+(mineLevel>=5?1:0);changeItem('Уголь',coal);if(mineLevel>=4&&Math.random()<.35)changeItem('Железо',1);
      window.SkyRealmJobs?.record?.('hunter',1);awardXP(22+mineLevel*4,'победа над шахтным монстром');toast('Пещерный монстр повержен · уголь ×'+coal+'.');}
    else toast((target.name||'Монстр')+' · здоровье '+target.hp+'/'+target.maxHp+'.');
    renderInventory();saveGame();return true;
  }
  function attackMineCreature(target=null){
    if(!mineMode)return false;
    let chosen=target;
    if(!chosen){
      chosen=mineCreatures.filter(m=>m.hp>0).map(m=>({mob:m,distance:Math.hypot(mineFeatureWorldPosition(m).x-minePlayerX,mineFeatureWorldPosition(m).y-minePlayerY)})).sort((a,b)=>a.distance-b.distance)[0];
      if(!chosen||chosen.distance>170){toast('Подойди ближе к пещерному монстру, чтобы атаковать.');return false;}
      chosen=chosen.mob;
    }
    const point=mineFeatureWorldPosition(chosen);
    if(Math.hypot(point.x-minePlayerX,point.y-minePlayerY)>170){toast('Подойди ближе, чтобы ударить пещерного монстра.');return false;}
    if(minePlayerAttackCooldown>0){toast('Подожди завершения удара.');return false;}
    minePlayerAttackCooldown=.32;
    const damage=Math.max(10,Math.round(weaponDamage(equipment.weapon||'Деревянный меч')*(1+skills.warrior*.08)));
    return strikeMineCreature(chosen,damage);
  }
  function strikeMineBarrel(b){
    if(!mineMode||!b||b.hp<=0)return false;b.hp=Math.max(0,b.hp-1);playSound('wood');
    const p=mineRockScreenPosition(b);spawnVisualBurst(p.x,p.y,b.hp<=0?12:5,'dust','#bb8753');
    if(b.hp<=0){changeItem('Уголь',b.coal);changeItem('Камень',b.stone);toast('Бочка разбита: уголь ×'+b.coal+', камень ×'+b.stone+'.');renderInventory();}
    else toast('Бочка треснула · ещё один удар.');saveGame();return true;
  }
  function updateMineCreatures(dt){
    if(!mineMode)return;minePlayerAttackCooldown=Math.max(0,minePlayerAttackCooldown-dt);
    for(const m of mineCreatures){if(m.hp<=0)continue;m.attackCooldown=Math.max(0,(m.attackCooldown||0)-dt);m.flash=Math.max(0,(m.flash||0)-dt);m.phase=(m.phase||0)+dt*2;
      const current=mineFeatureWorldPosition(m),dx=minePlayerX-current.x,dy=minePlayerY-current.y,dist=Math.hypot(dx,dy);
      if(dist>58&&dist<560){const next=mineNextStepTowardPlayer(current.cell);if(next){const tx=(next.x+.5)*MINE_CELL_SIZE,ty=(next.y+.5)*MINE_CELL_SIZE,dd=Math.hypot(tx-current.x,ty-current.y),step=Math.min(m.speed*dt,dd);const nx=current.x+(tx-current.x)/Math.max(1,dd)*step,ny=current.y+(ty-current.y)/Math.max(1,dd)*step;m.x=nx/(MINE_MAZE_COLS*MINE_CELL_SIZE)*330;m.y=ny/(MINE_MAZE_ROWS*MINE_CELL_SIZE)*255;}}
      else if(dist<=58&&m.attackCooldown<=0&&!immortal){
        const damage=10;
        player.hp=Math.max(0,player.hp-damage);m.attackCooldown=2.35;const screen=mineWorldToScreen(minePlayerX,minePlayerY);spawnVisualBurst(screen.x,screen.y,6,'spark','#f06f65');updateVitals();toast((m.name||'Пещерный монстр')+' атакует · −'+damage+' HP');saveGame();if(player.hp<=0)respawnPlayerAfterDefeat();
      }
    }
  }
  function drawMineEntrance(camX,camY,time=performance.now()){
    const mx=mineTileX*TILE+16-camX,my=mineTileY*TILE+16-camY;
    if(mx<-130||mx>width+130||my<-120||my>height+120)return;
    ctx.save();ctx.translate(mx,my);
    ctx.fillStyle='rgba(4,11,15,.48)';ctx.beginPath();ctx.ellipse(0,17,54,24,0,0,Math.PI*2);ctx.fill();
    // Layered cliff face with fractured slabs, mineral veins and embedded ore.
    ctx.fillStyle='#414b4b';ctx.beginPath();ctx.moveTo(-48,14);ctx.lineTo(-43,-17);ctx.lineTo(-27,-37);ctx.lineTo(-8,-44);ctx.lineTo(18,-39);ctx.lineTo(43,-17);ctx.lineTo(50,15);ctx.closePath();ctx.fill();
    ctx.fillStyle='#697572';ctx.beginPath();ctx.moveTo(-42,10);ctx.lineTo(-37,-15);ctx.lineTo(-24,-31);ctx.lineTo(-8,-38);ctx.lineTo(15,-33);ctx.lineTo(38,-12);ctx.lineTo(43,10);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(29,39,40,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-34,-11);ctx.lineTo(-24,-17);ctx.lineTo(-20,-27);ctx.moveTo(22,-29);ctx.lineTo(17,-18);ctx.lineTo(27,-8);ctx.moveTo(-4,-36);ctx.lineTo(2,-27);ctx.lineTo(-3,-16);ctx.stroke();
    ctx.fillStyle='#8f9c93';ctx.fillRect(-34,2,11,4);ctx.fillRect(21,-8,13,3);ctx.fillRect(-10,-29,9,3);
    ctx.fillStyle='#27363a';ctx.beginPath();ctx.moveTo(-29,16);ctx.lineTo(-26,-9);ctx.lineTo(-13,-27);ctx.lineTo(3,-31);ctx.lineTo(23,-22);ctx.lineTo(34,-3);ctx.lineTo(35,16);ctx.closePath();ctx.fill();
    ctx.fillStyle='#09131c';ctx.beginPath();ctx.moveTo(-21,16);ctx.lineTo(-18,-6);ctx.lineTo(-8,-19);ctx.lineTo(8,-22);ctx.lineTo(21,-12);ctx.lineTo(27,16);ctx.closePath();ctx.fill();
    // Timber portal frame with iron brackets, bolts and diagonal braces.
    ctx.fillStyle='#3d291e';ctx.fillRect(-31,-22,7,42);ctx.fillRect(24,-22,7,42);ctx.fillRect(-32,-27,64,7);
    ctx.fillStyle='#a77949';ctx.fillRect(-29,-21,4,39);ctx.fillRect(25,-21,4,39);ctx.fillRect(-28,-26,56,4);
    ctx.strokeStyle='#56351f';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-27,-17);ctx.lineTo(-7,-2);ctx.moveTo(27,-17);ctx.lineTo(7,-2);ctx.stroke();
    ctx.fillStyle='#c6b28d';for(const bx of [-27,27])for(const by of [-22,15]){ctx.beginPath();ctx.arc(bx,by,1.7,0,Math.PI*2);ctx.fill();}
    // Crystal seams glow inside the cliff; these are decorative only.
    for(const [cx,cy,color] of [[-39,-13,'#8bd8e8'],[39,-4,'#c59bfa'],[-24,9,'#e3bd69']]){
      ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(cx,cy-6);ctx.lineTo(cx+4,cy-1);ctx.lineTo(cx+2,cy+5);ctx.lineTo(cx-3,cy+2);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
    }
    const glow=.65+.3*Math.sin(time/180);ctx.fillStyle='#5c3e28';ctx.fillRect(-43,-17,5,13);ctx.fillRect(38,-17,5,13);ctx.fillStyle='rgba(255,185,87,'+glow+')';ctx.shadowColor='#ffb85a';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(-41,-20,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(40,-20,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    // Short mine rails and an ore trolley complete the entrance silhouette.
    ctx.strokeStyle='#8b9592';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-19,17);ctx.lineTo(-13,31);ctx.moveTo(19,17);ctx.lineTo(13,31);ctx.stroke();
    ctx.strokeStyle='#574b3d';ctx.lineWidth=2;for(let i=0;i<4;i++){const yy=20+i*3;ctx.beginPath();ctx.moveTo(-18+i*.5,yy);ctx.lineTo(18-i*.5,yy);ctx.stroke();}
    ctx.fillStyle='#4b3425';ctx.fillRect(45,3,17,11);ctx.fillStyle='#98683b';ctx.fillRect(47,0,13,9);ctx.fillStyle='#68747a';ctx.beginPath();ctx.arc(49,16,3,0,Math.PI*2);ctx.arc(59,16,3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff0bd';ctx.font='900 13px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#101820';ctx.shadowBlur=5;ctx.fillText('ШАХТА',0,49);
    ctx.fillStyle='#d7e6c0';ctx.font='bold 10px Segoe UI';ctx.fillText('E · ВОЙТИ',0,62);ctx.textAlign='left';ctx.restore();
  }
  function drawTradeEntrance(camX,camY){
    const x=tradeEntranceX*TILE+16-camX,y=tradeEntranceY*TILE+16-camY;if(x<-120||x>width+120||y<-120||y>height+120)return;
    const time=performance.now(),pulse=.5+.5*Math.sin(time/260);ctx.save();ctx.translate(x,y);
    ctx.fillStyle='rgba(5,13,18,.38)';ctx.beginPath();ctx.ellipse(0,18,49,22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#45554e';ctx.beginPath();ctx.moveTo(-39,15);ctx.lineTo(-35,-21);ctx.lineTo(-22,-34);ctx.lineTo(22,-34);ctx.lineTo(35,-21);ctx.lineTo(39,15);ctx.closePath();ctx.fill();
    ctx.fillStyle='#8ca08c';ctx.fillRect(-30,-17,60,32);ctx.fillStyle='#516f66';ctx.fillRect(-24,-12,48,25);
    ctx.fillStyle='#172837';ctx.beginPath();ctx.moveTo(-17,14);ctx.lineTo(-15,-4);ctx.lineTo(-9,-12);ctx.lineTo(9,-12);ctx.lineTo(15,-4);ctx.lineTo(17,14);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#c8b17c';ctx.lineWidth=3;ctx.strokeRect(-32,-19,64,38);ctx.strokeStyle='rgba(235,215,163,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-26,-13);ctx.lineTo(-26,12);ctx.moveTo(26,-13);ctx.lineTo(26,12);ctx.stroke();
    ctx.fillStyle='rgba(112,218,194,'+(.18+pulse*.14)+')';ctx.shadowColor='#74e3ce';ctx.shadowBlur=18;ctx.beginPath();ctx.ellipse(0,2,25,19,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    for(let i=0;i<4;i++){const a=time/750+i*Math.PI/2;ctx.fillStyle='#f4d58b';ctx.beginPath();ctx.arc(Math.cos(a)*34,Math.sin(a)*13-3,2,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#f4d58b';ctx.font='900 12px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#101820';ctx.shadowBlur=6;ctx.fillText(tradeWorldMode?'В ДОЛИНУ':'МИР ТОРГОВЛИ',0,-42);
    ctx.font='bold 10px Segoe UI';ctx.fillText(tradeWorldMode?'E · ВЫЙТИ':'E · ВОЙТИ',0,48);ctx.textAlign='left';ctx.restore();
  }
  function drawPlacedStructures(camX,camY){
    for(const s of placedStructures){const x=s.x-camX,y=s.y-camY;if(x<-100||x>width+100||y<-100||y>height+100)continue;ctx.save();ctx.translate(x,y);
      if(s.type==='furnace'){
        const pulse=.55+.45*Math.sin(performance.now()/120);
        ctx.fillStyle='rgba(5,14,18,.34)';ctx.beginPath();ctx.ellipse(0,14,24,9,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#36434a';ctx.fillRect(-20,-18,40,34);ctx.fillStyle='#77878a';ctx.fillRect(-17,-15,34,27);
        ctx.strokeStyle='#3a4548';ctx.lineWidth=1;for(let row=0;row<3;row++){ctx.beginPath();ctx.moveTo(-16,-10+row*8);ctx.lineTo(16,-10+row*8);ctx.stroke();ctx.beginPath();ctx.moveTo(-7,-15+row*8);ctx.lineTo(-7,-7+row*8);ctx.moveTo(8,-15+row*8);ctx.lineTo(8,-7+row*8);ctx.stroke();}
        ctx.fillStyle='#222d32';ctx.fillRect(-10,-8,20,17);ctx.fillStyle='rgba(255,132,49,'+(.65+pulse*.3)+')';ctx.shadowColor='#ff7939';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(-7,7);ctx.quadraticCurveTo(-12,-3,-2,-10);ctx.quadraticCurveTo(0,-3,4,-9);ctx.quadraticCurveTo(12,2,0,9);ctx.fill();ctx.shadowBlur=0;
        ctx.fillStyle='#c0c9c6';ctx.fillRect(-6,-26,12,9);ctx.fillStyle='#49545a';ctx.fillRect(-8,-29,16,4);ctx.fillStyle='#fff0bd';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ПЕЧЬ',0,29);
      }
      else if(s.type==='house'){
        ctx.fillStyle='rgba(5,13,16,.36)';ctx.beginPath();ctx.ellipse(0,31,48,13,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#4d392b';ctx.fillRect(-40,-5,80,39);ctx.fillStyle='#a77a4e';ctx.fillRect(-36,-4,72,33);
        ctx.fillStyle='#6a442e';ctx.fillRect(-33,0,7,30);ctx.fillRect(26,0,7,30);ctx.fillRect(-31,24,62,5);
        ctx.fillStyle='#5a3930';ctx.beginPath();ctx.moveTo(-48,-5);ctx.lineTo(0,-42);ctx.lineTo(48,-5);ctx.closePath();ctx.fill();
        ctx.fillStyle='#a65f4a';ctx.beginPath();ctx.moveTo(-42,-7);ctx.lineTo(0,-38);ctx.lineTo(42,-7);ctx.lineTo(36,-1);ctx.lineTo(0,-31);ctx.lineTo(-36,-1);ctx.closePath();ctx.fill();
        ctx.strokeStyle='rgba(238,190,145,.42)';ctx.lineWidth=1;for(let row=0;row<3;row++){ctx.beginPath();ctx.moveTo(-33+row*3,-8+row*8);ctx.lineTo(33-row*3,-8+row*8);ctx.stroke();}
        ctx.fillStyle='#36505a';ctx.fillRect(-26,3,12,13);ctx.fillRect(14,3,12,13);ctx.fillStyle='#f5ce7b';ctx.fillRect(-24,5,8,9);ctx.fillRect(16,5,8,9);
        ctx.strokeStyle='#dfc18b';ctx.lineWidth=2;ctx.strokeRect(-28,1,16,17);ctx.strokeRect(12,1,16,17);
        ctx.fillStyle='#382820';ctx.fillRect(-7,8,14,26);ctx.fillStyle='#d8b678';ctx.fillRect(4,20,2,3);
        ctx.fillStyle='#7a5133';ctx.fillRect(30,-28,8,23);ctx.fillStyle='#c18a52';ctx.fillRect(28,-32,12,4);
        ctx.fillStyle='#fff0bd';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ДОМ',0,-47);
      }
      else if(s.type==='anvil'){
        ctx.fillStyle='rgba(6,13,18,.35)';ctx.beginPath();ctx.ellipse(0,15,24,8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#303941';ctx.fillRect(-19,-7,38,22);ctx.fillStyle='#657680';ctx.fillRect(-14,-5,28,16);
        ctx.fillStyle='#8396a2';ctx.fillRect(-23,-17,46,12);ctx.fillStyle='#dbe8ed';ctx.fillRect(-12,-21,24,5);
        ctx.fillStyle='#e9f1ed';ctx.fillRect(-18,-15,36,2);ctx.fillStyle='#34434e';ctx.fillRect(-4,-7,8,18);
        ctx.fillStyle='#fff0bd';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('НАКОВАЛЬНЯ',0,30);
      }
      else if(s.type==='torch'){ctx.fillStyle='#67452c';ctx.fillRect(-3,-2,6,18);ctx.fillStyle=`rgba(255,${150+Math.floor(Math.sin(performance.now()/75)*25)},66,.96)`;ctx.beginPath();ctx.moveTo(0,-20+Math.sin(performance.now()/90)*2);ctx.quadraticCurveTo(-11,-8,-2,-4);ctx.quadraticCurveTo(1,-12,4,-5);ctx.quadraticCurveTo(13,-14,0,-20);ctx.fill();ctx.fillStyle='#ffe9a1';ctx.fillRect(-1,-13,2,7);}
      else if(s.type==='coal'){
        ctx.fillStyle='rgba(5,10,14,.3)';ctx.beginPath();ctx.ellipse(0,12,19,7,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#20272c';ctx.beginPath();ctx.moveTo(-16,9);ctx.lineTo(-14,-1);ctx.lineTo(-6,-13);ctx.lineTo(5,-16);ctx.lineTo(16,-4);ctx.lineTo(17,9);ctx.closePath();ctx.fill();
        for(const [cx,cy,rr] of [[-8,0,5],[0,-8,6],[8,3,5],[-1,5,4]]){ctx.fillStyle='#414c52';ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(196,213,216,.24)';ctx.beginPath();ctx.arc(cx-1,cy-2,rr*.42,0,Math.PI*2);ctx.fill();}
      }
      else if(s.type==='storage'){
        ctx.fillStyle='rgba(5,13,18,.38)';ctx.beginPath();ctx.ellipse(0,14,25,8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#3f2b21';ctx.fillRect(-20,-7,40,24);ctx.fillStyle='#8b5b33';ctx.fillRect(-18,-8,36,20);
        ctx.fillStyle='#bb8349';ctx.fillRect(-18,-11,36,5);ctx.fillRect(-18,9,36,4);
        ctx.fillStyle='#4c3425';for(const bx of [-12,-4,4,12])ctx.fillRect(bx,-5,2,13);
        ctx.strokeStyle='#d4b77c';ctx.lineWidth=2;ctx.strokeRect(-19,-8,38,21);ctx.fillStyle='#e7c878';ctx.fillRect(-4,-7,8,18);
        ctx.fillStyle='#fff0b0';ctx.beginPath();ctx.arc(0,1,2.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff2b0';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('СУНДУК',0,29);
      }
      else if(s.type==='village-watchtower'){
        const level=Math.max(1,Math.min(3,Number(s.watchtowerLevel)||1)),hp=Math.max(0,Number.isFinite(s.hp)?s.hp:360+(level-1)*120),maxHp=Math.max(1,Number(s.maxHp)||360+(level-1)*120),angle=Number.isFinite(s.watchtowerAngle)?s.watchtowerAngle:-Math.PI/2,active=hp>0,now=performance.now(),pulse=.5+.5*Math.sin(now/190),damageRatio=1-hp/maxHp;
        const stone=level===3?'#71818b':level===2?'#806e5b':'#74604e',wood=level===3?'#76533b':level===2?'#8a603d':'#956943',trim=level===3?'#b8cbd0':level===2?'#d1ad70':'#c69a62';
        ctx.fillStyle='rgba(5,13,19,.34)';ctx.beginPath();ctx.ellipse(0,34,43,13,0,0,Math.PI*2);ctx.fill();
        // Layered stone foundation, individual masonry blocks and mortar.
        ctx.fillStyle='#3d4141';ctx.beginPath();ctx.moveTo(-31,17);ctx.lineTo(-27,5);ctx.lineTo(27,5);ctx.lineTo(32,17);ctx.lineTo(29,35);ctx.lineTo(-29,35);ctx.closePath();ctx.fill();
        ctx.fillStyle=stone;ctx.fillRect(-29,8,58,25);ctx.fillStyle='#a99a7c';ctx.fillRect(-30,7,60,4);
        ctx.strokeStyle='rgba(28,31,31,.8)';ctx.lineWidth=1.4;for(let row=0;row<3;row++){const yy=12+row*7;ctx.beginPath();ctx.moveTo(-29,yy);ctx.lineTo(29,yy);ctx.stroke();for(let bx=-22+(row%2)*9;bx<28;bx+=18){ctx.beginPath();ctx.moveTo(bx,yy-5);ctx.lineTo(bx,yy);ctx.stroke();}}
        ctx.fillStyle='#c2b08d';ctx.fillRect(-26,9,12,2);ctx.fillRect(8,16,14,2);ctx.fillRect(-19,25,10,2);
        // Tall timber frame with visible beams and cross braces.
        ctx.fillStyle='#4a3024';ctx.fillRect(-23,-25,46,34);ctx.fillStyle=wood;ctx.fillRect(-19,-25,38,33);
        ctx.fillStyle='#b88957';ctx.fillRect(-15,-23,4,29);ctx.fillRect(11,-23,4,29);ctx.fillRect(-18,-13,36,3);ctx.fillRect(-18,0,36,3);
        ctx.strokeStyle='#4c3024';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-17,-19);ctx.lineTo(17,5);ctx.moveTo(17,-19);ctx.lineTo(-17,5);ctx.stroke();
        ctx.strokeStyle='#d0a16a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-15,-18);ctx.lineTo(14,3);ctx.moveTo(15,-18);ctx.lineTo(-14,3);ctx.stroke();
        // Narrow lit windows and the ladder/entry.
        ctx.fillStyle='#26313a';ctx.fillRect(-14,-18,8,10);ctx.fillRect(6,-18,8,10);ctx.fillStyle=active?'#f4bd68':'#4a4a48';ctx.shadowColor=active?'#ffb64d':'transparent';ctx.shadowBlur=active?9:0;ctx.fillRect(-12,-16,4,6);ctx.fillRect(8,-16,4,6);ctx.shadowBlur=0;
        ctx.fillStyle='#38271f';ctx.fillRect(-5,5,10,29);ctx.fillStyle='#b68b5b';ctx.fillRect(-4,7,2,25);ctx.fillRect(2,7,2,25);
        // Upper fighting platform, railings and crenellated parapet.
        ctx.fillStyle='#4b3024';ctx.fillRect(-31,-31,62,9);ctx.fillStyle=trim;ctx.fillRect(-29,-33,58,4);ctx.fillStyle=wood;ctx.fillRect(-27,-42,54,11);
        ctx.fillStyle='#4c3327';for(let bx=-26;bx<=22;bx+=12)ctx.fillRect(bx,-47,7,12);ctx.fillStyle=trim;ctx.fillRect(-29,-48,58,3);
        ctx.fillStyle='#6d4a31';ctx.fillRect(-32,-35,5,12);ctx.fillRect(27,-35,5,12);
        // Roof canopy with layered shingles and ridge cap.
        ctx.fillStyle='#382a27';ctx.beginPath();ctx.moveTo(-34,-48);ctx.lineTo(0,-68);ctx.lineTo(34,-48);ctx.lineTo(29,-44);ctx.lineTo(-29,-44);ctx.closePath();ctx.fill();
        ctx.fillStyle=level===3?'#526b78':level===2?'#7a5140':'#80513a';ctx.beginPath();ctx.moveTo(-30,-49);ctx.lineTo(0,-66);ctx.lineTo(30,-49);ctx.lineTo(25,-46);ctx.lineTo(-25,-46);ctx.closePath();ctx.fill();
        ctx.strokeStyle='rgba(225,190,135,.55)';ctx.lineWidth=1;for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(k*8,-51-Math.max(0,3-Math.abs(k))*2);ctx.lineTo(k*6,-46);ctx.stroke();}
        ctx.fillStyle='#d4b17a';ctx.fillRect(-4,-67,8,3);
        // Village banner, level insignia and flutter.
        ctx.strokeStyle='#d8c29a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-67);ctx.lineTo(0,-83);ctx.stroke();ctx.fillStyle=level===3?'#4f9db5':level===2?'#a45b43':'#557c4e';ctx.beginPath();ctx.moveTo(1,-82);ctx.lineTo(17,-78+Math.sin(now/210)*2);ctx.lineTo(13,-69);ctx.lineTo(1,-73);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(245,220,160,.8)';ctx.lineWidth=1;ctx.stroke();
        // Rotating ballista and its aiming rail.
        ctx.save();ctx.translate(0,-42);ctx.rotate(angle);ctx.fillStyle='#38291f';ctx.fillRect(-5,-18,10,31);ctx.fillStyle='#b7c8ca';ctx.fillRect(-3,-22,6,29);ctx.fillStyle='#d4b47c';ctx.fillRect(-2,-25,4,8);ctx.strokeStyle='#4b3024';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-20,-14);ctx.quadraticCurveTo(0,-25,20,-14);ctx.stroke();ctx.strokeStyle='#d6c29a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-18,-14);ctx.lineTo(18,-14);ctx.stroke();ctx.fillStyle='#d8e5e5';ctx.beginPath();ctx.arc(0,-18,3,0,Math.PI*2);ctx.fill();ctx.restore();
        // Muzzle glint when firing, plus warm lanterns on both sides.
        if(active){ctx.fillStyle='rgba(255,207,119,'+(.35+pulse*.4)+')';ctx.shadowColor='#ffc56d';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,-43,2.5+pulse*1.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
        for(const side of [-1,1]){ctx.fillStyle='#493326';ctx.fillRect(side*25-2,-27,4,8);ctx.fillStyle='rgba(255,161,65,'+(.65+pulse*.3)+')';ctx.shadowColor='#ff9b42';ctx.shadowBlur=active?8:2;ctx.beginPath();ctx.arc(side*25,-29,2.5+pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
        // Damage cracks and broken timbers remain visible at low durability.
        if(damageRatio>.25){ctx.strokeStyle='rgba(32,20,17,.9)';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-17,-9);ctx.lineTo(-10,-3);ctx.lineTo(-14,3);ctx.moveTo(16,-23);ctx.lineTo(10,-17);ctx.lineTo(14,-12);ctx.stroke();}
        if(damageRatio>.62){ctx.fillStyle='#352720';ctx.fillRect(-23,-32,8,3);ctx.fillRect(15,-6,7,3);ctx.strokeStyle='#33231e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-24,4);ctx.lineTo(-18,12);ctx.stroke();}
        // Status plaque, level stars and readable durability bar.
        ctx.fillStyle='rgba(15,23,29,.88)';ctx.fillRect(-31,39,62,14);ctx.strokeStyle=level===3?'#8bd8ef':level===2?'#e7bd72':'#bca17a';ctx.lineWidth=1;ctx.strokeRect(-31,39,62,14);
        ctx.fillStyle='#fff0bd';ctx.font='bold 8px Segoe UI';ctx.textAlign='center';ctx.fillText(active?'ДОЗОР · '+['I','II','III'][level-1]:'БАШНЯ РАЗРУШЕНА',0,49);
        ctx.fillStyle='#1b2024';ctx.fillRect(-29,56,58,5);ctx.fillStyle=active?(level===3?'#72d8ef':'#79d28b'):'#e56d60';ctx.fillRect(-29,56,58*Math.max(0,hp/maxHp),5);
        if(level>1){ctx.fillStyle='#f4d28a';for(let star=0;star<level;star++){ctx.beginPath();ctx.arc(-5+(star-(level-1)/2)*9,-58,1.8,0,Math.PI*2);ctx.fill();}}
      }
      else if(s.type==='tech-generator'){
        ctx.fillStyle='#10202a';ctx.fillRect(-20,-17,40,34);ctx.fillStyle='#667d8b';ctx.fillRect(-17,-14,34,27);ctx.fillStyle='#243e4c';ctx.fillRect(-11,-9,22,16);ctx.fillStyle='#ffad53';ctx.shadowColor='#ff8b36';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(0,-1,5+Math.sin(performance.now()/120)*1.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#9db8c8';ctx.fillRect(10,-24,7,12);ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ГЕНЕРАТОР',0,29);
      }
      else if(s.type==='tech-solar'){
        const pulse=.65+.35*Math.sin(performance.now()/600);ctx.fillStyle='#354f65';ctx.fillRect(-24,-4,48,27);ctx.save();ctx.rotate(-.16);ctx.fillStyle='#275b86';ctx.fillRect(-23,-27,46,25);ctx.strokeStyle='#a6d9f2';ctx.lineWidth=2;for(let x=-15;x<=15;x+=10){ctx.beginPath();ctx.moveTo(x,-27);ctx.lineTo(x, -2);ctx.stroke();}ctx.beginPath();ctx.moveTo(-23,-15);ctx.lineTo(23,-15);ctx.stroke();ctx.restore();ctx.fillStyle='rgba(255,221,120,'+pulse*.55+')';ctx.beginPath();ctx.arc(18,-28,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('СОЛНЦЕ',0,34);
      }
      else if(s.type==='tech-processor'){
        ctx.fillStyle='#263a4b';ctx.fillRect(-23,-17,46,34);ctx.fillStyle='#687e8c';ctx.fillRect(-19,-13,38,26);ctx.fillStyle='#b66c3e';ctx.fillRect(-12,-8,24,16);ctx.fillStyle='#ffd28a';ctx.shadowColor='#ffb35d';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(0,0,5+Math.sin(performance.now()/130),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#aebfc8';ctx.fillRect(-9,-24,18,7);ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ОБОГАТИТЕЛЬ',0,31);
      }
      else if(s.type==='tech-battery'){
        ctx.fillStyle='#1b3445';ctx.fillRect(-16,-23,32,45);ctx.fillStyle='#8bdcf3';ctx.fillRect(-11,-17,22,32);ctx.fillStyle='#163b4a';ctx.fillRect(-6,-12,12,22);ctx.fillStyle='#f1df8f';ctx.fillRect(-5,-27,10,5);ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('АКБ',0,31);
      }
      else if(s.type==='tech-lamp'){
        ctx.fillStyle='#586f7c';ctx.fillRect(-3,-2,6,25);ctx.fillStyle='#bfefff';ctx.fillRect(-8,-17,16,14);ctx.fillStyle='rgba(127,221,255,.18)';ctx.beginPath();ctx.arc(0,-10,24,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('СВЕТ',0,34);
      }
      else if(s.type==='tech-turret'){
        ctx.fillStyle='#263b4a';ctx.beginPath();ctx.arc(0,6,18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7394a5';ctx.fillRect(-11,-4,22,19);ctx.save();ctx.rotate(-Math.PI/4);ctx.fillStyle='#b3c6ce';ctx.fillRect(-4,-24,8,27);ctx.restore();ctx.fillStyle='#ffcf7b';ctx.beginPath();ctx.arc(0,-2,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ТУРЕЛЬ',0,31);
      }
      else if(s.type==='tech-drill'){
        ctx.fillStyle='#405461';ctx.fillRect(-17,-15,34,27);ctx.fillStyle='#94aab3';ctx.fillRect(-10,-23,20,10);ctx.strokeStyle='#e3c77e';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(0,-30);ctx.stroke();ctx.fillStyle='#a9dff4';ctx.beginPath();ctx.moveTo(-5,-29);ctx.lineTo(5,-29);ctx.lineTo(0,-38);ctx.closePath();ctx.fill();ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('БУР',0,25);
      }
      else if(s.type==='tech-shield'){
        ctx.fillStyle='#26465a';ctx.fillRect(-19,-8,38,21);ctx.strokeStyle='rgba(93,205,255,.9)';ctx.lineWidth=3;ctx.shadowColor='#5acaff';ctx.shadowBlur=14;ctx.beginPath();ctx.ellipse(0,-4,27,34,0,Math.PI,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#c4f1ff';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ЩИТ',0,29);
      }
      else if(s.type==='tech-wall'){
        ctx.fillStyle='#596b78';ctx.fillRect(-27,-15,54,30);ctx.fillStyle='#8397a3';ctx.fillRect(-25,-13,24,11);ctx.fillRect(2,-13,23,11);ctx.fillRect(-12,1,24,11);ctx.strokeStyle='#364753';ctx.lineWidth=2;ctx.strokeRect(-27,-15,54,30);ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('СТЕНА',0,26);
      }
      else if(s.type==='tech-guardpost'){
        ctx.fillStyle='#243746';ctx.fillRect(-24,-18,48,34);ctx.fillStyle='#61798a';ctx.fillRect(-20,-14,40,27);ctx.fillStyle='#b3c5cf';ctx.fillRect(-18,-22,36,8);ctx.fillStyle='#e0bd77';ctx.fillRect(-4,-10,8,17);
        for(let i=0;i<2;i++){const gx=i?13:-13,gy=-2+Math.sin(performance.now()/220+i)*1.2;ctx.fillStyle='#d1a879';ctx.beginPath();ctx.arc(gx,gy-12,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#345c77';ctx.fillRect(gx-4,gy-8,8,14);ctx.strokeStyle='#cbd8df';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gx+(i?3:-3),gy-4);ctx.lineTo(gx+(i?7:-7),gy+8);ctx.stroke();}
        ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('СТРАЖА ×2',0,29);
      }
      else if(s.type==='tech-trap'){
        const pulse=Math.sin(performance.now()/110);ctx.fillStyle='#253944';ctx.beginPath();ctx.arc(0,2,19,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#75dfff';ctx.lineWidth=3;ctx.shadowColor='#56d9ff';ctx.shadowBlur=10;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*7,Math.sin(a)*7);ctx.lineTo(Math.cos(a)*(15+pulse),Math.sin(a)*(15+pulse));ctx.stroke();}ctx.shadowBlur=0;ctx.fillStyle='#e7faff';ctx.beginPath();ctx.arc(0,2,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ЛОВУШКА',0,29);
      }
      else if(s.type==='farmplot'){ctx.fillStyle='#6e4a2e';ctx.fillRect(-20,-13,40,26);ctx.fillStyle='#a57a49';ctx.fillRect(-17,-10,34,20);for(let i=0;i<3;i++){ctx.fillStyle='#5b3c25';ctx.fillRect(-14+i*13,-9,3,18);}const stage=Math.max(0,Math.min(3,s.stage||0));if(stage>0){for(let i=0;i<3;i++){const gx=-10+i*10,gh=stage*4;ctx.fillStyle=stage===3?'#e5c65d':'#5ebd65';ctx.fillRect(gx-2,-8-gh,4,gh+7);ctx.beginPath();ctx.ellipse(gx-4,-7-gh/2,5,2,-.45,0,Math.PI*2);ctx.ellipse(gx+4,-5-gh/2,5,2,.45,0,Math.PI*2);ctx.fill();if(stage===3){ctx.fillStyle='#f2d86a';ctx.fillRect(gx-3,-12,6,5);}}}ctx.fillStyle='#f6e2a1';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText(stage>=3?'E · СОБРАТЬ':'РОСТ '+stage+'/3',0,28);}
      if(Number.isFinite(s.maxHp)&&s.maxHp>0&&Number.isFinite(s.hp)&&s.hp<s.maxHp){const ratio=Math.max(0,s.hp/s.maxHp);ctx.fillStyle='#21151a';ctx.fillRect(-25,-42,50,5);ctx.fillStyle='#ef765f';ctx.fillRect(-25,-42,50*ratio,5);if(ratio<.72){ctx.strokeStyle='rgba(32,18,17,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-13,-6);ctx.lineTo(-3,3);ctx.lineTo(4,-4);ctx.lineTo(13,8);ctx.stroke();}}
      ctx.restore();
    }
    for(const shot of villageTowerProjectiles){const x=shot.x-camX,y=shot.y-camY;if(x<-25||x>width+25||y<-25||y>height+25)continue;ctx.save();ctx.translate(x,y);ctx.rotate(shot.angle||0);ctx.strokeStyle=shot.color||'#f4d18b';ctx.lineWidth=3;ctx.shadowColor=shot.color||'#ffbd62';ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(8,0);ctx.stroke();ctx.fillStyle='#fff0bf';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(5,-4);ctx.lineTo(5,4);ctx.closePath();ctx.fill();ctx.restore();}
  }
  function canPlaceAt(x,y,ignorePlayerDistance=false){const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);if(tx<2||ty<2||tx>=COLS-2||ty>=ROWS-2||waterAt(tx+.5,ty+.5))return false;if(tradeWorldMode)return false;const hx=36*TILE-120,hy=15*TILE-120;if(x>hx-45&&x<hx+365&&y>hy-45&&y<hy+330)return false;if(world.trees.some(t=>Math.hypot(t.x-x,t.y-y)<48)||world.rocks.some(r=>Math.hypot(r.x-x,r.y-y)<35))return false;if(placedStructures.some(s=>Math.hypot(s.x-x,s.y-y)<(s.type==='house'||s.type==='furnace'?60:30)))return false;return ignorePlayerDistance||Math.hypot(player.x-x,player.y-y)>65;}
  function queueGuestStructurePlacement(type,x,y,item){
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(!room||room.status!=='running'){toast('Сначала дождись запуска комнаты.');return true;}
    if(typeof network.enqueueWorldAction!=='function'){toast('Очередь построек пока недоступна.');return true;}
    if(item.count<1){toast('Не хватает предметов для постройки.');return true;}
    const actionId=window.crypto?.randomUUID?.();
    if(!actionId){toast('Не удалось безопасно подготовить запрос.');return true;}
    const key=saveKey+'_coop_pending_world_actions';let pending=[];
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))pending=value;}catch(_){}
    if(pending.length>=20){toast('Сначала дождись обработки предыдущих построек.');return true;}
    pending.push({action_id:actionId,item_name:item.name});
    try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){toast('Не удалось сохранить очередь действий на этом устройстве.');return true;}
    item.count--;renderInventory();
    if(!saveGame()){
      item.count++;pending=pending.filter(entry=>entry.action_id!==actionId);
      try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){}
      renderInventory();return true;
    }
    network.enqueueWorldAction('place_structure',{type,x,y},actionId).then(action=>{
      if(!action?.action_id)throw new Error('Сервер не вернул ID запроса.');
      toast('Запрос на постройку отправлен владельцу. Предмет временно зарезервирован.');
    }).catch(error=>{
      if(error?.code&&!['INTERNAL_ERROR','COOP_BACKEND_ERROR'].includes(error.code)){
        const itemToReturn=inventoryItems.find(entry=>entry.name===item.name);
        if(itemToReturn)itemToReturn.count++;
        const left=pending.filter(entry=>entry.action_id!==actionId);
        try{localStorage.setItem(key,JSON.stringify(left));}catch(_){}
        renderInventory();saveGame();
      }
      toast(error?.message||'Не удалось отправить запрос. Проверяю его статус перед возвратом предмета.');
    });
    return true;
  }
  function placeSelectedStructure(ev){
    if(inMainMenu||paused||inHouse||mineMode||tradeWorldMode||inventoryDialogOpen||shopDialogOpen||workbenchDialogOpen)return false;
    const item=inventoryItems.filter(i=>i.count>0)[selectedSlot-1];
    const types={'Печь':'furnace','Комплект дома':'house','Факел':'torch','Угольный блок':'coal','Сундук-хранилище':'storage','Грядка с семенами':'farmplot','Наковальня':'anvil'};
    if(!item||!types[item.name])return false;
    const rect=canvas.getBoundingClientRect(),sx=ev.clientX-rect.left,sy=ev.clientY-rect.top;
    const camX=Math.max(0,Math.min(COLS*TILE-width,player.x-width/2)),camY=Math.max(0,Math.min(ROWS*TILE-height,player.y-height/2));
    const x=Math.round((sx+camX)/TILE)*TILE+16,y=Math.round((sy+camY)/TILE)*TILE+16;
    if(!canPlaceAt(x,y)){toast('Здесь нельзя строить. Выбери свободное место подальше от воды, деревьев и дома.');return true;}
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(room&&!network.isRoomOwner)return queueGuestStructurePlacement(types[item.name],x,y,item);
    placedStructures.push({type:types[item.name],x,y,stage:0,growSeconds:0,contents:{},crop:null,moisture:0,fertilized:false});
    window.SkyRealmJobs?.record?.('builder',1);
    item.count--;playSound('craft');renderInventory();saveGame();drawMinimap();toast(item.name+' установлен!');return true;
  }
  function drawTradeShop(shop,camX,camY,title,subtitle,accent){if(!tradeWorldMode)return;const x=shop.x*TILE+16-camX,y=shop.y*TILE+16-camY;if(x<-150||x>width+150||y<-150||y>height+150)return;ctx.save();ctx.translate(x,y);ctx.fillStyle='rgba(4,13,18,.35)';ctx.beginPath();ctx.ellipse(0,22,49,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6f4a2d';ctx.fillRect(-42,-16,84,43);ctx.fillStyle='#c18b4d';ctx.fillRect(-37,-11,74,31);ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-49,-17);ctx.lineTo(-35,-42);ctx.lineTo(35,-42);ctx.lineTo(49,-17);ctx.closePath();ctx.fill();ctx.fillStyle='#4b3024';ctx.fillRect(-13,-6,26,33);ctx.fillStyle='#ffedb0';ctx.fillRect(-31,-5,12,11);ctx.fillRect(19,-5,12,11);ctx.fillStyle='#fff0b8';ctx.font='900 12px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(title,0,-50);ctx.shadowBlur=0;ctx.font='bold 10px Segoe UI';ctx.fillStyle='#fff8df';ctx.fillText(subtitle,0,42);ctx.textAlign='left';ctx.restore();
  }
  function updateWalletHud(){const el=document.getElementById('wallet-value');if(el)el.textContent=formatMoney(walletCents);const wrap=document.getElementById('wallet-hud');if(wrap)wrap.hidden=!currentWorldId;}
  function drawMineSkyWindow(time=performance.now()){
    // A narrow ceiling shaft gives the underground mine a visible view of the sky.
    const x=width-78,y=112,rx=31,ry=23,night=isNightTime();
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='rgba(0,0,0,.62)';ctx.beginPath();ctx.ellipse(0,2,rx+7,ry+7,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.clip();
    const sky=ctx.createLinearGradient(0,-ry,0,ry);sky.addColorStop(0,night?'#101d3b':'#79a9c5');sky.addColorStop(1,night?'#354a72':'#d9c78b');ctx.fillStyle=sky;ctx.fillRect(-rx,-ry,rx*2,ry*2);
    if(night){
      for(let i=0;i<9;i++){const sx=(hash(i+mineSeed,mineDepth*17)-.5)*rx*1.7,sy=(hash(i+mineDepth,mineSeed*3)-.5)*ry*1.5;ctx.fillStyle='rgba(245,248,255,.9)';ctx.fillRect(sx,sy,1.5,1.5);}
      ctx.shadowColor='#e5edff';ctx.shadowBlur=13;ctx.fillStyle='#f3f0d7';ctx.beginPath();ctx.arc(4,-1,13,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='#263b61';ctx.beginPath();ctx.arc(10,-7,12,0,Math.PI*2);ctx.fill();
    }else{ctx.shadowColor='#ffe6a0';ctx.shadowBlur=12;ctx.fillStyle='#ffe5a0';ctx.beginPath();ctx.arc(4,-1,10,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    ctx.restore();
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#647078';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(0,0,rx+2,ry+2,0,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='rgba(194,205,194,.35)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(-1,-1,rx-2,ry-2,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function drawMineElevator(time=performance.now()){
    if(!mineMode||mineDepth<=1)return;
    const entranceX=1.5*MINE_CELL_SIZE,entranceY=(MINE_MAZE_ROWS-1.5)*MINE_CELL_SIZE;
    const p=mineWorldToScreen(entranceX,entranceY),x=p.x,y=p.y;
    if(x<-90||x>width+90||y<-90||y>height+90)return;
    const pulse=.5+.5*Math.sin(time/240);
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=.9;
    ctx.fillStyle='rgba(5,10,15,.75)';ctx.fillRect(-29,-34,58,62);
    ctx.strokeStyle='#a8b7bd';ctx.lineWidth=4;ctx.strokeRect(-25,-30,50,56);
    ctx.fillStyle='#52636b';ctx.fillRect(-19,-24,38,45);
    ctx.strokeStyle='#d4b477';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-18,-19);ctx.lineTo(18,-19);ctx.moveTo(-18,17);ctx.lineTo(18,17);ctx.stroke();
    ctx.fillStyle='#ffe29a';ctx.shadowColor='#ffd36c';ctx.shadowBlur=8+pulse*5;ctx.beginPath();ctx.arc(0,-7,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#f6e4bb';ctx.font='900 11px Segoe UI';ctx.textAlign='center';ctx.fillText('ЛИФТ ↑',0,-43);
    ctx.font='700 9px Segoe UI';ctx.fillStyle='#cbd7df';ctx.fillText('E · НА ПОВЕРХНОСТЬ',0,43);
    ctx.restore();
  }
  function mineUndercityChestPosition(){return {x:(MINE_MAZE_COLS-1.5)*MINE_CELL_SIZE,y:1.5*MINE_CELL_SIZE};}
  function mineUndercityLayout(){
    if(mineUndercityLayoutCache&&mineUndercityLayoutCache.seed===mineSeed&&mineUndercityLayoutCache.depth===mineDepth)return mineUndercityLayoutCache;
    const defs=[{i:2,label:'АРХОНТСКИЙ ДВОРЕЦ',color:'#a98be8'},{i:5,label:'ЗАЛ КРИСТАЛЛОВ',color:'#6bd8e8'},{i:8,label:'СТАРАЯ КУЗНИЦА',color:'#df9b65'},{i:11,label:'ЗАТОНУВШИЙ АРХИВ',color:'#8ab7dc'}];
    mineUndercityLayoutCache={seed:mineSeed,depth:mineDepth,sites:defs.map(site=>({...site,pos:mineFeaturePoint(site.i,mineSeed+811,8)})),chest:mineUndercityChestPosition()};
    return mineUndercityLayoutCache;
  }
  function drawMineUndercity(time=performance.now()){
    if(mineDepth!==8)return;
    const layout=mineUndercityLayout();
    for(const site of layout.sites){const p=mineWorldToScreen(site.pos.x,site.pos.y);if(p.x<-90||p.x>width+90||p.y<-100||p.y>height+100)continue;ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.zoom,p.zoom);ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(0,18,36,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#282a35';ctx.fillRect(-27,-17,54,34);ctx.fillStyle='#4b4b5b';ctx.fillRect(-23,-14,46,28);ctx.fillStyle='#777184';ctx.fillRect(-29,-23,58,8);ctx.fillStyle=site.color;ctx.shadowColor=site.color;ctx.shadowBlur=12;ctx.fillRect(-5,-12,10,23);ctx.shadowBlur=0;ctx.fillStyle='#c8b9a0';ctx.fillRect(-32,-30,8,13);ctx.fillRect(24,-30,8,13);ctx.fillStyle='#f2e4c2';ctx.font='bold 7px Segoe UI';ctx.textAlign='center';ctx.fillText(site.label,0,31);ctx.restore();}
    const chest=mineWorldToScreen(layout.chest.x,layout.chest.y);ctx.save();ctx.translate(chest.x,chest.y);ctx.scale(chest.zoom,chest.zoom);ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(0,14,22,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=mineUndercityChestOpened?'#51473c':'#49324f';ctx.fillRect(-17,-5,34,20);ctx.fillStyle=mineUndercityChestOpened?'#776b62':'#8d6bb1';ctx.fillRect(-17,-13,34,10);ctx.fillStyle='#f0d27a';ctx.fillRect(-4,-6,8,15);if(!mineUndercityChestOpened){ctx.shadowColor='#9e8bff';ctx.shadowBlur=16+Math.sin(time/170)*4;ctx.fillStyle='#e6d9ff';ctx.fillRect(-2,-11,4,6);}ctx.fillStyle='#fff0d5';ctx.font='bold 8px Segoe UI';ctx.textAlign='center';ctx.fillText(mineUndercityChestOpened?'СОКРОВИЩЕ':'СУНДУК ГОРОДА · E',0,30);ctx.restore();
  }
  function openMineUndercityChest(){if(mineDepth!==8||mineUndercityChestOpened)return false;mineUndercityChestOpened=true;walletCents+=35000;changeItem('Мифрил',5);changeItem('Алмаз',3);changeItem('Кристалл',6);changeItem('Эссенция глубин',3);changeItem('Реликвия руин',1);awardXP(420,'сокровища Подземного города');spawnVisualBurst(minePlayerX,minePlayerY,32,'spark','#c8a9ff');renderInventory();saveGame();toast('СОКРОВИЩНИЦА ПОДЗЕМНОГО ГОРОДА: 350 золота, мифрил ×5, алмазы ×3, кристаллы ×6 и реликвия!');return true;}
  function drawMineInterior(dt=1/60,time=performance.now()){
    const grad=ctx.createLinearGradient(0,0,0,height);grad.addColorStop(0,'#0c141e');grad.addColorStop(1,'#202623');ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
    drawMinePassages();drawMineUndercity(time);drawMineElevator(time);
    drawMineSkyWindow(time);
    drawMineBarrels();drawMineCreatures();
    const oreColors={'Кристалл':'#276c91','Железо':'#777c8a','Уголь':'#252a32','Медь':'#a85e35','Олово':'#aab4bd','Серебро':'#d8e0eb','Золото':'#b68b20','Рубин':'#9c243f','Сапфир':'#245bc4','Обсидиан':'#302343','Мифрил':'#59bfc8','Уран':'#5a9a3e','Алмаз':'#6ee9f0'};
    const oreGlow={'Кристалл':'#8ae6ff','Железо':'#d4a29b','Уголь':'#858b96','Медь':'#ffc08a','Олово':'#eef4ff','Серебро':'#ffffff','Золото':'#ffe68a','Рубин':'#ff829a','Сапфир':'#9bc8ff','Обсидиан':'#ad8bdf','Мифрил':'#d1ffff','Уран':'#baff7d','Алмаз':'#ffffff'};
    mineRocks.forEach((r,i)=>{if(r.hp<=0)return;const pos=mineRockScreenPosition(r),x=pos.x,y=pos.y,z=pos.zoom;if(x<-50||x>width+50||y<-50||y>height+50)return;const base=oreColors[r.ore]||'#877967',glint=oreGlow[r.ore]||'#cbb59a',rare=['Кристалл','Золото','Рубин','Сапфир','Обсидиан','Мифрил','Уран','Алмаз'].includes(r.ore);
      ctx.save();ctx.translate(x,y);ctx.scale(z,z);
      ctx.fillStyle='rgba(0,0,0,.48)';ctx.beginPath();ctx.ellipse(0,10,17,7,0,0,Math.PI*2);ctx.fill();
      if(rare){ctx.shadowColor=glint;ctx.shadowBlur=9+Math.sin(time/170+i)*2;ctx.fillStyle=glint;ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(0,-1,22,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.shadowBlur=0;}
      // Jagged host rock with a dark bevel, lighter upper face and broken edges.
      ctx.fillStyle='#292c31';ctx.beginPath();ctx.moveTo(-15,8);ctx.lineTo(-13,-5);ctx.lineTo(-7,-13);ctx.lineTo(2,-15);ctx.lineTo(14,-7);ctx.lineTo(16,5);ctx.lineTo(7,13);ctx.lineTo(-8,12);ctx.closePath();ctx.fill();
      ctx.fillStyle=base;ctx.beginPath();ctx.moveTo(-12,5);ctx.lineTo(-10,-5);ctx.lineTo(-5,-11);ctx.lineTo(3,-12);ctx.lineTo(12,-6);ctx.lineTo(13,2);ctx.lineTo(6,9);ctx.lineTo(-7,9);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.19)';ctx.beginPath();ctx.moveTo(-10,-5);ctx.lineTo(-5,-11);ctx.lineTo(3,-12);ctx.lineTo(0,-5);ctx.lineTo(-5,0);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.moveTo(2,-5);ctx.lineTo(12,-6);ctx.lineTo(13,2);ctx.lineTo(6,9);ctx.lineTo(0,5);ctx.closePath();ctx.fill();
      // Individual mineral shards protrude from the ore seam.
      const shard=rare?glint:'#c7c5bc';ctx.fillStyle=shard;ctx.beginPath();ctx.moveTo(-7,1);ctx.lineTo(-5,-10);ctx.lineTo(-1,-5);ctx.lineTo(0,3);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(2,5);ctx.lineTo(5,-9);ctx.lineTo(9,-2);ctx.lineTo(7,6);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.moveTo(-5,-9);ctx.lineTo(-3,-5);ctx.lineTo(-4,-1);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(5,-8);ctx.lineTo(7,-3);ctx.lineTo(6,0);ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(15,18,21,.75)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-12,7);ctx.lineTo(-8,3);ctx.lineTo(-6,8);ctx.moveTo(10,-4);ctx.lineTo(7,1);ctx.stroke();
      if(r.hp<2){ctx.strokeStyle='#ffe09a';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-4,-12);ctx.lineTo(-1,-2);ctx.lineTo(-6,5);ctx.stroke();}
      if(i===mineHoverIndex){ctx.strokeStyle='#ffe09a';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
      if(i===mineHoverIndex){ctx.fillStyle='#fff0c9';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#111';ctx.shadowBlur=4;ctx.fillText(r.ore+' · '+r.hp+'/2',x,y+25*z);ctx.shadowBlur=0;ctx.textAlign='left';}
    });
    // Reuse the exact same appearance/equipment renderer as the surface world.
    // The camera offset places the normal world player sprite precisely at the mine viewport centre.
    drawPlayer(player.x-width/2,player.y-height/2,dt);
    drawRemotePlayers(0,0);
    // Cave vignette keeps the lantern pools and ore highlights readable without hiding the maze.
    const vignette=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.18,width/2,height/2,Math.max(width,height)*.72);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.48)');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='rgba(7,12,18,.86)';ctx.fillRect(18,14,Math.min(460,width-36),62);
    ctx.strokeStyle='rgba(213,174,117,.4)';ctx.lineWidth=1;ctx.strokeRect(18,14,Math.min(460,width-36),62);
    ctx.fillStyle='#f0d8a6';ctx.font='bold 17px Segoe UI';ctx.fillText('ШАХТА · ГЛУБИНА '+mineDepth+' / 8 · УЛУЧШЕНИЕ '+mineLevel+'/8',32,38);
    ctx.fillStyle='#b7c6d7';ctx.font='12px Segoe UI';ctx.fillText('Найди лестницу в глубине лабиринта · E — взаимодействие',32,58);
    ctx.fillStyle='rgba(7,12,18,.82)';ctx.fillRect(18,height-34,Math.min(520,width-36),22);
    ctx.strokeStyle='rgba(213,174,117,.28)';ctx.strokeRect(18,height-34,Math.min(520,width-36),22);
    ctx.fillStyle='#dce7ff';ctx.font='11px Segoe UI';ctx.fillText('ЛКМ: добыча / бой · E у входа: выйти · E у лестницы: следующий уровень',28,height-19);
  }
  function drawHouseInterior(dt,time){
    const night=isNightTime(),flicker=Math.sin(time/83)*1.5+Math.sin(time/137)*.8;
    ctx.fillStyle='#111c25';ctx.fillRect(0,0,width,height);
    const scale=Math.min(width/420,height/340),ox=(width-420*scale)/2,oy=(height-340*scale)/2;
    ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    // Stone foundation, plaster, timber framing and warm plank floor.
    ctx.fillStyle='#342a25';ctx.fillRect(0,0,420,340);
    ctx.fillStyle='#6b513d';ctx.fillRect(5,5,410,330);
    ctx.fillStyle='#c49a69';ctx.fillRect(10,10,400,320);
    const floor=ctx.createLinearGradient(0,80,0,330);floor.addColorStop(0,'#bd8b55');floor.addColorStop(1,'#8b5d39');ctx.fillStyle=floor;ctx.fillRect(12,92,396,236);
    ctx.fillStyle='#6c482f';for(let y=96;y<328;y+=29){ctx.fillRect(12,y,396,2);for(let x=18+(Math.floor(y/29)%2)*27;x<405;x+=83){ctx.fillStyle='#d2a16a';ctx.fillRect(x,y+5,1,19);ctx.fillStyle='#6c482f';}}
    // Wall boards, corner posts and ceiling beams.
    ctx.fillStyle='#7a4d30';ctx.fillRect(12,12,396,9);ctx.fillRect(12,78,396,8);
    for(let x of [14,32,388,406]){ctx.fillStyle='#75492e';ctx.fillRect(x,12,8,82);ctx.fillStyle='#b47c48';ctx.fillRect(x+2,16,2,72);}
    ctx.fillStyle='#d8b17d';for(let y=28;y<77;y+=22){ctx.fillRect(18,y,384,2);}
    ctx.fillStyle='#4d3528';ctx.fillRect(12,88,396,7);
    // Window with panes, shutters, curtains and moon/day light.
    ctx.fillStyle='#513522';ctx.fillRect(300,21,83,68);ctx.fillStyle='#d6b17a';ctx.fillRect(305,25,73,60);
    const sky=ctx.createLinearGradient(0,26,0,82);sky.addColorStop(0,night?'#182d52':'#6eb5ce');sky.addColorStop(1,night?'#43547b':'#d7d89b');ctx.fillStyle=sky;ctx.fillRect(310,30,63,49);
    if(night){ctx.fillStyle='#f6e9b4';ctx.beginPath();ctx.arc(354,43,6,0,Math.PI*2);ctx.fill();for(const [sx,sy] of [[324,42],[340,61],[364,68]]){ctx.fillStyle='#fff3c4';ctx.fillRect(sx,sy,2,2);}}
    else{ctx.fillStyle='#ffe18b';ctx.beginPath();ctx.arc(350,43,7,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#70452d';ctx.fillRect(337,30,5,49);ctx.fillRect(310,52,63,4);
    ctx.fillStyle='#9b5940';ctx.fillRect(296,19,10,74);ctx.fillRect(378,19,10,74);
    ctx.fillStyle='#d6a66d';ctx.beginPath();ctx.moveTo(296,19);ctx.lineTo(315,25);ctx.lineTo(311,85);ctx.lineTo(296,91);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(388,19);ctx.lineTo(369,25);ctx.lineTo(373,85);ctx.lineTo(388,91);ctx.closePath();ctx.fill();
    // Bed frame, legs, mattress, folded quilt, stitched seams and pillows.
    ctx.fillStyle='#35251e';ctx.fillRect(37,42,113,143);ctx.fillStyle='#6d4328';ctx.fillRect(40,39,108,12);ctx.fillRect(40,174,108,12);
    ctx.fillStyle='#9b6538';ctx.fillRect(43,49,7,128);ctx.fillRect(139,49,7,128);ctx.fillRect(39,45,8,8);ctx.fillRect(140,45,8,8);
    ctx.fillStyle='#d5b17b';ctx.fillRect(48,50,91,123);ctx.fillStyle='#e7dfc9';ctx.fillRect(53,55,81,112);
    ctx.fillStyle='#f7f0df';ctx.fillRect(58,57,70,30);ctx.fillStyle='#bdcbd9';ctx.fillRect(64,62,28,19);ctx.fillStyle='#d7e0e8';ctx.fillRect(96,62,27,19);
    ctx.fillStyle='#42658f';ctx.fillRect(54,91,79,73);ctx.fillStyle='#547eaf';ctx.fillRect(59,96,69,63);
    ctx.strokeStyle='#9db8d5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(62,101);ctx.lineTo(125,101);ctx.moveTo(62,153);ctx.lineTo(125,153);ctx.stroke();
    ctx.fillStyle='#d3b77f';for(let x=66;x<124;x+=12){ctx.fillRect(x,107,2,5);ctx.fillRect(x,145,2,5);}
    ctx.fillStyle='#70472d';ctx.fillRect(36,34,115,9);ctx.fillStyle='#bd8a50';ctx.fillRect(40,29,107,7);
    // Bedside table and lantern.
    ctx.fillStyle='#523522';ctx.fillRect(153,94,34,37);ctx.fillStyle='#a87542';ctx.fillRect(150,91,40,7);ctx.fillRect(155,130,5,12);ctx.fillRect(180,130,5,12);
    ctx.fillStyle='#6b4329';ctx.fillRect(158,103,25,15);ctx.fillStyle='#d6a75d';ctx.fillRect(169,109,4,3);
    ctx.fillStyle='#54402b';ctx.fillRect(164,78,14,12);ctx.fillStyle='#f4c96c';ctx.fillRect(167,69,8,11);ctx.fillStyle='#fff0a7';ctx.shadowColor='#ffd36b';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(171,72,4+flicker*.12,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    // Rug with woven border and geometric motif.
    ctx.fillStyle='#55372c';ctx.fillRect(144,151,139,88);ctx.fillStyle='#a34c3f';ctx.fillRect(149,156,129,78);ctx.fillStyle='#d5a765';ctx.fillRect(155,162,117,66);ctx.fillStyle='#783b38';ctx.fillRect(160,167,107,56);
    ctx.strokeStyle='#f0d59b';ctx.lineWidth=2;ctx.strokeRect(158,165,111,60);ctx.strokeRect(164,171,99,48);
    ctx.fillStyle='#d8b36d';ctx.beginPath();ctx.moveTo(211,177);ctx.lineTo(246,196);ctx.lineTo(211,215);ctx.lineTo(176,196);ctx.closePath();ctx.fill();
    ctx.fillStyle='#8b413b';ctx.beginPath();ctx.moveTo(211,182);ctx.lineTo(236,196);ctx.lineTo(211,210);ctx.lineTo(186,196);ctx.closePath();ctx.fill();
    // Wall shelf with books, jars and a hanging herb bundle.
    ctx.fillStyle='#4b3022';ctx.fillRect(174,30,98,7);ctx.fillStyle='#a87845';ctx.fillRect(176,27,94,5);ctx.fillRect(180,36,5,24);ctx.fillRect(260,36,5,24);
    for(const [bx,bh,col] of [[188,15,'#9f4539'],[199,19,'#d0b45f'],[211,13,'#456d67'],[222,18,'#6a527d']]){ctx.fillStyle=col;ctx.fillRect(bx,27-bh+10,8,bh);ctx.fillStyle='#e6c88d';ctx.fillRect(bx+2,27-bh+13,1,bh-6);}
    ctx.fillStyle='#b58b54';ctx.fillRect(240,22,13,15);ctx.fillStyle='#e6c47d';ctx.fillRect(243,18,7,5);ctx.fillStyle='#6f8d54';ctx.fillRect(268,19,5,18);ctx.fillRect(264,23,4,7);ctx.fillRect(273,21,4,8);
    // Workbench: thick timber top, legs, drawer, vise, tools, nails and wood shavings.
    ctx.fillStyle='#38261c';ctx.fillRect(274,119,112,57);ctx.fillStyle='#704528';ctx.fillRect(278,113,104,8);ctx.fillStyle='#b47a42';ctx.fillRect(272,105,118,12);
    ctx.fillStyle='#d19a58';ctx.fillRect(278,108,106,4);ctx.fillStyle='#5a3825';ctx.fillRect(283,120,9,53);ctx.fillRect(367,120,9,53);
    ctx.fillStyle='#9b693c';ctx.fillRect(296,126,65,21);ctx.fillStyle='#4d3021';ctx.fillRect(300,130,57,14);ctx.fillStyle='#bd8a4c';ctx.fillRect(304,133,49,8);ctx.fillStyle='#e2b96f';ctx.fillRect(327,135,5,3);
    // Bench vise at left end.
    ctx.fillStyle='#59646b';ctx.fillRect(278,96,23,10);ctx.fillRect(282,91,15,8);ctx.fillStyle='#9ca8ac';ctx.fillRect(282,94,15,3);ctx.fillStyle='#3c454b';ctx.fillRect(287,103,4,12);
    // Hammer, saw, chisel, ruler and scattered screws.
    ctx.strokeStyle='#69452c';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(315,92);ctx.lineTo(329,109);ctx.stroke();ctx.fillStyle='#7d8990';ctx.fillRect(309,87,22,6);ctx.fillStyle='#c0c9ca';ctx.fillRect(310,86,20,3);
    ctx.strokeStyle='#b9c3c7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(342,91);ctx.lineTo(359,108);ctx.stroke();ctx.fillStyle='#77502e';ctx.fillRect(337,88,7,8);
    ctx.fillStyle='#d9bd7a';ctx.fillRect(365,91,4,19);ctx.fillStyle='#4d3324';ctx.fillRect(363,89,8,4);
    ctx.fillStyle='#d8c58f';for(const [nx,ny] of [[306,111],[313,115],[355,112],[374,112]]){ctx.beginPath();ctx.arc(nx,ny,1.5,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#e5bf79';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(300,151);ctx.quadraticCurveTo(310,145,319,153);ctx.moveTo(341,151);ctx.quadraticCurveTo(350,145,360,153);ctx.stroke();
    // Tool pegboard behind bench.
    ctx.fillStyle='#63432d';ctx.fillRect(286,72,93,25);ctx.fillStyle='#a97847';ctx.fillRect(289,75,87,19);
    ctx.strokeStyle='#4c5960';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(301,80);ctx.lineTo(301,91);ctx.moveTo(318,79);ctx.lineTo(318,90);ctx.moveTo(337,79);ctx.lineTo(337,91);ctx.moveTo(356,79);ctx.lineTo(356,90);ctx.stroke();
    ctx.fillStyle='#d3d8d4';ctx.fillRect(296,78,10,4);ctx.fillRect(313,77,10,4);ctx.fillRect(332,78,10,4);ctx.fillRect(351,77,10,4);
    // Fireplace, masonry, firewood and animated flame.
    ctx.fillStyle='#40302a';ctx.fillRect(296,204,84,72);ctx.fillStyle='#9a785d';ctx.fillRect(301,208,74,63);ctx.fillStyle='#4d403b';for(let y=211;y<270;y+=13){ctx.fillRect(301,y,74,2);ctx.fillRect(337,y+2,2,10);}
    ctx.fillStyle='#27232a';ctx.fillRect(310,225,57,39);ctx.fillStyle='#7b5540';ctx.fillRect(307,220,63,7);
    ctx.fillStyle='#70462b';ctx.fillRect(315,257,47,7);ctx.strokeStyle='#4b2e20';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(320,255);ctx.lineTo(355,260);ctx.moveTo(325,261);ctx.lineTo(360,254);ctx.stroke();
    ctx.fillStyle='#ef7337';ctx.beginPath();ctx.moveTo(321,253);ctx.quadraticCurveTo(312,237,329,226+flicker);ctx.quadraticCurveTo(331,240,339,232);ctx.quadraticCurveTo(350,217+flicker,357,244);ctx.quadraticCurveTo(361,257,342,258);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffc45c';ctx.beginPath();ctx.moveTo(334,255);ctx.quadraticCurveTo(328,243,340,235-flicker*.3);ctx.quadraticCurveTo(340,246,348,248);ctx.quadraticCurveTo(349,256,334,255);ctx.fill();
    ctx.fillStyle='#e4c28b';ctx.fillRect(304,273,68,5);
    // Plant, basket and house details.
    ctx.fillStyle='#74452e';ctx.fillRect(158,270,28,24);ctx.fillStyle='#b67a4a';ctx.fillRect(155,266,34,7);ctx.fillStyle='#4b8a55';ctx.fillRect(170,244,5,25);ctx.fillRect(158,251,14,6);ctx.fillRect(175,247,17,7);ctx.fillStyle='#76b96a';ctx.fillRect(160,246,8,5);ctx.fillRect(179,242,9,5);
    ctx.fillStyle='#62432c';ctx.fillRect(203,249,38,28);ctx.fillStyle='#9c6c3e';ctx.fillRect(206,252,32,20);ctx.strokeStyle='#d1a56b';ctx.lineWidth=2;for(let x=210;x<236;x+=7){ctx.beginPath();ctx.moveTo(x,252);ctx.lineTo(x,272);ctx.stroke();}
    // Door threshold and detailed door with handle.
    ctx.fillStyle='#493025';ctx.fillRect(178,278,64,52);ctx.fillStyle='#8b5a34';ctx.fillRect(184,282,52,48);ctx.fillStyle='#b57c48';ctx.fillRect(188,286,44,40);ctx.strokeStyle='#684329';ctx.lineWidth=2;ctx.strokeRect(190,288,40,36);ctx.strokeRect(193,291,34,13);ctx.strokeRect(193,308,34,13);
    ctx.fillStyle='#e5bf71';ctx.beginPath();ctx.arc(224,306,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0b6';ctx.fillRect(223,304,1,2);
    ctx.fillStyle='#67432d';ctx.fillRect(174,329,72,5);ctx.fillStyle='#c08b50';ctx.fillRect(180,327,60,3);
    // Warm pools of light and floor shadows.
    const glow=ctx.createRadialGradient(341,239,4,341,239,105);glow.addColorStop(0,'rgba(255,153,67,.22)');glow.addColorStop(1,'rgba(255,153,67,0)');ctx.fillStyle=glow;ctx.fillRect(236,134,180,190);
    ctx.fillStyle='rgba(12,10,10,.17)';ctx.beginPath();ctx.ellipse(94,184,53,8,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(330,180,58,7,0,0,Math.PI*2);ctx.fill();
    // Interaction labels are anchored at the actual usable sides of the furniture.
    ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#f4e5c4';ctx.shadowColor='#1a100b';ctx.shadowBlur=3;ctx.fillText('КРОВАТЬ · E',166,116);ctx.fillText('ВЕРСТАК · E',255,145);ctx.fillText('ВЫХОД · E',210,320);ctx.shadowBlur=0;
    // Use the same full character renderer as the outdoor world so skin, hair, face, armor, equipment and facing stay consistent indoors.
    drawPlayer(0,0,dt);
    drawRemotePlayers(0,0);ctx.restore();
    if(sleeping){ctx.fillStyle='rgba(5,9,20,.78)';ctx.fillRect(0,0,width,height);ctx.fillStyle='#f2e8ff';ctx.font='bold 22px Segoe UI';ctx.textAlign='center';ctx.fillText('Ты спишь… '+Math.max(0,Math.ceil(5-sleepSeconds))+' сек.',width/2,height/2);ctx.textAlign='left';}
  }
  function minuteOfDay(){return ((Math.floor(gameMinuteTotal)%GAME_MINUTES_PER_DAY)+GAME_MINUTES_PER_DAY)%GAME_MINUTES_PER_DAY;}
  const SEASON_CYCLE=Object.freeze([{id:'spring',name:'Весна',icon:'🌱',growth:1.1,harvest:1},{id:'summer',name:'Лето',icon:'☀️',growth:1.3,harvest:1.05},{id:'autumn',name:'Осень',icon:'🍂',growth:1,harvest:1.25},{id:'winter',name:'Зима',icon:'❄️',growth:.68,harvest:.85}]);
  function seasonInfo(){const day=Math.max(0,Math.floor((Number.isFinite(gameMinuteTotal)?gameMinuteTotal:0)/GAME_MINUTES_PER_DAY)),dayInSeason=day%7;return {...SEASON_CYCLE[Math.floor((day%28)/7)],day,daysRemaining:7-dayInSeason};}
  function isNightTime(){const m=minuteOfDay();return m>=NIGHT_MINUTE||m<DAWN_MINUTE;}
  function smoothstep(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
  function updateClockDisplay(force=false){
    const wholeMinute=Math.floor(gameMinuteTotal);
    if(!force&&wholeMinute===lastClockMinute)return;
    lastClockMinute=wholeMinute;
    const m=minuteOfDay(),h=Math.floor(m/60),mins=m%60;
    const timeText=String(h).padStart(2,'0')+':'+String(mins).padStart(2,'0');
    const clock=document.getElementById('world-clock');
    document.getElementById('game-time').textContent=timeText;
    let period='ДЕНЬ',icon='☀',skin='day';
    if(m>=18*60&&m<NIGHT_MINUTE){period='СУМЕРКИ';icon='🌇';skin='twilight';}
    else if(m>=NIGHT_MINUTE||m<4*60){period='НОЧЬ';icon='☾';skin='night';}
    else if(m>=4*60&&m<DAWN_MINUTE){period='РАССВЕТ';icon='🌅';skin='twilight';}
    document.getElementById('period-label').textContent=period;
    const currentSeason=seasonInfo(),seasonNode=document.getElementById('season-label');if(seasonNode){seasonNode.textContent=currentSeason.icon+' '+currentSeason.name.toUpperCase();seasonNode.title='Сезон: '+currentSeason.name+'. До смены сезона: '+currentSeason.daysRemaining+' игровых дней.';}
    document.getElementById('clock-icon').textContent=icon;
    clock.classList.remove('day','twilight','night');clock.classList.add(skin);
    document.getElementById('minimap-period').textContent=period;
    const counter=document.getElementById('night-counter');
    counter.textContent='🌙 ПРОЖИТО НОЧЕЙ: '+survivedNights; counter.title='Счётчик увеличивается только после настоящего прохождения ночи или сна вечером';
    const hungerNode=document.getElementById('hunger-value');if(hungerNode)hungerNode.textContent=String(Math.max(0,Math.floor(hunger)));
    const hb=document.getElementById('hunger-bar');if(hb)hb.style.width=Math.max(0,Math.min(100,hunger))+'%';
    updateSkipDayHud();
  }
  function updateWorldClock(dt){
    const coopNetwork=window.SkyRealmCoopClient;
    const coopRoom=coopNetwork?.getRoomState?.();
    const sharedClock=coopNetwork?.getWorldClock?.();
    const remoteClockActive=!!(coopRoom&&!coopNetwork.isRoomOwner);
    if(remoteClockActive){
      if(sharedClock){
        gameMinuteTotal=sharedClock.minute_total;
        survivedNights=sharedClock.survived_nights;
        bloodMoonActive=sharedClock.blood_moon_active;
      }
      // A guest must never advance a private clock while the room is paused or the
      // owner's clock packet is delayed. Wait for the next authoritative update.
      lastDawnMarker=Math.floor((gameMinuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);
      wasNight=isNightTime();updateClockDisplay();return;
    }
    const wasNightBefore=isNightTime();
    const previousMinute=gameMinuteTotal;
    gameMinuteTotal+=dt*GAME_TIME_SPEED;
    const elapsedGameMinutes=gameMinuteTotal-previousMinute;
    totalGameMinutesPlayed+=elapsedGameMinutes;
    hungerElapsedMinutes+=elapsedGameMinutes;
    while(hungerElapsedMinutes>=(isModInstalled('brutal_world')?7:isModInstalled('survivalist')?12:10)+skills.survivor*.7+communityModBonus('hunger')*.35){hungerElapsedMinutes-=(isModInstalled('brutal_world')?7:isModInstalled('survivalist')?12:10)+skills.survivor*.7+communityModBonus('hunger')*.35;hunger=Math.max(0,hunger-1);}
    if(hunger<=10&&!immortal){player.hp=Math.max(0,player.hp-dt*(hunger<=0?2.2:0.7)*(1-skills.survivor*.04)*(1-skillBonus('guardian')*.025));updateVitals();if(player.hp<=0)respawnPlayerAfterDefeat();}
    if(!inHouse){sheepSpawnTimer+=elapsedGameMinutes;if(sheepSpawnTimer>=10){sheepSpawnTimer-=10;spawnOneSheep();}}
    const oldMinuteOfDay=((previousMinute%GAME_MINUTES_PER_DAY)+GAME_MINUTES_PER_DAY)%GAME_MINUTES_PER_DAY;
    const newMinuteOfDay=((gameMinuteTotal%GAME_MINUTES_PER_DAY)+GAME_MINUTES_PER_DAY)%GAME_MINUTES_PER_DAY;
    // Count only an actual clock crossing through dawn. Manual admin time jumps never pass through this path.
    const crossedDawn=(oldMinuteOfDay<DAWN_MINUTE && newMinuteOfDay>=DAWN_MINUTE && gameMinuteTotal-previousMinute<60) || (oldMinuteOfDay>newMinuteOfDay && newMinuteOfDay>=DAWN_MINUTE && newMinuteOfDay<DAWN_MINUTE+2);
    if(crossedDawn&&!remoteClockActive){survivedNights++;refreshMineDailyStock();if(isModInstalled('banking')&&walletCents>0){const interest=Math.max(1,Math.floor(walletCents*.01));walletCents+=interest;updateWalletHud();toast('Банк начислил проценты: +'+formatMoney(interest)+'.');}if(isModInstalled('parallel_dimensions')&&Math.random()<.35){changeItem('Кристалл',1);toast('Разлом измерений оставил межпространственный кристалл!');}if(bloodMoonActive&&bloodMoonRewardPending){walletCents+=2500;changeItem('Кристалл',2);bloodMoonRewardPending=false;toast('КРОВАВАЯ ЛУНА пережита! Награда: 25 золота и 2 кристалла.');}else toast('Рассвет! Ты пережил ночь. Всего ночей: '+survivedNights+'.');bloodMoonActive=false;saveGame();}
    lastDawnMarker=Math.floor((gameMinuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);
    const nightNow=isNightTime();
    if(nightNow&&!wasNightBefore){
      const nightNumber=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY)+1;bloodMoonActive=nightNumber%5===0;bloodMoonRewardPending=bloodMoonActive;lastBloodMoonNight=bloodMoonActive?nightNumber:lastBloodMoonNight;
      if(bloodMoonActive){toast('КРОВАВАЯ ЛУНА! Монстры сильнее. Выживи до рассвета за награду!');saveGame();}
      else if(survivedNights>=3)toast('Четвёртая ночь… Тени выходят из леса!');
      else toast('Наступила ночь '+(survivedNights+1)+'. До появления монстров: '+(3-survivedNights)+'.');
    }
    if(!nightNow&&wasNightBefore){
      for(let j=monsters.length-1;j>=0;j--) if(!monsters[j].adminSpawned) monsters.splice(j,1);
      monsterSpawnTimer=0;
    }
    wasNight=nightNow;
    updateClockDisplay();
  }
  function drawDayNightOverlay(camX,camY){
    const m=minuteOfDay();
    let darkness=0;
    if(m>=NIGHT_MINUTE||m<4*60)darkness=.49;
    else if(m>=18*60&&m<NIGHT_MINUTE)darkness=.49*smoothstep((m-18*60)/(2*60));
    else if(m>=4*60&&m<DAWN_MINUTE)darkness=.49*(1-smoothstep((m-4*60)/(2*60)));
    if(darkness>0.005){
      ctx.fillStyle='rgba(7,12,39,'+darkness+')';ctx.fillRect(0,0,width,height);
      if(darkness>.12){
        // Stable, low-cost stars and a crescent moon; no image assets required.
        for(let i=0;i<38;i++){
          const sx=hash(i+91,701)*width,sy=hash(i+23,907)*Math.min(height*.48,250);
          const alpha=Math.min(.95,(darkness-.08)*2.3)*(.35+hash(i,443)*.65);
          ctx.fillStyle='rgba(222,235,255,'+alpha+')';ctx.fillRect(sx,sy,hash(i,2)>.8?2:1,hash(i+8,2)>.6?2:1);
        }
        const mx=width-110,my=75;
        ctx.save();ctx.shadowColor=bloodMoonActive?'#ff203f':'#dce7ff';ctx.shadowBlur=darkness*34;
        ctx.fillStyle=bloodMoonActive?'rgba(255,35,56,.98)':'rgba(238,243,255,'+Math.min(1,darkness*2.1)+')';ctx.beginPath();ctx.arc(mx,my,bloodMoonActive?28:24,0,Math.PI*2);ctx.fill();
        if(!bloodMoonActive){ctx.fillStyle='rgba(20,31,70,'+Math.min(.98,darkness*2)+')';ctx.beginPath();ctx.arc(mx+11,my-9,22,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(236,242,255,.86)';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(mx,my,24,0,Math.PI*2);ctx.stroke();}else{ctx.fillStyle='rgba(90,0,16,.7)';ctx.beginPath();ctx.arc(mx-7,my-5,5,0,Math.PI*2);ctx.arc(mx+8,my+7,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff6c7b';ctx.font='900 12px Segoe UI';ctx.textAlign='center';ctx.fillText('КРОВАВАЯ ЛУНА · МОНСТРЫ СИЛЬНЕЕ',width/2,35);}ctx.restore();
        const px=player.x-camX,py=player.y-camY;
        const glow=ctx.createRadialGradient(px,py,3,px,py,105);
        glow.addColorStop(0,'rgba(255,202,115,.17)');glow.addColorStop(1,'rgba(255,202,115,0)');
        ctx.fillStyle=glow;ctx.fillRect(px-105,py-105,210,210);
      }
    } else if(m>=6*60&&m<8*60){
      const dawnTint=(1-smoothstep((m-6*60)/(2*60)))*.035;
      if(dawnTint>.002){ctx.fillStyle='rgba(255,195,123,'+dawnTint+')';ctx.fillRect(0,0,width,height);}
    }
  }
  function mapPoint(x,y,mw,mh){return {x:5+(x/(COLS*TILE))*(mw-10),y:5+(y/(ROWS*TILE))*(mh-10)};}
  function tileKey(x,y){return Math.floor(x)+','+Math.floor(y);}
  function exploredWorldPoint(x,y){
    const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);
    return exploredCells.has(tileKey(tx,ty));
  }

  
  const COMMUNITY_MODS_KEY='skyrealm_community_mods_installed_v1';
  let communityMods=[];
  let installedCommunityMods=new Set();
  try{installedCommunityMods=new Set(JSON.parse(localStorage.getItem(COMMUNITY_MODS_KEY)||'[]').filter(v=>typeof v==='string').slice(0,100));}catch(_){installedCommunityMods=new Set();}
  function saveCommunityModInstalls(){try{localStorage.setItem(COMMUNITY_MODS_KEY,JSON.stringify(Array.from(installedCommunityMods)));return true;}catch(_){toast('Не удалось сохранить список модов сообщества.');return false;}}
  function socialApiUrl(){return 'https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-social';}
  async function communityAccessToken(){let token=localStorage.getItem('skyrealm_token')||sessionStorage.getItem('skyrealm_token')||'';const expiry=Number(localStorage.getItem('skyrealm_token_expires_at')||0);if((!token||!expiry||expiry<=Date.now()+30000)&&window.pywebview?.api?.get_auth_session){try{const session=await window.pywebview.api.get_auth_session();if(typeof session?.token==='string'&&session.token)return session.token;}catch(_){}}if(token&&expiry>Date.now()+30000)return token;const refresh=localStorage.getItem('skyrealm_refresh_token')||'';if(!refresh)return '';try{const r=await fetch('https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-auth?route=%2Fapi%2Fauth%2Frefresh',{method:'POST',headers:{'Content-Type':'application/json','apikey':'sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL'},body:JSON.stringify({refresh_token:refresh})});const d=await r.json();if(!r.ok||!d.access_token)return '';localStorage.setItem('skyrealm_token',d.access_token);localStorage.setItem('skyrealm_refresh_token',d.refresh_token||refresh);localStorage.setItem('skyrealm_token_expires_at',String(Date.now()+Math.max(60,Number(d.expires_in)||3600)*1000));return d.access_token;}catch(_){return '';}}
  async function communityRequest(route,method='GET',payload=null){const token=await communityAccessToken();if(!token)throw new Error('Для публикации войди в аккаунт SkyRealm и подтверди почту.');const url=new URL(socialApiUrl());url.searchParams.set('route',route);const r=await fetch(url.toString(),{method,headers:{'apikey':'sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL','Authorization':'Bearer '+token,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||'Не удалось связаться с каталогом сообщества.');return d;}
  function communityEffectText(mod){return ({damage:'Урон оружия',defense:'Защита персонажа',speed:'Скорость передвижения',hunger:'Замедление голода',mining:'Шанс дополнительной руды',farming:'Скорость роста урожая'})[mod.effect_key]||'Игровой бонус';}
  async function loadCommunityMods(){const status=document.getElementById('community-mod-status');if(status)status.textContent='Загружаем моды сообщества…';try{const d=await communityRequest('/api/social/mods');communityMods=Array.isArray(d.mods)?d.mods:[];if(status)status.textContent='Публичных модов: '+communityMods.length;renderModCatalog();}catch(error){if(status)status.textContent='Каталог сообщества недоступен: '+error.message;}}
  function renderCommunityMods(){const root=document.getElementById('community-mods-list');if(!root)return;if(!communityMods.length){root.innerHTML='<div class="community-empty">Пока нет опубликованных модов. Стань первым автором!</div>';return;}root.innerHTML=communityMods.map(m=>{const active=installedCommunityMods.has(m.id);return '<article class="mod-catalog-card '+(active?'mod-installed':'')+'"><div class="mod-card-icon">'+escapeHtml(m.icon||'🧩')+'</div><div class="mod-card-content"><div class="mod-card-title-row"><b>'+escapeHtml(m.name)+'</b><span class="mod-version">Игрок · '+escapeHtml(m.creator_name||'автор')+'</span></div><div class="mod-card-meta">'+escapeHtml(m.category||'Сообщество')+' · '+communityEffectText(m)+' +'+(Number(m.effect_strength)||1)+'</div><p>'+escapeHtml(m.description||'Авторский мод SkyRealm.')+'</p></div><button class="mod-install-button '+(active?'installed':'')+'" data-community-toggle="'+escapeHtml(m.id)+'">'+(active?'Удалить':'Установить')+'</button></article>';}).join('');root.querySelectorAll('[data-community-toggle]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.communityToggle;if(installedCommunityMods.has(id))installedCommunityMods.delete(id);else installedCommunityMods.add(id);saveCommunityModInstalls();renderCommunityMods();toast('Список модов сообщества обновлён.');}));}
  function openModCreator(){const shade=document.getElementById('mod-creator-shade');if(shade)shade.hidden=false;}
  function closeModCreator(){const shade=document.getElementById('mod-creator-shade');if(shade)shade.hidden=true;}
  async function publishCommunityMod(event){event.preventDefault();const form=event.currentTarget,button=document.getElementById('publish-community-mod'),status=document.getElementById('mod-creator-status');const payload={name:document.getElementById('community-mod-name').value.trim(),description:document.getElementById('community-mod-description').value.trim(),category:document.getElementById('community-mod-category').value,icon:document.getElementById('community-mod-icon').value,effect_key:document.getElementById('community-mod-effect').value,effect_strength:Number(document.getElementById('community-mod-strength').value)};if(!payload.name||payload.name.length>32||payload.description.length<10||payload.description.length>180){if(status)status.textContent='Название: 1–32 символа. Описание: 10–180 символов.';return;}button.disabled=true;if(status)status.textContent='Проверяем аккаунт и публикуем мод…';try{const result=await communityRequest('/api/social/mods','POST',payload);if(result.mod){communityMods.unshift(result.mod);renderCommunityMods();}form.reset();if(status)status.textContent='Мод опубликован! Он появится в общем каталоге у игроков.';toast('Мод опубликован в каталоге сообщества!');}catch(error){if(status)status.textContent=error.message;toast(error.message);}finally{button.disabled=false;}}


  const MOD_PROFILES_STORAGE_KEY='skyrealm_mod_profiles_v1';
  function readModProfiles(){
    try{
      const raw=JSON.parse(localStorage.getItem(MOD_PROFILES_STORAGE_KEY)||'[]');
      if(!Array.isArray(raw))return [];
      return raw.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.mods))
        .map(p=>({id:p.id.slice(0,64),name:p.name.trim().slice(0,24),mods:[...new Set(p.mods.filter(id=>MOD_CATALOG.some(mod=>mod.id===id)))],updatedAt:Number(p.updatedAt)||0}))
        .filter(p=>p.name);
    }catch(_){return [];}
  }
  function saveModProfiles(profiles){try{localStorage.setItem(MOD_PROFILES_STORAGE_KEY,JSON.stringify(profiles.slice(-20)));return true;}catch(error){toast('Не удалось сохранить профили модов.');return false;}}
  function renderModProfiles(){
    const select=document.getElementById('mod-profile-select');if(!select)return;
    const profiles=readModProfiles(),selected=select.value;
    select.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='Выбери профиль';select.append(empty);
    profiles.forEach(profile=>{const option=document.createElement('option');option.value=profile.id;option.textContent=profile.name+' · '+profile.mods.length+' модов';select.append(option);});
    if(profiles.some(profile=>profile.id===selected))select.value=selected;
    const status=document.getElementById('mod-profile-status');
    if(status)status.textContent=profiles.length+' / 20 профилей сохранено';
  }
  function saveCurrentModProfile(){
    const input=document.getElementById('mod-profile-name'),name=String(input?.value||'').trim().slice(0,24);
    if(name.length<2){toast('Название профиля должно содержать хотя бы 2 символа.');return;}
    const profiles=readModProfiles(),existing=profiles.find(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase());
    const id=existing?.id||('mod-profile-'+Date.now().toString(36));
    const next={id,name,mods:Array.from(installedMods),updatedAt:Date.now()};
    const updated=[...profiles.filter(p=>p.id!==id),next];
    if(!saveModProfiles(updated))return;
    renderModProfiles();const select=document.getElementById('mod-profile-select');if(select)select.value=id;
    if(input)input.value='';toast('Профиль модов «'+name+'» сохранён.');
  }
  function applyModProfile(){
    const id=document.getElementById('mod-profile-select')?.value,profile=readModProfiles().find(p=>p.id===id);
    if(!profile){toast('Сначала выбери сохранённый профиль.');return;}
    const previous=installedMods;installedMods=new Set(profile.mods);
    if(!saveInstalledMods()){installedMods=previous;return;}
    renderModCatalog();if(currentWorldId)saveGame();
    toast('Профиль «'+profile.name+'» применён. Активно модов: '+installedMods.size+'.');
  }
  function deleteModProfile(){
    const id=document.getElementById('mod-profile-select')?.value;
    if(!id){toast('Сначала выбери профиль для удаления.');return;}
    const profiles=readModProfiles(),profile=profiles.find(p=>p.id===id);
    if(!profile)return;
    if(!window.confirm('Удалить профиль модов «'+profile.name+'»? Установленные моды не изменятся.'))return;
    saveModProfiles(profiles.filter(p=>p.id!==id));renderModProfiles();toast('Профиль удалён. Текущий набор модов не изменён.');
  }

  const MODS_STORAGE_KEY='skyrealm_installed_mods_v1';
  const MOD_CATALOG=[
    {id:'cartographer',name:'Око картографа',icon:'🧭',category:'Исследование',version:'1.0.0',description:'Открывает больше территории вокруг персонажа на мини-карте.',effect:'Радиус открытия карты увеличен с 3 до 5 блоков.',compatibility:'Одиночная игра и кооператив'},
    {id:'angler',name:'Мастер рыбалки',icon:'🎣',category:'Ресурсы',version:'1.0.0',description:'Помогает быстрее ловить рыбу и повышает шанс редкой находки.',effect:'Поклёвка быстрее на 1 секунду, шанс жемчуга выше, шанс второй рыбы увеличен.',compatibility:'Одиночная игра и кооператив'},
    {id:'green_thumb',name:'Зелёный палец',icon:'🌱',category:'Фермерство',version:'1.0.0',description:'Ускоряет рост всех посаженных культур на грядках.',effect:'Скорость роста урожая увеличена на 35%.',compatibility:'Одиночная игра и кооператив'},
    {id:'miners_luck',name:'Удача шахтёра',icon:'⛏️',category:'Добыча',version:'1.0.0',description:'Повышает шанс получить дополнительную единицу добытой руды.',effect:'Дополнительная руда выпадает чаще на 15 процентных пунктов.',compatibility:'Одиночная игра и кооператив'},
    {id:'survivalist',name:'Запасливый путешественник',icon:'🥫',category:'Выживание',version:'1.0.0',description:'Учит героя экономнее расходовать запасы еды.',effect:'Голод уменьшается раз в 12 игровых минут вместо 10.',compatibility:'Одиночная игра и кооператив'},
    {id:'skill_expansion',name:'Путь мастера',icon:'🌟',category:'Развитие',version:'1.0.0',description:'Открывает расширенное развитие персонажа: дополнительные ветки навыков и 10 уровней в каждой.',effect:'Добавляет специализации стража, стрелка, алхимика, рыбака, строителя, повелителя зверей и удачливого искателя.',compatibility:'Одиночная игра и кооператив'},
    {id:'brutal_world',name:'Жестокий мир',icon:'☠️',category:'Сложность',version:'1.0.0',description:'Опасность растёт повсюду: обычные враги крепче, быстрее и больнее бьют, ночные нападения чаще, еды требуется больше.',effect:'Обычные монстры: +45% здоровья, +35% урона и +12% скорости; ночные волны чаще и многочисленнее; голод наступает быстрее.',compatibility:'Одиночная игра и кооператив'},
    {id:'blood_moon',name:'Вечная кровавая луна',icon:'🌑',category:'Сложность',version:'1.0.0',description:'Ночи становятся настоящим испытанием: чаще появляются бомбочки и элитные противники, а добыча с врагов скуднее.',effect:'Ночные волны появляются чаще, шанс взрывных врагов выше, противники наносят дополнительный урон, обычная добыча снижена.',compatibility:'Одиночная игра и кооператив'},
    {id:'lost_dungeons',name:'Затерянные подземелья',icon:'🗝️',category:'Исследование',version:'1.0.0',description:'Расширяет Древние руины: хранители сильнее, а награды за комнаты богаче.',effect:'Бонус к урону в руинах и дополнительная добыча.',compatibility:'Одиночная игра и кооператив'},
    {id:'sky_islands',name:'Небесные острова',icon:'☁️',category:'Исследование',version:'1.0.0',description:'Дарует ветровое благословение для путешествий по открытым областям.',effect:'Скорость передвижения вне помещений +12%.',compatibility:'Одиночная игра и кооператив'},
    {id:'ancient_civs',name:'Древние цивилизации',icon:'🏛️',category:'Исследование',version:'1.0.0',description:'Древние тайники становятся ценнее: находки из сундуков содержат больше золота.',effect:'На 25% больше золота из обычных сундуков.',compatibility:'Одиночная игра и кооператив'},
    {id:'ocean_depths',name:'Тайны океана',icon:'🐚',category:'Исследование',version:'1.0.0',description:'Улучшает морские находки и рыбалку: больше шансов получить жемчуг и дополнительную рыбу.',effect:'Рыбалка быстрее, шанс жемчуга и двойного улова выше.',compatibility:'Одиночная игра и кооператив'},
    {id:'elemental_lords',name:'Повелители стихий',icon:'🐉',category:'Боссы',version:'1.0.0',description:'Стихийные боссы дают дополнительную редкую награду после победы.',effect:'Дополнительные 50 золота и 2 кристалла за стихийного босса.',compatibility:'Одиночная игра и кооператив'},
    {id:'legendary_gear',name:'Легендарное снаряжение',icon:'⚔️',category:'Снаряжение',version:'1.0.0',description:'Оружие раскрывает скрытый потенциал и наносит больше урона.',effect:'Урон оружия +18%.',compatibility:'Одиночная игра и кооператив'},
    {id:'bounty_hunter',name:'Охотники за головами',icon:'🎯',category:'Приключения',version:'1.0.0',description:'За каждого побеждённого монстра выдаётся денежная награда и дополнительный опыт.',effect:'За убийство монстра: 1–4 золота и +20% опыта.',compatibility:'Одиночная игра и кооператив'},
    {id:'arena_survival',name:'Арена выживания',icon:'🏟️',category:'Битвы',version:'1.0.0',description:'Ночные волны становятся опаснее: враги появляются чаще и приходят большими группами.',effect:'Ночные волны чаще, лимит монстров +3.',compatibility:'Одиночная игра и кооператив'},
    {id:'settlement_builder',name:'Развитие поселений',icon:'🏘️',category:'Строительство',version:'1.0.0',description:'Улучшает награды за поручения жителей и помогает быстрее развивать деревни.',effect:'Награды за задания жителей +20%.',compatibility:'Одиночная игра и кооператив'},
    {id:'architect',name:'Архитектор',icon:'🏰',category:'Строительство',version:'1.0.0',description:'Улучшает домашнюю инфраструктуру и восстановление героя в собственном доме.',effect:'Домашнее восстановление здоровья +50%.',compatibility:'Одиночная игра и кооператив'},
    {id:'beast_companions',name:'Верные спутники',icon:'🐺',category:'Спутники',version:'1.0.0',description:'Усиливает приручённых животных: спутник наносит больше урона и лучше переносит битвы.',effect:'Урон спутника +50%.',compatibility:'Одиночная игра и кооператив'},
    {id:'trade_caravans',name:'Торговые караваны',icon:'🐫',category:'Экономика',version:'1.0.0',description:'Торговцы предлагают скидки на покупки; учитываются репутация и торговая выгода.',effect:'Скидка 10% на покупки у торговцев.',compatibility:'Одиночная игра и кооператив'},
    {id:'magic_academy',name:'Магическая академия',icon:'📚',category:'Магия',version:'1.0.0',description:'Открывает обучение магическим школам и снижает стоимость заклинаний.',effect:'Стоимость заклинаний −20%.',compatibility:'Одиночная игра и кооператив'},
    {id:'engineer_world',name:'Инженерный мир',icon:'⚙️',category:'Технологии',version:'1.0.0',description:'Инженерные знания помогают экономить материалы при создании печей.',effect:'Для создания печи нужно меньше камня и древесины.',compatibility:'Одиночная игра и кооператив'},
    {id:'banking',name:'Банковская система',icon:'🏦',category:'Экономика',version:'1.0.0',description:'Накопительный счёт начисляет проценты от золота при наступлении нового игрового дня.',effect:'1% процентов от кошелька при каждом рассвете.',compatibility:'Одиночная игра и кооператив'},
    {id:'parallel_dimensions',name:'Параллельные измерения',icon:'🌀',category:'Новые миры',version:'1.0.0',description:'Межпространственные разломы иногда оставляют редкие кристаллы во время рассвета.',effect:'35% шанс получить межпространственный кристалл на рассвете.',compatibility:'Одиночная игра и кооператив'},
    {id:'full_magic',name:'Полноценная магия',icon:'🔮',category:'Магия',version:'1.0.0',description:'Добавляет ману и четыре заклинания: Огненный шар, Ледяная буря, Цепная молния и Исцеляющий свет.',effect:'F — сменить заклинание · G — применить. Мана восстанавливается автоматически.',compatibility:'Одиночная игра и кооператив'},
    {id:'swift_steps',name:'Сапоги ветра',icon:'👟',category:'Передвижение',version:'1.0.0',description:'Ускоряет обычную ходьбу, бег и передвижение в шахте и подземельях.',effect:'Скорость передвижения +10%.',compatibility:'Одиночная игра и кооператив'},
    {id:'guardian_oath',name:'Клятва стража',icon:'🛡️',category:'Защита',version:'1.0.0',description:'Укрепляет защиту героя от ударов монстров, ловушек и боссов.',effect:'Снижение получаемого урона усиливается на 8 процентных пунктов.',compatibility:'Одиночная игра и кооператив'},
    {id:'herbalist',name:'Травник',icon:'🌿',category:'Лечение',version:'1.0.0',description:'Улучшает лечебные смеси и бинты, чтобы дольше оставаться в бою.',effect:'Малое зелье лечит на 15 HP больше, бинт — на 8 HP больше.',compatibility:'Одиночная игра и кооператив'},
    {id:'deep_reserves',name:'Глубокий запас сил',icon:'💧',category:'Выносливость',version:'1.0.0',description:'Помогает быстрее восстанавливать силы после бега и перекатов.',effect:'Восстановление выносливости +30%.',compatibility:'Одиночная игра и кооператив'},
    {id:'treasure_hunter',name:'Охотник за сокровищами',icon:'💠',category:'Сокровища',version:'1.0.0',description:'Иногда находит дополнительный кристалл в обычных сундуках.',effect:'30% шанс получить ещё один кристалл из сундука.',compatibility:'Одиночная игра и кооператив'},
    {id:'scavenger',name:'Собиратель трофеев',icon:'🦴',category:'Добыча',version:'1.0.0',description:'После победы над обычным монстром может найти дополнительный трофей.',effect:'25% шанс получить дополнительный кристалл или малое зелье.',compatibility:'Одиночная игра и кооператив'},
    {id:'marksman',name:'Меткий копейщик',icon:'🎯',category:'Снаряжение',version:'1.0.0',description:'Улучшает баланс и точность молниеносного копья.',effect:'Урон молниеносного копья +20%.',compatibility:'Одиночная игра и кооператив'},
    {id:'restful_camp',name:'Уютный привал',icon:'🛏️',category:'Восстановление',version:'1.0.0',description:'Ускоряет восстановление здоровья, когда герой находится дома.',effect:'Домашнее восстановление здоровья +30%.',compatibility:'Одиночная игра и кооператив'},
    {id:'merchant_guild',name:'Гильдия торговцев',icon:'💰',category:'Экономика',version:'1.0.0',description:'Помогает получать больше золота за продажу товаров жителям.',effect:'Выручка от продажи товаров +10%.',compatibility:'Одиночная игра и кооператив'},
    {id:'scholar',name:'Учёный летописец',icon:'📖',category:'Развитие',version:'1.0.0',description:'Помогает быстрее получать опыт за исследование, задания и победы.',effect:'Получаемый опыт +12%.',compatibility:'Одиночная игра и кооператив'},
    {id:'forest_guild',name:'Гильдия лесорубов',icon:'🌲',category:'Профессии',version:'1.1.0',description:'Профессиональные лесорубы получают дополнительные брёвна за каждое поваленное дерево.',effect:'+2 древесины за каждое срубленное дерево.',compatibility:'Одиночная игра и кооператив'},
    {id:'crop_rotation',name:'Севооборот',icon:'🌾',category:'Фермерство',version:'1.1.0',description:'Умный подбор культур повышает отдачу с каждой грядки.',effect:'Урожайность +15%.',compatibility:'Одиночная игра и кооператив'},
    {id:'artisan_guild',name:'Гильдия ремесленников',icon:'🛠️',category:'Крафт',version:'1.1.0',description:'Стандартизированные инструменты и рецепты уменьшают расход материалов.',effect:'Стоимость рецептов −10%.',compatibility:'Одиночная игра и кооператив'},
    {id:'geology_scanner',name:'Геологический сканер',icon:'💎',category:'Шахты',version:'1.1.0',description:'Сканер показывает перспективные пласты и помогает находить редкие жилы.',effect:'Шанс дополнительной руды и редких жил выше.',compatibility:'Одиночная игра и кооператив'},
    {id:'camp_kitchen',name:'Походная кухня',icon:'🍲',category:'Кулинария',version:'1.1.0',description:'Надёжная походная кухня позволяет готовить более сытную пищу.',effect:'Жареное мясо восстанавливает ещё 5 голода.',compatibility:'Одиночная игра и кооператив'},
    {id:'power_surge',name:'Энергетический резонанс',icon:'⚡',category:'Технологии',version:'1.1.0',description:'Улучшает топливные контуры генераторов и стабилизирует питание сети.',effect:'Выработка энергии и время работы топлива +20%.',compatibility:'Одиночная игра и кооператив'}
  ];
  function readInstalledMods(){
    try{const raw=JSON.parse(localStorage.getItem(MODS_STORAGE_KEY)||'[]');return Array.isArray(raw)?raw.filter(id=>MOD_CATALOG.some(mod=>mod.id===id)):[];}catch(_){return [];}
  }
  let installedMods=new Set(readInstalledMods());
  let magicMana=100,magicSpellIndex=0,magicRegenClock=0;
  const MAGIC_SPELLS=[{name:'Огненный шар',cost:22,color:'#ff8b43',damage:78,range:440},{name:'Ледяная буря',cost:28,color:'#75e5ff',damage:46,range:210},{name:'Цепная молния',cost:34,color:'#d7a4ff',damage:62,range:390},{name:'Исцеляющий свет',cost:30,color:'#8fffc2',damage:0,range:0}];
  function isModInstalled(id){return installedMods.has(id);}
  function saveInstalledMods(){
    try{localStorage.setItem(MODS_STORAGE_KEY,JSON.stringify(Array.from(installedMods)));return true;}
    catch(error){console.warn('Could not save mod catalog:',error);toast('Не удалось сохранить список модов. Проверь свободное место.');return false;}
  }
  function renderModCatalog(){
    const root=document.getElementById('mods-catalog-list'),count=document.getElementById('mods-installed-count');if(!root)return;
    if(count)count.textContent=installedMods.size+' / '+MOD_CATALOG.length+' установлено';
    root.innerHTML=MOD_CATALOG.map(mod=>{const active=isModInstalled(mod.id);return '<article class="mod-catalog-card '+(active?'mod-installed':'')+'"><div class="mod-card-icon">'+mod.icon+'</div><div class="mod-card-content"><div class="mod-card-title-row"><b>'+escapeHtml(mod.name)+'</b><span class="mod-version">v'+mod.version+'</span></div><div class="mod-card-meta">'+escapeHtml(mod.category)+' · '+escapeHtml(mod.compatibility)+'</div><p>'+escapeHtml(mod.description)+'</p><div class="mod-card-effect"><b>Что добавляет:</b> '+escapeHtml(mod.effect)+'</div></div><button type="button" class="mod-install-button '+(active?'installed':'')+'" data-mod-toggle="'+mod.id+'">'+(active?'Удалить':'Установить')+'</button></article>';}).join('');
    root.querySelectorAll('[data-mod-toggle]').forEach(button=>button.addEventListener('click',()=>toggleMod(button.dataset.modToggle)));renderModProfiles();renderCommunityMods();
  }
  function toggleMod(id){
    const mod=MOD_CATALOG.find(item=>item.id===id);if(!mod)return;
    const wasInstalled=installedMods.has(id);
    if(wasInstalled)installedMods.delete(id);else installedMods.add(id);
    if(!saveInstalledMods()){if(wasInstalled)installedMods.add(id);else installedMods.delete(id);return;}
    renderModCatalog();
    if(id==='cartographer'&&currentWorldId){markExploredAroundPlayer();drawMinimap();}if(id==='full_magic'&&!wasInstalled){magicMana=100;magicSpellIndex=0;toast('Магия доступна: F — выбрать заклинание, G — применить.');}if(id==='skill_expansion'){toast('Дерево навыков расширено до 13 веток и 10 уровней.');}
    if(currentWorldId)saveGame();
    toast((wasInstalled?'Мод удалён: ':'Мод установлен: ')+mod.name+'. '+(wasInstalled?'Его эффект отключён.':'Его эффект уже действует.'));
  }
  function currentMagicSpell(){return MAGIC_SPELLS[magicSpellIndex%MAGIC_SPELLS.length];}
  function cycleMagicSpell(){if(!isModInstalled('full_magic')){toast('Сначала установи мод «Полноценная магия» в каталоге.');return;}magicSpellIndex=(magicSpellIndex+1)%MAGIC_SPELLS.length;const spell=currentMagicSpell();toast('Выбрано заклинание: '+spell.name+' · мана '+Math.floor(magicMana)+'/100');}
  function updateMagic(dt){if(!isModInstalled('full_magic'))return;magicRegenClock+=dt;if(magicRegenClock>=.25){magicMana=Math.min(100,magicMana+magicRegenClock*(isModInstalled('magic_academy')?9:6));magicRegenClock=0;}}
  function castMagicSpell(){
    if(!isModInstalled('full_magic')){toast('Установи мод «Полноценная магия» в каталоге модов.');return;}
    if(paused||inMainMenu||inHouse||mineMode){toast('Магию можно применять во время приключения.');return;}
    const spell=currentMagicSpell(),cost=Math.max(8,Math.round(spell.cost*(isModInstalled('magic_academy')?.8:1)));
    if(magicMana<cost){toast('Недостаточно маны: нужно '+cost+'. Сейчас '+Math.floor(magicMana)+'.');return;}
    if(spell.name==='Исцеляющий свет'){magicMana-=cost;const before=player.hp;player.hp=Math.min(100,player.hp+42);updateVitals();spawnVisualBurst(player.x,player.y,24,'spark',spell.color);toast('Исцеляющий свет восстановил '+(player.hp-before)+' здоровья. Мана: '+Math.floor(magicMana)+'/100.');saveGame();return;}
    const candidates=monsters.filter(m=>!m.exploding&&m.hp>0&&Math.hypot(m.x-player.x,m.y-player.y)<=spell.range).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
    if(!candidates.length){toast('В радиусе заклинания нет монстров. Мана не потрачена.');return;}
    magicMana-=cost;const targets=spell.name==='Ледяная буря'?candidates.filter(m=>Math.hypot(m.x-player.x,m.y-player.y)<=spell.range):candidates.slice(0,spell.name==='Цепная молния'?3:1);
    let hits=0,kills=0;
    for(const mob of targets){const damage=Math.round(spell.damage*(classHas('mage')?1.35:1)*(isModInstalled('magic_academy')?1.15:1));mob.hp=Math.max(0,mob.hp-damage);mob.flash=.25;hits++;if(spell.name==='Ледяная буря'){if(!mob.magicOriginalSpeed)mob.magicOriginalSpeed=mob.speed||40;mob.speed=Math.max(12,mob.magicOriginalSpeed*.45);mob.magicSlowTimer=3;}spawnVisualBurst(mob.x,mob.y,spell.name==='Цепная молния'?12:18,'spark',spell.color);if(mob.hp<=0){const idx=monsters.indexOf(mob);if(idx>=0)monsters.splice(idx,1);notifyExpansionEnemyDefeated(mob);dropMonsterLoot(mob);trackAdventureQuest('hunt',1,!!mob.villageRaid);awardXP(25,'магическая победа');if(isModInstalled('bounty_hunter'))walletCents+=100+Math.floor(Math.random()*301);kills++;}}
    updateWalletHud();toast(spell.name+': поражено '+hits+' · побеждено '+kills+' · мана '+Math.floor(magicMana)+'/100');saveGame();
  }
  function openModsCatalog(){
    if(window.SkyRealmEdition&&!window.SkyRealmEdition.requirePremium('Каталог модов'))return;
    renderModCatalog();
    if(!document.getElementById('mod-profile-save')?.dataset.bound){
      const bind=(id,handler)=>{const el=document.getElementById(id);if(el){el.dataset.bound='1';el.addEventListener('click',handler);}};
      bind('mod-profile-save',saveCurrentModProfile);bind('mod-profile-apply',applyModProfile);bind('mod-profile-delete',deleteModProfile);
    }
    const shade=document.getElementById('mods-catalog-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');window.dispatchEvent(new Event('skyrealm:sync-published-mods'));loadCommunityMods();
  }
  function closeModsCatalog(){
    const shade=document.getElementById('mods-catalog-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');
  }

  function markExploredAroundPlayer(){
    if(!currentWorldId)return;
    const px=Math.floor(player.x/TILE),py=Math.floor(player.y/TILE),radius=isModInstalled('cartographer')?5:3;
    for(let y=py-radius;y<=py+radius;y++)for(let x=px-radius;x<=px+radius;x++){
      if(x<0||y<0||x>=COLS||y>=ROWS)continue;
      const dx=x-px,dy=y-py;
      if(dx*dx+dy*dy<=radius*radius+1)exploredCells.add(tileKey(x,y));
    }
  }
  function drawMinimap(){
    if(!minimapCtx||!minimapCanvas)return;
    const c=minimapCtx,mw=minimapCanvas.width,mh=minimapCanvas.height;
    c.clearRect(0,0,mw,mh);c.fillStyle='#091522';c.fillRect(0,0,mw,mh);
    const ox=5,oy=5,usableW=mw-10,usableH=mh-10,cw=usableW/COLS,ch=usableH/ROWS;
    // Unknown cells stay dark. Only cells revealed by the player's exploration are drawn.
    c.fillStyle='#152236';
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      if(!exploredCells.has(tileKey(x,y)))continue;
      let color;
      if(waterAt(x+.5,y+.5))color='#246681';
      else if(pathAt(x+.5,y+.5))color='#927951';
      else {const h=hash(x,y);color=h>.65?'#2d5d43':h>.3?'#254e3a':'#1f4636';}
      c.fillStyle=color;c.fillRect(ox+x*cw,oy+y*ch,Math.ceil(cw+.25),Math.ceil(ch+.25));
      if(gameSettings.graphicsQuality!=='low'&&!waterAt(x+.5,y+.5)&&hash(x,y)>.957){c.fillStyle='#102e25';c.fillRect(ox+x*cw+cw*.3,oy+y*ch+ch*.3,Math.max(1,cw*.45),Math.max(1,ch*.45));}
    }
    const mapPointLocal=(x,y)=>({x:ox+(x/(COLS*TILE))*usableW,y:oy+(y/(ROWS*TILE))*usableH});
    let p;
    // Landmarks and monsters appear only after their surrounding tile has been explored.
    p=mapPointLocal(36*TILE,15*TILE);
    if(exploredWorldPoint(36*TILE,15*TILE)){c.fillStyle='#e5b97b';c.fillRect(p.x-2.4,p.y-2,4.8,4);c.fillStyle='#814b46';c.beginPath();c.moveTo(p.x-3.5,p.y-2);c.lineTo(p.x,p.y-5.5);c.lineTo(p.x+3.5,p.y-2);c.closePath();c.fill();}
    if(exploredWorldPoint(mineTileX*TILE+16,mineTileY*TILE+16)){p=mapPointLocal(mineTileX*TILE+16,mineTileY*TILE+16);c.fillStyle='#ffcf75';c.beginPath();c.arc(p.x,p.y,3.4,0,Math.PI*2);c.fill();c.fillStyle='#101923';c.beginPath();c.arc(p.x,p.y,1.7,0,Math.PI*2);c.fill();}
    for(const t of world.trees){if(!exploredWorldPoint(t.x,t.y))continue;p=mapPointLocal(t.x,t.y);c.fillStyle='#0d2a21';c.fillRect(p.x,p.y,1.65,1.65);}
    for(const r of world.rocks){if(!exploredWorldPoint(r.x,r.y))continue;p=mapPointLocal(r.x,r.y);c.fillStyle='#8c9a9b';c.fillRect(p.x,p.y,1.7,1.7);}
    for(const s of world.signs){if(!exploredWorldPoint(s.x,s.y))continue;p=mapPointLocal(s.x,s.y);c.fillStyle='#f4d58d';c.fillRect(p.x-1.5,p.y-1.5,3,3);}
    for(const mob of monsters){if(!exploredWorldPoint(mob.x,mob.y))continue;p=mapPointLocal(mob.x,mob.y);c.fillStyle=mob.type==='bomb'?'#ff9a43':mob.type==='skeleton'?'#d7e1ed':'#ff536d';c.beginPath();c.arc(p.x,p.y,mob.type==='bomb'?3.2:2.8,0,Math.PI*2);c.fill();}
    if(currentWorldId){p=mapPointLocal(player.x,player.y);c.save();c.shadowColor='#fff1aa';c.shadowBlur=8;c.fillStyle='#fff2a9';c.beginPath();c.arc(p.x,p.y,3.2,0,Math.PI*2);c.fill();c.restore();}
    const percent=Math.min(100,Math.round(exploredCells.size/(COLS*ROWS)*100));
    const discovery=document.getElementById('minimap-discovery');if(discovery)discovery.textContent=percent+'% ОТКРЫТО';
    c.strokeStyle='rgba(202,225,255,.45)';c.lineWidth=1;c.strokeRect(.5,.5,mw-1,mh-1);
  }
  function monsterLabel(type){return ({yeti:'Йети',shadow:'Теневой монстр',brute:'Бронированный громила',wisp:'Болотный дух',skeleton:'Скелет-воин',bomb:'Взрывная бомбочка',ice:'Ледяной страж',scorpion:'Пустынный скорпион',ember:'Огненный элементаль'})[type]||'Монстр';}
  function scheduleNemesis(kind,id,name,type,multiplier=1.7){
    if(isCoopWorldSave()&&!window.SkyRealmCoopClient?.isRoomOwner)return;
    if(nemesisEvents.length>=MAX_NEMESIS_EVENTS)nemesisEvents.shift();
    const day=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY);
    nemesisEvents.push({id:newCoopEntityId(),kind:kind==='boss'?'boss':'monster',target:String(id||type||'enemy').slice(0,48),name:String(name||monsterLabel(type)).slice(0,48),type:['shadow','brute','wisp','skeleton','bomb','ice','scorpion','ember','yeti'].includes(type)?type:'brute',multiplier:Math.max(1.7,Math.min(8.35,Number(multiplier)||1.7)),dueDay:day+1,createdDay:day});
    saveGame();
  }
  function updateNemesisEvents(){
    if(!nemesisEvents.length||!isNightTime()||tradeWorldMode||mineMode||caveMode||dungeonMode)return;
    const day=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY);if(lastNemesisRaidDay===day)return;
    const due=nemesisEvents.filter(e=>e&&Number(e.dueDay)<=day);if(!due.length)return;
    const home=bedSpawn&&Number.isFinite(bedSpawn.x)&&Number.isFinite(bedSpawn.y)?bedSpawn:{x:player.x,y:player.y};
    const batch=due.slice(0,3);lastNemesisRaidDay=day;
    for(const event of batch){
      const angle=Math.random()*Math.PI*2,spawnX=home.x+Math.cos(angle)*150,spawnY=home.y+Math.sin(angle)*150;
      const oldX=player.x,oldY=player.y;player.x=home.x;player.y=home.y;const spawned=spawnMonster(event.type);player.x=oldX;player.y=oldY;
      let mob=spawned?monsters[monsters.length-1]:null;
      if(!mob){const base=Math.max(100,Math.round(100*difficultyConfig().monsterHp));mob={id:newCoopEntityId(),type:event.type,x:spawnX,y:spawnY,hp:base,maxHp:base,speed:45,damageScale:difficultyConfig().monsterDamage,phase:Math.random()*6.28,specialCooldown:3,attackCooldown:0};monsters.push(mob);}
      mob.x=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,spawnX));mob.y=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,spawnY));
      const baseHp=event.kind==='boss'?(event.target==='neptune'?5400:event.target==='leviathan'?7800:Math.max(1800,difficultyConfig().bossHp*1.35)):Math.max(1,Number(mob.maxHp)||100),scale=Math.max(1.7,Math.min(8.35,Number(event.multiplier)||1.7));mob.maxHp=Math.round(baseHp*scale);mob.hp=mob.maxHp;mob.speed=Math.min(115,(mob.speed||43)*(1+Math.min(.55,(scale-1)*.32)));mob.damageScale=Math.min(8.35,(event.kind==='boss'?Math.max(1.8,difficultyConfig().monsterDamage*1.6):(mob.damageScale||1))*scale);mob.nemesis=true;mob.isRebornBoss=event.kind==='boss';mob.bossTitle=event.kind==='boss'?event.name:'';mob.rebirthMultiplier=scale;mob.specialCooldown=1.8;mob.adminSpawned=true;
      spawnVisualBurst(mob.x,mob.y,30,'spark',event.kind==='boss'?'#ffbd65':'#d68aff');
    }
    nemesisEvents=nemesisEvents.filter(e=>!batch.includes(e));
    const warning=document.getElementById('night-warning');if(warning){warning.hidden=false;const label=document.getElementById('night-warning-text');if(label)label.textContent='ВОЗРОЖДЁННЫЕ ВРАГИ АТАКУЮТ ДОМ!';}
    toast('НАПАДЕНИЕ НА ДОМ! '+batch.map(e=>e.name).join(', ')+' вернулись сильнее в '+batch.length+' отрядах.');saveGame();
  }
  function notifyExpansionEnemyDefeated(mob){if(!mob?.expansionEventId||mob.expansionEventDefeated)return;mob.expansionEventDefeated=true;window.SkyRealmExpansionSystems?.onMonsterDefeated?.(String(mob.expansionEventId),String(mob.id||''));}
  function spawnMonster(typeOverride=null){
    for(let tries=0;tries<24;tries++){
      const angle=Math.random()*Math.PI*2, radius=380+Math.random()*220;
      const x=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,player.x+Math.cos(angle)*radius));
      const y=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,player.y+Math.sin(angle)*radius));
      if(waterAt(x/TILE,y/TILE)||blocked(x,y))continue;
      let type=typeOverride;
      if(type===null){const biome=biomeAt(x/TILE,y/TILE),roll=Math.random();if(biome==='volcano'&&roll<.62)type='ember';else if(biome==='snow'&&roll<.42)type='yeti';else if(biome==='snow'&&roll<.72)type='ice';else if(biome==='desert'&&roll<.58)type='scorpion';else type=roll<.28?'skeleton':(['shadow','brute','wisp'][Math.floor(Math.random()*3)]);}
      const cfg=difficultyConfig(),baseHp=type==='ember'?155:type==='yeti'?120:type==='bomb'?55:type==='skeleton'?80:type==='brute'?135:type==='ice'?115:type==='scorpion'?90:100,hp=Math.max(20,Math.round(baseHp*cfg.monsterHp*(isModInstalled('brutal_world')?1.45:1)*(isModInstalled('blood_moon')&&isNightTime()?1.15:1)));
      const speed=(type==='ember'?43:type==='yeti'?45:type==='brute'?31:type==='wisp'?58:type==='skeleton'?47:type==='bomb'?49:type==='ice'?39:type==='scorpion'?62:43)*(currentDifficulty==='easy'?.88:currentDifficulty==='impossible'?1.42:currentDifficulty==='hell'?1.2:currentDifficulty==='hard'?1.1:1)*(isModInstalled('brutal_world')?1.12:1);
      monsters.push({id:newCoopEntityId(),x,y,hp,maxHp:hp,type,speed,damageScale:cfg.monsterDamage*(isModInstalled('brutal_world')?1.35:1)*(isModInstalled('blood_moon')&&isNightTime()?1.15:1),attackCooldown:0,specialCooldown:4+Math.random()*3,phase:Math.random()*6.28,flash:0,fuseStarted:false,fuseTime:1.45,exploding:false,explosionTimer:0,damageApplied:false});
      const warning=document.getElementById('night-warning');if(warning){warning.hidden=false;const text=document.getElementById('night-warning-text');if(text)text.textContent=type==='bomb'?'ОСТОРОЖНО: взрывная бомбочка! Убегай!':monsterLabel(type)+' появился в лесу';setTimeout(()=>{if(warning)warning.hidden=true;},2600);}
      drawMinimap();return true;
    }
    return false;
  }
  function monsterLootFor(type){
    const rand=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
    const loot=[];
    if(type==='shadow'){
      loot.push({name:'Теневая эссенция',count:rand(1,2)});
      if(Math.random()<.34)loot.push({name:'Малое зелье',count:1});
      if(Math.random()<.18)loot.push({name:'Кристалл',count:1});
    }else if(type==='brute'){
      loot.push({name:'Кость',count:rand(1,2)},{name:'Камень',count:rand(1,3)});
      if(Math.random()<.35)loot.push({name:'Железо',count:1});
    }else if(type==='wisp'){
      loot.push({name:'Ядро духа',count:1});
      if(Math.random()<.32)loot.push({name:'Кристалл',count:1});
      if(Math.random()<.18)loot.push({name:'Малое зелье',count:1});
    }else if(type==='skeleton'){
      loot.push({name:'Кость',count:rand(2,3)});
      if(Math.random()<.28)loot.push({name:'Череп',count:1});
      if(Math.random()<.16)loot.push({name:'Железо',count:1});
    }else if(type==='bomb'){
      loot.push({name:'Осколок бомбы',count:rand(1,2)});
      if(Math.random()<.55)loot.push({name:'Уголь',count:rand(1,2)});
      if(Math.random()<.22)loot.push({name:'Кость',count:1});
    }else if(type==='ice'){
      loot.push({name:'Кристалл',count:rand(1,2)});if(Math.random()<.24)loot.push({name:'Малое зелье',count:1});
    }else if(type==='scorpion'){
      loot.push({name:'Пустынный хитин',count:rand(1,2)});if(Math.random()<.22)loot.push({name:'Кристалл',count:1});
    }else if(type==='ember'){
      loot.push({name:'Метеоритный осколок',count:rand(1,2)});if(Math.random()<.28)loot.push({name:'Кристалл',count:1});
    }
    if((skills.scout>0||skills.fortune>0)&&Math.random()<Math.min(.8,skills.scout*.04+skills.fortune*.02))loot.push({name:Math.random()<.5?'Кристалл':'Малое зелье',count:1});
    if(isModInstalled('scavenger')&&Math.random()<.25)loot.push({name:Math.random()<.5?'Кристалл':'Малое зелье',count:1});
    if(isModInstalled('blood_moon')&&loot.length&&Math.random()<.35)loot.splice(Math.floor(Math.random()*loot.length),1);
    return loot;
  }
  function dropMonsterLoot(mob){
    if(!mob||mob.lootDropped)return;
    mob.lootDropped=true;
    window.SkyRealmJobs?.record?.('hunter',1);
    const loot=monsterLootFor(mob.type);
    if(isCoopWorldActive()){
      const network=window.SkyRealmCoopClient;
      if(network?.isRoomOwner)spawnSharedLoot(mob.x,mob.y,loot,'surface');
      return;
    }
    for(const item of loot){
      lootDrops.push({x:mob.x+(Math.random()-.5)*28,y:mob.y+(Math.random()-.5)*24,name:item.name,count:item.count,life:240,phase:Math.random()*6.28});
    }
    if(lootDrops.length>80)lootDrops.splice(0,lootDrops.length-80);
    saveGame();
  }
  function drawLootDrops(camX,camY,time){
    for(const drop of lootDrops){
      const x=drop.x-camX,y=drop.y-camY+Math.sin(time/230+drop.phase)*2;
      if(x<-25||x>width+25||y<-30||y>height+30)continue;
      const item=inventoryItems.find(i=>i.name===drop.name),icon=item?.icon||'✨';
      ctx.save();ctx.shadowColor='#ffd46f';ctx.shadowBlur=10;ctx.fillStyle='#102033dd';ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='#ffd46f';ctx.lineWidth=1.5;ctx.stroke();ctx.font='15px Segoe UI Emoji';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icon,x,y);ctx.textBaseline='alphabetic';
      if(drop.count>1){ctx.fillStyle='#fff2be';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('×'+drop.count,x+12,y-10);}ctx.restore();
    }
  }
  function pickUpLoot(dt){
    if(inHouse||mineMode||tradeWorldMode)return;
    for(let i=lootDrops.length-1;i>=0;i--){const drop=lootDrops[i];drop.life-=dt;if(drop.life<=0){if(drop.shared&&isCoopWorldActive()&&!window.SkyRealmCoopClient?.isRoomOwner)continue;lootDrops.splice(i,1);continue;}
      if(Math.hypot(player.x-drop.x,player.y-drop.y)<34){
        if(drop.shared&&isCoopWorldActive()&&!window.SkyRealmCoopClient?.isRoomOwner){queueGuestLootPickup(drop);continue;}
        if(drop.shared&&isCoopWorldActive()&&window.SkyRealmCoopClient?.isRoomOwner){
          grantLootToPersonalInventory(drop.name,drop.count);
          toast('Подобрано: '+drop.name+' ×'+drop.count+' · добыча исчезла для всех участников.');
        }else{
          changeItem(drop.name,drop.count);renderInventory();
          toast('Подобрано: '+drop.name+' ×'+drop.count);
        }
        spawnVisualBurst(drop.x,drop.y,7,'spark','#ffe28b');playSound('coin');
        lootDrops.splice(i,1);updateWalletHud();saveGame();
      }
    }
  }
  let lastAppliedSharedDeathSequence=0,activeCoopDeathRoomId='',coopDeathReportPending=false;
  function applyCoopSharedDeathEvent(event){
    const sequence=Number(event?.sequence);
    if(!Number.isSafeInteger(sequence)||sequence<=lastAppliedSharedDeathSequence)return;
    const missed=Math.min(10,sequence-lastAppliedSharedDeathSequence);
    lastAppliedSharedDeathSequence=sequence;
    for(let i=0;i<missed;i++)respawnPlayerAfterDefeat(true);
  }
  function syncCoopSharedDeath(){
    const network=window.SkyRealmCoopClient;
    const state=network?.getRoomState?.();
    if(!state){activeCoopDeathRoomId='';lastAppliedSharedDeathSequence=0;return;}
    if(activeCoopDeathRoomId!==state.id){
      activeCoopDeathRoomId=state.id;
      lastAppliedSharedDeathSequence=Number(network.getSharedDeathSequence?.())||0;
    }
    if(state.status!=='running')return;
    const event=network.getSharedDeathEvent?.();
    if(event)applyCoopSharedDeathEvent(event);
  }
  function showDeathScreen(context){
    deathScreenOpen=true;deathScreenContext=context;paused=true;inMainMenu=false;
    keys.clear();pressedMovementCodes.clear();movementDirections.clear();
    document.getElementById('skyrealm-death-screen')?.remove();
    const root=document.createElement('div');root.id='skyrealm-death-screen';root.className='shade death-screen-shade';
    root.style.cssText='position:fixed;inset:0;z-index:110000;display:grid;place-items:center;padding:22px;background:radial-gradient(ellipse at 50% 25%,rgba(130,28,45,.30),transparent 48%),linear-gradient(180deg,rgba(4,6,12,.88),rgba(2,4,9,.97));backdrop-filter:blur(10px);font-family:Segoe UI,Arial,sans-serif;color:#f3f5ff;box-sizing:border-box;';
    root.innerHTML='<section style="width:min(560px,100%);padding:36px 34px 30px;border:1px solid rgba(232,103,117,.65);border-radius:22px;background:linear-gradient(145deg,rgba(35,19,31,.98),rgba(9,13,24,.99) 72%);box-shadow:0 30px 110px rgba(0,0,0,.72),inset 0 1px rgba(255,255,255,.08);text-align:center;box-sizing:border-box"><div style="width:78px;height:78px;margin:0 auto 18px;border:1px solid rgba(255,120,137,.56);border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,#8a3048,#351c31 70%);box-shadow:0 0 38px rgba(234,72,102,.28);font-size:38px;color:#ffd7dd">✕</div><div style="font-size:10px;font-weight:900;letter-spacing:4px;color:#e69aa6">SKYREALM · ПУТЕШЕСТВИЕ ПРЕРВАНО</div><h1 style="margin:10px 0 8px;font-size:clamp(32px,7vw,48px);line-height:1.05;letter-spacing:1px;color:#fff">ВЫ УМЕРЛИ</h1><p data-death-details style="margin:14px auto 25px;max-width:420px;font-size:13px;line-height:1.65;color:#c6c2ce"></p><div style="display:grid;gap:11px"><button type="button" data-death-respawn style="min-height:52px;border:1px solid #e49c70;border-radius:11px;background:linear-gradient(135deg,#a94c42,#653044);color:#fff;font-size:15px;font-weight:900;letter-spacing:.4px;cursor:pointer;box-shadow:0 8px 24px rgba(164,58,67,.25)">↻  ВОЗРОДИТЬСЯ</button><button type="button" data-death-menu style="min-height:48px;border:1px solid #63718c;border-radius:11px;background:linear-gradient(135deg,#26354d,#172236);color:#eaf0ff;font-size:13px;font-weight:800;cursor:pointer">⌂  В ГЛАВНОЕ МЕНЮ</button></div><div style="margin-top:17px;font-size:10px;letter-spacing:1px;color:#77849e">МИР СОХРАНЁН · ВЫБЕРИ ДАЛЬНЕЙШЕЕ ДЕЙСТВИЕ</div></section>';
    root.querySelector('[data-death-details]').textContent=context.message+(context.dropped?' Часть вещей выпала возле места гибели.':'')+(context.inBossRealm?' Ты погиб в Мире боссов. После возрождения продолжишь испытание.':'');
    root.querySelector('[data-death-respawn]').addEventListener('click',completeDeathRespawn);
    root.querySelector('[data-death-menu]').addEventListener('click',leaveDeathToMainMenu);
    document.body.appendChild(root);
  }
  function closeDeathScreen(){
    document.getElementById('skyrealm-death-screen')?.remove();
    deathScreenOpen=false;deathScreenContext=null;
  }
  function completeDeathRespawn(){
    if(!deathScreenOpen||!deathScreenContext)return;
    const inBossRealm=deathScreenContext.inBossRealm;
    closeDeathScreen();player.hp=100;player.vx=player.vy=0;dodgeTimer=0;
    if(inBossRealm){
      const portal=bossRealmPortalPosition();player.x=Math.max(TILE,portal.x-3*TILE);player.y=Math.min(ROWS*TILE-TILE,portal.y+2*TILE);
      inHouse=false;mineMode=false;caveMode=false;dungeonMode=false;tradeWorldMode=false;bossRealmMode=true;
      toast('Ты возродился у разломного портала. Испытание продолжается.');
    }else{
      player.x=bedSpawn.x;player.y=bedSpawn.y;monsters.length=0;
      toast('Ты возродился у кровати. Будь осторожнее!');
    }
    paused=false;inMainMenu=false;keys.clear();pressedMovementCodes.clear();movementDirections.clear();
    updateVitals();renderInventory();updateWalletHud();saveGame();last=performance.now();
  }
  function leaveDeathToMainMenu(){
    if(!deathScreenOpen)return;
    const inBossRealm=!!deathScreenContext?.inBossRealm;closeDeathScreen();
    player.hp=100;player.vx=player.vy=0;
    if(inBossRealm){const portal=bossRealmPortalPosition();player.x=Math.max(TILE,portal.x-3*TILE);player.y=Math.min(ROWS*TILE-TILE,portal.y+2*TILE);}
    else{player.x=bedSpawn.x;player.y=bedSpawn.y;}
    updateVitals();saveGame();returnToMainMenu();
  }
  function respawnPlayerAfterDefeat(sharedCoopEvent=false){
    if(deathScreenOpen)return;
    if(!sharedCoopEvent){
      const network=window.SkyRealmCoopClient;
      if(network?.getWorldSession?.()&&typeof network.reportSharedDeath==='function'){
        if(coopDeathReportPending)return;
        coopDeathReportPending=true;
        network.reportSharedDeath().then(event=>applyCoopSharedDeathEvent(event)).catch(error=>{
          console.warn('[SkyRealm shared death]',error);
          toast('Сервер не ответил на общую смерть. Применён личный штраф.');
          const nextSequence=(Number(network.getSharedDeathSequence?.())||lastAppliedSharedDeathSequence)+1;
          applyCoopSharedDeathEvent({sequence:nextSequence});
        }).finally(()=>{coopDeathReportPending=false;});
        return;
      }
    }
    const penalties={easy:{gold:200,hunger:10,items:0,dropChance:0},medium:{gold:500,hunger:20,items:2,dropChance:.65},hard:{gold:1500,hunger:35,items:4,dropChance:.8},hell:{gold:3000,hunger:55,items:999,dropChance:.72},impossible:{gold:5000,hunger:70,items:999,dropChance:.9}};
    const cfg=penalties[currentDifficulty]||penalties.medium,deathX=player.x,deathY=player.y;let dropped=0;
    walletCents=Math.max(0,walletCents-cfg.gold);hunger=Math.max(0,hunger-cfg.hunger);
    const candidates=inventoryItems.filter(i=>i.count>0&&!['Деревянный меч','Топор','Кирка'].includes(i.name)).sort(()=>Math.random()-.5);
    let remaining=cfg.items;
    for(const item of candidates){
      if(remaining<=0)break;
      const wanted=(currentDifficulty==='hell'||currentDifficulty==='impossible')?Math.max(1,Math.ceil(item.count*((currentDifficulty==='impossible'?.55:.35)+Math.random()*(currentDifficulty==='impossible'?.35:.4)))):Math.min(item.count,1+Math.floor(Math.random()*2));
      const amount=Math.min(item.count,wanted,remaining);if(amount<=0)continue;
      item.count-=amount;remaining-=amount;
      if(Math.random()<cfg.dropChance&&lootDrops.length<76){lootDrops.push({x:deathX+(Math.random()-.5)*48,y:deathY+(Math.random()-.5)*42,name:item.name,count:amount,life:240,phase:Math.random()*6.28});dropped+=amount;}
    }
    if(dungeonMode){dungeonMode=false;player.x=dungeonReturn.x;player.y=dungeonReturn.y;}
    if(caveMode){caveMode=false;caveSecretRoom=0;player.x=caveReturn.x;player.y=caveReturn.y;}
    const inBossRealm=bossRealmMode;
    inHouse=false;mineMode=false;tradeWorldMode=false;player.hp=100;player.vx=player.vy=0;dodgeTimer=0;
    const message=currentDifficulty==='easy'?'Штраф: потеряно до 2 золота и 10 голода.':currentDifficulty==='medium'?'Штраф: потеряно до 5 золота и 20 голода.':currentDifficulty==='hard'?'Штраф: потеряно до 15 золота, часть вещей и 35 голода.':currentDifficulty==='impossible'?'Штраф: потеряно до 50 золота, большая часть переносимых ресурсов и 70 голода.':'Штраф: потеряно до 30 золота, часть ресурсов и 55 голода.';
    if(inBossRealm){
      for(const mob of monsters){if(!mob.bossRealmCreature)continue;mob.hp=Math.max(1,Number(mob.maxHp)||1);mob.flash=0;mob.attackCooldown=1.25;mob.specialCooldown=3+Math.random()*2;mob.telegraphTimer=0;mob.telegraphActive=false;mob.action='idle';mob.actionTimer=0;mob.shield=0;}
      bossRealmState.spawnTimer=Math.max(4,Number(bossRealmState.spawnTimer)||0);
      const portal=bossRealmPortalPosition();player.x=Math.max(TILE,portal.x-3*TILE);player.y=Math.min(ROWS*TILE-TILE,portal.y+2*TILE);
    }else{
      player.x=bedSpawn.x;player.y=bedSpawn.y;monsters.length=0;
    }
    player.hp=100;updateVitals();renderInventory();updateWalletHud();saveGame();
    showDeathScreen({message,dropped,inBossRealm,deathX,deathY});
  }
  function interactWolfCage(){const p=wolfCagePosition();if(Math.hypot(player.x-p.x,player.y-p.y)>92)return false;if(!wolfCageOpen){if(!wolfBossKeyDropped||itemCount('Ключ от клетки')<1){toast('Клетка заперта. Победи Оборотня и забери ключ!');return true;}changeItem('Ключ от клетки',-1);wolfCageOpen=true;playWolfSound('howl');toast('Клетка открыта! Нажми E рядом с собакой, чтобы приручить её.');saveGame();return true;}if(wolfDogCaged){wolfDogCaged=false;wolfCompanionUnlocked=true;wolfCompanionHp=300;wolfDogDeathHandled=false;wolfCompanionOffsetX=28;wolfCompanionOffsetY=22;playSound('sheep');toast('Собака приручена! Она будет ходить за тобой. У неё 300 HP.');saveGame();return true;}return true;}
  function clampWolfBossToForest(x,y){
    const minX=(COLS-32)*TILE+16,maxX=(COLS-3)*TILE+16;
    const minY=(ROWS-27)*TILE+16,maxY=(ROWS-3)*TILE+16;
    return {
      x:Math.max(minX,Math.min(maxX,Number.isFinite(x)?x:minX)),
      y:Math.max(minY,Math.min(maxY,Number.isFinite(y)?y:minY))
    };
  }
  function updateWolfAndDog(dt){
    if(bossRealmMode||tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode)return;
    if(wolfBossActive){const bounded=clampWolfBossToForest(wolfBossX,wolfBossY);wolfBossX=bounded.x;wolfBossY=bounded.y;}
    if(isCoopWorldActive()&&!window.SkyRealmCoopClient?.isRoomOwner){
      coopGuestWolfAttackCooldown=Math.max(0,coopGuestWolfAttackCooldown-dt);
      if(wolfBossActive&&wolfBossHp>0&&Math.hypot(player.x-wolfBossX,player.y-wolfBossY)<=112&&
         coopGuestWolfAttackCooldown<=0&&!immortal&&dodgeTimer<=0){
        const damage=Math.max(1,Math.round((12+difficultyConfig().rank*4)*(1-armorReduction())));
        player.hp=Math.max(0,player.hp-damage);coopGuestWolfAttackCooldown=1.5;
        updateVitals();toast('Общий Оборотень ударил тебя: −'+damage+' HP!');
        if(player.hp<=0)respawnPlayerAfterDefeat();
      }
      return;
    }
    if(!wolfCompanionUnlocked&&!wolfBossDefeated&&!wolfBossKeyDropped&&inForest(player.x,player.y)&&!wolfBossActive){const den=wolfDenPosition();wolfBossActive=true;wolfBossHp=1000+difficultyConfig().rank*500;wolfBossX=den.x;wolfBossY=den.y;wolfBossAttackTimer=1.2;toast('Ты вошёл в Лес! В логове ждёт босс Оборотень. Победи его, чтобы приручить собаку.');saveGame();}
    if(wolfBossActive){const dx=player.x-wolfBossX,dy=player.y-wolfBossY,dist=Math.hypot(dx,dy)||1;const wolfAttackRange=112;if(dist>wolfAttackRange-8){
      const step=(42+difficultyConfig().rank*4)*dt;
      const next=clampWolfBossToForest(wolfBossX+dx/dist*step,wolfBossY+dy/dist*step);
      if(!world.trees.some(t=>Math.hypot(t.x-next.x,t.y-next.y)<22)){wolfBossX=next.x;wolfBossY=next.y;}
      else{
        const slideX=clampWolfBossToForest(wolfBossX+Math.sign(dx)*step,wolfBossY);
        if(!world.trees.some(t=>Math.hypot(t.x-slideX.x,t.y-wolfBossY)<22))wolfBossX=slideX.x;
        const slideY=clampWolfBossToForest(wolfBossX,wolfBossY+Math.sign(dy)*step);
        if(!world.trees.some(t=>Math.hypot(t.x-wolfBossX,t.y-slideY.y)<22))wolfBossY=slideY.y;
      }
    }wolfBossAttackTimer-=dt;wolfBossSpecialTimer=Math.max(0,wolfBossSpecialTimer-dt);if(wolfBossSpecialTimer<=0){wolfBossSpecialTimer=8.5;if(dist<190&&!immortal&&dodgeTimer<=0){const howlDamage=Math.max(1,Math.round((18+difficultyConfig().rank*5)*(1-armorReduction())));player.hp=Math.max(0,player.hp-howlDamage);spawnVisualBurst(player.x,player.y,26,'spark','#a9d7ff');updateVitals();playWolfSound('howl');toast('ОБОРОТЕН · ОГЛУШИТЕЛЬНЫЙ ВОЙ: −'+howlDamage+' HP!');if(player.hp<=0)respawnPlayerAfterDefeat();}}if(wolfBossAttackTimer<=0){wolfBossAttackTimer=Math.max(.7,1.5-difficultyConfig().rank*.12);playWolfSound(Math.random()<.28?'howl':'growl');if(wolfCompanionUnlocked&&wolfCompanionHp>0&&Math.hypot(wolfCompanionX()-wolfBossX,wolfCompanionY()-wolfBossY)<48){wolfCompanionHp=Math.max(0,wolfCompanionHp-Math.round((12+difficultyConfig().rank*3)*(dogBehavior==='guard' ? 0.55 : 1)));if(wolfCompanionHp<=0)onWolfDogDeath();}else if(dist<wolfAttackRange&&!immortal&&dodgeTimer<=0){const damage=12+difficultyConfig().rank*4;player.hp=Math.max(0,player.hp-damage);updateVitals();toast('Оборотень ударил тебя: −'+damage+' HP!');if(player.hp<=0)respawnPlayerAfterDefeat();}}}
    if(wolfCompanionUnlocked&&wolfCompanionHp>0&&!inHouse&&!mineMode&&!caveMode&&!tradeWorldMode){wolfCompanionAttackTimer-=dt;if(wolfCompanionAttackTimer<=0){wolfCompanionAttackTimer=.85;const damage=Math.round((10+difficultyConfig().rank*5)*(dogBehavior==='hunt'?1.45:dogBehavior==='guard' ? 0.75 : 1)*(isModInstalled('beast_companions')?1.5:1)*(1+skillBonus('beastmaster')*.08));if(wolfBossActive&&Math.hypot(wolfCompanionX()-wolfBossX,wolfCompanionY()-wolfBossY)<70){wolfBossHp-=damage;if(wolfBossHp<=0)defeatWolfBoss();}else{let target=null,bd=70;for(const mob of monsters){if(mob.exploding)continue;const d=Math.hypot(mob.x-wolfCompanionX(),mob.y-wolfCompanionY());if(d<bd){bd=d;target=mob;}}if(target){if(target.bossRealmCreature&&target.raidCrystalCount>0){target.raidCrystalCount--;target.flash=.18;spawnVisualBurst(target.x,target.y,18,'spark','#ffe49a');}else if(target.bossRealmCreature&&target.shield>0){target.shield=Math.max(0,target.shield-1);target.flash=.12;spawnVisualBurst(target.x,target.y,14,'spark','#8deaff');}else{target.hp-=damage;if(target.hp<=0){applyArtifactKillEffects();if(target.bossRealmCreature)recordBossRealmDefeat(target);else scheduleNemesis(target.isRebornBoss?'boss':'monster',target.id,target.bossTitle||monsterLabel(target.type),target.type,Math.min(8.35,(target.rebirthMultiplier||1)*1.7));if(target.isRebornBoss)triggerBossVictory(target.bossTitle||monsterLabel(target.type),target.x,target.y,'#ffc66d');const i=monsters.indexOf(target);if(i>=0)monsters.splice(i,1);notifyExpansionEnemyDefeated(target);dropMonsterLoot(target);trackAdventureQuest('hunt',1,!!target.villageRaid);awardXP(12,'помощь собаки');}}}}}
    }
  }
  function onWolfDogDeath(){if(wolfDogDeathHandled)return;wolfDogDeathHandled=true;wolfCompanionUnlocked=false;wolfCompanionHp=0;if(wolfCompanionRevivals<3){wolfCompanionRevivals++;wolfBossDefeated=false;wolfBossActive=true;wolfBossHp=1000+difficultyConfig().rank*500;const den=wolfDenPosition();wolfBossX=den.x;wolfBossY=den.y;toast('Собака погибла. Оборотень вернулся в лес — победи его снова ('+wolfCompanionRevivals+'/3 возрождений).');}else toast('Собака погибла окончательно: лимит возрождений босса исчерпан.');saveGame();}
  function defeatWolfBoss(){
    scheduleNemesis('boss','wolf','Оборотень','shadow',1.7);
    wolfBossActive=false;wolfBossDefeated=true;triggerBossVictory('Оборотень',wolfBossX,wolfBossY,'#b6d6ff');wolfBossKeyDropped=true;wolfCompanionUnlocked=false;wolfCompanionHp=300;wolfDogDeathHandled=false;wolfCompanionOffsetX=28;wolfCompanionOffsetY=22;
    // The cage key is a guaranteed direct reward, never a random ground drop.
    changeItem('Ключ от клетки',1);
    if(isCoopWorldActive()&&window.SkyRealmCoopClient?.isRoomOwner)spawnSharedLoot(wolfBossX,wolfBossY,[{name:'Кристалл',count:2},{name:'Золото',count:50}],'surface');
    else{walletCents+=5000;changeItem('Кристалл',2);renderInventory();}
    spawnVisualBurst(wolfBossX,wolfBossY,34,'spark','#b6d6ff');playWolfSound('howl');toast('ОБОРОТЕН ПОБЕЖДЁН! Награда появилась в общей добыче леса.');awardXP(180,'победа над Оборотнем');saveGame();
  }
  function updateMonsters(dt){
    // Boss Realm owns its combat simulation and must run before surface-world mode guards.
    if(bossRealmMode){updateBossRealmEnemies(dt);return;}
    if(tradeWorldMode||inHouse||mineMode||caveMode||dungeonMode){return;}
    const coopNetwork=window.SkyRealmCoopClient,coopRoom=coopNetwork?.getRoomState?.();
    if(isCoopWorldActive()&&coopRoom&&!coopNetwork?.isRoomOwner){
      damageToastTimer=Math.max(0,damageToastTimer-dt);
      for(const mob of monsters){
        if(mob.exploding){
          const key=mob.id+':explosion',distance=Math.hypot(player.x-mob.x,player.y-mob.y);
          if(distance<=116&&!immortal&&dodgeTimer<=0&&!coopGuestMobAttackCooldowns.has(key)){
            const damage=Math.round(30*difficultyConfig().monsterDamage);player.hp=Math.max(0,player.hp-damage);
            coopGuestMobAttackCooldowns.set(key,10);updateVitals();toast('Общий взрыв: −'+damage+' здоровья.');
            if(player.hp<=0)respawnPlayerAfterDefeat();
          }
          continue;
        }
        const distance=Math.hypot(player.x-mob.x,player.y-mob.y),cooldown=coopGuestMobAttackCooldowns.get(mob.id)||0;
        if(cooldown>0){coopGuestMobAttackCooldowns.set(mob.id,Math.max(0,cooldown-dt));continue;}
        if(distance<=34&&!immortal&&dodgeTimer<=0){
          const damage=Math.max(1,Math.round((mob.type==='brute'?7:mob.type==='skeleton'?6:mob.type==='ice'?7:mob.type==='scorpion'?6:5)*(mob.damageScale||difficultyConfig().monsterDamage)*(1-armorReduction())));
          player.hp=Math.max(0,player.hp-damage);coopGuestMobAttackCooldowns.set(mob.id,mob.type==='yeti'?.9:1);
          updateVitals();toast(monsterLabel(mob.type)+' атакует: −'+damage+' HP!');
          if(player.hp<=0){respawnPlayerAfterDefeat();break;}
        }
      }
      return;
    }
      const active=isNightTime()&&(worldEarlyMonsters===true||survivedNights>=(currentDifficulty==='impossible'?1:3));
    if(active){monsterSpawnTimer+=dt;const brutal=isModInstalled('brutal_world'),eternalMoon=isModInstalled('blood_moon');const spawnInterval=(bloodMoonActive?5:10)*difficultyConfig().monsterSpawn*(brutal?.78:1)*(eternalMoon?.72:1)*(isModInstalled('arena_survival')?.78:1);const populationLimit=(currentDifficulty==='impossible'?10:6)+(brutal?2:0)+(eternalMoon?2:0)+(isModInstalled('arena_survival')?3:0);if(monsterSpawnTimer>=spawnInterval&&monsters.length<populationLimit){const bombChance=(currentDifficulty==='impossible'?.35:.20)+(eternalMoon?.25:0);if(Math.random()<bombChance)spawnMonster('bomb');else spawnMonster();monsterSpawnTimer=0;}}
    else {monsterSpawnTimer=0;for(let j=monsters.length-1;j>=0;j--)if(!monsters[j].adminSpawned)monsters.splice(j,1);}
    damageToastTimer=Math.max(0,damageToastTimer-dt);
    for(let i=monsters.length-1;i>=0;i--){
      const mob=monsters[i];mob.flash=Math.max(0,mob.flash-dt);if(mob.magicSlowTimer>0){mob.magicSlowTimer=Math.max(0,mob.magicSlowTimer-dt);if(mob.magicSlowTimer===0&&mob.magicOriginalSpeed){mob.speed=mob.magicOriginalSpeed;delete mob.magicOriginalSpeed;}}
      if(mob.exploding){mob.explosionTimer-=dt;if(mob.explosionTimer<=0){if(!mob.nemesisScheduled){mob.nemesisScheduled=true;scheduleNemesis('monster',mob.id,monsterLabel(mob.type),mob.type,Math.min(8.35,(mob.rebirthMultiplier||1)*1.7));}monsters.splice(i,1);}continue;}
      const dx=player.x-mob.x,dy=player.y-mob.y,dist=Math.hypot(dx,dy)||1;
      // Distant ordinary mobs are dormant until the player approaches; bosses and nemeses remain fully simulated.
      if(dist>Math.max(width,height)*1.35&&!mob.bossRealmCreature&&!mob.isRebornBoss&&!mob.nemesis){mob.age=(mob.age||0)+dt;continue;}
      if(dist>25){const speed=mob.speed||43,nx=mob.x+dx/dist*speed*dt,ny=mob.y+dy/dist*speed*dt;if(!blocked(nx,mob.y))mob.x=nx;if(!blocked(mob.x,ny))mob.y=ny;}
      const currentDistance=Math.hypot(player.x-mob.x,player.y-mob.y);
      mob.age=(mob.age||0)+dt;
      if(mob.villageGuardian){
        mob.villageGuardianAttackTimer=Math.max(0,(mob.villageGuardianAttackTimer||0)-dt);
        const guardianReach=weaponRange()/1.2;
        if(currentDistance<=guardianReach&&mob.villageGuardianAttackTimer<=0&&!immortal&&dodgeTimer<=0){
          const hit=Math.max(1,Math.round(19*(1-armorReduction())));
          player.hp=Math.max(0,player.hp-hit);mob.villageGuardianAttackTimer=1.25;
          mob.flash=.12;spawnVisualBurst(mob.x,mob.y,14,'spark','#f0ca79');
          updateVitals();toast('ВЕЛИКИЙ СТРАЖ ДЕРЕВНИ · тяжёлый удар: −'+hit+' HP');
          if(player.hp<=0)respawnPlayerAfterDefeat();
        }
        continue;
      }
      if(mob.forestMiniBoss&&mob.hp>0){
        const ratio=mob.hp/Math.max(1,mob.maxHp);
        if(ratio<.58&&mob.forestPhase<2){mob.forestPhase=2;mob.damageScale=1.48;mob.speed*=1.12;mob.specialCooldown=Math.min(mob.specialCooldown||3,1.2);spawnVisualBurst(mob.x,mob.y,28,'spark','#e8bd72');toast(mob.bossTitle+' входит во вторую фазу! Удары стали быстрее.');}
        if(ratio<.24&&mob.forestPhase<3){mob.forestPhase=3;mob.damageScale=1.72;mob.specialCooldown=.5;spawnVisualBurst(mob.x,mob.y,38,'spark','#ff805f');toast(mob.bossTitle+' впадает в ярость! Третья фаза боя.');}
      }
      if(!mob.expansionEventId&&!mob.reproduced&&['shadow','wisp','scorpion','skeleton','brute','ice','ember','yeti'].includes(mob.type)&&mob.age>=28&&monsters.length<8&&!mob.nemesis){mob.reproduced=true;const childHp=Math.max(20,Math.round(mob.maxHp*.55));monsters.push({id:newCoopEntityId(),type:mob.type,x:mob.x+24,y:mob.y+18,hp:childHp,maxHp:childHp,speed:(mob.speed||43)*1.08,damageScale:mob.damageScale||1,attackCooldown:0,specialCooldown:5,phase:Math.random()*6.28,flash:0,fuseStarted:false,fuseTime:1.45,exploding:false,explosionTimer:0,damageApplied:false});spawnVisualBurst(mob.x,mob.y,12,'spark','#b88aff');toast(monsterLabel(mob.type)+' размножился! Появился ещё один враг.');}
      mob.specialCooldown=Math.max(0,(mob.specialCooldown||0)-dt);
      if(!mob.exploding&&mob.specialCooldown<=0&&currentDistance<=(mob.type==='skeleton'||mob.type==='wisp'?230:mob.type==='ember'?145:mob.type==='ice'?120:mob.type==='scorpion'?96:mob.type==='yeti'?110:105)){
        mob.specialCooldown=mob.nemesis?4.2:7.5+Math.random()*2.5;
        const reach=mob.type==='skeleton'||mob.type==='wisp'?230:mob.type==='scorpion'?96:mob.type==='ember'?145:mob.type==='ice'?120:mob.type==='yeti'?110:105;
        const hitBase={shadow:9,brute:15,wisp:8,skeleton:9,ice:12,scorpion:8,ember:13,yeti:14,bomb:0}[mob.type]||8;
        if(currentDistance<=reach&&!immortal&&dodgeTimer<=0){const hit=Math.max(1,Math.round(hitBase*(mob.damageScale||1)*(1-armorReduction())));player.hp=Math.max(0,player.hp-hit);spawnVisualBurst(player.x,player.y,16,'spark',({shadow:'#bd8cff',brute:'#c5a37c',wisp:'#78f4cf',skeleton:'#e9e0c7',ice:'#83eaff',scorpion:'#d99a42',ember:'#ff7b39',yeti:'#d7f5ff'}[mob.type]||'#ff9b9b'));updateVitals();const attackName={shadow:'РЫВОК ИЗ ТЕНИ',brute:'РАЗРУШАЮЩИЙ УДАР',wisp:'ДУХОВНЫЙ ИМПУЛЬС',skeleton:'КОСТЯНОЙ ЗАЛП',ice:'ЛЕДЯНАЯ ВОЛНА',scorpion:'ЯДОВИТЫЙ ВЫПАД',ember:'ОГНЕННЫЙ ВЗРЫВ',yeti:'УДАР ЛАПОЙ'}[mob.type]||'ОСОБАЯ АТАКА';toast((mob.bossTitle||monsterLabel(mob.type))+' · '+attackName+': −'+hit+' HP'+(mob.nemesis?' · усиление ×'+Number(mob.rebirthMultiplier||1).toFixed(1):''));if(player.hp<=0)respawnPlayerAfterDefeat();}
      }
      if(wolfCompanionUnlocked&&wolfCompanionHp>0&&Math.hypot(wolfCompanionX()-mob.x,wolfCompanionY()-mob.y)<30){mob.dogBiteCooldown=Math.max(0,(mob.dogBiteCooldown||0)-dt);if(mob.dogBiteCooldown<=0){wolfCompanionHp=Math.max(0,wolfCompanionHp-8*difficultyConfig().monsterDamage);mob.dogBiteCooldown=1.1;if(wolfCompanionHp<=0)onWolfDogDeath();}}
      if(mob.type==='bomb'){
        if(!mob.fuseStarted&&currentDistance<145){mob.fuseStarted=true;mob.fuseTime=1.45;toast('Бомбочка зажгла фитиль! Убегай — взрыв опасен.');}
        if(mob.fuseStarted){mob.fuseTime-=dt;if(mob.fuseTime<=0){mob.exploding=true;mob.explosionTimer=.42;mob.nemesisScheduled=true;scheduleNemesis('monster',mob.id,monsterLabel(mob.type),mob.type,Math.min(8.35,(mob.rebirthMultiplier||1)*1.7));if(!immortal&&dodgeTimer<=0&&Math.hypot(player.x-mob.x,player.y-mob.y)<=116){const bombDamage=Math.round(30*difficultyConfig().monsterDamage);player.hp=Math.max(0,player.hp-bombDamage);updateVitals();toast('Взрыв бомбочки! −'+bombDamage+' здоровья.');if(player.hp<=0)respawnPlayerAfterDefeat();}else toast('Бомбочка взорвалась! Ты успел убежать.');dropMonsterLoot(mob);playSound('hit');}continue;}
        continue;
      }
      const reduction=armorReduction();if(mob.type==='yeti'){mob.attackCooldown=Math.max(0,(mob.attackCooldown||0)-dt);if(currentDistance<=43&&!immortal&&mob.attackCooldown<=0&&dodgeTimer<=0){const damage=Math.max(1,Math.round(10*(mob.damageScale||difficultyConfig().monsterDamage)*(1-reduction)));player.hp=Math.max(0,player.hp-damage);mob.attackCooldown=.9;updateVitals();toast('Йети ударил тебя: −'+damage+' HP!');}}else if(currentDistance<=34&&!immortal){const damage=(mob.type==='brute'?7:mob.type==='skeleton'?6:mob.type==='ice'?7:mob.type==='scorpion'?6:5)*dt*(mob.damageScale||difficultyConfig().monsterDamage)*(bloodMoonActive?1.5:1)*(1-reduction)*(dodgeTimer>0?0:1);player.hp=Math.max(0,player.hp-damage);updateVitals();if(damageToastTimer<=0){toast(monsterLabel(mob.type)+' атакует!');damageToastTimer=1.6;}}
      if(player.hp<=0&&immortal){player.hp=100;updateVitals();}
      if(player.hp<=0){respawnPlayerAfterDefeat();break;}
    }
  }
  function spawnOneSheep(){
    // One sheep every 10 game minutes; keep at least 25 tiles between living sheep.
    for(let tries=0;tries<500;tries++){
      const x=(3+Math.random()*(COLS-6))*TILE,y=(3+Math.random()*(ROWS-6))*TILE;
      if(waterAt(x/TILE,y/TILE)||(!inHouse&&blocked(x,y))||Math.hypot(x-player.x,y-player.y)<120)continue;
      if(sheep.some(a=>a.alive&&Math.hypot(a.x-x,a.y-y)<25*TILE))continue;
      sheep.push({x,y,hp:60,maxHp:60,phase:Math.random()*6.28,dir:Math.random()*6.28,wander:1+Math.random()*4,alive:true});
      sheepSpawned=true;saveGame();toast('В долине появилась овца.');return true;
    }
    return false;
  }
  function drawSheep(camX,camY,time){for(const a of sheep){if(!a.alive)continue;const x=a.x-camX,y=a.y-camY;if(x<-35||x>width+35||y<-35||y>height+35)continue;const bob=Math.sin(time/280+a.phase)*1.2;ctx.save();ctx.translate(x,y+bob);ctx.fillStyle='#101c1c66';ctx.beginPath();ctx.ellipse(0,8,15,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e9e8df';for(const [cx,cy,r] of [[-8,-2,7],[0,-5,8],[8,-2,7],[-2,2,8],[7,3,6]]){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#7b574b';ctx.fillRect(8,-7,8,11);ctx.fillStyle='#211d24';ctx.fillRect(13,-4,2,2);ctx.fillStyle='#5e4a40';const leg=Math.sin(time/90+a.phase)*2;ctx.fillRect(-7,5+leg,3,6);ctx.fillRect(5,5-leg,3,6);ctx.restore();}}
  function updateSheep(dt){if(inHouse)return;updateSheep._accumulator=(updateSheep._accumulator||0)+dt;if(updateSheep._accumulator<.2)return;dt=Math.min(.4,updateSheep._accumulator);updateSheep._accumulator=0;const activeRadius=Math.max(width,height)*1.35;for(const a of sheep){if(!a.alive||Math.hypot(a.x-player.x,a.y-player.y)>activeRadius)continue;a.wander-=dt;if(a.wander<=0){a.dir=Math.random()*Math.PI*2;a.wander=1+Math.random()*4;}const nx=a.x+Math.cos(a.dir)*13*dt,ny=a.y+Math.sin(a.dir)*13*dt;if(!blocked(nx,a.y))a.x=nx;if(!blocked(a.x,ny))a.y=ny;}}
  function drawVillageGuardian(m,x,y,time){
    const bob=Math.sin(time/190+(m.phase||0))*2.2,step=Math.sin(time/105+(m.phase||0))*3.5;
    const attacking=(m.villageGuardianAttackTimer||0)>.82,flash=m.flash>0;
    ctx.save();ctx.translate(x,y+bob);
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,17,31,10,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#343d4b';ctx.lineWidth=12;ctx.lineCap='round';ctx.beginPath();
    ctx.moveTo(-11,4);ctx.lineTo(-14+step,24);ctx.moveTo(11,4);ctx.lineTo(15-step,24);ctx.stroke();
    ctx.strokeStyle='#9b8055';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-19,23);ctx.lineTo(-8,23);ctx.moveTo(8,23);ctx.lineTo(20,23);ctx.stroke();
    ctx.fillStyle=flash?'#fff4cf':'#566477';ctx.beginPath();ctx.roundRect(-22,-31,44,39,9);ctx.fill();
    ctx.fillStyle='#283446';ctx.beginPath();ctx.roundRect(-18,-26,36,31,7);ctx.fill();
    ctx.fillStyle=flash?'#fff':'#c5a66b';ctx.beginPath();ctx.moveTo(-19,-28);ctx.lineTo(-15,-43);ctx.lineTo(-7,-49);ctx.lineTo(0,-44);ctx.lineTo(8,-49);ctx.lineTo(16,-42);ctx.lineTo(19,-28);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e9c66e';ctx.fillRect(-12,-37,7,4);ctx.fillRect(5,-37,7,4);
    ctx.shadowColor='#ffcb70';ctx.shadowBlur=gameSettings.graphicsQuality==='low'?0:10;ctx.fillStyle='#fff0a0';ctx.fillRect(-10,-37,4,2);ctx.fillRect(7,-37,4,2);ctx.shadowBlur=0;
    ctx.fillStyle='#9eabbc';ctx.beginPath();ctx.roundRect(-31,-23,12,28,5);ctx.fill();ctx.beginPath();ctx.roundRect(19,-22,12,27,5);ctx.fill();
    ctx.fillStyle='#c6d0dc';ctx.beginPath();ctx.roundRect(-35,-19,14,22,5);ctx.fill();
    ctx.fillStyle='#6c7b8d';ctx.beginPath();ctx.roundRect(23,-18,10,22,4);ctx.fill();
    ctx.strokeStyle='#b2bdca';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(26,-12);ctx.lineTo(37,13+ (attacking?-13:0));ctx.stroke();
    ctx.strokeStyle='#e0bd73';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(22,-15);ctx.lineTo(31,-15);ctx.stroke();
    ctx.fillStyle='#f0d18a';ctx.fillRect(-5,-5,10,5);

    // Ornate layered plates, rivets, engraved crest and shield emblem.
    ctx.fillStyle='#7f91a5';ctx.beginPath();ctx.moveTo(-19,-25);ctx.lineTo(-10,-31);ctx.lineTo(0,-27);ctx.lineTo(10,-31);ctx.lineTo(19,-25);ctx.lineTo(16,-8);ctx.lineTo(0,-2);ctx.lineTo(-16,-8);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d9c18b';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-16,-24);ctx.lineTo(-9,-28);ctx.lineTo(0,-24);ctx.lineTo(9,-28);ctx.lineTo(16,-24);ctx.stroke();
    ctx.fillStyle='#d7b86f';for(const [rx,ry] of [[-15,-20],[15,-20],[-13,-7],[13,-7]]){ctx.beginPath();ctx.arc(rx,ry,1.8,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#3a526b';ctx.beginPath();ctx.moveTo(-28,-17);ctx.lineTo(-37,-12);ctx.lineTo(-35,3);ctx.lineTo(-25,8);ctx.lineTo(-19,1);ctx.lineTo(-20,-13);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d7bd7a';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#f0d58d';ctx.beginPath();ctx.moveTo(-28,-12);ctx.lineTo(-24,-7);ctx.lineTo(-28,-2);ctx.lineTo(-32,-7);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d5e0e8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(30,-15);ctx.lineTo(39,9);ctx.stroke();ctx.fillStyle='#e5c77f';ctx.beginPath();ctx.arc(30,-15,3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#17212d';ctx.fillRect(-27,-60,54,6);ctx.fillStyle='#e6b75d';ctx.fillRect(-27,-60,54*Math.max(0,m.hp/250),6);
    ctx.textAlign='center';ctx.font='900 9px Segoe UI';ctx.fillStyle='#fff0c4';ctx.fillText('ВЕЛИКИЙ СТРАЖ',0,-67);
    ctx.restore();
  }
  function drawForestTreantMob(m,x,y,time){
    const bob=Math.sin(time/145+(m.phase||0))*2.4,walk=Math.sin(time/95+(m.phase||0))*3;
    ctx.save();ctx.translate(x,y+bob);
    ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(0,12,25,8,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#49301f';ctx.lineWidth=7;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-8,5);ctx.lineTo(-12+walk,22);ctx.moveTo(8,5);ctx.lineTo(13-walk,22);ctx.stroke();
    ctx.strokeStyle='#68452b';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(-25,-18+walk);ctx.moveTo(12,-5);ctx.lineTo(26,-18-walk);ctx.stroke();
    ctx.fillStyle=m.flash>0?'#fff':'#6c4b2d';ctx.beginPath();ctx.moveTo(-15,4);ctx.lineTo(-13,-21);ctx.lineTo(-7,-31);ctx.lineTo(0,-25);ctx.lineTo(8,-34);ctx.lineTo(15,-19);ctx.lineTo(14,7);ctx.closePath();ctx.fill();
    ctx.fillStyle='#3b5b32';ctx.beginPath();ctx.arc(-9,-24,11,0,Math.PI*2);ctx.arc(9,-26,12,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#8a653b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,-26);ctx.lineTo(-17,-43);ctx.lineTo(-22,-47);ctx.moveTo(8,-27);ctx.lineTo(17,-43);ctx.lineTo(23,-48);ctx.stroke();
    ctx.shadowColor='#ffdf75';ctx.shadowBlur=13;ctx.fillStyle='#ffe58a';ctx.fillRect(-8,-18,5,4);ctx.fillRect(4,-18,5,4);ctx.shadowBlur=0;
    ctx.strokeStyle='#3b2418';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-5,-8);ctx.lineTo(0,-5);ctx.lineTo(5,-8);ctx.stroke();

    // Deep bark grooves, knotted wood, moss patches and tiny leaves.
    ctx.strokeStyle='#3e291c';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-10,-27);ctx.lineTo(-7,-13);ctx.lineTo(-12,1);ctx.moveTo(5,-29);ctx.lineTo(2,-14);ctx.lineTo(8,2);ctx.moveTo(-2,-22);ctx.lineTo(1,-8);ctx.stroke();
    ctx.fillStyle='#8b6540';ctx.beginPath();ctx.ellipse(-5,-13,3,5,-.35,0,Math.PI*2);ctx.ellipse(8,-4,2,4,.3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#527a3c';ctx.beginPath();ctx.ellipse(-12,-23,7,3,-.4,0,Math.PI*2);ctx.ellipse(12,-29,7,3,.45,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#b0d86c';for(let i=0;i<5;i++){const lx=Math.sin(i*2.3+(m.phase||0))*19,ly=-34+Math.cos(i*1.7)*9;ctx.beginPath();ctx.ellipse(lx,ly,2.4,1.3,i*.7,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#9a7445';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-22,-18);ctx.lineTo(-31,-25);ctx.moveTo(22,-18);ctx.lineTo(31,-25);ctx.stroke();
    ctx.fillStyle='#19251b';ctx.fillRect(-27,-58,54,5);ctx.fillStyle='#9de071';ctx.fillRect(-27,-58,54*Math.max(0,m.hp/Math.max(1,m.maxHp)),5);
    ctx.fillStyle='#f6f0d7';ctx.font='900 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ДРЕВОДЕМОН',0,-64);
    ctx.restore();
  }
  function drawMonsters(camX,camY,time){
    for(const mob of monsters){
      const x=mob.x-camX,y=mob.y-camY;if(x<-45||x>width+45||y<-45||y>height+45)continue;
      if(mob.bossRealmCreature){drawBossRealmCreature(mob,x,y,time);continue;}
      if(mob.villageGuardian&&!mob.exploding){drawVillageGuardian(mob,x,y,time);continue;}
      if(mob.forestTreant&&!mob.exploding){drawForestTreantMob(mob,x,y,time);continue;}
      if(mob.exploding){const p=1-Math.max(0,mob.explosionTimer)/.42;ctx.save();ctx.globalAlpha=Math.max(.15,1-p*.7);ctx.fillStyle='#ff7a32';ctx.beginPath();ctx.arc(x,y,24+90*p,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffe7a0';ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,15+72*p,0,Math.PI*2);ctx.stroke();ctx.restore();continue;}
      const bob=Math.sin(time/210+mob.phase)*2,walk=Math.sin(time/95+mob.phase)*(Math.hypot(mob.vx||0,mob.vy||0)>1?3:1);ctx.save();ctx.translate(x,y+bob);if(mob.isRebornBoss){const scale=Math.min(2.1,1.35+(mob.rebirthMultiplier||1)*.08);ctx.scale(scale,scale);ctx.shadowColor='#ffbd65';ctx.shadowBlur=gameSettings.graphicsQuality==='low'?0:18;ctx.strokeStyle='#ffe5a6';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-13,22,Math.PI,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}ctx.fillStyle='#090f1e88';ctx.beginPath();ctx.ellipse(0,10,16,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#202536';ctx.fillRect(-8,8+walk,5,5);ctx.fillRect(4,8-walk,5,5);
      if(mob.type==='ice'){ctx.fillStyle=mob.flash>0?'#fff':'#6fd7ee';ctx.shadowColor='#6fe6ff';ctx.shadowBlur=gameSettings.graphicsQuality==='low'?0:12;ctx.beginPath();ctx.moveTo(0,-25);ctx.lineTo(16,-7);ctx.lineTo(12,10);ctx.lineTo(0,17);ctx.lineTo(-12,10);ctx.lineTo(-16,-7);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#e5fcff';ctx.fillRect(-7,-11,4,4);ctx.fillRect(4,-11,4,4);ctx.fillStyle='#25759b';ctx.fillRect(-7,1,14,5);}
      else if(mob.type==='scorpion'){ctx.fillStyle=mob.flash>0?'#fff':'#bd7b36';ctx.beginPath();ctx.ellipse(0,2,15,10,0,0,Math.PI*2);ctx.fill();ctx.fillRect(-13,-4,6,8);ctx.fillRect(9,-4,6,8);ctx.strokeStyle='#e1a14a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(7,-4);ctx.quadraticCurveTo(20,-12,14,-22);ctx.stroke();ctx.fillStyle='#e84a42';ctx.beginPath();ctx.moveTo(12,-22);ctx.lineTo(18,-26);ctx.lineTo(16,-18);ctx.closePath();ctx.fill();ctx.fillStyle='#261a16';ctx.fillRect(-6,-5,3,3);ctx.fillRect(4,-5,3,3);}
      else if(mob.type==='skeleton'){
        if(gameSettings.graphicsQuality==='high'){ctx.shadowColor='#e2e8f0';ctx.shadowBlur=9;}
        ctx.fillStyle=mob.flash>0?'#fff':'#d5d0bd';ctx.fillRect(-8,-22,16,15);ctx.fillStyle='#3b3030';ctx.fillRect(-5,-17,3,4);ctx.fillRect(3,-17,3,4);ctx.fillRect(-3,-10,6,2);ctx.shadowBlur=0;
        ctx.fillStyle='#e6dfcb';ctx.fillRect(-5,-6,10,14);ctx.fillRect(-14,-4,8,4);ctx.fillRect(6,-4,8,4);ctx.fillRect(-5,8,4,11);ctx.fillRect(2,8,4,11);ctx.fillStyle='#9fa6ae';ctx.fillRect(-3,-1,6,3);ctx.fillRect(-3,4,6,3);
        ctx.fillStyle='#7b8790';ctx.fillRect(9,-11,3,21);ctx.fillStyle='#cdd5dc';ctx.beginPath();ctx.moveTo(7,-13);ctx.lineTo(14,-24);ctx.lineTo(16,-12);ctx.closePath();ctx.fill();
      }else if(mob.type==='bomb'){
        const blink=mob.fuseStarted&&Math.floor(time/100)%2===0;ctx.fillStyle=mob.flash>0?'#fff':(blink?'#ff4f40':'#242631');ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4e5362';ctx.fillRect(-7,-8,5,4);ctx.fillRect(3,2,6,4);ctx.fillStyle='#ffbd53';ctx.beginPath();ctx.moveTo(-2,-13);ctx.lineTo(3,-19);ctx.lineTo(7,-17);ctx.lineTo(4,-11);ctx.closePath();ctx.fill();ctx.strokeStyle='#ead8a2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(3,-17);ctx.lineTo(9,-23);ctx.stroke();ctx.fillStyle=blink?'#ff352f':'#ffd75d';ctx.beginPath();ctx.arc(10,-24,3+(blink?2:0),0,Math.PI*2);ctx.fill();
        if(mob.fuseStarted){ctx.fillStyle='#fff1a7';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';ctx.fillText(Math.max(0,mob.fuseTime).toFixed(1),0,-29);ctx.textAlign='left';}
      }else{
        if(gameSettings.graphicsQuality==='high'){ctx.shadowColor='#ca3f77';ctx.shadowBlur=17;}
        ctx.fillStyle=mob.flash>0?'#f8c5d6':mob.type==='brute'?'#6b2938':mob.type==='wisp'?'#327b88':'#2b203f';ctx.beginPath();ctx.moveTo(-13,2);ctx.quadraticCurveTo(-19,-14,-7,-18);ctx.lineTo(-3,-24);ctx.lineTo(2,-18);ctx.quadraticCurveTo(18,-14,13,2);ctx.quadraticCurveTo(0,13,-13,2);ctx.fill();ctx.shadowBlur=0;
        ctx.fillStyle=mob.type==='wisp'?'#8ef5ff':mob.type==='brute'?'#ffc06a':'#ff6c8b';ctx.fillRect(-7,-10,4,3);ctx.fillRect(3,-10,4,3);ctx.fillStyle='#fff0ba';ctx.fillRect(-6,-10,2,2);ctx.fillRect(4,-10,2,2);
        if(mob.type==='brute'){ctx.fillStyle='#8a765e';ctx.fillRect(-15,-9,7,14);ctx.fillRect(8,-9,7,14);}ctx.fillStyle='#0b1121';ctx.fillRect(-10,-22,5,5);ctx.fillRect(5,-22,5,5);
      }
      ctx.restore();
      if(mob.hp<mob.maxHp){ctx.fillStyle='#231c2b';ctx.fillRect(x-15,y-36,30,4);ctx.fillStyle=mob.isRebornBoss?'#ffc66d':'#fb6289';ctx.fillRect(x-15,y-36,30*Math.max(0,mob.hp/mob.maxHp),4);}if(mob.isRebornBoss){ctx.save();ctx.textAlign='center';ctx.font='900 9px Segoe UI';ctx.fillStyle='#ffe6ad';ctx.shadowColor='#321b0b';ctx.shadowBlur=5;ctx.fillText((mob.bossTitle||'БОСС').toUpperCase()+' · ВОЗРОЖДЁН',x,y-43);ctx.restore();}
    }
  }
  function updateVitals(){const hp=document.querySelector('.hp i'),stamina=document.querySelector('.stamina i'),energy=document.querySelector('.combat-energy i'),energyText=document.querySelector('.combat-energy-value');if(hp)hp.style.width=Math.max(0,Math.min(100,player.hp))+'%';if(stamina)stamina.style.width=Math.max(0,Math.min(100,player.stamina))+'%';if(energy)energy.style.width=Math.max(0,Math.min(100,combatEnergy))+'%';if(energyText)energyText.textContent=Math.floor(combatEnergy)+'%';}
  function useCombatAbility(){
    if(combatAbilityCooldown>0){toast('Способность перезаряжается: '+Math.ceil(combatAbilityCooldown)+' сек.');return;}
    if(player.stamina<22){toast('Не хватает выносливости для особой атаки.');return;}
    player.stamina=Math.max(0,player.stamina-22);combatAbilityCooldown=12;updateVitals();
    const weapon=equipment.weapon||'Деревянный меч';
    const radius=weapon==='Ледяной посох'?190:weapon==='Молниеносное копьё'?170:145;
    const multiplier=weapon==='Ледяной посох'?1.65:weapon==='Молниеносное копьё'?1.45:1.35;
    const damage=Math.round(weaponDamage(weapon)*(1+skills.warrior*.1)*multiplier*bossRealmAbilityDamageMultiplier());
    const color=weapon==='Ледяной посох'?'#8deaff':weapon==='Молниеносное копьё'?'#ffe68a':'#c4d6ff';
    if(isCoopWorldActive()&&!window.SkyRealmCoopClient?.isRoomOwner){
      spawnVisualBurst(player.x,player.y,30,'spark',color);playSound('portal');
      let hits=0;
      if(dungeonMode){
        if(!dungeonRoomCleared()&&Math.hypot(player.x-dungeonEnemyX,player.y-dungeonEnemyY)<=radius+30){
          queueGuestEnemyHit('dungeon_boss','room-'+String(dungeonRoom),weapon,damage);hits++;
        }
      }else if(caveMode){
        if(!caveBossDefeated&&Math.hypot(player.x-caveBossX,player.y-caveBossY)<=radius+30){
          queueGuestEnemyHit('cave_boss','stone',weapon,damage);hits++;
        }
      }else if(!mineMode&&!inHouse&&!tradeWorldMode){
        for(const mob of monsters){
          if(mob.exploding||mob.hp<=0||Math.hypot(player.x-mob.x,player.y-mob.y)>radius)continue;
          queueGuestEnemyHit('monster',mob.id,weapon,damage);hits++;
        }
        for(const def of biomeBossDefs()){
          const boss=biomeBosses[def.id];
          if(!boss?.active||boss.defeated||Math.hypot(player.x-def.x,player.y-def.y)>radius+30)continue;
          queueGuestEnemyHit('biome_boss',def.id,weapon,damage);hits++;
        }
        if(wolfBossActive&&wolfBossHp>0&&Math.hypot(player.x-wolfBossX,player.y-wolfBossY)<=radius+30){
          queueGuestEnemyHit('wolf_boss','wolf',weapon,damage);hits++;
        }
      }
      saveGame();
      toast((weapon==='Ледяной посох'?'ЛЕДЯНОЙ ВЗРЫВ':weapon==='Молниеносное копьё'?'ЦЕПНАЯ МОЛНИЯ':'УДАР ВОЛНЫ')+
        ': запросов общего урона отправлено '+hits+' · перезарядка 12 сек.');
      return;
    }
    spawnVisualBurst(player.x,player.y,30,'spark',color);playSound('portal');
    let hits=0,kills=0;
    if(dungeonMode){
      if(!dungeonRoomCleared()&&Math.hypot(player.x-dungeonEnemyX,player.y-dungeonEnemyY)<=radius+30){
        const dealt=Math.min(dungeonEnemyHp,damage);dungeonEnemyHp=Math.max(0,dungeonEnemyHp-dealt);hits++;
        spawnVisualBurst(dungeonEnemyX,dungeonEnemyY,18,'spark',color);
        if(dungeonEnemyHp<=0){scheduleNemesis('boss','dungeon-'+dungeonRoom,dungeonRoom===5?'Архонт руин':'Страж руин '+dungeonRoom,'shadow',1.7);dungeonClearedRooms=Array.from(new Set(dungeonClearedRooms.concat([dungeonRoom])));if(dungeonRoom<5){changeItem('Эссенция глубин',1);if(Math.random()<.6)changeItem('Кристалл',1);}else{changeItem('Эссенция глубин',4);walletCents+=15000;}awardXP(dungeonRoom===5?300:70,'особая атака в руинах');renderInventory();}
      }
    }else{
      for(let i=monsters.length-1;i>=0;i--){
        const mob=monsters[i];if(mob.exploding||Math.hypot(player.x-mob.x,player.y-mob.y)>radius)continue;
        if(mob.bossRealmCreature&&mob.raidCrystalCount>0){mob.raidCrystalCount--;mob.flash=.18;hits++;spawnVisualBurst(mob.x,mob.y,18,'spark','#ffe49a');continue;}
        if(mob.bossRealmCreature&&mob.shield>0){mob.shield=Math.max(0,mob.shield-1);mob.flash=.12;hits++;spawnVisualBurst(mob.x,mob.y,14,'spark','#8deaff');continue;}
        mob.hp=Math.max(0,mob.hp-damage);hits++;spawnVisualBurst(mob.x,mob.y,8,'spark',color);
        if(mob.hp<=0){if(mob.bossRealmCreature)recordBossRealmDefeat(mob);else scheduleNemesis(mob.isRebornBoss?'boss':'monster',mob.id,mob.bossTitle||monsterLabel(mob.type),mob.type,Math.min(8.35,(mob.rebirthMultiplier||1)*1.7));monsters.splice(i,1);notifyExpansionEnemyDefeated(mob);dropMonsterLoot(mob);trackAdventureQuest('hunt',1,!!mob.villageRaid);awardXP(12,'особая атака');kills++;}
      }
      if(!caveMode&&!mineMode&&!inHouse){
        for(const def of biomeBossDefs()){
          const b=biomeBosses[def.id];if(!b||!b.active||b.defeated||Math.hypot(player.x-def.x,player.y-def.y)>radius+30)continue;
          b.hp=Math.max(0,b.hp-damage);b.flash=.2;hits++;spawnVisualBurst(def.x,def.y,14,'spark',def.color);
          if(b.hp<=0)defeatBiomeBoss(def,b);
        }
        if(wolfBossActive&&Math.hypot(player.x-wolfBossX,player.y-wolfBossY)<=radius+30){
          wolfBossHp=Math.max(0,wolfBossHp-damage);wolfBossFlash=.2;hits++;spawnVisualBurst(wolfBossX,wolfBossY,14,'spark',color);if(wolfBossHp<=0)defeatWolfBoss();
        }
      }
      if(caveMode&&!caveBossDefeated&&Math.hypot(player.x-caveBossX,player.y-caveBossY)<=radius+30){
        caveBossHp=Math.max(0,caveBossHp-damage);caveBossFlash=.2;hits++;spawnVisualBurst(caveBossX,caveBossY,14,'spark',color);
        if(caveBossHp<=0)defeatCaveBoss();
      }
    }
    saveGame();
    toast((weapon==='Ледяной посох'?'ЛЕДЯНОЙ ВЗРЫВ':weapon==='Молниеносное копьё'?'ЦЕПНАЯ МОЛНИЯ':'УДАР ВОЛНЫ')+': '+(hits?('целей поражено '+hits+(kills?' · побеждено '+kills:'')):'рядом нет врагов')+' · перезарядка 12 сек.');
  }
    function attackNearestMonster(){
    if(playerAttackCooldown>0)return;
    combatBeginStrike();
    if(dungeonMode&&isCoopWorldActive()&&!window.SkyRealmCoopClient?.isRoomOwner){
      playerAttackCooldown=.7;attackAnimTimer=.24;
      const weapon=equipment.weapon||'Деревянный меч',damage=Math.round(combatWeaponDamage(weapon)*(1+skills.warrior*.1));
      queueGuestEnemyHit('dungeon_boss','room-'+String(dungeonRoom),weapon,damage);return;
    }
    if(dungeonMode){attackDungeonEnemy();return;}playerAttackCooldown=.7;attackAnimTimer=.24;playSound('hit');spawnVisualBurst(player.x+(player.face==='left'?-20:player.face==='right'?20:0),player.y+(player.face==='up'?-22:player.face==='down'?12:0),5,'spark','#d8eeff');
    const coop=window.SkyRealmCoopClient,coopRoom=coop?.getRoomState?.();
    if(coopRoom?.status==='running'&&coopRoom.pvp_enabled&&!caveMode&&!mineMode&&!inHouse){
      const remote=(coop.getRemotePlayers?.()||[]).filter(other=>other.difficulty===currentDifficulty&&other.world_mode===coopLocalWorldMode());
      const target=remote.find(other=>Math.hypot(other.x-player.x,other.y-player.y)<=weaponRange());
      if(target){
        const weapon=equipment.weapon||'Деревянный меч';
        const base=combatWeaponDamage(weapon)*(1+skills.warrior*.1)*(weapon==='Ледяной посох'&&equipment.armor==='Мантия мага'?1.15:1);
        const damage=Math.round(base*(Math.random()<.14?2:1));
        coop.sendPvpHit?.(target.user_id,damage).then(sent=>{
          if(sent)toast('Ты атаковал игрока '+(target.name||'соперника')+' на '+damage+' урона.');
        });
        return;
      }
    }
    if(isCoopWorldActive()&&!coop?.isRoomOwner){
      const mode=coopLocalWorldMode(),weapon=equipment.weapon||'Деревянный меч';
      const base=combatWeaponDamage(weapon)*(1+skills.warrior*.1)*(weapon==='Ледяной посох'&&equipment.armor==='Мантия мага'?1.15:1);
      const damage=Math.round(base*(Math.random()<.14?2:1));
      const reach=weapon==='Ледяной посох'?250:weapon==='Молниеносное копьё'?150:110;
      let sharedTarget=null;
      if(mode==='surface'){
        for(const def of biomeBossDefs()){
          const b=biomeBosses[def.id];
          if(b?.active&&!b.defeated&&Math.hypot(player.x-def.x,player.y-def.y)<=reach){sharedTarget={kind:'biome_boss',id:def.id};break;}
        }
        if(!sharedTarget&&wolfBossActive&&Math.hypot(player.x-wolfBossX,player.y-wolfBossY)<=reach)sharedTarget={kind:'wolf_boss',id:'wolf'};
        if(!sharedTarget){
          let nearest=null,bestRange=reach;
          for(const mob of monsters){if(mob.exploding||mob.hp<=0)continue;const d=Math.hypot(mob.x-player.x,mob.y-player.y);if(d<=bestRange){nearest=mob;bestRange=d;}}
          if(nearest)sharedTarget={kind:'monster',id:nearest.id};
        }
      }else if(mode==='cave'&&!caveBossDefeated&&Math.hypot(player.x-caveBossX,player.y-caveBossY)<=reach)sharedTarget={kind:'cave_boss',id:'stone'};
      else if(mode==='dungeon'&&!dungeonRoomCleared()&&Math.hypot(player.x-dungeonEnemyX,player.y-dungeonEnemyY)<=reach)sharedTarget={kind:'dungeon_boss',id:'room-'+String(dungeonRoom)};
      if(sharedTarget)queueGuestEnemyHit(sharedTarget.kind,sharedTarget.id,weapon,damage);
      else toast('Рядом нет цели общего мира.');
      return;
    }
    if(!caveMode&&!dungeonMode&&!mineMode){for(const def of biomeBossDefs()){const b=biomeBosses[def.id];if(!b||!b.active||b.defeated)continue;const d=Math.hypot(player.x-def.x,player.y-def.y);if(d<Math.max(weaponRange()+35,130)){const damage=Math.round(combatWeaponDamage(equipment.weapon||'Деревянный меч')*(1+skills.warrior*.1)*(Math.random()<.14?2:1));b.hp=Math.max(0,b.hp-damage);awardCombatEnergyForHit(damage);spawnVisualBurst(def.x,def.y,9,'spark',def.color);toast(def.name+' получил '+damage+' урона · '+Math.ceil(b.hp)+' HP');if(b.hp<=0)defeatBiomeBoss(def,b);else saveGame();return;}}}
    if(!caveMode&&!dungeonMode&&wolfBossActive){const bossDistance=Math.hypot(player.x-wolfBossX,player.y-wolfBossY);if(bossDistance<Math.max(125,weaponRange()+30)){const weapon=equipment.weapon||'Деревянный меч',damage=Math.round(combatWeaponDamage(weapon)*(1+skills.warrior*.1)*(Math.random()<.14?2:1));wolfBossHp=Math.max(0,wolfBossHp-damage);awardCombatEnergyForHit(damage);wolfBossFlash=.18;spawnVisualBurst(wolfBossX,wolfBossY,10,'spark','#ff5267');toast('Оборотень получил '+damage+' урона · '+Math.ceil(wolfBossHp)+' HP');if(wolfBossHp<=0)defeatWolfBoss();else saveGame();return;}}
    if(caveMode&&!caveBossDefeated){const bossDistance=Math.hypot(player.x-caveBossX,player.y-caveBossY);if(bossDistance<Math.max(115,weaponRange()+30)){const weapon=equipment.weapon||'Деревянный меч';const base=combatWeaponDamage(weapon);const damage=Math.round(base*(1+skills.warrior*.1)*(weapon==='Ледяной посох'&&equipment.armor==='Мантия мага'?1.15:1)*(Math.random()<.14?2:1));caveBossHp=Math.max(0,caveBossHp-damage);awardCombatEnergyForHit(damage);caveBossFlash=.18;spawnVisualBurst(caveBossX,caveBossY,12,'spark',weapon==='Огненный меч'?'#ff9a42':'#b6e7ff');toast('Страж получил '+damage+' урона ('+Math.ceil(caveBossHp)+'/'+bossMaxHp()+').');if(caveBossHp<=0)defeatCaveBoss();else saveGame();return;}toast('Подойди к Каменному стражу ближе.');return;}
    if(caveMode){toast(caveBossDefeated?'Сокровищница уже доступна. Подойди к сундуку и нажми E.':'Подойди к Каменному стражу ближе.');return;}
    let target=null,best=weaponRange();for(const mob of monsters){if(!mob||mob.hp<=0||mob.exploding)continue;const d=Math.hypot(mob.x-player.x,mob.y-player.y);if(d<best){best=d;target=mob;}}
    if(!target&&!bossRealmMode&&!caveMode&&!dungeonMode&&!mineMode){
      if(tradeWorldMode){const offsets=[-500,-300,-100,100,300,500],rows=[-255,20,270],targets=[];for(const village of villageCenters){const lift=village.id==='forest'?12*TILE:0;for(let row=0;row<3;row++)for(let col=0;col<6;col++){const style=row*6+col,key=village.id+':'+style,hp=Number(villageHouseDamage[key]??160);if(hp<=0)continue;targets.push({key,x:village.x*TILE+16+offsets[col]+(row===1?28:row===2?-24:0),y:village.y*TILE+16+rows[row]-lift,hp});}}const house=targets.map(h=>({...h,distance:Math.hypot(player.x-h.x,player.y-h.y)})).filter(h=>h.distance<=weaponRange()).sort((a,b)=>a.distance-b.distance)[0];if(house){const weapon=equipment.weapon||'Деревянный меч',damage=Math.max(1,Math.round(combatWeaponDamage(weapon)*(1+skills.warrior*.1)*(Math.random()<.14?2:1)));house.hp=Math.max(0,house.hp-damage);villageHouseDamage[house.key]=house.hp;spawnVisualBurst(house.x,house.y,house.hp<=0?22:8,'dust','#c99562');playSound('wood');if(house.hp<=0){changeItem('Древесина',12+Math.floor(Math.random()*7));changeItem('Камень',4+Math.floor(Math.random()*4));window.SkyRealmJobs?.record?.('builder',1);toast('ДОМ РАЗРУШЕН · добыча: древесина и камень');}else toast('Дом повреждён · '+house.hp+'/160 HP');saveGame();return;}}
      const structure=placedStructures.filter(v=>['house','storage','village-watchtower'].includes(v.type)).map(v=>({...v,distance:Math.hypot(player.x-v.x,player.y-v.y)})).filter(v=>v.distance<=weaponRange()).sort((a,b)=>a.distance-b.distance)[0];
      if(structure){const live=placedStructures.find(v=>v.x===structure.x&&v.y===structure.y&&v.type===structure.type);if(live){const maxHp=Math.max(1,Number(live.maxHp)||(live.type==='house'?180:live.type==='storage'?110:220));live.maxHp=maxHp;live.hp=Math.max(0,Number.isFinite(live.hp)?live.hp:maxHp);const damage=Math.max(1,Math.round(combatWeaponDamage(equipment.weapon||'Деревянный меч')*(1+skills.warrior*.1)));live.hp=Math.max(0,live.hp-damage);spawnVisualBurst(live.x,live.y,live.hp<=0?20:7,'dust','#c99562');playSound('wood');if(live.hp<=0){const idx=placedStructures.indexOf(live);if(idx>=0)placedStructures.splice(idx,1);changeItem('Древесина',live.type==='house'?12:live.type==='storage'?7:14);changeItem('Камень',live.type==='house'?6:live.type==='storage'?4:9);if(live.type==='storage'&&live.contents)for(const [name,count] of Object.entries(live.contents))if(Number.isFinite(count)&&count>0)changeItem(name,Math.min(99,Math.floor(count)));if(live.type==='village-watchtower')changeItem('Железо',2);toast('ПОСТРОЙКА РАЗРУШЕНА · материалы возвращены.');}else toast('Постройка повреждена · '+live.hp+'/'+live.maxHp+' HP');saveGame();renderInventory();return;}}
    }
    if(target){if(target.bossRealmCreature&&target.raidCrystalCount>0){target.raidCrystalCount--;target.flash=.18;spawnVisualBurst(target.x,target.y,24,'spark','#ffe49a');toast('КРИСТАЛЛ ЗАЩИТЫ РАЗБИТ · осталось '+target.raidCrystalCount);saveGame();return;}if(target.bossRealmCreature&&target.shield>0){target.shield=Math.max(0,target.shield-1);target.flash=.12;spawnVisualBurst(target.x,target.y,14,'spark','#8deaff');toast((BOSS_REALM_CREATURES[target.realmType]?.name||'Враг')+' блокирует удар щитом!');return;}const weapon=equipment.weapon||'Деревянный меч',baseDamage=combatWeaponDamage(weapon)*(1+skills.warrior*.1)*(weapon==='Ледяной посох'&&equipment.armor==='Мантия мага'?1.15:1)*bossRealmAbilityDamageMultiplier(),critical=Math.random()<Math.min(.35,.14+bossRealmRelicTotals().crit),counterWindow=!!(target.bossRealmCreature&&target.staggerTimer>0),swordDamage=Math.round((critical?baseDamage*2:baseDamage)*(counterWindow?1.5:1));target.hp-=swordDamage;awardCombatEnergyForHit(swordDamage);target.flash=.2;spawnVisualBurst(target.x,target.y,critical?16:8,'spark',weapon==='Огненный меч'?'#ff8738':weapon==='Ледяной посох'?'#8be9ff':weapon==='Молниеносное копьё'?'#d8a4ff':critical?'#ffe16b':'#ff9aa9');if(critical)toast('КРИТИЧЕСКИЙ УДАР! ×2 урона!');if(counterWindow)toast('КОНТРАТАКА ПО ОТКРЫТОМУ БОССУ! +50% урона');if(target.hp<=0){applyArtifactKillEffects();if(target.bossRealmCreature)recordBossRealmDefeat(target);else scheduleNemesis(target.isRebornBoss?'boss':'monster',target.id,target.bossTitle||monsterLabel(target.type),target.type,Math.min(8.35,(target.rebirthMultiplier||1)*1.7));if(target.isRebornBoss)triggerBossVictory(target.bossTitle||monsterLabel(target.type),target.x,target.y,'#ffc66d');const i=monsters.indexOf(target);if(i>=0)monsters.splice(i,1);notifyExpansionEnemyDefeated(target);spawnVisualBurst(target.x,target.y,20,'spark',target.type==='skeleton'?'#e5e1d0':'#ff7b9b');dropMonsterLoot(target);trackAdventureQuest('hunt',1,!!target.villageRaid);if(isModInstalled('bounty_hunter')){walletCents+=100+Math.floor(Math.random()*301);updateWalletHud();}awardXP(Math.round((target.bossRealmCreature?(BOSS_REALM_CREATURES[target.realmType]?.tier==='god'?1200:BOSS_REALM_CREATURES[target.realmType]?.tier==='boss'?450:BOSS_REALM_CREATURES[target.realmType]?.tier==='elite'?110:35):(target.type==='brute'?35:target.type==='skeleton'?28:target.type==='wisp'?24:target.type==='bomb'?20:target.type==='ice'?38:target.type==='scorpion'?32:18))*(isModInstalled('bounty_hunter')?1.2:1)),'победа над '+(target.bossRealmCreature?BOSS_REALM_CREATURES[target.realmType].name:'монстром'));questStage=Math.max(questStage,4);toast((target.bossRealmCreature?BOSS_REALM_CREATURES[target.realmType].name:monsterLabel(target.type))+' побеждён! На земле осталась добыча.');}else toast('Удар на '+swordDamage+' урона! У монстра осталось '+target.hp+' здоровья.');drawMinimap();return;}
    const selectedItem=inventoryItems.filter(entry=>entry.count>0)[selectedSlot-1];
    if(selectedItem&&selectedItem.name==='Топор'){
      let treeTarget=null;best=86;for(const tree of world.trees){const d=Math.hypot(tree.x-player.x,tree.y-player.y);if(d<best){best=d;treeTarget=tree;}}
      if(treeTarget){
        if(queueGuestTreeChop(treeTarget.x,treeTarget.y))return;
        treeTarget.chops=(treeTarget.chops||0)+1;treeTarget.flash=.18;updateTreeChopRecord(treeTarget);
        spawnVisualBurst(treeTarget.x,treeTarget.y-15,7,'leaf','#78c96d');playSound('wood');
        if(treeTarget.chops>=5){
          markTreeFelled(treeTarget);world.trees.splice(world.trees.indexOf(treeTarget),1);
          const jobWoodBonus=(window.SkyRealmJobs?.rollBonus?.('lumberjack')?1+Math.floor((window.SkyRealmJobs?.getLevel?.('lumberjack')||1)/4):0)+(isModInstalled('forest_guild')?2:0);
          if(bossRealmMode)awakenBossTree(treeTarget);
          else {window.SkyRealmWorldEvents?.onTreeChopped?.(treeTarget);if(treeTarget.fruitful){const berries=3+Math.floor(Math.random()*3);changeItem('Лесные ягоды',berries);toast('ПЛОДОВОЕ ДЕРЕВО · собрано лесных ягод: '+berries+'.');}}
          changeItem('Древесина',7+jobWoodBonus);changeItem('Листья',3);changeItem('Палка',1);
          window.SkyRealmJobs?.record?.('lumberjack',1);
          questStage=Math.max(questStage,2);
          renderInventory();awardXP(12,'дерево срублено');saveGame();toast('Дерево срублено: +'+(7+jobWoodBonus)+' древесины, +3 листка, +1 палка'+(jobWoodBonus?' · бонус лесоруба':'')+'.');
        }else{saveGame();toast('Удар топором '+treeTarget.chops+'/5');}
        renderInventory();return;
      }
    }
    let targetSheep=null;best=82;for(const a of sheep){if(!a.alive)continue;const d=Math.hypot(a.x-player.x,a.y-player.y);if(d<best){best=d;targetSheep=a;}}
    if(targetSheep){playSound('sheep');spawnVisualBurst(targetSheep.x,targetSheep.y,5,'dust','#e8e4d7');targetSheep.hp-=20;if(targetSheep.hp<=0){targetSheep.alive=false;const meat=inventoryItems.find(i=>i.name==='Мясо');const raw=inventoryItems.find(i=>i.name==='Сырое мясо');if(raw)raw.count+=2;questStage=Math.max(questStage,5);renderInventory();saveGame();toast('Овца погибла. Получено 2 сырого мяса.');}else toast('Ты ударил овцу.');return;}
    toast('Подойди ближе к монстру или овце.');
  }
  function renderWorkbenchStatus(message=''){
    const status=document.getElementById('workbench-status');if(!status)return;
    const stone=inventoryItems.find(i=>i.name==='Камень')?.count||0,wood=inventoryItems.find(i=>i.name==='Древесина')?.count||0;
    status.textContent=message||('Материалы: камень '+stone+'/8 · древесина '+wood+'/6 · дом ур. '+houseLevel+'/3 · шахта ур. '+mineLevel+'/8');
    updateUpgradeCards();
  }
  function updateFarmPlots(dt){let changed=false;for(const plot of placedStructures){if(plot.type!=='farmplot'||!plot.crop||plot.stage>=3)continue;plot.moisture=Math.max(0,(Number(plot.moisture)||0)-dt*.55);if(plot.moisture>0)plot.growSeconds=(plot.growSeconds||0)+dt*(plot.fertilized?1.25:1)*(isModInstalled('green_thumb')?1.35:1)*(1+communityModBonus('farming')*.025)*seasonInfo().growth*(weatherMode==='rain'?1.15:1);const crop=farmCropById(plot.crop),growth=crop?crop.growth:70,old=plot.stage||0;plot.stage=Math.min(3,Math.floor((plot.growSeconds||0)/(growth/3)));if(plot.stage!==old){changed=true;spawnVisualBurst(plot.x,plot.y,5,'leaf','#85d45e');if(plot.stage===3)toast((crop?crop.product:'Урожай')+' созрел! Подойди и нажми E.');}}if(changed)saveGame();}
  function queueGuestFarmAction(plot,actionType,extra={},reservedItem=null){
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(!room||room.status!=='running'){toast('Сначала дождись запуска комнаты.');return true;}
    if(typeof network.enqueueWorldAction!=='function'){toast('Фермерские действия пока недоступны.');return true;}
    const actionId=window.crypto?.randomUUID?.();
    if(!actionId){toast('Не удалось безопасно подготовить запрос.');return true;}
    const key=saveKey+'_coop_pending_world_actions';let pending=[];
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))pending=value;}catch(_){}
    if(pending.length>=20){toast('Сначала дождись обработки предыдущих действий.');return true;}
    if(reservedItem&&!changeItem(reservedItem,-1)){toast('Не хватает предметов для действия.');return true;}
    pending.push({action_id:actionId,action_type:actionType,reserved_item:reservedItem||null});
    try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){
      if(reservedItem)changeItem(reservedItem,1);renderInventory();
      toast('Не удалось сохранить очередь действий.');return true;
    }
    renderInventory();
    if(!saveGame()){
      if(reservedItem)changeItem(reservedItem,1);
      pending=pending.filter(entry=>entry.action_id!==actionId);
      try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){}
      renderInventory();return true;
    }
    network.enqueueWorldAction(actionType,{x:plot.x,y:plot.y,...extra},actionId).then(action=>{
      if(!action?.action_id)throw new Error('Сервер не вернул ID запроса.');
      const names={farm_plant:'Посадка',farm_water:'Полив',farm_compost:'Компост',farm_fertilize:'Удобрение',farm_harvest:'Сбор урожая'};
      toast((names[actionType]||'Действие')+' отправлено владельцу мира.');
    }).catch(error=>{
      if(error?.code&&!['INTERNAL_ERROR','COOP_BACKEND_ERROR'].includes(error.code)){
        if(reservedItem)changeItem(reservedItem,1);
        const left=pending.filter(entry=>entry.action_id!==actionId);
        try{localStorage.setItem(key,JSON.stringify(left));}catch(_){}
        renderInventory();saveGame();
      }
      toast(error?.message||'Не удалось отправить действие. Проверяю его статус перед возвратом предмета.');
    });
    return true;
  }
  function queueGuestTreeChop(x,y){
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(!saveKey.startsWith('skyrealm_coop_save_v1_')&&!room)return false;
    if(!room){toast('Нет соединения с комнатой. Рубка временно недоступна.');return true;}
    if(network.isRoomOwner){autoResumeCoopRoomOnInput();return false;}
    if(room.status!=='running'){toast('Общий мир сейчас приостановлен владельцем. Ожидаем его автоматического возобновления.');return true;}
    const actionId=window.crypto?.randomUUID?.();
    if(!actionId){toast('Не удалось безопасно подготовить запрос.');return true;}
    const key=saveKey+'_coop_pending_world_actions';let pending=[];
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))pending=value;}catch(_){}
    if(pending.length>=20){toast('Сначала дождись обработки предыдущих действий.');return true;}
    pending.push({action_id:actionId,action_type:'chop_tree',reserved_item:null});
    try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){toast('Не удалось сохранить очередь рубки.');return true;}
    network.enqueueWorldAction('chop_tree',{x,y,tool:'Топор'},actionId).then(action=>{
      if(!action?.action_id)throw new Error('Сервер не вернул ID запроса.');
      toast('Удар топором отправлен владельцу мира.');
    }).catch(error=>{
      if(error?.code&&!['INTERNAL_ERROR','COOP_BACKEND_ERROR'].includes(error.code)){
        const left=pending.filter(entry=>entry.action_id!==actionId);
        try{localStorage.setItem(key,JSON.stringify(left));}catch(_){}
      }
      toast(error?.message||'Не удалось отправить рубку. Проверяю её статус.');
    });
    return true;
  }
  function queueGuestMineAction(rockIndex,tool){
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(!saveKey.startsWith('skyrealm_coop_save_v1_')&&!room)return false;
    if(!room){toast('Нет соединения с комнатой. Добыча временно недоступна.');return true;}
    if(network.isRoomOwner){autoResumeCoopRoomOnInput();return false;}
    if(room.status!=='running'){toast('Общий мир сейчас приостановлен владельцем. Ожидаем его автоматического возобновления.');return true;}
    if(!Number.isSafeInteger(rockIndex)||!['Кирка','Улучшенная кирка','Кирка мастера'].includes(tool)){
      toast('Не удалось подготовить добычу.');return true;
    }
    const actionId=window.crypto?.randomUUID?.();
    if(!actionId){toast('Не удалось безопасно подготовить запрос.');return true;}
    const key=saveKey+'_coop_pending_world_actions';let pending=[];
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))pending=value;}catch(_){}
    if(pending.length>=20){toast('Сначала дождись обработки предыдущих действий.');return true;}
    pending.push({action_id:actionId,action_type:'mine_rock',reserved_item:null});
    try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){toast('Не удалось сохранить очередь добычи.');return true;}
    network.enqueueWorldAction('mine_rock',{rock_index:rockIndex,tool,player_class:playerClass,miner_skill_level:skills.miner},actionId).then(action=>{
      if(!action?.action_id)throw new Error('Сервер не вернул ID запроса.');
      toast('Удар киркой отправлен владельцу мира.');
    }).catch(error=>{
      if(error?.code&&!['INTERNAL_ERROR','COOP_BACKEND_ERROR'].includes(error.code)){
        const left=pending.filter(entry=>entry.action_id!==actionId);
        try{localStorage.setItem(key,JSON.stringify(left));}catch(_){}
      }
      toast(error?.message||'Не удалось отправить добычу. Проверяю её статус.');
    });
    return true;
  }
  function interactFarmPlot(plot){const selected=selectedInventoryItem();
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    if(room&&!network.isRoomOwner){
      if(plot.stage>=3){queueGuestFarmAction(plot,'farm_harvest',{player_class:playerClass,farmer_skill_level:skills.farmer,has_sickle:selected?.name==='Серп'});return;}
      if(!plot.crop){
        const crop=FARM_CROPS.find(c=>c.seed===selected?.name);
        if(!crop){toast('Выбери семена и нажми E у пустой грядки.');return;}
        queueGuestFarmAction(plot,'farm_plant',{crop_id:crop.id},crop.seed);return;
      }
      if(selected?.name==='Лейка'){queueGuestFarmAction(plot,'farm_water');return;}
      if(selected?.name==='Компост'){queueGuestFarmAction(plot,'farm_compost',{},'Компост');return;}
      if(selected?.name==='Удобрение'){queueGuestFarmAction(plot,'farm_fertilize',{},'Удобрение');return;}
      toast('Выбери лейку, компост или удобрение для этой грядки.');return;
    }if(plot.stage>=3){const crop=farmCropById(plot.crop),product=crop?crop.product:'Урожай',amount=Math.max(1,Math.round(((crop?crop.yield:3)+(plot.fertilized?2:0)+(selected?.name==='Серп'?1:0)+(Math.random()<.25?1:0))*(1+skills.farmer*.06+(classHas('farmer')?0.2:0)+communityModBonus('farming')*.025+(isModInstalled('crop_rotation')?.15:0))*seasonInfo().harvest));changeItem(product,amount);window.SkyRealmJobs?.record?.('farmer',1);plot.stage=0;plot.growSeconds=0;plot.crop=null;plot.moisture=0;plot.fertilized=false;trackAdventureQuest('harvest',1);spawnVisualBurst(plot.x,plot.y,12,'leaf','#e5c85c');renderInventory();saveGame();playSound('coin');toast('Собрано: '+product+' ×'+amount+'. Грядка свободна.');return;}
    if(!plot.crop){const crop=FARM_CROPS.find(c=>c.seed===selected?.name);if(!crop){toast('Выбери семена и нажми E у пустой грядки.');return;}changeItem(crop.seed,-1);plot.crop=crop.id;plot.stage=0;plot.growSeconds=0;plot.moisture=0;plot.fertilized=false;renderInventory();saveGame();playSound('craft');toast('Посажено: '+crop.product+'. Полей грядку лейкой.');return;}
    if(selected?.name==='Лейка'){plot.moisture=Math.min(100,(Number(plot.moisture)||0)+65);saveGame();playSound('water');toast('Грядка полита: '+Math.round(plot.moisture)+'% влаги.');return;}
    if(selected?.name==='Компост'){if(!changeItem('Компост',-1))return;plot.growSeconds=(plot.growSeconds||0)+(farmCropById(plot.crop)?.growth||70)*.25;plot.moisture=Math.max(plot.moisture||0,25);renderInventory();saveGame();toast('Компост ускорил рост на 25%.');return;}
    if(selected?.name==='Удобрение'){if(!changeItem('Удобрение',-1))return;plot.fertilized=true;renderInventory();saveGame();toast('Удобрение внесено: урожай увеличится.');return;}
    toast('Выбери лейку, чтобы полить грядку.');}
  function trackAdventureQuest(kind,amount=1,raidKill=false){if(!(kind in adventureQuestProgress))return;const limits={hunt:5,mining:10,harvest:5};adventureQuestProgress[kind]=Math.min(limits[kind],(adventureQuestProgress[kind]||0)+amount);if(kind==='hunt'&&raidKill&&villageRaidActive){villageRaidKills=Math.max(0,villageRaidKills-1);if(villageRaidKills<=0){villageRaidActive=false;walletCents+=3500;villageReputation=Math.min(100,villageReputation+2);toast('Деревня спасена! Награда: 35 золота и +2 репутации.');}}renderInventoryTab();saveGame();}
  const adventureQuestDefs=[{id:'hunt',title:'Охотник на чудовищ',desc:'Победи 5 монстров',target:5,rewardGold:35,rewardXP:90},{id:'mining',title:'Шахтёр',desc:'Добудь 10 залежей руды',target:10,rewardGold:25,rewardXP:70},{id:'harvest',title:'Первая ферма',desc:'Собери урожай с 5 грядок',target:5,rewardGold:45,rewardXP:100}];
  function claimAdventureQuest(id){const q=adventureQuestDefs.find(v=>v.id===id);if(!q)return;const progress=adventureQuestProgress[id]||0;if(progress<q.target){toast('Задание ещё не выполнено.');return;}adventureQuestProgress[id]=0;walletCents+=q.rewardGold*100;awardXP(q.rewardXP,'задание '+q.title);if(id==='hunt')changeItem('Кристалл',1);if(id==='mining')changeItem('Железо',3);if(id==='harvest')changeItem('Малое зелье',2);renderInventory();renderInventoryTab();saveGame();toast('Задание выполнено: '+q.title+'! Награда получена.');}
  let skillTreeReturnToPause=false;
  function openSkillTree(){skillTreeReturnToPause=paused&&document.getElementById('pause-shade')&&!document.getElementById('pause-shade').hidden;paused=true;keys.clear();pressedMovementCodes.clear();if(inventoryDialogOpen){inventoryDialogOpen=false;setPanelOpen('inventory-shade',false);}renderSkillTree();setPanelOpen('skill-tree-shade',true);}
  function renderSkillTree(){const list=document.getElementById('skill-tree-list');if(!list)return;const defs=[{id:'warrior',title:'Воин',icon:'⚔️',desc:'Урон оружия +8% за уровень'},{id:'miner',title:'Шахтёр',icon:'⛏️',desc:'Шанс дополнительной руды +6% за уровень'},{id:'scout',title:'Следопыт',icon:'🧭',desc:'Скорость +2% и редкая добыча +4% за уровень'},{id:'farmer',title:'Фермер',icon:'🌱',desc:'Урожай +6% за уровень'},{id:'survivor',title:'Выживальщик',icon:'❤️',desc:'Голод тратится медленнее, урон от голода ниже'},{id:'crafter',title:'Ремесленник',icon:'🔨',desc:'Получаемый опыт +4% за уровень'},{id:'guardian',title:'Страж',icon:'🛡️',desc:'Снижает входящий урон на 2,5% за уровень'},{id:'ranger',title:'Меткий стрелок',icon:'🏹',desc:'Урон копий и дальних атак +6% за уровень'},{id:'alchemist',title:'Алхимик',icon:'⚗️',desc:'Зелья действуют дольше и дают больше пользы'},{id:'fisherman',title:'Рыбак',icon:'🎣',desc:'Шанс редкого улова +3% за уровень'},{id:'builder',title:'Строитель',icon:'🏠',desc:'Восстановление здоровья дома +0,4 HP/сек за уровень'},{id:'beastmaster',title:'Повелитель зверей',icon:'🐺',desc:'Урон спутника +4 за уровень'},{id:'fortune',title:'Счастливчик',icon:'🍀',desc:'Шанс дополнительной добычи +2% за уровень'}];list.innerHTML='<div class="skill-tree-overview">13 специализаций · 10 уровней в каждой · до 130 улучшений. Очки навыков выдаются за каждый новый уровень персонажа.</div>'+(isModInstalled('skill_expansion')?defs:defs.slice(0,6)).map(q=>'<div class="workbench-recipe skill-branch-card"><div class="workbench-recipe-icon">'+q.icon+'</div><div class="workbench-recipe-main"><b>'+q.title+' · '+skills[q.id]+'/10</b><small>'+q.desc+'</small><span>Прогресс: '+skills[q.id]*10+'% · Очков: '+skillPoints+'</span><div class="skill-progress"><i style="width:'+skills[q.id]*10+'%"></i></div></div><button class="action" data-skill-up="'+q.id+'" '+(skillPoints<=0||skills[q.id]>=10?'disabled':'')+'>Улучшить</button></div>').join('');list.querySelectorAll('[data-skill-up]').forEach(b=>b.addEventListener('click',()=>upgradeSkill(b.dataset.skillUp)));const points=document.getElementById('skill-points');if(points)points.textContent='Свободные очки: '+skillPoints;}
  function upgradeSkill(id){if(!Object.prototype.hasOwnProperty.call(skills,id)||skillPoints<=0||skills[id]>=10){toast('Нет свободных очков навыков или ветка уже максимальна.');return;}skills[id]++;skillPoints--;renderSkillTree();updateProgressHud();saveGame();playSound('craft');toast('Навык улучшен: '+id+' · '+skills[id]+'/10.');}
  function openStorage(structure){activeStorageStructure=structure;storageDialogOpen=true;paused=true;keys.clear();pressedMovementCodes.clear();renderStorage();setPanelOpen('storage-shade',true);}
  function renderStorage(){const list=document.getElementById('storage-items');if(!list||!activeStorageStructure)return;const contents=activeStorageStructure.contents||(activeStorageStructure.contents={});const candidates=inventoryItems.filter(i=>i.count>0&&i.name!=='Сундук-хранилище'&&i.name!=='Грядка с семенами');list.innerHTML='<div class="storage-summary">Слоты: '+Object.keys(contents).filter(k=>(Number(contents[k])||0)>0).length+'/15 · Предметов: '+Object.values(contents).reduce((a,b)=>a+(Number(b)||0),0)+'</div>'+inventoryItems.filter(i=>i.name!=='Сундук-хранилище'&&i.name!=='Грядка с семенами'&&((contents[i.name]||0)>0||i.count>0)).map(i=>{const equipped=Object.values(equipment).includes(i.name);return '<div class="storage-row"><span class="storage-icon">'+i.icon+'</span><span class="storage-name">'+i.name+'<small>Инвентарь: '+i.count+' · Сундук: '+(contents[i.name]||0)+(equipped?' · Надето':'')+'</small></span><button class="action" data-storage="put" data-item="'+escapeHtml(i.name)+'" '+(i.count<1||equipped?'disabled':'')+'>Положить 1</button><button class="action secondary" data-storage="take" data-item="'+escapeHtml(i.name)+'" '+(!(contents[i.name]>0)?'disabled':'')+'>Забрать 1</button></div>';}).join('');list.querySelectorAll('[data-storage]').forEach(b=>b.addEventListener('click',()=>transferStorage(b.dataset.item,b.dataset.storage)));}
  function transferStorage(name,mode){if(!activeStorageStructure)return;const c=activeStorageStructure.contents||(activeStorageStructure.contents={});if(mode==='put'){if(Object.values(equipment).includes(name)){toast('Сначала сними предмет в инвентаре экипировки.');return;}if(itemCount(name)<1)return;if(!(Number(c[name])>0)&&Object.keys(c).filter(k=>(Number(c[k])||0)>0).length>=15){toast('Сундук заполнен: доступно ровно 15 слотов.');return;}changeItem(name,-1);c[name]=(c[name]||0)+1;}else{if((c[name]||0)<1)return;c[name]--;changeItem(name,1);if(c[name]<=0)delete c[name];}renderStorage();renderInventory();saveGame();}
  function closeStorage(){storageDialogOpen=false;setPanelOpen('storage-shade',false);activeStorageStructure=null;paused=false;saveGame();canvas.focus();}
  function openWorkbench(){
    workbenchDialogOpen=true;keys.clear();pressedMovementCodes.clear();renderWorkbenchStatus();
    const shade=document.getElementById('workbench-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');
  }
  function closeWorkbench(){
    workbenchDialogOpen=false;const shade=document.getElementById('workbench-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');keys.clear();pressedMovementCodes.clear();canvas.focus();
  }
  function craftFurnace(){
    const stone=inventoryItems.find(i=>i.name==='Камень'),wood=inventoryItems.find(i=>i.name==='Древесина'),furnace=inventoryItems.find(i=>i.name==='Печь');
    if(!stone||!wood||!furnace){toast('Рецепт печи недоступен: предметы не найдены.');return;}
    const stoneCost=isModInstalled('engineer_world')?6:8,woodCost=isModInstalled('engineer_world')?4:6;if(stone.count<stoneCost||wood.count<woodCost){const msg='Не хватает ресурсов. Нужно '+stoneCost+' камня и '+woodCost+' древесины.';renderWorkbenchStatus(msg);toast(msg);return;}
    stone.count-=stoneCost;wood.count-=woodCost;furnace.count+=1;furnaceCrafted=true;window.SkyRealmJobs?.record?.('crafter',1);playSound('craft');workbenchUsed=true;questStage=Math.max(questStage,4);renderInventory();renderWorkbenchStatus('Печь создана! Она добавлена в инвентарь.');saveGame();toast('Крафт готов: печь ×1.');
  }
  function craftEquipment(kind){
    const recipes={sword:{name:'Железный меч',cost:{'Железо':3,'Древесина':2},house:1},armor:{name:'Кожаная броня',cost:{'Мясо':4,'Древесина':5},house:1},house:{name:'Комплект дома',cost:{'Древесина':24,'Камень':12,'Палка':6},house:1},torch:{name:'Факел',cost:{'Древесина':1,'Уголь':1},house:1},bandage:{name:'Бинт',cost:{'Листья':3,'Мясо':1},house:1},pickaxe:{name:'Улучшенная кирка',cost:{'Железо':4,'Древесина':3},house:1},flameSword:{name:'Огненный меч',cost:{'Железо':6,'Кристалл':3,'Уголь':5,'Медь':3},house:2},speedPotion:{name:'Зелье скорости',cost:{'Листья':5,'Лечебная трава':2,'Кристалл':1},house:1},strengthPotion:{name:'Настой силы',cost:{'Мясо':2,'Метеоритный осколок':1,'Кристалл':1},house:2},wardPotion:{name:'Зелье защиты',cost:{'Лечебная трава':3,'Обсидиан':1,'Кристалл':1},house:2},steelSword:{name:'Стальной меч',cost:{'Железо':8,'Уголь':5,'Древесина':3,'Олово':4},house:2},titanSword:{name:'Меч титана',cost:{'Мифрил':8,'Алмаз':3,'Уран':2,'Рубин':2},house:3},dragonSword:{name:'Меч дракона',cost:{'Мифрил':12,'Алмаз':5,'Рубин':4,'Метеоритный осколок':5},house:3},voidSword:{name:'Меч пустоты',cost:{'Мифрил':18,'Алмаз':8,'Обсидиан':6,'Реликвия руин':1},house:3},iceStaff:{name:'Ледяной посох',cost:{'Кристалл':4,'Древесина':5,'Уголь':3,'Сапфир':2},house:3},lightningSpear:{name:'Молниеносное копьё',cost:{'Железо':6,'Кристалл':3,'Палка':4,'Серебро':3},house:2},tideTrident:{name:'Трезубец прилива',cost:{'Сапфир':8,'Жемчуг':5,'Мифрил':8,'Сердце прилива':1},house:3},stormHarpoon:{name:'Гарпун бури',cost:{'Серебро':10,'Сапфир':8,'Мифрил':12,'Перо штормового ската':1},house:3},abyssBlade:{name:'Клинок бездны',cost:{'Око бездны':1,'Мифрил':18,'Алмаз':10,'Обсидиан':8},house:3},guardianArmor:{name:'Броня стража',cost:{'Железо':10,'Кость':6,'Кристалл':2,'Обсидиан':3},house:3},mageRobe:{name:'Мантия мага',cost:{'Кристалл':3,'Листья':8,'Теневая эссенция':2,'Рубин':2},house:3},guardianHelmet:{name:'Шлем стража',cost:{'Железо':8,'Кость':8,'Кристалл':3,'Обсидиан':2},house:3},guardianBoots:{name:'Сапоги стража',cost:{'Железо':8,'Мифрил':3,'Кость':4},house:3},mageCrown:{name:'Корона мага',cost:{'Кристалл':8,'Рубин':3,'Сапфир':3,'Теневая эссенция':3},house:3},mageBoots:{name:'Сапоги мага',cost:{'Кристалл':5,'Теневая эссенция':4,'Серебро':5},house:3},mageAmulet:{name:'Амулет мага',cost:{'Кристалл':6,'Рубин':2,'Сапфир':2,'Алмаз':1},house:3},anvil:{name:'Наковальня',cost:{'Железо':8,'Камень':12,'Древесина':6},house:2},boat:{name:'Корабль',cost:{'Древесина':24,'Железо':8,'Палка':12},house:2},waterHelmet:{name:'Водяной шлем',cost:{'Железо':6,'Сапфир':2,'Кристалл':3},house:2},masterPickaxe:{name:'Кирка мастера',cost:{'Железо':8,'Кристалл':2,'Древесина':5,'Мифрил':2},house:3},coal:{name:'Угольный блок',cost:{'Уголь':4,'Камень':2},house:1},helmet:{name:'Шлем лесника',cost:{'Кость':4,'Железо':3,'Медь':2},house:2},boots:{name:'Сапоги странника',cost:{'Древесина':3,'Листья':6},house:1},amulet:{name:'Амулет стража',cost:{'Кристалл':2,'Железо':2,'Алмаз':1},house:3},storage:{name:'Сундук-хранилище',cost:{'Древесина':10,'Камень':4},house:1},farmplot:{name:'Грядка с семенами',cost:{'Древесина':4,'Листья':3},house:1},fishingRod:{name:'Удочка',cost:{'Древесина':8,'Палка':4,'Камень':2},house:1},compost:{name:'Компост',cost:{'Листья':6,'Сырое мясо':1},house:1},fertilizer:{name:'Удобрение',cost:{'Компост':1,'Лечебная трава':2,'Уголь':1},house:1},rootBlade:{name:'Клинок живого корня',cost:{'Мифрил':10,'Алмаз':4,'Сердце Корнееда':1,'Живой корень':3},house:3},rootArmor:{name:'Доспехи древнего корня',cost:{'Мифрил':8,'Обсидиан':6,'Сердцевина древня':3,'Живой корень':4},house:3},rootElixir:{name:'Эликсир корневой ярости',cost:{'Лечебная трава':4,'Пыльца древнего леса':2,'Сердце Корнееда':1},house:2}};
    const recipe=recipes[kind];if(!recipe)return;if(houseLevel<recipe.house){const msg='Для рецепта «'+recipe.name+'» нужен дом уровня '+recipe.house+'. Улучши дом у верстака.';renderWorkbenchStatus(msg);toast(msg);return;}const actualCost=Object.fromEntries(Object.entries(recipe.cost).map(([name,amount])=>[name,Math.max(1,Math.ceil(classCraftCost(recipe.name,amount)*(isModInstalled('artisan_guild')?.9:1)))]));const missing=Object.entries(actualCost).filter(([name,amount])=>itemCount(name)<amount);if(missing.length){const msg='Не хватает: '+missing.map(([name,amount])=>name+' '+itemCount(name)+'/'+amount).join(', ')+'.';renderWorkbenchStatus(msg);toast(msg);return;}if(['Железный меч','Кожаная броня','Улучшенная кирка','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты','Ледяной посох','Молниеносное копьё','Трезубец прилива','Гарпун бури','Клинок бездны','Броня стража','Мантия мага','Шлем стража','Сапоги стража','Корона мага','Сапоги мага','Амулет мага','Наковальня','Корабль','Водяной шлем','Кирка мастера','Шлем лесника','Сапоги странника','Амулет стража','Удочка','Клинок живого корня','Доспехи древнего корня'].includes(recipe.name)&&itemCount(recipe.name)>0){toast('Этот предмет уже создан.');return;}Object.entries(actualCost).forEach(([name,amount])=>changeItem(name,-amount));const item=inventoryItems.find(i=>i.name===recipe.name);if(item)item.count+=1;if(recipe.name==='Наковальня')anvilCrafted=true;if(recipe.name==='Водяной шлем')waterHelmetLevel=Math.max(1,waterHelmetLevel);playSound('craft');renderInventory();renderWorkbenchStatus(recipe.name+' создан!');awardXP(20,'создание предмета');window.SkyRealmJobs?.record?.('crafter',1);if(['Железный меч','Кожаная броня','Улучшенная кирка','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты','Ледяной посох','Молниеносное копьё','Трезубец прилива','Гарпун бури','Клинок бездны','Броня стража','Мантия мага','Шлем стража','Сапоги стража','Корона мага','Сапоги мага','Амулет мага','Кирка мастера','Клинок живого корня','Доспехи древнего корня'].includes(recipe.name))window.SkyRealmJobs?.record?.('blacksmith',1);if(['Зелье скорости','Настой силы','Зелье защиты','Эликсир корневой ярости'].includes(recipe.name))window.SkyRealmJobs?.record?.('alchemist',1);saveGame();toast('Создано: '+recipe.name+'.');
  }
  function upgradeWaterHelmet(){
    if(!anvilCrafted&&itemCount('Наковальня')<=0){toast('Сначала создай наковальню.');return;}
    if(itemCount('Водяной шлем')<=0||waterHelmetLevel<=0){toast('Сначала создай водяной шлем.');return;}
    if(waterHelmetLevel>=4){toast('Водяной шлем уже максимального уровня.');return;}
    const costs=[null,{'Железо':6,'Сапфир':2},{'Мифрил':8,'Жемчуг':3,'Кристалл':5},{'Мифрил':14,'Жемчуг':8,'Сердце прилива':1}];
    const cost=costs[waterHelmetLevel],missing=Object.entries(cost).filter(([n,c])=>itemCount(n)<c);
    if(missing.length){toast('Не хватает: '+missing.map(([n,c])=>n+' '+itemCount(n)+'/'+c).join(', '));return;}
    Object.entries(cost).forEach(([n,c])=>changeItem(n,-c));waterHelmetLevel++;
    renderInventory();renderWorkbenchStatus('Водяной шлем улучшен до '+waterHelmetLevel+' уровня.');saveGame();
    toast('Шлем '+waterHelmetLevel+' уровня: '+({1:'1 минута',2:'4 минуты',3:'8 минут',4:'неограниченное время'}[waterHelmetLevel])+'. Защита не увеличивается.');
  }
  function showWorkbenchPage(page){
    const second=document.getElementById('workbench-page-two');if(!second)return;second.hidden=page!==2;
    document.querySelectorAll('[data-workbench-page]').forEach(b=>b.classList.toggle('active',Number(b.dataset.workbenchPage)===page));
    document.querySelectorAll('#workbench-shade .workbench-recipe').forEach(el=>{if(!second.contains(el))el.hidden=page===2;});
  }
  function upgradeAtAnvil(kind){if(!anvilCrafted&&itemCount('Наковальня')<=0){toast('Сначала создай наковальню на верстаке.');return;}if(kind==='weapon'){const name=equipment.weapon||'Деревянный меч',level=Math.max(0,Number(weaponUpgrades[name])||0);if(level>=5){toast('Это оружие уже улучшено до максимума.');return;}const cost={'Железо':3+level*2,'Кристалл':level>=2?level:0,'Золото':(level+1)*250};if(level>=2){cost['Сердце Корнееда']=1;cost['Живой корень']=1;}const missing=Object.entries(cost).filter(([n,c])=>c>0&&(n==='Золото'?walletCents<c*100:itemCount(n)<c));if(missing.length){toast('Не хватает ресурсов: '+missing.map(([n,c])=>n+' '+(n==='Золото'?(walletCents/100).toFixed(0):itemCount(n))+'/'+c).join(', '));return;}Object.entries(cost).forEach(([n,c])=>{if(c<=0)return;if(n==='Золото')walletCents-=c*100;else changeItem(n,-c);});weaponUpgrades[name]=level+1;toast(name+' улучшен до +'+(level+1)+'! Урон: '+weaponDamage(name));}else{if(armorUpgrade>=5){toast('Броня уже улучшена до максимума.');return;}const cost={'Железо':4+armorUpgrade*2,'Кристалл':armorUpgrade>=2?armorUpgrade:0,'Золото':300*(armorUpgrade+1)};if(armorUpgrade>=2){cost['Сердце Корнееда']=1;cost['Живой корень']=2;}const missing=Object.entries(cost).filter(([n,c])=>c>0&&(n==='Золото'?walletCents<c*100:itemCount(n)<c));if(missing.length){toast('Не хватает ресурсов для улучшения брони: '+missing.map(([n,c])=>n+' '+(n==='Золото'?(walletCents/100).toFixed(0):itemCount(n))+'/'+c).join(', '));return;}Object.entries(cost).forEach(([n,c])=>{if(c<=0)return;if(n==='Золото')walletCents-=c*100;else changeItem(n,-c);});armorUpgrade++;toast('Броня улучшена до +'+armorUpgrade+'! Защита: '+Math.round(armorReduction()*100)+'%.');}playSound('iron');renderInventory();renderEquipmentPanel();saveGame();}
  function enchantWeapon(){
    if(!anvilCrafted&&itemCount('Наковальня')<=0){toast('Сначала создай наковальню на верстаке.');return;}
    const name=equipment.weapon||'Деревянный меч';
    if(weaponEnchantments[name]){toast(name+' уже зачарован руной «'+weaponEnchantments[name]+'».');return;}
    const rune=['Рубин','Сапфир','Обсидиан'].find(n=>itemCount(n)>0);
    if(!rune||itemCount('Кристалл')<2){toast('Для зачарования нужны 2 кристалла и 1 рубин, сапфир или обсидиан.');return;}
    changeItem('Кристалл',-2);changeItem(rune,-1);weaponEnchantments[name]=rune;
    playSound('portal');spawnVisualBurst(player.x,player.y,18,'spark',rune==='Рубин'?'#ff596f':rune==='Сапфир'?'#68c9ff':'#b69aff');
    renderInventory();renderEquipmentPanel();saveGame();toast(name+' зачарован руной «'+rune+'»! Урон увеличен на 15%.');
  }
  function upgradeCosts(level,kind){
    if(kind==='house')return level===1?{'Древесина':18,'Камень':14,'Железо':4}:{'Древесина':28,'Камень':20,'Железо':10};
    const costs=[null,{'Камень':14,'Древесина':10,'Железо':4},{'Камень':20,'Древесина':15,'Железо':8},{'Камень':30,'Древесина':20,'Железо':12},{'Камень':40,'Древесина':25,'Железо':16},{'Камень':48,'Древесина':30,'Железо':20,'Медь':10},{'Камень':58,'Древесина':36,'Железо':24,'Мифрил':4},{'Камень':70,'Древесина':42,'Железо':28,'Обсидиан':8,'Алмаз':2}];return costs[level]||costs[7];
  }
  function costLabel(cost){return Object.entries(cost).map(([name,count])=>count+' '+name.toLowerCase()).join(' + ');}
  function updateUpgradeCards(){
    const houseCost=document.getElementById('upgrade-house-cost'),mineCost=document.getElementById('upgrade-mine-cost'),houseButton=document.getElementById('upgrade-house'),mineButton=document.getElementById('upgrade-mine');
    if(houseCost)houseCost.textContent=houseLevel>=3?'Максимальный уровень':costLabel(upgradeCosts(houseLevel,'house'));
    if(mineCost)mineCost.textContent=mineLevel>=8?'Максимальный уровень':costLabel(upgradeCosts(mineLevel,'mine'));
    if(houseButton){houseButton.disabled=houseLevel>=3;houseButton.textContent=houseLevel>=3?'Максимум':'Улучшить';}
    if(mineButton){mineButton.disabled=mineLevel>=8;mineButton.textContent=mineLevel>=8?'Максимум':'Улучшить';}
    const hl=document.getElementById('upgrade-house-level'),ml=document.getElementById('upgrade-mine-level');if(hl)hl.textContent='Текущий уровень: '+houseLevel+'/3';if(ml)ml.textContent='Текущий уровень: '+mineLevel+'/8';
  }
  function applyUpgrade(kind){
    const level=kind==='house'?houseLevel:mineLevel,max=kind==='house'?3:8;
    if(level>=max){toast((kind==='house'?'Дом':'Шахта')+' уже улучшен до максимального уровня.');return;}
    const cost=upgradeCosts(level,kind),missing=Object.entries(cost).filter(([name,count])=>itemCount(name)<count);
    if(missing.length){const msg='Не хватает ресурсов: '+missing.map(([name,count])=>name+' '+itemCount(name)+'/'+count).join(', ')+'.';renderWorkbenchStatus(msg);toast(msg);return;}
    Object.entries(cost).forEach(([name,count])=>changeItem(name,-count));
    if(kind==='house'){houseLevel++;toast('Дом улучшен до уровня '+houseLevel+'! Открыты новые рецепты: '+(houseLevel===2?'продвинутые':'легендарные')+'.');}
    else{mineLevel++;generateMineStock(Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));const unlock={2:'медь и олово',3:'серебро и золото',4:'рубины, сапфиры и обсидиан',5:'мифрил, уран и алмазы',6:'обильные жилы мифрила и алмазов',7:'уран, рубины и древние кристаллы',8:'глубинные месторождения редких руд'};toast('Шахта улучшена до уровня '+mineLevel+'! Новые залежи: '+(unlock[mineLevel]||'обычные руды')+'.');}
    playSound('craft');renderInventory();renderWorkbenchStatus((kind==='house'?'Дом':'Шахта')+' улучшен!');saveGame();drawMinimap();
  }
  function upgradeHouse(){applyUpgrade('house');}
  function upgradeMine(){applyUpgrade('mine');}
  function useBandage(){const item=inventoryItems.find(i=>i.name==='Бинт');if(!item||item.count<1){toast('Нет бинтов. Создай их у верстака.');return;}if(player.hp>=100){toast('Здоровье уже полное.');return;}const healing=20+(isModInstalled('herbalist')?8:0);item.count--;window.SkyRealmJobs?.record?.('alchemist',1);player.hp=Math.min(100,player.hp+healing);updateVitals();renderInventory();saveGame();playSound('craft');toast('Бинт использован: +'+healing+' здоровья.');}
  function useHealingPotion(){const potion=inventoryItems.find(i=>i.name==='Малое зелье');if(!potion||potion.count<1){toast('Нет лечебных зелий.');return;}if(player.hp>=100||healPotionTimer>0){toast(healPotionTimer>0?'Лечебное зелье уже действует.':'Здоровье уже полное.');return;}potion.count--;window.SkyRealmJobs?.record?.('alchemist',1);healPotionTimer=5;healPotionRemaining=60+(isModInstalled('herbalist')?10:0);playSound('craft');updateVitals();renderInventory();saveGame();toast('Лечебное зелье действует 5 секунд: до +60 здоровья постепенно.');}
  function eatMeat(){const cooked=inventoryItems.find(i=>i.name==='Жареное мясо'),raw=inventoryItems.find(i=>i.name==='Сырое мясо'),meat=inventoryItems.find(i=>i.name==='Мясо'),fish=inventoryItems.find(i=>i.name==='Рыба'),food=cooked?.count>0?cooked:raw?.count>0?raw:meat?.count>0?meat:fish?.count>0?fish:null;if(!food){toast('Нет еды. Найди овцу или поймай рыбу на озере.');return;}food.count--;const restored=food.name==='Жареное мясо'?15+(isModInstalled('camp_kitchen')?5:0):food.name==='Рыба'?12:10;hunger=Math.min(100,hunger+restored);questStage=Math.max(questStage,6);hungerElapsedMinutes=0;renderInventory();updateClockDisplay(true);saveGame();toast('Ты съел '+food.name.toLowerCase()+'. +'+restored+' голода.');}
  function cookMeatAtFurnace(){const raw=inventoryItems.find(i=>i.name==='Сырое мясо'),coal=inventoryItems.find(i=>i.name==='Уголь'),cooked=inventoryItems.find(i=>i.name==='Жареное мясо');if(!raw||raw.count<1){toast('Нужно сырое мясо. Получить его можно с овец.');return;}if(!coal||coal.count<1){toast('Для жарки нужно 1 уголь.');return;}raw.count--;coal.count--;cooked.count++;window.SkyRealmJobs?.record?.('cook',1);playSound('craft');spawnVisualBurst(player.x,player.y,8,'spark','#ffb56d');renderInventory();saveGame();toast('Мясо пожарено! Жареное мясо восстанавливает 15 голода (+5 к сырому).');}
  function updateSkipDayHud(){const t=document.getElementById('skip-day-timer'),b=document.getElementById('skip-day-button');if(!t||!b)return;const left=Math.max(0,Math.ceil(skipDayRealSeconds));t.textContent=left>0?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Готово';b.disabled=left>0||paused||inMainMenu;b.title=left>0?'Пропустить день можно после 5 минут реального времени':'Пропустить игровой день';}
  function calculateSkipDayTarget(totalMinutes,lastDawnMarker){
    const safeTotal=Number.isFinite(totalMinutes)?Math.max(0,totalMinutes):0;
    const currentDay=Math.floor(safeTotal/GAME_MINUTES_PER_DAY);
    const minuteOfDay=safeTotal-currentDay*GAME_MINUTES_PER_DAY;
    // A real skipped day ends at the next dawn, not at 20:00. This guarantees
    // that one complete night is crossed and can be counted by survival systems.
    const targetDay=currentDay+(minuteOfDay>=DAWN_MINUTE?1:0);
    const minuteTotal=targetDay*GAME_MINUTES_PER_DAY+DAWN_MINUTE;
    const dawnMarker=Math.floor((minuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);
    const previousDawnMarker=Number.isFinite(lastDawnMarker)?Math.floor(lastDawnMarker):dawnMarker;
    return {minuteTotal,dawnMarker,nightsPassed:Math.max(0,dawnMarker-previousDawnMarker)};
  }
  function skipGameDay(force=false){
    if(!force&&skipDayRealSeconds>0){toast('Подожди, пока таймер дойдёт до нуля.');return false;}
    if(!requireWorld())return false;
    const network=window.SkyRealmCoopClient;
    const room=network?.getRoomState?.();
    if(room?.status==='running'&&!network?.isRoomOwner){toast('Пропустить день может только владелец кооперативного мира.');return false;}
    const previousTotal=gameMinuteTotal;
    const target=calculateSkipDayTarget(gameMinuteTotal,lastDawnMarker);
    const skippedMinutes=Math.max(0,target.minuteTotal-previousTotal);
    if(skippedMinutes<=0){toast('Следующий рассвет уже наступил.');return false;}
    gameMinuteTotal=target.minuteTotal;
    // A skipped interval is elapsed game time, not a cosmetic clock change.
    totalGameMinutesPlayed+=skippedMinutes;
    const hungerStep=(isModInstalled('brutal_world')?7:isModInstalled('survivalist')?12:10)+skills.survivor*.7+communityModBonus('hunger')*.35;
    hungerElapsedMinutes+=skippedMinutes;
    const hungerTicks=Math.floor(hungerElapsedMinutes/Math.max(1,hungerStep));
    if(hungerTicks>0){hungerElapsedMinutes-=hungerTicks*hungerStep;hunger=Math.max(0,hunger-hungerTicks);}
    sheepSpawnTimer+=skippedMinutes;
    sheepSpawnTimer%=10;
    if(target.nightsPassed>0)refreshMineDailyStock();
    survivedNights+=target.nightsPassed;
    lastDawnMarker=target.dawnMarker;
    wasNight=isNightTime();
    monsterSpawnTimer=0;
    monsters.length=0;
    skipDayRealSeconds=300;
    updateVitals();updateClockDisplay(true);refreshAdminStats();
    if(!saveGame())return false;
    toast('Игровой день действительно пропущен: +'+Math.floor(skippedMinutes)+' игровых минут, +'+target.nightsPassed+' прожитая ночь. Время засчитано в статистику.');
    return true;
  }
  function houseFurnitureBlocked(x,y){const r=9,boxes=[[42,35,148,186],[153,91,190,143],[174,27,272,61],[286,72,379,98],[272,105,390,177],[296,201,380,279],[155,266,190,296]];return boxes.some(([l,t,rr,b])=>x+r>l&&x-r<rr&&y+r>t&&y-r<b);}
  function houseInteractionNear(x,y,rect){return x>=rect[0]&&x<=rect[2]&&y>=rect[1]&&y<=rect[3];}
  function blocked(x,y){if(inHouse){return x<24||x>396||y<24||y>322||houseFurnitureBlocked(x,y);}const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);if(tx<1||ty<1||tx>=COLS-1||ty>=ROWS-1)return true;if(bossRealmMode)return false;if(waterAt(tx+.5,ty+.5))return true;if(placedStructures.some(s=>(['furnace','storage'].includes(s.type))&&Math.hypot(x-s.x,y-s.y)<(s.type==='storage'?20:20)))return true;if(tradeWorldMode){const forest=villageCenters.find(v=>v.id==='forest');if(forest){const xOffsets=[-500,-300,-100,100,300,500],rowY=[-255,20,270];for(let row=0;row<3;row++)for(let col=0;col<6;col++){const hx=forest.x*TILE+16+xOffsets[col]+(row===1?28:row===2?-24:0),hy=forest.y*TILE+16+rowY[row];if(x>hx-76&&x<hx+76&&y>hy-12*TILE-54&&y<hy-12*TILE+84)return true;}}for(const sh of [SELL_SHOP,BUY_SHOP,FARMER_SHOP])if(Math.abs(x-(sh.x*TILE+16))<43&&Math.abs(y-(sh.y*TILE+16))<27)return true;return false;}const hx=36*TILE-120,hy=15*TILE-120;if(x>hx&&x<hx+320&&y>hy+30&&y<hy+305&&!(x>hx+137&&x<hx+183&&y>hy+270))return true;for(const t of world.trees){if(Math.abs(t.x-x)>31||Math.abs(t.y-y)>33)continue;const dx=t.x-x,dy=t.y-y;if(dx*dx+dy*dy<20*20)return true;}for(const r of world.rocks){const dx=r.x-x,dy=r.y-y;if(dx*dx+dy*dy<17*17)return true;}return false;}
  function updateObjective(){
    if(dungeonMode){const cleared=dungeonClearedRooms.includes(dungeonRoom);document.getElementById('objective').textContent=dungeonRoom===5?(cleared?(dungeonChestOpened?'Выйди из руин':'Открой сундук Архонта'):'Победи Архонта руин'):cleared?'Найди дверь в следующую комнату':'Победи стража комнаты '+dungeonRoom;document.getElementById('location-name').textContent='Древние руины · '+dungeonRoom+'/5';return;}
    if(caveMode){document.getElementById('objective').textContent=caveChestOpened?'Вернись в долину или исследуй пещеру':'Найди сияющий сундук в тайной пещере';document.getElementById('location-name').textContent='Тайная пещера';return;}
    if(inHouse){const nearBed=houseInteractionNear(player.x,player.y,[150,82,194,176]),nearBench=Math.hypot(player.x-331,player.y-141)<82,nearDoor=houseInteractionNear(player.x,player.y,[174,278,246,330]);document.getElementById('objective').textContent=nearBed?'Нажми E у кровати, чтобы поспать':nearBench?'Нажми E у верстака':nearDoor?'Нажми E, чтобы выйти из дома':'Осмотри дом: кровать и верстак';document.getElementById('location-name').textContent='Дом у лесной долины';return;}
    const npc=nearestVillageNpc();if(npc){document.getElementById('objective').textContent='E · задание: '+NPC_NAMES[npc.id]+' / T · лавка';document.getElementById('location-name').textContent='Мир торговли · '+(villageCenters.find(v=>v.id===npc.villageId)?.name||'поселение')+' · репутация '+villageReputation;return;}
    const s = world.signs[0];
    const d = Math.hypot(s.x-player.x, s.y-player.y);
    const objective = document.getElementById('objective');
    const liveSheep=sheep.filter(a=>a.alive).length;const targets=['Найди и прочитай дорожный знак','Войди в дом и осмотри кровать и верстак','Собери древесину: возьми топор и сруби дерево','Используй верстак в доме','Победи монстра','Добудь мясо овцы и съешь его','Исследуй не менее 10% карты','Посети берег озера','Переживи первую ночь'];if(exploredCells.size>=Math.ceil(COLS*ROWS*.1))questStage=Math.max(questStage,7);if(player.x/TILE<20&&waterAt(player.x/TILE,player.y/TILE))questStage=Math.max(questStage,7);if(survivedNights>0)questStage=Math.max(questStage,9);const target=targets[Math.min(questStage,targets.length-1)];objective.textContent='Задание '+Math.min(questStage+1,targets.length)+'/'+targets.length+': '+target;
    document.getElementById('location-name').textContent = tradeWorldMode ? 'Мир торговли' : (waterAt(player.x/TILE,player.y/TILE) ? 'Берег тихого озера' : (player.x/TILE>31&&player.x/TILE<42&&player.y/TILE>13&&player.y/TILE<24 ? 'Старая деревня' : biomeNameAt(player.x/TILE,player.y/TILE)));
  }
  function toast(text){const el=document.getElementById('toast');if(!el)return;el.textContent=String(text??'');el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4200);}let toastTimer;
  const ACHIEVEMENT_KEY='skyrealm_achievements_v1';
  const ACHIEVEMENTS=[
    {id:'first_step',title:'Первый шаг',desc:'Прочитай дорожный знак и начни своё приключение.',target:1,progress:()=>questStage>=1,reward:'Значок «Путешественник»'},
    {id:'first_night',title:'Первая ночь',desc:'Переживи первую ночь в мире.',target:1,progress:()=>survivedNights>=1,reward:'Титул «Ночной дозор»'},
    {id:'explorer',title:'Следопыт',desc:'Исследуй не менее 100 клеток карты.',target:100,progress:()=>exploredCells.size,reward:'Значок «Следопыт»'},
    {id:'veteran',title:'Опытный путешественник',desc:'Достигни 5-го уровня.',target:5,progress:()=>playerLevel,reward:'Титул «Ветеран»'},
    {id:'angler',title:'Рыбак',desc:'Поймай 10 рыб.',target:10,progress:()=>fishCaught,reward:'Значок «Рыбак»'},
    {id:'cave_guardian',title:'Страж глубин',desc:'Победи босса пещеры.',target:1,progress:()=>caveBossDefeated?1:0,reward:'Титул «Страж глубин»'},
    {id:'villager_friend',title:'Друг жителей',desc:'Получи 10 очков репутации в деревне.',target:10,progress:()=>villageReputation,reward:'Значок «Друг деревни»'},
    {id:'long_journey',title:'Долгий путь',desc:'Проведи в SkyRealm не менее одного часа.',target:3600,progress:()=>profilePlaytimeSeconds,reward:'Титул «Путешественник времени»'}
  ];
  function readAchievementState(){try{const v=JSON.parse(localStorage.getItem(ACHIEVEMENT_KEY)||'{}');return v&&typeof v==='object'?v:{unlocked:{},stats:{}};}catch(_){return {unlocked:{},stats:{}};}}
  function evaluateAchievements(quiet=false){
    const state=readAchievementState();if(!state.unlocked||typeof state.unlocked!=='object')state.unlocked={};if(!state.stats||typeof state.stats!=='object')state.stats={};
    const checks={questStage:Math.max(0,Number(questStage)||0),survivedNights:Math.max(0,Number(survivedNights)||0),exploredCells:exploredCells.size,playerLevel:Math.max(1,Number(playerLevel)||1),fishCaught:Math.max(0,Number(fishCaught)||0),villageReputation:Math.max(0,Number(villageReputation)||0),profilePlaytimeSeconds:Math.max(0,Number(profilePlaytimeSeconds)||0)};
    for(const [key,value] of Object.entries(checks))state.stats[key]=Math.max(Number(state.stats[key])||0,value);
    if(caveBossDefeated)state.stats.caveBossDefeated=true;
    const newly=[];
    for(const item of ACHIEVEMENTS){const value=item.id==='cave_guardian'?(state.stats.caveBossDefeated?1:0):Math.max(0,Number(state.stats[item.id==='first_step'?'questStage':item.id==='first_night'?'survivedNights':item.id==='explorer'?'exploredCells':item.id==='veteran'?'playerLevel':item.id==='angler'?'fishCaught':item.id==='villager_friend'?'villageReputation':'profilePlaytimeSeconds'])||0);if(value>=item.target&&!state.unlocked[item.id]){state.unlocked[item.id]={at:Date.now(),reward:item.reward};newly.push(item);}}
    try{localStorage.setItem(ACHIEVEMENT_KEY,JSON.stringify(state));}catch(error){console.warn('Achievement progress could not be saved:',error);}
    if(!quiet)newly.forEach(item=>toast('🏆 Достижение: '+item.title+' · '+item.reward));
    return {state,newly};
  }
  function renderAchievements(){
    const {state}=evaluateAchievements(true),list=document.getElementById('achievement-list'),count=document.getElementById('achievement-count');if(!list)return;
    const unlocked=Object.keys(state.unlocked||{}).length;if(count)count.textContent=unlocked+' / '+ACHIEVEMENTS.length+' открыто';
    const stats=document.getElementById('progress-stats-grid');
    if(stats){
      const playtime=Math.max(0,Number(state.stats?.profilePlaytimeSeconds)||0);
      const hours=(playtime/3600).toFixed(1);
      const worldCount=readWorlds().length;
      const level=Math.max(1,Number(state.stats?.playerLevel)||1);
      stats.innerHTML='<article><small>Время в игре</small><b>'+hours+' ч</b></article><article><small>Создано миров</small><b>'+worldCount+'</b></article><article><small>Уровень игрока</small><b>'+level+'</b></article><article><small>Достижения</small><b>'+unlocked+' / '+ACHIEVEMENTS.length+'</b></article>';
    }
    list.innerHTML=ACHIEVEMENTS.map(item=>{const value=item.id==='cave_guardian'?(state.stats?.caveBossDefeated?1:0):Math.max(0,Number(state.stats?.[item.id==='first_step'?'questStage':item.id==='first_night'?'survivedNights':item.id==='explorer'?'exploredCells':item.id==='veteran'?'playerLevel':item.id==='angler'?'fishCaught':item.id==='villager_friend'?'villageReputation':'profilePlaytimeSeconds'])||0);const done=!!state.unlocked[item.id],shown=Math.min(item.target,value),progress=item.target>=3600?Math.floor(shown/60)+' / 60 мин':shown+' / '+item.target;return '<article class="achievement-card '+(done?'is-unlocked':'')+'"><span class="achievement-icon">'+(done?'🏆':'🔒')+'</span><div class="achievement-copy"><b>'+item.title+'</b><small>'+item.desc+'</small><small class="achievement-reward">'+(done?'Награда получена: ':'Награда: ')+item.reward+'</small><div class="achievement-progress"><i style="width:'+Math.round(shown/item.target*100)+'%"></i></div><small>'+progress+'</small></div><span class="achievement-status">'+(done?'Открыто':'В процессе')+'</span></article>';}).join('');
  }

  const COSMETIC_SETS=[
    {id:'first_step',name:'Путешественник',icon:'🧭',desc:'Практичный образ для первых дорог.',appearance:{armor:'#398b68',accent:'#9af0cb',hairStyle:'short'}},
    {id:'first_night',name:'Ночной страж',icon:'🌙',desc:'Тёмная броня и светящиеся детали.',appearance:{armor:'#39436f',accent:'#9cb9ff',face:'visor',hairStyle:'hood'}},
    {id:'explorer',name:'Лесной следопыт',icon:'🌲',desc:'Зелёный плащ для дальних походов.',appearance:{armor:'#28694b',accent:'#9af0cb',hairStyle:'hood'}},
    {id:'veteran',name:'Золотой ветеран',icon:'👑',desc:'Золотые детали за большой опыт.',appearance:{armor:'#b78b35',accent:'#f4d36c',face:'stern'}},
    {id:'angler',name:'Хозяин озера',icon:'🎣',desc:'Морские оттенки и холодный блеск.',appearance:{armor:'#287d91',accent:'#61c5ff',eye:'#61c5ff'}},
    {id:'cave_guardian',name:'Страж глубин',icon:'💠',desc:'Фиолетовая броня с сияющими деталями.',appearance:{armor:'#6e4ca5',accent:'#e8e9f2',face:'visor'}},
    {id:'villager_friend',name:'Защитник деревни',icon:'🏡',desc:'Тёплый зелёно-золотой комплект.',appearance:{armor:'#55764a',accent:'#f4d36c',hairStyle:'long'}},
    {id:'long_journey',name:'Легенда времени',icon:'✨',desc:'Серебряный образ опытного странника.',appearance:{armor:'#64748b',accent:'#e8e9f2',hair:'#dce7f5',face:'mask'}}
  ];
  function renderCosmeticCollection(){
    const root=document.getElementById('cosmetic-collection');if(!root)return;
    const state=readAchievementState(),unlocked=state.unlocked||{};
    root.innerHTML=COSMETIC_SETS.map(set=>{const ready=!!unlocked[set.id];return '<article class="cosmetic-card '+(ready?'cosmetic-unlocked':'cosmetic-locked')+'"><span class="cosmetic-icon">'+(ready?set.icon:'🔒')+'</span><div><b>'+set.name+'</b><small>'+set.desc+'</small><small>'+(ready?'Бесплатная награда открыта':'Открой достижение «'+(ACHIEVEMENTS.find(a=>a.id===set.id)?.title||'')+'»')+'</small></div><button type="button" data-cosmetic="'+set.id+'" '+(!ready?'disabled':'')+'>'+(ready?'Применить':'Закрыто')+'</button></article>';}).join('');
    root.querySelectorAll('[data-cosmetic]').forEach(button=>button.addEventListener('click',()=>applyCosmeticSet(button.dataset.cosmetic)));
  }
  function applyCosmeticSet(id){
    const state=readAchievementState();if(!state.unlocked?.[id]){toast('Сначала открой соответствующее достижение.');return;}
    const set=COSMETIC_SETS.find(item=>item.id===id);if(!set)return;
    applyAppearanceData(set.appearance);for(const key of Object.keys(set.appearance)){const control=document.getElementById('avatar-'+key);if(control)control.value=playerAppearance[key];}
    syncAvatarPreview();toast('Выбран образ: '+set.name+'. Нажми «Сохранить образ», чтобы применить его.');
  }

  const ADVENTURE_HISTORY_KEY='skyrealm_adventure_history_v1';
  function recordAdventureHistory(){
    if(!currentWorldId||!worldSessionStartedAt||worldSessionRecorded)return false;
    const endedAt=Date.now(),duration=Math.max(0,Math.floor((endedAt-worldSessionStartedAt)/1000));
    const difficulty=DIFFICULTIES[currentDifficulty];
    const entry={id:currentWorldId+'-'+worldSessionStartedAt,world:currentWorldName||'Мир',difficulty:difficulty?.name||currentDifficulty,startedAt:worldSessionStartedAt,endedAt,durationSeconds:duration,level:Math.max(1,Number(playerLevel)||1),day:Math.floor(Math.max(0,Number(gameMinuteTotal)||0)/1440)+1,exploredPercent:Math.min(100,Math.floor(exploredCells.size/Math.max(1,COLS*ROWS)*100)),playerClass};
    try{const prior=JSON.parse(localStorage.getItem(ADVENTURE_HISTORY_KEY)||'[]');const rows=Array.isArray(prior)?prior:[];rows.unshift(entry);localStorage.setItem(ADVENTURE_HISTORY_KEY,JSON.stringify(rows.slice(0,50)));worldSessionRecorded=true;return true;}catch(error){console.warn('Adventure history could not be saved:',error);return false;}
  }
  function renderAdventureHistory(){
    const root=document.getElementById('adventure-history');if(!root)return;
    let rows=[];try{const parsed=JSON.parse(localStorage.getItem(ADVENTURE_HISTORY_KEY)||'[]');if(Array.isArray(parsed))rows=parsed;}catch(_){}
    root.innerHTML=rows.length?rows.slice(0,10).map(row=>{const date=new Date(Number(row.endedAt)||Date.now()).toLocaleString();const minutes=Math.floor(Math.max(0,Number(row.durationSeconds)||0)/60);return '<article class="history-row"><b>'+escapeHtml(row.world||'Мир')+'</b><small>'+escapeHtml(date)+' · '+escapeHtml(row.difficulty||'')+'</small><small>Уровень '+Math.max(1,Number(row.level)||1)+' · День '+Math.max(1,Number(row.day)||1)+' · Карта '+Math.max(0,Number(row.exploredPercent)||0)+'% · '+minutes+' мин.</small></article>';}).join(''):'<p class="history-empty">История появится после завершения первого игрового сеанса.</p>';
  }
  function openAchievements(){evaluateAchievements(true);renderAchievements();renderAdventureHistory();document.getElementById('achievements-shade').hidden=false;document.getElementById('achievements-shade').setAttribute('aria-hidden','false');}
  function closeAchievements(){document.getElementById('achievements-shade').hidden=true;document.getElementById('achievements-shade').setAttribute('aria-hidden','true');canvas.focus();}

  function openSignDialog(){
    signDialogOpen = true;
    keys.clear();pressedMovementCodes.clear();
    movementDirections.clear();
    discovered = true;
    questStage=Math.max(questStage,1);
    saveGame();
    document.getElementById('hint').classList.remove('show');
    document.getElementById('sign-dialog-shade').hidden = false;
    document.getElementById('sign-dialog-shade').setAttribute('aria-hidden', 'false');
    canvas.blur();
  }
  function closeSignDialog(){
    signDialogOpen = false;
    document.getElementById('sign-dialog-shade').hidden = true;
    document.getElementById('sign-dialog-shade').setAttribute('aria-hidden', 'true');
    canvas.focus();
  }
  const WEAPON_BASE_DAMAGE={'Клинок живого корня':245,'Деревянный меч':20,'Железный меч':35,'Огненный меч':50,'Стальной меч':62,'Меч титана':100,'Меч дракона':130,'Меч пустоты':170,'Ледяной посох':28,'Молниеносное копьё':46,'Трезубец прилива':210,'Гарпун бури':280,'Клинок бездны':360};
  const LEGENDARY_SWORDS=new Set(['Меч титана','Меч дракона','Меч пустоты','Трезубец прилива','Гарпун бури','Клинок бездны','Клинок живого корня']);
  const SWORD_DIFFICULTY_MULTIPLIER={easy:1,medium:1.25,hard:1.6,hell:2.1,impossible:2.75};
  function weaponDamage(name=equipment.weapon){const base=((WEAPON_BASE_DAMAGE[name]||20)+(Math.max(0,Math.min(5,Number(weaponUpgrades[name])||0))*8))*(isModInstalled('legendary_gear')?1.18:1);const difficultyBonus=LEGENDARY_SWORDS.has(name)?(SWORD_DIFFICULTY_MULTIPLIER[currentDifficulty]||1):1;const classBonus=(classHas('swordsman')&&String(name).toLowerCase().includes('меч')?1.1:classHas('archer')&&name==='Молниеносное копьё'?1.2:classHas('mage')&&name==='Ледяной посох'?1.2:1)*(1+skills.warrior*.08+(name==='Молниеносное копьё'?skills.ranger*.06:0)+communityModBonus('damage')*.02);return Math.round(base*difficultyBonus*classBonus*(name==='Ледяной посох'?1.15:1)*(name==='Молниеносное копьё'&&isModInstalled('marksman')?1.2:1)*(weaponEnchantments[name]?1.15:1)*(strengthPotionTimer>0?1.3:1)*(Date.now()<artifactProgression.berserkUntil?1.2:1)*(window.SkyRealmExpansionSystems?.damageMultiplier?.()||1)*armorSetBonuses(name).damage*(1+bossRealmRelicTotals().damage));}
  function weaponRange(name=equipment.weapon){return name==='Ледяной посох'?230:name==='Молниеносное копьё'?125:82;}
  function armorSetBonuses(weapon=equipment.weapon){const god=equipment.armor==='Нагрудник Бога'&&equipment.helmet==='Шлем Бога'&&equipment.leggings==='Поножи Бога'&&equipment.boots==='Сапоги Бога'&&equipment.amulet==='Амулет Бога';const guardian=equipment.armor==='Броня стража'&&equipment.helmet==='Шлем стража'&&equipment.boots==='Сапоги стража'&&equipment.amulet==='Амулет стража';const mage=equipment.armor==='Мантия мага'&&equipment.helmet==='Корона мага'&&equipment.boots==='Сапоги мага'&&equipment.amulet==='Амулет мага';const archive=equipment.armor==='Мантия архивариуса'&&equipment.helmet==='Диадема эха'&&equipment.artifact==='Око архивариуса';const root=equipment.armor==='Доспехи корневого стража'&&equipment.helmet==='Корона живого корня'&&equipment.artifact==='Сердце корней';const echo=equipment.armor==='Доспехи древнего корня'&&equipment.helmet==='Диадема эха'&&equipment.artifact==='Печать времени';const result={name:god?'Бога':guardian?'Страж':mage?'Маг':archive?'Архивариуса':root?'Корневого стража':echo?'Эха':'Нет полного комплекта',god,guardian,mage,damage:god?1.25:guardian?1.10:mage&&weapon==='Ледяной посох'?1.20:archive?1.14:root?1.17:echo?1.12:1,defense:god?.18:guardian?.10:mage?.06:archive?.09:root?.13:echo?.11:0};if(archive)result.archive=true;if(root)result.root=true;if(echo)result.echo=true;return result;}
  function armorReduction(){let r=equipment.armor==='Нагрудник Бога'?.90:equipment.armor==='Доспехи корневого стража'?.62:equipment.armor==='Доспехи древнего корня'?.58:equipment.armor==='Броня стража'?.52:equipment.armor==='Мантия архивариуса'?.48:equipment.armor==='Кожаная броня'?.4:equipment.armor==='Мантия мага'?.25:0;if(equipment.armor)r+=armorUpgrade*.035;r+=(equipment.helmet==='Шлем лесника'?.15:equipment.helmet==='Шлем стража'?.16:equipment.helmet==='Корона мага'?.04:equipment.helmet==='Диадема эха'?.10:equipment.helmet==='Корона живого корня'?.14:equipment.helmet==='Шлем Бога'?.18:0)+(equipment.leggings==='Поножи Бога'?.12:0)+(equipment.boots==='Сапоги Бога'?.08:0)+(equipment.amulet==='Амулет стража'?.1:equipment.amulet==='Амулет мага'?.05:equipment.amulet==='Амулет Бога'?.12:0)+armorSetBonuses().defense+(wardPotionTimer>0?.2:0)+skills.guardian*.025+communityModBonus('defense')*.015+(isModInstalled('guardian_oath')?.08:0)+(window.SkyRealmExpansionSystems?.defenseBonus?.()||0);r+=bossRealmRelicTotals().defense;return Math.min(.95,r);}
  function itemCount(name){const i=inventoryItems.find(v=>v.name===name);return i?i.count:0;}
  function changeItem(name,delta){const i=inventoryItems.find(v=>v.name===name);if(!i)return false;if(i.count+delta<0)return false;i.count+=delta;if(delta>0){try{window.SkyRealmChallengeHooks?.onItemGained?.(name,delta);}catch(error){console.warn('[SkyRealm challenge progress]',error);}}return true;}
  window.addEventListener('skyrealm:job-reward',event=>{
    const reward=event.detail||{},gold=Math.max(0,Math.floor(Number(reward.gold)||0)),xp=Math.max(0,Math.floor(Number(reward.xp)||0));
    walletCents+=gold*100;
    if(reward.item&&Number(reward.itemCount)>0)changeItem(String(reward.item),Math.min(99,Math.floor(Number(reward.itemCount))));
    if(xp>0)awardXP(xp,'заказ профессии '+String(reward.job||''));
    updateWalletHud();renderInventory();saveGame();
    toast('Заказ выполнен · '+String(reward.job||'профессия')+' · зарплата '+gold+' золота · +'+xp+' XP'+(reward.item?' · '+reward.item+' ×'+reward.itemCount:''));
  });
  function formatMoney(cents){return (Math.floor(cents/100))+','+String(Math.abs(cents%100)).padStart(2,'0')+' 🟡';}
  function openShop(kind){activeShop=kind;shopDialogOpen=true;paused=true;keys.clear();pressedMovementCodes.clear();const shade=document.getElementById('shop-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');renderShop();}
  function closeShop(){shopDialogOpen=false;const shade=document.getElementById('shop-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');paused=false;saveGame();}
  function renderShop(){const title=document.getElementById('shop-title'),eyebrow=document.getElementById('shop-eyebrow'),list=document.getElementById('shop-items'),balance=document.getElementById('shop-balance'),prices=difficultyConfig().shop;balance.textContent=formatMoney(walletCents);updateWalletHud();if(activeShop.startsWith('npc:')){const id=activeShop.slice(4),npc=villageNpcs.find(v=>v.id===id),goods=NPC_SHOPS[id]||[],sellGoods={...(NPC_SELL_PRICES[id]||{}),...(id==='farmer'?Object.fromEntries(FARM_CROPS.map(c=>[c.product,farmCropSellPrice(c.product)])):{})};title.textContent=(npc?NPC_NAMES[id]:(NPC_NAMES[id]||'Торговец'))+' · лавка';eyebrow.textContent='SKYREALM · ТОРГОВЛЯ · РЕПУТАЦИЯ '+villageReputation;const buyRows=goods.map(it=>{const basePrice=id==='farmer'?(farmCropBuyPrice(it.name)||it.price):it.price;const price=Math.max(1,Math.round(basePrice*(id==='farmer'?farmEconomy().buy:1)*Math.max(.65,1-villageReputation*.02)*(isModInstalled('trade_caravans')?.9:1)));return '<div class="shop-row"><div class="shop-icon">'+it.icon+'</div><div class="shop-row-main"><b>'+it.name+'</b><small>Цена: '+formatMoney(price)+'</small><span>В инвентаре: '+itemCount(it.name)+(WEAPON_BASE_DAMAGE[it.name]?' · Урон: '+weaponDamage(it.name):'')+'</span></div><button class="action shop-action" data-npc-buy="'+it.name+'">Купить</button></div>';}).join('');const sellRows=Object.entries(sellGoods).map(([name,unit])=>'<div class="shop-row"><div class="shop-icon">📦</div><div class="shop-row-main"><b>'+name+'</b><small>Цена за штуку: '+formatMoney(Math.round(unit*(1+Math.min(.25,villageReputation*.005))))+'</small><span>В инвентаре: '+itemCount(name)+'</span></div><button class="action shop-action" data-npc-sell="'+name+'" '+(itemCount(name)<=0?'disabled':'')+'>Продать всё</button></div>').join('');list.innerHTML='<h3 class="shop-section-title">Покупка</h3>'+buyRows+'<h3 class="shop-section-title">Продажа</h3>'+sellRows;list.querySelectorAll('[data-npc-buy]').forEach(b=>b.addEventListener('click',()=>buyNpcItem(id,b.dataset.npcBuy)));list.querySelectorAll('[data-npc-sell]').forEach(b=>b.addEventListener('click',()=>sellNpcItem(id,b.dataset.npcSell)));return;}if(activeShop==='sell'){title.textContent='Лавка лесника';eyebrow.textContent='SKYREALM · ПРОДАЖА РЕСУРСОВ · '+difficultyConfig().name.toUpperCase();list.innerHTML=[{name:'Древесина',icon:'🪵',price:prices.sell.wood,unit:'5 шт. = '+formatMoney(prices.sell.wood)+' золотых'},{name:'Листья',icon:'🍃',price:prices.sell.leaves,unit:'1 шт. = '+formatMoney(prices.sell.leaves)+' золотого'},{name:'Мясо',icon:'🍖',price:prices.sell.meat,unit:'1 шт. = '+formatMoney(prices.sell.meat)+' золотого'}].map(it=>'<div class="shop-row"><div class="shop-icon">'+it.icon+'</div><div class="shop-row-main"><b>'+it.name+'</b><small>'+it.unit+'</small><span>В инвентаре: '+itemCount(it.name)+'</span></div><button class="action shop-action" data-sell="'+it.name+'">Продать</button></div>').join('');}else{title.textContent='Лавка рудокопа';eyebrow.textContent='SKYREALM · ПОКУПКА РУДЫ · '+difficultyConfig().name.toUpperCase();list.innerHTML=[{name:'Камень',icon:'🪨',price:prices.buy.Камень},{name:'Уголь',icon:'⚫',price:prices.buy.Уголь},{name:'Железо',icon:'⛓️',price:prices.buy.Железо}].map(it=>'<div class="shop-row"><div class="shop-icon">'+it.icon+'</div><div class="shop-row-main"><b>'+it.name+'</b><small>Цена за 1 шт.: '+formatMoney(it.price)+'</small><span>В инвентаре: '+itemCount(it.name)+'</span></div><button class="action shop-action" data-buy="'+it.name+'">Купить</button></div>').join('');}list.querySelectorAll('[data-sell]').forEach(b=>b.addEventListener('click',()=>sellResource(b.dataset.sell)));list.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>buyOre(b.dataset.buy)));}  function sellResource(name){const prices=difficultyConfig().shop.sell;let count=0,cents=0;if(name==='Древесина'){count=Math.floor(itemCount(name)/5)*5;cents=(count/5)*prices.wood;}else if(name==='Листья'){count=itemCount(name);cents=count*prices.leaves;}else if(name==='Мясо'){count=itemCount(name);cents=count*prices.meat;}if(count<=0){toast(name==='Древесина'?'Для продажи древесины нужно минимум 5 штук.':'У тебя нет этого ресурса для продажи.');return;}changeItem(name,-count);walletCents+=cents;playSound('coin');renderInventory();updateWalletHud();renderShop();saveGame();toast(`Продано: ${count} · получено ${formatMoney(cents)}. Баланс: ${formatMoney(walletCents)}.`);}
  function buyOre(name){const price=difficultyConfig().shop.buy[name];if(!Number.isFinite(price)){toast('Этот товар недоступен.');return;}if(walletCents<price){toast('Недостаточно денег. Нужно '+formatMoney(price)+'.');return;}walletCents-=price;changeItem(name,1);playSound('coin');renderInventory();updateWalletHud();renderShop();saveGame();toast('Куплено: '+name+'. Баланс: '+formatMoney(walletCents)+'.');}
  let worldTransitioning=false;
  function transitionTradeWorld(){if(worldTransitioning)return;worldTransitioning=true;const fade=document.getElementById('world-fade');const wasPaused=paused;paused=true;keys.clear();pressedMovementCodes.clear();fade.classList.add('active');playSound('portal');window.setTimeout(()=>{tradeWorldMode=!tradeWorldMode;inHouse=false;mineMode=false;player.x=tradeEntranceX*TILE+16;player.y=tradeEntranceY*TILE+16;player.vx=player.vy=0;markExploredAroundPlayer();const loc=document.getElementById('location-name');if(loc)loc.textContent=tradeWorldMode?'Мир торговли':'Лесная долина';saveGame();drawMinimap();toast(tradeWorldMode?'Ты в Мире торговли! У входа — две лавки, рядом — торговец и фермер Мира. T открывает магазин, E — задание.':'Ты вернулся в Лесную долину.');window.setTimeout(()=>{fade.classList.remove('active');paused=wasPaused;worldTransitioning=false;},280);},280);}
  function fishingShoreRatio(){
    if(tradeWorldMode||mineMode||caveMode||dungeonMode||inHouse)return Infinity;
    const dx=(player.x/TILE-52)/6.5,dy=(player.y/TILE-36)/4.3;
    return Math.hypot(dx,dy);
  }
  function startFishing(){
    const ratio=fishingShoreRatio();
    if(!Number.isFinite(ratio)||ratio<.86||ratio>1.55)return false;
    if(fishingCastTimer>0){toast('Удочка уже заброшена. Подожди поклёвку.');return true;}
    if(itemCount('Удочка')<=0){toast('Для рыбалки сначала создай удочку на верстаке.');return true;}
    if(selectedInventoryItem()?.name!=='Удочка'){toast('Выбери удочку в нижнем инвентаре, чтобы рыбачить.');return true;}
    fishingOrigin={x:player.x,y:player.y};
    fishingCastTimer=(isModInstalled('angler')?2.2:3.2)*(isModInstalled('ocean_depths')?.75:1);
    spawnVisualBurst(player.x,player.y,5,'spark','#9ce8ff');
    playSound('portal');
    toast('Удочка заброшена. Не двигайся около 3 секунд…');
    return true;
  }
  function updateFishing(dt){
    if(fishingCastTimer<=0)return;
    if(!fishingOrigin||Math.hypot(player.x-fishingOrigin.x,player.y-fishingOrigin.y)>TILE*.6){
      fishingCastTimer=0;fishingOrigin=null;toast('Рыбалка прервана: ты отошёл от берега.');return;
    }
    fishingCastTimer=Math.max(0,fishingCastTimer-dt);
    if(fishingCastTimer>0)return;
    fishingOrigin=null;
    const pearlChance=Math.min(.7,(weatherMode==='rain'?.12:.05)+(isModInstalled('angler')?.08:0)+(isModInstalled('ocean_depths')?.16:0)+skillBonus('fisherman')*.03);
    const pearl=Math.random()<pearlChance;
    const itemName=pearl?'Жемчуг':'Рыба';
    const amount=pearl?1:1+(Math.random()<(isModInstalled('angler')?.6:.35)?1:0);
    if(!changeItem(itemName,amount)){toast('Не удалось поместить улов в инвентарь.');return;}
    fishCaught+=amount;window.SkyRealmJobs?.record?.('fisherman',1);try{window.SkyRealmLivingWorld?.onFishingCatch?.(seasonInfo().id,weatherMode);}catch(error){console.warn('[SkyRealm fishing codex]',error);}
    spawnVisualBurst(player.x,player.y,pearl?18:10,'spark',pearl?'#e9d4ff':'#9ce8ff');
    playSound(pearl?'coin':'water');
    awardXP(pearl?24:8,'рыбалка');
    renderInventory();
    saveGame();
    toast(pearl?'Редкая находка! Ты поймал жемчуг.':'Поклёвка! Получено: рыба ×'+amount+'. Всего поймано: '+fishCaught+'.');
  }
  async function interact(){
    if(dungeonMode){interactDungeon();return;}
    if(window.SkyRealmForestEcosystem?.interact?.())return;
    if(bossRealmMode&&mineBossRealmRock())return;
    if(!inHouse){
    // Resolve a house doorway before portals, arena markers or signs so nearby props cannot steal E.
    const placedHouse=placedStructures.find(s=>s.type==='house'&&Math.abs(player.x-s.x)<34&&Math.abs(player.y-(s.y+43))<42);
    if(placedHouse){bedSpawn={x:placedHouse.x,y:placedHouse.y+55};enteredPlacedHouse={x:placedHouse.x,y:placedHouse.y};inHouse=true;player.x=210;player.y=225;player.vx=player.vy=0;keys.clear();pressedMovementCodes.clear();toast('Ты вошёл в свой дом. E у кровати — спать, у верстака — использовать.');saveGame();return;}
    const hx=36*TILE-120,hy=15*TILE-120;
    if(!bossRealmMode&&Math.abs(player.x-(hx+160))<42&&Math.abs(player.y-(hy+274))<48){bedSpawn={x:36*TILE+40,y:15*TILE+154};inHouse=true;player.x=210;player.y=225;player.vx=player.vy=0;keys.clear();pressedMovementCodes.clear();toast('Ты вошёл в дом. E у кровати — спать, у верстака — использовать.');if(questStage<2)questStage=2;saveGame();return;}
    if(bossRealmMode){
      const candidates=[];
      const portal=bossRealmPortalPosition(),portalDistance=Math.hypot(player.x-portal.x,player.y-portal.y);
      if(portalDistance<=76)candidates.push({kind:'portal',distance:portalDistance});
      const nearestSite=ensureBossRealmDungeonSites().map(site=>({site,distance:Math.hypot(player.x-site.x,player.y-site.y)})).filter(v=>v.distance<=76).sort((a,b)=>a.distance-b.distance)[0];
      if(nearestSite)candidates.push({kind:'site',distance:nearestSite.distance});
      const nearestSign=(world.signs||[]).map(sign=>({sign,distance:Math.hypot(player.x-sign.x,player.y-sign.y)})).filter(v=>v.distance<=90).sort((a,b)=>a.distance-b.distance)[0];
      if(nearestSign)candidates.push({kind:'sign',distance:nearestSign.distance});
      candidates.sort((a,b)=>a.distance-b.distance);
      if(candidates[0]?.kind==='portal'){await interactBossRealmPortal();return;}
      if(candidates[0]?.kind==='site'){interactBossRealmDungeonSite();return;}
      if(candidates[0]?.kind==='sign'){openSignDialog();questStage=Math.max(questStage,1);return;}
    }else if(await interactBossRealmPortal())return;
    if(interactBossRealmDungeonSite())return;
    }
    if(inHouse){
      const nearBed=houseInteractionNear(player.x,player.y,[150,82,194,176]),nearBench=houseInteractionNear(player.x,player.y,[242,105,272,180]),nearDoor=houseInteractionNear(player.x,player.y,[174,286,246,324]);
      if(nearDoor){inHouse=false;if(enteredPlacedHouse){player.x=enteredPlacedHouse.x;player.y=enteredPlacedHouse.y+55;enteredPlacedHouse=null;}else{player.x=36*TILE+40;player.y=15*TILE+154;}toast('Ты вышел из дома.');if(questStage<2)questStage=2;saveGame();return;}
      if(nearBed){bedSpawn=enteredPlacedHouse?{x:enteredPlacedHouse.x,y:enteredPlacedHouse.y+55}:{x:36*TILE+40,y:15*TILE+154};saveGame();const nowMinute=minuteOfDay();if(nowMinute<18*60||nowMinute>=NIGHT_MINUTE){toast('Ложиться спать можно только вечером, с 18:00 до 20:00. Сейчас '+String(Math.floor(nowMinute/60)).padStart(2,'0')+':'+String(nowMinute%60).padStart(2,'0')+'.');return;}const houseX=36*TILE+40,houseY=15*TILE+154;const nearby=monsters.some(m=>Math.hypot(m.x-houseX,m.y-houseY)<10*TILE);if(nearby){toast('Нельзя спать: монстр обнаружен в радиусе 10 блоков от дома.');return;}if(sleeping)return;sleeping=true;sleepSeconds=0;toast('Ты лёг спать.');return;}
      if(nearBench){workbenchUsed=true;questStage=Math.max(questStage,3);saveGame();openWorkbench();return;}
      toast('Подойди к кровати, верстаку или двери.');return;
    }
    if(!inHouse&&!bossRealmMode&&window.SkyRealmExpansionSystems?.interactWorldEvent?.())return;
    if(collectMeteor())return;
    if(collectWorldEventCamp())return;
    if(collectWorldEventTraveler())return;
    if(collectWorldEventShrine())return;
    if(fishingCastTimer>0){toast('Подожди поклёвку — не двигайся.');return;}
    if(startFishing())return;
    if(caveMode){
      if(caveSecretRoom>0){
        if(Math.hypot(player.x-width*.16,player.y-height*.82)<115){caveSecretRoom=0;player.x=width*.50;player.y=height*.72;toast('Ты вернулся в большую пещеру.');saveGame();return;}
        if(Math.hypot(player.x-width*.72,player.y-height*.52)<100){if(caveSecretRoomsOpened.includes(caveSecretRoom)){toast('В этой комнате больше нет добычи.');return;}caveSecretRoomsOpened.push(caveSecretRoom);if(caveSecretRoom===1){changeItem('Кристалл',3);changeItem('Мифрил',2);changeItem('Око архивариуса',1);changeItem('Печать времени',1);changeItem('Клык титана',1);changeItem('Мантия архивариуса',1);changeItem('Диадема эха',1);walletCents+=18000;awardXP(220,'архив древних карт');toast('ТАЙНАЯ БИБЛИОТЕКА: Око архивариуса, Печать времени, Клык титана, Мантия архивариуса, Диадема эха, 180 золота и редкие материалы!');}else{changeItem('Живой корень',3);changeItem('Пыльца древнего леса',3);changeItem('Сердцевина древня',1);changeItem('Сердце корней',1);changeItem('Камень эха',1);changeItem('Сфера жизни',1);changeItem('Доспехи корневого стража',1);changeItem('Корона живого корня',1);walletCents+=25000;awardXP(300,'зал живого корня');toast('ЗАЛ ЖИВОГО КОРНЯ: Сердце корней, Камень эха, Сфера жизни, Доспехи корневого стража, Корона живого корня и 250 золота!');}renderInventory();saveGame();return;}
        toast('Подойди к сундуку или арке выхода.');return;
      }
      if(Math.hypot(player.x-width*.25,player.y-height*.28)<92){if(!caveBossDefeated){toast('Архив запечатан. Сначала победи Каменного стража.');return;}caveSecretRoom=1;player.x=width*.50;player.y=height*.70;player.vx=player.vy=0;toast('Открыта тайная комната: Библиотека древних карт.');return;}
      if(Math.hypot(player.x-width*.48,player.y-height*.78)<92){if(!(inventoryItems.find(i=>i.name==='Печать разведчика')?.count>0)){toast('Корневой зал запечатан. Выполни цепочку разведчика в заброшенном лагере.');return;}caveSecretRoom=2;player.x=width*.50;player.y=height*.70;player.vx=player.vy=0;toast('Открыта тайная комната: Зал живого корня.');return;}
      if(Math.hypot(player.x-width*.73,player.y-height*.48)<95){if(!caveBossDefeated){toast('Сундук запечатан Каменным стражем. Сначала победи босса!');return;}if(!caveChestOpened){
      const claim=await claimCoopChest('cave_chest','cave');
      if(claim.coop&&!claim.claimed){if(!claim.error){caveChestOpened=true;saveGame();}return;}
      caveChestOpened=true;
      const gold=5+Math.floor(Math.random()*11),rewards=[['Кристалл',1],['Железо',2],['Малое зелье',1]];
      rewards.forEach(([n,c])=>{if(n==='Кристалл'?Math.random()<difficultyConfig().chests.crystal:n==='Железо'?Math.random()<.65:Math.random()<.2)changeItem(n,c);});
      walletCents+=gold*100;spawnVisualBurst(player.x,player.y,28,'spark','#ffd86b');renderInventory();
      awardXP(120,'тайная сокровищница');
      toast('Сокровищница открыта: '+gold+' золота и немного редкой добычи!');saveGame();
    }else toast('Сундук пуст.');return;}if(Math.hypot(player.x-width*.16,player.y-height*.8)<125){caveMode=false;player.x=caveReturn.x;player.y=caveReturn.y;player.vx=player.vy=0;toast('Ты вернулся в лесную долину.');saveGame();return;}toast('Подойди к сундуку или входу в пещеру.');return;}
    if(mineMode){const entranceX=1.5*MINE_CELL_SIZE,entranceY=(MINE_MAZE_ROWS-1.5)*MINE_CELL_SIZE,stairsX=(MINE_MAZE_COLS-1.5)*MINE_CELL_SIZE,stairsY=1.5*MINE_CELL_SIZE;if(Math.hypot(minePlayerX-entranceX,minePlayerY-entranceY)<34){
      if(mineDepth>1){
        mineDepth=1;mineMaze=null;generateMineMaze();minePlayerX=entranceX;minePlayerY=entranceY;
        mineCreatures=[];mineRocks=[];generateMineStock(Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));
        toast('Лифт поднял тебя к началу шахты. Нажми E ещё раз, чтобы выйти в обычный мир.');
        saveGame();return;
      }
      mineMode=false;mineMaze=null;toast('Ты вышел из шахты.');saveGame();return;
    }if(Math.hypot(minePlayerX-stairsX,minePlayerY-stairsY)<34){if(mineDepth===8){if(!mineUndercityChestOpened)openMineUndercityChest();else toast('Сокровищница Подземного города уже пуста.');return;}if(mineDepth<8){mineDepth++;mineMaze=null;generateMineStock(Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));minePlayerX=entranceX;minePlayerY=entranceY;toast('Ты спустился на глубину '+mineDepth+'. Новая схема шахты и новые места залежей. Улучшение шахты: '+mineLevel+'/8.');saveGame();}else{toast('Ты достиг восьмой глубины! Здесь спрятана древняя сокровищница.');}return;}toast('Найди лестницу в дальней части лабиринта или вернись ко входу.');return;}
    if(tradeWorldMode){
      const cache=villageCaches.filter(v=>v&&Math.hypot(player.x-v.x,player.y-v.y)<74).sort((a,b)=>Math.hypot(player.x-a.x,player.y-a.y)-Math.hypot(player.x-b.x,player.y-b.y))[0];
      if(cache){if(cache.opened){toast('Тайник этого поселения уже разграблен.');return;}cache.opened=true;walletCents+=12000;changeItem('Мифрил',2);changeItem('Кристалл',3);changeItem('Малое зелье',2);awardXP(95,'тайник деревни');renderInventory();saveGame();spawnVisualBurst(cache.x,cache.y,20,'spark','#ffd77d');toast('ТАЙНИК ПОСЕЛЕНИЯ: 120 золота, мифрил ×2, кристалл ×3 и зелье ×2!');return;}
    }
    if(interactWolfCage())return;
    const quarryBroker=quarryBrokerPosition();if(!tradeWorldMode&&!bossRealmMode&&!inHouse&&!mineMode&&!caveMode&&!dungeonMode&&Math.hypot(player.x-quarryBroker.x,player.y-quarryBroker.y)<104){openNpcQuestDialog({id:'quarry'});return;}if(tryMineWorldRock())return;const nearbyNpc=nearestVillageNpc();if(nearbyNpc){talkToVillageNpc(nearbyNpc);return;}const nearbyCitizen=villageNpcs.filter(n=>n.id==='citizen').sort((a,b)=>Math.hypot(player.x-a.x,player.y-a.y)-Math.hypot(player.x-b.x,player.y-b.y))[0];if(tradeWorldMode&&nearbyCitizen&&Math.hypot(player.x-nearbyCitizen.x,player.y-nearbyCitizen.y)<76){const lines=['Сегодня на рынке много покупателей!','Хорошая погода для прогулки.','Я живу здесь уже много лет.','Будь осторожен ночью, за стенами опасно.','Говорят, в шахте нашли редкую руду.'];toast(nearbyCitizen.name+': «'+lines[Math.abs(Math.floor(nearbyCitizen.phase))%lines.length]+'»');return;}
    // The old starter-base blacksmith, elder and explorer were removed from this world.
    if(wolfCompanionUnlocked&&wolfCompanionHp>0&&Math.hypot(player.x-wolfCompanionX(),player.y-wolfCompanionY())<95){commandDog();return;}
    const nearbyFurnace=placedStructures.find(v=>v.type==='furnace'&&Math.hypot(player.x-v.x,player.y-v.y)<86);if(nearbyFurnace){cookMeatAtFurnace();return;}
    const nearbyStorage=placedStructures.find(v=>v.type==='storage'&&Math.hypot(player.x-v.x,player.y-v.y)<76);if(nearbyStorage){openStorage(nearbyStorage);return;}
    const nearbyFarm=placedStructures.find(v=>v.type==='farmplot'&&Math.hypot(player.x-v.x,player.y-v.y)<76);if(nearbyFarm){interactFarmPlot(nearbyFarm);return;}
    if(tradeWorldMode&&Math.hypot(player.x-(SELL_SHOP.x*TILE+16),player.y-(SELL_SHOP.y*TILE+16))<100){openShop('sell');return;}
    if(tradeWorldMode&&Math.hypot(player.x-(BUY_SHOP.x*TILE+16),player.y-(BUY_SHOP.y*TILE+16))<100){openShop('buy');return;}
    const gate=dungeonGatePosition();if(!tradeWorldMode&&Math.hypot(player.x-gate.x,player.y-gate.y)<112){enterDungeon();return;}
    if(!tradeWorldMode&&Math.hypot(player.x-(74*TILE+16),player.y-(18*TILE+16))<112){caveReturn={x:player.x,y:player.y};caveMode=true;caveSecretRoom=0;player.x=width*.35;player.y=height*.58;player.vx=player.vy=0;caveBossX=width*.72;caveBossY=height*.30;caveBossAttackTimer=difficultyConfig().bossInterval;caveBossFlash=0;toast(caveBossDefeated?'Ты вернулся в исследованную пещеру.':'В пещере Каменный страж! Победи его, чтобы открыть сокровищницу.');return;}
    if(Math.hypot(player.x-(tradeEntranceX*TILE+16),player.y-(tradeEntranceY*TILE+16))<112){transitionTradeWorld();return;}
    if(Math.hypot(player.x-(mineTileX*TILE+16),player.y-(mineTileY*TILE+16))<112){mineMode=true;mineHoverIndex=-1;minePlayerAttackCooldown=0;mineMaze=null;ensureMineMaze();minePlayerX=1.5*MINE_CELL_SIZE;minePlayerY=(MINE_MAZE_ROWS-1.5)*MINE_CELL_SIZE;keys.clear();pressedMovementCodes.clear();toast('Ты вошёл в шахту. Выбери кирку и нажми по залежи левой кнопкой 2 раза.');return;}
    const chest=treasureChests.find(c=>Math.hypot(player.x-c.x,player.y-c.y)<100);if(chest){if(chest.opened)toast('Этот сундук уже открыт.');else openTreasureChest(chest);return;}
    const s=world.signs[0];if(Math.hypot(s.x-player.x,s.y-player.y)<118){openSignDialog();questStage=Math.max(questStage,1);}else toast('Подойди к дорожному знаку или двери дома.');
  }
  function renderInventory(){
    const slots = document.getElementById('inventory-slots');
    if (slots) {
      slots.innerHTML = '';
      inventoryItems.filter(item=>item.count>0).forEach((item, index) => {
        const number = index + 1;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inventory-slot' + (number === selectedSlot ? ' selected' : '');
        button.dataset.slot = String(number);
        button.title = item.name + (item.count ? ' × ' + item.count : ' · нет в инвентаре');
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', number === selectedSlot ? 'true' : 'false');
        button.innerHTML = '<span class="slot-number">' + number + '</span><span class="slot-icon">' + item.icon + '</span><span class="slot-count">' + (item.count > 0 ? item.count : '') + '</span>';
        button.addEventListener('click', () => selectSlot(number));
        slots.appendChild(button);
      });
    }
    const grid = document.getElementById('inventory-grid');
    if (grid) {
      grid.innerHTML = '';
      inventoryItems.filter(item=>item.count>0).forEach((item, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'inventory-card' + (index + 1 === selectedSlot ? ' selected' : '');
        card.innerHTML = '<span class="inventory-card-icon">' + item.icon + '</span><span class="inventory-card-name">' + item.name + '</span><span class="inventory-card-count">Количество: ' + item.count + '</span><span class="inventory-card-description">' + item.description + '</span>';
        card.addEventListener('click', () => selectSlot(index + 1, false));
        grid.appendChild(card);
      });
      const used=inventoryItems.filter(item=>item.count>0).length;for(let empty=used;empty<20;empty++){const slot=document.createElement('div');slot.className='inventory-card inventory-empty-slot';slot.innerHTML='<span class="inventory-card-icon">＋</span><span class="inventory-card-name">Пустой слот</span><span class="inventory-card-count">'+(empty+1)+'/20</span><span class="inventory-card-description">Место для будущего предмета</span>';grid.appendChild(slot);}
    }
    const selected = inventoryItems.filter(item=>item.count>0)[selectedSlot - 1];
    const status = document.getElementById('inventory-selected-note');
    if (status && selected) status.textContent = 'Выбрано: ' + selected.name + (selected.count ? ' · ' + selected.count + ' шт.' : ' · пока нет в инвентаре');
  }
  function selectSlot(number, notify = true){
    const visibleItems=inventoryItems.filter(entry=>entry.count>0);
    if (number < 1 || number > visibleItems.length) return;
    selectedSlot = number;
    renderInventory();
    if (notify) {
      const item = inventoryItems.filter(entry=>entry.count>0)[number - 1];
      if(item)toast('Выбрано: ' + item.name + (item.count > 1 ? ' × ' + item.count : ''));
    }
    saveGame();
  }
  function openTutorial(){const el=document.getElementById('tutorial-shade');if(!el)return;paused=true;keys.clear();pressedMovementCodes.clear();renderTutorialStep();el.hidden=false;el.setAttribute('aria-hidden','false');}
  function renderTutorialStep(){const step=tutorialSteps[Math.min(tutorialStep,tutorialSteps.length-1)];document.getElementById('tutorial-step-title').textContent=step.title;document.getElementById('tutorial-step-key').textContent=step.key;document.getElementById('tutorial-step-text').textContent=step.text;document.getElementById('tutorial-next').textContent=tutorialStep>=tutorialSteps.length-1?'Завершить обучение':'Следующий шаг';}
  function nextTutorialStep(){if(tutorialStep<tutorialSteps.length-1){tutorialStep++;renderTutorialStep();}else closeTutorial();}
  function closeTutorial(){const el=document.getElementById('tutorial-shade');if(!el)return;el.hidden=true;el.setAttribute('aria-hidden','true');localStorage.setItem('skyrealm_tutorial_seen_v1','1');if(!localStorage.getItem('skyrealm_player_class_v1')){openClassSelection(true);return;}paused=false;last=performance.now();canvas.focus();}
  function openClassSelection(firstChoice=false){paused=true;keys.clear();pressedMovementCodes.clear();const shade=document.getElementById('class-select-shade');if(!shade)return;shade.dataset.firstChoice=firstChoice?'1':'0';renderClassSelection();shade.hidden=false;shade.setAttribute('aria-hidden','false');}
  function renderClassSelection(){const list=document.getElementById('class-select-list');if(!list)return;list.innerHTML=Object.entries(PLAYER_CLASSES).map(([id,c])=>'<button type="button" class="class-choice '+(c.locked?'class-locked':'')+'" data-player-class="'+id+'" '+(c.locked?'disabled':'')+'><span class="class-choice-icon">'+c.icon+'</span><span><b>'+c.name+(c.locked?' · '+c.price+' ₽':'')+'</b><small>'+c.desc+'</small></span><span class="class-choice-state">'+(playerClass===id?'Выбран':'Выбрать')+'</span></button>').join('');list.querySelectorAll('[data-player-class]:not(:disabled)').forEach(b=>b.addEventListener('click',()=>choosePlayerClass(b.dataset.playerClass)));}
  function choosePlayerClass(id){if(!PLAYER_CLASSES[id]||PLAYER_CLASSES[id].locked)return;playerClass=id;try{localStorage.setItem('skyrealm_player_class_v1',id);}catch(_){}const shade=document.getElementById('class-select-shade');if(shade){shade.hidden=true;shade.setAttribute('aria-hidden','true');}const skillShade=document.getElementById('skill-tree-shade');if(skillShade&&!skillShade.hidden){setPanelOpen('skill-tree-shade',false);if(skillTreeReturnToPause){paused=true;document.getElementById('pause-shade').hidden=false;}else paused=false;skillTreeReturnToPause=false;}else paused=false;last=performance.now();canvas.focus();saveGame();toast('Выбран класс: '+PLAYER_CLASSES[id].name+'. Бонусы активированы!');}
  function openInventory(){
    tutorialInventorySeen=true;
    inventoryDialogOpen = true;
    keys.clear();pressedMovementCodes.clear();
    renderInventory();
    renderInventoryTab();
    document.getElementById('inventory-shade').hidden = false;
    document.getElementById('inventory-shade').setAttribute('aria-hidden', 'false');
    canvas.blur();
  }
  function renderEquipmentPanel(){const el=document.getElementById('equipment-slots');if(!el)return;const defs=[{id:'weapon',title:'Оружие',allowed:['Деревянный меч','Железный меч','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты','Ледяной посох','Молниеносное копьё','Трезубец прилива','Гарпун бури','Клинок бездны','Клинок живого корня']},{id:'armor',title:'Нагрудник',allowed:['Кожаная броня','Броня стража','Мантия мага','Доспехи древнего корня','Мантия архивариуса','Доспехи корневого стража','Нагрудник Бога']},{id:'helmet',title:'Шлем',allowed:['Шлем лесника','Шлем стража','Корона мага','Диадема эха','Корона живого корня','Шлем Бога']},{id:'leggings',title:'Поножи',allowed:['Поножи Бога']},{id:'boots',title:'Обувь',allowed:['Сапоги странника','Сапоги стража','Сапоги мага','Сапоги Бога']},{id:'amulet',title:'Амулет',allowed:['Амулет стража','Амулет мага','Амулет Бога']},{id:'artifact',title:'Артефакт',allowed:['Око архивариуса','Печать времени','Сердце корней','Камень эха','Клык титана','Сфера жизни']}];el.innerHTML=defs.map(d=>{const options=d.allowed.filter(n=>itemCount(n)>0).map(n=>'<option value="'+n+'" '+(equipment[d.id]===n?'selected':'')+'>'+n+(d.id==='weapon'?' · '+weaponDamage(n)+' урона':'')+'</option>').join('');return '<label class="equipment-slot"><span><b>'+d.title+'</b><small>Сейчас: '+(equipment[d.id]||'Не надето')+'</small></span><select data-equip-slot="'+d.id+'"><option value="">Не надето</option>'+options+'</select></label>';}).join('');el.querySelectorAll('[data-equip-slot]').forEach(sel=>sel.addEventListener('change',()=>{const slot=sel.dataset.equipSlot;equipment[slot]=sel.value;renderEquipmentPanel();renderInventory();saveGame();toast(sel.value?'Надето: '+sel.value:'Слот освобождён.');}));const stats=document.getElementById('equipment-stats');if(stats){const set=armorSetBonuses(),level=artifactEvolutionLevel(),cost=ARTIFACT_EVOLUTION_COSTS[level];stats.textContent='Урон: '+weaponDamage()+' · Улучшение оружия: '+(weaponUpgrades[equipment.weapon]||0)+'/5 · Зачарование: '+(weaponEnchantments[equipment.weapon]||'нет')+' · Снижение урона: '+Math.round(armorReduction()*100)+'% · Комплект: '+set.name+(set.god?' (+25% урона, +18% защиты)':set.guardian?' (+10% урона, +10% защиты)':set.mage?' (+20% урона посоха, +6% защиты)':set.archive?' (+14% урона, +9% защиты)':set.root?' (+17% урона, +13% защиты, усиленное лечение)':set.echo?' (+12% урона, +11% защиты)':' · собери части')+' · Артефакт: '+(equipment.artifact||'не надет')+' · эволюция '+level+'/3 · Осколки: '+itemCount('Осколок пробуждения')+' · Эссенции: '+itemCount('Эссенция глубин')+' · Дальность атаки: '+weaponRange()+' пикс.';let upgrade=document.getElementById('artifact-upgrade-button');if(!upgrade){upgrade=document.createElement('button');upgrade.id='artifact-upgrade-button';upgrade.type='button';upgrade.className='action secondary';stats.insertAdjacentElement('afterend',upgrade);}upgrade.textContent=!equipment.artifact?'Надень артефакт для эволюции':level>=3?'✦ Максимальная эволюция достигнута':'✦ Пробудить артефакт · '+cost.shards+' осколка + '+cost.essence+' эссенции';upgrade.disabled=!equipment.artifact||level>=3||itemCount('Осколок пробуждения')<cost.shards||itemCount('Эссенция глубин')<cost.essence;upgrade.onclick=upgradeEquippedArtifact;}}
  function renderInventoryTab(){const items=document.getElementById('inventory-content-items'),quests=document.getElementById('inventory-content-quests'),toggle=document.getElementById('inventory-quest-toggle');if(items)items.hidden=inventoryTab!=='items';const equip=document.getElementById('inventory-content-equipment');if(equip)equip.hidden=inventoryTab!=='equipment';if(quests)quests.hidden=inventoryTab!=='quests'||!questPanelVisible;if(toggle){toggle.textContent=questPanelVisible?'Скрыть задания':'Показать задания';toggle.setAttribute('aria-pressed',questPanelVisible?'true':'false');}const q=document.getElementById('inventory-quest-list');if(q){const labels=['Прочитай дорожный знак','Войди в дом и осмотри его','Сруби дерево топором: 5 ударов','Подойди к верстаку','Поспи вечером на кровати','Победи монстра','Убей овцу и получи мясо','Исследуй 10% карты','Найди берег озера','Переживи первую ночь'];const story=labels.map((label,i)=>'<div class="inventory-quest-row '+(questStage>i?'done':'')+'"><span>'+(questStage>i?'✓':'○')+'</span><span>'+label+'</span></div>').join('');const npcTasks=Object.entries(NPC_QUESTS).map(([id,v])=>{const st=npcQuestStatus(id),status=st.status===2?'Выполнено сегодня':st.status===1?'Выполняется':'Не принято';return '<div class="inventory-quest-row '+(st.status===2?'done':'')+'"><span>'+(st.status===2?'✓':st.status===1?'◉':'○')+'</span><span>'+NPC_NAMES[id]+' · '+v.title+' — '+status+'<small>'+v.desc+'</small></span></div>';}).join('');
const extra=adventureQuestDefs.map(v=>{const n=adventureQuestProgress[v.id]||0,ready=n>=v.target;return '<div class="adventure-quest-card '+(ready?'done':'')+'"><div><b>'+v.title+'</b><small>'+v.desc+' · '+Math.min(n,v.target)+'/'+v.target+'</small></div><button type="button" class="action" data-claim-quest="'+v.id+'" '+(!ready?'disabled':'')+'>Награда</button></div>';}).join('');q.innerHTML='<h3 class="quest-subheading">Основные задания</h3>'+story+'<h3 class="quest-subheading">Поручения жителей · репутация '+villageReputation+'</h3>'+npcTasks+'<h3 class="quest-subheading">Поручения приключенца</h3>'+extra;q.querySelectorAll('[data-claim-quest]').forEach(b=>b.addEventListener('click',()=>claimAdventureQuest(b.dataset.claimQuest)));}renderEquipmentPanel();}
  function closeInventory(){
    inventoryDialogOpen = false;
    document.getElementById('inventory-shade').hidden = true;
    document.getElementById('inventory-shade').setAttribute('aria-hidden', 'true');
    canvas.focus();
  }
  async function saveGameScreenshot(){
    try{
      if(!canvas||typeof canvas.toDataURL!=='function')throw new Error('Игровой экран недоступен.');
      const api=window.pywebview?.api;
      if(typeof api?.save_screenshot!=='function')throw new Error('Сохранение скриншотов доступно в Windows-версии игры.');
      const result=await api.save_screenshot(canvas.toDataURL('image/png'));
      if(!result?.ok)throw new Error(result?.message||'Не удалось сохранить скриншот.');
      toast('Скриншот сохранён: '+result.name);
    }catch(error){toast(error?.message||'Не удалось сделать скриншот.');}
  }
  function gameKey(e){
    const keyByAction={up:'w',left:'a',down:'s',right:'d',interact:'e',inventory:'i',map:'l',attack:' ',dodge:'q',ability:'r',heal:'h',buff:'j'};
    const bindings=gameSettings.keyBindings||DEFAULT_GAME_KEY_BINDINGS;
    for(const [action,code] of Object.entries(bindings)){if(code===e.code&&keyByAction[action])return keyByAction[action];}
    const byCode = {
      KeyA:'a', KeyB:'b', KeyC:'c', KeyD:'d', KeyE:'e', KeyF:'f', KeyG:'g', KeyH:'h',
      KeyI:'i', KeyJ:'j', KeyK:'k', KeyL:'l', KeyM:'m', KeyN:'n', KeyO:'o', KeyP:'p',
      KeyQ:'q', KeyR:'r', KeyS:'s', KeyT:'t', KeyU:'u', KeyV:'v', KeyW:'w', KeyX:'x', KeyY:'y', KeyZ:'z',
      ArrowUp:'arrowup', ArrowDown:'arrowdown', ArrowLeft:'arrowleft', ArrowRight:'arrowright',
      Digit1:'1', Digit2:'2', Digit3:'3', Digit4:'4',
      Numpad1:'1', Numpad2:'2', Numpad3:'3', Numpad4:'4',
      Escape:'escape', Space:' '
    };
    if (byCode[e.code]) return byCode[e.code];
    const key = String(e.key || '').toLowerCase();
    const russianLayout = {'ц':'w','ф':'a','ы':'s','в':'d','у':'e','ш':'i'};
    return russianLayout[key] || key;
  }
  // Top-level frame guard: an exception in simulation/update code must not stop RAF forever.
  // The previous guard covered draw() only, so an error earlier in tick could leave the canvas black.

  let coopPositionSendTimer=0,coopClockSendTimer=0,coopSnapshotTimer=0,coopSnapshotSyncPending=false,coopSnapshotRoomId='',lastAppliedCoopSnapshotVersion=0,lastCoopSnapshotSignature='',coopAutoResumePromise=null;
  let coopWorldActionPollTimer=0,coopWorldActionSyncPending=false,coopGuestReceiptTimer=0,coopGuestReceiptSyncPending=false;
  function applyCoopSnapshot(snapshot){
    const network=window.SkyRealmCoopClient;
    if(!snapshot||!network?.getRoomState?.()||!currentWorldId||!saveKey.startsWith('skyrealm_coop_save_v1_'))return false;
    const version=Number(snapshot.version)||0;
    if(version<=lastAppliedCoopSnapshotVersion||!snapshot.payload||typeof snapshot.payload!=='object')return false;
    const core=window.SkyRealmMultiplayerCore;
    const shared=core?.sanitizeSharedWorldSnapshot?.(snapshot.payload);
    if(!shared||!Object.keys(shared).length)return false;
    let previousSave=null,wroteSnapshot=false;
    try{
      if(!saveGame())return false;
      previousSave=localStorage.getItem(saveKey);
      const current=JSON.parse(previousSave||'null');
      if(!current||typeof current!=='object')return false;
      const personalDrops=Array.isArray(current.lootDrops)?current.lootDrops.filter(d=>d&&d.shared!==true):[];
      const merged={...current,...shared};
      merged.lootDrops=[...personalDrops,...(Array.isArray(shared.lootDrops)?shared.lootDrops:[])];
      localStorage.setItem(saveKey,JSON.stringify(merged));
      wroteSnapshot=true;
      if(loadGame()!==true)throw new Error('The co-op snapshot was saved but the game state could not be restored.');
      renderInventory();drawMinimap();updateVitals();updateWalletHud();
      // A version is acknowledged only after persistence and every restore step succeeded.
      lastAppliedCoopSnapshotVersion=version;
      lastCoopSnapshotSignature=JSON.stringify(shared);
      return true;
    }catch(error){
      if(wroteSnapshot){
        try{
          if(previousSave===null)localStorage.removeItem(saveKey);
          else localStorage.setItem(saveKey,previousSave);
          if(loadGame()!==true)throw new Error('The previous local save could not be restored.');
          renderInventory();drawMinimap();updateVitals();updateWalletHud();
        }catch(rollbackError){console.warn('[SkyRealm co-op snapshot rollback]',rollbackError);}
      }
      console.warn('[SkyRealm co-op snapshot apply]',error);
      return false;
    }
  }
  async function syncCoopWorldSnapshot(){
    const network=window.SkyRealmCoopClient;
    const state=network?.getRoomState?.();
    if(!state||state.status!=='running'||!currentWorldId||!saveKey.startsWith('skyrealm_coop_save_v1_'))return;
    if(coopSnapshotRoomId!==state.id){coopSnapshotRoomId=state.id;lastAppliedCoopSnapshotVersion=0;lastCoopSnapshotSignature='';}
    if(coopSnapshotSyncPending)return;
    coopSnapshotSyncPending=true;
    try{
      const snapshot=await network.getWorldSnapshot();
      if(coopSnapshotRoomId!==state.id)return;
      if(snapshot&&Number(snapshot.version)>lastAppliedCoopSnapshotVersion){
        const applied=applyCoopSnapshot(snapshot);
        if(!applied&&!network.isRoomOwner)throw new Error('Не удалось применить обновление общего мира; повторю синхронизацию.');
      }
      if(network.isRoomOwner){
        if(!saveGame())return;
        let localSave=null;
        try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
        const payload=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
        if(payload&&Object.keys(payload).length){
          const signature=JSON.stringify(payload);
          if(signature!==lastCoopSnapshotSignature){
            const saved=await network.saveWorldSnapshot(payload);
            if(saved){
              lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(saved.version)||0);
              lastCoopSnapshotSignature=signature;
            }
          }
        }
      }
    }catch(error){console.warn('[SkyRealm co-op snapshot]',error);}
    finally{coopSnapshotSyncPending=false;}
  }
  function rollbackCoopEnemyAction(serialized,reason){
    if(typeof serialized!=='string'||!serialized)return false;
    try{
      localStorage.setItem(saveKey,serialized);
      loadGame();renderInventory();drawMinimap();updateVitals();updateWalletHud();
      lastCoopSnapshotSignature='';
      return true;
    }catch(error){console.warn('[SkyRealm co-op action rollback]',reason,error);return false;}
  }
  async function processOwnerCoopEnemyAction(action,network){
    const payload=action?.payload||{},state=network?.getRoomState?.();
    if(!network?.isRoomOwner||!state||state.status!=='running')return false;
    const actor=(network.getRemotePlayers?.()||[]).find(other=>other.user_id===action.actor_id);
    const age=Date.now()-Date.parse(action.created_at||'');
    if(!actor||Date.now()-(actor.received_at||0)>1800){
      if(Number.isFinite(age)&&age>10000)try{await network.rejectWorldAction(action.action_id,'player_position_timeout');}catch(_){}
      return true;
    }
    if(actor.difficulty!==currentDifficulty){try{await network.rejectWorldAction(action.action_id,'difficulty_mismatch');}catch(_){}return true;}
    if(action.action_type==='pickup_loot'){
      const drop=lootDrops.find(v=>v&&v.shared===true&&v.id===payload.loot_id);
      if(!drop||actor.world_mode!==drop.world_mode||Math.hypot(Number(actor.x)-Number(drop.x),Number(actor.y)-Number(drop.y))>48){
        try{await network.rejectWorldAction(action.action_id,'loot_target_invalid');}catch(_){}return true;
      }
      saveGame();
      const rollbackSave=localStorage.getItem(saveKey)||'';
      const index=lootDrops.indexOf(drop);
      lootDrops.splice(index,1);
      if(!saveGame()){lootDrops.splice(Math.max(0,index),0,drop);try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}return true;}
      let localSave=null;try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
      const safe=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
      if(!safe){lootDrops.splice(Math.max(0,index),0,drop);saveGame();try{await network.rejectWorldAction(action.action_id,'snapshot_invalid');}catch(_){}return true;}
      try{
        const result=await network.commitEnemyAction(action.action_id,safe,{reward_name:drop.name,reward_amount:drop.count});
        if(!result||result.status!=='applied')throw new Error('loot pickup commit failed');
        lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(result.version)||0);
        lastCoopSnapshotSignature=JSON.stringify(safe);
        toast('Игрок забрал '+drop.name+' ×'+drop.count+'. Предмет начислен только ему.');
      }catch(error){
        console.warn('[SkyRealm shared loot commit]',error);
        if(!rollbackCoopEnemyAction(rollbackSave,'loot_commit_failed')){
          if(!lootDrops.some(v=>v?.id===drop.id))lootDrops.splice(Math.max(0,index),0,drop);
          saveGame();
        }
        try{await network.rejectWorldAction(action.action_id,'loot_commit_failed');}catch(_){}
      }
      return true;
    }
    if(action.action_type!=='damage_enemy')return false;
    const kind=payload.target_kind,id=payload.target_id,weapon=payload.weapon;
    const damage=Math.max(1,Math.min(500,Math.floor(Number(payload.damage)||0)));
    const reach=weapon==='Ледяной посох'?250:weapon==='Молниеносное копьё'?150:110;
    let target=null,targetX=0,targetY=0,onDefeat=()=>{},validMode='';
    if(kind==='monster'&&actor.world_mode==='surface'){
      target=monsters.find(m=>m.id===id&&!m.exploding&&m.hp>0)||null;
      if(target){targetX=target.x;targetY=target.y;validMode='surface';}
    }else if(kind==='biome_boss'&&actor.world_mode==='surface'){
      const def=biomeBossDefs().find(v=>v.id===id),boss=def?biomeBosses[def.id]:null;
      if(def&&boss?.active&&!boss.defeated&&boss.hp>0){target=boss;targetX=def.x;targetY=def.y;validMode='surface';onDefeat=()=>defeatBiomeBoss(def,boss);}
    }else if(kind==='wolf_boss'&&id==='wolf'&&actor.world_mode==='surface'&&wolfBossActive&&wolfBossHp>0){
      target={get hp(){return wolfBossHp;},set hp(v){wolfBossHp=v;}};targetX=wolfBossX;targetY=wolfBossY;validMode='surface';onDefeat=()=>defeatWolfBoss();
    }else if(kind==='cave_boss'&&id==='stone'&&actor.world_mode==='cave'&&!caveBossDefeated&&caveBossHp>0){
      target={get hp(){return caveBossHp;},set hp(v){caveBossHp=v;}};targetX=caveBossX;targetY=caveBossY;validMode='cave';onDefeat=()=>defeatCaveBoss();
    }else if(kind==='dungeon_boss'&&id==='room-'+String(dungeonRoom)&&actor.world_mode==='dungeon'&&!dungeonRoomCleared()){
      if(!Number.isFinite(dungeonEnemyX)||dungeonEnemyX<=0)dungeonEnemyX=width*.65;
      if(!Number.isFinite(dungeonEnemyY)||dungeonEnemyY<=0)dungeonEnemyY=height*.47;
      if(dungeonEnemyHp>0){target={get hp(){return dungeonEnemyHp;},set hp(v){dungeonEnemyHp=v;}};targetX=dungeonEnemyX;targetY=dungeonEnemyY;validMode='dungeon';}
    }
    if(!target||validMode!==actor.world_mode||!Number.isFinite(targetX)||!Number.isFinite(targetY)||
       Math.hypot(targetX-Number(actor.x),targetY-Number(actor.y))>reach){
      try{await network.rejectWorldAction(action.action_id,'enemy_target_invalid');}catch(_){}return true;
    }
    if(!saveGame()){try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}return true;}
    const rollbackSave=localStorage.getItem(saveKey)||'';
    target.hp=Math.max(0,target.hp-damage);
    const reward={};
    if(target.hp<=0){
      if(kind==='monster'){
        const index=monsters.indexOf(target);if(index>=0)monsters.splice(index,1);
        spawnVisualBurst(target.x,target.y,18,'spark',target.type==='skeleton'?'#e5e1d0':'#ff7b9b');
        dropMonsterLoot(target);
        reward.reward_xp=target.type==='brute'?35:target.type==='skeleton'?28:target.type==='wisp'?24:target.type==='bomb'?20:target.type==='ice'?38:target.type==='scorpion'?32:18;
        trackAdventureQuest('hunt',1,!!target.villageRaid);
        questStage=Math.max(questStage,4);
      }else if(onDefeat!==null&&typeof onDefeat==='function'){
        onDefeat();
        reward.reward_xp=kind==='wolf_boss'?180:kind==='biome_boss'?220:kind==='cave_boss'?240:300;
        if(kind==='dungeon_boss'){
          dungeonClearedRooms=Array.from(new Set(dungeonClearedRooms.concat([dungeonRoom])));
          spawnSharedLoot(targetX,targetY,[{name:'Эссенция глубин',count:dungeonRoom===5?4:1},{name:'Золото',count:dungeonRoom===5?150:20}],'dungeon');
        }
      }
    }
    spawnVisualBurst(targetX,targetY,10,'spark','#ffe17b');
    if(!saveGame()){
      rollbackCoopEnemyAction(rollbackSave,'save_failed');
      try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}
      return true;
    }
    let localSave=null;try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
    const safe=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
    if(!safe){
      rollbackCoopEnemyAction(rollbackSave,'snapshot_invalid');
      try{await network.rejectWorldAction(action.action_id,'snapshot_invalid');}catch(_){}
      return true;
    }
    try{
      const committed=await network.commitEnemyAction(action.action_id,safe,reward);
      if(!committed||committed.status!=='applied')throw new Error('enemy action commit failed');
      lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(committed.version)||0);
      lastCoopSnapshotSignature=JSON.stringify(safe);
      toast('Урон по общему врагу подтверждён: '+damage+'. '+(target.hp<=0?'Враг побеждён!':'Осталось '+Math.ceil(target.hp)+' HP.'));
    }catch(error){
      console.warn('[SkyRealm shared enemy commit]',error);
      rollbackCoopEnemyAction(rollbackSave,'enemy_commit_failed');
      try{await network.rejectWorldAction(action.action_id,'enemy_commit_failed');}catch(_){}
    }
    return true;
  }
    async function syncCoopWorldActions(){
    const network=window.SkyRealmCoopClient,state=network?.getRoomState?.();
    if(!network?.isRoomOwner||!state||state.status!=='running'||!currentWorldId||coopWorldActionSyncPending||coopSnapshotSyncPending)return;
    coopWorldActionSyncPending=true;coopSnapshotSyncPending=true;
    try{
      const snapshot=await network.getWorldSnapshot();
      if(snapshot&&Number(snapshot.version)>lastAppliedCoopSnapshotVersion)applyCoopSnapshot(snapshot);
      const actions=await network.getPendingWorldActions(20);
      for(const action of actions){
        if(!action?.action_id)continue;
        const payload=action.payload||{},x=Number(payload.x),y=Number(payload.y);
        if(action.action_type==='damage_enemy'||action.action_type==='pickup_loot'){
          await processOwnerCoopEnemyAction(action,network);
          continue;
        }
        if(action.action_type==='place_structure'){
          const type=payload.type;
          const types=['furnace','house','torch','coal','storage','farmplot'];
          const gx=Math.round((x-16)/TILE)*TILE+16,gy=Math.round((y-16)/TILE)*TILE+16;
          if(!types.includes(type)||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x-gx)>1||Math.abs(y-gy)>1||
             placedStructures.length>=250||!canPlaceAt(x,y,true)){
            try{await network.rejectWorldAction(action.action_id,'placement_invalid');}catch(error){console.warn('[SkyRealm co-op action reject]',error);}
            continue;
          }
          const structure={type,x:gx,y:gy,stage:0,growSeconds:0,contents:{},crop:null,moisture:0,fertilized:false};
          placedStructures.push(structure);
          if(!saveGame()){
            const at=placedStructures.indexOf(structure);if(at>=0)placedStructures.splice(at,1);
            try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}
            continue;
          }
          let localSave=null;try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
          const safe=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
          if(!safe){placedStructures.pop();saveGame();try{await network.rejectWorldAction(action.action_id,'snapshot_invalid');}catch(_){}continue;}
          try{
            const result=await network.commitWorldAction(action.action_id,safe);
            if(!result||result.status!=='applied')throw new Error('Не удалось подтвердить постройку в общей версии мира.');
            lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(result.version)||0);
            lastCoopSnapshotSignature=JSON.stringify(safe);drawMinimap();
            toast('Участник построил объект. Постройка добавлена в общий мир.');
          }catch(error){
            const at=placedStructures.indexOf(structure);if(at>=0)placedStructures.splice(at,1);
            saveGame();console.warn('[SkyRealm co-op action commit]',error);break;
          }
          continue;
        }
        if(action.action_type==='chop_tree'){
          const treeX=Number(payload.x),treeY=Number(payload.y),tool=payload.tool;
          const tree=world.trees.find(item=>Math.abs(Math.round(item.x)-treeX)<=1&&Math.abs(Math.round(item.y)-treeY)<=1);
          const actor=(network.getRemotePlayers?.()||[]).find(other=>other.user_id===action.actor_id);
          const actionAge=Date.now()-Date.parse(action.created_at||'');
          if(!actor||Date.now()-(actor.received_at||0)>1800){
            if(Number.isFinite(actionAge)&&actionAge>10000){try{await network.rejectWorldAction(action.action_id,'player_position_timeout');}catch(_){}}
            continue;
          }
          if(!tree||tool!=='Топор'||actor.world_mode!=='surface'||actor.difficulty!==currentDifficulty||
             Math.hypot(tree.x-Number(actor.x),tree.y-Number(actor.y))>86){
            try{await network.rejectWorldAction(action.action_id,'tree_target_invalid');}catch(_){}continue;
          }
          const beforeChops=Number(tree.chops)||0,previousTreeChops=treeChops.map(v=>({...v})),previousFelledTrees=felledTrees.map(v=>({...v}));
          const previousIndex=world.trees.indexOf(tree);
          tree.chops=beforeChops+1;tree.flash=.18;updateTreeChopRecord(tree);
          const resultPayload={};
          if(tree.chops>=5){
            markTreeFelled(tree);world.trees.splice(previousIndex,1);
            resultPayload.reward_name='Древесина';resultPayload.reward_amount=7;
            resultPayload.bonus_name='Листья';resultPayload.bonus_amount=3;
            resultPayload.extra_name='Палка';resultPayload.extra_amount=1;
          }
          if(!saveGame()){
            tree.chops=beforeChops;treeChops=previousTreeChops;felledTrees=previousFelledTrees;
            if(!world.trees.includes(tree))world.trees.splice(Math.max(0,previousIndex),0,tree);
            try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}continue;
          }
          let localSave=null;try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
          const safe=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
          if(!safe){
            tree.chops=beforeChops;treeChops=previousTreeChops;felledTrees=previousFelledTrees;
            if(!world.trees.includes(tree))world.trees.splice(Math.max(0,previousIndex),0,tree);
            saveGame();try{await network.rejectWorldAction(action.action_id,'snapshot_invalid');}catch(_){}continue;
          }
          try{
            const committed=await network.commitTreeAction(action.action_id,safe,resultPayload);
            if(!committed||committed.status!=='applied')throw new Error('Не удалось сохранить рубку дерева в общем мире.');
            lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(committed.version)||0);
            lastCoopSnapshotSignature=JSON.stringify(safe);
            spawnVisualBurst(tree.x,tree.y-15,7,'leaf','#78c96d');
            toast(tree.chops>=5?'Дерево срублено в общем мире.':'Участник рубит дерево: '+tree.chops+'/5.');
          }catch(error){
            tree.chops=beforeChops;treeChops=previousTreeChops;felledTrees=previousFelledTrees;
            if(!world.trees.includes(tree))world.trees.splice(Math.max(0,previousIndex),0,tree);
            saveGame();console.warn('[SkyRealm co-op tree action commit]',error);break;
          }
          continue;
        }
        if(action.action_type==='mine_rock'){
          const rockIndex=Number(payload.rock_index),tool=payload.tool;
          const target=Number.isSafeInteger(rockIndex)?mineRocks[rockIndex]:null;
          const actor=(network.getRemotePlayers?.()||[]).find(other=>other.user_id===action.actor_id);
          const actionAge=Date.now()-Date.parse(action.created_at||'');
          if(!actor||Date.now()-(actor.received_at||0)>1800){
            if(Number.isFinite(actionAge)&&actionAge>10000){try{await network.rejectWorldAction(action.action_id,'player_position_timeout');}catch(_){}}
            continue;
          }
          const allowedTools=['Кирка','Улучшенная кирка','Кирка мастера'];
          const actorX=Number(actor.x)*width,actorY=Number(actor.y)*height;
          const targetPosition=target?mineRockScreenPosition(target):null;
          if(!target||target.hp<=0||!allowedTools.includes(tool)||actor.world_mode!=='mine'||
             actor.difficulty!==currentDifficulty||!Number.isFinite(actorX)||!Number.isFinite(actorY)||
             Math.hypot(targetPosition.x-actorX,targetPosition.y-actorY)>4*TILE){
            try{await network.rejectWorldAction(action.action_id,'mine_target_invalid');}catch(_){}
            continue;
          }
          const beforeHp=target.hp;
          target.hp=Math.max(0,target.hp-(tool==='Кирка мастера'||tool==='Улучшенная кирка'?2:1));
          const resultPayload={};
          if(target.hp===0){
            const minerSkill=Math.max(0,Math.min(10,Number(payload.miner_skill_level)||0));
            const minerChance=Math.min(.85,minerSkill*.06+(payload.player_class==='miner'?0.2:0)+(isModInstalled('miners_luck')?0.15:0)+communityModBonus('mining')*.015);
            resultPayload.reward_name=target.ore;
            resultPayload.reward_amount=Math.random()<minerChance?2:1;
            if(target.ore!=='Камень'&&target.ore!=='Кристалл'){
              resultPayload.bonus_name='Камень';resultPayload.bonus_amount=1;
            }
          }
          if(!saveGame()){
            target.hp=beforeHp;try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}continue;
          }
          let localSave=null;try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
          const safe=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
          if(!safe){
            target.hp=beforeHp;saveGame();try{await network.rejectWorldAction(action.action_id,'snapshot_invalid');}catch(_){}continue;
          }
          try{
            const committed=await network.commitMineAction(action.action_id,safe,resultPayload);
            if(!committed||committed.status!=='applied')throw new Error('Не удалось сохранить добычу в общей шахте.');
            lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(committed.version)||0);
            lastCoopSnapshotSignature=JSON.stringify(safe);
            spawnVisualBurst(targetPosition.x,targetPosition.y,8,'spark','#9ed9ff');
            toast('Участник добыл залежь в общей шахте.');
          }catch(error){
            target.hp=beforeHp;saveGame();console.warn('[SkyRealm co-op mine action commit]',error);break;
          }
          continue;
        }
        const farmTypes=['farm_plant','farm_water','farm_compost','farm_fertilize','farm_harvest'];
        if(!farmTypes.includes(action.action_type))continue;
        const plot=placedStructures.find(v=>v.type==='farmplot'&&Math.abs(Number(v.x)-x)<=1&&Math.abs(Number(v.y)-y)<=1);
        if(!plot||!Number.isFinite(x)||!Number.isFinite(y)){
          try{await network.rejectWorldAction(action.action_id,'farm_plot_not_found');}catch(_){}
          continue;
        }
        const before={crop:plot.crop,stage:plot.stage,growSeconds:plot.growSeconds,moisture:plot.moisture,fertilized:plot.fertilized};
        const resultPayload={};
        let valid=true;
        if(action.action_type==='farm_plant'){
          const crop=FARM_CROPS.find(v=>v.id===payload.crop_id);
          if(!crop||plot.crop){valid=false;}
          else{
            plot.crop=crop.id;plot.stage=0;plot.growSeconds=0;plot.moisture=0;plot.fertilized=false;
            resultPayload.consumed_item=crop.seed;
          }
        }else if(action.action_type==='farm_water'){
          if(!plot.crop){valid=false;}
          else plot.moisture=Math.min(100,(Number(plot.moisture)||0)+65);
        }else if(action.action_type==='farm_compost'){
          if(!plot.crop){valid=false;}
          else{
            plot.growSeconds=(Number(plot.growSeconds)||0)+(farmCropById(plot.crop)?.growth||70)*.25;
            plot.moisture=Math.max(Number(plot.moisture)||0,25);
            resultPayload.consumed_item='Компост';
          }
        }else if(action.action_type==='farm_fertilize'){
          if(!plot.crop||plot.fertilized){valid=false;}
          else{plot.fertilized=true;resultPayload.consumed_item='Удобрение';}
        }else if(action.action_type==='farm_harvest'){
          const crop=farmCropById(plot.crop);
          if(!crop||Number(plot.stage)<3){valid=false;}
          else{
            const farmerSkill=Math.max(0,Math.min(5,Number(payload.farmer_skill_level)||0));
            const baseAmount=crop.yield+(plot.fertilized?2:0)+(payload.has_sickle===true?1:0)+(Math.random()<.25?1:0);
            const amount=Math.max(1,Math.round(baseAmount*(1+farmerSkill*.08+(payload.player_class==='farmer'?0.2:0))*seasonInfo().harvest));
            resultPayload.reward_name=crop.product;resultPayload.reward_amount=amount;
            plot.stage=0;plot.growSeconds=0;plot.crop=null;plot.moisture=0;plot.fertilized=false;
          }
        }
        if(!valid){
          try{await network.rejectWorldAction(action.action_id,'farm_action_not_available');}catch(_){}
          continue;
        }
        if(!saveGame()){
          Object.assign(plot,before);try{await network.rejectWorldAction(action.action_id,'save_failed');}catch(_){}
          continue;
        }
        let localSave=null;try{localSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch(_){}
        const safe=window.SkyRealmMultiplayerCore?.sanitizeSharedWorldSnapshot?.(localSave);
        if(!safe){
          Object.assign(plot,before);saveGame();
          try{await network.rejectWorldAction(action.action_id,'snapshot_invalid');}catch(_){}
          continue;
        }
        try{
          const committed=await network.commitFarmAction(action.action_id,safe,resultPayload);
          if(!committed||committed.status!=='applied')throw new Error('Не удалось сохранить фермерское действие в общей версии мира.');
          lastAppliedCoopSnapshotVersion=Math.max(lastAppliedCoopSnapshotVersion,Number(committed.version)||0);
          lastCoopSnapshotSignature=JSON.stringify(safe);
          if(action.action_type==='farm_harvest')window.SkyRealmJobs?.record?.('farmer',1);
          const labels={farm_plant:'Участник посадил культуру.',farm_water:'Участник полил грядку.',farm_compost:'Участник добавил компост.',farm_fertilize:'Участник удобрил грядку.',farm_harvest:'Участник собрал урожай.'};
          toast(labels[action.action_type]||'Фермерское действие сохранено.');
        }catch(error){
          Object.assign(plot,before);saveGame();
          console.warn('[SkyRealm co-op farm action commit]',error);break;
        }
      }
    }catch(error){console.warn('[SkyRealm co-op action queue]',error);}
    finally{coopSnapshotSyncPending=false;coopWorldActionSyncPending=false;}
  }
  async function syncCoopGuestActionReceipts(){
    const network=window.SkyRealmCoopClient,state=network?.getRoomState?.();
    if(!network||!state||!currentWorldId||network.isRoomOwner||coopGuestReceiptSyncPending)return;
    const key=saveKey+'_coop_pending_world_actions';let pending=[];
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))pending=value;}catch(_){}
    if(!pending.length)return;
    coopGuestReceiptSyncPending=true;
    try{
      const remaining=[];
      for(const receipt of pending.slice(0,20)){
        try{
          const status=await network.getWorldActionStatus(receipt.action_id);
          if(status?.status==='applied'){
            const rewards=[];
            if(status.result?.reward_name&&Number(status.result.reward_amount)>0)rewards.push({name:status.result.reward_name,amount:Number(status.result.reward_amount)});
            if(status.result?.bonus_name&&Number(status.result.bonus_amount)>0)rewards.push({name:status.result.bonus_name,amount:Number(status.result.bonus_amount)});
            if(status.result?.extra_name&&Number(status.result.extra_amount)>0)rewards.push({name:status.result.extra_name,amount:Number(status.result.extra_amount)});
            const rewardXp=Math.max(0,Math.min(1000,Math.floor(Number(status.result?.reward_xp)||0)));
            if(receipt.action_type==='pickup_loot'||receipt.action_type==='damage_enemy'){
              const appliedKey=saveKey+'_coop_applied_enemy_actions';let applied=[];
              try{const value=JSON.parse(localStorage.getItem(appliedKey)||'[]');if(Array.isArray(value))applied=value;}catch(_){}
              if(!applied.includes(receipt.action_id)){
                applied.push(receipt.action_id);if(applied.length>500)applied=applied.slice(-500);
                try{localStorage.setItem(appliedKey,JSON.stringify(applied));}catch(_){}
                for(const reward of rewards)grantLootToPersonalInventory(reward.name,Math.min(99,Math.floor(reward.amount)));
                if(rewardXp>0)awardXP(rewardXp,receipt.action_type==='pickup_loot'?'общая добыча':'победа над общим врагом');
                if(receipt.action_type==='pickup_loot'&&rewards.length)toast('Ты забрал общую добычу: '+rewards.map(v=>v.name+' ×'+v.amount).join(', ')+'. Она добавлена только в твой инвентарь.');
                else if(rewardXp>0)toast('Участие в победе засчитано: +'+rewardXp+' опыта.');
                saveGame();renderInventory();updateWalletHud();
              }
            }else if(rewards.length){
              for(const reward of rewards)grantLootToPersonalInventory(reward.name,Math.min(99,Math.floor(reward.amount)));
              if(rewardXp>0)awardXP(rewardXp,'общее действие');
              saveGame();renderInventory();updateWalletHud();
              const summary=rewards.map(reward=>reward.name+' ×'+Math.floor(reward.amount)).join(' и ');
              toast((receipt.action_type==='mine_rock'?'Добыча получена: ':'Урожай получен: ')+summary+'.');
            }else if(rewardXp>0){awardXP(rewardXp,'общее действие');saveGame();}
            else toast('Владелец подтвердил действие в общем мире.');
          }else if(status?.status==='rejected'){
            const reserved=receipt.reserved_item||receipt.item_name;
            if(reserved)changeItem(reserved,1);
            saveGame();renderInventory();toast(reserved?'Владелец отклонил действие. Предмет возвращён.':'Действие в общем мире отклонено. Попробуй ещё раз.');
          }else remaining.push(receipt);
        }catch(error){
          if(error?.code==='WORLD_ACTION_NOT_FOUND'){
            const reserved=receipt.reserved_item||receipt.item_name;
            if(reserved)changeItem(reserved,1);
            saveGame();renderInventory();
          }else remaining.push(receipt);
        }
      }
      localStorage.setItem(key,JSON.stringify(remaining));
    }finally{coopGuestReceiptSyncPending=false;}
  }
  function coopLocalWorldMode(){
    return dungeonMode?'dungeon':caveMode?'cave':mineMode?'mine':inHouse?'house':tradeWorldMode?'trade':'surface';
  }
  function updateCoopPosition(dt){
    const network=window.SkyRealmCoopClient;
    if(!network||!currentWorldId||inMainMenu||paused)return;
    const room=network.getRoomState?.();
    const incoming=network.drainPvpHits?.()||[];
    if(room?.status==='running'&&room.pvp_enabled&&incoming.length){
      const now=Date.now(),remotes=network.getRemotePlayers?.()||[];
      for(const hit of incoming){
        const attacker=remotes.find(other=>other.user_id===hit.attacker_user_id);
        if(!attacker||now-(attacker.received_at||0)>1800||attacker.difficulty!==currentDifficulty||
           attacker.world_mode!==coopLocalWorldMode()||
           Math.hypot(attacker.x-player.x,attacker.y-player.y)>Math.max(weaponRange()+48,112))continue;
        if(immortal)continue;
        const damage=Math.max(1,Math.min(80,Math.round(hit.damage)));
        player.hp=Math.max(0,player.hp-damage);updateVitals();
        spawnVisualBurst(player.x,player.y,10,'spark','#ff6d87');
        toast('Игрок '+(attacker.name||'соперник')+' нанёс '+damage+' урона.');
        if(player.hp<=0){respawnPlayerAfterDefeat();break;}
      }
    }
    syncCoopSharedDeath();
    coopWorldActionPollTimer-=dt;
    if(network.isRoomOwner&&coopWorldActionPollTimer<=0){coopWorldActionPollTimer=1.0;syncCoopWorldActions();}
    else if(!network.isRoomOwner){coopGuestReceiptTimer-=dt;if(coopGuestReceiptTimer<=0){coopGuestReceiptTimer=2.0;syncCoopGuestActionReceipts();}}
    coopSnapshotTimer-=dt;
    if(coopSnapshotTimer<=0){coopSnapshotTimer=1;syncCoopWorldSnapshot();}
    if(network.isRoomOwner&&typeof network.setWorldClock==='function'){
      coopClockSendTimer-=dt;
      if(coopClockSendTimer<=0){
        coopClockSendTimer=2;
        network.setWorldClock({minute_total:gameMinuteTotal,survived_nights:survivedNights,blood_moon_active:bloodMoonActive}).catch(()=>{});
      }
    }
    if(typeof network.sendPosition!=='function')return;
    coopPositionSendTimer-=dt;
    if(coopPositionSendTimer>0)return;
    coopPositionSendTimer=.125;
    let name='';
    try{name=localStorage.getItem('skyrealm_login')||'';}catch(_){}
    const localPosition=mineMode?{x:minePlayerX/width,y:(minePlayerY||height-108)/height}:{x:player.x,y:player.y};
    network.sendPosition({
      x:localPosition.x,y:localPosition.y,face:player.face,
      difficulty:currentDifficulty,
      world_mode:coopLocalWorldMode(),
      name:name.slice(0,20),
      appearance:{
        skin:playerAppearance.skin,hair:playerAppearance.hair,
        armor:playerAppearance.armor,accent:playerAppearance.accent
      }
    }).catch(()=>{});
  }
  // Auto frame pacing: estimate the display's actual presentation cadence from RAF timestamps.
  // This follows 60/75/120/144/165/240 Hz displays without hard-coding a monitor list.
  let fpsGateAt=0, refreshSampleAt=0, refreshRateSamples=[], displayRefreshRate=60;
  function sampleDisplayRefreshRate(now){
    if(refreshSampleAt){
      const interval=now-refreshSampleAt;
      // Ignore stalls and implausibly short intervals; keep samples from the compositor's normal cadence.
      if(interval>=3&&interval<=40){
        refreshRateSamples.push(interval);
        if(refreshRateSamples.length>90)refreshRateSamples.shift();
        if(refreshRateSamples.length>=24){
          const sorted=[...refreshRateSamples].sort((a,b)=>a-b);
          const fastest=sorted.slice(0,Math.max(8,Math.ceil(sorted.length*.35)));
          const median=fastest[Math.floor(fastest.length/2)];
          const estimate=Math.max(30,Math.min(360,Math.round(1000/median)));
          if(Math.abs(estimate-displayRefreshRate)>=2)displayRefreshRate=estimate;
        }
      }
    }
    refreshSampleAt=now;
  }
  function tick(now){
    sampleDisplayRefreshRate(now);
    const manualLimit=Number(gameSettings.fpsLimit)||0;
    let fpsLimit=manualLimit>0?Math.min(manualLimit,displayRefreshRate):displayRefreshRate;
    // Static pause screens and hidden windows do not need full-refresh rendering.
    if(document.hidden)fpsLimit=Math.min(fpsLimit,5);
    else if(paused&&currentWorldId&&!inMainMenu)fpsLimit=Math.min(fpsLimit,15);
    if(fpsGateAt&&now-fpsGateAt<(1000/fpsLimit)-0.25){requestAnimationFrame(tick);return;}
    fpsGateAt=now;
    try { tickFrame(now); } catch (error) {
      console.error('SkyRealm frame error:', error);
      try { drawEmergencyWorld(); } catch (renderError) { console.error('SkyRealm emergency render error:', renderError); }
      last = performance.now();
      requestAnimationFrame(tick);
    }
  }
  function tickFrame(now){
    const realDt=Math.min(.04,(now-last)/1000);
    last=now;
    ambientTime=now;
    // The animated main menu is DOM/CSS-driven. Keep its visual scene responsive
    // without simulating an invisible world or redrawing the hidden game canvas.
    if(inMainMenu){requestAnimationFrame(tick);return;}
    // Recover a stale pause flag only when the world is active and every modal is closed.
    // This prevents a hidden entry dialog from leaving the simulation frozen.
    const pauseShade=document.getElementById('pause-shade');
    const hasBlockingShade=Array.from(document.querySelectorAll('.shade')).some(el=>
      !el.hidden && !['pause-shade','main-menu-shade'].includes(el.id));
    const hasBlockingDialog=signDialogOpen||inventoryDialogOpen||workbenchDialogOpen||
      shopDialogOpen||npcQuestDialogOpen||storageDialogOpen||fullMapOpen;
    const seaOverlayOpen=!!window.SkyRealmSea?.isOpen?.();
    if(!inMainMenu&&currentWorldId&&paused&&pauseShade?.hidden===true&&
       !hasBlockingShade&&!hasBlockingDialog&&!document.getElementById('boss-realm-welcome')&&!seaOverlayOpen&&!sleeping&&!hudMoveMode&&!deathScreenOpen){
      paused=false;
      keys.clear();pressedMovementCodes.clear();
      last=now;
    }
    const coopRoomState=window.SkyRealmCoopClient?.getRoomState?.();
    const coopRoomPaused=coopRoomState?.status==='paused';
    // Co-op room pause stops shared actions and the authoritative clock, but it must not freeze local player movement.
    if(paused&&currentWorldId&&!inMainMenu){requestAnimationFrame(tick);return;}
    updateCombatCinematic(realDt);
    const dt=realDt*(combatCinematic?.active?.5:1);
    updateVisualEffects(dt);
    if (!paused && !signDialogOpen && !inventoryDialogOpen && !fullMapOpen && !workbenchDialogOpen) {
      updateMagic(dt);bossRealmInvisibleTimer=Math.max(0,bossRealmInvisibleTimer-dt);bossRealmInvisibilityCooldown=Math.max(0,bossRealmInvisibilityCooldown-dt);bossRealmDamageBoostTimer=Math.max(0,bossRealmDamageBoostTimer-dt);bossRealmAbilityCooldown=Math.max(0,bossRealmAbilityCooldown-dt);bossRealmSprintTimer=Math.max(0,bossRealmSprintTimer-dt);bossRealmSprintCooldown=Math.max(0,bossRealmSprintCooldown-dt);playerAttackCooldown=Math.max(0,playerAttackCooldown-dt);combatAbilityCooldown=Math.max(0,combatAbilityCooldown-dt);dodgeCooldown=Math.max(0,dodgeCooldown-dt);dodgeTimer=Math.max(0,dodgeTimer-dt);
      if(sleeping){sleepSeconds+=dt;if(sleepSeconds>=5){sleeping=false;questStage=Math.max(questStage,4);const oldMinute=minuteOfDay(),oldDay=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY);gameMinuteTotal=(oldMinute<DAWN_MINUTE?oldDay:oldDay+1)*GAME_MINUTES_PER_DAY+DAWN_MINUTE;if(oldMinute>=18*60&&oldMinute<NIGHT_MINUTE)survivedNights++;refreshMineDailyStock();lastDawnMarker=Math.floor((gameMinuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);wasNight=isNightTime();monsters.length=0;player.hp=100;updateVitals();updateClockDisplay(true);toast('Ты проспал 5 секунд. Наступил рассвет!');saveGame();}}
      updateWorldClock(dt);updateNemesisEvents();updateVillageNpcs(dt);updateVillageRaid(dt);strengthPotionTimer=Math.max(0,strengthPotionTimer-dt);wardPotionTimer=Math.max(0,wardPotionTimer-dt);speedPotionTimer=Math.max(0,speedPotionTimer-dt);if(healPotionTimer>0){const healNow=Math.min(healPotionRemaining,12*dt,Math.max(0,100-player.hp));if(healNow>0){player.hp=Math.min(100,player.hp+healNow);healPotionRemaining=Math.max(0,healPotionRemaining-healNow);updateVitals();}healPotionTimer=Math.max(0,healPotionTimer-dt);if(healPotionTimer<=0||healPotionRemaining<=0||player.hp>=100){healPotionTimer=0;healPotionRemaining=0;}}updateQuarrySystem(dt);updateWorldEvents(dt);updateFishing(dt);updateBiomeBosses(dt);updateTreeRegrowth();window.SkyRealmLivingWorld?.update?.(dt);window.SkyRealmForestEcosystem?.update?.(dt);
      if(inHouse && !sleeping && player.hp<100){player.hp=Math.min(100,player.hp+dt*(1+(houseLevel-1)*.65+skillBonus('builder')*.4)*(isModInstalled('architect')?1.5:1)*(isModInstalled('restful_camp')?1.3:1));updateVitals();}
      pickUpLoot(dt);
      updateFarmPlots(dt);
      updateCaveBoss(dt);updateMineCreatures(dt);
      if(!dungeonMode)updateWolfAndDog(dt);
      updateDungeon(dt);
      updateMonsters(dt);
      updateVillageWatchtowers(dt);
      updateSheep(dt);
      skipDayRealSeconds=Math.max(0,skipDayRealSeconds-dt);
      updateSkipDayHud();
      let mx = 0, my = 0;
      if(hudMoveMode){keys.clear();pressedMovementCodes.clear();movementDirections.clear();}
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k)))tutorialMoveSeen=true;
      if(keys.has(' ')||keys.has('l'))tutorialCombatSeen=true;
      if(hudMoveMode){mx=0;my=0;}
      if(sleeping){keys.clear();pressedMovementCodes.clear();movementDirections.clear();}
      const movementHeld=direction=>{
        const configured=gameSettings.keyBindings?.[direction];
        return movementDirections.has(direction)||MOVEMENT_CODE_BY_DIRECTION[direction].some(code=>pressedMovementCodes.has(code))||
          (!!configured&&pressedMovementCodes.has(configured));
      };
      if(movementHeld('up'))my--;
      if(movementHeld('down'))my++;
      if(movementHeld('left'))mx--;
      if(movementHeld('right'))mx++;
      if(dodgeTimer>0){mx=dodgeVX;my=dodgeVY;}
      if (mx && my) { mx *= .7071; my *= .7071; }
      const sprinting=keys.has('shift')&&(mx||my)&&player.stamina>15&&!sleeping&&!mineMode;
      const speed = dodgeTimer>0?500:((sprinting?235:155)*(equipment.boots==='Сапоги странника'?1.16:1)*(classHas('archer')?1.05:1)*(isModInstalled('sky_islands')&&!inHouse&&!mineMode?1.12:1)*(isModInstalled('swift_steps')?1.10:1)*(1+skills.scout*.02+communityModBonus('speed')*.015)*(speedPotionTimer>0?1.25:1)*(bossRealmMode&&bossRealmSprintTimer>0?2.5:1));
      if(sprinting){player.stamina=Math.max(0,player.stamina-dt*17);if(player.stamina<16&&sprintExhaustionToast<=0){toast('Выносливость закончилась. Передышка!');sprintExhaustionToast=5;}}else{player.stamina=Math.min(100,player.stamina+dt*4*(isModInstalled('deep_reserves')?1.3:1));sprintExhaustionToast=Math.max(0,sprintExhaustionToast-dt);}
      player.vx = mx * speed; player.vy = my * speed;
      if(mineMode && (mx||my)){mineMovePlayer(mx,my,speed,dt);player.face=Math.abs(mx)>Math.abs(my)?(mx<0?'left':'right'):(my<0?'up':'down');}
      if(dungeonMode && !sleeping && (mx||my)){player.face=Math.abs(mx)>Math.abs(my)?(mx<0?'left':'right'):(my<0?'up':'down');player.x=Math.max(58,Math.min(width-58,player.x+mx*speed*dt));player.y=Math.max(78,Math.min(height-72,player.y+my*speed*dt));}else if(caveMode && !sleeping && (mx||my)){player.face=Math.abs(mx)>Math.abs(my)?(mx<0?'left':'right'):(my<0?'up':'down');player.x=Math.max(80,Math.min(width-80,player.x+mx*speed*dt));player.y=Math.max(100,Math.min(height-80,player.y+my*speed*dt));} else if (!mineMode && !sleeping && (mx || my)) {
        footstepTimer-=dt;if(footstepTimer<=0){playSound('step');footstepTimer=.34;}
        player.face = Math.abs(mx)>Math.abs(my) ? (mx<0?'left':'right') : (my<0?'up':'down');
        const nx = player.x + player.vx*dt, ny = player.y + player.vy*dt;
        if (!blocked(nx, player.y)) player.x = nx;
        if (!blocked(player.x, ny)) player.y = ny;
        player.stamina = Math.max(35, player.stamina-dt*2.2);
      } else {
        player.vx = player.vy = 0;
        player.stamina = Math.min(100, player.stamina+dt*(keys.has('shift')?2:4)*(isModInstalled('deep_reserves')?1.3:1));
      }
      const d = Math.hypot(world.signs[0].x-player.x, world.signs[0].y-player.y);
      const houseD=Math.hypot(player.x-(36*TILE+40),player.y-(15*TILE+154));
      const mineD=Math.hypot(player.x-(mineTileX*TILE+16),player.y-(mineTileY*TILE+16));
      const hint = document.getElementById('hint');
      const nearbyTradeNpc=nearestVillageNpc(),nearShop=tradeWorldMode&&Math.min(Math.hypot(player.x-(SELL_SHOP.x*TILE+16),player.y-(SELL_SHOP.y*TILE+16)),Math.hypot(player.x-(BUY_SHOP.x*TILE+16),player.y-(BUY_SHOP.y*TILE+16)))<125;if(nearbyTradeNpc){hint.classList.add('show');hint.textContent=NPC_NAMES[nearbyTradeNpc.id]+' · E — задание / T — лавка';}else if(nearShop){hint.classList.add('show');hint.textContent='ЛАВКА · Нажми T, чтобы открыть торговлю';}else if(worldEventCamp&&!caveMode&&!mineMode&&!inHouse&&!tradeWorldMode&&Math.hypot(player.x-worldEventCamp.x,player.y-worldEventCamp.y)<125){hint.classList.add('show');hint.textContent='🏕️ ЗАБРОШЕННЫЙ ЛАГЕРЬ · E — осмотреть';}else if(worldEventTraveler&&!caveMode&&!mineMode&&!inHouse&&!tradeWorldMode&&Math.hypot(player.x-worldEventTraveler.x,player.y-worldEventTraveler.y)<125){hint.classList.add('show');hint.textContent='🧳 ПУТНИК · E — поговорить';}else if(worldEventShrine&&!caveMode&&!mineMode&&!inHouse&&!tradeWorldMode&&Math.hypot(player.x-worldEventShrine.x,player.y-worldEventShrine.y)<125){hint.classList.add('show');hint.textContent='✨ ДРЕВНЕЕ СВЯТИЛИЩЕ · E — получить благословение';}else if(caveMode){hint.classList.add('show');hint.textContent='E · сундук / выйти из пещеры';}else if(mineMode){hint.classList.add('show');const atEntrance=Math.hypot(minePlayerX-1.5*MINE_CELL_SIZE,minePlayerY-(MINE_MAZE_ROWS-1.5)*MINE_CELL_SIZE)<48,atStairs=Math.hypot(minePlayerX-(MINE_MAZE_COLS-1.5)*MINE_CELL_SIZE,minePlayerY-1.5*MINE_CELL_SIZE)<48;hint.textContent=atEntrance?'E · выйти из шахты':atStairs?(mineDepth<8?'E · спуститься на глубину '+(mineDepth+1):'E · сокровищница'):'Найди лестницу · E у входа — выйти';}else if(tradeWorldMode&&Math.hypot(player.x-(SELL_SHOP.x*TILE+16),player.y-(SELL_SHOP.y*TILE+16))<130){hint.classList.add('show');hint.textContent='🟡 ЛАВКА ЛЕСНИКА · E — продать ресурсы';}else if(tradeWorldMode&&Math.hypot(player.x-(BUY_SHOP.x*TILE+16),player.y-(BUY_SHOP.y*TILE+16))<130){hint.classList.add('show');hint.textContent='⛏ ЛАВКА РУДОКОПА · E — купить руду';}else if(inHouse){hint.classList.add('show');hint.textContent='E · взаимодействие | кровать, верстак, дверь';}else if(placedStructures.some(s=>s.type==='house'&&Math.hypot(player.x-s.x,player.y-(s.y+25))<105)){hint.classList.add('show');hint.textContent='🏠 ТВОЙ ДОМ · Нажми E, чтобы войти';}else if(Math.hypot(player.x-(tradeEntranceX*TILE+16),player.y-(tradeEntranceY*TILE+16))<130){hint.classList.add('show');hint.textContent='🌐 МИР ТОРГОВЛИ · Нажми E, чтобы перейти';}else if(Math.hypot(player.x-(74*TILE+16),player.y-(18*TILE+16))<130){hint.classList.add('show');hint.textContent='💎 ТАЙНАЯ ПЕЩЕРА · Нажми E, чтобы войти';}else if(placedStructures.some(v=>v.type==='storage'&&Math.hypot(player.x-v.x,player.y-v.y)<100)){hint.classList.add('show');hint.textContent='📦 СУНДУК · E — открыть хранилище';}else if(placedStructures.some(v=>v.type==='farmplot'&&Math.hypot(player.x-v.x,player.y-v.y)<100)){hint.classList.add('show');hint.textContent='🌱 ГРЯДКА · E — полить / собрать урожай';}else if(treasureChests.some(c=>!c.opened&&Math.hypot(player.x-c.x,player.y-c.y)<100)){hint.classList.add('show');hint.textContent='🎁 СУНДУК · Нажми E, чтобы открыть';}else if(mineD<130){hint.classList.add('show');hint.textContent='⛏ ШАХТА · Нажми E, чтобы войти';}else if (d < 112 && !signDialogOpen) {hint.classList.add('show');hint.textContent=discovered?'Нажми E, чтобы перечитать знак.':'Нажми E, чтобы прочитать знак.';}else if(houseD<125){hint.classList.add('show');hint.textContent='Нажми E, чтобы войти в дом.';}else hint.classList.remove('show');
      if(!caveMode&&!dungeonMode)markExploredAroundPlayer();
      saveTimer += dt;
      if (saveTimer > 4) { saveGame(); saveTimer = 0; }
    } else {
      player.vx = player.vy = 0;
    }
    updateCoopPosition(dt);
    if(!document.hidden){minimapTimer += dt; if (minimapTimer >= .16) { drawMinimap(); minimapTimer = 0; }
      try { draw(dt, now); drawCombatCinematicOverlay(now); } catch (error) { console.error('SkyRealm render error:', error); drawEmergencyWorld(); }
      updateWalletHud();}
    requestAnimationFrame(tick);
  }
  function resetWorldState(){
    closeDeathScreen();combatCinematic=null;combatCinematicImpactFlash=0;combatCameraShake=0;combatUltimateCooldown=0;
    totalGameMinutesPlayed=0;
    bossRealmMode=false;bossReturnWorldId=null;bossReturnX=21*TILE+16;bossReturnY=26*TILE+16;bossRealmState={kills:0,wave:1,elapsed:0,spawnTimer:0,eventTimer:65,eventName:'',eventId:'',eventRemaining:0,introSeen:false,awakenedTrees:0,defeatedBosses:[],defeatedGods:[],dungeonSites:[]};bossRealmInvisibleTimer=0;bossRealmInvisibilityCooldown=0;bossRealmDamageBoostTimer=0;bossRealmAbilityCooldown=0;bossRealmSprintTimer=0;bossRealmSprintCooldown=0;bossRealmHazard=null;bossRealmHazardCooldown=0;bossRealmJournalOpen=false;
    dungeonMode=false;dungeonReturn={x:player.x,y:player.y};dungeonRoom=1;dungeonClearedRooms=[];dungeonEnemyHp=0;dungeonEnemyX=0;dungeonEnemyY=0;dungeonChestOpened=false;dungeonTrapCooldown=0;biomeBosses=makeBiomeBossState();strengthPotionTimer=0;wardPotionTimer=0;speedPotionTimer=0;healPotionTimer=0;healPotionRemaining=0;eventRollTimer=74;meteorShowerTimer=0;meteorPoint=null;worldEventCamp=null;worldEventTraveler=null;worldEventShrine=null;lastWorldMeteorNight=-1;lastWorldHordeNight=-1;lastWorldCampDay=-1;lastWorldTravelerDay=-2;lastWorldShrineDay=-1;
    bloodMoonActive=false;bloodMoonRewardPending=false;lastBloodMoonNight=-1;wolfBossActive=false;wolfBossHp=0;wolfBossKeyDropped=false;wolfCageOpen=false;wolfDogCaged=true;wolfBossX=0;wolfBossY=0;wolfBossFlash=0;wolfBossAttackTimer=1.2;wolfBossDefeated=false;wolfCompanionUnlocked=false;wolfCompanionHp=300;wolfCompanionAttackTimer=.5;wolfCompanionRevivals=0;wolfDogDeathHandled=false;wolfCompanionOffsetX=20;wolfCompanionOffsetY=24;dogBehavior='follow';villageQuestStage=0;blacksmithQuestStage=0;explorerQuestStage=0;npcQuestState={};villageReputation=0;villageRaidActive=false;villageRaidKills=0;villageRaidTimer=0;lastVillageRaidDay=-1;
    player.x=21*TILE;player.y=26*TILE;player.vx=player.vy=0;player.face='down';player.frame=0;player.hp=100;player.stamina=84;
    discovered=false;clearedSnowTiles=new Set();snowShovelHits={};treeChops=[];felledTrees=[];worldEarlyMonsters=false;tradeWorldMode=false;quarryProgress={mined:0,stone:0,rank:1};quarrySystemAccumulator=0;quarryAnchorCache=null;walletCents=0;playerLevel=1;playerXP=0;skillPoints=0;skills={warrior:0,miner:0,scout:0,farmer:0,survivor:0,crafter:0};equipment={weapon:'Деревянный меч',armor:'',helmet:'',leggings:'',boots:'',amulet:''};weaponUpgrades={};weaponEnchantments={};armorUpgrade=0;anvilCrafted=false;waterHelmetLevel=0;seaWorldData=null;adventureQuestProgress={hunt:0,mining:0,harvest:0};farmCrops=[];caveBossDefeated=false;caveBossHp=bossMaxHp();caveBossAttackTimer=2.5;caveMode=false;caveChestOpened=false;caveSecretRoom=0;caveSecretRoomsOpened=[];treasureChests.forEach(c=>c.opened=false);dodgeTimer=0;dodgeCooldown=0;placedStructures=[];villageTowerProjectiles.length=0;lootDrops.length=0;enteredPlacedHouse=null;tradeEntranceX=17;tradeEntranceY=47;mineLevel=1;mineDepth=1;mineUndercityChestOpened=false;villageHouseDamage={};villageCaches=villageCenters.map(v=>({id:v.id,x:v.x*TILE+16,y:v.y*TILE+666,opened:false}));houseLevel=1;furnaceCrafted=false;mineMode=false;mineHoverIndex=-1;workbenchDialogOpen=false;exploredCells=new Set();selectedSlot=1;questStage=0;workbenchUsed=false;sheepSpawnTimer=0;inHouse=false;sleeping=false;sleepSeconds=0;playerAttackCooldown=0;gameMinuteTotal=8*60;survivedNights=0;immortal=false;hunger=100;hungerElapsedMinutes=0;skipDayRealSeconds=300;sheepSpawned=false;sheep.length=0;inventoryItems.forEach(item=>{const base=starterItemCounts.find(v=>v.name===item.name);item.count=base?base.count:0;});
    weatherMode='clear';weatherTimer=75;weatherFlash=0;lastRestoredVillageRaidKey='';lastDawnMarker=Math.floor((gameMinuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);lastClockMinute=-1;wasNight=isNightTime();monsterSpawnTimer=0;damageToastTimer=0;monsters.length=0;
  }
  function updateTreeChopRecord(tree){
    const x=Math.round(tree.x),y=Math.round(tree.y),index=treeChops.findIndex(v=>v.x===x&&v.y===y);
    if(tree.chops>0&&tree.chops<5){
      const value={x,y,chops:Math.max(1,Math.min(4,Math.floor(tree.chops)))};
      if(index>=0)treeChops[index]=value;else treeChops.push(value);
    }else if(index>=0)treeChops.splice(index,1);
  }
  function markTreeFelled(tree){
    const x=Math.round(tree.x),y=Math.round(tree.y);
    if(!felledTrees.some(v=>v.x===x&&v.y===y)){const stump={x,y};if(!isCoopWorldSave()){stump.regrowAt=gameMinuteTotal+(bossRealmMode?5:3)*GAME_MINUTES_PER_DAY;stump.size=Number(tree.size)||1;stump.tint=Number(tree.tint)||0;stump.fruitful=tree.fruitful===true;stump.ancient=tree.ancient===true;}felledTrees.push(stump);}
    const index=treeChops.findIndex(v=>v.x===x&&v.y===y);if(index>=0)treeChops.splice(index,1);
  }
  function saveGame(){
    if(!currentWorldId)return false;
    const serialized=JSON.stringify({bossRealmMode,bossReturnWorldId,bossReturnX,bossReturnY,bossRealmState,artifactProgression,bossRealmCreatures:bossRealmMode?monsters.filter(m=>m.bossRealmCreature&&m.hp>0).map(m=>({...m})):[],seaWorldData,clearedSnowTiles:Array.from(clearedSnowTiles),snowShovelHits,difficulty:currentDifficulty,coopWorldEntry:isCoopWorldSave()?coopWorldEntry:null,x:dungeonMode?dungeonReturn.x:caveMode?caveReturn.x:player.x,y:dungeonMode?dungeonReturn.y:caveMode?caveReturn.y:player.y,bedSpawn,worldEarlyMonsters,mineLevel,mineDepth,mineUndercityChestOpened,houseLevel,dungeonRoom,dungeonClearedRooms,dungeonEnemyHp,dungeonChestOpened,biomeBosses,playerLevel,playerXP,skillPoints,skills,playerClass,equipment,caveBossDefeated,caveBossHp,caveChestOpened,caveSecretRoomsOpened,treasureChests:treasureChests.map(c=>({id:c.id,opened:c.opened})),mineTileX,mineTileY,mineRocks,mineBarrels,mineCreatures,mineFeaturesVersion:1,mineMazeVersion:3,quarryProgress,quarryRocks:world.rocks.map(r=>({x:r.x,y:r.y,hp:r.hp,maxHp:r.maxHp,ore:r.ore,quality:r.quality,regrowAt:r.regrowAt})),adventureQuestProgress:{...adventureQuestProgress,treeChops,felledTrees,coopMonsters:isCoopWorldSave()?monsters.map(m=>({id:m.id,type:m.type,x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp,speed:m.speed,damageScale:m.damageScale,attackCooldown:m.attackCooldown,specialCooldown:m.specialCooldown,phase:m.phase,fuseStarted:m.fuseStarted,fuseTime:m.fuseTime,exploding:m.exploding,explosionTimer:m.explosionTimer})):[]},nemesisEvents,lastNemesisRaidDay,tradeWorldMode,tradeEntranceX,tradeEntranceY,walletCents,furnaceCrafted,placedStructures:placedStructures.map(v=>({...v,contents:{...(v.contents||{})}})),villageHouseDamage,villageCaches:villageCaches.map(v=>({...v})),lootDrops:lootDrops.map(d=>({...d})),farmCrops,playerAppearance,discovered,exploredCells:Array.from(exploredCells),selectedSlot,gameMinuteTotal,totalGameMinutesPlayed,survivedNights,hp:player.hp,stamina:player.stamina,hunger,hungerElapsedMinutes,skipDayRealSeconds,sheepSpawned,sheepSpawnTimer,questStage,workbenchUsed,sheep: sheep.map(a=>({...a})),resources:inventoryItems.map(i=>({name:i.name,count:i.count})),weaponUpgrades,armorUpgrade,anvilCrafted,weaponEnchantments,waterHelmetLevel,immortal,bloodMoonActive,bloodMoonRewardPending,lastBloodMoonNight,wolfBossActive,wolfBossHp,wolfBossX,wolfBossY,wolfBossKeyDropped,wolfCageOpen,wolfDogCaged,wolfBossDefeated,wolfCompanionUnlocked,wolfCompanionHp,wolfCompanionRevivals,wolfCompanionOffsetX,wolfCompanionOffsetY,dogBehavior,villageQuestStage,blacksmithQuestStage,explorerQuestStage,npcQuestState,villageReputation,lastVillageRaidDay,villageRaidActive,villageRaidKills,villageRaidTimer,weatherMode,weatherTimer,fishCaught,meteorPoint:meteorPoint?{x:meteorPoint.x,y:meteorPoint.y}:null,meteorShowerTimer,worldEventCamp:worldEventCamp?{...worldEventCamp}:null,worldEventTraveler:worldEventTraveler?{...worldEventTraveler}:null,worldEventShrine:worldEventShrine?{...worldEventShrine}:null,lastWorldShrineDay,lastWorldMeteorNight,lastWorldHordeNight,lastWorldCampDay,lastWorldTravelerDay,worldEventEnemies:!isCoopWorldSave()?monsters.filter(m=>m&&m.hp>0&&!m.bossRealmCreature&&(typeof m.expansionEventId==='string'&&m.expansionEventId||m.villageRaid===true)).slice(0,12).map(m=>({...m})):[],expansionSystems:window.SkyRealmExpansionSystems?.exportState?.()||null});
    try{
      localStorage.setItem(saveKey,serialized);
    }catch(error){
      console.error('SkyRealm save failed:',error);
      if(!saveErrorNotified){toast('Не удалось сохранить мир: хранилище закончилось или недоступно. Экспортируй копию мира из меню.');saveErrorNotified=true;}
      const status=document.getElementById('save-status');if(status)status.textContent='Ошибка сохранения · сделай резервную копию';
      return false;
    }
    try{
      const worlds=readWorlds();const worldRecord=worlds.find(w=>w.id===currentWorldId);
      if(worldRecord){worldRecord.updatedAt=Date.now();writeWorlds(worlds);}
    }catch(metadataError){console.warn('SkyRealm save metadata could not be updated:',metadataError);}
    saveErrorNotified=false;lastSaveAt=Date.now();syncProfileStats(false);evaluateAchievements(false);
    const status=document.getElementById('save-status');
    if(status){const d=new Date(lastSaveAt);status.textContent='Последнее сохранение: '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
    return true;
  }
  function loadGame(){
    artifactProgression={levels:{},awakeningCooldownUntil:0,wardUntil:0,berserkUntil:0};
    monsters.length=0;coopGuestMobAttackCooldowns.clear();
    let loadedSuccessfully=true;
    try{
      const d=JSON.parse(localStorage.getItem(saveKey)||'null');
      window.SkyRealmExpansionSystems?.importState?.(d?.expansionSystems||null);
      if(Array.isArray(d?.worldEventEnemies)){
        for(const raw of d.worldEventEnemies.slice(0,12)){
          if(!raw||typeof raw!=='object'||!Number.isFinite(raw.x)||!Number.isFinite(raw.y))continue;
          const eventId=typeof raw.expansionEventId==='string'?raw.expansionEventId.slice(0,160):'';
          const villageRaid=raw.villageRaid===true;
          if(!eventId&&!villageRaid)continue;
          const type=String(raw.type||'');
          if(!['shadow','wisp','scorpion','skeleton','brute','ice','ember','yeti'].includes(type))continue;
          const maxHp=Math.max(1,Math.min(10000000,Math.floor(Number(raw.maxHp)||Number(raw.hp)||100)));
          const hp=Math.max(0,Math.min(maxHp,Math.floor(Number(raw.hp)||0)));
          if(hp<=0)continue;
          const x=Math.max(TILE,Math.min(COLS*TILE-TILE,raw.x)),y=Math.max(TILE,Math.min(ROWS*TILE-TILE,raw.y));
          monsters.push({...raw,id:typeof raw.id==='string'?raw.id.slice(0,100):newCoopEntityId(),type,x,y,hp,maxHp,
            speed:Math.max(0,Math.min(300,Number(raw.speed)||40)),
            damageScale:Math.max(.1,Math.min(10,Number(raw.damageScale)||1)),
            attackCooldown:Math.max(0,Math.min(60,Number(raw.attackCooldown)||0)),
            specialCooldown:Math.max(0,Math.min(60,Number(raw.specialCooldown)||0)),
            phase:Number.isFinite(raw.phase)?raw.phase:0,flash:Math.max(0,Math.min(1,Number(raw.flash)||0)),
            fuseStarted:raw.fuseStarted===true,fuseTime:Math.max(0,Math.min(10,Number(raw.fuseTime)||1.45)),
            exploding:raw.exploding===true,explosionTimer:Math.max(0,Math.min(10,Number(raw.explosionTimer)||0)),
            damageApplied:raw.damageApplied===true,adminSpawned:true,
            expansionEventId:eventId,expansionEventDefeated:raw.expansionEventDefeated===true,
            villageRaid,villageGuardian:raw.villageGuardian===true,villageGuardianAttackTimer:Math.max(0,Math.min(2,Number(raw.villageGuardianAttackTimer)||0)),forestTreant:raw.forestTreant===true,forestMiniBoss:raw.forestMiniBoss===true,
            forestPhase:Math.max(1,Math.min(3,Math.floor(Number(raw.forestPhase)||1))),
            eventBeaconX:Number.isFinite(raw.eventBeaconX)?raw.eventBeaconX:x,
            eventBeaconY:Number.isFinite(raw.eventBeaconY)?raw.eventBeaconY:y,
            territoryX:Number.isFinite(raw.territoryX)?raw.territoryX:x,
            territoryY:Number.isFinite(raw.territoryY)?raw.territoryY:y,
            territoryRadius:Math.max(0,Math.min(2000,Number(raw.territoryRadius)||0)),
            bossTitle:typeof raw.bossTitle==='string'?raw.bossTitle.slice(0,80):''
          });
        }
      }
      if(d&&typeof d==='object'){
        quarryProgress={mined:Math.max(0,Math.min(100000,Math.floor(Number(d.quarryProgress?.mined)||0))),stone:Math.max(0,Math.min(1000000,Math.floor(Number(d.quarryProgress?.stone)||0))),rank:Math.max(1,Math.min(10,Math.floor(Number(d.quarryProgress?.rank)||1)))};
        if(Array.isArray(d.quarryRocks)){const savedQuarry=new Map(d.quarryRocks.slice(0,500).filter(r=>r&&Number.isFinite(r.x)&&Number.isFinite(r.y)).map(r=>[Math.round(r.x)+','+Math.round(r.y),r]));for(const rock of world.rocks){const saved=savedQuarry.get(Math.round(rock.x)+','+Math.round(rock.y));if(!saved)continue;rock.hp=Math.max(0,Math.min(rock.maxHp,Math.floor(Number(saved.hp)||0)));rock.regrowAt=Math.max(0,Math.min(gameMinuteTotal+200000,Number(saved.regrowAt)||0));if(['Камень','Уголь','Железо','Медь','Кристалл'].includes(saved.ore))rock.ore=saved.ore;if(Number.isFinite(saved.quality))rock.quality=Math.max(1,Math.min(3,Math.floor(saved.quality)));}}

        seaWorldData=d.seaWorldData&&typeof d.seaWorldData==='object'?d.seaWorldData:null;
        if(bossRealmMode){const q=d.bossRealmState;if(q&&typeof q==='object')bossRealmState={kills:Math.max(0,Math.min(100000,Math.floor(Number(q.kills)||0))),wave:Math.max(1,Math.min(100,Math.floor(Number(q.wave)||1))),elapsed:Math.max(0,Number(q.elapsed)||0),spawnTimer:Math.max(0,Number(q.spawnTimer)||0),eventTimer:Math.max(0,Number(q.eventTimer)||40),eventName:String(q.eventName||''),eventId:String(q.eventId||''),eventRemaining:Math.max(0,Number(q.eventRemaining)||0),introSeen:!!q.introSeen,awakenedTrees:Math.max(0,Math.min(10000,Math.floor(Number(q.awakenedTrees)||0))),defeatedBosses:Array.isArray(q.defeatedBosses)?q.defeatedBosses.filter(v=>['abyss_king','rift_dragon','ancient_devourer','end_knight','magma_behemoth','frost_empress','void_mirror','worldbreaker_colossus','forest_king'].includes(v)):[],defeatedGods:Array.isArray(q.defeatedGods)?q.defeatedGods.filter(v=>['astral_god','chronos_god'].includes(v)):[],dungeonSites:Array.isArray(q.dungeonSites)?q.dungeonSites.slice(0,4).filter(v=>v&&['forge','glacier','temple','astral'].includes(v.id)&&Number.isFinite(v.x)&&Number.isFinite(v.y)).map(v=>({...v,active:!!v.active,complete:!!v.complete,remaining:Math.max(0,Math.min(3,Number(v.remaining)||0)),rematches:Math.max(0,Math.min(50,Number(v.rematches)||0))})):[]};if(Array.isArray(d.bossRealmCreatures))for(const m of d.bossRealmCreatures.slice(0,18)){if(!m||!BOSS_REALM_CREATURES[m.realmType]||!Number.isFinite(m.x)||!Number.isFinite(m.y)||!Number.isFinite(m.hp))continue;monsters.push({...m,bossRealmCreature:true,hp:Math.max(0,Math.min(10000000,m.hp)),maxHp:Math.max(1,Math.min(10000000,Number(m.maxHp)||1)),x:Math.max(TILE,Math.min(COLS*TILE-TILE,m.x)),y:Math.max(TILE,Math.min(ROWS*TILE-TILE,m.y))});}}
        coopWorldEntry=d.coopWorldEntry&&typeof d.coopWorldEntry==='object'?d.coopWorldEntry:null;
        clearedSnowTiles=new Set(Array.isArray(d.clearedSnowTiles)?d.clearedSnowTiles.filter(k=>/^\d+,\d+$/.test(k)):[]);snowShovelHits=d.snowShovelHits&&typeof d.snowShovelHits==='object'?Object.fromEntries(Object.entries(d.snowShovelHits).filter(([k,v])=>/^\d+,\d+$/.test(k)&&Number.isFinite(v)).map(([k,v])=>[k,Math.max(0,Math.min(2,Math.floor(v)))])):{};
        if(Number.isFinite(d.x)&&Number.isFinite(d.y)){player.x=Math.max(TILE,Math.min(COLS*TILE-TILE,d.x));player.y=Math.max(TILE,Math.min(ROWS*TILE-TILE,d.y));}if(d.bedSpawn&&Number.isFinite(d.bedSpawn.x)&&Number.isFinite(d.bedSpawn.y))bedSpawn={x:Math.max(TILE,Math.min(COLS*TILE-TILE,d.bedSpawn.x)),y:Math.max(TILE,Math.min(ROWS*TILE-TILE,d.bedSpawn.y))};
        discovered=!!d.discovered;worldEarlyMonsters=!!d.worldEarlyMonsters;tradeWorldMode=!!d.tradeWorldMode;
        if(typeof d.playerClass==='string'&&PLAYER_CLASSES[d.playerClass]&&!PLAYER_CLASSES[d.playerClass].locked){playerClass=d.playerClass;try{localStorage.setItem('skyrealm_player_class_v1',playerClass);}catch(_){}}if(Number.isFinite(d.skillPoints))skillPoints=Math.max(0,Math.min(999,Math.floor(d.skillPoints)));if(d.skills&&typeof d.skills==='object')skills=Object.fromEntries(['warrior','miner','scout','farmer','survivor','crafter','guardian','ranger','alchemist','fisherman','builder','beastmaster','fortune'].map(id=>[id,Math.max(0,Math.min(10,Math.floor(Number(d.skills[id])||0)))]));
        if(d.weaponUpgrades&&typeof d.weaponUpgrades==='object')weaponUpgrades=Object.fromEntries(Object.entries(d.weaponUpgrades).filter(([k,v])=>Object.prototype.hasOwnProperty.call(WEAPON_BASE_DAMAGE,k)).map(([k,v])=>[k,Math.max(0,Math.min(5,Number(v)||0))]));if(d.weaponEnchantments&&typeof d.weaponEnchantments==='object')weaponEnchantments=Object.fromEntries(Object.entries(d.weaponEnchantments).filter(([k,v])=>Object.prototype.hasOwnProperty.call(WEAPON_BASE_DAMAGE,k)&&['Рубин','Сапфир','Обсидиан'].includes(v)));if(Number.isFinite(d.waterHelmetLevel))waterHelmetLevel=Math.max(0,Math.min(4,Math.floor(d.waterHelmetLevel)));armorUpgrade=Math.max(0,Math.min(5,Number(d.armorUpgrade)||0));anvilCrafted=!!d.anvilCrafted;if(d.equipment&&typeof d.equipment==='object')equipment={weapon:['Деревянный меч','Железный меч','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты','Ледяной посох','Молниеносное копьё','Трезубец прилива','Гарпун бури','Клинок бездны'].includes(d.equipment.weapon)?d.equipment.weapon:'Деревянный меч',armor:['','Кожаная броня','Броня стража','Мантия мага','Мантия архивариуса','Доспехи корневого стража','Нагрудник Бога'].includes(d.equipment.armor)?d.equipment.armor:'',helmet:['','Шлем лесника','Шлем стража','Корона мага','Диадема эха','Корона живого корня','Шлем Бога'].includes(d.equipment.helmet)?d.equipment.helmet:'',leggings:['','Поножи Бога'].includes(d.equipment.leggings)?d.equipment.leggings:'',boots:['','Сапоги странника','Сапоги стража','Сапоги мага','Сапоги Бога'].includes(d.equipment.boots)?d.equipment.boots:'',amulet:['','Амулет стража','Амулет мага','Амулет Бога'].includes(d.equipment.amulet)?d.equipment.amulet:'',artifact:['','Око архивариуса','Печать времени','Сердце корней','Камень эха','Клык титана','Сфера жизни'].includes(d.equipment.artifact)?d.equipment.artifact:''};artifactProgression=normalizeArtifactProgression(d.artifactProgression);
        dungeonMode=false;dungeonRoom=Math.max(1,Math.min(5,Math.floor(Number(d.dungeonRoom)||1)));dungeonClearedRooms=Array.isArray(d.dungeonClearedRooms)?Array.from(new Set(d.dungeonClearedRooms.filter(n=>Number.isInteger(n)&&n>=1&&n<=5))):[];dungeonChestOpened=d.dungeonChestOpened===true;dungeonEnemyHp=Math.max(0,Math.min(dungeonEnemyMaxHp(dungeonRoom),Number(d.dungeonEnemyHp)||0));biomeBosses=normalizeBiomeBossState(d.biomeBosses);dungeonEnemyX=0;dungeonEnemyY=0;caveBossDefeated=d.caveBossDefeated===true;const savedBossHp=Number(d.caveBossHp);caveBossHp=Math.max(0,Math.min(bossMaxHp(),Number.isFinite(savedBossHp)?savedBossHp:bossMaxHp()));if(caveBossDefeated)caveBossHp=0;
        nemesisEvents=Array.isArray(d.nemesisEvents)?d.nemesisEvents.slice(0,MAX_NEMESIS_EVENTS).filter(e=>e&&typeof e==='object'&&['monster','boss'].includes(e.kind)&&Number.isFinite(e.dueDay)).map(e=>({id:typeof e.id==='string'?e.id:newCoopEntityId(),kind:e.kind,target:String(e.target||'enemy').slice(0,48),name:String(e.name||'Возродившийся враг').slice(0,48),type:['shadow','brute','wisp','skeleton','bomb','ice','scorpion','ember','yeti'].includes(e.type)?e.type:'brute',multiplier:Math.max(1.7,Math.min(8.35,Number(e.multiplier)||1.7)),dueDay:Math.max(0,Math.floor(e.dueDay)),createdDay:Math.max(0,Math.floor(Number(e.createdDay)||0))})):[];lastNemesisRaidDay=Number.isInteger(d.lastNemesisRaidDay)?d.lastNemesisRaidDay:-1;
        if(d.adventureQuestProgress&&typeof d.adventureQuestProgress==='object'){
          treeChops=Array.isArray(d.adventureQuestProgress.treeChops)?d.adventureQuestProgress.treeChops.filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.chops)).slice(0,600).map(v=>({x:Math.round(v.x),y:Math.round(v.y),chops:Math.max(1,Math.min(4,Math.floor(v.chops)))})):[];
          felledTrees=Array.isArray(d.adventureQuestProgress.felledTrees)?d.adventureQuestProgress.felledTrees.filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)).slice(0,2000).map(v=>({x:Math.round(v.x),y:Math.round(v.y),regrowAt:Number.isFinite(v.regrowAt)?Math.max(0,Math.min(1e12,v.regrowAt)):0,size:Number.isFinite(v.size)?Math.max(.8,Math.min(2.5,v.size)):1,tint:Number.isFinite(v.tint)?Math.max(0,Math.min(2,Math.floor(v.tint))):0,fruitful:v.fruitful===true,ancient:v.ancient===true})):[];
          adventureQuestProgress={hunt:Math.max(0,Math.min(5,Number(d.adventureQuestProgress.hunt)||0)),mining:Math.max(0,Math.min(10,Number(d.adventureQuestProgress.mining)||0)),harvest:Math.max(0,Math.min(5,Number(d.adventureQuestProgress.harvest)||0)),treeChops,felledTrees};
          if(isCoopWorldSave()&&Array.isArray(d.adventureQuestProgress.coopMonsters)){
            d.adventureQuestProgress.coopMonsters.slice(0,20).forEach(m=>{
              if(!m||!['shadow','brute','wisp','skeleton','bomb','ice','scorpion','ember','yeti'].includes(m.type)||
                 !Number.isFinite(m.x)||!Number.isFinite(m.y)||!Number.isFinite(m.hp)||!Number.isFinite(m.maxHp)||m.maxHp<=0||m.hp<0||m.hp>m.maxHp)return;
              monsters.push({id:typeof m.id==='string'?m.id:newCoopEntityId(),type:m.type,x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp,
                speed:Math.max(1,Math.min(160,Number(m.speed)||43)),damageScale:Math.max(.1,Math.min(5,Number(m.damageScale)||1)),
                attackCooldown:Math.max(0,Math.min(5,Number(m.attackCooldown)||0)),phase:Number(m.phase)||0,flash:0,
                fuseStarted:m.fuseStarted===true,fuseTime:Math.max(0,Math.min(5,Number(m.fuseTime)||1.45)),
                exploding:m.exploding===true,explosionTimer:Math.max(0,Math.min(2,Number(m.explosionTimer)||0)),damageApplied:false});
            });
          }
        }
        if(Array.isArray(d.farmCrops))farmCrops=d.farmCrops.filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)).slice(0,60).map(v=>({...v,stage:Math.max(0,Math.min(3,Number(v.stage)||0)),growSeconds:Math.max(0,Number(v.growSeconds)||0),crop:FARM_CROPS.some(c=>c.id===v.crop)?v.crop:null,moisture:Math.max(0,Math.min(100,Number(v.moisture)||0)),fertilized:v.fertilized===true}));
        if(d.playerAppearance&&typeof d.playerAppearance==='object')applyAppearanceData(d.playerAppearance);
if(Number.isInteger(d.playerLevel))playerLevel=Math.max(1,Math.min(999,d.playerLevel));if(Number.isFinite(d.playerXP))playerXP=Math.max(0,d.playerXP);caveChestOpened=d.caveChestOpened===true;caveSecretRoomsOpened=Array.isArray(d.caveSecretRoomsOpened)?d.caveSecretRoomsOpened.filter(v=>v===1||v===2):[];caveSecretRoom=0;if(Array.isArray(d.treasureChests))for(const c of treasureChests){const saved=d.treasureChests.find(v=>v&&v.id===c.id);if(saved)c.opened=saved.opened===true;}if(Number.isFinite(d.walletCents))walletCents=Math.max(0,Math.floor(d.walletCents));if(Number.isInteger(d.tradeEntranceX))tradeEntranceX=d.tradeEntranceX;if(Number.isInteger(d.tradeEntranceY))tradeEntranceY=d.tradeEntranceY;mineLevel=Math.max(1,Math.min(8,Number(d.mineLevel)||1));mineDepth=Math.max(1,Math.min(8,Number(d.mineDepth)||1));mineUndercityChestOpened=d.mineUndercityChestOpened===true;mineMaze=null;houseLevel=Math.max(1,Math.min(3,Number(d.houseLevel)||1));// Mine coordinates are deterministic from the world ID; do not restore stale pre-expansion coordinates.if(Array.isArray(d.mineRocks)&&d.mineRocks.length){mineRocks=d.mineRocks.slice(0,60).map(r=>({x:Number(r.x)||100,y:Number(r.y)||100,ore:['Уголь','Железо','Камень','Кристалл','Медь','Олово','Серебро','Золото','Рубин','Сапфир','Обсидиан','Мифрил','Уран','Алмаз'].includes(r.ore)?r.ore:'Камень',hp:Math.max(0,Math.min(2,Number(r.hp)||0)),maxHp:2}));}if(mineRocks.filter(r=>r.ore==='Камень'&&r.hp>0).length<8)generateMineStock(Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));restoreMineFeaturesFromSave(d,Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));
        for(const felled of felledTrees){const idx=world.trees.findIndex(tree=>Math.round(tree.x)===felled.x&&Math.round(tree.y)===felled.y);if(idx>=0)world.trees.splice(idx,1);}
        for(const tree of world.trees){const progress=treeChops.find(v=>v.x===Math.round(tree.x)&&v.y===Math.round(tree.y));if(progress)tree.chops=progress.chops;}
        furnaceCrafted=!!d.furnaceCrafted;villageHouseDamage=d.villageHouseDamage&&typeof d.villageHouseDamage==='object'?Object.fromEntries(Object.entries(d.villageHouseDamage).filter(([k,v])=>/^(forest|snow|desert|volcano|blight):\d+$/.test(k)&&Number.isFinite(v)).map(([k,v])=>[k,Math.max(0,Math.min(160,Number(v)))])):{};if(Array.isArray(d.villageCaches))villageCaches=d.villageCaches.filter(v=>v&&['forest','snow','desert','volcano','blight'].includes(v.id)).map(v=>({id:v.id,x:(villageCenters.find(c=>c.id===v.id)?.x??0)*TILE+16,y:(villageCenters.find(c=>c.id===v.id)?.y??0)*TILE+666,opened:v.opened===true}));else villageCaches=villageCenters.map(v=>({id:v.id,x:v.x*TILE+16,y:v.y*TILE+666,opened:false}));if(Array.isArray(d.placedStructures))placedStructures=d.placedStructures.filter(v=>v&&['furnace','house','torch','coal','storage','farmplot','village-cache','village-watchtower','tech-generator','tech-battery','tech-lamp','tech-turret','tech-drill','tech-shield','tech-wall','tech-guardpost','tech-trap','tech-solar','tech-processor'].includes(v.type)&&Number.isFinite(v.x)&&Number.isFinite(v.y)).slice(0,250).map(v=>({...v,contents:v.type==='storage'&&v.contents&&typeof v.contents==='object'?{...v.contents}:{},stage:Math.max(0,Math.min(3,Number(v.stage)||0)),growSeconds:Math.max(0,Number(v.growSeconds)||0),...(v.type==='village-watchtower'?{watchtowerLevel:Math.max(1,Math.min(3,Math.floor(Number(v.watchtowerLevel)||1))),maxHp:Math.max(1,Math.min(1000,Number(v.maxHp)||360)),hp:Math.max(0,Math.min(1000,Number.isFinite(Number(v.hp))?Number(v.hp):360)),watchtowerCooldown:Math.max(0,Math.min(2,Number(v.watchtowerCooldown)||0)),watchtowerAngle:Number.isFinite(v.watchtowerAngle)?v.watchtowerAngle:-Math.PI/2,watchtowerKills:Math.max(0,Math.floor(Number(v.watchtowerKills)||0))}:{})}));villageTowerProjectiles.length=0;lootDrops.length=0;if(Array.isArray(d.lootDrops))d.lootDrops.slice(0,80).forEach(v=>{if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&inventoryItems.some(i=>i.name===v.name)&&Number.isFinite(v.count))lootDrops.push({id:typeof v.id==='string'?v.id:'',shared:v.shared===true,x:v.x,y:v.y,name:v.name,count:Math.max(1,Math.min(99,Math.floor(v.count))),life:Math.max(0,Math.min(240,Number(v.life)||240)),phase:Number(v.phase)||0,world_mode:['surface','cave','dungeon'].includes(v.world_mode)?v.world_mode:'surface'});});
        exploredCells=new Set(Array.isArray(d.exploredCells)?d.exploredCells.filter(v=>typeof v==='string'&&/^\d+,\d+$/.test(v)):[]);
        selectedSlot=Number.isInteger(d.selectedSlot)&&d.selectedSlot>=1&&d.selectedSlot<=inventoryItems.length?d.selectedSlot:1;
        if(Number.isFinite(d.gameMinuteTotal)&&d.gameMinuteTotal>=0)gameMinuteTotal=d.gameMinuteTotal;
        if(Number.isFinite(d.totalGameMinutesPlayed)&&d.totalGameMinutesPlayed>=0)totalGameMinutesPlayed=d.totalGameMinutesPlayed;
        else totalGameMinutesPlayed=Math.max(0,gameMinuteTotal-8*60);
        if(Number.isInteger(d.survivedNights)&&d.survivedNights>=0)survivedNights=d.survivedNights;
        bossRealmMode=d.bossRealmMode===true;bossReturnWorldId=typeof d.bossReturnWorldId==='string'?d.bossReturnWorldId:null;if(Number.isFinite(d.bossReturnX))bossReturnX=d.bossReturnX;if(Number.isFinite(d.bossReturnY))bossReturnY=d.bossReturnY;
        if(Number.isFinite(d.hp))player.hp=Math.max(1,Math.min(100,d.hp));
        if(Number.isFinite(d.stamina))player.stamina=Math.max(0,Math.min(100,d.stamina));
        if(Number.isFinite(d.hunger))hunger=Math.max(0,Math.min(100,d.hunger));
        if(Number.isFinite(d.hungerElapsedMinutes))hungerElapsedMinutes=Math.max(0,Math.min(10,d.hungerElapsedMinutes));
        if(typeof d.sheepSpawned==='boolean')sheepSpawned=d.sheepSpawned;if(Number.isFinite(d.sheepSpawnTimer))sheepSpawnTimer=Math.max(0,d.sheepSpawnTimer%10);if(Number.isInteger(d.questStage))questStage=Math.max(0,Math.min(9,d.questStage));workbenchUsed=d.workbenchUsed===true;
        if(Array.isArray(d.sheep)){sheep.length=0;d.sheep.slice(0,120).forEach(a=>{if(a&&Number.isFinite(a.x)&&Number.isFinite(a.y))sheep.push({x:a.x,y:a.y,hp:Number(a.hp)||0,phase:Number(a.phase)||0,dir:Number(a.dir)||0,wander:Number(a.wander)||1,alive:a.alive===true});});}
        if(Number.isFinite(d.skipDayRealSeconds))skipDayRealSeconds=Math.max(0,Math.min(300,d.skipDayRealSeconds));
        if(Array.isArray(d.resources))d.resources.forEach(r=>{const item=inventoryItems.find(i=>i.name===r.name);if(item&&Number.isFinite(r.count))item.count=Math.max(0,Math.min(999999,Math.floor(r.count)));});
        if(d.npcQuestState&&typeof d.npcQuestState==='object')npcQuestState=Object.fromEntries(Object.entries(d.npcQuestState).filter(([id,v])=>NPC_QUESTS[id]&&v&&typeof v==='object').map(([id,v])=>[id,{status:Math.max(0,Math.min(2,Number(v.status)||0)),day:Number.isFinite(v.day)?Math.floor(v.day):0}]));
        villageReputation=Math.max(0,Math.min(100,Math.floor(Number(d.villageReputation)||0)));lastVillageRaidDay=Number.isInteger(d.lastVillageRaidDay)?d.lastVillageRaidDay:-1;villageRaidActive=d.villageRaidActive===true&&tradeWorldMode&&isNightTime();villageRaidKills=villageRaidActive?Math.max(0,Math.min(3,Math.floor(Number(d.villageRaidKills)||0))):0;villageRaidTimer=villageRaidActive?Math.max(0,Math.min(95,Number(d.villageRaidTimer)||0)):0;const raidRestoreKey=String(currentWorldId||'')+':'+lastVillageRaidDay+':'+(villageRaidActive?String(villageRaidKills):'inactive');if(raidRestoreKey!==lastRestoredVillageRaidKey){for(let i=monsters.length-1;i>=0;i--)if(monsters[i]&&monsters[i].villageRaid)monsters.splice(i,1);if(villageRaidActive&&villageRaidKills>0){for(let i=0;i<villageRaidKills;i++)if(spawnMonster(i===villageRaidKills-1?'brute':null)){monsters[monsters.length-1].villageRaid=true;monsters[monsters.length-1].adminSpawned=true;}}lastRestoredVillageRaidKey=raidRestoreKey;}
        lastWorldMeteorNight=Number.isInteger(d.lastWorldMeteorNight)?d.lastWorldMeteorNight:-1;
        lastWorldHordeNight=Number.isInteger(d.lastWorldHordeNight)?d.lastWorldHordeNight:-1;
        lastWorldCampDay=Number.isInteger(d.lastWorldCampDay)?d.lastWorldCampDay:-1;
        lastWorldTravelerDay=Number.isInteger(d.lastWorldTravelerDay)?d.lastWorldTravelerDay:-2;fishCaught=Number.isInteger(d.fishCaught)?Math.max(0,Math.min(100000,d.fishCaught)):0;if(['clear','rain','snow','storm'].includes(d.weatherMode))weatherMode=d.weatherMode;if(Number.isFinite(d.weatherTimer))weatherTimer=Math.max(0,Math.min(180,d.weatherTimer));
        meteorPoint=d.meteorPoint&&Number.isFinite(d.meteorPoint.x)&&Number.isFinite(d.meteorPoint.y)?{x:Math.max(TILE*3,Math.min(COLS*TILE-TILE*3,d.meteorPoint.x)),y:Math.max(TILE*3,Math.min(ROWS*TILE-TILE*3,d.meteorPoint.y))}:null;
        meteorShowerTimer=meteorPoint&&Number.isFinite(d.meteorShowerTimer)?Math.max(0,Math.min(WORLD_EVENT_CHANCES.meteorLifetime,d.meteorShowerTimer)):0;
        worldEventCamp=d.worldEventCamp&&Number.isFinite(d.worldEventCamp.x)&&Number.isFinite(d.worldEventCamp.y)?{x:Math.max(TILE*3,Math.min(COLS*TILE-TILE*3,d.worldEventCamp.x)),y:Math.max(TILE*3,Math.min(ROWS*TILE-TILE*3,d.worldEventCamp.y)),life:Math.max(0,Math.min(WORLD_EVENT_CHANCES.campLifetime,Number(d.worldEventCamp.life)||0))}:null;
        worldEventTraveler=d.worldEventTraveler&&Number.isFinite(d.worldEventTraveler.x)&&Number.isFinite(d.worldEventTraveler.y)?{x:Math.max(TILE*3,Math.min(COLS*TILE-TILE*3,d.worldEventTraveler.x)),y:Math.max(TILE*3,Math.min(ROWS*TILE-TILE*3,d.worldEventTraveler.y)),life:Math.max(0,Math.min(WORLD_EVENT_CHANCES.travelerLifetime,Number(d.worldEventTraveler.life)||0))}:null;worldEventShrine=d.worldEventShrine&&Number.isFinite(d.worldEventShrine.x)&&Number.isFinite(d.worldEventShrine.y)?{x:Math.max(TILE*3,Math.min(COLS*TILE-TILE*3,d.worldEventShrine.x)),y:Math.max(TILE*3,Math.min(ROWS*TILE-TILE*3,d.worldEventShrine.y)),life:Math.max(0,Math.min(WORLD_EVENT_CHANCES.shrineLifetime,Number(d.worldEventShrine.life)||0))}:null;lastWorldShrineDay=Number.isInteger(d.lastWorldShrineDay)?d.lastWorldShrineDay:-1;
        immortal=d.immortal===true;bloodMoonActive=d.bloodMoonActive===true;bloodMoonRewardPending=d.bloodMoonRewardPending===true;lastBloodMoonNight=Number.isInteger(d.lastBloodMoonNight)?d.lastBloodMoonNight:-1;wolfBossActive=d.wolfBossActive===true;wolfBossHp=Math.max(0,Number(d.wolfBossHp)||0);wolfBossKeyDropped=d.wolfBossKeyDropped===true;wolfCageOpen=d.wolfCageOpen===true;wolfDogCaged=d.wolfDogCaged!==false;wolfBossX=Number.isFinite(d.wolfBossX)?d.wolfBossX:wolfDenPosition().x;wolfBossY=Number.isFinite(d.wolfBossY)?d.wolfBossY:wolfDenPosition().y;if(wolfBossActive){const bounded=clampWolfBossToForest(wolfBossX,wolfBossY);wolfBossX=bounded.x;wolfBossY=bounded.y;}wolfBossDefeated=d.wolfBossDefeated===true;wolfCompanionUnlocked=d.wolfCompanionUnlocked===true;wolfCompanionHp=Math.max(0,Math.min(300,Number(d.wolfCompanionHp)||300));wolfCompanionRevivals=Math.max(0,Math.min(3,Number(d.wolfCompanionRevivals)||0));wolfCompanionOffsetX=Number.isFinite(d.wolfCompanionOffsetX)?d.wolfCompanionOffsetX:28;wolfCompanionOffsetY=Number.isFinite(d.wolfCompanionOffsetY)?d.wolfCompanionOffsetY:22;dogBehavior=['follow','guard','hunt'].includes(d.dogBehavior)?d.dogBehavior:'follow';villageQuestStage=Math.max(0,Math.min(3,Math.floor(Number(d.villageQuestStage)||0)));blacksmithQuestStage=Math.max(0,Math.min(3,Math.floor(Number(d.blacksmithQuestStage)||0)));explorerQuestStage=Math.max(0,Math.min(3,Math.floor(Number(d.explorerQuestStage)||0)));
      }
    }catch(error){
      loadedSuccessfully=false;
      console.warn('[SkyRealm load failed]',error);
    }
    lastDawnMarker=Math.floor((gameMinuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);
    wasNight=isNightTime();lastClockMinute=-1;updateClockDisplay(true);updateVitals();updateProgressHud();
    return loadedSuccessfully;
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function makeWorldId(){return 'world_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
  function worldSaveKey(id){return 'skyrealm_game_save_v2_'+id;}
  function readWorlds(){
    let worlds=[];
    try{const saved=JSON.parse(localStorage.getItem(WORLD_LIST_KEY)||'[]');if(Array.isArray(saved))worlds=saved.filter(w=>w&&typeof w.id==='string'&&typeof w.name==='string');}catch(_){}
    // Preserve a pre-world-menu save by migrating it to a first world exactly once.
    if(!worlds.length&&localStorage.getItem('skyrealm_legacy_world_migrated')!=='1'){
      try{
        const legacy=localStorage.getItem(LEGACY_SAVE_KEY);
        if(legacy){const old=JSON.parse(legacy);const id=makeWorldId();worlds=[{id,name:'Мой первый мир',createdAt:Date.now(),updatedAt:Date.now()}];localStorage.setItem(worldSaveKey(id),JSON.stringify(old));localStorage.setItem(WORLD_LIST_KEY,JSON.stringify(worlds));}
      }catch(_){}
      try{localStorage.setItem('skyrealm_legacy_world_migrated','1');}catch(_){}
    }
    return worlds;
  }
  function writeWorlds(worlds){localStorage.setItem(WORLD_LIST_KEY,JSON.stringify(worlds));}
  function formatWorldDate(value){try{return new Date(value||Date.now()).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(_){return 'SkyRealm';}}
  const WORLD_FAVORITES_KEY='skyrealm_world_favorites_v1';
  function readFavoriteWorldIds(){try{const value=JSON.parse(localStorage.getItem(WORLD_FAVORITES_KEY)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string'&&id.length<=80):[];}catch(_){return [];}}
  function toggleFavoriteWorld(id){const favorites=new Set(readFavoriteWorldIds());if(favorites.has(id))favorites.delete(id);else favorites.add(id);localStorage.setItem(WORLD_FAVORITES_KEY,JSON.stringify([...favorites]));}
  function renderWorldList(){
    const worlds=readWorlds(),list=document.getElementById('worlds-list'),empty=document.getElementById('worlds-empty');
    document.getElementById('world-count').textContent=worlds.length+' '+(worlds.length===1?'мир':'миров');
    empty.hidden=worlds.length>0;list.innerHTML='';
    const query=String(document.getElementById('world-search')?.value||'').trim().toLocaleLowerCase();
    const sort=document.getElementById('world-sort')?.value||'recent';
    const favorites=readFavoriteWorldIds(),favoriteOnly=document.getElementById('world-filter')?.value==='favorites';
    const visible=worlds.filter(w=>(!favoriteOnly||favorites.includes(w.id))&&(!query||String(w.name||'').toLocaleLowerCase().includes(query)));
    visible.sort((a,b)=>sort==='name'?String(a.name||'').localeCompare(String(b.name||''),'ru'):sort==='oldest'?(a.createdAt||0)-(b.createdAt||0):(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
    if(worlds.length&&visible.length===0)list.innerHTML='<p class="world-filter-empty">'+(favoriteOnly?'В избранном пока нет миров.':'По запросу «'+escapeHtml(query)+'» миры не найдены.')+'</p>';
    visible.forEach(w=>{
      const card=document.createElement('article');card.className='world-card';
      const level=DIFFICULTIES[w.difficulty];let saved=null;try{saved=JSON.parse(localStorage.getItem(worldSaveKey(w.id))||'null');}catch(_){}
      const days=saved&&Number.isFinite(saved.gameMinuteTotal)?Math.floor(Math.max(0,saved.gameMinuteTotal)/1440)+1:1;
      const lvl=saved&&Number.isFinite(saved.playerLevel)?Math.max(1,Math.floor(saved.playerLevel)):1;
      const explored=Array.isArray(saved?.exploredCells)?saved.exploredCells.length:0;
      const total=Math.max(1,(level?.cols||COLS)*(level?.rows||ROWS));
      const percent=Math.min(100,Math.floor(explored/total*100));
      const size=saved?Math.max(1,Math.ceil(JSON.stringify(saved).length/1024)):0;
      const stats=saved?('День '+days+' · Уровень '+lvl+' · Карта '+percent+'% · '+size+' КБ'):'Сохранение ещё не создано';
      const isFavorite=favorites.includes(w.id);
      card.innerHTML='<div class="world-card-art"><span>✦</span></div><div class="world-card-main"><b>'+escapeHtml(w.name)+'</b><small>Сложность: '+escapeHtml(level?level.name:'не выбрана')+' · Последний вход: '+escapeHtml(formatWorldDate(w.updatedAt||w.createdAt))+'</small><small class="world-card-stats">'+stats+'</small></div><div class="world-card-actions"><button class="world-favorite-button" type="button" data-favorite-world="'+escapeHtml(w.id)+'" aria-pressed="'+String(isFavorite)+'" title="Добавить в избранное">'+(isFavorite?'★':'☆')+'</button><button class="world-enter-button" type="button" data-enter-world="'+escapeHtml(w.id)+'">Войти в мир <span>→</span></button><button class="world-rename-button" type="button" data-rename-world="'+escapeHtml(w.id)+'">✎ Имя</button><button class="world-rename-button world-export-button" type="button" data-export-world="'+escapeHtml(w.id)+'" title="Скачать резервную копию">⇩ Копия</button><button class="world-delete-button" type="button" data-delete-world="'+escapeHtml(w.id)+'" aria-label="Удалить мир '+escapeHtml(w.name)+'">✕</button></div>';
      list.appendChild(card);
    });
    list.querySelectorAll('[data-favorite-world]').forEach(btn=>btn.addEventListener('click',()=>{toggleFavoriteWorld(btn.dataset.favoriteWorld);renderWorldList();}));
    list.querySelectorAll('[data-enter-world]').forEach(btn=>btn.addEventListener('click',()=>enterWorld(btn.dataset.enterWorld)));
    list.querySelectorAll('[data-rename-world]').forEach(btn=>btn.addEventListener('click',()=>openRenameWorld(btn.dataset.renameWorld)));
    list.querySelectorAll('[data-export-world]').forEach(btn=>btn.addEventListener('click',()=>downloadWorldBackup(btn.dataset.exportWorld)));
    list.querySelectorAll('[data-delete-world]').forEach(btn=>btn.addEventListener('click',()=>deleteWorld(btn.dataset.deleteWorld)));
    document.getElementById('admin-world-count').textContent=String(worlds.length);
  }
  function downloadWorldBackup(id){
    const record=readWorlds().find(w=>w.id===id);if(!record){toast('Мир не найден. Обнови список миров.');return;}
    if(currentWorldId===id&&!saveGame())return;
    let saved;
    try{saved=JSON.parse(localStorage.getItem(worldSaveKey(id))||'null');}catch(error){toast('Не удалось прочитать сохранение.');return;}
    if(!saved||typeof saved!=='object'||!Number.isFinite(saved.x)||!Number.isFinite(saved.y)){toast('Для этого мира пока нет корректного сохранения.');return;}
    const backup={format:'skyrealm-world-backup',formatVersion:1,exportedAt:new Date().toISOString(),gameVersion:GAME_VERSION,world:{name:record.name,difficulty:record.difficulty||saved.difficulty||'medium',createdAt:record.createdAt||Date.now(),updatedAt:record.updatedAt||Date.now()},save:saved};
    try{
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='SkyRealm-'+String(record.name||'world').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,32)+'-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      toast('Резервная копия мира «'+record.name+'» скачана.');
    }catch(error){console.error('SkyRealm export failed:',error);toast('Не удалось создать резервную копию.');}
  }
  function importWorldBackupFile(file){
    if(!file)return;
    if(file.size>8*1024*1024){toast('Файл слишком большой: максимум 8 МБ.');return;}
    const reader=new FileReader();
    reader.onerror=()=>toast('Не удалось прочитать файл резервной копии.');
    reader.onload=()=>{
      try{
        const backup=JSON.parse(String(reader.result||''));
        if(!backup||backup.format!=='skyrealm-world-backup'||backup.formatVersion!==1)throw new Error('Это не резервная копия SkyRealm поддерживаемого формата.');
        const saved=backup.save;
        if(!saved||typeof saved!=='object'||Array.isArray(saved)||!Number.isFinite(saved.x)||!Number.isFinite(saved.y))throw new Error('В файле нет корректных данных мира.');
        const worlds=readWorlds();if(worlds.length>=50)throw new Error('Достигнут лимит 50 миров. Удали ненужный мир перед импортом.');
        const difficulty=DIFFICULTIES[backup.world?.difficulty]?backup.world.difficulty:(DIFFICULTIES[saved.difficulty]?saved.difficulty:'medium');
        const rawName=backup.world?.name||String(file.name||'').replace(/(?:-backup)?\.json$/i,'');
        const name=String(rawName).trim().replace(/\s+/g,' ').slice(0,32)||'Импортированный мир';
        const id=makeWorldId(),now=Date.now(),record={id,name,difficulty,createdAt:now,updatedAt:now};
        const safeSave={...saved,difficulty};
        localStorage.setItem(worldSaveKey(id),JSON.stringify(safeSave));
        try{writeWorlds([...worlds,record]);}
        catch(error){localStorage.removeItem(worldSaveKey(id));throw error;}
        renderWorldList();toast('Мир «'+name+'» восстановлен из резервной копии.');
      }catch(error){console.error('SkyRealm import failed:',error);toast('Импорт не выполнен: '+(error&&error.message?error.message:'неверный файл'));}
      finally{const input=document.getElementById('import-world-file');if(input)input.value='';}
    };
    reader.readAsText(file);
  }
  function deleteWorld(id){const worlds=readWorlds(),record=worlds.find(w=>w.id===id);if(!record)return;if(!window.confirm('Удалить мир «'+record.name+'» вместе с его сохранением? Это действие нельзя отменить.'))return;try{localStorage.removeItem(worldSaveKey(id));const remaining=worlds.filter(w=>w.id!==id);writeWorlds(remaining);if(currentWorldId===id){currentWorldId=null;currentWorldName='';saveKey=LEGACY_SAVE_KEY;}renderWorldList();toast('Мир удалён. Осталось миров: '+remaining.length+'.');}catch(e){toast('Не удалось удалить мир: '+String(e));}}
  function openWorldCreate(){
    const shade=document.getElementById('world-create-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');
    const input=document.getElementById('world-name-input');input.value='Мой мир';setTimeout(()=>{input.focus();input.select();},30);
  }
  function closeWorldCreate(){const shade=document.getElementById('world-create-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');}
  function createWorld(name){
    const clean=String(name||'').trim().replace(/\s+/g,' ').slice(0,32)||'Мой мир';
    const worlds=readWorlds();if(worlds.length>=50){closeWorldCreate();toast('Достигнут лимит 50 миров. Удали ненужный мир, чтобы создать новый.');return;}
    const record={id:makeWorldId(),name:clean,createdAt:Date.now(),updatedAt:Date.now(),difficulty:null};
    worlds.push(record);writeWorlds(worlds);closeWorldCreate();enterWorld(record.id);
  }
  function openRenameWorld(id){
    const record=readWorlds().find(w=>w.id===id);if(!record)return;
    renameWorldId=id;const input=document.getElementById('world-rename-input');input.value=record.name;
    const shade=document.getElementById('world-rename-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');setTimeout(()=>{input.focus();input.select();},30);
  }
  function closeRenameWorld(){renameWorldId=null;const shade=document.getElementById('world-rename-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');}
  function renameWorld(name){
    if(!renameWorldId)return;const clean=String(name||'').trim().replace(/\s+/g,' ').slice(0,32);if(!clean){toast('Название мира не может быть пустым.');return;}
    const worlds=readWorlds(),record=worlds.find(w=>w.id===renameWorldId);if(record){record.name=clean;record.updatedAt=Date.now();writeWorlds(worlds);if(record.id===currentWorldId){currentWorldName=clean;document.querySelector('.realm-sub').textContent=clean+' · ПЕРВЫЙ РАССВЕТ';}}
    closeRenameWorld();renderWorldList();
  }
  function syncAdminMenu(){
    const admin=currentStaffRole==='admin';
    const moderator=admin||currentStaffRole==='moderator';
    document.getElementById('menu-admin').hidden=!admin;
    document.getElementById('pause-admin-tools').hidden=!admin;
    document.getElementById('menu-moderator').hidden=!moderator;
    document.getElementById('pause-moderator-tools').hidden=!moderator;
    const grants=document.getElementById('menu-privileges');if(grants)grants.hidden=!(publicStaffGrantsEnabled||staffBootstrapAvailable||admin);
  }
  function generateMineStock(dayIndex=0){
    const seed=mineSeed+(dayIndex*7919)+(mineDepth*313)+(mineLevel*104729);ensureMineMaze();
    // Floor depth changes ore locations; ore rarity and volume unlock only through manual mine upgrades.
    const oreTier=Math.max(1,Math.min(8,mineLevel));
    const nodeCount=Math.min(52,24+(Math.max(1,mineLevel)-1)*4);
    mineRocks=Array.from({length:nodeCount},(_,i)=>{
      let ore;const roll=Math.min(.999,hash(i+seed,19)+(isModInstalled('geology_scanner')?.10:0));
      if(i<7)ore='Камень';
      else if(oreTier===1){ore=roll<.30?'Уголь':roll<.62?'Железо':roll<.68?'Кристалл':'Камень';}
      else if(oreTier===2){ore=roll<.20?'Уголь':roll<.42?'Железо':roll<.58?'Медь':roll<.70?'Олово':roll<.75?'Кристалл':'Камень';}
      else if(oreTier===3){ore=roll<.16?'Уголь':roll<.32?'Железо':roll<.45?'Медь':roll<.55?'Олово':roll<.67?'Серебро':roll<.77?'Золото':roll<.84?'Кристалл':'Камень';}
      else if(oreTier===4){ore=roll<.12?'Уголь':roll<.23?'Железо':roll<.32?'Серебро':roll<.41?'Золото':roll<.53?'Рубин':roll<.65?'Сапфир':roll<.76?'Обсидиан':roll<.83?'Кристалл':'Камень';}
      else if(oreTier===5){ore=roll<.10?'Медь':roll<.20?'Серебро':roll<.30?'Золото':roll<.40?'Рубин':roll<.50?'Сапфир':roll<.62?'Обсидиан':roll<.77?'Мифрил':roll<.87?'Уран':roll<.95?'Алмаз':'Кристалл';}
      else if(oreTier===6){ore=roll<.10?'Серебро':roll<.20?'Золото':roll<.32?'Рубин':roll<.44?'Сапфир':roll<.56?'Обсидиан':roll<.74?'Мифрил':roll<.86?'Уран':roll<.97?'Алмаз':'Кристалл';}
      else if(oreTier===7){ore=roll<.08?'Золото':roll<.20?'Рубин':roll<.32?'Сапфир':roll<.43?'Обсидиан':roll<.66?'Мифрил':roll<.82?'Уран':roll<.96?'Алмаз':'Кристалл';}
      else{ore=roll<.07?'Рубин':roll<.17?'Сапфир':roll<.28?'Обсидиан':roll<.53?'Мифрил':roll<.68?'Уран':roll<.93?'Алмаз':'Кристалл';}
      const point=mineFeaturePoint(i,seed,11);
      return {x:point.x,y:point.y,ore,hp:2,maxHp:2};
    });
    mineHoverIndex=-1;if(typeof generateMineFeatures==='function')generateMineFeatures(dayIndex);
  }
  function generateMineFeatures(dayIndex=0){
    const seed=mineSeed+(dayIndex*7919)+(mineDepth*313)+(mineLevel*104729);
    const barrelCount=Math.min(11,5+Math.floor((mineLevel-1)/2));
    mineBarrels=Array.from({length:barrelCount},(_,i)=>{const p=mineFeaturePoint(i,seed,101);return {id:'barrel-'+seed+'-'+i,x:p.x,y:p.y,hp:2,maxHp:2,coal:1+Math.floor(hash(i+seed,61)*2),stone:1+Math.floor(hash(i+seed,67)*3)};});
    const groupCount=Math.min(9,3+Math.floor((mineLevel-1)/2));let index=0;mineCreatures=[];
    for(let group=0;group<groupCount;group++){const members=group%3===1?2:1;for(let member=0;member<members;member++){
      const p=mineFeaturePoint(index+group*3,seed,211),kinds=['bat','crawler','golem','spider'],kind=kinds[Math.floor(hash(index+group*7+seed,mineDepth*13)*kinds.length)],maxHp=45+mineLevel*12+(kind==='crawler'?10:kind==='golem'?42:kind==='spider'?18:0);
      mineCreatures.push({id:'mine-creature-'+seed+'-'+index,name:({bat:'Каменная летучая мышь',crawler:'Пещерный грызун',golem:'Подземный голем',spider:'Кристальный паук'})[kind],kind,x:p.x,y:p.y,hp:maxHp,maxHp,damage:10,speed:kind==='bat'?34+mineLevel*2:kind==='spider'?39+mineLevel*2:kind==='golem'?17+mineLevel:24+mineLevel*2,attackCooldown:1.1+hash(index+seed,47)*1.7,phase:hash(index+seed,49)*6.28,flash:0});index++;
    }}
    minePlayerAttackCooldown=0;
  }
  function restoreMineFeaturesFromSave(data,dayIndex=0){
    const saved=data&&typeof data==='object'?data:{};
    const version=Math.max(0,Math.floor(Number(saved.mineFeaturesVersion)||0));
    const savedBarrels=Array.isArray(saved.mineBarrels)?saved.mineBarrels:null;
    const savedCreatures=Array.isArray(saved.mineCreatures)?saved.mineCreatures:null;
    // Early saves stored empty arrays before barrels and cave creatures were generated.
    // Backfill only the missing category and keep any already-damaged/killed objects.
    const backfillBarrels=version<1&&(!savedBarrels||savedBarrels.length===0);
    const backfillCreatures=version<1&&(!savedCreatures||savedCreatures.length===0);
    if(backfillBarrels||backfillCreatures)generateMineFeatures(dayIndex);
    if(savedBarrels&&!backfillBarrels){
      mineBarrels=savedBarrels.slice(0,12).filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)).map(v=>({
        id:String(v.id||'').slice(0,64),x:Math.max(0,Math.min(330,v.x)),y:Math.max(0,Math.min(255,v.y)),
        hp:Math.max(0,Math.min(2,Math.floor(Number(v.hp)||0))),maxHp:2,
        coal:Math.max(1,Math.min(2,Math.floor(Number(v.coal)||1))),stone:Math.max(1,Math.min(3,Math.floor(Number(v.stone)||1)))
      }));
    }else if(!savedBarrels&&!backfillBarrels)mineBarrels=[];
    if(savedCreatures&&!backfillCreatures){
      mineCreatures=savedCreatures.slice(0,12).filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.hp)).map(v=>{
        const kind=['bat','crawler','golem','spider'].includes(v.kind)?v.kind:'crawler';
        return {
          id:String(v.id||'').slice(0,64),name:({bat:'Каменная летучая мышь',crawler:'Пещерный грызун',golem:'Подземный голем',spider:'Кристальный паук'})[kind],kind,
          x:Math.max(12,Math.min(320,v.x)),y:Math.max(30,Math.min(238,v.y)),
          hp:Math.max(0,Math.min(2000,Number(v.hp)||0)),maxHp:Math.max(1,Math.min(2000,Number(v.maxHp)||1)),
          damage:10,speed:Math.max(1,Math.min(100,Number(v.speed)||30)),
          attackCooldown:Math.max(0,Math.min(10,Number(v.attackCooldown)||0)),phase:Number(v.phase)||0,flash:0
        };
      });
    }else if(!savedCreatures&&!backfillCreatures)mineCreatures=[];
    return {backfilledBarrels:backfillBarrels,backfilledCreatures:backfillCreatures};
  }
  function createMineForWorld(recordId){
    mineSeed=Array.from(String(recordId)).reduce((a,c)=>a+c.charCodeAt(0),0);mineDepth=1;
    // Place the mine farther from the home and starting point, unique for each world.
    mineTileX=66+Math.floor(hash(mineSeed,31)*9);mineTileY=48+Math.floor(hash(mineSeed,37)*9);
    generateMineStock(Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));
  }
  function refreshMineDailyStock(){
    generateMineStock(Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY));
    saveGame();
    if(mineMode)toast('Запасы шахты обновились: камень, уголь и железо снова доступны'+(mineLevel>=3?', а также кристаллы.':'.'));
  }
  function openDifficultyPicker(id){pendingWorldId=id;const shade=document.getElementById('difficulty-shade');shade.hidden=false;shade.setAttribute('aria-hidden','false');}
  function closeDifficultyPicker(){const shade=document.getElementById('difficulty-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');pendingWorldId=null;}
  function confirmDifficultySelection(id){const worldId=pendingWorldId;if(!worldId)return;closeDifficultyPicker();enterWorld(worldId,id);}
  function enterWorld(id,difficultyChoice=null,options={}){
    let record=readWorlds().find(w=>w.id===id);if(!record){toast('Этот мир не найден. Обнови список миров.');renderWorldList();return;}
    const network=window.SkyRealmCoopClient,coopSession=network?.getWorldSession?.()||null;
    if(!coopSession&&difficultyChoice&&DIFFICULTIES[difficultyChoice]){difficultyMigrationPending=!DIFFICULTIES[record.difficulty];record.difficulty=difficultyChoice;record.updatedAt=Date.now();writeWorlds(readWorlds().map(w=>w.id===record.id?record:w));}
    const selectedDifficulty=coopSession?(coopSession.world_difficulty||'medium'):record.difficulty;
    if(!DIFFICULTIES[selectedDifficulty]){openDifficultyPicker(id);return;}
    if(coopSession){
      const coopWorldId='coop_'+coopSession.id,worlds=readWorlds();
      let coopRecord=worlds.find(w=>w.id===coopWorldId);
      if(!coopRecord){coopRecord={id:coopWorldId,name:record.name,difficulty:selectedDifficulty,createdAt:Date.now(),updatedAt:Date.now()};worlds.push(coopRecord);}
      else{coopRecord.name=record.name;coopRecord.difficulty=selectedDifficulty;coopRecord.updatedAt=Date.now();}
      writeWorlds(worlds);record=coopRecord;
      const incoming=window.__skyrealmPendingCoopWorldEntry;
      coopWorldEntry=incoming&&incoming.room_id===coopSession.id?incoming:{
        room_id:coopSession.id,world_id:coopWorldId,world_name:record.name,difficulty:selectedDifficulty,started_at:Date.now()
      };
      window.__skyrealmPendingCoopWorldEntry=null;
    }else coopWorldEntry=null;
    const migrateLegacyDifficulty=!coopSession&&difficultyMigrationPending;difficultyMigrationPending=false;setWorldDifficulty(selectedDifficulty);resetWorldState();configureTreasureChests();setupWorld();
    currentWorldId=record.id;currentWorldName=coopSession?('Кооператив · '+record.name):record.name;worldSessionStartedAt=Date.now();worldSessionRecorded=false;
    saveKey=coopSession?('skyrealm_coop_save_v1_'+coopSession.id+'_'+network.userId):worldSaveKey(record.id);
    localStorage.setItem('skyrealm_active_world_id',record.id);bossRealmMode=record.bossRealm===true;bossReturnWorldId=typeof record.bossReturnWorldId==='string'?record.bossReturnWorldId:null;bossReturnX=Number.isFinite(record.bossReturnX)?record.bossReturnX:21*TILE+16;bossReturnY=Number.isFinite(record.bossReturnY)?record.bossReturnY:26*TILE+16;mineMode=false;workbenchDialogOpen=false;
    createMineForWorld(coopSession?('skyrealm-coop-'+coopSession.id):record.id);if(coopSession){coopSnapshotRoomId=coopSession.id;lastAppliedCoopSnapshotVersion=0;coopSnapshotTimer=0;}loadGame();if(coopSession)coopWorldEntry={room_id:coopSession.id,world_id:'coop_'+coopSession.id,world_name:record.name,difficulty:selectedDifficulty,started_at:Number(coopWorldEntry?.started_at)||Date.now()};if(migrateLegacyDifficulty&&caveBossHp>0&&Number.isFinite(caveBossHp)&&caveBossHp<=260&&!caveBossDefeated)caveBossHp=bossMaxHp();markExploredAroundPlayer();saveGame();renderInventory();drawMinimap();
    if(coopSession&&network?.isRoomOwner)network.broadcastWorldEntry?.(coopWorldEntry).catch(error=>console.warn('[SkyRealm co-op world launch]',error));
    document.querySelector('.realm-sub').textContent=record.name+' · '+difficultyConfig().name.toUpperCase()+' · ПЕРВЫЙ РАССВЕТ';
    document.getElementById('main-menu-shade').hidden=true;document.getElementById('main-menu-shade').setAttribute('aria-hidden','true');
    document.getElementById('pause-shade').hidden=true;document.getElementById('pause-main-view').hidden=false;document.getElementById('pause-settings-view').hidden=true;
    inMainMenu=false;paused=true;settingsOpenedFromMainMenu=false;keys.clear();pressedMovementCodes.clear();canvas.focus();last=performance.now();if(options?.skipCharacterEntry){paused=false;last=performance.now();}else openCharacterEditor(true);renderWorldList();
  }
  function receiveCoopWorldEntry(entry){
    const network=window.SkyRealmCoopClient,state=network?.getRoomState?.();
    if(!entry||!state||state.status!=='running'||entry.room_id!==state.id||network.isRoomOwner||
      entry.world_id!=='coop_'+state.id||!DIFFICULTIES[entry.difficulty]||typeof entry.world_name!=='string')return;
    const targetSave='skyrealm_coop_save_v1_'+state.id+'_'+network.userId;
    if(currentWorldId&&saveKey===targetSave)return;
    if(currentWorldId){saveGame();recordAdventureHistory();}
    const worlds=readWorlds(),id='coop_'+state.id;
    let record=worlds.find(w=>w.id===id);
    if(!record){record={id,name:entry.world_name,difficulty:entry.difficulty,createdAt:Date.now(),updatedAt:Date.now()};worlds.push(record);}
    else{record.name=entry.world_name;record.difficulty=entry.difficulty;record.updatedAt=Date.now();}
    writeWorlds(worlds);
    window.__skyrealmPendingCoopWorldEntry=entry;
    enterWorld(id);
    toast('Владелец запустил общий мир. Ты автоматически присоединился.');
  }
  window.addEventListener('skyrealm-coop-world-enter',event=>receiveCoopWorldEntry(event.detail));
  function returnToMainMenu(){
    void refreshStaffRole(true);
    if(currentWorldId){saveGame();recordAdventureHistory();}
    const network=window.SkyRealmCoopClient,room=network?.getRoomState?.();
    // Returning to the main menu is local navigation; it must not pause the shared room.
    inMainMenu=true;paused=true;keys.clear();pressedMovementCodes.clear();document.getElementById('main-menu-shade').hidden=false;document.getElementById('main-menu-shade').setAttribute('aria-hidden','false');document.getElementById('pause-shade').hidden=true;document.getElementById('pause-settings-view').hidden=true;document.getElementById('pause-main-view').hidden=false;renderWorldList();drawMinimap();
  }
  function openSettingsFromMainMenu(){
    settingsOpenedFromMainMenu=true;paused=true;keys.clear();pressedMovementCodes.clear();document.getElementById('pause-shade').hidden=false;document.getElementById('pause-main-view').hidden=true;document.getElementById('pause-settings-view').hidden=false;syncSettingsControls();
  }
  function returnFromSettings(){
    if(settingsOpenedFromMainMenu){settingsOpenedFromMainMenu=false;paused=true;keys.clear();pressedMovementCodes.clear();document.getElementById('pause-shade').hidden=true;document.getElementById('pause-settings-view').hidden=true;document.getElementById('main-menu-shade').hidden=false;document.getElementById('main-menu-shade').setAttribute('aria-hidden','false');renderWorldList();}
    else showPauseMain();
  }
  const SKYREALM_STAFF_API='https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-staff';
  const SKYREALM_STAFF_KEY='sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL';
  let currentStaffRole='none',staffRoleLastChecked=0,staffRefreshPromise=null,publicStaffGrantsEnabled=false,staffBootstrapAvailable=false;
  async function staffRequest(route,method='GET',payload=null){
    const token=await communityAccessToken();
    if(!token)throw new Error('Войди в аккаунт SkyRealm и подтверди почту.');
    const response=await fetch(SKYREALM_STAFF_API+'?route='+encodeURIComponent(route),{
      method,
      headers:{apikey:SKYREALM_STAFF_KEY,Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
      body:payload?JSON.stringify(payload):undefined
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error?.message||'Сервер не подтвердил права доступа.');
    return data;
  }
  async function refreshStaffRole(force=false){
    if(!force&&staffRoleLastChecked&&Date.now()-staffRoleLastChecked<30000)return currentStaffRole;
    if(staffRefreshPromise)return staffRefreshPromise;
    staffRefreshPromise=(async()=>{
      try{
        const data=await staffRequest('/api/staff/me');
        currentStaffRole=['admin','moderator'].includes(data.role)?data.role:'none';
        publicStaffGrantsEnabled=data.public_grants_enabled===true;staffBootstrapAvailable=data.bootstrap_available===true;
      }catch(error){
        currentStaffRole='none';publicStaffGrantsEnabled=false;staffBootstrapAvailable=false;
        if(error?.message&&!error.message.includes('Войди в аккаунт'))console.warn('[SkyRealm staff role]',error.message);
      }finally{
        staffRoleLastChecked=Date.now()-(currentStaffRole==='none'?27000:0);
        syncAdminMenu();
        if(currentStaffRole!=='admin')setPanelOpen('admin-panel-shade',false);
        if(currentStaffRole!=='admin'&&currentStaffRole!=='moderator')setPanelOpen('moderator-panel-shade',false);
      }
      return currentStaffRole;
    })();
    try{return await staffRefreshPromise;}finally{staffRefreshPromise=null;}
  }
  function setStaffManageStatus(message,isError=false){
    const el=document.getElementById('admin-staff-status');if(!el)return;
    el.textContent=message;el.classList.toggle('error',!!isError);
  }
  async function loadStaffPlayers(){
    const select=document.getElementById('admin-staff-select');
    if(!select||currentStaffRole!=='admin')return;
    setStaffManageStatus('Загружаю список игроков…');
    try{
      const data=await staffRequest('/api/staff/players');
      const players=Array.isArray(data.players)?data.players:[];
      select.replaceChildren();
      const first=document.createElement('option');first.value='';first.textContent='Выбери игрока';select.appendChild(first);
      for(const player of players){
        const option=document.createElement('option');option.value=player.user_id;
        const label=player.display_name?player.username+' · '+player.display_name:player.username;
        option.textContent=label+' — '+(player.role==='admin'?'администратор':player.role==='moderator'?'модератор':'игрок');
        option.disabled=player.role==='admin';option.dataset.role=player.role;select.appendChild(option);
      }
      setStaffManageStatus('Игроков: '+players.length+'. Администратор защищён от изменения этой панелью.');
    }catch(error){setStaffManageStatus(error.message||'Не удалось загрузить игроков.',true);}
  }
  async function changeStaffModerator(action){
    if(currentStaffRole!=='admin'){setStaffManageStatus('Нужны права администратора.',true);return;}
    const select=document.getElementById('admin-staff-select'),userId=select?.value||'';
    if(!userId){setStaffManageStatus('Сначала выбери игрока.',true);return;}
    const selected=select.options[select.selectedIndex];
    if(selected?.dataset.role==='admin'){setStaffManageStatus('Права администратора нельзя менять здесь.',true);return;}
    try{
      const result=await staffRequest('/api/staff/moderators','POST',{user_id:userId,action});
      setStaffManageStatus(result.action==='grant'?'Модератор назначен.':'Права модератора сняты.');
      await loadStaffPlayers();
    }catch(error){setStaffManageStatus(error.message||'Не удалось изменить роль.',true);}
  }
  async function openPrivilegesPanel(){
    await refreshStaffRole(true);
    if(!publicStaffGrantsEnabled&&!staffBootstrapAvailable&&currentStaffRole!=='admin'&&gameSettings.adminMode!==true){toast('Выдача ролей сейчас закрыта.');return;}
    const toggle=document.getElementById('admin-public-grants-toggle');
    const control=document.getElementById('admin-public-grants-control');
    const revoke=document.getElementById('admin-privileges-revoke');
    const grant=document.getElementById('admin-privileges-grant');
    const fields=document.getElementById('admin-role-grant-controls');
    const bootstrap=document.getElementById('admin-bootstrap-control');
    if(control)control.hidden=currentStaffRole!=='admin';
    if(revoke)revoke.hidden=currentStaffRole!=='admin';
    if(grant)grant.hidden=currentStaffRole!=='admin'&&!publicStaffGrantsEnabled;
    if(fields)fields.hidden=currentStaffRole!=='admin'&&!publicStaffGrantsEnabled;
    if(bootstrap)bootstrap.hidden=!staffBootstrapAvailable||currentStaffRole==='admin';
    if(toggle)toggle.checked=publicStaffGrantsEnabled;
    const status=document.getElementById('admin-privileges-status');
    if(status)status.textContent=staffBootstrapAvailable?'Доступно одноразовое получение администратора для своего аккаунта.':publicStaffGrantsEnabled?'Открытый режим включён: любой подтверждённый аккаунт может выдавать роли.':'Открытая выдача выключена: выдавать роли может только администратор.';
    setPanelOpen('admin-privileges-shade',true);
  }
  async function submitPlayerRole(action='grant'){
    const username=document.getElementById('admin-privileges-username')?.value.trim()||'';
    const role=document.getElementById('admin-privileges-role')?.value||'moderator';
    const duration=document.getElementById('admin-privileges-duration')?.value||'permanent';
    const status=document.getElementById('admin-privileges-status');
    if(!username){if(status)status.textContent='Введи точное имя игрока.';return;}
    try{
      const result=await staffRequest('/api/staff/grants','POST',{username,role,duration,action});
      if(status)status.textContent=action==='revoke'?'Роль снята с игрока '+result.username+'.':'Игрок '+result.username+' получил роль '+(result.role==='admin'?'администратора':'модератора')+'. Срок: '+(result.expires_at?new Date(result.expires_at).toLocaleString():'навсегда')+'.';
      await refreshStaffRole(true);
    }catch(error){if(status)status.textContent=error.message||'Не удалось изменить привилегию.';}
  }
  async function claimAdminBootstrap(){
    const username=document.getElementById('admin-privileges-username')?.value.trim()||'';
    const code=document.getElementById('admin-privileges-bootstrap-code')?.value.trim()||'';
    const status=document.getElementById('admin-privileges-status');
    if(!username||!code){if(status)status.textContent='Введи свой логин и одноразовый код.';return;}
    try{
      const result=await staffRequest('/api/staff/bootstrap','POST',{username,code});
      document.getElementById('admin-privileges-bootstrap-code').value='';
      await refreshStaffRole(true);
      if(status)status.textContent='Администратор назначен аккаунту '+result.username+'. Привилегия сохранена на сервере навсегда.';
    }catch(error){if(status)status.textContent=error.message||'Не удалось получить роль администратора.';}
  }
  async function savePublicGrantSetting(){
    const toggle=document.getElementById('admin-public-grants-toggle');
    const status=document.getElementById('admin-privileges-status');
    if(currentStaffRole!=='admin'){if(status)status.textContent='Для изменения этого параметра нужны серверные права администратора.';return;}
    try{
      const result=await staffRequest('/api/staff/settings','POST',{enabled:!!toggle?.checked});
      publicStaffGrantsEnabled=result.public_grants_enabled===true;syncAdminMenu();
      if(status)status.textContent=publicStaffGrantsEnabled?'Открытая выдача ролей включена. Любой подтверждённый игрок сможет выдавать роли.':'Открытая выдача ролей выключена. Теперь роли может выдавать только администратор.';
    }catch(error){if(status)status.textContent=error.message||'Не удалось сохранить настройку.';if(toggle)toggle.checked=publicStaffGrantsEnabled;}
  }
  async function openAdminGate(){
    const role=await refreshStaffRole(true);
    const localAdmin=gameSettings.adminMode===true&&!isCoopWorldActive();
    if(role!=='admin'&&!localAdmin){
      toast(role==='none'?'Нет прав администратора. Войди в аккаунт с назначенной ролью.':'Доступ запрещён.');
      if(panelReturnToPause){panelReturnToPause=false;setPaused(true);}
      return;
    }
    openAdminPanel();
  }
  function closeAdminGate(){const shade=document.getElementById('admin-password-shade');shade.hidden=true;shade.setAttribute('aria-hidden','true');document.getElementById('admin-password-input').value='';if(panelReturnToPause){panelReturnToPause=false;setPaused(true);}}
  async function submitAdminPassword(){
    closeAdminGate();
    toast('Панель администратора отключена: серверная проверка роли ещё не настроена.');
  }
  function setPanelOpen(id,open){const el=document.getElementById(id);el.hidden=!open;el.setAttribute('aria-hidden',open?'false':'true');}
  function populateStaffItemCatalog(prefix){
    const select=document.getElementById(prefix+'-resource-select'),suggestions=document.getElementById(prefix+'-item-suggestions');
    if(!select)return;
    const catalog=new Map();
    [...inventoryItems,...resourceItems].forEach(item=>{
      const name=String(item?.name||'').trim();if(!name)return;
      const icon=String(item.icon||'✨');if(!catalog.has(name))catalog.set(name,icon);
    });
    ['Монеты','Золотые монеты'].forEach(name=>{if(!catalog.has(name))catalog.set(name,'🪙');});
    const entries=[...catalog.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ru'));
    const previous=select.value;
    select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Выбери предмет из полного каталога';select.appendChild(placeholder);
    entries.forEach(([name,icon])=>{const option=document.createElement('option');option.value=name;option.textContent=icon+' '+name;select.appendChild(option);});
    if(entries.some(([name])=>name===previous))select.value=previous;
    if(suggestions){suggestions.replaceChildren();entries.forEach(([name])=>{const option=document.createElement('option');option.value=name;suggestions.appendChild(option);});}
  }
  function openAdminPanel(){if(currentStaffRole!=='admin'){toast('Нет подтверждённых прав администратора.');return;}
    const serverAdmin=true;
    renderWorldList();setPanelOpen('admin-panel-shade',true);
    document.getElementById('admin-world-count').textContent=String(readWorlds().length);
    populateStaffItemCatalog('admin');refreshAdminStats();renderBanList('admin-ban-list');
    const staffSection=document.querySelector('.admin-staff-section');if(staffSection)staffSection.hidden=!serverAdmin;
    ['admin-immortal','mod-immortal'].forEach(id=>{const b=document.getElementById(id);if(b){b.textContent='◇ Бессмертие: '+(immortal?'вкл.':'выкл.');b.classList.toggle('active',immortal);}});
    if(serverAdmin)void loadStaffPlayers();
  }
  async function openModeratorPanel(){
    const role=await refreshStaffRole(true);
    if(role!=='admin'&&role!=='moderator'){
      toast('Нет подтверждённых прав модератора.');
      if(panelReturnToPause){panelReturnToPause=false;setPaused(true);}
      return;
    }
    setPanelOpen('moderator-panel-shade',true);
    populateStaffItemCatalog('mod');refreshAdminStats();
    const b=document.getElementById('mod-immortal');
    if(b){b.textContent='◇ Бессмертие: '+(immortal?'вкл.':'выкл.');b.classList.toggle('active',immortal);}
  }
  function refreshAdminStats(){const m=minuteOfDay(),label=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');const t=document.getElementById('admin-time-label');if(t)t.textContent=label;const mt=document.getElementById('mod-time-label');if(mt)mt.textContent=label;const c=document.getElementById('admin-monster-count');if(c)c.textContent=String(monsters.length);const p=document.getElementById('admin-playtime-label');if(p){const mins=Math.floor(totalGameMinutesPlayed),hours=Math.floor(mins/60);p.textContent=hours+' ч '+String(mins%60).padStart(2,'0')+' мин';}const mp=document.getElementById('mod-playtime-label');if(mp){const mins=Math.floor(totalGameMinutesPlayed),hours=Math.floor(mins/60);mp.textContent=hours+' ч '+String(mins%60).padStart(2,'0')+' мин';}const balance=formatMoney(walletCents);const ab=document.getElementById('admin-wallet-balance'),mb=document.getElementById('mod-wallet-balance');if(ab)ab.textContent=balance;if(mb)mb.textContent=balance;}
  function requireWorld(){if(!currentWorldId){toast('Сначала выбери или создай мир.');return false;}return true;}
  function setGameTime(minute){if(!requireWorld())return;const day=Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY);gameMinuteTotal=day*GAME_MINUTES_PER_DAY+minute;lastDawnMarker=Math.floor((gameMinuteTotal-DAWN_MINUTE)/GAME_MINUTES_PER_DAY);wasNight=isNightTime();lastClockMinute=-1;monsterSpawnTimer=0;updateClockDisplay(true);saveGame();refreshAdminStats();toast('Время изменено вручную — день или ночь не засчитаны.');}
  function grantGoldToWallet(amount){
     const gold=Math.max(1,Math.min(9999999,Math.floor(Number(amount)||1)));
     walletCents=Math.min(999999999,Math.max(0,Math.floor(Number(walletCents)||0))+gold*100);
     updateWalletHud();if(shopDialogOpen)renderShop();saveGame();refreshAdminStats();
     return gold;
   }
   function giveResource(prefix='admin'){
    if(!requireWorld())return;
    const customId=prefix==='mod'?'mod-resource-custom':'admin-resource-custom';
    const selectId=prefix==='mod'?'mod-resource-select':'admin-resource-select';
    const amountId=prefix==='mod'?'mod-resource-amount':'admin-resource-amount';
    const custom=document.getElementById(customId)?.value.trim();
    const requested=(custom||document.getElementById(selectId)?.value||'').trim().slice(0,64);
    const amount=Math.max(1,Math.min(9999999,Math.floor(Number(document.getElementById(amountId)?.value)||1)));
    if(!requested){toast('Выбери предмет или введи его название.');return;}
    if(['монеты','золотые монеты','золото','gold','coins','золотая монета'].includes(requested.toLocaleLowerCase())){const granted=grantGoldToWallet(amount);toast('Золото зачислено на баланс мира: +'+granted+'. Текущий баланс: '+formatMoney(walletCents)+'.');return;}
    // Only grant registered game items. Creating an arbitrary display-only entry made
    // objects appear in the bag without connecting them to the actual item mechanics.
    const item=inventoryItems.find(x=>String(x.name).toLocaleLowerCase()===requested.toLocaleLowerCase());
    if(!item){toast('Такого предмета нет в игровом каталоге. Выбери настоящий предмет из списка.');return;}
    const granted=Math.min(amount,9999999-Math.max(0,Number(item.count)||0));
    if(granted<=0){toast('Достигнут максимум количества этого предмета.');return;}
    if(!changeItem(item.name,granted)){toast('Не удалось добавить предмет в инвентарь.');return;}
    renderInventory();saveGame();toast('Предмет добавлен в игровой инвентарь: '+item.name+' × '+granted+'.');
  }
  function grantBestSet(prefix='admin'){
    if(!requireWorld())return;
    const gear={armor:'Нагрудник Бога',helmet:'Шлем Бога',leggings:'Поножи Бога',boots:'Сапоги Бога',amulet:'Амулет Бога'};
    const names=Object.values(gear);
    const missing=names.filter(name=>!inventoryItems.some(item=>item.name===name));
    if(missing.length){toast('В каталоге отсутствует часть божественного комплекта: '+missing.join(', '));return;}
    names.forEach(name=>{if(itemCount(name)<1)changeItem(name,1);});
    equipment={...equipment,...gear};
    renderInventory();renderEquipmentPanel();saveGame();
    toast('Божественный комплект выдан и надет: 5 частей · защита '+Math.round(armorReduction()*100)+'% · бонус урона +25%.');
  }
  function grantBestWeapon(prefix='admin'){
    if(!requireWorld())return;
    const name='Клинок бездны';
    if(!inventoryItems.some(item=>item.name===name)){toast('Клинок Бездны отсутствует в каталоге предметов.');return;}
    if(itemCount(name)<1)changeItem(name,1);
    equipment.weapon=name;weaponUpgrades[name]=5;weaponEnchantments[name]='Сила Бездны';
    renderInventory();renderEquipmentPanel();saveGame();
    toast('Клинок Бездны выдан и надет · 360 базового урона · улучшение 5/5 · зачарование Сила Бездны.');
  }
  function maxUpgradeGear(prefix='admin'){
    if(!requireWorld())return;
    const weapon=equipment.weapon||'';
    if(weapon&&itemCount(weapon)>0){weaponUpgrades[weapon]=5;weaponEnchantments[weapon]=weaponEnchantments[weapon]||'Сила Бездны';}
    if(equipment.armor&&itemCount(equipment.armor)>0)armorUpgrade=5;
    renderInventory();renderEquipmentPanel();saveGame();
    toast('Экипировка улучшена до максимума: оружие 5/5, броня '+(equipment.armor?armorUpgrade+'/5':'не надета')+'.');
  }
  function healPlayer(){if(!requireWorld())return;player.hp=100;player.stamina=100;updateVitals();saveGame();toast('Здоровье и выносливость восстановлены.');}
  function toggleImmortal(buttonId){immortal=!immortal;['admin-immortal','mod-immortal'].forEach(id=>{const b=document.getElementById(id);if(b){b.textContent='◇ Бессмертие: '+(immortal?'вкл.':'выкл.');b.classList.toggle('active',immortal);}});toast(immortal?'Бессмертие включено.':'Бессмертие выключено.');}
  function spawnAdminMonster(){if(!requireWorld())return;const angle=Math.random()*Math.PI*2,baseX=inHouse?36*TILE+40:player.x,baseY=inHouse?15*TILE+154:player.y;let x=baseX+Math.cos(angle)*150,y=baseY+Math.sin(angle)*150;x=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,x));y=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,y));if(blocked(x,y)){x=player.x+90;y=player.y+70;}const type=['shadow','brute','wisp','skeleton','bomb'][Math.floor(Math.random()*5)];const hp=type==='bomb'?55:type==='skeleton'?80:type==='brute'?135:100;monsters.push({x,y,hp,maxHp:hp,type,speed:type==='brute'?30:type==='wisp'?58:type==='skeleton'?47:type==='bomb'?49:43,attackCooldown:0,phase:Math.random()*6.28,flash:0,fuseStarted:false,fuseTime:1.45,exploding:false,explosionTimer:0,damageApplied:false,adminSpawned:true});refreshAdminStats();drawMinimap();saveGame();toast('Создан монстр: '+monsterLabel(type)+'.');}
  function clearAdminMonsters(){monsters.length=0;monsterSpawnTimer=0;refreshAdminStats();drawMinimap();saveGame();toast('Все монстры удалены.');}
  function renderBanList(id){const el=document.getElementById(id);if(!el)return;let bans=[];try{bans=JSON.parse(localStorage.getItem('skyrealm_local_blocklist')||'[]');}catch(_){}el.innerHTML='';if(!bans.length){el.innerHTML='<span>Список пуст <small>(локально)</small></span>';return;}bans.forEach(name=>{const row=document.createElement('span');row.textContent=name+' ';const b=document.createElement('button');b.type='button';b.textContent='Убрать';b.addEventListener('click',()=>{const next=bans.filter(n=>n!==name);localStorage.setItem('skyrealm_local_blocklist',JSON.stringify(next));renderBanList(id);});row.appendChild(b);el.appendChild(row);});}
  function addLocalBan(inputId,listId){const input=document.getElementById(inputId),name=String(input.value||'').trim().slice(0,32);if(!name){toast('Введи имя игрока.');return;}let bans=[];try{bans=JSON.parse(localStorage.getItem('skyrealm_local_blocklist')||'[]');}catch(_){}if(!bans.includes(name))bans.push(name);localStorage.setItem('skyrealm_local_blocklist',JSON.stringify(bans));input.value='';renderBanList(listId);toast('Имя добавлено в локальный список. Это не сетевой бан.');}
  function openFullMap(){if(!requireWorld())return;fullMapOpen=true;keys.clear();pressedMovementCodes.clear();setPanelOpen('full-map-shade',true);drawFullMap();}
  function closeFullMap(){fullMapOpen=false;setPanelOpen('full-map-shade',false);keys.clear();pressedMovementCodes.clear();canvas.focus();}
  function drawFullMap(){const c=document.getElementById('full-map-canvas'),g=c.getContext('2d'),mw=c.width,mh=c.height;g.clearRect(0,0,mw,mh);g.fillStyle='#091522';g.fillRect(0,0,mw,mh);const pad=12,cw=(mw-pad*2)/COLS,ch=(mh-pad*2)/ROWS;for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){if(!exploredCells.has(tileKey(x,y)))continue;const b=biomeAt(x,y),pals={forest:['#2d5d43','#254e3a','#1f4636'],snow:['#d7e5e8','#b7cbd2','#91adb9'],desert:['#d3b875','#c4a767','#ad8d4d'],blight:['#52603f','#43523b','#354438'],volcano:['#594039','#43352f','#332c31'],jungle:['#1c603d','#164d35','#14502f']};g.fillStyle=waterAt(x+.5,y+.5)?'#246681':pathAt(x+.5,y+.5)?'#927951':(pals[b]||pals.snow)[hash(x,y)>.65?0:hash(x,y)>.3?1:2];g.fillRect(pad+x*cw,pad+y*ch,Math.ceil(cw),Math.ceil(ch));if(gameSettings.graphicsQuality!=='low'&&hash(x,y)>.957){g.fillStyle='#102e25';g.fillRect(pad+x*cw+cw*.3,pad+y*ch+ch*.3,Math.max(1,cw*.45),Math.max(1,ch*.45));}}const point=(x,y)=>({x:pad+x/(COLS*TILE)*(mw-pad*2),y:pad+y/(ROWS*TILE)*(mh-pad*2)});for(const mob of monsters){if(!exploredWorldPoint(mob.x,mob.y))continue;const p=point(mob.x,mob.y);g.fillStyle='#ff536d';g.beginPath();g.arc(p.x,p.y,5,0,Math.PI*2);g.fill();}const mp=point(mineTileX*TILE+16,mineTileY*TILE+16);g.fillStyle='#ffcf75';g.beginPath();g.arc(mp.x,mp.y,5,0,Math.PI*2);g.fill();const p=point(player.x,player.y);g.fillStyle='#fff2a9';g.beginPath();g.arc(p.x,p.y,6,0,Math.PI*2);g.fill();g.strokeStyle='rgba(202,225,255,.5)';g.strokeRect(.5,.5,mw-1,mh-1);const pct=Math.min(100,Math.round(exploredCells.size/(COLS*ROWS)*100));document.getElementById('full-map-discovery').textContent=pct+'% открыто';}
  function teleportFromMap(event){if(!fullMapOpen||!currentWorldId)return;const c=document.getElementById('full-map-canvas'),r=c.getBoundingClientRect(),mx=(event.clientX-r.left)/r.width*c.width,my=(event.clientY-r.top)/r.height*c.height,pad=12,tx=Math.floor((mx-pad)/((c.width-pad*2)/COLS)),ty=Math.floor((my-pad)/((c.height-pad*2)/ROWS));if(tx<0||ty<0||tx>=COLS||ty>=ROWS||!exploredCells.has(tileKey(tx,ty))){toast('Телепортироваться можно только в исследованные места.');return;}const x=tx*TILE+TILE/2,y=ty*TILE+TILE/2;if(blocked(x,y)){toast('В этой точке препятствие. Выбери соседнюю открытую область.');return;}player.x=x;player.y=y;player.vx=player.vy=0;saveGame();drawMinimap();drawFullMap();closeFullMap();toast('Телепортация выполнена.');}
  function settingsViewOpen(){return !document.getElementById('pause-settings-view').hidden;}
  function showPauseMain(){document.getElementById('pause-main-view').hidden=false;document.getElementById('pause-settings-view').hidden=true;}
  function setPaused(value){if(value&&hudMoveMode)finishHudMoveMode();paused=value;document.getElementById('pause-shade').hidden=!paused;keys.clear();pressedMovementCodes.clear();movementDirections.clear();if(paused){showPauseMain();}else{canvas.focus();}}
  function syncSettingsControls(){
    document.getElementById('game-quality-select').value=gameSettings.graphicsQuality;
    const musicToggle=document.getElementById('game-music-enabled-toggle');if(musicToggle)musicToggle.checked=gameSettings.musicEnabled===true;
    const uiSoundToggle=document.getElementById('game-ui-sound-toggle');if(uiSoundToggle)uiSoundToggle.checked=gameSettings.uiSoundEnabled!==false;
    const musicVolume=document.getElementById('game-music-volume');if(musicVolume)musicVolume.value=String(gameSettings.musicVolume??35);
    const sfxVolume=document.getElementById('game-sfx-volume');if(sfxVolume)sfxVolume.value=String(gameSettings.sfxVolume??70);
    const performanceSelect=document.getElementById('game-performance-select');if(performanceSelect)performanceSelect.value=gameSettings.performanceMode;
    document.getElementById('game-resolution-select').value=gameSettings.resolution;
    document.getElementById('game-window-mode-select').value=gameSettings.windowMode;
    document.getElementById('game-ui-scale-select').value=gameSettings.uiScale;
    document.getElementById('show-vitals-toggle').checked=gameSettings.showVitals;
    document.getElementById('show-quest-toggle').checked=gameSettings.showQuest;
    document.getElementById('show-controls-toggle').checked=gameSettings.showControls;
    document.getElementById('show-inventory-toggle').checked=gameSettings.showInventory;
    document.getElementById('show-minimap-toggle').checked=gameSettings.showMinimap;
    const layout=document.getElementById('hud-layout-select');if(layout)layout.value=gameSettings.hudLayout||'default';
  }
  function applyVisualSettings(){
    const shell=document.querySelector('.game-shell');
    shell.classList.remove('ui-small','ui-large','quality-low','quality-medium','quality-high','hud-left','hud-right','hud-compact');
    if(gameSettings.uiScale==='85')shell.classList.add('ui-small');
    if(gameSettings.uiScale==='115')shell.classList.add('ui-large');
    shell.classList.add('quality-'+gameSettings.graphicsQuality);
    if(['left','right','compact'].includes(gameSettings.hudLayout))shell.classList.add('hud-'+gameSettings.hudLayout);
    document.getElementById('vitals').hidden=!gameSettings.showVitals;
    document.querySelector('.quest').hidden=!gameSettings.showQuest;
    document.querySelector('.controls-hint').hidden=!gameSettings.showControls;
    document.querySelector('.inventory-wrap').hidden=!gameSettings.showInventory;
    document.getElementById('minimap-panel').hidden=!gameSettings.showMinimap;
    syncAdminMenu();
    resize();
  }
  const HUD_LAYOUT_KEY='skyrealm_hud_positions_v1';
  const HUD_SCALE_KEY='skyrealm_hud_scales_v1';
  let hudMoveMode=false, selectedHudId='top-hud';
  const HUD_DRAG_IDS=['top-hud','world-clock','minimap-panel','survival-widget','night-warning','quest','controls-hint','inventory-wrap','toast','location-chip'];
  function hudElement(id){return document.getElementById(id)||document.querySelector('.'+id);}
  function loadHudPositions(){try{return JSON.parse(localStorage.getItem(HUD_LAYOUT_KEY)||'{}')||{};}catch(_){return {};}}
  function loadHudScales(){try{return JSON.parse(localStorage.getItem(HUD_SCALE_KEY)||'{}')||{};}catch(_){return {};}}
  function hudBounds(){const shell=document.querySelector('.game-shell');return shell?{width:shell.clientWidth,height:shell.clientHeight,rect:shell.getBoundingClientRect()}:null;}
  function applyHudPositions(){const positions=loadHudPositions(),scales=loadHudScales(),parent=hudBounds();if(!parent)return;HUD_DRAG_IDS.forEach(id=>{const el=hudElement(id);if(!el)return;const pos=positions[id];if(pos&&((Number.isFinite(pos.xRatio)&&Number.isFinite(pos.yRatio))||(Number.isFinite(pos.x)&&Number.isFinite(pos.y)))){const r=el.getBoundingClientRect(),maxX=Math.max(0,parent.width-r.width),maxY=Math.max(0,parent.height-r.height),x=Number.isFinite(pos.xRatio)?pos.xRatio*maxX:pos.x,y=Number.isFinite(pos.yRatio)?pos.yRatio*maxY:pos.y;el.style.left=Math.round(Math.max(0,Math.min(maxX,x)))+'px';el.style.top=Math.round(Math.max(0,Math.min(maxY,y)))+'px';el.style.right='auto';el.style.bottom='auto';el.style.transform='none';}const scale=Number(scales[id]);if(Number.isFinite(scale)&&scale>=0.6&&scale<=1.6)el.style.zoom=String(scale);});}
  function saveHudPositions(){const positions=loadHudPositions(),parent=hudBounds();if(!parent)return;HUD_DRAG_IDS.forEach(id=>{const el=hudElement(id);if(!el||el.hidden)return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;const maxX=Math.max(0,parent.width-r.width),maxY=Math.max(0,parent.height-r.height);positions[id]={xRatio:maxX?Math.max(0,Math.min(1,(r.left-parent.rect.left)/maxX)):0,yRatio:maxY?Math.max(0,Math.min(1,(r.top-parent.rect.top)/maxY)):0};});try{localStorage.setItem(HUD_LAYOUT_KEY,JSON.stringify(positions));}catch(_){}}
  function resetHudPositions(){try{localStorage.removeItem(HUD_LAYOUT_KEY);}catch(_){}HUD_DRAG_IDS.forEach(id=>{const el=hudElement(id);if(!el)return;['left','top','right','bottom','transform'].forEach(p=>el.style.removeProperty(p));});}
  function saveHudScales(){try{localStorage.setItem(HUD_SCALE_KEY,JSON.stringify(loadHudScales()));}catch(_){}}
  function selectHudElement(id){selectedHudId=id;const el=hudElement(id);const label=document.getElementById('hud-size-target');if(label)label.textContent=(el?.getAttribute('aria-label')||el?.querySelector('h3,.realm-name,.minimap-heading,.survival-title')?.textContent||id).trim().slice(0,30);const slider=document.getElementById('hud-size-slider');if(slider)slider.value=Math.round((Number(loadHudScales()[id])||1)*100);const output=document.getElementById('hud-size-value');if(output&&slider)output.textContent=slider.value+'%';}
  function finishHudMoveMode(){saveHudPositions();setHudMoveMode(false);toast('Расположение и размеры интерфейса сохранены.');}
  function setHudMoveMode(on){hudMoveMode=!!on;document.querySelector('.game-shell').classList.toggle('hud-moving',hudMoveMode);const bar=document.getElementById('hud-edit-toolbar');if(bar)bar.hidden=!hudMoveMode;const b=document.getElementById('toggle-hud-move');if(b)b.textContent=hudMoveMode?'✓ Завершить перемещение и сохранить':'↔ Перемещать элементы интерфейса';if(hudMoveMode){selectHudElement(selectedHudId);toast('Перетащи элемент. Выбери его, чтобы изменить размер. Перемещение ограничено границами экрана.');}}
  function initHudDragging(){
    applyHudPositions();
    HUD_DRAG_IDS.forEach(id=>{const el=hudElement(id);if(!el)return;el.dataset.hudDragId=id;el.addEventListener('pointerdown',ev=>{if(!hudMoveMode||ev.button!==0)return;if(ev.target.closest('button,input,select,textarea,a'))return;ev.preventDefault();ev.stopPropagation();selectHudElement(id);const parentEl=document.querySelector('.game-shell'),parent=parentEl.getBoundingClientRect(),rect=el.getBoundingClientRect();const startX=ev.clientX,startY=ev.clientY,left=rect.left-parent.left,top=rect.top-parent.top;el.setPointerCapture?.(ev.pointerId);const move=e=>{const r=el.getBoundingClientRect(),maxX=Math.max(0,parentEl.clientWidth-r.width),maxY=Math.max(0,parentEl.clientHeight-r.height);const x=Math.max(0,Math.min(maxX,left+e.clientX-startX));const y=Math.max(0,Math.min(maxY,top+e.clientY-startY));el.style.left=x+'px';el.style.top=y+'px';el.style.right='auto';el.style.bottom='auto';el.style.transform='none';};const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);});});
    const slider=document.getElementById('hud-size-slider');if(slider)slider.addEventListener('input',()=>{if(!hudMoveMode)return;const scale=Number(slider.value)/100,scales=loadHudScales();scales[selectedHudId]=scale;const el=hudElement(selectedHudId);if(el)el.style.zoom=String(scale);const output=document.getElementById('hud-size-value');if(output)output.textContent=slider.value+'%';try{localStorage.setItem(HUD_SCALE_KEY,JSON.stringify(scales));}catch(_){}});
    const finish=document.getElementById('hud-edit-finish');if(finish)finish.addEventListener('click',finishHudMoveMode);
  }
  async function applyAndSaveSettings(showMessage=true){
    const previousMode=gameSettings.windowMode,previousHudLayout=gameSettings.hudLayout;
    gameSettings=normalizeGameSettings({
      ...gameSettings,
      musicEnabled:document.getElementById('game-music-enabled-toggle')?.checked??gameSettings.musicEnabled,
      uiSoundEnabled:document.getElementById('game-ui-sound-toggle')?.checked??gameSettings.uiSoundEnabled,
      musicVolume:Number(document.getElementById('game-music-volume')?.value??gameSettings.musicVolume??35),
      sfxVolume:Number(document.getElementById('game-sfx-volume')?.value??gameSettings.sfxVolume??70),
      graphicsQuality:document.getElementById('game-quality-select').value,
      performanceMode:document.getElementById('game-performance-select')?.value||'balanced',
      resolution:document.getElementById('game-resolution-select').value,
      windowMode:document.getElementById('game-window-mode-select').value,
      uiScale:document.getElementById('game-ui-scale-select').value,
      showVitals:document.getElementById('show-vitals-toggle').checked,
      showQuest:document.getElementById('show-quest-toggle').checked,
      showControls:document.getElementById('show-controls-toggle').checked,
      showInventory:document.getElementById('show-inventory-toggle').checked,
      showMinimap:document.getElementById('show-minimap-toggle').checked,
      hudLayout:document.getElementById('hud-layout-select').value
    });
    localStorage.setItem('skyrealm_game_preferences',JSON.stringify(gameSettings));
    if(gameSettings.musicEnabled!==skyMusicEnabled)setSkyMusic(gameSettings.musicEnabled);
    if(skyMusic){const volume=Math.max(0,Math.min(100,Number(gameSettings.musicVolume)||0))/100;skyMusic.master.gain.setTargetAtTime(Math.max(.0001,.18*volume),audioContext.currentTime,.12);}
    if(previousHudLayout!==gameSettings.hudLayout)resetHudPositions();
    applyVisualSettings();
    applyHudPositions();
    let nativeResult=null;
    const hasNativeWindow=!!window.pywebview?.api?.apply_settings;
    try { if(hasNativeWindow) nativeResult=await window.pywebview.api.apply_settings(gameSettings); }
    catch(_) { nativeResult={ok:false}; }
    if(!hasNativeWindow && previousMode!==gameSettings.windowMode){
      try {
        if(gameSettings.windowMode==='fullscreen'&&!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else if(gameSettings.windowMode==='windowed'&&document.fullscreenElement) await document.exitFullscreen();
      } catch(_) { toast('Браузер не разрешил изменить режим окна.'); }
    }
    if(nativeResult && nativeResult.ok===false){toast(nativeResult.message||'Не удалось применить часть настроек окна.');}
    else if(showMessage){toast('Настройки применены и сохранены.');}
  }
  async function toggleFullscreen(){
    if(window.pywebview?.api?.toggle_fullscreen){
      try { const result=await window.pywebview.api.toggle_fullscreen(); if(result?.ok===false) throw new Error(result.message||'Fullscreen switch failed'); if(result?.windowMode)gameSettings.windowMode=result.windowMode; }
      catch(_){toast('Не удалось переключить полный экран.');return;}
    }else{
      try {
        if(document.fullscreenElement){await document.exitFullscreen();gameSettings.windowMode='windowed';}
        else {await document.documentElement.requestFullscreen();gameSettings.windowMode='fullscreen';}
      } catch(_){toast('Полный экран недоступен в этом окне браузера.');return;}
    }
    document.getElementById('game-window-mode-select').value=gameSettings.windowMode;
    localStorage.setItem('skyrealm_game_preferences',JSON.stringify(gameSettings));
    try { if(window.pywebview?.api?.apply_settings) await window.pywebview.api.apply_settings(gameSettings); } catch(_){}
    toast(gameSettings.windowMode==='fullscreen'?'Полноэкранный режим включён.':'Оконный режим включён.');
  }
  document.getElementById('shop-close')?.addEventListener('click',closeShop);
  document.getElementById('npc-quest-close')?.addEventListener('click',closeNpcQuestDialog);
  window.addEventListener('keydown', e => {
    const editionShade=document.getElementById('edition-shade');
    if(editionShade && !editionShade.hidden) return;
    if(e.code==='F11'||e.key==='F11'){e.preventDefault();toggleFullscreen();return;}
    if(e.code==='F12'||e.key==='F12'){e.preventDefault();saveGameScreenshot();return;}
    if(deathScreenOpen)return;
    const k = gameKey(e);
    const movementKey = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k) ||
      ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code);
    const activeElement=document.activeElement;
    const isEditableTarget=node=>!!(node&&(node.matches?.('input,textarea,select,[contenteditable="true"]')||node.isContentEditable));
    const editTargetNode=isEditableTarget(e.target)?e.target:(isEditableTarget(activeElement)?activeElement:null);
    const editTarget=!!editTargetNode;
    // Inspect the actual focused control, not a boolean match. This is important
    // in WebView, where keydown.target may be the canvas even during text entry.
    const formTarget=!!(editTargetNode&&!editTargetNode.disabled&&
      !editTargetNode.closest?.('[hidden], [aria-hidden="true"]')&&
      editTargetNode.getClientRects?.().length>0&&
      getComputedStyle(editTargetNode).visibility!=='hidden');
    if(formTarget)return;
    if (editTarget && !formTarget && movementKey && !inMainMenu) {
      try { canvas.focus(); } catch (_) {}
    }
    if(!inMainMenu&&!paused&&!formTarget)autoResumeCoopRoomOnInput();
    // Recover from a stale paused flag after first world entry. This can happen
    // when the character-entry overlay closes without completing its resume callback.
    const pauseShade = document.getElementById('pause-shade');
    const visible = id => { const el=document.getElementById(id); return !!el && !el.hidden; };
    const blockingOverlay = signDialogOpen || inventoryDialogOpen || workbenchDialogOpen ||
      shopDialogOpen || npcQuestDialogOpen || storageDialogOpen || fullMapOpen ||
      Array.from(document.querySelectorAll('.shade')).some(el =>
        !el.hidden && !['pause-shade','main-menu-shade'].includes(el.id));
    // Some embedded WebView builds can leave the internal pause flag stale after
    // a modal closes. Resume on the first movement key only when no modal is visible.
    if (movementKey && !formTarget && !inMainMenu && paused &&
        pauseShade?.hidden === true && !blockingOverlay && !sleeping) {
      paused = false;
      keys.clear();pressedMovementCodes.clear();
      movementDirections.clear();
      last = performance.now();
      canvas.focus();
    }
    if(k===' '&&mineMode&&!formTarget&&!inMainMenu&&!paused&&!blockingOverlay){e.preventDefault();attackMineCreature();return;}
    if (!formTarget && ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','e','i','l','o','q','j','r','t','f','g','1','2','3','4'].includes(k)) e.preventDefault();
    if(k==='l'&&!formTarget&&!inMainMenu){if(fullMapOpen)closeFullMap();else if(!paused&&!signDialogOpen&&!inventoryDialogOpen)openFullMap();return;}
    if(k==='o'&&bossRealmMode&&!paused&&!signDialogOpen&&!inventoryDialogOpen){bossRealmJournalOpen=!bossRealmJournalOpen;toast(bossRealmJournalOpen?'Журнал мира боссов открыт':'Журнал закрыт');return;}
    if(fullMapOpen){if(k==='escape'||k==='l')closeFullMap();return;}
    if (k === 'escape') {
      if(shopDialogOpen){closeShop();return;}
      if(npcQuestDialogOpen){closeNpcQuestDialog();return;}
      if(hudMoveMode){finishHudMoveMode();return;}
      if (!document.getElementById('admin-password-shade').hidden) closeAdminGate();
      else if (!document.getElementById('world-create-shade').hidden) closeWorldCreate();
      else if (!document.getElementById('world-rename-shade').hidden) closeRenameWorld();
      else if (!document.getElementById('full-map-shade').hidden) closeFullMap();
      else if (!document.getElementById('admin-panel-shade').hidden) { setPanelOpen('admin-panel-shade',false); if(panelReturnToPause){panelReturnToPause=false;setPaused(true);} }
      else if (!document.getElementById('moderator-panel-shade').hidden) { setPanelOpen('moderator-panel-shade',false); if(panelReturnToPause){panelReturnToPause=false;setPaused(true);} }
      else if (!document.getElementById('character-editor-shade').hidden) finishCharacterEditor(false);
      else if (!document.getElementById('skill-tree-shade').hidden) {setPanelOpen('skill-tree-shade',false);if(skillTreeReturnToPause){paused=true;document.getElementById('pause-shade').hidden=false;}else paused=false;skillTreeReturnToPause=false;}
      else if (!document.getElementById('storage-shade').hidden) closeStorage();
      else if (signDialogOpen) closeSignDialog();
      else if (inventoryDialogOpen) closeInventory();
      else if (workbenchDialogOpen) closeWorkbench();
      else if (inMainMenu) return;
      else if(paused && settingsViewOpen()) returnFromSettings();
      else setPaused(!paused);
      return;
    }
    if (formTarget || inMainMenu || workbenchDialogOpen || shopDialogOpen) return;
    if(k==='k'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){openSkillTree();return;}
    if(k==='f'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){cycleMagicSpell();return;}
    if(k==='g'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){castMagicSpell();return;}
    if (e.repeat && ['e','i'].includes(k)) return;
    if (k === 'e' && !paused && !signDialogOpen && !inventoryDialogOpen) { interact(); return; }
    if (k === 't' && !paused && !signDialogOpen && !inventoryDialogOpen) { interactNpcShop(); return; }
    if (k === 'q' && !paused && !signDialogOpen && !inventoryDialogOpen) { startDodge(); return; }
    if(k==='c'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){startCombatGuard();return;}
    if (k === 'r' && !paused && !signDialogOpen && !inventoryDialogOpen) { useCombatAbility(); return; }
    if(k==='x'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){useCombatUltimate();return;}
    if(k==='v'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){useBossRealmInvisibility();return;}
    if(k==='b'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){useBossRealmDamageBoost();return;}
    if(k==='n'&&!paused&&!signDialogOpen&&!inventoryDialogOpen){useBossRealmSprint();return;}
    if (k === 'h' && !paused && !signDialogOpen && !inventoryDialogOpen) { useHealingPotion(); return; }
    if (k === 'j' && !paused && !signDialogOpen && !inventoryDialogOpen) { useBuffPotion(); return; }
    if (k === ' ' && !paused && !signDialogOpen && !inventoryDialogOpen) { if(selectedInventoryItem()?.name==='Лопата')shovelSnowNearPlayer();else attackNearestMonster(); return; }
    if (k === 'i' && !paused && !signDialogOpen) { inventoryDialogOpen ? closeInventory() : openInventory(); return; }
    if (/^[1-4]$/.test(k) && !paused && !signDialogOpen && !inventoryDialogOpen) { selectSlot(Number(k)); return; }
    if (!paused && !signDialogOpen && !inventoryDialogOpen) {
      keys.add(k);
      const movementDirection=MOVEMENT_DIRECTION_BY_ACTION[k];
      if(movementDirection) movementDirections.add(movementDirection);
      if(movementKey){
        const codeDirection=Object.entries(MOVEMENT_CODE_BY_DIRECTION).find(([,codes])=>codes.includes(e.code))?.[0];
        if(codeDirection)pressedMovementCodes.add(e.code);
        for(const [direction,code] of Object.entries(gameSettings.keyBindings||{}))if(['up','down','left','right'].includes(direction)&&code===e.code)pressedMovementCodes.add(e.code);
      }
    }
  }, true);
  // Listen at document capture level as well: WebView keyboard focus can move
  // between the canvas and its wrapper, but key releases must always clear input.
  window.addEventListener('keyup', e => {
    const released=gameKey(e);
    keys.delete(released);
    const direction=MOVEMENT_DIRECTION_BY_ACTION[released];
    if(direction) movementDirections.delete(direction);
    pressedMovementCodes.delete(e.code);
  }, true);
  window.addEventListener('blur', () => { keys.clear();pressedMovementCodes.clear(); movementDirections.clear(); pressedMovementCodes.clear(); }, true);
  window.addEventListener('focus',()=>{
    const editionShade=document.getElementById('edition-shade');
    if(editionShade&&!editionShade.hidden)return;
    if(inMainMenu||paused||document.querySelector('.shade:not([hidden])'))return;
    const active=document.activeElement;
    if(active&&active.matches?.('input,textarea,select,[contenteditable=true]'))return;
    canvas.focus();
  });
  document.addEventListener('visibilitychange', () => { if(document.hidden){ keys.clear();pressedMovementCodes.clear(); movementDirections.clear(); pressedMovementCodes.clear(); } });
  window.addEventListener('blur', () => { keys.clear();pressedMovementCodes.clear(); movementDirections.clear(); pressedMovementCodes.clear(); });
  window.addEventListener('beforeunload',()=>{try{saveGame();}catch(_){}});
  window.addEventListener('resize', resize);
  window.addEventListener('fullscreenchange',()=>{gameSettings.windowMode=document.fullscreenElement?'fullscreen':'windowed';document.getElementById('game-window-mode-select').value=gameSettings.windowMode;localStorage.setItem('skyrealm_game_preferences',JSON.stringify(gameSettings));});
  canvas.addEventListener('pointerdown',()=>{if(!inMainMenu&&!paused)canvas.focus();},true);
  canvas.addEventListener('pointerdown',()=>{if(!inMainMenu&&!paused)autoResumeCoopRoomOnInput();},true);
  canvas.addEventListener('pointermove', (ev) => {if(!mineMode)return;const rect=canvas.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;let index=-1,bd=38;mineRocks.forEach((r,i)=>{if(r.hp<=0)return;const pos=mineRockScreenPosition(r),d=Math.hypot(pos.x-x,pos.y-y);if(d<bd){bd=d;index=i;}});mineHoverIndex=index;let over=index>=0;if(!over)over=mineBarrels.some(b=>b.hp>0&&Math.hypot(mineRockScreenPosition(b).x-x,mineRockScreenPosition(b).y-y)<30)||mineCreatures.some(m=>m.hp>0&&Math.hypot(mineCreatureScreenPosition(m).x-x,mineCreatureScreenPosition(m).y-y)<54);canvas.style.cursor=over?'crosshair':'default';});
  canvas.addEventListener('pointerleave',()=>{mineHoverIndex=-1;canvas.style.cursor='default';});
  function selectedInventoryItem(){return inventoryItems.filter(i=>i.count>0)[selectedSlot-1]||null;}
  function shovelSnowAt(x,y){
    const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE),key=tileKey(tx,ty);
    if(tx<1||ty<1||tx>=COLS-1||ty>=ROWS-1||waterAt(tx+.5,ty+.5)||pathAt(tx+.5,ty+.5)||biomeAt(tx+.5,ty+.5)!=='snow'||clearedSnowTiles.has(key)){toast('Здесь нет снега, который можно убрать.');return false;}
    if(Math.hypot((tx+.5)*TILE-player.x,(ty+.5)*TILE-player.y)>TILE*3.2){toast('Подойди к снежной клетке ближе.');return false;}
    const hits=(snowShovelHits[key]||0)+1;
    if(hits>=3){delete snowShovelHits[key];clearedSnowTiles.add(key);spawnVisualBurst((tx+.5)*TILE,(ty+.5)*TILE,8,'leaf','#eaf7ff');playSound('stone');toast('Снег убран!');}
    else{snowShovelHits[key]=hits;playSound('stone');toast('Лопата: '+hits+'/3 ударов.');}
    saveGame();return true;
  }
  function shovelSnowNearPlayer(){
    const dir={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[player.face]||[0,1];
    const tx=Math.floor((player.x+dir[0]*TILE*1.25)/TILE),ty=Math.floor((player.y+dir[1]*TILE*1.25)/TILE);
    return shovelSnowAt((tx+.5)*TILE,(ty+.5)*TILE);
  }
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.focus();if(ev.button!==0)return;
    const selectedItem=selectedInventoryItem();
    if(!mineMode&&selectedItem?.name==='Лопата'){
      const rect=canvas.getBoundingClientRect(),screenX=ev.clientX-rect.left,screenY=ev.clientY-rect.top;
      const camX=Math.max(0,Math.min(COLS*TILE-width,player.x-width/2)),camY=Math.max(0,Math.min(ROWS*TILE-height,player.y-height/2));
      shovelSnowAt(screenX+camX,screenY+camY);return;
    }
    if(!mineMode&&placeSelectedStructure(ev))return;if(!mineMode)return;
    const mineHitRect=canvas.getBoundingClientRect(),mineHitX=ev.clientX-mineHitRect.left,mineHitY=ev.clientY-mineHitRect.top;
    const clickedCreature=mineCreatures.find(m=>m.hp>0&&Math.hypot(mineCreatureScreenPosition(m).x-mineHitX,mineCreatureScreenPosition(m).y-mineHitY)<54);
    if(clickedCreature){attackMineCreature(clickedCreature);return;}
    const clickedBarrel=mineBarrels.find(b=>b.hp>0&&Math.hypot(mineRockScreenPosition(b).x-mineHitX,mineRockScreenPosition(b).y-mineHitY)<32);
    if(clickedBarrel){
      const barrelWorld=mineFeatureWorldPosition(clickedBarrel);if(Math.hypot(barrelWorld.x-minePlayerX,barrelWorld.y-minePlayerY)>112){toast('Подойди ближе к бочке.');return;}
      if(minePlayerAttackCooldown>0){toast('Подожди завершения удара.');return;}
      minePlayerAttackCooldown=.28;strikeMineBarrel(clickedBarrel);return;
    }
    if(!selectedItem||!['Кирка','Улучшенная кирка','Кирка мастера'].includes(selectedItem.name)){toast('Для добычи выбери кирку в инвентаре.');return;}
    const rect=canvas.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;let target=null,bd=38;
    for(const r of mineRocks){if(r.hp<=0)continue;const pos=mineRockScreenPosition(r),d=Math.hypot(pos.x-x,pos.y-y);if(d<bd){bd=d;target=r;}}
    if(!target){toast('Наведи курсор прямо на залежь руды или камня.');return;}
    const targetWorld=mineFeatureWorldPosition(target); if(Math.hypot(targetWorld.x-minePlayerX,targetWorld.y-minePlayerY)>4*MINE_CELL_SIZE){toast('Подойди к залежи ближе: дальность кирки — 4 блока.');return;}
    if(queueGuestMineAction(mineRocks.indexOf(target),selectedItem.name))return;
    target.hp=Math.max(0,target.hp-(selectedItem.name==='Кирка мастера'?2:itemCount('Улучшенная кирка')>0?2:1));
    if(target.hp>0){playSound(target.ore==='Железо'?'iron':target.ore==='Уголь'?'coal':'stone');toast('Удар киркой · осталось '+target.hp+' из 2.');saveGame();return;}
    spawnVisualBurst(target.x,target.y,12,'spark',({'Кристалл':'#9ef5ff','Железо':'#c7d6e6','Медь':'#ffc08a','Олово':'#eef4ff','Серебро':'#ffffff','Золото':'#ffe68a','Рубин':'#ff829a','Сапфир':'#9bc8ff','Обсидиан':'#ad8bdf','Мифрил':'#d1ffff','Уран':'#baff7d','Алмаз':'#ffffff'}[target.ore]||'#d8c6a0'));
    const resource=inventoryItems.find(i=>i.name===target.ore),stone=inventoryItems.find(i=>i.name==='Камень');
    playSound(target.ore==='Железо'?'iron':target.ore==='Уголь'?'coal':target.ore==='Кристалл'?'iron':'stone');if(target.ore==='Камень'){changeItem('Камень',1);}else{changeItem(target.ore,1);if(['Уголь','Железо','Медь','Олово','Серебро','Золото','Рубин','Сапфир','Обсидиан','Мифрил','Уран','Алмаз'].includes(target.ore))changeItem('Камень',1);}
    const professionOreBonus=window.SkyRealmJobs?.rollBonus?.('miner')===true;
    const bonusOre=professionOreBonus||Math.random()<Math.min(.85,(skills.miner*.08)+(classHas('miner')?0.2:0)+(isModInstalled('miners_luck')?0.15:0)+(isModInstalled('geology_scanner')?.10:0));
    if(bonusOre)changeItem(target.ore,1);
    window.SkyRealmJobs?.record?.('miner',1);
    trackAdventureQuest('mining',1);renderInventory();awardXP(target.ore==='Кристалл'?18:target.ore==='Железо'?10:6,'добыча в шахте');saveGame();toast('Добыто: '+target.ore+' ×'+(bonusOre?2:1)+(target.ore==='Камень'||target.ore==='Кристалл'?'':' и камень ×1')+(professionOreBonus?' · бонус рудокопа':''));
  });
  document.getElementById('pause').addEventListener('click', () => { if(hudMoveMode)finishHudMoveMode();if(!inMainMenu)setPaused(true); });
  document.getElementById('resume').addEventListener('click', () => setPaused(false));
  document.getElementById('return-to-world-menu').addEventListener('click',returnToMainMenu);
  document.getElementById('open-world-settings').addEventListener('click',()=>{document.getElementById('pause-shade').hidden=true;document.getElementById('world-early-monsters').checked=worldEarlyMonsters;document.getElementById('world-settings-shade').hidden=false;});
  document.getElementById('save-world-settings').addEventListener('click',()=>{worldEarlyMonsters=document.getElementById('world-early-monsters').checked;saveGame();document.getElementById('world-settings-shade').hidden=true;document.getElementById('pause-shade').hidden=false;showPauseMain();setPaused(true);toast('Настройки мира сохранены.');});
  document.getElementById('close-world-settings').addEventListener('click',()=>{document.getElementById('world-settings-shade').hidden=true;document.getElementById('pause-shade').hidden=false;setPaused(true);showPauseMain();});
  document.getElementById('open-game-settings').addEventListener('click',()=>{settingsOpenedFromMainMenu=false;document.getElementById('pause-main-view').hidden=true;document.getElementById('pause-settings-view').hidden=false;syncSettingsControls();});
  document.getElementById('menu-music-toggle').addEventListener('click',()=>{setSkyMusic(!skyMusicEnabled);playSound('tap');});
  // Gentle interface feedback; world/action sounds retain their existing individual handlers.
  document.querySelectorAll('.main-menu-action,.action,.pause-button,.game-settings-tab').forEach(button=>button.addEventListener('click',()=>playSound('tap')));
  document.getElementById('menu-create-world').addEventListener('click',openWorldCreate);
  document.getElementById('menu-mods').addEventListener('click',openModsCatalog);
  function setStudioInstallStatus(message,error=false){const node=document.getElementById('studio-install-status');if(node){node.textContent=message||'';node.classList.toggle('error',!!error);}}
  function closeStudioInstallDialog(){const shade=document.getElementById('studio-install-shade');if(shade){shade.hidden=true;shade.setAttribute('aria-hidden','true');}}
  function showStudioInstallDialog(){const shade=document.getElementById('studio-install-shade');if(!shade)return;setStudioInstallStatus('');shade.hidden=false;shade.setAttribute('aria-hidden','false');}
  async function openSkyRealmStudio(){
    const nativeApi=window.pywebview?.api;
    if(!nativeApi?.check_mod_studio){showStudioInstallDialog();setStudioInstallStatus('Запусти игру через Windows-лаунчер SkyRealm, чтобы проверить приложение.',true);return;}
    setStudioInstallStatus('Проверяем, установлена ли SkyRealmStudio…');
    try{
      const check=await nativeApi.check_mod_studio();
      if(check?.installed){setStudioInstallStatus('Студия найдена. Запускаем…');const launched=await nativeApi.launch_mod_studio();if(!launched?.ok)throw new Error(launched?.message||'Не удалось запустить студию.');setStudioInstallStatus('SkyRealmStudio запущена.');return;}
      showStudioInstallDialog();
    }catch(error){showStudioInstallDialog();setStudioInstallStatus(error?.message||'Не удалось проверить приложение.',true);}
  }
  async function installSkyRealmStudio(){
    const yes=document.getElementById('studio-install-yes'),no=document.getElementById('studio-install-no');
    if(yes)yes.disabled=true;if(no)no.disabled=true;setStudioInstallStatus('Скачиваем SkyRealmStudio с официального GitHub-релиза. Это может занять несколько минут…');
    try{
      const result=await window.pywebview.api.install_mod_studio();
      if(!result?.ok)throw new Error(result?.message||'Установка не завершилась.');
      setStudioInstallStatus('Готово! SkyRealmStudio установлена и запущена.');
      setTimeout(closeStudioInstallDialog,1400);
    }catch(error){setStudioInstallStatus(error?.message||'Не удалось установить приложение. Проверь интернет и повтори попытку.',true);}
    finally{if(yes)yes.disabled=false;if(no)no.disabled=false;}
  }
  document.getElementById('studio-install-yes')?.addEventListener('click',installSkyRealmStudio);
  document.getElementById('studio-install-no')?.addEventListener('click',closeStudioInstallDialog);
  document.getElementById('studio-install-shade')?.addEventListener('click',event=>{if(event.target===event.currentTarget)closeStudioInstallDialog();});
  document.getElementById('open-script-mod-creator')?.addEventListener('click',openSkyRealmStudio);
  window.addEventListener('skyrealm:open-mod-studio',openSkyRealmStudio);

  document.getElementById('close-mods-catalog').addEventListener('click',closeModsCatalog);
  document.getElementById('open-mod-creator')?.addEventListener('click',openModCreator);document.getElementById('close-mod-creator')?.addEventListener('click',closeModCreator);document.getElementById('community-mod-form')?.addEventListener('submit',publishCommunityMod);
   document.getElementById('world-search')?.addEventListener('input',renderWorldList);
   document.getElementById('world-sort')?.addEventListener('change',renderWorldList);
   document.getElementById('world-filter')?.addEventListener('change',renderWorldList);
   document.getElementById('import-world-button').addEventListener('click',()=>document.getElementById('import-world-file').click());
   document.getElementById('import-world-file').addEventListener('change',e=>{const file=e.target.files&&e.target.files[0];if(file)importWorldBackupFile(file);else e.target.value='';});
  document.getElementById('empty-create-world').addEventListener('click',openWorldCreate);
  document.getElementById('world-create-cancel').addEventListener('click',closeWorldCreate);
  document.getElementById('world-create-form').addEventListener('submit',e=>{e.preventDefault();createWorld(document.getElementById('world-name-input').value);});
  document.getElementById('world-rename-cancel').addEventListener('click',closeRenameWorld);
  document.getElementById('world-rename-form').addEventListener('submit',e=>{e.preventDefault();renameWorld(document.getElementById('world-rename-input').value);});
  const avatarShade=document.getElementById('character-editor-shade');
  function syncAvatarPreview(){const doll=document.getElementById('avatar-doll');if(!doll)return;doll.style.setProperty('--skin',document.getElementById('avatar-skin').value);doll.style.setProperty('--hair',document.getElementById('avatar-hair').value);doll.style.setProperty('--armor',document.getElementById('avatar-armor').value);doll.style.setProperty('--accent',document.getElementById('avatar-accent').value);doll.style.setProperty('--eye',document.getElementById('avatar-eye').value);doll.dataset.face=document.getElementById('avatar-face').value;doll.dataset.hair=document.getElementById('avatar-hairStyle').value;}
  function openCharacterEditor(onEntry=false){renderCosmeticCollection();avatarEntryMode=!!onEntry;if(avatarEntryMode){paused=true;keys.clear();pressedMovementCodes.clear();}for(const k of Object.keys(DEFAULT_PLAYER_APPEARANCE)){const el=document.getElementById('avatar-'+k);if(el)el.value=playerAppearance[k]||DEFAULT_PLAYER_APPEARANCE[k];}syncAvatarPreview();const title=document.getElementById('character-editor-title'),desc=avatarShade.querySelector('p'),save=document.getElementById('avatar-save'),close=document.getElementById('avatar-close');if(avatarEntryMode){title.textContent='Настрой персонажа перед путешествием';desc.textContent='Перед входом в мир выбери скин. Образ можно будет изменить позже через меню персонажа.';save.textContent='Сохранить и войти в мир';close.textContent='Войти без изменений';}else{title.textContent='Редактор персонажа';desc.textContent='Настрой внешний вид героя. Изменения сохраняются на этом компьютере и применяются во всех мирах.';save.textContent='Сохранить образ';close.textContent='Закрыть';}avatarShade.hidden=false;avatarShade.setAttribute('aria-hidden','false');}
  function finishCharacterEditor(saveChanges){if(saveChanges){for(const k of Object.keys(DEFAULT_PLAYER_APPEARANCE))playerAppearance[k]=document.getElementById('avatar-'+k).value;localStorage.setItem('skyrealm_character_v1',JSON.stringify(playerAppearance));saveGame();draw(0,performance.now());}avatarShade.hidden=true;avatarShade.setAttribute('aria-hidden','true');const wasEntry=avatarEntryMode;avatarEntryMode=false;if(wasEntry){paused=false;last=performance.now();canvas.focus();if(!localStorage.getItem('skyrealm_tutorial_seen_v1'))setTimeout(()=>{if(!inMainMenu&&!paused)openTutorial();},220);else if(!localStorage.getItem('skyrealm_player_class_v1'))setTimeout(()=>{if(!inMainMenu&&!paused)openClassSelection(true);},300);}if(saveChanges)toast('Образ персонажа сохранён!');}
  ['skin','hair','armor','accent','eye','face','hairStyle'].forEach(k=>document.getElementById('avatar-'+k).addEventListener('change',syncAvatarPreview));
  document.getElementById('menu-character').addEventListener('click',()=>openCharacterEditor(false));
  document.getElementById('inventory-tab-equipment').addEventListener('click',()=>{inventoryTab='equipment';renderInventoryTab();});
  document.getElementById('skills-open').addEventListener('click',openSkillTree);
  const classMenuButton=document.getElementById('class-select-open');if(classMenuButton)classMenuButton.addEventListener('click',()=>openClassSelection(false));
  document.getElementById('skills-open-equipment').addEventListener('click',openSkillTree);
  document.getElementById('skill-tree-close').addEventListener('click',()=>{setPanelOpen('skill-tree-shade',false);if(skillTreeReturnToPause){paused=true;document.getElementById('pause-shade').hidden=false;}else paused=false;skillTreeReturnToPause=false;last=performance.now();canvas.focus();});
  document.getElementById('storage-close').addEventListener('click',closeStorage);
  document.getElementById('avatar-close').addEventListener('click',()=>finishCharacterEditor(false));
  document.getElementById('avatar-save').addEventListener('click',()=>finishCharacterEditor(true));
  document.getElementById('avatar-reset').addEventListener('click',()=>{for(const k of Object.keys(DEFAULT_PLAYER_APPEARANCE))document.getElementById('avatar-'+k).value=DEFAULT_PLAYER_APPEARANCE[k];syncAvatarPreview();});
  document.getElementById('menu-settings').addEventListener('click',openSettingsFromMainMenu);
  document.getElementById('menu-exit').addEventListener('click',()=>{if(window.pywebview?.api?.close)window.pywebview.api.close();else{toast('Закрой окно браузера, чтобы выйти из игры.');}});
  document.getElementById('menu-admin').addEventListener('click',openAdminGate);
  document.getElementById('admin-password-cancel').addEventListener('click',closeAdminGate);
  document.getElementById('admin-password-form').addEventListener('submit',e=>{e.preventDefault();submitAdminPassword();});
  document.getElementById('menu-moderator').addEventListener('click',openModeratorPanel);
  document.getElementById('inventory-tab-items').addEventListener('click',()=>{inventoryTab='items';renderInventoryTab();});
  document.getElementById('inventory-tab-quests').addEventListener('click',()=>{tutorialQuestSeen=true;inventoryTab='quests';questPanelVisible=true;renderInventoryTab();});
  document.getElementById('inventory-quest-toggle').addEventListener('click',()=>{questPanelVisible=!questPanelVisible;if(!questPanelVisible)inventoryTab='items';else inventoryTab='quests';renderInventoryTab();});
  document.getElementById('tutorial-close').addEventListener('click',closeTutorial);
  document.getElementById('tutorial-next').addEventListener('click',nextTutorialStep);
  document.getElementById('pause-admin-tools').addEventListener('click',()=>{panelReturnToPause=true;document.getElementById('pause-shade').hidden=true;openAdminGate();});
  document.getElementById('pause-moderator-tools').addEventListener('click',()=>{panelReturnToPause=true;document.getElementById('pause-shade').hidden=true;openModeratorPanel();});
  document.getElementById('admin-panel-close').addEventListener('click',()=>{setPanelOpen('admin-panel-shade',false);renderWorldList();if(panelReturnToPause){panelReturnToPause=false;setPaused(true);}});
  document.getElementById('moderator-panel-close').addEventListener('click',()=>{setPanelOpen('moderator-panel-shade',false);if(panelReturnToPause){panelReturnToPause=false;setPaused(true);}});
  document.getElementById('admin-heal').addEventListener('click',healPlayer);
  document.getElementById('mod-heal').addEventListener('click',healPlayer);
  document.getElementById('admin-immortal').addEventListener('click',()=>toggleImmortal('admin-immortal'));
  document.getElementById('mod-immortal').addEventListener('click',()=>toggleImmortal('mod-immortal'));
  document.getElementById('admin-give-resource').addEventListener('click',()=>giveResource('admin'));
  document.getElementById('mod-give-resource').addEventListener('click',()=>giveResource('mod'));
  document.getElementById('admin-best-set').addEventListener('click',()=>grantBestSet('admin'));
  document.getElementById('mod-best-set').addEventListener('click',()=>grantBestSet('mod'));
  document.getElementById('admin-best-sword').addEventListener('click',()=>grantBestWeapon('admin'));
  document.getElementById('mod-best-sword').addEventListener('click',()=>grantBestWeapon('mod'));
  document.getElementById('admin-max-upgrade').addEventListener('click',()=>maxUpgradeGear('admin'));
  document.getElementById('mod-max-upgrade').addEventListener('click',()=>maxUpgradeGear('mod'));
  document.getElementById('admin-skip-day').addEventListener('click',()=>skipGameDay(true));
  document.getElementById('mod-skip-day').addEventListener('click',()=>skipGameDay(true));
  document.getElementById('admin-set-day').addEventListener('click',()=>setGameTime(12*60));
  document.getElementById('admin-set-night').addEventListener('click',()=>setGameTime(22*60));
  document.getElementById('mod-set-day').addEventListener('click',()=>setGameTime(12*60));
  document.getElementById('mod-set-night').addEventListener('click',()=>setGameTime(22*60));
  document.getElementById('admin-spawn-monster').addEventListener('click',spawnAdminMonster);
  document.getElementById('mod-spawn-monster').addEventListener('click',spawnAdminMonster);
  document.getElementById('admin-clear-monsters').addEventListener('click',clearAdminMonsters);
  document.getElementById('mod-clear-monsters').addEventListener('click',clearAdminMonsters);
  document.getElementById('admin-open-map').addEventListener('click',()=>{setPanelOpen('admin-panel-shade',false);openFullMap();});
  document.getElementById('mod-open-map').addEventListener('click',()=>{setPanelOpen('moderator-panel-shade',false);openFullMap();});
  document.getElementById('admin-ban-add').addEventListener('click',()=>addLocalBan('admin-ban-name','admin-ban-list'));
  document.getElementById('mod-ban-add').addEventListener('click',()=>addLocalBan('mod-ban-name','mod-ban-list'));
  document.getElementById('full-map-close').addEventListener('click',closeFullMap);
  document.getElementById('full-map-canvas').addEventListener('click',teleportFromMap);
  document.getElementById('admin-refresh-worlds').addEventListener('click',()=>{renderWorldList();refreshAdminStats();renderBanList('admin-ban-list');toast('Список миров обновлён.');});
  document.getElementById('admin-staff-grant').addEventListener('click',()=>changeStaffModerator('grant'));
  document.getElementById('admin-staff-revoke').addEventListener('click',()=>changeStaffModerator('revoke'));
  document.getElementById('admin-staff-refresh').addEventListener('click',loadStaffPlayers);
  document.getElementById('admin-privileges-open').addEventListener('click',openPrivilegesPanel);
  document.getElementById('menu-privileges').addEventListener('click',openPrivilegesPanel);
  document.getElementById('admin-privileges-grant').addEventListener('click',()=>submitPlayerRole('grant'));
  document.getElementById('admin-privileges-bootstrap').addEventListener('click',claimAdminBootstrap);
  document.getElementById('admin-privileges-revoke').addEventListener('click',()=>submitPlayerRole('revoke'));
  document.getElementById('admin-public-grants-save').addEventListener('click',savePublicGrantSetting);
  document.getElementById('admin-privileges-close').addEventListener('click',()=>setPanelOpen('admin-privileges-shade',false));
  document.getElementById('back-to-pause').addEventListener('click',returnFromSettings);
  document.querySelectorAll('[data-settings-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-settings-tab]').forEach(tab=>{const active=tab===btn;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false');});
    document.getElementById('graphics-settings-panel').hidden=btn.dataset.settingsTab!=='graphics';
    document.getElementById('interface-settings-panel').hidden=btn.dataset.settingsTab!=='interface';
    const audioPanel=document.getElementById('audio-settings-panel');if(audioPanel)audioPanel.hidden=btn.dataset.settingsTab!=='audio';
  }));
  ['game-quality-select','game-performance-select','game-resolution-select','game-window-mode-select','game-ui-scale-select','show-vitals-toggle','show-quest-toggle','show-controls-toggle','show-inventory-toggle','show-minimap-toggle','hud-layout-select','game-music-enabled-toggle','game-ui-sound-toggle','game-music-volume','game-sfx-volume'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>applyAndSaveSettings(false)));
  document.getElementById('apply-game-settings').addEventListener('click',()=>applyAndSaveSettings(true));
  document.getElementById('toggle-hud-move').addEventListener('click',()=>{if(!hudMoveMode){setHudMoveMode(true);document.getElementById('pause-shade').hidden=true;paused=false;keys.clear();pressedMovementCodes.clear();canvas.focus();}else finishHudMoveMode();});
  document.getElementById('save-world-now').addEventListener('click',()=>{if(saveGame())toast('Мир успешно сохранён.');});
  document.getElementById('open-achievements')?.addEventListener('click',openAchievements);
  document.getElementById('close-achievements')?.addEventListener('click',closeAchievements);
   document.getElementById('exit').addEventListener('click', () => { saveGame(); if (window.pywebview?.api?.close) window.pywebview.api.close(); else { toast('Закрой вкладку, чтобы выйти из игры.'); setPaused(false); } });
  document.getElementById('sign-dialog-close').addEventListener('click', closeSignDialog);
  document.getElementById('sign-dialog-ok').addEventListener('click', closeSignDialog);
  document.getElementById('skip-day-button').addEventListener('click',skipGameDay);
  document.getElementById('eat-meat-button').addEventListener('click',eatMeat);
  document.getElementById('craft-furnace').addEventListener('click',craftFurnace);
  document.getElementById('craft-furnace-workbench').addEventListener('click',craftFurnace);
  document.querySelectorAll('[data-craft]').forEach(b=>b.addEventListener('click',()=>craftEquipment(b.dataset.craft))); 
  // Optional recipe buttons may be absent in older or customized HTML builds.
  document.getElementById('craft-iron-sword')?.addEventListener('click',()=>craftEquipment('sword'));
  document.getElementById('anvil-upgrade-weapon')?.addEventListener('click',()=>upgradeAtAnvil('weapon'));
  document.getElementById('anvil-upgrade-armor')?.addEventListener('click',()=>upgradeAtAnvil('armor'));
  document.getElementById('upgrade-water-helmet')?.addEventListener('click',upgradeWaterHelmet);
  document.querySelectorAll('[data-workbench-page]').forEach(b=>b.addEventListener('click',()=>showWorkbenchPage(Number(b.dataset.workbenchPage))));
  document.getElementById('anvil-enchant-weapon')?.addEventListener('click',enchantWeapon);
  document.getElementById('craft-leather-armor')?.addEventListener('click',()=>craftEquipment('armor'));
  document.getElementById('upgrade-house')?.addEventListener('click',upgradeHouse);
  document.getElementById('upgrade-mine')?.addEventListener('click',upgradeMine);
  document.getElementById('close-workbench').addEventListener('click',closeWorkbench);
  document.getElementById('open-inventory').addEventListener('click', openInventory);
  document.getElementById('close-inventory').addEventListener('click', closeInventory);
  document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.disabled)return;confirmDifficultySelection(btn.dataset.difficulty);}));
  document.getElementById('difficulty-cancel').addEventListener('click',()=>{closeDifficultyPicker();renderWorldList();});
  const launcherModParams=new URLSearchParams(window.location.search);
  if(launcherModParams.get('openMods')==='1'){
    setTimeout(()=>{
      openModsCatalog();
      const requestedMod=launcherModParams.get('installMod');
      if(requestedMod==='__creator__') { window.dispatchEvent(new CustomEvent('skyrealm:open-mod-studio')); return; }
      if(requestedMod&&MOD_CATALOG.some(mod=>mod.id===requestedMod)&&!isModInstalled(requestedMod))toggleMod(requestedMod);
    },350);
  }
  const customModActionBudgets=new Map();
  function customModContext(){return {health:Math.round(player.hp),stamina:Math.round(player.stamina),hunger:Math.round(hunger),level:playerLevel,experience:playerXP,day:Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY),night:isNightTime(),difficulty:currentDifficulty,inHouse,wallet:Math.floor(walletCents/100)};}
  function canRunCustomScriptMods(){return !!currentWorldId&&!inMainMenu&&!paused&&!isCoopWorldSave()&&!isCoopWorldActive();}
  function applyCustomScriptActions(modId,actions){
    if(!canRunCustomScriptMods()||typeof modId!=='string'||!Array.isArray(actions)||actions.length>5)return {ok:false,reason:'Custom scripts are disabled outside single-player worlds.'};
    const now=Date.now();let budget=customModActionBudgets.get(modId);
    if(!budget||now-budget.started>60000){budget={started:now,heal:0,stamina:0,hunger:0,xp:0,gold:0,message:0};customModActionBudgets.set(modId,budget);}
    let applied=0;
    for(const action of actions){
      if(!action||typeof action!=='object'||Array.isArray(action))continue;
      const amount=Number(action.amount);
      if(action.type==='heal'&&Number.isFinite(amount)&&amount>0&&budget.heal<15){const value=Math.min(5,amount,15-budget.heal,100-player.hp);if(value>0){player.hp+=value;budget.heal+=value;applied++;}}
      else if(action.type==='stamina'&&Number.isFinite(amount)&&amount>0&&budget.stamina<24){const value=Math.min(8,amount,24-budget.stamina,100-player.stamina);if(value>0){player.stamina+=value;budget.stamina+=value;applied++;}}
      else if(action.type==='hunger'&&Number.isFinite(amount)&&amount>0&&budget.hunger<12){const value=Math.min(4,amount,12-budget.hunger,100-hunger);if(value>0){hunger+=value;budget.hunger+=value;applied++;}}
      else if(action.type==='xp'&&Number.isFinite(amount)&&amount>0&&budget.xp<24){const value=Math.min(8,Math.floor(amount),24-budget.xp);if(value>0){budget.xp+=value;awardXP(value,'пользовательский мод');applied++;}}
      else if(action.type==='gold'&&Number.isFinite(amount)&&amount>0&&budget.gold<10){const value=Math.min(3,amount,10-budget.gold);if(value>0){walletCents+=Math.round(value*100);budget.gold+=value;updateWalletHud();applied++;}}
      else if(action.type==='message'&&typeof action.text==='string'&&budget.message<1){const message=action.text.trim().slice(0,90);if(message){budget.message=1;toast('Мод: '+message);applied++;}}
    }
    if(applied){updateVitals();updateClockDisplay(true);saveGame();}
    return {ok:true,applied};
  }
  window.SkyRealmCustomModHost={getContext:customModContext,canRun:canRunCustomScriptMods,applyActions:applyCustomScriptActions};
  window.SkyRealmSeaBridge={getWorldId:()=>currentWorldId,getPlayerPosition:()=>({x:player.x,y:player.y}),getWorldBounds:()=>({width:COLS*TILE,height:ROWS*TILE}),getBiomeAt:(x,y)=>biomeAt(Number(x)/TILE,Number(y)/TILE),isBossRealm:()=>!!bossRealmMode,getBossForestPosition:()=>bossRealmGrovePosition(),startBossForestTrial:()=>startBossRealmForestTrial(),getBossForestTrialRemaining:()=>countBossRealmForestTrial(),isCaveMode:()=>!!caveMode,isMineMode:()=>!!mineMode,isHouseMode:()=>!!inHouse,isDungeonMode:()=>!!dungeonMode,isCoopWorld:()=>isCoopWorldSave(),
    spawnVillageGuardian:(eventId,x,y)=>{
      if(isCoopWorldSave()||bossRealmMode||monsters.length>=12||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return false;
      const before=monsters.length;if(!spawnMonster('brute'))return false;
      const mob=monsters[before];if(!mob)return false;
      let placed=false;
      for(let attempt=0;attempt<40;attempt++){
        const angle=Math.random()*Math.PI*2,radius=105+Math.random()*65;
        const px=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,Number(x)+Math.cos(angle)*radius));
        const py=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,Number(y)+Math.sin(angle)*radius));
        if(waterAt(px/TILE,py/TILE)||blocked(px,py))continue;
        mob.x=px;mob.y=py;placed=true;break;
      }
      if(!placed){monsters.splice(before,1);return false;}
      mob.hp=mob.maxHp=250;mob.speed=155/1.3;mob.damageScale=1;mob.attackCooldown=0;mob.specialCooldown=999;
      mob.villageGuardian=true;mob.villageGuardianAttackTimer=0;mob.expansionEventId=String(eventId).slice(0,160);
      mob.expansionEventDefeated=false;mob.eventBeaconX=Number(x);mob.eventBeaconY=Number(y);
      mob.bossTitle='ВЕЛИКИЙ СТРАЖ ДЕРЕВНИ';mob.adminSpawned=true;mob.territoryX=Number(x);mob.territoryY=Number(y);mob.territoryRadius=520;
      spawnVisualBurst(mob.x,mob.y,22,'spark','#f3c66d');drawMinimap();saveGame();return true;
    },
    upgradeNearestVillageWatchtower:(villageId)=>{if(!tradeWorldMode||isCoopWorldSave())return false;const center=villageCenters.find(v=>String(v.id||'')===String(villageId));if(!center)return false;const tower=placedStructures.filter(v=>v.type==='village-watchtower'&&String(v.villageId||'')===String(villageId)).sort((a,b)=>Math.hypot(a.x-(center.x*TILE+16),a.y-(center.y*TILE+16))-Math.hypot(b.x-(center.x*TILE+16),b.y-(center.y*TILE+16)))[0];if(!tower){toast('Сначала построй сторожевую башню в этом поселении.');return false;}const level=Math.max(1,Math.min(3,Math.floor(Number(tower.watchtowerLevel)||1)));if(tower.hp<=0){const costs={'Древесина':20,'Камень':12,'Железо':5};for(const [name,n] of Object.entries(costs)){const item=inventoryItems.find(v=>v.name===name);if(!item||item.count<n){toast('Для ремонта нужно '+name+' ×'+n+'.');return false;}}for(const [name,n] of Object.entries(costs))changeItem(name,-n);tower.hp=Math.round(tower.maxHp*.55);tower.watchtowerCooldown=.5;toast('Башня отремонтирована до '+tower.hp+'/'+tower.maxHp+' HP.');}else{if(level>=3){toast('Башня уже достигла максимального III уровня.');return false;}const costs=level===1?{'Древесина':40,'Камень':30,'Железо':12}:{'Древесина':65,'Камень':50,'Железо':24};for(const [name,n] of Object.entries(costs)){const item=inventoryItems.find(v=>v.name===name);if(!item||item.count<n){toast('Для улучшения до уровня '+(level+1)+' нужно '+name+' ×'+n+'.');return false;}}for(const [name,n] of Object.entries(costs))changeItem(name,-n);tower.watchtowerLevel=level+1;tower.maxHp=360+(tower.watchtowerLevel-1)*120;tower.hp=Math.min(tower.maxHp,tower.hp+120);tower.watchtowerCooldown=0;spawnVisualBurst(tower.x,tower.y,20,'spark','#9fe8ff');toast('СТОРОЖЕВАЯ БАШНЯ УЛУЧШЕНА ДО УРОВНЯ '+tower.watchtowerLevel+'!');}renderInventory();saveGame();return true;},
    spawnEventEnemies:(eventId,x,y,count=6)=>{
      if(isCoopWorldSave())return 0;
      const wanted=Math.max(0,Math.min(8,Math.floor(Number(count)||0))),limit=Math.min(wanted,Math.max(0,12-monsters.length));let spawned=0;
      for(let i=0;i<limit;i++){
        const before=monsters.length,type=i===limit-1?'brute':i%3===0?'wisp':'skeleton';
        if(!spawnMonster(type))break;
        const mob=monsters[before];if(!mob)continue;
        for(let attempt=0;attempt<28;attempt++){
          const angle=Math.random()*Math.PI*2,radius=90+Math.random()*150;
          const px=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,Number(x)+Math.cos(angle)*radius));
          const py=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,Number(y)+Math.sin(angle)*radius));
          if(waterAt(px/TILE,py/TILE)||blocked(px,py))continue;
          mob.x=px;mob.y=py;break;
        }
        mob.adminSpawned=true;mob.expansionEventId=String(eventId);mob.expansionEventDefeated=false;mob.eventBeaconX=Number(x)||0;mob.eventBeaconY=Number(y)||0;
        spawned++;
      }
      drawMinimap();saveGame();return spawned;
    },
    spawnForestTreeMonster:(eventId,x,y)=>{
      if(isCoopWorldSave()||bossRealmMode||monsters.length>=12)return false;
      const before=monsters.length;if(!spawnMonster('brute'))return false;const mob=monsters[before];if(!mob)return false;
      mob.x=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,Number(x)||player.x+90));mob.y=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,Number(y)||player.y));
      mob.hp=mob.maxHp=Math.round(260*difficultyConfig().monsterHp);mob.speed=39;mob.damageScale=1.12;mob.bossTitle='ДРЕВОДЕМОН';mob.forestTreant=true;mob.expansionEventId=String(eventId);mob.territoryX=mob.x;mob.territoryY=mob.y;mob.territoryRadius=9*TILE;mob.specialCooldown=2;mob.attackCooldown=.8;return true;
    },
    spawnForestMiniBoss:(type,eventId,x,y)=>{
      if(isCoopWorldSave()||bossRealmMode||monsters.length>=12||!['brute','yeti','ember'].includes(String(type)))return false;
      const before=monsters.length;if(!spawnMonster(String(type)))return false;const mob=monsters[before];if(!mob)return false;
      mob.x=Math.max(TILE*2,Math.min(COLS*TILE-TILE*2,Number(x)||player.x+260));mob.y=Math.max(TILE*2,Math.min(ROWS*TILE-TILE*2,Number(y)||player.y+80));
      mob.hp=mob.maxHp=Math.round(780*difficultyConfig().monsterHp);mob.speed=Math.max(30,(mob.speed||42)*.9);mob.damageScale=1.28;mob.bossTitle=String(type)==='yeti'?'ЛЕДЯНОЙ ВЕЛИКАН':String(type)==='ember'?'ПЕПЕЛЬНЫЙ ВОЖДЬ':'СТРАЖ ДРЕВНЕГО ЛЕСА';mob.forestMiniBoss=true;mob.forestPhase=1;mob.expansionEventId=String(eventId);mob.territoryX=mob.x;mob.territoryY=mob.y;mob.territoryRadius=12*TILE;mob.specialCooldown=1.8;mob.attackCooldown=.8;return true;
    },
    getEventEnemyPosition:eventId=>{const m=monsters.find(v=>String(v.expansionEventId||'')===String(eventId));return m?{x:m.x,y:m.y}:null;},
    getEventEnemySnapshot:eventId=>{const m=monsters.find(v=>String(v.expansionEventId||'')===String(eventId));return m?{x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp,phase:m.forestPhase||1}:null;},
    getEventEnemyCount:eventId=>monsters.filter(m=>String(m.expansionEventId||'')===String(eventId)).length,
    damageEventEnemy:(eventId,damage)=>{
      const target=monsters.find(m=>String(m.expansionEventId||'')===String(eventId));if(!target)return false;
      target.hp=Math.max(0,target.hp-Math.max(1,Number(damage)||1));target.flash=.2;spawnVisualBurst(target.x,target.y,8,'spark','#83eaff');
      if(target.hp<=0){const index=monsters.indexOf(target);if(index>=0)monsters.splice(index,1);notifyExpansionEnemyDefeated(target);dropMonsterLoot(target);awardXP(24,'автоматическая турель');trackAdventureQuest('hunt',1,false);saveGame();}
      return true;
    },
    clearEventEnemies:eventId=>{
      let removed=0;for(let i=monsters.length-1;i>=0;i--)if(String(monsters[i].expansionEventId||'')===String(eventId)){monsters.splice(i,1);removed++;}
      if(removed){drawMinimap();saveGame();}return removed;
    },getWorldEventSpawnPoint:()=>findWorldEventPoint(240,480)||{x:Math.max(TILE,Math.min(COLS*TILE-TILE,player.x+TILE*4)),y:Math.max(TILE,Math.min(ROWS*TILE-TILE,player.y))},placeExpansionStructure:type=>{const allowed=['generator','battery','lamp','turret','guardpost','trap','drill','shield','wall','solar','processor'];if(!allowed.includes(String(type)))return false;if(isCoopWorldSave()){toast('Технологические постройки пока доступны только в одиночных мирах.');return false;}const structureType='tech-'+type;for(let ring=3;ring<=8;ring++){for(let step=0;step<24;step++){const angle=step*Math.PI/12,x=Math.round((player.x+Math.cos(angle)*ring*TILE)/TILE)*TILE+16,y=Math.round((player.y+Math.sin(angle)*ring*TILE)/TILE)*TILE+16;if(!canPlaceAt(x,y,true))continue;placedStructures.push({type:structureType,x,y,stage:0,growSeconds:0,contents:{},crop:null,moisture:0,fertilized:false});window.SkyRealmJobs?.record?.('builder',1);saveGame();drawMinimap();return true;}}toast('Рядом нет свободного места. Освободи участок и попробуй снова.');return false;},getGameMinuteTotal:()=>gameMinuteTotal,getGold:()=>Math.floor(walletCents/100),getStats:()=>({level:playerLevel,hp:Math.round(player.hp),weaponDamage:weaponDamage(),gold:Math.floor(walletCents/100),difficulty:currentDifficulty}),restoreHealth:()=>{player.hp=100;updateVitals();saveGame();return true;},upgradeArtifact:()=>upgradeEquippedArtifact(),isModInstalled:id=>isModInstalled(String(id||'')),recordProfession:(id,amount=1)=>window.SkyRealmJobs?.record?.(String(id||''),amount)===true,spendItem:(name,count=1)=>{const amount=Math.max(1,Math.floor(Number(count)||1));if(itemCount(String(name))<amount)return false;const ok=changeItem(String(name),-amount);if(ok){renderInventory();saveGame();}return ok;},spendGold:amount=>{const cost=Math.max(0,Math.floor(Number(amount)||0))*100;if(walletCents<cost)return false;walletCents-=cost;updateWalletHud();saveGame();return true;},getChallengeSnapshot:()=>({worldId:currentWorldId,difficulty:currentDifficulty,paused:paused||inMainMenu||window.SkyRealmCoopClient?.getRoomState?.()?.status==='paused',gameMinuteTotal,day:Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY),survivedNights,level:playerLevel,hp:Math.round(player.hp),exploredCells:exploredCells.size,totalCells:Math.max(1,COLS*ROWS),items:Object.fromEntries(inventoryItems.map(i=>[i.name,i.count])),caveBossDefeated,dungeonClearedRooms:[...dungeonClearedRooms],dungeonChestOpened,biomeBosses:Object.fromEntries(Object.entries(biomeBosses||{}).map(([id,v])=>[id,!!v?.defeated]))}),isBossRealm:()=>!!bossRealmMode,getBossRealmSnapshot:()=>({kills:Math.max(0,Number(bossRealmState.kills)||0),wave:Math.max(1,Number(bossRealmState.wave)||1),awakenedTrees:Math.max(0,Number(bossRealmState.awakenedTrees)||0),defeatedBosses:bossRealmState.defeatedBosses.length,defeatedGods:bossRealmState.defeatedGods.length,defeatedBossNames:bossRealmState.defeatedBosses.map(id=>BOSS_REALM_CREATURES[id]?.name||id),defeatedGodNames:bossRealmState.defeatedGods.map(id=>BOSS_REALM_CREATURES[id]?.name||id)}),isSpecialWorldMode:()=>!!(caveMode||mineMode||inHouse||dungeonMode),spawnBossRealmCreature:(type,x,y)=>{if(!bossRealmMode||isCoopWorldSave()||!['rift_warden','root_eater'].includes(String(type)))return false;return spawnBossRealmCreature('rift_warden',Number.isFinite(Number(x))?Number(x):player.x+150,Number.isFinite(Number(y))?Number(y):player.y);},hasItem:name=>itemCount(name)>0,getItemCount:name=>itemCount(name),getGold:()=>Math.floor(walletCents/100),spendGold:amount=>{const cost=Math.max(0,Math.floor(Number(amount)||0))*100;if(walletCents<cost)return false;walletCents-=cost;updateWalletHud();saveGame();return true;},spendItem:(name,count=1)=>{const amount=Math.max(1,Math.floor(Number(count)||1));if(!changeItem(name,-amount))return false;renderInventory();saveGame();return true;},addItem:(name,count=1,description='Морская находка')=>{const seaIcons={'Карта сокровищ':'🗺️','Компас приливов':'🧭','Плащ морского странника':'🧥','Кольцо глубин':'💍','Коралловая корона':'👑','Сфера прилива':'🔵','Сапоги волн':'🥾','Перо штормового ската':'🪶','Морской талисман':'🔱','Трезубец прилива':'🔱','Гарпун бури':'⚡','Клинок бездны':'🌊','Сердце прилива':'❤️','Око бездны':'👁️','Ключ великой сокровищницы':'🗝️','Корона двух морей':'👑','Реликвия древних глубин':'🔱'};let item=inventoryItems.find(i=>i.name===name);if(!item){item={name,icon:seaIcons[name]||'✨',count:0,description};inventoryItems.push(item);}item.count+=Math.max(1,Math.floor(Number(count)||1));renderInventory();saveGame();return item.count;},changeItem:(name,count)=>changeItem(name,count),addGold:cents=>{walletCents=Math.max(0,walletCents+Math.max(0,Math.floor(Number(cents)||0)));updateWalletHud();saveGame();},getWaterHelmetLevel:()=>waterHelmetLevel,getDifficulty:()=>currentDifficulty,getGameDay:()=>Math.floor(gameMinuteTotal/GAME_MINUTES_PER_DAY),getSeasonInfo:()=>({...seasonInfo()}),getWeather:()=>weatherMode,getFishCaught:()=>fishCaught,isTradeWorld:()=>!!tradeWorldMode,getVillageCenters:()=>Array.isArray(villageCenters)?villageCenters.map(v=>({id:String(v.id||''),x:v.x*TILE+16,y:v.y*TILE+16})):[],
    getVillageStructureCounts:(villageId)=>{const list=placedStructures.filter(s=>String(s.villageId||'')===String(villageId));return {houses:list.filter(s=>s.type==='house').length,storages:list.filter(s=>s.type==='storage').length,watchtowers:list.filter(s=>s.type==='village-watchtower').length,watchtowerLevels:list.filter(s=>s.type==='village-watchtower').map(s=>Math.max(1,Number(s.watchtowerLevel)||1)),watchtowerHealth:list.filter(s=>s.type==='village-watchtower').map(s=>({hp:Math.max(0,Number(s.hp)||0),maxHp:Math.max(1,Number(s.maxHp)||360)})),watchtowerKills:list.filter(s=>s.type==='village-watchtower').reduce((sum,s)=>sum+Math.max(0,Number(s.watchtowerKills)||0),0)};},
    buildVillageStructure:(villageId,kind)=>{
      if(isCoopWorldSave()||bossRealmMode||!tradeWorldMode||!['house','storage','watchtower'].includes(String(kind))){if(!tradeWorldMode)toast('Перейди в Мир торговли, чтобы строить возле деревень.');return false;}
      const center=villageCenters.find(v=>String(v.id||'')===String(villageId));if(!center)return false;
      const costs=kind==='house'?{'Древесина':24,'Камень':12}:kind==='storage'?{'Древесина':12,'Камень':8}:{'Древесина':30,'Камень':20,'Железо':8};
      for(const [name,amount] of Object.entries(costs)){const item=inventoryItems.find(v=>v.name===name);if(!item||item.count<amount){toast('Не хватает ресурсов для постройки: '+name+' ×'+amount+'.');return false;}}
      const baseX=center.x*TILE+16,baseY=center.y*TILE+16;
      const existing=placedStructures.filter(s=>String(s.villageId||'')===String(villageId));
      const offsets=kind==='house'?[[760,430],[800,-420],[-780,430],[-820,-420],[0,650]]:kind==='storage'?[[690,500],[-700,500],[690,-500],[-700,-500],[0,720]]:[[0,-650],[0,760],[850,0],[-850,0],[930,520]];
      let spot=null;
      for(const [ox,oy] of offsets){const x=baseX+ox,y=baseY+oy;if(existing.some(v=>Math.hypot(v.x-x,v.y-y)<90))continue;const valid=tradeWorldMode?(x>TILE*2&&y>TILE*2&&x<COLS*TILE-TILE*2&&y<ROWS*TILE-TILE*2&&!placedStructures.some(v=>Math.hypot(v.x-x,v.y-y)<95)&&![SELL_SHOP,BUY_SHOP,FARMER_SHOP].some(shop=>Math.hypot(shop.x*TILE+16-x,shop.y*TILE+16-y)<105)):canPlaceAt(x,y,true);if(!valid)continue;spot={x,y};break;}
      if(!spot){toast('Вокруг деревни нет свободной площадки.');return false;}
      for(const [name,amount] of Object.entries(costs))changeItem(name,-amount);
      placedStructures.push({type:kind==='watchtower'?'village-watchtower':kind,x:spot.x,y:spot.y,stage:0,growSeconds:0,contents:{},crop:null,moisture:0,fertilized:false,villageId:String(villageId),hp:kind==='house'?180:kind==='storage'?110:kind==='watchtower'?360:220,maxHp:kind==='house'?180:kind==='storage'?110:kind==='watchtower'?360:220,watchtowerLevel:kind==='watchtower'?1:undefined,watchtowerCooldown:kind==='watchtower'?1:undefined,watchtowerAngle:kind==='watchtower'?-Math.PI/2:undefined,watchtowerKills:0});
      window.SkyRealmJobs?.record?.('builder',1);renderInventory();saveGame();drawMinimap();
      spawnVisualBurst(spot.x,spot.y,16,'spark',kind==='watchtower'?'#f3cf86':'#d7b17b');
      toast((kind==='house'?'Новый дом построен':kind==='storage'?'Деревенское хранилище построено':'Сторожевая башня построена')+'!');return true;
    },isNightTime:()=>isNightTime(),petAttackNearest:(damage)=>{if(isCoopWorldSave())return false;const p=player,amount=Math.max(1,Math.min(350,Math.round((Number(damage)||1)*1.35)));let target=null,best=156;for(const m of monsters){if(!m||m.hp<=0||m.boss||m.isBoss)continue;const tier=m.bossRealmCreature?BOSS_REALM_CREATURES[m.realmType]?.tier:null;if(tier==='boss'||tier==='god')continue;const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<best){best=d;target=m;}}if(!target)return false;target.hp=Math.max(0,target.hp-amount);target.flash=.18;spawnVisualBurst(target.x,target.y,7,'spark','#9be7ff');const killed=target.hp<=0;if(killed){if(target.bossRealmCreature)recordBossRealmDefeat(target);notifyExpansionEnemyDefeated(target);const index=monsters.indexOf(target);if(index>=0)monsters.splice(index,1);dropMonsterLoot(target);awardXP(12,'\u041f\u043e\u043c\u043e\u0449\u044c \u043f\u0438\u0442\u043e\u043c\u0446\u0430');trackAdventureQuest('hunt',1,false);drawMinimap();}saveGame();return {hit:true,killed};},scheduleGodRebirth:(name,id,multiplier=1.7)=>scheduleNemesis('boss',id,name,id==='neptune'?'wisp':'shadow',multiplier),getWeaponDamage:()=>weaponDamage(equipment.weapon),getWeaponName:()=>equipment.weapon,damagePlayer:amount=>{const hit=Math.max(0,Number(amount)||0);player.hp=Math.max(0,player.hp-hit*(1-armorReduction()));updateVitals();if(player.hp<=0)respawnPlayerAfterDefeat();saveGame();return player.hp;},getSeaData:()=>seaWorldData,setSeaData:data=>{seaWorldData=data&&typeof data==='object'?JSON.parse(JSON.stringify(data)):null;saveGame();},pause:()=>{paused=true;keys.clear();pressedMovementCodes.clear();movementDirections.clear();},resume:()=>{paused=false;keys.clear();pressedMovementCodes.clear();movementDirections.clear();last=performance.now();canvas?.focus?.();},save:()=>saveGame(),toast:message=>toast(String(message||''))};
  setWorldDifficulty('medium');configureTreasureChests();setupWorld(); resetWorldState(); renderInventory(); syncSettingsControls(); applyVisualSettings(); syncAdminMenu(); renderWorldList(); updateClockDisplay(true); resize(); void refreshStaffRole(true);setInterval(()=>{if(!document.hidden)void refreshStaffRole(true);},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshStaffRole(true);}); window.addEventListener('beforeunload',()=>{if(currentWorldId)saveGame();}); document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&currentWorldId)saveGame();}); window.addEventListener('resize',()=>{resize();applyHudPositions();try{draw(0,performance.now());}catch(error){console.error('SkyRealm resize render error:',error);drawEmergencyWorld();}}); window.addEventListener('error',event=>{console.error('SkyRealm runtime error:',event.error||event.message);try{drawEmergencyWorld();}catch(_){}}); initHudDragging(); drawMinimap(); requestAnimationFrame(tick);
})();