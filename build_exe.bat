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
"%VPY%" -m pip install -r requirements-build.txt
if errorlevel 1 exit /b 1
"%VPY%" -m pip freeze > build-dependencies.txt
if errorlevel 1 exit /b 1
if exist "game_runner_dist" rmdir /s /q "game_runner_dist"
if exist "prime_launcher_dist" rmdir /s /q "prime_launcher_dist"
if exist "build_prime_launcher" rmdir /s /q "build_prime_launcher"
if exist "updater_dist" rmdir /s /q "updater_dist"
if exist "build_game_runner" rmdir /s /q "build_game_runner"
if exist "build_updater" rmdir /s /q "build_updater"
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
echo [3/7] Building separate game runner...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --noupx --name SkyRealmGame --distpath "game_runner_dist" --workpath "build_game_runner\work" --specpath "build_game_runner" launcher.py
if errorlevel 1 exit /b 1
if not exist "game_runner_dist\SkyRealmGame.exe" exit /b 1
echo [4/7] Building isolated PrimeLauncher runtime...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --noupx --name PrimeLauncher --distpath "prime_launcher_dist" --workpath "build_prime_launcher\work" --specpath "build_prime_launcher" --add-data "game\competitive;game\competitive" launcher.py
if errorlevel 1 exit /b 1
if not exist "prime_launcher_dist\PrimeLauncher.exe" exit /b 1
echo [5/7] Building standalone updater helper...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --console --noupx --name SkyRealmUpdater --distpath "updater_dist" --workpath "build_updater\work" --specpath "build_updater" update_helper.py
if errorlevel 1 exit /b 1
if not exist "updater_dist\SkyRealmUpdater.exe" exit /b 1
echo [6/7] Building launcher with calendar, updater and PrimeLauncher assets...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --noupx --name SkyRealm --icon "SkyRealm.ico" --add-data "index.html;." --add-data "style.css;." --add-data "app.js;." --add-data "config.js;." --add-data "launcher-enhancements.js;." --add-data "launcher-enhancements.css;." --add-data "launcher_version.txt;." --add-data "updater_config.json;." --add-data "realm.jpg;." --add-data "icon.png;." --add-data "game;game" --add-data "game_runner_version.txt;." --add-data "game_runner_dist\SkyRealmGame.exe;bin" --add-data "prime_launcher_dist\PrimeLauncher.exe;bin" --add-data "updater_dist\SkyRealmUpdater.exe;bin" launcher.py
if errorlevel 1 exit /b 1
if not exist "dist\SkyRealm.exe" exit /b 1
echo [7/7] Verifying bundled launcher, updater and PrimeLauncher assets...
"%VPY%" -c "from pathlib import Path; import subprocess; p=Path('dist/SkyRealm.exe'); assert p.is_file() and p.stat().st_size>1000000; u=Path('updater_dist/SkyRealmUpdater.exe'); assert u.is_file() and u.stat().st_size>1000000; viewer=str(Path('.venv')/'Scripts'/'pyi-archive_viewer.exe'); r=subprocess.run([viewer,'-l','-b',str(p)],capture_output=True,text=True,encoding='utf-8',errors='replace'); s=(r.stdout+r.stderr).lower().replace(chr(92),'/'); required=['launcher-enhancements.js','launcher-enhancements.css','bin/skyrealmupdater.exe','bin/primelauncher.exe']; missing=[x for x in required if x not in s]; assert r.returncode==0 and not missing, 'Missing bundled assets: '+repr(missing); print('EXE_OK',p.stat().st_size,'UPDATER_OK',u.stat().st_size,'BUNDLED_ASSETS_OK')"
if errorlevel 1 exit /b 1
"%VPY%" -c "from pathlib import Path; import subprocess; p=Path('prime_launcher_dist/PrimeLauncher.exe'); v=str(Path('.venv')/'Scripts'/'pyi-archive_viewer.exe'); r=subprocess.run([v,'-l','-b',str(p)],capture_output=True,text=True,encoding='utf-8',errors='replace'); s=(r.stdout+r.stderr).lower().replace(chr(92),'/'); missing=[x for x in ['game/competitive/index.html','game/competitive/prime-world.js'] if x not in s]; assert r.returncode==0 and not missing, 'PrimeLauncher missing game UI: '+repr(missing); print('PRIME_ASSETS_OK',p.stat().st_size)"
if errorlevel 1 exit /b 1
echo.
echo BUILD SUCCESSFUL: "%~dp0dist\SkyRealm.exe"
exit /b 0