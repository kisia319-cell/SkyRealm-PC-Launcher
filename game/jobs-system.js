(() => {
  'use strict';
  const STORAGE_KEY='skyrealm_professions_v1',MAX_LEVEL=10;
  const JOBS={
    lumberjack:{title:'Лесоруб',icon:'🪓',subtitle:'Заготавливай древесину для поселений и мастерских.',action:'Сруби деревья',goal:l=>4+Math.min(8,Math.floor((l-1)*.7)),gold:l=>28+l*9,xp:l=>42+l*13,item:'Палка',itemCount:2},
    miner:{title:'Рудокоп',icon:'⛏️',subtitle:'Добывай камень и руду в шахте, находи редкие жилы.',action:'Добудь залежи',goal:l=>7+Math.min(14,Math.floor(l*1.2)),gold:l=>38+l*11,xp:l=>48+l*14,item:'Малое зелье',itemCount:1}
  };
  const fresh=()=>({accepted:false,level:1,xp:0,progress:0,completed:0,total:0});
  let state={lumberjack:fresh(),miner:fresh()},panel=null,returnToPause=false;
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    for(const id of Object.keys(JOBS)){const v=saved[id]||{};state[id]={accepted:v.accepted===true,level:Math.max(1,Math.min(MAX_LEVEL,Math.floor(Number(v.level)||1))),xp:Math.max(0,Math.floor(Number(v.xp)||0)),progress:Math.max(0,Math.floor(Number(v.progress)||0)),completed:Math.max(0,Math.floor(Number(v.completed)||0)),total:Math.max(0,Math.floor(Number(v.total)||0))};}
  }catch(_){}
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}}
  function requiredXp(level){return 80+Math.max(0,level-1)*42;}
  function goal(id){return JOBS[id].goal(state[id].level);}
  function renderCard(id){
    const d=JOBS[id],p=state[id],g=goal(id),need=requiredXp(p.level),xpPct=p.level>=MAX_LEVEL?100:Math.min(100,p.xp/need*100),progressPct=Math.min(100,p.progress/g*100);
    const rank=p.level>=10?'Легендарный мастер':p.level>=7?'Мастер':p.level>=4?'Опытный специалист':'Ученик';
    const gold=d.gold(p.level),xp=d.xp(p.level);
    const action=p.accepted?'✓ Работа принята':'Принять работу';
    return '<article class="job-card job-'+id+'">'+
      '<div class="job-card-head"><span class="job-icon">'+d.icon+'</span><div class="job-card-title"><h2>'+d.title+'</h2><p>'+d.subtitle+'</p></div><span class="job-level">УР. '+p.level+'</span></div>'+
      '<div class="job-rank">'+rank+' · выполнено заказов: '+p.completed+'</div>'+
      '<div class="job-progress-label"><b>Текущий заказ</b><span>'+p.progress+' / '+g+'</span></div>'+
      '<div class="job-progress"><i style="width:'+progressPct+'%"></i></div>'+
      '<div class="job-task">'+d.action+': '+g+' '+(id==='lumberjack'?'деревьев':'залежей руды')+'.</div>'+
      '<div class="job-xp-label"><span>Опыт профессии</span><span>'+(p.level>=MAX_LEVEL?'МАКСИМУМ':p.xp+' / '+need+' XP')+'</span></div>'+
      '<div class="job-progress job-xp"><i style="width:'+xpPct+'%"></i></div>'+
      '<div class="job-reward">Награда за заказ: <b>'+gold+' золота</b> · <b>'+xp+' XP</b> · '+d.item+' ×'+d.itemCount+'</div>'+
      '<button class="job-accept" data-job-accept="'+id+'" type="button">'+action+'</button></article>';
  }
  function render(){
    if(!panel)return;
    const list=panel.querySelector('#jobs-list');
    if(list)list.innerHTML=renderCard('lumberjack')+renderCard('miner');
    const foot=panel.querySelector('#jobs-footnote');
    if(foot)foot.textContent='Работа засчитывается только за реальные действия: срубленные деревья и добытые залежи. Профессии сохраняются на этом компьютере.';
    panel.querySelectorAll('[data-job-accept]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.jobAccept;state[id].accepted=!state[id].accepted;save();render();
    }));
  }
  function createPanel(){
    if(panel)return panel;
    const style=document.createElement('style');style.id='skyrealm-jobs-style';
    style.textContent='.jobs-dialog{width:min(880px,96vw);max-height:92vh;overflow:auto;padding:22px}.jobs-dialog h1{text-align:center;font-size:25px;margin:7px 0 5px}.jobs-intro{text-align:center;color:#9bb1d2;font-size:11px;line-height:1.55;margin:0 auto 16px;max-width:610px}.jobs-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.job-card{min-width:0;padding:14px;border:1px solid #355276;border-radius:14px;background:linear-gradient(145deg,#10243c,#091827);text-align:left}.job-card-head{display:flex;align-items:center;gap:10px}.job-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid #6686b755;border-radius:12px;background:#1a3554;font-size:22px;flex:none}.job-card-title{min-width:0;flex:1}.job-card-title h2{font-size:16px;color:#eef5ff;margin:0 0 3px}.job-card-title p{font-size:10px;line-height:1.45;color:#91a9ca;margin:0}.job-level{flex:none;padding:6px 8px;border:1px solid #6b86b5;border-radius:8px;background:#20395c;color:#dce9ff;font-size:9px;font-weight:900}.job-rank{margin:12px 0 13px;color:#c6d8f4;font-size:10px;font-weight:800}.job-progress-label,.job-xp-label{display:flex;justify-content:space-between;gap:8px;color:#a9bddb;font-size:10px;margin-bottom:6px}.job-progress{height:8px;overflow:hidden;border-radius:9px;background:#050e1a;border:1px solid #344c70}.job-progress i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#5dbb96,#a7edbb);transition:width .2s}.job-xp{height:6px}.job-xp i{background:linear-gradient(90deg,#6196ed,#b5ccff)}.job-task{font-size:11px;color:#edf4ff;font-weight:800;margin:9px 0 12px}.job-xp-label{margin-top:12px}.job-reward{margin:12px 0;color:#a9bddb;font-size:10px;line-height:1.6}.job-reward b{color:#ffe2a0}.job-accept{width:100%;min-height:37px;border:1px solid #5f8bcb;border-radius:9px;background:linear-gradient(110deg,#285b9e,#254478);color:#fff;font:inherit;font-size:11px;font-weight:900;cursor:pointer}.job-accept:hover{filter:brightness(1.12)}.jobs-footnote{margin:14px 0 0;color:#8199bd;text-align:center;font-size:10px;line-height:1.6}.jobs-close{display:block;margin:15px auto 0;min-width:150px}@media(max-width:640px){.jobs-list{grid-template-columns:1fr}.jobs-dialog{padding:14px}}';
    document.head.appendChild(style);
    panel=document.createElement('div');panel.className='shade custom-modal-shade';panel.id='jobs-shade';panel.hidden=true;panel.setAttribute('aria-hidden','true');
    panel.innerHTML='<div class="dialog settings-dialog jobs-dialog" role="dialog" aria-modal="true" aria-labelledby="jobs-title"><div class="dialog-mark">⚒</div><div class="eyebrow">SKYREALM · ПРОФЕССИИ</div><h1 id="jobs-title">Работы и заказы</h1><p class="jobs-intro">Устройся на одну или сразу на две работы. Выполняй заказы, повышай уровень профессии, получай зарплату и полезные бонусы.</p><div class="jobs-list" id="jobs-list"></div><p class="jobs-footnote" id="jobs-footnote"></p><button type="button" class="action secondary jobs-close" id="jobs-close">Закрыть</button></div>';
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
  function record(id,amount){
    const p=state[id];if(!p||!p.accepted)return false;
    const n=Math.max(0,Math.min(1000,Math.floor(Number(amount)||0)));if(!n)return false;
    p.progress=Math.min(100000,p.progress+n);p.total=Math.min(1000000,p.total+n);
    const d=JOBS[id],g=goal(id);let reward=null;
    if(p.progress>=g){
      p.progress-=g;p.completed++;
      const gold=d.gold(p.level),xp=d.xp(p.level);
      reward={gold,xp,item:d.item,itemCount:d.itemCount,job:d.title};
      p.xp+=xp;
      while(p.level<MAX_LEVEL&&p.xp>=requiredXp(p.level)){p.xp-=requiredXp(p.level);p.level++;}
      if(p.level>=MAX_LEVEL)p.xp=0;
    }
    save();render();
    if(reward)window.dispatchEvent(new CustomEvent('skyrealm:job-reward',{detail:reward}));
    window.dispatchEvent(new CustomEvent('skyrealm:job-progress',{detail:{id:id,progress:p.progress,goal:goal(id),level:p.level}}));
    return true;
  }
  function rollBonus(id){
    const p=state[id];if(!p||!p.accepted)return false;
    return Math.random()<Math.min(.24,.02+(p.level-1)*.022);
  }
  function getLevel(id){return state[id]?state[id].level:1;}
  function bindButtons(){
    document.getElementById('menu-jobs')?.addEventListener('click',open);
    document.getElementById('pause-jobs')?.addEventListener('click',open);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{createPanel();bindButtons();render();});
  else{createPanel();bindButtons();}
  window.SkyRealmJobs={open:open,close:close,record:record,rollBonus:rollBonus,getLevel:getLevel,getState:()=>JSON.parse(JSON.stringify(state))};
})();