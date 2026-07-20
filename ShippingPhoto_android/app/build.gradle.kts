plugins {
    id("com.android.application")
}

val cameraxVersion = "1.5.0"

android {
    namespace = "com.shippingphoto.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.shippingphoto.android"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    implementation("androidx.documentfile:documentfile:1.1.0")
}
