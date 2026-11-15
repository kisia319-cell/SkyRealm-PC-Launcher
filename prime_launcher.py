"""Direct Windows entry point for the standalone PrimeLauncher executable."""
from __future__ import annotations

import os
import sys
import time
import traceback
import json
import hashlib
import urllib.request
import urllib.error
import zipfile
import tempfile
import shutil
import subprocess
import base64
import re
from pathlib import Path


def resource_path(relative_path: str) -> str:
    """Resolve bundled files in both PyInstaller and source execution."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base / relative_path)


def _report_startup_error(exc: BaseException) -> None:
    details = traceback.format_exc()
    root = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    root = root / "SkyRealm" / "PrimeLauncher"
    log_path = root / "launch-errors.log"
    try:
        root.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log:
            log.write(
                f"\n{time.strftime('%Y-%m-%d %H:%M:%S')} | "
                f"{type(exc).__name__}: {exc}\n{details}\n"
            )
    except OSError:
        pass

    message = (
        "Не удалось запустить PrimeLauncher.\n\n"
        f"{type(exc).__name__}: {exc}\n\n"
        f"Журнал ошибки: {log_path}"
    )
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0, message, "PrimeLauncher — ошибка запуска", 0x10
        )
    except Exception:
        pass



def _prime_update_log(message: str) -> None:
    root = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "SkyRealm" / "PrimeLauncher"
    try:
        root.mkdir(parents=True, exist_ok=True)
        with (root / "update.log").open("a", encoding="utf-8") as log:
            log.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} | {message}\n")
    except OSError:
        pass


def _prime_update_prompt(version: str, current: str) -> bool:
    """Show a visible, explicit Yes/No update panel before entering the game."""
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("Обновление PrimeLauncher")
    root.geometry("470x225")
    root.resizable(False, False)
    root.configure(bg="#101827")
    root.attributes("-topmost", True)
    root.update_idletasks()
    x = (root.winfo_screenwidth() - 470) // 2
    y = (root.winfo_screenheight() - 225) // 2
    root.geometry(f"+{x}+{y}")
    answer = {"yes": False}

    tk.Label(root, text="ДОСТУПНО ОБНОВЛЕНИЕ", bg="#101827", fg="#f4f7fb",
             font=("Segoe UI", 16, "bold")).pack(pady=(20, 8))
    tk.Label(root, text=f"PrimeLauncher {version}", bg="#101827", fg="#69b7ff",
             font=("Segoe UI", 12, "bold")).pack()
    tk.Label(root, text=f"Установлена версия {current}\nСкачать и установить новую версию сейчас?",
             bg="#101827", fg="#cbd5e1", font=("Segoe UI", 10),
             justify="center").pack(pady=12)

    buttons = tk.Frame(root, bg="#101827")
    buttons.pack(pady=(4, 14))

    def choose(value: bool) -> None:
        answer["yes"] = value
        root.destroy()

    ttk.Button(buttons, text="Да, обновить", command=lambda: choose(True)).pack(side="left", padx=8, ipadx=12, ipady=5)
    ttk.Button(buttons, text="Нет, позже", command=lambda: choose(False)).pack(side="left", padx=8, ipadx=12, ipady=5)
    root.protocol("WM_DELETE_WINDOW", lambda: choose(False))
    root.mainloop()
    return answer["yes"]


def _prime_schedule_self_update(archive_path: Path) -> None:
    """Hand off replacement to PowerShell so the running EXE can exit safely."""
    executable = Path(sys.executable).resolve()
    update_root = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "SkyRealm" / "PrimeLauncher" / "updates"
    update_root.mkdir(parents=True, exist_ok=True)
    config_path = update_root / "pending-update.json"
    config_path.write_text(json.dumps({
        "archive": str(archive_path.resolve()),
        "exe": str(executable),
        "directory": str(executable.parent),
        "pid": os.getpid(),
    }, ensure_ascii=False), encoding="utf-8")

    ps = r"""
$ErrorActionPreference = 'Stop'
$cfg = Get-Content -LiteralPath $args[0] -Raw | ConvertFrom-Json
try {
    Wait-Process -Id ([int]$cfg.pid) -Timeout 90 -ErrorAction SilentlyContinue
    if (Get-Process -Id ([int]$cfg.pid) -ErrorAction SilentlyContinue) { throw 'PrimeLauncher did not exit in time' }
    $stage = Join-Path $env:TEMP ('PrimeLauncher-update-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Expand-Archive -LiteralPath $cfg.archive -DestinationPath $stage -Force
    $candidate = Get-ChildItem -LiteralPath $stage -Filter 'PrimeLauncher.exe' -File -Recurse | Select-Object -First 1
    if (-not $candidate -or $candidate.Length -lt 1000000) { throw 'Updated PrimeLauncher.exe is missing or invalid' }
    $backup = $cfg.exe + '.previous.exe'
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    Copy-Item -LiteralPath $cfg.exe -Destination $backup -Force
    try {
        Copy-Item -LiteralPath $candidate.FullName -Destination $cfg.exe -Force
        Start-Process -FilePath $cfg.exe -WorkingDirectory $cfg.directory
        Start-Sleep -Seconds 3
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $cfg.archive -Force -ErrorAction SilentlyContinue
    } catch {
        Copy-Item -LiteralPath $backup -Destination $cfg.exe -Force
        Start-Process -FilePath $cfg.exe -WorkingDirectory $cfg.directory
        throw
    }
} catch {
    Add-Content -LiteralPath (Join-Path (Split-Path -Parent $cfg.exe) 'PrimeLauncher-update-error.log') -Value ($_.ToString())
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $args[0] -Force -ErrorAction SilentlyContinue
}
"""
    encoded = base64.b64encode(ps.encode("utf-16le")).decode("ascii")
    subprocess.Popen(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded, str(config_path)],
        cwd=str(executable.parent), close_fds=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def _check_for_prime_update() -> bool:
    """Check published PrimeLauncher releases and ask before downloading."""
    if not getattr(sys, "frozen", False):
        return False
    try:
        version_path = Path(resource_path("prime_launcher_version.txt"))
        current = version_path.read_text(encoding="utf-8").strip()
        api_url = "https://api.github.com/repos/kisia319-cell/SkyRealm-PC-Launcher/releases?per_page=30"
        request = urllib.request.Request(
            api_url + "&cache=" + str(time.time_ns()),
            headers={"User-Agent": "PrimeLauncher-Updater/1.0", "Accept": "application/vnd.github+json", "Cache-Control": "no-cache"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            releases = json.loads(response.read(1024 * 1024).decode("utf-8"))
        candidates = []
        for release in releases if isinstance(releases, list) else []:
            tag = str(release.get("tag_name", ""))
            match = re.fullmatch(r"prime-v([0-9]+(?:\.[0-9]+){1,3})-reg([0-9]+)", tag)
            if not match or release.get("draft"):
                continue
            version = match.group(1)
            numbers = tuple(int(part) for part in version.split("."))
            run_number = int(match.group(2))
            assets = {str(asset.get("name")): asset for asset in release.get("assets", [])}
            if "PrimeLauncher-Windows.zip" in assets and "PrimeLauncher-Windows.zip.sha256" in assets:
                candidates.append((numbers, run_number, version, assets))
        if not candidates:
            _prime_update_log("no published PrimeLauncher release with checksum asset found")
            return False
        _, _, latest, assets = max(candidates, key=lambda item: (item[0], item[1]))
        current_numbers = tuple(int(part) for part in re.findall(r"\d+", current))
        latest_numbers = tuple(int(part) for part in latest.split("."))
        if latest_numbers <= current_numbers:
            _prime_update_log(f"up to date: {current}")
            return False
        if not _prime_update_prompt(latest, current):
            _prime_update_log(f"user postponed update: {current} -> {latest}")
            return False

        root = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "SkyRealm" / "PrimeLauncher" / "updates"
        root.mkdir(parents=True, exist_ok=True)
        archive_path = root / f"PrimeLauncher-{latest}.zip"
        digest = hashlib.sha256()
        download_url = str(assets["PrimeLauncher-Windows.zip"].get("browser_download_url", ""))
        checksum_url = str(assets["PrimeLauncher-Windows.zip.sha256"].get("browser_download_url", ""))
        if not download_url.startswith("https://") or not checksum_url.startswith("https://"):
            raise ValueError("В релизе отсутствует безопасная HTTPS-ссылка на архив или SHA-256")
        req = urllib.request.Request(download_url, headers={"User-Agent": "PrimeLauncher-Updater/1.0"})
        with urllib.request.urlopen(req, timeout=45) as response, archive_path.open("wb") as output:
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 1024 * 1024 * 1024:
                    raise ValueError("Архив обновления превышает 1 ГБ")
                digest.update(chunk)
                output.write(chunk)
        checksum_request = urllib.request.Request(checksum_url, headers={"User-Agent": "PrimeLauncher-Updater/1.0"})
        with urllib.request.urlopen(checksum_request, timeout=15) as response:
            expected = response.read(4096).decode("utf-8").strip().split()[0].lower()
        if not re.fullmatch(r"[0-9a-f]{64}", expected) or digest.hexdigest() != expected:
            archive_path.unlink(missing_ok=True)
            raise ValueError("Проверка SHA-256 обновления не пройдена")
        with zipfile.ZipFile(archive_path, "r") as archive:
            executables = [item for item in archive.infolist()
                           if Path(item.filename.replace("\\", "/")).name.lower() == "primelauncher.exe" and not item.is_dir()]
            if len(executables) != 1 or executables[0].file_size < 1_000_000:
                raise ValueError("В архиве нет корректного PrimeLauncher.exe")
        _prime_update_log(f"verified update downloaded: {current} -> {latest}; SHA-256 OK")
        _prime_schedule_self_update(archive_path)
        return True
    except Exception as exc:
        _prime_update_log(f"update check/download failed: {type(exc).__name__}: {exc}")
        return False


def main() -> int:
    try:
        if _check_for_prime_update():
            return 0
        # Import the existing, tested WebView/server implementation without
        # executing launcher.py's normal SkyRealm startup block.
        import launcher

        if len(sys.argv) >= 3 and sys.argv[1] == "--prime-competitive":
            game_html = Path(sys.argv[2]).resolve()
        else:
            game_html = Path(
                launcher.resource_path("game/competitive/index.html")
            ).resolve()

        if not game_html.is_file():
            raise FileNotFoundError(
                "В сборке отсутствует game/competitive/index.html: "
                + str(game_html)
            )

        launcher.run_prime_competitive_window(str(game_html))
        return 0
    except BaseException as exc:
        _report_startup_error(exc)
        raise


if __name__ == "__main__":
    raise SystemExit(main())
