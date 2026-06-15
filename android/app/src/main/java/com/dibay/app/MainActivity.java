package com.dibay.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "DIBAY_OAuth";
  private static volatile boolean appVisible = false;

  private DibayWebViewPermissionDelegate webViewPermissionDelegate;
  private String pendingAppPath = null;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public static boolean isAppVisibleForIncomingCall() {
    return appVisible;
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Capacitor: registerPlugin must run before super.onCreate or plugins stay UNIMPLEMENTED.
    registerPlugin(BrowserPlugin.class);
    registerPlugin(NativeOAuthLauncherPlugin.class);
    registerPlugin(NativeKakaoAuthPlugin.class);
    registerPlugin(NativeGoogleAuthPlugin.class);
    registerPlugin(NativeDevicePermissionsPlugin.class);
    registerPlugin(NativeIncomingCallPlugin.class);
    super.onCreate(savedInstanceState);
    webViewPermissionDelegate = new DibayWebViewPermissionDelegate(this);
    attachDibayWebChromeClient();
    logNativeAuthBootState();
    handleNotificationLaunchIntent(getIntent());
  }

  @Override
  public void onStart() {
    super.onStart();
    appVisible = true;
    attachDibayWebChromeClient();
  }

  @Override
  public void onResume() {
    super.onResume();
    appVisible = true;
    attachDibayWebChromeClient();
    flushPendingAppPathIfAny();
  }

  @Override
  public void onStop() {
    appVisible = false;
    super.onStop();
  }

  private void attachDibayWebChromeClient() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    WebChromeClient existing = webView.getWebChromeClient();
    if (existing instanceof DibayDelegatingWebChromeClient) return;
    webView.setWebChromeClient(new DibayDelegatingWebChromeClient(existing, webViewPermissionDelegate));
    Log.i("DIBAY_WebPerm", "delegating_web_chrome_client_attached");
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (NativeDevicePermissionsPlugin.handleCallMediaPermissionsResult(requestCode, permissions, grantResults)) {
      return;
    }
    if (webViewPermissionDelegate != null && webViewPermissionDelegate.onRequestPermissionsResult(requestCode, permissions, grantResults)) {
      return;
    }
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
  }

  private void logNativeAuthBootState() {
    String googleWebClientId = getString(R.string.google_web_client_id).trim();
    Log.i("DIBAY_Google", "google_native_boot configured=" + !googleWebClientId.isEmpty());
    if (googleWebClientId.isEmpty()) {
      Log.w("DIBAY_Google", "google_native_boot_missing set GOOGLE_WEB_CLIENT_ID in android/local.properties then Rebuild");
    } else {
      int prefixLen = Math.min(24, googleWebClientId.length());
      Log.i("DIBAY_Google", "google_native_web_client_prefix=" + googleWebClientId.substring(0, prefixLen));
      if (googleWebClientId.contains("-s690gak")) {
        Log.e(
          "DIBAY_Google",
          "google_native_web_client_id_wrong Android OAuth client ID detected — use DIBAY Google Login Web client ID (llmbrm89...)"
        );
      }
    }
    logGoogleSigningCertSha1();
  }

  private void logGoogleSigningCertSha1() {
    try {
      PackageManager pm = getPackageManager();
      PackageInfo packageInfo;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        packageInfo = pm.getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        Signature[] signatures = packageInfo.signingInfo.getApkContentsSigners();
        if (signatures != null) {
          for (Signature signature : signatures) {
            Log.i("DIBAY_Google", "google_native_app_sha1=" + sha1Hex(signature.toByteArray()));
          }
        }
      } else {
        packageInfo = pm.getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
        Signature[] signatures = packageInfo.signatures;
        if (signatures != null) {
          for (Signature signature : signatures) {
            Log.i("DIBAY_Google", "google_native_app_sha1=" + sha1Hex(signature.toByteArray()));
          }
        }
      }
      Log.i("DIBAY_Google", "google_native_package=" + getPackageName());
    } catch (Exception error) {
      Log.w("DIBAY_Google", "google_native_sha1_log_failed " + error.getMessage());
    }
  }

  private static String sha1Hex(byte[] certificate) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-1");
    byte[] hash = digest.digest(certificate);
    StringBuilder builder = new StringBuilder(hash.length * 3);
    for (int i = 0; i < hash.length; i++) {
      if (i > 0) {
        builder.append(':');
      }
      builder.append(String.format("%02X", hash[i]));
    }
    return builder.toString();
  }

  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleNotificationLaunchIntent(intent);
  }

  /** FCM 알림 탭(extras·https) + dibay:// 딥링크 → WebView 라우팅 */
  private void handleNotificationLaunchIntent(Intent intent) {
    if (intent == null) return;
    dismissIncomingCallNotificationFromIntent(intent);
    applyIncomingCallWakeFlags(intent);

    String appPath = resolveAppPathFromPushExtras(intent.getExtras());
    if (appPath != null && !appPath.isEmpty()) {
      queueNavigateWebViewToAppPath(appPath);
      return;
    }

    if (!Intent.ACTION_VIEW.equals(intent.getAction())) {
      return;
    }
    Uri data = intent.getData();
    if (data == null) return;

    if ("dibay".equals(data.getScheme())) {
      if ("auth".equals(data.getHost())) {
        Log.i(TAG, "intent_received path=" + data.getPath() + " hasCode=" + (data.getQueryParameter("code") != null));
        return;
      }
      appPath = mapDibayDeepLinkToAppPath(data);
      if (appPath != null && !appPath.isEmpty()) {
        queueNavigateWebViewToAppPath(appPath);
      }
      return;
    }

    if ("https".equals(data.getScheme()) || "http".equals(data.getScheme())) {
      appPath = mapHttpsDeepLinkToAppPath(data);
      if (appPath != null && !appPath.isEmpty()) {
        queueNavigateWebViewToAppPath(appPath);
      }
    }
  }

  private void applyIncomingCallWakeFlags(Intent intent) {
    Uri data = intent.getData();
    if (data == null || !"dibay".equals(data.getScheme()) || !"call".equals(data.getHost())) {
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow()
          .addFlags(
              WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                  | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                  | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
  }

  private void dismissIncomingCallNotificationFromIntent(Intent intent) {
    Uri data = intent.getData();
    if (data == null || !"dibay".equals(data.getScheme()) || !"call".equals(data.getHost())) {
      return;
    }
    java.util.List<String> segments = data.getPathSegments();
    if (segments.isEmpty()) return;
    String sessionId = segments.get(0);
    if (sessionId == null || sessionId.trim().isEmpty()) return;
    IncomingCallNotificationBuilder.dismissIncomingCall(this, sessionId.trim());
  }

  private static String resolveAppPathFromPushExtras(Bundle extras) {
    if (extras == null) return null;

    String url = firstNonEmpty(
        extras.getString("url"),
        extras.getString("link_url"),
        extras.getString("link_url_absolute"));
    if (url != null && url.startsWith("/")) {
      return url;
    }
    String fromUrl = mapHttpsDeepLinkToAppPath(url != null ? Uri.parse(url) : null);
    if (fromUrl != null && !fromUrl.isEmpty()) {
      return fromUrl;
    }

    String roomId = firstNonEmpty(extras.getString("roomId"), extras.getString("room_id"));
    if (roomId != null && !roomId.isEmpty()) {
      return "/community-messenger/rooms/" + Uri.encode(roomId);
    }

    String sessionId = firstNonEmpty(extras.getString("sessionId"), extras.getString("session_id"));
    if (sessionId != null && !sessionId.isEmpty()) {
      String action = firstNonEmpty(extras.getString("action"));
      String path = "/community-messenger/calls/" + Uri.encode(sessionId);
      if (action != null) {
        path += "?action=" + Uri.encode(action);
      }
      return path;
    }
    return null;
  }

  private static String firstNonEmpty(String... values) {
    if (values == null) return null;
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) {
        return value.trim();
      }
    }
    return null;
  }

  private static String mapHttpsDeepLinkToAppPath(Uri data) {
    if (data == null) return null;
    String scheme = data.getScheme();
    if (scheme == null || (!"https".equals(scheme) && !"http".equals(scheme))) {
      return null;
    }
    String path = data.getPath();
    if (path == null || path.isEmpty() || "/".equals(path)) {
      return null;
    }
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    return appendEncodedQuery(path, data.getEncodedQuery());
  }

  private static String appendEncodedQuery(String path, String encodedQuery) {
    if (encodedQuery == null || encodedQuery.isEmpty()) return path;
    return path + "?" + encodedQuery;
  }

  private void queueNavigateWebViewToAppPath(String appPath) {
    if (appPath == null || appPath.isEmpty()) return;
    pendingAppPath = appPath;
    flushPendingAppPathIfAny();
  }

  private void flushPendingAppPathIfAny() {
    if (pendingAppPath == null || pendingAppPath.isEmpty()) return;
    final String appPath = pendingAppPath;
    mainHandler.post(
        () -> {
          if (!navigateWebViewToAppPathNow(appPath)) {
            mainHandler.postDelayed(() -> navigateWebViewToAppPathNow(appPath), 120);
            mainHandler.postDelayed(() -> navigateWebViewToAppPathNow(appPath), 450);
            mainHandler.postDelayed(() -> navigateWebViewToAppPathNow(appPath), 900);
          }
        });
  }

  private boolean navigateWebViewToAppPathNow(String appPath) {
    if (appPath == null || appPath.isEmpty()) return false;
    Bridge bridge = getBridge();
    if (bridge == null) return false;
    WebView webView = bridge.getWebView();
    if (webView == null) return false;
    final String jsPath = appPath.replace("\\", "\\\\").replace("'", "\\'");
    webView.post(
        () ->
            webView.evaluateJavascript(
                "window.location.assign('" + jsPath + "');", null));
    pendingAppPath = null;
    Log.i(TAG, "deep_link_navigate path=" + appPath);
    return true;
  }

  private static String mapDibayDeepLinkToAppPath(Uri data) {
    String host = data.getHost();
    if (host == null) return null;
    java.util.List<String> segments = data.getPathSegments();
    switch (host) {
      case "chat":
        if (!segments.isEmpty()) {
          return "/community-messenger/rooms/" + android.net.Uri.encode(segments.get(0));
        }
        return null;
      case "trade":
        if (segments.size() >= 2 && "chat".equals(segments.get(0))) {
          return "/chats/" + android.net.Uri.encode(segments.get(1));
        }
        return null;
      case "orders":
        if (!segments.isEmpty()) {
          return "/orders/store/" + android.net.Uri.encode(segments.get(0));
        }
        return null;
      case "community":
        if (segments.size() >= 2 && "post".equals(segments.get(0))) {
          return "/philife/posts/" + android.net.Uri.encode(segments.get(1));
        }
        return null;
      case "call":
        if (!segments.isEmpty()) {
          String path = "/community-messenger/calls/" + android.net.Uri.encode(segments.get(0));
          String action = data.getQueryParameter("action");
          if (action != null && !action.trim().isEmpty()) {
            path += "?action=" + android.net.Uri.encode(action.trim());
          }
          return path;
        }
        return null;
      default:
        return null;
    }
  }

  private void logOAuthIntent(Intent intent) {
    if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
      return;
    }
    Uri data = intent.getData();
    if (data == null || !"dibay".equals(data.getScheme()) || !"auth".equals(data.getHost())) {
      return;
    }
    Log.i(TAG, "intent_received path=" + data.getPath() + " hasCode=" + (data.getQueryParameter("code") != null));
  }
}
