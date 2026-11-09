(() => {
  'use strict';
  const KEY='skyrealm_boss_exploration_v1_';
  const bridge=()=>window.SkyRealmSeaBridge;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hash=(x,y)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const palettes={
    citadel:{stone:'#4b5263',dark:'#202a3a',light:'#9aa8b9',glow:'#a9d8ff',gold:'#e7c77b'},
    sky:{stone:'#6c88a4',dark:'#283d5d',light:'#d8edff',glow:'#83eaff',gold:'#f5d58a'},
    crystal:{stone:'#343b59',dark:'#171d35',light:'#9a9bcf',glow:'#8ef5ff',gold:'#c3a7ff'},
    sea:{stone:'#24546a',dark:'#0b293c',light:'#7ac9c8',glow:'#5de8ed',gold:'#f2d48e'}
  };
  let worldId='',state=null,sites=null,canvas=null,ctx=null,lastDraw=0;
  const fresh=()=>({version:1,anchor:null,citadel:{runes:[false,false,false],opened:false},sky:{lift:false,chest:false},cave:{nodes:[false,false,false],vault:false},sea:{valves:[false,false,false],chest:false},discoveries:[]});
  function save(){if(!worldId||!state)return;try{localStorage.setItem(KEY+encodeURIComponent(worldId),JSON.stringify(state));bridge()?.save?.();}catch(e){console.warn('[Boss Realm exploration save]',e);}}
  function load(){
    const b=bridge(),id=String(b?.getWorldId?.()||'');
    if(!id){worldId='';state=null;sites=null;return;}
    if(id===worldId&&state)return;
    worldId=id;state=fresh();
    try{const raw=JSON.parse(localStorage.getItem(KEY+encodeURIComponent(id))||'null');if(raw&&raw.version===1){state={...state,...raw,citadel:{...state.citadel,...raw.citadel},sky:{...state.sky,...raw.sky},cave:{...state.cave,...raw.cave},sea:{...state.sea,...raw.sea}};}}catch(_){}
    const p=b?.getPlayerPosition?.()||{x:21*32,y:26*32},bounds=b?.getWorldBounds?.()||{width:220*32,height:164*32};
    if(!state.anchor||!Number.isFinite(state.anchor.x)||!Number.isFinite(state.anchor.y)){state.anchor={x:p.x,y:p.y};save();}
    const ax=state.anchor.x,ay=state.anchor.y,w=bounds.width||220*32,h=bounds.height||164*32;
    const point=(dx,dy)=>({x:clamp(ax+dx*32,10*32,w-12*32),y:clamp(ay+dy*32,10*32,h-12*32)});
    sites={
      citadel:{...point(46,10),id:'citadel',title:'ЗАБРОШЕННАЯ ЦИТАДЕЛЬ',runes:[point(43,8),point(49,8),point(46,14)],chest:point(46,10)},
      sky:{...point(98,5),id:'sky',title:'ПАРЯЩИЕ ОСТРОВА',lift:point(95,8),chest:point(102,3)},
      cave:{...point(20,57),id:'cave',title:'КРИСТАЛЬНЫЕ ПЕЩЕРЫ',nodes:[point(17,54),point(23,54),point(20,61)],vault:point(20,57)},
      sea:{...point(91,61),id:'sea',title:'ПОДЗЕМНОЕ МОРЕ',valves:[point(87,59),point(95,59),point(91,65)],chest:point(91,61)}
    };
  }
  function notify(s){bridge()?.toast?.(s);}
  function reward(name,count,desc){bridge()?.addItem?.(name,count,desc);}
  function discovered(id,label){if(!state.discoveries.includes(id)){state.discoveries.push(id);notify('ОТКРЫТО МЕСТО: '+label);save();}}
  function near(p,r=86){const pos=bridge()?.getPlayerPosition?.();return !!pos&&Math.hypot(pos.x-p.x,pos.y-p.y)<=r;}
  function interact(){
    if(!state||!bridge()?.isBossRealm?.())return false;
    const s=sites;
    for(let i=0;i<3;i++)if(near(s.citadel.runes[i])){
      if(state.citadel.runes[i]){notify('Эта руна уже активирована.');return true;}
      const expected=state.citadel.runes.findIndex(v=>!v);
      if(i!==expected){notify('Руны нужно активировать по порядку: запад → восток → центральная.');return true;}
      state.citadel.runes[i]=true;reward('Пыль древней печати',1,'Пыль с рунического механизма цитадели.');save();
      if(state.citadel.runes.every(Boolean)){state.citadel.opened=true;reward('Ключ цитадели',1,'Ключ от сокровищницы заброшенной цитадели.');notify('ТРИ ПЕЧАТИ СОЕДИНЕНЫ! Сокровищница цитадели открыта.');}
      else notify('Руна пробуждена · '+(i+1)+'/3');return true;
    }
    if(near(s.citadel.chest)){
      if(!state.citadel.opened){notify('Сокровищница запечатана. Найди и активируй три руны вокруг цитадели.');return true;}
      if(state.citadel.claimed){notify('Сокровищница уже исследована.');return true;}
      state.citadel.claimed=true;reward('Печать павшей цитадели',1,'Реликвия из тайной сокровищницы древней крепости.');reward('Слиток звёздной стали',4,'Редкий металл, найденный в цитадели.');reward('Кристалл',5,'Кристаллы из тайника цитадели.');save();notify('СОКРОВИЩНИЦА ЦИТАДЕЛИ: найдены реликвия и звёздная сталь!');return true;
    }
    if(near(s.sky.lift)){
      if(!state.sky.lift){state.sky.lift=true;discovered('sky','Парящие острова');reward('Перо парящего острова',1,'Лёгкий минерализованный фрагмент небесного острова.');notify('НЕБЕСНЫЙ ЛИФТ АКТИВИРОВАН! Древние мосты между островами засияли.');save();}
      else notify('Лифт работает. Исследуй верхние острова и найди небесный тайник.');
      return true;
    }
    if(near(s.sky.chest)){
      if(!state.sky.lift){notify('Платформа недоступна. Сначала запусти небесный лифт у нижнего острова.');return true;}
      if(state.sky.chest){notify('Небесный тайник уже забран.');return true;}
      state.sky.chest=true;reward('Ядро небесного острова',1,'Стабильное ядро древнего парящего острова.');reward('Осколок пробуждения',2,'Осколки, найденные в небесном тайнике.');reward('Слиток звёздной стали',2,'Металл из небесной сокровищницы.');save();notify('НЕБЕСНЫЙ ТАЙНИК ОТКРЫТ! Получено ядро парящего острова.');return true;
    }
    for(let i=0;i<3;i++)if(near(s.cave.nodes[i])){
      if(state.cave.nodes[i]){notify('Жила здесь уже выработана.');return true;}
      state.cave.nodes[i]=true;const amount=3+i;reward('Осколок кристалла',amount,'Сырой кристалл из жилы глубокой пещеры.');reward(i===1?'Лунный кварц':'Светящийся кристалл',1,'Редкий минерал кристальной пещеры.');save();
      if(state.cave.nodes.every(Boolean)){state.cave.vault=true;notify('ТРИ ЖИЛЫ ОЧИЩЕНЫ! Открылся проход в кристальное хранилище.');}
      else notify('Кристальная жила добыта · '+(i+1)+'/3');return true;
    }
    if(near(s.cave.vault)){
      if(!state.cave.vault){notify('Дверь хранилища запитана тремя кристальными жилами.');return true;}
      if(state.cave.claimed){notify('Хранилище уже опустело.');return true;}
      state.cave.claimed=true;reward('Сердце кристальной жилы',1,'Чистое сердце древнего кристального массива.');reward('Осколок пробуждения',3,'Осколки из кристального хранилища.');reward('Кристалл',12,'Кристаллическая россыпь из сокровищницы.');save();notify('ХРАНИЛИЩЕ ОТКРЫТО! Сердце кристальной жилы теперь твоё.');return true;
    }
    for(let i=0;i<3;i++)if(near(s.sea.valves[i])){
      if(state.sea.valves[i]){notify('Этот клапан уже открыт.');return true;}
      const expected=state.sea.valves.findIndex(v=>!v);
      if(i!==expected){notify('Порядок клапанов указан на мозаике: левый → правый → центральный.');return true;}
      state.sea.valves[i]=true;save();notify('Клапан подземного моря открыт · '+(i+1)+'/3');
      if(state.sea.valves.every(Boolean)){state.sea.chestReady=true;notify('ПОТОК ПЕРЕНАПРАВЛЕН! Затонувший храм осушил внутреннюю камеру.');}
      return true;
    }
    if(near(s.sea.chest)){
      if(!state.sea.chestReady){notify('Храм затоплен. Открой три клапана, чтобы осушить сокровищницу.');return true;}
      if(state.sea.claimed){notify('Затонувший тайник уже исследован.');return true;}
      state.sea.claimed=true;reward('Жемчужина бездны',2,'Редкие жемчужины из глубинного храма.');reward('Реликвия затонувшего храма',1,'Древняя реликвия из подземного моря.');reward('Коралловый слиток',5,'Прочный минерал со дна подземного моря.');save();notify('ЗАТОНУВШИЙ ХРАМ ОТКРЫТ! Найдены жемчужины и древняя реликвия.');return true;
    }
    return false;
  }
  function label(text,x,y,color='#e9f4ff'){ctx.save();ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#07101dcc';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();}
  function rune(x,y,pulse,active){ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(pulse)*.08);ctx.shadowColor=pulse>0?'#8fe9ff':'#64748b';ctx.shadowBlur=active?15:7;ctx.fillStyle=active?'#8fe9ff':'#26384e';ctx.strokeStyle=active?'#e0fbff':'#9bb3ca';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(10,-5);ctx.lineTo(7,10);ctx.lineTo(-7,10);ctx.lineTo(-10,-5);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle=active?'#fff':'#8ba8c5';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(0,7);ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.stroke();ctx.restore();}
  function drawCitadel(camX,camY,time){
    const s=sites.citadel,x=s.x-camX,y=s.y-camY,p=palettes.citadel;if(x<-340||x>innerWidth+340||y<-250||y>innerHeight+250)return;
    ctx.save();ctx.translate(x,y);const pulse=.5+.5*Math.sin(time/700);
    ctx.fillStyle='#050a14aa';ctx.beginPath();ctx.ellipse(0,38,190,74,0,0,Math.PI*2);ctx.fill();
    // Outer shattered curtain wall, layered masonry and broken merlons.
    ctx.fillStyle='#202838';ctx.fillRect(-164,-45,328,108);ctx.fillStyle=p.stone;ctx.fillRect(-158,-53,316,103);
    for(let row=0;row<5;row++)for(let col=0;col<12;col++){const bx=-151+col*26+(row%2)*8,by=-45+row*19;ctx.fillStyle=(row+col)%3===0?'#657184':(row+col)%3===1?'#414b5e':'#536074';ctx.fillRect(bx,by,23,16);ctx.strokeStyle='#1b2637';ctx.strokeRect(bx,by,23,16);ctx.fillStyle='#aab6c3';ctx.globalAlpha=.16;ctx.fillRect(bx+3,by+2,12,2);ctx.globalAlpha=1;}
    // Towers with bevels, crenellations, iron bands and blue stained-glass slits.
    for(const side of [-1,1]){const tx=side*139;ctx.fillStyle='#1b2636';ctx.fillRect(tx-25,-104,50,164);ctx.fillStyle='#626f82';ctx.fillRect(tx-21,-108,42,157);ctx.fillStyle='#8491a2';ctx.fillRect(tx-20,-108,40,9);for(let k=0;k<4;k++)ctx.fillRect(tx-21+k*12,-119,8,13);ctx.fillStyle='#14263b';ctx.fillRect(tx-8,-77,16,46);ctx.fillStyle='#8fe8ff';ctx.shadowColor='#7bdfff';ctx.shadowBlur=12;ctx.fillRect(tx-4,-70,8,31);ctx.shadowBlur=0;ctx.strokeStyle='#b5c1d0';ctx.lineWidth=3;ctx.strokeRect(tx-22,-104,44,145);}
    // Gatehouse, portcullis and fractured arch.
    ctx.fillStyle='#202b3b';ctx.fillRect(-48,-90,96,124);ctx.fillStyle='#6c788b';ctx.fillRect(-43,-93,86,115);ctx.fillStyle='#101b2b';ctx.beginPath();ctx.moveTo(-26,22);ctx.lineTo(-26,-30);ctx.quadraticCurveTo(0,-76,26,-30);ctx.lineTo(26,22);ctx.closePath();ctx.fill();ctx.strokeStyle='#a8b7c9';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#71869b';ctx.lineWidth=3;for(let k=-18;k<=18;k+=9){ctx.beginPath();ctx.moveTo(k,-25);ctx.lineTo(k,20);ctx.stroke();}ctx.strokeStyle='#d6a96c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-23,-54);ctx.lineTo(-8,-63);ctx.lineTo(4,-54);ctx.lineTo(18,-66);ctx.stroke();
    // Fallen pillars, rubble, weeds and engraved floor plates.
    for(let i=0;i<17;i++){const rx=-176+hash(i,5)*352,ry=42+hash(i,9)*42;ctx.save();ctx.translate(rx,ry);ctx.rotate(hash(i,12)-.5);ctx.fillStyle='#252d3a';ctx.fillRect(-14,-5,28,11);ctx.fillStyle='#788294';ctx.fillRect(-12,-8,24,7);ctx.strokeStyle='#a4b2c2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,-7);ctx.lineTo(-2,-1);ctx.lineTo(5,-5);ctx.stroke();ctx.restore();}
    ctx.strokeStyle='#8bb6d2';ctx.globalAlpha=.24+.12*pulse;ctx.lineWidth=2;for(let r=1;r<=3;r++){ctx.beginPath();ctx.ellipse(0,20,48+r*19,22+r*8,0,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
    s.runes.forEach((pt,i)=>{const rx=pt.x-s.x,ry=pt.y-s.y;rune(rx,ry,pulse,state.citadel.runes[i]);});
    const chest=s.chest;ctx.save();ctx.translate(chest.x-s.x,chest.y-s.y+12);ctx.fillStyle='#161e2a';ctx.fillRect(-20,-12,40,25);ctx.fillStyle=state.citadel.opened?'#c79c52':'#6e7888';ctx.fillRect(-18,-19,36,13);ctx.strokeStyle='#e9d18a';ctx.lineWidth=3;ctx.strokeRect(-18,-19,36,30);ctx.fillStyle='#f5e6ad';ctx.fillRect(-3,-12,6,10);ctx.restore();
    label('ЗАБРОШЕННАЯ ЦИТАДЕЛЬ',0,-139,p.glow);label(state.citadel.opened?'СОКРОВИЩНИЦА ОТКРЫТА':'ТРИ РУНИЧЕСКИЕ ПЕЧАТИ',0,105,p.gold);ctx.restore();
  }
  function drawSky(camX,camY,time){
    const s=sites.sky,x=s.x-camX,y=s.y-camY,p=palettes.sky;if(x<-380||x>innerWidth+380||y<-300||y>innerHeight+300)return;ctx.save();ctx.translate(x,y);
    // Cloud banks and drifting mist.
    for(let i=0;i<8;i++){const cx=-190+i*53+Math.sin(time/1800+i)*8,cy=85+Math.cos(time/1300+i)*7;ctx.fillStyle='rgba(183,220,245,.10)';ctx.beginPath();ctx.ellipse(cx,cy,42,12,0,0,Math.PI*2);ctx.fill();}
    const islands=[{x:-95,y:18,rx:91,ry:28},{x:42,y:-48,rx:73,ry:24},{x:145,y:35,rx:64,ry:22}];
    islands.forEach((a,i)=>{ctx.save();ctx.translate(a.x,a.y);ctx.fillStyle='#0c1828aa';ctx.beginPath();ctx.ellipse(0,28,a.rx+10,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=i===1?'#465f7b':'#354d67';ctx.beginPath();ctx.moveTo(-a.rx,-2);ctx.lineTo(-a.rx*.72,25);ctx.lineTo(-a.rx*.34,53);ctx.lineTo(0,79);ctx.lineTo(a.rx*.42,45);ctx.lineTo(a.rx*.82,21);ctx.lineTo(a.rx,0);ctx.closePath();ctx.fill();const top=ctx.createLinearGradient(0,-20,0,34);top.addColorStop(0,'#c9e8f5');top.addColorStop(.35,'#7799b3');top.addColorStop(1,'#405d79');ctx.fillStyle=top;ctx.beginPath();ctx.ellipse(0,0,a.rx,a.ry,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d8f2ff';ctx.lineWidth=2;ctx.stroke();for(let n=0;n<11;n++){const tx=(hash(i*30+n,7)-.5)*a.rx*1.65,ty=(hash(i*30+n,8)-.5)*a.ry;ctx.fillStyle=n%2?'#9cc9d2':'#6eaa9b';ctx.beginPath();ctx.ellipse(tx,ty,5,3,hash(n,2),0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#8deaff';ctx.globalAlpha=.5+.35*Math.sin(time/420+i);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-a.rx*.6,4);ctx.quadraticCurveTo(0,12,a.rx*.6,2);ctx.stroke();ctx.restore();});
    // Suspended crystal chains and ancient lift rings.
    ctx.strokeStyle='#92b9d5';ctx.lineWidth=3;ctx.globalAlpha=.7;for(let i=0;i<4;i++){const xx=-135+i*88;ctx.beginPath();ctx.moveTo(xx,-85);ctx.lineTo(xx+Math.sin(time/800+i)*8,5);ctx.stroke();for(let j=0;j<5;j++){ctx.fillStyle='#c0d6e6';ctx.fillRect(xx-3,-72+j*15,6,5);}}ctx.globalAlpha=1;
    ctx.save();ctx.translate(s.lift.x-s.x,s.lift.y-s.y);ctx.rotate(time/4000);ctx.strokeStyle=state.sky.lift?'#8ff3ff':'#9cb8ce';ctx.shadowColor=state.sky.lift?'#68eaff':'#6b8ca7';ctx.shadowBlur=state.sky.lift?20:8;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d7faff';ctx.fillRect(-3,-3,6,6);ctx.restore();
    ctx.save();ctx.translate(s.chest.x-s.x,s.chest.y-s.y);ctx.fillStyle='#243b59';ctx.fillRect(-18,-11,36,24);ctx.fillStyle='#d8b46f';ctx.fillRect(-16,-17,32,11);ctx.strokeStyle='#f3dc9b';ctx.lineWidth=2;ctx.strokeRect(-16,-17,32,30);ctx.fillStyle='#9cf4ff';ctx.fillRect(-3,-8,6,8);ctx.restore();
    label('ПАРЯЩИЕ ОСТРОВА',0,-122,p.glow);label(state.sky.lift?'НЕБЕСНЫЙ МОСТ АКТИВЕН':'ЗАПУСТИ НЕБЕСНЫЙ ЛИФТ',0,113,p.gold);ctx.restore();
  }
  function drawCave(camX,camY,time){
    const s=sites.cave,x=s.x-camX,y=s.y-camY,p=palettes.crystal;if(x<-360||x>innerWidth+360||y<-280||y>innerHeight+280)return;ctx.save();ctx.translate(x,y);const pulse=.5+.5*Math.sin(time/480);
    ctx.fillStyle='#050b1a99';ctx.beginPath();ctx.ellipse(0,50,190,82,0,0,Math.PI*2);ctx.fill();
    // Jagged cave mouth and layered rock strata.
    ctx.fillStyle='#10172b';ctx.beginPath();ctx.moveTo(-172,58);ctx.lineTo(-151,-43);ctx.lineTo(-113,-104);ctx.lineTo(-69,-67);ctx.lineTo(-26,-135);ctx.lineTo(15,-91);ctx.lineTo(66,-123);ctx.lineTo(115,-57);ctx.lineTo(165,-31);ctx.lineTo(180,60);ctx.closePath();ctx.fill();
    ctx.fillStyle='#333b5c';ctx.beginPath();ctx.moveTo(-157,50);ctx.lineTo(-139,-35);ctx.lineTo(-109,-83);ctx.lineTo(-72,-53);ctx.lineTo(-25,-117);ctx.lineTo(12,-75);ctx.lineTo(65,-103);ctx.lineTo(106,-47);ctx.lineTo(154,-19);ctx.lineTo(166,51);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#7984a7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-139,-35);ctx.lineTo(-109,-83);ctx.lineTo(-72,-53);ctx.lineTo(-25,-117);ctx.lineTo(12,-75);ctx.lineTo(65,-103);ctx.lineTo(106,-47);ctx.lineTo(154,-19);ctx.stroke();
    for(let i=0;i<22;i++){const xx=-145+hash(i,18)*290,yy=20+hash(i,19)*50;ctx.fillStyle=i%2?'#555e7d':'#252d49';ctx.beginPath();ctx.moveTo(xx-9,yy);ctx.lineTo(xx,yy-12-hash(i,20)*18);ctx.lineTo(xx+11,yy);ctx.closePath();ctx.fill();}
    // Large translucent crystal clusters with internal facets and emissive cores.
    const clusters=[[-112,2,1],[-38,-13,.8],[69,-1,1.2],[125,17,.72],[0,39,.65]];
    clusters.forEach((a,i)=>{ctx.save();ctx.translate(a[0],a[1]);ctx.scale(a[2],a[2]);ctx.shadowColor=i%2?'#a98cff':'#65edff';ctx.shadowBlur=22+12*pulse;ctx.fillStyle=i%2?'#8170bd':'#55c5d1';ctx.beginPath();ctx.moveTo(0,-48);ctx.lineTo(17,-8);ctx.lineTo(10,24);ctx.lineTo(-9,18);ctx.lineTo(-17,-10);ctx.closePath();ctx.fill();ctx.strokeStyle='#d9faff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='rgba(255,255,255,.34)';ctx.beginPath();ctx.moveTo(0,-43);ctx.lineTo(5,-7);ctx.lineTo(-4,11);ctx.lineTo(-8,-9);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(16,28,54,.65)';ctx.beginPath();ctx.moveTo(0,-42);ctx.lineTo(17,-8);ctx.moveTo(0,-42);ctx.lineTo(-17,-10);ctx.stroke();ctx.restore();});
    s.nodes.forEach((pt,i)=>{const dx=pt.x-s.x,dy=pt.y-s.y;ctx.save();ctx.translate(dx,dy);ctx.fillStyle='#0b1328';ctx.beginPath();ctx.ellipse(0,12,24,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=state.cave.nodes[i]?'#43506c':'#586caa';ctx.shadowColor='#8cf4ff';ctx.shadowBlur=state.cave.nodes[i]?2:18;ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(12,-4);ctx.lineTo(8,12);ctx.lineTo(-8,12);ctx.lineTo(-13,-4);ctx.closePath();ctx.fill();ctx.strokeStyle='#d4faff';ctx.lineWidth=2;ctx.stroke();ctx.restore();});
    ctx.save();ctx.translate(s.vault.x-s.x,s.vault.y-s.y);ctx.fillStyle='#101a32';ctx.fillRect(-31,-29,62,58);ctx.strokeStyle=state.cave.vault?'#9ef5ff':'#6f77a5';ctx.lineWidth=5;ctx.strokeRect(-31,-29,62,58);ctx.strokeStyle='#c8d8ff';ctx.lineWidth=2;for(let k=-20;k<=20;k+=10){ctx.beginPath();ctx.moveTo(k,-22);ctx.lineTo(k,22);ctx.stroke();}ctx.fillStyle='#a6efff';ctx.shadowColor='#76efff';ctx.shadowBlur=state.cave.vault?18:4;ctx.fillRect(-5,-8,10,16);ctx.restore();
    label('КРИСТАЛЬНЫЕ ПЕЩЕРЫ',0,-151,p.glow);label(state.cave.vault?'ХРАНИЛИЩЕ ПИТАЕТСЯ':'СОБЕРИ ТРИ КРИСТАЛЬНЫЕ ЖИЛЫ',0,111,'#d8c9ff');ctx.restore();
  }
  function drawSea(camX,camY,time){
    const s=sites.sea,x=s.x-camX,y=s.y-camY,p=palettes.sea;if(x<-380||x>innerWidth+380||y<-300||y>innerHeight+300)return;ctx.save();ctx.translate(x,y);const wave=time/600;
    // Deep basin, layered water caustics and luminous shoreline.
    ctx.fillStyle='#061b2b';ctx.beginPath();ctx.ellipse(0,18,202,104,0,0,Math.PI*2);ctx.fill();
    const water=ctx.createRadialGradient(-35,-20,8,0,8,205);water.addColorStop(0,'#1c7890');water.addColorStop(.48,'#10506c');water.addColorStop(1,'#08243c');ctx.fillStyle=water;ctx.beginPath();ctx.ellipse(0,10,190,93,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.beginPath();ctx.ellipse(0,10,185,88,0,0,Math.PI*2);ctx.clip();for(let i=0;i<24;i++){const xx=-180+((i*47+time/35)%360),yy=Math.sin(i*2+wave)*58;ctx.strokeStyle=i%2?'rgba(125,238,240,.22)':'rgba(191,248,255,.14)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx+15,yy-6,xx+34,yy+Math.sin(wave+i)*5);ctx.stroke();}ctx.restore();
    // Sunken temple columns, broken pediment, sea grass and coral.
    ctx.fillStyle='#173c50';ctx.fillRect(-88,-43,176,92);ctx.fillStyle='#387184';ctx.fillRect(-82,-48,164,12);for(let k=0;k<6;k++){const xx=-70+k*28;ctx.fillStyle='#244e62';ctx.fillRect(xx,-33,13,75);ctx.fillStyle='#77a5a9';ctx.fillRect(xx-3,-37,19,5);ctx.fillRect(xx-3,37,19,6);ctx.strokeStyle='#143449';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx+3,-25);ctx.lineTo(xx+6,30);ctx.stroke();}
    ctx.fillStyle='#1d485b';ctx.beginPath();ctx.moveTo(-101,-47);ctx.lineTo(-66,-82);ctx.lineTo(0,-96);ctx.lineTo(67,-81);ctx.lineTo(100,-47);ctx.closePath();ctx.fill();ctx.strokeStyle='#77c4c5';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#09243b';ctx.fillRect(-25,-25,50,73);ctx.strokeStyle='#9ee8df';ctx.lineWidth=2;ctx.strokeRect(-25,-25,50,73);
    for(let i=0;i<18;i++){const xx=-178+hash(i,55)*356,yy=55+hash(i,56)*36;ctx.strokeStyle=i%3?'#4b9b91':'#d17d75';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx-12,yy-20,xx-6,yy-30);ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx+12,yy-14,xx+17,yy-27);ctx.stroke();}
    // Shipwreck with broken mast, ribs, anchor chain and drifting bubbles.
    ctx.save();ctx.translate(132,-10);ctx.rotate(-.14);ctx.fillStyle='#241f2a';ctx.beginPath();ctx.moveTo(-42,-4);ctx.lineTo(43,-4);ctx.lineTo(26,25);ctx.lineTo(-25,23);ctx.closePath();ctx.fill();ctx.fillStyle='#815d4a';ctx.fillRect(-34,-10,70,11);ctx.strokeStyle='#c49a70';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(0,-81);ctx.moveTo(0,-64);ctx.lineTo(30,-40);ctx.moveTo(0,-51);ctx.lineTo(-25,-31);ctx.stroke();ctx.fillStyle='#e2b77a';ctx.globalAlpha=.52;ctx.beginPath();ctx.moveTo(3,-72);ctx.lineTo(27,-44);ctx.lineTo(3,-48);ctx.closePath();ctx.fill();ctx.restore();
    for(let i=0;i<13;i++){const bx=-160+hash(i,77)*320,by=-65+((time/26+i*23)%140);ctx.strokeStyle='rgba(175,250,255,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(bx,by,2+hash(i,78)*3,0,Math.PI*2);ctx.stroke();}
    s.valves.forEach((pt,i)=>{ctx.save();ctx.translate(pt.x-s.x,pt.y-s.y);ctx.fillStyle='#173b50';ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.fill();ctx.strokeStyle=state.sea.valves[i]?'#a9fff2':'#7dc7ca';ctx.lineWidth=3;ctx.stroke();ctx.rotate(time/1200+i);ctx.strokeStyle='#d2faff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.moveTo(0,-8);ctx.lineTo(0,8);ctx.stroke();ctx.restore();});
    ctx.save();ctx.translate(s.chest.x-s.x,s.chest.y-s.y);ctx.fillStyle='#203b4c';ctx.fillRect(-20,-13,40,28);ctx.fillStyle='#bd9857';ctx.fillRect(-18,-19,36,12);ctx.strokeStyle='#e8d29a';ctx.lineWidth=2;ctx.strokeRect(-18,-19,36,34);ctx.restore();
    label('ПОДЗЕМНОЕ МОРЕ',0,-120,p.glow);label(state.sea.chestReady?'КАМЕРА ОСУШЕНА':'ОТКРОЙ ТРИ ГЛУБИННЫХ КЛАПАНА',0,132,p.gold);ctx.restore();
  }
  function draw(ctx2,camX,camY,time,width,height){
    if(!state||!bridge()?.isBossRealm?.()||!ctx2)return;
    ctx=ctx2;const w=Number(width)||innerWidth,h=Number(height)||innerHeight;
    // Keep labels and landmark details inside the active viewport without creating per-frame entities.
    const oldW=innerWidth,oldH=innerHeight;try{Object.defineProperty(window,'__skyRealmExplorationViewport',{value:{w,h},configurable:true});}catch(_){}
    drawCitadel(camX,camY,time);drawSky(camX,camY,time);drawCave(camX,camY,time);drawSea(camX,camY,time);
    const p=bridge()?.getPlayerPosition?.();if(p){const nearby=Object.values(sites).find(site=>Math.hypot(p.x-site.x,p.y-site.y)<280);if(nearby){ctx.save();ctx.fillStyle='rgba(5,12,24,.78)';ctx.strokeStyle='rgba(141,222,255,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect?.(w/2-130,h-66,260,30,8);ctx.fill();ctx.stroke();ctx.fillStyle='#e9f7ff';ctx.font='800 11px Segoe UI';ctx.textAlign='center';ctx.fillText('E · ИССЛЕДОВАТЬ ДРЕВНИЙ МЕХАНИЗМ',w/2,h-47);ctx.restore();}}
  }
  function onKey(e){
    if(e.repeat||!['KeyE','e','E'].includes(e.code)&&String(e.key||'').toLowerCase()!=='e')return;
    if(!state||!bridge()?.isBossRealm?.())return;
    if(interact()){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();}
  }
  function boot(){
    load();window.addEventListener('keydown',onKey,true);
    window.addEventListener('storage',e=>{if(e.key===KEY+encodeURIComponent(worldId))load();});
    setInterval(()=>{const id=String(bridge()?.getWorldId?.()||'');if(id!==worldId)load();},900);
    window.SkyRealmBossExploration=Object.freeze({draw,interact,getState:()=>state?JSON.parse(JSON.stringify(state)):null,getSites:()=>sites?JSON.parse(JSON.stringify(sites)):null});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();