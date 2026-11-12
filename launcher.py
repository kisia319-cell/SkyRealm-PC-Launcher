[Reading 1000 lines from start (total: 1692 lines, 692 remaining)]

"""SkyRealm desktop launcher and lightweight local game installer."""
import os
import csv
import shutil
import subprocess
import sys
import time
import json
import base64
import hashlib
import re
import traceback
import zipfile
import urllib.request
import urllib.error
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
    "fpsLimit": 0,
    "musicVolume": 35,
    "sfxVolume": 70,
    "musicEnabled": False,
    "uiSoundEnabled": True,
    "installRoot": "",
    "keyBindings": {
        "up": "KeyW", "left": "KeyA", "down": "KeyS", "right": "KeyD",
        "interact": "KeyE", "inventory": "KeyI", "map": "KeyL", "attack": "Space",
        "dodge": "KeyQ", "ability": "KeyR", "heal": "KeyH", "buff": "KeyJ",
    },
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
    if settings.get("fpsLimit") not in {0, 30, 60, 120, 144}:
        settings["fpsLimit"] = 0
    for key in ("musicVolume", "sfxVolume"):
        try:
            settings[key] = max(0, min(100, int(settings.get(key, DEFAULT_SETTINGS[key]))))
        except (TypeError, ValueError):
            settings[key] = DEFAULT_SETTINGS[key]
    settings["musicEnabled"] = settings.get("musicEnabled") is True
    settings["uiSoundEnabled"] = settings.get("uiSoundEnabled") is not False
    settings["installRoot"] = str(settings.get("installRoot") or "").strip()[:512]
    default_bindings = DEFAULT_SETTINGS["keyBindings"]
    raw_bindings = settings.get("keyBindings") if isinstance(settings.get("keyBindings"), dict) else {}
    valid_binding = lambda code: bool(re.fullmatch(r"(?:Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Space|Digit[0-9])", str(code or "")))
    bindings = {action: (str(raw_bindings.get(action)) if valid_binding(raw_bindings.get(action)) else default) for action, default in default_bindings.items()}
    if len(set(bindings.values())) != len(default_bindings):
        bindings = dict(default_bindings)
    settings["keyBindings"] = bindings
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


def skyrealm_default_data_root() -> Path:
    app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    return app_data / "SkyRealm"


def skyrealm_data_root(settings=None) -> Path:
    current = settings if isinstance(settings, dict) else read_user_settings()
    configured = str(current.get("installRoot") or "").strip()
    if configured:
        try:
            candidate = Path(configured).expanduser()
            if candidate.is_absolute():
                return candidate / "SkyRealm"
        except (OSError, ValueError):
            pass
    return skyrealm_default_data_root()


def skyrealm_game_dir(settings=None) -> Path:
    return skyrealm_data_root(settings) / "game"


def skyrealm_screenshot_dir() -> Path:
    directory = skyrealm_default_data_root() / "screenshots"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def skyrealm_screenshot_name_is_safe(name) -> bool:
    return bool(re.fullmatch(r"SkyRealm_[0-9]{8}_[0-9]{6}-[0-9]{9}\.png", str(name or "")))


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

    def get_screenshots(self):
        try:
            directory = skyrealm_screenshot_dir()
            files = sorted((p for p in directory.glob("SkyRealm_*.png") if p.is_file()), key=lambda p: p.stat().st_mtime, reverse=True)[:50]
            return {"ok": True, "screenshots": [
                {"name": p.name, "size_kb": round(p.stat().st_size / 1024, 1),
                 "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime))}
                for p in files
            ]}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось загрузить список скриншотов: " + str(exc)}

    def get_screenshot_data(self, name):
        try:
            if not skyrealm_screenshot_name_is_safe(name):
                return {"ok": False, "message": "Некорректное имя файла скриншота."}
            path = skyrealm_screenshot_dir() / name
            if not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
                return {"ok": False, "message": "Скриншот не найден или слишком большой."}
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            return {"ok": True, "data_url": "data:image/png;base64," + encoded}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось открыть скриншот: " + str(exc)}

    def open_screenshot_folder(self):
        try:
            directory = skyrealm_screenshot_dir()
            if os.name == "nt":
                os.startfile(str(directory))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(directory)])
            else:
                subprocess.Popen(["xdg-open", str(directory)])
            return {"ok": True, "path": str(directory)}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось открыть папку скриншотов: " + str(exc)}

    def _skyrealm_webview_profile_dir(self):
        app_data = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        return app_data / "SkyRealm" / "webview-profile"

    def _skyrealm_game_is_running(self):
        try:
            if os.name == "nt":
                result = subprocess.run(["tasklist", "/FO", "CSV", "/NH"],
                                        capture_output=True, text=True, timeout=5, check=False)
                if result.returncode != 0:
                    return True
                for row in csv.reader((result.stdout or "").splitlines()):
                    if row and row[0].strip().lower().startswith("skyrealmgame"):
                        return True
                return False
            result = subprocess.run(["pgrep", "-f", "SkyRealmGame"],
                                    capture_output=True, text=True, timeout=5, check=False)
            return result.returncode == 0
        except Exception:
            # Fail closed: do not touch Chromium's LevelDB while process state is unknown.
            return True

    def _skyrealm_create_world_backup(self, prefix="skyrealm-worlds"):
        profile = self._skyrealm_webview_profile_dir()
        candidates = [p for p in profile.rglob("Local Storage") if p.is_dir() and (p / "leveldb").is_dir()] if profile.exists() else []
        if not candidates:
            return {"ok": False, "message": "Хранилище миров не найдено. Сначала запусти игру и создай или открой мир."}
        root = profile.parent
        backup_dir = root / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S") + "-" + str(time.time_ns() % 1000000000).zfill(9)
        archive = backup_dir / (prefix + "-" + stamp + ".zip")
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
            safety = self._skyrealm_create_world_backup(prefix="skyrealm-safety")
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

    def select_install_folder(self):
        """Choose the parent directory that will contain the SkyRealm/game folder."""
        try:
            import tkinter as tk
            from tkinter import filedialog
            current = read_user_settings()
            initial = str(current.get("installRoot") or skyrealm_default_data_root().parent)
            root = tk.Tk()
            root.withdraw()
            try:
                root.attributes("-topmost", True)
                selected = filedialog.askdirectory(title="Выбери папку установки SkyRealm", initialdir=initial, mustexist=True)
            finally:
                root.destroy()
            if not selected:
                return {"ok": False, "cancelled": True, "message": "Выбор папки отменён."}
            current["installRoot"] = str(Path(selected).resolve())
            saved = save_user_settings(current)
            return {"ok": True, "path": saved["installRoot"], "settings": saved,
                    "message": "Папка установки сохранена. Игра будет установлена туда при следующем запуске."}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось выбрать папку установки: " + str(exc)}

    def reset_install_folder(self):
        try:
            current = read_user_settings()
            current["installRoot"] = ""
            saved = save_user_settings(current)
            return {"ok": True, "settings": saved, "path": "", "message": "Возвращена папка установки по умолчанию."}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось сбросить папку установки: " + str(exc)}

    def open_game_folder(self):
        """Open the installed game directory without changing its contents."""
        try:
            directory = skyrealm_game_dir()
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
            root = skyrealm_data_root()
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
            root = skyrealm_data_root()
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
            profile_dir = skyrealm_default_data_root() / "webview-profile"
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

    def get_update_status(self):
        """Return release metadata and local version state without modifying files."""
        try:
            config = json.loads(Path(resource_path("updater_config.json")).read_text(encoding="utf-8"))
            manifest_url = str(config.get("manifest_url", "")).strip()
            if not manifest_url.startswith("https://"):
                raise ValueError("В конфигурации отсутствует HTTPS-ссылка на манифест.")
            request = urllib.request.Request(manifest_url, headers={"User-Agent": "SkyRealmLauncher-UpdateCenter/1.0", "Cache-Control": "no-cache"})
            with urllib.request.urlopen(request, timeout=8) as response:
                manifest = json.loads(response.read(256 * 1024).decode("utf-8"))
            root = skyrealm_data_root()
            install_dir = root / "game"
            installed_game = ""
            previous_game = ""
            try:
                installed_game = (install_dir / "version.txt").read_text(encoding="utf-8").strip()
            except OSError:
                pass
            try:
                previous_game = (install_dir.with_name("game.previous") / "version.txt").read_text(encoding="utf-8").strip()
            except OSError:
                pass
            launcher_version = Path(resource_path("launcher_version.txt")).read_text(encoding="utf-8").strip()
            latest_launcher = str(manifest.get("version", "")).strip()
            latest_game = str(manifest.get("game_version", "")).strip()
            installed_game_tuple = _skyrealm_version_tuple(installed_game)
            latest_game_tuple = _skyrealm_version_tuple(latest_game)
            game_version_state = (
                "installed_newer" if installed_game_tuple and latest_game_tuple and installed_game_tuple > latest_game_tuple
                else "current" if installed_game_tuple and latest_game_tuple and installed_game_tuple == latest_game_tuple
                else "update_available" if installed_game_tuple and latest_game_tuple and latest_game_tuple > installed_game_tuple
                else "unknown"
            )
            return {
                "ok": True, "launcher_version": launcher_version, "latest_launcher_version": latest_launcher,
                "launcher_update_available": bool(_skyrealm_version_tuple(latest_launcher) and _skyrealm_version_tuple(latest_launcher) > _skyrealm_version_tuple(launcher_version)),
                "game_version": installed_game or "не установлена", "latest_game_version": latest_game,
                "game_update_available": game_version_state == "update_available",
                "game_version_state": game_version_state,
                "game_installed": bool(installed_game),
                "rollback_available": bool(install_dir.with_name("game.previous").is_dir() and previous_game),
                "previous_game_version": previous_game,
                "notes": str(manifest.get("notes", ""))[:1200],
                "release_url": "https://github.com/kisia319-cell/SkyRealm-PC-Launcher/releases/latest",
                "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        except Exception as exc:
            return {"ok": False, "message": "Не удалось проверить обновления: " + str(exc)}

    def install_game_update(self):
        """Install the latest game package without starting the game."""
        try:
            if self._skyrealm_game_is_running():
                return {"ok": False, "message": "Сначала закрой SkyRealm, затем устанавливай обновление."}
            state = self.get_update_status()
            if not state.get("ok"):
                return state
            if not state.get("game_update_available"):
                return {"ok": True, "updated": False, "version": state.get("game_version"), "message": "Установлена последняя версия игры."}
            install_dir = skyrealm_game_dir()
            bundled_version = Path(resource_path("game/version.txt")).read_text(encoding="utf-8").strip()
            installed = _skyrealm_update_game(install_dir, bundled_version, allow_update=True)
            if installed != state.get("latest_game_version"):
                return {"ok": False, "message": "Обновление не установилось. Проверь журнал; прежняя версия сохранена.", "version": installed}
            return {"ok": True, "updated": True, "version": installed, "message": "Игра обновлена. Предыдущая версия сохранена для отката."}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось установить обновление: " + str(exc)}

    def repair_game_files(self):
        """Reinstall the verified release archive, keeping a rollback copy."""
        try:
            if self._skyrealm_game_is_running():
                return {"ok": False, "message": "Сначала полностью закрой SkyRealm, затем запускай восстановление."}
            state = self.get_update_status()
            if not state.get("ok"):
                return state
            if state.get("game_version_state") == "installed_newer":
                return {"ok": False, "message": "Восстановление отменено: опубликованный пакет игры старее уже установленной версии (" + str(state.get("latest_game_version")) + " < " + str(state.get("game_version")) + "). Это защитит игру от отката."}
            if state.get("game_version_state") == "unknown":
                return {"ok": False, "message": "Восстановление заблокировано: версии игры не удалось надёжно сравнить."}
            install_dir = skyrealm_game_dir()
            bundled_version = Path(resource_path("game/version.txt")).read_text(encoding="utf-8").strip()
            if _skyrealm_version_tuple(bundled_version) and _skyrealm_version_tuple(bundled_version) < _skyrealm_version_tuple(state.get("game_version")):
                return {"ok": False, "message": "Восстановление отменено: встроенная копия игры старее установленной версии."}
            installed = _skyrealm_update_game(install_dir, bundled_version, allow_update=True, force=True)
            required = ("index.html", "game.js", "version.txt", "multiplayer-core.js", "multiplayer-client.js", "multiplayer-ui.js")
            missing = [name for name in required if not (install_dir / name).is_file()]
            if missing or installed != state.get("latest_game_version"):
                return {"ok": False, "message": "Восстановление не завершилось. Нет файлов: " + ", ".join(missing), "version": installed}
            return {"ok": True, "version": installed, "message": "Файлы игры заново скачаны, проверены по SHA-256 и восстановлены."}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось восстановить файлы игры: " + str(exc)}

    def rollback_game_update(self):
        """Swap the current game directory with the preserved previous release."""
        try:
            if self._skyrealm_game_is_running():
                return {"ok": False, "message": "Закрой игру перед откатом версии."}
            root = skyrealm_data_root()
            install_dir = root / "game"
            previous = root / "game.previous"
            failed = root / "game.failed"
            if not previous.is_dir() or not (previous / "version.txt").is_file():
                return {"ok": False, "message": "Предыдущая версия не найдена. Откат пока недоступен."}
            new_version = (previous / "version.txt").read_text(encoding="utf-8").strip()
            if failed.exists():
                shutil.rmtree(failed, ignore_errors=True)
            if install_dir.exists():
                os.replace(install_dir, failed)
            try:
                os.replace(previous, install_dir)
            except Exception:
                if failed.exists() and not install_dir.exists():
                    os.replace(failed, install_dir)
                raise
            return {"ok": True, "version": new_version, "message": "Возвращена предыдущая версия игры."}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось выполнить откат: " + str(exc)}

    def get_system_metrics(self):
        """Read local CPU, RAM and disk metrics; no telemetry is transmitted."""
        try:
            result = {"ok": True, "cpu_percent": None, "ram_percent": None, "ram_used_mb": None,
                      "ram_total_mb": None, "process_memory_mb": None, "disk_free_gb": None,
                      "disk_total_gb": None, "game_size_mb": None}
            try:
                import psutil
                memory = psutil.virtual_memory()
                result.update({
                    "cpu_percent": round(psutil.cpu_percent(interval=0.15), 1),
                    "ram_percent": round(memory.percent, 1),
                    "ram_used_mb": round((memory.total - memory.available) / (1024 * 1024)),
                    "ram_total_mb": round(memory.total / (1024 * 1024)),
                    "process_memory_mb": round(psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024), 1),
                })
            except Exception:
                if os.name == "nt":
                    import ctypes
                    class MEMORYSTATUSEX(ctypes.Structure):
                        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
                    status = MEMORYSTATUSEX()
                    status.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                    if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                        result.update({"ram_percent": float(status.dwMemoryLoad),
                                       "ram_used_mb": round((status.ullTotalPhys-status.ullAvailPhys)/(1024*1024)),
                                       "ram_total_mb": round(status.ullTotalPhys/(1024*1024))})
            root = skyrealm_data_root()
            usage = shutil.disk_usage(root if root.exists() else root.parent)
            result["disk_free_gb"] = round(usage.free / (1024 ** 3), 2)
            result["disk_total_gb"] = round(usage.total / (1024 ** 3), 2)
            game_dir = root / "game"
            if game_dir.exists():
                size = sum(item.stat().st_size for item in game_dir.rglob("*") if item.is_file())
                result["game_size_mb"] = round(size / (1024 * 1024), 1)
            return result
        except Exception as exc:
            return {"ok": False, "message": "Не удалось получить показатели компьютера: " + str(exc)}

    def launch_game(self, settings=None, allow_game_update=True, session_token=None, open_mod_id=None):
        """Install the bundled prototype into LocalAppData and start it in a new process."""
        launch_stage = "initialization"
        try:
            launch_stage = "save settings"
            preferences = save_user_settings(settings if isinstance(settings, dict) else read_user_settings())
            source_dir = Path(resource_path("game")).resolve()
            source_index = source_dir / "index.html"
            source_version = source_dir / "version.txt"
            if not source_index.is_file() or not source_version.is_file():
                return {"ok": False, "message": "В сборке лаунчера отсутствуют файлы игры. Пересобери EXE из полного архива."}

            bundled_version = source_version.read_text(encoding="utf-8").strip()
            install_dir = skyrealm_game_dir(preferences)
            installed_index = install_dir / "index.html"
            installed_version_file = install_dir / "version.txt"
            launch_stage = "check and install game update"
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
                launch_stage = "prepare separate game runner"
                # Launch a SEPARATELY BUILT game runner stored outside this launcher's
                # temporary PyInstaller _MEI directory. The main launcher may then close
                # without deleting files still used by the game process.
                bundled_runner = Path(resource_path("bin/SkyRealmGame.exe"))
                bundled_runner_version = Path(resource_path("game_runner_version.txt"))
                if not bundled_runner.is_file() or not bundled_runner_version.is_file():
                    return {"ok": False, "message": "В сборке отсутствует отдельный игровой запускатель. Пересобери EXE через build_exe.bat из полного архива."}
                runner_version = bundled_runner_version.read_text(encoding="utf-8").strip()
                safe_version = "".join(ch if ch.isalnum() else "_" for ch in runner_version).strip("_") or "current"
                runner_dir = skyrealm_default_data_root() / "bin"
                runner_dir.mkdir(parents=True, exist_ok=True)
                runner_path = runner_dir / ("SkyRealmGame_" + safe_version + ".exe")
                if (not runner_path.is_file()) or file_sha256(runner_path) != file_sha256(bundled_runner):
                    temp_runner = runner_path.with_suffix(".exe.new")
                    shutil.copy2(bundled_runner, temp_runner)
                    os.replace(temp_runner, runner_path)
                # The separate runner reopens this exact launcher executable after the game window closes.
                command = [str(runner_path), "--skyrealm-game", str(installed_index), "--return-launcher", str(Path(sys.executable).resolve())]
            else:
                # Source-mode development still works with the current Python interpreter.
                command = [sys.executable, str(Path(__file__).resolve()), "--skyrealm-game", str(installed_index)]
            creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
            launch_env = os.environ.copy()
            allowed_mod_ids = {"cartographer", "angler", "green_thumb", "miners_luck", "survivalist", "skill_expansion", "brutal_world", "blood_moon", "lost_dungeons", "sky_islands", "ancient_civs", "ocean_depths", "elemental_lords", "legendary_gear", "bounty_hunter", "arena_survival", "settlement_builder", "architect", "beast_companions", "trade_caravans", "magic_academy", "engineer_world", "banking", "parallel_dimensions", "full_magic", "swift_steps", "guardian_oath", "herbalist", "deep_reserves", "treasure_hunter", "scavenger", "marksman", "restful_camp", "merchant_guild", "scholar", "__catalog__", "__creator__"}
            requested_mod = open_mod_id.strip() if isinstance(open_mod_id, str) else ""
            if requested_mod == "__cloud_saves__":
                launch_env["SKYREALM_OPEN_CLOUD_SAVES"] = "1"
                launch_env.pop("SKYREALM_OPEN_MOD_CATALOG", None)
                launch_env.pop("SKYREALM_OPEN_MOD_ID", None)
            elif requested_mod in allowed_mod_ids:
                launch_env["SKYREALM_OPEN_MOD_CATALOG"] = "1"
                launch_env["SKYREALM_OPEN_MOD_ID"] = "" if requested_mod == "__catalog__" else requested_mod
            else:
                launch_env.pop("SKYREALM_OPEN_MOD_CATALOG", None)
                launch_env.pop("SKYREALM_OPEN_MOD_ID", None)
            safe_session_token = session_token.strip() if isinstance(session_token, str) else ""
            if safe_session_token and len(safe_session_token) <= 4096:
                launch_env["SKYREALM_SESSION_TOKEN"] = safe_session_token
            else:
                launch_env.pop("SKYREALM_SESSION_TOKEN", None)
            launch_stage = "start game process"
            game_process = subprocess.Popen(
                command,
                cwd=str(install_dir),
                close_fds=True,
                creationflags=creationflags,
                env=launch_env,
            )
            try:
                log_path = skyrealm_default_data_root() / "launch-errors.log"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                with log_path.open("a", encoding="utf-8") as log:
                    log.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} | launched | version={version} | pid={game_process.pid} | executable={command[0]}\n")
            except Exception:
                pass
            _js_update(100, "Запускаем SkyRealm…", "Лаунчер закроется через мгновение")
            return {"ok": True, "installed": not already_installed, "version": version}
        except Exception as exc:
            details = traceback.format_exc()
            error_log_hint = "не удалось записать журнал"
            try:
                log_path = skyrealm_default_data_root() / "launch-errors.log"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                with log_path.open("a", encoding="utf-8") as log:
                    log.write(f"\n{time.strftime('%Y-%m-%d %H:%M:%S')} | FAILED | stage={launch_stage} | {type(exc).__name__}: {exc}\n")
                    log.write(details + "\n")
                error_log_hint = str(log_path)
            except Exception:
                pass
            return {"ok": False, "message": f"Ошибка подготовки игры на этапе «{launch_stage}»: {exc}. Подробности: {error_log_hint}"}


    def get_competitive_launcher_status(self):
        """Report whether the standalone PrimeLauncher runner is installed."""
        try:
            if not getattr(sys, "frozen", False):
                return {"ok": True, "installed": True, "development": True}
            prime_root = skyrealm_default_data_root()
            runner = prime_root / "bin" / "PrimeLauncher.exe"
            game_index = prime_root / "PrimeLauncher" / "game" / "index.html"
            installed = runner.is_file() and game_index.is_file()
            return {"ok": True, "installed": installed}
        except Exception as exc:
            return {"ok": False, "installed": False, "message": str(exc)}

    def launch_competitive_game(self):
        """Install the isolated Prime world and start it in its own executable."""
        try:
            source_dir = Path(resource_path("game/competitive")).resolve()
            source_index = source_dir / "index.html"
            if not source_index.is_file() or not (source_dir / "prime-world.js").is_file():
                return {"ok": False, "message": "В сборке отсутствуют файлы соревновательного мира."}

            prime_root = skyrealm_default_data_root() / "PrimeLauncher"
            install_dir = prime_root / "game"
            install_dir.mkdir(parents=True, exist_ok=True)
            for source_file in source_dir.rglob("*"):
                if not source_file.is_file():
                    continue
                relative = source_file.relative_to(source_dir)
                destination = install_dir / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.is_file() or file_sha256(destination) != file_sha256(source_file):
                    shutil.copy2(source_file, destination)
            installed_index = install_dir / "index.html"
            if not installed_index.is_file():
                return {"ok": False, "message": "Не удалось подготовить файлы PrimeLauncher."}

            if getattr(sys, "frozen", False):
                _skyrealm_create_prime_shortcut()
                bundled_runner = Path(resource_path("bin/PrimeLauncher.exe"))
                if not bundled_runner.is_file():
                    return {"ok": False, "message": "В сборке отсутствует отдельный PrimeLauncher.exe. Пересобери лаунчер."}
                runner_dir = skyrealm_default_data_root() / "bin"
                runner_dir.mkdir(parents=True, exist_ok=True)
                runner_path = runner_dir / "PrimeLauncher.exe"
                if not runner_path.is_file() or file_sha256(runner_path) != file_sha256(bundled_runner):
                    temporary = runner_path.with_suffix(".exe.new")
                    shutil.copy2(bundled_runner, temporary)
                    os.replace(temporary, runner_path)
                command = [str(runner_path), "--prime-competitive", str(installed_index),
                           "--return-launcher", str(Path(sys.executable).resolve())]
            else:
                command = [sys.executable, str(Path(__file__).resolve()),
                           "--prime-competitive", str(installed_index)]

            flags = (getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) |
                     getattr(subprocess, "DETACHED_PROCESS", 0)) if os.name == "nt" else 0
            process = subprocess.Popen(command, cwd=str(install_dir), close_fds=True, creationflags=flags)
            try:
                log_path = prime_root / "prime-launcher.log"
                log_path.write_text(
                    f"{time.strftime('%Y-%m-%d %H:%M:%S')} | PrimeLauncher started | pid={process.pid} | map=100x100\n",
                    encoding="utf-8",
                )
            except OSError:
                pass
            return {"ok": True, "pid": process.pid}
        except Exception as exc:
            return {"ok": False, "message": f"Не удалось запустить PrimeLauncher: {exc}"}


class GameApi:
    def __init__(self):
        # The launcher passes the Auth bearer only through the child process environment.
        # It is never written to disk, a URL, or an updater log.
        self._session_token = os.environ.pop("SKYREALM_SESSION_TOKEN", "")

    def get_auth_session(self):
        # The WebView may request the session more than once (co-op polling,
        # profile sync and reconnects). Keep the token in this short-lived game
        # process so native profile sync continues working after the first read.
        return {"token": self._session_token}

    def get_published_mods(self):
        """Read locally published Studio mods without executing their source."""
        directory = skyrealm_default_data_root() / "user-mods"
        records = []
        if not directory.is_dir() or directory.is_symlink():
            return {"ok": True, "mods": []}
        try:
            files = sorted(directory.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
        except OSError:
            return {"ok": True, "mods": []}
        for path in files:
            if len(records) >= 20:
                break
            try:
                if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
                    continue
                data = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(data, dict) or data.get("format") != "skyrealm-studio-mod" or data.get("schemaVersion") != 1:
                    continue
                mod_id = data.get("id")
                name = data.get("name")
                language = data.get("language")
                source = data.get("source")
                description = data.get("description", "")
                if not isinstance(mod_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._:-]{1,127}", mod_id):
                    continue
                if not isinstance(name, str) or not name.strip() or len(name) > 32:
                    continue
                if language not in {"javascript", "python"} or not isinstance(source, str) or not 10 <= len(source) <= 14000:
                    continue
                if language == "javascript" and not re.search(r"function\s+onTick\s*\(", source):
                    continue
                if language == "python" and not re.search(r"def\s+on_tick\s*\(", source):
                    continue
                if not isinstance(description, str):
                    description = ""
                records.append({
                    "id": mod_id, "name": name, "description": description[:140],
                    "language": language, "source": source,
                    "createdAt": int(path.stat().st_mtime * 1000),
                })
            except (OSError, UnicodeError, ValueError, TypeError):
                continue
        return {"ok": True, "mods": records}

    @staticmethod
    def _mod_studio_candidates():
        home = Path.home()
        local = Path(os.environ.get("LOCALAPPDATA") or (home / "AppData" / "Local"))
        candidates = [
            local / "SkyRealm" / "ModStudio" / "SkyRealmModStudio.exe",
            local / "Programs" / "SkyRealmModStudio" / "SkyRealmModStudio.exe",
            local / "SkyRealmStudio" / "SkyRealmModStudio.exe",
            Path(os.environ.get("PROGRAMFILES") or "C:/Program Files") / "SkyRealm Mod Studio" / "SkyRealmModStudio.exe",
            Path(os.environ.get("PROGRAMFILES(X86)") or "C:/Program Files (x86)") / "SkyRealm Mod Studio" / "SkyRealmModStudio.exe",
        ]
        seen = set()

        def is_valid_executable(candidate):
            try:
                resolved = candidate.resolve()
                if resolved in seen:
                    return None
                seen.add(resolved)
                if not resolved.is_file() or resolved.stat().st_size <= 1024 * 1024:
                    return None
                with resolved.open("rb") as stream:
                    return resolved if stream.read(2) == b"MZ" else None
            except (OSError, ValueError):
                return None

        # First check stable install locations, then every versioned copy such as
        # "SkyRealmModStudio (3).exe" on Desktop/Downloads. The previous exact-name
        # check silently missed those Windows duplicate-download filenames.
        for candidate in candidates:
            found = is_valid_executable(candidate)
            if found:
                return found

        search_roots = [
            (home / "Desktop", False),
            (home / "Downloads", False),
            (home / "Documents" / "SkyRealmModStudio", True),
            (home / "Documents" / "SkyRealm-Mod-Studio", True),
        ]
        for root, recursive in search_roots:
            if not root.is_dir():
                continue
            try:
                matches = root.rglob("SkyRealmModStudio*.exe") if recursive else root.glob("SkyRealmModStudio*.exe")
                ordered = sorted(matches, key=lambda path: path.stat().st_mtime, reverse=True)
                for candidate in ordered:
                    found = is_valid_executable(candidate)
                    if found:
                        return found
            except (OSError, PermissionError):
                continue
        return None

    def check_mod_studio(self):
        """Find a previously installed or downloaded Windows copy of SkyRealm Mod Studio."""
        if os.name != "nt":
            return {"ok": False, "installed": False, "message": "SkyRealmStudio доступна в Windows-версии SkyRealm."}
        executable = self._mod_studio_candidates()
        return {"ok": True, "installed": executable is not None,
                "path": str(executable) if executable else "",
                "message": "SkyRealmStudio найдена." if executable else "SkyRealmStudio не установлена."}

    def launch_mod_studio(self):
        """Launch an already downloaded Studio without opening another installer."""
        if os.name != "nt":
            return {"ok": False, "message": "Запуск SkyRealmStudio поддерживается в Windows."}
        try:
            executable = self._mod_studio_candidates()
            if executable is None:
                return {"ok": False, "message": "SkyRealmStudio не найдена. Нажми «Создать мод» ещё раз и выбери «Да» для установки."}
            subprocess.Popen([str(executable)], cwd=str(executable.parent),
                             creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
            return {"ok": True, "path": str(executable), "message": "SkyRealmStudio запущена."}
        except Exception as exc:
            return {"ok": False, "message": "Не удалось запустить SkyRealmStudio: " + str(exc)}

    def install_mod_studio(self):
        """Download the official Studio release, verify its published SHA-256 and launch it."""
        if os.name != "nt":
            return {"ok": False, "message": "Установка SkyRealmStudio поддерживается в Windows."}
        try:
            existing = self._mod_studio_candidates()
            if existing is not None:
                return self.launch_mod_studio()
            api_url = "https://api.github.com/repos/kisia319-cell/SkyRealm-Mod-Studio/releases/latest"
            request = urllib.request.Request(api_url, headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "SkyRealm-Launcher/1.0",
                "X-GitHub-Api-Version": "2022-11-28",
            })
            with urllib.request.urlopen(request, timeout=20) as response:
                release = json.loads(response.read(256 * 1024).decode("utf-8"))
            assets = release.get("assets") if isinstance(release, dict) else []
            asset = next((item for item in assets or [] if item.get("name") == "SkyRealmModStudio.exe"), None)
            if not asset:
                return {"ok": False, "message": "В последнем релизе SkyRealmStudio не найден файл SkyRealmModStudio.exe."}
            download_url = asset.get("browser_download_url", "")
            digest = str(asset.get("digest") or "")
            size = int(asset.get("size") or 0)
            if not download_url.startswith("https://github.com/kisia319-cell/SkyRealm-Mod-Studio/releases/download/") or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest) or size < 1_000_000 or size > 100 * 1024 * 1024:
                return {"ok": False, "message": "GitHub не предоставил корректные данные или контрольную сумму файла студии."}
            download_request = urllib.request.Request(download_url, headers={"User-Agent": "SkyRealm-Launcher/1.0"})
            with urllib.request.urlopen(download_request, timeout=60) as response:
                temporary_data = response.read(100 * 1024 * 1024 + 1)
            if len(temporary_data) != size or len(temporary_data) > 100 * 1024 * 1024:
                return {"ok": False, "message": "Размер скачанного файла не совпадает с официальным релизом."}
            actual_digest = hashlib.sha256(temporary_data).hexdigest()
            if actual_digest != digest.split(":", 1)[1]:
                return {"ok": False, "message": "Проверка SHA-256 не пройдена. Файл не будет запускаться."}
            if not temporary_data.startswith(b"MZ"):
                return {"ok": False, "message": "Скачанный файл не является приложением Windows."}
            destination_dir = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "SkyRealm" / "ModStudio"

[executed on device: DESKTOP-J3FNV3N (393b286a-047d-423b-ad40-4dc164e17a6c)]