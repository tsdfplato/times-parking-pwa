package jp.tsdfplato.timesparking

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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

        /*
         * Android 15 / 16のedge-to-edge表示に対応する。
         *
         * WebViewへ直接paddingを付ける方式では、ページがシステムバーの
         * 背後へ入り込む場合がある。
         *
         * 親FrameLayoutを画面全体に配置し、WebViewの表示領域を
         * ステータスバーとナビゲーションバーの内側へ制限する。
         */
        WindowCompat.setDecorFitsSystemWindows(window, false)

        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
        }

        webView = WebView(this).apply {
            setBackgroundColor(0xFFEEF2F6.toInt())
        }

        val statusBarBackground = View(this).apply {
            setBackgroundColor(0xFFFFD400.toInt())
        }

        val navigationBarBackground = View(this).apply {
            setBackgroundColor(Color.WHITE)
        }

        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        root.addView(
            statusBarBackground,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                Gravity.TOP,
            ),
        )

        root.addView(
            navigationBarBackground,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                Gravity.BOTTOM,
            ),
        )

        setContentView(root)

        WindowInsetsControllerCompat(window, root).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val safeInsets = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout(),
            )

            val statusInsets = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.displayCutout(),
            )

            val navigationInsets = insets.getInsets(
                WindowInsetsCompat.Type.navigationBars(),
            )

            val webViewLayout =
                webView.layoutParams as FrameLayout.LayoutParams

            webViewLayout.setMargins(
                safeInsets.left,
                statusInsets.top,
                safeInsets.right,
                navigationInsets.bottom,
            )

            webView.layoutParams = webViewLayout

            val statusLayout =
                statusBarBackground.layoutParams as
                    FrameLayout.LayoutParams

            statusLayout.width =
                ViewGroup.LayoutParams.MATCH_PARENT

            statusLayout.height = statusInsets.top
            statusLayout.gravity = Gravity.TOP

            statusBarBackground.layoutParams = statusLayout

            val navigationLayout =
                navigationBarBackground.layoutParams as
                    FrameLayout.LayoutParams

            navigationLayout.width =
                ViewGroup.LayoutParams.MATCH_PARENT

            navigationLayout.height = navigationInsets.bottom
            navigationLayout.gravity = Gravity.BOTTOM

            navigationBarBackground.layoutParams =
                navigationLayout

            insets
        }

        ViewCompat.requestApplyInsets(root)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)

            loadWithOverviewMode = false
            useWideViewPort = false
            textZoom = 100

            cacheMode = WebSettings.LOAD_NO_CACHE
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.clearCache(true)

        webView.webChromeClient =
            object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String,
                    callback: GeolocationPermissions.Callback,
                ) {
                    callback.invoke(origin, true, false)
                }
            }

        webView.webViewClient =
            object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ) = assetLoader.shouldInterceptRequest(
                    request.url,
                )

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    return if (
                        request.url.host ==
                            "appassets.androidplatform.net" ||
                        request.url.host ==
                            "tsdfplato.github.io"
                    ) {
                        false
                    } else {
                        startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                request.url,
                            ),
                        )

                        true
                    }
                }
            }

        assetLoader =
            WebViewAssetLoader.Builder()
                .addPathHandler(
                    "/assets/",
                    WebViewAssetLoader.AssetsPathHandler(
                        this,
                    ),
                )
                .build()

        val appVersionCode =
            packageManager
                .getPackageInfo(packageName, 0)
                .longVersionCode

        webView.loadUrl(
            "https://appassets.androidplatform.net/" +
                "assets/web/index.html" +
                "?source=android-apk" +
                "&v=$appVersionCode",
        )
    }

    private fun requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.POST_NOTIFICATIONS,
                ),
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