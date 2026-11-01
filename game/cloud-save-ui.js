(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const openButton=$('cloud-save-open'),shade=$('cloud-save-shade');
  if(!openButton||!shade)return;
  const status=$('cloud-save-status'),upload=$('cloud-save-upload'),restore=$('cloud-save-restore');
  let busy=false,remoteRevision=0,remoteSave=null;
  const allowedKey=key=>key==='skyrealm_worlds_v1'||key==='skyrealm_game_save_v1'||/^skyrealm_game_save_v2_[A-Za-z0-9_-]{1,64}$/.test(key);
  function setStatus(message,error=false){status.textContent=message;status.classList.toggle('cloud-save-error',error);}
  function getLocalItems(){
    const items=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!allowedKey(key))continue;
      const value=localStorage.getItem(key);if(typeof value!=='string')continue;
      try{JSON.parse(value);}catch(_){continue;}
      items.push({key,value});
    }
    items.sort((a,b)=>a.key.localeCompare(b.key));
    return items;
  }
  function validateCloudBundle(bundle){
    if(!bundle||bundle.format!==1||!Array.isArray(bundle.items)||bundle.items.length>52)return false;
    const keys=new Set();let bytes=0;
    for(const item of bundle.items){
      if(!item||!allowedKey(item.key)||typeof item.value!=='string'||keys.has(item.key))return false;
      keys.add(item.key);bytes+=new TextEncoder().encode(item.value).byteLength;
      if(bytes>1_800_000)return false;
      try{JSON.parse(item.value);}catch(_){return false;}
    }
    return keys.has('skyrealm_worlds_v1')||keys.has('skyrealm_game_save_v1');
  }
  async function call(method,bundle=null,revision=0){
    const api=window.pywebview?.api;if(!api)throw new Error('Облачные сохранения доступны в установленной Windows-версии игры.');
    const result=method==='GET'?await api.get_cloud_save():await api.upload_cloud_save(bundle,revision);
    if(!result?.ok) {
      const error=new Error(result?.message||'Ошибка облачного архива.');error.code=result?.code||'';throw error;
    }
    return result;
  }
  function downloadSafetyCopy(items){
    const blob=new Blob([JSON.stringify({format:1,created_at:new Date().toISOString(),source:'local-before-cloud-restore',items},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='SkyRealm-local-before-cloud-restore-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function refreshCloudInfo(){
    setStatus('Проверяем облачный архив…');
    try{
      const result=await call('GET');remoteSave=result.save||null;
      remoteRevision=Number(remoteSave?.revision)||0;
      if(!remoteSave)setStatus('Облачной копии пока нет. Можно создать первую резервную копию.');
      else setStatus('Облачная копия найдена · ревизия '+remoteRevision+' · обновлена '+new Date(remoteSave.updated_at).toLocaleString()+'.');
    }catch(error){remoteSave=null;remoteRevision=0;setStatus(error.message||'Не удалось проверить облако.',true);}
  }
  async function uploadCloud(){
    if(busy)return;busy=true;upload.disabled=restore.disabled=true;
    try{
      const items=getLocalItems();
      if(!items.some(x=>x.key==='skyrealm_worlds_v1'||x.key==='skyrealm_game_save_v1'))throw new Error('Сначала создай хотя бы один мир.');
      const bytes=items.reduce((sum,x)=>sum+new TextEncoder().encode(x.value).byteLength,0);
      if(bytes>1_800_000)throw new Error('Размер сохранений превышает лимит облачного архива 1,8 МБ.');
      const latest=await call('GET');const revision=Number(latest.save?.revision)||0;
      const bundle={format:1,created_at:new Date().toISOString(),items};
      const result=await call('POST',bundle,revision);
      remoteSave=result.save||null;remoteRevision=Number(remoteSave?.revision)||revision+1;
      setStatus('Готово! Миры загружены в облако. Ревизия '+remoteRevision+'.');
    }catch(error){setStatus(error.message||'Не удалось загрузить миры.',true);if(error.code==='CLOUD_SAVE_CONFLICT')await refreshCloudInfo();}
    finally{busy=false;upload.disabled=restore.disabled=false;}
  }
  function mergeAndRestore(cloudBundle){
    const localWorldsRaw=localStorage.getItem('skyrealm_worlds_v1')||'[]';
    let localWorlds=[],cloudWorlds=[];
    try{localWorlds=JSON.parse(localWorldsRaw);if(!Array.isArray(localWorlds))localWorlds=[];}catch(_){}
    const cloudWorldItem=cloudBundle.items.find(x=>x.key==='skyrealm_worlds_v1');
    try{cloudWorlds=cloudWorldItem?JSON.parse(cloudWorldItem.value):[];if(!Array.isArray(cloudWorlds))cloudWorlds=[];}catch(_){}
    const merged=new Map();
    localWorlds.forEach(world=>{if(world&&typeof world.id==='string')merged.set(world.id,world);});
    cloudWorlds.forEach(world=>{if(world&&typeof world.id==='string')merged.set(world.id,{...(merged.get(world.id)||{}),...world});});
    localStorage.setItem('skyrealm_worlds_v1',JSON.stringify([...merged.values()]));
    for(const item of cloudBundle.items){
      if(item.key==='skyrealm_worlds_v1')continue;
      localStorage.setItem(item.key,item.value);
    }
  }
  async function restoreCloud(){
    if(busy)return;busy=true;upload.disabled=restore.disabled=true;
    try{
      const result=await call('GET'),save=result.save;
      if(!save||!validateCloudBundle(save.payload))throw new Error('В облаке нет корректной резервной копии.');
      const items=getLocalItems();
      if(!confirm('Найдена облачная копия от '+new Date(save.updated_at).toLocaleString()+'. Перед восстановлением скачается страховочная копия. Миры из облака объединятся с локальными; совпадающие миры будут обновлены. Продолжить?'))return;
      if(items.length)downloadSafetyCopy(items);
      mergeAndRestore(save.payload);
      setStatus('Миры восстановлены и объединены. Страховочная JSON-копия скачана. Перезагружаем список миров…');
      setTimeout(()=>window.location.reload(),700);
    }catch(error){setStatus(error.message||'Не удалось восстановить сохранения.',true);}
    finally{busy=false;upload.disabled=restore.disabled=false;}
  }
  function show(){
    shade.hidden=false;shade.setAttribute('aria-hidden','false');refreshCloudInfo();
  }
  function hide(){shade.hidden=true;shade.setAttribute('aria-hidden','true');}
  openButton.addEventListener('click',show);
  $('cloud-save-close').addEventListener('click',hide);
  shade.addEventListener('click',event=>{if(event.target===shade)hide();});
  upload.addEventListener('click',uploadCloud);restore.addEventListener('click',restoreCloud);
  try{if(new URLSearchParams(location.search).get('cloudSaves')==='1')show();}catch(_){}
})();