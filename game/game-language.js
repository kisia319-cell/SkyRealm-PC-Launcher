(() => {
  'use strict';
  const PARAMS = new URLSearchParams(location.search);
  let launchSettings = {};
  try { launchSettings = JSON.parse(PARAMS.get('settings') || '{}') || {}; } catch (_) {}
  const KEY = 'skyrealm_game_language';
  const translations = {
    'SkyRealm — Первый рассвет':'SkyRealm — First Dawn',
    'ТВОЙ МИР · ТВОЯ ИСТОРИЯ':'YOUR WORLD · YOUR STORY',
    'Игра открыта в браузере — закрой это окно, чтобы выйти.':'The game is open in your browser — close this window to exit.',
    'Зайти в игру':'Enter the game',
    '☀ СОЛНЦЕ':'☀ SUN','ДЕНЬ':'DAY','СМЕНИТЬ ЗАСТАВКУ · НЕБЕСНОЕ КОРОЛЕВСТВО ↓':'CHANGE SCENE · SKY KINGDOM ↓',
    'SKYREALM · ВЫБОР ИЗДАНИЯ':'SKYREALM · EDITION SELECT',
    'Выберите версию игры':'Choose your game edition',
    'Выбери, в каком издании отправиться в путешествие.':'Choose which edition you want to explore.',
    'Платная · Premium':'Premium Edition',
    'Бесплатная · Free':'Free Edition',
    'Все расширенные миры, кооператив, моды и облачные сохранения.':'All expanded worlds, co-op, mods and cloud saves.',
    'Основное выживание, создание миров, сбор ресурсов и развитие героя.':'Core survival, world creation, resource gathering and character progression.',
    'Активировать Premium':'Activate Premium','Назад к выбору':'Back to selection',
    'базовое выживание, обычные миры, строительство, крафт и развитие персонажа.':'Core survival, regular worlds, building, crafting and character progression.',
    'Мир боссов, кооператив, каталог модов и облачные сохранения.':'Boss World, co-op, mod catalogue and cloud saves.',
    'Продолжить бесплатно':'Continue for free','Ввести код Premium':'Enter Premium code',
    'Premium успешно активирован.':'Premium activated successfully.','Начать игру':'Start game',
    'Выбор сохраняется на этом компьютере. Активация кода проверяется сервером.':'Your choice is saved on this computer. Activation codes are verified by the server.',
    'УРОВЕНЬ 1 · XP 0/100':'LEVEL 1 · XP 0/100','🟡 БАЛАНС':'🟡 BALANCE',
    'Размер:':'Size:','Панель':'Panel','Масштаб':'Scale','Сохранить и выйти':'Save and exit',
    'ПЕРВЫЙ РАССВЕТ · ПРОТОТИП':'FIRST DAWN · PROTOTYPE','ВРЕМЯ В SKYREALM':'SKYREALM TIME',
    '🌱 ВЕСНА':'🌱 SPRING','🌙 ПРОЖИТО НОЧЕЙ: 0':'🌙 NIGHTS SURVIVED: 0',
    'ВЫЖИВАНИЕ':'SURVIVAL','🍗 Голод':'🍗 Hunger','🍖 Съесть мясо':'🍖 Eat meat',
    'Пропуск дня через':'Skip day in','Пропустить день':'Skip day',
    'РАДАР ДОЛИНЫ':'VALLEY RADAR','0% ОТКРЫТО':'0% EXPLORED','Ты':'You','Монстры':'Monsters',
    'Монстры вышли из леса':'Monsters have emerged from the forest',
    'ТВОЁ ПРИКЛЮЧЕНИЕ':'YOUR ADVENTURE','Выживание в долине':'Valley Survival',
    'Исследуй долину, зайди в дом, осмотри верстак, поспи, сразись с монстрами и добудь мясо.':'Explore the valley, enter the house, inspect the workbench, sleep, fight monsters and collect meat.',
    'Цель: осмотреться вокруг':'Objective: look around','Лесная долина':'Forest Valley',
    '/ стрелки · движение':'/ arrow keys · move','бег':'sprint','перекат':'dodge roll',
    'действие':'interact','инвентарь':'inventory','атака':'attack','ИНВЕНТАРЬ':'INVENTORY',
    'Открыть':'Open','СЛОТЫ 1–4':'SLOTS 1–4','Нажми E, чтобы прочитать знак.':'Press E to read the sign.',
    'НЕБЕСНЫЕ ОСТРОВА · ПУТЬ НАЧИНАЕТСЯ':'SKY ISLANDS · THE JOURNEY BEGINS',
    'НЕПТУН РАЗЛОМА · ПЕРВЫЙ БОГ МОРЯ':'NEPTUNE OF THE RIFT · FIRST SEA GOD',
    'ЛЕВИАФАН БЕЗДНЫ · ВТОРОЙ БОГ МОРЯ':'LEVIATHAN OF THE ABYSS · SECOND SEA GOD',
    'Музыка: выкл.':'Music: off','SKYREALM · ПЕРВЫЙ РАССВЕТ':'SKYREALM · FIRST DAWN',
    'Твоя история':'Your story','начинается здесь':'begins here',
    'Создай мир, исследуй неизведанные земли и оставь след в долине.':'Create a world, explore unknown lands and leave your mark on the valley.',
    'Кооператив':'Co-op','Играть вместе · до 8 игроков':'Play together · up to 8 players',
    'Создать мир':'Create world','Начать новое приключение':'Start a new adventure',
    'Персонаж':'Character','Внешность и цвета брони':'Appearance and armor colors',
    'Настройки':'Settings','Графика и интерфейс':'Graphics and interface',
    'Каталог модов':'Mod catalogue','Новые возможности для игры · 8 встроенных модов + моды игроков':'New gameplay features · 8 built-in mods + player mods',
    'Выдать привилегию':'Grant privileges','Назначить администратора или модератора':'Assign administrator or moderator',
    'Админ-панель':'Admin panel','Все инструменты администратора':'All administrator tools',
    'Панель модератора':'Moderator panel','Игроки и управление миром':'Players and world management',
    'Выйти из игры':'Exit game','Закрыть SkyRealm':'Close SkyRealm',
    'ТВОИ СОХРАНЕНИЯ':'YOUR SAVES','Выбери мир':'Choose a world','0 миров':'0 worlds',
    '⇧ Импорт резервной копии':'⇧ Import backup','☁ Облачные сохранения':'☁ Cloud saves',
    'Все миры':'All worlds','Избранное':'Favorites','Сначала недавние':'Newest first',
    'По названию':'By name','Сначала старые':'Oldest first','Пока нет миров':'No worlds yet',
    'Создай первый мир — он появится в этом списке, и ты сможешь вернуться в него в любое время.':'Create your first world. It will appear here so you can return to it at any time.',
    'Создать первый мир':'Create first world','Сохранения находятся на этом компьютере':'Saves are stored on this computer',
    'SKYREALM · ПЕРСОНАЛИЗАЦИЯ':'SKYREALM · PERSONALIZATION',
    'Редактор персонажа':'Character editor',
    'Настрой внешний вид героя. Изменения сохраняются на этом компьютере и применяются во всех мирах.':'Customize your hero. Changes are saved on this computer and apply to every world.',
    'Тон кожи':'Skin tone','Персиковый':'Peach','Светлый':'Light','Тёплый':'Warm','Тёмный':'Dark','Эльфийский':'Elven',
    'Причёска':'Hairstyle','Угольная':'Charcoal','Рыжая':'Red','Золотая':'Golden','Каштановая':'Chestnut','Серебряная':'Silver','Чёрная':'Black',
    'Броня':'Armor','Королевская синяя':'Royal blue','Лесная зелёная':'Forest green','Рубиновая':'Ruby','Каменная':'Stone','Магическая фиолетовая':'Arcane purple',
    'Детали брони':'Armor details','Ледяные':'Icy','Золотые':'Gold','Изумрудные':'Emerald','Алые':'Scarlet','Серебряные':'Silver',
    'Лицо персонажа':'Character face','Обычное лицо':'Neutral','Улыбка':'Smile','Суровое':'Stern',
    'Название мира':'World name','Создать мир и играть':'Create world and play','Отмена':'Cancel',
    'SKYREALM · НОВОЕ ПРИКЛЮЧЕНИЕ':'SKYREALM · NEW ADVENTURE','Выбери сложность мира':'Choose world difficulty',
    'Легко':'Easy','Средняя':'Normal','Сложно':'Hard','Жар':'Brutal','Невозможно':'Impossible','Почти нет права на ошибку':'Almost no room for mistakes',
    'Челлендж':'Challenge','Победи испытания и получи награды':'Complete challenges and earn rewards',
    'Назад к списку миров':'Back to world list','УПРАВЛЕНИЕ МИРОМ':'WORLD MANAGEMENT',
    'Переименовать мир':'Rename world','Новое название появится в списке сохранений.':'The new name will appear in your save list.',
    'Новое название':'New name','Сохранить название':'Save name',
    'ЗАЩИЩЁННЫЙ РАЗДЕЛ':'RESTRICTED AREA','Вход для администратора':'Administrator login',
    'Введи пароль, чтобы открыть панель администратора.':'Enter the password to open the administrator panel.',
    'Пароль администратора':'Administrator password','Неверный пароль. Попробуй ещё раз.':'Incorrect password. Try again.',
    'Войти в админ-панель':'Open admin panel','Полный набор инструментов для локального мира.':'Full toolset for the local world.',
    'Сохранено миров':'Saved worlds','Монстров в мире':'Monsters in world','Текущее время':'Current time',
    'Наиграно игрового времени':'Game time played','0 ч 00 мин':'0 hr 00 min',
    '❤ Здоровье: восстановить':'❤ Restore health','👑 Выдать лучший сет':'👑 Grant best armor set',
    '⚔ Выдать лучший меч':'⚔ Grant best sword','✦ Максимально улучшить экипировку':'✦ Max out equipment',
    '◇ Бессмертие: выкл.':'◇ Immortality: off','Выдать любой предмет':'Grant any item',
    '🪵 Дерево':'🪵 Wood','🪨 Камень':'🪨 Stone','💎 Кристалл':'💎 Crystal','🧪 Зелье':'🧪 Potion',
    '🪙 Монеты':'🪙 Coins','🌿 Лечебная трава':'🌿 Healing herb','🛡 Нагрудник Бога':'🛡 God chestplate',
    '⚔ Меч дракона':'⚔ Dragon sword','🗝 Ключ сокровищницы':'🗝 Treasury key','Выдать':'Grant',
    'Можно выбрать готовый предмет или вписать своё название. Количество — до 9 999 999.':'Choose an existing item or enter a custom name. Quantity up to 9,999,999.',
    '☀ Установить день':'☀ Set day','☾ Установить ночь':'☾ Set night',
    '⏭ Пропустить игровой день (засчитать ночь и время)':'⏭ Skip game day (count night and time)',
    '＋ Создать монстра':'＋ Spawn monster','Удалить всех монстров':'Remove all monsters',
    '⌖ Открыть карту и телепорт':'⌖ Open map and teleport','Локальный список блокировки (не сетевой бан)':'Local block list (not an online ban)',
    'Добавить':'Add','Команда SkyRealm':'SkyRealm team','Загрузка игроков…':'Loading players…',
    'Назначить модератором':'Promote to moderator','Снять модератора':'Remove moderator','Обновить':'Refresh',
    'Список игроков загружается с сервера.':'Player list is loading from the server.',
    'Обновить список миров':'Refresh world list','♜ Настройки привилегий и ролей':'♜ Privileges and roles',
    'Закрыть панель':'Close panel','Привилегии и роли':'Privileges and roles',
    'Имя игрока (логин SkyRealm)':'Player name (SkyRealm login)','Выдать роль':'Grant role',
    'Администратор':'Administrator','Модератор':'Moderator','Срок действия':'Duration',
    'Навсегда':'Forever','1 час':'1 hour','24 часа':'24 hours','7 дней':'7 days','30 дней':'30 days',
    'Снять роль':'Revoke role','Первоначальное получение администратора':'Initial administrator claim',
    'Одноразовый код':'One-time code','Получить администратора навсегда':'Become permanent administrator',
    'Открытая выдача ролей':'Open role assignment','Разрешить выдачу всем':'Allow everyone to grant roles',
    'При выключении выдавать роли сможет только серверный администратор.':'When disabled, only a server administrator can grant roles.',
    'Сохранить настройку':'Save setting','Проверяю режим выдачи ролей…':'Checking role assignment mode…',
    'Инструменты модерации игрового мира.':'World moderation tools.',
    '❤ Восстановить здоровье':'❤ Restore health','⌖ Карта и телепортация':'⌖ Map and teleport',
    'Загрузка полного каталога…':'Loading full catalogue…','Выдать предмет':'Grant item',
    '☀ День':'☀ Day','☾ Ночь':'☾ Night','Удалить монстров':'Remove monsters',
    'Локальный список блокировки':'Local block list',
    'Баны пока локальные и не действуют на игроков в сети. Для онлайн-модерации понадобится сервер.':'Bans are local only and do not affect online players. Online moderation requires a server.',
    'SKYREALM · ИССЛЕДОВАНИЕ':'SKYREALM · EXPLORATION','Карта долины':'Valley map',
    '● Ты':'● You','● Монстры':'● Monsters','0% открыто':'0% explored','Закрыть карту · L':'Close map · L',
    'SKYREALM · ПАУЗА':'SKYREALM · PAUSED','Передохнём?':'Take a break?',
    'Продолжи исследование, настрой игру или вернись в лаунчер.':'Continue exploring, adjust settings or return to the launcher.',
    'Продолжить путешествие':'Resume adventure','Админ-инструменты':'Admin tools',
    'Инструменты модератора':'Moderator tools','Настройки мира':'World settings',
    '💾 Сохранить мир сейчас':'💾 Save world now','🏆 Достижения':'🏆 Achievements',
    'В меню миров':'World menu','F11 · Полный экран':'F11 · Fullscreen',
    'Автосохранение каждые 4 секунды':'Auto-save every 4 seconds',
    'SKYREALM · НАСТРОЙКИ':'SKYREALM · SETTINGS','Настройки игры':'Game settings',
    'Язык игры':'Game language','Выбери язык интерфейса игры. Изменение применяется сразу.':'Choose the game interface language. Changes apply immediately.',
    'Русский':'Russian','English':'English',
    'Работы и профессии':'Jobs and professions','Работы и заказы':'Jobs and contracts',
    'Лесоруб':'Lumberjack','Рудокоп':'Miner',
    'Лесоруб · рудокоп · заказы и зарплата':'Lumberjack · miner · contracts and pay',
    'Устройся на одну или сразу на две работы. Выполняй заказы, повышай уровень профессии, получай зарплату и полезные бонусы.':'Take one or both jobs. Complete contracts, level up, earn pay and useful bonuses.',
    'Заготавливай древесину для поселений и мастерских.':'Gather timber for settlements and workshops.',
    'Добывай камень и руду в шахте, находи редкие жилы.':'Mine stone and ore and discover rare veins.',
    'Сруби деревья':'Fell trees','Добудь залежи':'Mine ore deposits',
    'Легендарный мастер':'Legendary master','Мастер':'Master','Опытный специалист':'Skilled worker','Ученик':'Apprentice',
    'Текущий заказ':'Current contract','Опыт профессии':'Profession XP','МАКСИМУМ':'MAXIMUM',
    'Награда за заказ:':'Contract reward:','Принять работу':'Accept job','✓ Работа принята':'✓ Job accepted',
    'Работа засчитывается только за реальные действия: срубленные деревья и добытые залежи. Профессии сохраняются на этом компьютере.':'Work counts only from real actions: felled trees and mined ore. Professions are saved on this computer.',
    'УР.':'LVL','выполнено заказов:':'contracts completed:',
    'Пепельная кузня':'Ashen Forge','Ледяной колизей':'Glacier Colosseum',
    'Храм вечности':'Temple of Eternity','Астральный круг':'Astral Ring',
    'АРЕНА ПРОБУЖДЕНА: ':'ARENA AWAKENED: ',' ждёт тебя!':' awaits you!',
    'БОСС НА АРЕНЕ':'BOSS IN THE ARENA','Закрыть':'Close','Пауза':'Pause',
    'Древесина':'Timber','Палка':'Stick','Камень':'Stone','Железо':'Iron','Уголь':'Coal',
    'Медь':'Copper','Олово':'Tin','Серебро':'Silver','Золото':'Gold','Рубин':'Ruby',
    'Сапфир':'Sapphire','Обсидиан':'Obsidian','Мифрил':'Mithril','Уран':'Uranium','Алмаз':'Diamond',
    'Кристалл':'Crystal','Листья':'Leaves','Малое зелье':'Minor Potion',
    'Графика':'Graphics','Интерфейс':'Interface','Качество графики':'Graphics quality',
    'Влияет на детализацию, эффекты и чёткость изображения.':'Affects detail, effects and image clarity.',
    'Низкое':'Low','Среднее':'Medium','Высокое':'High','Режим FPS Boost':'FPS Boost mode',
    'Сбалансированный':'Balanced','FPS Boost · больше кадров':'FPS Boost · higher frame rate',
    'Разрешение':'Resolution','Размер игрового окна в оконном режиме.':'Game window size in windowed mode.',
    'Режим экрана':'Display mode','Переключение на полный экран также доступно клавишей F11.':'Press F11 to toggle fullscreen too.',
    'Оконный':'Windowed','Полноэкранный':'Fullscreen',
    'Изменения качества применяются сразу. Размер окна применится при выборе режима.':'Quality changes apply immediately. Window size applies when the mode is selected.',
    'Масштаб интерфейса':'Interface scale','Размер панелей и подсказок.':'Size of panels and hints.',
    'Маленький · 85%':'Small · 85%','Обычный · 100%':'Normal · 100%','Большой · 115%':'Large · 115%',
    'Панель здоровья и выносливости':'Health and stamina panel','Показывать показатели в левом верхнем углу.':'Show status in the upper-left corner.',
    'Панель задания':'Quest panel','Цель исследования в правом верхнем углу.':'Exploration objective in the upper-right corner.',
    'Подсказки управления':'Control hints','Напоминания о клавишах внизу экрана.':'Key reminders at the bottom of the screen.',
    'Панель инвентаря':'Inventory panel','Быстрый доступ к предметам.':'Quick access to items.',
    'Мини-карта':'Mini-map','Радар с положением персонажа и ночных монстров.':'Radar showing your character and night monsters.',
    'Расположение интерфейса':'HUD layout','Перемести основные элементы в один из углов экрана.':'Move main elements to a screen corner.',
    'Стандартно':'Default','Слева':'Left','Справа':'Right','Компактно':'Compact',
    'Свободное расположение элементов':'Free HUD layout',
    'Перетаскивай панели. В режиме редактирования выбери панель и настрой её размер ползунком. Элементы нельзя утащить за край экрана; завершай через кнопку «Сохранить и выйти».':'Drag panels to reposition them. Select a panel in edit mode and adjust its size with the slider. Panels cannot be moved off-screen; finish with “Save and exit”.',
    '↔ Перемещать элементы интерфейса':'↔ Move HUD elements',
    'Применить настройки':'Apply settings','Назад в паузу':'Back to pause',
    'SKYREALM · МИР':'SKYREALM · WORLD','Монстры с первой ночи':'Monsters from the first night',
    'Если включено, монстры появляются уже в первую ночь.':'When enabled, monsters appear on the first night.',
    'Эта настройка относится только к текущему миру и сохраняется отдельно.':'This setting applies only to the current world and is saved separately.',
    'Сохранить':'Save','ЗАПИСКА ПУТЕШЕСТВЕННИКА':'TRAVELLER’S NOTE','Старый дорожный знак':'Old road sign',
    'Теневой охотник':'Shadow Hunter','Каменный страж':'Stone Guardian','Проклятый череп':'Cursed Skull',
    'Разломный волк':'Rift Wolf','Ядовитый жук':'Venomous Beetle','Падший воин':'Fallen Warrior',
    'Разломный лучник':'Rift Archer','Пепельный дух':'Ash Spirit','Генерал бездны':'Abyss General',
    'Кровавый берсерк':'Blood Berserker','Хранитель разлома':'Rift Keeper','Пожиратель душ':'Soul Eater',
    'Король Бездны':'Abyss King','Разломный дракон':'Rift Dragon','Древний пожиратель':'Ancient Devourer',
    'Рыцарь конца':'Knight of the End','Астрал — Бог разрушения':'Astral — God of Destruction',
    'Хронос — Бог времени':'Chronos — God of Time','ГЛАВАРЬ ПОБЕЖДЁН:':'BOSS DEFEATED:',
    'БОГ ПОВЕРЖЕН:':'GOD DEFEATED:','ЛЕГЕНДАРНАЯ РЕЛИКВИЯ:':'LEGENDARY RELIC:',
    'Осколок Бездны':'Abyss Shard','Печать главаря':'Boss Seal','Чешуя Разлома':'Rift Scale',
    'Меч дракона':'Dragon Sword','Меч пустоты':'Void Sword','Сердце Бога':'Godheart',
    'Клинок бездны':'Abyss Blade','РЕДКОЕ ОРУЖИЕ В ДОБЫЧЕ:':'RARE WEAPON LOOT:',
    'Нагрудник Бога':'God Chestplate','Нагрудник Бога получен · защита +90%!':'God Chestplate acquired · +90% defense!',
    'НАЧАЛАСЬ ВОЛНА':'WAVE STARTED','Корни сковали тебя!':'Roots have bound you!',
    'Пожиратель душ высасывает жизнь':'The Soul Eater drains your life',
    'Ядовитое облако':'Poison cloud','Генерал бездны призывает прислужников!':'The Abyss General summons minions!',
    'Способность доступна в Мире боссов.':'This ability is available in Boss World.',
    'Невидимость перезаряжается:':'Invisibility cooldown:','НЕВИДИМОСТЬ · 4,5 секунды · враги теряют цель':'INVISIBILITY · 4.5 sec · enemies lose their target',
    'ЯРОСТЬ БОГА · +50% урона на 5 секунд':'GOD FURY · +50% damage for 5 seconds',
    'Сверхрывок перезаряжается:':'Super dash cooldown:','СВЕРХРЫВОК · скорость ×2,5 на 5,5 секунды':'SUPER DASH · ×2.5 speed for 5.5 seconds',
    'МИР БОССОВ · ВОЛНА':'BOSS WORLD · WAVE','ПЯТЬ ПОБЕД ДЛЯ СЛЕДУЮЩЕЙ ВОЛНЫ':'FIVE WINS TO THE NEXT WAVE',
    'V Невидимость':'V Invisibility','B +50% урона':'B +50% damage','N Сверхрывок ×2,5':'N Super dash ×2.5',
    'O Журнал':'O Journal','ЖУРНАЛ МИРА БОССОВ':'BOSS WORLD JOURNAL','Нажми O, чтобы закрыть':'Press O to close',
    'Через 5 секунд появится следующее сообщение…':'The next message appears in 5 seconds…',
    'НОВЫЕ СПОСОБНОСТИ':'NEW ABILITIES','Прочитай изменения и нажми кнопку ниже.':'Read the changes and press the button below.',
    'Нажми кнопку, чтобы начать исследование.':'Press the button to begin exploring.',
    'МИР БОССОВ':'BOSS WORLD','Подготовка отдельного мира…':'Preparing a separate world…',
    'Мир боссов':'Boss World','Создаём отдельное измерение и загружаем его сохранение…':'Creating a separate dimension and loading its save…',
    'Проверяем сохранение измерения…':'Checking dimension save…',
    'Сохранение ещё не создано. Создаём новый мир…':'No save exists yet. Creating a new world…',
    'Генерируем карту и загружаем объекты…':'Generating map and loading objects…',
    'Ты вошёл в отдельный Мир боссов.':'You entered the separate Boss World.',
    'Исходный мир не найден. Вернись через меню миров.':'Original world not found. Return through the world menu.',
    'Загружаем твой исходный мир…':'Loading your original world…',
    'Проверяем сохранение исходного мира…':'Checking original world save…',
    'Сохранение не найдено. Создаём исходный мир…':'Save not found. Creating the original world…',
    'Загружаем карту и состояние игрока…':'Loading map and player state…',
    'Ты вернулся в исходный мир.':'You returned to your original world.',
    'Портал откроется после того, как ты переживёшь 3 ночи. Осталось:':'The portal opens after you survive 3 nights. Remaining:',
    'Материал для будущего строительства.':'Material for future building.',
    'Прочный материал из лесной долины.':'Durable material from the forest valley.',
    'Редкий сияющий ресурс.':'Rare glowing resource.','Зелье, выданное администратором.':'Potion granted by an administrator.',
    'Монеты для будущей экономики.':'Coins for the future economy.','Руда из шахты.':'Ore from the mine.',
    'Деревянный меч':'Wooden Sword','Железный меч':'Iron Sword','Огненный меч':'Fire Sword',
    'Стальной меч':'Steel Sword','Меч титана':'Titan Sword','Улучшенная кирка':'Improved Pickaxe',
    'Кирка мастера':'Master Pickaxe','Малое зелье':'Minor Potion','Зелье скорости':'Speed Potion',
    'Настой силы':'Strength Elixir','Зелье защиты':'Defense Potion','Лечебная трава':'Healing Herb',
    'Кожаная броня':'Leather Armor','Грядка с семенами':'Seed Bed','Семена пшеницы':'Wheat Seeds',
    'Семена моркови':'Carrot Seeds','Семена картофеля':'Potato Seeds','Семена томата':'Tomato Seeds',
    'Семена кукурузы':'Corn Seeds','Семена тыквы':'Pumpkin Seeds','Семена клубники':'Strawberry Seeds',
    'Комплект дома':'House Kit','Броня стража':'Guardian Armor','Шлем лесника':'Ranger Helmet',
    'Амулет стража':'Guardian Amulet','Банк начислил проценты: +':'Bank interest earned: +',
    'Разлом измерений оставил межпространственный кристалл!':'The dimensional rift left an interdimensional crystal!',
    'КРОВАВАЯ ЛУНА пережита! Награда: 25 золота и 2 кристалла.':'BLOOD MOON survived! Reward: 25 gold and 2 crystals.',
    'Рассвет! Ты пережил ночь. Всего ночей:':'Dawn! You survived the night. Total nights:',
    'КРОВАВАЯ ЛУНА! Монстры сильнее. Выживи до рассвета за награду!':'BLOOD MOON! Monsters are stronger. Survive until dawn for a reward!',
    'Четвёртая ночь… Тени выходят из леса!':'The fourth night… Shadows emerge from the forest!',
    'Наступила ночь':'Night has fallen',
    'Коралловый вход':'Coral Entrance','Зал приливов':'Tide Hall','Глубинный охотник':'Deep Hunter',
    'Грот морского титана':'Sea Titan Grotto','Морской титан':'Sea Titan','Око бездны':'Abyss Eye',
    'Реликвия древних глубин':'Ancient Depths Relic','Управление кораблём':'Ship controls',
    'Путь затонувших стражей: тяжёлые рыцари охраняют проход.':'Path of the Sunken Guardians: heavy knights guard the passage.',
    'Коралловые катакомбы: ядовитые медузы и ловушки.':'Coral Catacombs: poisonous jellyfish and traps.',
    'Бездна древних: сильнейшие монстры и два алтаря богов.':'Ancient Abyss: the strongest monsters and two god altars.',
    'Сначала загрузи игровой мир.':'Load a game world first.',
    'Сначала создай корабль на второй странице верстака.':'Build a ship on the second workbench page first.',
    'Ты вышел за горизонт. Исследуй море и ищи затонувшие сокровища.':'You have sailed beyond the horizon. Explore the sea and search for sunken treasure.',
    'Ты всплыл на поверхность.':'You surfaced.','Без водяного шлема нельзя погружаться. Создай его на верстаке.':'You cannot dive without a water helmet. Craft one at the workbench.',
    'Шлем четвёртого уровня: запас воздуха больше не ограничен.':'Level 4 helmet: air supply is unlimited.',
    'Погружение! Запас воздуха:':'Diving! Air supply:',
    'Улучшать корабль можно только у берега. Вернись к причалу.':'The ship can only be upgraded at shore. Return to the dock.',
    'Корабль уже полностью улучшен: корпус и паруса максимального уровня.':'The ship is already fully upgraded: hull and sails are max level.',
    'Усиленный корпус':'Reinforced Hull','Паруса дальнего плавания':'Long-range Sails','Броня морского титана':'Sea Titan Armor',
    'Не хватает ресурсов:':'Not enough resources:','Возврат ресурсов: улучшение корабля отменено':'Resources refunded: ship upgrade cancelled',
    'Не удалось списать материалы. Ресурсы возвращены.':'Could not deduct materials. Resources were refunded.',
    'Не удалось списать золото. Материалы возвращены.':'Could not deduct gold. Materials were refunded.',
    'Корабль полностью улучшен.':'Ship fully upgraded.',
    'Улучшение доступно у берега · нажми, чтобы посмотреть стоимость.':'Upgrade available at shore · click to view the cost.',
    'Для входа нужен водяной шлем и погружение.':'A water helmet and diving are required to enter.',
    'Подводный грот находится у координат 309 / 214. Найди светящуюся арку на дне.':'The underwater grotto is at coordinates 309 / 214. Find the glowing arch on the seabed.',
    'Подводная экспедиция не активна.':'Underwater expedition is inactive.',
    'Награда за комнату подводного грота':'Underwater grotto room reward',
    'Морской титан повержен! Ты забрал древнюю реликвию и Око бездны.':'Sea Titan defeated! You claimed the ancient relic and the Abyss Eye.',
    'Осмотри дно рядом: здесь пока ничего нет.':'Search the nearby seabed: there is nothing here yet.',
    'Для ремонта у берега нужно 8 древесины и 2 железа.':'Repairing at shore requires 8 wood and 2 iron.',
    'Корабль отремонтирован у берега. Прочность':'Ship repaired at shore. Durability',
    'Корабль разрушен. Вернись на берег и отремонтируй его.':'The ship is destroyed. Return to shore and repair it.',
    'Волны несут корабль вперёд. Ищи обломки, метки на карте и вход в сокровищницу.':'Waves carry the ship forward. Search for wrecks, map markers and the treasury entrance.',
    'Компас приливов':'Tide Compass','Показывает ближайший неоткрытый морской сундук.':'Shows the nearest unopened sea chest.',
    'Плащ морского странника':'Sea Wanderer Cloak','Редкий косметический плащ, который нельзя создать.':'Rare cosmetic cloak that cannot be crafted.',
    'Кольцо глубин':'Ring of the Depths','Уникальный артефакт сокровищницы.':'Unique treasury artifact.',
    'Коралловая корона':'Coral Crown','Реликвия древних морских правителей.':'Relic of the ancient sea rulers.',
    'Сфера прилива':'Tide Sphere','Необычный артефакт, найденный только в море.':'Unusual artifact found only at sea.',
    'Сапоги волн':'Wave Boots','Редкая экипировка из затонувших сундуков.':'Rare gear from sunken chests.',
    'Перо штормового ската':'Storm Ray Feather','Трофей морского существа, не имеет рецепта крафта.':'Sea creature trophy with no crafting recipe.',
    'Морской талисман':'Sea Talisman','Уникальный талисман из древних тайников.':'Unique talisman from ancient caches.',
    'Нельзя открывать сундук без воздуха!':'You cannot open a chest without air!',
    'Карта сокровищ':'Treasure Map','Отмечает один тайник с редкой добычей в море.':'Marks one sea cache with rare loot.',
    'Найдена карта сокровищ! На карте отмечен настоящий сундук с редкой добычей.':'Treasure map found! A real chest with rare loot is marked on the map.',
    'В сундуке кристаллы и 180 золотых.':'The chest contains crystals and 180 gold.',
    'Редкая находка:':'Rare find:','Нужен водяной шлем.':'A water helmet is required.',
    'Ты вошёл в лабиринт. Впереди пять залов стражей, затем в последнем пути ждут ровно два бога моря.':'You entered the labyrinth. Five guardian halls lie ahead, followed by exactly two sea gods on the final path.',
    'Атаковать стража':'Attack the guardian','Ты вошёл в древнюю сокровищницу.':'You entered the ancient treasury.',
    'Сначала пройди один из глубоких путей.':'Complete one of the deep paths first.',
    'Все пять залов бездны очищены. За древними вратами пробуждаются два бога моря.':'All five Abyss halls are cleared. Two sea gods awaken beyond the ancient gate.',
    'Ты дошёл до зала двух богов!':'You reached the Hall of Two Gods!',
    'Путь очищен! Ты победил всех стражей и нашёл тайный сундук с уникальной реликвией.':'Path cleared! You defeated all guardians and found a secret chest with a unique relic.',
    'Не создаётся на верстаке.':'Cannot be crafted at the workbench.',
    'Этот маршрут пройден. Выбери другой глубокий путь или открой путь Безды.':'This route is complete. Choose another deep path or unlock the Abyss path.',
    'Нептун Разлома пробудился!':'Neptune of the Rift has awakened!',
    'Первый бог моря повержен!':'The first sea god has been defeated!',
    'Пробуждается Левиафан Бездны!':'Leviathan of the Abyss awakens!',
    'Второй и последний бог моря повержен!':'The second and final sea god has been defeated!',
    'Корона двух морей':'Crown of Two Seas','Уникальная награда за победу над двумя богами.':'Unique reward for defeating both gods.',
    'Нельзя создать на верстаке.':'Cannot be crafted at the workbench.',
    'Открыта главная сокровищница! Получены Корона двух морей и Реликвия древних глубин.':'The grand treasury is open! You received the Crown of Two Seas and the Ancient Depths Relic.',
    'Великая сокровищница открыта!':'The Grand Treasury is open!',
    'Оба бога повержены, главная сокровищница уже разграблена.':'Both gods are defeated; the grand treasury has already been looted.',
    'вернулся в океан и стал в 1,7 раза сильнее!':'returned to the ocean and became 1.7 times stronger!',
    'Бог возродился. Его повторное поражение снова даст трофей.':'The god has respawned. Defeating it again will grant another trophy.',
    'Ветер стих. Море спокойно.':'The wind has died down. The sea is calm.',
    'Начался дождь. Волны усиливаются.':'Rain has begun. The waves are growing stronger.',
    'ШТОРМ! Укройся или держи курс против волн.':'STORM! Take cover or steer against the waves.',
    'Воздух закончился! Тебя вынесло на поверхность.':'You ran out of air! You were forced to the surface.',
    'Шторм разбил корабль! Вернись на берег.':'The storm wrecked your ship! Return to shore.',
    'Акула укусила корабль! Прочность':'A shark bit the ship! Durability',
    'Подводный страж атакует!':'An underwater guardian is attacking!',
    'Войти в подводный грот':'Enter the underwater grotto',
    'Найди светящийся вход в грот у координат 309 / 214':'Find the glowing grotto entrance at coordinates 309 / 214',
    'Нужно погрузиться с водяным шлемом и доплыть до координат 309 / 214.':'Dive with a water helmet and swim to coordinates 309 / 214.',
    'Воздух: —':'Air: —','↑ Всплыть · E':'↑ Surface · E','↓ Нырнуть · E':'↓ Dive · E','ПОДВОДНЫЙ ГРОТ':'UNDERWATER GROTTO',
    'Активация Premium':'Premium activation','Введи действительный код, чтобы открыть расширенное издание.':'Enter a valid code to unlock the expanded edition.',
    'Проверка Premium':'Premium check',
    'Не удалось связаться с сервером лицензий. Проверь интернет и повтори попытку.':'Could not reach the license server. Check your internet connection and try again.',
    'Premium не отключён, но для проверки требуется соединение.':'Premium remains active, but a connection is required for verification.',
    'Выбери издание SkyRealm перед началом путешествия.':'Choose your SkyRealm edition before starting your journey.',
    'Введи код активации.':'Enter the activation code.','Проверяем код на сервере…':'Checking code with the server…',
    'Код неверный или обе тестовые активации уже использованы.':'The code is invalid or both test activations have already been used.',
    'Сервер активации временно недоступен. Попробуй позже.':'The activation server is temporarily unavailable. Try again later.',
    'Не удалось подтвердить код. Проверь его и попробуй снова.':'Could not verify the code. Check it and try again.',
    'Premium активирован! Осталась ещё 1 тестовая активация кода.':'Premium activated! One test activation remains.',
    'Premium активирован! Тестовые активации этого кода закончились.':'Premium activated! No test activations remain for this code.',
    'Добро пожаловать в Premium':'Welcome to Premium',
    'Лицензия привязана к этому устройству и проверяется сервером.':'The license is linked to this device and verified by the server.',
    'Нет соединения с сервером активации. Проверь интернет и повтори попытку.':'No connection to the activation server. Check your internet and try again.',
    'Возможность Premium':'Premium feature','Эта возможность':'This feature',
    'доступна в Premium. Введи код активации, чтобы открыть её.':'is available in Premium. Enter an activation code to unlock it.',
    'Бесплатная версия · Free':'Free edition · Free',
    'Вот что входит в каждое издание SkyRealm.':'Here is what each SkyRealm edition includes.',
    'Облачные сохранения':'Cloud saves',
    'Поручения обновятся в новый игровой день.':'Contracts will refresh on the next in-game day.',
    'Житель':'Villager'
  }
  Object.assign(translations,{
    'КАМЕНОЛОМНЯ':'STONE QUARRY','КАМЕНЩИК':'STONEMASON','Бран':'Bran',
    'E · ЗАКАЗЫ':'E · ORDERS','T · ПРОДАЖА КАМНЯ':'T · SELL STONE',
    'Заказ каменоломни':'Quarry contract','Добудь и доставь 25 камня':'Mine and deliver 25 stone',
    'Выбери кирку и нажми E рядом с каменным валуном.':'Select a pickaxe and press E beside a stone boulder.',
    'Удар киркой':'Pickaxe strike','Каменная жила':'Stone vein','Жила добыта!':'Vein mined!',
    'Эта жила уже добыта. Камень восстановится примерно через ':'This vein is depleted. It will recover in about ',
    'игровых ч.':'in-game hours.','Камень × ':'Stone × ','· бонус +1 камень':'· bonus +1 stone',
    'Каменная жила восстановилась.':'A stone vein has been restored.',
    'Ранг каменщика повышен до ':'Stonemason rank increased to '
  });
;
  const patterns = [
    [/^(\d+)\s+миров?$/i, '$1 worlds'],
    [/^(\d+)\s+золота$/i, '$1 gold'],
    [/^(\d+)\s+кристалл(?:а|ов)?$/i, '$1 crystals'],
    [/^Здоровье:\s*(\d+)\/(\d+)$/, 'Health: $1/$2'],
    [/^Уровень\s*(\d+)$/, 'Level $1'],
    [/^· Уровень\s*(\d+)$/, '· Level $1'],
    [/^УР\.\s*(\d+)$/, 'LVL $1'],
    [/^Корабль улучшен · уровень\s*(\d+)$/, 'Ship upgraded · level $1'],
    [/^Прочность\s*(\d+)\/(\d+)$/, 'Durability $1/$2'],
    [/^Погружение! Запас воздуха:\s*(\d+)$/, 'Diving! Air supply: $1'],
    [/^Найдено миров:\s*(\d+)$/, 'Worlds found: $1'],
    [/^(.+) · выполнено заказов:\s*(\d+)$/, (m,rank,count) => translate(rank)+' · contracts completed: '+count],
    [/^Заказ выполнен · (.+) · зарплата (\d+) золота · \+(\d+) XP(?: · (.+))?$/, (m,job,gold,xp,item) => 'Contract completed · '+translate(job)+' · pay '+gold+' gold · +'+xp+' XP'+(item?' · '+translate(item):'')],
    [/^(.+) уже находится на арене\. Войди внутрь и вступи в бой\.$/, (m,boss) => translate(boss)+' is already in the arena. Enter to fight.'],
    [/^АРЕНА ПРОБУЖДЕНА: (.+) · (.+) ждёт тебя!$/, (m,arena,boss) => 'ARENA AWAKENED: '+translate(arena)+' · '+translate(boss)+' awaits you!'],
    [/^Дерево срублено: \+(\d+) древесины, \+(\d+) листка, \+(\d+) палка(?: · бонус лесоруба)?\.?$/, (m,wood,leaves,sticks) => 'Tree felled: +'+wood+' timber, +'+leaves+' leaves, +'+sticks+' sticks.'],
    [/^Добыто: (.+) ×(\d+)(?: и камень ×1)?(?: · бонус рудокопа)?$/, (m,item,count) => 'Mined: '+translate(item)+' ×'+count+(m.includes('камень ×1')?' and stone ×1':'')+'.']
  ];
  let language = 'ru';
  const originals = new WeakMap();
  const attributeOriginals = new WeakMap();
  const ignoredTags = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA']);
  function translate(value) {
    const source = String(value ?? '');
    if (language !== 'en') return source;
    const exact = translations[source.trim()];
    if (exact) return exact;
    for (const [pattern,replacement] of patterns) if (pattern.test(source.trim())) return source.replace(source.trim(),source.trim().replace(pattern,replacement));
    return source;
  }
  function processText(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) return;
    if (ignoredTags.has(node.parentElement.tagName)) return;
    const current = node.nodeValue || '';
    const record = originals.get(node);
    const original = record && current === record.translated ? record.original : current;
    const trimmed = original.trim();
    if (!trimmed) return;
    const translated = translate(trimmed);
    originals.set(node,{original,translated});
    const lead = original.match(/^\s*/)?.[0] || '';
    const tail = original.match(/\s*$/)?.[0] || '';
    const next = lead + translated + tail;
    if (current !== next) node.nodeValue = next;
  }
  function processAttributes(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    const attrs = ['title','aria-label','placeholder','alt'];
    let saved = attributeOriginals.get(el);
    if (!saved) { saved = new Map(); attributeOriginals.set(el,saved); }
    for (const attr of attrs) {
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr);
      const rec = saved.get(attr);
      const original = rec && current === rec.translated ? rec.original : current;
      const translated = translate(original);
      saved.set(attr,{original,translated});
      if (current !== translated) el.setAttribute(attr,translated);
    }
    if ((el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && ['button','submit'].includes(el.type))) && el.hasAttribute('value')) {
      const current=el.getAttribute('value'),rec=saved.get('value'),original=rec&&current===rec.translated?rec.original:current,translated=translate(original);
      saved.set('value',{original,translated});if(current!==translated)el.setAttribute('value',translated);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { processText(root); return; }
    if (root.nodeType === Node.ELEMENT_NODE) {
      processAttributes(root);
      if (ignoredTags.has(root.tagName)) return;
    }
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node; while ((node=walker.nextNode())) processText(node);
    if (root.querySelectorAll) root.querySelectorAll('*').forEach(processAttributes);
  }
  function setLanguage(next,save=true) {
    language = next === 'en' ? 'en' : 'ru';
    document.documentElement.lang = language;
    if (save) {
      try { localStorage.setItem(KEY,language); } catch (_) {}
    }
    const select = document.getElementById('game-language-select');
    if (select) select.value = language;
    walk(document.body);
    window.dispatchEvent(new CustomEvent('skyrealm-language-change',{detail:{language}}));
  }
  const ctxProto = window.CanvasRenderingContext2D?.prototype;
  if (ctxProto && !ctxProto.__skyRealmLanguagePatched) {
    const fill = ctxProto.fillText, stroke = ctxProto.strokeText, measure = ctxProto.measureText;
    if (fill) ctxProto.fillText = function(text,...args){return fill.call(this,translate(text),...args);};
    if (stroke) ctxProto.strokeText = function(text,...args){return stroke.call(this,translate(text),...args);};
    if (measure) ctxProto.measureText = function(text){return measure.call(this,translate(text));};
    Object.defineProperty(ctxProto,'__skyRealmLanguagePatched',{value:true});
  }
  const launchLanguage = launchSettings.language === 'en' ? 'en' : (launchSettings.language === 'ru' ? 'ru' : '');
  let stored = '', lastLauncherLanguage = '';
  try { stored = localStorage.getItem(KEY) || ''; lastLauncherLanguage = localStorage.getItem('skyrealm_launcher_language') || ''; } catch (_) {}
  if (launchLanguage && launchLanguage !== lastLauncherLanguage) {
    setLanguage(launchLanguage,true);
    try { localStorage.setItem('skyrealm_launcher_language',launchLanguage); } catch (_) {}
  } else {
    setLanguage(stored === 'en' ? 'en' : (stored === 'ru' ? 'ru' : (launchLanguage || 'ru')),false);
    if (launchLanguage) { try { localStorage.setItem('skyrealm_launcher_language',launchLanguage); } catch (_) {} }
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') processText(record.target);
      for (const node of record.addedNodes || []) walk(node);
      if (record.type === 'attributes') processAttributes(record.target);
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','alt','value']});
  window.SkyRealmI18n = {setLanguage,getLanguage:()=>language,translate};
  const select = document.getElementById('game-language-select');
  if (select) select.addEventListener('change',()=>setLanguage(select.value,true));
})();