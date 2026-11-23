(() => {
  'use strict';
  const GAME_KEY='skyrealm_game_preferences';
  const BEHAVIOR_KEY='skyrealm_launcher_behavior_v1';
  const defaults={autoCheckUpdates:true,updateNotifications:true,autoBackupBeforeUpdate:true,confirmExit:true,rememberLastPage:false};
  const $=id=>document.getElementById(id);
  const parse=(key)=>{try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(_){return {};}};
  const readBehavior=()=>({...defaults,...parse(BEHAVIOR_KEY)});
  const readGame=()=>parse(GAME_KEY);
  const status=(message,error=false)=>{const el=$('launcher-settings-status');if(el){el.textContent=message;el.classList.toggle('error',!!error);}};
  const applyBehavior=()=>{const p=readBehavior();for(const [key,id] of Object.entries({autoCheckUpdates:'launcher-auto-updates',updateNotifications:'launcher-update-notifications',autoBackupBeforeUpdate:'launcher-auto-backup',confirmExit:'launcher-confirm-exit',rememberLastPage:'launcher-remember-page'})){const el=$(id);if(el)el.checked=p[key]!==false;}};
  async function persistBehavior(){
    const next={autoCheckUpdates:$('launcher-auto-updates').checked,updateNotifications:$('launcher-update-notifications').checked,autoBackupBeforeUpdate:$('launcher-auto-backup').checked,confirmExit:$('launcher-confirm-exit').checked,rememberLastPage:$('launcher-remember-page').checked};
    localStorage.setItem(BEHAVIOR_KEY,JSON.stringify(next));
    const api=window.pywebview?.api;
    if(api?.save_launcher_settings){
      const result=await api.save_launcher_settings({...readGame(),...next});
      if(!result?.ok)throw new Error(result?.message||'Не удалось сохранить параметры в Windows-лаунчере.');
      if(result.settings)localStorage.setItem(GAME_KEY,JSON.stringify({...readGame(),...result.settings}));
    }
    status('Настройки поведения сохранены на этом устройстве.');
  }
  const gameWhitelist=['resolution','windowMode','graphicsQuality','fpsLimit','vsync','musicVolume','sfxVolume','musicEnabled','uiSoundEnabled','keyBindings','uiScale','showVitals','showQuest','showControls','showInventory','installRoot'];
  const appearanceKeys=['skyrealm_language','skyrealm_launcher_scale','skyrealm_reduce_motion','skyrealm_high_contrast','skyrealm_performance_saver','skyrealm_effects','skyrealm_compact','skyrealm_greeting','skyrealm_launcher_accent_v1'];
  function sanitizedGame(source){
    const out={};
    for(const key of gameWhitelist)if(Object.prototype.hasOwnProperty.call(source||{},key))out[key]=source[key];
    if(out.keyBindings&&typeof out.keyBindings==='object'){
      const allowed=['up','left','down','right','interact','inventory','map','attack','dodge','ability','heal','buff'];
      out.keyBindings=Object.fromEntries(allowed.filter(k=>typeof out.keyBindings[k]==='string').map(k=>[k,out.keyBindings[k]]));
    }
    return out;
  }
  function sanitizedBehavior(source){const out={};for(const key of Object.keys(defaults))if(typeof source?.[key]==='boolean')out[key]=source[key];return {...defaults,...out};}
  function exportSettings(){
    const data={format:'skyrealm-launcher-settings',schema:1,exportedAt:new Date().toISOString(),game:sanitizedGame(readGame()),launcher:sanitizedBehavior(readBehavior()),appearance:Object.fromEntries(appearanceKeys.filter(k=>localStorage.getItem(k)!==null).map(k=>[k,localStorage.getItem(k)]))};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='SkyRealm-Launcher-Settings.json';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
    status('Файл настроек подготовлен. Данные аккаунта и игровые миры в него не включены.');
  }
  async function importSettings(file){
    if(!file)return;
    if(file.size>65536)throw new Error('Файл слишком большой. Допустимый размер — 64 КБ.');
    const raw=await file.text(),data=JSON.parse(raw);
    if(!data||data.format!=='skyrealm-launcher-settings'||data.schema!==1)throw new Error('Формат файла настроек не распознан.');
    const game={...readGame(),...sanitizedGame(data.game||{})};
    const launcher=sanitizedBehavior(data.launcher||{});
    const appearance=data.appearance&&typeof data.appearance==='object'?data.appearance:{};
    localStorage.setItem(GAME_KEY,JSON.stringify(game));
    localStorage.setItem(BEHAVIOR_KEY,JSON.stringify(launcher));
    for(const key of appearanceKeys){if(typeof appearance[key]==='string'&&appearance[key].length<=80)localStorage.setItem(key,appearance[key]);}
    const api=window.pywebview?.api;
    if(api?.save_launcher_settings){
      const result=await api.save_launcher_settings({...game,...launcher});
      if(!result?.ok)throw new Error(result?.message||'Windows-лаунчер не принял настройки.');
      if(result.settings)localStorage.setItem(GAME_KEY,JSON.stringify({...game,...result.settings}));
    }
    status('Настройки импортированы. Обновляем интерфейс…');
    window.setTimeout(()=>window.location.reload(),250);
  }
  async function resetSettings(){
    if(!window.confirm('Сбросить настройки PrimeLauncher к стандартным? Игровые миры, аккаунт, календарь и резервные копии не будут удалены.'))return;
    const game={resolution:'1280x720',windowMode:'windowed',graphicsQuality:'medium',installRoot:'',fpsLimit:0,vsync:true,musicVolume:35,sfxVolume:70,musicEnabled:false,uiSoundEnabled:true,uiScale:'100',showVitals:true,showQuest:true,showControls:true,showInventory:true,keyBindings:{up:'KeyW',left:'KeyA',down:'KeyS',right:'KeyD',interact:'KeyE',inventory:'KeyI',map:'KeyL',attack:'Space',dodge:'KeyQ',ability:'KeyR',heal:'KeyH',buff:'KeyJ'}};
    localStorage.setItem(GAME_KEY,JSON.stringify(game));
    localStorage.setItem(BEHAVIOR_KEY,JSON.stringify(defaults));
    const values={'skyrealm_language':'ru','skyrealm_launcher_scale':'100','skyrealm_reduce_motion':'false','skyrealm_high_contrast':'false','skyrealm_performance_saver':'false','skyrealm_effects':'true','skyrealm_compact':'false','skyrealm_greeting':'true','skyrealm_launcher_accent_v1':'ember'};
    for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);
    localStorage.removeItem('skyrealm_launcher_perf_profile_v1');
    localStorage.removeItem('skyrealm_launcher_last_page');
    const api=window.pywebview?.api;
    if(api?.save_launcher_settings){
      const result=await api.save_launcher_settings({...game,...defaults});
      if(!result?.ok)throw new Error(result?.message||'Не удалось сбросить настройки Windows-лаунчера.');
    }
    status('Стандартные настройки восстановлены. Игровые миры сохранены.');
    window.setTimeout(()=>window.location.reload(),250);
  }
  function bind(){
    applyBehavior();
    for(const id of ['launcher-auto-updates','launcher-update-notifications','launcher-auto-backup','launcher-confirm-exit','launcher-remember-page']){
      $(id)?.addEventListener('change',()=>persistBehavior().catch(error=>status(error.message||'Ошибка сохранения настроек.',true)));
    }
    $('launcher-settings-save')?.addEventListener('click',async()=>{
      const button=$('launcher-settings-save');button.disabled=true;
      try{await persistBehavior();const api=window.pywebview?.api;if(api?.save_launcher_settings){const result=await api.save_launcher_settings({...readGame(),...readBehavior()});if(!result?.ok)throw new Error(result?.message||'Не удалось сохранить настройки.');}status('Все параметры сохранены.');}
      catch(error){status(error.message||'Не удалось сохранить настройки.',true);}
      finally{button.disabled=false;}
    });
    $('launcher-settings-export')?.addEventListener('click',exportSettings);
    $('launcher-settings-import-button')?.addEventListener('click',()=>$('launcher-settings-import-file')?.click());
    $('launcher-settings-import-file')?.addEventListener('change',async event=>{const file=event.target.files?.[0];try{await importSettings(file);}catch(error){status(error.message||'Не удалось импортировать файл.',true);}finally{event.target.value='';}});
    $('launcher-settings-reset')?.addEventListener('click',()=>resetSettings().catch(error=>status(error.message||'Не удалось сбросить настройки.',true)));
  }
  async function syncNative(){
    const api=window.pywebview?.api;if(!api?.get_launcher_settings)return;
    try{
      const response=await api.get_launcher_settings();if(!response?.ok||!response.settings)return;
      const local=parse(BEHAVIOR_KEY),native=response.settings;
      const merged={...defaults,...native,...local};
      localStorage.setItem(BEHAVIOR_KEY,JSON.stringify(merged));applyBehavior();
      localStorage.setItem(GAME_KEY,JSON.stringify({...native,...readGame()}));
    }catch(error){status(error.message||'Не удалось синхронизировать параметры Windows.',true);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  window.addEventListener('pywebviewready',syncNative);
  syncNative();
})();