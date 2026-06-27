package com.dibay.app;

import android.content.Context;
import android.util.Log;
import com.dibay.app.callv4.CallV4Lane;
import com.dibay.app.nativevideo.NativeVideoCallLane;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallLane;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;

/**
 * Push incoming delivery SSOT — FCM {@link DibayFirebaseMessagingService} and debug adb share one path.
 *
 * <p>Contract:
 * <ul>
 *   <li>Ring — {@link IncomingCallRingOwner} once at push boundary (Web must not blind-stop).</li>
 *   <li>Owner claim — {@link IncomingCallSurfaceOwner} before any visible surface (V4).</li>
 *   <li>Foreground unlocked — Web top banner (owner web_in_app) via dibay:call-event.</li>
 *   <li>Lock / sleep / background — Telegram fullscreen {@code IncomingCallActivity} + action-only notify.</li>
 * </ul>
 */
public final class IncomingCallPushDelivery {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallPushDelivery() {}

  /**
   * Deliver incoming call after payload validation and native store persistence.
   * Caller must have set ringing store + pending route before invoke.
   */
  public static void deliver(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    Context app = context.getApplicationContext();
    String callId = payload.callId.trim();

    if (NativeVoiceCallLane.shouldHandleIncoming(app, payload.callType)) {
      NativeVoiceCallRuntime.handleIncoming(
          app,
          callId,
          payload.roomId,
          payload.callerId,
          payload.callerName,
          payload.callType);
      return;
    }

    if (NativeVideoCallLane.shouldHandleIncoming(app, payload.callType)) {
      NativeVideoCallRuntime.handleIncoming(
          app,
          callId,
          payload.roomId,
          payload.callerId,
          payload.callerName,
          payload.callType);
      return;
    }

    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
    boolean foregroundUnlocked = DibayKeyguardHelper.isForegroundUnlockedInteractive(appVisible, app);

    if (CallV4Lane.isTelegramLaneEnabled(app)) {
      IncomingCallSurfaceOwner.SurfaceOwner initialOwner =
          IncomingCallSurfaceOwner.resolveInitialOwner(app, foregroundUnlocked);
      IncomingCallBackgroundNotifier.logLockscreenEvent(
          app,
          callId,
          "fcm_received",
          initialOwner,
          IncomingCallNotificationBuilder.canPostFullScreenIntent(app),
          "appVisible=" + appVisible + " foregroundUnlocked=" + foregroundUnlocked);
      if (!IncomingCallSurfaceOwner.tryClaimIncomingOwner(app, callId, initialOwner, "fcm_push_delivery")) {
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] fcm_duplicate_incoming_blocked callId="
                + callId
                + " owner="
                + initialOwner.name().toLowerCase());
        IncomingCallActionCoordinator.scheduleMissedTimeout(app, payload);
        return;
      }
      if (initialOwner != IncomingCallSurfaceOwner.SurfaceOwner.WEB_IN_APP) {
        IncomingCallBackgroundNotifier.logLockscreenEvent(
            app,
            callId,
            "web_sheet_suppressed_by_native_owner",
            initialOwner,
            IncomingCallNotificationBuilder.canPostFullScreenIntent(app),
            "reason=fcm_push_delivery");
      }
    }

    if (foregroundUnlocked) {
      startRingAtPushBoundary(context, callId);
      Log.i("DIBAY_FCM", "[call-native] incoming_call_foreground_web_ssot callId=" + callId);
      MainActivity.deliverCallIncomingEvent(payload);
      IncomingCallActionCoordinator.scheduleMissedTimeout(app, payload);
      return;
    }

    boolean keyguardLocked = DibayKeyguardHelper.isKeyguardLocked(app);
    boolean interactive = DibayKeyguardHelper.isInteractive(app);
    boolean lockBridge = keyguardLocked || !interactive;

    Log.i(
        "DIBAY_FCM",
        "incoming_call_native_notification"
            + " callId="
            + callId
            + " keyguardLocked="
            + keyguardLocked
            + " appVisible="
            + appVisible
            + " interactive="
            + interactive);

    if (lockBridge) {
      IncomingCallBackgroundNotifier.presentLockIncoming(context, payload);
    } else {
      IncomingCallBackgroundNotifier.startRingingWithImmediateUi(context, payload);
    }
    IncomingCallActionCoordinator.scheduleMissedTimeout(app, payload);

    if (lockBridge && !IncomingCallNotificationBuilder.canPostFullScreenIntent(app)) {
      Log.i(
          TAG,
          "[call-ui] incoming_activity_lock_launch callId="
              + callId
              + " keyguardLocked="
              + keyguardLocked
              + " fsiAllowed=false");
    }
  }

  private static void startRingAtPushBoundary(Context context, String callId) {
    if (IncomingCallRingOwner.start(context, callId)) {
      DibayCallPushLog.info("ringtone_start_native", callId, "source=push_delivery");
    } else {
      DibayCallPushLog.info("ringtone_skip_existing_owner", callId, "source=push_delivery");
    }
  }
}
