"""Replace the launcher after its process exits; keep a backup for recovery."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path


def process_is_running(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError):
        return False


def main(archive_path, target_exe, parent_pid):
    archive_path = Path(archive_path).resolve()
    target_exe = Path(target_exe).resolve()
    if not archive_path.is_file() or not target_exe.is_file():
        return 2
    stage = Path(tempfile.mkdtemp(prefix="skyrealm-update-"))
    backup = target_exe.with_name(target_exe.stem + ".previous.exe")
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            candidates = [i for i in archive.infolist() if Path(i.filename.replace("\\", "/")).name.lower() == "skyrealm.exe" and not i.is_dir()]
            if len(candidates) != 1 or candidates[0].file_size < 100_000:
                return 3
            staged = stage / "SkyRealm.exe"
            with archive.open(candidates[0]) as src, staged.open("wb") as dst:
                shutil.copyfileobj(src, dst)
        deadline = time.time() + 90
        while process_is_running(parent_pid) and time.time() < deadline:
            time.sleep(0.25)
        if process_is_running(parent_pid):
            return 4
        backup.unlink(missing_ok=True)
        os.replace(target_exe, backup)
        try:
            os.replace(staged, target_exe)
        except Exception:
            os.replace(backup, target_exe)
            raise
        subprocess.Popen([str(target_exe)], cwd=str(target_exe.parent), close_fds=True)
        time.sleep(2)
        backup.unlink(missing_ok=True)
        archive_path.unlink(missing_ok=True)
        return 0
    finally:
        shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(64)
    try:
        raise SystemExit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
    except Exception:
        raise SystemExit(1)
