@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SkyRealm Launcher Builder
set "VPY=%~dp0.venv\Scripts\python.exe"
if not exist "%VPY%" (
  echo [1/5] Creating Python 3.12 environment...
  py -3.12 -m venv ".venv"
  if errorlevel 1 exit /b 1
)
echo [2/5] Installing launcher build dependencies...
"%VPY%" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
"%VPY%" -m pip install pywebview pyinstaller
if errorlevel 1 exit /b 1
if exist "game_runner_dist" rmdir /s /q "game_runner_dist"
if exist "updater_dist" rmdir /s /q "updater_dist"
if exist "build_game_runner" rmdir /s /q "build_game_runner"
if exist "build_updater" rmdir /s /q "build_updater"
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
echo [3/6] Building separate game runner...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --noupx --name SkyRealmGame --distpath "game_runner_dist" --workpath "build_game_runner\work" --specpath "build_game_runner" launcher.py
if errorlevel 1 exit /b 1
if not exist "game_runner_dist\SkyRealmGame.exe" exit /b 1
echo [4/6] Building standalone updater helper...
"%VPY%" -m PyInstaller --noconfirm --clean --onefile --console --noupx --name SkyRealmUpdater --distpath "updater_dist" --workpath "build_updater\work" --specpath "build_updater" update_helper.py
if errorlevel 1 exit /b 1
if not exist "updater_dist\SkyRealmUpdater.exe" exit /b 1
echo [5/6] Building launcher with calendar and updater assets...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --noupx --name SkyRealm --icon "SkyRealm.ico" --add-data "index.html;." --add-data "style.css;." --add-data "app.js;." --add-data "config.js;." --add-data "launcher-enhancements.js;." --add-data "launcher-enhancements.css;." --add-data "launcher_version.txt;." --add-data "updater_config.json;." --add-data "realm.jpg;." --add-data "icon.png;." --add-data "game;game" --add-data "game_runner_version.txt;." --add-data "game_runner_dist\SkyRealmGame.exe;bin" --add-data "updater_dist\SkyRealmUpdater.exe;bin" launcher.py
if errorlevel 1 exit /b 1
if not exist "dist\SkyRealm.exe" exit /b 1
echo [6/6] Verifying bundled calendar and updater assets...
"%VPY%" -c "from pathlib import Path; import subprocess; p=Path('dist/SkyRealm.exe'); assert p.is_file() and p.stat().st_size>1000000; u=Path('updater_dist/SkyRealmUpdater.exe'); assert u.is_file() and u.stat().st_size>1000000; viewer=str(Path('.venv')/'Scripts'/'pyi-archive_viewer.exe'); r=subprocess.run([viewer,'-l','-b',str(p)],capture_output=True,text=True,encoding='utf-8',errors='replace'); s=(r.stdout+r.stderr).lower().replace(chr(92),'/'); required=['launcher-enhancements.js','launcher-enhancements.css','bin/skyrealmupdater.exe']; missing=[x for x in required if x not in s]; assert r.returncode==0 and not missing, 'Missing bundled assets: '+repr(missing); print('EXE_OK',p.stat().st_size,'UPDATER_OK',u.stat().st_size,'BUNDLED_ASSETS_OK')"
if errorlevel 1 exit /b 1
echo.
echo BUILD SUCCESSFUL: "%~dp0dist\SkyRealm.exe"
exit /b 0