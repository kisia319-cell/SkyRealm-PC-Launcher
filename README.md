# SkyRealm PC Launcher

Репозиторий компьютерной версии SkyRealm Launcher.

## Автоматические сборки и обновления

- GitHub Actions собирает Windows-приложение из исходников Python 3.12.
- При публикации тега вида `v0.9.5` создаётся GitHub Release с `SkyRealm_Update.zip`.
- В ZIP должны находиться `SkyRealm.exe` и `launcher_version.txt`.
- Workflow вычисляет SHA-256 архива и обновляет `manifest.json`.
- Манифест доступен по адресу:
  `https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/manifest.json`

## Важно

Репозиторий должен содержать исходники лаунчера и игры. Нужны как минимум:
`launcher.py`, `update_helper.py`, `launcher_version.txt`, `game_runner_version.txt`, `updater_config.json`, `index.html`, `style.css`, `app.js`, `config.js`, `realm.jpg`, `icon.png`, каталог `game/` и файл `SkyRealm.ico`.

Пока исходники не загружены, автоматическая сборка не запустится. Не публикуйте секреты, пароли или токены в репозитории.
