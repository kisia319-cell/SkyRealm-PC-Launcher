(() => {
  'use strict';
  const canvas=document.getElementById('world');
  const ctx=canvas.getContext('2d');
  const SIZE=190,TILE=32,KEYS=new Set();
  const SAVE_KEY='primeLauncher.world.v1';
  let player={x:95,y:95};
  try{const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){player.x=Math.max(0,Math.min(SIZE-1,saved.x));player.y=Math.max(0,Math.min(SIZE-1,saved.y));}}catch(_){}
  const coords=document.getElementById('world-coords'),position=document.getElementById('position');
  const grass=(x,y)=>{const n=(x*17+y*31+(x*y)%23)%9;return ['#568d4b','#5b934f','#609853','#548849','#639b55','#5a914d','#5d9551','#568c49','#629651'][n];};
  function resize(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));draw();}
  function draw(){
    const w=canvas.width,h=canvas.height;if(!w||!h)return;
    const dpr=Math.min(2,window.devicePixelRatio||1),viewW=w/dpr,viewH=h/dpr;
    const tilesX=Math.ceil(viewW/TILE)+2,tilesY=Math.ceil(viewH/TILE)+2;
    const left=Math.max(0,Math.min(SIZE-tilesX,Math.floor(player.x-tilesX/2)));
    const top=Math.max(0,Math.min(SIZE-tilesY,Math.floor(player.y-tilesY/2)));
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewW,viewH);
    ctx.fillStyle='#355f3b';ctx.fillRect(0,0,viewW,viewH);
    const offsetX=Math.floor(viewW/2)-(player.x-left)*TILE-TILE/2;
    const offsetY=Math.floor(viewH/2)-(player.y-top)*TILE-TILE/2;
    for(let y=top;y<Math.min(SIZE,top+tilesY);y++)for(let x=left;x<Math.min(SIZE,left+tilesX);x++){
      const px=offsetX+(x-left)*TILE,py=offsetY+(y-top)*TILE;
      ctx.fillStyle=grass(x,y);ctx.fillRect(px,py,TILE+1,TILE+1);
      ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(px+2,py+2,TILE-4,2);
      ctx.strokeStyle='rgba(21,54,35,.16)';ctx.strokeRect(px+.5,py+.5,TILE,TILE);
    }
    const px=viewW/2,py=viewH/2;
    ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(px,py+11,10,4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#243d67';ctx.fillRect(px-7,py-1,14,13);
    ctx.fillStyle='#e5bd91';ctx.beginPath();ctx.arc(px,py-8,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#29354b';ctx.fillRect(px-7,py-15,14,5);
    ctx.fillStyle='#dcecff';ctx.fillRect(px-2,py-9,2,2);
    ctx.strokeStyle='rgba(230,245,255,.35)';ctx.lineWidth=1;ctx.strokeRect(1,1,viewW-2,viewH-2);
    coords.textContent='X: '+player.x+' · Y: '+player.y;position.textContent=player.x+' : '+player.y;
  }
  function move(dx,dy){const nx=Math.max(0,Math.min(SIZE-1,player.x+dx)),ny=Math.max(0,Math.min(SIZE-1,player.y+dy));if(nx===player.x&&ny===player.y)return;player.x=nx;player.y=ny;localStorage.setItem(SAVE_KEY,JSON.stringify(player));draw();}
  const map={w:[0,-1],arrowup:[0,-1],s:[0,1],arrowdown:[0,1],a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]};
  window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(map[key]){e.preventDefault();if(!KEYS.has(key)){KEYS.add(key);move(...map[key]);}}});
  window.addEventListener('keyup',e=>KEYS.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>KEYS.clear());
  canvas.addEventListener('click',()=>canvas.focus());
  if('ResizeObserver'in window)new ResizeObserver(resize).observe(canvas.parentElement);else window.addEventListener('resize',resize);
  resize();
})();
