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
import android.os.SystemClock;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.graphics.Color;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeWebViewClient;
import android.app.PictureInPictureParams;
import android.util.Rational;
import com.dibay.app.call.CallScreenStateReceiver;
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "DIBAY_OAuth";
  private static final String WEBVIEW_LOG_TAG = "DIBAY_WebView";
  private static final long WEBVIEW_LOAD_TIMEOUT_MS = 10_000L;
  /** Max splash keep — JS dismiss 미수신 시 logged fallback (앱 진입 block 방지). */
  private static final long SPLASH_MAX_KEEP_MS = 2_200L;
  private static final String ROUTE_PREFS = "dibay_push_route";
  private static final String CALL_ROUTE_PREFS = "dibay_call_pending_route";
  private static final String ROUTE_LOG_TAG = "DIBAY_PUSH_ROUTE";
  public static final String PENDING_PATH_KEY = "pending_path";
  public static final String PENDING_NOTIFICATION_ID_KEY = "pending_notification_id";
  public static final String PENDING_AT_KEY = "pending_at";
  public static final String PENDING_CALL_ID_KEY = "pending_call_id";
  public static final String PENDING_ROOM_ID_KEY = "pending_room_id";
  public static final String PENDING_MEDIA_TYPE_KEY = "pending_media_type";
  public static final String PENDING_CALLER_NAME_KEY = "pending_caller_name";
  public static final String PENDING_EXPIRES_AT_KEY = "pending_expires_at";
  private static final String LAST_ACCEPT_CALL_ID_KEY = "last_accept_call_id";
  private static final String LAST_ACCEPT_CALL_AT_KEY = "last_accept_call_at";
  private static final long PENDING_ROUTE_TTL_MS = 60_000L;
  private static final long ACCEPT_ROUTE_DEDUP_MS = 8_000L;
  private static final int[] PENDING_ROUTE_RETRY_DELAYS_MS = {120, 450, 900, 2_000, 4_000};
  private static final int[] ACCEPT_ROUTE_RETRY_DELAYS_MS = {0, 50, 120, 450, 900};
  private static final int[] PENDING_TERMINAL_RETRY_DELAYS_MS = {120, 450, 900, 2_000};
  private static volatile boolean appVisible = false;
  private static volatile MainActivity activeInstance = null;
  /** Web dismissSplash / native fallback — keepOnScreenCondition false when true. */
  private static volatile boolean webSplashDismissRequested = false;
  private static volatile long splashKeepStartElapsedMs = 0L;
  private static volatile String splashDismissSource = "none";
  /** Sam app surface — avoid pure white WebView flash before first paint. */
  private static final int WEBVIEW_BACKGROUND_COLOR = Color.parseColor("#F0F2F5");

  private DibayWebSafeAreaBridge webSafeAreaBridge;
  private DibayWebViewPermissionDelegate webViewPermissionDelegate;
  private String pendingAppPath = null;
  private String pendingNotificationId = null;
  private volatile boolean routeInjectedForCurrentPending = false;
  private volatile boolean dibayWebChromeClientAttached = false;
  private volatile boolean dibayWebViewClientAttached = false;
  private volatile boolean dibayBootBridgeAttached = false;
  private volatile boolean callRouteLoadingVisible = false;
  private View callRouteLoadingOverlay = null;
  private View webViewLoadErrorOverlay = null;
  private TextView webViewLoadErrorDetail = null;
  private volatile boolean mainFrameLoadFinished = false;
  private volatile String lastMainFrameLoadFailure = null;
  private volatile String pendingMainFrameUrl = null;
  private final Runnable webViewLoadTimeoutRunnable =
      () -> {
        if (mainFrameLoadFinished) return;
        String url = pendingMainFrameUrl;
        String reason = lastMainFrameLoadFailure != null ? lastMainFrameLoadFailure : "net::ERR_TIMED_OUT";
        Log.e(
            WEBVIEW_LOG_TAG,
            "webview_load_timeout url=" + (url != null ? url : "") + " reason=" + reason);
        showWebViewLoadErrorOverlay(url, reason);
      };
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public static boolean isAppVisibleForIncomingCall() {
    return appVisible;
  }

  static MainActivity getActiveInstance() {
    return activeInstance;
  }

  public static void deliverCallAcceptRoute(
      android.content.Context context, String callId, boolean patchComplete) {
    final String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) return;
    final String flag = patchComplete ? "nativeAccept=1" : "nativePrep=1";
    final String appPath =
        "/community-messenger/calls/"
            + android.net.Uri.encode(sid)
            + "?action=accept&"
            + flag
            + "&mode=active&source=activity";
    MainActivity act = activeInstance;
    if (act != null) {
      act.mainHandler.post(() -> act.queueNavigateWebViewToAppPath(appPath, null));
      return;
    }
    if (context == null) return;
    Intent launch =
        patchComplete
            ? IncomingCallIntentHelper.buildMainActivityCallAcceptCompleteIntent(context.getApplicationContext(), sid)
            : IncomingCallIntentHelper.buildMainActivityCallAcceptIntent(context.getApplicationContext(), sid);
    context.getApplicationContext().startActivity(launch);
  }

  /** Foreground native pill visibility — Web banner fallback gate. */
  public static void notifyForegroundIncomingUiState(String callId, boolean visible) {
    MainActivity act = activeInstance;
    if (act == null) return;
    final String sid = callId != null ? callId.trim() : "";
    act.mainHandler.post(() -> act.injectForegroundIncomingUiEvent(sid, visible));
  }

  /** Lock-screen IncomingCallActivity visibility — Web banner 억제. */
  public static void notifyLockIncomingUiState(String callId, boolean visible) {
    MainActivity act = activeInstance;
    if (act == null) return;
    final String sid = callId != null ? callId.trim() : "";
    act.mainHandler.post(() -> act.injectLockIncomingUiEvent(sid, visible));
  }

  /** Native pill accept — Web consumed/surface release before pill finish */
  static void deliverForegroundIncomingAcceptEvent(String callId) {
    MainActivity act = activeInstance;
    if (act == null) return;
    final String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) return;
    act.mainHandler.post(() -> act.injectForegroundIncomingAcceptEvent(sid));
  }

  /** Native reject / swipe dismiss — Web consumed before PATCH completes. */
  static void deliverForegroundIncomingRejectEvent(android.content.Context context, String callId, String source) {
    final String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) return;
    final String src = source != null && !source.trim().isEmpty() ? source.trim() : "native_reject";
    MainActivity act = activeInstance;
    if (act == null) {
      if (context != null) {
        DibayCallTerminalPendingQueue.enqueue(context.getApplicationContext(), sid, "rejected");
      }
      return;
    }
    act.mainHandler.post(
        () -> {
          if (act.canDeliverCallEventToWebView()) {
            act.injectForegroundIncomingRejectEvent(sid, src);
          } else {
            DibayCallTerminalPendingQueue.enqueue(act.getApplicationContext(), sid, "rejected");
          }
        });
  }

  /** FCM foreground — WebView legacy call bridge (incoming_call / call_canceled) */
  static void deliverCallIncomingEvent(IncomingCallPayload payload) {
    MainActivity act = activeInstance;
    if (act == null || payload == null || !payload.isValid()) return;
    act.mainHandler.post(() -> act.injectCallIncomingEvent(payload));
  }

  /** FCM foreground — 발신 취소를 WebView legacy call bridge 에 전달 */
  static void deliverCallCanceledEvent(String callId) {
    deliverCallTerminalEvent(null, callId, "cancelled");
  }

  /** Terminal/cancel — WebView bridge; queues when WebView unavailable. */
  static void deliverCallTerminalEvent(android.content.Context context, String callId, String status) {
    if (callId == null || callId.trim().isEmpty()) return;
    String st = status != null ? status.trim().toLowerCase() : "cancelled";
    String sid = callId.trim();
    MainActivity act = activeInstance;
    if (act == null) {
      if (context != null) {
        DibayCallTerminalPendingQueue.enqueue(context.getApplicationContext(), sid, st);
      }
      return;
    }
    act.mainHandler.post(() -> act.deliverCallTerminalEventToWebView(sid, st));
  }

  private boolean canDeliverCallEventToWebView() {
    Bridge bridge = getBridge();
    return bridge != null && bridge.getWebView() != null;
  }

  private void deliverCallTerminalEventToWebView(String callId, String status) {
    if (canDeliverCallEventToWebView()) {
      injectCallTerminalEvent(callId, status);
      DibayCallTerminalPendingQueue.ack(getApplicationContext(), callId);
      return;
    }
    DibayCallTerminalPendingQueue.enqueue(getApplicationContext(), callId, status);
  }

  private void flushPendingTerminalEventsToWebView() {
    java.util.List<DibayCallTerminalPendingQueue.Entry> pending =
        DibayCallTerminalPendingQueue.snapshot(getApplicationContext());
    if (pending.isEmpty()) return;
    for (DibayCallTerminalPendingQueue.Entry entry : pending) {
      if (canDeliverCallEventToWebView()) {
        injectCallTerminalEvent(entry.callId, entry.status);
        DibayCallTerminalPendingQueue.ack(getApplicationContext(), entry.callId);
        Log.i("DIBAY_CALL", "[DIBAY_CALL] terminal_drained callId=" + entry.callId + " status=" + entry.status);
      }
    }
  }

  private void scheduleFlushPendingTerminalEvents() {
    mainHandler.post(
        () -> {
          flushPendingTerminalEventsToWebView();
          for (int delayMs : PENDING_TERMINAL_RETRY_DELAYS_MS) {
            mainHandler.postDelayed(this::flushPendingTerminalEventsToWebView, delayMs);
          }
        });
  }

  public static void clearNativeCalleeAcceptPending(android.content.Context context) {
    MainActivity act = activeInstance;
    if (act == null) return;
    act.mainHandler.post(() -> act.clearNativeCalleeAcceptPendingJs());
  }

  private void clearNativeCalleeAcceptPendingJs() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    webView.post(
        () ->
            webView.evaluateJavascript(
                "try{sessionStorage.removeItem('cm_native_callee_accept_pending');sessionStorage.removeItem('dibay_call_pending_route');}catch(e){}",
                null));
  }

  private void injectCallIncomingEvent(IncomingCallPayload payload) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    if (DibayCallConsumedStore.isConsumed(this, payload.callId)) {
      Log.i("DIBAY_CALL", "[DIBAY_CALL] incoming_ignored_consumed callId=" + payload.callId);
      return;
    }
    if (IncomingCallActionCoordinator.isCompleted(payload.callId)) {
      Log.i("DIBAY_CALL", "[DIBAY_CALL] incoming_ignored_completed callId=" + payload.callId);
      return;
    }
    if (!IncomingCallActionCoordinator.registerIncoming(this, payload.callId)) {
      Log.i(ROUTE_LOG_TAG, "[call-native] incoming_duplicate_ignored callId=" + payload.callId);
      return;
    }
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
    Log.i("DIBAY_CALL", "[DIBAY_CALL] incoming_received callId=" + payload.callId + " source=foreground_event");
    Log.i(ROUTE_LOG_TAG, "[call-native] foreground_incoming_event callId=" + payload.callId);
  }

  private void injectForegroundIncomingUiEvent(String callId, boolean visible) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String safeCallId = safeJs(callId);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'foreground_incoming_ui',sessionId:'"
            + safeCallId
            + "',visible:"
            + (visible ? "true" : "false")
            + "}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i("DIBAY_CALL", "[DIBAY_CALL] foreground_incoming_ui callId=" + callId + " visible=" + visible);
  }

  private void injectLockIncomingUiEvent(String callId, boolean visible) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String safeCallId = safeJs(callId);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'lock_incoming_ui',sessionId:'"
            + safeCallId
            + "',visible:"
            + (visible ? "true" : "false")
            + "}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i("DIBAY_CALL", "[DIBAY_CALL] lock_incoming_ui callId=" + callId + " visible=" + visible);
  }

  private void injectForegroundIncomingAcceptEvent(String callId) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String safeCallId = safeJs(callId);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'foreground_incoming_accept',sessionId:'"
            + safeCallId
            + "'}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i("DIBAY_CALL", "[DIBAY_CALL] foreground_incoming_accept callId=" + callId);
  }

  private void injectForegroundIncomingRejectEvent(String callId, String source) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String safeCallId = safeJs(callId);
    final String safeSource = safeJs(source);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'foreground_incoming_reject',sessionId:'"
            + safeCallId
            + "',source:'"
            + safeSource
            + "'}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i("DIBAY_CALL", "[DIBAY_CALL] foreground_incoming_reject callId=" + callId + " source=" + source);
  }

  private void injectCallTerminalEvent(String callId, String status) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String safeCallId = safeJs(callId);
    final String safeStatus = safeJs(status);
    boolean cancelled = "cancelled".equals(safeStatus) || "canceled".equals(safeStatus);
    final String js =
        cancelled
            ? "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'call_terminal',sessionId:'"
                + safeCallId
                + "',status:'"
                + safeStatus
                + "'}}));window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'call_canceled',sessionId:'"
                + safeCallId
                + "'}}));}catch(e){}})();"
            : "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-event',{detail:{type:'call_terminal',sessionId:'"
                + safeCallId
                + "',status:'"
                + safeStatus
                + "'}}));}catch(e){}})();";
    String sid = callId != null ? callId.trim() : "";
    if (!sid.isEmpty()) {
      String consumedReason = mapWebTerminalConsumedReason(status);
      DibayCallConsumedStore.mark(this, sid, consumedReason);
      IncomingCallActionCoordinator.complete(sid, status != null ? status : "cancelled");
      IncomingCallNotificationBuilder.dismissIncomingCall(this, sid);
    }
    IncomingCallRingOwner.stop(this, callId);
    hideCallRouteLoadingOverlay();
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i("DIBAY_CALL", "[DIBAY_CALL] terminal_received callId=" + callId + " status=" + status + " source=webview_inject");
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
    String sid = callId != null ? callId.trim() : "";
    if (!sid.isEmpty()) {
      DibayCallConsumedStore.mark(this, sid, "cancelled");
      IncomingCallActionCoordinator.complete(sid, "cancelled");
      IncomingCallNotificationBuilder.dismissIncomingCall(this, sid);
    }
    IncomingCallRingOwner.stop(this, callId);
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i(ROUTE_LOG_TAG, "[call-native] foreground_canceled_event callId=" + callId);
  }

  private static String mapWebTerminalConsumedReason(String status) {
    String st = status != null ? status.trim().toLowerCase() : "cancelled";
    switch (st) {
      case "rejected":
        return "declined";
      case "missed":
        return "missed";
      case "ended":
        return "ended";
      case "cancelled":
      case "canceled":
      default:
        return "cancelled";
    }
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
        .remove(PENDING_CALL_ID_KEY)
        .remove(PENDING_ROOM_ID_KEY)
        .remove(PENDING_MEDIA_TYPE_KEY)
        .remove(PENDING_CALLER_NAME_KEY)
        .remove(PENDING_EXPIRES_AT_KEY)
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
    copyStringPref(out, prefs, PENDING_CALL_ID_KEY);
    copyStringPref(out, prefs, PENDING_ROOM_ID_KEY);
    copyStringPref(out, prefs, PENDING_MEDIA_TYPE_KEY);
    copyStringPref(out, prefs, PENDING_CALLER_NAME_KEY);
    long expiresAt = prefs.getLong(PENDING_EXPIRES_AT_KEY, 0L);
    if (expiresAt > 0L) out.putLong(PENDING_EXPIRES_AT_KEY, expiresAt);
    return out;
  }

  private void persistCallPendingRoute(String appPath) {
    persistCallPendingRoute(getApplicationContext(), appPath, null, 0L);
  }

  public static void persistCallPendingRoute(
      android.content.Context context, String appPath, IncomingCallPayload payload, long effectiveExpiresAtMs) {
    if (context == null || appPath == null || appPath.trim().isEmpty()) return;
    SharedPreferences.Editor editor =
        context
            .getApplicationContext()
            .getSharedPreferences(CALL_ROUTE_PREFS, android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(PENDING_PATH_KEY, appPath.trim())
            .putLong(PENDING_AT_KEY, System.currentTimeMillis());
    if (payload != null && payload.isValid()) {
      editor
          .putString(PENDING_CALL_ID_KEY, payload.callId)
          .putString(PENDING_ROOM_ID_KEY, payload.roomId)
          .putString(PENDING_MEDIA_TYPE_KEY, payload.callType)
          .putString(PENDING_CALLER_NAME_KEY, payload.callerName);
    }
    if (effectiveExpiresAtMs > 0L) {
      editor.putLong(PENDING_EXPIRES_AT_KEY, effectiveExpiresAtMs);
    }
    editor.apply();
    String callId = payload != null ? payload.callId : null;
    DibayCallPushLog.info("pending_route_saved", callId, "path=" + appPath.trim());
  }

  private static void copyStringPref(android.os.Bundle out, SharedPreferences prefs, String key) {
    String value = prefs.getString(key, null);
    if (value != null && !value.trim().isEmpty()) out.putString(key, value.trim());
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
    registerPlugin(com.dibay.app.call.CallPermissionPlugin.class);
    registerPlugin(com.dibay.app.call.DibayCallAudioRoutePlugin.class);
    registerPlugin(com.dibay.app.call.NativeCallServicePlugin.class);
    SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
    injectBootMetricOnCreate();
    super.onCreate(savedInstanceState);
    splashScreen.setKeepOnScreenCondition(
        () -> {
          if (webSplashDismissRequested) return false;
          long elapsed = SystemClock.elapsedRealtime() - splashKeepStartElapsedMs;
          if (elapsed >= SPLASH_MAX_KEEP_MS) {
            requestWebSplashDismiss("native_fallback_elapsed_ms=" + elapsed);
            return false;
          }
          return true;
        });
    webSafeAreaBridge = new DibayWebSafeAreaBridge(this);
    webSafeAreaBridge.attach();
    Log.i(WEBVIEW_LOG_TAG, "app_start package=" + getPackageName());
    String serverOrigin = DibayServerOrigin.resolve(this);
    Log.i(WEBVIEW_LOG_TAG, "capacitor_server_url=" + (serverOrigin != null ? serverOrigin : "(missing)"));
    if (serverOrigin != null && isForbiddenCapacitorServerUrl(serverOrigin)) {
      Log.e(
          WEBVIEW_LOG_TAG,
          "capacitor_server_url_forbidden url="
              + serverOrigin
              + " — rebuild with npm run cap:sync:vercel");
    }
    webViewPermissionDelegate = new DibayWebViewPermissionDelegate(this);
    attachDibayWebChromeClient();
    attachDibayWebViewClient();
    ensureWebViewLoadErrorOverlay();
    logNativeAuthBootState();
    handleNotificationLaunchIntent(getIntent());
  }

  @Override
  public void onStart() {
    super.onStart();
    appVisible = true;
    activeInstance = this;
    attachDibayWebChromeClient();
    attachDibayWebViewClient();
  }

  @Override
  public void onResume() {
    super.onResume();
    appVisible = true;
    activeInstance = this;
    attachDibayWebChromeClient();
    attachDibayWebViewClient();
    if (webSafeAreaBridge != null) {
      webSafeAreaBridge.refreshIfPossible();
    }
    flushPendingAppPathIfAny();
    scheduleFlushPendingTerminalEvents();
    String callId = DibayActiveCallSessionManager.getActiveCallId();
    if (callId != null && !callId.isEmpty()) {
      CallScreenStateReceiver.register(this);
      DibayActiveCallSessionManager.onAppForeground(this, callId);
    }
  }

  @Override
  public void onStop() {
    appVisible = false;
    if (activeInstance == this) activeInstance = null;
    String callId = DibayActiveCallSessionManager.getActiveCallId();
    if (callId != null && !callId.isEmpty() && DibayActiveCallSessionManager.isConnected()) {
      DibayActiveCallSessionManager.onAppBackground(callId);
    }
    super.onStop();
  }

  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    tryEnterVideoCallPip();
  }

  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode);
    String callId = DibayActiveCallSessionManager.getActiveCallId();
    if (callId == null || callId.isEmpty()) return;
    if (isInPictureInPictureMode) {
      DibayActiveCallSessionManager.onPipEntered(callId);
    } else {
      DibayActiveCallSessionManager.onPipExited(callId);
    }
  }

  /** Video active call — system PiP when home/back; failure must not end call */
  private void tryEnterVideoCallPip() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    String callId = DibayActiveCallSessionManager.getActiveCallId();
    if (callId == null || callId.isEmpty() || !DibayActiveCallSessionManager.isConnected()) return;
    if (!"video".equalsIgnoreCase(DibayActiveCallSessionManager.getMediaType())) return;
    if (isInPictureInPictureMode()) return;
    try {
      PictureInPictureParams params =
          new PictureInPictureParams.Builder().setAspectRatio(new Rational(9, 16)).build();
      enterPictureInPictureMode(params);
    } catch (Exception e) {
      Log.w("DIBAY_CALL", "active_call_pip_enter_failed callId=" + callId, e);
      DibayCallLog.once("active_call_pip_enter_failed", callId, "err=" + e.getClass().getSimpleName());
    }
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
    webView.setBackgroundColor(WEBVIEW_BACKGROUND_COLOR);
    webView.setWebChromeClient(new DibayDelegatingWebChromeClient(existing, webViewPermissionDelegate));
    dibayWebChromeClientAttached = true;
    Log.i("DIBAY_WebPerm", "delegating_web_chrome_client_attached");
  }

  private void attachDibayWebViewClient() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    if (dibayWebViewClientAttached) return;
    BridgeWebViewClient existing = bridge.getWebViewClient();
    if (existing instanceof DibayBridgeWebViewClient) {
      dibayWebViewClientAttached = true;
      return;
    }
    DibayBridgeWebViewClient client =
        new DibayBridgeWebViewClient(
            bridge,
            new DibayBridgeWebViewClient.LoadMonitor() {
              @Override
              public void onMainFramePageStarted(String url) {
                MainActivity.this.onWebViewMainFrameStarted(url);
              }

              @Override
              public void onMainFramePageFinished(String url) {
                MainActivity.this.onWebViewMainFrameFinished(url);
              }

              @Override
              public void onMainFrameLoadFailed(String url, String reason) {
                MainActivity.this.onWebViewMainFrameFailed(url, reason);
              }
            });
    bridge.setWebViewClient(client);
    WebView webView = bridge.getWebView();
    if (webView != null) {
      webView.setBackgroundColor(WEBVIEW_BACKGROUND_COLOR);
      attachDibayBootBridge(webView);
    }
    dibayWebViewClientAttached = true;
    Log.i(WEBVIEW_LOG_TAG, "dibay_bridge_webview_client_attached");
  }

  private void onWebViewMainFrameStarted(String url) {
    mainHandler.post(
        () -> {
          mainFrameLoadFinished = false;
          lastMainFrameLoadFailure = null;
          pendingMainFrameUrl = url;
          hideWebViewLoadErrorOverlay();
          mainHandler.removeCallbacks(webViewLoadTimeoutRunnable);
          mainHandler.postDelayed(webViewLoadTimeoutRunnable, WEBVIEW_LOAD_TIMEOUT_MS);
          injectBootMetricField("nativeStart");
          injectBootMetricField("webviewReady");
          Log.i(WEBVIEW_LOG_TAG, "onPageStarted url=" + (url != null ? url : ""));
        });
  }

  private void onWebViewMainFrameFinished(String url) {
    mainHandler.post(
        () -> {
          mainFrameLoadFinished = true;
          pendingMainFrameUrl = url;
          mainHandler.removeCallbacks(webViewLoadTimeoutRunnable);
          hideWebViewLoadErrorOverlay();
          injectBootMetricField("firstHtml");
          requestWebSplashDismiss("first_html");
          Log.i(WEBVIEW_LOG_TAG, "onPageFinished url=" + (url != null ? url : ""));
          if (webSafeAreaBridge != null) {
            webSafeAreaBridge.refreshIfPossible();
          }
        });
  }

  /** Web 또는 native fallback — splash overlay 해제. */
  public static void requestWebSplashDismiss(String source) {
    if (webSplashDismissRequested) return;
    webSplashDismissRequested = true;
    splashDismissSource = source != null ? source : "unknown";
    Log.i(WEBVIEW_LOG_TAG, "dismissSplash success source=" + splashDismissSource);
  }

  private void injectBootMetricOnCreate() {
    webSplashDismissRequested = false;
    splashDismissSource = "none";
    splashKeepStartElapsedMs = SystemClock.elapsedRealtime();
  }

  private void attachDibayBootBridge(WebView webView) {
    if (dibayBootBridgeAttached) return;
    webView.addJavascriptInterface(new DibayBootJsBridge(), "DibayBootBridge");
    dibayBootBridgeAttached = true;
  }

  private final class DibayBootJsBridge {
    @JavascriptInterface
    public void dismissSplash() {
      mainHandler.post(
          () -> {
            Log.i(WEBVIEW_LOG_TAG, "dismissSplash start bridge_js");
            requestWebSplashDismiss("DibayBootBridge");
          });
    }
  }

  private void injectBootMetricField(String field) {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    String safeField = field.replaceAll("[^a-zA-Z]", "");
    String js =
        "(function(){try{var n=performance.now();var m=window.__dibayBootMetrics||{};"
            + "window.__dibayBootMetrics=m;if(m."
            + safeField
            + "==null)m."
            + safeField
            + "=n;"
            + "window.__dibayNativeSplashDismiss=function(){"
            + "try{if(window.DibayBootBridge&&window.DibayBootBridge.dismissSplash)"
            + "window.DibayBootBridge.dismissSplash();}catch(e){}"
            + "};"
            + "}catch(e){}})();";
    webView.evaluateJavascript(js, null);
  }

  private void onWebViewMainFrameFailed(String url, String reason) {
    mainHandler.post(
        () -> {
          lastMainFrameLoadFailure = reason;
          pendingMainFrameUrl = url;
          mainHandler.removeCallbacks(webViewLoadTimeoutRunnable);
          showWebViewLoadErrorOverlay(url, reason);
        });
  }

  private void ensureWebViewLoadErrorOverlay() {
    if (webViewLoadErrorOverlay != null) return;
    ViewGroup decor = (ViewGroup) getWindow().getDecorView();
    webViewLoadErrorOverlay =
        LayoutInflater.from(this).inflate(R.layout.dibay_webview_load_error_overlay, decor, false);
    webViewLoadErrorDetail = webViewLoadErrorOverlay.findViewById(R.id.dibay_webview_error_detail);
    Button retry = webViewLoadErrorOverlay.findViewById(R.id.dibay_webview_error_retry);
    retry.setOnClickListener(v -> retryWebViewLoad());
    decor.addView(webViewLoadErrorOverlay);
  }

  private void showWebViewLoadErrorOverlay(String url, String reason) {
    ensureWebViewLoadErrorOverlay();
    if (webViewLoadErrorOverlay == null) return;
    if (webViewLoadErrorDetail != null) {
      String detail = (url != null ? url : "") + "\n" + (reason != null ? reason : "");
      webViewLoadErrorDetail.setText(detail.trim());
      webViewLoadErrorDetail.setVisibility(View.VISIBLE);
    }
    webViewLoadErrorOverlay.setVisibility(View.VISIBLE);
    Log.e(WEBVIEW_LOG_TAG, "webview_load_error_ui_shown url=" + url + " reason=" + reason);
  }

  private void hideWebViewLoadErrorOverlay() {
    if (webViewLoadErrorOverlay == null) return;
    webViewLoadErrorOverlay.setVisibility(View.GONE);
  }

  private void retryWebViewLoad() {
    Log.i(WEBVIEW_LOG_TAG, "webview_retry_clicked");
    hideWebViewLoadErrorOverlay();
    mainFrameLoadFinished = false;
    lastMainFrameLoadFailure = null;
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    String origin = DibayServerOrigin.resolve(this);
    if (origin != null && !origin.isEmpty()) {
      pendingMainFrameUrl = origin;
      webView.loadUrl(origin);
    } else {
      webView.reload();
    }
    mainHandler.removeCallbacks(webViewLoadTimeoutRunnable);
    mainHandler.postDelayed(webViewLoadTimeoutRunnable, WEBVIEW_LOAD_TIMEOUT_MS);
  }

  private static boolean isForbiddenCapacitorServerUrl(String origin) {
    if (origin == null || origin.isEmpty()) return false;
    String lower = origin.toLowerCase();
    return lower.contains("localhost")
        || lower.contains("127.0.0.1")
        || lower.contains("192.168.")
        || lower.contains("10.0.")
        || lower.contains("ngrok")
        || (lower.contains(".vercel.app") && !lower.equals("https://samarket.vercel.app"));
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (com.dibay.app.call.CallPermissionPlugin.handleCallMediaPermissionsResult(requestCode, permissions, grantResults)) {
      return;
    }
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
    Log.i("DIBAY_NOTIFY", "[notify-open] tap_received notificationId=" + notificationId);
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
    if (isCalleeAcceptCallRoute(appPath) || isCallPreviewRoute(appPath)) {
      showCallRouteLoadingOverlay();
    }
    Log.i(ROUTE_LOG_TAG, "[push-route] pending_route_saved path=" + appPath);
    flushPendingAppPathIfAny();
  }

  private static boolean isCallPreviewRoute(String appPath) {
    return appPath != null && appPath.contains("incomingPreview=1");
  }

  private void ensureCallRouteLoadingOverlay() {
    if (callRouteLoadingOverlay != null) return;
    ViewGroup decor = (ViewGroup) getWindow().getDecorView();
    callRouteLoadingOverlay =
        LayoutInflater.from(this).inflate(R.layout.dibay_call_route_loading_overlay, decor, false);
    decor.addView(callRouteLoadingOverlay);
  }

  private void showCallRouteLoadingOverlay() {
    mainHandler.post(
        () -> {
          ensureCallRouteLoadingOverlay();
          if (callRouteLoadingOverlay != null) {
            callRouteLoadingOverlay.setVisibility(View.VISIBLE);
            callRouteLoadingVisible = true;
          }
        });
  }

  private void hideCallRouteLoadingOverlay() {
    mainHandler.post(
        () -> {
          if (callRouteLoadingOverlay != null) {
            callRouteLoadingOverlay.setVisibility(View.GONE);
          }
          callRouteLoadingVisible = false;
        });
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

  private static String normalizeCalleeAcceptAppPath(String appPath) {
    if (appPath == null || !isCalleeAcceptCallRoute(appPath)) return appPath;
    String sid = extractCallSessionIdFromAppPath(appPath);
    if (sid == null || sid.isEmpty()) return appPath;
    String source = appPath.contains("source=activity") ? "activity" : "notification";
    String acceptFlag = appPath.contains("nativePrep=1") ? "nativePrep=1" : "nativeAccept=1";
    return "/community-messenger/calls/"
        + android.net.Uri.encode(sid)
        + "?action=accept&"
        + acceptFlag
        + "&mode=active&source="
        + source;
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
    hideCallRouteLoadingOverlay();
    Log.i("DIBAY_NOTIFY", "[notify-open] deeplink_consumed path=" + appPath);
    Log.i(ROUTE_LOG_TAG, "[push-route] pending_route_consumed path=" + appPath);
    if (callRoute) {
      DibayCallPushLog.info("pending_route_consumed", acceptSessionId, "path=" + appPath);
    }
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
    if (acceptRoute) {
      final String normalizedAcceptPath = normalizeCalleeAcceptAppPath(appPath);
      if (isWebViewOnAppOrigin(webView) && injectAcceptRouteViaJs(webView, normalizedAcceptPath, notificationId)) {
        clearPersistedPendingPushRoute(this);
        Log.i(ROUTE_LOG_TAG, "[push-route] webview_call_route_injected path=" + normalizedAcceptPath);
        return true;
      }
      if (loadCallRouteDirectly(webView, normalizedAcceptPath)) {
        routeInjectedForCurrentPending = true;
        pendingAppPath = null;
        pendingNotificationId = null;
        clearPersistedPendingPushRoute(this);
        hideCallRouteLoadingOverlay();
        Log.i(ROUTE_LOG_TAG, "[push-route] webview_call_route_loaded path=" + normalizedAcceptPath);
        return true;
      }
      Log.w(ROUTE_LOG_TAG, "[push-route] accept_loadUrl_failed path=" + normalizedAcceptPath);
      return false;
    }
    if (callRoute && loadCallRouteDirectly(webView, appPath)) {
      routeInjectedForCurrentPending = true;
      pendingAppPath = null;
      pendingNotificationId = null;
      clearPersistedPendingPushRoute(this);
      hideCallRouteLoadingOverlay();
      Log.i(ROUTE_LOG_TAG, "[push-route] webview_call_route_loaded path=" + appPath);
      return true;
    }
    return injectWebViewRouteViaJs(webView, appPath, notificationId);
  }

  private boolean injectAcceptRouteViaJs(WebView webView, String appPath, String notificationId) {
    if (webView == null || appPath == null || appPath.isEmpty()) return false;
    final String acceptSessionId = extractCallSessionIdFromAppPath(appPath);
    if (acceptSessionId == null || acceptSessionId.isEmpty()) return false;
    final String bootstrapJs =
        DibayIncomingCallNativeStore.buildAcceptRouteBootstrapJs(
            this, acceptSessionId, !appPath.contains("nativePrep=1"));
    webView.post(
        () ->
            webView.evaluateJavascript(
                bootstrapJs,
                ignored -> injectWebViewRouteViaJs(webView, appPath, notificationId)));
    return true;
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
        final String bootstrapJs =
            DibayIncomingCallNativeStore.buildAcceptRouteBootstrapJs(
                this, acceptSessionId, !appPath.contains("nativePrep=1"));
        webView.post(
            () ->
                webView.evaluateJavascript(
                    bootstrapJs,
                    ignored -> webView.loadUrl(loadTarget)));
        return true;
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
          String path = "/community-messenger/rooms/" + android.net.Uri.encode(segments.get(0));
          return appendEncodedQuery(path, data.getEncodedQuery());
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
