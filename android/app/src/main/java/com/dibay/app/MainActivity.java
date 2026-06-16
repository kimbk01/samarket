package com.dibay.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.content.SharedPreferences;
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
  private static final String ROUTE_PREFS = "dibay_push_route";
  private static final String CALL_ROUTE_PREFS = "dibay_call_pending_route";
  private static final String ROUTE_LOG_TAG = "DIBAY_PUSH_ROUTE";
  public static final String PENDING_PATH_KEY = "pending_path";
  public static final String PENDING_NOTIFICATION_ID_KEY = "pending_notification_id";
  public static final String PENDING_AT_KEY = "pending_at";
  private static final String LAST_ACCEPT_CALL_ID_KEY = "last_accept_call_id";
  private static final String LAST_ACCEPT_CALL_AT_KEY = "last_accept_call_at";
  private static final long PENDING_ROUTE_TTL_MS = 60_000L;
  private static final long ACCEPT_ROUTE_DEDUP_MS = 8_000L;
  private static final int[] PENDING_ROUTE_RETRY_DELAYS_MS = {120, 450, 900, 2_000, 4_000};
  private static final int[] ACCEPT_ROUTE_RETRY_DELAYS_MS = {0, 50, 120, 450, 900};
  private static volatile boolean appVisible = false;
  private static volatile MainActivity activeInstance = null;

  private DibayWebViewPermissionDelegate webViewPermissionDelegate;
  private String pendingAppPath = null;
  private String pendingNotificationId = null;
  private volatile boolean routeInjectedForCurrentPending = false;
  private volatile boolean dibayWebChromeClientAttached = false;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public static boolean isAppVisibleForIncomingCall() {
    return appVisible;
  }

  /** FCM foreground — WebView legacy call bridge (incoming_call / call_canceled) */
  static void deliverCallIncomingEvent(IncomingCallPayload payload) {
    MainActivity act = activeInstance;
    if (act == null || payload == null || !payload.isValid()) return;
    act.mainHandler.post(() -> act.injectCallIncomingEvent(payload));
  }

  /** FCM foreground — 발신 취소를 WebView legacy call bridge 에 전달 */
  static void deliverCallCanceledEvent(String callId) {
    MainActivity act = activeInstance;
    if (act == null || callId == null || callId.trim().isEmpty()) return;
    act.mainHandler.post(() -> act.injectCallCanceledEvent(callId.trim()));
  }

  private void injectCallIncomingEvent(IncomingCallPayload payload) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String callId = safeJs(payload.callId);
    final String roomId = safeJs(payload.roomId);
    final String callerId = safeJs(payload.callerId);
    final String callerName = safeJs(payload.callerName);
    final String avatar = safeJs(payload.callerAvatarUrl);
    final String callType = safeJs(payload.callType);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'incoming_call',sessionId:'"
            + callId
            + "',roomId:'"
            + roomId
            + "',callerId:'"
            + callerId
            + "',callerName:'"
            + callerName
            + "',callerAvatarUrl:'"
            + avatar
            + "',callKind:'"
            + callType
            + "'}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    DibayForegroundRingtone.start(this, payload.callId);
    Log.i(ROUTE_LOG_TAG, "[call-native] foreground_incoming_event callId=" + payload.callId);
  }

  private void injectCallCanceledEvent(String callId) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String safeCallId = safeJs(callId);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'call_canceled',sessionId:'"
            + safeCallId
            + "'}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    DibayForegroundRingtone.stop(callId);
    Log.i(ROUTE_LOG_TAG, "[call-native] foreground_canceled_event callId=" + callId);
  }

  private static String safeJs(String value) {
    if (value == null) return "";
    return value.replace("\\", "\\\\").replace("'", "\\'");
  }

  public static void clearPersistedCallPendingRoute(android.content.Context context) {
    if (context == null) return;
    context
        .getSharedPreferences(CALL_ROUTE_PREFS, android.content.Context.MODE_PRIVATE)
        .edit()
        .remove(PENDING_PATH_KEY)
        .remove(PENDING_AT_KEY)
        .apply();
  }

  public static android.os.Bundle readPersistedCallPendingRoute(android.content.Context context) {
    android.os.Bundle out = new android.os.Bundle();
    if (context == null) return out;
    SharedPreferences prefs =
        context.getSharedPreferences(CALL_ROUTE_PREFS, android.content.Context.MODE_PRIVATE);
    long at = prefs.getLong(PENDING_AT_KEY, 0L);
    if (at <= 0L || System.currentTimeMillis() - at > PENDING_ROUTE_TTL_MS) {
      clearPersistedCallPendingRoute(context);
      return out;
    }
    String path = prefs.getString(PENDING_PATH_KEY, null);
    if (path == null || path.trim().isEmpty()) return out;
    out.putString(PENDING_PATH_KEY, path.trim());
    out.putLong(PENDING_AT_KEY, at);
    return out;
  }

  private void persistCallPendingRoute(String appPath) {
    getSharedPreferences(CALL_ROUTE_PREFS, MODE_PRIVATE)
        .edit()
        .putString(PENDING_PATH_KEY, appPath)
        .putLong(PENDING_AT_KEY, System.currentTimeMillis())
        .apply();
  }

  /** PushRouteListener consumed the persisted route — drop native backup. */
  public static void clearPersistedPendingPushRoute(android.content.Context context) {
    if (context == null) return;
    context
        .getSharedPreferences(ROUTE_PREFS, android.content.Context.MODE_PRIVATE)
        .edit()
        .remove(PENDING_PATH_KEY)
        .remove(PENDING_NOTIFICATION_ID_KEY)
        .remove(PENDING_AT_KEY)
        .apply();
  }

  /** JS mount fallback when sessionStorage inject missed — SharedPreferences backup. */
  public static android.os.Bundle readPersistedPendingPushRoute(android.content.Context context) {
    android.os.Bundle out = new android.os.Bundle();
    if (context == null) return out;
    SharedPreferences prefs = context.getSharedPreferences(ROUTE_PREFS, android.content.Context.MODE_PRIVATE);
    long at = prefs.getLong(PENDING_AT_KEY, 0L);
    if (at <= 0L || System.currentTimeMillis() - at > PENDING_ROUTE_TTL_MS) {
      clearPersistedPendingPushRoute(context);
      return out;
    }
    String path = prefs.getString(PENDING_PATH_KEY, null);
    if (path == null || path.trim().isEmpty()) return out;
    out.putString(PENDING_PATH_KEY, path.trim());
    String notificationId = prefs.getString(PENDING_NOTIFICATION_ID_KEY, null);
    if (notificationId != null && !notificationId.isEmpty()) {
      out.putString(PENDING_NOTIFICATION_ID_KEY, notificationId);
    }
    out.putLong(PENDING_AT_KEY, at);
    return out;
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
    activeInstance = this;
    attachDibayWebChromeClient();
  }

  @Override
  public void onResume() {
    super.onResume();
    appVisible = true;
    activeInstance = this;
    attachDibayWebChromeClient();
    flushPendingAppPathIfAny();
  }

  @Override
  public void onStop() {
    appVisible = false;
    if (activeInstance == this) activeInstance = null;
    super.onStop();
  }

  private void attachDibayWebChromeClient() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    WebChromeClient existing = null;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      existing = webView.getWebChromeClient();
      if (existing instanceof DibayDelegatingWebChromeClient) return;
    } else if (dibayWebChromeClientAttached) {
      return;
    }
    webView.setWebChromeClient(new DibayDelegatingWebChromeClient(existing, webViewPermissionDelegate));
    dibayWebChromeClientAttached = true;
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
    requestDismissKeyguardForCallIntent(intent);

    String notificationId = intent.getExtras() != null ? intent.getExtras().getString("notificationId") : null;
    Log.i(ROUTE_LOG_TAG, "[push-route] notification_tap_received notificationId=" + notificationId);

    String appPath = resolveAppPathFromPushExtras(intent.getExtras());
    if (appPath != null && !appPath.isEmpty()) {
      if (isDuplicateRouteNotification(notificationId)) {
        Log.i(ROUTE_LOG_TAG, "[push-route] duplicate_ignored notificationId=" + notificationId);
        return;
      }
      String type = intent.getExtras() != null ? intent.getExtras().getString("type") : null;
      if ("missed_call".equals(type)) {
        Log.i("DIBAY_MISSED_CALL", "[call-route] missed_notification_opened path=" + appPath);
      } else if ("chat_message".equals(type)) {
        Log.i(ROUTE_LOG_TAG, "[call-route] chat_notification_opened path=" + appPath);
      }
      Log.i(ROUTE_LOG_TAG, "[push-route] route_resolved path=" + appPath);
      queueNavigateWebViewToAppPath(appPath, notificationId);
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
        if ("call".equals(data.getHost()) && "accept".equals(data.getQueryParameter("action"))) {
          java.util.List<String> segments = data.getPathSegments();
          String callId = segments.isEmpty() ? null : segments.get(0);
          if (isDuplicateCallAcceptRoute(callId)) {
            Log.i(ROUTE_LOG_TAG, "[call-route] incoming_accept_route_deduped callId=" + callId);
            return;
          }
          Log.i(ROUTE_LOG_TAG, "[call-route] incoming_accept_opened path=" + appPath);
        }
        Log.i(ROUTE_LOG_TAG, "[push-route] route_resolved path=" + appPath);
        queueNavigateWebViewToAppPath(appPath, null);
      }
      return;
    }

    if ("https".equals(data.getScheme()) || "http".equals(data.getScheme())) {
      appPath = mapHttpsDeepLinkToAppPath(data);
      if (appPath != null && !appPath.isEmpty()) {
        queueNavigateWebViewToAppPath(appPath, null);
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

  private void requestDismissKeyguardForCallIntent(Intent intent) {
    Uri data = intent != null ? intent.getData() : null;
    if (data == null || !"dibay".equals(data.getScheme()) || !"call".equals(data.getHost())) {
      return;
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    KeyguardManager keyguardManager = getSystemService(KeyguardManager.class);
    if (keyguardManager == null || !keyguardManager.isKeyguardLocked()) return;
    keyguardManager.requestDismissKeyguard(
        this,
        new KeyguardManager.KeyguardDismissCallback() {
          @Override
          public void onDismissError() {
            Log.w(ROUTE_LOG_TAG, "[push-route] keyguard_dismiss_error");
          }
        });
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

    String type = firstNonEmpty(extras.getString("type"));
    String callId = firstNonEmpty(extras.getString("callId"), extras.getString("sessionId"), extras.getString("session_id"));
    String roomId = firstNonEmpty(extras.getString("roomId"), extras.getString("room_id"));
    if ("missed_call".equals(type) && callId != null) {
      if (roomId != null) {
        return "/community-messenger/rooms/"
            + Uri.encode(roomId)
            + "?focus=call-history&callId="
            + Uri.encode(callId);
      }
      return "/community-messenger/calls/logs?callId=" + Uri.encode(callId);
    }
    if ("incoming_call".equals(type) && callId != null) {
      return "/community-messenger/calls/" + Uri.encode(callId) + "?action=accept";
    }

    if ("chat_message".equals(type) && roomId != null) {
      return "/community-messenger/rooms/" + Uri.encode(roomId);
    }
    if ("trade_message".equals(type) && roomId != null) {
      return "/chats/" + Uri.encode(roomId);
    }

    String orderId = firstNonEmpty(extras.getString("orderId"), extras.getString("order_id"));
    if ("delivery_order".equals(type) && orderId != null) {
      return "/orders/store/" + Uri.encode(orderId);
    }

    String postId = firstNonEmpty(extras.getString("postId"), extras.getString("post_id"));
    if ("community_comment".equals(type) && postId != null) {
      return "/philife/posts/" + Uri.encode(postId);
    }

    if (roomId != null && !roomId.isEmpty()) {
      return "/community-messenger/rooms/" + Uri.encode(roomId);
    }

    if (callId != null && !callId.isEmpty()) {
      String action = firstNonEmpty(extras.getString("action"));
      String path = "/community-messenger/calls/" + Uri.encode(callId);
      if (action != null) {
        path += "?action=" + Uri.encode(action);
      }
      return path;
    }
    return null;
  }

  private boolean isDuplicateCallAcceptRoute(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    SharedPreferences prefs = getSharedPreferences(ROUTE_PREFS, MODE_PRIVATE);
    String lastId = prefs.getString(LAST_ACCEPT_CALL_ID_KEY, null);
    long lastAt = prefs.getLong(LAST_ACCEPT_CALL_AT_KEY, 0L);
    long now = System.currentTimeMillis();
    if (sid.equals(lastId) && now - lastAt < ACCEPT_ROUTE_DEDUP_MS) {
      return true;
    }
    prefs.edit().putString(LAST_ACCEPT_CALL_ID_KEY, sid).putLong(LAST_ACCEPT_CALL_AT_KEY, now).apply();
    return false;
  }

  private boolean isDuplicateRouteNotification(String notificationId) {
    if (notificationId == null || notificationId.trim().isEmpty()) return false;
    SharedPreferences prefs = getSharedPreferences(ROUTE_PREFS, MODE_PRIVATE);
    String lastId = prefs.getString("last_notification_id", null);
    long lastAt = prefs.getLong("last_notification_at", 0L);
    long now = System.currentTimeMillis();
    if (notificationId.equals(lastId) && now - lastAt < 60_000L) {
      return true;
    }
    prefs.edit().putString("last_notification_id", notificationId).putLong("last_notification_at", now).apply();
    return false;
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

  private void persistPendingRoute(String appPath, String notificationId) {
    getSharedPreferences(ROUTE_PREFS, MODE_PRIVATE)
        .edit()
        .putString(PENDING_PATH_KEY, appPath)
        .putString(PENDING_NOTIFICATION_ID_KEY, notificationId != null ? notificationId : "")
        .putLong(PENDING_AT_KEY, System.currentTimeMillis())
        .apply();
  }

  private void restorePendingRouteFromPrefsIfNeeded() {
    if (routeInjectedForCurrentPending) return;
    if (pendingAppPath != null && !pendingAppPath.isEmpty()) return;
    SharedPreferences prefs = getSharedPreferences(ROUTE_PREFS, MODE_PRIVATE);
    long at = prefs.getLong(PENDING_AT_KEY, 0L);
    if (at <= 0L || System.currentTimeMillis() - at > PENDING_ROUTE_TTL_MS) {
      clearPersistedPendingPushRoute(this);
      return;
    }
    String path = prefs.getString(PENDING_PATH_KEY, null);
    if (path == null || path.trim().isEmpty()) return;
    pendingAppPath = path.trim();
    String notificationId = prefs.getString(PENDING_NOTIFICATION_ID_KEY, null);
    pendingNotificationId = notificationId != null && !notificationId.isEmpty() ? notificationId : null;
  }

  private void queueNavigateWebViewToAppPath(String appPath, String notificationId) {
    if (appPath == null || appPath.isEmpty()) return;
    routeInjectedForCurrentPending = false;
    pendingAppPath = appPath;
    pendingNotificationId = notificationId;
    persistPendingRoute(appPath, notificationId);
    Log.i(ROUTE_LOG_TAG, "[push-route] pending_route_saved path=" + appPath);
    flushPendingAppPathIfAny();
  }

  private void flushPendingAppPathIfAny() {
    if (routeInjectedForCurrentPending) return;
    restorePendingRouteFromPrefsIfNeeded();
    if (pendingAppPath == null || pendingAppPath.isEmpty()) return;
    final String appPath = pendingAppPath;
    final String notificationId = pendingNotificationId;
    final int[] retryDelays =
        isCalleeAcceptCallRoute(appPath) ? ACCEPT_ROUTE_RETRY_DELAYS_MS : PENDING_ROUTE_RETRY_DELAYS_MS;
    mainHandler.post(
        () -> {
          if (routeInjectedForCurrentPending) return;
          if (navigateWebViewToAppPathNow(appPath, notificationId)) {
            return;
          }
          for (int delayMs : retryDelays) {
            mainHandler.postDelayed(
                () -> {
                  if (routeInjectedForCurrentPending) return;
                  navigateWebViewToAppPathNow(appPath, notificationId);
                },
                delayMs);
          }
        });
  }

  private static boolean isCalleeAcceptCallRoute(String appPath) {
    return appPath != null
        && appPath.startsWith("/community-messenger/calls/")
        && appPath.contains("action=accept");
  }

  private static String extractCallSessionIdFromAppPath(String appPath) {
    if (appPath == null || appPath.isEmpty()) return null;
    java.util.regex.Matcher matcher =
        java.util.regex.Pattern.compile("^/community-messenger/calls/([^/?#]+)").matcher(appPath);
    if (!matcher.find()) return null;
    try {
      String raw = matcher.group(1);
      return raw != null ? java.net.URLDecoder.decode(raw.trim(), "UTF-8") : null;
    } catch (Exception error) {
      return matcher.group(1);
    }
  }

  private boolean isWebViewOnAppOrigin(WebView webView) {
    if (webView == null) return false;
    String currentUrl = webView.getUrl();
    if (currentUrl == null || currentUrl.trim().isEmpty()) return false;
    if (currentUrl.startsWith("about:")) return false;
    try {
      Uri current = Uri.parse(currentUrl);
      String host = current.getHost();
      if (host == null || host.isEmpty()) return false;
      String origin = DibayServerOrigin.resolve(this);
      if (origin == null || origin.isEmpty()) return true;
      Uri originUri = Uri.parse(origin);
      String originHost = originUri.getHost();
      return originHost != null && originHost.equalsIgnoreCase(host);
    } catch (Exception error) {
      return false;
    }
  }

  private boolean injectWebViewRouteViaJs(WebView webView, String appPath, String notificationId) {
    if (webView == null || appPath == null || appPath.isEmpty()) return false;
    final String jsPath = appPath.replace("\\", "\\\\").replace("'", "\\'");
    final String jsNotificationId =
        notificationId != null
            ? notificationId.replace("\\", "\\\\").replace("'", "\\'")
            : "";
    final long at = System.currentTimeMillis();
    final String acceptSessionId = extractCallSessionIdFromAppPath(appPath);
    final String acceptPendingJs =
        isCalleeAcceptCallRoute(appPath) && acceptSessionId != null
            ? "try{sessionStorage.setItem('cm_native_callee_accept_pending',JSON.stringify({sessionId:'"
                + acceptSessionId.replace("\\", "\\\\").replace("'", "\\'")
                + "',at:"
                + at
                + "}));}catch(e){}"
            : "";
    final boolean callRoute = appPath.startsWith("/community-messenger/calls/");
    final String storageKey = callRoute ? "dibay_call_pending_route" : "dibay_pending_push_route";
    if (callRoute) {
      persistCallPendingRoute(appPath);
    }
    final String js =
        "(function(){try{sessionStorage.setItem('"
            + storageKey
            + "',JSON.stringify({path:'"
            + jsPath
            + "',notificationId:'"
            + jsNotificationId
            + "',at:"
            + at
            + "}));"
            + acceptPendingJs
            + "}catch(e){}window.dispatchEvent(new CustomEvent('"
            + (callRoute ? "dibay:call-route" : "dibay:push-route")
            + "',{detail:{path:'"
            + jsPath
            + "',notificationId:'"
            + jsNotificationId
            + "'}}));})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    routeInjectedForCurrentPending = true;
    pendingAppPath = null;
    pendingNotificationId = null;
    Log.i(ROUTE_LOG_TAG, "[push-route] pending_route_consumed path=" + appPath);
    Log.i(ROUTE_LOG_TAG, "[push-route] webview_route_delivered path=" + appPath);
    return true;
  }

  private boolean navigateWebViewToAppPathNow(String appPath, String notificationId) {
    if (routeInjectedForCurrentPending) return true;
    if (appPath == null || appPath.isEmpty()) return false;
    Bridge bridge = getBridge();
    if (bridge == null) return false;
    WebView webView = bridge.getWebView();
    if (webView == null) return false;
    final boolean acceptRoute = isCalleeAcceptCallRoute(appPath);
    final boolean callRoute = appPath.startsWith("/community-messenger/calls/");
    final boolean webReady = isWebViewOnAppOrigin(webView);
    if (acceptRoute && webReady) {
      injectWebViewRouteViaJs(webView, appPath, notificationId);
      clearPersistedPendingPushRoute(this);
      return true;
    }
    if (callRoute && loadCallRouteDirectly(webView, appPath)) {
      routeInjectedForCurrentPending = true;
      pendingAppPath = null;
      pendingNotificationId = null;
      clearPersistedPendingPushRoute(this);
      Log.i(ROUTE_LOG_TAG, "[push-route] webview_call_route_loaded path=" + appPath);
      return true;
    }
    return injectWebViewRouteViaJs(webView, appPath, notificationId);
  }

  private boolean loadCallRouteDirectly(WebView webView, String appPath) {
    if (appPath == null || appPath.isEmpty()) return false;
    String target = null;
    String currentUrl = webView.getUrl();
    if (currentUrl != null && !currentUrl.trim().isEmpty()) {
      try {
        Uri current = Uri.parse(currentUrl);
        String scheme = current.getScheme();
        String authority = current.getAuthority();
        if (scheme != null && authority != null) {
          target = scheme + "://" + authority + appPath;
        }
      } catch (Exception error) {
        Log.w(ROUTE_LOG_TAG, "[push-route] webview_call_route_parse_failed " + error.getMessage());
      }
    }
    if (target == null) {
      String origin = DibayServerOrigin.resolve(this);
      if (origin != null && !origin.isEmpty()) {
        target = origin + appPath;
        Log.i(ROUTE_LOG_TAG, "[push-route] webview_call_route_origin_fallback path=" + appPath);
      }
    }
    if (target == null) return false;
    final String loadTarget = target;
    if (isCalleeAcceptCallRoute(appPath)) {
      final String acceptSessionId = extractCallSessionIdFromAppPath(appPath);
      if (acceptSessionId != null) {
        final long at = System.currentTimeMillis();
        final String pendingJs =
            "try{sessionStorage.setItem('cm_native_callee_accept_pending',JSON.stringify({sessionId:'"
                + acceptSessionId.replace("\\", "\\\\").replace("'", "\\'")
                + "',at:"
                + at
                + "}));}catch(e){}";
        webView.post(() -> webView.evaluateJavascript(pendingJs, null));
      }
    }
    webView.post(() -> webView.loadUrl(loadTarget));
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
          return appendEncodedQuery(path, data.getEncodedQuery());
        }
        return null;
      default:
        return null;
    }
  }

}
