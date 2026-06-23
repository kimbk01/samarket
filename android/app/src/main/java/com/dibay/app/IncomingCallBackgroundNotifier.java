package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallActivityRouter;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.callv4.CallV4Lane;

/**
 * Non-foreground incoming presentation SSOT.
 *
 * <p>Contract:
 * <ul>
 *   <li>Ring — {@link IncomingCallPushDelivery} → {@link IncomingCallRingOwner} (notification channel silent).</li>
 *   <li>V4 background/lock — Activity (FSI) primary; notification action-only when Activity launches.</li>
 *   <li>V4 fallback — full visual notification only when Activity launch fails or FSI OS-restricted.</li>
 *   <li>Legacy — prior Activity + CallStyle notification path when V4 lane OFF.</li>
 * </ul>
 */
public final class IncomingCallBackgroundNotifier {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallBackgroundNotifier() {}

  /** Lock / sleep — FGS first (cold process), then presentation. Ring at push delivery. */
  public static void presentLockIncoming(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    IncomingCallWakeLock.acquireForLockScreen(context.getApplicationContext(), callId);
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName());
    }
    Log.i(TAG, "[call-ui] lock_presentation_immediate callId=" + callId);
    if (CallV4Lane.isTelegramLaneEnabled(context)) {
      presentV4NonForegroundIncoming(context, payload, "lock_fcm_immediate", false);
      return;
    }
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, false);
    launchIncomingActivity(context, payload, "lock_fcm_immediate");
  }

  /** Home / unlocked background — queue UI until ringing FGS is foreground (CallStyle API 34+). */
  public static void startRingingDeferUiToFgs(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    PendingIncomingPresentation.put(payload);
    IncomingCallWakeLock.acquire(context.getApplicationContext(), callId);
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
      deliverPendingPresentation(context.getApplicationContext(), callId, "fgs_start_failed");
    }
    Log.i(TAG, "[call-ui] background_ui_deferred_to_fgs callId=" + callId);
  }

  /** After FGS {@code startForeground} — V4: Activity primary, notification action-only or fallback. */
  public static void deliverPendingPresentation(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    IncomingCallPayload payload = PendingIncomingPresentation.take(callId.trim());
    if (payload == null) return;
    Log.i(TAG, "[call-ui] background_presentation_deliver callId=" + callId + " source=" + source);
    if (CallV4Lane.isTelegramLaneEnabled(context)) {
      presentV4NonForegroundIncoming(context, payload, source, true);
      return;
    }
    launchIncomingActivity(context, payload, "fgs_fullscreen");
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, true);
  }

  private static void presentV4NonForegroundIncoming(
      Context context, IncomingCallPayload payload, String source, boolean fgsDelivery) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    String visibility = IncomingCallSurfaceOwner.resolveVisibility(app);

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] incoming_activity_launch_start callId=" + callId + " source=" + source);
    boolean activityLaunched = launchIncomingActivity(context, payload, source);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] incoming_activity_launch_result callId="
            + callId
            + " success="
            + activityLaunched);

    if (activityLaunched) {
      IncomingCallSurfaceOwner.tryClaimVisibleOwner(
          callId, IncomingCallSurfaceOwner.VisibleOwner.NATIVE_FSI);
      IncomingCallSurfaceOwner.logOwnerDecided(callId, "native_fsi", visibility, null);
      IncomingCallNotificationBuilder.showIncomingCallActionOnly(context, payload, fgsDelivery);
      return;
    }

    String fallbackReason =
        !IncomingCallNotificationBuilder.canPostFullScreenIntent(app)
            ? "os_restricted"
            : "activity_launch_failed";
    if (!IncomingCallSurfaceOwner.tryClaimVisibleOwner(
        callId, IncomingCallSurfaceOwner.VisibleOwner.NOTIFICATION_FALLBACK)) {
      return;
    }
    IncomingCallSurfaceOwner.logOwnerDecided(
        callId, "notification_fallback", visibility, fallbackReason);
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, fgsDelivery);
  }

  static boolean launchIncomingActivity(Context context, IncomingCallPayload payload, String source) {
    if (context == null || payload == null || !payload.isValid()) return false;
    String sid = payload.callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-ui] incoming_activity_skipped_consumed callId=" + sid);
      return false;
    }
    if (!CallActivityRouter.shouldLaunchIncomingActivity(sid)) {
      return true;
    }
    Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, payload);
    if (incomingUi == null) {
      DibayCallPushLog.warn("incoming_activity_launch_blocked", sid, "reason=invalid_intent source=" + source);
      return false;
    }
    incomingUi.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP
            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    try {
      if (context instanceof CallForegroundService || context instanceof DibayFirebaseMessagingService) {
        context.startActivity(incomingUi);
      } else {
        context.getApplicationContext().startActivity(incomingUi);
      }
      DibayCallLog.once("incoming_render", sid, "source=" + source);
      Log.i(TAG, "[call-ui] outside_app_incoming_activity_launch callId=" + sid + " source=" + source);
      return true;
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "outside_app_incoming_activity_blocked",
          sid,
          "source=" + source + " err=" + error.getClass().getSimpleName());
      return false;
    }
  }
}
