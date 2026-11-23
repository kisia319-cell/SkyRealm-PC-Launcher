from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / "mobile/prime-launcher-android"
activity = (base / "app/src/main/java/com/skyrealm/primelauncher/MainActivity.kt").read_text(encoding="utf-8")
manifest = (base / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
gradle = (base / "app/build.gradle.kts").read_text(encoding="utf-8")
version = (base / "version.txt").read_text(encoding="utf-8").strip()
paths = (base / "app/src/main/res/xml/file_paths.xml").read_text(encoding="utf-8")

required_activity = (
    "releases/latest",
    "prime-android-v",
    "compareVersions",
    "downloadUpdate",
    "FileProvider.getUriForFile",
    "ACTION_INSTALL_PACKAGE",
    "canRequestPackageInstalls",
    "hasMatchingSigningCertificate",
    "GET_SIGNING_CERTIFICATES",
    "MIN_APK_SIZE",
    "https://github.com/",
)
for token in required_activity:
    if token not in activity:
        raise SystemExit(f"Android updater is missing required behavior: {token}")

if 'android.permission.REQUEST_INSTALL_PACKAGES' not in manifest:
    raise SystemExit("Manifest is missing REQUEST_INSTALL_PACKAGES")
if 'androidx.core.content.FileProvider' not in manifest or '@xml/file_paths' not in manifest:
    raise SystemExit("Manifest is missing scoped FileProvider configuration")
if 'external-files-path' not in paths or 'Download/' not in paths:
    raise SystemExit("FileProvider must expose only the app's update download folder")

version_name = re.search(r'versionName\s*=\s*"([^"]+)"', gradle)
if not version_name or version_name.group(1) != version:
    raise SystemExit("Gradle versionName and version.txt do not match")

print(f"Android updater static checks passed for version {version}.")
