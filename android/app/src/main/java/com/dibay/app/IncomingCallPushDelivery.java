package com.dibay.app;

import android.content.Context;
import android.util.Log;

/**
 * Push incoming delivery SSOT — FCM {@link DibayFirebaseMessagingService} and debug adb share one path.
 *
 * <p>Contract:
 * <ul>
 *   <li>Ring — {@link IncomingCallRingOwner} once at push boundary (Web must not blind-stop).</li>
 *   <li>Foreground unlocked — Web event only (compact banner SSOT; no native pill).</li>
 *   <li>Lock / sleep — FGS + wake lock + silent notification/FSI + {@link IncomingCallActivity}.</li>
 *   <li>Background home — defer UI to ringing FGS after {@code startForeground}.</li>
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

    startRingAtPushBoundary(context, callId, payload.callType);

    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
    if (DibayKeyguardHelper.isForegroundUnlockedInteractive(appVisible, app)) {
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
      IncomingCallBackgroundNotifier.startRingingDeferUiToFgs(context, payload);
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

  private static void startRingAtPushBoundary(Context context, String callId, String callType) {
    if (IncomingCallRingOwner.start(context, callId, callType)) {
      DibayCallPushLog.info("ringtone_start_native", callId, "source=push_delivery");
    } else {
      DibayCallPushLog.info("ringtone_skip_existing_owner", callId, "source=push_delivery");
    }
  }
}
