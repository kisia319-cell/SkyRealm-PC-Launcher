(() => {
  'use strict';
  const STORAGE_KEY='skyrealm_user_script_mods_v1';
  const MAX_SAVED=20,MAX_ACTIVE=3,MAX_CODE=14000,PYODIDE_VERSION='0.29.5';
  const $=id=>document.getElementById(id),host=()=>window.SkyRealmCustomModHost;
  const runners=new Map();let mods=[],lastTick=0,editingId=null;
  function safeText(value,max=120){return String(value??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);}
  function readMods(){try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(!Array.isArray(raw))return [];return raw.filter(m=>m&&typeof m==='object'&&/^[a-z0-9_-]{6,48}$/i.test(m.id||'')&&['javascript','python'].includes(m.language)&&typeof m.source==='string'&&m.source.length<=MAX_CODE).slice(0,MAX_SAVED).map(m=>({id:m.id,name:safeText(m.name,32)||'Мой мод',description:safeText(m.description,140),language:m.language,source:m.source,enabled:m.enabled===true,createdAt:Number(m.createdAt)||Date.now()}));}catch(_){return [];}}
  function saveMods(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(mods));return true;}catch(_){setStatus('Не удалось сохранить список модов. Проверь свободное место.',true);return false;}}
  function setStatus(message,error=false,success=false){const node=$('script-mod-status');if(!node)return;node.textContent=message;node.classList.toggle('error',!!error);node.classList.toggle('success',!!success);}
  function idForNewMod(){return 'usr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);}
  function templates(language){
    if(language==='python')return 'def on_tick(context, state):\n    # health, stamina, hunger, level, day, night, difficulty, inHouse\n    if context["health"] < 50 and state.get("last_heal_day") != context["day"]:\n        state["last_heal_day"] = context["day"]\n        return {"state": state, "actions": [{"type": "heal", "amount": 4}, {"type": "message", "text": "Твой мод помог восстановиться!"}]}\n    return {"state": state, "actions": []}\n';
    return 'function onTick(context, state) {\n  // health, stamina, hunger, level, day, night, difficulty, inHouse\n  if (context.health < 50 && state.lastHealDay !== context.day) {\n    state.lastHealDay = context.day;\n    return { state, actions: [{ type: "heal", amount: 4 }, { type: "message", text: "Твой мод помог восстановиться!" }] };\n  }\n  return { state, actions: [] };\n}\n';
  }
  function defaultContext(){return {health:35,stamina:60,hunger:45,level:5,experience:20,day:2,night:true,difficulty:'medium',inHouse:false,wallet:10};}
  function frameDocument(mod){
    const source=JSON.stringify(mod.source).replace(/</g,'\\u003c');
    const modId=JSON.stringify(mod.id),language=JSON.stringify(mod.language);
    const lines=[
      'const MOD_ID='+modId+';const LANG='+language+';const SOURCE='+source+';',
      'function send(type,payload){parent.postMessage(Object.assign({channel:"skyrealm-user-mod",id:MOD_ID,type:type},payload||{}),"*");}',
      'function buildWorkerSource(){',
      'if(LANG==="javascript"){return [',
      '"use strict;",',
      '"const SOURCE="+JSON.stringify(SOURCE)+";let state={};let tickFn=null;try{const factory=new Function(SOURCE+String.fromCharCode(10)+\\\"return onTick;\\\")();if(typeof factory!==\\\"function\\\")throw new Error(\\\"Нужна функция onTick(context, state).\\\");tickFn=factory;postMessage({type:\\\"ready\\\"});}catch(e){postMessage({type:\\\"error\\\",message:String(e&&e.message||e)});}",',
      '"onmessage=async function(event){if(event.data&&event.data.type===\\\"stop\\\"){close();return;}try{const result=await tickFn(event.data.context||{},state)||{};if(result.state&&typeof result.state===\\\"object\\\"&&!Array.isArray(result.state))state=result.state;postMessage({type:\\\"result\\\",request:event.data.request,result:result});}catch(e){postMessage({type:\\\"error\\\",request:event.data.request,message:String(e&&e.message||e)});}};"',
      '].join(String.fromCharCode(10));}',
      'return [',
      '"importScripts(\\\"https://cdn.jsdelivr.net/pyodide/v"+'+JSON.stringify(PYODIDE_VERSION)+'+"\\/full/pyodide.js\\");",',
      '"let pyodide=null,ready=false;(async()=>{try{pyodide=await loadPyodide({indexURL: \\"https://cdn.jsdelivr.net/pyodide/v"+'+JSON.stringify(PYODIDE_VERSION)+'+"\\/full/\\\"});pyodide.runPython("+JSON.stringify(SOURCE)+");if(!pyodide.runPython(\\\"callable(globals().get(\\\\\\\'on_tick\\\\\\\'))\\\"))throw new Error(\\\"Нужна функция on_tick(context, state).\\\");ready=true;postMessage({type:\\\"ready\\\"});}catch(e){postMessage({type:\\\"error\\\",message:String(e&&e.message||e)});}})();",',
      '"onmessage=function(event){if(event.data&&event.data.type===\\\"stop\\\"){close();return;}if(!ready)return;try{pyodide.globals.set(\\\"_sky_context\\\",JSON.stringify(event.data.context||{}));pyodide.globals.set(\\\"_sky_state\\\",JSON.stringify(event.data.state||{}));const code=[\\\"import json\\\",\\\"_context=json.loads(_sky_context)\\\",\\\"_state=json.loads(_sky_state)\\\",\\\"_result=on_tick(_context,_state)\\\",\\\"json.dumps(_result if _result is not None else {})\\\"].join(String.fromCharCode(10));const raw=pyodide.runPython(code);postMessage({type:\\\"result\\\",request:event.data.request,result:JSON.parse(String(raw))});}catch(e){postMessage({type:\\\"error\\\",request:event.data.request,message:String(e&&e.message||e)});}};"',
      '].join(String.fromCharCode(10));',
      '}',
      'const policy=document.createElement("meta");policy.httpEquiv="Content-Security-Policy";',
      'policy.content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\' \'wasm-unsafe-eval\' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net; worker-src blob:; style-src \'unsafe-inline\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';";document.head.appendChild(policy);',
      'try{const blob=new Blob([buildWorkerSource()],{type:"text/javascript"}),url=URL.createObjectURL(blob),worker=new Worker(url);URL.revokeObjectURL(url);',
      'worker.onmessage=function(event){const data=event.data||{};if(["ready","result","error"].includes(data.type))send(data.type,data);};',
      'worker.onerror=function(event){send("error",{message:String(event.message||"Ошибка изолированного процесса")});};',
      'addEventListener("message",function(event){if(event.source!==parent||event.data?.channel!=="skyrealm-user-mod-host"||event.data.id!==MOD_ID)return;if(event.data.type==="stop"){worker.terminate();return;}worker.postMessage(event.data);});',
      '}catch(error){send("error",{message:String(error&&error.message||error)});}'
    ];
    const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\' \'wasm-unsafe-eval\' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net; worker-src blob:; style-src \'unsafe-inline\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';">';
    return '<!doctype html><html><head><meta charset="utf-8">'+csp+'</head><body><script>'+lines.join('\n')+'</script></body></html>';
  }
  function cleanupRunner(id){const runner=runners.get(id);if(!runner)return;clearTimeout(runner.watchdog);try{runner.frame.contentWindow.postMessage({channel:'skyrealm-user-mod-host',id:id,type:'stop'},'*');}catch(_){}window.removeEventListener('message',runner.listener);runner.frame.remove();runners.delete(id);}
  function setRunnerError(mod,message){mod.enabled=false;saveMods();cleanupRunner(mod.id);renderMods();setStatus('Мод «'+mod.name+'» отключён: '+safeText(message,220),true);}
  function createRunner(mod){
    const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.className='skyrealm-user-mod-sandbox';frame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;border:0';
    const runner={mod:mod,frame:frame,ready:false,busy:false,state:{},request:0,watchdog:null,listener:null};
    runner.listener=function(event){
      if(event.source!==frame.contentWindow||event.data?.channel!=='skyrealm-user-mod'||event.data.id!==mod.id)return;
      const data=event.data;clearTimeout(runner.watchdog);runner.watchdog=null;runner.busy=false;
      if(data.type==='ready'){runner.ready=true;return;}
      if(data.type==='error'){setRunnerError(mod,data.message||'Ошибка выполнения');return;}
      if(data.type==='result'){
        if(data.request!==runner.request||!data.result||typeof data.result!=='object'||Array.isArray(data.result))return;
        try{const encoded=JSON.stringify(data.result);if(!encoded||encoded.length>6000)throw new Error('Слишком большой результат скрипта.');
          if(data.result.state&&typeof data.result.state==='object'&&!Array.isArray(data.result.state))runner.state=JSON.parse(JSON.stringify(data.result.state));
          const actions=Array.isArray(data.result.actions)?data.result.actions.slice(0,5):[];host()?.applyActions?.(mod.id,actions);
        }catch(error){setRunnerError(mod,error.message||'Некорректный результат');}
      }
    };
    runners.set(mod.id,runner);window.addEventListener('message',runner.listener);frame.srcdoc=frameDocument(mod);document.body.append(frame);
    const bootLimit=mod.language==='python'?90000:3000;
    runner.watchdog=setTimeout(function(){if(!runner.ready)setRunnerError(mod,mod.language==='python'?'Python не запустился за 90 секунд. Проверь интернет.':'JavaScript-мод не запустился.');},bootLimit);
    return runner;
  }
  function sendTick(runner,context){if(!runner.ready||runner.busy)return;const request=++runner.request;runner.busy=true;
    runner.frame.contentWindow.postMessage({channel:'skyrealm-user-mod-host',id:runner.mod.id,type:'tick',request:request,context:context,state:runner.state},'*');
    runner.watchdog=setTimeout(function(){setRunnerError(runner.mod,'Скрипт завис или выполнялся слишком долго; мод отключён.');},1800);
  }
  function activeCount(){return mods.filter(m=>m.enabled).length;}
  function renderMods(){
    const root=$('user-mods-list');if(!root)return;root.replaceChildren();
    if(!mods.length){const empty=document.createElement('div');empty.className='user-mod-empty';empty.textContent='Пока нет собственных скриптовых модов. Нажми «Написать мод», чтобы создать первый.';root.append(empty);}
    mods.forEach(mod=>{
      const card=document.createElement('article');card.className='user-mod-card';const info=document.createElement('div');info.className='user-mod-card-info';
      const title=document.createElement('b');title.textContent=mod.name;const meta=document.createElement('small');meta.textContent=(mod.language==='python'?'Python':'JavaScript')+' · '+(mod.enabled?'Включён':'Выключен')+' · Локальный мод';
      const desc=document.createElement('p');desc.textContent=mod.description||'Пользовательский скрипт';info.append(title,meta,desc);
      const actions=document.createElement('div');actions.className='user-mod-card-actions';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='action secondary';toggle.textContent=mod.enabled?'Выключить':'Включить';
      toggle.addEventListener('click',function(){if(!mod.enabled&&activeCount()>=MAX_ACTIVE){setStatus('Можно одновременно включить не более '+MAX_ACTIVE+' скриптовых модов.',true);return;}
        if(!mod.enabled&&mod.language==='python'&&mods.some(other=>other.enabled&&other.language==='python')){setStatus('Одновременно можно запускать только один Python-мод.',true);return;}
        mod.enabled=!mod.enabled;if(!saveMods()){mod.enabled=!mod.enabled;return;}if(!mod.enabled)cleanupRunner(mod.id);renderMods();});
      const edit=document.createElement('button');edit.type='button';edit.className='action secondary';edit.textContent='Изменить';edit.addEventListener('click',function(){openEditor(mod);});
      const exp=document.createElement('button');exp.type='button';exp.className='action secondary';exp.textContent='Экспорт';exp.addEventListener('click',function(){exportMod(mod);});
      const remove=document.createElement('button');remove.type='button';remove.className='action secondary';remove.textContent='Удалить';remove.addEventListener('click',function(){if(!confirm('Удалить локальный мод «'+mod.name+'»?'))return;cleanupRunner(mod.id);mods=mods.filter(m=>m.id!==mod.id);saveMods();renderMods();});
      actions.append(toggle,edit,exp,remove);card.append(info,actions);root.append(card);
    });
  }
  function openEditor(mod){editingId=mod?.id||null;$('script-mod-name').value=mod?.name||'Мой первый мод';$('script-mod-language').value=mod?.language||'javascript';$('script-mod-code').value=mod?.source||templates($('script-mod-language').value);
    $('script-mod-status').textContent='Сначала нажми «Проверить код». Скрипт будет испытан в отдельном процессе.';$('script-mod-status').className='script-mod-status';$('script-mod-studio').hidden=false;$('script-mod-studio').setAttribute('aria-hidden','false');}
  function closeEditor(){$('script-mod-studio').hidden=true;$('script-mod-studio').setAttribute('aria-hidden','true');}
  function validateSource(name,language,source){if(name.length<1||name.length>32)throw new Error('Название должно содержать от 1 до 32 символов.');if(!['javascript','python'].includes(language))throw new Error('Выбери JavaScript или Python.');
    if(source.length<10||source.length>MAX_CODE)throw new Error('Код должен содержать от 10 до '+MAX_CODE+' символов.');
    if(language==='javascript'&&!/function\s+onTick\s*\(/.test(source))throw new Error('В JavaScript нужна функция function onTick(context, state).');
    if(language==='python'&&!/def\s+on_tick\s*\(/.test(source))throw new Error('В Python нужна функция def on_tick(context, state):');}
  function testSource(){const name=safeText($('script-mod-name').value,32)||'Тестовый мод',language=$('script-mod-language').value,source=$('script-mod-code').value;
    try{validateSource(name,language,source);}catch(error){setStatus(error.message,true);return;}
    const mod={id:'test_'+idForNewMod().slice(4),name:name,language:language,source:source},frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
    frame.style.cssText='position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;border:0';frame.srcdoc=frameDocument(mod);document.body.append(frame);
    let finished=false,limit;function cleanup(){if(finished)return;finished=true;clearTimeout(limit);window.removeEventListener('message',listen);try{frame.contentWindow.postMessage({channel:'skyrealm-user-mod-host',id:mod.id,type:'stop'},'*');}catch(_){}frame.remove();}
    function listen(event){if(event.source!==frame.contentWindow||event.data?.channel!=='skyrealm-user-mod'||event.data.id!==mod.id)return;
      if(event.data.type==='ready'){frame.contentWindow.postMessage({channel:'skyrealm-user-mod-host',id:mod.id,type:'tick',request:1,context:defaultContext(),state:{}},'*');clearTimeout(limit);limit=setTimeout(function(){cleanup();setStatus('Тест не ответил вовремя. Проверь код.',true);},1800);}
      if(event.data.type==='result'){cleanup();const count=Array.isArray(event.data.result?.actions)?event.data.result.actions.length:0;setStatus('Тест успешен. Возвращено действий: '+count+'. В мире действуют лимиты силы и частоты.',false,true);}
      if(event.data.type==='error'){cleanup();setStatus('Ошибка скрипта: '+safeText(event.data.message,220),true);}
    }
    limit=setTimeout(function(){cleanup();setStatus(language==='python'?'Python не загрузился. Проверь интернет.':'JavaScript не ответил.',true);},language==='python'?90000:3000);
    window.addEventListener('message',listen);
  }
  function saveEditorMod(){const name=safeText($('script-mod-name').value,32),language=$('script-mod-language').value,source=$('script-mod-code').value;
    try{validateSource(name,language,source);}catch(error){setStatus(error.message,true);return;}
    const old=editingId?mods.find(m=>m.id===editingId):null,mod={id:old?.id||idForNewMod(),name:name,description:'Пользовательский скрипт',language:language,source:source,enabled:old?.enabled===true,createdAt:old?.createdAt||Date.now()};
    const next=old?mods.map(m=>m.id===mod.id?mod:m):mods.concat([mod]);if(next.length>MAX_SAVED){setStatus('Можно сохранить не более '+MAX_SAVED+' собственных модов.',true);return;}
    mods=next;if(!saveMods())return;renderMods();setStatus('Мод сохранён. Включи его в списке «Мои скриптовые моды».',false,true);
  }
  function exportMod(mod){const blob=new Blob([JSON.stringify({format:'skyrealm-user-mod',version:1,mod:mod},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SkyRealm-Mod-'+mod.id+'.json';document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);}
  function importModFile(file){const reader=new FileReader();reader.onload=function(){try{const payload=JSON.parse(String(reader.result||'')),raw=payload.mod||payload;validateSource(safeText(raw.name,32),raw.language,String(raw.source||''));
      if(!['skyrealm-user-mod',undefined].includes(payload.format)||payload.version>1)throw new Error('Неподдерживаемый формат файла мода.');
      if(mods.length>=MAX_SAVED)throw new Error('Достигнут лимит сохранённых модов.');
      mods.push({id:idForNewMod(),name:safeText(raw.name,32),description:safeText(raw.description,140),language:raw.language,source:String(raw.source),enabled:false,createdAt:Date.now()});
      saveMods();renderMods();setStatus('Мод импортирован. Включи его после проверки.',false,true);
    }catch(error){setStatus('Не удалось импортировать мод: '+(error.message||error),true);}};
    reader.onerror=function(){setStatus('Не удалось прочитать выбранный файл.',true);};reader.readAsText(file);}
  function step(){const bridge=host();if(!bridge?.canRun?.()){for(const id of Array.from(runners.keys()))cleanupRunner(id);return;}
    const now=Date.now();if(now-lastTick<2200)return;lastTick=now;let context;try{context=bridge.getContext();}catch(_){return;}
    mods.filter(m=>m.enabled).forEach(function(mod){let runner=runners.get(mod.id);if(!runner)runner=createRunner(mod);if(runner.ready&&!runner.busy)sendTick(runner,context);});}
  function init(){mods=readMods();renderMods();$('open-script-mod-creator')?.addEventListener('click',function(){openEditor();});
    $('script-mod-close')?.addEventListener('click',closeEditor);$('script-mod-test')?.addEventListener('click',testSource);$('script-mod-save')?.addEventListener('click',saveEditorMod);
    $('script-mod-language')?.addEventListener('change',function(){if(confirm('Заменить текущий код примером для выбранного языка?'))$('script-mod-code').value=templates($('script-mod-language').value);});
    $('import-user-mod')?.addEventListener('click',function(){$('user-mod-import-file')?.click();});
    $('user-mod-import-file')?.addEventListener('change',function(event){const file=event.target.files?.[0];if(file)importModFile(file);event.target.value='';});
    $('script-mod-studio')?.addEventListener('click',function(event){if(event.target===$('script-mod-studio'))closeEditor();});
    if(new URLSearchParams(location.search).get('installMod')==='__creator__')setTimeout(openEditor,450);window.setInterval(step,500);}
  window.SkyRealmCustomMods={openEditor:openEditor,render:renderMods,buildSandboxDocument:frameDocument};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();