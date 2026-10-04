package jp.tsdfplato.timesparking

import android.content.Context
import android.provider.Settings
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object FcmRegistration {
    private const val REGISTER_URL = "https://times-parking-notifier.kubota-mlc.workers.dev/fcm-devices"

    fun register(context: Context, token: String) {
        Thread {
            try {
                val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "galaxy"
                val body = JSONObject()
                    .put("deviceId", deviceId)
                    .put("token", token)
                    .put("platform", "android")
                    .toString()
                val connection = URL(REGISTER_URL).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 15_000
                connection.readTimeout = 15_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                connection.inputStream.use { it.readBytes() }
                connection.disconnect()
            } catch (_: Exception) {
                // MainActivity retries whenever the app opens.
            }
        }.start()
    }
}
