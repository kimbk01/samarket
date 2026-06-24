package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.callv4.CallV4Lane;

/**
 * Non-foreground incoming presentation SSOT — Telegram parity.
 *
 * <p>Contract: FCM queues {@link PendingIncomingPresentation} and starts FGS ring.
 * After {@code startForeground}, one visible UI per callId:
 * <ul>
 *   <li>Primary — {@link IncomingCallActivity} from FGS (BAL-safe)</li>
 *   <li>Fallback — CallStyle+FSI notification only when Activity launch fails</li>
 * </ul>
 * actionOnly notification is posted from Activity after {@code incoming_activity_shown}.
 */
public final class IncomingCallBackgroundNotifier {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallBackgroundNotifier() {}

  /** Lock / sleep — queue UI for FGS delivery. */
  public static void presentLockIncoming(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallWakeLock.acquireForLockScreen(app, callId);
    PendingIncomingPresentation.put(payload);
    Log.i(TAG, "[call-ui] lock_presentation_queued callId=" + callId);
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName());
      deliverPendingPresentation(app, callId, "fgs_start_failed");
    }
  }

  /** Home / unlocked background — queue UI for FGS delivery. */
  public static void startRingingDeferUiToFgs(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallWakeLock.acquire(app, callId);
    PendingIncomingPresentation.put(payload);
    Log.i(TAG, "[call-ui] background_ui_queued_for_fgs callId=" + callId);
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
      deliverPendingPresentation(app, callId, "fgs_start_failed");
    }
  }

  /** After FGS {@code startForeground} — primary visible UI entry (BAL-safe context). */
  public static void deliverPendingPresentation(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    IncomingCallPayload payload = PendingIncomingPresentation.take(callId.trim());
    if (payload == null) {
      Log.i(
          TAG,
          "[call-ui] background_presentation_skip callId="
              + callId
              + " reason=already_presented source="
              + source);
      return;
    }
    Log.i(TAG, "[call-ui] background_presentation_deliver callId=" + callId + " source=" + source);
    if (CallV4Lane.isTelegramLaneEnabled(context)) {
      presentV4NonForegroundIncoming(context, payload, source, true);
      return;
    }
    if (launchIncomingActivity(context, payload, "fgs_fullscreen")) {
      return;
    }
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
      presentV4ActivityFirstIncoming(
          context,
          payload,
          source,
          fgsDelivery,
          IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI,
          "locked");
      return;
    }
    presentV4ActivityFirstIncoming(
        context,
        payload,
        source,
        fgsDelivery,
        IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY,
        "background");
  }

  /**
   * One visible surface — Activity primary; CallStyle+FSI only when launch fails (no parallel UI).
   */
  private static void presentV4ActivityFirstIncoming(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery,
      IncomingCallSurfaceOwner.SurfaceOwner owner,
      String visibilityTag) {
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();

    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, owner)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_owner_blocked callId="
              + callId
              + " visibility="
              + visibilityTag
              + " source="
              + source);
      presentV4NotificationFallback(context, payload, fgsDelivery, source, "owner_blocked");
      return;
    }

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_activity_launch_start callId="
            + callId
            + " visibility="
            + visibilityTag
            + " source="
            + source);
    boolean activityLaunched =
        launchIncomingActivity(context, payload, source + "_" + visibilityTag);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_activity_launch_result callId="
            + callId
            + " success="
            + activityLaunched
            + " visibility="
            + visibilityTag);

    if (activityLaunched) {
      IncomingCallSurfaceOwner.transitionIncomingOwner(
          app, callId, owner, visibilityTag + "_incoming_" + source);
      CallForegroundService.refreshRingingNotification(
          context, callId, payload.callType, visibilityTag + "_" + source);
      return;
    }

    presentV4NotificationFallback(context, payload, fgsDelivery, source, "activity_launch_failed");
  }

  private static void presentV4NotificationFallback(
      Context context,
      IncomingCallPayload payload,
      boolean fgsDelivery,
      String source,
      String reason) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallSurfaceOwner.SurfaceOwner fallback =
        IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK;
    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, fallback)) {
      return;
    }
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_notification_fallback callId="
            + callId
            + " reason="
            + reason
            + " source="
            + source);
    IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, fallback, reason);
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, fgsDelivery);
    CallForegroundService.refreshRingingNotification(
        context, callId, payload.callType, "notification_fallback");
  }

  static void cancelLaunchVisibilityVerify(String callId) {
    // no-op
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
    if (!com.dibay.app.call.CallActivityRouter.shouldLaunchIncomingActivity(sid)) {
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
      context.startActivity(incomingUi);
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
