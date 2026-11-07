(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.SKYREALM_CONFIG || {};
  const authBase = String(config.apiBaseUrl || '').replace(/\/+$/, '');
  const apiKey = String(config.supabaseAnonKey || '');
  const modsBase = authBase.replace(/\/skyrealm-auth$/, '/skyrealm-mods');
  const statusNode = $('community-mods-status');
  if (!modsBase || !apiKey || !$('community-mods-grid')) return;
  function setStatus(message, kind='') {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.toggle('error', kind === 'error');
    statusNode.classList.toggle('success', kind === 'success');
  }
  async function getToken() {
    let token = localStorage.getItem('skyrealm_token') || sessionStorage.getItem('skyrealm_token') || '';
    const expiresAt = Number(localStorage.getItem('skyrealm_token_expires_at') || 0);
    const refresh = localStorage.getItem('skyrealm_refresh_token') || '';
    if (token && expiresAt && expiresAt <= Date.now() + 60000 && refresh) {
      const endpoint = new URL(authBase);
      endpoint.searchParams.set('route', '/api/auth/refresh');
      const response = await fetch(endpoint, {
        method:'POST',
        headers:{apikey:apiKey,Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:refresh}),cache:'no-store'
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.access_token) throw new Error(data.detail?.message || 'Не удалось обновить вход. Войди в аккаунт заново.');
      token = data.access_token;
      localStorage.setItem('skyrealm_token',token);
      if(data.refresh_token)localStorage.setItem('skyrealm_refresh_token',data.refresh_token);
      localStorage.setItem('skyrealm_token_expires_at',String(Date.now()+Math.max(60,Number(data.expires_in)||3600)*1000));
    }
    return token;
  }
  function formatSize(bytes) {
    const n=Number(bytes)||0;
    return n>=1048576?(n/1048576).toFixed(1)+' МБ':Math.max(1,Math.round(n/1024))+' КБ';
  }
  function renderMods(mods) {
    const root=$('community-mods-grid');root.replaceChildren();
    $('community-mods-count').textContent='Модов: '+mods.length;
    if(!mods.length){const empty=document.createElement('div');empty.className='community-mods-empty';empty.textContent='Пока нет опубликованных модов. Стань первым автором!';root.append(empty);return;}
    for(const mod of mods){
      const card=document.createElement('article');card.className='community-mod-card';
      const meta=document.createElement('div');meta.className='community-mod-meta';meta.textContent=(mod.category||'other').toUpperCase()+' · v'+(mod.version||'1.0.0');
      const title=document.createElement('h3');title.textContent=mod.name||'Без названия';
      const desc=document.createElement('p');desc.textContent=mod.description||'Описание отсутствует.';
      const foot=document.createElement('div');foot.className='community-mod-foot';foot.textContent='Автор: '+(mod.creator_name||'Игрок')+' · '+(mod.language==='python'?'Python':'JavaScript')+' · '+formatSize(mod.file_size)+' · Скачиваний: '+(mod.downloads||0);
      const link=document.createElement('a');link.href=mod.download_url;link.textContent='Скачать ZIP';link.rel='noopener';link.target='_blank';link.download='SkyRealm-Mod-'+(mod.mod_id||'mod')+'.zip';
      card.append(meta,title,desc,foot,link);root.append(card);
    }
  }
  async function loadMods() {
    const root=$('community-mods-grid');root.innerHTML='<div class="community-mods-empty">Загружаем общий каталог…</div>';
    try {
      const url=new URL(modsBase);
      const q=$('community-mods-search')?.value.trim()||'';
      const category=$('community-mods-category')?.value||'';
      if(q)url.searchParams.set('q',q);if(category)url.searchParams.set('category',category);
      const response=await fetch(url,{headers:{apikey:apiKey,Authorization:'Bearer '+apiKey},cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.message||'Не удалось загрузить каталог.');
      renderMods(Array.isArray(data.mods)?data.mods:[]);
    } catch(error) {
      root.innerHTML='';const empty=document.createElement('div');empty.className='community-mods-empty';empty.textContent=error.message||'Каталог временно недоступен.';root.append(empty);
      $('community-mods-count').textContent='Нет связи';
    }
  }
  $('community-mods-upload')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const file=$('community-mods-file')?.files?.[0];
    if(!file){setStatus('Сначала выбери ZIP-архив мода.','error');return;}
    if(file.size>20*1024*1024){setStatus('Архив должен быть не больше 20 МБ.','error');return;}
    const button=$('community-mods-publish');button.disabled=true;button.textContent='Публикуем…';
    try {
      const token=await getToken();
      if(!token)throw new Error('Сначала войди в аккаунт SkyRealm.');
      const form=new FormData();form.append('file',file,file.name);form.append('category',$('community-mods-upload-category').value);
      const response=await fetch(modsBase,{method:'POST',headers:{apikey:apiKey,Authorization:'Bearer '+token},body:form});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.message||'Не удалось опубликовать мод.');
      setStatus('Готово! «'+(data.mod?.name||'Мод')+'» опубликован и доступен всем игрокам.','success');
      $('community-mods-file').value='';await loadMods();
    } catch(error) {setStatus(error.message||'Ошибка публикации.','error');}
    finally {button.disabled=false;button.textContent='Опубликовать в общий каталог';}
  });
  $('community-mods-refresh')?.addEventListener('click',loadMods);
  $('community-mods-category')?.addEventListener('change',loadMods);
  let searchTimer=null;
  $('community-mods-search')?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadMods,300);});
  loadMods();
  setStatus('Для публикации войди в аккаунт SkyRealm и выбери ZIP-релиз, экспортированный из Studio.');
})();
