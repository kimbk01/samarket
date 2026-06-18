package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Single-flight guard for native incoming call accept/decline actions. */
public final class IncomingCallActionCoordinator {
  private static final String TAG = "DIBAY_CALL_FLOW";
  private static final String CALL_TAG = "DIBAY_INCOMING_CALL";
  private static final long TTL_MS = 60_000L;
  private static final long DEFAULT_RING_TIMEOUT_MS = 45_000L;
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
      logActionGuard(sid, action, false, true);
      return false;
    }
    String key = sid + ":terminal";
    long now = System.currentTimeMillis();
    Long prev = IN_FLIGHT.putIfAbsent(key, now);
    if (prev != null) {
      Log.i(TAG, "[call-flow] duplicate_" + action + "_blocked callId=" + callId);
      logActionGuard(sid, action, false, true);
      return false;
    }
    logActionGuard(sid, action, true, false);
    return true;
  }

  private static void logActionGuard(String callId, String action, boolean singleFlight, boolean duplicateIgnored) {
    Log.i(
        "DIBAY_CALL",
        "[DIBAY_CALL] incoming_action_guard"
            + " callId="
            + callId
            + " action="
            + action
            + " singleFlight="
            + singleFlight
            + " duplicateIgnored="
            + duplicateIgnored);
  }

  private static void logIncomingCleanup(
      String callId, String reason, boolean ringStopped, boolean serviceStopped, boolean notificationCancelled, boolean activityFinished) {
    Log.i(
        "DIBAY_CALL",
        "[DIBAY_CALL] incoming_cleanup"
            + " callId="
            + callId
            + " reason="
            + reason
            + " ringStopped="
            + ringStopped
            + " serviceStopped="
            + serviceStopped
            + " notificationCancelled="
            + notificationCancelled
            + " activityFinished="
            + activityFinished);
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
    if (!tryBegin(sid, "accept")) return;
    if (!IncomingCallSessionMachine.tryBeginAccepting(sid, "coordinator")) return;
    DibayCallLog.once("accept_start", sid, "source=native_pending_web");
    Log.i(CALL_TAG, "[call-state] accept_pending_web callId=" + sid);
    DibayCallConsumedStore.mark(context, sid, "accepted");
    IncomingCallRingOwner.stopWithReason(
        context, sid, IncomingCallCleanupReason.ACCEPTED, "accept", "coordinator");
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=accepted");
    CallForegroundService.stopRinging(context, sid, "accepted");
    DibayIncomingCallNativeStore.markState(context, sid, DibayIncomingCallNativeStore.STATE_CONNECTING);
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    IncomingCallSessionMachine.onAccepted(sid, "coordinator");
    IncomingCallSessionMachine.logIncomingCleanup(
        sid, IncomingCallCleanupReason.ACCEPTED, "coordinator", true, true, true, false);
    if (!shouldLaunchAcceptRoute(sid)) {
      Log.i(CALL_TAG, "[call-route] incoming_accept_launch_deduped callId=" + sid);
      end(sid, "accept");
      return;
    }
    final Context app = context.getApplicationContext();
    new Thread(
            () -> {
              boolean ok = CallSessionPatchHelper.patch(app, sid, "accept");
              Log.i(
                  "DIBAY_CALL",
                  ok
                      ? "[DIBAY_CALL] accept_patch_done callId=" + sid
                      : "[DIBAY_CALL] accept_patch_failed callId=" + sid);
              new Handler(Looper.getMainLooper())
                  .post(
                      () -> {
                        Intent launch = IncomingCallIntentHelper.buildMainActivityCallAcceptIntent(app, sid);
                        Log.i("DIBAY_CALL", "[DIBAY_CALL] accept_route_direct callId=" + sid);
                        Log.i(CALL_TAG, "[call-route] incoming_accept_pending_web callId=" + sid);
                        app.startActivity(launch);
                        end(sid, "accept");
                      });
            })
        .start();
  }

  public static void handleReject(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (!tryBegin(sid, "reject")) return;
    if (!IncomingCallSessionMachine.tryBeginRejecting(sid, "coordinator")) return;
    DibayCallLog.once("call_end", sid, "source=native_reject");
    DibayCallConsumedStore.mark(context, sid, "declined");
    IncomingCallRingOwner.stopWithReason(
        context, sid, IncomingCallCleanupReason.REJECTED, "reject", "coordinator");
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=rejected");
    CallForegroundService.stopRinging(context, sid, "rejected");
    DibayIncomingCallNativeStore.clear(context, sid, "rejected");
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    IncomingCallTerminalHandler.finishIncomingUiOnly(context, sid);
    IncomingCallSessionMachine.onRejected(sid, "coordinator");
    IncomingCallSessionMachine.logIncomingCleanup(
        sid, IncomingCallCleanupReason.REJECTED, "coordinator", true, true, true, true);
    Log.i("DIBAY_CALL", "[DIBAY_CALL] reject_patch_start callId=" + sid);
    final Context app = context.getApplicationContext();
    new Thread(
            () -> {
              boolean ok = CallSessionPatchHelper.patch(app, sid, "reject");
              if (ok) {
                Log.i("DIBAY_CALL", "[DIBAY_CALL] reject_patch_done callId=" + sid);
                Log.i(CALL_TAG, "[call-state] reject_success callId=" + sid);
                complete(sid, "reject");
              } else {
                Log.w("DIBAY_CALL", "[DIBAY_CALL] reject_patch_failed callId=" + sid);
                complete(sid, "reject");
              }
              new Handler(Looper.getMainLooper())
                  .post(() -> MainActivity.deliverCallTerminalEvent(app, sid, "rejected"));
            })
        .start();
  }

  private static final long MISSED_PROBE_RETRY_MS = 5_000L;
  private static final int MISSED_PROBE_MAX_RETRIES = 3;
  private static final ConcurrentHashMap<String, Integer> MISSED_PROBE_RETRIES = new ConcurrentHashMap<>();

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
    if (!IncomingCallSessionMachine.canApplyMissedTimeout(sid)) {
      Log.w(CALL_TAG, "[call-state] missed_timeout_ignored_phase callId=" + sid);
      return;
    }
    IncomingCallSessionStatusProbe.ProbeResult probe = IncomingCallSessionStatusProbe.probe(context, sid);
    if (!probe.ok) {
      IncomingCallSessionStatusProbe.logProbeDeferred(sid, "missed_timeout", probe.failureDetail);
      scheduleMissedProbeRetry(context, payload);
      return;
    }
    if (IncomingCallSessionStatusProbe.isTerminalStatus(probe.status)) {
      Log.i(CALL_TAG, "[call-state] missed_timeout_skipped_terminal callId=" + sid + " status=" + probe.status);
      MISSED_PROBE_RETRIES.remove(sid);
      return;
    }
    if (IncomingCallSessionStatusProbe.isActiveStatus(probe.status)) {
      Log.i(CALL_TAG, "[call-state] missed_timeout_skipped_active callId=" + sid);
      MISSED_PROBE_RETRIES.remove(sid);
      return;
    }
    if (!IncomingCallSessionStatusProbe.statusAllowsCleanup(
        IncomingCallCleanupReason.MISSED_TIMEOUT, probe.status)) {
      Log.w(
          CALL_TAG,
          "[call-state] missed_timeout_blocked_server_status callId=" + sid + " status=" + probe.status);
      return;
    }
    MISSED_PROBE_RETRIES.remove(sid);
    if (!tryBegin(sid, "missed")) return;
    DibayCallLog.once("ring_timeout", sid);
    Log.i(CALL_TAG, "[call-state] missed_timeout callId=" + sid);
    IncomingCallSessionMachine.onMissed(sid, "timeout");
    DibayCallConsumedStore.mark(context, sid, "missed");
    IncomingCallRingOwner.stopWithReason(
        context, sid, IncomingCallCleanupReason.MISSED_TIMEOUT, "missed_timeout", "coordinator");
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=missed_timeout");
    CallForegroundService.stopRinging(context, sid, "missed_timeout");
    DibayIncomingCallNativeStore.clear(context, sid, "missed_timeout");
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    IncomingCallTerminalHandler.finishIncomingUiOnly(context, sid);
    IncomingCallSessionMachine.logIncomingCleanup(
        sid, IncomingCallCleanupReason.MISSED_TIMEOUT, "timeout", true, true, true, true);
    new Thread(
            () -> {
              boolean ok = CallSessionPatchHelper.patch(context.getApplicationContext(), sid, "missed");
              if (ok) complete(sid, "missed");
              else end(sid, "missed");
              MissedCallNotificationHelper.show(
                  context.getApplicationContext(),
                  "부재중 통화",
                  payload.callerName != null ? payload.callerName + "님의 부재중 통화" : "",
                  FcmPayloadResolver.resolveMissedCallRoute(payload.callId, payload.roomId),
                  payload.callId,
                  payload.roomId,
                  "missed:" + payload.callId);
            })
        .start();
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

  private static void scheduleMissedProbeRetry(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String sid = payload.callId.trim();
    int attempt = MISSED_PROBE_RETRIES.merge(sid, 1, Integer::sum);
    if (attempt > MISSED_PROBE_MAX_RETRIES) {
      Log.w(CALL_TAG, "[call-state] missed_probe_retry_exhausted callId=" + sid);
      MISSED_PROBE_RETRIES.remove(sid);
      return;
    }
    new Handler(Looper.getMainLooper())
        .postDelayed(
            () -> handleMissedTimeout(context.getApplicationContext(), payload), MISSED_PROBE_RETRY_MS);
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
