(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const config = window.SKYREALM_CONFIG || {};
  const authUrl = String(config.apiBaseUrl || '').trim().replace(/\/+$/,'');
  const apiKey = String(config.supabaseAnonKey || '');
  const socialUrl = authUrl.replace('skyrealm-auth','skyrealm-social');
  const coopUrl = authUrl.replace('skyrealm-auth','skyrealm-coop');
  const manifestUrl = 'https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/manifest.json';
  const currentTime = () => new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  let notificationPanel = null, notificationList = null, notificationCount = null;
  let cachedNotifications = [], cachedUpdate = null, pollTimer = null;

  function ensureSystemPage() {
    const nav = $('.nav');
    const main = $('.main');
    if (!nav || !main) return;
    if (!$('[data-page="system"]')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'nav-item'; button.dataset.page = 'system';
      button.innerHTML = '<span class="nav-ico">◈</span><span>Центр управления</span>';
      nav.insertBefore(button, $('[data-page="community"]') || null);
      button.addEventListener('click', () => openSystemPage());
    }
    if (!$('#page-system')) {
      const page = document.createElement('section');
      page.className = 'page inner-page system-page'; page.id = 'page-system';
      page.innerHTML = `
        <div class="page-heading system-intro"><div><div class="section-kicker">SKYREALM · КОНТРОЛЬ</div><h1>Центр <span>управления</span></h1><p>Обновления, состояние сервисов, диагностика, облачные сохранения и показатели компьютера.</p></div><button class="secondary-btn" id="system-refresh" type="button">↻ Обновить всё</button></div>
        <div><div class="section-heading"><div><div class="section-kicker">СЕТЬ</div><h2>Состояние сервисов</h2></div><span class="heading-note" id="system-checked-at">Ещё не проверяли</span></div><div class="system-grid">
          <article class="system-card"><div class="system-state"><i class="system-dot checking" id="system-auth-dot"></i><span id="system-auth-title">Авторизация: проверка</span></div><p id="system-auth-copy">Вход и регистрация игроков</p></article>
          <article class="system-card"><div class="system-state"><i class="system-dot checking" id="system-coop-dot"></i><span id="system-coop-title">Кооператив: проверка</span></div><p id="system-coop-copy">Комнаты и совместные игровые сессии</p></article>
          <article class="system-card"><div class="system-state"><i class="system-dot checking" id="system-social-dot"></i><span id="system-social-title">Сообщество: проверка</span></div><p id="system-social-copy">Друзья, сообщения и приглашения</p></article>
        </div></div>
        <div><div class="section-heading"><div><div class="section-kicker">ВЕРСИИ И ФАЙЛЫ</div><h2>Центр обновлений</h2></div></div><article class="system-card">
          <div class="system-version-line"><span>Лаунчер</span><b id="system-launcher-version">—</b></div>
          <div class="system-version-line"><span>Игра</span><b id="system-game-version">—</b></div>
          <div class="system-version-line"><span>Доступно</span><b id="system-new-versions">Проверка…</b></div>
          <p class="system-note" id="system-update-message">Проверка версии не изменяет файлы. Обновление игры устанавливается отдельно от миров.</p>
          <div class="system-changelog" id="system-changelog">Описание последнего релиза появится после проверки манифеста.</div>
          <div class="system-actions"><button class="secondary-btn" id="system-check-updates" type="button">Проверить обновления</button><button class="primary-btn" id="system-install-update" type="button" disabled>Установить обновление игры</button><button class="secondary-btn" id="system-repair" type="button">Восстановить файлы</button><button class="secondary-btn" id="system-rollback" type="button" disabled>Откатить версию</button><a class="secondary-btn" id="system-release-link" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest" target="_blank" rel="noreferrer">Релизы лаунчера ↗</a></div>
        </article></div>
        <div><div class="section-heading"><div><div class="section-kicker">ПРОИЗВОДИТЕЛЬНОСТЬ</div><h2>Показатели компьютера</h2></div><span class="heading-note">Локально · не отправляется на сервер</span></div><article class="system-card"><div class="system-metrics">
          <div class="system-metric"><small>Процессор</small><b id="system-cpu">—</b></div><div class="system-metric"><small>Оперативная память</small><b id="system-ram">—</b></div><div class="system-metric"><small>Лаунчер</small><b id="system-process">—</b></div><div class="system-metric"><small>Место на диске</small><b id="system-disk">—</b></div>
        </div><p class="system-note" id="system-metrics-note">Показатели обновляются при открытии центра и по кнопке «Обновить всё».</p></article></div>
        <div><div class="section-heading"><div><div class="section-kicker">СОХРАНЕНИЯ</div><h2>Облачные миры</h2></div></div><article class="system-card"><h3>Резервная копия для другого компьютера</h3><p>Открой игру в режиме облачных сохранений. В меню выбора миров появятся кнопки загрузки в облако и безопасного восстановления. Перед восстановлением скачивается страховочная копия, а несовпадающие локальные миры сохраняются.</p><div class="system-actions"><button class="primary-btn" id="system-open-cloud" type="button">Открыть облачные сохранения в игре</button></div><p class="system-note">Для доступа требуется подтверждённый аккаунт. Облачный архив принадлежит только твоему аккаунту.</p></article></div>
        <div><div class="section-heading"><div><div class="section-kicker">ВОССТАНОВЛЕНИЕ</div><h2>Автоматическая диагностика</h2></div></div><article class="system-card"><p id="system-diagnostics-copy">Проверим наличие игровых файлов, версию, целостность и локальное хранилище миров. Ничего не удаляется.</p><div class="system-actions"><button class="secondary-btn" id="system-run-diagnostics" type="button">Проверить файлы игры</button><button class="secondary-btn" id="system-open-log" type="button">Открыть журнал</button><button class="secondary-btn" id="system-open-folder" type="button">Папка игры</button></div></article></div>
      `;
      main.append(page);
    }
  }
  function openSystemPage() {
    ensureSystemPage();
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active',page.id==='page-system'));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active',button.dataset.page==='system'));
    if ($('#crumb-label')) $('#crumb-label').textContent='ЦЕНТР УПРАВЛЕНИЯ';
    if ($('.main')) $('.main').scrollTop=0;
    refreshAll();
  }
  const CALENDAR_STORAGE_KEY='skyrealm_launcher_calendar_v1';
  const calendarDateKey=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  let calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let calendarSelectedDate=calendarDateKey(new Date());
  function readCalendarEvents(){
    try{const value=JSON.parse(localStorage.getItem(CALENDAR_STORAGE_KEY)||'[]');return Array.isArray(value)?value.filter(item=>item&&/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&typeof item.title==='string'):[];}catch(_){return [];}
  }
  function saveCalendarEvents(events){localStorage.setItem(CALENDAR_STORAGE_KEY,JSON.stringify(events.slice(-300)));}
  function ensureCalendarPage(){
    const nav=$('.nav'),main=$('.main');if(!nav||!main)return;
    if(!$('[data-page="calendar"]')){
      const button=document.createElement('button');button.type='button';button.className='nav-item';button.dataset.page='calendar';button.innerHTML='<span class="nav-ico">▦</span><span>Календарь</span>';
      nav.insertBefore(button,$('[data-page="screenshots"]')||null);button.addEventListener('click',openCalendarPage);
    }
    if(!$('#page-calendar')){
      const page=document.createElement('section');page.className='page inner-page calendar-page';page.id='page-calendar';
      page.innerHTML=`
        <div class="page-heading"><div><div class="section-kicker">SKYREALM · ПЛАНЫ</div><h1>Игровой <span>календарь</span></h1><p>Планируй игровые сессии, испытания и личные события. Записи сохраняются локально на этом компьютере.</p></div></div>
        <div class="calendar-layout"><section class="calendar-panel"><div class="calendar-month-head"><button class="secondary-btn" id="calendar-prev" type="button">←</button><b id="calendar-month-label"></b><button class="secondary-btn" id="calendar-next" type="button">→</button></div><div class="calendar-weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div><div class="calendar-days" id="calendar-days"></div></section>
        <section class="calendar-panel"><h2>Добавить событие</h2><label class="calendar-field">Название<input id="calendar-event-title" maxlength="70" placeholder="Например, вечер кооператива"></label><label class="calendar-field">Дата<input id="calendar-event-date" type="date"></label><label class="calendar-field">Тип<select id="calendar-event-type"><option value="session">Игровая сессия</option><option value="challenge">Испытание</option><option value="update">Обновление</option><option value="community">Событие сообщества</option></select></label><button class="primary-btn" id="calendar-event-add" type="button">Добавить в календарь</button><p class="calendar-status" id="calendar-status" aria-live="polite"></p><div class="calendar-event-list" id="calendar-event-list"></div></section></div>`;
      main.append(page);
    }
    if(!$('#calendar-prev')?.dataset.bound){
      $('#calendar-prev').dataset.bound='1';$('#calendar-prev').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();});
      $('#calendar-next').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();});
      $('#calendar-event-date').value=calendarSelectedDate;
      $('#calendar-event-add').addEventListener('click',()=>{
        const title=$('#calendar-event-title').value.trim(),date=$('#calendar-event-date').value,type=$('#calendar-event-type').value;
        if(!title||!date){$('#calendar-status').textContent='Укажи название и дату события.';return;}
        const events=readCalendarEvents();events.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),title,date,type});
        saveCalendarEvents(events);calendarSelectedDate=date;calendarMonth=new Date(date+'T12:00:00');$('#calendar-event-title').value='';$('#calendar-status').textContent='Событие сохранено.';renderCalendar();
      });
    }
  }
  function renderCalendar(){
    const grid=$('#calendar-days');if(!grid)return;grid.replaceChildren();
    const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),first=new Date(year,month,1),days=new Date(year,month+1,0).getDate(),offset=(first.getDay()+6)%7;
    $('#calendar-month-label').textContent=calendarMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const events=readCalendarEvents();
    for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.className='calendar-day blank';grid.append(blank);}
    for(let day=1;day<=days;day++){
      const date=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),count=events.filter(event=>event.date===date).length;
      const button=document.createElement('button');button.type='button';button.className='calendar-day'+(date===calendarSelectedDate?' selected':'')+(count?' has-events':'');button.textContent=String(day);
      if(count){const mark=document.createElement('i');mark.textContent=String(count);button.append(mark);}
      button.addEventListener('click',()=>{calendarSelectedDate=date;$('#calendar-event-date').value=date;renderCalendar();});grid.append(button);
    }
    const list=$('#calendar-event-list');list.replaceChildren();
    const selected=events.filter(event=>event.date===calendarSelectedDate).sort((a,b)=>a.title.localeCompare(b.title));
    const upcoming=selected.length?selected:events.filter(event=>event.date>=calendarDateKey(new Date())).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
    if(!upcoming.length){const empty=document.createElement('p');empty.className='calendar-status';empty.textContent='На эту дату событий нет. Добавь первое событие выше.';list.append(empty);}
    upcoming.forEach(event=>{
      const row=document.createElement('div');row.className='calendar-event-row';const info=document.createElement('div');
      const title=document.createElement('b');title.textContent=event.title;const meta=document.createElement('small');meta.textContent=event.date+' · '+({session:'Игровая сессия',challenge:'Испытание',update:'Обновление',community:'Событие сообщества'}[event.type]||'Событие');
      const remove=document.createElement('button');remove.type='button';remove.className='secondary-btn';remove.textContent='Удалить';remove.addEventListener('click',()=>{saveCalendarEvents(readCalendarEvents().filter(item=>item.id!==event.id));renderCalendar();});
      info.append(title,meta);row.append(info,remove);list.append(row);
    });
  }
  function openCalendarPage(){
    ensureCalendarPage();document.querySelectorAll('.page').forEach(page=>page.classList.toggle('active',page.id==='page-calendar'));
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.page==='calendar'));
    if($('#crumb-label'))$('#crumb-label').textContent='КАЛЕНДАРЬ';if($('.main'))$('.main').scrollTop=0;renderCalendar();
  }
  function ensureSupportPage(){
    const nav=$('.nav'),main=$('.main');if(!nav||!main)return;
    if(!$('[data-page="support"]')){
      const button=document.createElement('button');button.type='button';button.className='nav-item';button.dataset.page='support';button.innerHTML='<span class="nav-ico">?</span><span>Поддержка</span>';
      nav.insertBefore(button,$('[data-page="settings"]')||null);button.addEventListener('click',openSupportPage);
    }
    if(!$('#page-support')){
      const page=document.createElement('section');page.className='page inner-page support-page';page.id='page-support';
      page.innerHTML=`
        <div class="page-heading"><div><div class="section-kicker">SKYREALM · ПОМОЩЬ</div><h1>Центр <span>поддержки</span></h1><p>Если что-то не работает, собери диагностику и отправь отчёт разработчику.</p></div></div>
        <div class="support-grid"><article class="support-card"><b>Сообщить об ошибке</b><p>Опиши проблему и приложи скопированный диагностический отчёт.</p><a class="primary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/issues/new" target="_blank" rel="noopener">Создать обращение</a></article>
        <article class="support-card"><b>Обновления и инструкции</b><p>Открыть исходный код, описание проекта и последние версии лаунчера.</p><a class="secondary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher" target="_blank" rel="noopener">Репозиторий GitHub</a><a class="secondary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest" target="_blank" rel="noopener">Последний релиз</a></article></div>
        <article class="support-card support-diagnostics"><b>Диагностический отчёт</b><p id="support-diagnostics-status">Отчёт содержит версии, состояние файлов и локальные показатели компьютера. Пароли и токены авторизации в него не включаются.</p><button class="primary-btn" id="support-copy-diagnostics" type="button">Скопировать отчёт</button></article>`;
      main.append(page);
    }
    if(!$('#support-copy-diagnostics')?.dataset.bound){
      $('#support-copy-diagnostics').dataset.bound='1';$('#support-copy-diagnostics').addEventListener('click',copySupportDiagnostics);
    }
  }
  function openSupportPage(){
    ensureSupportPage();document.querySelectorAll('.page').forEach(page=>page.classList.toggle('active',page.id==='page-support'));
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.page==='support'));
    if($('#crumb-label'))$('#crumb-label').textContent='ПОДДЕРЖКА';if($('.main'))$('.main').scrollTop=0;
  }
  async function copySupportDiagnostics(){
    const status=$('#support-diagnostics-status');if(status)status.textContent='Собираем диагностику…';
    try{
      const api=window.pywebview?.api;if(!api?.get_diagnostics)throw new Error('Диагностика доступна в установленном Windows-лаунчере.');
      const [diagnostics,metrics]=await Promise.all([api.get_diagnostics(),api.get_system_metrics?.()||Promise.resolve({ok:false})]);
      const report={created_at:new Date().toISOString(),launcher_version:document.querySelector('.side-version')?.textContent||'',diagnostics,metrics};
      const content=JSON.stringify(report,null,2);
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(content);
      else{const area=document.createElement('textarea');area.value=content;document.body.append(area);area.select();document.execCommand('copy');area.remove();}
      if(status)status.textContent='Диагностический отчёт скопирован. Прикрепи его к обращению.';
    }catch(error){if(status)status.textContent=error.message||'Не удалось собрать отчёт.';}
  }

  function ensureScreenshotsPage() {
    const nav=$('.nav'),main=$('.main');if(!nav||!main)return;
    if(!$('[data-page="screenshots"]')){
      const button=document.createElement('button');button.type='button';button.className='nav-item';button.dataset.page='screenshots';
      button.innerHTML='<span class="nav-ico">▧</span><span>Скриншоты</span>';
      nav.insertBefore(button,$('[data-page="system"]')||null);
      button.addEventListener('click',openScreenshotsPage);
    }
    if(!$('#page-screenshots')){
      const page=document.createElement('section');page.className='page inner-page screenshots-page';page.id='page-screenshots';
      page.innerHTML=`
        <div class="page-heading"><div><div class="section-kicker">SKYREALM · ГАЛЕРЕЯ</div><h1>Мои <span>скриншоты</span></h1><p>Снимки игрового мира, сделанные клавишей F12. Файлы хранятся локально на этом компьютере.</p></div><div class="system-actions"><button class="secondary-btn" id="screenshots-refresh" type="button">↻ Обновить</button><button class="secondary-btn" id="screenshots-open-folder" type="button">Открыть папку</button></div></div>
        <p class="screenshots-status" id="screenshots-status" aria-live="polite"></p><div class="screenshots-grid" id="screenshots-grid"><div class="screenshots-empty">Загружаем галерею…</div></div>
        <div class="screenshot-viewer" id="screenshot-viewer" hidden aria-hidden="true"><div class="screenshot-viewer-panel"><div class="screenshot-viewer-head"><b id="screenshot-viewer-title">Скриншот</b><button class="secondary-btn" id="screenshot-viewer-close" type="button">Закрыть</button></div><img id="screenshot-viewer-image" alt="Скриншот SkyRealm"></div></div>`;
      main.append(page);
    }
    if(!$('#screenshots-refresh')?.dataset.bound){
      $('#screenshots-refresh').dataset.bound='1';$('#screenshots-refresh').addEventListener('click',refreshScreenshots);
      $('#screenshots-open-folder').addEventListener('click',async()=>{try{const result=await window.pywebview?.api?.open_screenshot_folder?.();if(!result?.ok)throw new Error(result?.message||'Папка скриншотов недоступна.');}catch(error){screenshotNotice(error.message||'Не удалось открыть папку скриншотов.');}});
      $('#screenshot-viewer-close').addEventListener('click',closeScreenshotViewer);
      $('#screenshot-viewer').addEventListener('click',event=>{if(event.target.id==='screenshot-viewer')closeScreenshotViewer();});
    }
  }
  function openScreenshotsPage(){
    ensureScreenshotsPage();
    document.querySelectorAll('.page').forEach(page=>page.classList.toggle('active',page.id==='page-screenshots'));
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.page==='screenshots'));
    if($('#crumb-label'))$('#crumb-label').textContent='СКРИНШОТЫ';
    if($('.main'))$('.main').scrollTop=0;
    refreshScreenshots();
  }
  function screenshotNotice(message){const status=$('#screenshots-status');if(status)status.textContent=message;else console.warn('[SkyRealm screenshots]',message);}
  function closeScreenshotViewer(){
    const viewer=$('#screenshot-viewer');if(!viewer)return;viewer.hidden=true;viewer.setAttribute('aria-hidden','true');$('#screenshot-viewer-image').removeAttribute('src');
  }
  async function refreshScreenshots(){
    const grid=$('#screenshots-grid');if(!grid)return;grid.replaceChildren();
    const api=window.pywebview?.api;
    if(typeof api?.get_screenshots!=='function'){grid.textContent='Галерея доступна в установленной Windows-версии лаунчера.';return;}
    try{
      const result=await api.get_screenshots();if(!result?.ok)throw new Error(result?.message||'Не удалось загрузить скриншоты.');
      const items=Array.isArray(result.screenshots)?result.screenshots:[];
      if(!items.length){grid.innerHTML='<div class="screenshots-empty"><b>Пока нет скриншотов</b><span>Запусти игру и нажми F12, чтобы сделать первый снимок.</span></div>';return;}
      items.forEach(item=>{
        const card=document.createElement('article');card.className='screenshot-card';
        const preview=document.createElement('div');preview.className='screenshot-card-preview';preview.textContent='▧';
        const details=document.createElement('div');details.className='screenshot-card-details';
        const title=document.createElement('b');title.textContent=item.name||'Скриншот';
        const meta=document.createElement('small');meta.textContent=(item.created_at||'')+' · '+(item.size_kb||0)+' КБ';
        const open=document.createElement('button');open.type='button';open.className='secondary-btn';open.textContent='Просмотреть';
        open.addEventListener('click',async()=>{
          try{const image=await api.get_screenshot_data(item.name);if(!image?.ok)throw new Error(image?.message||'Не удалось открыть скриншот.');
            $('#screenshot-viewer-title').textContent=item.name;$('#screenshot-viewer-image').src=image.data_url;
            const viewer=$('#screenshot-viewer');viewer.hidden=false;viewer.setAttribute('aria-hidden','false');
          }catch(error){screenshotNotice(error.message||'Не удалось открыть скриншот.');}
        });
        details.append(title,meta,open);card.append(preview,details);grid.append(card);
      });
    }catch(error){grid.textContent=error.message||'Галерея временно недоступна.';}
  }
  function setService(key,ok,detail) {
    const dot=$('#system-'+key+'-dot'),title=$('#system-'+key+'-title'),copy=$('#system-'+key+'-copy');
    if(!dot||!title||!copy)return;
    dot.className='system-dot '+(ok?'online':'offline');
    const labels={auth:'Авторизация',coop:'Кооператив',social:'Сообщество'};
    title.textContent=labels[key]+(ok?' · работает':' · нет связи');
    copy.textContent=detail|| (ok?'Сервис отвечает':'Проверь интернет или попробуй позже.');
  }
  async function pingService(url) {
    if(!url||!apiKey)return {ok:false,message:'URL или ключ сервиса не настроен.'};
    const endpoint=new URL(url); endpoint.searchParams.set('route','/health');
    const response=await fetch(endpoint.toString(),{headers:{apikey:apiKey,Authorization:'Bearer '+apiKey},cache:'no-store'});
    const data=await response.json();
    if(!response.ok||data.status!=='ok')throw new Error(data.message||'HTTP '+response.status);
    return {ok:true,message:'Версия сервиса '+(data.version||'доступна')};
  }
  async function getAccessToken() {
    let token=localStorage.getItem('skyrealm_token')||sessionStorage.getItem('skyrealm_token')||'';
    if(!token)return '';
    const expires=Number(localStorage.getItem('skyrealm_token_expires_at')||0);
    const refresh=localStorage.getItem('skyrealm_refresh_token')||'';
    if(refresh&&expires&&expires<Date.now()+60_000){
      const endpoint=new URL(authUrl);endpoint.searchParams.set('route','/api/auth/refresh');
      const response=await fetch(endpoint.toString(),{method:'POST',headers:{apikey:apiKey,Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh}),cache:'no-store'});
      const data=await response.json();
      if(response.ok&&data.access_token){
        token=data.access_token;localStorage.setItem('skyrealm_token',token);
        if(data.refresh_token)localStorage.setItem('skyrealm_refresh_token',data.refresh_token);
        localStorage.setItem('skyrealm_token_expires_at',String(Date.now()+Math.max(60,Number(data.expires_in)||3600)*1000));
      }
    }
    return token;
  }
  async function socialGet(route) {
    const token=await getAccessToken();
    if(!token)throw new Error('Войди в аккаунт, чтобы видеть уведомления.');
    const endpoint=new URL(socialUrl);endpoint.searchParams.set('route',route);
    const response=await fetch(endpoint.toString(),{headers:{apikey:apiKey,Authorization:'Bearer '+token},cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||'Ошибка сервиса уведомлений.');
    return data;
  }
  function addNotificationControl() {
    const actions=$('.top-actions');
    if(!actions||$('#system-notification-trigger'))return;
    const button=document.createElement('button');button.type='button';button.className='system-notification-button';
    button.id='system-notification-trigger';button.setAttribute('aria-label','Открыть уведомления');button.setAttribute('aria-expanded','false');
    button.innerHTML='♧<span class="system-notification-count" id="system-notification-count" hidden>0</span>';
    const status=$('#cloud-status-pill');if(status)actions.insertBefore(button,status.nextSibling);else actions.prepend(button);
    notificationCount=$('#system-notification-count');
    notificationPanel=document.createElement('div');notificationPanel.id='system-notification-panel';notificationPanel.className='system-notification-panel';notificationPanel.hidden=true;
    notificationPanel.innerHTML='<div class="system-notification-head"><b>Уведомления</b><button class="secondary-btn" id="system-notification-refresh" type="button">Обновить</button></div><div class="system-notification-list" id="system-notification-list"><div class="system-empty">Загружаем уведомления…</div></div>';
    document.body.append(notificationPanel);notificationList=$('#system-notification-list');
    button.addEventListener('click',()=>{notificationPanel.hidden=!notificationPanel.hidden;button.setAttribute('aria-expanded',String(!notificationPanel.hidden));if(!notificationPanel.hidden)refreshNotifications();});
    $('#system-notification-refresh').addEventListener('click',refreshNotifications);
    document.addEventListener('click',event=>{if(!notificationPanel.contains(event.target)&&!button.contains(event.target)){notificationPanel.hidden=true;button.setAttribute('aria-expanded','false');}});
  }
  function renderNotifications(items,error='') {
    if(!notificationList)return;
    notificationList.replaceChildren();
    if(error){const e=document.createElement('div');e.className='system-empty system-error';e.textContent=error;notificationList.append(e);return;}
    if(!items.length){const e=document.createElement('div');e.className='system-empty';e.textContent='Новых уведомлений нет.';notificationList.append(e);return;}
    items.forEach(item=>{
      const button=document.createElement('button');button.type='button';button.className='system-notification-item';
      const title=document.createElement('b');title.textContent=item.title||'Уведомление';
      const body=document.createElement('span');body.textContent=item.body||'';
      const time=document.createElement('small');time.textContent=item.created_at?new Date(item.created_at).toLocaleString():'';
      button.append(title,body,time);
      button.addEventListener('click',()=>{
        notificationPanel.hidden=true;
        if(item.type==='update'){openSystemPage();return;}
        const community=document.querySelector('[data-page="community"]');if(community)community.click();
      });
      notificationList.append(button);
    });
  }
  async function refreshNotifications() {
    if(!notificationList)return;
    try{
      const data=await socialGet('/api/social/notifications');
      cachedNotifications=Array.isArray(data.notifications)?data.notifications:[];
      const count=Number(data.unread_count)||cachedNotifications.length;
      if(notificationCount){notificationCount.hidden=count===0;notificationCount.textContent=count>99?'99+':String(count);}
      renderNotifications(cachedNotifications);
    }catch(error){renderNotifications([],error.message||'Не удалось загрузить уведомления.');if(notificationCount)notificationCount.hidden=true;}
  }
  async function checkUpdates() {
    const status=$('#system-update-message');if(status)status.textContent='Проверяем manifest и текущую установку…';
    try{
      let result=null;
      if(window.pywebview?.api?.get_update_status)result=await window.pywebview.api.get_update_status();
      else{
        const response=await fetch(manifestUrl+'?ts='+Date.now(),{cache:'no-store'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const manifest=await response.json();result={ok:true,launcher_version:'предпросмотр',latest_launcher_version:manifest.version,game_version:'—',latest_game_version:manifest.game_version,launcher_update_available:false,game_update_available:false,rollback_available:false,notes:manifest.notes,release_url:'https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest'};
      }
      if(!result?.ok)throw new Error(result?.message||'Не удалось получить сведения об обновлении.');
      cachedUpdate=result;
      $('#system-launcher-version').textContent=(result.launcher_version||'—')+' → '+(result.latest_launcher_version||'—');
      $('#system-game-version').textContent=(result.game_version||'—')+' → '+(result.latest_game_version||'—');
      const available=[];
      if(result.launcher_update_available)available.push('новый лаунчер');
      if(result.game_update_available)available.push('новая игра');
      $('#system-new-versions').textContent=available.join(', ')||'нет';
      $('#system-install-update').disabled=!result.game_update_available;
      $('#system-rollback').disabled=!result.rollback_available;
      $('#system-update-message').textContent=result.launcher_update_available?'Доступен новый лаунчер. Он установится через встроенный механизм при следующем запуске.':(result.game_update_available?'Доступно обновление игры. Перед установкой закрой игру.':'Установлены последние версии.');
      $('#system-changelog').textContent=result.notes||'В манифесте нет описания этого релиза.';
      $('#system-release-link').href=result.release_url||'https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest';
      return result;
    }catch(error){if(status)status.textContent=error.message||'Проверка обновлений не удалась.';return null;}
  }
  async function runUpdateAction(action,buttonId) {
    const button=$(buttonId),message=$('#system-update-message');
    if(!window.pywebview?.api?.[action]){if(message)message.textContent='Операция доступна в установленном Windows-лаунчере.';return;}
    if(button)button.disabled=true;
    if(message)message.textContent='Выполняется операция. Не закрывай лаунчер…';
    try{
      const result=await window.pywebview.api[action]();
      if(!result?.ok)throw new Error(result?.message||'Операция не выполнена.');
      if(message)message.textContent=result.message||'Готово.';
      await checkUpdates();
    }catch(error){if(message)message.textContent=error.message||'Операция не выполнена.';}
    finally{if(button)button.disabled=false;}
  }
  async function refreshServices() {
    const checks=[['auth',authUrl],['coop',coopUrl],['social',socialUrl]];
    await Promise.all(checks.map(async([key,url])=>{try{const result=await pingService(url);setService(key,result.ok,result.message);}catch(error){setService(key,false,error.message||'Сервис не отвечает');}}));
    $('#system-checked-at').textContent='Проверено в '+currentTime();
  }
  async function refreshMetrics() {
    const api=window.pywebview?.api;
    if(!api?.get_system_metrics){$('#system-metrics-note').textContent='Показатели доступны в установленной Windows-версии.';return;}
    try{
      const m=await api.get_system_metrics();if(!m?.ok)throw new Error(m?.message||'Метрики недоступны');
      $('#system-cpu').textContent=m.cpu_percent==null?'—':m.cpu_percent+'%';
      $('#system-ram').textContent=m.ram_percent==null?'—':m.ram_percent+'% · '+(m.ram_used_mb||0)+' / '+(m.ram_total_mb||0)+' МБ';
      $('#system-process').textContent=m.process_memory_mb==null?'—':m.process_memory_mb+' МБ';
      $('#system-disk').textContent=m.disk_free_gb==null?'—':m.disk_free_gb+' ГБ свободно';
      $('#system-metrics-note').textContent='Игра занимает '+(m.game_size_mb==null?'—':m.game_size_mb+' МБ')+'. Данные вычислены на этом компьютере.';
    }catch(error){$('#system-metrics-note').textContent=error.message||'Не удалось прочитать метрики.';}
  }
  async function refreshDiagnostics() {
    const node=$('#system-diagnostics-copy');
    if(!window.pywebview?.api?.get_diagnostics){node.textContent='Полная проверка файлов доступна в Windows-лаунчере.';return;}
    node.textContent='Проверяем игровые файлы и локальные данные…';
    try{
      const result=await window.pywebview.api.get_diagnostics();if(!result?.ok)throw new Error(result?.message||'Диагностика не выполнена');
      node.textContent=(result.healthy?'Основные файлы на месте. ':'Нужен ремонт. ')+'Версия: '+result.version+'. Отсутствуют: '+((result.missing||[]).join(', ')||'нет')+'. Хранилище миров: '+(result.world_storage_found?'найдено':'ещё не создано')+'.';
    }catch(error){node.textContent=error.message||'Ошибка диагностики.';}
  }
  async function refreshAll() {
    await Promise.all([refreshServices(),checkUpdates(),refreshMetrics(),refreshDiagnostics(),refreshNotifications()]);
  }
  function bindSystemActions() {
    $('#system-refresh')?.addEventListener('click',refreshAll);
    $('#system-check-updates')?.addEventListener('click',checkUpdates);
    $('#system-install-update')?.addEventListener('click',()=>runUpdateAction('install_game_update','#system-install-update'));
    $('#system-repair')?.addEventListener('click',()=>runUpdateAction('repair_game_files','#system-repair'));
    $('#system-rollback')?.addEventListener('click',async()=>{
      if(!confirm('Вернуть предыдущую версию игры? Сохранения миров не затрагиваются.'))return;
      await runUpdateAction('rollback_game_update','#system-rollback');
    });
    $('#system-run-diagnostics')?.addEventListener('click',refreshDiagnostics);
    $('#system-open-log')?.addEventListener('click',()=>window.pywebview?.api?.open_update_log?.());
    $('#system-open-folder')?.addEventListener('click',()=>window.pywebview?.api?.open_game_folder?.());
    $('#system-open-cloud')?.addEventListener('click',async()=>{
      const message=$('#system-update-message');
      try{
        const token=await getAccessToken();
        if(!token)throw new Error('Сначала войди в аккаунт SkyRealm.');
        if(!window.pywebview?.api?.launch_game)throw new Error('Облачные сохранения открываются из Windows-лаунчера.');
        const result=await window.pywebview.api.launch_game(null,true,token,'__cloud_saves__');
        if(!result?.ok)throw new Error(result?.message||'Не удалось открыть игру.');
        await window.pywebview.api.close();
      }catch(error){if(message)message.textContent=error.message||'Не удалось открыть облачные сохранения.';}
    });
  }
  function init() {
    ensureSystemPage();ensureCalendarPage();ensureSupportPage();ensureScreenshotsPage();addNotificationControl();bindSystemActions();
    refreshServices();refreshNotifications();
    pollTimer=window.setInterval(()=>{refreshNotifications();refreshServices();},45_000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();