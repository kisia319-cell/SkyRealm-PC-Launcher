'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'Missing function ' + name);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c.charCodeAt(0) === 96) { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}
function execute(context, functions, exportNames) {
  const expose = exportNames.map(name => 'globalThis.' + name + '=' + name + ';').join('\n');
  vm.runInNewContext(functions.join('\n') + '\n' + expose, context);
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

const hashFn = extractFunction('hash');
const mineHelpers = ['generateMineMaze','ensureMineMaze','mineCellWalkable','mineFeaturePoint'].map(extractFunction);
const mineFn = extractFunction('generateMineStock');
const mineContext = { mineSeed: 417, mineLevel: 1, mineDepth:1, mineRocks: [], mineHoverIndex: -1, mineMaze:null, MINE_MAZE_COLS:21, MINE_MAZE_ROWS:15, MINE_CELL_SIZE:44, isModInstalled:()=>false, Math };
execute(mineContext, [hashFn, ...mineHelpers, mineFn], ['generateMineStock']);
function stock(day, level, depth=level) {
  mineContext.mineLevel = level;
  mineContext.mineDepth = depth;
  mineContext.generateMineStock(day);
  return plain(mineContext.mineRocks);
}
const day3 = stock(3, 1);
const day3Again = stock(3, 1);
const day4 = stock(4, 1);
assert.equal(day3.length, 24);
assert.deepEqual(day3Again, day3, 'A given world, mine level and day must generate deterministic stock.');
assert.notDeepEqual(day4, day3, 'A new game day must regenerate mine stock.');
assert.ok(day3.slice(0, 7).every(rock => rock.ore === 'Камень'));
assert.ok(day3.every(rock => rock.hp === 2 && rock.maxHp === 2));
assert.equal(stock(3, 5, 5).length, 40, 'The highest mine upgrade must provide the expanded node count.');
const deepOre = new Set(stock(3, 5, 5).map(rock => rock.ore));
const lockedOre = new Set(stock(3, 1, 5).map(rock => rock.ore));
const upgradedShallowOre = new Set(stock(3, 5, 1).map(rock => rock.ore));
assert.ok(!lockedOre.has('Мифрил')&&!lockedOre.has('Уран')&&!lockedOre.has('Алмаз'),'Going deeper must not unlock high-tier ore without manually upgrading the mine.');
assert.ok(upgradedShallowOre.has('Мифрил')&&upgradedShallowOre.has('Уран')&&upgradedShallowOre.has('Алмаз'),'Manual mine upgrades must unlock higher-tier ores even before descending.');
assert.notDeepEqual(stock(3,5,5),stock(3,5,4),'Each floor depth must have different ore locations.');
for (const ore of ['Мифрил','Уран','Алмаз']) assert.ok(deepOre.has(ore), 'Deep mines must include ' + ore + ' for the tested seed.');

const refreshFn = extractFunction('refreshMineDailyStock');
let generatedDay = null, saves = 0, notices = 0;
const refreshContext = {
  GAME_MINUTES_PER_DAY: 1440,
  gameMinuteTotal: 5 * 1440 + 821,
  mineMode: true,
  mineLevel: 4,
  mineDepth: 4,
  generateMineStock: day => { generatedDay = day; },
  saveGame: () => { saves++; return true; },
  toast: () => { notices++; }
};
execute(refreshContext, [refreshFn], ['refreshMineDailyStock']);
refreshContext.refreshMineDailyStock();
assert.equal(generatedDay, 5, 'Mine regeneration must use the current in-game day.');
assert.equal(saves, 1, 'Daily mine refresh must persist the regenerated stock.');
assert.equal(notices, 1, 'Refresh feedback must be shown while the player is in the mine.');

const clampFn = extractFunction('clampWolfBossToForest');
const forestContext = { COLS: 220, ROWS: 164, TILE: 32, Number, Math };
execute(forestContext, [clampFn], ['clampWolfBossToForest']);
const bounds = {
  minX: (220 - 32) * 32 + 16, maxX: (220 - 3) * 32 + 16,
  minY: (164 - 27) * 32 + 16, maxY: (164 - 3) * 32 + 16
};
const outside = plain(forestContext.clampWolfBossToForest(-999, 999999));
assert.deepEqual(outside, { x: bounds.minX, y: bounds.maxY });
const inside = plain(forestContext.clampWolfBossToForest(bounds.minX + 20, bounds.minY + 20));
assert.deepEqual(inside, { x: bounds.minX + 20, y: bounds.minY + 20 });
assert.match(source,/wolfBossActive\)\{const bounded=clampWolfBossToForest\(wolfBossX,wolfBossY\)/);
assert.match(source,/const next=clampWolfBossToForest\(wolfBossX\+dx\/dist\*step,wolfBossY\+dy\/dist\*step\)/);
assert.match(source,/clampWolfBossToForest\(wolfBossX\+Math\.sign\(dx\)\*step,wolfBossY\)/);
assert.ok(source.includes('wolfBossY=Number.isFinite(d.wolfBossY)?d.wolfBossY:wolfDenPosition().y;if(wolfBossActive){const bounded=clampWolfBossToForest'), 'Loaded wolf coordinates must also be normalized before chasing.');

const makeBossState = extractFunction('makeBiomeBossState');
const defs = extractFunction('biomeBossDefs');
const normalize = extractFunction('normalizeBiomeBossState');
const maxHp = extractFunction('bossHpMax');
const bossContext = { COLS: 220, ROWS: 164, TILE: 32, bossRealmMode:false, Math, Number, difficultyConfig: () => ({ rank: 1 }) };
execute(bossContext, [makeBossState, defs, normalize, maxHp], ['makeBiomeBossState','biomeBossDefs','normalizeBiomeBossState','bossHpMax']);
const normalized = plain(bossContext.normalizeBiomeBossState({
  jungle: { active: true, hp: 999999, attackTimer: 0, specialTimer: 0.2, rebirthMultiplier: 99, rebirthCount: 9 }
}));
assert.equal(normalized.jungle.rebirthMultiplier, 8.35, 'Boss rebirth multiplier must remain capped.');
assert.equal(normalized.jungle.attackTimer, 0, 'A ready normal attack timer must stay ready after loading.');
assert.equal(normalized.jungle.specialTimer, 0.2, 'A queued special attack timer must stay queued after loading.');
assert.equal(normalized.jungle.rebirthCount, 4, 'Boss rebirth count must remain capped.');
assert.equal(normalized.jungle.hp, bossContext.biomeBossDefs().find(def => def.id === 'jungle').maxHp * 8.35);

const updateBosses = extractFunction('updateBiomeBosses');
const jungleDef = bossContext.biomeBossDefs().find(def => def.id === 'jungle');
const bossMessages = [];
bossContext.biomeBosses = {
  frost:{active:false,defeated:false,hp:0,attackTimer:1.35,specialTimer:7,flash:0,rebirthMultiplier:1,rebirthCount:0},
  sand:{active:false,defeated:false,hp:0,attackTimer:1.5,specialTimer:8,flash:0,rebirthMultiplier:1,rebirthCount:0},
  blight:{active:false,defeated:false,hp:0,attackTimer:1.7,specialTimer:9,flash:0,rebirthMultiplier:1,rebirthCount:0},
  jungle:{active:true,defeated:false,hp:900,attackTimer:0.01,specialTimer:100,attackWindup:0,attackVisual:0,flash:0,rebirthMultiplier:1.7,rebirthCount:1}
};
bossContext.player = {x:jungleDef.x,y:jungleDef.y,hp:100};
Object.assign(bossContext,{
  dungeonMode:false,caveMode:false,mineMode:false,inHouse:false,tradeWorldMode:false,
  immortal:false,dodgeTimer:0,combatGuardTimer:0,combatParryTimer:0,
  armorReduction:()=>0,isModInstalled:()=>false,
  spawnVisualBurst:()=>{},updateVitals:()=>{},toast:m=>bossMessages.push(m),
  playSound:()=>{},saveGame:()=>{},respawnPlayerAfterDefeat:()=>{throw new Error('Unexpected defeat');}
});
execute(bossContext,[updateBosses],['updateBiomeBosses']);
bossContext.updateBiomeBosses(0.1);
assert.equal(bossContext.player.hp,100-37, 'A reborn jungle boss must apply its 1.7x melee damage and combat-phase scaling to the player.');
assert.ok(bossMessages.some(message=>message.includes('атакует')));

bossContext.biomeBosses.jungle.attackTimer=5;
bossContext.biomeBosses.jungle.specialTimer=0.05;
const beforeSpecial=bossContext.player.hp;
for(let i=0;i<12&&bossContext.player.hp===beforeSpecial;i++)bossContext.updateBiomeBosses(0.1);
assert.ok(bossContext.player.hp<beforeSpecial, 'Biome boss special attack must damage a player inside its radius after its telegraphed windup.');
assert.ok(bossContext.biomeBosses.jungle.specialTimer>=5.5, 'Special attack cooldown must reset after a hit.');
assert.ok(bossMessages.some(message=>message.includes('ПОДЗЕМНЫЕ ЩУПАЛЬЦА')));

const schedule = extractFunction('scheduleNemesis');
let idNumber=0, scheduleSaves=0;
const scheduleContext={
  isCoopWorldSave:()=>false,window:{},MAX_NEMESIS_EVENTS:3,
  nemesisEvents:[{id:'old-1'},{id:'old-2'},{id:'old-3'}],
  gameMinuteTotal:7*1440+800,GAME_MINUTES_PER_DAY:1440,
  newCoopEntityId:()=> 'event-' + (++idNumber),
  monsterLabel:type=>String(type),saveGame:()=>{scheduleSaves++},
  Math,Number,String
};
execute(scheduleContext,[schedule],['scheduleNemesis']);
scheduleContext.scheduleNemesis('boss','boss-a','Boss A','brute',0.4);
assert.equal(scheduleContext.nemesisEvents.length,3,'Nemesis queue must respect its size limit.');
assert.equal(scheduleContext.nemesisEvents[0].id,'old-2','Oldest nemesis entries are evicted when the queue is full.');
assert.equal(scheduleContext.nemesisEvents[2].dueDay,8,'Nemesis events must be scheduled for the next in-game day.');
assert.equal(scheduleContext.nemesisEvents[2].multiplier,1.7,'Boss rebirth must have at least 1.7x strength.');
scheduleContext.scheduleNemesis('monster','mob-a','Monster A','shadow',99);
assert.equal(scheduleContext.nemesisEvents[2].multiplier,8.35,'Nemesis strength must not exceed 8.35x.');
assert.equal(scheduleSaves,2);

const guestContext={
  isCoopWorldSave:()=>true,window:{SkyRealmCoopClient:{isRoomOwner:false}},MAX_NEMESIS_EVENTS:3,
  nemesisEvents:[],gameMinuteTotal:1440,GAME_MINUTES_PER_DAY:1440,
  newCoopEntityId:()=> 'guest-event',monsterLabel:type=>String(type),
  saveGame:()=>{throw new Error('Co-op guests must not schedule canonical nemesis events');},Math,Number,String
};
execute(guestContext,[schedule],['scheduleNemesis']);
guestContext.scheduleNemesis('boss','wolf','Wolf','shadow',1.7);
assert.equal(guestContext.nemesisEvents.length,0,'Only the co-op room owner may schedule shared nemesis events.');

const updateNemesis = extractFunction('updateNemesisEvents');
const nemesisEvents=[
  {id:'n1',kind:'boss',target:'neptune',name:'Neptune',type:'brute',multiplier:1.7,dueDay:6},
  {id:'n2',kind:'monster',target:'shadow',name:'Shadow',type:'shadow',multiplier:2.2,dueDay:6},
  {id:'n3',kind:'boss',target:'ancient',name:'Ancient',type:'brute',multiplier:8.35,dueDay:6},
  {id:'n4',kind:'monster',target:'future',name:'Future',type:'wisp',multiplier:1.7,dueDay:7}
];
const monsters=[];
const warning={hidden:true}, warningText={textContent:''};
let nemesisSaves=0, nemesisToasts=0;
const eventContext={
  nemesisEvents,lastNemesisRaidDay:5,gameMinuteTotal:6*1440+1250,GAME_MINUTES_PER_DAY:1440,
  isNightTime:()=>true,tradeWorldMode:false,mineMode:false,caveMode:false,dungeonMode:false,
  bedSpawn:{x:2000,y:1800},player:{x:100,y:100},monsters,
  newCoopEntityId:()=> 'spawn-' + monsters.length,
  spawnMonster:type=>{monsters.push({id:'spawn-'+monsters.length,type,hp:100,maxHp:100,speed:40,damageScale:1,phase:0});return true;},
  difficultyConfig:()=>({monsterHp:1,monsterDamage:1,bossHp:2000}),
  spawnVisualBurst:()=>{},toast:()=>{nemesisToasts++;},saveGame:()=>{nemesisSaves++;},
  document:{getElementById:id=>id==='night-warning'?warning:id==='night-warning-text'?warningText:null},
  Math:Object.assign(Object.create(Math),{random:()=>0.5}),Number,String,TILE:32,COLS:220,ROWS:164
};
execute(eventContext,[updateNemesis],['updateNemesisEvents']);
eventContext.updateNemesisEvents();
assert.equal(monsters.length,3,'At most three due nemesis attackers may spawn in one night.');
assert.equal(eventContext.nemesisEvents.length,1,'Future nemesis events must remain queued.');
assert.equal(eventContext.nemesisEvents[0].id,'n4');
assert.equal(eventContext.lastNemesisRaidDay,6,'A raid is processed at most once per game day.');
assert.equal(monsters[0].hp,9180,'Neptune must return at 1.7x boss strength.');
assert.equal(monsters[0].isRebornBoss,true);
assert.equal(monsters[1].hp,220,'Monster rebirth multiplier must scale health.');
assert.equal(monsters[2].hp,Math.round(2700*8.35),'High rebirth multipliers must apply and remain capped.');
assert.ok(monsters.every(mob=>mob.nemesis===true&&mob.adminSpawned===true));
assert.equal(warning.hidden,false);
assert.equal(nemesisToasts,1);
assert.equal(nemesisSaves,1);
eventContext.updateNemesisEvents();
assert.equal(monsters.length,3,'A second tick on the same night must not duplicate the raid.');


const seaSource = fs.readFileSync(path.join(__dirname, '../game/sea-system.js'), 'utf8');
function extractSeaFunction(name) {
  const start = seaSource.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'Missing sea function ' + name);
  const open = seaSource.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < seaSource.length; i++) {
    const c = seaSource[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c.charCodeAt(0) === 96) { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return seaSource.slice(start, i + 1);
  }
  throw new Error('Unclosed sea function ' + name);
}

const seaMessageCalls = [];
const seaMessageContext = {state:{message:'',messageLeft:0},$:()=>null,bridge:()=>({toast:text=>seaMessageCalls.push(text)})};
execute(seaMessageContext,[extractSeaFunction('msg')],['msg']);
seaMessageContext.msg('Сначала создай корабль на второй странице верстака.');
assert.deepEqual(seaMessageCalls,['Сначала создай корабль на второй странице верстака.'],
  'Sea expedition prerequisites must show a visible game toast before the sea overlay exists.');
const seaMessageElement={textContent:''};
seaMessageContext.$=id=>id==='sea-message'?seaMessageElement:null;
seaMessageContext.msg('Ты вышел за горизонт.');
assert.equal(seaMessageElement.textContent,'Ты вышел за горизонт.');
assert.equal(seaMessageCalls.length,1,'In-expedition messages must stay inside the sea overlay.');

function runSeaEntry(worldId, hasBoat) {
  const messages=[],pauseLock={hidden:true},root={hidden:true},state={underwater:false,helmetLevel:0};
  let buildCalls=0,saveCalls=0,paused=false;
  const context={
    bridge:()=>({getWorldId:()=>worldId,hasItem:()=>hasBoat,getWaterHelmetLevel:()=>2,pause:()=>{paused=true;}}),
    msg:text=>messages.push(text),build:()=>{buildCalls++;},load:()=>{},ensureWorld:()=>{},
    state,active:false,root,$:()=>pauseLock,resize:()=>{},performance:{now:()=>100},
    cancelAnimationFrame:()=>{},requestAnimationFrame:()=>7,frame:()=>{},save:()=>{saveCalls++;},raf:0
  };
  execute(context,[extractSeaFunction('enter')],['enter']);
  context.enter();
  return {context,messages,pauseLock,root,state,buildCalls,saveCalls,paused};
}
const noWorld=runSeaEntry(null,false);
assert.deepEqual(noWorld.messages,['Сначала загрузи игровой мир.']);
assert.equal(noWorld.buildCalls,0,'Do not build the expedition UI before a world is selected.');
const noBoat=runSeaEntry('world-1',false);
assert.deepEqual(noBoat.messages,['Сначала создай корабль на второй странице верстака.']);
assert.equal(noBoat.buildCalls,0);
const seaOpened=runSeaEntry('world-1',true);
assert.equal(seaOpened.context.active,true,'A valid world with a crafted ship must open the sea expedition.');
assert.equal(seaOpened.root.hidden,false);
assert.equal(seaOpened.pauseLock.hidden,false);
assert.equal(seaOpened.state.helmetLevel,2);
assert.equal(seaOpened.paused,true);
assert.equal(seaOpened.saveCalls,1);
assert.deepEqual(seaOpened.messages,['Ты вышел за горизонт. Исследуй море и ищи затонувшие сокровища.']);
assert.match(seaSource,/function installExpeditionButton\(\)/);
assert.match(seaSource,/document\.readyState==='loading'/,
  'Expedition button initialization must work whether the script loads before or after DOMContentLoaded.');

console.log('SkyRealm sea expedition launch, prerequisite feedback and world-entry tests passed.');

console.log('SkyRealm mine refresh, forest boundary, biome boss attacks, rebirth queue and next-night raid tests passed.');





const bossRealmPortalUnlockedFn = extractFunction('bossRealmPortalUnlocked');
const bossRealmGateContext = { bossRealmMode:false, survivedNights:2 };
execute(bossRealmGateContext, [bossRealmPortalUnlockedFn], ['bossRealmPortalUnlocked']);
assert.equal(bossRealmGateContext.bossRealmPortalUnlocked(), false, 'The boss portal must stay locked before three survived nights.');
bossRealmGateContext.survivedNights = 3;
assert.equal(bossRealmGateContext.bossRealmPortalUnlocked(), true, 'The boss portal must unlock after three survived nights.');
bossRealmGateContext.survivedNights = 0; bossRealmGateContext.bossRealmMode = true;
assert.equal(bossRealmGateContext.bossRealmPortalUnlocked(), true, 'The return portal must remain available inside the boss realm.');
assert.match(source, /bossRealm:true/);
assert.match(source, /bossRealm===true&&w\.bossParentWorldId===originId/, 'Each normal world must have its own independent Boss Realm.');
assert.match(source, /bossReturnWorldId,bossReturnX,bossReturnY/);
assert.match(source, /function enterBossRealm\(\)/);
assert.match(source, /function leaveBossRealm\(\)/);
assert.match(source, /function enterWorld\(id,difficultyChoice=null,options=\{\}\)/, 'Dimension transitions must support skipping first-entry character setup.');
assert.match(source, /enterWorld\(realm\.id,null,\{skipCharacterEntry:true\}\)/, 'Entering the Boss Realm must not reopen the character editor.');
assert.match(source, /enterWorld\(targetId,null,\{skipCharacterEntry:true\}\)/, 'Returning from the Boss Realm must not reopen the character editor.');
assert.match(source, /localStorage\.getItem\(worldSaveKey\(realm\.id\)\)/, 'Boss Realm loading must inspect its own saved world data.');
assert.match(source, /localStorage\.getItem\(worldSaveKey\(targetId\)\)/, 'Return loading must inspect the original world save.');
assert.match(source, /performance\.now\(\)-loadStartedAt/, 'Loading completion should report the measured world restore time.');
assert.doesNotMatch(source, /setTimeout\(resolve,180\)|setTimeout\(resolve,160\)|setTimeout\(resolve,260\)|setTimeout\(resolve,220\)/, 'Boss Realm loading must not rely on the old fixed fake loading delays.');
assert.match(source, /drawBossRealmPortal\(camX,camY,time\)/);
assert.match(source, /await interactBossRealmPortal\(\)/);
console.log('SkyRealm boss realm portal unlock, separate save slot and return flow tests passed.');

// Boss Realm creature roster, combat progression, abilities, presentation and first-entry onboarding.
assert.equal((source.match(/tier:'mob'/g)||[]).length,8,'Boss Realm must define eight regular creatures.');
assert.equal((source.match(/tier:'elite'/g)||[]).length,6,'Boss Realm must define six elite creatures, including the awakened tree and Root Eater.');
assert.equal((source.match(/tier:'boss'/g)||[]).length,9,'Boss Realm must define nine bosses including the Forest King.');
assert.equal((source.match(/tier:'god'/g)||[]).length,2,'Boss Realm must define two gods.');
for(const event of ['meteor','horde','blood_moon','awakening','rift','storm'])assert.ok(source.includes("['"+event+"'")||source.includes('["'+event+'"'),'Missing Boss Realm event '+event);
for(const type of ['shadow_hunter','stone_guardian','cursed_skull','rift_wolf','venom_beetle','fallen_warrior','rift_archer','ash_spirit','abyss_general','blood_berserker','rift_warden','soul_devourer','abyss_king','rift_dragon','ancient_devourer','end_knight','astral_god','chronos_god','root_eater'])assert.ok(source.includes(type),'Missing Boss Realm creature '+type);
assert.match(source,/function updateBossRealmEnemies\(dt\)/);
assert.match(source,/function drawBossRealmCreature\(m,x,y,time\)/);
assert.match(source,/m\.phaseStage=2/,'Bosses must have a second phase.');
assert.match(source,/m\.phaseStage=3/,'Bosses must have an enraged third phase.');
assert.match(source,/bossRealmInvisibleTimer=4\.5/,'Invisibility must last 4.5 seconds.');
assert.match(source,/bossRealmDamageBoostTimer=5;bossRealmAbilityCooldown=10/,'Damage boost must last 5 seconds with a 10 second cooldown.');
assert.match(source,/equipment\.armor==='Нагрудник Бога'\?\.90/,'God chest armor must provide 90% base protection.');
assert.match(source,/if\(k==='v'.*useBossRealmInvisibility/s,'V must activate invisibility.');
assert.match(source,/if\(k==='b'.*useBossRealmDamageBoost/s,'B must activate the damage boost.');
assert.match(source,/урон меча меньше 67/,'The first-entry warning must use corrected Russian text.');
assert.match(source,/setTimeout\(\(\)=>\{stage=1/,'The second intro panel must appear after the five-second first-panel pause.');
assert.match(source,/bossRealmCreatures:bossRealmMode\?/,'Boss Realm creatures must be stored in its independent save.');
assert.match(source,/document\.getElementById\('boss-realm-welcome'\)/,'The first-entry overlay must keep gameplay paused.');
// Large visual-only upgrades: dynamic boss encounter atmosphere and volumetric cave lighting.
assert.match(source,/const activeBoss=monsters\.find\(m=>m\.bossRealmCreature/,'Boss Realm must find the currently active major boss for the atmosphere pass.');
assert.match(source,/const bossGlow=ctx\.createRadialGradient\(bx,by-8,10,bx,by,radius\)/,'The active boss must cast a large, soft theme-colored light into the arena.');
assert.match(source,/Long, slow shafts make the boss silhouette readable/,'Boss Realm must draw layered light shafts through the ash.');
assert.match(source,/Deterministic drifting embers\/ice motes/,'Boss Realm atmosphere must use lightweight deterministic particles.');
assert.match(source,/layered volumetric shafts reveal the height and scale of the existing cavern/i,'The ordinary-world cavern must have volumetric ceiling light shafts.');
assert.match(source,/Soft reflected pools connect the existing lanterns to the cave floor/,'Existing cave lanterns must cast reflected light pools.');
console.log('SkyRealm Boss Realm creatures, bosses, gods, abilities, events, visuals and onboarding tests passed.');

assert.ok(source.includes("forest_king:{name:'Король Древнего Леса'")&&source.includes("name:'Сердце Древнего Леса'"),'Forest King must have a unique boss and passive relic.');


// Regression: ordinary-world tree restoration must not depend on a function
// that is scoped only inside the Boss Realm arena-layout builder.
const treeRegrowthFn = extractFunction('updateTreeRegrowth');
let treeRegrowthSaveCount = 0;
const treeRegrowthContext = {
  isCoopWorldSave: () => false,
  tradeWorldMode: false, inHouse: false, caveMode: false, mineMode: false, dungeonMode: false,
  felledTrees: [{x:320,y:480,regrowAt:4320,size:2.5,tint:7,fruitful:true,ancient:true}],
  gameMinuteTotal: 4319,
  world: {trees:[]},
  waterAt: () => false,
  TILE: 32,
  player: {x:320,y:480},
  spawnVisualBurst: () => {},
  saveGame: () => { treeRegrowthSaveCount++; },
  toast: () => {},
  Math
};
execute(treeRegrowthContext, [treeRegrowthFn], ['updateTreeRegrowth']);
treeRegrowthContext.updateTreeRegrowth();
assert.equal(treeRegrowthContext.world.trees.length, 0, 'A tree must not regrow before its saved due time.');
treeRegrowthContext.gameMinuteTotal = 4320;
treeRegrowthContext.updateTreeRegrowth();
assert.equal(treeRegrowthContext.world.trees.length, 1, 'A felled tree must regrow when world time reaches regrowAt.');
assert.equal(treeRegrowthContext.world.trees[0].size, 2, 'Restored tree size must be clamped to the supported maximum.');
assert.equal(treeRegrowthContext.world.trees[0].tint, 2, 'Restored tree tint must be clamped to a supported palette index.');
assert.equal(treeRegrowthContext.world.trees[0].fruitful, true, 'Fruit-bearing status must survive regrowth.');
assert.equal(treeRegrowthContext.world.trees[0].ancient, true, 'Ancient-tree status must survive regrowth.');
assert.equal(treeRegrowthContext.felledTrees.length, 0, 'Successfully restored trees must be removed from the stump queue.');
assert.equal(treeRegrowthSaveCount, 1, 'Restoring a tree must persist the updated world.');
console.log('SkyRealm tree-regrowth regression tests passed.');


// Regression: the dedicated ancient grove must not be suppressed by the
// ordinary-world village proximity guard. Its position is intentionally near
// the Boss Realm spawn/settlement marker, so only water and paths are excluded.
const ancientForestFn = extractFunction('ensureBossRealmForest');
const ancientForestContext = {
  bossRealmMode: true,
  world: {ancientForestSeeded:false,trees:[],rocks:[]},
  COLS:220, ROWS:164, TILE:32,
  hash:(x,y)=>Math.abs((x*17+y*31)%997)/997,
  waterAt:()=>false,
  pathAt:()=>false,
  nearVillage:()=>true,
  felledTrees:[],
  Math
};
execute(ancientForestContext, [ancientForestFn], ['ensureBossRealmForest']);
ancientForestContext.ensureBossRealmForest();
assert.ok(ancientForestContext.world.trees.filter(tree=>tree.ancient).length>=20,
  'The Ancient Forest must generate trees even when the grove is within the village proximity guard.');
assert.ok(ancientForestContext.world.rocks.filter(rock=>rock.ancient).length>0,
  'The Ancient Forest must generate mineable stone and crystal deposits.');
console.log('SkyRealm Ancient Forest seeding regression tests passed.');


// Regression: Forest King is a grove encounter, not a Forge-arena boss.
const bossArenaRouteFn = extractFunction('bossRealmArenaIdFor');
const bossArenaRouteContext = {};
execute(bossArenaRouteContext, [bossArenaRouteFn], ['bossRealmArenaIdFor']);
assert.equal(bossArenaRouteContext.bossRealmArenaIdFor('forest_king'), 'forest',
  'Forest King must remain in the Ancient Forest instead of being routed to the Ashen Forge.');
assert.equal(bossArenaRouteContext.bossRealmArenaIdFor('magma_behemoth'), 'forge',
  'The Ashen Titan must remain assigned to the Forge arena.');
console.log('SkyRealm Forest King arena-routing regression tests passed.');


// Regression: the Root Crypt entrance and nearby root trap must have
// non-overlapping interaction radii, so pressing E at the trap disarms it.
const forestModuleSource = fs.readFileSync(path.join(__dirname, '../game/forest-ecosystem.js'), 'utf8');
const archInteraction = forestModuleSource.indexOf('if(Math.hypot(p.x-arch.x,p.y-arch.y)<72)');
const trapInteraction = forestModuleSource.indexOf('if(Math.hypot(p.x-trap.x,p.y-trap.y)<70');
assert.ok(archInteraction >= 0 && trapInteraction > archInteraction,
  'Root Crypt entrance radius must leave the adjacent trap interaction reachable.');
assert.ok(Math.hypot(132-90,42-116) > 72,
  'The exact trap position must be outside the entrance interaction radius.');
console.log('SkyRealm Root Crypt trap interaction regression tests passed.');
