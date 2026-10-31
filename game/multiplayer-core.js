(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.SkyRealmMultiplayerCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_PLAYERS=8;
  const ROOM_STATES=Object.freeze(['lobby','running','paused','closed']);
  const INVITE_CODE_PATTERN=/^[A-HJ-NP-Z2-9]{8}$/;
  function normalizeInviteCode(value){return typeof value==='string'?value.trim().toUpperCase().replace(/[-\s]/g,''):'';}
  function isValidInviteCode(value){return INVITE_CODE_PATTERN.test(normalizeInviteCode(value));}
  function canJoinRoom(room,memberCount){
    if(!room||!ROOM_STATES.includes(room.status))return {ok:false,reason:'ROOM_NOT_FOUND'};
    if(room.status==='closed')return {ok:false,reason:'ROOM_CLOSED'};
    if(room.status==='paused')return {ok:false,reason:'ROOM_PAUSED'};
    const cap=Math.min(MAX_PLAYERS,Math.max(1,Number(room.max_players)||MAX_PLAYERS));
    if(!Number.isInteger(memberCount)||memberCount<0)return {ok:false,reason:'INVALID_MEMBER_COUNT'};
    if(memberCount>=cap)return {ok:false,reason:'ROOM_FULL'};
    return {ok:true,capacity:cap,available:cap-memberCount};
  }
  function canResumeRoom(room,userId){
    if(!room||room.status!=='paused')return false;
    return typeof userId==='string'&&userId.length>0&&room.owner_id===userId;
  }
  function canChangePvp(room,userId){
    return !!room&&typeof userId==='string'&&userId.length>0&&room.owner_id===userId;
  }
  function makeRoomTopic(roomId){
    if(typeof roomId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(roomId))throw new TypeError('Invalid room id');
    return 'skyrealm:room:'+roomId;
  }
  function shouldPauseOnOwnerDeparture(room,departingUserId){
    return !!room&&['lobby','running'].includes(room.status)&&room.owner_id===departingUserId;
  }
  function sanitizePlayerInput(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const allowed=['up','down','left','right'];
    const keys=Array.isArray(input.keys)?input.keys.filter(k=>allowed.includes(k)).slice(0,4):[];
    const seq=Number(input.seq);
    if(!Number.isSafeInteger(seq)||seq<0)return null;
    return {seq,keys};
  }
  function sanitizePlayerPosition(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const id=typeof input.user_id==='string'?input.user_id.slice(0,64):'';
    const x=Number(input.x),y=Number(input.y);
    if(!id||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>12000||y<0||y>10000)return null;
    const difficulties=['easy','medium','hard','hell','impossible'];
    const modes=['surface','trade','mine','cave','dungeon','house'];
    if(!difficulties.includes(input.difficulty)||!modes.includes(input.world_mode))return null;
    const faces=['up','down','left','right'];
    const safeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:null;
    const raw=input.appearance&&typeof input.appearance==='object'?input.appearance:{};
    const appearance={
      skin:safeColor(raw.skin)||'#e8b88c',
      hair:safeColor(raw.hair)||'#352d3d',
      armor:safeColor(raw.armor)||'#526fba',
      accent:safeColor(raw.accent)||'#9cb9ff'
    };
    const name=typeof input.name==='string'?input.name.replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,20):'';
    return {
      user_id:id,x:Math.round(x*10)/10,y:Math.round(y*10)/10,
      face:faces.includes(input.face)?input.face:'down',
      difficulty:input.difficulty,world_mode:input.world_mode,
      name,appearance
    };
  }

  function sanitizeWorldAction(actionType,input){
    if(typeof actionType!=='string'||!input||typeof input!=='object'||Array.isArray(input))return null;
    const keys=Object.keys(input);
    if(actionType==='damage_enemy'){
      const allowed=['target_kind','target_id','weapon','damage'];
      if(keys.length!==4||keys.some(key=>!allowed.includes(key)))return null;
      const kinds=['monster','biome_boss','wolf_boss','cave_boss','dungeon_boss'];
      const weapons=['Деревянный меч','Железный меч','Огненный меч','Стальной меч','Меч титана','Меч дракона','Меч пустоты','Ледяной посох','Молниеносное копьё'];
      const id=typeof input.target_id==='string'?input.target_id:'',damage=input.damage;
      if(!kinds.includes(input.target_kind)||!id||id.length>64||!/^[A-Za-z0-9_-]+$/.test(id)||
         !weapons.includes(input.weapon)||typeof damage!=='number'||!Number.isSafeInteger(damage)||damage<1||damage>500)return null;
      return {target_kind:input.target_kind,target_id:id,weapon:input.weapon,damage};
    }
    if(actionType==='pickup_loot'){
      if(keys.length!==4||keys.some(key=>!['loot_id','x','y','world_mode'].includes(key)))return null;
      const id=typeof input.loot_id==='string'?input.loot_id:'',x=Number(input.x),y=Number(input.y);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||
         !['surface','cave','dungeon'].includes(input.world_mode)||!Number.isFinite(x)||!Number.isFinite(y)||
         x<0||x>12000||y<0||y>10000)return null;
      return {loot_id:id,x:Math.round(x*10)/10,y:Math.round(y*10)/10,world_mode:input.world_mode};
    }
    if(actionType==='mine_rock'){
      if(keys.some(key=>!['rock_index','tool','player_class','miner_skill_level'].includes(key))||!['rock_index','tool'].every(key=>keys.includes(key)))return null;
      const rockIndex=Number(input.rock_index),tool=input.tool,playerClass=input.player_class,minerSkill=input.miner_skill_level;
      if(playerClass!==undefined&&!['swordsman','farmer','ordinary','archer','mage','miner'].includes(playerClass))return null;
      if(minerSkill!==undefined&&(!Number.isSafeInteger(minerSkill)||minerSkill<0||minerSkill>5))return null;
      if(!Number.isSafeInteger(rockIndex)||rockIndex<0||rockIndex>64||
         !['Кирка','Улучшенная кирка','Кирка мастера'].includes(tool))return null;
      return {...{rock_index:rockIndex,tool},...(playerClass?{player_class:playerClass}:{}),...(minerSkill!==undefined?{miner_skill_level:minerSkill}:{})};
    }
    if(actionType==='chop_tree'){
      if(keys.length!==3||keys.some(key=>!['x','y','tool'].includes(key))||input.tool!=='Топор')return null;
      const x=Number(input.x),y=Number(input.y);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>12000||y<0||y>10000)return null;
      const gx=Math.round((x-16)/32)*32+16,gy=Math.round((y-16)/32)*32+16;
      if(Math.abs(x-gx)>1||Math.abs(y-gy)>1)return null;
      return {x:gx,y:gy,tool:'Топор'};
    }
    let allowed=[];
    if(actionType==='place_structure')allowed=['type','x','y'];
    else if(actionType==='farm_plant')allowed=['x','y','crop_id'];
    else if(['farm_water','farm_compost','farm_fertilize'].includes(actionType))allowed=['x','y'];
    else if(actionType==='farm_harvest')allowed=['x','y','player_class','farmer_skill_level','has_sickle'];
    else return null;
    if(keys.some(key=>!allowed.includes(key))||!['x','y'].every(key=>keys.includes(key)))return null;
    if(actionType==='farm_harvest'&&(input.player_class!==undefined&&!['swordsman','farmer','ordinary','archer','mage','miner'].includes(input.player_class)||input.farmer_skill_level!==undefined&&(!Number.isSafeInteger(input.farmer_skill_level)||input.farmer_skill_level<0||input.farmer_skill_level>5)||input.has_sickle!==undefined&&typeof input.has_sickle!=='boolean'))return null;
    const x=Number(input.x),y=Number(input.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>12000||y<0||y>10000)return null;
    const gx=Math.round((x-16)/32)*32+16,gy=Math.round((y-16)/32)*32+16;
    if(Math.abs(x-gx)>1||Math.abs(y-gy)>1)return null;
    if(actionType==='place_structure'){
      const types=['furnace','house','torch','coal','storage','farmplot'];
      if(!types.includes(input.type))return null;
      return {type:input.type,x:gx,y:gy};
    }
    if(actionType==='farm_plant'){
      const crops=['wheat','carrot','potato','tomato','corn','pumpkin','strawberry'];
      if(!crops.includes(input.crop_id))return null;
      return {x:gx,y:gy,crop_id:input.crop_id};
    }
    return {x:gx,y:gy,...(actionType==='farm_harvest'?{...(input.player_class?{player_class:input.player_class}:{}),...(input.farmer_skill_level!==undefined?{farmer_skill_level:input.farmer_skill_level}:{}),...(input.has_sickle!==undefined?{has_sickle:input.has_sickle}:{})}:{})};
  }

  function sanitizeWorldClock(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const minute=input.minute_total,nights=input.survived_nights;
    if(typeof minute!=='number'||!Number.isFinite(minute)||minute<0||minute>100000000)return null;
    if(typeof nights!=='number'||!Number.isSafeInteger(nights)||nights<0||nights>1000000)return null;
    if(typeof input.blood_moon_active!=='boolean')return null;
    return {minute_total:Math.round(minute*1000)/1000,survived_nights:nights,blood_moon_active:input.blood_moon_active};
  }
  const SHARED_WORLD_FIELDS=Object.freeze(["clearedSnowTiles","snowShovelHits","worldEarlyMonsters","mineLevel","houseLevel","dungeonRoom","dungeonClearedRooms","dungeonChestOpened","dungeonEnemyHp","biomeBosses","caveBossDefeated","caveBossHp","caveChestOpened","treasureChests","mineTileX","mineTileY","mineRocks","tradeEntranceX","tradeEntranceY","furnaceCrafted","placedStructures","lootDrops","adventureQuestProgress","farmCrops","discovered","exploredCells","wolfBossActive","wolfBossHp","wolfBossX","wolfBossY","wolfBossKeyDropped","wolfCageOpen","wolfDogCaged","wolfBossDefeated","wolfCompanionUnlocked","wolfCompanionHp","wolfCompanionRevivals","wolfCompanionOffsetX","wolfCompanionOffsetY","dogBehavior","villageQuestStage","blacksmithQuestStage","explorerQuestStage","npcQuestState","villageReputation","lastVillageRaidDay","villageRaidActive","villageRaidKills","villageRaidTimer","weatherMode","weatherTimer","meteorPoint","meteorShowerTimer","worldEventCamp","worldEventTraveler","lastWorldMeteorNight","lastWorldHordeNight","lastWorldCampDay","lastWorldTravelerDay"]);
  function sanitizeSharedWorldSnapshot(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const output={};
    for(const key of SHARED_WORLD_FIELDS){
      if(Object.prototype.hasOwnProperty.call(input,key))output[key]=input[key];
    }
    if(output.adventureQuestProgress&&typeof output.adventureQuestProgress==='object'&&!Array.isArray(output.adventureQuestProgress)){
      const sourceProgress=output.adventureQuestProgress;
      const progress={};
      for(const key of ['hunt','mining','harvest','treeChops','felledTrees']){
        if(Object.prototype.hasOwnProperty.call(sourceProgress,key))progress[key]=sourceProgress[key];
      }
      const types=['shadow','brute','wisp','skeleton','bomb','ice','scorpion','ember','yeti'];
      if(Array.isArray(sourceProgress.coopMonsters))progress.coopMonsters=sourceProgress.coopMonsters.slice(0,20)
        .filter(m=>m&&typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(m.id)&&
          types.includes(m.type)&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.hp)&&Number.isFinite(m.maxHp)&&
          m.x>=0&&m.x<=12000&&m.y>=0&&m.y<=10000&&m.maxHp>0&&m.hp>=0&&m.hp<=m.maxHp)
        .map(m=>({id:m.id,type:m.type,x:m.x,y:m.y,hp:m.hp,maxHp:m.maxHp,speed:Math.max(1,Math.min(160,Number(m.speed)||43)),
          damageScale:Math.max(.1,Math.min(5,Number(m.damageScale)||1)),attackCooldown:Math.max(0,Math.min(5,Number(m.attackCooldown)||0)),
          phase:Number(m.phase)||0,fuseStarted:m.fuseStarted===true,fuseTime:Math.max(0,Math.min(5,Number(m.fuseTime)||0)),
          exploding:m.exploding===true,explosionTimer:Math.max(0,Math.min(2,Number(m.explosionTimer)||0))}));
      output.adventureQuestProgress=progress;
    }
    if(Array.isArray(output.lootDrops)){
      output.lootDrops=output.lootDrops.slice(0,80).filter(d=>d&&d.shared===true&&typeof d.id==='string'&&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(d.id)&&
        typeof d.name==='string'&&d.name.length>0&&d.name.length<=48&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&
        Number.isSafeInteger(d.count)&&d.count>=1&&d.count<=99&&['surface','cave','dungeon'].includes(d.world_mode))
        .map(d=>({id:d.id,shared:true,x:d.x,y:d.y,name:d.name,count:d.count,life:Math.max(0,Math.min(240,Number(d.life)||240)),
          phase:Number(d.phase)||0,world_mode:d.world_mode}));
    }
    try{
      const serialized=JSON.stringify(output);
      if(serialized.length>60000)return null;
      return JSON.parse(serialized);
    }catch(_){return null;}
  }
  return Object.freeze({MAX_PLAYERS,ROOM_STATES,normalizeInviteCode,isValidInviteCode,canJoinRoom,canResumeRoom,canChangePvp,makeRoomTopic,shouldPauseOnOwnerDeparture,sanitizePlayerInput,sanitizePlayerPosition,sanitizeWorldAction,sanitizeWorldClock,sanitizeSharedWorldSnapshot,SHARED_WORLD_FIELDS});
});
