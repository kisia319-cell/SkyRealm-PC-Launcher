# SkyRealm PC Launcher

Репозиторий компьютерной версии SkyRealm Launcher.

## Автоматические сборки и обновления

- GitHub Actions собирает Windows-приложение из исходников Python 3.12.
- При изменениях в `main` workflow собирает `SkyRealm.exe` и публикует релиз.
- Релиз содержит `SkyRealm_Update.zip` для лаунчера и `SkyRealm_Game.zip` для самой игры.
- При запуске лаунчер проверяет обновление лаунчера; при нажатии «Играть» проверяет и при необходимости обновляет игру.
- Манифест содержит версии и SHA-256 обоих архивов:
  https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/manifest.json


## Release channels

- The stable Windows launcher reads only `manifest.json` and the stable GitHub Release.
- Co-op preview archives are published separately; their manifest is `preview-manifest.json` and is never written into the stable update channel.
- The user's `updater_config.json` remains pinned to the stable manifest unless the user deliberately changes it.

## Версия 0.20.50.122 — Великий страж деревни

- В нападении на деревню теперь участвуют восемь обычных защитников и отдельный Великий страж.
- Великий страж имеет 250 HP и наносит 19 базового урона за удар.
- Скорость стража составляет 155/1,3 пикселя в секунду — в 1,3 раза ниже базовой скорости ходьбы игрока.
- Дальность удара динамически равна текущей дальности оружия игрока, делённой на 1,2.
- Добавлена отдельная анимация и модель бронированного стража, полоска здоровья и сохранение его состояния в мире.
- Нападение требует свободного места для всех девяти защитников. Проверки характеристик и сценария налёта добавлены в сборку.
- Управление и код перемещения игрока не изменялись.

## Версия 0.20.50.122 — сохранение активных нападений

- Активные группы противников мировых событий теперь сохраняются в обычном сохранении мира и восстанавливаются после перезапуска.
- Сохраняются здоровье, тип, положение, принадлежность к событию и специальные фазы существ; побеждённые враги не появляются повторно.
- Исправлена потеря защитников во время нападения на деревню при выходе из игры или перезагрузке.
- Добавлены проверки сохранения и восстановления событий. Код ходьбы и перемещения не менялся.

## Версия 0.20.50.122 — нападения на деревни

- В обычном мире в «Хрониках мира» добавлена отдельная возможность начать нападение на ближайшее поселение.
- Перед налётом выбирается ближайшая деревня; событие создаёт группу из восьми защитников, с которыми игрок сражается обычной боевой системой.
- После победы выдаются 180 золота, знак налётчика и два слитка закалённого железа. Награда выдаётся один раз за событие; повторный налёт доступен через три игровых дня.
- Состояние события сохраняется отдельно для каждого мира. Добавлен регрессионный тест выбора поселения, появления защитников, завершения боя и однократной награды.
- Код ходьбы и перемещения игрока не изменялся.

## Проверки версии 0.20.50.122

- Автотесты проверяют восстановление деревьев, генерацию Древнего леса, три фазы Короля Древнего Леса, награды Пещеры Шёпота, заброшенного поселения и ночных разбойничьих налётов.
- Отдельно проверяются вход в Склеп Корней, три стража, обезвреживание корневой ловушки и награда проклятого сундука.
- Stable и co-op preview используют отдельные манифесты; preview не должен изменять стабильный канал обновлений.
- Перед обновлением локальных файлов проверяется наличие отдельной резервной копии хранилища миров.

## Версия 0.20.50.122 — повторяемые морские находки

- Добавлены четыре отмеченные на морской карте точки спасения грузов: затонувший караван, коралловый тайник, китобойный остов и глубинный груз.
- Каждая точка выдаёт настоящие материалы в инвентарь и золото; повторное пополнение наступает через три игровых дня.
- Состояние тайников сохраняется в морском сохранении; старые морские сохранения автоматически получают безопасные значения по умолчанию.
- Добавлена кнопка ближайшего груза и маркеры точек на карте.

## Текущая версия игры

Установленная и публикуемая сборка игры: **0.20.50.122**. Помимо Хроник миров добавлены развитие торговых городов с пятью общественными зданиями, репутацией и настроением поселения, строительством за реальные материалы и золотом, а также патруль обороны с настоящими врагами и трофеем за победу. Морская экспедиция получила три именованных острова с сохраняемым исследованием и разовыми наградами; Кракен — отдельный трёхфазный морской босс, открываемый после исследования двух островов и улучшения корабля. Четыре морские точки salvage повторно пополняются каждые три игровых дня и выдают настоящие материалы и золото.

## Account Edition Preferences

- Added an opt-in checkbox below Premium/Free choices to remember the selected edition.
- Stored the preference against the authenticated SkyRealm account, so it follows the same account across computers and does not leak between different accounts.
- When the checkbox is off, the account preference is cleared and the edition chooser appears on each game start.
- Kept Premium activation validation and device-bound license checks intact.
- Player movement and walking code were not changed.

## 0.20.50.83 — Mine visuals and barrel collision
- Players can now walk through mine barrels without changing the maze wall collision.
- Added a full-screen cave rock backdrop with layered strata, ceiling silhouettes and subtle mineral glints behind the mine passages.
- Kept barrels free of floating text labels.

## 0.20.50.86 — Boss Realm structure and collision rebuild

- Fixed the house exit route by removing a decorative collision that blocked the doorway.
- Expanded workbench interaction so it can be opened from any accessible side.
- Rebuilt all six companion visuals with distinct body shapes, facial details, animated wings and tails, markings, glow and particles.
- Added in-game audio controls for music, sound effects and interface sounds; changes save with game preferences.
- Staff roles are refreshed when returning to the main menu and retry sooner after an unconfirmed role check.
- Player movement code was not changed.

## 0.20.50.85 — House access, companion models and audio settings

- Fixed the house exit route by removing a decorative collision that blocked the doorway.
- Expanded workbench interaction so it can be opened from any accessible side.
- Rebuilt all six companion visuals with distinct body shapes, facial details, animated wings and tails, markings, glow and particles.
- Added in-game audio controls for music, sound effects and interface sounds; changes save with game preferences.
- Staff roles are refreshed when returning to the main menu and retry sooner after an unconfirmed role check.
- Player movement code was not changed.

## 0.20.50.83 — English localization and responsive HUD
- Expanded English translations for menus, crafting, equipment, mods, cloud saves, professions and sea content.
- Improved case-insensitive matching for dynamically rendered labels.
- HUD positions now use proportional coordinates, clamp to the visible game area after resizing, and reset when changing layout presets.
- Removed the nested vitals bar from independent HUD dragging and improved compact/mobile preset placement.

## 0.20.50.90 — Studio script-mod publishing

- Removed the built-in FaerTestMod entry, Faer Sword catalog item, automatic sword grant and its per-world save flag. The test mod is no longer preinstalled in the game.
- Added a native launcher bridge that reads only validated, size-limited mod records published by SkyRealm Mod Studio.
- Published JavaScript/Python mods synchronize into the in-game “Мои скриптовые моды” list. The list refreshes when the catalog is opened, even if the game was already running. New mods are imported disabled; players enable them in the catalog.
- Updated script mods with the same ID replace their prior code while preserving the in-game enabled state.
- Existing isolated script runtime and bounded gameplay actions remain in use.
- Player movement and walking code were not changed.

## Обновление игры

Изменяй файлы в каталоге `game/` и увеличивай `game/version.txt`. GitHub Actions упакует игру, посчитает SHA-256 и добавит архив в Release. Игрокам не нужно скачивать лаунчер заново: при следующем нажатии «Играть» он загрузит новую версию игры автоматически.

## Основные файлы

`launcher.py`, `update_helper.py`, `launcher_version.txt`, `game_runner_version.txt`, `updater_config.json`, `manifest.json`, файлы интерфейса и каталог `game/`.

Не публикуй секреты, пароли или токены в репозитории.

## Резервные копии миров (игра 0.13.0)

В меню миров можно скачать JSON-копию каждого мира кнопкой «Копия» и восстановить её через «Импорт резервной копии». Импорт создаёт отдельный новый мир и не перезаписывает существующие. Храни копии вне папки игры перед крупными обновлениями. Во время игры доступно ручное сохранение из меню паузы; приложение также сохраняет мир при закрытии или сворачивании. Если хранилище заполнено или недоступно, игра покажет предупреждение, а не скроет ошибку.


## SkyRealm Launcher 1.0.1

- Новости ведут на актуальные релизы и историю изменений.
- Сообщество ведёт на GitHub-страницы для ошибок, предложений и релизов.
- Витрина косметики обозначена как концепт: покупки и платежи не включены.
- В настройках доступны проверка основных файлов, открытие папки игры и журнала обновлений.
- При нажатии «Играть» лаунчер дополнительно проверяет наличие и размеры файлов комплекта; отсутствующие или отличающиеся по размеру файлы копируются заново. Папка данных и профиль WebView с сохранениями не удаляются.

Онлайн-платежи, облачная синхронизация миров, форум и многопользовательский режим не заявляются как работающие функции без серверной логики и защиты.


## Авторские материалы и сторонние лицензии

- Реестр графики, звуков, шрифтов, игровых ресурсов и непроверенных файлов: [ASSET_AND_LICENSE_REGISTER.md](ASSET_AND_LICENSE_REGISTER.md).
- Уведомления о стороннем ПО и лицензиях: [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
