# PrimeLauncher for Android

This Android app packages the original PrimeLauncher experience rather than a recreated interface.

- The same `game/competitive/index.html`, `prime-world.js`, and `prime-online.js` files used by the Windows PrimeLauncher are bundled into the APK.
- Android WebView provides the rendering surface, touch input, persistent local storage, HTTPS networking, and hardware-accelerated canvas rendering.
- The original responsive layout is used for portrait and landscape screens.
- Game/profile data is stored in WebView local storage on the device.
- The APK is distributed directly from the SkyRealm-PC-Launcher GitHub Releases.

Build from this directory's parent repository:

```sh
gradle :app:assembleDebug
```

The resulting installable debug-signed APK is at `app/build/outputs/apk/debug/app-debug.apk`.
