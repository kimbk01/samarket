package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.callv4.CallRuntimeV4;
import com.dibay.app.callv4.CallV4IntentHelper;
import com.dibay.app.callv4.CallV4Lane;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Single-flight guard for native incoming call accept/decline actions. */
public final class IncomingCallActionCoordinator {
  private static final String TAG = "DIBAY_CALL_FLOW";
  private static final String CALL_TAG = "DIBAY_INCOMING_CALL";
  private static final long TTL_MS = 60_000L;
  private static final long DEFAULT_RING_TIMEOUT_MS = 30_000L;
  private static final ConcurrentHashMap<String, Long> IN_FLIGHT = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Long> ACTIVE_INCOMING = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, String> COMPLETED_ACTIONS = new ConcurrentHashMap<>();

  private static final long ACCEPT_LAUNCH_DEDUP_MS = 8_000L;
  private static volatile String lastAcceptLaunchCallId = null;
  private static volatile long lastAcceptLaunchAt = 0L;

  private IncomingCallActionCoordinator() {}

  public static boolean registerIncoming(Context context, String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    cleanupExpired();
    String sid = callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-flow] consumed_incoming_blocked callId=" + sid);
      return false;
    }
    if (COMPLETED_ACTIONS.containsKey(sid)) {
      Log.i(TAG, "[call-flow] duplicate_completed_incoming_blocked callId=" + sid);
      return false;
    }
    Long prev = ACTIVE_INCOMING.putIfAbsent(sid, System.currentTimeMillis());
    if (prev != null) {
      Log.i(TAG, "[call-flow] duplicate_incoming_blocked callId=" + callId);
      return false;
    }
    return true;
  }

  public static boolean isCompleted(String callId) {
    return callId != null && COMPLETED_ACTIONS.containsKey(callId.trim());
  }

  public static boolean tryBegin(String callId, String action) {
    if (callId == null || callId.trim().isEmpty()) return false;
    if (action == null || action.trim().isEmpty()) return false;
    cleanupExpired();
    String sid = callId.trim();
    if (COMPLETED_ACTIONS.containsKey(sid)) {
      Log.i(TAG, "[call-flow] duplicate_terminal_action_blocked callId=" + sid + " action=" + action);
      return false;
    }
    String key = sid + ":terminal";
    long now = System.currentTimeMillis();
    Long prev = IN_FLIGHT.putIfAbsent(key, now);
    if (prev != null) {
      Log.i(TAG, "[call-flow] duplicate_" + action + "_blocked callId=" + callId);
      return false;
    }
    return true;
  }

  public static void end(String callId, String action) {
    if (callId == null || action == null) return;
    IN_FLIGHT.remove(callId.trim() + ":terminal");
  }

  public static void complete(String callId, String action) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    COMPLETED_ACTIONS.put(sid, action != null ? action : "terminal");
    ACTIVE_INCOMING.remove(sid);
    IN_FLIGHT.remove(sid + ":terminal");
  }

  public static void handleAccept(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (CallV4Lane.isTelegramLaneEnabled(context)) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] coordinator_accept_enter callId=" + sid);
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] coordinator_accept_call_id callId=" + sid);
    }
    if (!tryBegin(sid, "accept")) return;
    final Context app = context.getApplicationContext();
    final boolean v4Lane = CallV4Lane.isTelegramLaneEnabled(app);
    if (v4Lane) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_start callId=" + sid);
      IncomingCallSurfaceOwner.transitionIncomingOwner(
          app, sid, IncomingCallSurfaceOwner.SurfaceOwner.ACCEPTED_TRANSITION, "native_accept");
    } else {
      DibayCallLog.once("accept_start", sid, "source=native_pending_web");
      Log.i(CALL_TAG, "[call-state] accept_pending_web callId=" + sid);
    }
    DibayCallConsumedStore.mark(context, sid, "accepted");
    IncomingCallRingOwner.stop(context, sid);
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=accept");
    CallForegroundService.stopRinging(context, sid, "accept");
    DibayIncomingCallNativeStore.markState(context, sid, DibayIncomingCallNativeStore.STATE_CONNECTING);
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    if (!shouldLaunchAcceptRoute(sid)) {
      Log.i(CALL_TAG, "[call-route] incoming_accept_launch_deduped callId=" + sid);
      end(sid, "accept");
      return;
    }
    new Handler(Looper.getMainLooper())
        .post(
            () -> {
              if (CallV4Lane.isTelegramLaneEnabled(app)) {
                Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_intercepted callId=" + sid);
                CallRuntimeV4.openFromNativeStore(app, sid, "native_accept");
                Intent launch = CallV4IntentHelper.buildMainActivityV4AcceptIntent(app, sid, "native_accept");
                Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] main_activity_v4_accept_start callId=" + sid);
                app.startActivity(launch);
                end(sid, "accept");
                return;
              }
              Intent launch = IncomingCallIntentHelper.buildMainActivityCallAcceptIntent(app, sid);
              Log.i("DIBAY_CALL", "[DIBAY_CALL] accept_signal_sent callId=" + sid);
              Log.i(CALL_TAG, "[call-route] incoming_accept_pending_web callId=" + sid);
              app.startActivity(launch);
              end(sid, "accept");
            });
  }

  public static void handleReject(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (!tryBegin(sid, "reject")) return;
    DibayCallLog.once("call_end", sid, "source=native_reject");
    DibayCallConsumedStore.mark(context, sid, "declined");
    IncomingCallRingOwner.stop(context, sid);
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=reject");
    CallForegroundService.stopRinging(context, sid, "reject");
    DibayIncomingCallNativeStore.clear(context, sid, "reject");
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    final Context app = context.getApplicationContext();
    if (CallV4Lane.isTelegramLaneEnabled(app)) {
      IncomingCallSurfaceOwner.clearOwner(app, sid, "reject");
    }
    IncomingCallTerminalHandler.finishIncomingUiOnly(context, sid);
    Log.i("DIBAY_CALL", "[DIBAY_CALL] reject_signal_sent callId=" + sid);
    complete(sid, "reject");
    new Handler(Looper.getMainLooper())
        .post(
            () -> {
              Intent launch;
              if (CallV4Lane.isTelegramLaneEnabled(app)) {
                Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] reject_start callId=" + sid);
                Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] reject_route callId=" + sid);
                launch = CallV4IntentHelper.buildMainActivityV4RejectIntent(app, sid, "native_reject");
              } else {
                launch = IncomingCallIntentHelper.buildMainActivityCallRejectIntent(app, sid);
                Log.i(CALL_TAG, "[call-route] incoming_reject_pending_web callId=" + sid);
              }
              app.startActivity(launch);
              end(sid, "reject");
            });
  }

  public static void scheduleMissedTimeout(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    long delayMs = resolveTimeoutDelayMs(payload.expiresAt);
    new Handler(Looper.getMainLooper())
        .postDelayed(() -> handleMissedTimeout(context.getApplicationContext(), payload), delayMs);
  }

  public static void handleMissedTimeout(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String sid = payload.callId.trim();
    if (COMPLETED_ACTIONS.containsKey(sid)) return;
    if (!tryBegin(sid, "missed")) return;
    DibayCallLog.once("ring_timeout", sid);
    Log.i(CALL_TAG, "[call-state] missed_timeout callId=" + sid);
    DibayCallConsumedStore.mark(context, sid, "missed");
    IncomingCallRingOwner.stop(context, sid);
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=missed");
    CallForegroundService.stopRinging(context, sid, "missed");
    DibayIncomingCallNativeStore.clear(context, sid, "missed");
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    complete(sid, "missed");
    MainActivity.deliverCallTerminalEvent(context.getApplicationContext(), sid, "missed");
    MissedCallNotificationHelper.show(
        context.getApplicationContext(),
        "부재중 통화",
        payload.callerName != null ? payload.callerName + "님의 부재중 통화" : "",
        FcmPayloadResolver.resolveMissedCallRoute(payload.callId, payload.roomId),
        payload.callId,
        payload.roomId,
        "missed:" + payload.callId);
  }

  private static boolean shouldLaunchAcceptRoute(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    long now = System.currentTimeMillis();
    synchronized (IncomingCallActionCoordinator.class) {
      if (sid.equals(lastAcceptLaunchCallId) && now - lastAcceptLaunchAt < ACCEPT_LAUNCH_DEDUP_MS) {
        return false;
      }
      lastAcceptLaunchCallId = sid;
      lastAcceptLaunchAt = now;
      return true;
    }
  }

  private static void cleanupExpired() {
    long now = System.currentTimeMillis();
    for (Map.Entry<String, Long> entry : IN_FLIGHT.entrySet()) {
      if (now - entry.getValue() > TTL_MS) {
        IN_FLIGHT.remove(entry.getKey(), entry.getValue());
      }
    }
    for (Map.Entry<String, Long> entry : ACTIVE_INCOMING.entrySet()) {
      if (now - entry.getValue() > TTL_MS) {
        ACTIVE_INCOMING.remove(entry.getKey(), entry.getValue());
      }
    }
  }

  private static long resolveTimeoutDelayMs(String expiresAt) {
    if (expiresAt == null || expiresAt.trim().isEmpty()) return DEFAULT_RING_TIMEOUT_MS;
    try {
      long expiresMs;
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        expiresMs = java.time.Instant.parse(expiresAt.trim()).toEpochMilli();
      } else {
        java.text.SimpleDateFormat iso =
            new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
        iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        String normalized = expiresAt.contains(".") ? expiresAt : expiresAt.replace("Z", ".000Z");
        expiresMs = iso.parse(normalized).getTime();
      }
      return Math.max(1_000L, Math.min(DEFAULT_RING_TIMEOUT_MS, expiresMs - System.currentTimeMillis()));
    } catch (Exception e) {
      return DEFAULT_RING_TIMEOUT_MS;
    }
  }
}
