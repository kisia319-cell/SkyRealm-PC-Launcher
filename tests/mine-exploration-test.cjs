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
 const ctx={Math:math,Number,width:800,height:600,mineSeed:917,mineLevel:4,mineDepth:3,mineBarrels:[],mineCreatures:[],minePlayerAttackCooldown:0,mineMode:true,mineMaze:null,MINE_MAZE_COLS:21,MINE_MAZE_ROWS:15,MINE_CELL_SIZE:44,
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
testCase('mine is a connected generated labyrinth with an entrance and distant stairs',()=>{
 const f=fixture();f.ctx.MINE_MAZE_COLS=21;f.ctx.MINE_MAZE_ROWS=15;f.ctx.MINE_CELL_SIZE=44;
 run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineCellFromWorld'],['generateMineMaze','mineCellWalkable','mineCellFromWorld']);
 const grid=f.ctx.generateMineMaze();assert.equal(grid.length,15);assert.equal(grid[0].length,21);
 assert.equal(f.ctx.mineCellWalkable(1,13),true);assert.equal(f.ctx.mineCellWalkable(19,1),true);
 const seen=new Set(['1,13']),queue=[[1,13]];for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(f.ctx.mineCellWalkable(nx,ny)&&!seen.has(k)){seen.add(k);queue.push([nx,ny]);}}}
 assert.ok(seen.has('19,1'),'stairs must be reachable from entrance');assert.ok(seen.size>70,'maze must contain a substantial network of walkable cells');
});
testCase('barrels and mixed single/pair creature groups generate deterministically',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineFeaturePoint','generateMineFeatures'],['generateMineFeatures']);f.ctx.generateMineFeatures(3);
 assert.equal(f.ctx.mineBarrels.length,6);assert.equal(f.ctx.mineCreatures.length,5);
 assert.ok(f.ctx.mineBarrels.every(b=>b.hp===2&&b.coal>=1&&b.stone>=1));
 assert.ok(f.ctx.mineCreatures.every(m=>m.hp===m.maxHp&&m.x>0&&m.x<330&&m.y>0&&m.y<255));
 const first=JSON.stringify({barrels:f.ctx.mineBarrels,creatures:f.ctx.mineCreatures});
 f.ctx.generateMineFeatures(3);assert.equal(JSON.stringify({barrels:f.ctx.mineBarrels,creatures:f.ctx.mineCreatures}),first);
});
testCase('defeating a cave creature awards coal, hunter profession progress and XP',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineCellFromWorld','mineNearestFloorCell','mineFeatureWorldPosition','mineWorldToScreen','mineRockScreenPosition','mineCreatureScreenPosition'].concat(['strikeMineCreature']),['strikeMineCreature']);
 const mob={x:.5,y:.5,hp:10,maxHp:10,kind:'crawler',name:'Пещерный грызун'};
 assert.equal(f.ctx.strikeMineCreature(mob,30),true);assert.equal(mob.hp,0);assert.ok(f.inventory['Уголь']>=1);
 assert.equal(f.events.jobs[0][0],'hunter');assert.equal(f.events.xp.length,1);assert.equal(f.events.saves,1);assert.equal(f.events.renders,1);
});
testCase('barrels break in two hits and award their stored resources',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineCellFromWorld','mineNearestFloorCell','mineFeatureWorldPosition','mineWorldToScreen','mineRockScreenPosition','mineCreatureScreenPosition'].concat(['strikeMineBarrel']),['strikeMineBarrel']);const barrel={x:80,y:160,hp:2,maxHp:2,coal:2,stone:3};
 f.ctx.strikeMineBarrel(barrel);assert.equal(barrel.hp,1);assert.equal(f.inventory['Уголь']||0,0);
 f.ctx.strikeMineBarrel(barrel);assert.equal(barrel.hp,0);assert.equal(f.inventory['Уголь'],2);assert.equal(f.inventory['Камень'],3);
 assert.equal(f.events.saves,2);assert.equal(f.events.renders,1);
});
testCase('creatures move toward the player and attack on cooldown',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineCellFromWorld','mineNearestFloorCell','mineFeatureWorldPosition','mineNextStepTowardPlayer','mineWorldToScreen','updateMineCreatures'],['updateMineCreatures']);
 f.ctx.mineCreatures=[{x:7,y:3,hp:30,maxHp:30,damage:3,speed:30,attackCooldown:0,phase:0,flash:0,name:'Пещерный грызун'}];const mobPos=f.ctx.mineFeatureWorldPosition(f.ctx.mineCreatures[0]);f.ctx.minePlayerX=mobPos.x;f.ctx.minePlayerY=mobPos.y;
 f.ctx.updateMineCreatures(.1);assert.equal(f.ctx.player.hp,90,'Mine creatures must deal exactly 10 HP per hit.');assert.ok(f.ctx.mineCreatures[0].attackCooldown>2);assert.equal(f.events.saves,1);
});
testCase('player can reliably attack a nearby cave creature with the spacebar target helper',()=>{
 const f=fixture();f.ctx.mineMode=true;f.ctx.minePlayerX=0;f.ctx.minePlayerY=0;f.ctx.minePlayerAttackCooldown=0;
 f.ctx.mineCreatures=[{x:30,y:0,hp:100,maxHp:100,kind:'crawler',name:'Пещерный грызун'}];
 f.ctx.mineFeatureWorldPosition=m=>({x:m.x,y:m.y});f.ctx.mineCreatureScreenPosition=m=>({x:m.x,y:m.y});
 f.ctx.weaponDamage=()=>15;f.ctx.equipment={weapon:'Деревянный меч'};f.ctx.skills={warrior:0};
 run(f.ctx,['strikeMineCreature','attackMineCreature'],['attackMineCreature']);
 assert.equal(f.ctx.attackMineCreature(),true);assert.equal(f.ctx.mineCreatures[0].hp,85);
 assert.equal(f.ctx.attackMineCreature(),false,'Attack cooldown must prevent repeated hits.');
});
testCase('legacy worlds with empty mine feature arrays are backfilled',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineFeaturePoint','generateMineFeatures','restoreMineFeaturesFromSave'],['restoreMineFeaturesFromSave']);
 const result=f.ctx.restoreMineFeaturesFromSave({mineBarrels:[],mineCreatures:[]},3);
 assert.equal(result.backfilledBarrels,true);assert.equal(result.backfilledCreatures,true);
 assert.ok(f.ctx.mineBarrels.length>=5);assert.ok(f.ctx.mineCreatures.length>=4);assert.ok(f.ctx.mineCreatures.every(m=>m.damage===10),'Migrated mine monsters must receive the new 10 HP damage value.');
});
testCase('mine migration preserves already-broken barrels while filling missing creatures',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineFeaturePoint','generateMineFeatures','restoreMineFeaturesFromSave'],['restoreMineFeaturesFromSave']);
 const spent={id:'old-barrel',x:50,y:180,hp:0,maxHp:2,coal:1,stone:2};
 const result=f.ctx.restoreMineFeaturesFromSave({mineFeaturesVersion:0,mineBarrels:[spent],mineCreatures:[]},2);
 assert.equal(result.backfilledBarrels,false);assert.equal(result.backfilledCreatures,true);
 assert.equal(f.ctx.mineBarrels.length,1);assert.equal(f.ctx.mineBarrels[0].hp,0);
 assert.ok(f.ctx.mineCreatures.length>0);
});
testCase('current mine saves do not respawn cleared objects',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineFeaturePoint','generateMineFeatures','restoreMineFeaturesFromSave'],['restoreMineFeaturesFromSave']);
 const result=f.ctx.restoreMineFeaturesFromSave({mineFeaturesVersion:1,mineBarrels:[],mineCreatures:[]},2);
 assert.equal(result.backfilledBarrels,false);assert.equal(result.backfilledCreatures,false);
 assert.equal(f.ctx.mineBarrels.length,0);assert.equal(f.ctx.mineCreatures.length,0);
});
testCase('maze walls block mine-only movement while ordinary world movement remains unchanged',()=>{
 const f=fixture();run(f.ctx,['generateMineMaze','ensureMineMaze','mineCellWalkable','mineCellFromWorld','mineMovePlayer'],['generateMineMaze','mineCellWalkable','mineMovePlayer']);
 f.ctx.generateMineMaze();f.ctx.minePlayerX=1.5*44;f.ctx.minePlayerY=13.5*44;
 const start={x:1,y:13},wall=[[0,-1],[1,0],[0,1],[-1,0]].find(([dx,dy])=>!f.ctx.mineCellWalkable(start.x+dx,start.y+dy));
 assert.ok(wall,'start cell should have at least one wall');
 const before={x:f.ctx.minePlayerX,y:f.ctx.minePlayerY};f.ctx.mineMovePlayer(wall[0],wall[1],220,1);
 assert.equal(f.ctx.mineCellFromWorld(f.ctx.minePlayerX,f.ctx.minePlayerY).x,start.x);assert.equal(f.ctx.mineCellFromWorld(f.ctx.minePlayerX,f.ctx.minePlayerY).y,start.y);assert.ok(Math.hypot(f.ctx.minePlayerX-before.x,f.ctx.minePlayerY-before.y)<=12,'player may approach a wall but cannot cross into it');
 assert.ok(source.includes('const nx = player.x + player.vx*dt, ny = player.y + player.vy*dt;'),'normal world movement integration remains unchanged');
 assert.ok(source.includes('if (!blocked(nx, player.y)) player.x = nx;'));
 assert.ok(source.includes('if (!blocked(player.x, ny)) player.y = ny;'));
 assert.ok(source.includes('mineTileX,mineTileY,mineRocks,mineBarrels,mineCreatures,mineFeaturesVersion:1,mineMazeVersion:3,quarryProgress'));
 assert.ok(source.includes('drawMinePassages()'));assert.ok(source.includes('updateMineCreatures(dt)'));
 assert.match(source,/function drawMineBackdrop\(/,'Mine must draw a full-screen cave background behind the maze.');
 assert.ok(source.includes('drawMineBackdrop(time);'),'Mine passage rendering must paint the cave backdrop before corridor tiles.');
 assert.match(source,/drawPlayer\(player\.x-width\/2,player\.y-height\/2,dt\)/,'Mine must render the complete player appearance and equipment instead of a placeholder body.');
 assert.match(source,/Jagged host rock with a dark bevel/,'Ore deposits must have layered rock faces and mineral facets.');
 assert.match(source,/Occasional ceiling stalactites hang over the dark rock/,'Mine walls must include ceiling formations.');
 assert.match(source,/A handful of animated lantern pools and drifting dust motes/,'Mine atmosphere must include lantern lighting and dust.');assert.ok(source.includes('mineMovePlayer(mx,my,speed,dt)'));
 assert.match(source,/function drawMineSkyWindow\(/,'Mine must show a visible moon or sun through a ceiling opening.');
 assert.ok(source.includes('mineLevel,mineDepth'),'Mine saves must keep floor depth separate from manual upgrade level.');
 assert.ok(source.includes('mineDepth++'),'Descending must change depth without automatically upgrading the mine.');
 assert.ok(source.includes('const oreTier=Math.max(1,Math.min(8,mineLevel))'),'Ore rarity must be limited by manual upgrade and current depth.');
 assert.ok(source.includes('function grantGoldToWallet(amount)'),'Admin and moderator gold must use the persistent wallet transaction.');
 assert.ok(source.includes('const editTargetNode=isEditableTarget(e.target)?e.target:(isEditableTarget(activeElement)?activeElement:null)'),'Keyboard handler must inspect the actual focused input element.');assert.ok(source.includes('mineMazeVersion:3'));
 assert.match(source,/function autoResumeCoopRoomOnInput\(\)/,'Owner input must automatically resume a paused shared world.');
 assert.ok(source.includes("if(k===' '&&mineMode&&!formTarget&&!inMainMenu&&!paused&&!blockingOverlay){e.preventDefault();attackMineCreature();return;}"),'Spacebar must provide a reliable mine creature attack.');
 assert.match(source,/damage:10/,'New mine creatures must use the fixed 10 HP attack value.');
 assert.match(source,/Math\.hypot\(mineCreatureScreenPosition\(m\)\.x-mineHitX,mineCreatureScreenPosition\(m\)\.y-mineHitY\)<54/,'Mine creature click targets must be forgiving.');
});
testCase('players can walk through barrels and barrels have no floating label',()=>{
 const f=fixture();f.ctx.mineBarrels=[{x:120,y:90,hp:2}];
 f.ctx.mineFeatureWorldPosition=b=>({x:b.x,y:b.y});
 f.ctx.mineCellFromWorld=()=>({x:1,y:1});f.ctx.mineCellWalkable=()=>true;
 run(f.ctx,['mineMovePlayer'],['mineMovePlayer']);
 f.ctx.minePlayerX=80;f.ctx.minePlayerY=90;f.ctx.mineMovePlayer(1,0,100,1);
 assert.ok(f.ctx.minePlayerX>120,'living barrels must not block player movement');
 f.ctx.mineBarrels[0].hp=0;f.ctx.minePlayerX=80;f.ctx.mineMovePlayer(1,0,100,1);
 assert.ok(f.ctx.minePlayerX>120,'destroyed barrels must remain non-blocking');
 assert.ok(!source.includes("fillText('БОЧКА'"),'barrels must not display a floating name label');
 assert.ok(!source.includes("fillText('Бочка'"),'barrels must not display a capitalized floating label');
});

testCase('ore deposits are solid obstacles and cannot be walked through',()=>{
 const f=fixture();f.ctx.mineRocks=[{x:120,y:90,hp:2,ore:'Железо'}];
 f.ctx.mineFeatureWorldPosition=r=>({x:r.x,y:r.y});
 f.ctx.mineCellFromWorld=()=>({x:1,y:1});f.ctx.mineCellWalkable=()=>true;
 run(f.ctx,['mineMovePlayer'],['mineMovePlayer']);
 f.ctx.minePlayerX=80;f.ctx.minePlayerY=90;f.ctx.mineMovePlayer(1,0,100,1);
 assert.ok(f.ctx.minePlayerX<105,'live ore deposit must stop player movement before the rock');
 f.ctx.mineRocks[0].hp=0;f.ctx.minePlayerX=80;f.ctx.mineMovePlayer(1,0,100,1);
 assert.ok(f.ctx.minePlayerX>120,'destroyed ore deposit must no longer block movement');
});
testCase('admin and moderator gold grants update the persistent world wallet',()=>{
 const f=fixture();let hud=0,adminStats=0;
 f.ctx.walletCents=0;f.ctx.shopDialogOpen=false;
 f.ctx.updateWalletHud=()=>hud++;f.ctx.refreshAdminStats=()=>adminStats++;
 run(f.ctx,['grantGoldToWallet'],['grantGoldToWallet']);
 assert.equal(f.ctx.grantGoldToWallet(125),125);
 assert.equal(f.ctx.walletCents,12500,'125 gold must be stored as 12500 wallet cents');
 assert.equal(hud,1);assert.equal(adminStats,1);assert.equal(f.events.saves,1);
});
console.log('PASS '+tests.length+' mine exploration tests: '+tests.join(' | '));

testCase('mine passages have layered floor bevels, shaded rock walls and soft lantern spill',()=>{
 assert.ok(source.includes('const floorLight=ctx.createLinearGradient'), 'Mine floor plates must have directional bevel lighting.');
 assert.ok(source.includes('const wallShade=ctx.createLinearGradient'), 'Mine rock walls must use layered depth shading.');
 assert.ok(source.includes('const outerGlow=ctx.createRadialGradient')&&source.includes('rgba(255,221,151,'), 'Existing mine lanterns must cast layered warm light.');
});
