package jp.tsdfplato.timesparking

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotificationSupport.createChannel(this)
        requestNotificationPermission()

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            FcmRegistration.register(applicationContext, token)
        }

        // Android 15/16ではアプリがシステムバーまで描画されるため、
        // WebView自身へ実際の上下余白を渡して、画面内容を隠さない。
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        webView.setBackgroundColor(0xFFEEF2F6.toInt())
        setContentView(webView)

        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.navigationBars() or
                    WindowInsetsCompat.Type.displayCutout(),
            )

            // 左右のカットアウトも含め、Webページの表示領域を安全範囲へ収める。
            view.setPadding(
                bars.left,
                bars.top,
                bars.right,
                bars.bottom,
            )
            insets
        }
        ViewCompat.requestApplyInsets(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)

            // PWAのviewport指定をそのまま使い、APK独自の縮小表示をしない。
            loadWithOverviewMode = false
            useWideViewPort = false
            textZoom = 100

            cacheMode = WebSettings.LOAD_NO_CACHE
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.clearCache(true)

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback,
            ) {
                callback.invoke(origin, true, false)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ) = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                return if (request.url.host == "tsdfplato.github.io") {
                    false
                } else {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    true
                }
            }
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                WebViewAssetLoader.AssetsPathHandler(this),
            )
            .build()

        // 画面はAPK内へ同梱する。空車データと通知予約だけクラウドへアクセスする。
        // Android公式のHTTPS相当URLで開くため、file:// の通信制限にも依存しない。
        webView.loadUrl(
            "https://appassets.androidplatform.net/assets/web/index.html?source=android-apk&v=${packageManager.getPackageInfo(packageName, 0).longVersionCode}",
        )
    }

    private fun requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                1001,
            )
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
