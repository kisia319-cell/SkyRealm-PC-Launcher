(() => {
  'use strict';
  const B=()=>window.SkyRealmSeaBridge;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  const rnd=(s,n)=>{let x=(s+Math.imul(n+1,0x9e3779b9))|0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return (x>>>0)/4294967295;};
  const fresh=()=>({camps:[],activeTreeId:'',activeMiniBossId:'',lastMiniBossDay:-99,caravan:null});
  let state=fresh(),world='',seed=0,savedAt=0;
  const worldId=()=>String(B()?.getWorldId?.()||'');
  const storageKey=()=> 'skyrealm_world_events_v1_'+encodeURIComponent(worldId());
  const say=m=>B()?.toast?.(m);
  const bounds=()=>{const b=B()?.getWorldBounds?.()||{};return {w:Math.max(1600,Number(b.width)||7040),h:Math.max(1200,Number(b.height)||5248)};};
  function persist(force=false){const now=Date.now();if(!force&&now-savedAt<1000)return;try{localStorage.setItem(storageKey(),JSON.stringify(state));savedAt=now;B()?.save?.();}catch(e){console.warn('[SkyRealm world events save]',e);}}
  function makeCamps(){
    const b=bounds(),biome=B()?.getBiomeAt,candidates=[
      [{x:b.w*.24,y:b.h*.34},{x:b.w*.2,y:b.h*.42},{x:b.w*.3,y:b.h*.28}],
      [{x:b.w*.73,y:b.h*.67},{x:b.w*.78,y:b.h*.59},{x:b.w*.68,y:b.h*.73}]
    ];
    return candidates.map((set,i)=>{
      let p=set.find(v=>{const bio=String(biome?.(v.x,v.y)||'forest');return !['water','ocean'].includes(bio);})||set[0];
      return {id:'camp-'+i,x:p.x,y:p.y,chestOpened:false,trapTriggered:false,noteRead:false};
    });
  }
  function load(){
    const id=worldId();if(!id||id===world)return;
    world=id;seed=hash(id);savedAt=0;state=fresh();
    try{
      const raw=JSON.parse(localStorage.getItem(storageKey())||'null');
      if(raw&&typeof raw==='object'){
        state.activeTreeId=typeof raw.activeTreeId==='string'?raw.activeTreeId.slice(0,120):'';
        state.activeMiniBossId=typeof raw.activeMiniBossId==='string'?raw.activeMiniBossId.slice(0,120):'';
        state.lastMiniBossDay=Number.isFinite(raw.lastMiniBossDay)?Math.floor(raw.lastMiniBossDay):-99;
        if(raw.caravan&&Number.isFinite(raw.caravan.day)&&Number.isFinite(raw.caravan.x)&&Number.isFinite(raw.caravan.y))
          state.caravan={day:Math.floor(raw.caravan.day),x:clamp(raw.caravan.x,0,1e7),y:clamp(raw.caravan.y,0,1e7),traded:raw.caravan.traded===true};
        if(Array.isArray(raw.camps))state.camps=raw.camps.filter(c=>c&&typeof c.id==='string'&&Number.isFinite(c.x)&&Number.isFinite(c.y)).slice(0,4).map(c=>({...c,x:clamp(c.x,0,1e7),y:clamp(c.y,0,1e7),chestOpened:c.chestOpened===true,trapTriggered:c.trapTriggered===true,noteRead:c.noteRead===true}));
      }
    }catch(e){console.warn('[SkyRealm world events load]',e);}
    if(!state.camps.length)state.camps=makeCamps();
    persist(true);
  }
  function activeSurface(){
    const b=B();return !!world&&!b?.isBossRealm?.()&&!b?.isTradeWorld?.()&&!b?.isCoopWorld?.()&&!b?.isSpecialWorldMode?.()&&!b?.isCaveMode?.()&&!b?.isMineMode?.()&&!b?.isHouseMode?.()&&!b?.isDungeonMode?.();
  }
  function onTreeChopped(tree){
    if(!activeSurface()||!tree||state.activeTreeId||rnd(seed,Math.floor((Number(tree.x)||0)*.13+(Number(tree.y)||0)*.07))>.22)return false;
    const id='world-treant-'+seed+'-'+Math.floor(Number(tree.x)||0)+'-'+Math.floor(Number(tree.y)||0);
    if(!B()?.spawnForestTreeMonster?.(id,Number(tree.x),Number(tree.y)))return false;
    state.activeTreeId=id;persist(true);say('ДЕРЕВО ПРОБУДИЛОСЬ! Из пня поднялся Древодемон — приготовься к бою.');return true;
  }
  function spawnMiniBoss(day,p){
    const biome=String(B()?.getBiomeAt?.(p.x,p.y)||'forest');
    const type=biome==='snow'?'yeti':biome==='desert'?'ember':'brute';
    const id='world-biome-guardian-'+seed+'-'+day;
    const angle=rnd(seed,day+991)*Math.PI*2,dist=260;
    const x=clamp(p.x+Math.cos(angle)*dist,100,bounds().w-100),y=clamp(p.y+Math.sin(angle)*dist,100,bounds().h-100);
    if(!B()?.spawnForestMiniBoss?.(type,id,x,y))return false;
    state.activeMiniBossId=id;state.lastMiniBossDay=day;persist(true);
    say((type==='yeti'?'ЛЕДЯНОЙ ВЕЛИКАН':type==='ember'?'ПЕПЕЛЬНЫЙ ВОЖДЬ':'СТРАЖ ДРЕВНЕГО ЛЕСА')+' появился в биоме! У него три фазы боя.');
    return true;
  }
  function finishEncounter(id,kind){
    if(!id||Number(B()?.getEventEnemyCount?.(id))!==0)return;
    if(kind==='tree'){
      state.activeTreeId='';
      B()?.addItem?.('Живой корень',1,'Редкий материал из поверженного Древодемона.');
      B()?.addItem?.('Кора древня',2,'Плотная кора ожившего дерева.');
      B()?.addItem?.('Сердцевина древня',1,'Трофей за победу над Древодемоном.');
      say('ДРЕВОДЕМОН ПОВЕРЖЕН! Получены живой корень, кора и сердцевина древня.');
    }else{
      state.activeMiniBossId='';
      B()?.addGold?.(18000);
      B()?.addItem?.('Трофей биомного охотника',1,'Знак победы над редким биомным мини-боссом.');
      B()?.addItem?.('Пыльца древнего леса',2,'Редкий алхимический материал.');
      say('МИНИ-БОСС ПОБЕЖДЁН! +180 золота, трофей охотника и редкая пыльца.');
    }
    persist(true);
  }
  function update(dt){
    if(!worldId())return;if(worldId()!==world)load();
    const b=B(),snap=b?.getChallengeSnapshot?.();if(!snap||snap.paused||!activeSurface())return;
    const day=Math.max(0,Number(snap.day)||0),p=b?.getPlayerPosition?.();
    if(state.activeTreeId&&Number(b?.getEventEnemyCount?.(state.activeTreeId))===0)finishEncounter(state.activeTreeId,'tree');
    if(state.activeMiniBossId&&Number(b?.getEventEnemyCount?.(state.activeMiniBossId))===0)finishEncounter(state.activeMiniBossId,'mini');
    if(!state.activeMiniBossId&&p&&day>=3&&day-state.lastMiniBossDay>=4&&rnd(seed,day+3001)>.48)spawnMiniBoss(day,p);
    if(p&&day%5===2){
      if(!state.caravan||state.caravan.day!==day){
        const a=rnd(seed,day+5501)*Math.PI*2,dist=300;
        state.caravan={day,x:clamp(p.x+Math.cos(a)*dist,100,bounds().w-100),y:clamp(p.y+Math.sin(a)*dist,100,bounds().h-100),traded:false};persist(true);
        say('ТОРГОВЫЙ КАРАВАН! Странствующий торговец остановился неподалёку до конца дня.');
      }
    }
    if(state.caravan&&day>state.caravan.day){state.caravan=null;persist(true);}
  }
  function drawCamp(ctx,x,y,t,camp){
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,20,55,13,0,0,6.28);ctx.fill();
    ctx.fillStyle='#6c4930';ctx.beginPath();ctx.moveTo(-37,10);ctx.lineTo(-12,-23);ctx.lineTo(20,10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#b17b49';ctx.beginPath();ctx.moveTo(-12,-23);ctx.lineTo(20,10);ctx.lineTo(37,10);ctx.lineTo(8,-24);ctx.closePath();ctx.fill();
    ctx.fillStyle='#1b1d24';ctx.fillRect(-7,-2,15,13);
    ctx.fillStyle='#6b432a';ctx.fillRect(25,7,22,14);ctx.fillStyle=camp.chestOpened?'#4c3a2b':'#b88943';ctx.fillRect(23,3,26,7);
    if(!camp.chestOpened){ctx.fillStyle='#ffe18a';ctx.fillRect(34,5,4,5);}
    if(!camp.trapTriggered){ctx.strokeStyle='#d66b67';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-36,15,10+Math.sin(t/120)*2,0,6.28);ctx.stroke();}
    ctx.fillStyle='#d7e3d2';ctx.font='900 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ЗАБРОШЕННЫЙ ЛАГЕРЬ',0,-34);
    ctx.fillStyle='#f4d69d';ctx.font='8px Segoe UI';ctx.fillText(camp.chestOpened?'СУНДУК ПУСТ':'СУНДУК · E',35,31);
    ctx.restore();
  }
  function drawCaravan(ctx,x,y,t){
    ctx.save();ctx.translate(x,y);ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(0,19,48,10,0,0,6.28);ctx.fill();
    ctx.fillStyle='#70482c';ctx.fillRect(-27,-4,48,18);ctx.fillStyle='#9c6538';ctx.fillRect(-30,-10,54,9);
    ctx.strokeStyle='#d9b06c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(-16,17,8,0,6.28);ctx.arc(13,17,8,0,6.28);ctx.stroke();
    ctx.fillStyle='#b35e42';ctx.beginPath();ctx.moveTo(-18,-11);ctx.lineTo(-12,-34);ctx.lineTo(11,-34);ctx.lineTo(18,-11);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e7c58b';ctx.fillRect(-9,-30,14,17);ctx.fillStyle='#ffe39b';ctx.beginPath();ctx.arc(0,-41,5+Math.sin(t/180),0,6.28);ctx.fill();
    ctx.fillStyle='#fff0d1';ctx.font='900 9px Segoe UI';ctx.textAlign='center';ctx.fillText('ТОРГОВЕЦ · E',0,-51);ctx.restore();
  }
  function draw(ctx,cx,cy,t,w,h){
    if(!ctx||!worldId())return;if(worldId()!==world)load();if(!activeSurface())return;
    for(const camp of state.camps){const x=camp.x-cx,y=camp.y-cy;if(x>-100&&x<w+100&&y>-90&&y<h+90)drawCamp(ctx,x,y,t,camp);}
    if(state.caravan){const x=state.caravan.x-cx,y=state.caravan.y-cy;if(x>-100&&x<w+100&&y>-90&&y<h+90)drawCaravan(ctx,x,y,t);}
    for(const [id,label,color] of [[state.activeTreeId,'ДРЕВОДЕМОН','#a8df72'],[state.activeMiniBossId,'МИНИ-БОСС','#f5a66b']]){
      if(!id)continue;const m=B()?.getEventEnemySnapshot?.(id);if(!m)continue;const x=m.x-cx,y=m.y-cy;
      if(x<-100||x>w+100||y<-100||y>h+100)continue;
      ctx.save();ctx.fillStyle='#10151d';ctx.fillRect(x-31,y-55,62,5);ctx.fillStyle=color;ctx.fillRect(x-31,y-55,62*clamp(m.hp/Math.max(1,m.maxHp),0,1),5);
      ctx.fillStyle='#fff2d8';ctx.font='900 9px Segoe UI';ctx.textAlign='center';ctx.fillText(label+(id===state.activeMiniBossId?' · ФАЗА '+(m.phase||1):''),x,y-62);ctx.restore();
    }
  }
  function interact(){
    if(!worldId())return false;if(worldId()!==world)load();if(!activeSurface())return false;
    const p=B()?.getPlayerPosition?.();if(!p)return false;
    const camp=state.camps.map(c=>({c,d:Math.hypot(p.x-c.x,p.y-c.y)})).filter(v=>v.d<92).sort((a,b)=>a.d-b.d)[0]?.c;
    if(camp){
      const dx=p.x-camp.x,dy=p.y-camp.y;
      if(Math.hypot(dx+36,dy-15)<42&&!camp.trapTriggered){
        camp.trapTriggered=true;
        if(B()?.spendItem?.('Листья',2))say('ЛОВУШКА ОБЕЗВРЕЖЕНА! Ты потратил 2 листа и избежал урона.');
        else{B()?.damagePlayer?.(14);say('ЛОВУШКА СРАБОТАЛА! Потеряно 14 здоровья. Для обезвреживания нужны 2 листа.');}
        persist(true);return true;
      }
      if(Math.hypot(dx-36,dy-10)<52){
        if(camp.chestOpened){say('Сундук лагеря уже открыт и пуст.');return true;}
        camp.chestOpened=true;B()?.addGold?.(4500);B()?.addItem?.('Ключ древнего лагеря',1,'Редкая находка из сундука заброшенного лагеря.');B()?.addItem?.('Кора древня',2);
        persist(true);say('СУНДУК НАЙДЕН! +45 золота, ключ древнего лагеря и кора древня.');return true;
      }
      if(!camp.noteRead){camp.noteRead=true;B()?.addItem?.('Записка разведчика',1,'Старая записка с подсказкой о биомных стражах.');persist(true);say('ЗАПИСКА: «Не руби деревья в одиночестве. Иногда лес отвечает». Получена записка разведчика.');return true;}
      say('Лагерь давно покинут. Здесь больше ничего не осталось.');return true;
    }
    if(state.caravan&&Math.hypot(p.x-state.caravan.x,p.y-state.caravan.y)<92){
      if(state.caravan.traded){say('Торговец уже обменял с тобой товар сегодня. Загляни к нему через пять дней.');return true;}
      if((B()?.getItemCount?.('Древесина')||0)<6||(B()?.getItemCount?.('Железо')||0)<3){say('Обмен: 6 древесины и 3 железа за 1 эликсир корневой ярости и 2 пыльцы древнего леса.');return true;}
      if(!B()?.spendItem?.('Древесина',6)||!B()?.spendItem?.('Железо',3)){say('Не удалось провести обмен.');return true;}
      B()?.addItem?.('Эликсир корневой ярости',1,'Редкий товар странствующего торговца.');B()?.addItem?.('Пыльца древнего леса',2);state.caravan.traded=true;persist(true);say('ОБМЕН СОСТОЯЛСЯ! Получены эликсир корневой ярости и 2 пыльцы.');return true;
    }
    return false;
  }
  window.SkyRealmWorldEvents=Object.freeze({update,draw,interact,onTreeChopped,getState:()=>JSON.parse(JSON.stringify(state))});
})();