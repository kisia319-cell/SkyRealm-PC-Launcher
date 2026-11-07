'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','game','game.js'),'utf8');
function extractFunction(name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'Missing function '+name);
 const open=source.indexOf('{',start);let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
 for(let i=open;i<source.length;i++){const c=source[i],n=source[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue;}if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
  if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){lineComment=true;i++;continue;}if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
  if(c==="'"||c==='"'||c.charCodeAt(0)===96){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
 }throw Error('Unclosed function '+name);
}
function run(ctx,names,expose){vm.runInNewContext(names.map(extractFunction).join('\n')+'\n'+expose.map(n=>'globalThis.'+n+'='+n+';').join('\n'),ctx);}
const tests=[];function testCase(name,fn){fn();tests.push(name);}
function fixture(){
 const events={jobs:[],xp:[],bursts:[],sounds:[],saves:0,renders:0,toasts:[]},inventory={};
 const math=Object.create(Math);math.random=()=>.2;
 const ctx={Math:math,Number,width:800,height:600,mineSeed:917,mineLevel:4,mineBarrels:[],mineCreatures:[],minePlayerAttackCooldown:0,mineMode:true,
  mineRockScreenPosition:r=>({x:65+(r.x/330)*(ctx.width-130),y:85+(r.y/255)*(ctx.height-150)}),
  hash:(a,b)=>{const n=Math.sin(a*12.9898+b*78.233)*43758.5453;return n-Math.floor(n);},
  spawnVisualBurst:(...v)=>events.bursts.push(v),playSound:v=>events.sounds.push(v),
  changeItem:(name,count)=>{inventory[name]=(inventory[name]||0)+count;},awardXP:(...v)=>events.xp.push(v),
  window:{SkyRealmJobs:{record:(...v)=>events.jobs.push(v)}},toast:v=>events.toasts.push(v),
  saveGame:()=>{events.saves++;return true;},renderInventory:()=>{events.renders++;},player:{x:80,y:90,hp:100},
  minePlayerX:80,minePlayerY:90,immortal:false,armorReduction:()=>0,updateVitals:()=>{},respawnPlayerAfterDefeat:()=>{},
  mineCreatureScreenPosition:m=>({x:65+(m.x/330)*(ctx.width-130),y:85+(m.y/255)*(ctx.height-150)})};
 return {ctx,events,inventory};
}
testCase('mine passage map has a main gallery and four branches',()=>{
 const f=fixture();run(f.ctx,['minePassagePaths'],['minePassagePaths']);
 const paths=f.ctx.minePassagePaths();assert.equal(paths.length,12);
 assert.ok(paths.every(p=>p.length>=4));assert.equal(JSON.stringify(paths[0][0]),JSON.stringify([8,220]));
});
testCase('barrels and mixed single/pair creature groups generate deterministically',()=>{
 const f=fixture();run(f.ctx,['generateMineFeatures'],['generateMineFeatures']);f.ctx.generateMineFeatures(3);
 assert.equal(f.ctx.mineBarrels.length,6);assert.equal(f.ctx.mineCreatures.length,6);
 assert.ok(f.ctx.mineBarrels.every(b=>b.hp===2&&b.coal>=1&&b.stone>=1));
 assert.ok(f.ctx.mineCreatures.every(m=>m.hp===m.maxHp&&m.x>12&&m.x<320&&m.y>30&&m.y<238));
 const first=JSON.stringify({barrels:f.ctx.mineBarrels,creatures:f.ctx.mineCreatures});
 f.ctx.generateMineFeatures(3);assert.equal(JSON.stringify({barrels:f.ctx.mineBarrels,creatures:f.ctx.mineCreatures}),first);
});
testCase('defeating a cave creature awards coal, hunter profession progress and XP',()=>{
 const f=fixture();run(f.ctx,['mineCreatureScreenPosition','strikeMineCreature'],['strikeMineCreature']);
 const mob={x:.5,y:.5,hp:10,maxHp:10,kind:'crawler',name:'Пещерный грызун'};
 assert.equal(f.ctx.strikeMineCreature(mob,30),true);assert.equal(mob.hp,0);assert.ok(f.inventory['Уголь']>=1);
 assert.equal(f.events.jobs[0][0],'hunter');assert.equal(f.events.xp.length,1);assert.equal(f.events.saves,1);assert.equal(f.events.renders,1);
});
testCase('barrels break in two hits and award their stored resources',()=>{
 const f=fixture();run(f.ctx,['strikeMineBarrel'],['strikeMineBarrel']);const barrel={x:80,y:160,hp:2,maxHp:2,coal:2,stone:3};
 f.ctx.strikeMineBarrel(barrel);assert.equal(barrel.hp,1);assert.equal(f.inventory['Уголь']||0,0);
 f.ctx.strikeMineBarrel(barrel);assert.equal(barrel.hp,0);assert.equal(f.inventory['Уголь'],2);assert.equal(f.inventory['Камень'],3);
 assert.equal(f.events.saves,2);assert.equal(f.events.renders,1);
});
testCase('creatures move toward the player and attack on cooldown',()=>{
 const f=fixture();run(f.ctx,['updateMineCreatures'],['updateMineCreatures']);
 f.ctx.mineCreatures=[{x:7,y:3,hp:30,maxHp:30,damage:7,speed:30,attackCooldown:0,phase:0,flash:0,name:'Пещерный грызун'}];
 f.ctx.updateMineCreatures(.1);assert.equal(f.ctx.player.hp,93);assert.ok(f.ctx.mineCreatures[0].attackCooldown>2);assert.equal(f.events.saves,1);
});
testCase('legacy worlds with empty mine feature arrays are backfilled',()=>{
 const f=fixture();run(f.ctx,['generateMineFeatures','restoreMineFeaturesFromSave'],['restoreMineFeaturesFromSave']);
 const result=f.ctx.restoreMineFeaturesFromSave({mineBarrels:[],mineCreatures:[]},3);
 assert.equal(result.backfilledBarrels,true);assert.equal(result.backfilledCreatures,true);
 assert.ok(f.ctx.mineBarrels.length>=5);assert.ok(f.ctx.mineCreatures.length>=4);
});
testCase('mine migration preserves already-broken barrels while filling missing creatures',()=>{
 const f=fixture();run(f.ctx,['generateMineFeatures','restoreMineFeaturesFromSave'],['restoreMineFeaturesFromSave']);
 const spent={id:'old-barrel',x:50,y:180,hp:0,maxHp:2,coal:1,stone:2};
 const result=f.ctx.restoreMineFeaturesFromSave({mineFeaturesVersion:0,mineBarrels:[spent],mineCreatures:[]},2);
 assert.equal(result.backfilledBarrels,false);assert.equal(result.backfilledCreatures,true);
 assert.equal(f.ctx.mineBarrels.length,1);assert.equal(f.ctx.mineBarrels[0].hp,0);
 assert.ok(f.ctx.mineCreatures.length>0);
});
testCase('current mine saves do not respawn cleared objects',()=>{
 const f=fixture();run(f.ctx,['generateMineFeatures','restoreMineFeaturesFromSave'],['restoreMineFeaturesFromSave']);
 const result=f.ctx.restoreMineFeaturesFromSave({mineFeaturesVersion:1,mineBarrels:[],mineCreatures:[]},2);
 assert.equal(result.backfilledBarrels,false);assert.equal(result.backfilledCreatures,false);
 assert.equal(f.ctx.mineBarrels.length,0);assert.equal(f.ctx.mineCreatures.length,0);
});
testCase('original mine movement block remains unchanged',()=>{
 const movement="if(mineMode && (mx||my)){if(mx&&my){mx*=.7071;my*=.7071;}minePlayerX=Math.max(48,Math.min(width-48,minePlayerX+mx*speed*dt));minePlayerY=Math.max(100,Math.min(height-70,(minePlayerY||height-108)+my*speed*dt));}";
 assert.ok(source.includes(movement));assert.ok(source.includes('mineTileX,mineTileY,mineRocks,mineBarrels,mineCreatures,quarryProgress'));
 assert.ok(source.includes('drawMinePassages()'));assert.ok(source.includes('updateMineCreatures(dt)'));
});
console.log('PASS '+tests.length+' mine exploration tests: '+tests.join(' | '));
