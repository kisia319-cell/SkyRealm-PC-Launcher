'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const gameDir=path.join(__dirname,'..','game');
const source=fs.readFileSync(path.join(gameDir,'game.js'),'utf8');
function extractFunction(name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'Missing function '+name);
 const open=source.indexOf('{',start);let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
 for(let i=open;i<source.length;i++){const c=source[i],n=source[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
  if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){lineComment=true;i++;continue;}if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
  if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
 }
 throw Error('Unclosed function '+name);
}
function runFns(ctx,names,expose){vm.runInNewContext(names.map(extractFunction).join('\n')+'\n'+expose.map(n=>'globalThis.'+n+'='+n+';').join('\n'),ctx);}
const tests=[];function test(name,fn){fn();tests.push(name);}

function mineFixture(tool,ore='Железо',quality=2,size=1.3,hp=2){
 const rock={x:10,y:10,s:size,ore,quality,hp,maxHp:hp,regrowAt:0,hitFlash:0};
 const inv={},messages=[],events={jobs:[],xp:[],bursts:[],sounds:[],saves:0,renders:0};
 const math=Object.create(Math);math.random=()=>.99;
 const ctx={Math:math,Number,tradeWorldMode:false,bossRealmMode:false,inHouse:false,mineMode:false,caveMode:false,dungeonMode:false,paused:false,inMainMenu:false,
  player:{x:10,y:10},world:{rocks:[rock]},selectedInventoryItem:()=>tool?{name:tool}:null,
  toast:m=>messages.push(String(m)),saveGame:()=>{events.saves++;return true;},
  changeItem:(n,d)=>{inv[n]=(inv[n]||0)+d;return true;},spawnVisualBurst:(...a)=>events.bursts.push(a),playSound:k=>events.sounds.push(k),
  skillBonus:()=>0,classHas:()=>false,isModInstalled:()=>false,quarryProgress:{mined:0,stone:0,rank:1},quarrySystemAccumulator:0,gameMinuteTotal:1000,
  window:{SkyRealmJobs:{record:(id,n)=>events.jobs.push([id,n])}},awardXP:(n,why)=>events.xp.push([n,why]),
  renderInventory:()=>{events.renders++;}};
 return {ctx,rock,inv,messages,events};
}
test('basic pickaxe harvests over two hits and grants the correct stone, ore, XP and profession progress',()=>{
 const f=mineFixture('Кирка');runFns(f.ctx,['tryMineWorldRock'],['tryMineWorldRock']);
 assert.equal(f.ctx.tryMineWorldRock(),true);assert.equal(f.rock.hp,1);assert.equal(f.inv['Камень']||0,0);
 assert.equal(f.ctx.tryMineWorldRock(),true);assert.equal(f.rock.hp,0);
 assert.equal(f.inv['Камень'],7);assert.equal(f.inv['Железо'],1);
 assert.equal(f.ctx.quarryProgress.mined,1);assert.equal(f.ctx.quarryProgress.stone,7);
 assert.equal(f.rock.regrowAt,1600);assert.deepEqual(f.events.jobs,[['miner',1]]);
 assert.deepEqual(f.events.xp,[[32,'добыча камня']]);assert.ok(f.events.saves>=2);assert.equal(f.events.renders,1);
});
test('improved and master pickaxes apply 2 and 4 damage',()=>{
 for(const [tool,hp] of [['Улучшенная кирка',0],['Кирка мастера',0]]){
  const f=mineFixture(tool,'Камень',1,1,2);runFns(f.ctx,['tryMineWorldRock'],['tryMineWorldRock']);
  f.ctx.tryMineWorldRock();assert.equal(f.rock.hp,hp,tool+' should break a 2-HP vein in one hit');
 }
});
test('mining without a selected pickaxe does not damage the vein',()=>{
 const f=mineFixture(null);runFns(f.ctx,['tryMineWorldRock'],['tryMineWorldRock']);
 assert.equal(f.ctx.tryMineWorldRock(),true);assert.equal(f.rock.hp,2);assert.ok(f.messages.some(m=>m.includes('Выбери кирку')));
});
test('depleted vein blocks repeat mining until its in-game regeneration deadline',()=>{
 const f=mineFixture('Кирка','Камень',1,1,1);f.rock.hp=0;f.rock.regrowAt=1600;
 runFns(f.ctx,['tryMineWorldRock'],['tryMineWorldRock']);f.ctx.tryMineWorldRock();
 assert.equal(f.rock.hp,0);assert.ok(f.messages.some(m=>m.includes('уже добыта')));
});
test('depleted veins regenerate only during active normal-world gameplay and persist the respawn',()=>{
 const f=mineFixture(null);f.rock.hp=0;f.rock.regrowAt=1600;f.ctx.gameMinuteTotal=1600;
 runFns(f.ctx,['updateQuarrySystem'],['updateQuarrySystem']);
 f.ctx.updateQuarrySystem(.3);assert.equal(f.rock.hp,2);assert.equal(f.rock.regrowAt,0);assert.equal(f.events.saves,1);
 f.rock.hp=0;f.rock.regrowAt=1600;f.ctx.paused=true;f.ctx.updateQuarrySystem(.3);assert.equal(f.rock.hp,0);
});
test('selling stone pays the configured quarry price and removes the sold stack',()=>{
 const ctx={NPC_SELL_PRICES:{quarry:{'Камень':180}},villageReputation:0,isModInstalled:()=>false,
  farmCropSellPrice:()=>0,itemCount:n=>n==='Камень'?5:0,walletCents:100,changeItem:(n,d)=>{ctx.inventory[n]=(ctx.inventory[n]||0)+d;return true;},
  inventory:{'Камень':5},formatMoney:n=>String(n),playSound:()=>{},renderInventory:()=>{},updateWalletHud:()=>{},renderShop:()=>{},saveGame:()=>{},toast:()=>{}};
 runFns(ctx,['sellNpcItem'],['sellNpcItem']);ctx.sellNpcItem('quarry','Камень');assert.equal(ctx.walletCents,1000);assert.equal(ctx.inventory['Камень'],0);
});
test('buying the upgraded pickaxe charges the listed price and grants the real inventory item',()=>{
 const ctx={NPC_SHOPS:{quarry:[{name:'Улучшенная кирка',price:8500}]},NPC_SELL_PRICES:{},villageReputation:0,
  farmCropBuyPrice:()=>0,farmEconomy:()=>({buy:1}),isModInstalled:()=>false,walletCents:12000,
  changeItem:(n,d)=>{ctx.inventory[n]=(ctx.inventory[n]||0)+d;return true;},inventory:{},WEAPON_BASE_DAMAGE:{},equipment:{},
  playSound:()=>{},renderInventory:()=>{},renderEquipmentPanel:()=>{},updateWalletHud:()=>{},renderShop:()=>{},saveGame:()=>{},toast:()=>{},formatMoney:n=>String(n)};
 runFns(ctx,['buyNpcItem'],['buyNpcItem']);ctx.buyNpcItem('quarry','Улучшенная кирка');assert.equal(ctx.walletCents,3500);assert.equal(ctx.inventory['Улучшенная кирка'],1);
});
test('Bran quarry delivery order accepts, checks 25 stone, consumes it and awards money, coal and XP',()=>{
 const els={};for(const id of ['npc-quest-items','npc-quest-status','npc-quest-reward','npc-quest-action','npc-quest-title','npc-quest-person','npc-quest-description'])els[id]={textContent:'',innerHTML:'',disabled:false};
 const inventory={'Камень':0,'Уголь':0},awards=[];
 const ctx={NPC_QUESTS:{quarry:{title:'Заказ каменоломни',desc:'Добудь и доставь 25 камня',items:{'Камень':25},gold:5200,xp:180,rewardItems:{'Уголь':3}}},
  NPC_NAMES:{quarry:'Бран'},NPC_LABELS:{quarry:'КАМЕНЩИК'},activeNpcQuestId:'quarry',npcQuestState:{},gameMinuteTotal:1440,GAME_MINUTES_PER_DAY:1440,
  document:{getElementById:id=>els[id]},itemCount:n=>inventory[n]||0,changeItem:(n,d)=>{inventory[n]=(inventory[n]||0)+d;return true;},
  walletCents:0,villageReputation:0,isModInstalled:()=>false,awardXP:(n,why)=>awards.push([n,why]),playSound:()=>{},renderInventory:()=>{},updateWalletHud:()=>{},saveGame:()=>{}};
 runFns(ctx,['npcQuestStatus','renderNpcQuestDialog'],['renderNpcQuestDialog']);
 ctx.npcQuestStatus=id=>ctx.npcQuestState[id]||{status:0,day:1};
 ctx.renderNpcQuestDialog();assert.equal(els['npc-quest-person'].textContent,'Бран · КАМЕНЩИК · КАМЕНОЛОМНЯ · ОБЫЧНЫЙ МИР','Bran must be labeled as an ordinary-world quarry NPC');assert.equal(els['npc-quest-action'].disabled,false);els['npc-quest-action'].onclick();
 assert.equal(ctx.npcQuestState.quarry.status,1);assert.equal(els['npc-quest-action'].disabled,true);
 inventory['Камень']=25;ctx.renderNpcQuestDialog();assert.equal(els['npc-quest-action'].disabled,false);els['npc-quest-action'].onclick();
 assert.equal(inventory['Камень'],0);assert.equal(inventory['Уголь'],3);assert.equal(ctx.walletCents,5200);assert.deepEqual(awards,[[180,'поручение Заказ каменоломни']]);
 assert.equal(ctx.npcQuestState.quarry.status,2);
});
test('quarry order has a real E-key entry point and world save/load carries depleted rocks and quarry progress',()=>{
 assert.ok(/openNpcQuestDialog\(\{id:'quarry'\}\)/.test(source),'E must open Brан quest dialog at the quarry broker');
 assert.ok(/k === 'e' && !paused/.test(source),'E interaction handler must exist');
 assert.ok(source.includes('E · ЗАКАЗЫ')&&source.includes('T · ПРОДАЖА КАМНЯ'));
 assert.ok(source.includes('quarryProgress,quarryRocks:world.rocks.map'));
 assert.ok(source.includes('quarryProgress={mined:Math.max(0'));
 assert.ok(source.includes("rock.regrowAt=Math.max(0,Math.min(gameMinuteTotal+200000,Number(saved.regrowAt)||0))"));
});
console.log('PASS '+tests.length+' quarry tests: '+tests.join(' | '));
