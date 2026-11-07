# SkyRealm PC Launcher

Репозиторий компьютерной версии SkyRealm Launcher.

## Автоматические сборки и обновления

- GitHub Actions собирает Windows-приложение из исходников Python 3.12.
- При изменениях в `main` workflow собирает `SkyRealm.exe` и публикует релиз.
- Релиз содержит `SkyRealm_Update.zip` для лаунчера и `SkyRealm_Game.zip` для самой игры.
- При запуске лаунчер проверяет обновление лаунчера; при нажатии «Играть» проверяет и при необходимости обновляет игру.
- Манифест содержит версии и SHA-256 обоих архивов:
  https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/manifest.json

## Текущая версия игры

Установленная и публикуемая сборка игры: **0.20.50.90**. В ней доступны профессии лесоруба и рудокопа, четыре арены мира боссов, русский/английский интерфейс и новая каменоломня с добычей камня и руды, улучшением кирок, восстановлением залежей и оплачиваемыми заказами.

## 0.20.50.80 — Account Edition Preferences

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
