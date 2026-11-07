(() => {
  'use strict';
  const VERSION = 1;
  const $ = id => document.getElementById(id);
  const bridge = () => window.SkyRealmSeaBridge;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const t = {
    title:'\u0416\u0443\u0440\u043d\u0430\u043b \u0436\u0438\u0432\u043e\u0433\u043e \u043c\u0438\u0440\u0430',
    subtitle:'\u0420\u044b\u0431\u044b, \u0441\u043f\u0443\u0442\u043d\u0438\u043a\u0438, \u043f\u043e\u0441\u0435\u043b\u0435\u043d\u0438\u044f \u0438 \u0441\u0435\u043a\u0440\u0435\u0442\u044b \u0441\u0435\u0437\u043e\u043d\u043e\u0432'
  };
  const PETS = {
    fox:{name:'\u0420\u044b\u0436\u0438\u0439 \u043b\u0438\u0441',icon:'\u{1F98A}',price:350,damage:12,cooldown:4.8,damageBonus:.015,defenseBonus:0,premium:false,desc:'\u0411\u044b\u0441\u0442\u0440\u043e \u0430\u0442\u0430\u043a\u0443\u0435\u0442 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0445 \u0432\u0440\u0430\u0433\u043e\u0432.'},
    wolf:{name:'\u041b\u0435\u0441\u043d\u043e\u0439 \u0432\u043e\u043b\u043a',icon:'\u{1F43A}',price:650,damage:22,cooldown:4.2,damageBonus:.045,defenseBonus:0,premium:false,desc:'\u0421\u0438\u043b\u044c\u043d\u044b\u0439 \u0431\u043e\u0435\u0432\u043e\u0439 \u0441\u043f\u0443\u0442\u043d\u0438\u043a.'},
    owl:{name:'\u0421\u043e\u0432\u0430-\u0441\u043a\u0430\u0443\u0442',icon:'\u{1F989}',price:800,damage:15,cooldown:4.5,damageBonus:0,defenseBonus:.015,premium:false,desc:'\u041f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u0432 \u0431\u043e\u044e \u0438 \u0443\u043b\u0443\u0447\u0448\u0430\u0435\u0442 \u0448\u0430\u043d\u0441 \u0440\u0435\u0434\u043a\u043e\u0433\u043e \u0443\u043b\u043e\u0432\u0430.'},
    turtle:{name:'\u041a\u0440\u0435\u043f\u043a\u0430\u044f \u0447\u0435\u0440\u0435\u043f\u0430\u0445\u0430',icon:'\u{1F422}',price:950,damage:9,cooldown:5.2,damageBonus:0,defenseBonus:.055,premium:false,desc:'\u0414\u0430\u0451\u0442 \u0437\u0430\u0449\u0438\u0442\u0443 \u0438 \u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u0432 \u0431\u043e\u044e.'},
    phoenix:{name:'\u041e\u0433\u043d\u0435\u043d\u043d\u044b\u0439 \u0444\u0435\u043d\u0438\u043a\u0441',icon:'\u{1F525}',price:1800,damage:30,cooldown:3.7,damageBonus:.065,defenseBonus:.025,premium:true,desc:'\u041f\u0440\u0435\u043c\u0438\u0443\u043c-\u0441\u043f\u0443\u0442\u043d\u0438\u043a: \u043e\u0433\u043d\u0435\u043d\u043d\u044b\u0435 \u0430\u0442\u0430\u043a\u0438 \u0438 \u0443\u0441\u0438\u043b\u0435\u043d\u0438\u0435.'},
    dragon:{name:'\u0414\u0440\u0430\u043a\u043e\u043d \u0440\u0430\u0437\u043b\u043e\u043c\u0430',icon:'\u{1F409}',price:2600,damage:42,cooldown:3.5,damageBonus:.09,defenseBonus:.015,premium:true,desc:'\u0420\u0435\u0434\u043a\u0438\u0439 \u043f\u0440\u0435\u043c\u0438\u0443\u043c-\u0441\u043f\u0443\u0442\u043d\u0438\u043a \u0441 \u043c\u043e\u0449\u043d\u044b\u043c\u0438 \u0443\u0434\u0430\u0440\u0430\u043c\u0438.'}
  };
  const FISH = [
    {id:'silver_carp',name:'\u0421\u0435\u0440\u0435\u0431\u0440\u044f\u043d\u044b\u0439 \u043a\u0430\u0440\u043f',season:'spring',icon:'\u{1F41F}',rarity:'\u041e\u0431\u044b\u0447\u043d\u0430\u044f',price:120},
    {id:'moon_jelly',name:'\u041b\u0443\u043d\u043d\u0430\u044f \u043c\u0435\u0434\u0443\u0437\u0430',season:'spring',icon:'\u{1FABC}',rarity:'\u0420\u0435\u0434\u043a\u0430\u044f',price:280},
    {id:'sun_koi',name:'\u0421\u043e\u043b\u043d\u0435\u0447\u043d\u044b\u0439 \u043a\u043e\u0438',season:'summer',icon:'\u{1F3A3}',rarity:'\u0420\u0435\u0434\u043a\u0430\u044f',price:240},
    {id:'blue_marlin',name:'\u0421\u0438\u043d\u0438\u0439 \u043c\u0430\u0440\u043b\u0438\u043d',season:'summer',icon:'\u{1F420}',rarity:'\u042d\u043f\u0438\u0447\u0435\u0441\u043a\u0430\u044f',price:450},
    {id:'amber_pike',name:'\u042f\u043d\u0442\u0430\u0440\u043d\u0430\u044f \u0449\u0443\u043a\u0430',season:'autumn',icon:'\u{1F41F}',rarity:'\u041e\u0431\u044b\u0447\u043d\u0430\u044f',price:160},
    {id:'golden_trout',name:'\u0417\u043e\u043b\u043e\u0442\u0430\u044f \u0444\u043e\u0440\u0435\u043b\u044c',season:'autumn',icon:'\u{1F41F}',rarity:'\u042d\u043f\u0438\u0447\u0435\u0441\u043a\u0430\u044f',price:400},
    {id:'frost_salmon',name:'\u041b\u0435\u0434\u044f\u043d\u043e\u0439 \u043b\u043e\u0441\u043e\u0441\u044c',season:'winter',icon:'\u{1F41F}',rarity:'\u0420\u0435\u0434\u043a\u0430\u044f',price:220},
    {id:'ice_jelly',name:'\u041a\u0440\u0438\u0441\u0442\u0430\u043b\u043b\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043c\u0435\u0434\u0443\u0437\u0430',season:'winter',icon:'\u{1FABC}',rarity:'\u041b\u0435\u0433\u0435\u043d\u0434\u0430\u0440\u043d\u0430\u044f',price:900}
  ];
  const PROJECTS = {
    harbor:{name:'\u041c\u043e\u0440\u0441\u043a\u043e\u0439 \u043f\u043e\u0440\u0442',icon:'\u{1F6A2}',price:550,desc:'\u0428\u0430\u043d\u0441 \u043f\u043e\u0439\u043c\u0430\u0442\u044c \u0440\u0435\u0434\u043a\u0443\u044e \u0440\u044b\u0431\u0443 \u0432\u044b\u0448\u0435.'},
    watchtower:{name:'\u0421\u0442\u043e\u0440\u043e\u0436\u0435\u0432\u0430\u044f \u0431\u0430\u0448\u043d\u044f',icon:'\u{1F3F0}',price:700,desc:'\u0421\u043f\u0443\u0442\u043d\u0438\u043a \u0430\u0442\u0430\u043a\u0443\u0435\u0442 \u0441\u0438\u043b\u044c\u043d\u0435\u0435.'},
    sanctuary:{name:'\u0423\u0431\u0435\u0436\u0438\u0449\u0435 \u0437\u0432\u0435\u0440\u0435\u0439',icon:'\u{1F3E1}',price:850,desc:'\u0421\u043f\u0443\u0442\u043d\u0438\u043a\u0438 \u043f\u043e\u043b\u0443\u0447\u0430\u044e\u0442 \u0443\u0441\u0438\u043b\u0435\u043d\u0438\u0435 \u0438 \u0430\u0442\u0430\u043a\u0443\u044e\u0442 \u0447\u0430\u0449\u0435.'},
    market:{name:'\u0422\u043e\u0440\u0433\u043e\u0432\u0430\u044f \u043f\u043b\u043e\u0449\u0430\u0434\u044c',icon:'\u{1F3EA}',price:500,desc:'\u0414\u0430\u0451\u0442 \u043d\u0435\u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0435\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u044b\u0439 \u0434\u043e\u0445\u043e\u0434.'},
    guild_hall:{name:'\u0413\u0438\u043b\u044c\u0434\u0435\u0439\u0441\u043a\u0438\u0439 \u0434\u043e\u043c',icon:'\u{1F3DB}',price:1250,desc:'\u0423\u0432\u0435\u043b\u0438\u0447\u0438\u0432\u0430\u0435\u0442 \u043d\u0430\u0433\u0440\u0430\u0434\u044b \u0437\u0430 \u043f\u043e\u0440\u0443\u0447\u0435\u043d\u0438\u044f \u0436\u0438\u0442\u0435\u043b\u0435\u0439.'},
    granary:{name:'\u0417\u0435\u0440\u043d\u043e\u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435',icon:'\u{1F3E1}',price:950,desc:'\u0414\u0430\u0451\u0442 \u0435\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u044b\u0439 \u0434\u043e\u0445\u043e\u0434 \u0438 \u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u0440\u0430\u0437\u0432\u0438\u0432\u0430\u0442\u044c \u0433\u043e\u0440\u043e\u0434.'}
  };
  const RAIDS = {
    sky:{name:'\u0425\u0440\u0430\u043c \u043d\u0435\u0431\u0435\u0441',boss:'\u0410\u0440\u0445\u043e\u043d\u0442 \u0441\u043e\u043b\u043d\u0446\u0430',hp:1800,damage:22,reward:55000,item:'\u041f\u0435\u0447\u0430\u0442\u044c \u043d\u0435\u0431\u0435\u0441\u043d\u043e\u0433\u043e \u0440\u0435\u0439\u0434\u0430'},
    abyss:{name:'\u0411\u0435\u0437\u0434\u043d\u0430 \u0432\u0435\u0447\u043d\u043e\u0441\u0442\u0438',boss:'\u0418\u043c\u043f\u0435\u0440\u0430\u0442\u043e\u0440 \u0440\u0430\u0437\u043b\u043e\u043c\u0430',hp:3800,damage:36,reward:85000,item:'\u0421\u0435\u0440\u0434\u0446\u0435 \u0431\u0435\u0437\u0434\u043d\u044b'}
  };
  const CONTRACTS = [
    {id:'wood',npc:'merchant',item:'\u0414\u0440\u0435\u0432\u0435\u0441\u0438\u043d\u0430',amount:8,reward:2200,desc:'\u0417\u0430\u043f\u0430\u0441\u044b \u0434\u043b\u044f \u043d\u043e\u0432\u044b\u0445 \u0434\u043e\u043c\u043e\u0432.'},
    {id:'stone',npc:'builder',item:'\u041a\u0430\u043c\u0435\u043d\u044c',amount:7,reward:2400,desc:'\u041a\u0430\u043c\u0435\u043d\u044c \u0434\u043b\u044f \u0440\u0435\u043c\u043e\u043d\u0442\u0430 \u0443\u043b\u0438\u0446.'},
    {id:'fish',npc:'merchant',item:'\u0420\u044b\u0431\u0430',amount:5,reward:3200,desc:'\u0421\u0432\u0435\u0436\u0438\u0439 \u0443\u043b\u043e\u0432 \u0434\u043b\u044f \u0440\u044b\u043d\u043a\u0430.'},
    {id:'iron',npc:'miner',item:'\u0416\u0435\u043b\u0435\u0437\u043e',amount:5,reward:3600,desc:'\u041c\u0435\u0442\u0430\u043b\u043b \u0434\u043b\u044f \u043a\u0443\u0437\u043d\u0438\u0446\u044b.'},
    {id:'meat',npc:'hunter',item:'\u041c\u044f\u0441\u043e',amount:4,reward:2500,desc:'\u041f\u0440\u043e\u0432\u0438\u0437\u0438\u044f \u0434\u043b\u044f \u0436\u0438\u0442\u0435\u043b\u0435\u0439.'},
    {id:'crystal',npc:'alchemist',item:'\u041a\u0440\u0438\u0441\u0442\u0430\u043b\u043b',amount:2,reward:4600,desc:'\u0420\u0435\u0434\u043a\u0438\u0435 \u043a\u0440\u0438\u0441\u0442\u0430\u043b\u043b\u044b \u0434\u043b\u044f \u0437\u0435\u043b\u0438\u0439.'},
    {id:'bone',npc:'guard',item:'\u041a\u043e\u0441\u0442\u044c',amount:5,reward:2600,desc:'\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0434\u043b\u044f \u0437\u0430\u0449\u0438\u0442\u044b.'},
    {id:'coal',npc:'miner',item:'\u0423\u0433\u043e\u043b\u044c',amount:6,reward:2800,desc:'\u0422\u043e\u043f\u043b\u0438\u0432\u043e \u0434\u043b\u044f \u043a\u0443\u0437\u043d\u0438\u0446\u044b.'}
  ];
  const CONTRACT_NPCS={merchant:'\u0411\u043e\u0440\u0438\u0441',builder:'\u041e\u0441\u043a\u0430\u0440',miner:'\u0422\u043e\u0440\u043d',hunter:'\u0420\u0435\u043d',alchemist:'\u041b\u0438\u0440\u0430',guard:'\u041a\u0430\u0439'};
  const defaults = () => ({
    version:VERSION, ownedPets:[], activePet:null, petLevels:{}, petX:0, petY:0, petCooldown:1.5,
    fish:{}, projects:{}, lastSeasonKey:'', pendingSeason:'', claimedSeasons:[],
    seasonsSeen:[], lastMarketDay:-1, lastGranaryDay:-1, contractsDay:-1, contracts:[], raid:null, raidCooldownDay:0,
    achievements:{}, stats:{fishSpecies:0,petKills:0,raidsWon:0,projectsBuilt:0,contractsDone:0}
  });
  let state=defaults(), loadedWorld='', button=null, root=null, opened=false, activeTab='fish', updateButtonTimer=0;
  function worldId(){return String(bridge()?.getWorldId?.()||'');}
  function storageKey(){return 'skyrealm_living_world_v1_'+encodeURIComponent(worldId()||'default');}
  function notify(message){bridge()?.toast?.(String(message||''));}
  function save(){try{if(worldId())localStorage.setItem(storageKey(),JSON.stringify(state));bridge()?.save?.();}catch(error){console.warn('[SkyRealm living-world save]',error);}}
  function normalize(raw){
    const s=defaults();if(!raw||typeof raw!=='object')return s;
    s.ownedPets=Array.isArray(raw.ownedPets)?Array.from(new Set(raw.ownedPets.filter(id=>Object.prototype.hasOwnProperty.call(PETS,id)))).slice(0,6):[];
    s.activePet=s.ownedPets.includes(raw.activePet)?raw.activePet:null;
    s.petLevels=raw.petLevels&&typeof raw.petLevels==='object'?Object.fromEntries(s.ownedPets.map(id=>{const v=raw.petLevels[id]||{};return [id,{level:clamp(Math.floor(Number(v.level)||1),1,10),xp:clamp(Math.floor(Number(v.xp)||0),0,99)}];})):{};
    s.petX=Number.isFinite(raw.petX)?clamp(raw.petX,0,10000000):0;
    s.petY=Number.isFinite(raw.petY)?clamp(raw.petY,0,10000000):0;
    s.petCooldown=clamp(Number(raw.petCooldown)||1.5,0,30);
    s.fish=raw.fish&&typeof raw.fish==='object'?Object.fromEntries(FISH.map(f=>[f.id,clamp(Math.floor(Number(raw.fish[f.id])||0),0,999999)])):s.fish;
    s.projects=raw.projects&&typeof raw.projects==='object'?Object.fromEntries(Object.keys(PROJECTS).map(id=>[id,raw.projects[id]===true])):s.projects;
    s.lastSeasonKey=typeof raw.lastSeasonKey==='string'?raw.lastSeasonKey.slice(0,64):'';
    s.pendingSeason=typeof raw.pendingSeason==='string'?raw.pendingSeason.slice(0,64):'';
    s.claimedSeasons=Array.isArray(raw.claimedSeasons)?raw.claimedSeasons.filter(v=>typeof v==='string').slice(-32):[];
    s.seasonsSeen=Array.isArray(raw.seasonsSeen)?Array.from(new Set(raw.seasonsSeen.filter(v=>['spring','summer','autumn','winter'].includes(v)))):[];
    s.lastMarketDay=Number.isInteger(raw.lastMarketDay)?raw.lastMarketDay:-1;
    s.lastGranaryDay=Number.isInteger(raw.lastGranaryDay)?raw.lastGranaryDay:-1;
    s.contractsDay=Number.isInteger(raw.contractsDay)?raw.contractsDay:-1;
    s.contracts=Array.isArray(raw.contracts)?raw.contracts.filter(v=>v&&CONTRACTS.some(c=>c.id===v.id)).slice(0,3).map(v=>({id:v.id,completed:v.completed===true})):[];
    s.raidCooldownDay=clamp(Math.floor(Number(raw.raidCooldownDay)||0),0,1000000);
    s.raid=raw.raid&&['sky','abyss'].includes(raw.raid.type)?{type:raw.raid.type,hp:clamp(Number(raw.raid.hp)||0,0,500000),maxHp:clamp(Number(raw.raid.maxHp)||1,1,500000),phase:clamp(Math.floor(Number(raw.raid.phase)||1),1,3),attacks:clamp(Math.floor(Number(raw.raid.attacks)||0),0,10000),guardNext:raw.raid.guardNext===true}:null;
    s.achievements=raw.achievements&&typeof raw.achievements==='object'?raw.achievements:{};
    s.stats={fishSpecies:clamp(Math.floor(Number(raw.stats?.fishSpecies)||0),0,8),petKills:clamp(Math.floor(Number(raw.stats?.petKills)||0),0,1000000),raidsWon:clamp(Math.floor(Number(raw.stats?.raidsWon)||0),0,100000),projectsBuilt:clamp(Math.floor(Number(raw.stats?.projectsBuilt)||0),0,1000),contractsDone:clamp(Math.floor(Number(raw.stats?.contractsDone)||0),0,100000)};
    return s;
  }
  function load(){
    const id=worldId();if(!id||id===loadedWorld)return;
    loadedWorld=id;let raw=null;try{raw=JSON.parse(localStorage.getItem(storageKey())||'null');}catch(_){}
    state=normalize(raw);
    const season=bridge()?.getSeasonInfo?.();if(season?.id){const key=Math.floor((Number(season.day)||0)/28)+':'+season.id;if(!state.lastSeasonKey){state.lastSeasonKey=key;if((Number(season.day)||0)%7===0&&!state.claimedSeasons.includes(key))state.pendingSeason=key;}if(!state.seasonsSeen.includes(season.id))state.seasonsSeen.push(season.id);}
    save();
  }
  function premium(){return !!window.SkyRealmEdition?.isPremium?.();}
  function needPremium(feature){if(premium())return true;window.SkyRealmEdition?.requirePremium?.(feature);notify('\u042d\u0442\u0430 \u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e\u0441\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0432 Premium.');return false;}
  function currentPet(){return state.activePet?PETS[state.activePet]:null;}
  function seasonName(id){return ({spring:'\u0412\u0435\u0441\u043d\u0430',summer:'\u041b\u0435\u0442\u043e',autumn:'\u041e\u0441\u0435\u043d\u044c',winter:'\u0417\u0438\u043c\u0430'})[id]||'\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e';}
  function fishBonus(){return (state.projects.harbor?.12:0)+(state.activePet==='owl'?.08:0)+(state.activePet==='phoenix'?.04:0);}
  function damageMultiplier(){const p=currentPet();return (p?.damageBonus||0)+(state.projects.watchtower?.05:0);}
  function defenseBonus(){const p=currentPet();return (p?.defenseBonus||0)+(state.projects.sanctuary?.025:0);}
  function onFishingCatch(season,weather){
    load();if(Math.random()>clamp(.36+fishBonus()+(weather==='rain'?.08:0),.05,.72))return false;
    let pool=FISH.filter(f=>f.season===season);if(!pool.length)pool=FISH.slice(0,2);
    if(weather==='storm'&&Math.random()<.35)pool=FISH.filter(f=>f.rarity==='Эпическая'||f.rarity==='Легендарная');
    if(!pool.length)pool=FISH.filter(f=>f.season===season);
    const pick=pool[Math.floor(Math.random()*pool.length)];if(!pick)return false;
    state.fish[pick.id]=(Number(state.fish[pick.id])||0)+1;
    const unique=state.fish[pick.id]===1;state.stats.fishSpecies=Object.values(state.fish).filter(v=>v>0).length;
    bridge()?.addItem?.(pick.name,1,'\u0421\u0435\u0437\u043e\u043d\u043d\u044b\u0439 \u0443\u043b\u043e\u0432. \u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f SkyRealm.');
    if(unique)notify('\u041d\u043e\u0432\u044b\u0439 \u0432\u0438\u0434 \u0440\u044b\u0431\u044b: '+pick.name+'!');
    else if(pick.rarity==='Легендарная')notify('\u041b\u0435\u0433\u0435\u043d\u0434\u0430\u0440\u043d\u044b\u0439 \u0443\u043b\u043e\u0432: '+pick.name+'!');
    save();checkAchievements();return true;
  }
  function buyOrSelectPet(id){
    const pet=PETS[id];if(!pet)return;
    if(pet.premium&&!needPremium('\u041f\u0440\u0435\u043c\u0438\u0443\u043c-\u0441\u043f\u0443\u0442\u043d\u0438\u043a\u0438'))return;
    if(state.ownedPets.includes(id)){
      state.activePet=state.activePet===id?null:id;state.petCooldown=.5;save();notify(state.activePet?'\u0421\u043f\u0443\u0442\u043d\u0438\u043a \u0432\u044b\u0431\u0440\u0430\u043d: '+pet.name:'\u0421\u043f\u0443\u0442\u043d\u0438\u043a \u043e\u0442\u043f\u0443\u0449\u0435\u043d.');render();return;
    }
    if(Number(bridge()?.getGold?.()||0)<pet.price){notify('\u041d\u0443\u0436\u043d\u043e \u0437\u043e\u043b\u043e\u0442\u043e: '+pet.price+'.');return;}
    if(bridge()?.spendGold?.(pet.price)!==true){notify('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u043b\u0430\u0442\u0438\u0442\u044c \u043f\u043e\u043a\u0443\u043f\u043a\u0443.');return;}
    state.ownedPets.push(id);state.petLevels[id]={level:1,xp:0};state.activePet=id;state.petCooldown=.5;save();notify('\u041d\u043e\u0432\u044b\u0439 \u0441\u043f\u0443\u0442\u043d\u0438\u043a \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0435: '+pet.name+'!');checkAchievements();render();
  }
  function buildProject(id){
    const item=PROJECTS[id];if(!item||state.projects[id])return;
    if(!bridge()?.isTradeWorld?.()){notify('\u041f\u0440\u043e\u0435\u043a\u0442\u044b \u043f\u043e\u0441\u0435\u043b\u0435\u043d\u0438\u044f \u043c\u043e\u0436\u043d\u043e \u0443\u043b\u0443\u0447\u0448\u0430\u0442\u044c \u0432 \u041c\u0438\u0440\u0435 \u0442\u043e\u0440\u0433\u043e\u0432\u044b\u0445 \u0433\u043e\u0440\u043e\u0434\u043e\u0432.');return;}
    if(Number(bridge()?.getGold?.()||0)<item.price){notify('\u041d\u0443\u0436\u043d\u043e \u0437\u043e\u043b\u043e\u0442\u043e: '+item.price+'.');return;}
    if(bridge()?.spendGold?.(item.price)!==true)return;
    state.projects[id]=true;state.stats.projectsBuilt++;save();notify('\u041f\u043e\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430: '+item.name+'!');checkAchievements();render();
  }
  function startRaid(id){
    if(!RAIDS[id])return;
    if(bridge()?.isCoopWorld?.()){notify('\u041d\u043e\u0432\u044b\u0435 \u0440\u0435\u0439\u0434\u044b \u043f\u043e\u043a\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0432 \u043e\u0434\u0438\u043d\u043e\u0447\u043d\u043e\u043c \u043c\u0438\u0440\u0435.');return;}
    const b=bridge(),snap=b?.getChallengeSnapshot?.(),day=Math.max(0,Number(snap?.day)||0);
    if(Number(snap?.level||1)<5){notify('\u0414\u043b\u044f \u0440\u0435\u0439\u0434\u0430 \u043d\u0443\u0436\u0435\u043d \u0443\u0440\u043e\u0432\u0435\u043d\u044c 5.');return;}
    if(day<state.raidCooldownDay){notify('\u0420\u0435\u0439\u0434 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u0447\u0435\u0440\u0435\u0437 '+(state.raidCooldownDay-day)+' \u0438\u0433\u0440\u043e\u0432\u044b\u0445 \u0434\u043d\u044f.');return;}
    if(state.raid){notify('\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0440\u0435\u0439\u0434.');return;}
    const scale=({easy:.8,medium:1,hard:1.25,hell:1.55,impossible:1.9,challenge:2.1})[b?.getDifficulty?.()]||1;
    const max=Math.round(RAIDS[id].hp*scale);
    state.raid={type:id,hp:max,maxHp:max,phase:1,attacks:0};save();notify('\u0412\u0440\u0430\u0442\u0430 \u0440\u0435\u0439\u0434\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u044b: '+RAIDS[id].name+'.');render();
  }
  function attackRaid(){
    const r=state.raid;if(!r)return;
    const def=RAIDS[r.type],stats=bridge()?.getStats?.()||{};
    const damage=Math.max(1,Math.round(Number(stats.weaponDamage)||25));
    r.hp=Math.max(0,r.hp-damage);r.attacks++;
    const ratio=r.hp/Math.max(1,r.maxHp);r.phase=ratio>.66?1:ratio>.33?2:3;
    if(r.hp<=0){
      state.raid=null;state.stats.raidsWon++;state.raidCooldownDay=(Number(bridge()?.getGameDay?.())||0)+3;
      bridge()?.addGold?.(def.reward);bridge()?.addItem?.(def.item,1,'\u0423\u043d\u0438\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u043d\u0430\u0433\u0440\u0430\u0434\u0430 \u0437\u0430 \u043f\u043e\u0431\u0435\u0434\u0443 \u0432 \u0440\u0435\u0439\u0434\u0435.');
      bridge()?.addItem?.('\u041e\u0441\u043a\u043e\u043b\u043e\u043a \u0440\u0430\u0437\u043b\u043e\u043c\u0430',3,'\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u0434\u043b\u044f \u0440\u0435\u0434\u043a\u043e\u0433\u043e \u0441\u043d\u0430\u0440\u044f\u0436\u0435\u043d\u0438\u044f.');
      save();notify('\u0420\u0415\u0419\u0414 \u041f\u0420\u041e\u0419\u0414\u0415\u041d! \u0411\u043e\u0441\u0441 \u043f\u043e\u0431\u0435\u0436\u0434\u0451\u043d: '+def.boss+'.');checkAchievements();render();return;
    }
    if(r.attacks%2===0){const retaliation=Math.round(def.damage*(r.phase===1?1:r.phase===2?1.25:1.6)*(r.guardNext?.35:1));r.guardNext=false;bridge()?.damagePlayer?.(retaliation);notify('\u0411\u043e\u0441\u0441 \u043e\u0442\u0432\u0435\u0442\u0438\u043b \u0443\u0434\u0430\u0440\u043e\u043c! \u0424\u0430\u0437\u0430 '+r.phase+'. \u0423\u0440\u043e\u043d: '+retaliation+'.');}
    else notify('\u0423\u0434\u0430\u0440 \u043f\u0440\u043e\u0448\u0451\u043b: -'+damage+' HP \u0431\u043e\u0441\u0441\u0443.');
    save();render();
  }
  function leaveRaid(){if(!state.raid)return;save();notify('\u0420\u0435\u0439\u0434 \u043f\u0440\u0438\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. Прогресс босса сохранён.');}
  function guardRaid(){if(!state.raid)return;state.raid.guardNext=true;save();notify('Защита готова: следующий ответный удар будет ослаблен на 65%.');render();}
  function claimContract(id){
    const entry=state.contracts.find(v=>v.id===id&&!v.completed),task=CONTRACTS.find(v=>v.id===id);
    if(!entry||!task)return;
    const b=bridge();
    if(Number(b?.getItemCount?.(task.item)||0)<task.amount){notify('Не хватает ресурсов: '+task.item+' ×'+task.amount+'.');return;}
    if(b?.spendItem?.(task.item,task.amount)!==true){notify('Не удалось списать предметы из инвентаря.');return;}
    const reward=Math.round(task.reward*(state.projects.guild_hall?1.25:1));
    b?.addGold?.(reward);entry.completed=true;state.stats.contractsDone++;save();
    notify('Поручение выполнено! Награда: '+Math.floor(reward/100)+' золота.');
    checkAchievements();render();
  }
  function claimSeason(){
    const key=state.pendingSeason;if(!key||state.claimedSeasons.includes(key))return;
    const season=String(key.split(':')[1]||'spring'),items={spring:'\u041f\u044b\u043b\u044c\u0446\u0430 \u0432\u0435\u0441\u043d\u044b',summer:'\u0416\u0435\u043c\u0447\u0443\u0436\u0438\u043d\u0430 \u0441\u043e\u043b\u043d\u0446\u0430',autumn:'\u0422\u0430\u043b\u0438\u0441\u043c\u0430\u043d \u043b\u0438\u0441\u0442\u043e\u043f\u0430\u0434\u0430',winter:'\u0421\u0435\u0440\u0434\u0446\u0435 \u043b\u044c\u0434\u0430'};
    bridge()?.addGold?.(3500);bridge()?.addItem?.(items[season]||items.spring,1,'\u0421\u0435\u0437\u043e\u043d\u043d\u044b\u0439 \u043f\u043e\u0434\u0430\u0440\u043e\u043a SkyRealm.');
    state.claimedSeasons.push(key);state.pendingSeason='';save();notify('\u041f\u043e\u0434\u0430\u0440\u043e\u043a \u0441\u0435\u0437\u043e\u043d\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d!');render();
  }
  function checkAchievements(){
    const checks=[
      ['angler_8','\u041f\u0435\u0440\u0432\u044b\u0439 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u043e\u043d\u0435\u0440',state.stats.fishSpecies,4,800],
      ['angler_all','\u041c\u0430\u0441\u0442\u0435\u0440 \u0443\u043b\u043e\u0432\u0430',state.stats.fishSpecies,8,2500],
      ['first_pet','\u0412\u0435\u0440\u043d\u044b\u0439 \u0434\u0440\u0443\u0433',state.ownedPets.length,1,500],
      ['pet_team','\u0417\u0432\u0435\u0440\u0438\u043d\u044b\u0439 \u043e\u0442\u0440\u044f\u0434',state.ownedPets.length,3,1800],
      ['pet_hunter','\u041e\u0445\u043e\u0442\u043d\u0438\u043a \u0441\u043e \u0441\u043f\u0443\u0442\u043d\u0438\u043a\u043e\u043c',state.stats.petKills,20,1400],
      ['town_builder','\u0421\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c \u0433\u043e\u0440\u043e\u0434\u0430',state.stats.projectsBuilt,2,1600],
      ['raid_victor','\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c \u0440\u0435\u0439\u0434\u0430',state.stats.raidsWon,1,3000],
      ['season_traveler','\u041f\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u0438\u043a \u0441\u0435\u0437\u043e\u043d\u043e\u0432',state.seasonsSeen.length,4,2200],
      ['town_helper','\u041f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u0436\u0438\u0442\u0435\u043b\u0435\u0439',state.stats.contractsDone,5,1800]
    ];
    let changed=false;
    for(const [id,name,value,target,reward] of checks)if(value>=target&&!state.achievements[id]){state.achievements[id]=Date.now();bridge()?.addGold?.(reward);notify('\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: '+name+'! +'+Math.floor(reward/100)+' \u0437\u043e\u043b\u043e\u0442\u0430.');changed=true;}
    if(changed)save();
  }
  function update(dt){
    const id=worldId();if(!id)return;if(id!==loadedWorld)load();
    const b=bridge(),snap=b?.getChallengeSnapshot?.();if(!snap||snap.paused||b?.isCoopWorld?.())return;
    const season=b?.getSeasonInfo?.(),day=Math.max(0,Number(snap.day)||0);
    if(season?.id){
      const key=Math.floor((Number(season.day)||0)/28)+':'+season.id;
      if(key!==state.lastSeasonKey){state.lastSeasonKey=key;if(!state.claimedSeasons.includes(key))state.pendingSeason=key;if(!state.seasonsSeen.includes(season.id))state.seasonsSeen.push(season.id);save();notify('\u041d\u0430\u0447\u0430\u043b\u0441\u044f \u0441\u0435\u0437\u043e\u043d: '+seasonName(season.id)+'!');}
    }
    if(state.projects.market){
      if(state.lastMarketDay<0)state.lastMarketDay=day;
      else if(day>state.lastMarketDay){const elapsed=Math.min(3,day-state.lastMarketDay);b?.addGold?.(elapsed*500);state.lastMarketDay=day;save();notify('\u0422\u043e\u0440\u0433\u043e\u0432\u0430\u044f \u043f\u043b\u043e\u0449\u0430\u0434\u044c \u043f\u0440\u0438\u043d\u0435\u0441\u043b\u0430 \u0434\u043e\u0445\u043e\u0434.');}
    }
    if(state.projects.granary){
      if(state.lastGranaryDay<0)state.lastGranaryDay=day;
      else if(day>state.lastGranaryDay){const elapsed=Math.min(3,day-state.lastGranaryDay);b?.addGold?.(elapsed*350);state.lastGranaryDay=day;save();notify('\u0417\u0435\u0440\u043d\u043e\u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435 \u043f\u0440\u0438\u043d\u0435\u0441\u043b\u043e \u043f\u0440\u0438\u043f\u0430\u0441\u044b \u0438 \u0434\u043e\u0445\u043e\u0434.');}
    }
    if(state.contractsDay!==day){
      const offset=((day*3)%CONTRACTS.length+CONTRACTS.length)%CONTRACTS.length;
      state.contracts=[0,1,2].map(i=>({id:CONTRACTS[(offset+i*2)%CONTRACTS.length].id,completed:false}));
      state.contractsDay=day;save();
      if(day>0)notify('\u0416\u0438\u0442\u0435\u043b\u0438 \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u043b\u0438 \u043d\u043e\u0432\u044b\u0435 \u0435\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u044b\u0435 \u043f\u043e\u0440\u0443\u0447\u0435\u043d\u0438\u044f.');
    }
    const pet=currentPet(),pos=b?.getPlayerPosition?.();
    if(pet&&pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){
      if(!state.petX&&!state.petY){state.petX=pos.x-42;state.petY=pos.y+28;}
      const targetX=pos.x-42,targetY=pos.y+28+Math.sin(Date.now()/240)*3,blend=clamp(dt*3.2,0,1);
      state.petX+=(targetX-state.petX)*blend;state.petY+=(targetY-state.petY)*blend;
      state.petCooldown=Math.max(0,state.petCooldown-dt);
      if(state.petCooldown<=0){
        const progression=state.petLevels[state.activePet]||{level:1,xp:0};const petDamage=pet.damage+(progression.level-1)*2;
        const result=b?.petAttackNearest?.(Math.round(petDamage*(state.projects.watchtower?1.3:1)));
        if(result&&typeof result==='object'&&result.killed){state.stats.petKills++;progression.xp++;if(progression.xp>=progression.level*5&&progression.level<10){progression.level++;progression.xp=0;notify(pet.name+' достиг уровня '+progression.level+'!');}state.petLevels[state.activePet]=progression;checkAchievements();save();}
        state.petCooldown=pet.cooldown*(state.projects.sanctuary?.86:1);
      }
    }else{state.petCooldown=Math.max(0,state.petCooldown-dt);state.petX=0;state.petY=0;}
    checkAchievements();
  }
  function drawPet(ctx,x,y,time,pet){
    const bob=Math.sin(time/150)*2,scale=pet.id==='dragon'?1.16:pet.id==='phoenix'?1.1:1;
    ctx.save();ctx.translate(x,y+bob);ctx.scale(scale,scale);
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,12,17,5,0,0,Math.PI*2);ctx.fill();
    const colors={fox:'#d87935',wolf:'#8996a8',owl:'#a77b4e',turtle:'#579a78',phoenix:'#e8793c',dragon:'#6269c9'};
    const c=colors[pet.id]||'#9bb7ca';
    const glow=pet.id==='phoenix'?'#ff9a4d':pet.id==='dragon'?'#9a83ff':pet.id==='owl'?'#f8d48a':'#8de7ff';
    ctx.globalAlpha=.2;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-2,25+Math.sin(time/90)*2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    if(pet.id==='fox'){ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(-10,4);ctx.quadraticCurveTo(-28,-5,-24,-18);ctx.quadraticCurveTo(-8,-14,-5,0);ctx.fill();}
    if(pet.id==='phoenix'||pet.id==='dragon'){
      ctx.fillStyle=pet.id==='phoenix'?'#f6a34c':'#747ce1';ctx.beginPath();ctx.ellipse(-12,-3,12,5,-.55+Math.sin(time/85)*.18,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(12,-3,12,5,.55-Math.sin(time/85)*.18,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,2,15,10,0,0,Math.PI*2);ctx.fill();
    if(pet.id==='turtle'){ctx.fillStyle='#356b55';ctx.beginPath();ctx.ellipse(-1,0,13,9,0,Math.PI,Math.PI*2);ctx.fill();ctx.strokeStyle='#b6d7a1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(7,0);ctx.moveTo(0,-8);ctx.lineTo(0,7);ctx.stroke();}
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(10,-7,8,0,Math.PI*2);ctx.fill();
    if(['fox','wolf','dragon'].includes(pet.id)){ctx.beginPath();ctx.moveTo(5,-12);ctx.lineTo(7,-23);ctx.lineTo(13,-13);ctx.moveTo(13,-13);ctx.lineTo(20,-22);ctx.lineTo(19,-9);ctx.fill();}
    if(pet.id==='owl'){ctx.fillStyle='#d9c29b';ctx.beginPath();ctx.arc(6,-8,5,0,Math.PI*2);ctx.arc(15,-8,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#1b2634';ctx.beginPath();ctx.arc(7,-8,2,0,Math.PI*2);ctx.arc(15,-8,2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f0b64b';ctx.beginPath();ctx.moveTo(9,-2);ctx.lineTo(14,-2);ctx.lineTo(11,2);ctx.fill();}
    else{ctx.fillStyle='#fff';ctx.fillRect(11,-9,2,2);ctx.fillStyle='#1a2532';ctx.fillRect(12,-9,1,2);}
    if(pet.id==='phoenix'){ctx.fillStyle='#ffd05b';ctx.beginPath();ctx.moveTo(0,10);ctx.quadraticCurveTo(-3,19,3,22);ctx.quadraticCurveTo(2,15,8,13);ctx.fill();}
    if(pet.id==='dragon'){ctx.fillStyle='#6a73d4';ctx.beginPath();ctx.moveTo(3,-13);ctx.lineTo(4,-22);ctx.lineTo(10,-13);ctx.fill();}
    ctx.restore();
  }
  function drawTownProjects(ctx,camX,camY,time){
    if(!bridge()?.isTradeWorld?.())return;
    const centers=bridge()?.getVillageCenters?.()||[];
    if(!centers.length)return;
    const items=[
      {id:'harbor',village:'forest',dx:600,dy:350},
      {id:'watchtower',village:'snow',dx:540,dy:350},
      {id:'sanctuary',village:'desert',dx:540,dy:-380},
      {id:'market',village:'volcano',dx:540,dy:350}
    ];
    for(const item of items){
      if(!state.projects[item.id])continue;
      const center=centers.find(v=>v.id===item.village);if(!center)continue;
      const x=center.x+item.dx-camX,y=center.y+item.dy-camY;
      if(x<-180||x>window.innerWidth+180||y<-180||y>window.innerHeight+180)continue;
      ctx.save();ctx.translate(Math.round(x),Math.round(y));
      ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,30,72,16,0,0,Math.PI*2);ctx.fill();
      if(item.id==='harbor'){
        ctx.fillStyle='#64452e';ctx.fillRect(-62,-2,124,32);ctx.fillStyle='#a77b4d';
        for(let i=-54;i<=54;i+=18){ctx.fillRect(i,-1,3,30);}
        ctx.fillStyle='#59402e';ctx.fillRect(-48,22,8,26);ctx.fillRect(40,22,8,26);
        ctx.fillStyle='#d7c18d';ctx.fillRect(-3,-58,5,58);ctx.fillStyle='#d85f58';
        ctx.beginPath();ctx.moveTo(2,-56);ctx.lineTo(36,-47);ctx.lineTo(2,-38);ctx.closePath();ctx.fill();
        ctx.fillStyle='#8bd5d9';ctx.globalAlpha=.7;ctx.fillRect(-44,33,92,3);
      }else if(item.id==='watchtower'){
        ctx.fillStyle='#596b70';ctx.fillRect(-32,-2,64,56);ctx.fillStyle='#8e795d';ctx.fillRect(-25,-53,50,53);
        ctx.fillStyle='#bca47a';ctx.fillRect(-42,-58,84,10);ctx.fillRect(-30,-72,12,14);ctx.fillRect(18,-72,12,14);
        ctx.fillStyle='#513b36';ctx.fillRect(-7,24,14,29);ctx.fillStyle='#f6d78d';ctx.fillRect(-2,-41,4,7);
        ctx.strokeStyle='#d8c18b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-72);ctx.lineTo(0,-92);ctx.stroke();
        ctx.fillStyle='#e5a35e';ctx.beginPath();ctx.moveTo(1,-91);ctx.lineTo(22,-85);ctx.lineTo(1,-79);ctx.closePath();ctx.fill();
      }else if(item.id==='sanctuary'){
        const glow=ctx.createRadialGradient(0,0,8,0,0,86);glow.addColorStop(0,'rgba(112,235,190,.35)');glow.addColorStop(1,'rgba(112,235,190,0)');
        ctx.fillStyle=glow;ctx.fillRect(-90,-90,180,150);
        ctx.fillStyle='#5b7654';ctx.fillRect(-40,-2,80,38);ctx.fillStyle='#a6c68e';
        ctx.beginPath();ctx.moveTo(-50,0);ctx.lineTo(0,-48);ctx.lineTo(50,0);ctx.closePath();ctx.fill();
        ctx.fillStyle='#355c4c';ctx.fillRect(-8,11,16,25);ctx.strokeStyle='#8be1bd';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,12,24,Math.PI,Math.PI*2);ctx.stroke();
        for(const side of [-1,1]){ctx.fillStyle='#684b35';ctx.fillRect(side*58-5,6,10,32);ctx.fillStyle='#4a9c70';ctx.beginPath();ctx.arc(side*58,0,19,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8fd28c';ctx.beginPath();ctx.arc(side*58-5,-8,9,0,Math.PI*2);ctx.fill();}
      }else if(item.id==='market'){
        ctx.fillStyle='#73533a';ctx.fillRect(-66,4,132,34);ctx.fillStyle='#a77a4c';ctx.fillRect(-62,7,124,4);
        const colors=['#cb6c58','#e0b65e','#5b91b1'];
        for(let i=0;i<3;i++){const sx=-48+i*48;ctx.fillStyle='#654633';ctx.fillRect(sx,0,5,36);ctx.fillRect(sx+31,0,5,36);ctx.fillStyle=colors[i];ctx.beginPath();ctx.moveTo(sx-7,0);ctx.lineTo(sx+18,-28);ctx.lineTo(sx+43,0);ctx.closePath();ctx.fill();ctx.fillStyle='#f0d6a1';ctx.fillRect(sx+6,12,20,9);}
        ctx.fillStyle='#f4d98e';ctx.fillRect(-12,-37,24,5);
      }
      ctx.globalAlpha=1;ctx.fillStyle='#f1f6e7';ctx.font='bold 11px Segoe UI';ctx.textAlign='center';
      ctx.shadowColor='#06131a';ctx.shadowBlur=5;
      ctx.fillText(item.id==='harbor'?'\u041c\u043e\u0440\u0441\u043a\u043e\u0439 \u043f\u043e\u0440\u0442':item.id==='watchtower'?'\u0421\u0442\u043e\u0440\u043e\u0436\u0435\u0432\u0430\u044f \u0431\u0430\u0448\u043d\u044f':item.id==='sanctuary'?'\u0423\u0431\u0435\u0436\u0438\u0449\u0435': '\u0422\u043e\u0440\u0433\u043e\u0432\u044b\u0439 \u0440\u044b\u043d\u043e\u043a',0,-82);
      ctx.restore();
    }
  }
  function draw(ctx,camX,camY,time){
    if(!ctx||!worldId())return;
    const pet=currentPet();if(pet)drawPet(ctx,state.petX-camX,state.petY-camY,time,pet);
    drawTownProjects(ctx,camX,camY,time);
    const raid=state.raid;if(raid){const x=state.petX-camX+150,y=state.petY-camY-112;ctx.save();ctx.globalAlpha=.72;ctx.shadowColor='#a77bff';ctx.shadowBlur=18;ctx.fillStyle=raid.type==='sky'?'#f1cb70':'#9b72ed';ctx.beginPath();ctx.arc(x,y,16+Math.sin(time/130)*2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='900 8px Segoe UI';ctx.textAlign='center';ctx.fillText(raid.phase===3?'\u0424\u0410\u0417\u0410 III':raid.phase===2?'\u0424\u0410\u0417\u0410 II':'\u0420\u0415\u0419\u0414',x,y+3);ctx.restore();}
  }
  function sellFish(id){const f=FISH.find(v=>v.id===id);if(!f)return;const b=bridge(),qty=Math.max(0,Number(b?.getItemCount?.(f.name))||0);if(!qty){notify('Этой рыбы нет в инвентаре.');return;}if(b?.spendItem?.(f.name,qty)!==true){notify('Не удалось продать рыбу.');return;}const total=qty*f.price;b?.addGold?.(total*100);notify('Продано: '+f.name+' ×'+qty+'. Получено '+total+' золота.');save();render();}
  function renderFish(){
    const total=FISH.reduce((n,f)=>n+(Number(state.fish[f.id])||0),0),unique=FISH.filter(f=>(state.fish[f.id]||0)>0).length;
    return '<article class="lw-card"><div class="lw-metrics"><div><b>'+unique+' / '+FISH.length+'</b><small>\u0412\u0438\u0434\u043e\u0432 \u0432 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438</small></div><div><b>'+total+'</b><small>\u0420\u0435\u0434\u043a\u0438\u0445 \u0443\u043b\u043e\u0432\u043e\u0432</small></div></div><p>\u0420\u044b\u0431\u0430\u043b\u043a\u0430 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u0432 \u0438\u0433\u0440\u0435. \u0422\u0435\u043f\u0435\u0440\u044c \u0432 \u043a\u0430\u0436\u0434\u043e\u043c \u0441\u0435\u0437\u043e\u043d\u0435 \u043c\u043e\u0436\u043d\u043e \u043d\u0430\u0439\u0442\u0438 \u0443\u043d\u0438\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u0432\u0438\u0434\u044b. \u041b\u043e\u0432\u0438 \u0443 \u0431\u0435\u0440\u0435\u0433\u0430 \u0441 \u0443\u0434\u043e\u0447\u043a\u043e\u0439 \u043a\u0430\u043a \u0440\u0430\u043d\u044c\u0448\u0435.</p></article><div class="lw-grid">'+FISH.map(f=>{const count=Number(state.fish[f.id])||0,stock=Math.max(0,Number(bridge()?.getItemCount?.(f.name))||0);return '<article class="lw-card"><div class="lw-fish-icon">'+(count?f.icon:'\u{1F512}')+'</div><b>'+esc(count?f.name:'???')+'</b><small>'+esc(count?f.rarity:'\u0415\u0449\u0451 \u043d\u0435 \u043f\u043e\u0439\u043c\u0430\u043d\u0430')+'</small><span class="lw-count">'+count+' \u0448\u0442. \u0432 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438</span>'+(stock?'<button type="button" data-lw-action="fish-sell:'+f.id+'">\u041f\u0440\u043e\u0434\u0430\u0442\u044c '+stock+' \u00b7 '+(stock*f.price)+' \u0437\u043e\u043b\u043e\u0442\u0430</button>':'<small>\u041d\u0435\u0442 \u0440\u044b\u0431\u044b \u0434\u043b\u044f \u043f\u0440\u043e\u0434\u0430\u0436\u0438</small>')+'</article>';}).join('')+'</div>';
  }
  function renderPets(){
    return '<p class="lw-note">\u0421\u043f\u0443\u0442\u043d\u0438\u043a \u0441\u043b\u0435\u0434\u0443\u0435\u0442 \u0437\u0430 \u0433\u0435\u0440\u043e\u0435\u043c \u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0430\u0442\u0430\u043a\u0443\u0435\u0442 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0445 \u043e\u0431\u044b\u0447\u043d\u044b\u0445 \u0432\u0440\u0430\u0433\u043e\u0432. \u0417\u0430 \u043f\u043e\u0431\u0435\u0434\u044b \u043f\u0438\u0442\u043e\u043c\u0435\u0446 \u043f\u043e\u043b\u0443\u0447\u0430\u0435\u0442 \u043e\u043f\u044b\u0442 \u0438 \u0440\u0430\u0441\u0442\u0451\u0442 \u0434\u043e 10 \u0443\u0440\u043e\u0432\u043d\u044f.</p><div class="lw-grid">'+Object.entries(PETS).map(([id,p])=>{const owned=state.ownedPets.includes(id),active=state.activePet===id,locked=p.premium&&!premium(),progress=state.petLevels[id]||{level:1,xp:0},rarity={fox:'\u041e\u0431\u044b\u0447\u043d\u0430\u044f',wolf:'\u0420\u0435\u0434\u043a\u0430\u044f',owl:'\u0420\u0435\u0434\u043a\u0430\u044f',turtle:'\u042d\u043f\u0438\u0447\u0435\u0441\u043a\u0430\u044f',phoenix:'\u041b\u0435\u0433\u0435\u043d\u0434\u0430\u0440\u043d\u0430\u044f',dragon:'\u041c\u0438\u0444\u0438\u0447\u0435\u0441\u043a\u0430\u044f'}[id];return '<article class="lw-card lw-pet '+(active?'selected':'')+'"><div class="lw-pet-icon">'+p.icon+'</div><b>'+esc(p.name)+'</b><small>'+esc(rarity)+(owned?' \u00b7 \u0423\u0440. '+progress.level+'/10':'')+'</small><small>'+esc(p.desc)+'</small><small>\u0423\u0440\u043e\u043d: '+(p.damage+(owned?(progress.level-1)*2:0))+' \u00b7 \u041a\u0414: '+p.cooldown+'\u0441</small>'+(locked?'<span class="lw-premium">\u{1F451} Premium</span>':'')+'<button type="button" data-lw-action="pet:'+id+'">'+(active?'\u0410\u043a\u0442\u0438\u0432\u0435\u043d':owned?'\u0412\u044b\u0431\u0440\u0430\u0442\u044c':p.premium?'\u041e\u0442\u043a\u0440\u044b\u0442\u044c Premium':('\u041f\u0440\u0438\u0440\u0443\u0447\u0438\u0442\u044c \u00b7 '+p.price+' \u0437\u043e\u043b\u043e\u0442\u0430'))+'</button></article>';}).join('')+'</div>';
  }
  function renderContracts(){
    const day=Math.max(0,Number(bridge()?.getGameDay?.())||0);
    if(state.contractsDay!==day)return '<p class="lw-note">\u041f\u043e\u0440\u0443\u0447\u0435\u043d\u0438\u044f \u043e\u0431\u043d\u043e\u0432\u044f\u0442\u0441\u044f \u0432 \u043d\u043e\u0432\u044b\u0439 \u0438\u0433\u0440\u043e\u0432\u043e\u0439 \u0434\u0435\u043d\u044c.</p>';
    return '<p class="lw-note">\u0415\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u044f \u0436\u0438\u0442\u0435\u043b\u0435\u0439. \u041f\u0440\u0435\u0434\u043c\u0435\u0442\u044b \u0441\u043f\u0438\u0441\u044b\u0432\u0430\u044e\u0442\u0441\u044f \u0438\u0437 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u044f \u043f\u043e\u0441\u043b\u0435 \u0441\u0434\u0430\u0447\u0438.</p><div class="lw-grid">'+state.contracts.map(entry=>{const c=CONTRACTS.find(v=>v.id===entry.id);if(!c)return '';const count=Number(bridge()?.getItemCount?.(c.item)||0),done=entry.completed;return '<article class="lw-card"><b>'+esc(CONTRACT_NPCS[c.npc]||'\u0416\u0438\u0442\u0435\u043b\u044c')+'</b><small>'+esc(c.desc)+'</small><div class="lw-meter"><i style="width:'+Math.min(100,count/c.amount*100)+'%"></i></div><small>'+esc(c.item)+': '+Math.min(count,c.amount)+' / '+c.amount+'</small><small>\u041d\u0430\u0433\u0440\u0430\u0434\u0430: '+Math.floor(c.reward*(state.projects.guild_hall?1.25:1)/100)+' \u0437\u043e\u043b\u043e\u0442\u0430</small><button type="button" '+(done||count<c.amount?'disabled':'')+' data-lw-action="contract:'+c.id+'">'+(done?'\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043e':count<c.amount?'\u0421\u043e\u0431\u0440\u0430\u0442\u044c \u0440\u0435\u0441\u0443\u0440\u0441\u044b':'\u0421\u0434\u0430\u0442\u044c \u0440\u0435\u0441\u0443\u0440\u0441\u044b')+'</button></article>';}).join('')+'</div>';
  }
  function renderContracts(){
    const day=Math.max(0,Number(bridge()?.getGameDay?.())||0);
    if(state.contractsDay!==day)return '<p class="lw-note">Поручения обновятся в новый игровой день.</p>';
    return '<p class="lw-note">Ежедневные задания жителей. Предметы списываются из инвентаря после сдачи.</p><div class="lw-grid">'+state.contracts.map(entry=>{const c=CONTRACTS.find(v=>v.id===entry.id);if(!c)return '';const count=Number(bridge()?.getItemCount?.(c.item)||0),done=entry.completed;return '<article class="lw-card"><b>'+esc(CONTRACT_NPCS[c.npc]||'Житель')+'</b><small>'+esc(c.desc)+'</small><div class="lw-meter"><i style="width:'+Math.min(100,count/c.amount*100)+'%"></i></div><small>'+esc(c.item)+': '+Math.min(count,c.amount)+' / '+c.amount+'</small><small>Награда: '+Math.floor(c.reward*(state.projects.guild_hall?1.25:1)/100)+' золота</small><button type="button" '+(done||count<c.amount?'disabled':'')+' data-lw-action="contract:'+c.id+'">'+(done?'Выполнено':count<c.amount?'Собрать ресурсы':'Сдать ресурсы')+'</button></article>';}).join('')+'</div>';
  }
  function renderProjects(){
    const trade=!!bridge()?.isTradeWorld?.();
    return renderContracts()+'<p class="lw-note">'+(trade?'\u0422\u044b \u0432 \u041c\u0438\u0440\u0435 \u0442\u043e\u0440\u0433\u043e\u0432\u044b\u0445 \u0433\u043e\u0440\u043e\u0434\u043e\u0432. \u0417\u0434\u0435\u0441\u044c \u043c\u043e\u0436\u043d\u043e \u0440\u0430\u0437\u0432\u0438\u0432\u0430\u0442\u044c \u043f\u043e\u0441\u0435\u043b\u0435\u043d\u0438\u044f.':'\u0414\u043b\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432 \u043f\u0435\u0440\u0435\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b \u0432 \u041c\u0438\u0440 \u0442\u043e\u0440\u0433\u043e\u0432\u044b\u0445 \u0433\u043e\u0440\u043e\u0434\u043e\u0432.')+'</p><div class="lw-grid">'+Object.entries(PROJECTS).map(([id,p])=>'<article class="lw-card"><div class="lw-pet-icon">'+p.icon+'</div><b>'+esc(p.name)+'</b><small>'+esc(p.desc)+'</small><button type="button" '+(state.projects[id]||!trade?'disabled':'')+' data-lw-action="project:'+id+'">'+(state.projects[id]?'\u041f\u043e\u0441\u0442\u0440\u043e\u0435\u043d\u043e':!trade?'\u041d\u0443\u0436\u0435\u043d \u0442\u043e\u0440\u0433\u043e\u0432\u044b\u0439 \u043c\u0438\u0440':'\u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c \u00b7 '+p.price+' \u0437\u043e\u043b\u043e\u0442\u0430')+'</button></article>').join('')+'</div>';
  }
  function renderSeason(){
    const s=bridge()?.getSeasonInfo?.()||{},key=state.pendingSeason;
    return '<article class="lw-card"><div class="lw-metrics"><div><b>'+esc(seasonName(s.id))+'</b><small>\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0441\u0435\u0437\u043e\u043d</small></div><div><b>'+Math.max(0,Number(s.daysRemaining)||0)+'</b><small>\u0414\u043d\u0435\u0439 \u0434\u043e \u0441\u043c\u0435\u043d\u044b</small></div></div><p>\u0412 \u0438\u0433\u0440\u0435 \u0443\u0436\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442 \u0432\u0435\u0441\u043d\u0430, \u043b\u0435\u0442\u043e, \u043e\u0441\u0435\u043d\u044c, \u0437\u0438\u043c\u0430 \u0438 \u0434\u0438\u043d\u0430\u043c\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043f\u043e\u0433\u043e\u0434\u0430. \u041d\u043e\u0432\u044b\u0435 \u0441\u0435\u0437\u043e\u043d\u043d\u044b\u0435 \u0440\u044b\u0431\u044b \u0438 \u043f\u043e\u0434\u0430\u0440\u043a\u0438 \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u044e\u0442 \u0446\u0435\u043b\u0438 \u0434\u043b\u044f \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0441\u0435\u0437\u043e\u043d\u0430.</p>'+(key?'<button type="button" data-lw-action="season-claim">\u0417\u0430\u0431\u0440\u0430\u0442\u044c \u0441\u0435\u0437\u043e\u043e\u043d\u043d\u044b\u0439 \u043f\u043e\u0434\u0430\u0440\u043e\u043a</button>':'<small>\u041f\u043e\u0434\u0430\u0440\u043e\u043a \u043d\u0430\u0441\u0442\u0443\u043f\u0438\u0442 \u0432 \u043d\u0430\u0447\u0430\u043b\u0435 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0433\u043e \u0441\u0435\u0437\u043e\u043d\u0430.</small>')+'</article><div class="lw-card"><b>\u041f\u043e\u0433\u043e\u0434\u0430</b><p>'+esc(({clear:'\u042f\u0441\u043d\u043e',rain:'\u0414\u043e\u0436\u0434\u044c',snow:'\u0421\u043d\u0435\u0433',storm:'\u0413\u0440\u043e\u0437\u0430'})[bridge()?.getWeather?.()]||'\u041c\u0435\u043d\u044f\u0435\u0442\u0441\u044f')+'</p></div>';
  }
  function renderRaids(){
    if(state.raid){const r=state.raid,d=RAIDS[r.type];return '<article class="lw-card"><div class="lw-boss-mark">\u{1F480}</div><b>'+esc(d.boss)+'</b><small>\u0424\u0430\u0437\u0430 '+r.phase+' / 3 \u00b7 \u0423\u0434\u0430\u0440\u043e\u0432: '+r.attacks+'</small><div class="lw-meter"><i style="width:'+Math.round(r.hp/Math.max(1,r.maxHp)*100)+'%"></i></div><b>'+Math.ceil(r.hp)+' / '+r.maxHp+' HP</b><button type="button" data-lw-action="raid-attack">\u0410\u0442\u0430\u043a\u043e\u0432\u0430\u0442\u044c \u0431\u043e\u0441\u0441\u0430</button><button class="secondary" type="button" data-lw-action="raid-guard">Защититься от следующего удара</button><small>'+(r.guardNext?'Защита активна':'Защита не активна')+'</small><button class="secondary" type="button" data-lw-action="raid-leave">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438 \u0432\u044b\u0439\u0442\u0438</button></article>';}
    return '<p class="lw-note">\u0420\u0435\u0439\u0434\u044b \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0432\u0441\u0435\u043c \u0438\u0433\u0440\u043e\u043a\u0430\u043c \u0441 5 \u0443\u0440\u043e\u0432\u043d\u044f. \u0423 \u0431\u043e\u0441\u0441\u0430 \u0442\u0440\u0438 \u0444\u0430\u0437\u044b, \u0430 \u0435\u0433\u043e \u043e\u0442\u0432\u0435\u0442\u043d\u044b\u0435 \u0430\u0442\u0430\u043a\u0438 \u0441\u0438\u043b\u044c\u043d\u0435\u044e\u0442. \u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439 \u0437\u0430\u0449\u0438\u0442\u0443 \u043f\u0435\u0440\u0435\u0434 \u043e\u0442\u0432\u0435\u0442\u043d\u044b\u043c \u0443\u0434\u0430\u0440\u043e\u043c.</p><div class="lw-grid">'+Object.entries(RAIDS).map(([id,r])=>'<article class="lw-card"><div class="lw-boss-mark">\u{1F30C}</div><b>'+esc(r.name)+'</b><small>\u0411\u043e\u0441\u0441: '+esc(r.boss)+' \u00b7 '+r.hp+' HP</small><small>\u041d\u0430\u0433\u0440\u0430\u0434\u0430: '+Math.floor(r.reward/100)+' \u0437\u043e\u043b\u043e\u0442\u0430 \u0438 \u0440\u0435\u0434\u043a\u0438\u0439 \u043f\u0440\u0435\u0434\u043c\u0435\u0442</small><button type="button" data-lw-action="raid:'+id+'">\u041d\u0430\u0447\u0430\u0442\u044c \u0440\u0435\u0439\u0434</button></article>').join('')+'</div>';
  }
  function renderTrophies(){
    const list=[
      ['angler_8','\u041f\u0435\u0440\u0432\u044b\u0439 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u043e\u043d\u0435\u0440',state.stats.fishSpecies,4],
      ['angler_all','\u041c\u0430\u0441\u0442\u0435\u0440 \u0443\u043b\u043e\u0432\u0430',state.stats.fishSpecies,8],
      ['first_pet','\u0412\u0435\u0440\u043d\u044b\u0439 \u0434\u0440\u0443\u0433',state.ownedPets.length,1],
      ['pet_team','\u0417\u0432\u0435\u0440\u0438\u043d\u044b\u0439 \u043e\u0442\u0440\u044f\u0434',state.ownedPets.length,3],
      ['pet_hunter','\u041e\u0445\u043e\u0442\u043d\u0438\u043a \u0441\u043e \u0441\u043f\u0443\u0442\u043d\u0438\u043a\u043e\u043c',state.stats.petKills,20],
      ['town_builder','\u0421\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c \u0433\u043e\u0440\u043e\u0434\u0430',state.stats.projectsBuilt,2],
      ['raid_victor','\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c \u0440\u0435\u0439\u0434\u0430',state.stats.raidsWon,1],
      ['season_traveler','\u041f\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u0438\u043a \u0441\u0435\u0437\u043e\u043d\u043e\u0432',state.seasonsSeen.length,4],
      ['town_helper','\u041f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u0436\u0438\u0442\u0435\u043b\u0435\u0439',state.stats.contractsDone,5]
    ];
    return '<div class="lw-grid">'+list.map(([id,name,value,target])=>{const done=!!state.achievements[id];return '<article class="lw-card"><b>'+(done?'\u{1F3C6} ':'\u{1F512} ')+esc(name)+'</b><div class="lw-meter"><i style="width:'+Math.min(100,value/target*100)+'%"></i></div><small>'+Math.min(value,target)+' / '+target+(done?'\u00a0\u00b7\u00a0\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u043e':'')+'</small></article>';}).join('')+'</div>';
  }
  function render(){
    if(!root)return;
    const tabs={fish:'\u0420\u044b\u0431\u044b',pets:'\u0421\u043f\u0443\u0442\u043d\u0438\u043a\u0438',town:'\u041f\u043e\u0441\u0435\u043b\u0435\u043d\u0438\u0435',season:'\u0421\u0435\u0437\u043e\u043d\u044b',raids:'\u0420\u0435\u0439\u0434\u044b',trophies:'\u0422\u0440\u043e\u0444\u0435\u0438'};
    const pages={fish:renderFish,pets:renderPets,town:renderProjects,season:renderSeason,raids:renderRaids,trophies:renderTrophies};
    const content=(pages[activeTab]||renderFish)();
    root.innerHTML='<div class="lw-panel"><header><div><small>SKYREALM \u00b7 LIVING WORLD</small><h2>'+t.title+'</h2><p>'+t.subtitle+'</p></div><button type="button" data-lw-action="close" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">\u2715</button></header><nav class="lw-tabs">'+Object.entries(tabs).map(([id,label])=>'<button type="button" data-lw-action="tab:'+id+'" class="'+(activeTab===id?'active':'')+'">'+label+'</button>').join('')+'</nav><main>'+content+'</main><footer>\u0420\u044b\u0431\u0430\u043b\u043a\u0430, \u043f\u043e\u0441\u0435\u043b\u0435\u043d\u0438\u044f, \u043f\u043e\u0440\u0443\u0447\u0435\u043d\u0438\u044f, \u0441\u0435\u0437\u043e\u043d\u044b \u0438 \u0440\u0435\u0439\u0434\u044b \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0432 Free. \u0420\u0435\u0434\u043a\u0438\u0435 \u0441\u043f\u0443\u0442\u043d\u0438\u043a\u0438 \u2014 Premium.</footer></div>';
  }
  function ensureUI(){
    if(root)return;
    const style=document.createElement('style');
    style.textContent='#living-world-launch{position:fixed;right:18px;top:270px;z-index:36;border:1px solid #76b9bb;border-radius:11px;padding:10px 13px;background:linear-gradient(135deg,#164b4b,#172b42);color:#ecffff;font:800 12px Segoe UI;cursor:pointer;box-shadow:0 8px 25px #0008}#living-world-launch[hidden],#skyrealm-living-world[hidden]{display:none!important}#skyrealm-living-world{position:fixed;inset:0;z-index:99970;display:flex;align-items:center;justify-content:center;padding:16px;background:#020914c9;color:#edf7ff;font:13px Segoe UI,Arial}#skyrealm-living-world .lw-panel{width:min(820px,100%);max-height:90vh;overflow:hidden;border:1px solid #47717a;border-radius:18px;background:linear-gradient(150deg,#142e3d,#091723 75%);box-shadow:0 25px 90px #000d;padding:17px;display:flex;flex-direction:column}#skyrealm-living-world header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}#skyrealm-living-world header small{color:#91d9d0;font-weight:900;letter-spacing:1px}#skyrealm-living-world h2{font-size:22px;margin:5px 0;color:#efffff}#skyrealm-living-world p{color:#a9c1ce;line-height:1.55;margin:6px 0 12px}#skyrealm-living-world button{border:1px solid #4a7c87;border-radius:9px;background:#1c4c59;color:#f0ffff;padding:9px 11px;font-weight:800;cursor:pointer}#skyrealm-living-world button:disabled{opacity:.4;cursor:not-allowed}#skyrealm-living-world button.secondary{background:#172b3a}#skyrealm-living-world .lw-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}#skyrealm-living-world .lw-tabs button{background:#102537;font-size:11px}#skyrealm-living-world .lw-tabs button.active{background:#22606a;border-color:#a3e8dc}#skyrealm-living-world main{overflow:auto;min-height:120px;padding-right:4px}#skyrealm-living-world .lw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}#skyrealm-living-world .lw-card{background:#0d1e2d;border:1px solid #2e5264;border-radius:11px;padding:12px;margin:8px 0}#skyrealm-living-world .lw-card b{display:block;color:#eefaff;margin:4px 0}#skyrealm-living-world .lw-card small{display:block;color:#a8c0d1;line-height:1.5;margin:4px 0}#skyrealm-living-world .lw-card button{width:100%;margin-top:8px}#skyrealm-living-world .lw-pet-icon,#skyrealm-living-world .lw-fish-icon,#skyrealm-living-world .lw-boss-mark{font-size:28px;margin:0 0 6px}#skyrealm-living-world .lw-pet.selected{border-color:#9ae8c2;background:#102c2b}#skyrealm-living-world .lw-premium{display:inline-block;color:#f3d184;font-size:10px;font-weight:900;margin:5px 0}#skyrealm-living-world .lw-count{display:block;color:#98e2ca;font-weight:900;margin-top:5px}#skyrealm-living-world .lw-note{padding:10px 12px;border:1px solid #315265;border-radius:10px;background:#0d1d2b}#skyrealm-living-world .lw-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px}#skyrealm-living-world .lw-metrics>div{padding:10px;background:#10283a;border:1px solid #31556a;border-radius:9px}#skyrealm-living-world .lw-metrics b{font-size:20px;color:#a7e8dc}#skyrealm-living-world .lw-meter{height:8px;background:#243c4e;border-radius:8px;overflow:hidden;margin:8px 0}#skyrealm-living-world .lw-meter i{display:block;height:100%;background:linear-gradient(90deg,#54b9ce,#9ee6af)}#skyrealm-living-world footer{padding-top:10px;margin-top:10px;border-top:1px solid #2c4c5d;color:#88a6b7;font-size:10px}#skyrealm-living-world .lw-card>small + button{margin-top:9px}@media(max-width:600px){#living-world-launch{top:260px;right:8px;padding:8px 10px}#skyrealm-living-world{padding:7px}#skyrealm-living-world .lw-panel{padding:12px;max-height:94vh}#skyrealm-living-world h2{font-size:19px}}';
    document.head.appendChild(style);
    button=document.createElement('button');button.id='living-world-launch';button.type='button';button.textContent='\u{1F4D6} \u0416\u0438\u0432\u043e\u0439 \u043c\u0438\u0440';button.hidden=true;button.addEventListener('click',openPanel);document.body.appendChild(button);
    root=document.createElement('section');root.id='skyrealm-living-world';root.hidden=true;document.body.appendChild(root);
    root.addEventListener('click',event=>{
      const target=event.target?.closest?.('[data-lw-action]');if(!target)return;
      const action=target.dataset.lwAction||'';
      if(action==='close'){closePanel();return;}
      if(action.startsWith('tab:')){activeTab=action.slice(4);render();return;}
      if(action.startsWith('fish-sell:')){sellFish(action.slice(10));return;}
      if(action.startsWith('pet:')){buyOrSelectPet(action.slice(4));return;}
      if(action.startsWith('project:')){buildProject(action.slice(8));return;}
      if(action.startsWith('raid:')){startRaid(action.slice(5));return;}
      if(action==='raid-attack'){attackRaid();return;}
      if(action==='raid-guard'){guardRaid();return;}
      if(action.startsWith('contract:')){claimContract(action.slice(9));return;}
      if(action==='raid-leave'){leaveRaid();closePanel();return;}
      if(action==='season-claim'){claimSeason();return;}
    });
  }
  function openPanel(){
    const snap=bridge()?.getChallengeSnapshot?.();if(!snap?.worldId)return;
    if(bridge()?.isCoopWorld?.()){notify('\u0416\u0443\u0440\u043d\u0430\u043b \u043f\u043e\u043a\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u043e\u0434\u0438\u043d\u043e\u0447\u043d\u044b\u0445 \u043c\u0438\u0440\u0430\u0445.');return;}
    load();ensureUI();opened=true;root.hidden=false;button.hidden=true;bridge()?.pause?.();render();
  }
  function closePanel(){if(!opened)return;opened=false;if(root)root.hidden=true;bridge()?.resume?.();if(button)button.hidden=!worldId()||!!bridge()?.isCoopWorld?.();}
  function boot(){
    ensureUI();
    window.setInterval(()=>{
      const id=worldId();if(id&&id!==loadedWorld)load();
      const snap=bridge()?.getChallengeSnapshot?.();
      if(button)button.hidden=!snap?.worldId||snap.paused||opened||!!bridge()?.isCoopWorld?.();
    },500);
  }
  window.SkyRealmLivingWorld=Object.freeze({
    update,draw,onFishingCatch,damageMultiplier,defenseBonus,fishBonus,
    getState:()=>JSON.parse(JSON.stringify(state)),
    open:openPanel
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();