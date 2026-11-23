package com.skyrealm.primelauncher

import android.app.Activity
import android.app.AlertDialog
import android.app.ProgressDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequest = 701
    private val mainHandler = Handler(Looper.getMainLooper())
    private var waitingForInstallPermission = false
    private var updateFile: File? = null
    private var downloadDialog: ProgressDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(9, 9, 9)
        window.navigationBarColor = android.graphics.Color.rgb(9, 9, 9)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        webView.setBackgroundColor(android.graphics.Color.rgb(9, 9, 9))
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString PrimeLauncherAndroid/${BuildConfig.VERSION_NAME}"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest
            ) = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                if (url.scheme == "https" || url.scheme == "http") {
                    if (url.host == "github.com" || url.host == "supabase.co" ||
                        url.host?.endsWith(".supabase.co") == true ||
                        url.host?.endsWith(".skyrealm.workers.dev") == true ||
                        url.host == "cdn.jsdelivr.net") return false
                    return openExternal(url)
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                android.util.Log.d(
                    "PrimeLauncherWeb",
                    "${message.message()} (${message.sourceId()}:${message.lineNumber()})"
                )
                return true
            }

            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback
                val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }
                return try {
                    startActivityForResult(intent, fileChooserRequest)
                    true
                } catch (_: Exception) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    false
                }
            }
        }

        setContentView(webView)
        if (savedInstanceState == null) {
            webView.loadUrl("https://appassets.androidplatform.net/assets/prime/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }

        if (savedInstanceState == null) checkForUpdates()
    }

    private fun checkForUpdates() {
        Thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(LATEST_RELEASE_API).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 9000
                    readTimeout = 12000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
                    setRequestProperty("User-Agent", "PrimeLauncher-Android")
                }
                if (connection.responseCode !in 200..299) {
                    throw IllegalStateException("GitHub returned HTTP ${connection.responseCode}")
                }
                val release = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                if (release.optBoolean("draft") || release.optBoolean("prerelease")) return@Thread
                val tag = release.optString("tag_name")
                val remoteVersion = tag.removePrefix(RELEASE_TAG_PREFIX)
                val currentVersion = packageManager.getPackageInfo(packageName, 0).versionName ?: BuildConfig.VERSION_NAME
                if (!tag.startsWith(RELEASE_TAG_PREFIX) || compareVersions(remoteVersion, currentVersion) <= 0) {
                    return@Thread
                }
                val assets = release.optJSONArray("assets") ?: return@Thread
                var apkUrl: String? = null
                for (index in 0 until assets.length()) {
                    val asset = assets.optJSONObject(index) ?: continue
                    if (asset.optString("name") in setOf("app-release.apk", "app-debug.apk")) {
                        apkUrl = asset.optString("browser_download_url")
                        if (asset.optString("name") == "app-release.apk") break
                    }
                }
                if (apkUrl.isNullOrBlank() || !apkUrl.startsWith("https://github.com/")) return@Thread
                mainHandler.post { showUpdateAvailable(remoteVersion, apkUrl, release.optString("html_url")) }
            } catch (error: Exception) {
                android.util.Log.i(TAG, "Update check skipped: ${error.message}")
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    private fun showUpdateAvailable(version: String, apkUrl: String, releaseUrl: String) {
        if (isFinishing || isDestroyed) return
        AlertDialog.Builder(this)
            .setTitle("Доступно обновление PrimeLauncher")
            .setMessage("Новая версия $version уже доступна. Скачать и установить обновление?")
            .setNegativeButton("Позже", null)
            .setNeutralButton("Изменения") { _, _ ->
                if (releaseUrl.startsWith("https://github.com/")) openExternal(Uri.parse(releaseUrl))
            }
            .setPositiveButton("Обновить") { _, _ -> downloadUpdate(apkUrl) }
            .show()
    }

    private fun downloadUpdate(apkUrl: String) {
        if (!apkUrl.startsWith("https://github.com/")) {
            Toast.makeText(this, "Недопустимый адрес обновления", Toast.LENGTH_LONG).show()
            return
        }
        downloadDialog = ProgressDialog(this).apply {
            setTitle("Обновление PrimeLauncher")
            setMessage("Скачивание APK…")
            setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
            isIndeterminate = true
            setCancelable(false)
            show()
        }
        Thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(apkUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000
                    readTimeout = 30000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "PrimeLauncher-Android")
                }
                if (connection.responseCode !in 200..299) {
                    throw IllegalStateException("Не удалось скачать APK: HTTP ${connection.responseCode}")
                }
                val expectedLength = connection.contentLength
                val directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    ?: throw IllegalStateException("Папка загрузок недоступна")
                if (!directory.exists() && !directory.mkdirs()) {
                    throw IllegalStateException("Не удалось создать папку загрузок")
                }
                val destination = File(directory, UPDATE_FILE_NAME)
                val temporary = File(directory, "$UPDATE_FILE_NAME.part")
                var received = 0L
                connection.inputStream.use { input ->
                    FileOutputStream(temporary).use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                            received += count
                            if (expectedLength > 0) {
                                val progress = ((received * 100) / expectedLength).toInt().coerceIn(0, 100)
                                mainHandler.post {
                                    downloadDialog?.isIndeterminate = false
                                    downloadDialog?.progress = progress
                                }
                            }
                        }
                        output.fd.sync()
                    }
                }
                if (received < MIN_APK_SIZE || (expectedLength > 0 && received != expectedLength)) {
                    temporary.delete()
                    throw IllegalStateException("Загруженный APK повреждён или неполный")
                }
                if (!temporary.renameTo(destination)) {
                    temporary.copyTo(destination, overwrite = true)
                    temporary.delete()
                }
                mainHandler.post {
                    downloadDialog?.dismiss()
                    downloadDialog = null
                    updateFile = destination
                    promptInstall(destination)
                }
            } catch (error: Exception) {
                mainHandler.post {
                    downloadDialog?.dismiss()
                    downloadDialog = null
                    Toast.makeText(this, error.message ?: "Ошибка загрузки обновления", Toast.LENGTH_LONG).show()
                }
                android.util.Log.e(TAG, "APK download failed", error)
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    private fun promptInstall(apk: File) {
        if (!apk.isFile || apk.length() < MIN_APK_SIZE) {
            Toast.makeText(this, "Файл обновления не найден или повреждён", Toast.LENGTH_LONG).show()
            return
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O &&
            !packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(this)
                .setTitle("Разрешите установку обновления")
                .setMessage("Android должен разрешить PrimeLauncher устанавливать APK, скачанные самим приложением.")
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Открыть настройки") { _, _ ->
                    waitingForInstallPermission = true
                    val intent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                }
                .show()
            return
        }
        launchPackageInstaller(apk)
    }

    override fun onResume() {
        super.onResume()
        if (waitingForInstallPermission) {
            waitingForInstallPermission = false
            val pending = updateFile
            if (pending != null && pending.isFile &&
                (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O ||
                    packageManager.canRequestPackageInstalls())) {
                launchPackageInstaller(pending)
            }
        }
    }

    private fun launchPackageInstaller(apk: File) {
        try {
            val contentUri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                apk
            )
            val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = contentUri
                setDataAndType(contentUri, APK_MIME_TYPE)
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                putExtra(Intent.EXTRA_RETURN_RESULT, true)
            }
            startActivity(installIntent)
        } catch (error: Exception) {
            Toast.makeText(this, "Не удалось открыть установщик: ${error.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun compareVersions(left: String, right: String): Int {
        val a = left.split('.', '-', '+').map { it.toIntOrNull() ?: 0 }
        val b = right.split('.', '-', '+').map { it.toIntOrNull() ?: 0 }
        for (index in 0 until maxOf(a.size, b.size)) {
            val av = a.getOrElse(index) { 0 }
            val bv = b.getOrElse(index) { 0 }
            if (av != bv) return av.compareTo(bv)
        }
        return 0
    }

    @Deprecated("Deprecated in Android but retained for broad device compatibility")
    override fun onBackPressed() {
        AlertDialog.Builder(this)
            .setTitle("Закрыть PrimeLauncher?")
            .setMessage("Текущий прогресс сохраняется автоматически.")
            .setNegativeButton("Остаться", null)
            .setPositiveButton("Выйти") { _, _ -> finish() }
            .show()
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: Exception) {
            false
        }
    }

    @Deprecated("Deprecated in Android but required for WebView file chooser compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == fileChooserRequest) {
            val result = if (resultCode == RESULT_OK && data?.data != null) {
                arrayOf(data.data!!)
            } else null
            fileChooserCallback?.onReceiveValue(result)
            fileChooserCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        downloadDialog?.dismiss()
        fileChooserCallback?.onReceiveValue(null)
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "PrimeLauncherUpdate"
        private const val LATEST_RELEASE_API =
            "https://api.github.com/repos/kisia319-cell/SkyRealm-PC-Launcher/releases/latest"
        private const val RELEASE_TAG_PREFIX = "prime-android-v"
        private const val UPDATE_FILE_NAME = "PrimeLauncher-update.apk"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        private const val MIN_APK_SIZE = 1_000_000L
    }
}
