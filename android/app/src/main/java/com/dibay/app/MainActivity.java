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
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import com.getcapacitor.BridgeWebViewClient;
import android.app.PictureInPictureParams;
import android.util.Rational;
import com.dibay.app.call.CallScreenStateReceiver;
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.dibay.app.callv4.CallV4Lane;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "DIBAY_OAuth";
  private static final String WEBVIEW_LOG_TAG = "DIBAY_WebView";
  private static final long WEBVIEW_LOAD_TIMEOUT_MS = 10_000L;
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
  /** V4 accept handoff — wait for web_call_screen_ready before fallback (not a blind delay). */
  private static final long V4_ACCEPT_SCREEN_READY_WATCHDOG_MS = 4_000L;
  private static final long V4_ACCEPT_SCREEN_READY_FALLBACK_VERIFY_MS = 3_000L;
  private static volatile boolean appVisible = false;
  private static volatile MainActivity activeInstance = null;

  private static final java.util.concurrent.ConcurrentHashMap<String, PendingCallV4NativeSurface>
      PENDING_CALL_V4_NATIVE_SURFACE = new java.util.concurrent.ConcurrentHashMap<>();
  private static final java.util.concurrent.ConcurrentHashMap<String, PendingCallSurfaceOwner>
      PENDING_CALL_SURFACE_OWNER = new java.util.concurrent.ConcurrentHashMap<>();
  private static final java.util.concurrent.ConcurrentHashMap<String, PendingWebCallScreenReady>
      PENDING_WEB_CALL_SCREEN_READY = new java.util.concurrent.ConcurrentHashMap<>();

  private static final class PendingWebCallScreenReady {
    final String phase;
    final long tsMs;

    PendingWebCallScreenReady(String phase, long tsMs) {
      this.phase = phase != null ? phase : "connecting";
      this.tsMs = tsMs;
    }
  }

  private static final class PendingCallSurfaceOwner {
    final String owner;
    final String reason;
    final long tsMs;

    PendingCallSurfaceOwner(String owner, String reason, long tsMs) {
      this.owner = owner != null ? owner : "";
      this.reason = reason != null ? reason : "";
      this.tsMs = tsMs;
    }
  }

  private static final class PendingCallV4NativeSurface {
    final boolean visible;
    final String source;
    final String appVisibility;

    PendingCallV4NativeSurface(boolean visible, String source, String appVisibility) {
      this.visible = visible;
      this.source = source != null ? source : "";
      this.appVisibility = appVisibility != null ? appVisibility : "unknown";
    }
  }

  private DibayWebViewPermissionDelegate webViewPermissionDelegate;
  private String pendingAppPath = null;
  private String pendingNotificationId = null;
  private volatile boolean routeInjectedForCurrentPending = false;
  private volatile boolean dibayWebChromeClientAttached = false;
  private volatile boolean dibayWebViewClientAttached = false;
  private volatile boolean callRouteLoadingVisible = false;
  private View callRouteLoadingOverlay = null;
  private String v4AcceptDirectCallId = null;
  private Float v4AcceptWebViewAlphaBackup = null;
  private volatile boolean v4AcceptScreenReadyReceived = false;
  private volatile boolean v4AcceptHandoffFallbackUsed = false;
  private Runnable v4AcceptScreenReadyWatchdogRunnable = null;
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

  /** Foreground native pill visibility — Web banner fallback gate. */
  public static void notifyForegroundIncomingUiState(String callId, boolean visible) {
    MainActivity act = activeInstance;
    if (act == null) return;
    final String sid = callId != null ? callId.trim() : "";
    act.mainHandler.post(() -> act.injectForegroundIncomingUiEvent(sid, visible));
  }

  /** FCM foreground — WebView call bridge (V4: CallV4Provider incoming wake; V3: legacy banner). */
  static void deliverCallIncomingEvent(IncomingCallPayload payload) {
    MainActivity act = activeInstance;
    if (act == null || payload == null || !payload.isValid()) return;
    if (CallV4Lane.isTelegramLaneEnabled(act)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] v4_foreground_incoming_web_delivered callId=" + payload.callId);
    }
    act.mainHandler.post(() -> act.injectCallIncomingEvent(payload));
  }

  /** V4 — IncomingCallActivity visible surface → WebView bridge (dibay:call-v4-native-surface). */
  public static void deliverCallV4NativeIncomingSurface(
      android.content.Context context, String callId, boolean visible, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    if (!CallV4Lane.isTelegramLaneEnabled(context)) return;
    String sid = callId.trim();
    String appVisibility = resolveCallV4BridgeAppVisibility(context);
    String src = source != null ? source.trim() : "native";
    MainActivity act = activeInstance;
    if (act == null) {
      PENDING_CALL_V4_NATIVE_SURFACE.put(
          sid, new PendingCallV4NativeSurface(visible, src, appVisibility));
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_surface_bridge_queued callId="
              + sid
              + " visible="
              + visible
              + " source="
              + src);
      return;
    }
    act.mainHandler.post(() -> act.injectCallV4NativeSurfaceEvent(sid, visible, src, appVisibility));
  }

  /** V4 accept — Web call screen ready → hide native connecting surface and reveal WebView. */
  public static void onWebCallScreenReady(android.content.Context context, String callId, String phase) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String ph = phase != null && !phase.trim().isEmpty() ? phase.trim() : "connecting";
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] web_call_screen_ready callId=" + sid + " phase=" + ph);
    MainActivity act = activeInstance;
    if (act != null) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] main_activity_active_instance=present callId=" + sid);
      act.mainHandler.post(() -> act.processWebCallScreenReady(context, sid, ph));
      return;
    }
    PENDING_WEB_CALL_SCREEN_READY.put(sid, new PendingWebCallScreenReady(ph, System.currentTimeMillis()));
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] web_call_screen_ready_queued_no_main_activity callId="
            + sid
            + " activeInstance=absent");
  }

  /** V4 — atomic surface owner SSOT bridge (dibay:call-surface-owner). */
  public static void deliverCallSurfaceOwnerEvent(
      android.content.Context context, String callId, String owner, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    if (!CallV4Lane.isTelegramLaneEnabled(context)) return;
    String sid = callId.trim();
    String ownerNorm = owner != null ? owner.trim().toLowerCase() : "none";
    String src = reason != null ? reason.trim() : "native";
    long tsMs = System.currentTimeMillis();
    MainActivity act = activeInstance;
    if (act == null) {
      PENDING_CALL_SURFACE_OWNER.put(sid, new PendingCallSurfaceOwner(ownerNorm, src, tsMs));
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] surface_owner_bridge_queued callId="
              + sid
              + " owner="
              + ownerNorm
              + " reason="
              + src);
      return;
    }
    act.mainHandler.post(() -> act.injectCallSurfaceOwnerEvent(sid, ownerNorm, src, tsMs));
  }

  static String resolveCallV4BridgeAppVisibility(android.content.Context context) {
    android.content.Context app = context.getApplicationContext();
    if (DibayKeyguardHelper.isKeyguardLocked(app)) return "locked";
    if (!DibayKeyguardHelper.isInteractive(app)) return "background";
    if (isAppVisibleForIncomingCall()) return "foreground";
    return "background";
  }

  /** FCM foreground — 발신 취소를 WebView legacy call bridge 에 전달 */
  static void deliverCallCanceledEvent(String callId) {
    deliverCallTerminalEvent(null, callId, "cancelled");
  }

  /** Terminal/cancel — WebView bridge; queues when WebView unavailable. */
  public static void deliverCallTerminalEvent(android.content.Context context, String callId, String status) {
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

  /**
   * Lock/background FCM — silently inject wake call-route when WebView is already on app origin
   * so V3 can discover incoming and run missed timer (no UI bring-up).
   */
  public static void tryInjectCallWakeRoute(android.content.Context context, String appPath) {
    if (appPath == null || appPath.trim().isEmpty()) return;
    if (!appPath.startsWith("/community-messenger/calls/")) return;
    if (appPath.contains("action=accept") || appPath.contains("action=reject")) return;
    if (CallV4Lane.shouldSuppressV3CallReplay(context, appPath)) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] v3_wake_route_suppressed path=" + appPath.trim());
      return;
    }
    MainActivity act = activeInstance;
    if (act == null) return;
    final String path = appPath.trim();
    act.mainHandler.post(
        () -> {
          Bridge bridge = act.getBridge();
          if (bridge == null) return;
          WebView webView = bridge.getWebView();
          if (webView == null || !act.isWebViewOnAppOrigin(webView)) return;
          act.injectWebViewRouteViaJs(webView, path, null);
          Log.i(ROUTE_LOG_TAG, "[call-route] lock_wake_route_injected path=" + path);
        });
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
                "window.dispatchEvent(new CustomEvent('dibay:call-native-clear-pending'));",
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

  private void injectCallV4NativeSurfaceEvent(
      String callId, boolean visible, String source, String appVisibility) {
    Bridge bridge = getBridge();
    if (bridge == null || bridge.getWebView() == null) {
      PENDING_CALL_V4_NATIVE_SURFACE.put(
          callId, new PendingCallV4NativeSurface(visible, source, appVisibility));
      return;
    }
    WebView webView = bridge.getWebView();
    final String safeCallId = safeJs(callId);
    final String safeSource = safeJs(source);
    final String safeVisibility = safeJs(appVisibility);
    final String surfaceType = visible ? "fullscreen_intent" : "";
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-v4-native-surface',{detail:{callId:'"
            + safeCallId
            + "',hasNativeIncomingSurface:"
            + (visible ? "true" : "false")
            + (visible ? ",nativeSurfaceType:'fullscreen_intent'" : "")
            + ",appVisibility:'"
            + safeVisibility
            + "',source:'"
            + safeSource
            + "'}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_surface_bridge_injected callId="
            + callId
            + " visible="
            + visible
            + " source="
            + source);
  }

  private void injectCallSurfaceOwnerEvent(String callId, String owner, String reason, long tsMs) {
    Bridge bridge = getBridge();
    if (bridge == null || bridge.getWebView() == null) {
      PENDING_CALL_SURFACE_OWNER.put(
          callId, new PendingCallSurfaceOwner(owner, reason, tsMs));
      return;
    }
    WebView webView = bridge.getWebView();
    final String safeCallId = safeJs(callId);
    final String safeOwner = safeJs(owner);
    final String safeReason = safeJs(reason);
    final String js =
        "(function(){try{window.dispatchEvent(new CustomEvent('dibay:call-surface-owner',{detail:{callId:'"
            + safeCallId
            + "',owner:'"
            + safeOwner
            + "',reason:'"
            + safeReason
            + "',ts:"
            + tsMs
            + "}}));}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] surface_owner_bridge_injected callId="
            + callId
            + " owner="
            + owner
            + " reason="
            + reason);
  }

  private void flushPendingCallV4NativeSurfaceEvents() {
    if (PENDING_CALL_V4_NATIVE_SURFACE.isEmpty()) return;
    Bridge bridge = getBridge();
    if (bridge == null || bridge.getWebView() == null) return;
    for (java.util.Map.Entry<String, PendingCallV4NativeSurface> entry :
        PENDING_CALL_V4_NATIVE_SURFACE.entrySet()) {
      PendingCallV4NativeSurface pending = entry.getValue();
      injectCallV4NativeSurfaceEvent(
          entry.getKey(), pending.visible, pending.source, pending.appVisibility);
    }
    PENDING_CALL_V4_NATIVE_SURFACE.clear();
  }

  private void flushPendingCallSurfaceOwnerEvents() {
    if (PENDING_CALL_SURFACE_OWNER.isEmpty()) return;
    Bridge bridge = getBridge();
    if (bridge == null || bridge.getWebView() == null) return;
    for (java.util.Map.Entry<String, PendingCallSurfaceOwner> entry :
        PENDING_CALL_SURFACE_OWNER.entrySet()) {
      PendingCallSurfaceOwner pending = entry.getValue();
      injectCallSurfaceOwnerEvent(
          entry.getKey(), pending.owner, pending.reason, pending.tsMs);
    }
    PENDING_CALL_SURFACE_OWNER.clear();
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
    if (CallV4Lane.shouldSuppressV3CallReplay(context, appPath)) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] v3_pending_route_suppressed path=" + appPath.trim());
      return;
    }
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
    registerPlugin(com.dibay.app.call.DibayCallPipPlugin.class);
    super.onCreate(savedInstanceState);
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
    flushPendingWebCallScreenReady();
  }

  @Override
  public void onResume() {
    super.onResume();
    appVisible = true;
    activeInstance = this;
    attachDibayWebChromeClient();
    attachDibayWebViewClient();
    traceV4AcceptHandoffResume();
    traceWebViewAttachedForAcceptHandoff();
    flushPendingAppPathIfAny();
    restoreAcceptCallRouteIfNeeded();
    scheduleFlushPendingTerminalEvents();
    flushPendingCallV4NativeSurfaceEvents();
    flushPendingCallSurfaceOwnerEvents();
    flushPendingWebCallScreenReady();
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
    com.dibay.app.call.DibayCallPipPlugin plugin = com.dibay.app.call.DibayCallPipPlugin.getInstance();
    if (plugin != null) {
      plugin.emitPipModeChanged(isInPictureInPictureMode, callId);
    }
  }

  /** Bridge entry — video active call system PiP */
  public boolean requestVideoCallPipFromBridge() {
    return tryEnterVideoCallPip();
  }

  /** Video active call — system PiP when home/back; failure must not end call */
  private boolean tryEnterVideoCallPip() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
    String callId = DibayActiveCallSessionManager.getActiveCallId();
    if (callId == null || callId.isEmpty() || !DibayActiveCallSessionManager.isConnected()) return false;
    String mediaType = DibayActiveCallSessionManager.getMediaType();
    boolean isVideo = "video".equalsIgnoreCase(mediaType);
    boolean isVoice =
        "voice".equalsIgnoreCase(mediaType)
            || "audio".equalsIgnoreCase(mediaType);
    if (!isVideo && !isVoice) return false;
    if (isInPictureInPictureMode()) return true;
    try {
      Rational aspect = isVideo ? new Rational(9, 16) : new Rational(16, 9);
      PictureInPictureParams params =
          new PictureInPictureParams.Builder().setAspectRatio(aspect).build();
      boolean entered = enterPictureInPictureMode(params);
      if (!entered) {
        notifyWebPipFallbackDock(callId);
      }
      return entered;
    } catch (Exception e) {
      Log.w("DIBAY_CALL", "active_call_pip_enter_failed callId=" + callId, e);
      DibayCallLog.once("active_call_pip_enter_failed", callId, "err=" + e.getClass().getSimpleName());
      notifyWebPipFallbackDock(callId);
      return false;
    }
  }

  private void notifyWebPipFallbackDock(String callId) {
    com.dibay.app.call.DibayCallPipPlugin plugin = com.dibay.app.call.DibayCallPipPlugin.getInstance();
    if (plugin != null) {
      plugin.emitPipFallbackDock(callId);
    }
    Bridge bridge = getBridge();
    if (bridge != null && bridge.getWebView() != null) {
      bridge
          .getWebView()
          .post(
              () ->
                  bridge.eval(
                      "window.dispatchEvent(new CustomEvent('dibay:call-pip-fallback-dock'))",
                      null));
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
    dibayWebViewClientAttached = true;
    Log.i(WEBVIEW_LOG_TAG, "dibay_bridge_webview_client_attached");
  }

  private void traceV4AcceptHandoffResume() {
    if (!CallV4Lane.isTelegramLaneEnabled(this)) return;
    String callId = v4AcceptDirectCallId;
    if ((callId == null || callId.isEmpty()) && pendingAppPath != null) {
      if (CallV4Lane.isV4CalleeAcceptCallRoute(pendingAppPath)) {
        callId = extractCallSessionIdFromAppPath(pendingAppPath);
      }
    }
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] main_activity_resume callId="
            + (callId != null && !callId.isEmpty() ? callId : "none")
            + " pendingPath="
            + (pendingAppPath != null ? pendingAppPath : "none"));
  }

  private void traceWebViewAttachedForAcceptHandoff() {
    if (!CallV4Lane.isTelegramLaneEnabled(this)) return;
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    String callId = v4AcceptDirectCallId;
    if ((callId == null || callId.isEmpty()) && pendingAppPath != null) {
      if (CallV4Lane.isV4CalleeAcceptCallRoute(pendingAppPath)) {
        callId = extractCallSessionIdFromAppPath(pendingAppPath);
      }
    }
    String url = webView.getUrl();
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] webview_attached callId="
            + (callId != null && !callId.isEmpty() ? callId : "none")
            + " url="
            + (url != null ? url : "null"));
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
        });
  }

  private void onWebViewMainFrameFinished(String url) {
    mainHandler.post(
        () -> {
          mainFrameLoadFinished = true;
          pendingMainFrameUrl = url;
          mainHandler.removeCallbacks(webViewLoadTimeoutRunnable);
          hideWebViewLoadErrorOverlay();
        });
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
    noteV4AcceptDirectAttachFromIntent(intent);

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
      appPath = mapDibayDeepLinkToAppPath(getApplicationContext(), data);
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
    if (data == null || !"dibay".equals(data.getScheme())) {
      return;
    }
    String host = data.getHost();
    if (!"call".equals(host) && !"call-v4".equals(host)) {
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
    if (data == null || !"dibay".equals(data.getScheme())) {
      return;
    }
    String host = data.getHost();
    if (!"call".equals(host) && !"call-v4".equals(host)) {
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
    if (data == null || !"dibay".equals(data.getScheme())) {
      return;
    }
    String host = data.getHost();
    if (!"call".equals(host) && !"call-v4".equals(host)) {
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
    if (CallV4Lane.shouldSuppressV3CallReplay(this, appPath)) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] v3_route_nav_suppressed path=" + appPath);
      hideCallRouteLoadingOverlay();
      return;
    }
    routeInjectedForCurrentPending = false;
    pendingAppPath = appPath;
    pendingNotificationId = notificationId;
    persistPendingRoute(appPath, notificationId);
    if (CallV4Lane.isV4CalleeAcceptCallRoute(appPath)) {
      String callId = extractCallSessionIdFromAppPath(appPath);
      if (callId != null && !callId.isEmpty()) {
        beginV4AcceptDirectAttach(callId);
      }
    } else if (isCalleeAcceptCallRoute(appPath) || isCallPreviewRoute(appPath)) {
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

  private void noteV4AcceptDirectAttachFromIntent(Intent intent) {
    if (intent == null) return;
    Uri data = intent.getData();
    if (data == null || !"dibay".equals(data.getScheme()) || !"call-v4".equals(data.getHost())) return;
    if (!"accept".equals(data.getQueryParameter("action"))) return;
    java.util.List<String> segments = data.getPathSegments();
    if (segments.isEmpty()) return;
    String callId = segments.get(0);
    if (callId == null || callId.trim().isEmpty()) return;
    beginV4AcceptDirectAttach(callId.trim());
  }

  private void beginV4AcceptDirectAttach(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    if (IncomingCallActivity.isConnectingHandoffActive(callId)) {
      beginV4AcceptWarmHandoffAttach(callId.trim());
    } else {
      beginV4AcceptColdLegacyAttach(callId.trim());
    }
  }

  /** Pre-66d9e12b cold path — single MainActivity surface + loading overlay (no alpha hide / handoff). */
  private void beginV4AcceptColdLegacyAttach(String callId) {
    String acceptPath = buildV4AcceptHandoffPath(callId);
    if (acceptPath != null) {
      routeInjectedForCurrentPending = false;
      pendingAppPath = acceptPath;
      persistPendingRoute(acceptPath, null);
    }
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] main_activity_calls_v4_cold_legacy_start callId=" + callId);
    // Backward-compatible marker kept for import-guard contract; cold path no longer uses warm handoff.
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] main_activity_calls_v4_direct_start callId=" + callId);
    showCallRouteLoadingOverlay();
    flushPendingAppPathIfAny();
  }

  /** Warm only — hide WebView until web_call_screen_ready, then hand off from Connecting surface. */
  private void beginV4AcceptWarmHandoffAttach(String callId) {
    if (!callId.equals(v4AcceptDirectCallId)) {
      v4AcceptDirectCallId = callId;
      v4AcceptScreenReadyReceived = false;
      v4AcceptHandoffFallbackUsed = false;
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] main_activity_calls_v4_warm_handoff_start callId=" + callId);
    }
    hideWebViewForV4AcceptHandoff();
    scheduleV4AcceptScreenReadyWatchdog(callId);
    flushPendingAppPathIfAny();
  }

  private void scheduleV4AcceptScreenReadyWatchdog(String callId) {
    cancelV4AcceptScreenReadyWatchdog();
    if (callId == null || callId.trim().isEmpty()) return;
    if (v4AcceptDirectCallId == null || !callId.equals(v4AcceptDirectCallId)) return;
    final String sid = callId.trim();
    v4AcceptScreenReadyWatchdogRunnable = () -> onV4AcceptScreenReadyWatchdog(sid);
    mainHandler.postDelayed(v4AcceptScreenReadyWatchdogRunnable, V4_ACCEPT_SCREEN_READY_WATCHDOG_MS);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] accept_handoff_watchdog_start callId=" + sid);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] accept_screen_ready_watchdog_scheduled callId=" + sid);
  }

  private void cancelV4AcceptScreenReadyWatchdog() {
    if (v4AcceptScreenReadyWatchdogRunnable != null) {
      mainHandler.removeCallbacks(v4AcceptScreenReadyWatchdogRunnable);
      v4AcceptScreenReadyWatchdogRunnable = null;
    }
  }

  private String buildV4AcceptHandoffPath(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return "/community-messenger/calls-v4/"
        + callId.trim()
        + "?action=accept&source=native_accept";
  }

  private void onV4AcceptScreenReadyWatchdog(String callId) {
    v4AcceptScreenReadyWatchdogRunnable = null;
    if (v4AcceptScreenReadyReceived) return;
    if (v4AcceptDirectCallId == null || !v4AcceptDirectCallId.equals(callId)) return;
    String activeCallId = DibayActiveCallSessionManager.getActiveCallId();
    if (activeCallId == null || activeCallId.isEmpty() || !activeCallId.equals(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_screen_ready_watchdog_skip callId="
              + callId
              + " reason=active_call_mismatch");
      failV4AcceptHandoffNoScreenReady(callId);
      return;
    }
    if (!v4AcceptHandoffFallbackUsed) {
      String acceptPath = buildV4AcceptHandoffPath(callId);
      Bridge bridge = getBridge();
      WebView webView = bridge != null ? bridge.getWebView() : null;
      if (acceptPath != null && webView != null && loadCallRouteDirectly(webView, acceptPath)) {
        v4AcceptHandoffFallbackUsed = true;
        routeInjectedForCurrentPending = true;
        pendingAppPath = null;
        pendingNotificationId = null;
        clearPersistedPendingPushRoute(this);
        hideCallRouteLoadingOverlay();
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] accept_route_fallback_direct_load callId=" + callId);
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] accept_handoff_fallback_direct_load callId=" + callId);
        mainHandler.postDelayed(
            () -> {
              if (!v4AcceptScreenReadyReceived && callId.equals(v4AcceptDirectCallId)) {
                failV4AcceptHandoffNoScreenReady(callId);
              }
            },
            V4_ACCEPT_SCREEN_READY_FALLBACK_VERIFY_MS);
        return;
      }
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_handoff_fallback_direct_load_failed callId=" + callId);
    }
    failV4AcceptHandoffNoScreenReady(callId);
  }

  private void failV4AcceptHandoffNoScreenReady(String callId) {
    if (!IncomingCallActivity.isConnectingHandoffActive(callId)) {
      hideCallRouteLoadingOverlay();
      return;
    }
    cancelV4AcceptScreenReadyWatchdog();
    Log.e(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] accept_handoff_failed_no_screen_ready callId=" + callId);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] accept_handoff_connecting_surface_retained callId="
            + callId
            + " reason=awaiting_screen_ready");
    restoreAcceptCallRouteIfNeeded();
  }

  private void hideWebViewForV4AcceptHandoff() {
    final String callId = v4AcceptDirectCallId;
    mainHandler.post(
        () -> {
          Bridge bridge = getBridge();
          if (bridge == null) return;
          WebView webView = bridge.getWebView();
          if (webView == null) return;
          if (v4AcceptWebViewAlphaBackup == null) {
            v4AcceptWebViewAlphaBackup = webView.getAlpha();
          }
          webView.setAlpha(0f);
          Log.i(
              CallV4Lane.TAG,
              "[DIBAY_CALL_V4] hideWebViewForV4AcceptHandoff callId="
                  + (callId != null ? callId : "unknown"));
        });
  }

  private void processWebCallScreenReady(android.content.Context context, String callId, String phase) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (!IncomingCallActivity.isConnectingHandoffActive(sid)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] web_call_screen_ready_cold_legacy callId=" + sid + " phase=" + phase);
      hideCallRouteLoadingOverlay();
      return;
    }
    v4AcceptScreenReadyReceived = true;
    boolean watchdogWasActive = v4AcceptScreenReadyWatchdogRunnable != null;
    cancelV4AcceptScreenReadyWatchdog();
    if (watchdogWasActive) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_handoff_watchdog_cancelled_ready callId=" + sid);
    }
    if ("connecting".equals(phase) && !isWebViewOnCallV4Route(sid)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_handoff_deferred callId=" + sid + " reason=route_not_ready");
      restoreAcceptCallRouteIfNeeded();
      return;
    }
    if (activeInstance != this || !v4AcceptScreenReadyReceived) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_handoff_deferred callId=" + sid + " reason=handoff_preconditions");
      return;
    }
    if (v4AcceptDirectCallId == null || !sid.equals(v4AcceptDirectCallId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_handoff_deferred callId=" + sid + " reason=call_id_mismatch");
      return;
    }
    restoreWebViewAfterV4AcceptHandoff();
    if (IncomingCallConnectingSurface.handoffToWeb(context, sid, phase)) {
      clearV4AcceptHandoffStateAfterSurfaceFinish();
    } else {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_handoff_handoff_deferred callId="
              + sid
              + " reason=connecting_handoff_gate");
    }
  }

  private void flushPendingWebCallScreenReady() {
    if (PENDING_WEB_CALL_SCREEN_READY.isEmpty()) return;
    long now = System.currentTimeMillis();
    java.util.Iterator<java.util.Map.Entry<String, PendingWebCallScreenReady>> iterator =
        PENDING_WEB_CALL_SCREEN_READY.entrySet().iterator();
    while (iterator.hasNext()) {
      java.util.Map.Entry<String, PendingWebCallScreenReady> entry = iterator.next();
      PendingWebCallScreenReady pending = entry.getValue();
      if (pending == null || now - pending.tsMs > PENDING_ROUTE_TTL_MS) {
        iterator.remove();
        Log.w(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] web_call_screen_ready_pending_expired callId=" + entry.getKey());
        continue;
      }
      String callId = entry.getKey();
      String phase = pending.phase;
      iterator.remove();
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] web_call_screen_ready_pending_flush callId=" + callId);
      processWebCallScreenReady(getApplicationContext(), callId, phase);
    }
  }

  String resolveConnectingHandoffBlockReason(String callId) {
    if (callId == null || callId.trim().isEmpty()) return "empty_call_id";
    if (activeInstance != this) return "no_main_activity";
    if (!v4AcceptScreenReadyReceived) return "screen_not_ready";
    if (v4AcceptDirectCallId == null || !callId.equals(v4AcceptDirectCallId)) return "call_id_mismatch";
    if (v4AcceptWebViewAlphaBackup != null) return "webview_alpha_not_restored";
    return null;
  }

  private void clearV4AcceptHandoffStateAfterSurfaceFinish() {
    cancelV4AcceptScreenReadyWatchdog();
    v4AcceptDirectCallId = null;
    v4AcceptScreenReadyReceived = false;
    v4AcceptHandoffFallbackUsed = false;
    hideCallRouteLoadingOverlay();
  }

  private void restoreAcceptCallRouteIfNeeded() {
    if (!CallV4Lane.isTelegramLaneEnabled(this)) return;
    String callId = v4AcceptDirectCallId;
    String acceptPath = null;
    if (pendingAppPath != null && CallV4Lane.isV4CalleeAcceptCallRoute(pendingAppPath)) {
      acceptPath = pendingAppPath;
      if (callId == null || callId.isEmpty()) {
        callId = extractCallSessionIdFromAppPath(pendingAppPath);
      }
    } else if (callId != null && !callId.isEmpty()) {
      acceptPath =
          "/community-messenger/calls-v4/"
              + callId
              + "?action=accept&source=native_accept";
    }
    if (callId == null || callId.isEmpty() || acceptPath == null) return;
    if (isWebViewOnCallV4Route(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_route_restore_done callId=" + callId + " mode=already_on_route");
      scheduleV4AcceptScreenReadyWatchdog(callId);
      return;
    }
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_route_restore_start callId=" + callId);
    boolean restored = navigateWebViewToAppPathNow(acceptPath, null);
    if (restored) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_route_restore_done callId=" + callId + " mode=event_delivered");
    }
    if (!restored) {
      Log.w(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_route_restore_failed callId=" + callId);
    }
  }

  private boolean isWebViewOnCallV4Route(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    Bridge bridge = getBridge();
    if (bridge == null) return false;
    WebView webView = bridge.getWebView();
    if (webView == null) return false;
    String url = webView.getUrl();
    if (url == null || url.trim().isEmpty()) return false;
    return url.contains("/calls-v4/" + callId.trim());
  }

  private void restoreWebViewAfterV4AcceptHandoff() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    float alpha = v4AcceptWebViewAlphaBackup != null ? v4AcceptWebViewAlphaBackup : 1f;
    webView.setAlpha(alpha);
    v4AcceptWebViewAlphaBackup = null;
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] restoreWebViewAfterV4AcceptHandoff alpha=" + alpha);
  }

  private void flushPendingAppPathIfAny() {
    if (routeInjectedForCurrentPending) return;
    restorePendingRouteFromPrefsIfNeeded();
    if (pendingAppPath == null || pendingAppPath.isEmpty()) return;
    if (CallV4Lane.shouldSuppressV3CallReplay(getApplicationContext(), pendingAppPath)) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] v3_pending_flush_suppressed path=" + pendingAppPath);
      pendingAppPath = null;
      pendingNotificationId = null;
      hideCallRouteLoadingOverlay();
      getSharedPreferences(CALL_ROUTE_PREFS, android.content.Context.MODE_PRIVATE)
          .edit()
          .remove(PENDING_PATH_KEY)
          .remove(PENDING_AT_KEY)
          .remove(PENDING_CALL_ID_KEY)
          .remove(PENDING_ROOM_ID_KEY)
          .remove(PENDING_MEDIA_TYPE_KEY)
          .remove(PENDING_CALLER_NAME_KEY)
          .remove(PENDING_EXPIRES_AT_KEY)
          .apply();
      clearPersistedPendingPushRoute(this);
      return;
    }
    final String appPath = pendingAppPath;
    final String notificationId = pendingNotificationId;
    final int[] retryDelays =
        isCalleeAcceptCallRoute(appPath)
            || isCalleeRejectCallRoute(appPath)
            || CallV4Lane.isV4CalleeAcceptCallRoute(appPath)
            || CallV4Lane.isV4CalleeRejectCallRoute(appPath)
            ? ACCEPT_ROUTE_RETRY_DELAYS_MS
            : PENDING_ROUTE_RETRY_DELAYS_MS;
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
        && !appPath.startsWith("/community-messenger/calls-v4/")
        && appPath.contains("action=accept");
  }

  private static boolean isCalleeRejectCallRoute(String appPath) {
    return appPath != null
        && appPath.startsWith("/community-messenger/calls/")
        && !appPath.startsWith("/community-messenger/calls-v4/")
        && appPath.contains("action=reject");
  }

  private static String extractCallSessionIdFromAppPath(String appPath) {
    if (appPath == null || appPath.isEmpty()) return null;
    java.util.regex.Matcher matcher =
        java.util.regex.Pattern.compile("^/community-messenger/calls(?:-v4)?/([^/?#]+)").matcher(appPath);
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
    final boolean callRoute =
        CallV4Lane.isV4CallPath(appPath)
            || (appPath.startsWith("/community-messenger/calls/")
                && !CallV4Lane.isV4CallPath(appPath));
    if (callRoute && !CallV4Lane.shouldSuppressV3CallReplay(this, appPath)) {
      persistCallPendingRoute(appPath);
    }
    final String js =
        "(function(){window.dispatchEvent(new CustomEvent('"
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
    final boolean acceptRoute = isCalleeAcceptCallRoute(appPath) || CallV4Lane.isV4CalleeAcceptCallRoute(appPath);
    final boolean rejectRoute = isCalleeRejectCallRoute(appPath) || CallV4Lane.isV4CalleeRejectCallRoute(appPath);
    final boolean callRoute =
        appPath.startsWith("/community-messenger/calls/")
            || CallV4Lane.isV4CallPath(appPath);
    final boolean webReady = isWebViewOnAppOrigin(webView);
    if (CallV4Lane.isTelegramLaneEnabled(this) && CallV4Lane.shouldSuppressV3CallReplay(this, appPath)) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] v3_route_nav_blocked path=" + appPath);
      return false;
    }
    final boolean v4AcceptHandoff =
        v4AcceptDirectCallId != null
            && !v4AcceptDirectCallId.isEmpty()
            && CallV4Lane.isV4CalleeAcceptCallRoute(appPath);
    if ((acceptRoute || rejectRoute) && webReady) {
      if (rejectRoute) {
        Log.i(ROUTE_LOG_TAG, "[call-route] call_route_reject_inject_preferred path=" + appPath);
      } else {
        Log.i(ROUTE_LOG_TAG, "[call-route] call_route_inject_preferred path=" + appPath);
      }
      if (v4AcceptHandoff && acceptRoute) {
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] accept_route_inject_primary callId="
                + v4AcceptDirectCallId
                + " path="
                + appPath);
      }
      injectWebViewRouteViaJs(webView, appPath, notificationId);
      if (v4AcceptHandoff && acceptRoute) {
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] accept_route_event_delivered callId=" + v4AcceptDirectCallId);
      }
      clearPersistedPendingPushRoute(this);
      return true;
    }
    if (v4AcceptHandoff && acceptRoute) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_route_inject_primary_deferred callId="
              + v4AcceptDirectCallId
              + " reason=webview_not_on_app_origin");
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
    if (isCalleeAcceptCallRoute(appPath) || CallV4Lane.isV4CalleeAcceptCallRoute(appPath)) {
      Log.i(ROUTE_LOG_TAG, "[push-route] call_route_accept_direct_load");
    }
    webView.post(() -> webView.loadUrl(loadTarget));
    return true;
  }

  private static String mapDibayDeepLinkToAppPath(android.content.Context context, Uri data) {
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
          if (context != null && CallV4Lane.isTelegramLaneEnabled(context)) {
            Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] v3_deep_link_suppressed host=call");
            return null;
          }
          String path = "/community-messenger/calls/" + android.net.Uri.encode(segments.get(0));
          return appendEncodedQuery(path, data.getEncodedQuery());
        }
        return null;
      case "call-v4":
        if (!segments.isEmpty()) {
          String path = "/community-messenger/calls-v4/" + android.net.Uri.encode(segments.get(0));
          return appendEncodedQuery(path, data.getEncodedQuery());
        }
        return null;
      default:
        return null;
    }
  }

}
