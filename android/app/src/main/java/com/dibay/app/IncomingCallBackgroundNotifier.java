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
 * <p>Owner is claimed at {@link IncomingCallPushDelivery} before surfaces start.
 * FGS is carrier-only; one visible incoming UI per callId.
 */
public final class IncomingCallBackgroundNotifier {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallBackgroundNotifier() {}

  /** Lock / sleep — wake lock + defer UI to ringing FGS (same contract as background home). */
  public static void presentLockIncoming(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    IncomingCallWakeLock.acquireForLockScreen(context.getApplicationContext(), callId);
    PendingIncomingPresentation.put(payload);
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName());
      deliverPendingPresentation(context.getApplicationContext(), callId, "fgs_start_failed");
    }
    Log.i(TAG, "[call-ui] lock_presentation_deferred_to_fgs callId=" + callId);
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

  /** After FGS {@code startForeground} — V4 lock FSI or background Activity primary. */
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

    if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_presentation_blocked callId="
              + callId
              + " reason=accepted_transition");
      return;
    }

    if ("locked".equals(visibility)) {
      presentV4LockedIncoming(context, payload, source, fgsDelivery, visibility);
      return;
    }

    presentV4BackgroundIncoming(context, payload, source, fgsDelivery, visibility);
  }

  /** Lock — CallStyle + FSI primary; Activity is optional boost only. */
  private static void presentV4LockedIncoming(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery,
      String visibility) {
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallSurfaceOwner.SurfaceOwner target = IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI;

    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, target)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] lock_incoming_owner_blocked callId=" + callId + " source=" + source);
      return;
    }

    boolean fsiAllowed = IncomingCallNotificationBuilder.canPostFullScreenIntent(app);
    String reason = !fsiAllowed ? "os_restricted" : "lock_fsi_primary";

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] lock_incoming_fsi_primary callId="
            + callId
            + " source="
            + source
            + " fsiAllowed="
            + fsiAllowed);

    IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, target, reason);
    CallForegroundService.refreshRingingNotification(context, callId, payload.callType, "lock_fsi_primary");
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, fgsDelivery);

    boolean activityLaunched = launchIncomingActivity(context, payload, source + "_boost");
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] lock_incoming_activity_boost callId="
            + callId
            + " success="
            + activityLaunched);
  }

  /** Warm background — native Activity sole full visual; notification action-only when Activity shows. */
  private static void presentV4BackgroundIncoming(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery,
      String visibility) {
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallSurfaceOwner.SurfaceOwner activityOwner =
        IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY;

    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, activityOwner)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] background_incoming_owner_blocked callId=" + callId + " source=" + source);
      return;
    }

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
      IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, activityOwner, "native_activity_primary");
      CallForegroundService.refreshRingingNotification(
          context, callId, payload.callType, "native_activity_claimed");
      IncomingCallNotificationBuilder.showIncomingCallActionOnly(context, payload, fgsDelivery);
      return;
    }

    IncomingCallSurfaceOwner.SurfaceOwner fallback =
        IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK;
    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, fallback)) {
      return;
    }
    String fallbackReason =
        !IncomingCallNotificationBuilder.canPostFullScreenIntent(app)
            ? "os_restricted"
            : "activity_launch_failed";
    IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, fallback, fallbackReason);
    CallForegroundService.refreshRingingNotification(
        context, callId, payload.callType, "notification_fallback");
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, fgsDelivery);
  }

  static boolean launchIncomingActivity(Context context, IncomingCallPayload payload, String source) {
    if (context == null || payload == null || !payload.isValid()) return false;
    String sid = payload.callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-ui] incoming_activity_skipped_consumed callId=" + sid);
      return false;
    }
    if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(sid)) {
      Log.i(TAG, "[call-ui] incoming_activity_skipped_accepted callId=" + sid);
      return false;
    }
    if (!CallActivityRouter.shouldLaunchIncomingActivity(sid)) {
      if (IncomingCallSurfaceOwner.isNativeIncomingOwner(sid)) {
        Log.i(TAG, "[call-ui] incoming_activity_dedup_reuse callId=" + sid + " source=" + source);
        return true;
      }
      Log.i(TAG, "[call-ui] incoming_activity_dedup_blocked callId=" + sid + " source=" + source);
      return false;
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
