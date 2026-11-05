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
if exist "build_game_runner" rmdir /s /q "build_game_runner"
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
echo [3/5] Building separate game runner...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --name SkyRealmGame --distpath "game_runner_dist" --workpath "build_game_runner\work" --specpath "build_game_runner" launcher.py
if errorlevel 1 exit /b 1
if not exist "game_runner_dist\SkyRealmGame.exe" exit /b 1
echo [4/5] Building launcher with all web assets...
"%VPY%" -m PyInstaller --noconfirm --clean --windowed --onefile --name SkyRealm --icon "SkyRealm.ico" --add-data "index.html;." --add-data "style.css;." --add-data "app.js;." --add-data "config.js;." --add-data "launcher-enhancements.js;." --add-data "launcher-enhancements.css;." --add-data "launcher_version.txt;." --add-data "updater_config.json;." --add-data "realm.jpg;." --add-data "icon.png;." --add-data "game;game" --add-data "game_runner_version.txt;." --add-data "game_runner_dist\SkyRealmGame.exe;bin" launcher.py
if errorlevel 1 exit /b 1
if not exist "dist\SkyRealm.exe" exit /b 1
echo [5/5] Verifying bundled calendar assets...
"%VPY%" -c "from pathlib import Path; import sys; p=Path('dist/SkyRealm.exe'); assert p.is_file() and p.stat().st_size>1000000; print('EXE_OK',p.stat().st_size)"
if errorlevel 1 exit /b 1
echo.
echo BUILD SUCCESSFUL: "%~dp0dist\SkyRealm.exe"
exit /b 0