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
  let launcherNavigationBound = false, launcherEnhancementsInitialized = false;

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
        <div class="system-shortcuts" aria-label="Быстрые разделы"><button class="secondary-btn" id="system-open-screenshots" type="button">▧ Открыть скриншоты</button><button class="secondary-btn" id="system-open-support" type="button">? Открыть поддержку</button></div>
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
  const DAILY_CALENDAR_REWARDS=[
    {amount:50,label:'Стартовый подарок',icon:'🎁'},
    {amount:60,label:'Маленький запас',icon:'🪙'},
    {amount:70,label:'Горсть жетонов',icon:'✨'},
    {amount:80,label:'Награда исследователя',icon:'🧭'},
    {amount:90,label:'Сокровище путника',icon:'💎'},
    {amount:100,label:'Дневной бонус',icon:'🎒'},
    {amount:180,label:'Недельный сундук',icon:'🏆'},
    {amount:60,label:'Запас энергии',icon:'⚡'},
    {amount:70,label:'Кристальный подарок',icon:'💠'},
    {amount:80,label:'Награда за верность',icon:'🌟'},
    {amount:90,label:'Золотой запас',icon:'🪙'},
    {amount:100,label:'Сундук приключений',icon:'🧰'},
    {amount:120,label:'Редкая находка',icon:'💜'},
    {amount:220,label:'Большой недельный сундук',icon:'🏆'},
    {amount:80,label:'Подарок странника',icon:'🎁'},
    {amount:90,label:'Кристаллы',icon:'💎'},
    {amount:100,label:'Награда исследователя',icon:'🧭'},
    {amount:110,label:'Золотой запас',icon:'🪙'},
    {amount:120,label:'Сундук удачи',icon:'🧰'},
    {amount:140,label:'Редкая награда',icon:'💠'},
    {amount:280,label:'Недельный сундук+',icon:'🏆'},
    {amount:100,label:'Подарок SkyRealm',icon:'✨'},
    {amount:110,label:'Запас кристаллов',icon:'💎'},
    {amount:120,label:'Награда за вход',icon:'🎒'},
    {amount:130,label:'Золотой подарок',icon:'🪙'},
    {amount:150,label:'Сокровище',icon:'💜'},
    {amount:170,label:'Большая находка',icon:'🧰'},
    {amount:350,label:'Эпический сундук',icon:'🏆'},
    {amount:180,label:'Предфинальный подарок',icon:'🌟'},
    {amount:500,label:'Легендарная награда месяца',icon:'👑'}
  ];
  const CALENDAR_REWARD_STATE_KEY='skyrealm_calendar_reward_state_v1';
  function calendarRewardAccountKey(){
    const email=$('#profile-email')?.textContent?.trim().toLowerCase();
    return email&&email!=='—'?'account:'+email:'local-device';
  }
  function readCalendarRewardState(){
    try{
      const all=JSON.parse(localStorage.getItem(CALENDAR_REWARD_STATE_KEY)||'{}');
      const value=all&&typeof all==='object'?all[calendarRewardAccountKey()]:null;
      return {balance:Math.max(0,Number(value?.balance)||0),streak:Math.max(0,Number(value?.streak)||0),lastClaimDate:/^\d{4}-\d{2}-\d{2}$/.test(value?.lastClaimDate||'')?value.lastClaimDate:'',claimedDates:Array.isArray(value?.claimedDates)?value.claimedDates.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)):[]};
    }catch(_){return {balance:0,streak:0,lastClaimDate:'',claimedDates:[]};}
  }
  function saveCalendarRewardState(state){
    try{const all=JSON.parse(localStorage.getItem(CALENDAR_REWARD_STATE_KEY)||'{}');all[calendarRewardAccountKey()]=state;localStorage.setItem(CALENDAR_REWARD_STATE_KEY,JSON.stringify(all));}catch(_){}
  }
  function renderDailyRewards(){
    const grid=$('#calendar-reward-days');if(!grid)return;
    const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),days=new Date(year,month+1,0).getDate();
    const today=calendarDateKey(new Date()),state=readCalendarRewardState(),claimed=new Set(state.claimedDates);
    const todayClaimed=claimed.has(today);
    $('#calendar-reward-month').textContent=calendarMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    $('#calendar-reward-balance').textContent=state.balance.toLocaleString('ru-RU');
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const streakActive=state.lastClaimDate===today||state.lastClaimDate===calendarDateKey(yesterday);
    $('#calendar-reward-streak').textContent=String(streakActive?state.streak:0);
    grid.replaceChildren();
    for(let day=1;day<=days;day++){
      const date=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      const reward=DAILY_CALENDAR_REWARDS[(day-1)%DAILY_CALENDAR_REWARDS.length];
      const isClaimed=claimed.has(date),isToday=date===today;
      const cell=document.createElement('button');cell.type='button';
      cell.className='daily-reward-day'+(isToday?' today':'')+(isClaimed?' claimed':'')+(date<today&&!isClaimed?' missed':'');
      cell.disabled=!isToday||isClaimed;
      const number=document.createElement('span');number.className='daily-reward-number';number.textContent=String(day);
      const icon=document.createElement('b');icon.className='daily-reward-icon';icon.textContent=reward.icon;
      const amount=document.createElement('strong');amount.textContent='+'+reward.amount;
      const stateLabel=document.createElement('small');stateLabel.textContent=isClaimed?'Получено':isToday?'Доступно':date<today?'Пропущено':'Закрыто';
      cell.append(number,icon,amount,stateLabel);grid.append(cell);
    }
    const claim=$('#calendar-claim-today');
    if(claim){claim.disabled=todayClaimed;claim.textContent=todayClaimed?'✓ Награда за сегодня получена':'Забрать награду за сегодня';}
    const status=$('#calendar-reward-status');
    if(status)status.textContent=todayClaimed?'Сегодняшняя награда уже добавлена в твой баланс.':'Заходи каждый день и забирай жетоны. Награда доступна один раз в сутки.';
  }
  function claimCalendarDailyReward(){
    const today=calendarDateKey(new Date()),state=readCalendarRewardState();
    if(state.claimedDates.includes(today)){const status=$('#calendar-reward-status');if(status)status.textContent='Сегодня ты уже забрал награду.';return;}
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
    const yesterdayKey=calendarDateKey(yesterday);
    state.streak=state.lastClaimDate===yesterdayKey?state.streak+1:1;
    const day=new Date().getDate(),reward=DAILY_CALENDAR_REWARDS[(day-1)%DAILY_CALENDAR_REWARDS.length];
    const streakBonus=state.streak>0&&state.streak%7===0?50:0;
    const total=reward.amount+streakBonus;
    state.balance+=total;state.lastClaimDate=today;state.claimedDates.push(today);
    state.claimedDates=state.claimedDates.slice(-400);
    saveCalendarRewardState(state);
    const status=$('#calendar-reward-status');
    renderDailyRewards();
    if(status)status.textContent='Получено: '+reward.label+' · +'+total+' жетонов'+(streakBonus?' (включая бонус за серию входов)':'')+'.';
  }
  function ensureCalendarPage(){
    const nav=$('.nav'),main=$('.main');if(!nav||!main)return;
    if(!$('[data-page="calendar"]')){
      const button=document.createElement('button');button.type='button';button.className='nav-item';button.dataset.page='calendar';button.innerHTML='<span class="nav-ico">▦</span><span>Календарь</span>';
      nav.insertBefore(button,$('[data-page="screenshots"]')||null);button.dataset.bound='1';button.addEventListener('click',openCalendarPage);
    }
    if(!$('#page-calendar')){
      const page=document.createElement('section');page.className='page inner-page calendar-page';page.id='page-calendar';
      page.innerHTML=`
        <div class="page-heading"><div><div class="section-kicker">SKYREALM · ЕЖЕДНЕВНЫЕ ПОДАРКИ</div><h1>Календарь <span>наград</span></h1><p>Заходи каждый день, забирай подарок и собирай серию входов. Награды и баланс сохраняются отдельно для каждого аккаунта на этом компьютере.</p></div></div>
        <section class="daily-rewards-panel">
          <div class="daily-rewards-top"><div><div class="section-kicker">ПОДАРОК КАЖДЫЙ ДЕНЬ</div><h2>Твои ежедневные награды</h2><p>Отмечай каждый день и получай жетоны лаунчера. За каждые 7 дней подряд начисляется +50 бонусных жетонов. Жетоны пока не являются игровым золотом или кристаллами.</p></div><div class="daily-rewards-stats"><div><small>Баланс жетонов</small><b id="calendar-reward-balance">0</b></div><div><small>Дней подряд</small><b id="calendar-reward-streak">0</b></div></div></div>
          <div class="daily-reward-month-label" id="calendar-reward-month"></div>
          <div class="daily-reward-weekdays"><span>ПН</span><span>ВТ</span><span>СР</span><span>ЧТ</span><span>ПТ</span><span>СБ</span><span>ВС</span></div>
          <div class="daily-reward-grid" id="calendar-reward-days"></div>
          <div class="daily-rewards-claim-row"><div><b>Подарок за сегодняшний вход</b><p class="calendar-status" id="calendar-reward-status">Награда доступна один раз в сутки.</p></div><button class="primary-btn" id="calendar-claim-today" type="button">Забрать награду за сегодня</button></div>
        </section>
        <div class="page-heading calendar-events-heading"><div><div class="section-kicker">ТВОИ ПЛАНЫ</div><h2>События и игровые сессии</h2><p>Планируй испытания, встречи и личные события.</p></div></div>
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
    if(!$('#calendar-claim-today')?.dataset.bound){$('#calendar-claim-today').dataset.bound='1';$('#calendar-claim-today').addEventListener('click',claimCalendarDailyReward);}
    const navButton=$('[data-page="calendar"]');if(navButton&&!navButton.dataset.bound){navButton.dataset.bound='1';navButton.addEventListener('click',openCalendarPage);}
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
    renderDailyRewards();
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
        <div class="support-grid"><article class="support-card"><b>Написать по электронной почте</b><p>Для вопросов, сообщений об ошибках и предложений.</p><a class="primary-btn" href="mailto:kisia319@gmail.com">kisia319@gmail.com</a></article>
        <article class="support-card"><b>Связаться по телефону</b><p>Контактный номер поддержки SkyRealm.</p><a class="secondary-btn" href="tel:+79962819878">+7 996 281 9878</a></article>
        <article class="support-card"><b>Сообщить об ошибке на GitHub</b><p>Создай обращение и приложи диагностический отчёт.</p><a class="secondary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/issues/new" target="_blank" rel="noopener">Создать обращение ↗</a></article>
        <article class="support-card"><b>Обновления и инструкции</b><p>Открыть исходный код и последние версии лаунчера.</p><a class="secondary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher" target="_blank" rel="noopener">Репозиторий GitHub</a><a class="secondary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest" target="_blank" rel="noopener">Последний релиз</a></article></div>
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
        <div class="page-heading"><div><div class="section-kicker">SKYREALM · ГАЛЕРЕЯ</div><h1>Мои <span>скриншоты</span></h1><p>В игре нажми F12 — снимок PNG сохранится на компьютере автоматически. Здесь можно просмотреть и скачать сохранённые снимки.</p></div><div class="system-actions"><button class="secondary-btn" id="screenshots-refresh" type="button">↻ Обновить</button><button class="secondary-btn" id="screenshots-open-folder" type="button">Открыть папку</button></div></div>
        <p class="screenshots-status" id="screenshots-status" aria-live="polite"></p><div class="screenshots-grid" id="screenshots-grid"><div class="screenshots-empty">Загружаем галерею…</div></div>
        <div class="screenshot-viewer" id="screenshot-viewer" hidden aria-hidden="true"><div class="screenshot-viewer-panel"><div class="screenshot-viewer-head"><b id="screenshot-viewer-title">Скриншот</b><div class="system-actions"><a class="secondary-btn" id="screenshot-viewer-download" hidden>Скачать PNG</a><button class="secondary-btn" id="screenshot-viewer-close" type="button">Закрыть</button></div></div><img id="screenshot-viewer-image" alt="Скриншот SkyRealm"></div></div>`;
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
    const download=$('#screenshot-viewer-download');if(download){download.hidden=true;download.removeAttribute('href');download.removeAttribute('download');}
  }
  async function refreshScreenshots(){
    const grid=$('#screenshots-grid');if(!grid)return;grid.replaceChildren();
    const api=window.pywebview?.api;
    if(typeof api?.get_screenshots!=='function'){grid.textContent='Галерея и локальное сохранение доступны в установленной Windows-версии лаунчера.';return;}
    try{
      const result=await api.get_screenshots();if(!result?.ok)throw new Error(result?.message||'Не удалось загрузить скриншоты.');
      const items=Array.isArray(result.screenshots)?result.screenshots:[];
      if(!items.length){grid.innerHTML='<div class="screenshots-empty"><b>Пока нет скриншотов</b><span>Запусти игру и нажми F12. Снимок сохранится в папке SkyRealm\\screenshots.</span></div>';return;}
      items.slice(0,24).forEach((item,index)=>{
        const card=document.createElement('article');card.className='screenshot-card';
        const preview=document.createElement('div');preview.className='screenshot-card-preview';preview.textContent='▧';
        const details=document.createElement('div');details.className='screenshot-card-details';
        const title=document.createElement('b');title.textContent=item.name||'Скриншот';
        const meta=document.createElement('small');meta.textContent=(item.created_at||'')+' · '+(item.size_kb||0)+' КБ';
        if(index<8&&item.name&&typeof api.get_screenshot_data==='function'){
          const thumbnail=document.createElement('img');thumbnail.className='screenshot-thumbnail';thumbnail.loading='lazy';thumbnail.decoding='async';thumbnail.alt='Предпросмотр '+item.name;
          preview.replaceChildren(thumbnail);
          api.get_screenshot_data(item.name).then(image=>{
            if(image?.ok&&image.data_url)thumbnail.src=image.data_url;
            else{thumbnail.remove();preview.textContent='Предпросмотр недоступен';}
          }).catch(()=>{thumbnail.remove();preview.textContent='▧';});
        }
        const open=document.createElement('button');open.type='button';open.className='secondary-btn';open.textContent='Просмотреть';
        open.addEventListener('click',async()=>{
          try{
            const image=await api.get_screenshot_data(item.name);if(!image?.ok||!image.data_url)throw new Error(image?.message||'Не удалось открыть скриншот.');
            $('#screenshot-viewer-title').textContent=item.name;$('#screenshot-viewer-image').src=image.data_url;
            const download=$('#screenshot-viewer-download');download.href=image.data_url;download.download=item.name;download.hidden=false;
            const viewer=$('#screenshot-viewer');viewer.hidden=false;viewer.setAttribute('aria-hidden','false');
          }catch(error){screenshotNotice(error.message||'Не удалось открыть скриншот.');}
        });
        details.append(title,meta,open);card.append(preview,details);grid.append(card);
      });
      if(items.length>24)screenshotNotice('Показаны последние 24 скриншота из '+items.length+'. Остальные файлы остаются в папке снимков.');
      else screenshotNotice('Скриншотов: '+items.length+'. Нажми F12 в игре, чтобы сохранить новый снимок.');
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
    const status=$('#system-update-message');
    const versions=$('#system-new-versions');
    const install=$('#system-install-update');
    if(status)status.textContent='Проверяем манифест и установленную версию…';
    if(versions)versions.textContent='Проверка…';
    if(install)install.disabled=true;
    try{
      let result=null;
      const api=window.pywebview?.api;
      if(api?.get_update_status){
        let timeoutId;
        try{
          result=await Promise.race([
            api.get_update_status(),
            new Promise((_,reject)=>{timeoutId=window.setTimeout(()=>reject(new Error('Локальная проверка лаунчера не ответила за 12 секунд.')),12000);})
          ]);
        }finally{if(timeoutId)window.clearTimeout(timeoutId);}
      }else{
        throw new Error('Локальный модуль проверки обновлений недоступен в этой сборке лаунчера.');
      }
      if(!result?.ok)throw new Error(result?.message||'Не удалось получить сведения об обновлении.');
      cachedUpdate=result;
      $('#system-launcher-version').textContent=(result.launcher_version||'—')+' → '+(result.latest_launcher_version||'—');
      $('#system-game-version').textContent=(result.game_version||'—')+' → '+(result.latest_game_version||'—');
      const available=[];
      if(result.launcher_update_available)available.push('новый лаунчер');
      if(result.game_update_available)available.push('новая игра');
      if(versions)versions.textContent=result.game_version_state==='installed_newer'?'установлена более новая версия':(result.game_version_state==='unknown'?'не удалось сравнить версии':(available.join(', ')||'нет'));
      if(install)install.disabled=!result.game_update_available;
      $('#system-rollback').disabled=!result.rollback_available;
      const gameAhead=result.game_version_state==='installed_newer';
      const gameUnknown=result.game_version_state==='unknown';
      if(status){
        if(result.launcher_update_available)status.textContent='Доступен новый лаунчер. Он установится через встроенный механизм при следующем запуске.';
        else if(result.game_update_available)status.textContent='Доступно обновление игры. Перед установкой закрой игру.';
        else if(gameAhead)status.textContent='У тебя установлена игра новее опубликованной версии ('+(result.game_version||'—')+' > '+(result.latest_game_version||'—')+'). Обновление и восстановление более старой версии заблокированы. Ожидается публикация свежего пакета.';
        else if(gameUnknown)status.textContent='Не удалось корректно сравнить версии игры. Установка и восстановление заблокированы до исправления манифеста.';
        else status.textContent='Установлены последние опубликованные версии.';
      }
      $('#system-changelog').textContent=result.notes||'В манифесте нет описания этого релиза.';
      $('#system-release-link').href=result.release_url||'https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest';
      return result;
    }catch(error){
      const message=error?.message||'Проверка обновлений не удалась.';
      if(versions)versions.textContent='Ошибка проверки';
      if(status)status.textContent=message+' Нажми «Проверить обновления», чтобы повторить попытку.';
      $('#system-launcher-version').textContent='—';
      $('#system-game-version').textContent='—';
      $('#system-changelog').textContent='Не удалось получить подтверждённые сведения о версиях.';
      if(install)install.disabled=true;
      cachedUpdate=null;
      return null;
    }
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
    $('#system-open-screenshots')?.addEventListener('click',openScreenshotsPage);
    $('#system-open-support')?.addEventListener('click',openSupportPage);
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

  const roadmapUrl = authUrl.replace('skyrealm-auth','skyrealm-roadmap');
  function escapeRoadmap(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function roadmapApi(route,method='GET',payload){const token=await getAccessToken();if(!token)throw new Error('Войди в аккаунт SkyRealm, чтобы голосовать и отправлять идеи.');const endpoint=new URL(roadmapUrl);endpoint.searchParams.set('route',route);const response=await fetch(endpoint.toString(),{method,headers:{apikey:apiKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'Сервис голосования временно недоступен.');return data;}
  function ensureRoadmapPage(){
    const nav=$('.nav'),main=$('.main');if(!nav||!main)return;
    if(!$('[data-page="roadmap"]')){const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.page='roadmap';b.innerHTML='<span class="nav-ico">◉</span><span>Голосования игроков</span>';nav.insertBefore(b,$('[data-page="community"]')||null);}
    if(!$('#page-roadmap')){
      const page=document.createElement('section');page.className='page inner-page roadmap-page';page.id='page-roadmap';
      page.innerHTML=`
      <div class="page-heading roadmap-heading"><div><div class="section-kicker">SKYREALM · ГОЛОС ИГРОКОВ</div><h1>Будущее <span>SkyRealm</span></h1><p>Выбирай следующие обновления, предлагай идеи и следи за развитием проекта.</p></div><button class="secondary-btn" id="roadmap-refresh" type="button">↻ Обновить</button></div>
      <div class="roadmap-tabs"><button class="roadmap-tab active" data-roadmap-tab="voting" type="button">Голосования</button><button class="roadmap-tab" data-roadmap-tab="roadmap" type="button">Дорожная карта</button><button class="roadmap-tab" data-roadmap-tab="history" type="button">История изменений</button></div>
      <section class="roadmap-panel active" id="roadmap-voting-panel"><div class="roadmap-section-head"><div><div class="section-kicker">ВЫБОР ИГРОКОВ</div><h2>За что голосуем дальше?</h2><p>Один голос на одну идею от аккаунта. Результаты обновляются с сервера.</p></div><span class="roadmap-live">● ОНЛАЙН</span></div><div class="roadmap-vote-list" id="roadmap-vote-list"><div class="roadmap-empty">Загружаем голосования…</div></div>
      <form class="roadmap-suggest-form" id="roadmap-suggest-form"><div class="roadmap-form-head"><span class="roadmap-form-icon">✦</span><div><b>Предложить свою идею</b><small>Похожие предложения объединяются. Если одну идею предложат минимум три разных игрока, она попадёт в голосование.</small></div></div><label for="roadmap-idea-title">Название идеи</label><input id="roadmap-idea-title" maxlength="72" minlength="5" required placeholder="Например: новые морские боссы"><label for="roadmap-idea-description">Подробности (необязательно)</label><textarea id="roadmap-idea-description" maxlength="500" rows="3" placeholder="Опиши, что именно хотелось бы увидеть…"></textarea><div class="roadmap-form-bottom"><span id="roadmap-suggest-status" role="status">До 5 идей в сутки от одного аккаунта.</span><button class="primary-btn" type="submit">Отправить идею <span>→</span></button></div></form></section>
      <section class="roadmap-panel" id="roadmap-roadmap-panel"><div class="roadmap-section-head"><div><div class="section-kicker">ПЛАН РАЗРАБОТКИ</div><h2>Дорожная карта SkyRealm</h2><p>Статусы отражают текущее состояние направлений разработки.</p></div></div><div class="roadmap-lanes"><article class="roadmap-lane"><h3><i class="roadmap-status-dot done"></i> Уже сделано</h3><ul><li>Большой обычный мир с шахтами и ресурсами</li><li>Морские экспедиции, корабли и морские существа</li><li>Боссы, боевые комбо и кинематографические суперудары</li><li>Кооператив, друзья и облачные сохранения</li><li>Профессии, контракты и технологическое развитие</li></ul></article><article class="roadmap-lane"><h3><i class="roadmap-status-dot progress"></i> Разрабатывается</h3><ul><li>Уникальные добивания и дополнительные фазы боссов</li><li>Развитие событий и контента разных миров</li><li>Улучшение лаунчера, истории обновлений и голосований</li></ul></article><article class="roadmap-lane"><h3><i class="roadmap-status-dot planned"></i> Планируется</h3><ul><li>Новые острова, биомы и исследовательские события</li><li>Развитие поселений и взаимодействия с NPC</li><li>Новые испытания, предметы и производственные цепочки</li></ul></article></div></section>
      <section class="roadmap-panel" id="roadmap-history-panel"><div class="roadmap-section-head"><div><div class="section-kicker">ЛЕТОПИСЬ ПРОЕКТА</div><h2>История изменений</h2><p>Версии, даты, описания и автоматическая категория каждого обновления.</p></div><a class="secondary-btn" href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases" target="_blank" rel="noreferrer">Все релизы ↗</a></div><div class="roadmap-history-list" id="roadmap-history-list"><div class="roadmap-empty">Загружаем историю версий…</div></div></section>`;
      main.appendChild(page);
      page.querySelectorAll('[data-roadmap-tab]').forEach(b=>b.addEventListener('click',()=>switchRoadmapTab(b.dataset.roadmapTab)));
      $('#roadmap-refresh')?.addEventListener('click',loadRoadmapContent);
      $('#roadmap-vote-list')?.addEventListener('click',async e=>{const b=e.target.closest('[data-roadmap-vote]');if(!b||b.disabled)return;b.disabled=true;try{await roadmapApi('/api/roadmap/vote','POST',{idea_id:b.dataset.roadmapVote});await loadRoadmapVotes();}catch(err){const s=$('#roadmap-suggest-status');if(s)s.textContent=err.message;b.disabled=false;}});
      $('#roadmap-suggest-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,status=$('#roadmap-suggest-status'),submit=form.querySelector('button[type="submit"]');submit.disabled=true;status.textContent='Проверяем похожие предложения и сохраняем идею…';try{const result=await roadmapApi('/api/roadmap/suggest','POST',{title:$('#roadmap-idea-title').value.trim(),description:$('#roadmap-idea-description').value.trim()});status.textContent=result.message;form.reset();await loadRoadmapVotes();}catch(err){status.textContent=err.message;}finally{submit.disabled=false;}});
    }
  }
  function switchRoadmapTab(tab){document.querySelectorAll('[data-roadmap-tab]').forEach(b=>b.classList.toggle('active',b.dataset.roadmapTab===tab));['voting','roadmap','history'].forEach(n=>$('#roadmap-'+n+'-panel')?.classList.toggle('active',n===tab));}
  async function loadRoadmapVotes(){
    const list=$('#roadmap-vote-list');if(!list)return;
    try{const data=await roadmapApi('/api/roadmap'),items=(data.items||[]).filter(x=>x.status==='voting');list.innerHTML=items.map(x=>'<article class="roadmap-vote-card"><div class="roadmap-vote-copy"><span class="roadmap-vote-tag">ИДЕЯ ИГРОКОВ</span><h3>'+escapeRoadmap(x.title)+'</h3><p>'+escapeRoadmap(x.description)+'</p><small>Предложили игроков: '+Math.max(0,Number(x.source_count)||0)+'</small></div><div class="roadmap-vote-action"><b>'+Number(x.votes||0)+'</b><small>голосов</small><button type="button" data-roadmap-vote="'+escapeRoadmap(x.id)+'" '+(x.voted?'disabled':'')+'>'+(x.voted?'✓ Вы проголосовали':'Голосовать')+'</button></div></article>').join('')||'<div class="roadmap-empty">Пока нет активных голосований. Предложи идею ниже — если она совпадёт с предложениями других игроков, появится здесь.</div>';}
    catch(err){list.innerHTML='<div class="roadmap-empty">'+escapeRoadmap(err.message)+' <button class="text-btn" data-roadmap-login type="button">Перейти ко входу</button></div>';list.querySelector('[data-roadmap-login]')?.addEventListener('click',()=>document.querySelector('[data-page="home"]')?.click());}
  }
  function classifyRelease(r){const t=(String(r.name||'')+' '+String(r.body||'')).toLocaleLowerCase('ru-RU');const explicit=t.match(/категория обновления:\\s*(исправление|небольшое|среднее|крупное|глобальное)/i);if(explicit){const labels={'исправление':['Исправление','fix'],'небольшое':['Небольшое','small'],'среднее':['Среднее','medium'],'крупное':['Крупное','major'],'глобальное':['Глобальное','global']};return {label:labels[explicit[1]][0],tone:labels[explicit[1]][1]};}const fixes=(t.match(/исправлен|исправлени|bug ?fix|hotfix|ошибк|краш|сбой/g)||[]).length;const features=(t.match(/добавлен|нов(ая|ый|ые)|систем|режим|мир|босс|биом|кооператив|професси|механик|улучшен|переработан|впервые/g)||[]).length;if(/глобальн|полная переработка|архитектур|major release/.test(t)||features>=12)return {label:'Глобальное',tone:'global'};if(/крупн|масштабн|большое обновление/.test(t)||features>=7)return {label:'Крупное',tone:'major'};if(/средн|контентное обновление/.test(t)||features>=3)return {label:'Среднее',tone:'medium'};if(fixes>0&&features===0)return {label:'Исправление',tone:'fix'};return {label:'Небольшое',tone:'small'};}
  function updatePoster(r,cat){const version=String(r.tag_name||r.name||'SkyRealm').replace(/[<>&"]/g,'').slice(0,28),title=String(r.name||'Новое обновление').replace(/[<>&"]/g,'').slice(0,48),safe=v=>v.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#102b51"/><stop offset=".55" stop-color="#274d83"/><stop offset="1" stop-color="#11172e"/></linearGradient><radialGradient id="r"><stop stop-color="#9fc8ff" stop-opacity=".55"/><stop offset="1" stop-color="#9fc8ff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="360" rx="28" fill="url(#g)"/><circle cx="990" cy="130" r="260" fill="url(#r)"/><path d="M760 360 980 30l190 330M850 360l130-190 125 190" fill="none" stroke="#b9d8ff" stroke-opacity=".18" stroke-width="5"/><text x="70" y="80" fill="#9ec9ff" font-family="Arial" font-size="22" letter-spacing="7">SKYREALM · '+safe(cat.label.toUpperCase())+'</text><text x="70" y="178" fill="#fff" font-family="Arial" font-size="62" font-weight="700">'+safe(version)+'</text><text x="70" y="238" fill="#d8e8ff" font-family="Arial" font-size="30">'+safe(title)+'</text><text x="70" y="310" fill="#9eb7d9" font-family="Arial" font-size="17" letter-spacing="4">НОВАЯ ГЛАВА ТВОЕГО МИРА</text></svg>';return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
  async function loadRoadmapHistory(){const list=$('#roadmap-history-list');if(!list)return;try{const response=await fetch('https://api.github.com/repos/kisia319-cell/SkyRealm-PC-Launcher/releases?per_page=20',{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});if(!response.ok)throw new Error('История релизов временно недоступна.');const releases=await response.json();list.innerHTML=(releases||[]).map(r=>{const cat=classifyRelease(r),version=escapeRoadmap(r.tag_name||r.name||'Релиз'),name=escapeRoadmap(r.name||'Обновление SkyRealm'),date=r.published_at?new Date(r.published_at).toLocaleDateString('ru-RU'):'Дата не указана',body=escapeRoadmap(String(r.body||'Описание пока не добавлено.').slice(0,1800)),poster=cat.tone==='major'||cat.tone==='global'?'<img class="roadmap-poster" alt="Постер '+version+'" src="'+updatePoster(r,cat)+'">':'';return '<article class="roadmap-history-card">'+poster+'<div class="roadmap-history-meta"><b>'+version+'</b><span class="roadmap-category '+cat.tone+'">'+cat.label+' обновление</span><time>'+date+'</time></div><h3>'+name+'</h3><p>'+body+'</p><a href="'+escapeRoadmap(r.html_url||'#')+'" target="_blank" rel="noreferrer">Открыть релиз ↗</a></article>';}).join('')||'<div class="roadmap-empty">Пока нет опубликованных релизов.</div>';}catch(err){list.innerHTML='<div class="roadmap-empty">'+escapeRoadmap(err.message)+' <a href="https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases">Открыть релизы GitHub ↗</a></div>';}}
  async function loadRoadmapContent(){await Promise.all([loadRoadmapVotes(),loadRoadmapHistory()]);}
  function openRoadmapPage(){ensureRoadmapPage();document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-roadmap'));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page==='roadmap'));if($('#crumb-label'))$('#crumb-label').textContent='ГОЛОСОВАНИЯ И ДОРОЖНАЯ КАРТА';if($('.main'))$('.main').scrollTop=0;switchRoadmapTab('voting');loadRoadmapContent();}

  function bindLauncherNavigation(){
    if(launcherNavigationBound)return;launcherNavigationBound=true;
    document.addEventListener('click',event=>{
      const button=event.target?.closest?.('.nav-item[data-page]');if(!button)return;
      const routes={calendar:openCalendarPage,system:openSystemPage,screenshots:openScreenshotsPage,support:openSupportPage,roadmap:openRoadmapPage};
      const action=routes[button.dataset.page];if(!action)return;
      event.preventDefault();event.stopImmediatePropagation();
      try{action();}catch(error){console.error('[SkyRealm launcher navigation]',error);const status=$('#toast');if(status){status.textContent='Не удалось открыть раздел. Перезапусти лаунчер и попробуй снова.';status.classList.add('show');}}
    },true);
  }
  function init() {
    if(launcherEnhancementsInitialized)return;launcherEnhancementsInitialized=true;
    const setup=[ensureSystemPage,ensureCalendarPage,ensureSupportPage,ensureScreenshotsPage,ensureRoadmapPage];
    setup.forEach(setupSection=>{try{setupSection();}catch(error){console.error('[SkyRealm launcher section init]',error);}});
    try{bindLauncherNavigation();addNotificationControl();bindSystemActions();}catch(error){console.error('[SkyRealm launcher controls init]',error);}
    try{refreshServices();refreshNotifications();}catch(error){console.error('[SkyRealm launcher refresh]',error);}
    pollTimer=window.setInterval(()=>{refreshNotifications();refreshServices();},45_000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();