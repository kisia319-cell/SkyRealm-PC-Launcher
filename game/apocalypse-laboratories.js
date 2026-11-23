(() => {
'use strict';
if (window.SKYREALM_BUILD_EDITION !== 'apocalypse' && document.documentElement.dataset.skyrealmEdition !== 'apocalypse') {
  const p = new URLSearchParams(location.search);
  if (p.get('mode') !== 'apocalypse' && p.get('edition') !== 'apocalypse') return;
}
// This module is loaded only by the dedicated Apocalypse edition.
// All laboratory floors are local to the hidden Apocalypse map.
const SAVE_KEY='skyrealm_apocalypse_laboratories_v1';
const RATIOS=[[.12,.52],[.50,.78],[.84,.48]];
const NAMES=['ОБЪЕКТ «ФЕНИКС»','КОМПЛЕКС «ЭХО»','СТАНЦИЯ «НУЛЬ»'];
const THEMES=['bio','military','reactor'];
const PALETTES={bio:{wall:'#35413d',light:'#8bc2a4',accent:'#668c72',danger:'#b45d4b'},military:{wall:'#3a4143',light:'#c0b68c',accent:'#66716d',danger:'#c15a42'},reactor:{wall:'#333c43',light:'#80c9d2',accent:'#557e88',danger:'#d4a34e'}};
const FLOOR_NAMES=['АРХИВ И ПРИЁМНАЯ','КАРАНТИН И КАМЕРЫ','БИОСИНТЕЗ И ОПЫТЫ','КОМАНДНЫЙ ЦЕНТР'];
function labState(lab){progress.labState=progress.labState||{};progress.labState[lab]=progress.labState[lab]||{power:false,terminal:false,reactor:false,released:[],finalVault:false,mutantDefeated:false};return progress.labState[lab];}
function flag(lab,name){return !!labState(lab)[name];}
function setFlag(lab,name,value=true){labState(lab)[name]=value;persist();}
function wasReleased(lab,id){return labState(lab).released.includes(id);}
function releaseCell(lab,id){const s=labState(lab);if(!s.released.includes(id))s.released.push(id);persist();}
function drawMonitor(ctx,x,y,w=78,h=48,on=false,time=0){ctx.fillStyle='#11191c';ctx.fillRect(x-3,y-3,w+6,h+8);ctx.fillStyle='#293b40';ctx.fillRect(x,y,w,h);ctx.fillStyle=on?'#8bd3a6':'#9b5148';ctx.globalAlpha=.55+.18*Math.sin(time/180);ctx.fillRect(x+5,y+5,w-10,h-15);ctx.globalAlpha=1;ctx.strokeStyle='#82979a';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);ctx.fillStyle='#b5c7bf';for(let i=0;i<3;i++)ctx.fillRect(x+8,y+10+i*7,w*(.35+.12*i),2);ctx.fillStyle='#8c9994';ctx.fillRect(x+w*.35,y+h,w*.3,7);}
function warningStripe(ctx,x,y,w,h){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();for(let i=-h;i<w+h;i+=18){ctx.strokeStyle='#d2ad57';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x+i,y+h);ctx.lineTo(x+i+h,y);ctx.stroke();}ctx.restore();}
function bloodTrail(ctx,x,y,len=54){ctx.strokeStyle='rgba(112,39,34,.55)';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+len*.25,y+12,x+len*.65,y-9,x+len,y+5);ctx.stroke();}
let active=null,siteCache=[];
function load(){try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')||{};}catch(_){return {};}}
let progress=load();
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress));}catch(_){}}
function sites(cols,rows,tile){
 const key=cols+'x'+rows+'x'+tile;if(siteCache.key===key)return siteCache.value;
 const value=RATIOS.map((r,i)=>({id:i+1,name:NAMES[i],theme:THEMES[i],x:Math.round(cols*r[0])*tile+tile/2,y:Math.round(rows*r[1])*tile+tile/2}));
 siteCache={key,value};return value;
}
function hash(a,b){let n=(a*374761393+b*668265263)|0;n=(n^(n>>>13))*1274126177;return ((n^(n>>>16))>>>0)/4294967295;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function key(lab,floor,id){return lab+':'+floor+':'+id;}
function wasOpened(lab,floor,id){return progress.opened?.includes(key(lab,floor,id))||false;}
function markOpened(lab,floor,id){progress.opened=progress.opened||[];const k=key(lab,floor,id);if(!progress.opened.includes(k))progress.opened.push(k);persist();}
function deadList(lab,floor){return progress.dead?.[lab+':'+floor]||[];}
function markDead(z){progress.dead=progress.dead||{};const k=z.lab+':'+z.floor;progress.dead[k]=progress.dead[k]||[];if(!progress.dead[k].includes(z.id))progress.dead[k].push(z.id);persist();}
function floorZombies(lab,floor){
 const count=floor===2?6:floor===3?3:floor===4?2:1,dead=deadList(lab,floor);
 const out=[];
 for(let i=0;i<count;i++){
  const id='z'+i;if(dead.includes(id))continue;
  const x=floor===2?250+i*150:250+(i*263)%650,y=floor===2?215+(i%2)*45:260+(i%2)*180;
  out.push({id,lab,floor,x,y,hp:floor===4&&i===1?760:floor===3?240:floor===2?175:120,maxHp:floor===4&&i===1?760:floor===3?240:floor===2?175:120,speed:floor===4?48:floor===2?30:35,damage:floor===4?22:floor===2?11:8,attackCd:.7+hash(lab*9+i,floor)*.8,phase:hash(lab*13+i,floor)*6.28,cell:floor===2&&i<4&&!wasReleased(lab,id),escaped:floor===2&&i>=4,boss:floor===4&&i===1,flash:0});
 }
 return out;
}
function enter(site,player,toast,resetInput){
 active={lab:site.id,site,floor:1,originX:player.x-180,originY:player.y-410,outsideX:player.x,outsideY:player.y,zombies:floorZombies(site.id,1),hint:2};
 player.x=active.originX+180;player.y=active.originY+410;player.vx=player.vy=0;
 resetInput?.();toast('Ты проник в секретный комплекс '+site.name+'. Исследуй 4 этажа. На лестнице нажми E.');persist();
}
function leave(player,toast,resetInput){
 if(!active)return false;
 const s=active;active=null;
 player.x=s.outsideX;player.y=s.outsideY;player.vx=player.vy=0;
 resetInput?.();toast?.('Ты покинул секретную лабораторию.');return true;
}
function floorStart(floor){return floor===1?{x:180,y:410}:floor===2?{x:950,y:410}:floor===3?{x:180,y:410}:{x:1020,y:410};}
const CONTAINERS={
 1:[{id:'archive-chest',x:1000,y:680,kind:'chest',loot:[['Малое зелье',2],['Бинт',2],['Уран',1]]},{id:'library-cabinet',x:650,y:170,kind:'cabinet',loot:[['Метеоритный осколок',1],['Бинт',1]]},{id:'medical-locker',x:220,y:620,kind:'cabinet',loot:[['Малое зелье',1],['Бинт',2]]}],
 2:[{id:'security-locker',x:190,y:670,kind:'cabinet',loot:[['Бинт',3],['Малое зелье',1]]},{id:'specimen-safe',x:1000,y:680,kind:'chest',loot:[['Осколок пробуждения',1],['Уран',2]]}],
 3:[{id:'research-safe',x:1000,y:660,kind:'chest',loot:[['Осколок пробуждения',2],['Метеоритный осколок',2]]},{id:'sample-cabinet',x:210,y:210,kind:'cabinet',loot:[['Уран',2],['Малое зелье',2]]}],
 4:[{id:'command-vault',x:980,y:660,kind:'chest',loot:[['Осколок пробуждения',3],['Эссенция глубин',2],['Меч титана',1]]}]
};
function drawBookshelf(ctx,x,y,w=150){
 ctx.fillStyle='#17191b';ctx.fillRect(x-4,y+7,w+8,34);ctx.fillStyle='#493528';ctx.fillRect(x,y,w,27);ctx.fillStyle='#79543a';ctx.fillRect(x,y,w,5);
 const colors=['#9a5547','#426d72','#b18a4c','#52608b','#6e774c','#7b4f77'];
 for(let i=0;i<Math.floor(w/11);i++){ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x+5+i*11,y+7,7,16);ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(x+6+i*11,y+8,1,12);}
 ctx.fillStyle='#211c19';ctx.fillRect(x-2,y+27,w+4,5);
}
function drawCabinet(ctx,x,y,w=70,h=48){
 ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x+5,y+7,w,h);ctx.fillStyle='#34434a';ctx.fillRect(x,y,w,h);ctx.fillStyle='#657078';ctx.fillRect(x+3,y+3,w-6,5);ctx.strokeStyle='#1a252a';ctx.lineWidth=2;ctx.strokeRect(x+3,y+3,w-6,h-6);ctx.beginPath();ctx.moveTo(x+w/2,y+7);ctx.lineTo(x+w/2,y+h-5);ctx.stroke();ctx.fillStyle='#b4b9ae';ctx.fillRect(x+w/2-5,y+h/2,3,6);ctx.fillRect(x+w/2+3,y+h/2,3,6);
}
function drawDesk(ctx,x,y,w=120){
 ctx.fillStyle='#202326';ctx.fillRect(x+5,y+8,w,36);ctx.fillStyle='#6b5543';ctx.fillRect(x,y,w,31);ctx.fillStyle='#a18a6c';ctx.fillRect(x+4,y+4,w-8,4);ctx.fillStyle='#202b33';ctx.fillRect(x+w*.28,y-18,39,20);ctx.fillStyle='#6d9b9a';ctx.fillRect(x+w*.28+4,y-14,31,12);ctx.fillStyle='#d1c5aa';ctx.fillRect(x+w*.7,y+6,17,11);
}
function drawTank(ctx,x,y,w=58,h=104,time=0,infected=false){
 ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(x+6,y+8,w,h);ctx.fillStyle='#182d34';ctx.fillRect(x,y,w,h);ctx.fillStyle=infected?'rgba(113,151,91,.40)':'rgba(99,178,196,.24)';ctx.fillRect(x+5,y+6,w-10,h-12);ctx.strokeStyle='#8baab0';ctx.lineWidth=3;ctx.strokeRect(x+2,y+2,w-4,h-4);ctx.fillStyle=infected?'#7b8e55':'#70c5d1';ctx.globalAlpha=.25+.08*Math.sin(time/350);ctx.fillRect(x+7,y+h*.55,w-14,h*.36);ctx.globalAlpha=1;ctx.fillStyle='#a8b9b7';ctx.fillRect(x+w/2-4,y-8,8,8);ctx.fillStyle='#cf514b';ctx.fillRect(x+w-11,y+8,4,4);
}
function drawZombie(ctx,x,y,z,time){
 const bob=Math.sin(time/145+z.phase)*2,reach=Math.sin(time/110+z.phase)*4,lean=z.boss?1.12:1;
 ctx.save();ctx.translate(x,y+bob);ctx.rotate(Math.sin(time/260+z.phase)*.055);ctx.scale(lean,lean);
 ctx.fillStyle='rgba(0,0,0,.4)';ctx.beginPath();ctx.ellipse(0,14,16,6,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#4b5944';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-7,-2);ctx.lineTo(-14-reach,-8);ctx.moveTo(7,-2);ctx.lineTo(15+reach,-7);ctx.stroke();
 ctx.fillStyle=z.boss?'#4a5142':'#56644b';ctx.beginPath();ctx.moveTo(-10,-8);ctx.lineTo(-8,9);ctx.lineTo(8,10);ctx.lineTo(11,-7);ctx.lineTo(5,-14);ctx.lineTo(-6,-13);ctx.closePath();ctx.fill();
 ctx.fillStyle='#6f7657';ctx.beginPath();ctx.ellipse(0,-18,8,10,-.12,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#241f1b';ctx.fillRect(-5,-22,3,2);ctx.fillRect(3,-22,3,2);ctx.fillStyle='#d94c42';ctx.shadowColor='#ef4b42';ctx.shadowBlur=7;ctx.fillRect(-4,-22,2,2);ctx.fillRect(4,-22,2,2);ctx.shadowBlur=0;
 ctx.strokeStyle='#281f1d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-3,-13);ctx.lineTo(4,-12);ctx.stroke();
 ctx.strokeStyle='#4b5944';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-5,8);ctx.lineTo(-7,17);ctx.moveTo(5,8);ctx.lineTo(7,17);ctx.stroke();
 ctx.fillStyle='#853e35';ctx.fillRect(-9,-8,5,3);ctx.fillRect(4,1,4,3);
  ctx.strokeStyle='#303d35';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-6,-5);ctx.lineTo(-2,1);ctx.lineTo(4,4);ctx.moveTo(-4,2);ctx.lineTo(1,8);ctx.stroke();
  ctx.fillStyle='#342a25';ctx.fillRect(-4,-16,8,2);ctx.fillRect(-3,-12,6,2);
  if(z.boss){ctx.fillStyle='#b7a06a';ctx.beginPath();ctx.moveTo(-8,-26);ctx.lineTo(-15,-39);ctx.lineTo(-3,-32);ctx.lineTo(2,-42);ctx.lineTo(8,-27);ctx.fill();ctx.strokeStyle='#8a4c3d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-12,-2);ctx.lineTo(-24,5);ctx.moveTo(12,-2);ctx.lineTo(25,6);ctx.stroke();}
  ctx.restore();
 if(z.hp<z.maxHp){ctx.fillStyle='#171b1a';ctx.fillRect(x-17,y-35,34,4);ctx.fillStyle='#b94e43';ctx.fillRect(x-17,y-35,34*clamp(z.hp/z.maxHp,0,1),4);}
}
function drawExterior(ctx,camX,camY,time,width,height,cols,rows,tile,player){
 if(!window.SKYREALM_BUILD_EDITION&&!document.documentElement.classList.contains('apocalypse-mode'))return;
 for(const s of sites(cols,rows,tile)){
  const x=s.x-camX,y=s.y-camY;if(x<-260||x>width+260||y<-250||y>height+250)continue;
  const pulse=.5+.5*Math.sin(time/460+s.id),theme=PALETTES[s.theme];
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='rgba(0,0,0,.48)';ctx.beginPath();ctx.ellipse(0,72,190,28,0,0,Math.PI*2);ctx.fill();
  // Broken perimeter fence and warning lamps.
  ctx.strokeStyle='#343b3d';ctx.lineWidth=5;ctx.strokeRect(-176,-104,352,188);
  for(let i=0;i<9;i++){const fx=-176+i*44;ctx.fillStyle='#55514a';ctx.fillRect(fx,-110,4,16);ctx.fillRect(fx,80,4,16);}
  ctx.fillStyle='#252b2d';ctx.fillRect(-148,-94,296,164);ctx.fillStyle='#454b49';ctx.fillRect(-140,-86,280,148);
  ctx.fillStyle='#24292a';ctx.fillRect(-128,-75,256,126);
  // Four-storey silhouette, roof equipment and damaged concrete.
  ctx.fillStyle=theme.wall;ctx.fillRect(-132,-78,264,18);ctx.fillStyle='#30383a';ctx.fillRect(-122,-60,244,105);
  for(let floor=0;floor<4;floor++){const fy=-52+floor*24;ctx.fillStyle=floor%2?'#242d30':'#1d2629';ctx.fillRect(-113,fy,226,16);for(let wx=-101;wx<=91;wx+=32){ctx.fillStyle=theme.light;ctx.globalAlpha=.38+.2*pulse;ctx.fillRect(wx,fy+3,13,8);ctx.globalAlpha=1;}}
  ctx.fillStyle='#101719';ctx.fillRect(-26,22,52,28);ctx.fillStyle='#8b4a3d';ctx.fillRect(-22,25,44,24);ctx.fillStyle='#c0a18a';ctx.fillRect(-3,30,6,18);
  ctx.fillStyle='#b3a78b';ctx.font='900 12px Segoe UI';ctx.textAlign='center';ctx.fillText('СЕКТОР '+String(s.id).padStart(2,'0'),0,-101);
   ctx.fillStyle='#171d1f';ctx.fillRect(-66,-69,132,10);ctx.fillStyle=theme.danger;ctx.fillRect(-63,-67,126,3);
   ctx.fillStyle='#1a2326';ctx.fillRect(-88,-100,12,22);ctx.fillRect(76,-96,17,18);ctx.strokeStyle='#92988c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-82,-101);ctx.lineTo(-82,-124);ctx.moveTo(83,-96);ctx.lineTo(95,-113);ctx.stroke();
   ctx.fillStyle='#2a3030';ctx.fillRect(-175,-22,25,48);ctx.fillRect(151,-14,22,38);ctx.fillStyle=theme.danger;ctx.globalAlpha=.7+.3*pulse;ctx.fillRect(-169,-18,4,5);ctx.fillRect(157,-9,4,5);ctx.globalAlpha=1;warningStripe(ctx,-172,42,44,8);
  ctx.fillStyle='#b9d0c9';ctx.font='bold 10px Segoe UI';ctx.fillText(s.name,0,65);
  // Generator, vents, cable bundles and wrecked vehicle.
  ctx.fillStyle='#303a3c';ctx.fillRect(-160,15,26,34);ctx.fillStyle='#7c8b80';ctx.fillRect(-156,19,18,8);ctx.strokeStyle='#b34e40';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-156,34);ctx.lineTo(-143,34);ctx.lineTo(-143,43);ctx.stroke();
  ctx.fillStyle='#292d2e';ctx.fillRect(110,-104,42,26);ctx.fillStyle='#69736e';ctx.fillRect(115,-99,32,7);
  ctx.strokeStyle='#111819';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-130,55);ctx.lineTo(-100,90);ctx.lineTo(100,90);ctx.lineTo(130,55);ctx.stroke();
  ctx.fillStyle='#d8a24b';ctx.shadowColor='#e7a14a';ctx.shadowBlur=12;ctx.globalAlpha=.55+.4*pulse;ctx.beginPath();ctx.arc(0,51,4,0,Math.PI*2);ctx.fill();
  if(player&&Math.hypot(player.x-s.x,player.y-(s.y+108))<180){ctx.globalAlpha=1;ctx.fillStyle='#f2d99d';ctx.font='900 11px Segoe UI';ctx.textAlign='center';ctx.shadowColor='#090c0d';ctx.shadowBlur=8;ctx.fillText('E · ВОЙТИ',0,105);ctx.shadowBlur=0;}
  ctx.restore();
  // The entrance is not marked on the map; the player must find the doorway.
 }
}
function floorProp(ctx,x,y,kind,time){
 if(kind==='shelf')drawBookshelf(ctx,x,y,160);
 else if(kind==='cabinet')drawCabinet(ctx,x,y,76,48);
 else if(kind==='desk')drawDesk(ctx,x,y,128);
 else if(kind==='tank')drawTank(ctx,x,y,62,112,time,true);
 else if(kind==='crate'){ctx.fillStyle='#473a2e';ctx.fillRect(x,y,54,42);ctx.strokeStyle='#a18459';ctx.lineWidth=3;ctx.strokeRect(x+2,y+2,50,38);ctx.beginPath();ctx.moveTo(x+4,y+4);ctx.lineTo(x+50,y+38);ctx.moveTo(x+50,y+4);ctx.lineTo(x+4,y+38);ctx.stroke();}
}
function drawCell(ctx,x,y,z,time){
 ctx.fillStyle='#182328';ctx.fillRect(x,y,142,118);ctx.fillStyle='rgba(92,156,158,.12)';ctx.fillRect(x+5,y+5,132,108);
 ctx.strokeStyle='#83979a';ctx.lineWidth=4;ctx.strokeRect(x+2,y+2,138,112);
 ctx.strokeStyle='#a8b7b5';ctx.lineWidth=2;for(let b=0;b<7;b++){ctx.beginPath();ctx.moveTo(x+13+b*19,y+6);ctx.lineTo(x+13+b*19,y+111);ctx.stroke();}
 ctx.fillStyle='#a34d42';ctx.fillRect(x+5,y+5,18,4);ctx.fillStyle='#b7c2bd';ctx.font='bold 9px Segoe UI';ctx.textAlign='left';ctx.fillText('КАМЕРА '+(z.id.slice(1)),x+7,y+130);
 drawZombie(ctx,x+72,y+66,z,time);
}
function drawInterior(ctx,player,camX,camY,dt,time,width,height){
 if(!active)return;
 const lx=player.x-active.originX,ly=player.y-active.originY;
 player.x=active.originX+clamp(lx,45,1155);player.y=active.originY+clamp(ly,45,775);
 const px=player.x-active.originX,py=player.y-active.originY;
 const sx=v=>width/2+(v-px),sy=v=>height/2+(v-py);
 // Simulate contained and escaped infected without touching the surface-world monster list.
 for(const z of active.zombies){
  z.flash=Math.max(0,z.flash-dt);z.attackCd-=dt;
  if(!z.cell){const dx=px-z.x,dy=py-z.y,d=Math.hypot(dx,dy)||1;if(d>29){z.x+=dx/d*z.speed*dt;z.y+=dy/d*z.speed*dt;}else if(z.attackCd<=0){z.attackCd=1.35;active.pendingDamage=(active.pendingDamage||0)+z.damage;}}
 }
 const pendingDamage=active.pendingDamage||0;active.pendingDamage=0;
 ctx.save();ctx.setTransform(window.devicePixelRatio||1,0,0,window.devicePixelRatio||1,0,0);
 const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#303638');bg.addColorStop(1,'#171c1d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#414342';ctx.fillRect(0,0,width,height);
 const floorColor=active.floor===2?'#30383a':active.floor===3?'#343c3b':active.floor===4?'#292e32':'#454642';ctx.fillStyle=floorColor;ctx.fillRect(24,24,width-48,height-48);
 for(let x=24;x<width-24;x+=48)for(let y=24;y<height-24;y+=48){ctx.strokeStyle='rgba(8,12,13,.22)';ctx.lineWidth=1;ctx.strokeRect(x,y,48,48);if(hash(x,y+active.floor)>.86){ctx.fillStyle='rgba(125,74,57,.16)';ctx.fillRect(x+8,y+13,10,3);}}
 // Heavy perimeter walls and reinforced corner columns.
 ctx.fillStyle='#171d20';ctx.fillRect(24,24,width-48,24);ctx.fillRect(24,height-48,width-48,24);ctx.fillRect(24,24,24,height-48);ctx.fillRect(width-48,24,24,height-48);
 for(let x=48;x<width-48;x+=150){ctx.fillStyle='#657071';ctx.fillRect(x,24,7,24);ctx.fillRect(x,height-48,7,24);}
 // Room furniture is drawn in local coordinates, then follows the player's exploration camera.
 const floor=active.floor,theme=PALETTES[active.site.theme],state=labState(active.lab);
 ctx.fillStyle=theme.wall;ctx.fillRect(26,26,width-52,8);ctx.fillStyle=theme.accent;ctx.fillRect(26,34,width-52,3);
 if(floor===1){
  // Reception, security desk and a huge two-aisle archive library.
  floorProp(ctx,sx(175),sy(160),'desk',time);floorProp(ctx,sx(180),sy(245),'cabinet',time);floorProp(ctx,sx(180),sy(320),'cabinet',time);
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)floorProp(ctx,sx(360+col*175),sy(140+row*110),'shelf',time);
  for(let col=0;col<4;col++){floorProp(ctx,sx(330+col*190),sy(635),'cabinet',time);floorProp(ctx,sx(330+col*190),sy(705),'crate',time);}
  floorProp(ctx,sx(930),sy(210),'desk',time);floorProp(ctx,sx(930),sy(310),'desk',time);floorProp(ctx,sx(930),sy(410),'cabinet',time);
  ctx.fillStyle='#a58a5e';ctx.font='900 14px Segoe UI';ctx.textAlign='center';ctx.fillText('АРХИВ · БИБЛИОТЕКА ИССЛЕДОВАНИЙ',sx(635),sy(105));
   drawMonitor(ctx,sx(630),sy(485),84,52,state.terminal,time);bloodTrail(ctx,sx(760),sy(560),66);ctx.fillStyle='#b5a78c';ctx.font='bold 9px Segoe UI';ctx.fillText('ТЕРМИНАЛ АРХИВА · E',sx(672),sy(550));
  ctx.fillStyle='#7b8985';ctx.fillRect(sx(840),sy(590),120,76);ctx.fillStyle='#a77a43';ctx.fillRect(sx(850),sy(600),100,58);ctx.fillStyle='#e5bd72';ctx.fillRect(sx(895),sy(610),12,8);
 }else if(floor===2){
  ctx.fillStyle='#697477';ctx.fillRect(95,115,width-190,6);ctx.fillStyle='#8b9b9a';ctx.font='900 14px Segoe UI';ctx.textAlign='center';ctx.fillText('БЛОК КАРАНТИНА · КАМЕРЫ СОДЕРЖАНИЯ',width/2,88);
  active.zombies.filter(z=>z.cell).forEach((z,i)=>drawCell(ctx,sx(220+(i%4)*178),sy(145+Math.floor(i/4)*170),z,time));
   ctx.fillStyle='#20292c';ctx.fillRect(sx(130),sy(112),940,16);ctx.fillStyle='#b94f43';ctx.fillRect(sx(130),sy(112),state.power?940:420,4);
   ctx.fillStyle='#c4c8bc';ctx.font='bold 9px Segoe UI';ctx.textAlign='left';ctx.fillText(state.power?'ПИТАНИЕ ВОССТАНОВЛЕНО':'АВАРИЙНОЕ ПИТАНИЕ · НЕСТАБИЛЬНО',sx(145),sy(102));warningStripe(ctx,sx(625),sy(518),170,8);ctx.fillStyle='#e0cba4';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ПАНЕЛЬ ПИТАНИЯ · E',sx(710),sy(505));
  floorProp(ctx,sx(180),sy(590),'desk',time);floorProp(ctx,sx(360),sy(600),'cabinet',time);floorProp(ctx,sx(920),sy(610),'cabinet',time);
  ctx.fillStyle='#9b4c43';ctx.fillRect(sx(650),sy(530),120,12);ctx.fillStyle='#d8c5a6';ctx.font='bold 10px Segoe UI';ctx.fillText('ПАНЕЛЬ АВАРИЙНОГО ОТКРЫТИЯ',sx(710),sy(520));
 }else if(floor===3){
  for(let i=0;i<5;i++){floorProp(ctx,sx(220+i*180),sy(165),'tank',time);drawMonitor(ctx,sx(210+i*180),sy(285),64,42,state.power,time);}
  for(let i=0;i<4;i++){floorProp(ctx,sx(250+i*210),sy(420),'desk',time);floorProp(ctx,sx(250+i*210),sy(520),'cabinet',time);}
  ctx.fillStyle='#a7c3bd';ctx.font='900 14px Segoe UI';ctx.textAlign='center';ctx.fillText('ЛАБОРАТОРИЯ БИОСИНТЕЗА · ОБРАЗЦЫ И МУТАЦИИ',width/2,90);
   ctx.fillStyle='#a4b9a7';ctx.font='bold 9px Segoe UI';ctx.fillText(state.power?'СИСТЕМА ОХЛАЖДЕНИЯ: РАБОТАЕТ':'СИСТЕМА ОХЛАЖДЕНИЯ: ОТКЛЮЧЕНА',width/2,108);warningStripe(ctx,sx(845),sy(620),178,9);ctx.fillStyle='#d9c69e';ctx.font='bold 9px Segoe UI';ctx.fillText('ЗАПУСК РЕАКТОРА · E',sx(935),sy(610));
  ctx.fillStyle='#314e4d';ctx.fillRect(sx(850),sy(630),170,100);ctx.strokeStyle='#b9c9b7';ctx.strokeRect(sx(850),sy(630),170,100);
 }else{
  floorProp(ctx,sx(180),sy(170),'desk',time);floorProp(ctx,sx(180),sy(280),'desk',time);
  for(let i=0;i<5;i++)floorProp(ctx,sx(350+i*135),sy(170),'cabinet',time);
  floorProp(ctx,sx(620),sy(430),'tank',time);floorProp(ctx,sx(880),sy(430),'tank',time);
  ctx.fillStyle='#b7c6c6';ctx.font='900 14px Segoe UI';ctx.textAlign='center';ctx.fillText('ЦЕНТР УПРАВЛЕНИЯ · ПРОТОКОЛ «НОЛЬ»',width/2,90);
  ctx.fillStyle='#293d43';ctx.fillRect(sx(390),sy(560),410,110);ctx.strokeStyle='#d5ad68';ctx.lineWidth=3;ctx.strokeRect(sx(390),sy(560),410,110);
  ctx.fillStyle='#d6b777';ctx.font='bold 11px Segoe UI';ctx.fillText('РЕЗЕРВНЫЙ РЕАКТОР',sx(595),sy(615));ctx.fillStyle=state.finalVault?'#8ac99a':'#b64f42';ctx.shadowColor=state.finalVault?'#72d59b':'#d94d3e';ctx.shadowBlur=state.finalVault?18:9;ctx.beginPath();ctx.arc(sx(595),sy(650),state.finalVault?28:18,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;drawMonitor(ctx,sx(845),sy(560),96,58,state.finalVault,time);ctx.fillStyle='#d6c5a1';ctx.font='bold 9px Segoe UI';ctx.fillText('ПАНЕЛЬ РЕАКТОРА · E',sx(893),sy(635));
 }
 // Floor labels, exit/elevator markers, doors and wall-mounted lamps.
 ctx.fillStyle='#202a2d';ctx.fillRect(42,height/2-70,34,140);ctx.fillRect(width-76,height/2-70,34,140);
 ctx.fillStyle='#9eaa9f';ctx.fillRect(45,height/2-58,28,116);ctx.fillRect(width-73,height/2-58,28,116);
 ctx.fillStyle='#d2b77c';ctx.font='bold 10px Segoe UI';ctx.textAlign='center';ctx.fillText('ВЫХОД',58,height/2+84);ctx.fillText('ЛЕСТНИЦА ↑',width-58,height/2+84);ctx.fillText('ЛЕСТНИЦА ↓',width*.72,height/2+84);
 ctx.fillStyle='#e2d2a9';ctx.font='900 15px Segoe UI';ctx.fillText(active.site.name+' · '+FLOOR_NAMES[floor-1]+' · '+floor+'/4',width/2,42);
 ctx.fillStyle='#aebcba';ctx.font='10px Segoe UI';ctx.fillText('WASD — движение · E — взаимодействие · SPACE — атака · ESC — меню',width/2,height-20);
 // Searchable storage is visible on every floor, not represented by invisible triggers.
 for(const item of (CONTAINERS[floor]||[])){
  const x=sx(item.x),y=sy(item.y);
  if(item.kind==='chest'){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x+5,y+8,58,38);ctx.fillStyle=wasOpened(active.lab,floor,item.id)?'#514c43':'#8a5d32';ctx.fillRect(x,y,58,34);ctx.fillStyle='#c49b5d';ctx.fillRect(x,y+5,58,5);ctx.fillStyle='#e3c47b';ctx.fillRect(x+26,y+13,7,9);ctx.strokeStyle='#35251b';ctx.strokeRect(x+1,y+1,56,32);}
  else drawCabinet(ctx,x,y,68,44);
  if(!wasOpened(active.lab,floor,item.id)){ctx.fillStyle='#f0d28b';ctx.font='bold 9px Segoe UI';ctx.textAlign='center';ctx.fillText('E · ОБЫСКАТЬ',x+30,y-8);}
 }
 // Roaming infected are rendered on top of furniture and below the player.
 for(const z of active.zombies.filter(z=>!z.cell)){drawZombie(ctx,sx(z.x),sy(z.y),z,time);}
 // Small local lamps and emergency red pulses.
 for(const p of [[105,105],[width-105,105],[105,height-105],[width-105,height-105]]){const pulse=.5+.5*Math.sin(time/280+p[0]);ctx.fillStyle='#d8b978';ctx.shadowColor='#e2b86b';ctx.shadowBlur=12;ctx.globalAlpha=.5+.3*pulse;ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;}
 // Top-level HUD is kept readable while the world outside is hidden.
 ctx.fillStyle='rgba(5,10,13,.88)';ctx.fillRect(width/2-170,55,340,22);ctx.strokeStyle='#778984';ctx.strokeRect(width/2-170,55,340,22);ctx.fillStyle='#d5d0b8';ctx.font='bold 10px Segoe UI';ctx.fillText('ОБЪЕКТ '+String(active.lab).padStart(2,'0')+' · '+(state.finalVault?'ПРОТОКОЛ ЗАВЕРШЁН':state.power?'ПИТАНИЕ ВОССТАНОВЛЕНО':'АВАРИЙНЫЙ РЕЖИМ'),width/2,70);
 ctx.restore();
 if(pendingDamage>0)active?.onDamage?.(pendingDamage);
}
function interact(args){
 const {player,TILE,COLS,ROWS,toast,onLoot,resetInput,onDamage}=args||{};
 if(!player)return false;
 if(!active){
  const list=sites(COLS,ROWS,TILE).map(s=>({s,d:Math.hypot(player.x-s.x,player.y-(s.y+108))})).sort((a,b)=>a.d-b.d);
  if(list[0]?.d<=100){enter(list[0].s,player,toast,resetInput);active.onDamage=onDamage;return true;}
  return false;
 }
 active.onDamage=onDamage;
 const lx=player.x-active.originX,ly=player.y-active.originY,f=active.floor;
 if(lx<120&&Math.abs(ly-410)<105){leave(player,toast,resetInput);return true;}
 if(lx>1000&&Math.abs(ly-410)<110){
  if(f<4){active.floor++;const pos=floorStart(active.floor);player.x=active.originX+pos.x;player.y=active.originY+pos.y;active.zombies=floorZombies(active.lab,active.floor);active.hint=2;resetInput?.();toast('Подъём на этаж '+active.floor+'/4. Внимание: внутри обнаружены заражённые.');}
  else toast('Это верхний этаж. Для спуска подойди к лестнице слева.');
  return true;
 }
 if(lx>760&&lx<930&&Math.abs(ly-410)<110){
  if(f>1){active.floor--;const pos=floorStart(active.floor);player.x=active.originX+pos.x;player.y=active.originY+pos.y;active.zombies=floorZombies(active.lab,active.floor);resetInput?.();toast('Спуск на этаж '+active.floor+'/4.');}
  else toast('Ты уже на первом этаже.');
  return true;
 }
 const list=(CONTAINERS[f]||[]).map(c=>({c,d:Math.hypot(lx-c.x,ly-c.y)})).sort((a,b)=>a.d-b.d);
 if(list[0]?.d<85){
  const c=list[0].c;if(wasOpened(active.lab,f,c.id)){toast('Здесь уже всё обыскано.');return true;}
  markOpened(active.lab,f,c.id);for(const [name,count] of c.loot)onLoot?.(name,count);
  toast((c.kind==='chest'?'СУНДУК ОТКРЫТ':'ШКАФ ОБЫСКАН')+' · найдены припасы и редкие материалы.');return true;
 }
 toast('Осмотри помещение. E — у выхода, лестницы, шкафа или сундука.');return true;
}
function attack(player,range,damage,toast,onLoot){
 if(!active)return false;
 const px=player.x-active.originX,py=player.y-active.originY;
 const target=active.zombies.filter(z=>!z.cell&&z.hp>0).map(z=>({z,d:Math.hypot(z.x-px,z.y-py)})).filter(v=>v.d<=Math.max(75,range+24)).sort((a,b)=>a.d-b.d)[0];
 if(!target){toast?.('Рядом нет заражённых.');return true;}
 const z=target.z;z.hp=Math.max(0,z.hp-damage);z.flash=.18;toast?.((z.boss?'МУТАНТ':'ЗОМБИ')+' получил '+damage+' урона · '+Math.ceil(z.hp)+' HP');
 if(z.hp<=0){markDead(z);active.zombies=active.zombies.filter(v=>v!==z);onLoot?.('Кость',z.boss?8:1);if(z.boss){onLoot?.('Осколок пробуждения',4);onLoot?.('Эссенция глубин',3);setFlag(active.lab,'mutantDefeated');}else if(Math.random()<.35)onLoot?.('Малое зелье',1);toast?.(z.boss?'МУТАНТ УНИЧТОЖЕН · ОБЪЕКТ ОБЕЗВРЕЖЕН':'Заражённый устранён.');}
 return true;
}
window.SkyRealmApocalypseLabs={drawExterior,drawInterior,interact,attack,leave,isInside:()=>!!active,getProgress:()=>JSON.parse(JSON.stringify(progress))};
})();