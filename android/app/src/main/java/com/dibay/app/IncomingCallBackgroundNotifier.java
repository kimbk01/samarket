package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.call.CallActivityRouter;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.callv4.CallV4Lane;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Non-foreground incoming presentation SSOT — Telegram parity.
 *
 * <p>Visible UI: {@link IncomingCallActivity} fullscreen only (one per callId).
 * Notification: action-only carrier while Activity is visible; CallStyle+FSI only when Activity
 * launch fails. FGS is ring/process carrier, not a visible owner.
 *
 * <p>Owner is claimed at {@link IncomingCallPushDelivery} before surfaces start.
 */
public final class IncomingCallBackgroundNotifier {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final long LAUNCH_VISIBILITY_VERIFY_MS = 2_500L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, Runnable> LAUNCH_VERIFY_RUNNABLES =
      new ConcurrentHashMap<>();

  private IncomingCallBackgroundNotifier() {}

  /** Lock / sleep — V4 presents one visible surface immediately; FGS is carrier-only. */
  public static void presentLockIncoming(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallWakeLock.acquireForLockScreen(app, callId);
    if (CallV4Lane.isTelegramLaneEnabled(app)) {
      PendingIncomingPresentation.put(payload);
      boolean presented = presentV4NonForegroundIncoming(context, payload, "lock_immediate", false);
      if (presented) {
        PendingIncomingPresentation.take(callId);
        Log.i(TAG, "[call-ui] lock_presentation_immediate callId=" + callId);
      } else {
        Log.i(TAG, "[call-ui] lock_presentation_deferred callId=" + callId);
      }
    } else {
      PendingIncomingPresentation.put(payload);
      Log.i(TAG, "[call-ui] lock_presentation_deferred_to_fgs callId=" + callId);
    }
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

  /** Home / unlocked background — V4 presents immediately; legacy defers to FGS. */
  public static void startRingingDeferUiToFgs(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallWakeLock.acquire(app, callId);
    if (CallV4Lane.isTelegramLaneEnabled(app)) {
      PendingIncomingPresentation.put(payload);
      boolean presented = presentV4NonForegroundIncoming(context, payload, "background_immediate", false);
      if (presented) {
        PendingIncomingPresentation.take(callId);
        Log.i(TAG, "[call-ui] background_presentation_immediate callId=" + callId);
      } else {
        Log.i(TAG, "[call-ui] background_presentation_deferred callId=" + callId);
      }
    } else {
      PendingIncomingPresentation.put(payload);
      Log.i(TAG, "[call-ui] background_ui_deferred_to_fgs callId=" + callId);
    }
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

  /** After FGS {@code startForeground} — V4 lock FSI or background Activity primary. */
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
    launchIncomingActivity(context, payload, "fgs_fullscreen");
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, true);
  }

  private static boolean presentV4NonForegroundIncoming(
      Context context, IncomingCallPayload payload, String source, boolean fgsDelivery) {
    if (context == null || payload == null || !payload.isValid()) return false;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    String visibility = IncomingCallSurfaceOwner.resolveVisibility(app);

    if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_presentation_blocked callId="
              + callId
              + " reason=accepted_transition");
      return false;
    }

    if ("locked".equals(visibility)) {
      return presentV4TelegramFullscreenIncoming(context, payload, source, fgsDelivery, "locked");
    }

    return presentV4TelegramFullscreenIncoming(context, payload, source, fgsDelivery, "background");
  }

  /**
   * Telegram — non-foreground: fullscreen {@link IncomingCallActivity} is the sole visible UI.
   * No CallStyle heads-up parallel surface; notification is action-only when Activity shows.
   */
  private static boolean presentV4TelegramFullscreenIncoming(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery,
      String visibilityTag) {
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallSurfaceOwner.SurfaceOwner activityOwner = resolveActivityOwner(visibilityTag);

    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, activityOwner)) {
      IncomingCallSurfaceOwner.SurfaceOwner current = IncomingCallSurfaceOwner.getSurfaceOwner(callId);
      if (current == IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI
          && activityOwner == IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY) {
        activityOwner = IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI;
      } else {
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] telegram_fullscreen_owner_blocked callId="
                + callId
                + " visibility="
                + visibilityTag
                + " source="
                + source);
        return presentNotificationFallback(context, payload, fgsDelivery, "owner_blocked");
      }
    }

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] telegram_fullscreen_launch_start callId="
            + callId
            + " visibility="
            + visibilityTag
            + " source="
            + source);
    boolean activityLaunched =
        launchIncomingActivity(context, payload, source + "_telegram_" + visibilityTag);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] telegram_fullscreen_launch_result callId="
            + callId
            + " success="
            + activityLaunched
            + " visibility="
            + visibilityTag);

    if (activityLaunched) {
      IncomingCallSurfaceOwner.transitionIncomingOwner(
          app, callId, activityOwner, "telegram_fullscreen_" + visibilityTag);
      CallForegroundService.refreshRingingNotification(
          context, callId, payload.callType, "telegram_fullscreen_" + visibilityTag);
      IncomingCallNotificationBuilder.showIncomingCallActionOnly(context, payload, fgsDelivery);
      scheduleLaunchVisibilityVerify(context, payload, fgsDelivery, visibilityTag);
      return true;
    }

    return presentNotificationFallback(context, payload, fgsDelivery, "activity_launch_failed");
  }

  private static IncomingCallSurfaceOwner.SurfaceOwner resolveActivityOwner(String visibilityTag) {
    return "locked".equals(visibilityTag)
        ? IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI
        : IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY;
  }

  private static boolean presentNotificationFallback(
      Context context, IncomingCallPayload payload, boolean fgsDelivery, String reason) {
    if (context == null || payload == null || !payload.isValid()) return false;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallSurfaceOwner.SurfaceOwner fallback =
        IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK;
    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, fallback)) {
      return false;
    }
    String fallbackReason =
        !IncomingCallNotificationBuilder.canPostFullScreenIntent(app)
            ? "os_restricted"
            : reason;
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] telegram_fullscreen_notification_fallback callId="
            + callId
            + " reason="
            + fallbackReason);
    IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, fallback, fallbackReason);
    CallForegroundService.refreshRingingNotification(
        context, callId, payload.callType, "notification_fallback");
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, fgsDelivery);
    return true;
  }

  private static void scheduleLaunchVisibilityVerify(
      Context context,
      IncomingCallPayload payload,
      boolean fgsDelivery,
      String visibilityTag) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    cancelLaunchVisibilityVerify(callId);
    Runnable verify =
        () -> {
          LAUNCH_VERIFY_RUNNABLES.remove(callId);
          if (IncomingCallActivity.isCallVisible(callId)) return;
          Log.i(
              CallV4Lane.TAG,
              "[DIBAY_CALL_V4] telegram_fullscreen_launch_unverified callId="
                  + callId
                  + " visibility="
                  + visibilityTag);
          presentNotificationFallback(context, payload, fgsDelivery, "launch_unverified");
        };
    LAUNCH_VERIFY_RUNNABLES.put(callId, verify);
    MAIN.postDelayed(verify, LAUNCH_VISIBILITY_VERIFY_MS);
  }

  static void cancelLaunchVisibilityVerify(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    Runnable verify = LAUNCH_VERIFY_RUNNABLES.remove(sid);
    if (verify != null) {
      MAIN.removeCallbacks(verify);
    }
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
