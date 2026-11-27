# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Play In-App Updates (App Update API) — keep when minify is enabled later.
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**

# ---- R8 (2026-11-16, docs/audit/android-r8-minify-plan-2026-11-15.md §3) ----
# 비정상 종료 줄 번호 (mapping 파일과 함께 Play 업로드)
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod

# 통화 수신 앞 화면 판정 — NativeVoice/VideoCallRuntime 이 이름으로 찾는 리플렉션 대상
-keep class com.dibay.app.MainActivity {
    public static boolean isAppVisibleForIncomingCall();
}

# 웹 → 네이티브 호출 (@JavascriptInterface)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Kakao SDK (공식 문서 「Optional: ProGuard rules」 — R8 full mode 에서 Retrofit 제네릭 정보 보존)
# 2026-11-16 실측: 규칙 없이 R8 빌드 시 시작 직후 종료 「Unable to create call adapter」(Kakao AppLifecycleObserver)
-keep class com.kakao.sdk.**.model.* { <fields>; }
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.*
-dontwarn org.openjsse.**
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

# Gson (Kakao 모델 직렬화) — @SerializedName 필드·어댑터 보존
-keepclassmembers,allowobfuscation class * { @com.google.gson.annotations.SerializedName <fields>; }
-keep class * extends com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Capacitor 어노테이션 — 런타임에 플러그인 어노테이션(권한·별칭)을 읽음 (2026-11-16 실측: 없으면 getPluginAnnotation()=null 종료)
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault
-keep @interface com.getcapacitor.annotation.** { *; }
-keep @interface com.getcapacitor.NativePlugin { *; }
-keep @interface com.getcapacitor.PluginMethod { *; }

# TikTok Business SDK(1.7.1) 는 Google Play Billing 을 compileOnly(선택)로만 참조한다.
# DIBAY 는 Billing 라이브러리를 넣지 않으므로 릴리스 R8 이 「없는 클래스」로 멈춘다 → 경고만 끈다.
# (SDK 자체 keep 규칙은 AAR consumer-proguard-rules.pro 로 함께 들어온다.)
-dontwarn com.android.billingclient.api.**
