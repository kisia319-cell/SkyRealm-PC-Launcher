# SkyRealm PC Launcher

Репозиторий компьютерной версии SkyRealm Launcher.

## Автоматические сборки и обновления

- GitHub Actions собирает Windows-приложение из исходников Python 3.12.
- При изменениях в `main` workflow собирает `SkyRealm.exe` и публикует релиз.
- Релиз содержит `SkyRealm_Update.zip` для лаунчера и `SkyRealm_Game.zip` для самой игры.
- При запуске лаунчер проверяет обновление лаунчера; при нажатии «Играть» проверяет и при необходимости обновляет игру.
- Манифест содержит версии и SHA-256 обоих архивов:
  https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/manifest.json

## Обновление игры

Изменяй файлы в каталоге `game/` и увеличивай `game/version.txt`. GitHub Actions упакует игру, посчитает SHA-256 и добавит архив в Release. Игрокам не нужно скачивать лаунчер заново: при следующем нажатии «Играть» он загрузит новую версию игры автоматически.

## Основные файлы

`launcher.py`, `update_helper.py`, `launcher_version.txt`, `game_runner_version.txt`, `updater_config.json`, `manifest.json`, файлы интерфейса и каталог `game/`.

Не публикуй секреты, пароли или токены в репозитории.
