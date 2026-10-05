package jp.tsdfplato.timesparking

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var latestPwaReloaded = false

    companion object {
        private const val PWA_URL =
            "https://tsdfplato.github.io/times-parking-pwa/?source=android-apk"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotificationSupport.createChannel(this)
        requestNotificationPermission()

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            FcmRegistration.register(applicationContext, token)
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)

        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val systemBars = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.navigationBars()
            )

            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                systemBars.bottom
            )

            insets
        }

        ViewCompat.requestApplyInsets(webView)

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

        webView.isVerticalScrollBarEnabled = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.clearCache(true)

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, true, false)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                return if (request.url.host == "tsdfplato.github.io") {
                    false
                } else {
                    startActivity(
                        Intent(Intent.ACTION_VIEW, request.url)
                    )
                    true
                }
            }

            override fun onPageFinished(
                view: WebView,
                url: String
            ) {
                super.onPageFinished(view, url)

                if (
                    latestPwaReloaded ||
                    !url.startsWith(
                        "https://tsdfplato.github.io/"
                    )
                ) {
                    return
                }

                latestPwaReloaded = true

                view.evaluateJavascript(
                    """
                    (async function () {
                      try {
                        if ('serviceWorker' in navigator) {
                          const registrations =
                            await navigator.serviceWorker
                              .getRegistrations();

                          await Promise.all(
                            registrations.map(
                              registration =>
                                registration.unregister()
                            )
                          );
                        }

                        if ('caches' in window) {
                          const cacheNames =
                            await caches.keys();

                          await Promise.all(
                            cacheNames.map(
                              name => caches.delete(name)
                            )
                          );
                        }
                      } catch (_) {}

                      location.replace(
                        '$PWA_URL&refresh=' + Date.now()
                      );
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }

        webView.loadUrl(
            "$PWA_URL&start=${System.currentTimeMillis()}"
        )
    }

    private fun requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.POST_NOTIFICATIONS
                ),
                1001
            )
        }
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.webChromeClient = null
        webView.webViewClient = null
        webView.destroy()
        super.onDestroy()
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