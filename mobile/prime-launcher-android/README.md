# PrimeLauncher for Android

This Android app packages the original PrimeLauncher experience rather than a recreated interface.

- The same `game/competitive/index.html`, `prime-world.js`, and `prime-online.js` files used by the Windows PrimeLauncher are bundled into the APK.
- Android WebView provides rendering, touch input, persistent local storage, HTTPS networking, and hardware-accelerated canvas rendering.
- The original responsive layout is used for portrait and landscape screens.
- Game/profile data is stored in WebView local storage on the device.
- On every fresh launch, the app checks the latest non-draft Android GitHub Release (Android releases are intentionally prereleases) tagged `prime-android-vX.Y.Z`.
- If a newer version exists, the user can review the release notes, download the APK, and open Android's package installer. Android always asks the user to confirm installation.
- Downloads are written to the app's private external-files directory and exposed to the installer only through AndroidX FileProvider.

## Build

From this directory's parent repository:

```sh
gradle :app:assembleDebug
```

The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`.

## Required signing setup for seamless upgrades

Android only permits an APK to update an installed app when both APKs have the same signing certificate. The original 1.2.73 APK was built with GitHub Actions' ephemeral debug key, so a newly generated CI debug APK cannot be guaranteed to update it in place.

For future in-place updates, create a permanent Android upload keystore locally (never commit it):

```sh
keytool -genkeypair -v -keystore primelauncher-upload.jks -alias primelauncher -keyalg RSA -keysize 4096 -validity 10000
base64 -w 0 primelauncher-upload.jks
```

Copy the base64 output into the `ANDROID_KEYSTORE_BASE64` GitHub Actions secret. Set the remaining three secrets to the keystore password, alias (`primelauncher` in this example), and key password. Configure these four GitHub Actions repository secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

When all four secrets are configured, the release workflow builds and publishes a consistently signed `app-release.apk`, which the updater prioritizes. Keep the keystore and passwords private and backed up; losing them prevents future in-place updates. To migrate from the old 1.2.73 debug-signed build to the new permanent signing key, Android may require uninstalling the old app first (which can erase local app data). Do not uninstall until any needed local data has been backed up.

Without those secrets, CI falls back to a debug APK for testing; debug-signed releases are not suitable for guaranteed in-place upgrades between ephemeral CI runners.
