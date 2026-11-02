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
  let enhancementLanguage = document.documentElement.lang === 'en' ? 'en' : 'ru';
  const DYNAMIC_TEXT_EN = {
    'Центр управления':'Control Center','Пн':'Mon','Вт':'Tue','Ср':'Wed','Чт':'Thu','Пт':'Fri','Сб':'Sat','Вс':'Sun','Проверяем manifest и текущую установку…':'Checking the manifest and current installation…','Доступен новый лаунчер. Он установится через встроенный механизм при следующем запуске.':'A launcher update is available. It will be installed automatically on the next start.','Доступно обновление игры. Перед установкой закрой игру.':'A game update is available. Close the game before installing it.','Установлены последние версии.':'The latest versions are installed.','Проверяем игровые файлы и локальные данные…':'Checking game files and local data…','Основные файлы и контрольные суммы совпадают. ':'Core files and checksums match. ','Нужен ремонт. ':'Repair required. ','Версия: ':'Version: ','Отсутствуют: ':'Missing: ','нет':'none','найдено':'found','ещё не создано':'not created yet','Игровой запускатель: ':'Game runner: ','установлен.':'installed.','будет установлен при следующем запуске.':'will be installed on next launch.','Сверено файлов с комплектом: ':'Bundled files checked: ','совпадают.':'all match.','Несовпадения: ':'Mismatches: ','Центр':'Control','управления':'center','ЦЕНТР УПРАВЛЕНИЯ':'CONTROL CENTER','КАЛЕНДАРЬ':'CALENDAR','ПОДДЕРЖКА':'SUPPORT','СКРИНШОТЫ':'SCREENSHOTS','Создать копию':'Create backup','Восстановить выбранную':'Restore selected','Обновить список':'Refresh list','Последняя исправная копия':'Latest valid backup','Восстановить':'Restore','Просмотреть':'View','Просмотр':'View',
    'SKYREALM · КОНТРОЛЬ':'SKYREALM · CONTROL','Обновления, состояние сервисов, диагностика, облачные сохранения и показатели компьютера.':'Updates, service status, diagnostics, cloud saves and computer metrics.',
    '↻ Обновить всё':'↻ Refresh all','СЕТЬ':'NETWORK','Состояние сервисов':'Service status','Ещё не проверяли':'Not checked yet',
    'Авторизация: проверка':'Authentication: checking','Вход и регистрация игроков':'Player sign-in and registration',
    'Кооператив: проверка':'Co-op: checking','Комнаты и совместные игровые сессии':'Rooms and shared game sessions',
    'Сообщество: проверка':'Community: checking','Друзья, сообщения и приглашения':'Friends, messages and invitations',
    'ВЕРСИИ И ФАЙЛЫ':'VERSIONS AND FILES','Центр обновлений':'Update center','Лаунчер':'Launcher','Игра':'Game','Доступно':'Available',
    'Проверка версии не изменяет файлы. Обновление игры устанавливается отдельно от миров.':'Checking versions does not change files. Game updates are installed separately from world saves.',
    'Описание последнего релиза появится после проверки манифеста.':'The latest release notes will appear after the manifest is checked.',
    'Проверить обновления':'Check for updates','Установить обновление игры':'Install game update','Восстановить файлы':'Repair files','Откатить версию':'Roll back version','Релизы лаунчера ↗':'Launcher releases ↗',
    'ПРОИЗВОДИТЕЛЬНОСТЬ':'PERFORMANCE','Показатели компьютера':'Computer metrics','Локально · не отправляется на сервер':'Local · never sent to the server',
    'Процессор':'CPU','Оперативная память':'Memory','Место на диске':'Disk space','Показатели обновляются при открытии центра и по кнопке «Обновить всё».':'Metrics refresh when this center opens and when you select “Refresh all”.',
    'СОХРАНЕНИЯ':'SAVES','Облачные миры':'Cloud worlds','Резервная копия для другого компьютера':'Backup for another computer',
    'Открой игру в режиме облачных сохранений. В меню выбора миров появятся кнопки загрузки в облако и безопасного восстановления. Перед восстановлением скачивается страховочная копия, а несовпадающие локальные миры сохраняются.':'Open the game in cloud-save mode. The world menu will show upload and safe restore actions. A safety copy is downloaded before restoration, and non-matching local worlds are preserved.',
    'Открыть облачные сохранения в игре':'Open cloud saves in game','Для доступа требуется подтверждённый аккаунт. Облачный архив принадлежит только твоему аккаунту.':'A verified account is required. Your cloud archive belongs only to your account.',
    'ВОССТАНОВЛЕНИЕ':'RECOVERY','Автоматическая диагностика':'Automatic diagnostics',
    'Проверим наличие игровых файлов, версию, целостность и локальное хранилище миров. Ничего не удаляется.':'Check game files, version, integrity and local world storage. Nothing is deleted.',
    'Проверить файлы игры':'Check game files','Открыть журнал':'Open log','Папка игры':'Game folder',
    'SKYREALM · ПЛАНЫ':'SKYREALM · PLANS','Игровой':'Game','календарь':'calendar',
    'Планируй игровые сессии, испытания и личные события. Записи сохраняются локально на этом компьютере.':'Plan game sessions, challenges and personal events. Entries are stored locally on this computer.',
    'Добавить событие':'Add event','Название':'Title','Дата':'Date','Тип':'Type','Игровая сессия':'Game session','Испытание':'Challenge','Обновление':'Update','Событие сообщества':'Community event',
    'Добавить в календарь':'Add to calendar','Укажи название и дату события.':'Enter an event title and date.','Событие сохранено.':'Event saved.',
    'На эту дату событий нет. Добавь первое событие выше.':'No events on this date. Add the first event above.','Удалить':'Delete','Событие':'Event',
    'SKYREALM · ПОМОЩЬ':'SKYREALM · HELP','Центр поддержки':'Support center','Если что-то не работает, собери диагностику и отправь отчёт разработчику.':'If something is not working, collect diagnostics and send a report to the developer.',
    'Сообщить об ошибке':'Report a bug','Опиши проблему и приложи скопированный диагностический отчёт.':'Describe the issue and attach the copied diagnostics report.',
    'Создать обращение':'Create issue','Обновления и инструкции':'Updates and guides','Открыть исходный код, описание проекта и последние версии лаунчера.':'Open the source code, project details and latest launcher versions.',
    'Репозиторий GitHub':'GitHub repository','Последний релиз':'Latest release','Диагностический отчёт':'Diagnostics report',
    'Отчёт содержит версии, состояние файлов и локальные показатели компьютера. Пароли и токены авторизации в него не включаются.':'The report includes versions, file status and local computer metrics. Passwords and authentication tokens are excluded.',
    'Скопировать отчёт':'Copy report','Собираем диагностику…':'Collecting diagnostics…','Диагностический отчёт скопирован. Прикрепи его к обращению.':'Diagnostics report copied. Attach it to your issue.',
    'SKYREALM · ГАЛЕРЕЯ':'SKYREALM · GALLERY','Мои':'My','скриншоты':'screenshots',
    'Снимки игрового мира, сделанные клавишей F12. Файлы хранятся локально на этом компьютере.':'Screenshots of the game world captured with F12. Files are stored locally on this computer.',
    '↻ Обновить':'↻ Refresh','Открыть папку':'Open folder','Загружаем галерею…':'Loading gallery…','Скриншот':'Screenshot','Закрыть':'Close',
    'Пока нет скриншотов':'No screenshots yet','Запусти игру и нажми F12, чтобы сделать первый снимок.':'Launch the game and press F12 to take your first screenshot.',
    'Открыть статус сервера':'Open server status',
    'Поиск модов':'Search mods','Категория':'Category','Сортировка':'Sort by',
    'Все категории':'All categories','По умолчанию':'Default order',
    'Название: А–Я':'Name: A–Z','Название: Я–А':'Name: Z–A',
    'Избранное ★':'Favorites ★',
    'По категории':'By category','Сбросить':'Clear filters',
    'Найдено модов: 35':'Found mods: 35',
    'Ничего не найдено. Измени поисковый запрос или категорию.':'No mods found. Change the search or category.',
    'ИССЛЕДОВАНИЕ':'EXPLORATION','РЕСУРСЫ':'RESOURCES','ФЕРМЕРСТВО':'FARMING',
    'ДОБЫЧА':'MINING','ВЫЖИВАНИЕ':'SURVIVAL','РАЗВИТИЕ':'PROGRESSION',
    'СЛОЖНОСТЬ':'DIFFICULTY','БОССЫ':'BOSSES','СНАРЯЖЕНИЕ':'EQUIPMENT',
    'ПРИКЛЮЧЕНИЯ':'ADVENTURE','БИТВЫ':'BATTLES','СТРОИТЕЛЬСТВО':'BUILDING',
    'СПУТНИКИ':'COMPANIONS','ЭКОНОМИКА':'ECONOMY','МАГИЯ':'MAGIC',
    'ТЕХНОЛОГИИ':'TECHNOLOGY','НОВЫЕ МИРЫ':'NEW WORLDS','ПЕРЕДВИЖЕНИЕ':'MOVEMENT',
    'ЗАЩИТА':'DEFENSE','ЛЕЧЕНИЕ':'HEALING','ВЫНОСЛИВОСТЬ':'STAMINA',
    'СОКРОВИЩА':'TREASURES','ВОССТАНОВЛЕНИЕ':'RECOVERY'
  };
  const DYNAMIC_ATTR_EN = {
    'Например, вечер кооператива':'For example, co-op night',
    'Выбрать резервную копию':'Select a backup',
    'Название, описание или ID мода':'Mod name, description or ID',
    'Добавить в избранное':'Add to favorites','Убрать из избранного':'Remove from favorites'
  };
  function applyDynamicTranslations(root=document) {
    const toEnglish = enhancementLanguage === 'en';
    const forward = DYNAMIC_TEXT_EN;
    const reverse = Object.fromEntries(Object.entries(DYNAMIC_TEXT_EN).map(([ru,en])=>[en,ru]));
    const attributesForward = DYNAMIC_ATTR_EN;
    const attributesReverse = Object.fromEntries(Object.entries(DYNAMIC_ATTR_EN).map(([ru,en])=>[en,ru]));
    const map = toEnglish ? forward : reverse;
    const attrMap = toEnglish ? attributesForward : attributesReverse;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue.trim();
      if (Object.prototype.hasOwnProperty.call(map,value)) node.nodeValue = node.nodeValue.replace(value,map[value]);
    }
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(element=>{
      for (const attribute of ['placeholder','title','aria-label']) {
        const value=element.getAttribute(attribute);
        if(value && Object.prototype.hasOwnProperty.call(attrMap,value))element.setAttribute(attribute,attrMap[value]);
      }
    });
    const supportHeading=$('#page-support .page-heading h1');
    if(supportHeading)supportHeading.innerHTML=toEnglish?'Support <span>Center</span>':'Центр <span>поддержки</span>';
  }
  window.addEventListener('skyrealm:language-changed',event=>{
    enhancementLanguage=event.detail?.language==='en'?'en':'ru';
    applyDynamicTranslations();
    refreshServices();
    initModCatalogFilters();
  });

  const MOD_FILTER_STORAGE_KEY='skyrealm_mod_catalog_filters_v1';
  const MOD_FAVORITES_STORAGE_KEY='skyrealm_mod_favorite_ids_v1';
  function initModCatalogFilters(){
    const grid=$('#page-mods .launcher-mod-grid');
    const search=$('#mod-catalog-search'),categorySelect=$('#mod-catalog-category');
    const sortSelect=$('#mod-catalog-sort'),clear=$('#mod-catalog-clear');
    const count=$('#mod-catalog-results-count'),empty=$('#mod-catalog-empty');
    if(!grid||!search||!categorySelect||!sortSelect||!clear)return;
    if(grid.dataset.filtersBound==='1'){if(typeof grid.__skyrealmApplyModFilters==='function')grid.__skyrealmApplyModFilters();return;}
    const cards=Array.from(grid.querySelectorAll('.launcher-mod-card'));
    if(!cards.length)return;
    grid.dataset.filtersBound='1';
    let collator=new Intl.Collator(enhancementLanguage==='en'?'en':'ru',{sensitivity:'base',numeric:true});
    const categoryOf=card=>(card.querySelector('.launcher-mod-meta')?.textContent||'').split('·')[0].trim();
    const titleOf=card=>(card.querySelector('h2')?.textContent||'').trim();
    const modIdOf=card=>card.querySelector('[data-install-mod]')?.dataset.installMod||'';
    let favorites=new Set();
    try{const stored=JSON.parse(localStorage.getItem(MOD_FAVORITES_STORAGE_KEY)||'[]');if(Array.isArray(stored))favorites=new Set(stored.filter(id=>cards.some(card=>modIdOf(card)===id)));}catch(_){}
    const saveFavorites=()=>{try{localStorage.setItem(MOD_FAVORITES_STORAGE_KEY,JSON.stringify([...favorites]));}catch(_){}};
    const updateFavoriteButton=(button,active)=>{
      button.classList.toggle('is-favorite',active);
      button.setAttribute('aria-pressed',String(active));
      button.textContent=active?'★':'☆';
      button.title=active?(enhancementLanguage==='en'?'Remove from favorites':'Убрать из избранного'):(enhancementLanguage==='en'?'Add to favorites':'Добавить в избранное');
      button.setAttribute('aria-label',button.title);
    };
    cards.forEach(card=>{
      const id=modIdOf(card);if(!id)return;
      let button=card.querySelector('.mod-favorite-toggle');
      if(!button){
        button=document.createElement('button');button.type='button';button.className='mod-favorite-toggle';
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          if(favorites.has(id))favorites.delete(id);else favorites.add(id);
          saveFavorites();updateFavoriteButton(button,favorites.has(id));apply();
        });
        card.prepend(button);
      }
      updateFavoriteButton(button,favorites.has(id));
    });
    const categories=[...new Set(cards.map(categoryOf).filter(Boolean))].sort((a,b)=>collator.compare(a,b));
    const all=document.createElement('option');all.value='all';all.textContent='Все категории';
    const favoriteOption=document.createElement('option');favoriteOption.value='favorites';favoriteOption.textContent='Избранное ★';
    categorySelect.replaceChildren(all,favoriteOption);
    categories.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;categorySelect.append(option);});
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(MOD_FILTER_STORAGE_KEY)||'{}');}catch(_){}
    search.value=typeof saved.query==='string'?saved.query.slice(0,80):'';
    sortSelect.value=['default','name-asc','name-desc','category'].includes(saved.sort)?saved.sort:'default';
    categorySelect.value=saved.category==='favorites'||categories.includes(saved.category)?saved.category:'all';
    const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
    const apply=()=>{
      collator=new Intl.Collator(enhancementLanguage==='en'?'en':'ru',{sensitivity:'base',numeric:true});
      const query=normalize(search.value.trim()),category=categorySelect.value,sort=sortSelect.value;
      const visible=cards.filter(card=>{
        const id=modIdOf(card);
        const matchesCategory=category==='all'||(category==='favorites'?favorites.has(id):categoryOf(card)===category);
        const haystack=normalize([titleOf(card),card.querySelector('p')?.textContent,card.querySelector('small')?.textContent,card.querySelector('.launcher-mod-meta')?.textContent,card.querySelector('[data-install-mod]')?.dataset.installMod].join(' '));
        return matchesCategory&&(!query||haystack.includes(query));
      });
      const ordered=[...cards];
      if(sort==='name-asc')ordered.sort((a,b)=>collator.compare(titleOf(a),titleOf(b)));
      else if(sort==='name-desc')ordered.sort((a,b)=>collator.compare(titleOf(b),titleOf(a)));
      else if(sort==='category')ordered.sort((a,b)=>collator.compare(categoryOf(a),categoryOf(b))||collator.compare(titleOf(a),titleOf(b)));
      ordered.forEach(card=>{card.hidden=!visible.includes(card);grid.append(card);});
      if(count)count.textContent=enhancementLanguage==='en'
        ? 'Showing '+visible.length+' of '+cards.length+' mods'
        : 'Показано '+visible.length+' из '+cards.length+' модов';
      if(empty)empty.hidden=visible.length!==0;
      clear.disabled=!query&&category==='all'&&sort==='default';
      try{localStorage.setItem(MOD_FILTER_STORAGE_KEY,JSON.stringify({query:search.value.slice(0,80),category,sort}));}catch(_){}
      applyDynamicTranslations($('#mod-browser-toolbar')||document);
    };
    grid.__skyrealmApplyModFilters=apply;
    search.addEventListener('input',apply);
    categorySelect.addEventListener('change',apply);
    sortSelect.addEventListener('change',apply);
    clear.addEventListener('click',()=>{search.value='';categorySelect.value='all';sortSelect.value='default';apply();search.focus();});
    search.addEventListener('keydown',event=>{if(event.key==='Escape'&&search.value){search.value='';apply();}});
    apply();
  }

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
    $('#calendar-month-label').textContent=calendarMonth.toLocaleDateString(enhancementLanguage==='en'?'en-US':'ru-RU',{month:'long',year:'numeric'});
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
    applyDynamicTranslations($('#page-calendar'));
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
    if(typeof api?.get_screenshots!=='function'){grid.textContent='Галерея доступна в установленной Windows-версии лаунчера.';applyDynamicTranslations($('#page-screenshots'));return;}
    try{
      const result=await api.get_screenshots();if(!result?.ok)throw new Error(result?.message||'Не удалось загрузить скриншоты.');
      const items=Array.isArray(result.screenshots)?result.screenshots:[];
      if(!items.length){grid.innerHTML='<div class="screenshots-empty"><b>Пока нет скриншотов</b><span>Запусти игру и нажми F12, чтобы сделать первый снимок.</span></div>';applyDynamicTranslations($('#page-screenshots'));return;}
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
      applyDynamicTranslations($('#page-screenshots'));
    }catch(error){grid.textContent=error.message||'Галерея временно недоступна.';applyDynamicTranslations($('#page-screenshots'));}
  }
  function setService(key,ok,detail) {
    const dot=$('#system-'+key+'-dot'),title=$('#system-'+key+'-title'),copy=$('#system-'+key+'-copy');
    if(!dot||!title||!copy)return;
    dot.className='system-dot '+(ok?'online':'offline');
    const labels=enhancementLanguage==='en'
      ? {auth:'Authentication',coop:'Co-op',social:'Community'}
      : {auth:'Авторизация',coop:'Кооператив',social:'Сообщество'};
    title.textContent=labels[key]+(ok
      ? (enhancementLanguage==='en'?' · online':' · работает')
      : (enhancementLanguage==='en'?' · offline':' · нет связи'));
    const serviceVersion=detail&&detail.startsWith('Версия сервиса ')
      ? detail.slice('Версия сервиса '.length) : '';
    copy.textContent=serviceVersion
      ? (enhancementLanguage==='en'?'Service version ':'Версия сервиса ')+serviceVersion
      : (detail||(ok
        ? (enhancementLanguage==='en'?'Service is responding':'Сервис отвечает')
        : (enhancementLanguage==='en'?'Check your connection and try again.':'Проверь интернет или попробуй позже.')));
  }
  async function pingService(url) {
    if(!url||!apiKey)return {ok:false,message:'URL или ключ сервиса не настроен.'};
    const endpoint=new URL(url); endpoint.searchParams.set('route','/health');
    const response=await fetch(endpoint.toString(),{headers:{apikey:apiKey,Authorization:'Bearer '+apiKey},cache:'no-store'});
    const data=await response.json();
    if(!response.ok||data.status!=='ok')throw new Error(data.message||'HTTP '+response.status);
    return {ok:true,message:(enhancementLanguage==='en'?'Service version ':'Версия сервиса ')+(data.version||(enhancementLanguage==='en'?'available':'доступна'))};
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
  async function refreshLocalVersions() {
    const api=window.pywebview?.api;
    if(typeof api?.get_local_versions!=='function')return;
    try{
      const result=await api.get_local_versions();
      if(!result?.ok)return;
      const launcherVersion=result.launcher_version||'—';
      const gameVersion=result.game_version||'не установлена';
      if($('#launcher-version-label'))$('#launcher-version-label').textContent='v'+launcherVersion;
      if($('#home-launcher-version'))$('#home-launcher-version').textContent=launcherVersion;
      if($('#home-game-version'))$('#home-game-version').textContent=gameVersion;
      if($('#install-version-label'))$('#install-version-label').textContent='v'+(result.bundled_game_version||gameVersion);
      if($('#system-launcher-version'))$('#system-launcher-version').textContent=launcherVersion;
      if($('#system-game-version'))$('#system-game-version').textContent=gameVersion+' → '+(result.latest_local_game_version||gameVersion);
    }catch(error){console.warn('[SkyRealm] Local version check failed:',error);}
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
      const currentLauncherVersion=result.launcher_version||'—';
      const currentGameVersion=result.game_version||'—';
      if($('#launcher-version-label'))$('#launcher-version-label').textContent='v'+currentLauncherVersion;
      if($('#home-launcher-version'))$('#home-launcher-version').textContent=currentLauncherVersion;
      if($('#home-game-version'))$('#home-game-version').textContent=currentGameVersion+(result.game_update_available?' · '+(enhancementLanguage==='en'?'update available':'есть обновление'):'');
      $('#system-launcher-version').textContent=currentLauncherVersion+' → '+(result.latest_launcher_version||'—');
      $('#system-game-version').textContent=currentGameVersion+' → '+(result.latest_game_version||'—');
      const modBadge=$('#mods-catalog-count');
      if(modBadge){const actualCount=document.querySelectorAll('#page-mods .launcher-mod-card').length;modBadge.textContent=String(actualCount);modBadge.hidden=actualCount===0;}
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
      const missing=(result.missing||[]).join(', ')||'нет';
      const mismatches=(result.integrity_mismatches||[]).map(item=>item.file).join(', ')||'нет';
      const integrity=result.integrity_comparable
        ? 'SHA-256 проверено: '+(result.integrity_checked||0)+', отличаются: '+mismatches+'.'
        : 'Сравнение SHA-256 с комплектом лаунчера недоступно для этой версии.';
      const runner='Игровой запускатель: '+(result.runner_exists?'найден':'будет создан при следующем запуске')+'.';
      node.textContent=(result.healthy?'Основные файлы и контрольные суммы совпадают. ':'Нужен ремонт. ')+'Версия: '+result.version+'. Отсутствуют: '+missing+'. '+integrity+' '+runner+' Хранилище миров: '+(result.world_storage_found?'найдено':'ещё не создано')+'.';
      applyDynamicTranslations(node);
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
    ensureSystemPage();ensureCalendarPage();ensureSupportPage();ensureScreenshotsPage();addNotificationControl();bindSystemActions();initModCatalogFilters();
    applyDynamicTranslations();
    refreshLocalVersions();refreshServices();refreshNotifications();checkUpdates();
    window.addEventListener('pywebviewready',()=>{
      refreshLocalVersions();checkUpdates();refreshMetrics();refreshDiagnostics();
    });
    pollTimer=window.setInterval(()=>{refreshNotifications();refreshServices();checkUpdates();},45_000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();