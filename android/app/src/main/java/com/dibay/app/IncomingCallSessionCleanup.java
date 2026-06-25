package com.dibay.app;

import android.content.Context;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.callv4.CallV4Lane;

/**
 * callId-scoped incoming session purge — terminal, reject, missed, stale-before-next-call.
 *
 * <p>BUNDLE: call-v4-incoming-fsi-fallback — see scripts/call-v4-incoming-fsi-fallback-manifest.json.
 * Callers outside manifest sessionCleanupCallers are forbidden (verify boundary).
 *
 * <p>Contract: terminal/cancel/decline/missed must clear visible flag, owner, pending presentation,
 * notification, ring, launch verify, and finish {@link IncomingCallActivity} so the next callId
 * never reuses a stale singleTask instance via {@code onNewIntent} alone.
 */
public final class IncomingCallSessionCleanup {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  static final long FRESH_LAUNCH_DELAY_MS = 400L;

  private IncomingCallSessionCleanup() {}

  /** Full presentation teardown for one callId (terminal / reject / missed / QA cancel). */
  public static void purgeCallPresentation(Context context, String callId, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    Context app = context.getApplicationContext();
    String r = reason != null ? reason.trim() : "purge";

    if ("missed".equals(r) && IncomingCallActionCoordinator.shouldSuppressMissedTimeout(app, sid)) {
      Log.i(TAG, "[call-ui] incoming_session_purge_blocked callId=" + sid + " reason=missed");
      IncomingCallActionCoordinator.cancelMissedTimeout(sid);
      return;
    }

    IncomingCallActionCoordinator.cancelMissedTimeout(sid);
    IncomingCallBackgroundNotifier.cancelLaunchVisibilityVerify(sid);
    PendingIncomingPresentation.remove(sid);
    IncomingCallNotificationBuilder.dismissIncomingCall(app, sid);
    IncomingCallRingOwner.stop(app, sid);
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=" + r + " source=session_cleanup");
    CallForegroundService.stopRinging(app, sid, r);
    DibayIncomingCallNativeStore.clear(app, sid, r);
    IncomingCallSurfaceOwner.clearOwner(app, sid, r);
    IncomingCallActivity.clearVisibleFlag(sid);
    com.dibay.app.call.CallActivityRouter.clearRouteLatch(sid);
    ForegroundIncomingCallRegistry.clear(sid);
    IncomingCallWakeLock.release();
    IncomingCallActivity.finishAnyActiveInstance(r);
    IncomingCallActivity.finishActiveForCallId(app, sid, r);
    IncomingCallActivity.finishAllIncomingTasks(app, r);

    if (CallV4Lane.isTelegramLaneEnabled(app)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_session_purged callId=" + sid + " reason=" + r);
    }
    Log.i(TAG, "[call-ui] incoming_session_purged callId=" + sid + " reason=" + r);
  }

  /**
   * Before Policy B Activity launch — finish any lingering {@link IncomingCallActivity} and drop
   * stale visible flags. Returns true when launch must be delayed until {@link #FRESH_LAUNCH_DELAY_MS}.
   */
  public static boolean prepareFreshActivityLaunch(Context context, String nextCallId) {
    if (nextCallId == null || nextCallId.trim().isEmpty()) return false;
    String sid = nextCallId.trim();
    Context app = context != null ? context.getApplicationContext() : null;

    for (String visibleId : new java.util.ArrayList<>(IncomingCallActivity.visibleCallIdsSnapshot())) {
      if (!visibleId.equals(sid) && app != null) {
        purgeCallPresentation(app, visibleId, "stale_before_launch");
      }
    }
    IncomingCallActivity.clearVisibleFlag(sid);

    boolean needsDelay = IncomingCallActivity.finishAnyActiveInstance("fresh_launch_prep:" + sid);
    boolean hadIncomingTask = false;
    if (app != null) {
      hadIncomingTask = IncomingCallActivity.hasIncomingTask(app);
      if (IncomingCallActivity.finishAllIncomingTasks(app, "fresh_launch_prep:" + sid)) {
        needsDelay = true;
      }
      if (IncomingCallActivity.hasIncomingTask(app)) {
        needsDelay = true;
      }
      IncomingCallTerminalHandler.broadcastFinishIncomingActivity(app, sid);
    }

    if (CallV4Lane.isTelegramLaneEnabled(context)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_activity_fresh_launch_prepared callId="
              + sid
              + " had_task_before="
              + hadIncomingTask
              + " delay_ms="
              + (needsDelay ? FRESH_LAUNCH_DELAY_MS : 0L));
    }
    Log.i(
        TAG,
        "[call-ui] incoming_activity_fresh_launch_prepared callId="
            + sid
            + " had_task_before="
            + hadIncomingTask
            + " has_task_after="
            + (app != null && IncomingCallActivity.hasIncomingTask(app))
            + " delay_ms="
            + (needsDelay ? FRESH_LAUNCH_DELAY_MS : 0L));
    return needsDelay;
  }
}
