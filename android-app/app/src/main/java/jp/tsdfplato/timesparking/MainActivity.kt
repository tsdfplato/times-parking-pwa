package jp.tsdfplato.timesparking

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : Activity() {
    private lateinit var webView: WebView

    companion object {
        private const val PWA_URL =
            "https://tsdfplato.github.io/times-parking-pwa/"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NotificationSupport.createChannel(this)
        requestNotificationPermission()

        FirebaseMessaging.getInstance()
            .token
            .addOnSuccessListener { token ->
                FcmRegistration.register(
                    applicationContext,
                    token
                )
            }

        webView = WebView(this)
        setContentView(webView)

        webView.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val systemBars = insets.getInsets(
                    WindowInsets.Type.systemBars()
                )

                view.setPadding(
                    systemBars.left,
                    systemBars.top,
                    systemBars.right,
                    systemBars.bottom
                )
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }

            insets
        }

        webView.requestApplyInsets()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)

            loadWithOverviewMode = true
            useWideViewPort = true
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
                    callback:
                        GeolocationPermissions.Callback
                ) {
                    callback.invoke(
                        origin,
                        true,
                        false
                    )
                }
            }

        webView.webViewClient =
            object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    return if (
                        request.url.host ==
                            "tsdfplato.github.io"
                    ) {
                        false
                    } else {
                        startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                request.url
                            )
                        )
                        true
                    }
                }
            }

        val latestUrl =
            "$PWA_URL?source=android-apk" +
                "&refresh=${System.currentTimeMillis()}"

        webView.loadUrl(latestUrl)
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

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}