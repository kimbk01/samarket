package com.dibay.app.call;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.DibayCallLog;
import com.dibay.app.DibayIncomingCallNativeStore;
import com.dibay.app.IncomingCallActionCoordinator;
import com.dibay.app.IncomingCallIntentHelper;
import com.dibay.app.IncomingCallNotificationBuilder;
import com.dibay.app.MainActivity;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** callId 기준 단일 Activity / notification / route launch */
public final class CallActivityRouter {
  private static final String TAG = "DIBAY_CALL";
  private static final long ROUTE_DEDUP_MS = 8_000L;
  private static final ConcurrentHashMap<String, Long> LAUNCHED_ROUTES = new ConcurrentHashMap<>();
  private static volatile String lastIncomingActivityCallId = null;
  private static volatile long lastIncomingActivityAt = 0L;

  private CallActivityRouter() {}

  public static boolean shouldLaunchIncomingActivity(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    long now = System.currentTimeMillis();
    synchronized (CallActivityRouter.class) {
      if (sid.equals(lastIncomingActivityCallId) && now - lastIncomingActivityAt < ROUTE_DEDUP_MS) {
        DibayCallLog.once("duplicate_activity_blocked", sid, "source=incoming_activity");
        Log.i(TAG, "[DIBAY_CALL] duplicate_activity_blocked callId=" + sid + " source=incoming_activity");
        return false;
      }
      lastIncomingActivityCallId = sid;
      lastIncomingActivityAt = now;
      return true;
    }
  }

  public static boolean shouldLaunchAcceptRoute(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    long now = System.currentTimeMillis();
    Long prev = LAUNCHED_ROUTES.putIfAbsent(sid, now);
    if (prev != null && now - prev < ROUTE_DEDUP_MS) {
      DibayCallLog.once("route_latch_rejected", sid, "source=native_router");
      Log.i(TAG, "[DIBAY_CALL] route_latch_rejected callId=" + sid);
      DibayCallLog.once("duplicate_activity_blocked", sid, "source=accept_route");
      return false;
    }
    LAUNCHED_ROUTES.put(sid, now);
    DibayCallLog.once("route_latch_claimed", sid, "source=native_router");
    return true;
  }

  /** native accept prep — FGS 시작·알림 정리 (PATCH 없음) */
  public static void onNativeAcceptPrep(Context context, String callId, String callKind) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    IncomingCallActionCoordinator.cancelMissedTimeout(sid);
    DibayIncomingCallNativeStore.markState(context, sid, DibayIncomingCallNativeStore.STATE_CONNECTING);
    DibayCallLog.once("native_accept_start", sid, "source=router");
    IncomingCallNotificationBuilder.dismissIncomingCall(context, sid);
    CallForegroundService.start(context.getApplicationContext(), sid, callKind, "ringing");
    DibayCallLog.once("native_accept_success", sid, "source=router");
    DibayCallLog.once("call_service_start", sid, "phase=accept_prep");
  }

  public static void launchWebAcceptRoute(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (!shouldLaunchAcceptRoute(sid)) return;
    Intent launch = IncomingCallIntentHelper.buildMainActivityCallAcceptIntent(context, sid);
    context.getApplicationContext().startActivity(launch);
    Log.i(TAG, "[DIBAY_CALL] route_open callId=" + sid);
  }

  public static void clearRouteLatch(String callId) {
    if (callId == null) return;
    String sid = callId.trim();
    if (sid.isEmpty()) return;
    LAUNCHED_ROUTES.remove(sid);
    DibayCallLog.once("route_latch_cleared", sid, "source=native_router");
    synchronized (CallActivityRouter.class) {
      if (sid.equals(lastIncomingActivityCallId)) {
        lastIncomingActivityCallId = null;
        lastIncomingActivityAt = 0L;
      }
    }
  }
}
