plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}
android {
    namespace = "jp.tsdfplato.timesparking"
    compileSdk = 35

    // GitHub Actions の実行番号を APK の版番号に使う。
    // 同じ署名鍵で versionCode が毎回増えるため、Android が上書き更新できる。
    val appVersionCode = System.getenv("TIMES_VERSION_CODE")?.toIntOrNull() ?: 1

    defaultConfig {
        applicationId = "jp.tsdfplato.timesparking"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = "1.0.$appVersionCode"
    }
    signingConfigs {
        create("release") {
            val keystoreFile = System.getenv("TIMES_KEYSTORE_FILE")
            storeFile = if (keystoreFile.isNullOrBlank()) {
                file("missing-release-keystore.jks")
            } else {
                file(keystoreFile)
            }
            storePassword = System.getenv("TIMES_KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("TIMES_KEY_ALIAS") ?: "timesparking"
            keyPassword = System.getenv("TIMES_KEY_PASSWORD") ?: ""
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
