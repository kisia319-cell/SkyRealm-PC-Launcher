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


def _prime_schedule_self_update(archive_path: Path, version: str) -> None:
    """Launch a detached updater with an explicit PowerShell -File parameter."""
    executable = Path(sys.executable).resolve()
    update_root = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")) / "SkyRealm" / "PrimeLauncher" / "updates"
    update_root.mkdir(parents=True, exist_ok=True)
    config_path = update_root / f"pending-update-{os.getpid()}.json"
    script_path = update_root / "apply-prime-update.ps1"
    config_path.write_text(json.dumps({
        "archive": str(archive_path.resolve()),
        "exe": str(executable),
        "directory": str(executable.parent),
        "pid": os.getpid(),
        "version": version,
    }, ensure_ascii=False), encoding="utf-8")

    ps = r"""
param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$stage = $null
$backup = $null
$cfg = $null
$form = $null
$label = $null
$bar = $null
$logPath = $null
function Write-UpdateLog([string]$Message) {
    if ($script:logPath) {
        try { Add-Content -LiteralPath $script:logPath -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' | ' + $Message) -Encoding UTF8 } catch {}
    }
}
function Set-UpdateProgress([string]$Message, [int]$Value = -1) {
    if ($script:label) { $script:label.Text = $Message }
    if ($script:bar) {
        if ($Value -lt 0) {
            $script:bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
            $script:bar.MarqueeAnimationSpeed = 24
        } else {
            $script:bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
            $script:bar.MarqueeAnimationSpeed = 0
            $script:bar.Value = [Math]::Max(0, [Math]::Min(100, $Value))
        }
    }
    if ($script:form) { [System.Windows.Forms.Application]::DoEvents() }
}
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $script:form = New-Object System.Windows.Forms.Form
    $script:form.Text = 'Обновление PrimeLauncher'
    $script:form.Size = New-Object System.Drawing.Size(500, 175)
    $script:form.StartPosition = 'CenterScreen'
    $script:form.FormBorderStyle = 'FixedDialog'
    $script:form.MaximizeBox = $false
    $script:form.MinimizeBox = $false
    $script:form.TopMost = $true
    $script:form.ShowInTaskbar = $true
    $script:label = New-Object System.Windows.Forms.Label
    $script:label.Location = New-Object System.Drawing.Point(22, 24)
    $script:label.Size = New-Object System.Drawing.Size(440, 36)
    $script:label.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $script:label.Text = 'Подготовка установки обновления...'
    $script:form.Controls.Add($script:label)
    $script:bar = New-Object System.Windows.Forms.ProgressBar
    $script:bar.Location = New-Object System.Drawing.Point(22, 75)
    $script:bar.Size = New-Object System.Drawing.Size(440, 22)
    $script:bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
    $script:form.Controls.Add($script:bar)
    $script:form.Show()
    [System.Windows.Forms.Application]::DoEvents()

    $cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:logPath = Join-Path $cfg.directory 'PrimeLauncher-update.log'
    Write-UpdateLog ("Updater started for version " + $cfg.version)
    Set-UpdateProgress 'Закрываем старое окно PrimeLauncher...'
    $deadline = (Get-Date).AddSeconds(75)
    while (Get-Process -Id ([int]$cfg.pid) -ErrorAction SilentlyContinue) {
        if ((Get-Date) -gt $deadline) { throw 'Старая версия PrimeLauncher не закрылась за 75 секунд.' }
        Start-Sleep -Milliseconds 250
        [System.Windows.Forms.Application]::DoEvents()
    }

    Set-UpdateProgress 'Распаковываем и проверяем новую версию...' 18
    $stage = Join-Path $env:TEMP ('PrimeLauncher-update-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Expand-Archive -LiteralPath $cfg.archive -DestinationPath $stage -Force
    $candidate = Get-ChildItem -LiteralPath $stage -Filter 'PrimeLauncher.exe' -File -Recurse | Select-Object -First 1
    if (-not $candidate -or $candidate.Length -lt 1000000) { throw 'В архиве отсутствует корректный PrimeLauncher.exe.' }

    Set-UpdateProgress 'Подготавливаем замену файла...' 45
    $pendingExe = $cfg.exe + '.new'
    $script:backup = $cfg.exe + '.previous.exe'
    Copy-Item -LiteralPath $candidate.FullName -Destination $pendingExe -Force
    if ((Get-Item -LiteralPath $pendingExe).Length -lt 1000000) { throw 'Новый EXE не прошёл проверку размера.' }

    if (Test-Path -LiteralPath $script:backup) { Remove-Item -LiteralPath $script:backup -Force }
    Set-UpdateProgress 'Устанавливаем обновление...' 70
    Move-Item -LiteralPath $cfg.exe -Destination $script:backup -Force
    try {
        Move-Item -LiteralPath $pendingExe -Destination $cfg.exe -Force
    } catch {
        Move-Item -LiteralPath $script:backup -Destination $cfg.exe -Force
        throw
    }

    Set-UpdateProgress 'Запускаем обновлённую версию...' 88
    $newProcess = Start-Process -FilePath $cfg.exe -WorkingDirectory $cfg.directory -PassThru
    Start-Sleep -Seconds 5
    $newProcess.Refresh()
    if ($newProcess.HasExited) {
        throw 'Новая версия закрылась сразу после запуска. Старую версию восстановим автоматически.'
    }

    Set-UpdateProgress 'Обновление установлено успешно.' 100
    Write-UpdateLog ("Update installed and process started: " + $cfg.version)
    if (Test-Path -LiteralPath $script:backup) { Remove-Item -LiteralPath $script:backup -Force }
    if (Test-Path -LiteralPath $cfg.archive) { Remove-Item -LiteralPath $cfg.archive -Force }
    Start-Sleep -Milliseconds 900
} catch {
    $message = $_.Exception.Message
    Write-UpdateLog ("UPDATE FAILED: " + $message)
    if ($cfg -and $script:backup -and (Test-Path -LiteralPath $script:backup)) {
        try {
            if (Test-Path -LiteralPath $cfg.exe) { Remove-Item -LiteralPath $cfg.exe -Force -ErrorAction SilentlyContinue }
            Move-Item -LiteralPath $script:backup -Destination $cfg.exe -Force
            Write-UpdateLog 'Previous EXE restored.'
            Start-Process -FilePath $cfg.exe -WorkingDirectory $cfg.directory
        } catch {
            Write-UpdateLog ("Rollback failed: " + $_.Exception.Message)
        }
    }
    try {
        $messageText = "Не удалось установить обновление PrimeLauncher." + [Environment]::NewLine + [Environment]::NewLine + $message + [Environment]::NewLine + [Environment]::NewLine + "Старый EXE не удалён. Журнал: " + $logPath
        [System.Windows.Forms.MessageBox]::Show(
            $messageText,
            'PrimeLauncher — ошибка обновления',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {}
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($ConfigPath -and (Test-Path -LiteralPath $ConfigPath)) {
        Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
    }
    if ($script:form) { $script:form.Close(); $script:form.Dispose() }
}
"""
    script_path.write_text(ps, encoding="utf-8-sig")
    process = subprocess.Popen(
        [
            "powershell.exe", "-NoLogo", "-NoProfile",
            "-ExecutionPolicy", "Bypass", "-File",
            str(script_path), str(config_path),
        ],
        cwd=str(executable.parent),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if process.poll() is not None:
        raise RuntimeError("Windows updater process could not be started")
    _prime_update_log(f"visible installer started: {version}; pid={process.pid}")


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
