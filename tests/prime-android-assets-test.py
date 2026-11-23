from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAIRS = (
    ("game/competitive/index.html", "mobile/prime-launcher-android/app/src/main/assets/prime/index.html"),
    ("game/competitive/prime-world.js", "mobile/prime-launcher-android/app/src/main/assets/prime/prime-world.js"),
    ("game/competitive/prime-online.js", "mobile/prime-launcher-android/app/src/main/assets/prime/prime-online.js"),
)

for source, bundled in PAIRS:
    original = (ROOT / source).read_bytes()
    packaged = (ROOT / bundled).read_bytes()
    if original != packaged:
        raise SystemExit(f"Android PrimeLauncher asset is stale: {bundled}")
    print(f"OK: {source} -> {bundled} ({len(original)} bytes)")

html = (ROOT / PAIRS[0][1]).read_text(encoding="utf-8")
for required in ('<meta name="viewport"', 'prime-online.js', 'prime-world.js'):
    if required not in html:
        raise SystemExit(f"PrimeLauncher mobile page is missing {required!r}")
print("PrimeLauncher Android asset parity checks passed.")
