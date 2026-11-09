(() => {
  'use strict';
  const KEY='skyrealm_boss_realm_hub_v1_';
  const bridge=()=>window.SkyRealmSeaBridge;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hash=(x,y)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const palettes={
    forge:{stone:'#34313b',dark:'#15151d',light:'#9b8790',glow:'#ff9b58',gold:'#f4ce83'},
    library:{stone:'#3a344d',dark:'#171529',light:'#b4a4d2',glow:'#bda7ff',gold:'#f3d99a'},
    sanctuary:{stone:'#3b554f',dark:'#142a2a',light:'#a6c9ae',glow:'#9bffcf',gold:'#f0d28d'}
  };
  const fresh=()=>({version:1,anchor:null,forge:{crafted:[],upgrades:0},library:{pages:[],atlas:false},sanctuary:{restAt:0,trophies:[],rewarded:false}});
  let worldId='',state=null,sites=null,ctx=null;
  function notify(s){bridge()?.toast?.(s);}
  function save(){if(!worldId||!state)return;try{localStorage.setItem(KEY+encodeURIComponent(worldId),JSON.stringify(state));bridge()?.save?.();}catch(e){console.warn('[Boss Realm hub save]',e);}}
  function load(){
    const b=bridge(),id=String(b?.getWorldId?.()||'');
    if(!id){worldId='';state=null;sites=null;return;}
    if(id===worldId&&state)return;
    worldId=id;state=fresh();
    try{const raw=JSON.parse(localStorage.getItem(KEY+encodeURIComponent(id))||'null');if(raw&&raw.version===1){state={...state,...raw,forge:{...state.forge,...raw.forge},library:{...state.library,...raw.library},sanctuary:{...state.sanctuary,...raw.sanctuary}};}}catch(_){}
    const p=b?.getPlayerPosition?.()||{x:21*32,y:26*32},bounds=b?.getWorldBounds?.()||{width:220*32,height:164*32};
    if(!state.anchor||!Number.isFinite(state.anchor.x)||!Number.isFinite(state.anchor.y)){state.anchor={x:p.x,y:p.y};save();}
    const ax=state.anchor.x,ay=state.anchor.y,w=bounds.width||220*32,h=bounds.height||164*32;
    const point=(dx,dy)=>({x:clamp(ax+dx*32,12*32,w-13*32),y:clamp(ay+dy*32,12*32,h-13*32)});
    sites={
      forge:{...point(135,-22),id:'forge',stations:[point(132,-22),point(138,-22),point(135,-17)]},
      library:{...point(-18,-34),id:'library',books:[point(-22,-34),point(-18,-34),point(-14,-34),point(-18,-29)]},
      sanctuary:{...point(4,-30),id:'sanctuary',altar:point(4,-30),museum:[point(0,-26),point(4,-26),point(8,-26),point(12,-26)],atlas:point(4,-36)}
    };
  }
  const recipes=[
    {id:'abyss_blade',name:'Клинок бездны',out:'Клинок бездны',icon:'⚔️',desc:'Лезвие из звёздной стали с кристальным сердечником. Оружие уже совместимо с экипировкой.',cost:[['Слиток звёздной стали',6],['Осколок кристалла',8],['Жемчужина бездны',2]]},
    {id:'tide_trident',name:'Трезубец прилива',out:'Трезубец прилива',icon:'🔱',desc:'Трезубец, закалённый в глубинном храме и сбалансированный жемчужинами бездны.',cost:[['Коралловый слиток',5],['Жемчужина бездны',3],['Реликвия затонувшего храма',1]]},
    {id:'artifact_awakening',name:'Ритуал эволюции',out:null,icon:'💠',desc:'Усиливает надетый артефакт на один уровень по обычным правилам эволюции.',cost:[['Ядро небесного острова',1],['Сердце кристальной жилы',1],['Печать павшей цитадели',1]]}
  ];
  const lore=[
    {title:'Камень помнит',body:'Цитадель построили не для защиты от захватчиков. Её стены удерживали границу между слоями мира. Три руны — не замки, а три части одного древнего обещания.',cost:[],reward:['Пыль древней печати',2]},
    {title:'Небесный якорь',body:'Парящие острова держатся на сердцах из плотного света. Когда ядра гаснут, острова медленно опускаются в облачную бездну. Лифт был создан, чтобы выравнивать их резонанс.',cost:[['Перо парящего острова',1]],reward:['Ядро небесного острова',1]},
    {title:'Живой минерал',body:'Кристаллы в глубинных пещерах растут не из камня, а из звука. Их грани повторяют эхо шагов исследователя. Поэтому самые чистые жилы находятся там, где никто не ходил веками.',cost:[['Лунный кварц',1]],reward:['Осколок пробуждения',2]},
    {title:'Город под водой',body:'Подземное море — не природная пещера. Храм построен вокруг огромного резервуара. Клапаны меняют направление течений, а жемчужины бездны служили ключами к внутренней камере.',cost:[['Жемчужина бездны',1]],reward:['Эссенция глубин',1]}
  ];
  const trophies=['Печать павшей цитадели','Ядро небесного острова','Сердце кристальной жилы','Реликвия затонувшего храма'];
  function has(name,n=1){return (bridge()?.getItemCount?.(name)||0)>=n;}
  function spend(cost){for(const [name,n] of cost)if(!has(name,n))return false;for(const [name,n] of cost)if(!bridge()?.spendItem?.(name,n))return false;return true;}
  function missing(cost){return cost.filter(([name,n])=>!has(name,n)).map(([name,n])=>name+' ×'+n+' (есть '+(bridge()?.getItemCount?.(name)||0)+')').join(', ');}
  function give(name,n,desc){bridge()?.addItem?.(name,n,desc);}
  function craft(i){
    const r=recipes[i];if(!r)return;
    if(state.forge.crafted.includes(r.id)&&r.id!=='artifact_awakening'){notify('Этот чертёж уже изготовлен. Предмет можно найти в инвентаре.');return;}
    if(r.id==='artifact_awakening'){
      const missingRare=missing(r.cost);if(missingRare){notify('Для ритуала нужны: '+missingRare);return;}
      if(!bridge()?.upgradeArtifact?.())return;
      if(!spend(r.cost)){notify('Не удалось списать редкие материалы.');return;}
      state.forge.upgrades++;save();notify('КУЗНЯ ПРОБУДИЛА АРТЕФАКТ! Редкие материалы вложены в эволюцию.');return;
    }
    const lacking=missing(r.cost);if(lacking){notify('Не хватает материалов: '+lacking);return;}
    if(!spend(r.cost)){notify('Не удалось списать материалы.');return;}
    give(r.out,1,r.desc);state.forge.crafted.push(r.id);save();notify('КУЗНЯ ГОТОВА: '+r.name+' создан! Предмет добавлен в инвентарь.');
  }
  function interact(){
    if(!state||!bridge()?.isBossRealm?.())return false;
    const p=bridge()?.getPlayerPosition?.();if(!p)return false;
    const near=(q,r=84)=>Math.hypot(p.x-q.x,p.y-q.y)<=r;
    for(let i=0;i<sites.forge.stations.length;i++)if(near(sites.forge.stations[i])){craft(i);return true;}
    if(near(sites.library.books[0],92)){
      if(state.library.pages.includes(0)){notify('Запись «Камень помнит» уже прочитана.');return true;}
      state.library.pages.push(0);give(lore[0].reward[0],lore[0].reward[1],'Пыль с древних страниц библиотеки.');save();notify('АРХИВ · '+lore[0].title+': '+lore[0].body);return true;
    }
    for(let i=1;i<lore.length;i++)if(near(sites.library.books[i],92)){
      if(state.library.pages.includes(i)){notify('Эта запись уже внесена в журнал.');return true;}
      const cost=lore[i].cost;if(missing(cost)){notify('Для доступа к записи нужно: '+missing(cost));return true;}
      if(!spend(cost))return true;
      state.library.pages.push(i);give(lore[i].reward[0],lore[i].reward[1],'Награда за изучение древнего архива.');save();notify('АРХИВ · '+lore[i].title+': '+lore[i].body);return true;
    }
    if(near(sites.sanctuary.altar)){
      const now=Date.now(),remaining=Math.max(0,180000-(now-(Number(state.sanctuary.restAt)||0)));
      if(remaining>0){notify('Алтарь отдыхает. До следующего полного восстановления: '+Math.ceil(remaining/1000)+' сек.');return true;}
      if(!bridge()?.restoreHealth?.()){notify('Не удалось восстановить здоровье.');return true;}
      state.sanctuary.restAt=now;save();notify('СВЯТИЛИЩЕ · здоровье полностью восстановлено. Алтарь перезарядится через 3 минуты.');return true;
    }
    for(let i=0;i<sites.sanctuary.museum.length;i++)if(near(sites.sanctuary.museum[i])){
      const name=trophies[i];if(state.sanctuary.trophies.includes(name)){notify('Экспонат уже внесён в музей.');return true;}
      if(!has(name)){notify('Для этого постамента нужна реликвия: '+name);return true;}
      state.sanctuary.trophies.push(name);give('Осколок пробуждения',1,'Награда хранителя святилища за регистрацию реликвии.');save();
      if(state.sanctuary.trophies.length===4&&!state.sanctuary.rewarded){state.sanctuary.rewarded=true;give('Эссенция глубин',4,'Награда за полную коллекцию четырёх реликвий Мира боссов.');notify('МУЗЕЙ СОБРАН! Полная коллекция открыла тайный запас эссенций.');}
      else notify('РЕЛИКВИЯ В МУЗЕЕ: '+name+' · '+state.sanctuary.trophies.length+'/4 экспонатов.');
      return true;
    }
    if(near(sites.sanctuary.atlas)){
      if(state.library.atlas){notify('Атлас уже составлен. Все четыре области отмечены на карте святилища.');return true;}
      state.library.atlas=true;give('Карта сокровищ',1,'Атлас четырёх областей Мира боссов с пометками исследователя.');save();notify('АТЛАС ИССЛЕДОВАТЕЛЯ СОСТАВЛЕН! Цитадель, острова, пещеры и подземное море внесены в архив.');return true;
    }
    return false;
  }
  function label(text,x,y,color){ctx.save();ctx.font='900 10px Segoe UI';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#080b16e8';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();}
  function stone(x,y,w,h,p){ctx.fillStyle=p.dark;ctx.fillRect(x-w/2,y-h/2,w,h);ctx.fillStyle=p.stone;ctx.fillRect(x-w/2+4,y-h/2+4,w-8,h-8);ctx.fillStyle=p.light;ctx.globalAlpha=.55;ctx.fillRect(x-w/2+6,y-h/2+5,w-12,3);ctx.globalAlpha=1;ctx.strokeStyle=p.dark;ctx.lineWidth=2;ctx.strokeRect(x-w/2,y-h/2,w,h);}
  function drawForge(s,time){
    const p=palettes.forge,x=s.x,y=s.y;if(x<-300||x>innerWidth+300||y<-240||y>innerHeight+240)return;ctx.save();ctx.translate(x,y);
    const glow=.5+.5*Math.sin(time/260);const floor=ctx.createRadialGradient(0,0,20,0,0,205);floor.addColorStop(0,'#5b3940');floor.addColorStop(.7,'#282532');floor.addColorStop(1,'#11131d');ctx.fillStyle=floor;ctx.beginPath();ctx.ellipse(0,30,202,119,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a75b48';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,30,194,112,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<13;i++){const a=i*Math.PI*2/13,xx=Math.cos(a)*166,yy=30+Math.sin(a)*88;stone(xx,yy,23,28,p);ctx.fillStyle=i%2?'#7c514e':'#9b6251';ctx.fillRect(xx-3,yy-6,6,12);}
    // Furnace body: layered basalt, copper bands, glowing vents and a moving fire core.
    stone(0,-22,118,110,p);ctx.fillStyle='#6d4240';ctx.fillRect(-58,-76,116,12);ctx.fillStyle='#c08b65';ctx.fillRect(-51,-71,102,4);ctx.fillStyle='#100e18';ctx.beginPath();ctx.moveTo(-38,12);ctx.lineTo(-29,-29);ctx.lineTo(0,-47);ctx.lineTo(29,-29);ctx.lineTo(38,12);ctx.closePath();ctx.fill();const fire=ctx.createRadialGradient(0,-8,2,0,-8,45);fire.addColorStop(0,'#fff3b1');fire.addColorStop(.24,'#ffb34f');fire.addColorStop(.68,'#e94d36');fire.addColorStop(1,'rgba(108,25,42,0)');ctx.fillStyle=fire;ctx.globalAlpha=.65+glow*.3;ctx.beginPath();ctx.arc(0,-8,43+glow*5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    for(let i=0;i<8;i++){const a=time/850+i*Math.PI/4;ctx.fillStyle=i%2?'#ffb15e':'#fff0a6';ctx.shadowColor='#ff743e';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(Math.cos(a)*29,-8+Math.sin(a)*23,2+hash(i,3)*2,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
    // Anvil, bellows, chain hooks and three recipe pedestals.
    stone(-103,40,42,25,p);ctx.fillStyle='#a9b6c7';ctx.fillRect(-124,22,42,9);ctx.fillStyle='#e5edf4';ctx.fillRect(-119,18,31,5);ctx.strokeStyle='#b17b5c';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-102,-82);ctx.lineTo(-102,-116);ctx.moveTo(102,-82);ctx.lineTo(102,-116);ctx.stroke();for(let i=0;i<3;i++){const pt=s.stations[i],sx=pt.x-s.x,sy=pt.y-s.y;ctx.save();ctx.translate(sx,sy);stone(0,0,38,30,p);ctx.fillStyle=['#ff9b58','#83eaff','#c6a7ff'][i];ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(0,-26);ctx.lineTo(11,-10);ctx.lineTo(8,7);ctx.lineTo(-8,7);ctx.lineTo(-11,-10);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.restore();label(['КЛИНОК БЕЗДНЫ','ТРЕЗУБЕЦ ПРИЛИВА','ЭВОЛЮЦИЯ'][i],sx,sy+31,['#ffd0a6','#a9f7ff','#d9c9ff'][i]);}
    for(let i=0;i<9;i++){const xx=-160+i*40;ctx.strokeStyle='#d38b60';ctx.globalAlpha=.35;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,-95);ctx.lineTo(xx+Math.sin(time/400+i)*4,-125);ctx.stroke();}ctx.globalAlpha=1;
    label('ДИМЕНСИОНАЛЬНАЯ КУЗНЯ',0,-153,p.glow);label('РЕДКИЕ МАТЕРИАЛЫ · ЧЕРТЕЖИ · ПРОБУЖДЕНИЕ',0,151,p.gold);ctx.restore();
  }
  function drawLibrary(s,time){
    const p=palettes.library,x=s.x,y=s.y;if(x<-300||x>innerWidth+300||y<-260||y>innerHeight+260)return;ctx.save();ctx.translate(x,y);
    const floor=ctx.createRadialGradient(0,0,18,0,0,205);floor.addColorStop(0,'#51446e');floor.addColorStop(.72,'#2a2541');floor.addColorStop(1,'#121425');ctx.fillStyle=floor;ctx.beginPath();ctx.ellipse(0,25,190,122,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8b79b3';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,25,182,114,0,0,Math.PI*2);ctx.stroke();
    // Arched archive wall and ribbed columns.
    ctx.fillStyle='#28243b';ctx.beginPath();ctx.moveTo(-137,42);ctx.lineTo(-137,-70);ctx.quadraticCurveTo(-137,-154,0,-161);ctx.quadraticCurveTo(137,-154,137,-70);ctx.lineTo(137,42);ctx.closePath();ctx.fill();ctx.strokeStyle='#a99ac7';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#655a82';ctx.lineWidth=8;for(const xx of [-112,-72,-36,36,72,112]){ctx.beginPath();ctx.moveTo(xx,35);ctx.lineTo(xx,-91);ctx.stroke();ctx.strokeStyle='#b7a8d2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx-4,-85);ctx.lineTo(xx+4,-85);ctx.stroke();ctx.strokeStyle='#655a82';ctx.lineWidth=8;}
    // Shelves filled with individually shaded spines.
    for(let row=0;row<2;row++){const yy=-76+row*55;ctx.fillStyle='#4b3650';ctx.fillRect(-105,yy,210,9);for(let i=0;i<18;i++){const xx=-99+i*11.5,h=23+hash(i,row)*17;ctx.fillStyle=['#a55f54','#647da0','#b38a55','#657b68','#8770a9'][i%5];ctx.fillRect(xx,yy-h,8,h);ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(xx+1,yy-h+3,2,h-6);}}
    // Floating glyphs and dust motes.
    for(let i=0;i<22;i++){const a=time/1800+i*2.4,xx=Math.sin(a)*145,yy=-88+Math.cos(a*1.3)*62;ctx.save();ctx.translate(xx,yy);ctx.rotate(a);ctx.strokeStyle=i%2?'#cbb7ff':'#ffe2a0';ctx.globalAlpha=.32+.4*(.5+.5*Math.sin(a*2));ctx.lineWidth=1.5;ctx.strokeRect(-3,-3,6,6);ctx.restore();}
    s.books.forEach((pt,i)=>{const bx=pt.x-s.x,by=pt.y-s.y;ctx.save();ctx.translate(bx,by);ctx.fillStyle='#241d36';ctx.fillRect(-19,-6,38,21);ctx.fillStyle=['#c47d63','#77a7c5','#bba0e5','#d9b96e'][i];ctx.fillRect(-15,-18,30,17);ctx.strokeStyle='#f1e4bd';ctx.lineWidth=1.5;ctx.strokeRect(-15,-18,30,17);ctx.fillStyle='#f5e5b8';ctx.fillRect(-2,-16,2,13);ctx.shadowColor='#c2a7ff';ctx.shadowBlur=12;ctx.fillStyle='#c9b2ff';ctx.beginPath();ctx.arc(0,-25,3+Math.sin(time/300+i)*1,0,Math.PI*2);ctx.fill();ctx.restore();label('ТОМ '+(i+1),bx,by+31,'#e3d7ff');});
    label('БИБЛИОТЕКА ВЕЧНОСТИ',0,-181,p.glow);label('ПРОЧИТАНО '+state.library.pages.length+'/4 ЗАПИСИ',0,154,p.gold);ctx.restore();
  }
  function drawSanctuary(s,time){
    const p=palettes.sanctuary,x=s.x,y=s.y;if(x<-340||x>innerWidth+340||y<-270||y>innerHeight+270)return;ctx.save();ctx.translate(x,y);
    const aura=ctx.createRadialGradient(0,0,20,0,0,210);aura.addColorStop(0,'#4c7865');aura.addColorStop(.65,'#294a43');aura.addColorStop(1,'#14272c');ctx.fillStyle=aura;ctx.beginPath();ctx.ellipse(0,22,205,126,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8abf9d';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,22,195,116,0,0,Math.PI*2);ctx.stroke();
    // Four carved pillars, ivy and a luminous canopy.
    for(let i=0;i<4;i++){const xx=-130+i*86;stone(xx,-38,28,112,p);ctx.fillStyle='#a7c5a1';ctx.fillRect(xx-20,-98,40,9);ctx.fillStyle='#6f9a78';ctx.fillRect(xx-16,-104,32,6);for(let j=0;j<4;j++){ctx.strokeStyle=j%2?'#75a980':'#a2c78b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx-12+j*7,-20);ctx.quadraticCurveTo(xx-24+j*12,Math.sin(time/600+j)*14,xx-10+j*7,37);ctx.stroke();}}
    ctx.fillStyle='#315c4d';ctx.beginPath();ctx.moveTo(-158,-91);ctx.quadraticCurveTo(-85,-178,0,-142);ctx.quadraticCurveTo(88,-179,158,-91);ctx.lineTo(137,-84);ctx.quadraticCurveTo(0,-130,-137,-84);ctx.closePath();ctx.fill();ctx.strokeStyle='#a8d5a4';ctx.lineWidth=3;ctx.stroke();
    // Central healing crystal in a carved basin.
    ctx.fillStyle='#203c37';ctx.beginPath();ctx.ellipse(0,30,57,28,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a2cba2';ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.translate(0,-5);ctx.shadowColor='#a2ffcf';ctx.shadowBlur=24;ctx.fillStyle='#91edbc';ctx.beginPath();ctx.moveTo(0,-62);ctx.lineTo(24,-24);ctx.lineTo(15,18);ctx.lineTo(-15,18);ctx.lineTo(-24,-24);ctx.closePath();ctx.fill();ctx.strokeStyle='#e1ffe9';ctx.lineWidth=2;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.moveTo(0,-52);ctx.lineTo(0,12);ctx.moveTo(-14,-20);ctx.lineTo(0,-4);ctx.lineTo(14,-20);ctx.stroke();ctx.restore();
    for(let i=0;i<24;i++){const a=time/1500+i*2.4,xx=Math.cos(a)*(76+hash(i,2)*42),yy=10+Math.sin(a*1.2)*(35+hash(i,3)*35);ctx.fillStyle=i%3?'rgba(164,255,201,.65)':'rgba(255,226,153,.8)';ctx.shadowColor='#a2ffcf';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(xx,yy,1.5+hash(i,4)*2,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
    // Museum plinths, each with its own relic silhouette.
    s.museum.forEach((pt,i)=>{const xx=pt.x-s.x,yy=pt.y-s.y;stone(xx,yy,35,28,p);ctx.fillStyle=['#d9bb7c','#8ce8ff','#c3b5ff','#83d8c1'][i];ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=state.sanctuary.trophies.includes(trophies[i])?15:5;ctx.beginPath();if(i===0){ctx.moveTo(xx,yy-27);ctx.lineTo(xx+13,yy-15);ctx.lineTo(xx,yy-4);ctx.lineTo(xx-13,yy-15);}else if(i===1){ctx.moveTo(xx,yy-31);ctx.lineTo(xx+10,yy-18);ctx.lineTo(xx+7,yy-4);ctx.lineTo(xx-7,yy-4);ctx.lineTo(xx-10,yy-18);}else if(i===2){ctx.moveTo(xx,yy-33);ctx.lineTo(xx+11,yy-13);ctx.lineTo(xx,yy-2);ctx.lineTo(xx-11,yy-13);}else{ctx.ellipse(xx,yy-17,13,8,0,0,Math.PI*2);}ctx.fill();ctx.shadowBlur=0;ctx.restore();ctx.save();label(state.sanctuary.trophies.includes(trophies[i])?'СОХРАНЕНО':'ЭКСПОНАТ '+(i+1),xx,yy+28,'#d8f4e0');});
    // Atlas table and etched route lines.
    stone(0,-111,74,31,p);ctx.strokeStyle='#d5c18e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-25,-112);ctx.lineTo(-8,-119);ctx.lineTo(10,-107);ctx.lineTo(25,-117);ctx.stroke();ctx.fillStyle='#c6e9d0';ctx.globalAlpha=.7;ctx.fillRect(-27,-119,54,2);ctx.globalAlpha=1;
    label('СВЯТИЛИЩЕ ИССЛЕДОВАТЕЛЯ',0,-190,p.glow);label('МУЗЕЙ '+state.sanctuary.trophies.length+'/4 · АЛТАРЬ ВОССТАНОВЛЕНИЯ',0,157,p.gold);ctx.restore();
  }
  function draw(ctx2,camX,camY,time,width,height){
    if(!state||!bridge()?.isBossRealm?.()||!ctx2)return;ctx=ctx2;const w=Number(width)||innerWidth,h=Number(height)||innerHeight;
    drawForge({...sites.forge,x:sites.forge.x-camX,y:sites.forge.y-camY,stations:sites.forge.stations.map(v=>({x:v.x-camX,y:v.y-camY}))},time);
    drawLibrary({...sites.library,x:sites.library.x-camX,y:sites.library.y-camY,books:sites.library.books.map(v=>({x:v.x-camX,y:v.y-camY}))},time);
    drawSanctuary({...sites.sanctuary,x:sites.sanctuary.x-camX,y:sites.sanctuary.y-camY,altar:{x:sites.sanctuary.altar.x-camX,y:sites.sanctuary.altar.y-camY},museum:sites.sanctuary.museum.map(v=>({x:v.x-camX,y:v.y-camY})),atlas:{x:sites.sanctuary.atlas.x-camX,y:sites.sanctuary.atlas.y-camY}},time);
    const p=bridge()?.getPlayerPosition?.();if(p){const nearSite=Object.values(sites).find(v=>Math.hypot(p.x-v.x,p.y-v.y)<280);if(nearSite){ctx.save();ctx.fillStyle='rgba(5,12,24,.82)';ctx.strokeStyle='rgba(154,235,198,.7)';ctx.beginPath();ctx.roundRect?.(w/2-150,h-66,300,30,8);ctx.fill();ctx.stroke();ctx.fillStyle='#effff5';ctx.font='800 11px Segoe UI';ctx.textAlign='center';ctx.fillText('E · ВЗАИМОДЕЙСТВОВАТЬ',w/2,h-47);ctx.restore();}}
  }
  function onKey(e){if(e.repeat||e.code!=='KeyE'&&String(e.key||'').toLowerCase()!=='e')return;if(!state||!bridge()?.isBossRealm?.())return;if(interact()){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();}}
  function boot(){load();window.addEventListener('keydown',onKey,true);window.addEventListener('storage',e=>{if(e.key===KEY+encodeURIComponent(worldId))load();});setInterval(()=>{const id=String(bridge()?.getWorldId?.()||'');if(id!==worldId)load();},900);window.SkyRealmBossRealmHub=Object.freeze({draw,interact,getState:()=>state?JSON.parse(JSON.stringify(state)):null,getSites:()=>sites?JSON.parse(JSON.stringify(sites)):null,recipes:()=>recipes.map(v=>({id:v.id,name:v.name,cost:v.cost}))});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();