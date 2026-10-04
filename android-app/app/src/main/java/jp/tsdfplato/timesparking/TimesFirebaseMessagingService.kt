package jp.tsdfplato.timesparking

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class TimesFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        FcmRegistration.register(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.data["title"] ?: message.notification?.title ?: "タイムズ Parking Information"
        val body = message.data["body"] ?: message.notification?.body ?: "空車情報を確認してください"
        val id = message.data["notificationId"]?.toIntOrNull()
            ?: (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
        NotificationSupport.show(applicationContext, title, body, id)
    }
}
