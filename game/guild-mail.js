(()=>{'use strict';
  const VERSION=1,KEY='skyrealm:guild-mail:v1:',$=id=>document.getElementById(id);
  const bridge=()=>window.SkyRealmSeaBridge||window.SkyRealmGameBridge||null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TASKS=[
    {id:'hunter',name:'Зачистка тропы',profession:'hunter',goal:3,desc:'Победи 3 противников в обычном мире.',reward:85,xp:30},
    {id:'miner',name:'Камень для стен',profession:'miner',goal:5,desc:'Добудь 5 единиц руды или камня.',reward:75,xp:25},
    {id:'lumberjack',name:'Запас досок',profession:'lumberjack',goal:6,desc:'Заготовь 6 единиц древесины.',reward:70,xp:25},
    {id:'builder',name:'Помощь поселенцам',profession:'builder',goal:2,desc:'Размести или построй 2 объекта.',reward:95,xp:35},
    {id:'fisherman',name:'Улов к ужину',profession:'fisherman',goal:3,desc:'Поймай 3 рыбы.',reward:80,xp:30},
    {id:'explorer',name:'Разведка окрестностей',profession:'explorer',goal:5,desc:'Исследуй 5 новых участков.',reward:105,xp:40}
  ];
  const LETTERS=[
    {from:'Эйрин · Наставник гильдии',subject:'Добро пожаловать, искатель!',body:'Рада видеть тебя в наших краях. У почтового ящика будут появляться новые письма и поручения каждый игровой день. Некоторые просьбы приходят от жителей, другие — от разведчиков и хранителей.'},
    {from:'Мира · Следопыт',subject:'Следы у старого леса',body:'На северной тропе снова замечены странные следы. Я отметила опасный участок на карте. Помоги нам проверить окрестности и возвращайся с новостями.'},
    {from:'Тор · Хранитель припасов',subject:'Нужны материалы для мастерской',body:'Запасы быстро заканчиваются. Если найдёшь время, помоги пополнить склад. За работу я подготовил достойную плату.'},
    {from:'Капитан городской стражи',subject:'Тревога на дороге',body:'Торговцы сообщают о нападениях на тракте. Не рискуй без подготовки, но если встретишь угрозу — останови её. За помощь стража заплатит.'},
    {from:'Королевский архивариус',subject:'Сведения о древних руинах',body:'В старых записях упоминается забытый путь. Нам нужны свежие сведения о местности и ресурсах. Любая находка может оказаться важной.'},
    {from:'Эйрин · Наставник гильдии',subject:'Небольшое поручение на сегодня',body:'Даже небольшие дела укрепляют гильдию. Выбери задачу во вложении и не забудь забрать награду после выполнения.'},
    {from:'Мира · Следопыт',subject:'У воды замечено движение',body:'У берега видели редкую добычу. Проверь слухи, но будь внимателен: погода и местность могут быстро измениться.'},
    {from:'Тор · Хранитель припасов',subject:'Благодарность за прошлую помощь',body:'Твои прошлые дела не остались незамеченными. Сегодня у меня новое задание — выполни его, и склад снова будет в порядке.'}
  ];
  const fresh=()=>({version:VERSION,day:-1,letters:[]});
  let state=fresh(),worldId='',root=null,opened=false,selected='',wrapped=null;
  function dayNow(){return Math.max(0,Math.floor(Number(bridge()?.getGameDay?.())||0));}
  function save(){try{if(worldId)localStorage.setItem(KEY+worldId,JSON.stringify(state));bridge()?.save?.();}catch(e){console.warn('[SkyRealm mail save]',e);}}
  function cleanLetter(x){
    if(!x||typeof x.id!=='string'||!Number.isFinite(Number(x.day)))return null;
    const task=TASKS.find(t=>t.id===x.task?.id);
    return {id:x.id.slice(0,80),day:Math.max(0,Math.floor(Number(x.day))),from:String(x.from||'Почтовая служба').slice(0,90),subject:String(x.subject||'Письмо').slice(0,100),body:String(x.body||'').slice(0,1400),read:!!x.read,task:task?{id:task.id,accepted:!!x.task.accepted,progress:clamp(Math.floor(Number(x.task.progress)||0),0,task.goal),claimed:!!x.task.claimed}:null};
  }
  function load(){
    const id=String(bridge()?.getWorldId?.()||bridge()?.getChallengeSnapshot?.()?.worldId||'');if(!id||id===worldId)return;
    worldId=id;state=fresh();
    try{const raw=JSON.parse(localStorage.getItem(KEY+id)||'null');if(raw&&raw.version<=VERSION&&Array.isArray(raw.letters))state={version:VERSION,day:Math.max(-1,Math.floor(Number(raw.day)||-1)),letters:raw.letters.map(cleanLetter).filter(Boolean).slice(-45)};}catch(e){console.warn('[SkyRealm mail load]',e);}
    ensureDay();save();
  }
  function ensureDay(){
    const day=dayNow();if(state.day===day&&state.letters.some(x=>x.day===day))return;
    const letter=LETTERS[day%LETTERS.length],task=TASKS[(day*5+Math.floor(day/3))%TASKS.length];
    state.day=day;state.letters.push({id:'day-'+day,day,from:letter.from,subject:letter.subject,body:letter.body,read:false,task:{id:task.id,accepted:false,progress:0,claimed:false}});
    state.letters=state.letters.slice(-45);save();
  }
  function currentQuest(letter){return letter?.task?TASKS.find(t=>t.id===letter.task.id):null;}
  function wrapProgress(){
    const b=bridge();if(!b||typeof b.recordProfession!=='function'||b.recordProfession.__guildMailWrapped)return;
    const original=b.recordProfession;
    const wrapped=function(id,amount=1){const result=original.call(this,id,amount);if(result!==false){const key=String(id||'').toLowerCase(),n=Math.max(0,Math.floor(Number(amount)||0));let changed=false;for(const mail of state.letters){const q=currentQuest(mail);if(q&&mail.task.accepted&&!mail.task.claimed&&mail.day===dayNow()&&q.profession===key){mail.task.progress=clamp(mail.task.progress+n,0,q.goal);changed=true;}}if(changed){save();if(opened)render();}}return result;};
    wrapped.__guildMailWrapped=true;b.recordProfession=wrapped;wrapped.__original=original;wrappedProgress=wrapped;
  }
  let wrappedProgress=null;
  function open(){
    if(!worldId)load();if(!worldId)return;
    ensureDay();wrapProgress();ensureUI();opened=true;root.hidden=false;
    const latest=state.letters.slice().reverse().find(x=>!x.read)||state.letters[state.letters.length-1];selected=latest?.id||'';
    bridge()?.pause?.();render();
  }
  function close(){if(!opened)return;opened=false;if(root)root.hidden=true;bridge()?.resume?.();}
  function markRead(id){const m=state.letters.find(x=>x.id===id);if(!m)return;m.read=true;selected=id;save();render();}
  function accept(id){const m=state.letters.find(x=>x.id===id),q=currentQuest(m);if(!m||!q||m.task.accepted||m.task.claimed)return;m.task.accepted=true;save();render();}
  function claim(id){
    const m=state.letters.find(x=>x.id===id),q=currentQuest(m);if(!m||!q||!m.task.accepted||m.task.claimed||m.task.progress<q.goal)return;
    m.task.claimed=true;bridge()?.addGold?.(q.reward*100);if(typeof bridge()?.awardXP==='function')bridge().awardXP(q.xp,'почтовое поручение');else bridge()?.addXP?.(q.xp);save();render();
  }
  function render(){
    if(!root||root.hidden)return;
    const letters=state.letters.slice().sort((a,b)=>b.day-a.day);
    const active=letters.find(x=>x.id===selected)||letters[0]||null;
    const list=letters.length?letters.map(m=>'<button class="gm-letter '+(m.id===active?.id?'selected ':'')+(!m.read?'unread':'')+'" data-gm="open" data-id="'+esc(m.id)+'"><span class="gm-envelope">✉</span><span class="gm-letter-copy"><b>'+esc(m.subject)+'</b><small>'+esc(m.from)+' · день '+(m.day+1)+'</small></span><i>'+(m.read?'':'●')+'</i></button>').join(''):'<div class="gm-empty"><span>✉</span><b>Почта пуста</b><small>Новых писем пока нет. Загляни сюда в следующий игровой день.</small></div>';
    let detail='<div class="gm-empty gm-empty-detail"><span>📭</span><b>Выбери письмо</b><small>Все сообщения будут храниться здесь.</small></div>';
    if(active){
      const q=currentQuest(active),task= q?'<section class="gm-task"><div class="gm-task-head"><span>📜 ПОРУЧЕНИЕ ИЗ ПИСЬМА</span><b>Награда: '+q.reward+' золота</b></div><h3>'+esc(q.name)+'</h3><p>'+esc(q.desc)+'</p><div class="gm-progress"><i style="width:'+Math.round(active.task.progress/q.goal*100)+'%"></i></div><small>'+active.task.progress+' / '+q.goal+' · '+(active.task.claimed?'Выполнено и оплачено':active.task.accepted?'Поручение принято': 'Ожидает принятия')+'</small><button data-gm="'+(active.task.claimed?'done':!active.task.accepted?'accept':'claim')+'" data-id="'+esc(active.id)+'" '+(active.task.accepted&&active.task.progress<q.goal||active.task.claimed?'disabled':'')+'>'+(active.task.claimed?'Награда получена':!active.task.accepted?'Принять поручение':active.task.progress>=q.goal?'Забрать награду':'Выполняется')+'</button></section>':'';
      detail='<article class="gm-reading"><div class="gm-paper-top"><span>SKYREALM · ПОЧТОВАЯ СЛУЖБА</span><b>№ '+String(active.day+1).padStart(3,'0')+'</b></div><small>ОТ: '+esc(active.from)+'</small><h2>'+esc(active.subject)+'</h2><p>'+esc(active.body)+'</p><div class="gm-sign">С уважением,<br><b>Почта королевства</b></div>'+task+'</article>';
    }
    root.innerHTML='<div class="gm-shade"><section class="gm-window" role="dialog" aria-modal="true" aria-label="Почта гильдии"><header><div><small>ПОЧТОВАЯ СЛУЖБА · ГИЛЬДИЯ</small><h1>Почта</h1><p>Игровой день '+(dayNow()+1)+' · '+letters.length+' писем</p></div><button class="gm-close" data-gm="close" aria-label="Закрыть">×</button></header><div class="gm-body"><aside class="gm-inbox"><div class="gm-inbox-title">ВХОДЯЩИЕ <span>'+letters.filter(x=>!x.read).length+' новых</span></div>'+list+'</aside><main class="gm-content">'+detail+'</main></div><footer><span>✦ Письма и поручения сохраняются отдельно для каждого мира</span><button data-gm="close">Закрыть почту</button></footer></section></div>';
  }
  function ensureUI(){
    if($('skyrealm-guild-mail'))return;
    const style=document.createElement('style');
    style.textContent='#skyrealm-guild-mail{position:fixed;inset:0;z-index:10060;font:14px Segoe UI,Arial,sans-serif;color:#e9e2d3}#skyrealm-guild-mail[hidden]{display:none}.gm-shade{position:absolute;inset:0;display:grid;place-items:center;padding:18px;background:rgba(4,9,16,.82);backdrop-filter:blur(7px)}.gm-window{width:min(900px,100%);height:min(650px,88vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid #b58b53;border-radius:15px;background:linear-gradient(145deg,#28303a,#141c27 58%,#101722);box-shadow:0 24px 90px #000c,inset 0 0 0 3px #d7b87b12}.gm-window header{display:flex;justify-content:space-between;align-items:center;padding:18px 23px;background:linear-gradient(90deg,#47372d,#29303a 65%,#1b2735);border-bottom:1px solid #b58b5366}.gm-window header small{font-size:9px;letter-spacing:2px;color:#dfbf83;font-weight:900}.gm-window h1{font-family:Georgia,serif;font-size:27px;margin:4px 0;color:#f2dfb7}.gm-window header p{margin:0;color:#b8bdc3;font-size:11px}.gm-close{width:36px;height:36px;border:1px solid #8f7656;border-radius:8px;background:#182331;color:#f2dfb7;font-size:25px;cursor:pointer}.gm-body{display:grid;grid-template-columns:300px 1fr;gap:0;min-height:0;flex:1}.gm-inbox{overflow:auto;padding:14px;background:linear-gradient(180deg,#1d2936,#151f2b);border-right:1px solid #ffffff16}.gm-inbox-title{display:flex;justify-content:space-between;margin:2px 4px 11px;color:#e3c58e;font-size:10px;font-weight:900;letter-spacing:1.5px}.gm-inbox-title span{color:#8fb5c6;letter-spacing:0}.gm-letter{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:11px 9px;margin:5px 0;border:1px solid #6c675a66;border-radius:9px;background:linear-gradient(120deg,#34404a,#242f3a);color:#eee2cd;cursor:pointer}.gm-letter.selected{border-color:#d5ad6d;background:linear-gradient(120deg,#594833,#303946);box-shadow:inset 3px 0 #e3bd79}.gm-letter.unread b:after{content:" НОВОЕ";font-size:8px;color:#f0c777}.gm-letter .gm-envelope{font-size:22px;color:#e6c58b}.gm-letter-copy{display:grid;gap:4px;min-width:0;flex:1}.gm-letter-copy b{font-size:11px;white-space:normal}.gm-letter-copy small{font-size:9px;color:#b7c0c6}.gm-letter>i{font-size:9px;color:#f0c777}.gm-content{overflow:auto;padding:22px;background:radial-gradient(ellipse at top,#6a543322,transparent 55%)}.gm-reading{min-height:100%;padding:22px 25px;border:1px solid #b99a6b66;border-radius:7px;background:linear-gradient(145deg,#e8d8b8,#cbb995);color:#443a2e;box-shadow:0 7px 20px #0005;position:relative}.gm-paper-top{display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid #806b4d66;color:#8b6840;font-size:9px;letter-spacing:1px;font-weight:900}.gm-reading>small{display:block;margin-top:18px;color:#826b4e;font-size:9px;font-weight:800}.gm-reading h2{font: bold 23px Georgia,serif;color:#443629;margin:9px 0 17px}.gm-reading>p{font:15px/1.8 Georgia,serif;white-space:pre-wrap}.gm-sign{margin:25px 0;color:#6c5840;font:italic 13px/1.6 Georgia,serif}.gm-task{padding:14px;border:1px solid #8e704c88;border-radius:8px;background:#bca77e55}.gm-task-head{display:flex;justify-content:space-between;gap:10px;color:#725635;font-size:8px;font-weight:900;letter-spacing:.5px}.gm-task h3{font: bold 17px Georgia,serif;margin:9px 0 4px}.gm-task p{font-size:11px;line-height:1.5;margin:5px 0}.gm-progress{height:8px;margin:10px 0 5px;background:#88785f66;border-radius:9px;overflow:hidden}.gm-progress i{display:block;height:100%;background:linear-gradient(90deg,#598b77,#c5a25f)}.gm-task>small{font-size:10px;color:#705c42}.gm-task button,.gm-window footer button{display:block;margin-top:10px;padding:9px 15px;border:1px solid #a9824e;border-radius:7px;background:linear-gradient(120deg,#725238,#a17a4c);color:#fff1d6;font-weight:800;cursor:pointer}.gm-task button:disabled{opacity:.55;cursor:default}.gm-empty{height:100%;min-height:230px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:25px;color:#b7c2c8}.gm-empty>span{font-size:42px;color:#d1b27b;margin-bottom:10px}.gm-empty b{font: bold 19px Georgia,serif;color:#ead8b4}.gm-empty small{max-width:240px;margin-top:8px;line-height:1.6;color:#9caeb9}.gm-empty-detail{opacity:.8}.gm-window footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 17px;background:#111a25;border-top:1px solid #ffffff18}.gm-window footer span{font-size:9px;color:#9baab2}.gm-window footer button{margin:0;padding:7px 12px;font-size:10px}@media(max-width:650px){.gm-shade{padding:6px}.gm-window{height:94vh}.gm-body{grid-template-columns:1fr;grid-template-rows:185px 1fr}.gm-inbox{border-right:0;border-bottom:1px solid #ffffff18}.gm-content{padding:12px}.gm-reading{padding:15px}.gm-window footer span{display:none}.gm-window h1{font-size:22px}}';
    document.head.appendChild(style);root=document.createElement('section');root.id='skyrealm-guild-mail';root.hidden=true;root.addEventListener('click',event=>{const el=event.target?.closest?.('[data-gm]');if(!el)return;const action=el.dataset.gm,id=el.dataset.id||'';if(action==='close')close();else if(action==='open')markRead(id);else if(action==='accept')accept(id);else if(action==='claim')claim(id);else if(action==='done'){}});
    document.body.appendChild(root);document.addEventListener('keydown',event=>{if(opened&&event.key==='Escape'){event.preventDefault();close();}},true);
  }
  function postboxPosition(house){return {x:house.x-151,y:house.y+31};}
  function draw(ctx,house,camX=0,camY=0,time=0){
    if(!house)return;const p=postboxPosition(house),x=p.x-camX,y=p.y-camY;if(x<-60||x>innerWidth+60||y<-80||y>innerHeight+50)return;
    const glow=.65+.25*Math.sin(time/420);ctx.save();ctx.translate(Math.round(x),Math.round(y));
    ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(0,9,28,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#59402b';ctx.fillRect(-15,-3,5,18);ctx.fillRect(10,-3,5,18);
    const wood=ctx.createLinearGradient(-18,-40,18,0);wood.addColorStop(0,'#b47b45');wood.addColorStop(.45,'#81502f');wood.addColorStop(1,'#573a2b');ctx.fillStyle=wood;ctx.fillRect(-20,-42,40,44);
    ctx.strokeStyle='#d5ad6c';ctx.lineWidth=2;ctx.strokeRect(-19,-41,38,41);
    for(let yy=-34;yy<0;yy+=9){ctx.strokeStyle='#3d2a22';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-17,yy);ctx.lineTo(17,yy);ctx.stroke();ctx.strokeStyle='#d09b5d';ctx.beginPath();ctx.moveTo(-16,yy+2);ctx.lineTo(16,yy+2);ctx.stroke();}
    const lid=ctx.createLinearGradient(0,-57,0,-39);lid.addColorStop(0,'#6c3540');lid.addColorStop(.55,'#a84d4d');lid.addColorStop(1,'#613440');ctx.fillStyle=lid;ctx.beginPath();ctx.moveTo(-24,-40);ctx.lineTo(-17,-55);ctx.lineTo(17,-55);ctx.lineTo(24,-40);ctx.closePath();ctx.fill();ctx.strokeStyle='#e4bf7b';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#e8d6ac';ctx.fillRect(-12,-31,24,4);ctx.fillStyle='#352d2b';ctx.fillRect(-9,-30,18,2);
    ctx.fillStyle='#d6b36e';ctx.beginPath();ctx.arc(0,-18,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#70472d';ctx.font='bold 9px Georgia';ctx.textAlign='center';ctx.fillText('✉',0,-15);
    ctx.fillStyle='#e5c783';ctx.fillRect(14,-49,3,15);ctx.fillStyle='#a9c4cc';ctx.beginPath();ctx.moveTo(17,-48);ctx.lineTo(28,-45);ctx.lineTo(17,-39);ctx.closePath();ctx.fill();
    ctx.fillStyle='#f4d27e';ctx.shadowColor='#f4c66e';ctx.shadowBlur=9*glow;ctx.beginPath();ctx.arc(-16,-42,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    const unread=state.letters.some(m=>!m.read);if(unread){ctx.fillStyle='#c84d45';ctx.beginPath();ctx.arc(18,-52,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff2d8';ctx.font='bold 7px Arial';ctx.fillText('!',18,-49);}
    ctx.fillStyle='#f0d9aa';ctx.font='bold 9px Segoe UI';ctx.fillText('E · ПОЧТА',0,30);ctx.restore();
  }
  function interact(house,pos){
    if(!house||!pos)return false;const p=postboxPosition(house);if(Math.hypot(pos.x-p.x,pos.y-p.y)>58)return false;open();return true;
  }
  function boot(){
    ensureUI();const refresh=()=>{const id=String(bridge()?.getWorldId?.()||bridge()?.getChallengeSnapshot?.()?.worldId||'');if(id&&id!==worldId)load();if(worldId){ensureDay();wrapProgress();}};refresh();window.setInterval(refresh,1000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});window.addEventListener('beforeunload',save);
  }
  window.SkyRealmGuildMail=Object.freeze({open,close,draw,interact,getState:()=>JSON.parse(JSON.stringify(state)),getPostboxPosition:postboxPosition});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();