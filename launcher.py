"""SkyRealm desktop launcher and lightweight local game installer."""
import os
import shutil
import subprocess
import sys
import time
import json
import hashlib
import zipfile
import urllib.request
import functools
import http.server
import threading
from urllib.parse import urlencode
from pathlib import Path

import webview


def resource_path(name: str) -> str:
    """Resolve bundled resources in source mode and in PyInstaller one-file mode."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base / name)


def file_sha256(path: Path) -> str:
    """Hash a file incrementally so binary integrity checks do not depend on file size."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


window = None
game_window = None
game_fullscreen = False

DEFAULT_SETTINGS = {
    "resolution": "1280x720",
    "windowMode": "windowed",
    "graphicsQuality": "medium",
    "uiScale": "100",
    "showVitals": True,
    "showQuest": True,
    "showControls": True,
    "showInventory": True,
    "adminMode": False,
    "moderatorMode": False,
}


def settings_file() -> Path:
    app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    directory = app_data / "SkyRealm"
    directory.mkdir(parents=True, exist_ok=True)
    return directory / "settings.json"


def normalize_settings(value=None) -> dict:
    settings = dict(DEFAULT_SETTINGS)
    if isinstance(value, dict):
        settings.update(value)
    if settings.get("resolution") not in {"1280x720", "1600x900", "1920x1080", "1280x960", "1440x900"}:
        settings["resolution"] = DEFAULT_SETTINGS["resolution"]
    if settings.get("windowMode") not in {"windowed", "fullscreen"}:
        settings["windowMode"] = DEFAULT_SETTINGS["windowMode"]
    if settings.get("graphicsQuality") not in {"low", "medium", "high"}:
        settings["graphicsQuality"] = DEFAULT_SETTINGS["graphicsQuality"]
    if str(settings.get("uiScale")) not in {"85", "100", "115"}:
        settings["uiScale"] = DEFAULT_SETTINGS["uiScale"]
    else:
        settings["uiScale"] = str(settings["uiScale"])
    for key in ("showVitals", "showQuest", "showControls", "showInventory"):
        settings[key] = settings.get(key) is not False
    settings["adminMode"] = settings.get("adminMode") is True
    settings["moderatorMode"] = settings.get("moderatorMode") is True
    return settings


def read_user_settings() -> dict:
    try:
        return normalize_settings(json.loads(settings_file().read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError):
        return dict(DEFAULT_SETTINGS)


def save_user_settings(value) -> dict:
    settings = normalize_settings(value)
    settings_file().write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return settings


def resolution_size(settings: dict) -> tuple[int, int]:
    try:
        width, height = str(settings.get("resolution", "1280x720")).split("x", 1)
        return max(850, int(width)), max(540, int(height))
    except (TypeError, ValueError):
        return 1280, 720


def _js_update(percent: int, stage: str, detail: str) -> None:
    """Update the launch progress overlay; strings are JS-escaped by JSON encoding."""
    import json
    if window is None:
        return
    try:
        payload = json.dumps([int(percent), stage, detail], ensure_ascii=False)
        window.evaluate_js("if (window.setGameProgress) window.setGameProgress.apply(null, " + payload + ");")
    except Exception:
        # UI may not be ready during startup. The actual install can still continue.
        pass


class LauncherApi:
    def minimize(self):
        try:
            window.minimize()
        except Exception:
            pass

    def close(self):
        try:
            window.destroy()
        except Exception:
            pass

    def open_data_folder(self):
        """Open the local SkyRealm data folder in the system file manager."""
        try:
            app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
            directory = app_data / "SkyRealm"
            directory.mkdir(parents=True, exist_ok=True)
            if os.name == "nt":
                os.startfile(str(directory))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(directory)])
            else:
                subprocess.Popen(["xdg-open", str(directory)])
            return {"ok": True, "path": str(directory)}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось открыть папку данных: " + str(exc)}

    def _skyrealm_webview_profile_dir(self):
        app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        return app_data / "SkyRealm" / "webview-profile"

    def _skyrealm_game_is_running(self):
        try:
            if os.name == "nt":
                result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq SkyRealmGame.exe"],
                                        capture_output=True, text=True, timeout=5, check=False)
                return "SkyRealmGame.exe" in (result.stdout or "")
            result = subprocess.run(["pgrep", "-f", "SkyRealmGame"],
                                    capture_output=True, text=True, timeout=5, check=False)
            return result.returncode == 0
        except Exception:
            # Fail closed: do not touch Chromium's LevelDB while process state is unknown.
            return True

    def _skyrealm_create_world_backup(self):
        profile = self._skyrealm_webview_profile_dir()
        candidates = [p for p in profile.rglob("Local Storage") if p.is_dir() and (p / "leveldb").is_dir()] if profile.exists() else []
        if not candidates:
            return {"ok": False, "message": "Хранилище миров не найдено. Сначала запусти игру и создай или открой мир."}
        root = profile.parent
        backup_dir = root / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        archive = backup_dir / ("skyrealm-worlds-" + stamp + ".zip")
        count = 0
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for storage in candidates:
                for item in storage.rglob("*"):
                    if item.is_file():
                        bundle.write(item, item.relative_to(profile).as_posix())
                        count += 1
            bundle.writestr("backup-info.json", json.dumps({
                "format": 1, "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "application": "SkyRealm", "storage": "Chromium Local Storage"
            }, ensure_ascii=False, indent=2))
        if count == 0:
            archive.unlink(missing_ok=True)
            return {"ok": False, "message": "В хранилище пока нет файлов сохранений."}
        return {"ok": True, "path": str(archive), "files": count}

    def backup_worlds(self):
        """Create a non-destructive archive of the WebView localStorage database."""
        try:
            if self._skyrealm_game_is_running():
                return {"ok": False, "message": "Сначала полностью закрой SkyRealm, затем создай резервную копию."}
            return self._skyrealm_create_world_backup()
        except Exception as exc:
            return {"ok": False, "message": "Не удалось создать копию миров: " + str(exc)}

    def restore_worlds(self):
        """Restore the newest backup after first creating a safety copy of current saves."""
        try:
            if self._skyrealm_game_is_running():
                return {"ok": False, "message": "Сначала полностью закрой SkyRealm. Нельзя восстанавливать базу, пока игра запущена."}
            root = self._skyrealm_webview_profile_dir()
            backup_dir = root.parent / "backups"
            archives = sorted(backup_dir.glob("skyrealm-worlds-*.zip"), key=lambda p: p.stat().st_mtime, reverse=True) if backup_dir.exists() else []
            if not archives:
                return {"ok": False, "message": "Резервная копия не найдена. Сначала создай её."}
            safety = self._skyrealm_create_world_backup()
            if not safety.get("ok"):
                return {"ok": False, "message": "Перед восстановлением не удалось сохранить текущие миры: " + safety.get("message", "")}
            restored = 0
            profile = root.resolve()
            with zipfile.ZipFile(archives[0], "r") as bundle:
                for info in bundle.infolist():
                    if info.is_dir() or info.filename == "backup-info.json":
                        continue
                    relative = Path(info.filename)
                    if relative.is_absolute() or ".." in relative.parts or "Local Storage" not in relative.parts:
                        continue
                    target = (root / relative).resolve()
                    if not target.is_relative_to(profile):
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(info, "r") as source, target.open("wb") as destination:
                        shutil.copyfileobj(source, destination)
                    restored += 1
            if restored == 0:
                return {"ok": False, "message": "Архив не содержит базы сохранений. Текущие миры не удалены."}
            return {"ok": True, "files": restored, "safety_backup": safety["path"], "archive": str(archives[0])}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось восстановить миры: " + str(exc)}

    def get_launcher_settings(self):
        return {"ok": True, "settings": read_user_settings()}

    def save_launcher_settings(self, settings):
        try:
            saved = save_user_settings(settings)
            return {"ok": True, "settings": saved}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось сохранить настройки: " + str(exc)}

    def open_game_folder(self):
        """Open the installed game directory without changing its contents."""
        try:
            app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
            directory = app_data / "SkyRealm" / "game"
            directory.mkdir(parents=True, exist_ok=True)
            if os.name == "nt":
                os.startfile(str(directory))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(directory)])
            else:
                subprocess.Popen(["xdg-open", str(directory)])
            return {"ok": True, "path": str(directory)}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось открыть папку игры: " + str(exc)}

    def open_update_log(self):
        """Open the updater log in the default text editor."""
        try:
            app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
            root = app_data / "SkyRealm"
            root.mkdir(parents=True, exist_ok=True)
            log_path = root / "update.log"
            if not log_path.exists():
                log_path.write_text("SkyRealm update log\\nЖурнал будет заполняться при проверке и обновлении игры.\\n", encoding="utf-8")
            if os.name == "nt":
                os.startfile(str(log_path))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(log_path)])
            else:
                subprocess.Popen(["xdg-open", str(log_path)])
            return {"ok": True, "path": str(log_path)}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось открыть журнал: " + str(exc)}

    def get_diagnostics(self):
        """Inspect the installed game without modifying files or save data."""
        try:
            app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
            root = app_data / "SkyRealm"
            install_dir = root / "game"
            required = ("index.html", "game.js", "version.txt", "multiplayer-core.js", "multiplayer-client.js", "multiplayer-ui.js")
            missing = [name for name in required if not (install_dir / name).is_file()]
            version = ""
            try:
                version = (install_dir / "version.txt").read_text(encoding="utf-8").strip()
            except OSError:
                pass
            log_path = root / "update.log"
            last_log = ""
            try:
                last_log = "\\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-8:])
            except OSError:
                pass
            profile_dir = root / "webview-profile"
            storage_dirs = [p for p in profile_dir.rglob("Local Storage") if p.is_dir() and (p / "leveldb").is_dir()] if profile_dir.exists() else []
            storage_bytes = sum(item.stat().st_size for folder in storage_dirs for item in folder.rglob("*") if item.is_file())
            fingerprints = {}
            for name in required:
                candidate = install_dir / name
                if candidate.is_file():
                    fingerprints[name] = file_sha256(candidate)
            return {"ok": True, "installed": install_dir.is_dir(), "version": version or "не установлена",
                    "missing": missing, "healthy": not missing, "game_path": str(install_dir),
                    "log_path": str(log_path), "last_log": last_log,
                    "world_storage_found": bool(storage_dirs), "world_storage_bytes": storage_bytes,
                    "integrity_sha256": fingerprints}
        except Exception as exc:
            return {"ok": False, "message": "Ошибка диагностики: " + str(exc)}

    def launch_game(self, settings=None, allow_game_update=True, session_token=None):
        """Install the bundled prototype into LocalAppData and start it in a new process."""
        try:
            preferences = save_user_settings(settings if isinstance(settings, dict) else read_user_settings())
            source_dir = Path(resource_path("game")).resolve()
            source_index = source_dir / "index.html"
            source_version = source_dir / "version.txt"
            if not source_index.is_file() or not source_version.is_file():
                return {"ok": False, "message": "В сборке лаунчера отсутствуют файлы игры. Пересобери EXE из полного архива."}

            bundled_version = source_version.read_text(encoding="utf-8").strip()
            app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
            install_dir = app_data / "SkyRealm" / "game"
            installed_index = install_dir / "index.html"
            installed_version_file = install_dir / "version.txt"
            _js_update(8, "Проверяем обновления…", "Проверяем версию игры и загружаем обновления при необходимости")
            version = _skyrealm_update_game(install_dir, bundled_version, allow_update=allow_game_update is not False) if getattr(sys, "frozen", False) else bundled_version
            installed_version = ""
            try:
                installed_version = installed_version_file.read_text(encoding="utf-8").strip()
            except OSError:
                pass

            source_files = [p for p in source_dir.rglob("*") if p.is_file()]
            required_game_files = ("index.html", "game.js", "version.txt", "multiplayer-core.js", "multiplayer-client.js", "multiplayer-ui.js")
            required_files_ok = all((install_dir / name).is_file() for name in required_game_files)
            # A remote version may be newer than the launcher bundle. Never overwrite
            # that release with older bundled files just because one remote asset is missing.
            if version != bundled_version and not required_files_ok:
                return {"ok": False, "message": "В установленной версии отсутствуют важные файлы игры, а встроенная копия лаунчера старее. Повтори проверку обновления при стабильном интернете."}
            installed_files_ok = required_files_ok and (
                version != bundled_version or (
                    bool(source_files) and all(
                        (install_dir / p.relative_to(source_dir)).is_file()
                        and file_sha256(install_dir / p.relative_to(source_dir)) == file_sha256(p)
                        for p in source_files
                    )
                )
            )
            already_installed = installed_index.is_file() and installed_version == version and installed_files_ok
            time.sleep(0.25)

            if already_installed:
                _js_update(72, "Игра уже установлена", "Проверяем целостность основных файлов")
                required = [install_dir / "game.js", install_dir / "index.html"]
                if not all(p.is_file() for p in required):
                    already_installed = False
                time.sleep(0.2)

            if not already_installed:
                _js_update(18, "Подготавливаем файлы…", "Создаём папку установки SkyRealm")
                install_dir.mkdir(parents=True, exist_ok=True)
                all_files = sorted(p for p in source_dir.rglob("*") if p.is_file())
                if not all_files:
                    return {"ok": False, "message": "Пакет игры пустой."}
                total = len(all_files)
                for index, source_file in enumerate(all_files, start=1):
                    relative = source_file.relative_to(source_dir)
                    destination = install_dir / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source_file, destination)
                    progress = 20 + int((index / total) * 66)
                    if relative.name == "index.html":
                        detail = "Устанавливаем карту и игровой интерфейс"
                    elif relative.name == "game.js":
                        detail = "Устанавливаем персонажа и управление"
                    else:
                        detail = "Копируем игровые ресурсы"
                    _js_update(progress, "Устанавливаем игру…", detail)
                    time.sleep(0.14)

            if not installed_index.is_file() or not (install_dir / "game.js").is_file():
                return {"ok": False, "message": "Установка не завершилась: не найдены основные файлы игры."}

            _js_update(92, "Всё готово", "Открываем отдельное окно игры")
            time.sleep(0.25)
            if getattr(sys, "frozen", False):
                # Launch a SEPARATELY BUILT game runner stored outside this launcher's
                # temporary PyInstaller _MEI directory. The main launcher may then close
                # without deleting files still used by the game process.
                bundled_runner = Path(resource_path("bin/SkyRealmGame.exe"))
                bundled_runner_version = Path(resource_path("game_runner_version.txt"))
                if not bundled_runner.is_file() or not bundled_runner_version.is_file():
                    return {"ok": False, "message": "В сборке отсутствует отдельный игровой запускатель. Пересобери EXE через build_exe.bat из полного архива."}
                runner_version = bundled_runner_version.read_text(encoding="utf-8").strip()
                safe_version = "".join(ch if ch.isalnum() else "_" for ch in runner_version).strip("_") or "current"
                runner_dir = app_data / "SkyRealm" / "bin"
                runner_dir.mkdir(parents=True, exist_ok=True)
                runner_path = runner_dir / ("SkyRealmGame_" + safe_version + ".exe")
                if (not runner_path.is_file()) or file_sha256(runner_path) != file_sha256(bundled_runner):
                    temp_runner = runner_path.with_suffix(".exe.new")
                    shutil.copy2(bundled_runner, temp_runner)
                    os.replace(temp_runner, runner_path)
                command = [str(runner_path), "--skyrealm-game", str(installed_index)]
            else:
                # Source-mode development still works with the current Python interpreter.
                command = [sys.executable, str(Path(__file__).resolve()), "--skyrealm-game", str(installed_index)]
            creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
            launch_env = os.environ.copy()
            safe_session_token = session_token.strip() if isinstance(session_token, str) else ""
            if safe_session_token and len(safe_session_token) <= 4096:
                launch_env["SKYREALM_SESSION_TOKEN"] = safe_session_token
            else:
                launch_env.pop("SKYREALM_SESSION_TOKEN", None)
            subprocess.Popen(
                command,
                cwd=str(install_dir),
                close_fds=True,
                creationflags=creationflags,
                env=launch_env,
            )
            _js_update(100, "Запускаем SkyRealm…", "Лаунчер закроется через мгновение")
            return {"ok": True, "installed": not already_installed, "version": version}
        except Exception as exc:
            return {"ok": False, "message": "Ошибка подготовки игры: " + str(exc)}


class GameApi:
    def __init__(self):
        # The launcher passes the Auth bearer only through the child process environment.
        # It is never written to disk, a URL, or an updater log.
        self._session_token = os.environ.pop("SKYREALM_SESSION_TOKEN", "")

    def get_auth_session(self):
        token = self._session_token
        self._session_token = ""
        return {"token": token}

    def close(self):
        try:
            game_window.destroy()
        except Exception:
            pass

    def apply_settings(self, settings):
        global game_fullscreen
        try:
            saved = save_user_settings(settings)
            desired_fullscreen = saved["windowMode"] == "fullscreen"
            width, height = resolution_size(saved)
            if game_window is not None:
                if game_fullscreen and not desired_fullscreen:
                    game_window.toggle_fullscreen()
                    game_fullscreen = False
                    time.sleep(0.12)
                    game_window.resize(width, height)
                elif not game_fullscreen and desired_fullscreen:
                    game_window.resize(width, height)
                    time.sleep(0.12)
                    game_window.toggle_fullscreen()
                    game_fullscreen = True
                elif not game_fullscreen:
                    game_window.resize(width, height)
            return {"ok": True, "settings": saved}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось применить настройки окна: " + str(exc)}

    def toggle_fullscreen(self):
        settings = read_user_settings()
        settings["windowMode"] = "windowed" if settings.get("windowMode") == "fullscreen" else "fullscreen"
        result = self.apply_settings(settings)
        result["windowMode"] = settings["windowMode"]
        return result


class QuietGameFileHandler(http.server.SimpleHTTPRequestHandler):
    """Serve local game assets over loopback HTTP instead of a file:// URL.

    WebView2 on some Windows setups can fail to open a file URL after a one-file
    executable has unpacked/cleaned its temporary directory. The game is installed
    in LocalAppData, and this server only binds to 127.0.0.1.
    """
    def log_message(self, format, *args):
        pass


def run_game_window(game_html: str) -> None:
    """Run the game in its own lightweight window, serving installed files over loopback."""
    global game_window, game_fullscreen
    file_path = Path(game_html).resolve()
    if not file_path.is_file():
        raise FileNotFoundError("Не найден файл игры: " + str(file_path))
    settings = read_user_settings()
    width, height = resolution_size(settings)
    game_fullscreen = settings["windowMode"] == "fullscreen"

    # Keep the origin stable: browser localStorage is keyed by host + port.
    # Silently switching to a random port makes every saved world look missing.
    handler = functools.partial(QuietGameFileHandler, directory=str(file_path.parent))
    try:
        local_server = http.server.ThreadingHTTPServer(("127.0.0.1", 48731), handler)
    except OSError as exc:
        raise RuntimeError(
            "Не удалось открыть игровой порт 48731. Закрой другое окно SkyRealm "
            "и попробуй снова. Порт нельзя менять автоматически: от него зависят сохранения миров."
        ) from exc
    local_server.daemon_threads = True
    server_thread = threading.Thread(target=local_server.serve_forever, name="SkyRealmGameHTTP", daemon=True)
    server_thread.start()

    port = local_server.server_address[1]
    page_url = "http://127.0.0.1:" + str(port) + "/" + file_path.name + "?" + urlencode({"settings": json.dumps(settings, ensure_ascii=False)})
    try:
        game_window = webview.create_window(
            "SkyRealm — Первый рассвет",
            page_url,
            width=width,
            height=height,
            min_size=(850, 540),
            background_color="#07111f",
            text_select=False,
            fullscreen=game_fullscreen,
            js_api=GameApi(),
        )
        # Explicit persistent WebView2 profile: keep localStorage (world saves) across
        # launcher/game updates instead of relying on pywebview's private-mode default.
        profile_dir = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "SkyRealm" / "webview-profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        webview.start(debug=False, private_mode=False, storage_path=str(profile_dir))
    finally:
        local_server.shutdown()
        local_server.server_close()



def _skyrealm_version_tuple(value):
    try:
        parts = tuple(int(part) for part in str(value).strip().split("."))
        return parts if parts and all(part >= 0 for part in parts) else ()
    except (TypeError, ValueError):
        return ()



def _skyrealm_update_game(install_dir: Path, bundled_version: str, allow_update: bool = True) -> str:
    """Download and atomically install the latest game package before launching it."""
    root = install_dir.parent
    version_file = install_dir / "version.txt"
    installed_version = ""
    try:
        installed_version = version_file.read_text(encoding="utf-8").strip()
    except OSError:
        pass

    def write_update_log(message):
        try:
            root.mkdir(parents=True, exist_ok=True)
            with (root / "update.log").open("a", encoding="utf-8") as log:
                log.write(time.strftime("%Y-%m-%d %H:%M:%S") + " | " + message + "\n")
        except OSError:
            pass

    def fallback_version():
        installed_tuple = _skyrealm_version_tuple(installed_version)
        bundled_tuple = _skyrealm_version_tuple(bundled_version)
        # Never keep an older installed game when this EXE already contains a newer one.
        if bundled_tuple and (not installed_tuple or bundled_tuple > installed_tuple):
            selected = bundled_version
        else:
            selected = installed_version or bundled_version
        write_update_log(
            f"game update fallback: installed={installed_version or 'missing'}, "
            f"bundled={bundled_version}, selected={selected}"
        )
        return selected

    stage = install_dir.with_name("game.update-staging")
    backup = install_dir.with_name("game.previous")
    archive_path = root / "updates" / "SkyRealm_Game.zip"
    try:
        config_path = Path(resource_path("updater_config.json"))
        config = json.loads(config_path.read_text(encoding="utf-8"))
        manifest_url = str(config.get("manifest_url", "")).strip()
        if not manifest_url.startswith("https://"):
            return fallback_version()
        request = urllib.request.Request(
            manifest_url,
            headers={"User-Agent": "SkyRealmLauncher-GameUpdater/1.0", "Cache-Control": "no-cache"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            manifest = json.loads(response.read(256 * 1024).decode("utf-8"))

        latest = str(manifest.get("game_version", "")).strip()
        latest_tuple = _skyrealm_version_tuple(latest)
        if not latest_tuple:
            return fallback_version()

        required_game_files = ("index.html", "game.js", "version.txt", "multiplayer-core.js", "multiplayer-client.js", "multiplayer-ui.js")
        game_ok = all((install_dir / name).is_file() for name in required_game_files)
        installed_tuple = _skyrealm_version_tuple(installed_version)
        if not allow_update and latest_tuple > max(_skyrealm_version_tuple(installed_version), _skyrealm_version_tuple(bundled_version)):
            selected = installed_version if game_ok and installed_version else bundled_version
            write_update_log(f"game update declined: installed={installed_version or 'missing'}, latest={latest}, selected={selected}")
            return selected
        if game_ok and installed_tuple and installed_tuple >= latest_tuple:
            write_update_log(f"game update already current: installed={installed_version}, latest={latest}")
            return installed_version

        download_url = str(manifest.get("game_download_url", "")).strip()
        expected_hash = str(manifest.get("game_sha256", "")).strip().lower()
        if not download_url.startswith("https://"):
            raise ValueError("В манифесте отсутствует HTTPS-ссылка на обновление игры")
        if len(expected_hash) != 64 or any(ch not in "0123456789abcdef" for ch in expected_hash):
            raise ValueError("Некорректный SHA-256 архива игры")

        archive_path.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        total_downloaded = 0
        request = urllib.request.Request(download_url, headers={"User-Agent": "SkyRealmLauncher-GameUpdater/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response, archive_path.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total_downloaded += len(chunk)
                if total_downloaded > 1024 * 1024 * 1024:
                    raise ValueError("Архив игры превышает лимит 1 ГБ")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest().lower() != expected_hash:
            raise ValueError("SHA-256 архива игры не совпал")

        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
        stage.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path, "r") as archive:
            total_unpacked = sum(info.file_size for info in archive.infolist() if not info.is_dir())
            if total_unpacked > 1024 * 1024 * 1024:
                raise ValueError("Распакованный архив игры превышает лимит 1 ГБ")
            for info in archive.infolist():
                if info.is_dir():
                    continue
                normalized = info.filename.replace("\\", "/")
                relative = Path(*normalized.split("/"))
                if relative.is_absolute() or not relative.parts or any(part in ("", ".", "..") for part in relative.parts):
                    raise ValueError("В архиве игры обнаружен небезопасный путь")
                if ":" in relative.parts[0]:
                    raise ValueError("В архиве игры обнаружен небезопасный путь")
                if ((info.external_attr >> 16) & 0o170000) == 0o120000:
                    raise ValueError("Символические ссылки в архиве игры запрещены")
                destination = stage.joinpath(*relative.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info, "r") as source, destination.open("wb") as target:
                    shutil.copyfileobj(source, target)

        staged_version_file = stage / "version.txt"
        if not (stage / "index.html").is_file() or not (stage / "game.js").is_file() or not staged_version_file.is_file():
            raise ValueError("В архиве обновления отсутствуют основные файлы игры")
        if staged_version_file.read_text(encoding="utf-8").strip() != latest:
            raise ValueError("Версия в архиве игры не совпадает с манифестом")

        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
        if install_dir.exists():
            os.replace(install_dir, backup)
        try:
            os.replace(stage, install_dir)
        except Exception:
            if backup.exists() and not install_dir.exists():
                os.replace(backup, install_dir)
            raise
        shutil.rmtree(backup, ignore_errors=True)
        archive_path.unlink(missing_ok=True)
        write_update_log(f"game update installed successfully: {installed_version or 'missing'} -> {latest}")
        return latest
    except Exception as exc:
        try:
            root.mkdir(parents=True, exist_ok=True)
            with (root / "update.log").open("a", encoding="utf-8") as log:
                log.write(time.strftime("%Y-%m-%d %H:%M:%S") + " | game update: " + str(exc) + "\n")
        except OSError:
            pass
        shutil.rmtree(stage, ignore_errors=True)
        try:
            archive_path.unlink(missing_ok=True)
        except OSError:
            pass
        return fallback_version()


def _skyrealm_startup_update():
    """Check GitHub Releases and apply a verified update before opening the UI."""
    if not getattr(sys, "frozen", False):
        return False
    appdata = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    root = appdata / "SkyRealm"
    try:
        config = json.loads(Path(resource_path("updater_config.json")).read_text(encoding="utf-8"))
        manifest_url = str(config.get("manifest_url", "")).strip()
        if not manifest_url.startswith("https://"):
            return False
        request = urllib.request.Request(manifest_url, headers={"User-Agent": "SkyRealmLauncher-Updater/1.0", "Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=8) as response:
            manifest = json.loads(response.read(256 * 1024).decode("utf-8"))
        version = str(manifest.get("version", "")).strip()
        version_path = Path(resource_path("launcher_version.txt"))
        current = version_path.read_text(encoding="utf-8").strip() if version_path.is_file() else "0.9.5"
        if not version or _skyrealm_version_tuple(version) <= _skyrealm_version_tuple(current):
            return False
        url = str(manifest.get("download_url", "")).strip()
        expected = str(manifest.get("sha256", "")).strip().lower()
        if not url.startswith("https://") or len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
            raise ValueError("Некорректный URL или SHA-256 в manifest.json")
        updates = root / "updates"
        updates.mkdir(parents=True, exist_ok=True)
        archive_path = updates / "SkyRealm_Update.zip"
        request = urllib.request.Request(url, headers={"User-Agent": "SkyRealmLauncher-Updater/1.0"})
        digest = hashlib.sha256()
        with urllib.request.urlopen(request, timeout=30) as response, archive_path.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest().lower() != expected:
            archive_path.unlink(missing_ok=True)
            raise ValueError("SHA-256 архива не совпал")
        with zipfile.ZipFile(archive_path, "r") as archive:
            candidates = [i for i in archive.infolist() if Path(i.filename.replace("\\", "/")).name.lower() == "skyrealm.exe" and not i.is_dir()]
            if len(candidates) != 1 or candidates[0].file_size < 100_000:
                raise ValueError("В ZIP нет корректного SkyRealm.exe")
            versions = [i for i in archive.infolist() if Path(i.filename.replace("\\", "/")).name.lower() == "launcher_version.txt" and not i.is_dir()]
            if not versions or archive.read(versions[0]).decode("utf-8").strip() != version:
                raise ValueError("Версия ZIP не совпадает с манифестом")
        helper_source = Path(resource_path("bin/SkyRealmUpdater.exe"))
        if not helper_source.is_file():
            raise FileNotFoundError("В сборке отсутствует SkyRealmUpdater.exe")
        helper_dir = root / "bin"
        helper_dir.mkdir(parents=True, exist_ok=True)
        helper_target = helper_dir / "SkyRealmUpdater.exe"
        shutil.copy2(helper_source, helper_target)
        subprocess.Popen(
            [str(helper_target), str(archive_path), str(Path(sys.executable).resolve()), str(os.getpid()), version],
            cwd=str(root), close_fds=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
        )
        return True
    except Exception as exc:
        try:
            root.mkdir(parents=True, exist_ok=True)
            with (root / "update.log").open("a", encoding="utf-8") as log:
                log.write(time.strftime("%Y-%m-%d %H:%M:%S") + " | " + str(exc) + "\\n")
        except OSError:
            pass
        return False



if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--skyrealm-game":
        run_game_window(sys.argv[2])
    else:
        if _skyrealm_startup_update():
            raise SystemExit(0)
        html = Path(resource_path("index.html")).resolve().as_uri()
        api = LauncherApi()
        window = webview.create_window(
            "SkyRealm Launcher",
            html,
            width=1440,
            height=940,
            min_size=(900, 680),
            background_color="#071020",
            text_select=False,
            js_api=api,
        )
        webview.start(debug=False)
