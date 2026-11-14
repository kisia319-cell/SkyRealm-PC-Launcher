"""Direct Windows entry point for the standalone PrimeLauncher executable."""
from __future__ import annotations

import os
import sys
import time
import traceback
from pathlib import Path


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


def main() -> int:
    try:
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
