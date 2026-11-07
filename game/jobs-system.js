(() => {
  'use strict';
  const STORAGE_KEY='skyrealm_professions_v1',MAX_LEVEL=10;
  const JOBS={
    lumberjack:{title:'Лесоруб',icon:'🪓',subtitle:'Руби деревья и заготавливай древесину.',action:'Сруби деревья',goal:l=>4+Math.min(8,Math.floor((l-1)*.7)),gold:l=>28+l*9,xp:l=>42+l*13,actionXp:4,item:'Палка',itemCount:2},
    miner:{title:'Рудокоп',icon:'⛏️',subtitle:'Работай в шахте, карьере и добывай редкие жилы.',action:'Добудь залежи',goal:l=>7+Math.min(14,Math.floor(l*1.2)),gold:l=>38+l*11,xp:l=>48+l*14,actionXp:3,item:'Малое зелье',itemCount:1},
    farmer:{title:'Фермер',icon:'🌱',subtitle:'Выращивай культуры, поливай и собирай урожай.',action:'Собери урожай',goal:l=>5+Math.floor(l*.8),gold:l=>32+l*10,xp:l=>44+l*12,actionXp:3,item:'Компост',itemCount:2},
    hunter:{title:'Охотник',icon:'🏹',subtitle:'Побеждай монстров и собирай трофеи.',action:'Победи врагов',goal:l=>5+Math.floor(l*.9),gold:l=>40+l*12,xp:l=>52+l*14,actionXp:4,item:'Мясо',itemCount:2},
    fisherman:{title:'Рыбак',icon:'🎣',subtitle:'Лови рыбу и находи жемчуг у берега.',action:'Сделай улов',goal:l=>4+Math.floor(l*.7),gold:l=>35+l*11,xp:l=>46+l*12,actionXp:3,item:'Рыба',itemCount:2},
    builder:{title:'Строитель',icon:'🏠',subtitle:'Размещай дома, фермы, печи и технологические постройки.',action:'Построй объекты',goal:l=>3+Math.floor(l*.65),gold:l=>42+l*13,xp:l=>55+l*15,actionXp:5,item:'Древесина',itemCount:5},
    crafter:{title:'Ремесленник',icon:'🔨',subtitle:'Создавай инструменты, печи, полезные вещи и материалы.',action:'Создай предметы',goal:l=>5+Math.floor(l*.75),gold:l=>36+l*11,xp:l=>48+l*13,actionXp:3,item:'Железо',itemCount:1},
    blacksmith:{title:'Кузнец',icon:'⚒️',subtitle:'Куй оружие, броню, кирки и улучшай экипировку.',action:'Скуй снаряжение',goal:l=>3+Math.floor(l*.55),gold:l=>55+l*15,xp:l=>62+l*16,actionXp:5,item:'Уголь',itemCount:3},
    alchemist:{title:'Алхимик',icon:'⚗️',subtitle:'Готовь зелья и используй лечебные смеси.',action:'Создай или примени зелья',goal:l=>4+Math.floor(l*.65),gold:l=>46+l*13,xp:l=>54+l*14,actionXp:4,item:'Малое зелье',itemCount:1},
    cook:{title:'Повар',icon:'🍲',subtitle:'Готовь еду в печи и обеспечивай запасы провизии.',action:'Приготовь еду',goal:l=>4+Math.floor(l*.7),gold:l=>30+l*9,xp:l=>42+l*12,actionXp:3,item:'Жареное мясо',itemCount:2},
    explorer:{title:'Исследователь',icon:'🧭',subtitle:'Открывай сундуки, находи тайники и изучай новые земли.',action:'Найди открытия',goal:l=>3+Math.floor(l*.55),gold:l=>50+l*15,xp:l=>65+l*17,actionXp:7,item:'Кристалл',itemCount:1},
    technologist:{title:'Технолог',icon:'⚙️',subtitle:'Изучай автоматику и развивай энергетические системы.',action:'Открой технологии',goal:l=>2+Math.floor(l*.45),gold:l=>65+l*18,xp:l=>75+l*18,actionXp:8,item:'Медь',itemCount:3}
  };
  const ACTIONS={
    tree:'lumberjack',wood:'lumberjack',ore:'miner',mine:'miner',quarry:'miner',
    harvest:'farmer',farm:'farmer',kill:'hunter',hunt:'hunter',monster:'hunter',
    fish:'fisherman',catch:'fisherman',build:'builder',structure:'builder',
    craft:'crafter',recipe:'crafter',forge:'blacksmith',weapon:'blacksmith',
    potion:'alchemist',alchemy:'alchemist',cook:'cook',food:'cook',
    explore:'explorer',chest:'explorer',discovery:'explorer',
    research:'technologist',technology:'technologist',tech:'technologist'
  };
  const fresh=()=>({accepted:true,paused:false,level:1,xp:0,progress:0,completed:0,total:0});
  let state={},panel=null,returnToPause=false;
  for(const id of Object.keys(JOBS))state[id]=fresh();
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    for(const id of Object.keys(JOBS)){
      const v=saved[id]||{};
      state[id]={
        accepted:v.paused===true?false:true,paused:v.paused===true,
        level:Math.max(1,Math.min(MAX_LEVEL,Math.floor(Number(v.level)||1))),
        xp:Math.max(0,Math.floor(Number(v.xp)||0)),
        progress:Math.max(0,Math.floor(Number(v.progress)||0)),
        completed:Math.max(0,Math.floor(Number(v.completed)||0)),
        total:Math.max(0,Math.floor(Number(v.total)||0))
      };
    }
  }catch(_){}
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(error){console.warn('[SkyRealm professions save]',error);}}
  function requiredXp(level){return 80+Math.max(0,level-1)*42;}
  function goal(id){return JOBS[id].goal(state[id].level);}
  function addXp(id,amount){
    const p=state[id];p.xp=Math.min(10000000,p.xp+Math.max(0,Math.floor(Number(amount)||0)));
    while(p.level<MAX_LEVEL&&p.xp>=requiredXp(p.level)){p.xp-=requiredXp(p.level);p.level++;}
    if(p.level>=MAX_LEVEL)p.xp=0;
  }
  function renderCard(id){
    const d=JOBS[id],p=state[id],g=goal(id),need=requiredXp(p.level);
    const xpPct=p.level>=MAX_LEVEL?100:Math.min(100,p.xp/need*100),progressPct=Math.min(100,p.progress/g*100);
    const rank=p.level>=10?'Легендарный мастер':p.level>=7?'Мастер':p.level>=4?'Опытный специалист':'Ученик';
    const action=p.accepted?'Приостановить':'Возобновить';
    return '<article class="job-card job-'+id+'">'+
      '<div class="job-card-head"><span class="job-icon">'+d.icon+'</span><div class="job-card-title"><h2>'+d.title+'</h2><p>'+d.subtitle+'</p></div><span class="job-level">УР. '+p.level+'</span></div>'+
      '<div class="job-rank">'+rank+' · заказов завершено: '+p.completed+'</div>'+
      '<div class="job-total">Всего действий: <b>'+p.total+'</b></div>'+
      '<div class="job-progress-label"><b>Следующий заказ</b><span>'+p.progress+' / '+g+'</span></div>'+
      '<div class="job-progress"><i style="width:'+progressPct+'%"></i></div>'+
      '<div class="job-task">'+d.action+' · цель '+g+'</div>'+
      '<div class="job-xp-label"><span>Опыт профессии</span><span>'+(p.level>=MAX_LEVEL?'МАКСИМУМ':p.xp+' / '+need+' XP')+'</span></div>'+
      '<div class="job-progress job-xp"><i style="width:'+xpPct+'%"></i></div>'+
      '<div class="job-reward">Награда за заказ: <b>'+d.gold(p.level)+' золота</b> · <b>'+d.xp(p.level)+' XP</b> · '+d.item+' ×'+d.itemCount+'</div>'+
      '<button class="job-accept" data-job-accept="'+id+'" type="button">'+action+'</button></article>';
  }
  function render(){
    if(!panel)return;
    const list=panel.querySelector('#jobs-list');
    if(list)list.innerHTML=Object.keys(JOBS).map(renderCard).join('');
    const foot=panel.querySelector('#jobs-footnote');
    if(foot)foot.textContent='Действия записываются автоматически во всех профессиях. Приостановка отключает только заказы, но не общий счётчик и опыт. Прогресс хранится между запусками игры.';
    panel.querySelectorAll('[data-job-accept]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.jobAccept,p=state[id];p.accepted=!p.accepted;p.paused=!p.accepted;save();render();
    }));
  }
  function createPanel(){
    if(panel)return panel;
    const style=document.createElement('style');style.id='skyrealm-jobs-style';
    style.textContent='.jobs-dialog{width:min(1120px,97vw);max-height:92vh;overflow:auto;padding:22px}.jobs-dialog h1{text-align:center;font-size:25px;margin:7px 0 5px}.jobs-intro{text-align:center;color:#9bb1d2;font-size:11px;line-height:1.55;margin:0 auto 16px;max-width:720px}.jobs-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.job-card{min-width:0;padding:14px;border:1px solid #355276;border-radius:14px;background:linear-gradient(145deg,#10243c,#091827);text-align:left}.job-card-head{display:flex;align-items:center;gap:10px}.job-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid #6686b755;border-radius:12px;background:#1a3554;font-size:22px;flex:none}.job-card-title{min-width:0;flex:1}.job-card-title h2{font-size:16px;color:#eef5ff;margin:0 0 3px}.job-card-title p{font-size:10px;line-height:1.45;color:#91a9ca;margin:0}.job-level{flex:none;padding:6px 8px;border:1px solid #6b86b5;border-radius:8px;background:#20395c;color:#dce9ff;font-size:9px;font-weight:900}.job-rank{margin:10px 0 5px;color:#c6d8f4;font-size:10px;font-weight:800}.job-total{color:#8fdfc0;font-size:10px;margin:0 0 10px}.job-total b{color:#d9ffed}.job-progress-label,.job-xp-label{display:flex;justify-content:space-between;gap:8px;color:#a9bddb;font-size:10px;margin-bottom:6px}.job-progress{height:8px;overflow:hidden;border-radius:9px;background:#050e1a;border:1px solid #344c70}.job-progress i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#5dbb96,#a7edbb);transition:width .2s}.job-xp{height:6px}.job-xp i{background:linear-gradient(90deg,#6196ed,#b5ccff)}.job-task{font-size:11px;color:#edf4ff;font-weight:800;margin:8px 0 10px}.job-xp-label{margin-top:11px}.job-reward{margin:10px 0;color:#a9bddb;font-size:10px;line-height:1.6}.job-reward b{color:#ffe2a0}.job-accept{width:100%;min-height:35px;border:1px solid #5f8bcb;border-radius:9px;background:linear-gradient(110deg,#285b9e,#254478);color:#fff;font:inherit;font-size:11px;font-weight:900;cursor:pointer}.job-accept:hover{filter:brightness(1.12)}.jobs-footnote{margin:14px 0 0;color:#8199bd;text-align:center;font-size:10px;line-height:1.6}.jobs-close{display:block;margin:15px auto 0;min-width:150px}@media(max-width:900px){.jobs-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.jobs-list{grid-template-columns:1fr}.jobs-dialog{padding:14px}}';
    document.head.appendChild(style);
    panel=document.createElement('div');panel.className='shade custom-modal-shade';panel.id='jobs-shade';panel.hidden=true;panel.setAttribute('aria-hidden','true');
    panel.innerHTML='<div class="dialog settings-dialog jobs-dialog" role="dialog" aria-modal="true" aria-labelledby="jobs-title"><div class="dialog-mark">⚒</div><div class="eyebrow">SKYREALM · ПРОФЕССИИ</div><h1 id="jobs-title">Гильдия профессий</h1><p class="jobs-intro">12 специальностей с отдельными уровнями, заказами и бонусами. Любая добыча, стройка, охота, рыбалка или работа у верстака автоматически развивает подходящую профессию.</p><div class="jobs-list" id="jobs-list"></div><p class="jobs-footnote" id="jobs-footnote"></p><button type="button" class="action secondary jobs-close" id="jobs-close">Закрыть</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('#jobs-close').addEventListener('click',close);
    panel.addEventListener('click',event=>{if(event.target===panel)close();});
    render();return panel;
  }
  function open(){
    createPanel();const pause=document.getElementById('pause-shade');returnToPause=!!(pause&&!pause.hidden);
    if(returnToPause)pause.hidden=true;
    panel.hidden=false;panel.setAttribute('aria-hidden','false');render();
  }
  function close(){
    if(!panel)return;panel.hidden=true;panel.setAttribute('aria-hidden','true');
    if(returnToPause){const pause=document.getElementById('pause-shade');if(pause)pause.hidden=false;}
    returnToPause=false;
  }
  function record(id,amount=1){
    const jobId=JOBS[id]?id:(ACTIONS[String(id||'').toLowerCase()]||'');
    const p=state[jobId],d=JOBS[jobId];if(!p||!d)return false;
    const n=Math.max(0,Math.min(1000,Math.floor(Number(amount)||0)));if(!n)return false;
    p.total=Math.min(10000000,p.total+n);
    addXp(jobId,n*d.actionXp);
    const rewards=[];
    if(p.accepted){
      p.progress=Math.min(10000000,p.progress+n);
      let safety=0;
      while(p.progress>=goal(jobId)&&safety++<100){
        const currentGoal=goal(jobId);p.progress-=currentGoal;p.completed++;
        const gold=d.gold(p.level),xp=d.xp(p.level);
        addXp(jobId,xp);
        rewards.push({gold,xp,item:d.item,itemCount:d.itemCount,job:d.title});
      }
    }
    save();render();
    for(const reward of rewards)window.dispatchEvent(new CustomEvent('skyrealm:job-reward',{detail:reward}));
    window.dispatchEvent(new CustomEvent('skyrealm:job-progress',{detail:{id:jobId,progress:p.progress,goal:goal(jobId),level:p.level,total:p.total}}));
    return true;
  }
  function rollBonus(id){
    const p=state[id];if(!p)return false;
    return Math.random()<Math.min(.30,.02+(p.level-1)*.028);
  }
  function getLevel(id){return state[id]?state[id].level:1;}
  function bonus(id){return state[id]?Math.max(0,state[id].level-1)*.01:0;}
  function bindButtons(){
    document.getElementById('menu-jobs')?.addEventListener('click',open);
    document.getElementById('pause-jobs')?.addEventListener('click',open);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{createPanel();bindButtons();render();},{once:true});
  else{createPanel();bindButtons();}
  window.SkyRealmJobs={VERSION:2,open,close,record,recordAction:record,rollBonus,getLevel,bonus,getState:()=>JSON.parse(JSON.stringify(state)),getCatalog:()=>Object.keys(JOBS)};
})();