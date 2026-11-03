(() => {
  'use strict';
  const bridge=()=>window.SkyRealmSeaBridge;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let state=null,lastWorld='',lastSnapshot=null,uiReady=false;
  const timedDefs=[
    {id:'wood',title:'Лесной сбор',desc:'Собери 8 древесины и 5 камня',seconds:180,items:{'Древесина':8,'Камень':5},gold:1200,reward:{'Малое зелье':1}},
    {id:'iron',title:'Рудная гонка',desc:'Добудь 4 железа и 2 угля',seconds:240,items:{'Железо':4,'Уголь':2},gold:1800,reward:{'Зелье скорости':1}},
    {id:'herb',title:'Алхимик на время',desc:'Найди 4 лечебные травы и 2 кристалла',seconds:300,items:{'Лечебная трава':4,'Кристалл':2},gold:2200,reward:{'Малое зелье':2}}
  ];
  const campaign=[
    {title:'I. Подготовка к походу',desc:'Собери 12 древесины и 8 камня',check:s=>count(s,'Древесина')>=12&&count(s,'Камень')>=8,reward:1500,item:'Малое зелье'},
    {title:'II. Следопыт',desc:'Достигни 4 уровня и исследуй 5% карты',check:s=>s.level>=4&&s.exploredCells/Math.max(1,s.totalCells)>=.05,reward:2500,item:'Зелье скорости'},
    {title:'III. Закалённый герой',desc:'Переживи 3 ночи и собери 5 железа',check:s=>s.survivedNights>=3&&count(s,'Железо')>=5,reward:3500,item:'Настой силы'},
    {title:'IV. Страж долины',desc:'Победи босса биома и босса пещеры',check:s=>Object.values(s.biomeBosses||{}).some(Boolean)&&s.caveBossDefeated,reward:5000,item:'Зелье защиты'},
    {title:'V. Сердце древних руин',desc:'Очисти все 5 комнат руин и открой сундук Архонта',check:s=>(s.dungeonClearedRooms||[]).length>=5&&s.dungeonChestOpened,reward:12000,item:'Малое зелье',final:true}
  ];
  function count(s,n){return Math.max(0,Number(s?.items?.[n])||0);}
  function storageKey(id){return 'skyrealm_challenge_v1_'+id;}
  function load(id){try{const v=JSON.parse(localStorage.getItem(storageKey(id))||'null');return v&&typeof v==='object'?v:{stage:0,timed:null,claimed:[]};}catch(_){return {stage:0,timed:null,claimed:[]};}}
  function save(){if(!state||!lastWorld)return;try{localStorage.setItem(storageKey(lastWorld),JSON.stringify(state));}catch(e){console.warn('[SkyRealm challenge save]',e);}}
  function reward(gold,item,amount=1){const b=bridge();b?.addGold?.(gold*100);if(item)b?.addItem?.(item,amount,'Награда за испытание');b?.save?.();}
  function ensureUI(){
    if(uiReady)return;
    const style=document.createElement('style');style.textContent=
      '.challenge-launch{position:fixed;right:18px;top:125px;z-index:21;border:1px solid #d6b56c;border-radius:11px;padding:9px 13px;background:linear-gradient(135deg,#5b4424,#1e2d42);color:#fff0c5;font:800 11px Segoe UI;cursor:pointer;box-shadow:0 8px 24px #0006}.challenge-panel{position:fixed;right:18px;top:170px;z-index:44;width:min(390px,calc(100vw - 28px));max-height:72vh;overflow:auto;padding:17px;border:1px solid #987c4d;border-radius:15px;background:linear-gradient(145deg,#14253a,#081321);color:#edf3ff;box-shadow:0 22px 70px #000b;font:12px Segoe UI}.challenge-panel h2{margin:0 0 5px;font-size:18px;color:#ffe2a2}.challenge-panel p{margin:5px 0 12px;color:#a9bad3;line-height:1.5}.challenge-card{margin:9px 0;padding:11px;border:1px solid #344b68;border-radius:10px;background:#0d1b2d}.challenge-card b{display:block;color:#f4e3bd;margin-bottom:5px}.challenge-card small{display:block;color:#9eb2d0;line-height:1.5}.challenge-progress{height:6px;margin-top:8px;border-radius:8px;background:#263a50;overflow:hidden}.challenge-progress i{display:block;height:100%;background:linear-gradient(90deg,#b78b45,#f3d58e)}.challenge-actions{display:flex;gap:7px;margin-top:9px}.challenge-actions button{flex:1;border:1px solid #536b8a;border-radius:8px;padding:8px;background:#172b43;color:#eaf2ff;font:700 10px Segoe UI;cursor:pointer}.challenge-actions button:disabled{opacity:.4;cursor:default}.challenge-close{width:100%;margin-top:9px;padding:9px;border:1px solid #536b8a;border-radius:8px;background:#101f32;color:#dbe8ff;cursor:pointer}.challenge-launch[hidden],.challenge-panel[hidden]{display:none!important}@media(max-width:600px){.challenge-launch{top:112px;right:9px}.challenge-panel{right:9px;top:153px}}';
    document.head.appendChild(style);
    const button=document.createElement('button');button.className='challenge-launch';button.id='challenge-launch';button.type='button';button.textContent='🏆 Челлендж';button.hidden=true;button.addEventListener('click',openPanel);document.body.appendChild(button);
    const panel=document.createElement('section');panel.className='challenge-panel';panel.id='challenge-panel';panel.hidden=true;panel.innerHTML='<h2>🏆 Испытания SkyRealm</h2><p>Выполняй задания на время и пройди большую миссию из пяти этапов. Прогресс сохраняется отдельно в каждом мире.</p><div id="challenge-content"></div><button class="challenge-close" id="challenge-close" type="button">Закрыть</button>';document.body.appendChild(panel);
    $('challenge-close').addEventListener('click',()=>panel.hidden=true);
    uiReady=true;
  }
  function timedProgress(s,t){return Object.entries(t.items).reduce((sum,[name,need])=>sum+Math.min(need,Math.max(0,count(s,name)-(t.baseline[name]||0))),0);}
  function timedTarget(t){return Object.values(t.items).reduce((a,b)=>a+b,0);}
  function startTimed(id){
    const def=timedDefs.find(v=>v.id===id);if(!def||!lastSnapshot)return;
    state.timed={id,startMinute:lastSnapshot.gameMinuteTotal,baseline:Object.fromEntries(Object.keys(def.items).map(n=>[n,count(lastSnapshot,n)]))};save();render();
  }
  function render(){
    const root=$('challenge-content');if(!root||!state||!lastSnapshot)return;
    const stage=Math.min(state.stage,campaign.length),mission=campaign[stage];
    const missionHtml=mission?(()=>{const done=mission.check(lastSnapshot);return '<div class="challenge-card"><b>'+esc(mission.title)+'</b><small>'+esc(mission.desc)+'</small><small>Этап '+(stage+1)+' из '+campaign.length+(done?' · выполнено!':' · в процессе')+'</small><div class="challenge-progress"><i style="width:'+(done?100:Math.min(92,Math.max(8,stage*17+12)))+'%"></i></div></div>';})():'<div class="challenge-card"><b>Миссия пройдена!</b><small>Ты завершил всю цепочку испытаний SkyRealm.</small></div>';
    const t=state.timed,def=t&&timedDefs.find(v=>v.id===t.id);
    const timedHtml=def?(()=>{const elapsed=Math.max(0,(lastSnapshot.gameMinuteTotal-t.startMinute)/60),left=Math.max(0,def.seconds-elapsed),progress=timedProgress(lastSnapshot,{...def,baseline:t.baseline}),done=progress>=timedTarget(def);return '<div class="challenge-card"><b>⏱ '+esc(def.title)+'</b><small>'+esc(def.desc)+'</small><small>Осталось: '+Math.ceil(left)+' сек. · '+progress+'/'+timedTarget(def)+'</small><div class="challenge-progress"><i style="width:'+Math.min(100,progress/timedTarget(def)*100)+'%"></i></div>'+(done?'<small>Испытание выполнено! Награда выдана.</small>':left<=0?'<small>Время вышло. Запусти новое испытание.</small>':'')+'</div>';})():'<div class="challenge-card"><b>Испытание на время</b><small>Выбери одно задание. Пока оно активно, другое начать нельзя.</small><div class="challenge-actions">'+timedDefs.map(v=>'<button type="button" data-challenge-start="'+v.id+'">'+esc(v.title)+' · '+Math.ceil(v.seconds/60)+' мин.</button>').join('')+'</div></div>';
    root.innerHTML='<div class="challenge-card"><b>Большая миссия</b><small>Награды за этапы: золото, зелья и редкие припасы.</small></div>'+missionHtml+timedHtml;
    root.querySelectorAll('[data-challenge-start]').forEach(b=>b.addEventListener('click',()=>startTimed(b.dataset.challengeStart)));
  }
  function openPanel(){const p=$('challenge-panel');if(p){p.hidden=false;render();}}
  function update(){
    const s=bridge()?.getChallengeSnapshot?.();if(!s?.worldId)return;
    const active=s.difficulty==='challenge'&&!s.paused;
    ensureUI();$('challenge-launch').hidden=s.difficulty!=='challenge';
    if(s.worldId!==lastWorld){lastWorld=s.worldId;state=load(lastWorld);}
    lastSnapshot=s;
    if(!active){if(!$('challenge-panel').hidden)render();return;}
    if(state.timed){
      const def=timedDefs.find(v=>v.id===state.timed.id);
      if(def){
        const elapsed=Math.max(0,(s.gameMinuteTotal-state.timed.startMinute)/60);
        if(timedProgress(s,{...def,baseline:state.timed.baseline})>=timedTarget(def)){
          reward(def.gold,Object.keys(def.reward)[0],Object.values(def.reward)[0]);state.timed=null;save();bridge()?.toast?.('Испытание выполнено! Награда получена.');
        }else if(elapsed>=def.seconds){state.timed=null;save();bridge()?.toast?.('Время испытания истекло. Попробуй ещё раз.');}
      }else state.timed=null;
    }
    if(state.stage<campaign.length&&campaign[state.stage].check(s)){
      const done=campaign[state.stage];reward(done.reward,done.item,done.final?3:1);state.stage++;save();
      bridge()?.toast?.(done.final?'ГЛАВНАЯ МИССИЯ ПРОЙДЕНА! Большая награда получена.':'Этап миссии завершён: '+done.title);
    }
    if(!$('challenge-panel').hidden)render();
  }
  function boot(){ensureUI();window.setInterval(update,500);update();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();