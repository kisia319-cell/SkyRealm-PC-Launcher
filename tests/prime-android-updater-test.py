from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / "mobile/prime-launcher-android"
activity = (base / "app/src/main/java/com/skyrealm/primelauncher/MainActivity.kt").read_text(encoding="utf-8")
manifest = (base / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
gradle = (base / "app/build.gradle.kts").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/prime-launcher-android.yml").read_text(encoding="utf-8")
version = (base / "version.txt").read_text(encoding="utf-8").strip()
paths = (base / "app/src/main/res/xml/file_paths.xml").read_text(encoding="utf-8")

required_activity = (
    "releases?per_page=100",
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

if f'versionName = "{version}"' not in gradle:
    raise SystemExit("Gradle versionName and version.txt do not match")
if "prerelease: true" not in workflow:
    raise SystemExit("Android releases must remain prereleases so Windows update discovery ignores APKs")
if "ANDROID_KEYSTORE_BASE64" not in workflow or "assembleRelease" not in workflow:
    raise SystemExit("Workflow is missing stable Android release signing support")

print(f"Android updater static checks passed for version {version}.")
